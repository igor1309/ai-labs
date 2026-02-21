const SYSTEM_PROMPT = "Return only a JSON object with exactly these keys: headline (string), timeHorizon (object with label string and explanation string), confidence (object with label one of low|medium|high and rationale string), keyRisks (array of strings), whatToDoNext (array of strings), assumptions (array of strings). Do not include non-JSON text. Do not include extra keys. Keep these section names stable for caching and UI rendering."

export function createOpenRouterOutlookModelClient({ apiKey, baseUrl = "https://openrouter.ai", httpClient = fetch, model, timeoutMs } = {}) {
  if (apiKey === undefined || apiKey === null) {
    throw new Error("Missing required dependency: apiKey")
  }
  if (typeof httpClient !== "function") {
    throw new Error("Invalid dependency: httpClient")
  }
  if (model === undefined || model === null) {
    throw new Error("Missing required dependency: model")
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Invalid dependency: timeoutMs")
  }

  return {
    async generate(input) {
      const { cancelTimeout, signal } = createTimeoutSignal(timeoutMs)

      try {
        const response = await httpClient(`${baseUrl}/api/v1/chat/completions`, {
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
          signal,
          timeoutMs
        })
        const payload = await response.json()
        const parsed = parseModelResponse(payload)
        validateOutlookAnswer(parsed)

        return parsed
      } catch (error) {
        if (signal?.aborted) {
          throw new Error("OpenRouter request timed out")
        }

        throw error
      } finally {
        cancelTimeout()
      }
    }
  }
}

function createTimeoutSignal(timeoutMs) {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)

  return {
    cancelTimeout() {
      clearTimeout(timeoutId)
    },
    signal: timeoutController.signal
  }
}

function parseModelResponse(payload) {
  const content = payload?.choices?.[0]?.message?.content

  if (typeof content !== "string") {
    throw new Error("Invalid OpenRouter response")
  }

  try {
    return JSON.parse(content)
  } catch {
    throw new Error("Invalid JSON response from OpenRouter")
  }
}

function validateOutlookAnswer(answer) {
  if (typeof answer?.headline !== "string") {
    throw new Error("Invalid outlook answer: headline")
  }
  if (typeof answer?.timeHorizon?.label !== "string" || typeof answer?.timeHorizon?.explanation !== "string") {
    throw new Error("Invalid outlook answer: timeHorizon")
  }
  if (!["low", "medium", "high"].includes(answer?.confidence?.label) || typeof answer?.confidence?.rationale !== "string") {
    throw new Error("Invalid outlook answer: confidence")
  }
  if (!areAllStrings(answer?.keyRisks) || !areAllStrings(answer?.whatToDoNext) || !areAllStrings(answer?.assumptions)) {
    throw new Error("Invalid outlook answer: array fields")
  }
}

function areAllStrings(values) {
  return Array.isArray(values) && values.every((value) => typeof value === "string")
}
