const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

export function createOpenRouterOutlookModelClient({ apiKey, httpClient, model, timeoutMs } = {}) {
  return {
    async generate(input) {
      const response = await httpClient(OPENROUTER_URL, {
        body: JSON.stringify({
          messages: [
            {
              content: "system prompt",
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

      return JSON.parse(responsePayload.choices[0].message.content)
    }
  }
}
