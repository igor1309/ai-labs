export function createWorkerApiEntrypointRouter({ outlookHandler } = {}) {
  const routeOutlookHandler = requireFunctionDependency(
    outlookHandler,
    "outlookHandler"
  )

  return async function fetch(request) {
    const url = new URL(request.url)

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200 })
    }

    if (request.method === "POST" && url.pathname === "/api/outlook") {
      return routeOutlookHandler(request)
    }

    return new Response("Not found", { status: 404 })
  }
}

export function createWorkerFetchHandler(dependencies = {}) {
  const popularityTracker = requireMethodDependency(
    dependencies.popularityTracker,
    "popularityTracker",
    "track"
  )
  const professionNormalizer = requireMethodDependency(
    dependencies.professionNormalizer,
    "professionNormalizer",
    "normalize"
  )
  const professionOutlookService = requireMethodDependency(
    dependencies.professionOutlookService,
    "professionOutlookService",
    "getOutlook"
  )
  const requestGuard = requireMethodDependency(
    dependencies.requestGuard,
    "requestGuard",
    "validate"
  )
  const requestIdGenerator = requireFunctionDependency(
    dependencies.requestIdGenerator,
    "requestIdGenerator"
  )
  const onPopularityTrackerError = resolveOptionalFunctionDependency(
    dependencies.onPopularityTrackerError,
    "onPopularityTrackerError"
  )

  return async function fetch(request) {
    let requestBody

    try {
      requestBody = await request.json()
    } catch {
      return Response.json({
        answer: null,
        canonicalProfession: null,
        category: null,
        categoryConfidence: null,
        clarification: {
          message: "Please provide a valid request body.",
          suggestions: []
        },
        needsClarification: true,
        requestId: requestIdGenerator(),
        schemaVersion: "1"
      })
    }

    const guardResult = await requestGuard.validate(requestBody)

    if (!guardResult.isValid) {
      return Response.json({
        answer: null,
        canonicalProfession: null,
        category: null,
        categoryConfidence: null,
        clarification: guardResult.clarification,
        needsClarification: true,
        requestId: requestIdGenerator(),
        schemaVersion: guardResult.schemaVersion
      })
    }

    const normalizerResult = await professionNormalizer.normalize({
      locale: guardResult.value.locale,
      profession: guardResult.value.profession
    })

    try {
      await popularityTracker.track({
        normalizerResult,
        rawProfession: guardResult.value.profession
      })
    } catch (error) {
      if (!isCounterWriteFailure(error)) {
        throw error
      }

      // Counter writes are best-effort and must not block API responses.
      reportPopularityTrackerError({
        error,
        onPopularityTrackerError
      })
    }

    if (normalizerResult.needsClarification) {
      return Response.json({
        answer: null,
        canonicalProfession: null,
        category: null,
        categoryConfidence: null,
        clarification: normalizerResult.clarification,
        needsClarification: true,
        requestId: requestIdGenerator(),
        schemaVersion: guardResult.value.schemaVersion
      })
    }

    const answer = await professionOutlookService.getOutlook({
      canonicalProfession: normalizerResult.canonicalProfession,
      hints: {
        category: normalizerResult.category,
        categoryConfidence: normalizerResult.categoryConfidence
      },
      locale: guardResult.value.locale,
      schemaVersion: guardResult.value.schemaVersion
    })

    return Response.json({
      answer,
      canonicalProfession: normalizerResult.canonicalProfession,
      category: normalizerResult.category ?? null,
      categoryConfidence: normalizerResult.categoryConfidence ?? null,
      clarification: null,
      needsClarification: false,
      requestId: requestIdGenerator(),
      schemaVersion: guardResult.value.schemaVersion
    })
  }
}

function reportPopularityTrackerError({ error, onPopularityTrackerError }) {
  if (onPopularityTrackerError === null) {
    return
  }

  try {
    const maybePromise = onPopularityTrackerError(error)

    if (typeof maybePromise?.catch === "function") {
      maybePromise.catch(() => {})
    }
  } catch {}
}

function isCounterWriteFailure(error) {
  return error?.counterWriteFailed === true
}

function requireDependency(value, name) {
  if (value === undefined || value === null) {
    throw new Error(`Missing required dependency: ${name}`)
  }

  return value
}

function requireFunctionDependency(value, name) {
  const dependency = requireDependency(value, name)

  if (typeof dependency !== "function") {
    throw new Error(`Invalid dependency: ${name}`)
  }

  return dependency
}

function resolveOptionalFunctionDependency(value, name) {
  if (value === undefined || value === null) {
    return null
  }

  return requireFunctionDependency(value, name)
}

function requireMethodDependency(value, name, methodName) {
  const dependency = requireDependency(value, name)

  if (typeof dependency[methodName] !== "function") {
    throw new Error(`Invalid dependency: ${name}.${methodName}`)
  }

  return dependency
}
