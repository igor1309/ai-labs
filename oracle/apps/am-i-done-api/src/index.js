import { createWorkerApiEntrypointRouter, createWorkerFetchHandler } from "../../../packages/worker-api/src/worker-api.js"

const outlookHandler = createWorkerFetchHandler({
  popularityCountersStore: {
    async increment() {}
  },
  professionNormalizer: {
    async normalize() {
      return {
        clarification: {
          message: "API not wired yet. Implement profession-normalizer and profession-outlook modules, then compose them here.",
          suggestions: []
        },
        needsClarification: true
      }
    }
  },
  professionOutlookService: {
    async getOutlook() {
      return {}
    }
  },
  requestGuard: {
    async validate() {
      return {
        clarification: {
          message: "API not wired yet. Implement profession-normalizer and profession-outlook modules, then compose them here.",
          suggestions: []
        },
        isValid: false,
        schemaVersion: "1"
      }
    }
  },
  requestIdGenerator: () => globalThis.crypto?.randomUUID?.() ?? "request-id"
})

const workerEntrypointFetch = createWorkerApiEntrypointRouter({
  outlookHandler
})

export default {
  async fetch(request) {
    return workerEntrypointFetch(request)
  }
}
