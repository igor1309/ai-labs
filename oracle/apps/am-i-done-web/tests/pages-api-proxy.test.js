import assert from "node:assert/strict"
import test from "node:test"

import { createUpstreamRequest, onRequest, resolveApiBaseUrl } from "../functions/api/[[path]].js"

test("test_resolveApiBaseUrl_shouldThrow_onMissingValue", () => {
  assert.throws(() => resolveApiBaseUrl(), {
    message: "Missing required API_BASE_URL for Pages API proxy."
  })
})

test("test_resolveApiBaseUrl_shouldReturnTrimmedBaseUrl_onStringValue", () => {
  const value = resolveApiBaseUrl(" https://am-i-done-api.example.workers.dev ")

  assert.equal(value, "https://am-i-done-api.example.workers.dev")
})

test("test_createUpstreamRequest_shouldPreserveMethodPathAndQuery_onProxyRequest", () => {
  const upstreamRequest = createUpstreamRequest({
    apiBaseUrl: "https://am-i-done-api.example.workers.dev",
    request: new Request("https://am-i-done-web.pages.dev/api/outlook?preview=1", {
      body: JSON.stringify({
        locale: "en-US",
        profession: "software developer",
        schemaVersion: "1"
      }),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    })
  })

  assert.equal(upstreamRequest.method, "POST")
  assert.equal(
    upstreamRequest.url,
    "https://am-i-done-api.example.workers.dev/api/outlook?preview=1"
  )
})

test("test_onRequest_shouldCallFetchWithUpstreamRequest_onValidConfig", async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (request) => {
    calls.push(request)
    return new Response("ok", {
      status: 200
    })
  }

  try {
    const response = await onRequest({
      env: {
        API_BASE_URL: "https://am-i-done-api.example.workers.dev"
      },
      request: new Request("https://am-i-done-web.pages.dev/api/outlook", {
        method: "GET"
      })
    })

    assert.equal(response.status, 200)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, "https://am-i-done-api.example.workers.dev/api/outlook")
  } finally {
    globalThis.fetch = originalFetch
  }
})
