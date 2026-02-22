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

test("test_makeWorkerFetch_shouldUseStubModelModeWithoutOpenRouterApiKey_onStubModeEnabled", async () => {
  const assemblerModule = await loadAssemblerModule()
  const env = makeEnv({
    MODEL_PROVIDER_MODE: "stub"
  })
  delete env.OPENROUTER_API_KEY
  const workerFetch = assemblerModule?.makeWorkerFetch?.(env, {
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
  assert.equal(body?.canonicalProfession, "software engineer")
  assert.equal(body?.answer?.headline, "Software Engineer remains viable with evolving workflows.")
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
  assert.deepEqual(normalizerCacheSpy.getCalls, ["normalizer:en-US:software developer"])
  assert.deepEqual(normalizerCacheSpy.putCalls, [{
    key: "normalizer:en-US:software developer",
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

function makeOpenRouterHttpClientSpy() {
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
