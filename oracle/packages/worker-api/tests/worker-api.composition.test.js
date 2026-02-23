import assert from "node:assert/strict"
import test from "node:test"

import { createWorkerFetchHandler } from "../src/worker-api.js"

test("test_createWorkerFetchHandler_shouldThrowMissingDependencyError_onMissingPopularityTracker", () => {
  assert.throws(() => createWorkerFetchHandler({
    makeProfessionNormalizer: () => makeProfessionNormalizerSpy().service,
    makeProfessionOutlookService: () => makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id",
    telemetry: makeTelemetrySpy().telemetry
  }), { message: "Missing required dependency: popularityTracker" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onPopularityTrackerWithoutTrackMethod", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: {},
    makeProfessionNormalizer: () => makeProfessionNormalizerSpy().service,
    makeProfessionOutlookService: () => makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id",
    telemetry: makeTelemetrySpy().telemetry
  }), { message: "Invalid dependency: popularityTracker.track" })
})

test("test_createWorkerFetchHandler_shouldThrowMissingDependencyError_onMissingProfessionNormalizerFactory", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    makeProfessionOutlookService: () => makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id",
    telemetry: makeTelemetrySpy().telemetry
  }), { message: "Missing required dependency: makeProfessionNormalizer" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onNonFunctionProfessionNormalizerFactory", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    makeProfessionNormalizer: {},
    makeProfessionOutlookService: () => makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id",
    telemetry: makeTelemetrySpy().telemetry
  }), { message: "Invalid dependency: makeProfessionNormalizer" })
})

test("test_createWorkerFetchHandler_shouldThrowMissingDependencyError_onMissingProfessionOutlookServiceFactory", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    makeProfessionNormalizer: () => makeProfessionNormalizerSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id",
    telemetry: makeTelemetrySpy().telemetry
  }), { message: "Missing required dependency: makeProfessionOutlookService" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onNonFunctionProfessionOutlookServiceFactory", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    makeProfessionNormalizer: () => makeProfessionNormalizerSpy().service,
    makeProfessionOutlookService: {},
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id",
    telemetry: makeTelemetrySpy().telemetry
  }), { message: "Invalid dependency: makeProfessionOutlookService" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onNonFunctionPopularityTrackerErrorReporter", () => {
  assert.throws(() => createWorkerFetchHandler({
    onPopularityTrackerError: {},
    popularityTracker: makePopularityTrackerSpy().tracker,
    makeProfessionNormalizer: () => makeProfessionNormalizerSpy().service,
    makeProfessionOutlookService: () => makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id",
    telemetry: makeTelemetrySpy().telemetry
  }), { message: "Invalid dependency: onPopularityTrackerError" })
})

test("test_createWorkerFetchHandler_shouldThrowMissingDependencyError_onMissingRequestGuard", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    makeProfessionNormalizer: () => makeProfessionNormalizerSpy().service,
    makeProfessionOutlookService: () => makeProfessionOutlookServiceSpy().service,
    requestIdGenerator: () => "request-id",
    telemetry: makeTelemetrySpy().telemetry
  }), { message: "Missing required dependency: requestGuard" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onRequestGuardWithoutValidateMethod", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    makeProfessionNormalizer: () => makeProfessionNormalizerSpy().service,
    makeProfessionOutlookService: () => makeProfessionOutlookServiceSpy().service,
    requestGuard: {},
    requestIdGenerator: () => "request-id",
    telemetry: makeTelemetrySpy().telemetry
  }), { message: "Invalid dependency: requestGuard.validate" })
})

test("test_createWorkerFetchHandler_shouldThrowMissingDependencyError_onMissingRequestIdGenerator", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    makeProfessionNormalizer: () => makeProfessionNormalizerSpy().service,
    makeProfessionOutlookService: () => makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    telemetry: makeTelemetrySpy().telemetry
  }), { message: "Missing required dependency: requestIdGenerator" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onNonFunctionRequestIdGenerator", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    makeProfessionNormalizer: () => makeProfessionNormalizerSpy().service,
    makeProfessionOutlookService: () => makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: {},
    telemetry: makeTelemetrySpy().telemetry
  }), { message: "Invalid dependency: requestIdGenerator" })
})

