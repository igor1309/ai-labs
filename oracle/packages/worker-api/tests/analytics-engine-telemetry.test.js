import assert from "node:assert/strict"
import test from "node:test"

import {
  createAnalyticsEngineTelemetry,
  makeApiRequestTelemetryDataPointV1,
  makeLlmCallTelemetryDataPointV1,
  resolveWorkerRoute
} from "../src/analytics-engine-telemetry.js"

test("test_resolveWorkerRoute_shouldReturnApiOutlook_onApiOutlookPost", () => {
  assert.equal(resolveWorkerRoute({ method: "POST", pathname: "/api/outlook" }), "api_outlook")
})

test("test_resolveWorkerRoute_shouldReturnHealth_onHealthGet", () => {
  assert.equal(resolveWorkerRoute({ method: "GET", pathname: "/health" }), "health")
})

test("test_resolveWorkerRoute_shouldReturnNotFound_onUnknownPath", () => {
  assert.equal(resolveWorkerRoute({ method: "GET", pathname: "/unknown" }), "not_found")
})

test("test_makeApiRequestTelemetryDataPointV1_shouldProduceStableColumnMapping_onValidEvent", () => {
  const dataPoint = makeApiRequestTelemetryDataPointV1({
    requestId: "request-1",
    environment: "prod",
    route: "api_outlook",
    method: "POST",
    schemaVersion: "1",
    locale: "en-US",
    result: "answered",
    llmTotalsCompleteness: "complete",
    statusCode: 200,
    durationMs: 123,
    llmCalls: 2,
    llmTotalTokens: 456,
    llmCostMicrosUsd: 789
  })

  assert.deepEqual(dataPoint.indexes, [
    "api_request",
    "1",
    "prod",
    "api_outlook",
    "POST",
    "1",
    "en-US",
    "answered",
    "complete"
  ])
  assert.deepEqual(dataPoint.doubles, [200, 123, 2, 456, 789])
  assert.deepEqual(Array.from(dataPoint.blobs[0]), Array.from(new TextEncoder().encode("request-1")))
})

test("test_makeApiRequestTelemetryDataPointV1_shouldSanitizeUnknownEnums_onUnexpectedValues", () => {
  const dataPoint = makeApiRequestTelemetryDataPointV1({
    requestId: "request-1",
    environment: "prod",
    route: "api_outlook",
    method: "POST",
    schemaVersion: "1",
    locale: "en-US",
    result: "some-new-result",
    llmTotalsCompleteness: "maybe",
    statusCode: 200,
    durationMs: 123,
    llmCalls: 1,
    llmTotalTokens: 10,
    llmCostMicrosUsd: 99
  })

  assert.equal(dataPoint.indexes[7], "unknown")
  assert.equal(dataPoint.indexes[8], "unknown")
})

test("test_makeLlmCallTelemetryDataPointV1_shouldProduceStableColumnMapping_onValidEvent", () => {
  const dataPoint = makeLlmCallTelemetryDataPointV1({
    requestId: "request-1",
    environment: "prod",
    client: "outlook",
    model: "some-model",
    promptVersion: "",
    schemaVersion: "1",
    locale: "en-US",
    status: "ok",
    errorType: "",
    usageSource: "provider",
    costSource: "provider",
    durationMs: 123,
    httpStatus: 200,
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
    costMicrosUsd: 99
  })

  assert.deepEqual(dataPoint.indexes, [
    "llm_call",
    "1",
    "prod",
    "outlook",
    "some-model",
    "",
    "1",
    "en-US",
    "ok",
    "",
    "provider",
    "provider"
  ])
  assert.deepEqual(dataPoint.doubles, [123, 200, 10, 20, 30, 99])
  assert.deepEqual(Array.from(dataPoint.blobs[0]), Array.from(new TextEncoder().encode("request-1")))
})

test("test_makeLlmCallTelemetryDataPointV1_shouldSanitizeUnknownEnums_onUnexpectedValues", () => {
  const dataPoint = makeLlmCallTelemetryDataPointV1({
    requestId: "request-1",
    environment: "prod",
    client: "some-new-client",
    model: "some-model",
    promptVersion: "",
    schemaVersion: "1",
    locale: "en-US",
    status: "maybe",
    errorType: "some-new-error",
    usageSource: "sometimes",
    costSource: "sometimes",
    durationMs: 123,
    httpStatus: 200,
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
    costMicrosUsd: 99
  })

  assert.equal(dataPoint.indexes[3], "unknown")
  assert.equal(dataPoint.indexes[8], "unknown")
  assert.equal(dataPoint.indexes[9], "unknown")
  assert.equal(dataPoint.indexes[10], "unknown")
  assert.equal(dataPoint.indexes[11], "unknown")
})

test("test_emitApiRequest_shouldSwallowDatasetWriteFailure_onThrowingDataset", () => {
  const telemetry = createAnalyticsEngineTelemetry({
    dataset: {
      writeDataPoint() {
        throw new Error("boom")
      }
    },
    environment: "prod"
  })

  assert.doesNotThrow(() => {
    telemetry.emitApiRequest({
      requestId: "request-1",
      route: "api_outlook",
      method: "POST",
      schemaVersion: "1",
      locale: "en-US",
      result: "answered",
      llmTotalsCompleteness: "missing",
      statusCode: 200,
      durationMs: 1,
      llmCalls: 0,
      llmTotalTokens: 0,
      llmCostMicrosUsd: 0
    })
  })
})
