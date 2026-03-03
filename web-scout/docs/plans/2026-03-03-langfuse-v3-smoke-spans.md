---
date: 2026-03-03
model: claude-sonnet-4-6
description: "Plan: complete Langfuse v3 observability for smoke script — MCP span and LLM generations"
---

# Langfuse v3 Smoke Observability — Remaining Spans

**Goal:** Close the two unimplemented spec rules left after the v2→v3 API migration: MCP search child span (rule 5) and LLM generation token/cost capture (rule 6).

**Execution lock:**
- Worktree required: yes
- Expected worktree: `worktrees/langfuse-v3-smoke-spans`
- Expected branch: `codex/langfuse-v3-smoke-spans`
- Preflight check: [ ] done

---

## Current state

After today's v2→v3 API migration (`fix smoke.py langfuse v3 api`), the following rules from the spec are satisfied:

| Rule | Status |
|------|--------|
| 1 no-op when keys absent | ✅ |
| 2 single trace per run | ✅ |
| 3 scout span | ✅ |
| 4 judge span | ✅ |
| 5 MCP search child span named `mcp-search` | ❌ |
| 6 LLM token counts / cost | ❌ |
| 7 scout exception → span + trace ERROR | ✅ |
| 8 judge FAIL → trace ERROR | ✅ |
| 9 flush exactly once | ✅ |
| 10 trace name `web-scout-smoke` | ✅ |
| 11 span names (scout-agent, judge-agent, mcp-search) | ❌ partial — mcp-search missing |

Additional finding: `Overriding of current TracerProvider is not allowed` is printed on every run. Langfuse v3 initialises an OTel TracerProvider at import time, but CrewAI/LiteLLM claims the global provider first. This may block Langfuse's OTel-based LLM auto-instrumentation.

---

## Step 1 — Investigate OTel TracerProvider conflict

**Why first:** determines whether rule 6 is achievable via OTel auto-instrumentation or needs a different approach.

**Check:** `CREWAI_TRACING_ENABLED=false` is already set in `.env`. Verify it prevents the conflict:

```bash
set -a && source web-scout/.env && set +a
web-scout/.venv/bin/python3 -c "
from langfuse import Langfuse
from crewai import LLM
" 2>&1 | grep -i "tracer\|override"
```

**Outcomes:**

- **No warning** → conflict is resolved; proceed to Step 2 and Step 3 (LLM spans via OTel auto-instrumentation will work).
- **Warning persists** → CrewAI registers its provider regardless of `CREWAI_TRACING_ENABLED`. In that case Step 3 must use a different approach (see Step 3 options).

No code changes in this step. Document the finding and proceed.

---

## Step 2 — MCP search child span (rules 5, 11)

`SearchTool._run()` in `make_scout()` is the exact callsite for the MCP call. Wrap it to create a child span of `scout_span`.

**Signature change:** `make_scout(env)` → `make_scout(env, scout_span=None)`

**In `SearchTool._run()`:**

```python
def _run(self, query: str) -> str:
    mcp_span = scout_span.start_span(name="mcp-search", input={"query": query}) if scout_span else None
    try:
        result = mcp_search._run(query=query)
        if mcp_span:
            mcp_span.update(output=result)
        return result
    finally:
        if mcp_span:
            mcp_span.end()
```

**In `run()`:** pass `scout_span` when constructing the scout closure:

```python
scout_span = trace.start_span(name="scout-agent") if trace else None
result = scout(QUERY)   # make_scout already closed over scout_span
```

`run()` creates `scout_span` before calling `scout()`, so it must be passed into `make_scout()` at construction time, not at call time. `make_scout` signature becomes `make_scout(env, scout_span=None)`.

**New unit test:** `mcpSearch_capturedAsChildOfScoutSpan` — verify `scout_span.start_span` is called with `name="mcp-search"` when a scout_span is provided.

**Gate:** all 21 unit tests pass; live smoke produces `web-scout-smoke → scout-agent → mcp-search` in Langfuse UI.

---

## Step 3 — LLM generation spans (rule 6)

Two paths depending on Step 1 outcome.

### Path A: OTel conflict resolved

Langfuse v3 auto-instruments LiteLLM calls via OTel when it holds the global TracerProvider. No code changes needed — token counts and cost appear automatically in the Langfuse UI as generation spans nested under the active span.

Verify by running the smoke test and checking that `scout-agent` and `judge-agent` spans in the Langfuse UI show token usage.

### Path B: OTel conflict persists

Rule 6 is not achievable without either OTel auto-instrumentation or CrewAI callback support (which was removed). Options:

1. **Drop rule 6 from spec** — update the spec and done criteria to exclude token/cost. Document the limitation in the spec as a known constraint of the current CrewAI version.
2. **Defer** — track as a future task when CrewAI restores a Langfuse integration hook.

Do not attempt manual LLM wrapping — it requires reaching into CrewAI internals and creates fragile coupling.

---

## Step 4 — Update spec

File: `web-scout/docs/specs/implemented/langfuse-smoke-observability.md`

Changes:
- Name the concrete v3 API methods used (`start_span`, `update`, `end`, `flush`) in the behavior rules or a new "Implementation notes" section.
- Add test case for `mcp-search` child span.
- Either confirm rule 6 is satisfied (Path A) or narrow the done criteria to exclude token/cost and note the CrewAI limitation (Path B).

---

## Step 5 — Commit and archive

```
git add web-scout/smoke.py web-scout/tests/smoke_test.py
git commit -m "add mcp-search child span to smoke langfuse tracing"

git add web-scout/docs/specs/implemented/langfuse-smoke-observability.md
git commit -m "update langfuse smoke spec: v3 api methods, mcp-search test"
```

Move this plan to `implemented/` and update `web-scout/docs/log.md`.
