import assert from "node:assert/strict"
import test from "node:test"

import appEntrypoint from "../../../apps/am-i-done-api/src/index.js"
import * as workerApiModule from "../src/worker-api.js"

test("test_createWorkerApiEntrypointRouter_shouldThrowMissingDependencyError_onMissingOutlookHandler", () => {
  assert.throws(() => workerApiModule.createWorkerApiEntrypointRouter(), {
    message: "Missing required dependency: outlookHandler"
  })
})

test("test_createWorkerApiEntrypointRouter_shouldThrowInvalidDependencyError_onNonFunctionOutlookHandler", () => {
  assert.throws(() => workerApiModule.createWorkerApiEntrypointRouter({
    outlookHandler: {}
  }), {
    message: "Invalid dependency: outlookHandler"
  })
})

test("test_fetch_shouldReturnOk_onGetHealth", async () => {
  assert.equal(typeof workerApiModule.createWorkerApiEntrypointRouter, "function")

  const fetch = workerApiModule.createWorkerApiEntrypointRouter({
    outlookHandler: async () => Response.json({})
  })

  const response = await fetch(new Request("https://example.test/health", {
    method: "GET"
  }))

  assert.equal(response.status, 200)
  assert.equal(await response.text(), "ok")
})

test("test_fetch_shouldDelegateToOutlookHandler_onPostApiOutlook", async () => {
  const outlookHandlerSpy = makeOutlookHandlerSpy()
  const fetch = workerApiModule.createWorkerApiEntrypointRouter({
    outlookHandler: outlookHandlerSpy.handler
  })

  await fetch(new Request("https://example.test/api/outlook", {
    body: JSON.stringify({ profession: "software developer" }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))

  assert.equal(outlookHandlerSpy.calls.length, 1)
})

test("test_fetch_shouldReturnNotFound_onUnknownRoute", async () => {
  const fetch = workerApiModule.createWorkerApiEntrypointRouter({
    outlookHandler: async () => Response.json({})
  })

  const response = await fetch(new Request("https://example.test/unknown", {
    method: "GET"
  }))

  assert.equal(response.status, 404)
})

test("test_appFetch_shouldReturnComposedInvalidJsonClarification_onPostApiOutlookWithInvalidJson", async () => {
  const response = await appEntrypoint.fetch(new Request("https://example.test/api/outlook", {
    body: "{",
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))
  const responseBody = await response.json()

  assert.equal(responseBody.clarification.message, "Please provide a valid request body.")
})

function makeOutlookHandlerSpy() {
  const calls = []

  return {
    calls,
    handler: async (request) => {
      calls.push(request)
      return Response.json({})
    }
  }
}
