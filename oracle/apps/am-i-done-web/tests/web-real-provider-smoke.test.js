import assert from "node:assert/strict"
import test from "node:test"

import { makeWorkerFetch } from "../../am-i-done-api/src/worker-fetch-assembler.js"

const runRealProviderSmoke = process.env.RUN_REAL_PROVIDER_SMOKE === "1"

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

  const response = await workerFetch(new Request("https://worker.example/api/outlook", {
    body: JSON.stringify({
      locale: "en-US",
      profession: "software developer",
      schemaVersion: "2"
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body?.needsClarification, false)
  assert.equal(typeof body?.canonicalProfession, "string")
  assert.ok(body.canonicalProfession.length > 0)
  assert.equal(typeof body?.answer?.headline, "string")
  assert.ok(body.answer.headline.length > 0)
  assert.equal(body?.schemaVersion, "2")
  assert.equal(typeof body?.requestId, "string")
  assert.ok(body.requestId.length > 0)
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

function resolveLlmApiKey(bindingValue) {
  if (typeof bindingValue !== "string" || bindingValue.trim() === "") {
    throw new Error("Missing required LLM_API_KEY for real-provider smoke checks.")
  }

  return bindingValue
}

function resolveRequiredModel(bindingValue, name) {
  if (typeof bindingValue !== "string" || bindingValue.trim() === "") {
    throw new Error(`Missing required ${name} for real-provider smoke checks.`)
  }

  return bindingValue.trim()
}
