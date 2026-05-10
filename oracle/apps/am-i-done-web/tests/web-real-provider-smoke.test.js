import assert from "node:assert/strict"
import test from "node:test"

import { makeWorkerFetch } from "../../am-i-done-api/src/worker-fetch-assembler.js"

const runRealProviderSmoke = process.env.RUN_REAL_PROVIDER_SMOKE === "1"
const realProviderSmokeMaxAttempts = 3
const realProviderSmokeRetryDelayMs = 5000

test("test_webRealProviderSmoke_shouldReturnStructuredOutlook_onValidProfession", async (testContext) => {
  if (!runRealProviderSmoke) {
    testContext.skip("Set RUN_REAL_PROVIDER_SMOKE=1 to run real-provider smoke checks.")
    return
  }

  const llmApiKey = resolveLlmApiKey(process.env.LLM_API_KEY)
  const normalizerModel = resolveRequiredModel(process.env.NORMALIZER_MODEL, "NORMALIZER_MODEL")
  const outlookModel = resolveRequiredModel(process.env.OUTLOOK_MODEL, "OUTLOOK_MODEL")
  const workerFetch = makeWorkerFetch({
    DB: makeD1DatabaseSpy(),
    ENVIRONMENT: "dev",
    NORMALIZER_CACHE: makeKvNamespaceSpy(),
    NORMALIZER_MODEL: normalizerModel,
    LLM_ENDPOINT_URL: process.env.LLM_ENDPOINT_URL,
    LLM_API_KEY: llmApiKey,
    LLM_TIMEOUT_MS: process.env.LLM_TIMEOUT_MS,
    OUTLOOK_CACHE: makeKvNamespaceSpy(),
    OUTLOOK_MODEL: outlookModel,
    PROMPT_VERSION: "2"
  })

  await runSmokeRequestWithRetries(async () => {
    const response = await workerFetch(makeOutlookRequest())
    const body = await response.json()

    assertStructuredSmokeResponse(response, body)
  }, {
    maxAttempts: realProviderSmokeMaxAttempts,
    retryDelayMs: realProviderSmokeRetryDelayMs
  })
})

test("test_resolveRequiredModel_shouldThrowError_onMissingBinding", () => {
  assert.throws(() => resolveRequiredModel(undefined, "NORMALIZER_MODEL"), {
    message: "Missing required NORMALIZER_MODEL for real-provider smoke checks."
  })
})

test("test_resolveRequiredModel_shouldReturnTrimmedBinding_onValidBinding", () => {
  const model = resolveRequiredModel("  z-ai/glm-4.5-air:free  ", "OUTLOOK_MODEL")

  assert.equal(model, "z-ai/glm-4.5-air:free")
})

test("test_runSmokeRequestWithRetries_shouldReturnLaterResult_onTransientFailure", async () => {
  const attempts = []

  const result = await runSmokeRequestWithRetries(async ({ attempt }) => {
    attempts.push(attempt)

    if (attempt === 1) {
      throw new Error("temporary provider failure")
    }

    return "structured outlook"
  }, { maxAttempts: 2, retryDelayMs: 0 })

  assert.deepEqual({ attempts, result }, {
    attempts: [1, 2],
    result: "structured outlook"
  })
})

test("test_runSmokeRequestWithRetries_shouldThrowError_onInvalidMaxAttempts", async () => {
  await assert.rejects(() => runSmokeRequestWithRetries(async () => "structured outlook", {
    maxAttempts: 0,
    retryDelayMs: 0
  }), {
    message: "realProviderSmokeMaxAttempts must be greater than 0."
  })
})

function makeD1DatabaseSpy() {
  return {
    prepare() {
      return {
        bind() {
          return {
            async run() {}
          }
        }
      }
    }
  }
}

function makeKvNamespaceSpy() {
  const map = new Map()

  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null
    },
    async put(key, value) {
      map.set(key, value)
    }
  }
}

function makeOutlookRequest() {
  return new Request("https://worker.example/api/outlook", {
    body: JSON.stringify({
      locale: "en-US",
      profession: "software developer",
      schemaVersion: "2"
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  })
}

function assertStructuredSmokeResponse(response, body) {
  assert.equal(response.status, 200)
  assert.equal(body?.needsClarification, false)
  assert.equal(typeof body?.canonicalProfession, "string")
  assert.ok(body.canonicalProfession.length > 0)
  assert.equal(typeof body?.answer?.headline, "string")
  assert.ok(body.answer.headline.length > 0)
  assert.equal(body?.schemaVersion, "2")
  assert.equal(typeof body?.requestId, "string")
  assert.ok(body.requestId.length > 0)
}

function resolveLlmApiKey(bindingValue) {
  if (typeof bindingValue !== "string" || bindingValue.trim() === "") {
    throw new Error("Missing required LLM_API_KEY for real-provider smoke checks.")
  }

  return bindingValue
}

async function runSmokeRequestWithRetries(operation, { maxAttempts = 1, retryDelayMs = 0 } = {}) {
  if (maxAttempts < 1) {
    throw new Error("realProviderSmokeMaxAttempts must be greater than 0.")
  }

  const errors = []

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation({ attempt })
    } catch (error) {
      errors.push(error)

      if (attempt === maxAttempts) {
        throw new AggregateError(errors, `Real-provider smoke failed after ${maxAttempts} attempts.`)
      }

      await wait(retryDelayMs)
    }
  }
}

function resolveRequiredModel(bindingValue, name) {
  if (typeof bindingValue !== "string" || bindingValue.trim() === "") {
    throw new Error(`Missing required ${name} for real-provider smoke checks.`)
  }

  return bindingValue.trim()
}

function wait(delayMs) {
  if (delayMs <= 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}
