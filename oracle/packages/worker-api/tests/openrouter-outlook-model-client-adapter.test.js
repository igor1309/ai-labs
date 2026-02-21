import assert from "node:assert/strict"
import test from "node:test"

const SYSTEM_PROMPT = "Return only JSON. Do not include non-JSON text. Do not include extra keys. Use stable section names and include headline, timeHorizon, confidence, keyRisks, whatToDoNext, assumptions."

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

test("test_generate_shouldIncludeJsonOnlySchemaAndStableSectionsRules_onSystemPrompt", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy()
  const modelClient = adapterModule?.createOpenRouterOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await modelClient?.generate(makeOutlookInput())

  assert.match(httpClientSpy.calls[0]?.init?.body?.messages?.[0]?.content, /json/i)
  assert.match(httpClientSpy.calls[0]?.init?.body?.messages?.[0]?.content, /extra keys/i)
  assert.match(httpClientSpy.calls[0]?.init?.body?.messages?.[0]?.content, /non-json text/i)
  assert.match(httpClientSpy.calls[0]?.init?.body?.messages?.[0]?.content, /headline/i)
  assert.match(httpClientSpy.calls[0]?.init?.body?.messages?.[0]?.content, /timeHorizon/i)
  assert.match(httpClientSpy.calls[0]?.init?.body?.messages?.[0]?.content, /confidence/i)
  assert.match(httpClientSpy.calls[0]?.init?.body?.messages?.[0]?.content, /keyRisks/i)
  assert.match(httpClientSpy.calls[0]?.init?.body?.messages?.[0]?.content, /whatToDoNext/i)
  assert.match(httpClientSpy.calls[0]?.init?.body?.messages?.[0]?.content, /assumptions/i)
})

test("test_generate_shouldThrow_onMissingRequiredOutlookAnswerKeys", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy({
    responseMessageContent: JSON.stringify({
      assumptions: ["steady demand"],
      confidence: {
        label: "medium",
        rationale: "current trend"
      },
      keyRisks: ["skills mismatch"],
      timeHorizon: {
        explanation: "adoption curves remain uneven",
        label: "3-5 years"
      },
      whatToDoNext: ["strengthen systems thinking"]
    })
  })
  const modelClient = adapterModule?.createOpenRouterOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.generate(makeOutlookInput()))
})

test("test_generate_shouldThrow_onNonJsonModelOutput", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy({
    responseMessageContent: "not-json"
  })
  const modelClient = adapterModule?.createOpenRouterOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.generate(makeOutlookInput()))
})

test("test_generate_shouldReturnParsedOutlookAnswer_onValidJsonModelOutput", async () => {
  const expectedAnswer = makeOutlookAnswer({
    headline: "AI copilots shift daily workflows."
  })
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy({
    responseMessageContent: JSON.stringify(expectedAnswer)
  })
  const modelClient = adapterModule?.createOpenRouterOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  const actualAnswer = await modelClient?.generate(makeOutlookInput())

  assert.deepEqual(actualAnswer, expectedAnswer)
})

test("test_generate_shouldThrow_onConfidenceLabelOutsideAllowedSet", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy({
    responseMessageContent: JSON.stringify({
      ...makeOutlookAnswer(),
      confidence: {
        label: "certain",
        rationale: "unsupported confidence scale"
      }
    })
  })
  const modelClient = adapterModule?.createOpenRouterOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.generate(makeOutlookInput()))
})

test("test_generate_shouldThrow_onInvalidTimeHorizonAndListFieldTypes", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy({
    responseMessageContent: JSON.stringify({
      ...makeOutlookAnswer(),
      assumptions: ["steady demand", 1],
      keyRisks: ["skills mismatch", 1],
      timeHorizon: {
        explanation: 1,
        label: "3-5 years"
      },
      whatToDoNext: ["strengthen systems thinking", 1]
    })
  })
  const modelClient = adapterModule?.createOpenRouterOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.generate(makeOutlookInput()))
})

async function loadAdapterModule() {
  try {
    return await import("../src/openrouter-outlook-model-client-adapter.js")
  } catch {
    return null
  }
}

function makeHttpClientSpy({ responseMessageContent = JSON.stringify(makeOutlookAnswer()) } = {}) {
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
                  content: responseMessageContent
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

function makeOutlookAnswer({ headline = "Automation changes tasks, not demand." } = {}) {
  return {
    assumptions: ["steady demand"],
    confidence: {
      label: "medium",
      rationale: "current trend"
    },
    headline,
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
            content: SYSTEM_PROMPT,
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
