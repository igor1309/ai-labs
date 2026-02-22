---
date: 2026-02-21
model: gpt-5.2
description: "Architecture and component specs for the Am I done? toy app (v1)"
inspiration:
  - https://habr.com/ru/articles/1000816/
  - https://ai-fire.ru/ru
---

# Am I done?

Toy app: a one-shot quiz for questions like “I’m a software developer — is AI taking my job? How much time do I have left?”. The user provides a profession; the app returns a fixed, structured multi-part answer.

## Goals
- Single input (profession) → structured answer (no chat).
- `needsClarification` is a first-class successful outcome (not an error).
- No pre-populated “professions DB”; only learn from observed user inputs.

## Non-goals (v1)
- Partial streaming / token-by-token UI.
- Accounts, personalization, or long-term user history.
- “Perfect” prompt injection defense (we constrain inputs instead).

## UX (v1)
- One text input for profession + submit.
- While loading: show spinner/skeleton.
- On success:
  - If `needsClarification=true`: show follow-up question + suggested professions.
  - Else: render answer sections (headline, time horizon, risks, next steps, assumptions, confidence).
- Only transport failures/timeouts are treated as error UI.

## Frontend
### Implementation policy (locked)
- UI stack (v1): vanilla TypeScript (no framework dependency required for the initial one-shot flow).
- API routing (v1+): frontend calls same-origin `POST /api/outlook`.
- Locale (v1): always send `en-US`.
- Locale (v2 target): auto-detect locale from browser/runtime environment, with fallback to `en-US`.

### State
- `idle`
- `submitting`
- `failed` (timeout/transport error)
- `received` (backend responded; may be `needsClarification`)

### Events
- Submit non-empty profession
- Receive response
- Receive timeout / transport failure

### Effects
- HTTP request with timeout

### Reducer
Straightforward state machine (submit → loading; response → received; failure → failed).

### Effect handler
HTTP(S) call with timeout (frontend timeout is independent of backend compute timeout).

## API contract (draft)
### Request
`POST /api/outlook`

```json
{
  "profession": "software developer",
  "locale": "en-US",
  "schemaVersion": "1"
}
```

### Response (always structured)
```json
{
  "schemaVersion": "1",
  "requestId": "uuid",
  "canonicalProfession": "software engineer",
  "category": "knowledge-work",
  "categoryConfidence": 0.9,
  "needsClarification": false,
  "clarification": null,
  "answer": {
    "headline": "…",
    "timeHorizon": {
      "label": "…",
      "explanation": "…"
    },
    "confidence": {
      "label": "low|medium|high",
      "rationale": "…"
    },
    "keyRisks": ["…"],
    "whatToDoNext": ["…"],
    "assumptions": ["…"]
  }
}
```

Notes:
- `needsClarification=true` returns `clarification` (message + suggestions) and sets `answer=null`.
- Input rejected by the guard is still a structured response: `needsClarification=true` with a safe, generic clarification message (no echo of user input).

## Backend (composition)
### Request guard
Responsibilities:
- Fast failure on empty/too-long input and disallowed characters.
- Normalize basics deterministically (trim, collapse whitespace).
- Reduce prompt injection surface by constraining what can reach model prompts.

Implementation note:
- Regex is OK for v1, but prefer strict input shaping over “detecting injection”.

### Profession normalizer
Goal: transform a raw input into a canonical profession label (or a clarification request).

Output:
- `needsClarification=true` + follow-up question + suggested professions, OR
- `needsClarification=false` + `canonicalProfession` (+ optional `category` + confidence metadata).

Why this exists:
- Stable cache keys and analytics roll-ups without a pre-populated professions DB.

Clarification policy (v1):
- Balanced: guess canonical profession only when confidence is high and input is not “too generic”; otherwise return `needsClarification=true` with suggestions.

Locale policy (v1):
- Locale-aware: the normalizer takes `locale` to interpret non-English inputs and to produce localized clarifications/suggestions, while keeping `canonicalProfession` stable for caching/analytics.

Category policy (v1):
- Optional: include `category` (and optional confidence) when available; do not require it for producing an outlook answer.

### ProfessionOutlookService
Goal: given `canonicalProfession` + `locale` + prompt/schema version, produce the structured multi-part `answer`.

### LLM gateway (OpenRouter)
Responsibilities:
- Adapt OpenRouter API to a client-owned protocol used by `ProfessionNormalizer`/`ProfessionOutlookService`.
- Select model from config (allow switching without changing clients).

### Caching
Treat caching as two independent layers:

1) Normalization cache
- Key: `(rawProfessionNormalized, locale?)`
- Value: normalizer output (canonical label or clarification).
- Also store a synonym mapping for observability: raw → canonical.

2) Answer cache
- Key: `(canonicalProfession, locale, schemaVersion, promptVersion)`
- Value: `answer`

### Counters / popularity index
Record counters on canonical profession:
- `canonicalProfession` hit count (for popularity/heat map).
- Optional raw-input count (for synonym discovery and UI copy improvements).

### PopularityTracker (decorator)
Responsibilities:
- Increment counters on every request (cache hit or miss).
- Keep `AnswerCache` pure (no write-on-read semantics inside cached values).

## “Protocol owned by client” rule (module boundary)
When implementing services:
- Each client (e.g., `ProfessionOutlookService`, `ProfessionNormalizer`) owns the protocol/interface it depends on (e.g., its model client) and keeps it in the same module.
- Adapters (e.g., OpenRouter) implement client-owned protocols in the composition layer.
- Do not create “shared protocol modules” detached from their clients.

## Error handling & timeouts
- Backend:
  - Uses strict timeouts for model calls.
  - Distinguishes transport failures (HTTP error) from domain outcomes (`needsClarification`).
- Frontend:
  - Treats timeout/transport as `failed`.
  - Treats `needsClarification` as `received`.
