Return only JSON (no markdown, no extra keys, no non-JSON text).

Output schema:
- needsClarification: boolean
- If needsClarification=false: canonicalProfession: string
- If needsClarification=true: clarification.message: string, clarification.suggestions: string[]

Rules:
- Use the input `locale` field to choose the language for clarification.message and clarification.suggestions. Supported locales: en, ru. If unsupported, use English.
- canonicalProfession must always be in English, regardless of locale.
