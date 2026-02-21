/**
 * @typedef {"low" | "medium" | "high"} OutlookConfidenceLabel
 */

/**
 * @typedef {{
 *   headline: string,
 *   timeHorizon: { label: string, explanation: string },
 *   confidence: { label: OutlookConfidenceLabel, rationale: string },
 *   keyRisks: string[],
 *   whatToDoNext: string[],
 *   assumptions: string[]
 * }} OutlookAnswer
 */

/**
 * @typedef {{
 *   category?: string,
 *   categoryConfidence?: number
 * }} OutlookHints
 */

/**
 * @typedef {{
 *   canonicalProfession: string,
 *   locale: string,
 *   schemaVersion: string,
 *   hints?: OutlookHints
 * }} OutlookInput
 */

/**
 * @typedef {{
 *   read: (key: string) => Promise<OutlookAnswer | null | undefined>,
 *   write: (key: string, value: OutlookAnswer) => Promise<void>
 * }} OutlookCache
 */

/**
 * @typedef {{
 *   generate: (input: OutlookInput & { promptVersion: string }) => Promise<OutlookAnswer>
 * }} OutlookModelClient
 */

/**
 * @param {{
 *   cache: OutlookCache,
 *   modelClient: OutlookModelClient,
 *   promptVersion: string
 * }} dependencies
 */
export function createProfessionOutlookService({ cache, modelClient, promptVersion } = {}) {
  const validatedCache = requireDependency(cache, "cache")
  const validatedModelClient = requireDependency(modelClient, "modelClient")
  requireMethodDependency(validatedCache, "cache", "read")
  requireMethodDependency(validatedCache, "cache", "write")
  requireMethodDependency(validatedModelClient, "modelClient", "generate")
  requireNonEmptyString(promptVersion, "promptVersion")

  return {
    async getOutlook(input) {
      const key = `outlook:${input.canonicalProfession}:${input.locale}:${input.schemaVersion}:${promptVersion}`
      const cachedAnswer = await validatedCache.read(key)

      if (cachedAnswer !== null && cachedAnswer !== undefined) {
        return cachedAnswer
      }

      const modelInput = {
        canonicalProfession: input.canonicalProfession,
        locale: input.locale,
        promptVersion,
        schemaVersion: input.schemaVersion
      }

      if (input.hints !== undefined) {
        modelInput.hints = input.hints
      }

      const modelAnswer = await validatedModelClient.generate(modelInput)

      await validatedCache.write(key, modelAnswer)

      return modelAnswer
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

function requireNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid dependency: ${name}`)
  }
}
