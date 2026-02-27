---
date: 2026-02-28
model: claude-opus-4-6
description: "Implementation plan for wiring Oracle LLM calls through Nomos proxy"
---

# Oracle-Nomos Wiring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Route Oracle's LLM calls through Nomos proxy instead of directly to OpenRouter.

**Architecture:** Rename-and-reconfigure — adapter files renamed from `openrouter-*` to `llm-*`, env vars from `OPENROUTER_*` to `LLM_*`, URL path from `/api/v1/` to `/v1/`, default base URL to `https://nomos.enoa.ai`. No logic changes, no domain module changes.

**Tech Stack:** Node.js, Cloudflare Workers

**Design doc:** `oracle/docs/plans/2026-02-28-oracle-nomos-wiring-design.md`

**Execution lock:**
- Worktree required: no (trunk-direct, rename-only refactor)
- Preflight check: [ ] done

---

### Task 1: Rename and update normalizer adapter

**Files:**
- Rename: `oracle/packages/worker-api/src/openrouter-normalizer-model-client-adapter.js` → `oracle/packages/worker-api/src/llm-normalizer-model-client-adapter.js`

**Step 1: Rename file**

```bash
git mv oracle/packages/worker-api/src/openrouter-normalizer-model-client-adapter.js oracle/packages/worker-api/src/llm-normalizer-model-client-adapter.js
```

**Step 2: Update file contents**

Apply these replacements in `llm-normalizer-model-client-adapter.js`:
- `createOpenRouterNormalizerModelClient` → `createLlmNormalizerModelClient`
- `baseUrl = "https://openrouter.ai"` → `baseUrl = "https://nomos.enoa.ai"`
- `${baseUrl}/api/v1/chat/completions` → `${baseUrl}/v1/chat/completions`
- `"OpenRouter request timed out"` → `"LLM request timed out"`
- `"Invalid OpenRouter response"` (3 occurrences) → `"Invalid LLM response"`
- `"Invalid JSON response from OpenRouter"` → `"Invalid JSON response from LLM"`
- `formatOpenRouterHttpError` → `formatLlmHttpError`
- `"OpenRouter request failed"` (in formatLlmHttpError and classifyLlmErrorType) → `"LLM request failed"`
- `classifyOpenRouterErrorType` → `classifyLlmErrorType`

**Step 3: Run tests to confirm they fail (import path changed)**

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: normalizer adapter tests fail (import path broken).

**Step 4: Commit rename + content update**

```bash
git add oracle/packages/worker-api/src/llm-normalizer-model-client-adapter.js
git commit -m "rename normalizer adapter from openrouter to llm"
```

---

### Task 2: Rename and update normalizer adapter tests

**Files:**
- Rename: `oracle/packages/worker-api/tests/openrouter-normalizer-model-client-adapter.test.js` → `oracle/packages/worker-api/tests/llm-normalizer-model-client-adapter.test.js`

**Step 1: Rename file**

```bash
git mv oracle/packages/worker-api/tests/openrouter-normalizer-model-client-adapter.test.js oracle/packages/worker-api/tests/llm-normalizer-model-client-adapter.test.js
```

**Step 2: Update file contents**

In `llm-normalizer-model-client-adapter.test.js`:
- `loadAdapterModule()` import path: `"../src/openrouter-normalizer-model-client-adapter.js"` → `"../src/llm-normalizer-model-client-adapter.js"`
- All `createOpenRouterNormalizerModelClient` → `createLlmNormalizerModelClient`
- All test names: `test_createOpenRouterNormalizerModelClient_` → `test_createLlmNormalizerModelClient_`
- URL assertion: `"https://custom-openrouter.example/api/v1/chat/completions"` → `"https://custom-openrouter.example/v1/chat/completions"`
- Error assertions: `"Invalid JSON response from OpenRouter"` → `"Invalid JSON response from LLM"`
- Error assertions: `"OpenRouter request failed (401): Unauthorized"` → `"LLM request failed (401): Unauthorized"`
- Error assertions: `"OpenRouter request failed (400)"` → `"LLM request failed (400)"`
- Error assertions: `"OpenRouter request timed out"` → `"LLM request timed out"`

