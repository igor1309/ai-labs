function resolveSchemaVersion(requestBody) {
  return typeof requestBody?.schemaVersion === "string" && requestBody.schemaVersion.trim() !== "" ? requestBody.schemaVersion : "1"
}

export default {
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 })
    }

    if (url.pathname === "/api/outlook") {
      let requestBody
      try {
        requestBody = await request.json()
      } catch {
        requestBody = null
      }

      return Response.json({
        answer: null,
        canonicalProfession: null,
        category: null,
        categoryConfidence: null,
        clarification: {
          message: "API not wired yet. Implement profession-normalizer and profession-outlook modules, then compose them here.",
          suggestions: []
        },
        needsClarification: true,
        requestId: globalThis.crypto?.randomUUID?.() ?? "request-id",
        schemaVersion: resolveSchemaVersion(requestBody)
      }, { status: 501 })
    }

    return new Response("Not found", { status: 404 })
  }
}
