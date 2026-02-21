const SYSTEM_PROMPT = "Return only JSON matching the OutlookAnswer schema. Do not add extra keys or text outside JSON."

export function createOpenRouterOutlookModelClient({ apiKey, baseUrl = "https://openrouter.ai", httpClient = fetch, model, timeoutMs } = {}) {
  return {
    async generate(input) {
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
        timeoutMs
      })
      const payload = await response.json()
      const parsed = parseModelResponse(payload)
      validateOutlookAnswer(parsed)
      return parsed
    }
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