**Step 3: Run tests**

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: normalizer adapter tests pass. Other tests may still fail (assembler imports old path).

**Step 4: Commit**

```bash
git add oracle/packages/worker-api/tests/llm-normalizer-model-client-adapter.test.js
git commit -m "rename normalizer adapter tests from openrouter to llm"
```

---

### Task 3: Rename and update outlook adapter

**Files:**
- Rename: `oracle/packages/worker-api/src/openrouter-outlook-model-client-adapter.js` → `oracle/packages/worker-api/src/llm-outlook-model-client-adapter.js`

**Step 1: Rename file**

```bash
git mv oracle/packages/worker-api/src/openrouter-outlook-model-client-adapter.js oracle/packages/worker-api/src/llm-outlook-model-client-adapter.js
```

**Step 2: Update file contents**

Same pattern as Task 1 but for outlook adapter:
- `createOpenRouterOutlookModelClient` → `createLlmOutlookModelClient`
- `baseUrl = "https://openrouter.ai"` → `baseUrl = "https://nomos.enoa.ai"`
- `${baseUrl}/api/v1/chat/completions` → `${baseUrl}/v1/chat/completions`
- `"OpenRouter request timed out"` → `"LLM request timed out"`
- `"Invalid OpenRouter response"` (3 occurrences) → `"Invalid LLM response"`
- `"Invalid JSON response from OpenRouter"` → `"Invalid JSON response from LLM"`
- `formatOpenRouterHttpError` → `formatLlmHttpError`
- `"OpenRouter request failed"` → `"LLM request failed"`
- `classifyOpenRouterErrorType` → `classifyLlmErrorType`

**Step 3: Commit**

```bash
git add oracle/packages/worker-api/src/llm-outlook-model-client-adapter.js
git commit -m "rename outlook adapter from openrouter to llm"
```

---

### Task 4: Rename and update outlook adapter tests

**Files:**
- Rename: `oracle/packages/worker-api/tests/openrouter-outlook-model-client-adapter.test.js` → `oracle/packages/worker-api/tests/llm-outlook-model-client-adapter.test.js`

**Step 1: Rename file**

```bash
git mv oracle/packages/worker-api/tests/openrouter-outlook-model-client-adapter.test.js oracle/packages/worker-api/tests/llm-outlook-model-client-adapter.test.js
```

**Step 2: Update file contents**

- `loadAdapterModule()` import path: `"../src/openrouter-outlook-model-client-adapter.js"` → `"../src/llm-outlook-model-client-adapter.js"`
- All `createOpenRouterOutlookModelClient` → `createLlmOutlookModelClient`
- All test names: `test_createOpenRouterOutlookModelClient_` → `test_createLlmOutlookModelClient_`
- `makeOpenRouterRequestCall` → `makeLlmRequestCall`
- `makeOpenRouterSuccessPayload` → `makeLlmSuccessPayload`
- `makeOpenRouterRawPayload` → `makeLlmRawPayload`
- URL assertion in `makeLlmRequestCall`: `"https://openrouter.ai/api/v1/chat/completions"` → `"https://nomos.enoa.ai/v1/chat/completions"`
- Error assertions: `"OpenRouter request failed (401): Unauthorized"` → `"LLM request failed (401): Unauthorized"`
- Error assertions: `"OpenRouter request failed (400)"` → `"LLM request failed (400)"`
- Error assertions: `"OpenRouter request timed out"` → `"LLM request timed out"`

**Step 3: Run tests**

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: both adapter test files pass. Assembler tests still fail.

**Step 4: Commit**

```bash
git add oracle/packages/worker-api/tests/llm-outlook-model-client-adapter.test.js
git commit -m "rename outlook adapter tests from openrouter to llm"
```

---

### Task 5: Update composition root (worker-fetch-assembler)

