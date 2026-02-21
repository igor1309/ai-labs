import { randomUUID } from "node:crypto"

export function createWorkerFetchHandler(dependencies = {}) {
  const normalizerCache = dependencies.normalizerCache ?? makeNoopCache()
  const normalizerModelClient = dependencies.normalizerModelClient ?? makeDefaultNormalizerModelClient()
  const popularityCountersStore = dependencies.popularityCountersStore ?? makeNoopPopularityCountersStore()
  const professionOutlookService = dependencies.professionOutlookService ?? makeNoopProfessionOutlookService()
  const professionNormalizer = dependencies.professionNormalizer ?? makeComposedProfessionNormalizer({
    cache: normalizerCache,
    modelClient: normalizerModelClient
  })
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

    await professionOutlookService.getOutlook({
      canonicalProfession: normalizerResult.canonicalProfession,
      hints: {
        category: normalizerResult.category,
        categoryConfidence: normalizerResult.categoryConfidence
      },
      locale: requestBody.locale,
      schemaVersion: requestBody.schemaVersion
    })

    return Response.json({
      answer: null,
      canonicalProfession: null,
      category: null,
      categoryConfidence: null,
      clarification: {
        message: "not-implemented",
        suggestions: []
      },
      needsClarification: true,
      requestId: requestIdGenerator(),
      schemaVersion: "1"
    })
  }
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

function makeNoopProfessionOutlookService() {
  return {
    async getOutlook() {}
  }
}

function makeDefaultNormalizerModelClient() {
  return {
    async normalize() {
      return {
        clarification: {
          message: "Please provide a more specific profession.",
          suggestions: []
        },
        needsClarification: true
      }
    }
  }
}

function makeNoopCache() {
  return {
    async read() {
      return null
    },
    async write() {}
  }
}

function makeNoopPopularityCountersStore() {
  return {
    async increment() {}
  }
}

function normalizeProfessionInput(rawProfession) {
  return rawProfession.trim().replace(/\s+/g, " ")
}
