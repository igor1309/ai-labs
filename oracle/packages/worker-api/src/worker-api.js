export function createWorkerFetchHandler(dependencies = {}) {
  const popularityCountersStore = requireMethodDependency(
    dependencies.popularityCountersStore,
    "popularityCountersStore",
    "increment"
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

    await popularityCountersStore.increment(normalizerResult.canonicalProfession)

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

function requireMethodDependency(value, name, methodName) {
  const dependency = requireDependency(value, name)

  if (typeof dependency[methodName] !== "function") {
    throw new Error(`Invalid dependency: ${name}.${methodName}`)
  }

  return dependency
}
