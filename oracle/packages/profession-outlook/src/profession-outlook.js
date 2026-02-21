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
  return {
    async getOutlook(input) {
      const key = `outlook:${input.canonicalProfession}:${input.locale}:${input.schemaVersion}:${promptVersion}`
      const cachedAnswer = await cache.read(key)

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

      const modelAnswer = await modelClient.generate(modelInput)

      await cache.write(key, modelAnswer)

      return modelAnswer
    }
  }
}