**Files:**
- Modify: `oracle/apps/am-i-done-api/src/worker-fetch-assembler.js`

**Step 1: Update imports**

```javascript
// Old:
import { createOpenRouterNormalizerModelClient } from "../../../packages/worker-api/src/openrouter-normalizer-model-client-adapter.js"
import { createOpenRouterOutlookModelClient } from "../../../packages/worker-api/src/openrouter-outlook-model-client-adapter.js"

// New:
import { createLlmNormalizerModelClient } from "../../../packages/worker-api/src/llm-normalizer-model-client-adapter.js"
import { createLlmOutlookModelClient } from "../../../packages/worker-api/src/llm-outlook-model-client-adapter.js"
```

**Step 2: Update constants**

```javascript
// Old:
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai"
const DEFAULT_OPENROUTER_TIMEOUT_MS = 10000

// New:
const DEFAULT_LLM_BASE_URL = "https://nomos.enoa.ai"
const DEFAULT_LLM_TIMEOUT_MS = 10000
```

**Step 3: Update resolveConfig**

Replace env var names:
- `"OPENROUTER_BASE_URL"` → `"LLM_BASE_URL"` (3 occurrences: resolveOptionalStringBinding call, validateAbsoluteUrlBinding call, error message)
- `DEFAULT_OPENROUTER_BASE_URL` → `DEFAULT_LLM_BASE_URL`
- `"OPENROUTER_API_KEY"` → `"LLM_API_KEY"` (in resolveOpenRouterApiKey → resolveLlmApiKey, and the function call)
- `"OPENROUTER_TIMEOUT_MS"` → `"LLM_TIMEOUT_MS"`
- `DEFAULT_OPENROUTER_TIMEOUT_MS` → `DEFAULT_LLM_TIMEOUT_MS`
- `openRouterApiKey` → `llmApiKey` (config field)
- `openRouterBaseUrl` → `llmBaseUrl` (config field)

**Step 4: Update factory functions**

- `resolveOpenRouterApiKey` → `resolveLlmApiKey`
- `createConfiguredOpenRouterNormalizerModelClient` → `createConfiguredLlmNormalizerModelClient`
- `createConfiguredOpenRouterOutlookModelClient` → `createConfiguredLlmOutlookModelClient`
- Inside these functions: `config.openRouterApiKey` → `config.llmApiKey`, `config.openRouterBaseUrl` → `config.llmBaseUrl`
- `createOpenRouterNormalizerModelClient` → `createLlmNormalizerModelClient`
- `createOpenRouterOutlookModelClient` → `createLlmOutlookModelClient`

**Step 5: Run tests**

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: assembler tests fail (env var names changed).

**Step 6: Commit**

```bash
git add oracle/apps/am-i-done-api/src/worker-fetch-assembler.js
git commit -m "update composition root: openrouter to llm env vars and imports"
```

---

### Task 6: Update assembler tests

**Files:**
- Modify: `oracle/apps/am-i-done-api/tests/worker-fetch-assembler.test.js`

**Step 1: Update makeEnv()**

```javascript
// Old:
OPENROUTER_API_KEY: "openrouter-api-key",

// New:
LLM_API_KEY: "llm-api-key",
```

**Step 2: Update test assertions for env var names**

- `"Missing required binding: OPENROUTER_API_KEY"` → `"Missing required binding: LLM_API_KEY"`
- `"Invalid binding: OPENROUTER_API_KEY"` → `"Invalid binding: LLM_API_KEY"`
- `"Invalid binding: OPENROUTER_BASE_URL"` → `"Invalid binding: LLM_BASE_URL"`
- Test names: `_onMissingOpenRouterApiKeyBinding` → `_onMissingLlmApiKeyBinding`
- Test names: `_onEmptyOrWhitespaceOpenRouterApiKey` → `_onEmptyOrWhitespaceLlmApiKey`
- Test names: `_onInvalidOpenRouterBaseUrl` → `_onInvalidLlmBaseUrl`
- Test names: `_onInvalidOpenRouterTimeoutBinding` → `_onInvalidLlmTimeoutBinding`
- Test names: `_onBlankOptionalBaseUrlBinding` → `_onBlankOptionalBaseUrlBinding` (no change needed)
- `makeEnvWithout("OPENROUTER_API_KEY")` → `makeEnvWithout("LLM_API_KEY")`

