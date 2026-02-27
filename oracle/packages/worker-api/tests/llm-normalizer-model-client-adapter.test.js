import assert from "node:assert/strict"
import test from "node:test"

test("test_createLlmNormalizerModelClient_shouldThrowMissingDependencyError_onMissingApiKey", async () => {
  const adapterModule = await loadAdapterModule()

  assert.throws(() => adapterModule?.createLlmNormalizerModelClient?.({
    httpClient: makeHttpClientSpy().httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  }), { message: "Missing required dependency: apiKey" })
})

test("test_createLlmNormalizerModelClient_shouldThrowInvalidDependencyError_onEmptyApiKey", async () => {
  const adapterModule = await loadAdapterModule()

  assert.throws(() => adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "   ",
    httpClient: makeHttpClientSpy().httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  }), { message: "Invalid dependency: apiKey" })
})

test("test_createLlmNormalizerModelClient_shouldThrowInvalidDependencyError_onInvalidHttpClient", async () => {
  const adapterModule = await loadAdapterModule()

  assert.throws(() => adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: {},
    model: "openrouter/model",
    timeoutMs: 1000
  }), { message: "Invalid dependency: httpClient" })
})

test("test_createLlmNormalizerModelClient_shouldThrowMissingDependencyError_onMissingModel", async () => {
  const adapterModule = await loadAdapterModule()

  assert.throws(() => adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy().httpClient,
    timeoutMs: 1000
  }), { message: "Missing required dependency: model" })
})

test("test_createLlmNormalizerModelClient_shouldThrowInvalidDependencyError_onEmptyModel", async () => {
  const adapterModule = await loadAdapterModule()

  assert.throws(() => adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy().httpClient,
    model: "   ",
    timeoutMs: 1000
  }), { message: "Invalid dependency: model" })
})

test("test_createLlmNormalizerModelClient_shouldThrowInvalidDependencyError_onInvalidTimeoutMs", async () => {
  const adapterModule = await loadAdapterModule()

  assert.throws(() => adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy().httpClient,
    model: "openrouter/model",
    timeoutMs: "1000"
  }), { message: "Invalid dependency: timeoutMs" })
})

test("test_normalize_shouldSendRequestWithConfiguredModelBaseUrlAndTimeout_onNormalizeCall", async () => {
  const adapterModule = await loadAdapterModule()
  const resourcesModule = await loadResourcesModule()
  const httpClientSpy = makeHttpClientSpy()
  const modelClient = adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    endpointUrl: "https://custom-openrouter.example/v1/chat/completions",
    httpClient: httpClientSpy.httpClient,
    requestId: "request-id",
    schemaVersion: "1",
    telemetry: {
      emitLlmCall() {}
    },
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await modelClient?.normalize?.({
    locale: "en-US",
    profession: "software developer"
  })

  assert.deepEqual(httpClientSpy.calls, [{
    init: {
      body: {
        messages: [
          {
            content: resourcesModule?.systemPrompts?.normalizer?.en,
            role: "system"
          },
          {
            content: JSON.stringify({
              locale: "en-US",
              profession: "software developer"
            }),
            role: "user"
          }
        ],
        model: "openrouter/model",
        response_format: {
          type: "json_object"
        }
      },
      headers: {
        authorization: "Bearer openrouter-api-key",
        "content-type": "application/json"
      },
      method: "POST",
      timeoutMs: 1000
    },
    url: "https://custom-openrouter.example/v1/chat/completions"
  }])
})

test("test_normalize_shouldSelectRussianSystemPrompt_onLocaleRu", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy()
  const modelClient = adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await modelClient?.normalize?.({
    locale: "ru",
    profession: "software developer"
  })

  assert.match(httpClientSpy.calls[0]?.init?.body?.messages?.[0]?.content, /верни только json/i)
})

test("test_normalize_shouldIncludeLocaleInUserPrompt_onLocaleRu", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy()
  const modelClient = adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await modelClient?.normalize?.({
    locale: "ru",
    profession: "software developer"
  })

  assert.equal(JSON.parse(httpClientSpy.calls[0]?.init?.body?.messages?.[1]?.content)?.locale, "ru")
})

test("test_normalize_shouldReturnParsedNormalizerResult_onValidJsonModelOutput", async () => {
  const expectedResult = {
    canonicalProfession: "software engineer",
    needsClarification: false
  }
  const adapterModule = await loadAdapterModule()
  const modelClient = adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy(expectedResult).httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  const result = await modelClient?.normalize?.({
    locale: "en-US",
    profession: "software developer"
  })

  assert.deepEqual(result, expectedResult)
})

test("test_normalize_shouldThrowError_onNonJsonModelOutput", async () => {
  const adapterModule = await loadAdapterModule()
  const modelClient = adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy("not-json").httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.normalize?.({
    locale: "en-US",
    profession: "software developer"
  }), {
    message: "Invalid JSON response from LLM"
  })
})

