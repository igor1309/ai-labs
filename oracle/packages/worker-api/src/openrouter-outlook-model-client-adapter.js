const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const SYSTEM_PROMPT = "Return only JSON. Do not include non-JSON text. Do not include extra keys. Use stable section names and include headline, timeHorizon, confidence, keyRisks, whatToDoNext, assumptions."

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
          model
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

      return parsedAnswer
    }
  }
}
