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
  const telemetry = requireMethodDependency(
    dependencies.telemetry,
    "telemetry",
    "emitApiRequest"
  )
  requireMethodDependency(telemetry, "telemetry", "emitLlmCall")
  const onPopularityTrackerError = resolveOptionalFunctionDependency(
    dependencies.onPopularityTrackerError,
    "onPopularityTrackerError"
  )

  return async function fetch(request) {
    const requestId = requestIdGenerator()
    const startTimeMs = Date.now()

    let requestBody
    let result = "error"
    let response
    let schemaVersion = "1"
    let locale = ""

    try {
      try {
        requestBody = await request.json()
      } catch {
        result = "invalid_body"

        response = Response.json({
          answer: null,
          canonicalProfession: null,
          category: null,
          categoryConfidence: null,
          clarification: {
            message: "Please provide a valid request body.",
            suggestions: []
          },
          needsClarification: true,
          requestId,
          schemaVersion: "1"
        })

        return response
      }

      const guardResult = await requestGuard.validate(requestBody)

      if (!guardResult.isValid) {
        result = "guard_reject"
        schemaVersion = guardResult.schemaVersion

        response = Response.json({
          answer: null,
          canonicalProfession: null,
          category: null,
          categoryConfidence: null,
          clarification: guardResult.clarification,
          needsClarification: true,
          requestId,
          schemaVersion: guardResult.schemaVersion
        })

        return response
      }

      const normalizerResult = await professionNormalizer.normalize({
        locale: guardResult.value.locale,
        profession: guardResult.value.profession
      })

      schemaVersion = guardResult.value.schemaVersion
      locale = guardResult.value.locale

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
        result = "clarify"

        response = Response.json({
          answer: null,
          canonicalProfession: null,
          category: null,
          categoryConfidence: null,
          clarification: normalizerResult.clarification,
          needsClarification: true,
          requestId,
          schemaVersion: guardResult.value.schemaVersion
        })

        return response
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

      result = "answered"

      response = Response.json({
        answer,
        canonicalProfession: normalizerResult.canonicalProfession,
        category: normalizerResult.category ?? null,
        categoryConfidence: normalizerResult.categoryConfidence ?? null,
        clarification: null,
        needsClarification: false,
        requestId,
        schemaVersion: guardResult.value.schemaVersion
      })

      return response
    } catch (error) {
      result = "error"
      throw error
    } finally {
      try {
        telemetry.emitApiRequest({
          durationMs: Date.now() - startTimeMs,
          llmCalls: 0,
          llmCostMicrosUsd: 0,
          llmTotalTokens: 0,
          llmTotalsCompleteness: "missing",
          locale: typeof locale === "string" ? locale : "",
          method: request.method,
          requestId,
          result,
          route: "api_outlook",
          schemaVersion,
          statusCode: response?.status ?? 500
        })
      } catch {}
    }
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
