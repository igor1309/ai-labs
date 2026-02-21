import assert from "node:assert/strict"
import test from "node:test"

import { createWorkerFetchHandler } from "../src/worker-api.js"

test("test_createWorkerFetchHandler_shouldThrowMissingDependencyError_onMissingRequestGuard", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityCountersStore: makePopularityCountersStoreSpy().store,
    professionNormalizer: makeProfessionNormalizerSpy().service,
    professionOutlookService: makeProfessionOutlookServiceSpy().service,
    requestIdGenerator: () => "request-id"
  }), { message: "Missing required dependency: requestGuard" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onRequestGuardWithoutValidateMethod", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityCountersStore: makePopularityCountersStoreSpy().store,
    professionNormalizer: makeProfessionNormalizerSpy().service,
    professionOutlookService: makeProfessionOutlookServiceSpy().service,
    requestGuard: {},
    requestIdGenerator: () => "request-id"
  }), { message: "Invalid dependency: requestGuard.validate" })
})

test("test_fetch_shouldCallRequestGuardWithRequestBody_onOutlookRequest", async () => {
  const { requestGuardSpy, workerFetchHandler } = makeSUT()

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(requestGuardSpy.calls, [makeOutlookRequestBody()])
})

test("test_fetch_shouldReturnNeedsClarificationResponse_onInvalidGuardResult", async () => {
  const { workerFetchHandler } = makeSUT({
    guardResult: {
      clarification: {
        message: "Please provide a valid profession and locale.",
        suggestions: []
      },
      isValid: false,
      schemaVersion: "1"
    }
  })

  const response = await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(response.body, {
    answer: null,
    canonicalProfession: null,
    category: null,
    categoryConfidence: null,
    clarification: {
      message: "Please provide a valid profession and locale.",
      suggestions: []
    },
    needsClarification: true,
    requestId: "request-id",
    schemaVersion: "1"
  })
})

test("test_fetch_shouldNotCallProfessionNormalizer_onInvalidGuardResult", async () => {
  const { professionNormalizerSpy, workerFetchHandler } = makeSUT({
    guardResult: {
      clarification: {
        message: "Please provide a valid profession and locale.",
        suggestions: []
      },
      isValid: false,
      schemaVersion: "1"
    }
  })

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(professionNormalizerSpy.calls, [])
})

test("test_fetch_shouldCallProfessionNormalizerWithValidatedPayload_onValidGuardResult", async () => {
  const { professionNormalizerSpy, workerFetchHandler } = makeSUT()

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(professionNormalizerSpy.calls, [{ locale: "en-US", profession: "  software   developer  " }])
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

test("test_fetch_shouldCallProfessionOutlookServiceWithCanonicalProfessionLocaleSchemaVersionAndHints_onOutlookFlow", async () => {
  const { professionOutlookServiceSpy, workerFetchHandler } = makeSUT()

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(professionOutlookServiceSpy.calls, [{ canonicalProfession: "software engineer", hints: { category: "knowledge-work", categoryConfidence: 0.9 }, locale: "en-US", schemaVersion: "1" }])
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

function makeSUT({ guardResult = makeValidGuardResult(), normalizerResult = makeNormalizedProfessionResult(), outlookAnswer = makeOutlookAnswerResult() } = {}) {
  const popularityCountersStoreSpy = makePopularityCountersStoreSpy()
  const professionOutlookServiceSpy = makeProfessionOutlookServiceSpy(outlookAnswer)
  const professionNormalizerSpy = makeProfessionNormalizerSpy(normalizerResult)
  const requestGuardSpy = makeRequestGuardSpy(guardResult)

  return {
    popularityCountersStoreSpy,
    professionOutlookServiceSpy,
    professionNormalizerSpy,
    requestGuardSpy,
    workerFetchHandler: createWorkerFetchHandler({
      popularityCountersStore: popularityCountersStoreSpy.store,
      professionOutlookService: professionOutlookServiceSpy.service,
      professionNormalizer: professionNormalizerSpy.service,
      requestGuard: requestGuardSpy.guard,
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

function makeProfessionNormalizerSpy(result = makeNormalizedProfessionResult()) {
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

function makeProfessionOutlookServiceSpy(answer = makeOutlookAnswerResult()) {
  const calls = []

  return {
    calls,
    service: {
      async getOutlook(input) {
        calls.push(input)
        return answer
      }
    }
  }
}

function makeRequestGuardSpy(result = makeValidGuardResult()) {
  const calls = []

  return {
    calls,
    guard: {
      async validate(input) {
        calls.push(input)
        return result
      }
    }
  }
}

function makeValidGuardResult() {
  return {
    isValid: true,
    value: {
      locale: "en-US",
      profession: "  software   developer  ",
      schemaVersion: "1"
    }
  }
}

function makeOutlookRequestBody() {
  return {
    locale: "en-US",
    profession: "  software   developer  ",
    schemaVersion: "1"
  }
}

async function performOutlookRequest(workerFetchHandler, { requestBody = makeOutlookRequestBody() } = {}) {
  const response = await workerFetchHandler(new Request("https://example.test/api/outlook", {
    body: JSON.stringify(requestBody),
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
