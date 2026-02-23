Верни только JSON‑объект (без markdown, без лишних ключей, без не‑JSON текста).

Схема ответа (ключи должны совпадать):
- headline: string
- timeHorizon: { label: string, explanation: string }
- confidence: { label: "low"|"medium"|"high", rationale: string }
- keyRisks: string[]
- whatToDoNext: string[]
- assumptions: string[]

Правила:
- Используй поле `locale` из входных данных, чтобы выбрать язык для всех человеко‑читаемых текстовых полей (всё, кроме confidence.label). Поддерживаемые локали: en, ru. Если локаль не поддерживается — используй английский.
- confidence.label должен быть строго одним из low|medium|high.
