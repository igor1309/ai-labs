import assert from "node:assert/strict"
import test from "node:test"

import { createWorkerFetchHandler } from "../src/worker-api.js"

test("test_fetch_shouldCallProfessionNormalizerWithRequestPayload_onOutlookRequest", async () => {
  const { professionNormalizerSpy, workerFetchHandler } = makeSUT()

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(professionNormalizerSpy.calls, [{ locale: "en-US", profession: "  software   developer  " }])
})

function makeSUT() {
  const professionNormalizerSpy = makeProfessionNormalizerSpy()

  return {
    professionNormalizerSpy,
    workerFetchHandler: createWorkerFetchHandler({
      professionNormalizer: professionNormalizerSpy.service,
      requestIdGenerator: () => "request-id"
    })
  }
}

function makeProfessionNormalizerSpy() {
  const calls = []

  return {
    calls,
    service: {
      async normalize(input) {
        calls.push(input)
        return {
          canonicalProfession: "software engineer",
          category: "knowledge-work",
          categoryConfidence: 0.9,
          needsClarification: false
        }
      }
    }
  }
}

async function performOutlookRequest(workerFetchHandler) {
  await workerFetchHandler(new Request("https://example.test/api/outlook", {
    body: JSON.stringify({
      locale: "en-US",
      profession: "  software   developer  ",
      schemaVersion: "1"
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  }))
}
