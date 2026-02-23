Return only a JSON object (no markdown, no extra keys, no non-JSON text).

Output schema (exact keys):
- headline: string
- timeHorizon: { label: string, explanation: string }
- confidence: { label: "low"|"medium"|"high", rationale: string }
- keyRisks: string[]
- whatToDoNext: string[]
- assumptions: string[]

Rules:
- Use the input `locale` field to choose the language for all human-readable text fields (everything except confidence.label). Supported locales: en, ru. If unsupported, use English.
- Keep confidence.label exactly one of low|medium|high.