test("test_normalize_shouldThrowError_onMissingCanonicalProfessionWithNeedsClarificationFalse", async () => {
  const adapterModule = await loadAdapterModule()
  const modelClient = adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy({
      needsClarification: false
    }).httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.normalize?.({
    locale: "en-US",
    profession: "software developer"
  }), {
    message: "Invalid normalizer canonical result"
  })
})

test("test_normalize_shouldThrowError_onNonBooleanNeedsClarification", async () => {
  const adapterModule = await loadAdapterModule()
  const modelClient = adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy({
      canonicalProfession: "software engineer",
      needsClarification: "false"
    }).httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.normalize?.({
    locale: "en-US",
    profession: "software developer"
  }), {
    message: "Invalid normalizer result: needsClarification"
  })
})

test("test_normalize_shouldThrowError_onClarificationSuggestionsWithNonStringEntry", async () => {
  const adapterModule = await loadAdapterModule()
  const modelClient = adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy({
      clarification: {
        message: "Please clarify",
        suggestions: ["software engineer", 1]
      },
      needsClarification: true
    }).httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.normalize?.({
    locale: "en-US",
    profession: "software developer"
  }), {
    message: "Invalid normalizer clarification result"
  })
})

test("test_normalize_shouldThrowError_onMissingClarificationMessageWithNeedsClarificationTrue", async () => {
  const adapterModule = await loadAdapterModule()
  const modelClient = adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy({
      clarification: {
        suggestions: ["software engineer"]
      },
      needsClarification: true
    }).httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.normalize?.({
    locale: "en-US",
    profession: "software developer"
  }), {
    message: "Invalid normalizer clarification result"
  })
})

test("test_normalize_shouldThrowLlmRequestFailedError_onNonOkResponseWithErrorMessage", async () => {
  const adapterModule = await loadAdapterModule()
  const modelClient = adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy(undefined, {
      responseBody: {
        error: {
          message: "Unauthorized"
        }
      },
      responseOk: false,
      responseStatus: 401
    }).httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.normalize?.({
    locale: "en-US",
    profession: "software developer"
  }), {
    message: "LLM request failed (401): Unauthorized"
  })
})

test("test_normalize_shouldThrowLlmRequestFailedError_onNonOkResponseWithoutErrorMessage", async () => {
  const adapterModule = await loadAdapterModule()
  const modelClient = adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy(undefined, {
      responseBody: {
        errors: ["bad request"]
      },
      responseOk: false,
      responseStatus: 400
    }).httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.normalize?.({
    locale: "en-US",
    profession: "software developer"
  }), {
    message: "LLM request failed (400)"
  })
})

function makeHttpClientSpy(modelResponse = {
  canonicalProfession: "software engineer",
  needsClarification: false
}, { responseBody, responseOk = true, responseStatus = 200 } = {}) {
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

      return {
        ok: responseOk,
        status: responseStatus,
        async json() {
          if (responseBody !== undefined) {
            return responseBody
          }

          return {
            choices: [
              {
                message: {
                  content: typeof modelResponse === "string" ? modelResponse : JSON.stringify(modelResponse)
                }
              }
            ]
          }
        }
      }
    }
  }
}

async function loadAdapterModule() {
  try {
    return await import("../src/llm-normalizer-model-client-adapter.js")
  } catch {
    return null
  }
}

async function loadResourcesModule() {
  try {
    return await import("../src/generated/localized-resources.generated.js")
  } catch {
    return null
  }
}

test("test_normalize_shouldAbortRequestAndThrowTimeoutError_onHttpClientTimeout", async () => {
  const adapterModule = await loadAdapterModule()
  const hangingHttpClientSpy = makeHangingHttpClientSpy()
  const modelClient = adapterModule?.createLlmNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: hangingHttpClientSpy.httpClient,
    model: "openrouter/model",
    timeoutMs: 1
  })

  await assert.rejects(() => modelClient?.normalize?.({
    locale: "en-US",
    profession: "software developer"
  }), {
    message: "LLM request timed out"
  })
  assert.equal(hangingHttpClientSpy.calls.length, 1)
  assert.equal(typeof hangingHttpClientSpy.calls[0].signal?.addEventListener, "function")
  assert.equal(hangingHttpClientSpy.calls[0].signal?.aborted, true)
})

function makeHangingHttpClientSpy() {
  const calls = []

  return {
    calls,
    httpClient: async (_, init) => {
      calls.push({ signal: init.signal })

      return await new Promise((_, reject) => {
        if (init.signal === undefined) {
          reject(new Error("Missing abort signal"))
          return
        }

        init.signal.addEventListener("abort", () => reject(new Error("Aborted")))
      })
    }
  }
}
