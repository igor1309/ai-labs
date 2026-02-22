import { createProfessionNormalizer } from "../../../packages/profession-normalizer/src/profession-normalizer.js"
import { createProfessionOutlookService } from "../../../packages/profession-outlook/src/profession-outlook.js"
import { createAnalyticsEngineTelemetry, createNoopAnalyticsEngineTelemetry } from "../../../packages/worker-api/src/analytics-engine-telemetry.js"
import { createCloudflareKvJsonCacheAdapter } from "../../../packages/worker-api/src/cloudflare-kv-json-cache-adapter.js"
import { createOpenRouterNormalizerModelClient } from "../../../packages/worker-api/src/openrouter-normalizer-model-client-adapter.js"
import { createOpenRouterOutlookModelClient } from "../../../packages/worker-api/src/openrouter-outlook-model-client-adapter.js"
import { createPopularityCountersStore } from "../../../packages/worker-api/src/popularity-counters-store.js"
import { createPopularityTracker } from "../../../packages/worker-api/src/popularity-tracker.js"
import { createRawInputCountersStore } from "../../../packages/worker-api/src/raw-input-counters-store.js"
import { requestGuard } from "../../../packages/worker-api/src/request-guard.js"
import { createWorkerApiEntrypointRouter, createWorkerFetchHandler } from "../../../packages/worker-api/src/worker-api.js"

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai"
const DEFAULT_OPENROUTER_TIMEOUT_MS = 10000
const DEFAULT_PROMPT_VERSION = "1"
const VALID_ENVIRONMENTS = new Set(["prod", "preview", "dev"])

export function makeWorkerFetch(env, {
  httpClient = fetch,
  requestIdGenerator = defaultRequestIdGenerator,
  waitUntil
} = {}) {
  requireBinding(env, "NORMALIZER_CACHE")
  requireBinding(env, "OUTLOOK_CACHE")
  requireBinding(env, "DB")

  const config = resolveConfig(env)
  const telemetry = resolveTelemetry({
    env,
    environment: config.environment,
    waitUntil
  })
  const normalizerCache = createCloudflareKvJsonCacheAdapter({ kv: env.NORMALIZER_CACHE })
  const outlookCache = createCloudflareKvJsonCacheAdapter({ kv: env.OUTLOOK_CACHE })
  const normalizerModelClient = createConfiguredOpenRouterNormalizerModelClient({
    config,
    httpClient
  })
  const outlookModelClient = createConfiguredOpenRouterOutlookModelClient({
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
    requestIdGenerator,
    telemetry
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

function requireBinding(env, bindingName) {
  if (env?.[bindingName] === undefined || env?.[bindingName] === null) {
    throw new Error(`Missing required binding: ${bindingName}`)
  }
}

function resolveConfig(env) {
  const openRouterBaseUrl = resolveOptionalStringBinding(
    env,
    "OPENROUTER_BASE_URL",
    DEFAULT_OPENROUTER_BASE_URL
  )
  validateAbsoluteUrlBinding(openRouterBaseUrl, "OPENROUTER_BASE_URL")

  return {
    environment: resolveEnvironment(env),
    openRouterApiKey: resolveOpenRouterApiKey(env),
    normalizerModel: resolveRequiredStringBinding(env, "NORMALIZER_MODEL"),
    openRouterBaseUrl,
    outlookModel: resolveRequiredStringBinding(env, "OUTLOOK_MODEL"),
    promptVersion: typeof env.PROMPT_VERSION === "string" && env.PROMPT_VERSION.trim() !== "" ? env.PROMPT_VERSION : DEFAULT_PROMPT_VERSION,
    timeoutMs: parseTimeout(env.OPENROUTER_TIMEOUT_MS)
  }
}

function resolveEnvironment(env) {
  const environment = resolveRequiredStringBinding(env, "ENVIRONMENT")

  if (!VALID_ENVIRONMENTS.has(environment)) {
    throw new Error("Invalid binding: ENVIRONMENT")
  }

  return environment
}

function resolveOpenRouterApiKey(env) {
  requireBinding(env, "OPENROUTER_API_KEY")
  requireNonEmptyStringBinding(env, "OPENROUTER_API_KEY")
  return env.OPENROUTER_API_KEY
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

function resolveTelemetry({ env, environment, waitUntil }) {
  if (environment !== "prod") {
    return createNoopAnalyticsEngineTelemetry()
  }

  requireBinding(env, "TELEMETRY_DATASET")

  return createAnalyticsEngineTelemetry({
    dataset: env.TELEMETRY_DATASET,
    environment,
    waitUntil
  })
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
