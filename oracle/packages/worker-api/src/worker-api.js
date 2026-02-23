import { resolveEffectiveLocale } from "./effective-locale.js"
import { backendMessages } from "./generated/localized-resources.generated.js"

export function createWorkerApiEntrypointRouter({ outlookHandler } = {}) {
  const routeOutlookHandler = requireFunctionDependency(
    outlookHandler,
    "outlookHandler"
  )

  return async function fetch(request) {
    const url = new URL(request.url)

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200 })
    }

    if (request.method === "POST" && url.pathname === "/api/outlook") {
      return routeOutlookHandler(request)
    }

    return new Response("Not found", { status: 404 })
  }
}

export function createWorkerFetchHandler(dependencies = {}) {
  const popularityTracker = requireMethodDependency(
    dependencies.popularityTracker,
    "popularityTracker",
    "track"
  )
  const makeProfessionNormalizer = requireFunctionDependency(
    dependencies.makeProfessionNormalizer,
    "makeProfessionNormalizer"
  )
  const makeProfessionOutlookService = requireFunctionDependency(
    dependencies.makeProfessionOutlookService,
    "makeProfessionOutlookService"
  )
  const requestGuard = requireMethodDependency(
    dependencies.requestGuard,
    "requestGuard",
    "validate"
  )
  const requestIdGenerator = requireFunctionDependency(
    dependencies.requestIdGenerator,
    "requestIdGenerator"
  )
  const telemetry = requireMethodDependency(
    dependencies.telemetry,
    "telemetry",
    "emitApiRequest"
  )
  requireMethodDependency(telemetry, "telemetry", "emitLlmCall")
  const onPopularityTrackerError = resolveOptionalFunctionDependency(
    dependencies.onPopularityTrackerError,
    "onPopularityTrackerError"
  )

  return async function fetch(request) {
    const requestId = requestIdGenerator()
    const startTimeMs = Date.now()
    const llmCallAccumulator = createLlmCallAccumulator()

    let requestBody
    let result = "error"
    let response
    let schemaVersion = "1"
    let locale = ""
    let rawRequestBody = ""

    try {
      try {
        rawRequestBody = await request.text()
        requestBody = JSON.parse(rawRequestBody)
      } catch {
        result = "invalid_body"
        schemaVersion = resolveSchemaVersionFromInvalidJson(rawRequestBody)
        const rawLocale = resolveLocaleFromInvalidJson(rawRequestBody)
        const effectiveLocale = schemaVersion === "2"
          ? resolveEffectiveLocale({ rawLocale, schemaVersion })
          : rawLocale
        const messageLocale = schemaVersion === "2" ? effectiveLocale : "en"
        const messages = backendMessages[messageLocale] ?? backendMessages.en
        locale = schemaVersion === "2" ? effectiveLocale : rawLocale

        response = Response.json({
          answer: null,
          canonicalProfession: null,
          category: null,
          categoryConfidence: null,
          clarification: {
            message: messages.invalid_request_body,
            suggestions: []
          },
          ...(schemaVersion === "2" ? {
            effectiveLocale
          } : {}),
          needsClarification: true,
          requestId,
          schemaVersion
        })

        return response
      }

      const guardResult = await requestGuard.validate(requestBody)

      if (!guardResult.isValid) {
        result = "guard_reject"
        schemaVersion = guardResult.schemaVersion
        const rawLocale = typeof requestBody?.locale === "string" ? requestBody.locale : ""
        const effectiveLocale = schemaVersion === "2"
          ? resolveEffectiveLocale({ rawLocale, schemaVersion })
          : rawLocale
        locale = schemaVersion === "2" ? effectiveLocale : rawLocale

        response = Response.json({
          answer: null,
          canonicalProfession: null,
          category: null,
          categoryConfidence: null,
          clarification: guardResult.clarification,
          ...(schemaVersion === "2" ? {
            effectiveLocale
          } : {}),
          needsClarification: true,
          requestId,
          schemaVersion: guardResult.schemaVersion
        })

        return response
      }

      schemaVersion = guardResult.value.schemaVersion
      locale = guardResult.value.effectiveLocale

      const requestContext = {
        llmCallAccumulator,
        locale,
        requestId,
        schemaVersion
      }

      const professionNormalizer = requireMethodDependency(
        makeProfessionNormalizer(requestContext),
        "professionNormalizer",
        "normalize"
      )
      const professionOutlookService = requireMethodDependency(
        makeProfessionOutlookService(requestContext),
        "professionOutlookService",
        "getOutlook"
      )

      const normalizerResult = await professionNormalizer.normalize({
        locale: guardResult.value.effectiveLocale,
        profession: guardResult.value.profession
      })

      try {
        await popularityTracker.track({
          normalizerResult,
          rawProfession: guardResult.value.profession
        })
      } catch (error) {
        if (!isCounterWriteFailure(error)) {
          throw error
        }

        // Counter writes are best-effort and must not block API responses.
        reportPopularityTrackerError({
          error,
          onPopularityTrackerError
        })
      }

      if (normalizerResult.needsClarification) {
        result = "clarify"

        response = Response.json({
          answer: null,
          canonicalProfession: null,
          category: null,
          categoryConfidence: null,
          clarification: normalizerResult.clarification,
          ...(guardResult.value.schemaVersion === "2" ? {
            effectiveLocale: guardResult.value.effectiveLocale
          } : {}),
          needsClarification: true,
          requestId,
          schemaVersion: guardResult.value.schemaVersion
        })

        return response
      }

      const answer = await professionOutlookService.getOutlook({
        canonicalProfession: normalizerResult.canonicalProfession,
        hints: {
          category: normalizerResult.category,
          categoryConfidence: normalizerResult.categoryConfidence
        },
        locale: guardResult.value.effectiveLocale,
        schemaVersion: guardResult.value.schemaVersion
      })

      result = "answered"

      response = Response.json({
        answer,
        canonicalProfession: normalizerResult.canonicalProfession,
        category: normalizerResult.category ?? null,
        categoryConfidence: normalizerResult.categoryConfidence ?? null,
        clarification: null,
        ...(guardResult.value.schemaVersion === "2" ? {
          effectiveLocale: guardResult.value.effectiveLocale
        } : {}),
        needsClarification: false,
        requestId,
        schemaVersion: guardResult.value.schemaVersion
      })

      return response
    } catch (error) {
      result = "error"
      throw error
    } finally {
      try {
        const llmTotals = llmCallAccumulator.toApiRequestTotals()

        telemetry.emitApiRequest({
          durationMs: Date.now() - startTimeMs,
          llmCalls: llmTotals.llmCalls,
          llmCostMicrosUsd: llmTotals.llmCostMicrosUsd,
          llmTotalTokens: llmTotals.llmTotalTokens,
          llmTotalsCompleteness: llmTotals.llmTotalsCompleteness,
          locale: typeof locale === "string" ? locale : "",
          method: request.method,
          requestId,
          result,
          route: "api_outlook",
          schemaVersion,
          statusCode: response?.status ?? 500
        })
      } catch {}
    }
  }
}

