import assert from "node:assert/strict"
import test from "node:test"

import { createWorkerFetchHandler } from "../src/worker-api.js"

const UNDEFINED_CACHE_READ = Symbol("UNDEFINED_CACHE_READ")

test("test_createWorkerFetchHandler_shouldThrowMissingDependencyError_onNullProfessionNormalizer", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityCountersStore: makePopularityCountersStoreSpy().store,
    professionNormalizer: null,
    professionOutlookService: makeProfessionOutlookServiceSpy().service
  }), { message: "Missing required dependency: professionNormalizer" })
})

test("test_createWorkerFetchHandler_shouldThrowMissingDependencyError_onNullProfessionOutlookService", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityCountersStore: makePopularityCountersStoreSpy().store,
    professionNormalizer: makeProfessionNormalizerSpy(makeNormalizedProfessionResult()).service,
    professionOutlookService: null
  }), { message: "Missing required dependency: professionOutlookService" })
})

test("test_fetch_shouldCallProfessionNormalizerWithRequestPayload_onOutlookRequest", async () => {
  const { professionNormalizerSpy, workerFetchHandler } = makeSUT()

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(professionNormalizerSpy.calls, [{ locale: "en-US", profession: "  software   developer  " }])
})

test("test_fetch_shouldCallProfessionOutlookServiceWithCanonicalProfessionLocaleSchemaVersionAndHints_onOutlookFlow", async () => {
  const { professionOutlookServiceSpy, workerFetchHandler } = makeSUT()

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(professionOutlookServiceSpy.calls, [{ canonicalProfession: "software engineer", hints: { category: "knowledge-work", categoryConfidence: 0.9 }, locale: "en-US", schemaVersion: "1" }])
})

test("test_fetch_shouldNotCallProfessionOutlookService_onNeedsClarification", async () => {
  const { professionOutlookServiceSpy, workerFetchHandler } = makeSUT({
    normalizerResult: {
      clarification: {
        message: "Please be more specific.",
        suggestions: ["software engineer"]
      },
      needsClarification: true
    }
  })

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(professionOutlookServiceSpy.calls, [])
})

test("test_fetch_shouldReturnNeedsClarificationResponse_onNeedsClarification", async () => {
  const { workerFetchHandler } = makeSUT({
    normalizerResult: {
      clarification: {
        message: "Please be more specific.",
        suggestions: ["software engineer"]
      },
      needsClarification: true
    }
  })

  const response = await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(response.body, {
    answer: null,
    canonicalProfession: null,
    category: null,
    categoryConfidence: null,
    clarification: {
      message: "Please be more specific.",
      suggestions: ["software engineer"]
    },
    needsClarification: true,
    requestId: "request-id",
    schemaVersion: "1"
  })
})

test("test_fetch_shouldIncrementPopularityCountersStore_onOutlookFlow", async () => {
  const { popularityCountersStoreSpy, workerFetchHandler } = makeSUT()

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(popularityCountersStoreSpy.calls, ["software engineer"])
})

test("test_fetch_shouldCallNormalizerModelClientWithNormalizedProfession_onNormalizerCacheMiss", async () => {
  const { normalizerModelClientSpy, workerFetchHandler } = makeSUTWithComposedDependencies({
    normalizerCacheReadResult: null,
    normalizerModelResult: {
      clarification: {
        message: "Please be more specific.",
        suggestions: ["software engineer"]
      },
      needsClarification: true
    }
  })

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(normalizerModelClientSpy.calls, [{ locale: "en-US", profession: "software developer" }])
})

test("test_fetch_shouldCallOutlookModelClientWithCanonicalProfessionLocaleSchemaVersionAndHints_onOutlookCacheMiss", async () => {
  const { outlookModelClientSpy, workerFetchHandler } = makeSUTWithComposedDependencies({
    normalizerCacheReadResult: makeNormalizedProfessionResult(),
    outlookCacheReadResult: null
  })

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(outlookModelClientSpy.calls, [{ canonicalProfession: "software engineer", hints: { category: "knowledge-work", categoryConfidence: 0.9 }, locale: "en-US", promptVersion: "1", schemaVersion: "1" }])
})

test("test_fetch_shouldReturnOutlookResponse_onOutlookFlow", async () => {
  const { workerFetchHandler } = makeSUT()

  const response = await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(response.body, {
    answer: makeOutlookAnswerResult(),
    canonicalProfession: "software engineer",
    category: "knowledge-work",
    categoryConfidence: 0.9,
    clarification: null,
    needsClarification: false,
    requestId: "request-id",
    schemaVersion: "1"
  })
})

