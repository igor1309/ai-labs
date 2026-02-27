---
date: 2026-02-28
model: claude-opus-4-6
description: "Design for wiring Oracle LLM calls through Nomos proxy"
---

# Wire Oracle to Nomos

## Goal

Route Oracle's LLM calls through Nomos instead of directly to OpenRouter. Nomos provides centralized API key management, token usage tracking, budget enforcement, and prompt safeguards.

## Scope

Rename-and-reconfigure approach — no new adapter logic, no domain module changes.

### Adapter files

Rename `openrouter-*-model-client-adapter.js` to `llm-*-model-client-adapter.js` in `oracle/packages/worker-api/src/`.

Changes in both adapters:
- Export: `createOpenRouter*` → `createLlm*`
- URL path: `${baseUrl}/api/v1/chat/completions` → `${baseUrl}/v1/chat/completions`
- Default `baseUrl`: `https://openrouter.ai` → `https://nomos.enoa.ai`
- Error messages: "OpenRouter" → "LLM" (e.g., "LLM request timed out", "Invalid LLM response")
- Internal function names: `formatOpenRouterHttpError` → `formatLlmHttpError`, `classifyOpenRouterErrorType` → `classifyLlmErrorType`

Request format unchanged — already OpenAI-compatible. Usage/cost extraction unchanged — Nomos passes vendor response through.

### Composition root

`oracle/apps/am-i-done-api/src/worker-fetch-assembler.js`:
- Constants: `DEFAULT_OPENROUTER_BASE_URL` → `DEFAULT_LLM_BASE_URL` (`https://nomos.enoa.ai`), `DEFAULT_OPENROUTER_TIMEOUT_MS` → `DEFAULT_LLM_TIMEOUT_MS`
- Env vars: `OPENROUTER_API_KEY` → `LLM_API_KEY`, `OPENROUTER_BASE_URL` → `LLM_BASE_URL`, `OPENROUTER_TIMEOUT_MS` → `LLM_TIMEOUT_MS`
- Config fields: `openRouterApiKey` → `llmApiKey`, `openRouterBaseUrl` → `llmBaseUrl`
- Factory functions: `createConfiguredOpenRouter*` → `createConfiguredLlm*`, `resolveOpenRouterApiKey` → `resolveLlmApiKey`

### Config files

- `wrangler.toml`: `OPENROUTER_TIMEOUT_MS` → `LLM_TIMEOUT_MS`
- `.dev.vars.example`: `OPENROUTER_API_KEY` → `LLM_API_KEY`, add `LLM_BASE_URL=https://nomos.enoa.ai`

### Tests

Rename and update three test files:
- `openrouter-normalizer-model-client-adapter.test.js` → `llm-normalizer-model-client-adapter.test.js`
- `openrouter-outlook-model-client-adapter.test.js` → `llm-outlook-model-client-adapter.test.js`
- `worker-fetch-assembler.test.js` — update imports, factory names, env var names

### CI smoke

Update `oracle-core.yml` to route smoke tests through Nomos:
- Use Nomos oracle project bearer token as `LLM_API_KEY`
- Set `LLM_BASE_URL=https://nomos.enoa.ai`

### Cloudflare Workers secrets

Already updated by user:
- Deleted `OPENROUTER_API_KEY`
- Added `LLM_API_KEY` with Nomos oracle project bearer token

### Out of scope

- Budget configuration for oracle project (deferred to #53)
- Domain module changes (protocol owners don't know about provider)
- New adapter logic (same OpenAI-compatible HTTP calls)
