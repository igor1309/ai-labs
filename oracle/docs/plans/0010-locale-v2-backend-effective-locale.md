---
date: 2026-02-23
model: gpt-5.2
description: "Plan: backend-only locale v2 (ru support + effectiveLocale + prompt embedding) for Oracle Am I done API"
---

# Locale v2 (backend only): effectiveLocale + ru output

## Scope
- Backend only (Worker API + packages used by Worker).
- Add locale v2 behavior gated by `schemaVersion: "2"`.
- Add `effectiveLocale` to v2 responses (`"ru"` or `"en"`).
- Localize backend-generated copy (guard/body errors) for v2.
- Localize model output by selecting localized prompt resources for v2.
- Keep `canonicalProfession` always English (prompt-enforced).
- Accept raw client locale (for example `ru-RU`) and fall back to English when unsupported.

## Non-goals
- Web UI chrome localization (separate implementation plan).
- Adding support for locales other than `ru` (v2 supports `ru`, everything else falls back to `en`).
- Perfect BCP-47 parsing; we only need stable, deterministic normalization rules.
- Changing the popularity counters schema (currently locale-free).

## Execution lock
- Worktree required: yes
- Expected worktree: `worktrees/oracle-0010-locale-v2-backend-plan`
- Expected branch: `codex/oracle-0010-locale-v2-backend-plan`
- Preflight check: [x] done

## v2 contract changes
### Request (v2)
Client sends raw locale and opts into v2:

```json
{
  "profession": "software developer",
  "locale": "ru-RU",
  "schemaVersion": "2"
}
```

### Response (v2)
Add `effectiveLocale` (language-only) to the existing response shape:

```json
{
  "schemaVersion": "2",
  "effectiveLocale": "ru",
  "requestId": "uuid",
  "needsClarification": false,
  "clarification": null,
  "answer": { "...": "..." }
}
```

Notes:
- v1 responses (`schemaVersion: "1"`) must remain unchanged (no `effectiveLocale` field).
- `effectiveLocale` is `"ru"` when the raw locale indicates Russian; otherwise `"en"`.
- v2 fallback rule: unsupported/invalid locale must fall back to English.

## Locale resolution rules (backend)
### Inputs
- Raw locale from the request body, trimmed.

### Output
- `effectiveLocale` is language-only: `"ru"` or `"en"`.

### Algorithm (v2)
1. Normalize:
   - trim whitespace
   - replace `_` with `-`
   - lower-case for comparisons
2. If normalized locale is `ru` or starts with `ru-` then `effectiveLocale = "ru"`.
3. Else `effectiveLocale = "en"`.

### Where it is used
- Prompt selection: choose ru/en prompt resources based on `effectiveLocale`.
- Caching: use `effectiveLocale` (not raw locale) in cache keys to avoid fragmentation.
- Response: include `effectiveLocale` in the v2 response body.

## Resource embedding strategy (no runtime file reads)
Workers/Pages runtime must not depend on reading `.md`/`.json` from disk. Localized resources live as source files and are embedded into JS at build/dev time.

### Proposed source layout (backend)
- `oracle/prompts/normalizer/system_prompt_en.md` (required)
- `oracle/prompts/normalizer/system_prompt_ru.md` (required for v2 RU output)
- `oracle/prompts/outlook/system_prompt_en.md` (required)
- `oracle/prompts/outlook/system_prompt_ru.md` (required for v2 RU output)
- `oracle/copy/backend/messages_en.json` (required)
- `oracle/copy/backend/messages_ru.json` (required for v2 RU output)

### Generator
Add a Node script that reads these files and generates a JS module containing string maps, for example:
- `oracle/packages/worker-api/src/generated/localized-resources.generated.js`

This module is imported by the Worker code and bundled by Wrangler.

## Prompt requirements (v2)
### Normalizer prompt
Must enforce:
- Output JSON schema stays stable.
- `clarification.*` text must be in `effectiveLocale` language.
- `canonicalProfession` must always be English (even when `effectiveLocale="ru"`).

### Outlook prompt
Must enforce:
- Output JSON schema stays stable.
- All human-readable text fields are in `effectiveLocale` language.
- Keep `confidence.label` as `low|medium|high` (UI chrome localizes the label separately).

## Cache/versioning rules
### Outlook cache
Already keyed by `canonicalProfession`, `locale`, `schemaVersion`, `promptVersion`.
- Use `effectiveLocale` as the `locale` component.
- Keep `schemaVersion` in the key (already present).
- When prompt text changes, bump `PROMPT_VERSION` for deployment so old cached answers do not leak into new behavior.

