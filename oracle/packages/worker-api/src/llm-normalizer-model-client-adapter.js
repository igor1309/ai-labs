import { systemPrompts } from "./generated/localized-resources.generated.js"

export function createLlmNormalizerModelClient({
  apiKey,
  baseUrl = "https://nomos.enoa.ai",
  httpClient = fetch,
  llmCallAccumulator,
  model,
  requestId,
  schemaVersion,
  telemetry,
  timeoutMs
} = {}) {
  if (apiKey === undefined || apiKey === null) {
    throw new Error("Missing required dependency: apiKey")
  }
  if (!isNonEmptyString(apiKey)) {
    throw new Error("Invalid dependency: apiKey")
  }
  if (typeof httpClient !== "function") {
    throw new Error("Invalid dependency: httpClient")
  }
  if (model === undefined || model === null) {
    throw new Error("Missing required dependency: model")
  }
  if (!isNonEmptyString(model)) {
    throw new Error("Invalid dependency: model")
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Invalid dependency: timeoutMs")
  }

  return {
    async normalize(input) {
      const startTimeMs = Date.now()
      const locale = typeof input?.locale === "string" ? input.locale : ""
      const telemetrySchemaVersion = typeof schemaVersion === "string" ? schemaVersion : ""
      let httpStatus = 0
      let errorType = ""
      let status = "error"
      let usageSource = "missing"
      let costSource = "missing"
      let promptTokens = 0
      let completionTokens = 0
      let totalTokens = 0
      let costMicrosUsd = 0

      const { cancelTimeout, signal } = createTimeoutSignal(timeoutMs)

      try {
        const response = await httpClient(`${baseUrl}/v1/chat/completions`, {
          body: JSON.stringify({
            messages: [
              {
                content: resolveSystemPrompt(locale),
                role: "system"
              },
              {
                content: JSON.stringify({
                  locale: input.locale,
                  profession: input.profession
                }),
                role: "user"
              }
            ],
            model,
            response_format: {
              type: "json_object"
            }
          }),
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json"
          },
          method: "POST",
          signal,
          timeoutMs
        })
        const payload = await readJsonResponse(response)
        httpStatus = toHttpStatus(response?.status)

        ;({
          completionTokens,
          promptTokens,
          totalTokens,
          usageSource
        } = extractUsage(payload))
        ;({
          costMicrosUsd,
          costSource
        } = extractCostMicrosUsd(payload))

        if (response?.ok === false) {
          errorType = "http_error"
          throw new Error(formatLlmHttpError(response?.status, payload))
        }

        const parsed = parseModelResponse(payload)
        validateResult(parsed)

        status = "ok"
        return parsed
      } catch (error) {
        if (signal?.aborted) {
          errorType = "timeout"
          throw new Error("LLM request timed out")
        }

        if (errorType === "") {
          errorType = classifyLlmErrorType(error)
        }

        throw error
      } finally {
        cancelTimeout()

        emitLlmCallTelemetry({
          client: "normalizer",
          completionTokens,
          costMicrosUsd,
          costSource,
          durationMs: Date.now() - startTimeMs,
          errorType: status === "ok" ? "" : errorType,
          httpStatus,
          locale,
          model,
          promptTokens,
          promptVersion: undefined,
          requestId,
          schemaVersion: telemetrySchemaVersion,
          status,
          telemetry,
          totalTokens,
          usageSource
        })

        recordAccumulatorCall({
          costMicrosUsd,
          costSource,
          llmCallAccumulator,
          totalTokens,
          usageSource
        })
      }
    }
  }
}

function resolveSystemPrompt(locale) {
  return locale === "ru" ? systemPrompts.normalizer.ru : systemPrompts.normalizer.en
}

function createTimeoutSignal(timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      cancelTimeout() {},
      signal: undefined
    }
  }

  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)

  return {
    cancelTimeout() {
      clearTimeout(timeoutId)
    },
    signal: timeoutController.signal
  }
}

function parseModelResponse(payload) {
  const content = payload?.choices?.[0]?.message?.content

  if (typeof content !== "string") {
    throw new Error("Invalid LLM response")
  }

  try {
    return JSON.parse(content)
  } catch {
    throw new Error("Invalid JSON response from LLM")
  }
}

async function readJsonResponse(response) {
  if (typeof response?.json !== "function") {
    throw new Error("Invalid LLM response")
  }

  try {
    return await response.json()
  } catch {
    throw new Error("Invalid LLM response")
  }
}

