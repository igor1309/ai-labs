export function createWorkerFetchHandler(dependencies = {}) {
  const popularityCountersStore = requireMethodDependency(
    dependencies.popularityCountersStore,
    "popularityCountersStore",
    "increment"
  )
  const professionOutlookService = resolveProfessionOutlookService(dependencies)
  const professionNormalizer = resolveProfessionNormalizer(dependencies)
  const requestIdGenerator = resolveRequestIdGenerator(dependencies.requestIdGenerator)

  return async function fetch(request) {
    const requestBody = await request.json()
    const guardResult = guardOutlookRequest(requestBody)

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

function resolveProfessionNormalizer(dependencies) {
  if (dependencies.professionNormalizer !== undefined) {
    return requireMethodDependency(dependencies.professionNormalizer, "professionNormalizer", "normalize")
  }

  const normalizerCache = requireCacheDependency(dependencies.normalizerCache, "normalizerCache")
  const normalizerModelClient = requireMethodDependency(
    dependencies.normalizerModelClient,
    "normalizerModelClient",
    "normalize"
  )

  return makeComposedProfessionNormalizer({
    cache: normalizerCache,
    modelClient: normalizerModelClient
  })
}

function resolveProfessionOutlookService(dependencies) {
  if (dependencies.professionOutlookService !== undefined) {
    return requireMethodDependency(dependencies.professionOutlookService, "professionOutlookService", "getOutlook")
  }

  const outlookCache = requireCacheDependency(dependencies.outlookCache, "outlookCache")
  const outlookModelClient = requireMethodDependency(
    dependencies.outlookModelClient,
    "outlookModelClient",
    "generate"
  )

  return makeComposedProfessionOutlookService({
    cache: outlookCache,
    modelClient: outlookModelClient,
    promptVersion: dependencies.promptVersion ?? "1"
  })
}

function requireMethodDependency(value, name, methodName) {
  const dependency = requireDependency(value, name)

  if (typeof dependency[methodName] !== "function") {
    throw new Error(`Invalid dependency: ${name}.${methodName}`)
  }

  return dependency
}

function resolveRequestIdGenerator(requestIdGenerator) {
  if (requestIdGenerator !== undefined) {
    return requireFunctionDependency(requestIdGenerator, "requestIdGenerator")
  }

  if (typeof globalThis.crypto?.randomUUID === "function") {
    return () => globalThis.crypto.randomUUID()
  }

  throw new Error("Missing required dependency: requestIdGenerator")
}

function requireFunctionDependency(value, name) {
  const dependency = requireDependency(value, name)

  if (typeof dependency !== "function") {
    throw new Error(`Invalid dependency: ${name}`)
  }

  return dependency
}

function requireCacheDependency(value, name) {
  const cache = requireMethodDependency(value, name, "read")

  requireMethodDependency(cache, name, "write")

  return cache
}

function guardOutlookRequest(requestBody) {
  if (!hasNonEmptyStringValue(requestBody?.profession) || !hasNonEmptyStringValue(requestBody?.locale)) {
    return {
      clarification: makeInvalidRequestClarification(),
      isValid: false,
      schemaVersion: resolveSchemaVersion(requestBody?.schemaVersion)
    }
  }

  return {
    isValid: true,
    value: {
      locale: requestBody.locale,
      profession: requestBody.profession,
      schemaVersion: resolveSchemaVersion(requestBody.schemaVersion)
    }
  }
}

function hasNonEmptyStringValue(value) {
  return typeof value === "string" && value.trim() !== ""
}

function makeInvalidRequestClarification() {
  return {
    message: "Please provide a valid profession and locale.",
    suggestions: []
  }
}

function resolveSchemaVersion(schemaVersion) {
  if (hasNonEmptyStringValue(schemaVersion)) {
    return schemaVersion
  }

  return "1"
}

function makeComposedProfessionNormalizer({ cache, modelClient }) {
  return {
    async normalize({ locale, profession }) {
      const normalizedProfession = normalizeProfessionInput(profession)
      const cacheKey = `normalizer:${locale}:${normalizedProfession}`
      const cacheHit = await cache.read(cacheKey)

      if (cacheHit !== null && cacheHit !== undefined) {
        return cacheHit
      }

      const modelResult = await modelClient.normalize({
        locale,
        profession: normalizedProfession
      })

      await cache.write(cacheKey, modelResult)

      return modelResult
    }
  }
}

function makeComposedProfessionOutlookService({ cache, modelClient, promptVersion }) {
  return {
    async getOutlook({ canonicalProfession, hints, locale, schemaVersion }) {
      const cacheKey = `outlook:${canonicalProfession}:${locale}:${schemaVersion}:${promptVersion}`
      const cacheHit = await cache.read(cacheKey)

      if (cacheHit !== null && cacheHit !== undefined) {
        return cacheHit
      }

      const modelResult = await modelClient.generate({
        canonicalProfession,
        hints,
        locale,
        promptVersion,
        schemaVersion
      })

      await cache.write(cacheKey, modelResult)

      return modelResult
    }
  }
}

function normalizeProfessionInput(rawProfession) {
  return rawProfession.trim().replace(/\s+/g, " ")
}
