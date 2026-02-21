import { randomUUID } from "node:crypto"

export function createWorkerFetchHandler(dependencies = {}) {
  const professionOutlookService = dependencies.professionOutlookService ?? makeNoopProfessionOutlookService()
  const professionNormalizer = dependencies.professionNormalizer ?? makeNoopProfessionNormalizer()
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

function makeNoopProfessionNormalizer() {
  return {
    async normalize() {}
  }
}

function makeNoopProfessionOutlookService() {
  return {
    async getOutlook() {}
  }
}
