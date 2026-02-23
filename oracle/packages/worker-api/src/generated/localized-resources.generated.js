// This file is generated. Do not edit by hand.
// Run: node oracle/packages/worker-api/scripts/generate-localized-resources.js

export const backendMessages = {
  "en": {
    "invalid_profession_or_locale": "Please provide a valid profession and locale.",
    "invalid_request_body": "Please provide a valid request body."
  },
  "ru": {
    "invalid_profession_or_locale": "Пожалуйста, укажите корректные профессию и локаль.",
    "invalid_request_body": "Пожалуйста, отправьте корректное тело запроса."
  }
}

export const systemPrompts = {
  "normalizer": {
    "en": "Return only JSON (no markdown, no extra keys, no non-JSON text).\n\nOutput schema:\n- needsClarification: boolean\n- If needsClarification=false: canonicalProfession: string\n- If needsClarification=true: clarification.message: string, clarification.suggestions: string[]\n\nRules:\n- Use the input `locale` field to choose the language for clarification.message and clarification.suggestions. Supported locales: en, ru. If unsupported, use English.\n- canonicalProfession must always be in English, regardless of locale.\n",
    "ru": "Верни только JSON (без markdown, без лишних ключей, без не‑JSON текста).\n\nСхема ответа:\n- needsClarification: boolean\n- Если needsClarification=false: canonicalProfession: string\n- Если needsClarification=true: clarification.message: string, clarification.suggestions: string[]\n\nПравила:\n- Используй поле `locale` из входных данных, чтобы выбрать язык для clarification.message и clarification.suggestions. Поддерживаемые локали: en, ru. Если локаль не поддерживается — используй английский.\n- canonicalProfession всегда должен быть на английском, независимо от locale.\n"
  },
  "outlook": {
    "en": "Return only a JSON object (no markdown, no extra keys, no non-JSON text).\n\nOutput schema (exact keys):\n- headline: string\n- timeHorizon: { label: string, explanation: string }\n- confidence: { label: \"low\"|\"medium\"|\"high\", rationale: string }\n- keyRisks: string[]\n- whatToDoNext: string[]\n- assumptions: string[]\n\nRules:\n- Use the input `locale` field to choose the language for all human-readable text fields (everything except confidence.label). Supported locales: en, ru. If unsupported, use English.\n- Keep confidence.label exactly one of low|medium|high.\n",
    "ru": "Верни только JSON‑объект (без markdown, без лишних ключей, без не‑JSON текста).\n\nСхема ответа (ключи должны совпадать):\n- headline: string\n- timeHorizon: { label: string, explanation: string }\n- confidence: { label: \"low\"|\"medium\"|\"high\", rationale: string }\n- keyRisks: string[]\n- whatToDoNext: string[]\n- assumptions: string[]\n\nПравила:\n- Используй поле `locale` из входных данных, чтобы выбрать язык для всех человеко‑читаемых текстовых полей (всё, кроме confidence.label). Поддерживаемые локали: en, ru. Если локаль не поддерживается — используй английский.\n- confidence.label должен быть строго одним из low|medium|high.\n"
  }
}