function reportPopularityTrackerError({ error, onPopularityTrackerError }) {
  if (onPopularityTrackerError === null) {
    return
  }

  try {
    const maybePromise = onPopularityTrackerError(error)

    if (typeof maybePromise?.catch === "function") {
      maybePromise.catch(() => {})
    }
  } catch {}
}

function isCounterWriteFailure(error) {
  return error?.counterWriteFailed === true
}

function requireDependency(value, name) {
  if (value === undefined || value === null) {
    throw new Error(`Missing required dependency: ${name}`)
  }

  return value
}

function requireFunctionDependency(value, name) {
  const dependency = requireDependency(value, name)

  if (typeof dependency !== "function") {
    throw new Error(`Invalid dependency: ${name}`)
  }

  return dependency
}

function resolveOptionalFunctionDependency(value, name) {
  if (value === undefined || value === null) {
    return null
  }

  return requireFunctionDependency(value, name)
}

function createLlmCallAccumulator() {
  const calls = []

  return {
    recordCall(call) {
      calls.push({
        costMicrosUsd: typeof call?.costMicrosUsd === "number" ? call.costMicrosUsd : 0,
        costSource: typeof call?.costSource === "string" ? call.costSource : "missing",
        totalTokens: typeof call?.totalTokens === "number" ? call.totalTokens : 0,
        usageSource: typeof call?.usageSource === "string" ? call.usageSource : "missing"
      })
    },
    toApiRequestTotals() {
      const llmCalls = calls.length

      if (llmCalls === 0) {
        return {
          llmCalls,
          llmCostMicrosUsd: 0,
          llmTotalTokens: 0,
          llmTotalsCompleteness: "missing"
        }
      }

      const llmTotalTokens = calls.reduce((sum, call) => sum + (Number.isFinite(call.totalTokens) ? call.totalTokens : 0), 0)
      const llmCostMicrosUsd = calls.reduce((sum, call) => sum + (Number.isFinite(call.costMicrosUsd) ? call.costMicrosUsd : 0), 0)

      const hasAnyProviderMetadata = calls.some((call) => call.usageSource === "provider" || call.costSource === "provider")
      const isComplete = calls.every((call) => call.usageSource === "provider" && call.costSource === "provider")

      return {
        llmCalls,
        llmCostMicrosUsd,
        llmTotalTokens,
        llmTotalsCompleteness: isComplete ? "complete" : hasAnyProviderMetadata ? "partial" : "missing"
      }
    }
  }
}

function requireMethodDependency(value, name, methodName) {
  const dependency = requireDependency(value, name)

  if (typeof dependency[methodName] !== "function") {
    throw new Error(`Invalid dependency: ${name}.${methodName}`)
  }

  return dependency
}

function resolveSchemaVersionFromInvalidJson(rawRequestBody) {
  const match = getInvalidJsonScanText(rawRequestBody).match(/"schemaVersion"\s*:\s*"([^"]+)"/)
  const schemaVersion = typeof match?.[1] === "string" ? match[1].trim() : ""

  return schemaVersion === "2" ? "2" : "1"
}

function resolveLocaleFromInvalidJson(rawRequestBody) {
  const match = getInvalidJsonScanText(rawRequestBody).match(/"locale"\s*:\s*"([^"]+)"/)

  return typeof match?.[1] === "string" ? match[1] : ""
}

function getInvalidJsonScanText(rawRequestBody) {
  if (typeof rawRequestBody !== "string") {
    return ""
  }

  // Best-effort parsing: scan only a short prefix to avoid false positives and reduce work on large bodies.
  return rawRequestBody.slice(0, 2048)
}
