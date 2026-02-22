import { createProfessionNormalizer } from "../../../packages/profession-normalizer/src/profession-normalizer.js"
import { createProfessionOutlookService } from "../../../packages/profession-outlook/src/profession-outlook.js"
import { createCloudflareKvJsonCacheAdapter } from "../../../packages/worker-api/src/cloudflare-kv-json-cache-adapter.js"
import { createOpenRouterNormalizerModelClient } from "../../../packages/worker-api/src/openrouter-normalizer-model-client-adapter.js"
import { createOpenRouterOutlookModelClient } from "../../../packages/worker-api/src/openrouter-outlook-model-client-adapter.js"
import { createPopularityCountersStore } from "../../../packages/worker-api/src/popularity-counters-store.js"
import { createPopularityTracker } from "../../../packages/worker-api/src/popularity-tracker.js"
import { createRawInputCountersStore } from "../../../packages/worker-api/src/raw-input-counters-store.js"
import { requestGuard } from "../../../packages/worker-api/src/request-guard.js"
import { createWorkerApiEntrypointRouter, createWorkerFetchHandler } from "../../../packages/worker-api/src/worker-api.js"

const CLARIFICATION_SUGGESTIONS = ["software engineer", "registered nurse", "electrician"]
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai"
const DEFAULT_OPENROUTER_TIMEOUT_MS = 10000
const DEFAULT_PROMPT_VERSION = "1"
const DEFAULT_STUB_DELAY_MS = 0

export function makeWorkerFetch(env, { httpClient = fetch, requestIdGenerator = defaultRequestIdGenerator } = {}) {
  requireBinding(env, "NORMALIZER_CACHE")
  requireBinding(env, "OUTLOOK_CACHE")
  requireBinding(env, "DB")

  const config = resolveConfig(env)
  const normalizerCache = createCloudflareKvJsonCacheAdapter({ kv: env.NORMALIZER_CACHE })
  const outlookCache = createCloudflareKvJsonCacheAdapter({ kv: env.OUTLOOK_CACHE })
  const normalizerModelClient = config.useStubModel
    ? createStubNormalizerModelClient({ delayMs: config.stubDelayMs })
    : createConfiguredOpenRouterNormalizerModelClient({
        config,
        httpClient
      })
  const outlookModelClient = config.useStubModel
    ? createStubOutlookModelClient({ delayMs: config.stubDelayMs })
    : createConfiguredOpenRouterOutlookModelClient({
        config,
        httpClient
      })
  const popularityCountersStore = createPopularityCountersStore({ db: env.DB })
  const rawInputCountersStore = createRawInputCountersStore({ db: env.DB })
  const popularityTracker = createPopularityTracker({
    popularityCountersStore,
    rawInputCountersStore
  })
  const professionNormalizer = createProfessionNormalizer({
    cache: normalizerCache,
    modelClient: normalizerModelClient
  })
  const professionOutlookService = createProfessionOutlookService({
    cache: outlookCache,
    modelClient: outlookModelClient,
    promptVersion: config.promptVersion
  })
  const outlookFetch = createWorkerFetchHandler({
    popularityTracker,
    professionNormalizer,
    professionOutlookService,
    requestGuard,
    requestIdGenerator
  })

  return createWorkerApiEntrypointRouter({
    outlookHandler: outlookFetch
  })
}

