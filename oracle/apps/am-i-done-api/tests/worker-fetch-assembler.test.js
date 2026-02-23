import assert from "node:assert/strict"
import test from "node:test"

test("test_makeWorkerFetch_shouldThrowMissingBindingError_onMissingNormalizerCacheBinding", async () => {
  const assemblerModule = await loadAssemblerModule()

  assert.throws(() => assemblerModule?.makeWorkerFetch?.(makeEnvWithout("NORMALIZER_CACHE")), {
    message: "Missing required binding: NORMALIZER_CACHE"
  })
})

test("test_makeWorkerFetch_shouldThrowMissingBindingError_onMissingOutlookCacheBinding", async () => {
  const assemblerModule = await loadAssemblerModule()

  assert.throws(() => assemblerModule?.makeWorkerFetch?.(makeEnvWithout("OUTLOOK_CACHE")), {
    message: "Missing required binding: OUTLOOK_CACHE"
  })
})

test("test_makeWorkerFetch_shouldThrowMissingBindingError_onMissingDbBinding", async () => {
  const assemblerModule = await loadAssemblerModule()

  assert.throws(() => assemblerModule?.makeWorkerFetch?.(makeEnvWithout("DB")), {
    message: "Missing required binding: DB"
  })
})

test("test_makeWorkerFetch_shouldThrowMissingBindingError_onMissingEnvironmentBinding", async () => {
  const assemblerModule = await loadAssemblerModule()

  assert.throws(() => assemblerModule?.makeWorkerFetch?.(makeEnvWithout("ENVIRONMENT")), {
    message: "Missing required binding: ENVIRONMENT"
  })
})

test("test_makeWorkerFetch_shouldThrowMissingBindingError_onMissingOpenRouterApiKeyBinding", async () => {
  const assemblerModule = await loadAssemblerModule()

  assert.throws(() => assemblerModule?.makeWorkerFetch?.(makeEnvWithout("OPENROUTER_API_KEY")), {
    message: "Missing required binding: OPENROUTER_API_KEY"
  })
})

test("test_makeWorkerFetch_shouldThrowMissingBindingError_onMissingNormalizerModelBinding", async () => {
  const assemblerModule = await loadAssemblerModule()

  assert.throws(() => assemblerModule?.makeWorkerFetch?.(makeEnvWithout("NORMALIZER_MODEL")), {
    message: "Missing required binding: NORMALIZER_MODEL"
  })
})

test("test_makeWorkerFetch_shouldThrowMissingBindingError_onMissingOutlookModelBinding", async () => {
  const assemblerModule = await loadAssemblerModule()

  assert.throws(() => assemblerModule?.makeWorkerFetch?.(makeEnvWithout("OUTLOOK_MODEL")), {
    message: "Missing required binding: OUTLOOK_MODEL"
  })
})

test("test_makeWorkerFetch_shouldThrowMissingBindingError_onMissingTelemetryDatasetBindingInProd", async () => {
  const assemblerModule = await loadAssemblerModule()

  assert.throws(() => assemblerModule?.makeWorkerFetch?.(makeEnv({
    ENVIRONMENT: "prod"
  })), {
    message: "Missing required binding: TELEMETRY_DATASET"
  })
})

