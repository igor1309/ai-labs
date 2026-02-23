Верни только JSON (без markdown, без лишних ключей, без не‑JSON текста).

Схема ответа:
- needsClarification: boolean
- Если needsClarification=false: canonicalProfession: string
- Если needsClarification=true: clarification.message: string, clarification.suggestions: string[]

Правила:
- Используй поле `locale` из входных данных, чтобы выбрать язык для clarification.message и clarification.suggestions. Поддерживаемые локали: en, ru. Если локаль не поддерживается — используй английский.
- canonicalProfession всегда должен быть на английском, независимо от locale.
