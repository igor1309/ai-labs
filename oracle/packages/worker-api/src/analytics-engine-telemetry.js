const EVENT_SCHEMA_VERSION = "1"

const VALID_ENVIRONMENTS = new Set(["prod", "preview", "dev"])
const VALID_API_ROUTES = new Set(["api_outlook", "health", "not_found"])

const FORBIDDEN_TEXT_KEYS = new Set([
  "answer",
  "canonicalProfession",
  "completion",
  "messages",
  "profession",
  "prompt",
  "rawProfession"
])

export function resolveWorkerRoute({ method, pathname }) {
  if (method === "GET" && pathname === "/health") {
    return "health"
  }

  if (method === "POST" && pathname === "/api/outlook") {
    return "api_outlook"
  }

  return "not_found"
}

export function createNoopAnalyticsEngineTelemetry() {
  return {
    emitApiRequest() {},
    emitLlmCall() {}
  }
}

export function createAnalyticsEngineTelemetry({ dataset, environment, waitUntil } = {}) {
  const analyticsEngineDataset = requireMethodDependency(
    dataset,
    "dataset",
    "writeDataPoint"
  )

  const telemetryEnvironment = requireEnvironment(environment)
  const schedule = createTaskScheduler(waitUntil)

  return {
    emitApiRequest(event) {
      const dataPoint = makeApiRequestTelemetryDataPointV1({
        ...event,
        environment: telemetryEnvironment
      })

      emitDataPoint({
        analyticsEngineDataset,
        dataPoint,
        schedule
      })
    },
    emitLlmCall(event) {
      const dataPoint = makeLlmCallTelemetryDataPointV1({
        ...event,
        environment: telemetryEnvironment
      })

      emitDataPoint({
        analyticsEngineDataset,
        dataPoint,
        schedule
      })
    }
  }
}

export function makeApiRequestTelemetryDataPointV1({
  requestId,
  environment,
  route,
  method,
  schemaVersion,
  locale,
  result,
  llmTotalsCompleteness,
  statusCode,
  durationMs,
  llmCalls,
  llmTotalTokens,
  llmCostMicrosUsd
}) {
  rejectIfForbiddenTextKeysPresent(arguments[0])

  const telemetryRoute = requireLowCardinalityApiRoute(route)

  return {
    blobs: [encodeUtf8Blob(requireString(requestId, "requestId"))],
    doubles: [
      toNumberOrZero(statusCode),
      toNumberOrZero(durationMs),
      toNumberOrZero(llmCalls),
      toNumberOrZero(llmTotalTokens),
      toNumberOrZero(llmCostMicrosUsd)
    ],
    indexes: [
      "api_request",
      EVENT_SCHEMA_VERSION,
      requireEnvironment(environment),
      telemetryRoute,
      requireString(method, "method"),
      requireString(schemaVersion, "schemaVersion"),
      requireString(locale, "locale"),
      requireString(result, "result"),
      requireString(llmTotalsCompleteness, "llmTotalsCompleteness")
    ]
  }
}

export function makeLlmCallTelemetryDataPointV1({
  requestId,
  environment,
  client,
  model,
  promptVersion,
  schemaVersion,
  locale,
  status,
  errorType,
  usageSource,
  costSource,
  durationMs,
  httpStatus,
  promptTokens,
  completionTokens,
  totalTokens,
  costMicrosUsd
}) {
  rejectIfForbiddenTextKeysPresent(arguments[0])

  return {
    blobs: [encodeUtf8Blob(requireString(requestId, "requestId"))],
    doubles: [
      toNumberOrZero(durationMs),
      toNumberOrZero(httpStatus),
      toNumberOrZero(promptTokens),
      toNumberOrZero(completionTokens),
      toNumberOrZero(totalTokens),
      toNumberOrZero(costMicrosUsd)
    ],
    indexes: [
      "llm_call",
      EVENT_SCHEMA_VERSION,
      requireEnvironment(environment),
      requireString(client, "client"),
      requireString(model, "model"),
      requireOptionalString(promptVersion),
      requireString(schemaVersion, "schemaVersion"),
      requireString(locale, "locale"),
      requireString(status, "status"),
      requireOptionalString(errorType),
      requireString(usageSource, "usageSource"),
      requireString(costSource, "costSource")
    ]
  }
}

function emitDataPoint({ analyticsEngineDataset, dataPoint, schedule }) {
  try {
    const maybePromise = analyticsEngineDataset.writeDataPoint(dataPoint)

    schedule(maybePromise)
  } catch {}
}

function createTaskScheduler(waitUntil) {
  if (typeof waitUntil === "function") {
    return function schedule(task) {
      try {
        waitUntil(Promise.resolve(task).catch(() => {}))
      } catch {}
    }
  }

  return function schedule(task) {
    Promise.resolve(task).catch(() => {})
  }
}

function rejectIfForbiddenTextKeysPresent(candidate) {
  if (candidate === null || candidate === undefined) {
    return
  }

  for (const key of Object.keys(candidate)) {
    if (FORBIDDEN_TEXT_KEYS.has(key)) {
      throw new Error(`Telemetry includes forbidden text field: ${key}`)
    }
  }
}

function encodeUtf8Blob(value) {
  return new TextEncoder().encode(value)
}

function toNumberOrZero(value) {
  if (value === undefined || value === null) {
    return 0
  }

  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue : 0
}

function requireString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid telemetry field: ${name}`)
  }

  return value
}

function requireOptionalString(value) {
  if (value === undefined || value === null) {
    return ""
  }

  if (typeof value !== "string") {
    throw new Error("Invalid telemetry field: expected string")
  }

  return value
}

function requireEnvironment(environment) {
  const value = requireString(environment, "environment")

  if (!VALID_ENVIRONMENTS.has(value)) {
    throw new Error("Invalid telemetry field: environment")
  }

  return value
}

function requireLowCardinalityApiRoute(route) {
  const value = requireString(route, "route")

  if (!VALID_API_ROUTES.has(value)) {
    throw new Error("Invalid telemetry field: route")
  }

  return value
}

function requireDependency(value, name) {
  if (value === undefined || value === null) {
    throw new Error(`Missing required dependency: ${name}`)
  }

  return value
}

function requireMethodDependency(value, name, methodName) {
  const dependency = requireDependency(value, name)

  if (typeof dependency[methodName] !== "function") {
    throw new Error(`Invalid dependency: ${name}.${methodName}`)
  }

  return dependency
}