test("test_fetch_shouldRouteOutlookAndWireKvD1AndOpenRouterAdapters_onValidOutlookRequest", async () => {
  const assemblerModule = await loadAssemblerModule()
  const httpClientSpy = makeOpenRouterHttpClientSpy()
  const normalizerCacheSpy = makeKvNamespaceSpy({ getResult: null })
  const outlookCacheSpy = makeKvNamespaceSpy({ getResult: null })
  const d1DatabaseSpy = makeD1DatabaseSpy()
  const env = makeEnv({
    DB: d1DatabaseSpy.db,
    NORMALIZER_CACHE: normalizerCacheSpy.kv,
    NORMALIZER_MODEL: "openrouter/normalizer-model",
    OPENROUTER_BASE_URL: "https://openrouter.custom",
    OPENROUTER_TIMEOUT_MS: "1337",
    OUTLOOK_CACHE: outlookCacheSpy.kv,
    OUTLOOK_MODEL: "openrouter/outlook-model",
    PROMPT_VERSION: "prompt-v7"
  })
  const workerFetch = assemblerModule?.makeWorkerFetch?.(env, {
    httpClient: httpClientSpy.httpClient,
    requestIdGenerator: () => "request-id"
  })

  const response = await workerFetch?.(new Request("https://worker.example/api/outlook", {
    body: JSON.stringify({
      locale: "en-US",
      profession: "  software   developer "
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))

  const body = await response?.json()

  assert.deepEqual(body, {
    answer: makeOutlookAnswer(),
    canonicalProfession: "software engineer",
    category: "knowledge-work",
    categoryConfidence: 0.9,
    clarification: null,
    needsClarification: false,
    requestId: "request-id",
    schemaVersion: "1"
  })
  assert.deepEqual(normalizerCacheSpy.getCalls, ["normalizer:1:en-US:software developer"])
  assert.deepEqual(normalizerCacheSpy.putCalls, [{
    key: "normalizer:1:en-US:software developer",
    value: JSON.stringify(makeNormalizerResult())
  }])
  assert.deepEqual(outlookCacheSpy.getCalls, ["outlook:software engineer:en-US:1:prompt-v7"])
  assert.deepEqual(outlookCacheSpy.putCalls, [{
    key: "outlook:software engineer:en-US:1:prompt-v7",
    value: JSON.stringify(makeOutlookAnswer())
  }])
  assert.equal(d1DatabaseSpy.prepareCalls.length, 2)
  assert.match(normalizeWhitespace(d1DatabaseSpy.prepareCalls[0]), /insert into raw_input_counters/i)
  assert.match(normalizeWhitespace(d1DatabaseSpy.prepareCalls[1]), /insert into profession_counters/i)
  assert.deepEqual(d1DatabaseSpy.bindCalls.length, 2)
  assert.deepEqual(d1DatabaseSpy.bindCalls[0][0], "software developer")
  assert.deepEqual(d1DatabaseSpy.bindCalls[1][0], "software engineer")
  assert.deepEqual(httpClientSpy.calls.map((call) => ({
    model: call.init.body.model,
    timeoutMs: call.init.timeoutMs,
    url: call.url
  })), [
    {
      model: "openrouter/normalizer-model",
      timeoutMs: 1337,
      url: "https://openrouter.custom/api/v1/chat/completions"
    },
    {
      model: "openrouter/outlook-model",
      timeoutMs: 1337,
      url: "https://openrouter.custom/api/v1/chat/completions"
    }
  ])
})

test("test_fetch_shouldIncrementRawAndCanonicalCounters_onOutlookCacheHit", async () => {
  const assemblerModule = await loadAssemblerModule()
  const httpClientSpy = makeOpenRouterHttpClientSpy()
  const normalizerCacheSpy = makeKvNamespaceSpy({ getResult: JSON.stringify(makeNormalizerResult()) })
  const outlookCacheSpy = makeKvNamespaceSpy({ getResult: JSON.stringify(makeOutlookAnswer()) })
  const d1DatabaseSpy = makeD1DatabaseSpy()
  const env = makeEnv({
    DB: d1DatabaseSpy.db,
    NORMALIZER_CACHE: normalizerCacheSpy.kv,
    OUTLOOK_CACHE: outlookCacheSpy.kv
  })
  const workerFetch = assemblerModule?.makeWorkerFetch?.(env, {
    httpClient: httpClientSpy.httpClient,
    requestIdGenerator: () => "request-id"
  })

  const response = await workerFetch?.(new Request("https://worker.example/api/outlook", {
    body: JSON.stringify({
      locale: "en-US",
      profession: "  software   developer "
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))

  const body = await response?.json()

  assert.deepEqual(body, {
    answer: makeOutlookAnswer(),
    canonicalProfession: "software engineer",
    category: "knowledge-work",
    categoryConfidence: 0.9,
    clarification: null,
    needsClarification: false,
    requestId: "request-id",
    schemaVersion: "1"
  })
  assert.deepEqual(normalizerCacheSpy.putCalls, [])
  assert.deepEqual(outlookCacheSpy.putCalls, [])
  assert.deepEqual(httpClientSpy.calls, [])
  assert.equal(d1DatabaseSpy.prepareCalls.length, 2)
  assert.match(normalizeWhitespace(d1DatabaseSpy.prepareCalls[0]), /insert into raw_input_counters/i)
  assert.match(normalizeWhitespace(d1DatabaseSpy.prepareCalls[1]), /insert into profession_counters/i)
  assert.deepEqual(d1DatabaseSpy.bindCalls[0][0], "software developer")
  assert.deepEqual(d1DatabaseSpy.bindCalls[1][0], "software engineer")
})

test("test_fetch_shouldEmitZeroLlmCalls_onOutlookCacheHitInProd", async () => {
  const assemblerModule = await loadAssemblerModule()
  const datasetSpy = makeAnalyticsEngineDatasetSpy()
  const httpClientSpy = makeOpenRouterHttpClientSpy()
  const normalizerCacheSpy = makeKvNamespaceSpy({ getResult: JSON.stringify(makeNormalizerResult()) })
  const outlookCacheSpy = makeKvNamespaceSpy({ getResult: JSON.stringify(makeOutlookAnswer()) })
  const d1DatabaseSpy = makeD1DatabaseSpy()
  const env = makeEnv({
    DB: d1DatabaseSpy.db,
    ENVIRONMENT: "prod",
    NORMALIZER_CACHE: normalizerCacheSpy.kv,
    NORMALIZER_MODEL: "openrouter/normalizer-model",
    OUTLOOK_CACHE: outlookCacheSpy.kv,
    OUTLOOK_MODEL: "openrouter/outlook-model",
    TELEMETRY_DATASET: datasetSpy.dataset
  })
  const workerFetch = assemblerModule?.makeWorkerFetch?.(env, {
    httpClient: httpClientSpy.httpClient,
    requestIdGenerator: () => "request-id"
  })

  const response = await workerFetch?.(new Request("https://worker.example/api/outlook", {
    body: JSON.stringify({
      locale: "en-US",
      profession: "software developer"
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))
  await response?.json()

  const llmCalls = datasetSpy.calls.filter((dataPoint) => dataPoint?.indexes?.[0] === "llm_call")
  const apiRequests = datasetSpy.calls.filter((dataPoint) => dataPoint?.indexes?.[0] === "api_request")

  assert.equal(llmCalls.length, 0)
  assert.equal(apiRequests.length, 1)
  assert.equal(apiRequests[0].doubles?.[2], 0)
  assert.equal(apiRequests[0].indexes?.[8], "missing")
})

test("test_fetch_shouldEmitTwoLlmCallsAndCompleteTotals_onFullCacheMissWithProviderMetadata", async () => {
  const assemblerModule = await loadAssemblerModule()
  const datasetSpy = makeAnalyticsEngineDatasetSpy()
  const httpClientSpy = makeOpenRouterHttpClientSpy({
    normalizerUsage: {
      completion_tokens: 20,
      cost: 0.000123,
      prompt_tokens: 10,
      total_tokens: 30
    },
    outlookUsage: {
      completion_tokens: 20,
      cost: 0.000123,
      prompt_tokens: 10,
      total_tokens: 30
    }
  })
  const normalizerCacheSpy = makeKvNamespaceSpy({ getResult: null })
  const outlookCacheSpy = makeKvNamespaceSpy({ getResult: null })
  const d1DatabaseSpy = makeD1DatabaseSpy()
  const env = makeEnv({
    DB: d1DatabaseSpy.db,
    ENVIRONMENT: "prod",
    NORMALIZER_CACHE: normalizerCacheSpy.kv,
    NORMALIZER_MODEL: "openrouter/normalizer-model",
    OUTLOOK_CACHE: outlookCacheSpy.kv,
    OUTLOOK_MODEL: "openrouter/outlook-model",
    TELEMETRY_DATASET: datasetSpy.dataset
  })
  const workerFetch = assemblerModule?.makeWorkerFetch?.(env, {
    httpClient: httpClientSpy.httpClient,
    requestIdGenerator: () => "request-id"
  })

  const response = await workerFetch?.(new Request("https://worker.example/api/outlook", {
    body: JSON.stringify({
      locale: "en-US",
      profession: "software developer"
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))
  await response?.json()

  const llmCalls = datasetSpy.calls.filter((dataPoint) => dataPoint?.indexes?.[0] === "llm_call")
  const apiRequests = datasetSpy.calls.filter((dataPoint) => dataPoint?.indexes?.[0] === "api_request")

  assert.equal(llmCalls.length, 2)
  assert.equal(apiRequests.length, 1)
  assert.equal(apiRequests[0].doubles?.[2], 2)
  assert.equal(apiRequests[0].doubles?.[3], 60)
  assert.equal(apiRequests[0].doubles?.[4], 246)
  assert.equal(apiRequests[0].indexes?.[8], "complete")
})

test("test_fetch_shouldMarkTotalsPartial_onProviderUsageWithoutCost", async () => {
  const assemblerModule = await loadAssemblerModule()
  const datasetSpy = makeAnalyticsEngineDatasetSpy()
  const httpClientSpy = makeOpenRouterHttpClientSpy({
    normalizerUsage: {
      completion_tokens: 20,
      prompt_tokens: 10,
      total_tokens: 30
    },
    outlookUsage: {
      completion_tokens: 20,
      prompt_tokens: 10,
      total_tokens: 30
    }
  })
  const normalizerCacheSpy = makeKvNamespaceSpy({ getResult: null })
  const outlookCacheSpy = makeKvNamespaceSpy({ getResult: null })
  const env = makeEnv({
    ENVIRONMENT: "prod",
    NORMALIZER_CACHE: normalizerCacheSpy.kv,
    NORMALIZER_MODEL: "openrouter/normalizer-model",
    OUTLOOK_CACHE: outlookCacheSpy.kv,
    OUTLOOK_MODEL: "openrouter/outlook-model",
    TELEMETRY_DATASET: datasetSpy.dataset
  })
  const workerFetch = assemblerModule?.makeWorkerFetch?.(env, {
    httpClient: httpClientSpy.httpClient,
    requestIdGenerator: () => "request-id"
  })

  const response = await workerFetch?.(new Request("https://worker.example/api/outlook", {
    body: JSON.stringify({
      locale: "en-US",
      profession: "software developer"
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))
  await response?.json()

  const apiRequests = datasetSpy.calls.filter((dataPoint) => dataPoint?.indexes?.[0] === "api_request")

  assert.equal(apiRequests.length, 1)
  assert.equal(apiRequests[0].doubles?.[2], 2)
  assert.equal(apiRequests[0].doubles?.[3], 60)
  assert.equal(apiRequests[0].doubles?.[4], 0)
  assert.equal(apiRequests[0].indexes?.[8], "partial")
})

test("test_fetch_shouldMarkTotalsMissing_onMissingProviderMetadata", async () => {
  const assemblerModule = await loadAssemblerModule()
  const datasetSpy = makeAnalyticsEngineDatasetSpy()
  const httpClientSpy = makeOpenRouterHttpClientSpy()
  const normalizerCacheSpy = makeKvNamespaceSpy({ getResult: null })
  const outlookCacheSpy = makeKvNamespaceSpy({ getResult: null })
  const env = makeEnv({
    ENVIRONMENT: "prod",
    NORMALIZER_CACHE: normalizerCacheSpy.kv,
    NORMALIZER_MODEL: "openrouter/normalizer-model",
    OUTLOOK_CACHE: outlookCacheSpy.kv,
    OUTLOOK_MODEL: "openrouter/outlook-model",
    TELEMETRY_DATASET: datasetSpy.dataset
  })
  const workerFetch = assemblerModule?.makeWorkerFetch?.(env, {
    httpClient: httpClientSpy.httpClient,
    requestIdGenerator: () => "request-id"
  })

  const response = await workerFetch?.(new Request("https://worker.example/api/outlook", {
    body: JSON.stringify({
      locale: "en-US",
      profession: "software developer"
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))
  await response?.json()

  const apiRequests = datasetSpy.calls.filter((dataPoint) => dataPoint?.indexes?.[0] === "api_request")

  assert.equal(apiRequests.length, 1)
  assert.equal(apiRequests[0].doubles?.[2], 2)
  assert.equal(apiRequests[0].doubles?.[3], 0)
  assert.equal(apiRequests[0].doubles?.[4], 0)
  assert.equal(apiRequests[0].indexes?.[8], "missing")
})

test("test_fetch_shouldNotFailResponse_onTelemetryDatasetThrowing", async () => {
  const assemblerModule = await loadAssemblerModule()
  const datasetSpy = makeAnalyticsEngineDatasetSpy({ shouldThrow: true })
  const httpClientSpy = makeOpenRouterHttpClientSpy()
  const normalizerCacheSpy = makeKvNamespaceSpy({ getResult: null })
  const outlookCacheSpy = makeKvNamespaceSpy({ getResult: null })
  const env = makeEnv({
    ENVIRONMENT: "prod",
    NORMALIZER_CACHE: normalizerCacheSpy.kv,
    NORMALIZER_MODEL: "openrouter/normalizer-model",
    OUTLOOK_CACHE: outlookCacheSpy.kv,
    OUTLOOK_MODEL: "openrouter/outlook-model",
    TELEMETRY_DATASET: datasetSpy.dataset
  })
  const workerFetch = assemblerModule?.makeWorkerFetch?.(env, {
    httpClient: httpClientSpy.httpClient,
    requestIdGenerator: () => "request-id"
  })

  const response = await workerFetch?.(new Request("https://worker.example/api/outlook", {
    body: JSON.stringify({
      locale: "en-US",
      profession: "software developer"
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))
  const body = await response?.json()

  assert.equal(body?.needsClarification, false)
})

test("test_makeWorkerFetch_shouldUseDefaultBaseUrlAndConfiguredModels_onBlankOptionalBaseUrlBinding", async () => {
  const assemblerModule = await loadAssemblerModule()
  const calls = []
  const env = makeEnv({
    OPENROUTER_BASE_URL: ""
  })
  const workerFetch = assemblerModule?.makeWorkerFetch?.(env, {
    httpClient: async (url, init) => {
      calls.push({
        model: JSON.parse(init.body).model,
        url
      })

      if (calls.length === 1) {
        return {
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify(makeNormalizerResult())
                  }
                }
              ]
            }
          }
        }
      }

      return {
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify(makeOutlookAnswer())
                }
              }
            ]
          }
        }
      }
    },
    requestIdGenerator: () => "request-id"
  })

  const response = await workerFetch?.(new Request("https://worker.example/api/outlook", {
    body: JSON.stringify({
      locale: "en-US",
      profession: "software developer"
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))
  const body = await response?.json()

  assert.equal(body?.needsClarification, false)
  assert.deepEqual(calls, [
    {
      model: "openai/gpt-5-nano",
      url: "https://openrouter.ai/api/v1/chat/completions"
    },
    {
      model: "openai/gpt-5-nano",
      url: "https://openrouter.ai/api/v1/chat/completions"
    }
  ])
})

test("test_makeWorkerFetch_shouldUseDefaultTimeout_onInvalidOpenRouterTimeoutBinding", async () => {
  const assemblerModule = await loadAssemblerModule()
  const httpClientSpy = makeOpenRouterHttpClientSpy()
  const env = makeEnv({
    NORMALIZER_MODEL: "openrouter/normalizer-model",
    OPENROUTER_TIMEOUT_MS: "0",
    OUTLOOK_MODEL: "openrouter/outlook-model"
  })
  const workerFetch = assemblerModule?.makeWorkerFetch?.(env, {
    httpClient: httpClientSpy.httpClient,
    requestIdGenerator: () => "request-id"
  })

  const response = await workerFetch?.(new Request("https://worker.example/api/outlook", {
    body: JSON.stringify({
      locale: "en-US",
      profession: "software developer"
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))
  const body = await response?.json()

  assert.equal(body?.needsClarification, false)
  assert.deepEqual(httpClientSpy.calls.map((call) => call.init.timeoutMs), [10000, 10000])
})

test("test_makeWorkerFetch_shouldThrowInvalidBindingError_onInvalidOpenRouterBaseUrl", async () => {
  const assemblerModule = await loadAssemblerModule()

  assert.throws(() => assemblerModule?.makeWorkerFetch?.(makeEnv({
    OPENROUTER_BASE_URL: "not-a-valid-url"
  })), {
    message: "Invalid binding: OPENROUTER_BASE_URL"
  })
})

test("test_fetch_shouldReturnGeneratedRequestId_onMissingCryptoRandomUuid", async () => {
  const assemblerModule = await loadAssemblerModule()
  const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {}
  })

  try {
    const workerFetch = assemblerModule?.makeWorkerFetch?.(makeEnv())
    const firstResponse = await workerFetch?.(new Request("https://worker.example/api/outlook", {
      body: "{",
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    }))
    const secondResponse = await workerFetch?.(new Request("https://worker.example/api/outlook", {
      body: "{",
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    }))
    const firstBody = await firstResponse?.json()
    const secondBody = await secondResponse?.json()

    assert.notEqual(firstBody?.requestId, secondBody?.requestId)
  } finally {
    if (originalCryptoDescriptor) {
      Object.defineProperty(globalThis, "crypto", originalCryptoDescriptor)
    }
  }
})

function makeD1DatabaseSpy() {
  const bindCalls = []
  const prepareCalls = []

  return {
    bindCalls,
    prepareCalls,
    db: {
      prepare(statement) {
        prepareCalls.push(statement)

        return {
          bind(...values) {
            bindCalls.push(values)

            return {
              async run() {}
            }
          }
        }
      }
    }
  }
}

function makeEnv(overrides = {}) {
  return {
    DB: makeD1DatabaseSpy().db,
    ENVIRONMENT: "dev",
    NORMALIZER_CACHE: makeKvNamespaceSpy().kv,
    NORMALIZER_MODEL: "openai/gpt-5-nano",
    OPENROUTER_API_KEY: "openrouter-api-key",
    OUTLOOK_CACHE: makeKvNamespaceSpy().kv,
    OUTLOOK_MODEL: "openai/gpt-5-nano",
    PROMPT_VERSION: "1",
    ...overrides
  }
}

function makeEnvWithout(bindingName) {
  const env = makeEnv()
  delete env[bindingName]
  return env
}

function makeKvNamespaceSpy({ getResult = null } = {}) {
  const getCalls = []
  const putCalls = []

  return {
    getCalls,
    putCalls,
    kv: {
      async get(key) {
        getCalls.push(key)
        return getResult
      },
      async put(key, value) {
        putCalls.push({ key, value })
      }
    }
  }
}

function makeNormalizerResult() {
  return {
    canonicalProfession: "software engineer",
    category: "knowledge-work",
    categoryConfidence: 0.9,
    needsClarification: false
  }
}

function makeOpenRouterHttpClientSpy({ normalizerUsage, outlookUsage } = {}) {
  const calls = []

  return {
    calls,
    httpClient: async (url, init) => {
      calls.push({
        init: {
          body: JSON.parse(init.body),
          headers: init.headers,
          method: init.method,
          timeoutMs: init.timeoutMs
        },
        url
      })

      const requestBody = JSON.parse(init.body)

      if (requestBody.model.includes("normalizer")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify(makeNormalizerResult())
                  }
                }
              ],
              usage: normalizerUsage
            }
          }
        }
      }

      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify(makeOutlookAnswer())
                }
              }
            ],
            usage: outlookUsage
          }
        }
      }
    }
  }
}

function makeOutlookAnswer() {
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

function makeRequestIdGeneratorSpy() {
  const calls = []

  return {
    calls,
    generate: () => {
      calls.push(undefined)
      return "request-id"
    }
  }
}

function normalizeWhitespace(value) {
  return value.trim().replace(/\s+/g, " ")
}

function makeAnalyticsEngineDatasetSpy({ shouldThrow = false } = {}) {
  const calls = []

  return {
    calls,
    dataset: {
      writeDataPoint(dataPoint) {
        calls.push(dataPoint)

        if (shouldThrow) {
          throw new Error("dataset write failed")
        }
      }
    }
  }
}

async function loadAssemblerModule() {
  try {
    return await import("../src/worker-fetch-assembler.js")
  } catch {
    return null
  }
}

test("test_fetch_shouldReturnNotFound_onOutlookPathWithNonPostMethod", async () => {
  const assemblerModule = await loadAssemblerModule()
  const workerFetch = assemblerModule?.makeWorkerFetch?.(makeEnv())

  const response = await workerFetch?.(new Request("https://worker.example/api/outlook", {
    method: "GET"
  }))

  assert.equal(response?.status, 404)
})

test("test_fetch_shouldReturnOk_onGetHealth", async () => {
  const assemblerModule = await loadAssemblerModule()
  const workerFetch = assemblerModule?.makeWorkerFetch?.(makeEnv())

  const response = await workerFetch?.(new Request("https://worker.example/health", {
    method: "GET"
  }))

  assert.equal(response?.status, 200)
  assert.equal(await response?.text(), "ok")
})

test("test_fetch_shouldReturnNotFound_onUnknownPath", async () => {
  const assemblerModule = await loadAssemblerModule()
  const workerFetch = assemblerModule?.makeWorkerFetch?.(makeEnv())

  const response = await workerFetch?.(new Request("https://worker.example/unknown", {
    method: "GET"
  }))

  assert.equal(response?.status, 404)
  assert.equal(await response?.text(), "Not found")
})

test("test_fetch_shouldDelegateToAssembledOutlookHandler_onPostApiOutlook", async () => {
  const assemblerModule = await loadAssemblerModule()
  const requestIdGeneratorSpy = makeRequestIdGeneratorSpy()
  const workerFetch = assemblerModule?.makeWorkerFetch?.(makeEnv(), {
    requestIdGenerator: requestIdGeneratorSpy.generate
  })

  await workerFetch?.(new Request("https://worker.example/api/outlook", {
    body: "{",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))

  assert.equal(requestIdGeneratorSpy.calls.length, 1)
})

test("test_makeWorkerFetch_shouldThrowInvalidBindingError_onEmptyOrWhitespaceOpenRouterApiKey", async () => {
  const assemblerModule = await loadAssemblerModule()

  assert.throws(() => assemblerModule?.makeWorkerFetch?.(makeEnv({
    OPENROUTER_API_KEY: ""
  })), {
    message: "Invalid binding: OPENROUTER_API_KEY"
  })
  assert.throws(() => assemblerModule?.makeWorkerFetch?.(makeEnv({
    OPENROUTER_API_KEY: "   "
  })), {
    message: "Invalid binding: OPENROUTER_API_KEY"
  })
})
