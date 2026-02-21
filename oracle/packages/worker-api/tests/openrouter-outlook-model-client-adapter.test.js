import assert from "node:assert/strict"
import test from "node:test"

test("test_generate_shouldSendAuthHeadersAndModelMessagesPayload_onOpenRouterRequest", async () => {
  const adapterModule = await loadAdapterModule()
  const httpClientSpy = makeHttpClientSpy()
  const modelClient = adapterModule?.createOpenRouterOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: httpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 4500
  })

  await modelClient?.generate(makeOutlookInput())

  assert.deepEqual(httpClientSpy.calls, [{
    body: {
      messages: [
        { content: "Return only JSON matching the OutlookAnswer schema. Do not add extra keys or text outside JSON.", role: "system" },
        { content: JSON.stringify(makeOutlookInput()), role: "user" }
      ],
      model: "openrouter/model-id",
      response_format: {
        type: "json_object"
      }
    },
    headers: {
      authorization: "Bearer openrouter-api-key",
      "content-type": "application/json"
    },
    method: "POST",
    timeoutMs: 4500,
    url: "https://openrouter.ai/api/v1/chat/completions"
  }])
})

function makeHttpClientSpy({ responseBody = makeOpenRouterSuccessPayload() } = {}) {
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
        async json() {
          return responseBody
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

function makeOpenRouterSuccessPayload() {
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

function makeOutlookAnswer() {
  return {
    assumptions: ["steady demand"],
    confidence: {
      label: "medium",
      rationale: "current trajectory"
    },
    headline: "Outlook remains resilient.",
    keyRisks: ["tool commoditization"],
    timeHorizon: {
      explanation: "adoption curves are gradual",
      label: "3-5 years"
    },
    whatToDoNext: ["build AI-assisted workflow skills"]
  }
}

async function loadAdapterModule() {
  try {
    return await import("../src/openrouter-outlook-model-client-adapter.js")
  } catch {
    return null
  }
}

test("test_generate_shouldAbortRequestAndThrowTimeoutError_onHttpClientTimeout", async () => {
  const adapterModule = await loadAdapterModule()
  const hangingHttpClientSpy = makeHangingHttpClientSpy()
  const modelClient = adapterModule?.createOpenRouterOutlookModelClient?.({
    apiKey: "openrouter-api-key",
    httpClient: hangingHttpClientSpy.httpClient,
    model: "openrouter/model-id",
    timeoutMs: 1
  })

  await assert.rejects(() => modelClient?.generate(makeOutlookInput()), {
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
