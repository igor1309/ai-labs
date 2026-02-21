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
            content: "Return only JSON matching the NormalizerResult schema. Do not add extra keys or text outside JSON. If input is not a profession or is too vague, return needsClarification=true with clarification.message and clarification.suggestions.",
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

function makeHttpClientSpy() {
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
                  content: JSON.stringify({
                    canonicalProfession: "software engineer",
                    needsClarification: false
                  })
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
