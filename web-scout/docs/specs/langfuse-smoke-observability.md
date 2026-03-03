---
date: 2026-03-03
model: claude-sonnet-4-6
description: "Spec: Langfuse observability for web-scout smoke script v0.0.3"
---

# Langfuse Smoke Observability

## Goal

Instrument `smoke.py` with opt-in Langfuse tracing so each smoke run produces one trace with nested spans for the scout agent, MCP tool call, and judge agent, including token usage and cost — with zero behavioural change when Langfuse keys are absent.

## Public interface

No change to the existing smoke script CLI or exit codes.

### New optional env vars

| Variable | Description |
|---|---|
| `LANGFUSE_SECRET_KEY` | Langfuse secret key (`sk-lf-...`) |
| `LANGFUSE_PUBLIC_KEY` | Langfuse public key (`pk-lf-...`) |
| `LANGFUSE_BASE_URL` | Langfuse instance URL (default: `https://cloud.langfuse.com`) |

If all three are absent, instrumentation is a no-op — the script runs and exits exactly as before.

## Trace structure

One Langfuse trace per `smoke.py` invocation:

```
trace: smoke-run  (name="web-scout-smoke", input=query)
  span: scout     (name="scout-agent", input=query, output=results_json)
    span: search  (name="mcp-search", input=query, output=raw_json)
    generation: llm-call (model, input_tokens, output_tokens, cost)
  span: judge     (name="judge-agent", input={query, results_json, logs}, output=verdict)
    generation: llm-call (model, input_tokens, output_tokens, cost)
```

- Trace `output` = final verdict string (`PASS …` or `FAIL …`).
- Trace `level` = `DEFAULT` on PASS, `ERROR` on FAIL.
- Each `generation` span captures model name, token counts, and cost via Langfuse's built-in cost tracking.

## Behavior rules

1. When Langfuse keys are absent, the script behaves identically to v0.0.2 — no errors, no warnings.
2. When keys are present, a single trace is created at the start of `run()` and flushed synchronously before `run()` returns (required for short-lived scripts).
3. Scout span starts before `scout(query)` is called and ends when it returns (success or exception).
4. Judge span starts before `judge(query, result, logs)` is called and ends when it returns.
5. The MCP `search` tool call is captured as a child span of the scout span.
6. LLM generations (token counts, cost) are captured for both agents.
7. A scout exception is recorded on the scout span (`level=ERROR`) and the trace before re-raising.
8. A judge FAIL verdict sets trace `level=ERROR`.
9. `langfuse.flush()` is called exactly once, after `run()` resolves (pass or fail), never on each span.

## Tests

1. `noLangfuseKeys_doesNotInstantiateLangfuseClient` — when keys absent, no Langfuse object created
2. `langfuseKeys_present_clientInstantiated` — when keys present, client created with correct params
3. `smokePass_traceFlushed` — `langfuse.flush()` called exactly once on PASS
4. `smokeFail_traceFlushed` — `langfuse.flush()` called exactly once on FAIL path
5. `scoutException_spanMarkedError_traceFlushed` — exception path still flushes
6. `traceOutput_isVerdictString` — trace output matches the printed verdict
7. `traceLevelError_onFail` — trace `level=ERROR` when smoke returns 1
8. `traceLevelDefault_onPass` — trace `level=DEFAULT` when smoke returns 0

All existing `smoke_test.py` tests must continue to pass unchanged.

## Done criteria

- `smoke.py` runs to completion with PASS/FAIL exit as before when Langfuse keys are absent.
- When keys are present, one trace appears in the Langfuse UI per run with scout, judge, and MCP spans nested correctly, and token/cost fields populated.
- All 8 new unit tests pass; all existing smoke unit tests pass.