### Normalizer cache
Currently keyed by `locale` + `profession` and has no schema/prompt version dimension.
- Use `effectiveLocale` as the `locale` component.
- Partition v1/v2 results to prevent mixing localized clarifications.
  - Preferred: add a `cacheVersion` dependency to the normalizer service and include it in the key (`normalizer:${cacheVersion}:${effectiveLocale}:${profession}`).

## Step 1: Add v2 locale resolution utility
- Add `resolveEffectiveLocale({ rawLocale, schemaVersion })` in `oracle/packages/worker-api/src`.
- Add unit tests covering:
  - ✅ `ru`, `ru-RU`, `ru_UA` → `"ru"` when `schemaVersion="2"`.
  - ✅ `en-US`, `fr-FR`, empty/invalid → `"en"` when `schemaVersion="2"`.
  - ✅ v1 behavior remains unchanged (utility returns raw/trimmed locale or is not used for v1 paths; choose and codify one).
- Run: `./scripts/run_silent.sh "tests" npm test`
- Commit: `add effectiveLocale resolver for v2`

## Step 2: Thread effectiveLocale through request handling and v2 responses
- ✅ Update request guard to return both:
  - ✅ `requestedLocale` (trimmed raw)
  - ✅ `effectiveLocale` (computed for v2, `"en"` fallback)
  - ✅ Keep the existing `locale` field only if needed for v1 compatibility; otherwise migrate call sites to the new naming.
- ✅ Update `createWorkerFetchHandler`:
  - ✅ Use `effectiveLocale` for all downstream calls (normalizer/outlook) when `schemaVersion="2"`.
  - ✅ Add `effectiveLocale` to v2 responses for:
    - ✅ answered
    - ✅ clarify
    - ✅ guard_reject
    - ✅ invalid_body (use `"en"` if locale is unavailable)
  - ✅ Ensure v1 responses remain byte-for-byte compatible (no new fields).
- ✅ Add/adjust composition tests to cover:
  - ✅ v2 adds `effectiveLocale`
  - ✅ v1 has no `effectiveLocale`
- Run: `./scripts/run_silent.sh "tests" npm test`
- Commit: `include effectiveLocale in schemaVersion 2 responses`

## Step 3: Localize backend-owned copy for v2
- Add backend message resources (`messages_en.json`, `messages_ru.json`) and embed them (generator output module is acceptable in this step or the next).
- Localize these backend-generated strings for v2:
  - invalid request body message
  - guard invalid message
- Update tests expecting these messages:
  - v2 with `effectiveLocale="ru"` returns Russian strings
  - v2 fallback returns English strings
  - v1 remains English as today
- Run: `./scripts/run_silent.sh "tests" npm test`
- Commit: `localize backend clarification copy for v2`

## Step 4: Embed localized prompts and select them in OpenRouter adapters
- Add localized prompt source files for normalizer and outlook.
- Add generator script + generated module (or extend the generator from Step 3) to embed prompt text.
- Update OpenRouter adapters to pick system prompt content based on `effectiveLocale`.
- Update adapter tests to validate:
  - system prompt selection changes for `effectiveLocale="ru"` vs `"en"`.
  - the user prompt payload includes `locale` matching `effectiveLocale` (not raw).
- Run: `./scripts/run_silent.sh "tests" npm test`
- Commit: `select localized system prompts for v2`

## Step 5: Partition normalizer cache for v2
- Update profession normalizer cache keying to prevent mixing v1 and v2 localized outputs.
- Preferred approach:
  - Add `cacheVersion` dependency to `createProfessionNormalizer`.
  - Include `cacheVersion` in the cache key.
  - Wire `cacheVersion` from the Worker assembler:
    - `"1"` for `schemaVersion="1"`
    - `"2"` for `schemaVersion="2"`
- Add tests proving:
  - v2 writes/reads different keys than v1 for the same profession + effectiveLocale.
- Run: `./scripts/run_silent.sh "tests" npm test`
- Commit: `partition normalizer cache by schemaVersion`

## Step 6: Deployment/config follow-ups (backend only)
- Update `oracle/apps/am-i-done-api/wrangler.toml` defaults as needed for local dev (keep prod behavior gated by `schemaVersion` so local dev remains safe).
- Document required config changes for deploy:
  - bump Worker `PROMPT_VERSION` when localized prompts ship (recommended next value: `"2"`).
- Run: `./scripts/run_silent.sh "tests" npm test`
- Commit: `document locale v2 deploy settings`

## Completion gates
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `./scripts/run_silent.sh "tests" npm test`

## Follow-up plan (separate)
- Frontend localization (UI chrome + sending `schemaVersion:"2"` + raw locale + updated E2E expectations) should be delivered as a separate plan to keep scopes independent and reviewable.