**Step 3: Update env overrides in tests**

- `OPENROUTER_BASE_URL: "https://openrouter.custom"` → `LLM_BASE_URL: "https://llm.custom"`
- `OPENROUTER_TIMEOUT_MS: "1337"` → `LLM_TIMEOUT_MS: "1337"`
- `OPENROUTER_TIMEOUT_MS: "0"` → `LLM_TIMEOUT_MS: "0"`
- `OPENROUTER_BASE_URL: ""` → `LLM_BASE_URL: ""`
- `OPENROUTER_BASE_URL: "not-a-valid-url"` → `LLM_BASE_URL: "not-a-valid-url"`
- `OPENROUTER_API_KEY: ""` → `LLM_API_KEY: ""`
- `OPENROUTER_API_KEY: "   "` → `LLM_API_KEY: "   "`

**Step 4: Update URL assertions**

- `"https://openrouter.custom/api/v1/chat/completions"` → `"https://llm.custom/v1/chat/completions"`
- `"https://openrouter.ai/api/v1/chat/completions"` → `"https://nomos.enoa.ai/v1/chat/completions"`

**Step 5: Update spy names**

- `makeOpenRouterHttpClientSpy` → `makeLlmHttpClientSpy` (function def + all call sites)

**Step 6: Run tests**

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: all tests pass.

**Step 7: Commit**

```bash
git add oracle/apps/am-i-done-api/tests/worker-fetch-assembler.test.js
git commit -m "update assembler tests: openrouter to llm env vars and URLs"
```

---

### Task 7: Update config files

**Files:**
- Modify: `oracle/apps/am-i-done-api/wrangler.toml`
- Modify: `oracle/apps/am-i-done-api/.dev.vars.example`

**Step 1: Update wrangler.toml**

```toml
# Old:
OPENROUTER_TIMEOUT_MS = "60000"

# New:
LLM_TIMEOUT_MS = "60000"
```

**Step 2: Update .dev.vars.example**

```
# Old:
OPENROUTER_API_KEY=replace-with-local-key

# New:
LLM_API_KEY=replace-with-nomos-project-token
LLM_BASE_URL=https://nomos.enoa.ai
```