test("test_createWorkerFetchHandler_shouldThrowMissingDependencyError_onMissingTelemetry", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    makeProfessionNormalizer: () => makeProfessionNormalizerSpy().service,
    makeProfessionOutlookService: () => makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id"
  }), { message: "Missing required dependency: telemetry" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onTelemetryWithoutEmitApiRequestMethod", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    makeProfessionNormalizer: () => makeProfessionNormalizerSpy().service,
    makeProfessionOutlookService: () => makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id",
    telemetry: {}
  }), { message: "Invalid dependency: telemetry.emitApiRequest" })
})

test("test_createWorkerFetchHandler_shouldThrowInvalidDependencyError_onTelemetryWithoutEmitLlmCallMethod", () => {
  assert.throws(() => createWorkerFetchHandler({
    popularityTracker: makePopularityTrackerSpy().tracker,
    makeProfessionNormalizer: () => makeProfessionNormalizerSpy().service,
    makeProfessionOutlookService: () => makeProfessionOutlookServiceSpy().service,
    requestGuard: makeRequestGuardSpy().guard,
    requestIdGenerator: () => "request-id",
    telemetry: {
      emitApiRequest() {}
    }
  }), { message: "Invalid dependency: telemetry.emitLlmCall" })
})

test("test_fetch_shouldCallRequestGuardWithRequestBody_onOutlookRequest", async () => {
  const { requestGuardSpy, workerFetchHandler } = makeSUT()

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(requestGuardSpy.calls, [makeOutlookRequestBody()])
})

test("test_fetch_shouldReturnNeedsClarificationResponse_onInvalidJsonRequestBody", async () => {
  const { popularityTrackerSpy, professionNormalizerSpy, professionOutlookServiceSpy, requestGuardSpy, requestIdGeneratorSpy, telemetrySpy, workerFetchHandler } = makeSUT()

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
  assert.equal(requestIdGeneratorSpy.calls.length, 1)
  assert.equal(telemetrySpy.apiRequestCalls.length, 1)
  assert.equal(telemetrySpy.apiRequestCalls[0].result, "invalid_body")
})

test("test_fetch_shouldIncludeEffectiveLocale_onSchemaVersion2InvalidJsonRequestBody", async () => {
  const { workerFetchHandler } = makeSUT()

  const response = await performInvalidJsonOutlookRequestWithBody(workerFetchHandler, "{\"locale\":\"ru-RU\",\"schemaVersion\":\"2\",")

  assert.deepEqual(response.body, {
    answer: null,
    canonicalProfession: null,
    category: null,
    categoryConfidence: null,
    clarification: {
      message: "Пожалуйста, отправьте корректное тело запроса.",
      suggestions: []
    },
    effectiveLocale: "ru",
    needsClarification: true,
    requestId: "request-id",
    schemaVersion: "2"
  })
})

