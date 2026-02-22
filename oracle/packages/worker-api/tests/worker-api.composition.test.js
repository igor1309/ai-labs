import assert from "node:assert/strict"
import test from "node:test"

import { createWorkerFetchHandler } from "../src/worker-api.js"

test("test_createWorkerFetchHandler_shouldThrowMissingDependencyError_onMissingPopularityTracker", () => {
  assert.throws(() => createWorkerFetchHandler({
    professionNormalizer: makeProfessionNormalizerSpy().service,
    professionOutlookService: makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id"
  }), { message: "Missing required dependency: popularityTracker" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onPopularityTrackerWithoutTrackMethod", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: {},
    professionNormalizer: makeProfessionNormalizerSpy().service,
    professionOutlookService: makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id"
  }), { message: "Invalid dependency: popularityTracker.track" })
})

test("test_createWorkerFetchHandler_shouldThrowMissingDependencyError_onMissingProfessionNormalizer", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    professionOutlookService: makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id"
  }), { message: "Missing required dependency: professionNormalizer" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onProfessionNormalizerWithoutNormalizeMethod", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    professionNormalizer: {},
    professionOutlookService: makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id"
  }), { message: "Invalid dependency: professionNormalizer.normalize" })
})

test("test_createWorkerFetchHandler_shouldThrowMissingDependencyError_onMissingProfessionOutlookService", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    professionNormalizer: makeProfessionNormalizerSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id"
  }), { message: "Missing required dependency: professionOutlookService" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onProfessionOutlookServiceWithoutGetOutlookMethod", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    professionNormalizer: makeProfessionNormalizerSpy().service,
    professionOutlookService: {},
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id"
  }), { message: "Invalid dependency: professionOutlookService.getOutlook" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onNonFunctionPopularityTrackerErrorReporter", () => {
  assert.throws(() => createWorkerFetchHandler({
    onPopularityTrackerError: {},
    popularityTracker: makePopularityTrackerSpy().tracker,
    professionNormalizer: makeProfessionNormalizerSpy().service,
    professionOutlookService: makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id"
  }), { message: "Invalid dependency: onPopularityTrackerError" })
})

test("test_createWorkerFetchHandler_shouldThrowMissingDependencyError_onMissingRequestGuard", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    professionNormalizer: makeProfessionNormalizerSpy().service,
    professionOutlookService: makeProfessionOutlookServiceSpy().service,
    requestIdGenerator: () => "request-id"
  }), { message: "Missing required dependency: requestGuard" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onRequestGuardWithoutValidateMethod", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    professionNormalizer: makeProfessionNormalizerSpy().service,
    professionOutlookService: makeProfessionOutlookServiceSpy().service,
    requestGuard: {},
    requestIdGenerator: () => "request-id"
  }), { message: "Invalid dependency: requestGuard.validate" })
})

test("test_createWorkerFetchHandler_shouldThrowMissingDependencyError_onMissingRequestIdGenerator", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    professionNormalizer: makeProfessionNormalizerSpy().service,
    professionOutlookService: makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard
  }), { message: "Missing required dependency: requestIdGenerator" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onNonFunctionRequestIdGenerator", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    professionNormalizer: makeProfessionNormalizerSpy().service,
    professionOutlookService: makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: {}
  }), { message: "Invalid dependency: requestIdGenerator" })
})

test("test_fetch_shouldCallRequestGuardWithRequestBody_onOutlookRequest", async () => {
  const { requestGuardSpy, workerFetchHandler } = makeSUT()

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(requestGuardSpy.calls, [makeOutlookRequestBody()])
})

