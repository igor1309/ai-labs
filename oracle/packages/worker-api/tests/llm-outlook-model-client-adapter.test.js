import assert from "node:assert/strict"
import test from "node:test"

test("test_generate_shouldSendAuthHeadersAndModelMessagesPayload_onLlmRequest", async () => {
  const adapterModule = await loadAdapterModule()
  const resourcesModule = await loadResourcesModule()
  const httpClientSpy = makeHttpClientSpy()
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    requestId: "request-id",
    telemetry: {
      emitLlmCall() {}
    },
    model: "openrouter/model-id",
    timeoutMs: 4500
  })

  await modelClient?.generate(makeOutlookInput())

  assert.deepEqual(httpClientSpy.calls, [makeLlmRequestCall({
    model: "openrouter/model-id",
    systemPrompt: resourcesModule?.systemPrompts?.outlook?.en,
    timeoutMs: 4500,
    userPromptContent: JSON.stringify(makeOutlookInput())
  })])
})

test("test_createLlmOutlookModelClient_shouldThrowMissingDependencyError_onMissingApiKey", async () => {
  const adapterModule = await loadAdapterModule()

  assert.throws(() => adapterModule?.createLlmOutlookModelClient?.({
    httpClient: makeHttpClientSpy().httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  }), { message: "Missing required dependency: apiKey" })
})

test("test_createLlmOutlookModelClient_shouldThrowInvalidDependencyError_onEmptyApiKey", async () => {
  const adapterModule = await loadAdapterModule()

  assert.throws(() => adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "   ",
    httpClient: makeHttpClientSpy().httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  }), { message: "Invalid dependency: apiKey" })
})

test("test_createLlmOutlookModelClient_shouldThrowInvalidDependencyError_onNonStringApiKey", async () => {
  const adapterModule = await loadAdapterModule()

  assert.throws(() => adapterModule?.createLlmOutlookModelClient?.({
    apiKey: 1234,
    httpClient: makeHttpClientSpy().httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  }), { message: "Invalid dependency: apiKey" })
})

test("test_createLlmOutlookModelClient_shouldThrowInvalidDependencyError_onInvalidHttpClient", async () => {
  const adapterModule = await loadAdapterModule()

  assert.throws(() => adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: {},
    model: "openrouter/model-id",
    timeoutMs: 1000
  }), { message: "Invalid dependency: httpClient" })
})

test("test_createLlmOutlookModelClient_shouldThrowMissingDependencyError_onMissingModel", async () => {
  const adapterModule = await loadAdapterModule()

  assert.throws(() => adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy().httpClient,
    timeoutMs: 1000
  }), { message: "Missing required dependency: model" })
})

test("test_createLlmOutlookModelClient_shouldThrowInvalidDependencyError_onEmptyModel", async () => {
  const adapterModule = await loadAdapterModule()

  assert.throws(() => adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy().httpClient,
    model: "   ",
    timeoutMs: 1000
  }), { message: "Invalid dependency: model" })
})

test("test_createLlmOutlookModelClient_shouldThrowInvalidDependencyError_onNonStringModel", async () => {
  const adapterModule = await loadAdapterModule()

  assert.throws(() => adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy().httpClient,
    model: {},
    timeoutMs: 1000
  }), { message: "Invalid dependency: model" })
})

test("test_createLlmOutlookModelClient_shouldThrowInvalidDependencyError_onInvalidTimeoutMs", async () => {
  const adapterModule = await loadAdapterModule()

  assert.throws(() => adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: makeHttpClientSpy().httpClient,
    model: "openrouter/model-id",
    timeoutMs: "1000"
  }), { message: "Invalid dependency: timeoutMs" })
})

test("test_generate_shouldIncludeCanonicalProfessionLocaleSchemaPromptVersionAndHints_onUserPrompt", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy()
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  })

  await modelClient?.generate(makeOutlookInput({
    hints: {
      category: "knowledge-work",
      categoryConfidence: 0.9
    }
  }))

  assert.deepEqual(JSON.parse(httpClientSpy.calls[0]?.body?.messages?.[1]?.content), {
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

test("test_generate_shouldSelectRussianSystemPrompt_onLocaleRu", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy()
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  })

  await modelClient?.generate({
    canonicalProfession: "software engineer",
    locale: "ru",
    promptVersion: "prompt-v1",
    schemaVersion: "2"
  })

  assert.match(httpClientSpy.calls[0]?.body?.messages?.[0]?.content, /верни только json/i)
})

test("test_generate_shouldIncludeLocaleInUserPrompt_onLocaleRu", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy()
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  })

  await modelClient?.generate({
    canonicalProfession: "software engineer",
    locale: "ru",
    promptVersion: "prompt-v1",
    schemaVersion: "2"
  })

  assert.equal(JSON.parse(httpClientSpy.calls[0]?.body?.messages?.[1]?.content)?.locale, "ru")
})

test("test_generate_shouldIncludeJsonOnlySchemaAndStableSectionsRules_onSystemPrompt", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy()
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  })

  await modelClient?.generate(makeOutlookInput())

  assert.match(httpClientSpy.calls[0]?.body?.messages?.[0]?.content, /json/i)
  assert.match(httpClientSpy.calls[0]?.body?.messages?.[0]?.content, /extra keys/i)
  assert.match(httpClientSpy.calls[0]?.body?.messages?.[0]?.content, /non-json text/i)
  assert.match(httpClientSpy.calls[0]?.body?.messages?.[0]?.content, /headline/i)
  assert.match(httpClientSpy.calls[0]?.body?.messages?.[0]?.content, /timeHorizon/i)
  assert.match(httpClientSpy.calls[0]?.body?.messages?.[0]?.content, /confidence/i)
  assert.match(httpClientSpy.calls[0]?.body?.messages?.[0]?.content, /low\|medium\|high/i)
  assert.match(httpClientSpy.calls[0]?.body?.messages?.[0]?.content, /keyRisks/i)
  assert.match(httpClientSpy.calls[0]?.body?.messages?.[0]?.content, /whatToDoNext/i)
  assert.match(httpClientSpy.calls[0]?.body?.messages?.[0]?.content, /assumptions/i)
})

