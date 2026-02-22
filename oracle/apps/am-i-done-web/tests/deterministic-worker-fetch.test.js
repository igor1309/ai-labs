import assert from "node:assert/strict"
import test from "node:test"

import { makeDeterministicWorkerFetch } from "./support/deterministic-worker-fetch.js"

test("test_makeDeterministicWorkerFetch_shouldReturnStructuredResponse_onValidProfession", async () => {
  const workerFetch = makeDeterministicWorkerFetch()

  const response = await workerFetch(new Request("http://worker.local/api/outlook", {
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
  assert.equal(body?.schemaVersion, "1")
  assert.equal(body?.requestId, "request-id")
  assert.equal(body?.canonicalProfession, "software engineer")
  assert.equal(typeof body?.answer?.headline, "string")
  assert.ok(body.answer.headline.length > 0)
})

