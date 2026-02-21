const SYSTEM_PROMPT = "Return only JSON matching the NormalizerResult schema. Do not add extra keys or text outside JSON. If input is not a profession or is too vague, return needsClarification=true with clarification.message and clarification.suggestions."

export function createOpenRouterNormalizerModelClient({ apiKey, baseUrl = "https://openrouter.ai", httpClient = fetch, model, timeoutMs } = {}) {
  return {
    async normalize(input) {
      const response = await httpClient(`${baseUrl}/api/v1/chat/completions`, {
        body: JSON.stringify({
          messages: [
            {
              content: SYSTEM_PROMPT,
              role: "system"
            },
            {
              content: JSON.stringify({
                locale: input.locale,
                profession: input.profession
              }),
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
      validateResult(parsed)
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

function validateResult(value) {
  if (value?.needsClarification === true) {
    if (typeof value?.clarification?.message !== "string" || !Array.isArray(value?.clarification?.suggestions)) {
      throw new Error("Invalid normalizer clarification result")
    }

    return
  }

  if (typeof value?.canonicalProfession !== "string") {
    throw new Error("Invalid normalizer canonical result")
  }
}
