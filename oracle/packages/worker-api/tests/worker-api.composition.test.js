import assert from "node:assert/strict"
import test from "node:test"

import { createWorkerFetchHandler } from "../src/worker-api.js"

test("test_fetch_shouldCallProfessionNormalizerWithRequestPayload_onOutlookRequest", async () => {
  const { professionNormalizerSpy, workerFetchHandler } = makeSUT()

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(professionNormalizerSpy.calls, [{ locale: "en-US", profession: "  software   developer  " }])
})

test("test_fetch_shouldCallProfessionOutlookServiceWithCanonicalProfessionLocaleSchemaVersionAndHints_onOutlookFlow", async () => {
  const { professionOutlookServiceSpy, workerFetchHandler } = makeSUT()

  await performOutlookRequest(workerFetchHandler)

  assert.deepEqual(professionOutlookServiceSpy.calls, [{ canonicalProfession: "software engineer", hints: { category: "knowledge-work", categoryConfidence: 0.9 }, locale: "en-US", schemaVersion: "1" }])
})

function makeSUT() {
  const professionOutlookServiceSpy = makeProfessionOutlookServiceSpy()
  const professionNormalizerSpy = makeProfessionNormalizerSpy()

  return {
    professionOutlookServiceSpy,
    professionNormalizerSpy,
    workerFetchHandler: createWorkerFetchHandler({
      professionOutlookService: professionOutlookServiceSpy.service,
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

function makeProfessionOutlookServiceSpy() {
  const calls = []

  return {
    calls,
    service: {
      async getOutlook(input) {
        calls.push(input)
        return {
          assumptions: ["steady demand"],
          confidence: {
            label: "medium",
            rationale: "Current trends"
          },
          headline: "Automation changes the role.",
          keyRisks: ["tooling commoditization"],
          timeHorizon: {
            explanation: "Adoption is gradual.",
            label: "3-5 years"
          },
          whatToDoNext: ["learn system design"]
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