test("test_fetch_shouldReturnNeedsClarificationResponse_onInvalidGuardResult", async () => {
  const { telemetrySpy, workerFetchHandler } = makeSUT({
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
  assert.equal(telemetrySpy.apiRequestCalls.length, 1)
  assert.equal(telemetrySpy.apiRequestCalls[0].result, "guard_reject")
})

test("test_fetch_shouldIncludeEffectiveLocale_onSchemaVersion2GuardReject", async () => {
  const { workerFetchHandler } = makeSUT({
    guardResult: {
      clarification: {
        message: "Пожалуйста, укажите корректные профессию и локаль.",
        suggestions: []
      },
      isValid: false,
      schemaVersion: "2"
    }
  })

  const response = await performOutlookRequest(workerFetchHandler, {
    requestBody: {
      locale: "ru-RU",
      profession: "   ",
      schemaVersion: "2"
    }
  })

  assert.deepEqual(response.body, {
    answer: null,
    canonicalProfession: null,
    category: null,
    categoryConfidence: null,
    clarification: {
      message: "Пожалуйста, укажите корректные профессию и локаль.",
      suggestions: []
    },
    effectiveLocale: "ru",
    needsClarification: true,
    requestId: "request-id",
    schemaVersion: "2"
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
  const { telemetrySpy, workerFetchHandler } = makeSUT({
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
  assert.equal(telemetrySpy.apiRequestCalls.length, 1)
  assert.equal(telemetrySpy.apiRequestCalls[0].result, "clarify")
})

test("test_fetch_shouldIncludeEffectiveLocale_onSchemaVersion2NeedsClarificationFlow", async () => {
  const { workerFetchHandler } = makeSUT({
    guardResult: makeValidGuardResultSchemaVersion2RuRu(),
    normalizerResult: {
      clarification: {
        message: "Please be more specific.",
        suggestions: ["software engineer"]
      },
      needsClarification: true
    }
  })

  const response = await performOutlookRequest(workerFetchHandler, {
    requestBody: {
      locale: "ru-RU",
      profession: "software engineer",
      schemaVersion: "2"
    }
  })

  assert.deepEqual(response.body, {
    answer: null,
    canonicalProfession: null,
    category: null,
    categoryConfidence: null,
    clarification: {
      message: "Please be more specific.",
      suggestions: ["software engineer"]
    },
    effectiveLocale: "ru",
    needsClarification: true,
    requestId: "request-id",
    schemaVersion: "2"
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
  const { telemetrySpy, workerFetchHandler } = makeSUT({
    popularityTrackerError: expectedError
  })

  await assert.rejects(() => performOutlookRequest(workerFetchHandler), expectedError)
  assert.equal(telemetrySpy.apiRequestCalls.length, 1)
  assert.equal(telemetrySpy.apiRequestCalls[0].result, "error")
})

test("test_fetch_shouldCallProfessionOutlookServiceWithCanonicalProfessionLocaleSchemaVersionAndHints_onOutlookFlow", async () => {
  const { professionOutlookServiceSpy, workerFetchHandler } = makeSUT()

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(professionOutlookServiceSpy.calls, [{ canonicalProfession: "software engineer", hints: { category: "knowledge-work", categoryConfidence: 0.9 }, locale: "en-US", schemaVersion: "1" }])
})

test("test_fetch_shouldCallProfessionOutlookServiceWithEffectiveLocale_onSchemaVersion2", async () => {
  const { professionOutlookServiceSpy, workerFetchHandler } = makeSUT({
    guardResult: makeValidGuardResultSchemaVersion2RuRu()
  })

  await performOutlookRequest(workerFetchHandler, {
    requestBody: {
      locale: "ru-RU",
      profession: "software engineer",
      schemaVersion: "2"
    }
  })

  assert.deepEqual(professionOutlookServiceSpy.calls, [{ canonicalProfession: "software engineer", hints: { category: "knowledge-work", categoryConfidence: 0.9 }, locale: "ru", schemaVersion: "2" }])
})

test("test_fetch_shouldReturnOutlookResponse_onOutlookFlow", async () => {
  const { telemetrySpy, workerFetchHandler } = makeSUT()

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
  assert.equal(telemetrySpy.apiRequestCalls.length, 1)
  assert.equal(telemetrySpy.apiRequestCalls[0].result, "answered")
})

test("test_fetch_shouldIncludeEffectiveLocale_onSchemaVersion2OutlookFlow", async () => {
  const { workerFetchHandler } = makeSUT({
    guardResult: makeValidGuardResultSchemaVersion2RuRu()
  })

  const response = await performOutlookRequest(workerFetchHandler, {
    requestBody: {
      locale: "ru-RU",
      profession: "software engineer",
      schemaVersion: "2"
    }
  })

  assert.deepEqual(response.body, {
    answer: makeOutlookAnswerResult(),
    canonicalProfession: "software engineer",
    category: "knowledge-work",
    categoryConfidence: 0.9,
    clarification: null,
    effectiveLocale: "ru",
    needsClarification: false,
    requestId: "request-id",
    schemaVersion: "2"
  })
})

test("test_fetch_shouldNotFailResponse_onTelemetryFailure", async () => {
  const { workerFetchHandler } = makeSUT({
    telemetryThrows: true
  })

  const response = await performOutlookRequest(workerFetchHandler)

  assert.equal(response.status, 200)
  assert.equal(response.body.needsClarification, false)
})

function makeSUT({
  guardResult = makeValidGuardResult(),
  includePopularityTrackerErrorReporter = true,
  normalizerResult = makeNormalizedProfessionResult(),
  outlookAnswer = makeOutlookAnswerResult(),
  popularityTrackerError,
  telemetryThrows = false
} = {}) {
  const popularityTrackerErrorReporterSpy = makePopularityTrackerErrorReporterSpy()
  const popularityTrackerSpy = makePopularityTrackerSpy(popularityTrackerError)
  const professionOutlookServiceSpy = makeProfessionOutlookServiceSpy(outlookAnswer)
  const professionNormalizerSpy = makeProfessionNormalizerSpy(normalizerResult)
  const requestGuardSpy = makeRequestGuardSpy(guardResult)
  const requestIdGeneratorSpy = makeRequestIdGeneratorSpy()
  const telemetrySpy = makeTelemetrySpy({
    emitApiRequestThrows: telemetryThrows
  })
  const professionNormalizerFactorySpy = makeProfessionNormalizerFactorySpy(professionNormalizerSpy.service)
  const professionOutlookServiceFactorySpy = makeProfessionOutlookServiceFactorySpy(professionOutlookServiceSpy.service)

  return {
    popularityTrackerErrorReporterSpy,
    popularityTrackerSpy,
    professionOutlookServiceSpy,
    professionNormalizerSpy,
    professionNormalizerFactorySpy,
    professionOutlookServiceFactorySpy,
    requestGuardSpy,
    requestIdGeneratorSpy,
    telemetrySpy,
    workerFetchHandler: createWorkerFetchHandler({
      ...(includePopularityTrackerErrorReporter ? {
        onPopularityTrackerError: popularityTrackerErrorReporterSpy.report
      } : {}),
      popularityTracker: popularityTrackerSpy.tracker,
      makeProfessionNormalizer: professionNormalizerFactorySpy.make,
      makeProfessionOutlookService: professionOutlookServiceFactorySpy.make,
      requestGuard: requestGuardSpy.guard,
      requestIdGenerator: requestIdGeneratorSpy.generate,
      telemetry: telemetrySpy.telemetry
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
      effectiveLocale: "en-US",
      locale: "en-US",
      profession: "  software   developer  ",
      requestedLocale: "en-US",
      schemaVersion: "1"
    }
  }
}

function makeValidGuardResultSchemaVersion2RuRu() {
  return {
    isValid: true,
    value: {
      effectiveLocale: "ru",
      locale: "ru-RU",
      profession: "software engineer",
      requestedLocale: "ru-RU",
      schemaVersion: "2"
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

function makeRequestIdGeneratorSpy({ value = "request-id" } = {}) {
  const calls = []

  return {
    calls,
    generate: () => {
      calls.push({})
      return value
    }
  }
}

function makeTelemetrySpy({ emitApiRequestThrows = false } = {}) {
  const apiRequestCalls = []
  const llmCallCalls = []

  return {
    apiRequestCalls,
    llmCallCalls,
    telemetry: {
      emitApiRequest(event) {
        apiRequestCalls.push(event)

        if (emitApiRequestThrows) {
          throw new Error("telemetry failed")
        }
      },
      emitLlmCall(event) {
        llmCallCalls.push(event)
      }
    }
  }
}

function makeProfessionNormalizerFactorySpy(service) {
  const calls = []

  return {
    calls,
    make: (context) => {
      calls.push(context)
      return service
    }
  }
}

function makeProfessionOutlookServiceFactorySpy(service) {
  const calls = []

  return {
    calls,
    make: (context) => {
      calls.push(context)
      return service
    }
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

async function performInvalidJsonOutlookRequestWithBody(workerFetchHandler, body) {
  const response = await workerFetchHandler(new Request("https://example.test/api/outlook", {
    body,
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
