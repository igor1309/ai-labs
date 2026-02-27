---
date: 2026-02-28
model: claude-opus-4-6
description: "Plan for adapter naming guidance and LLM_ENDPOINT_URL config"
---

# Adapter Naming Discipline & Endpoint URL Config

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** (1) Add naming discipline rule to composition root guide, (2) use a single `LLM_ENDPOINT_URL` config instead of `LLM_BASE_URL` + hardcoded path suffix.

**Architecture:** Guidance update + config surface change. The adapter receives a full endpoint URL and POSTs to it directly — no path concatenation, no hidden assumptions about what's behind the URL.

**Context:** The oracle-nomos wiring plan (`2026-02-28-oracle-nomos-wiring.md`) has not been executed yet. This plan supersedes its URL/config approach. Execute this plan first, then execute the wiring plan with `LLM_ENDPOINT_URL` in place of `LLM_BASE_URL`.

---

### Task 1: Add naming discipline rule to composition root guide

**Files:**
- Modify: `oracle/docs/composition-root-wiring-guide.md`

**Step 1: Add section after "What Is Not Allowed in Composition"**

Add a new `## Naming Discipline` section:

```markdown
## Naming Discipline

Name adapters by protocol or capability, not by what they currently connect to.

The adapter's identity is the protocol it speaks (e.g., "OpenAI-compatible HTTP LLM client"). What sits behind the URL — a vendor, a proxy, a mock — is configuration, not identity.

Rules:
- File names, exports, and internal function names must describe the adapter's protocol, not a specific service.
- Error messages must be role-based ("LLM request timed out"), not service-branded ("OpenRouter request timed out").
- Environment variable names must be role-based (`LLM_API_KEY`), not service-branded (`OPENROUTER_API_KEY`).
- Litmus test: can you switch the service by changing only config values (URLs, credentials) without renaming any files, functions, or env vars? If not, service identity has leaked into code identity.
```

**Step 2: Run tests**

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: all pass (doc-only change).

**Step 3: Commit**

```bash
git add oracle/docs/composition-root-wiring-guide.md
git commit -m "add naming discipline rule to composition root guide"
```

---

### Task 2: Update the oracle-nomos wiring plan to use LLM_ENDPOINT_URL

**Files:**
- Modify: `oracle/docs/plans/2026-02-28-oracle-nomos-wiring.md`

**Step 1: Replace all `LLM_BASE_URL` references with `LLM_ENDPOINT_URL`**

Throughout the plan:
- `LLM_BASE_URL` → `LLM_ENDPOINT_URL`
- Default value: `https://nomos.enoa.ai/v1/chat/completions` (full URL, no path concatenation)

**Step 2: Update adapter change description**

In Tasks 1 and 3 (adapter files), replace the URL construction change:

Old plan says:
```
- `baseUrl = "https://openrouter.ai"` → `baseUrl = "https://nomos.enoa.ai"`
- `${baseUrl}/api/v1/chat/completions` → `${baseUrl}/v1/chat/completions`
```

New:
```
- Parameter: `baseUrl = "https://openrouter.ai"` → `endpointUrl = "https://nomos.enoa.ai/v1/chat/completions"`
- URL construction: `${baseUrl}/api/v1/chat/completions` → `endpointUrl` (use directly, no concatenation)
```

**Step 3: Update composition root change description**

In Task 5 (worker-fetch-assembler), replace:
- `DEFAULT_LLM_BASE_URL = "https://nomos.enoa.ai"` → `DEFAULT_LLM_ENDPOINT_URL = "https://nomos.enoa.ai/v1/chat/completions"`
- `config.llmBaseUrl` → `config.llmEndpointUrl`
- Env var resolution: `"LLM_BASE_URL"` → `"LLM_ENDPOINT_URL"`

**Step 4: Update config files description**

In Task 7:
- `.dev.vars.example`: `LLM_BASE_URL=https://nomos.enoa.ai` → `LLM_ENDPOINT_URL=https://nomos.enoa.ai/v1/chat/completions`

**Step 5: Update test assertions**

In Tasks 2, 4, and 6 — URL assertions use the full endpoint URL value, not base + path.

**Step 6: Update CI smoke description**

In Task 8: all references to `LLM_BASE_URL` → `LLM_ENDPOINT_URL`.

**Step 7: Commit**

```bash
git add oracle/docs/plans/2026-02-28-oracle-nomos-wiring.md
git commit -m "update wiring plan: use LLM_ENDPOINT_URL instead of LLM_BASE_URL"
```

---

### Task 3: Push

```bash
git push origin trunk
```
