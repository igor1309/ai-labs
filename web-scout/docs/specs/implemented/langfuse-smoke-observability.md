---
date: 2026-03-03
model: claude-sonnet-4-6
description: "Spec: Langfuse observability for web-scout smoke script v0.0.3"
updated: 2026-03-03
---

# Langfuse Smoke Observability

## Goal

Instrument `smoke.py` with opt-in Langfuse tracing so each smoke run produces one trace with nested spans for the scout agent, MCP tool call, and judge agent, including token usage and cost — with zero behavioural change when Langfuse keys are absent.

## Public interface

No change to the existing smoke script CLI or exit codes.

### New optional env vars

| Variable | Description |
|---|---|
| `LANGFUSE_SECRET_KEY` | Langfuse secret key for the target project |
| `LANGFUSE_PUBLIC_KEY` | Langfuse public key for the target project |
| `LANGFUSE_BASE_URL` | Langfuse instance URL; optional, falls back to the Langfuse cloud endpoint when absent |

If all three are absent, instrumentation is a no-op — the script runs and exits exactly as before.

When using the local Docker stack, set `LANGFUSE_PUBLIC_KEY` = `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` = `LANGFUSE_INIT_PROJECT_SECRET_KEY` from `web-scout/.env`.

## Behavior rules

1. When Langfuse keys are absent, the script behaves identically to v0.0.2 — no errors, no warnings.
2. When keys are present, a single trace is created at the start of `run()` and all spans are recorded before `run()` returns.
3. Scout span starts before `scout(query)` is called and ends when it returns (success or exception).
4. Judge span starts before `judge(query, result, logs)` is called and ends when it returns.
5. The MCP `search` tool call is captured as a child span of the scout span named `mcp-search`, via `scout_span.start_span(name="mcp-search", input={"query": query})`. The span is ended in a `finally` block and its output recorded via `mcp_span.update(output=result)`.
6. ~~LLM generations (token counts, cost) are captured for both agents.~~ **Not implemented.** CrewAI/LiteLLM registers a global OTel TracerProvider before Langfuse can claim it, blocking Langfuse's OTel-based LLM auto-instrumentation. Manual LLM wrapping is not attempted as it requires reaching into CrewAI internals. Track as future work when CrewAI restores a Langfuse integration hook.
7. A scout exception is recorded on the scout span (`level=ERROR`) and the trace before re-raising.
8. A judge FAIL verdict sets trace `level=ERROR`.
9. `langfuse.flush()` is called exactly once, after `run()` resolves (pass or fail), never on each span.
10. The trace is named `web-scout-smoke`.
11. The scout span is named `scout-agent`; the judge span is named `judge-agent`; the MCP tool call span is named `mcp-search`.

## Implementation notes (Langfuse v3 API)

Concrete v3 methods used in `smoke.py`:
- `langfuse.start_span(name=...)` — creates the root trace span
- `trace.start_span(name=...)` — creates child spans (scout-agent, judge-agent, mcp-search)
- `span.update(level=..., output=...)` — sets span metadata
- `span.end()` — closes a span
- `langfuse.flush()` — flushes all pending spans to the server (called once)

## Tests

1. `noLangfuseKeys_doesNotInstantiateLangfuseClient` — when keys absent, no Langfuse object created
2. `langfuseKeys_present_clientInstantiated` — when all three keys are present, client is created with `secret_key`, `public_key`, and `host` set from the respective env vars
3. `smokePass_traceFlushed` — `langfuse.flush()` called exactly once on PASS
4. `smokeFail_traceFlushed` — `langfuse.flush()` called exactly once on FAIL path
5. `scoutException_spanMarkedError_traceFlushed` — exception path still flushes
6. `traceOutput_isVerdictString` — trace output matches the printed verdict
7. `traceLevelError_onFail` — trace `level=ERROR` when smoke returns 1
8. `traceLevelDefault_onPass` — trace `level=DEFAULT` when smoke returns 0
9. `mcpSearch_capturedAsChildOfScoutSpan` — `scout_span.start_span` is called with `name="mcp-search"` and `input={"query": query}` when a scout_span is provided; `mcp_span.update(output=result)` and `mcp_span.end()` are called

All existing `smoke_test.py` tests must continue to pass unchanged.

## Done criteria

- `smoke.py` runs to completion with PASS/FAIL exit as before when Langfuse keys are absent.
- When keys are present, one trace appears in the Langfuse UI per run with scout, judge, and MCP spans nested correctly (`web-scout-smoke → scout-agent → mcp-search`, `web-scout-smoke → judge-agent`).
- Token/cost fields: not populated — see rule 6 for known limitation.
- All 21 unit tests pass (9 Langfuse observability tests + 12 base smoke tests).