function formatLlmHttpError(status, payload) {
  const details = typeof payload?.error?.message === "string" ? `: ${payload.error.message}` : ""
  const statusText = Number.isFinite(status) ? `${status}` : "unknown status"

  return `LLM request failed (${statusText})${details}`
}

function validateResult(value) {
  if (typeof value?.needsClarification !== "boolean") {
    throw new Error("Invalid normalizer result: needsClarification")
  }

  if (value?.needsClarification === true) {
    if (
      typeof value?.clarification?.message !== "string" ||
      !Array.isArray(value?.clarification?.suggestions) ||
      !value.clarification.suggestions.every((suggestion) => typeof suggestion === "string")
    ) {
      throw new Error("Invalid normalizer clarification result")
    }

    return
  }

  if (typeof value?.canonicalProfession !== "string") {
    throw new Error("Invalid normalizer canonical result")
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== ""
}

function toHttpStatus(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function extractUsage(payload) {
  const usage = payload?.usage

  if (usage === undefined || usage === null) {
    return {
      completionTokens: 0,
      promptTokens: 0,
      totalTokens: 0,
      usageSource: "missing"
    }
  }

  const promptTokens = toNonNegativeInteger(usage?.prompt_tokens)
  const completionTokens = toNonNegativeInteger(usage?.completion_tokens)
  const totalTokens = toNonNegativeInteger(usage?.total_tokens)

  if (promptTokens === null || completionTokens === null || totalTokens === null) {
    return {
      completionTokens: 0,
      promptTokens: 0,
      totalTokens: 0,
      usageSource: "missing"
    }
  }

  return {
    completionTokens,
    promptTokens,
    totalTokens,
    usageSource: "provider"
  }
}

function extractCostMicrosUsd(payload) {
  const usage = payload?.usage

  const candidateFields = [
    usage !== undefined && usage !== null && Object.prototype.hasOwnProperty.call(usage, "cost") ? usage.cost : undefined,
    usage !== undefined && usage !== null && Object.prototype.hasOwnProperty.call(usage, "total_cost") ? usage.total_cost : undefined,
    usage !== undefined && usage !== null && Object.prototype.hasOwnProperty.call(usage, "cost_usd") ? usage.cost_usd : undefined,
    Object.prototype.hasOwnProperty.call(payload ?? {}, "cost") ? payload.cost : undefined
  ]

  for (const fieldValue of candidateFields) {
    const costUsd = toNumber(fieldValue)

    if (costUsd === null) {
      continue
    }

    return {
      costMicrosUsd: Math.round(costUsd * 1_000_000),
      costSource: "provider"
    }
  }

  return {
    costMicrosUsd: 0,
    costSource: "missing"
  }
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function toNonNegativeInteger(value) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }

  return Math.floor(parsed)
}

function classifyLlmErrorType(error) {
  const message = typeof error?.message === "string" ? error.message : ""

  if (message.includes("LLM request failed")) {
    return "http_error"
  }

  if (message === "Invalid JSON response from LLM") {
    return "invalid_json"
  }

  if (message.startsWith("Invalid normalizer ")) {
    return "invalid_schema"
  }

  if (message === "Invalid LLM response") {
    return "invalid_response"
  }

  return "http_error"
}

function emitLlmCallTelemetry({
  client,
  completionTokens,
  costMicrosUsd,
  costSource,
  durationMs,
  errorType,
  httpStatus,
  locale,
  model,
  promptTokens,
  promptVersion,
  requestId,
  schemaVersion,
  status,
  telemetry,
  totalTokens,
  usageSource
}) {
  if (telemetry === undefined || telemetry === null || typeof telemetry.emitLlmCall !== "function") {
    return
  }

  try {
    telemetry.emitLlmCall({
      client,
      completionTokens,
      costMicrosUsd,
      costSource,
      durationMs,
      errorType,
      httpStatus,
      locale,
      model,
      promptTokens,
      promptVersion,
      requestId,
      schemaVersion,
      status,
      totalTokens,
      usageSource
    })
  } catch {}
}

function recordAccumulatorCall({ costMicrosUsd, costSource, llmCallAccumulator, totalTokens, usageSource }) {
  if (llmCallAccumulator === undefined || llmCallAccumulator === null || typeof llmCallAccumulator.recordCall !== "function") {
    return
  }

  try {
    llmCallAccumulator.recordCall({
      costMicrosUsd,
      costSource,
      totalTokens,
      usageSource
    })
  } catch {}
}