test("test_fetch_shouldReadAndWriteNormalizerCacheWithExpectedKey_onNormalizerCacheMiss", async () => {
  const normalizerModelResult = {
    clarification: {
      message: "Please be more specific.",
      suggestions: ["software engineer"]
    },
    needsClarification: true
  }
  const { normalizerCacheSpy, workerFetchHandler } = makeSUTWithComposedDependencies({
    normalizerCacheReadResult: null,
    normalizerModelResult
  })

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(normalizerCacheSpy.reads, ["normalizer:en-US:software developer"])
  assert.deepEqual(normalizerCacheSpy.writes, [{ key: "normalizer:en-US:software developer", value: normalizerModelResult }])
})

test("test_fetch_shouldCallNormalizerModelClientAndWriteCache_onUndefinedNormalizerCacheReadResult", async () => {
  const normalizerModelResult = {
    clarification: {
      message: "Please be more specific.",
      suggestions: ["software engineer"]
    },
    needsClarification: true
  }
  const { normalizerCacheSpy, normalizerModelClientSpy, workerFetchHandler } = makeSUTWithComposedDependencies({
    normalizerCacheReadResult: UNDEFINED_CACHE_READ,
    normalizerModelResult
  })

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(normalizerModelClientSpy.calls, [{ locale: "en-US", profession: "software developer" }])
  assert.deepEqual(normalizerCacheSpy.writes, [{ key: "normalizer:en-US:software developer", value: normalizerModelResult }])
})

test("test_fetch_shouldNotCallNormalizerModelClientAndShouldNotWriteCache_onNormalizerCacheHit", async () => {
  const { normalizerCacheSpy, normalizerModelClientSpy, workerFetchHandler } = makeSUTWithComposedDependencies({
    normalizerCacheReadResult: makeNormalizedProfessionResult()
  })

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(normalizerModelClientSpy.calls, [])
  assert.deepEqual(normalizerCacheSpy.writes, [])
})

test("test_fetch_shouldReadAndWriteOutlookCacheWithExpectedKey_onOutlookCacheMiss", async () => {
  const { outlookCacheSpy, workerFetchHandler } = makeSUTWithComposedDependencies({
    normalizerCacheReadResult: makeNormalizedProfessionResult(),
    outlookCacheReadResult: null
  })

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(outlookCacheSpy.reads, ["outlook:software engineer:en-US:1:1"])
  assert.deepEqual(outlookCacheSpy.writes, [{ key: "outlook:software engineer:en-US:1:1", value: makeOutlookAnswerResult() }])
})

test("test_fetch_shouldCallOutlookModelClientAndWriteCache_onUndefinedOutlookCacheReadResult", async () => {
  const { outlookCacheSpy, outlookModelClientSpy, workerFetchHandler } = makeSUTWithComposedDependencies({
    normalizerCacheReadResult: makeNormalizedProfessionResult(),
    outlookCacheReadResult: UNDEFINED_CACHE_READ
  })

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(outlookModelClientSpy.calls, [{ canonicalProfession: "software engineer", hints: { category: "knowledge-work", categoryConfidence: 0.9 }, locale: "en-US", promptVersion: "1", schemaVersion: "1" }])
  assert.deepEqual(outlookCacheSpy.writes, [{ key: "outlook:software engineer:en-US:1:1", value: makeOutlookAnswerResult() }])
})

test("test_fetch_shouldNotCallOutlookModelClientAndShouldNotWriteCache_onOutlookCacheHit", async () => {
  const { outlookCacheSpy, outlookModelClientSpy, workerFetchHandler } = makeSUTWithComposedDependencies({
    normalizerCacheReadResult: makeNormalizedProfessionResult(),
    outlookCacheReadResult: makeOutlookAnswerResult()
  })

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(outlookModelClientSpy.calls, [])
  assert.deepEqual(outlookCacheSpy.writes, [])
})

test("test_fetch_shouldIncrementPopularityCountersStore_onOutlookCacheHit", async () => {
  const { popularityCountersStoreSpy, workerFetchHandler } = makeSUTWithComposedDependencies({
    normalizerCacheReadResult: makeNormalizedProfessionResult(),
    outlookCacheReadResult: makeOutlookAnswerResult()
  })

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(popularityCountersStoreSpy.calls, ["software engineer"])
})

test("test_fetch_shouldIncrementPopularityCountersStore_onOutlookCacheMiss", async () => {
  const { popularityCountersStoreSpy, workerFetchHandler } = makeSUTWithComposedDependencies({
    normalizerCacheReadResult: makeNormalizedProfessionResult(),
    outlookCacheReadResult: null
  })

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(popularityCountersStoreSpy.calls, ["software engineer"])
})