test("test_fetch_shouldReturnNeedsClarificationResponse_onInvalidJsonRequestBody", async () => {
  const { popularityTrackerSpy, professionNormalizerSpy, professionOutlookServiceSpy, requestGuardSpy, workerFetchHandler } = makeSUT()

  const response = await performInvalidJsonOutlookRequest(workerFetchHandler)

  assert.deepEqual(response.body, {
    answer: null,
    canonicalProfession: null,
    category: null,
    categoryConfidence: null,
    clarification: {
      message: "Please provide a valid request body.",
      suggestions: []
    },
    needsClarification: true,
    requestId: "request-id",
    schemaVersion: "1"
  })
  assert.deepEqual(requestGuardSpy.calls, [])
  assert.deepEqual(professionNormalizerSpy.calls, [])
  assert.deepEqual(professionOutlookServiceSpy.calls, [])
  assert.deepEqual(popularityTrackerSpy.calls, [])
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

test("test_fetch_shouldCallPopularityTrackerWithRawProfessionAndCanonicalResult_onOutlookFlow", async () => {
  const { popularityTrackerSpy, workerFetchHandler } = makeSUT()

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(popularityTrackerSpy.calls, [{
    normalizerResult: makeNormalizedProfessionResult(),
    rawProfession: "  software   developer  "
  }])
})

test("test_fetch_shouldCallPopularityTrackerWithRawProfessionAndClarificationResult_onNeedsClarification", async () => {
  const clarificationResult = {
    clarification: {
      message: "Please be more specific.",
      suggestions: ["software engineer"]
    },
    needsClarification: true
  }
  const { popularityTrackerSpy, workerFetchHandler } = makeSUT({
    normalizerResult: clarificationResult
  })

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(popularityTrackerSpy.calls, [{
    normalizerResult: clarificationResult,
    rawProfession: "  software   developer  "
  }])
})

test("test_fetch_shouldReturnOutlookResponse_onPopularityTrackerFailure", async () => {
  const { workerFetchHandler } = makeSUT({
    popularityTrackerError: makeCounterWriteFailure()
  })

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

test("test_fetch_shouldCallPopularityTrackerErrorReporter_onPopularityTrackerFailure", async () => {
  const popularityTrackerError = makeCounterWriteFailure()
  const { popularityTrackerErrorReporterSpy, workerFetchHandler } = makeSUT({
    popularityTrackerError
  })

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(popularityTrackerErrorReporterSpy.calls, [popularityTrackerError])
})

test("test_fetch_shouldReturnOutlookResponse_onPopularityTrackerFailureWithoutErrorReporter", async () => {
  const { workerFetchHandler } = makeSUT({
    includePopularityTrackerErrorReporter: false,
    popularityTrackerError: makeCounterWriteFailure()
  })

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

test("test_fetch_shouldReturnNeedsClarificationResponse_onPopularityTrackerFailureInClarificationFlow", async () => {
  const { workerFetchHandler } = makeSUT({
    normalizerResult: {
      clarification: {
        message: "Please be more specific.",
        suggestions: ["software engineer"]
      },
      needsClarification: true
    },
    popularityTrackerError: makeCounterWriteFailure()
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

test("test_fetch_shouldThrowError_onNonCounterWritePopularityTrackerFailure", async () => {
  const expectedError = new Error("tracking failed")
  const { workerFetchHandler } = makeSUT({
    popularityTrackerError: expectedError
  })

  await assert.rejects(() => performOutlookRequest(workerFetchHandler), expectedError)
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

function makeSUT({
  guardResult = makeValidGuardResult(),
  includePopularityTrackerErrorReporter = true,
  normalizerResult = makeNormalizedProfessionResult(),
  outlookAnswer = makeOutlookAnswerResult(),
  popularityTrackerError
} = {}) {
  const popularityTrackerErrorReporterSpy = makePopularityTrackerErrorReporterSpy()
  const popularityTrackerSpy = makePopularityTrackerSpy(popularityTrackerError)
  const professionOutlookServiceSpy = makeProfessionOutlookServiceSpy(outlookAnswer)
  const professionNormalizerSpy = makeProfessionNormalizerSpy(normalizerResult)
  const requestGuardSpy = makeRequestGuardSpy(guardResult)

  return {
    popularityTrackerErrorReporterSpy,
    popularityTrackerSpy,
    professionOutlookServiceSpy,
    professionNormalizerSpy,
    requestGuardSpy,
    workerFetchHandler: createWorkerFetchHandler({
      ...(includePopularityTrackerErrorReporter ? {
        onPopularityTrackerError: popularityTrackerErrorReporterSpy.report
      } : {}),
      popularityTracker: popularityTrackerSpy.tracker,
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

function makePopularityTrackerSpy(error) {
  const calls = []

  return {
    calls,
    tracker: {
      async track(input) {
        if (error) {
          throw error
        }

        calls.push(input)
      }
    }
  }
}

function makeCounterWriteFailure() {
  const error = new Error("counter write failed")
  error.counterWriteFailed = true
  return error
}

function makePopularityTrackerErrorReporterSpy() {
  const calls = []

  return {
    calls,
    report: (error) => {
      calls.push(error)
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

async function performInvalidJsonOutlookRequest(workerFetchHandler) {
  const response = await workerFetchHandler(new Request("https://example.test/api/outlook", {
    body: "{",
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
