import { randomUUID } from "node:crypto"

export function createWorkerFetchHandler(dependencies = {}) {
  const professionNormalizer = dependencies.professionNormalizer ?? makeNoopProfessionNormalizer()
  const requestIdGenerator = dependencies.requestIdGenerator ?? randomUUID

  return async function fetch(request) {
    const requestBody = await request.json()

    await professionNormalizer.normalize({
      locale: requestBody.locale,
      profession: requestBody.profession
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
