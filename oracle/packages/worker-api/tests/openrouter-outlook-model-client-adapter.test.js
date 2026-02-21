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

  assert.deepEqual(httpClientSpy.calls, [makeOpenRouterRequestCall({
    model: "openrouter/model",
    userPromptContent: JSON.stringify(makeOutlookInput())
  })])
})

test("test_generate_shouldIncludeCanonicalProfessionLocaleSchemaPromptVersionAndHints_onUserPrompt", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy()
  const modelClient = adapterModule?.createOpenRouterOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await modelClient?.generate(makeOutlookInput({
    hints: {
      category: "knowledge-work",
      categoryConfidence: 0.9
    }
  }))

  assert.deepEqual(JSON.parse(httpClientSpy.calls[0]?.init?.body?.messages?.[1]?.content), {
    canonicalProfession: "software engineer",
    hints: {
      category: "knowledge-work",
      categoryConfidence: 0.9
    },
    locale: "en-US",
    promptVersion: "prompt-v1",
    schemaVersion: "1"
  })
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

function makeOutlookInput({ hints } = {}) {
  const input = {
    canonicalProfession: "software engineer",
    locale: "en-US",
    promptVersion: "prompt-v1",
    schemaVersion: "1"
  }

  if (hints !== undefined) {
    input.hints = hints
  }

  return input
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

function makeOpenRouterRequestCall({ model, userPromptContent }) {
  return {
    init: {
      body: {
        messages: [
          {
            content: "system prompt",
            role: "system"
          },
          {
            content: userPromptContent,
            role: "user"
          }
        ],
        model
      },
      headers: {
        authorization: "Bearer openrouter-api-key",
        "content-type": "application/json"
      },
      method: "POST"
    },
    url: "https://openrouter.ai/api/v1/chat/completions"
  }
}