test("test_generate_shouldThrow_onMissingRequiredOutlookAnswerKeys", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy({
    responseBody: makeLlmSuccessPayload({
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
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.generate(makeOutlookInput()))
})

test("test_generate_shouldThrow_onNonJsonModelOutput", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy({
    responseBody: makeLlmRawPayload("not-json")
  })
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model-id",
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
    responseBody: makeLlmSuccessPayload(expectedAnswer)
  })
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  })

  const actualAnswer = await modelClient?.generate(makeOutlookInput())

  assert.deepEqual(actualAnswer, expectedAnswer)
})

test("test_generate_shouldThrow_onConfidenceLabelOutsideAllowedSet", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy({
    responseBody: makeLlmSuccessPayload({
      ...makeOutlookAnswer(),
      confidence: {
        label: "certain",
        rationale: "unsupported confidence scale"
      }
    })
  })
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.generate(makeOutlookInput()))
})

test("test_generate_shouldNormalizeConfidenceLabel_onCaseVariantLabel", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy({
    responseBody: makeLlmSuccessPayload({
      ...makeOutlookAnswer(),
      confidence: {
        label: "Medium",
        rationale: "current trajectory"
      }
    })
  })
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  })

  const actualAnswer = await modelClient?.generate(makeOutlookInput())

  assert.deepEqual(actualAnswer, makeOutlookAnswer())
})

test("test_generate_shouldThrow_onInvalidTimeHorizonAndListFieldTypes", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy({
    responseBody: makeLlmSuccessPayload({
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
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.generate(makeOutlookInput()))
})

test("test_generate_shouldThrowLlmRequestFailedError_onNonOkResponseWithErrorMessage", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy({
    responseBody: {
      error: {
        message: "Unauthorized"
      }
    },
    responseOk: false,
    responseStatus: 401
  })
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.generate(makeOutlookInput()), {
    message: "LLM request failed (401): Unauthorized"
  })
})

test("test_generate_shouldThrowLlmRequestFailedError_onNonOkResponseWithoutErrorMessage", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy({
    responseBody: {
      errors: ["bad request"]
    },
    responseOk: false,
    responseStatus: 400
  })
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  })

  await assert.rejects(() => modelClient?.generate(makeOutlookInput()), {
    message: "LLM request failed (400)"
  })
})

test("test_generate_shouldRequestJsonObjectResponseFormat_onLlmRequest", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy()
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1000
  })

  await modelClient?.generate(makeOutlookInput())

  assert.deepEqual(httpClientSpy.calls[0]?.body?.response_format, {
    type: "json_object"
  })
})

test("test_generate_shouldAbortRequestAndThrowTimeoutError_onHttpClientTimeout", async () => {
  const adapterModule = await loadAdapterModule()
  const hangingHttpClientSpy = makeHangingHttpClientSpy()
  const modelClient = adapterModule?.createLlmOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: hangingHttpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1
  })

  await assert.rejects(() => modelClient?.generate(makeOutlookInput()), {
    message: "LLM request timed out"
  })
  assert.equal(hangingHttpClientSpy.calls.length, 1)
  assert.equal(typeof hangingHttpClientSpy.calls[0].signal?.addEventListener, "function")
  assert.equal(hangingHttpClientSpy.calls[0].signal?.aborted, true)
})

async function loadAdapterModule() {
  try {
    return await import("../src/llm-outlook-model-client-adapter.js")
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

function makeHttpClientSpy({ responseBody = makeLlmSuccessPayload(), responseOk = true, responseStatus = 200 } = {}) {
  const calls = []

  return {
    calls,
    httpClient: async (url, request) => {
      calls.push({
        body: JSON.parse(request.body),
        headers: request.headers,
        method: request.method,
        timeoutMs: request.timeoutMs,
        url
      })

      return {
        ok: responseOk,
        status: responseStatus,
        async json() {
          return responseBody
        }
      }
    }
  }
}

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

function makeOutlookAnswer({ headline = "Outlook remains resilient." } = {}) {
  return {
    assumptions: ["steady demand"],
    confidence: {
      label: "medium",
      rationale: "current trajectory"
    },
    headline,
    keyRisks: ["tool commoditization"],
    timeHorizon: {
      explanation: "adoption curves are gradual",
      label: "3-5 years"
    },
    whatToDoNext: ["build AI-assisted workflow skills"]
  }
}

function makeLlmSuccessPayload(answer = makeOutlookAnswer()) {
  return makeLlmRawPayload(JSON.stringify(answer))
}

function makeLlmRawPayload(content) {
  return {
    choices: [
      {
        message: {
          content
        }
      }
    ]
  }
}

function makeLlmRequestCall({ model, systemPrompt, timeoutMs, userPromptContent }) {
  return {
    body: {
      messages: [
        { content: systemPrompt, role: "system" },
        { content: userPromptContent, role: "user" }
      ],
      model,
      response_format: {
        type: "json_object"
      }
    },
    headers: {
      authorization: "Bearer openrouter-api-key",
      "content-type": "application/json"
    },
    method: "POST",
    timeoutMs,
    url: "https://nomos.enoa.ai/v1/chat/completions"
  }
}
