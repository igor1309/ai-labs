import assert from "node:assert/strict"
import test from "node:test"

import { makeWorkerFetch } from "../../am-i-done-api/src/worker-fetch-assembler.js"

const runRealProviderSmoke = process.env.RUN_REAL_PROVIDER_SMOKE === "1"

test("test_webRealProviderSmoke_shouldReturnStructuredOutlook_onValidProfession", async (testContext) => {
  if (!runRealProviderSmoke) {
    testContext.skip("Set RUN_REAL_PROVIDER_SMOKE=1 to run real-provider smoke checks.")
    return
  }

  const openRouterApiKey = resolveOpenRouterApiKey(process.env.OPENROUTER_API_KEY)
  const workerFetch = makeWorkerFetch({
    DB: makeD1DatabaseSpy(),
    NORMALIZER_CACHE: makeKvNamespaceSpy(),
    OPENROUTER_API_KEY: openRouterApiKey,
    OUTLOOK_CACHE: makeKvNamespaceSpy(),
    PROMPT_VERSION: "1"
  })

  const response = await workerFetch(new Request("https://worker.example/api/outlook", {
    body: JSON.stringify({
      locale: "en-US",
      profession: "software developer",
      schemaVersion: "1"
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
  assert.equal(body?.schemaVersion, "1")
  assert.equal(typeof body?.requestId, "string")
  assert.ok(body.requestId.length > 0)
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

function resolveOpenRouterApiKey(bindingValue) {
  if (typeof bindingValue !== "string" || bindingValue.trim() === "") {
    throw new Error("Missing required OPENROUTER_API_KEY for real-provider smoke checks.")
  }

  return bindingValue
}
