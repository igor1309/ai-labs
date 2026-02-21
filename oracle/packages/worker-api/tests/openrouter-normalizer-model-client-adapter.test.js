import assert from "node:assert/strict"
import test from "node:test"

test("test_normalize_shouldSendRequestWithConfiguredModelBaseUrlAndTimeout_onNormalizeCall", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy()
  const modelClient = adapterModule?.createOpenRouterNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    baseUrl: "https://custom-openrouter.example",
    httpClient: httpClientSpy.httpClient,
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
            content: "Return only JSON with no extra keys and no non-JSON text. Output schema: needsClarification (boolean). If needsClarification=false requires canonicalProfession (string). If needsClarification=true requires clarification.message (string) and clarification.suggestions (string[]). If input is not a profession or is too vague, return needsClarification=true.",
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
    url: "https://custom-openrouter.example/api/v1/chat/completions"
  }])
})

test("test_normalize_shouldThrowError_onClarificationSuggestionsWithNonStringEntry", async () => {
  const adapterModule = await loadAdapterModule()
  const modelClient = adapterModule?.createOpenRouterNormalizerModelClient?.({
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

function makeHttpClientSpy(modelResponse = {
  canonicalProfession: "software engineer",
  needsClarification: false
}) {
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
        async json() {
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
    return await import("../src/openrouter-normalizer-model-client-adapter.js")
  } catch {
    return null
  }
}

test("test_normalize_shouldAbortRequestAndThrowTimeoutError_onHttpClientTimeout", async () => {
  const adapterModule = await loadAdapterModule()
  const hangingHttpClientSpy = makeHangingHttpClientSpy()
  const modelClient = adapterModule?.createOpenRouterNormalizerModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: hangingHttpClientSpy.httpClient,
    model: "openrouter/model",
    timeoutMs: 1
  })

  await assert.rejects(() => modelClient?.normalize?.({
    locale: "en-US",
    profession: "software developer"
  }), {
    message: "OpenRouter request timed out"
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