function makeSUT({ normalizerResult = makeNormalizedProfessionResult() } = {}) {
  const popularityCountersStoreSpy = makePopularityCountersStoreSpy()
  const professionOutlookServiceSpy = makeProfessionOutlookServiceSpy()
  const professionNormalizerSpy = makeProfessionNormalizerSpy(normalizerResult)

  return {
    popularityCountersStoreSpy,
    professionOutlookServiceSpy,
    professionNormalizerSpy,
    workerFetchHandler: createWorkerFetchHandler({
      popularityCountersStore: popularityCountersStoreSpy.store,
      professionOutlookService: professionOutlookServiceSpy.service,
      professionNormalizer: professionNormalizerSpy.service,
      requestIdGenerator: () => "request-id"
    })
  }
}

function makeSUTWithComposedDependencies({ normalizerCacheReadResult = null, normalizerModelResult = makeNormalizedProfessionResult(), outlookCacheReadResult = null, outlookModelResult = makeOutlookAnswerResult() } = {}) {
  const normalizerCacheSpy = makeCacheSpy(normalizerCacheReadResult)
  const normalizerModelClientSpy = makeNormalizerModelClientSpy(normalizerModelResult)
  const outlookCacheSpy = makeCacheSpy(outlookCacheReadResult)
  const outlookModelClientSpy = makeOutlookModelClientSpy(outlookModelResult)
  const popularityCountersStoreSpy = makePopularityCountersStoreSpy()

  return {
    normalizerCacheSpy,
    normalizerModelClientSpy,
    outlookCacheSpy,
    outlookModelClientSpy,
    popularityCountersStoreSpy,
    workerFetchHandler: createWorkerFetchHandler({
      normalizerCache: normalizerCacheSpy.cache,
      normalizerModelClient: normalizerModelClientSpy.client,
      outlookCache: outlookCacheSpy.cache,
      outlookModelClient: outlookModelClientSpy.client,
      popularityCountersStore: popularityCountersStoreSpy.store,
      requestIdGenerator: () => "request-id"
    })
  }
}

function makeNormalizedProfessionResult() {
  return {
    canonicalProfession: "software engineer",
    category: "knowledge-work",
    categoryConfidence: 0.9,
    needsClarification: false
  }
}

function makeProfessionNormalizerSpy(result) {
  const calls = []

  return {
    calls,
    service: {
      async normalize(input) {
        calls.push(input)
        return result
      }
    }
  }
}

function makeNormalizerModelClientSpy(result) {
  const calls = []

  return {
    calls,
    client: {
      async normalize(input) {
        calls.push(input)
        return result
      }
    }
  }
}

function makeOutlookAnswerResult() {
  return {
    assumptions: ["steady demand"],
    confidence: {
      label: "medium",
      rationale: "Current trends"
    },
    headline: "Automation changes the role.",
    keyRisks: ["tooling commoditization"],
    timeHorizon: {
      explanation: "Adoption is gradual.",
      label: "3-5 years"
    },
    whatToDoNext: ["learn system design"]
  }
}

function makeOutlookModelClientSpy(result) {
  const calls = []

  return {
    calls,
    client: {
      async generate(input) {
        calls.push(input)
        return result
      }
    }
  }
}

function makePopularityCountersStoreSpy() {
  const calls = []

  return {
    calls,
    store: {
      async increment(canonicalProfession) {
        calls.push(canonicalProfession)
      }
    }
  }
}

function makeCacheSpy(readResult = null) {
  const reads = []
  const writes = []

  return {
    reads,
    writes,
    cache: {
      async read(key) {
        reads.push(key)
        if (readResult === UNDEFINED_CACHE_READ) {
          return undefined
        }
        return readResult
      },
      async write(key, value) {
        writes.push({ key, value })
      }
    }
  }
}

function makeProfessionOutlookServiceSpy() {
  const calls = []

  return {
    calls,
    service: {
      async getOutlook(input) {
        calls.push(input)
        return {
          assumptions: ["steady demand"],
          confidence: {
            label: "medium",
            rationale: "Current trends"
          },
          headline: "Automation changes the role.",
          keyRisks: ["tooling commoditization"],
          timeHorizon: {
            explanation: "Adoption is gradual.",
            label: "3-5 years"
          },
          whatToDoNext: ["learn system design"]
        }
      }
    }
  }
}

async function performOutlookRequest(workerFetchHandler) {
  const response = await workerFetchHandler(new Request("https://example.test/api/outlook", {
    body: JSON.stringify({
      locale: "en-US",
      profession: "  software   developer  ",
      schemaVersion: "1"
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))

  return {
    body: await response.json(),
    status: response.status
  }
}
