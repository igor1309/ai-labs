import assert from "node:assert/strict"
import test from "node:test"

test("test_generate_shouldSendRequestWithAuthHeadersModelAndMessages_onGenerateCall", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy()
  const modelClient = adapterModule?.createOpenRouterOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await modelClient?.generate(makeOutlookInput())

  assert.deepEqual(httpClientSpy.calls, [{
    init: {
      body: {
        messages: [
          {
            content: "system prompt",
            role: "system"
          },
          {
            content: "user prompt",
            role: "user"
          }
        ],
        model: "openrouter/model"
      },
      headers: {
        authorization: "Bearer openrouter-api-key",
        "content-type": "application/json"
      },
      method: "POST"
    },
    url: "https://openrouter.ai/api/v1/chat/completions"
  }])
})

async function loadAdapterModule() {
  try {
    return await import("../src/openrouter-outlook-model-client-adapter.js")
  } catch {
    return null
  }
}

function makeHttpClientSpy() {
  const calls = []

  return {
    calls,
    httpClient: async (url, init) => {
      calls.push({
        init: {
          body: JSON.parse(init.body),
          headers: init.headers,
          method: init.method
        },
        url
      })

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

function makeOutlookInput() {
  return {
    canonicalProfession: "software engineer",
    locale: "en-US",
    promptVersion: "prompt-v1",
    schemaVersion: "1"
  }
}

function makeOutlookAnswer() {
  return {
    assumptions: ["steady demand"],
    confidence: {
      label: "medium",
      rationale: "current trend"
    },
    headline: "Automation changes tasks, not demand.",
    keyRisks: ["skills mismatch"],
    timeHorizon: {
      explanation: "adoption curves remain uneven",
      label: "3-5 years"
    },
    whatToDoNext: ["strengthen systems thinking"]
  }
}