function defaultRequestIdGenerator() {
  if (typeof globalThis?.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }

  return `request-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseTimeout(value) {
  const parsed = Number.parseInt(value ?? "", 10)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_OPENROUTER_TIMEOUT_MS
}

function parseStubDelayMs(value) {
  const parsed = Number.parseInt(value ?? "", 10)

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_STUB_DELAY_MS
}

function requireBinding(env, bindingName) {
  if (env?.[bindingName] === undefined || env?.[bindingName] === null) {
    throw new Error(`Missing required binding: ${bindingName}`)
  }
}

function resolveConfig(env) {
  const useStubModel = resolveUseStubModel(env)
  const openRouterBaseUrl = resolveOptionalStringBinding(
    env,
    "OPENROUTER_BASE_URL",
    DEFAULT_OPENROUTER_BASE_URL
  )
  validateAbsoluteUrlBinding(openRouterBaseUrl, "OPENROUTER_BASE_URL")

  return {
    openRouterApiKey: resolveOpenRouterApiKey({
      env,
      useStubModel
    }),
    normalizerModel: resolveRequiredStringBinding(env, "NORMALIZER_MODEL"),
    openRouterBaseUrl,
    outlookModel: resolveRequiredStringBinding(env, "OUTLOOK_MODEL"),
    promptVersion: typeof env.PROMPT_VERSION === "string" && env.PROMPT_VERSION.trim() !== "" ? env.PROMPT_VERSION : DEFAULT_PROMPT_VERSION,
    stubDelayMs: parseStubDelayMs(env.MODEL_STUB_DELAY_MS),
    useStubModel,
    timeoutMs: parseTimeout(env.OPENROUTER_TIMEOUT_MS)
  }
}

function resolveOpenRouterApiKey({ env, useStubModel }) {
  if (useStubModel) {
    return null
  }

  requireBinding(env, "OPENROUTER_API_KEY")
  requireNonEmptyStringBinding(env, "OPENROUTER_API_KEY")
  return env.OPENROUTER_API_KEY
}

function resolveUseStubModel(env) {
  return typeof env?.MODEL_PROVIDER_MODE === "string" && env.MODEL_PROVIDER_MODE.trim().toLowerCase() === "stub"
}

function requireNonEmptyStringBinding(env, bindingName) {
  if (typeof env?.[bindingName] !== "string" || env[bindingName].trim() === "") {
    throw new Error(`Invalid binding: ${bindingName}`)
  }
}

function resolveRequiredStringBinding(env, bindingName) {
  requireBinding(env, bindingName)
  requireNonEmptyStringBinding(env, bindingName)
  return env[bindingName].trim()
}

function resolveOptionalStringBinding(env, bindingName, defaultValue) {
  const bindingValue = env?.[bindingName]

  if (bindingValue === undefined || bindingValue === null) {
    return defaultValue
  }

  if (typeof bindingValue !== "string") {
    throw new Error(`Invalid binding: ${bindingName}`)
  }

  const trimmedBindingValue = bindingValue.trim()

  return trimmedBindingValue === "" ? defaultValue : trimmedBindingValue
}

function validateAbsoluteUrlBinding(value, bindingName) {
  try {
    const parsedUrl = new URL(value)

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error()
    }
  } catch {
    throw new Error(`Invalid binding: ${bindingName}`)
  }
}

function createConfiguredOpenRouterNormalizerModelClient({ config, httpClient }) {
  return createOpenRouterNormalizerModelClient({
    apiKey: config.openRouterApiKey,
    baseUrl: config.openRouterBaseUrl,
    httpClient,
    model: config.normalizerModel,
    timeoutMs: config.timeoutMs
  })
}

function createConfiguredOpenRouterOutlookModelClient({ config, httpClient }) {
  return createOpenRouterOutlookModelClient({
    apiKey: config.openRouterApiKey,
    baseUrl: config.openRouterBaseUrl,
    httpClient,
    model: config.outlookModel,
    timeoutMs: config.timeoutMs
  })
}

function createStubNormalizerModelClient({ delayMs }) {
  return {
    async normalize({ profession }) {
      if (delayMs > 0) {
        await wait(delayMs)
      }

      const normalizedProfession = profession.trim().replace(/\s+/g, " ").toLowerCase()

      if (isAmbiguousProfession(normalizedProfession)) {
        return {
          clarification: {
            message: "Please clarify the profession so I can provide a useful outlook.",
            suggestions: CLARIFICATION_SUGGESTIONS
          },
          needsClarification: true
        }
      }

      return {
        canonicalProfession: resolveCanonicalProfession(normalizedProfession),
        category: "knowledge-work",
        categoryConfidence: 0.9,
        needsClarification: false
      }
    }
  }
}

function createStubOutlookModelClient({ delayMs }) {
  return {
    async generate({ canonicalProfession }) {
      if (delayMs > 0) {
        await wait(delayMs)
      }

      return {
        assumptions: ["AI adoption continues at the current pace."],
        confidence: {
          label: "medium",
          rationale: "Deterministic stub output for web E2E coverage."
        },
        headline: `${titleCase(canonicalProfession)} remains viable with evolving workflows.`,
        keyRisks: ["Routine tasks are increasingly automated."],
        timeHorizon: {
          explanation: "Automation pressure is rising, but role reinvention is ongoing.",
          label: "2-4 years"
        },
        whatToDoNext: ["Deepen domain expertise.", "Build AI-augmented delivery habits."]
      }
    }
  }
}

function isAmbiguousProfession(normalizedProfession) {
  return ["help", "idk", "not sure", "unknown"].includes(normalizedProfession)
}

function resolveCanonicalProfession(normalizedProfession) {
  if (normalizedProfession === "software developer") {
    return "software engineer"
  }

  return normalizedProfession
}

function titleCase(value) {
  return value
    .split(" ")
    .filter((part) => part !== "")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}

function wait(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}
