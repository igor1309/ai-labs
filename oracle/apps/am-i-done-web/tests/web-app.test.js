import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  OUTLOOK_ENDPOINT_PATH,
  requestOutlook,
  resolveAppConfig
} from "../src/app.js"

test("test_resolveAppConfig_shouldReturnDefaultTimeout_onMissingQueryValue", () => {
  const config = resolveAppConfig(new URL("https://am-i-done-web.pages.dev/"))

  assert.equal(config.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS)
})

test("test_resolveAppConfig_shouldReturnQueryTimeout_onPositiveNumericValue", () => {
  const config = resolveAppConfig(new URL("https://am-i-done-web.pages.dev/?timeoutMs=25"))

  assert.equal(config.requestTimeoutMs, 25)
})

test("test_requestOutlook_shouldCallSameOriginEndpoint_onValidInput", async () => {
  const calls = []
  const fetchSpy = async (url, options) => {
    calls.push({
      options,
      url
    })

    return new Response(JSON.stringify({
      needsClarification: true
    }), {
      headers: {
        "content-type": "application/json"
      },
      status: 200
    })
  }

  await requestOutlook({
    fetchImplementation: fetchSpy,
    profession: "software developer",
    timeoutMs: 100
  })

  assert.equal(calls[0].url, OUTLOOK_ENDPOINT_PATH)
})

test("test_requestOutlook_shouldSendExpectedPayload_onValidInput", async () => {
  const calls = []
  const fetchSpy = async (url, options) => {
    calls.push({
      options,
      url
    })

    return new Response(JSON.stringify({
      needsClarification: true
    }), {
      headers: {
        "content-type": "application/json"
      },
      status: 200
    })
  }

  await requestOutlook({
    fetchImplementation: fetchSpy,
    profession: "software developer",
    timeoutMs: 100
  })

  assert.deepEqual(JSON.parse(calls[0].options.body), {
    locale: "en-US",
    profession: "software developer",
    schemaVersion: "1"
  })
})

test("test_requestOutlook_shouldUsePostJsonRequest_onValidInput", async () => {
  const calls = []
  const fetchSpy = async (url, options) => {
    calls.push({
      options,
      url
    })

    return new Response(JSON.stringify({
      needsClarification: true
    }), {
      headers: {
        "content-type": "application/json"
      },
      status: 200
    })
  }

  await requestOutlook({
    fetchImplementation: fetchSpy,
    profession: "software developer",
    timeoutMs: 100
  })

  assert.deepEqual({
    contentType: calls[0].options.headers["content-type"],
    method: calls[0].options.method
  }, {
    contentType: "application/json",
    method: "POST"
  })
})

test("test_requestOutlook_shouldThrowTransportFailure_onNonOkResponse", async () => {
  const fetchSpy = async () => new Response("boom", {
    status: 500
  })

  await assert.rejects(() => requestOutlook({
    fetchImplementation: fetchSpy,
    profession: "software developer",
    timeoutMs: 100
  }), {
    message: "Transport failure"
  })
})
