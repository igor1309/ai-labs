import { createProfessionNormalizer } from "../../profession-normalizer/src/profession-normalizer.js"
import { createProfessionOutlookService } from "../../profession-outlook/src/profession-outlook.js"
import { createCloudflareKvJsonCacheAdapter } from "./cloudflare-kv-json-cache-adapter.js"
import { createOpenRouterNormalizerModelClient } from "./openrouter-normalizer-model-client-adapter.js"
import { createOpenRouterOutlookModelClient } from "./openrouter-outlook-model-client-adapter.js"
import { createPopularityCountersStore } from "./popularity-counters-store.js"
import { requestGuard } from "./request-guard.js"
import { createWorkerFetchHandler } from "./worker-api.js"

const DEFAULT_NORMALIZER_MODEL = "openai/gpt-4o-mini"
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai"
const DEFAULT_OPENROUTER_TIMEOUT_MS = 10000
const DEFAULT_OUTLOOK_MODEL = "openai/gpt-4o-mini"
const DEFAULT_PROMPT_VERSION = "1"

export function makeWorkerFetch(env, { httpClient = fetch, requestIdGenerator = defaultRequestIdGenerator } = {}) {
  requireBinding(env, "NORMALIZER_CACHE")
  requireBinding(env, "OUTLOOK_CACHE")
  requireBinding(env, "DB")
  requireBinding(env, "OPENROUTER_API_KEY")

  const config = resolveConfig(env)
  const normalizerCache = createCloudflareKvJsonCacheAdapter({ kv: env.NORMALIZER_CACHE })
  const outlookCache = createCloudflareKvJsonCacheAdapter({ kv: env.OUTLOOK_CACHE })
  const normalizerModelClient = createOpenRouterNormalizerModelClient({
    apiKey: env.OPENROUTER_API_KEY,
    baseUrl: config.openRouterBaseUrl,
    httpClient,
    model: config.normalizerModel,
    timeoutMs: config.timeoutMs
  })
  const outlookModelClient = createOpenRouterOutlookModelClient({
    apiKey: env.OPENROUTER_API_KEY,
    baseUrl: config.openRouterBaseUrl,
    httpClient,
    model: config.outlookModel,
    timeoutMs: config.timeoutMs
  })
  const popularityCountersStore = createPopularityCountersStore({ db: env.DB })
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
    popularityCountersStore,
    professionNormalizer,
    professionOutlookService,
    requestGuard,
    requestIdGenerator
  })

  return async function fetch(request) {
    const pathname = new URL(request.url).pathname

    if (pathname === "/health") {
      return new Response("ok", { status: 200 })
    }

    if (pathname === "/api/outlook") {
      return outlookFetch(request)
    }

    return new Response("Not found", { status: 404 })
  }
}

function defaultRequestIdGenerator() {
  if (typeof globalThis?.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }

  return "request-id"
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
  return {
    normalizerModel: env.NORMALIZER_MODEL ?? DEFAULT_NORMALIZER_MODEL,
    openRouterBaseUrl: env.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL,
    outlookModel: env.OUTLOOK_MODEL ?? DEFAULT_OUTLOOK_MODEL,
    promptVersion: typeof env.PROMPT_VERSION === "string" && env.PROMPT_VERSION.trim() !== "" ? env.PROMPT_VERSION : DEFAULT_PROMPT_VERSION,
    timeoutMs: parseTimeout(env.OPENROUTER_TIMEOUT_MS)
  }
}
