const EVENT_SCHEMA_VERSION = "1"

const VALID_ENVIRONMENTS = new Set(["prod", "preview", "dev"])
const VALID_API_ROUTES = new Set(["api_outlook", "health", "not_found"])

const VALID_API_REQUEST_RESULTS = new Set([
  "answered",
  "clarify",
  "error",
  "guard_reject",
  "invalid_body",
  "unknown"
])
const VALID_LLM_TOTALS_COMPLETENESS = new Set(["complete", "missing", "partial", "unknown"])

const VALID_LLM_CLIENTS = new Set(["normalizer", "outlook", "unknown"])
const VALID_LLM_STATUSES = new Set(["error", "ok", "unknown"])
const VALID_LLM_ERROR_TYPES = new Set([
  "",
  "http_error",
  "invalid_json",
  "invalid_response",
  "invalid_schema",
  "timeout",
  "unknown"
])
const VALID_LLM_USAGE_SOURCES = new Set(["missing", "provider", "unknown"])
const VALID_LLM_COST_SOURCES = new Set(["missing", "provider", "unknown"])

const FORBIDDEN_TEXT_KEYS = new Set([
  "answer",
  "canonicalProfession",
  "clarification",
  "completion",
  "hints",
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
  const telemetryLocale = sanitizeLocale(locale)
  const telemetrySchemaVersion = sanitizeSchemaVersion(schemaVersion)
  const telemetryMethod = sanitizeMethod(method)
  const telemetryResult = sanitizeApiRequestResult(result)
  const telemetryLlmTotalsCompleteness = sanitizeApiRequestLlmTotalsCompleteness(llmTotalsCompleteness)

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
      telemetryMethod,
      telemetrySchemaVersion,
      telemetryLocale,
      telemetryResult,
      telemetryLlmTotalsCompleteness
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

  const telemetryLocale = sanitizeLocale(locale)
  const telemetrySchemaVersion = sanitizeSchemaVersion(schemaVersion)
  const telemetryClient = sanitizeLlmCallClient(client)
  const telemetryModel = requireString(model, "model")
  const telemetryStatus = sanitizeLlmCallStatus(status)
  const telemetryErrorType = sanitizeOptionalLlmCallErrorType(errorType)
  const telemetryUsageSource = sanitizeLlmCallUsageSource(usageSource)
  const telemetryCostSource = sanitizeLlmCallCostSource(costSource)

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
      telemetryClient,
      telemetryModel,
      requireOptionalString(promptVersion),
      telemetrySchemaVersion,
      telemetryLocale,
      telemetryStatus,
      telemetryErrorType,
      telemetryUsageSource,
      telemetryCostSource
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

function sanitizeLocale(value) {
  if (typeof value !== "string") {
    return "unknown"
  }

  const trimmed = value.trim()

  if (trimmed === "" || trimmed.length > 16) {
    return "unknown"
  }

  if (!/^[A-Za-z0-9-]+$/.test(trimmed)) {
    return "unknown"
  }

  return trimmed
}

function sanitizeSchemaVersion(value) {
  if (typeof value !== "string") {
    return "unknown"
  }

  const trimmed = value.trim()

  if (trimmed === "" || trimmed.length > 8) {
    return "unknown"
  }

  if (!/^[0-9]+$/.test(trimmed)) {
    return "unknown"
  }

  return trimmed
}

function sanitizeMethod(value) {
  if (typeof value !== "string") {
    return "UNKNOWN"
  }

  const trimmed = value.trim()

  if (trimmed === "" || trimmed.length > 16) {
    return "UNKNOWN"
  }

  if (!/^[A-Z]+$/.test(trimmed)) {
    return "UNKNOWN"
  }

  return trimmed
}

function sanitizeApiRequestResult(value) {
  return sanitizeIndexEnum(value, VALID_API_REQUEST_RESULTS, "unknown")
}

function sanitizeApiRequestLlmTotalsCompleteness(value) {
  return sanitizeIndexEnum(value, VALID_LLM_TOTALS_COMPLETENESS, "unknown")
}

function sanitizeLlmCallClient(value) {
  return sanitizeIndexEnum(value, VALID_LLM_CLIENTS, "unknown")
}

function sanitizeLlmCallStatus(value) {
  return sanitizeIndexEnum(value, VALID_LLM_STATUSES, "unknown")
}

function sanitizeOptionalLlmCallErrorType(value) {
  if (value === undefined || value === null) {
    return ""
  }

  return sanitizeIndexEnum(value, VALID_LLM_ERROR_TYPES, "unknown")
}

function sanitizeLlmCallUsageSource(value) {
  return sanitizeIndexEnum(value, VALID_LLM_USAGE_SOURCES, "unknown")
}

function sanitizeLlmCallCostSource(value) {
  return sanitizeIndexEnum(value, VALID_LLM_COST_SOURCES, "unknown")
}

function sanitizeIndexEnum(value, allowed, fallback) {
  if (typeof value !== "string") {
    return fallback
  }

  const trimmed = value.trim()

  return allowed.has(trimmed) ? trimmed : fallback
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
