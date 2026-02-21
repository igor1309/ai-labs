/**
 * @typedef {{ locale: string, profession: string }} NormalizerInput
 */

/**
 * @typedef {{ needsClarification: true, clarification: { message: string, suggestions: string[] } }} ClarificationResult
 */

/**
 * @typedef {{ needsClarification: false, canonicalProfession: string, category?: string, categoryConfidence?: number }} CanonicalResult
 */

/**
 * @typedef {ClarificationResult | CanonicalResult} NormalizerResult
 */

/**
 * @typedef {{ read(key: string): Promise<NormalizerResult | null | undefined>, write(key: string, value: NormalizerResult): Promise<void> }} NormalizerCache
 */

/**
 * @typedef {{ normalize(input: NormalizerInput): Promise<NormalizerResult> }} NormalizerModelClient
 */

/**
 * @typedef {{ normalize(input: NormalizerInput): Promise<NormalizerResult> }} ProfessionNormalizer
 */

let configuredProfessionNormalizer = null

/** @type {ProfessionNormalizer} */
export const professionNormalizer = {
  async normalize(input) {
    if (configuredProfessionNormalizer === null) {
      throw new Error("professionNormalizer is not configured")
    }

    return configuredProfessionNormalizer.normalize(input)
  }
}

/**
 * @param {{ cache: NormalizerCache, modelClient: NormalizerModelClient }} dependencies
 */
export function configureProfessionNormalizer(dependencies = {}) {
  configuredProfessionNormalizer = createProfessionNormalizer(dependencies)
}

/**
 * @param {{ cache: NormalizerCache, modelClient: NormalizerModelClient }} dependencies
 * @returns {ProfessionNormalizer}
 */
export function createProfessionNormalizer({ cache, modelClient } = {}) {
  const validatedCache = requireDependency(cache, "cache")
  const validatedModelClient = requireDependency(modelClient, "modelClient")
  requireMethodDependency(validatedCache, "cache", "read")
  requireMethodDependency(validatedCache, "cache", "write")
  requireMethodDependency(validatedModelClient, "modelClient", "normalize")

  return {
    async normalize(input) {
      const normalizedProfession = normalizeProfession(input.profession)
      const cacheKey = createCacheKey(input.locale, normalizedProfession)
      const cachedResult = await validatedCache.read(cacheKey)

      if (cachedResult !== null && cachedResult !== undefined) {
        return cachedResult
      }

      const modelResult = await validatedModelClient.normalize({
        locale: input.locale,
        profession: normalizedProfession
      })

      await validatedCache.write(cacheKey, modelResult)

      return modelResult
    }
  }
}

function requireDependency(value, name) {
  if (value === undefined || value === null) {
    throw new Error(`Missing required dependency: ${name}`)
  }

  return value
}

function requireMethodDependency(value, name, methodName) {
  if (typeof value[methodName] !== "function") {
    throw new Error(`Invalid dependency: ${name}.${methodName}`)
  }
}

function createCacheKey(locale, profession) {
  return `normalizer:${locale}:${profession}`
}

export function normalizeProfession(profession) {
  return profession.trim().replace(/\s+/g, " ")
}
