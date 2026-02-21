import { randomUUID } from "node:crypto"

export function createWorkerFetchHandler(dependencies = {}) {
  const popularityCountersStore = requireDependency(dependencies.popularityCountersStore, "popularityCountersStore")
  const professionOutlookService = resolveProfessionOutlookService(dependencies)
  const professionNormalizer = resolveProfessionNormalizer(dependencies)
  const requestIdGenerator = dependencies.requestIdGenerator ?? randomUUID

  return async function fetch(request) {
    const requestBody = await request.json()

    const normalizerResult = await professionNormalizer.normalize({
      locale: requestBody.locale,
      profession: requestBody.profession
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
        schemaVersion: requestBody.schemaVersion
      })
    }

    await popularityCountersStore.increment(normalizerResult.canonicalProfession)

    const answer = await professionOutlookService.getOutlook({
      canonicalProfession: normalizerResult.canonicalProfession,
      hints: {
        category: normalizerResult.category,
        categoryConfidence: normalizerResult.categoryConfidence
      },
      locale: requestBody.locale,
      schemaVersion: requestBody.schemaVersion
    })

    return Response.json({
      answer,
      canonicalProfession: normalizerResult.canonicalProfession,
      category: normalizerResult.category ?? null,
      categoryConfidence: normalizerResult.categoryConfidence ?? null,
      clarification: null,
      needsClarification: false,
      requestId: requestIdGenerator(),
      schemaVersion: requestBody.schemaVersion
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
    return dependencies.professionNormalizer
  }

  return makeComposedProfessionNormalizer({
    cache: requireDependency(dependencies.normalizerCache, "normalizerCache"),
    modelClient: requireDependency(dependencies.normalizerModelClient, "normalizerModelClient")
  })
}

function resolveProfessionOutlookService(dependencies) {
  if (dependencies.professionOutlookService !== undefined) {
    return dependencies.professionOutlookService
  }

  return makeComposedProfessionOutlookService({
    cache: requireDependency(dependencies.outlookCache, "outlookCache"),
    modelClient: requireDependency(dependencies.outlookModelClient, "outlookModelClient"),
    promptVersion: dependencies.promptVersion ?? "1"
  })
}

function makeComposedProfessionNormalizer({ cache, modelClient }) {
  return {
    async normalize({ locale, profession }) {
      const normalizedProfession = normalizeProfessionInput(profession)
      const cacheKey = `normalizer:${locale}:${normalizedProfession}`
      const cacheHit = await cache.read(cacheKey)

      if (cacheHit !== null) {
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

      if (cacheHit !== null) {
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
