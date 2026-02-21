const SYSTEM_PROMPT = "Return only JSON with no extra keys and no non-JSON text. Output schema: needsClarification (boolean). If needsClarification=false requires canonicalProfession (string). If needsClarification=true requires clarification.message (string) and clarification.suggestions (string[]). If input is not a profession or is too vague, return needsClarification=true."

export function createOpenRouterNormalizerModelClient({ apiKey, baseUrl = "https://openrouter.ai", httpClient = fetch, model, timeoutMs } = {}) {
  return {
    async normalize(input) {
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
          signal,
          timeoutMs
        })
        const payload = await response.json()
        const parsed = parseModelResponse(payload)
        validateResult(parsed)
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
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      cancelTimeout() {},
      signal: undefined
    }
  }

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

function validateResult(value) {
  if (value?.needsClarification === true) {
    if (
      typeof value?.clarification?.message !== "string" ||
      !Array.isArray(value?.clarification?.suggestions) ||
      !value.clarification.suggestions.every((suggestion) => typeof suggestion === "string")
    ) {
      throw new Error("Invalid normalizer clarification result")
    }

    return
  }

  if (typeof value?.canonicalProfession !== "string") {
    throw new Error("Invalid normalizer canonical result")
  }
}
