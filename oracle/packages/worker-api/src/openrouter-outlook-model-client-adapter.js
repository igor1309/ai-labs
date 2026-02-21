const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const SYSTEM_PROMPT = "Return only a JSON object with exactly these keys: headline (string), timeHorizon (object with label string and explanation string), confidence (object with label one of low|medium|high and rationale string), keyRisks (array of strings), whatToDoNext (array of strings), assumptions (array of strings). Do not include non-JSON text. Do not include extra keys. Keep these section names stable for caching and UI rendering."

export function createOpenRouterOutlookModelClient({ apiKey, httpClient, model, timeoutMs } = {}) {
  return {
    async generate(input) {
      const response = await httpClient(OPENROUTER_URL, {
        body: JSON.stringify({
          messages: [
            {
              content: SYSTEM_PROMPT,
              role: "system"
            },
            {
              content: JSON.stringify(input),
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
        signal: AbortSignal.timeout(timeoutMs)
      })
      const responsePayload = await response.json()
      const parsedAnswer = JSON.parse(responsePayload.choices[0].message.content)

      if (typeof parsedAnswer.headline !== "string") {
        throw new Error("Invalid outlook answer schema")
      }
      if (!["low", "medium", "high"].includes(parsedAnswer.confidence?.label)) {
        throw new Error("Invalid outlook answer schema")
      }
      if (typeof parsedAnswer.confidence?.rationale !== "string") {
        throw new Error("Invalid outlook answer schema")
      }
      if (typeof parsedAnswer.timeHorizon?.label !== "string") {
        throw new Error("Invalid outlook answer schema")
      }
      if (typeof parsedAnswer.timeHorizon?.explanation !== "string") {
        throw new Error("Invalid outlook answer schema")
      }
      if (!isStringArray(parsedAnswer.keyRisks)) {
        throw new Error("Invalid outlook answer schema")
      }
      if (!isStringArray(parsedAnswer.whatToDoNext)) {
        throw new Error("Invalid outlook answer schema")
      }
      if (!isStringArray(parsedAnswer.assumptions)) {
        throw new Error("Invalid outlook answer schema")
      }

      return parsedAnswer
    }
  }
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}