**Step 3: Run tests**

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: all tests pass (config files don't affect tests).

**Step 4: Commit**

```bash
git add oracle/apps/am-i-done-api/wrangler.toml oracle/apps/am-i-done-api/.dev.vars.example
git commit -m "update config files: openrouter to llm env vars"
```

---

### Task 8: Update CI smoke test workflow and test file

**Files:**
- Modify: `.github/workflows/core-real-provider-smoke.yml`
- Modify: `.github/workflows/ci.yml` (caller)
- Modify: `.github/workflows/release.yml` (caller)
- Modify: `oracle/apps/am-i-done-web/tests/web-real-provider-smoke.test.js`

**Step 1: Update smoke test file**

In `web-real-provider-smoke.test.js`:
- `process.env.OPENROUTER_API_KEY` → `process.env.LLM_API_KEY`
- `process.env.OPENROUTER_BASE_URL` → `process.env.LLM_BASE_URL`
- `process.env.OPENROUTER_TIMEOUT_MS` → `process.env.LLM_TIMEOUT_MS`
- `OPENROUTER_API_KEY: openRouterApiKey` → `LLM_API_KEY: llmApiKey`
- `OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL` → `LLM_BASE_URL: process.env.LLM_BASE_URL`
- `OPENROUTER_TIMEOUT_MS: process.env.OPENROUTER_TIMEOUT_MS` → `LLM_TIMEOUT_MS: process.env.LLM_TIMEOUT_MS`
- `resolveOpenRouterApiKey` → `resolveLlmApiKey`
- `"Missing required OPENROUTER_API_KEY"` → `"Missing required LLM_API_KEY"`
- Local var `openRouterApiKey` → `llmApiKey`

**Step 2: Update core-real-provider-smoke.yml**

Rename workflow inputs and env vars:
- Input `openrouter_model` → `llm_model`
- Input `openrouter_timeout_ms` → `llm_timeout_ms`
- Secret `OPENROUTER_API_KEY` → `LLM_API_KEY`
- Env `OPENROUTER_API_KEY` → `LLM_API_KEY`
- Env `OPENROUTER_TIMEOUT_MS` → `LLM_TIMEOUT_MS`
- References: `${{ inputs.openrouter_model }}` → `${{ inputs.llm_model }}`
- References: `${{ inputs.openrouter_timeout_ms }}` → `${{ inputs.llm_timeout_ms }}`
- References: `${{ secrets.OPENROUTER_API_KEY }}` → `${{ secrets.LLM_API_KEY }}`

**Step 3: Update ci.yml caller**

In the `real-provider-smoke` job:
- `openrouter_model: ${{ vars.OPENROUTER_CI_MODEL }}` → `llm_model: ${{ vars.OPENROUTER_CI_MODEL }}`
- `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}` → `LLM_API_KEY: ${{ secrets.NOMOS_ORACLE_TOKEN }}`

Note: need a new secret `NOMOS_ORACLE_TOKEN` with the oracle project bearer token (same value as the Cloudflare Workers `LLM_API_KEY`).

**Step 4: Update release.yml caller**

In the `real-provider-smoke` job:
- `OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}` → `LLM_API_KEY: ${{ secrets.NOMOS_ORACLE_TOKEN }}`
- If it passes `openrouter_model` input, rename to `llm_model`
- If it passes `OPENROUTER_TIMEOUT_MS`, rename to `LLM_TIMEOUT_MS`

**Step 5: Add GitHub secret**

```bash
gh secret set NOMOS_ORACLE_TOKEN
# Value: the oracle project bearer token from Nomos VPS
```

**Step 6: Run tests**

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: all tests pass.

**Step 7: Commit**

```bash
git add oracle/apps/am-i-done-web/tests/web-real-provider-smoke.test.js .github/workflows/core-real-provider-smoke.yml .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "update CI smoke: route through nomos instead of direct openrouter"
```

---

### Task 9: Update logs

**Files:**
- Modify: `oracle/docs/log.md`
- Modify: `docs/log.md`

**Step 1: Add log entries**

`oracle/docs/log.md` — add under `## 2026-02-28` (create section if needed):
```
Wire Oracle LLM calls through Nomos proxy: rename adapters and env vars from openrouter to llm, change default base URL to nomos.enoa.ai, update CI smoke to route through Nomos.
```

`docs/log.md` — add under `## 2026-02-28`:
```
Oracle: wire LLM calls through Nomos proxy. See `oracle/docs/log.md`.
```

**Step 2: Commit**

```bash
git add oracle/docs/log.md docs/log.md
git commit -m "update logs: oracle-nomos wiring"
```

---

### Task 10: Final verification and plan cleanup

**Step 1: Run full test suite**

```bash
./scripts/run_silent.sh "tests" npm test
```

**Step 2: Run typecheck**

```bash
./scripts/run_silent.sh "build" npx tsc --noEmit
```

**Step 3: Move design doc and plan to implemented**

```bash
mv oracle/docs/plans/2026-02-28-oracle-nomos-wiring-design.md oracle/docs/plans/implemented/
mv oracle/docs/plans/2026-02-28-oracle-nomos-wiring.md oracle/docs/plans/implemented/
```

**Step 4: Commit and push**

```bash
git add oracle/docs/plans/
git commit -m "move oracle-nomos wiring plans to implemented"
git push origin trunk
```
