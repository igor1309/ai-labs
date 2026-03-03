---
date: 2026-03-03
model: claude-opus-4-6
description: "Spec: decompose smoke test into core MCP validation + Langfuse wrapper"
---

# Spec: Smoke test decomposition

## Goal

Separate the web-scout smoke test into a core MCP validation function and an optional Langfuse observability wrapper, so each concern can be read, tested, and evolved independently.

## Public interface

No change to the CLI surface:

```bash
set -a && source web-scout/.env && set +a
web-scout/.venv/bin/python3 web-scout/smoke.py
```

Exit 0 = PASS, exit 1 = FAIL. Prints verdict and explanation. Langfuse tracing remains opt-in via env vars.

## Components

### Core smoke function (`run`)

Pure MCP validation logic. No span parameters, no Langfuse imports, no `if trace` guards.

Signature:

```python
def run(scout, judge, docker_logs, env=None, print_fn=print) -> int:
```

- `scout(query: str) -> str` — calls the MCP search tool, returns raw JSON
- `judge(query: str, results_json: str, logs: str) -> str` — evaluates results
- `docker_logs() -> str` — captures SearXNG container output

The `scout` callable no longer accepts a `scout_span` parameter. The core function does not know observability exists.

### Langfuse wrapper

Wraps the core `scout` and `judge` callables to add span lifecycle, then delegates to `run()`.

```python
def run_with_langfuse(langfuse, scout, judge, docker_logs, env=None, print_fn=print) -> int:
```

Responsibilities:
- Create root span `web-scout-smoke`
- Wrap `scout` to add `scout-agent` and `mcp-search` child spans
- Wrap `judge` to add `judge-agent` span
- Set span level (`ERROR` / `DEFAULT`) based on outcome
- Record verdict as trace output
- Call `langfuse.flush()` in `finally`
- Delegate all validation logic to core `run()`

### `__main__` block

```python
if __name__ == "__main__":
    env = dict(os.environ)
    langfuse_client = make_langfuse_client(env)
    scout = make_scout(env)
    judge = make_judge(env)
    docker_logs = make_docker_logs()

    if langfuse_client:
        code = run_with_langfuse(langfuse_client, scout, judge, docker_logs, env=env)
    else:
        code = run(scout, judge, docker_logs, env=env)
    sys.exit(code)
```

### `_run_with_mcp_span`

Moves into the Langfuse wrapper scope. The core `make_scout` returns a plain `scout(query) -> str` with no span parameter.

## Behavior rules

1. Core `run()` has zero Langfuse imports or references.
2. `scout` signature is `(query: str) -> str` — no `scout_span` parameter.
3. When Langfuse env vars are absent, `run()` is called directly — no wrapper overhead.
4. When Langfuse env vars are present, `run_with_langfuse()` wraps scout/judge and delegates to `run()`.
5. The span tree is unchanged: `web-scout-smoke → scout-agent → mcp-search`, `→ judge-agent`.
6. Error span marking (scout exception, judge FAIL) is unchanged.
7. `langfuse.flush()` is called in `finally` regardless of outcome.
8. All existing validation rules (rules 1–7 from the current smoke spec) remain in core `run()`.

## Tests

### Core tests (existing, unchanged behavior)

1. `exits_nonzero_whenSearxngUrlMissing`
2. `exits_nonzero_whenNomosApiKeyMissing`
3. `exits_nonzero_whenNomosBaseUrlMissing`
4. `exits_nonzero_whenScoutReturnsNoResult`
5. `exits_nonzero_whenResultsJsonUnparseable`
6. `exits_nonzero_whenResultsArrayEmpty`
7. `exits_nonzero_whenResultMissingTitleOrUrl`
8. `exits_nonzero_whenJudgeVerdictIsFail`
9. `exits_nonzero_whenJudgeVerdictIsUnparseable`
10. `logsUnavailable_doesNotAbort_scriptContinuesToJudge`
11. `exits_zero_whenSearxngRunningAndResultsRelevant`

These tests call `run()` directly. No mock Langfuse setup needed.

### Wrapper tests

12. `smokePass_traceFlushed` — `run_with_langfuse` flushes on PASS
13. `smokeFail_traceFlushed` — `run_with_langfuse` flushes on FAIL
14. `scoutException_spanMarkedError_traceFlushed` — scout-agent span and root trace marked ERROR
15. `traceOutput_isVerdictString` — trace output is the judge verdict text
16. `traceLevelError_onFail` — trace level is ERROR when judge says FAIL
17. `traceLevelDefault_onPass` — trace level is DEFAULT when judge says PASS
18. `mcpSearchSpan_recordsInputAndOutput` — mcp-search child span created with query input and result output

### Removed from core tests

The `scout_span` parameter is gone from the core scout signature, so core tests no longer pass or mock it.

## Done criteria

- Core `run()` contains zero references to Langfuse, spans, or traces.
- `scout` callables accept `(query: str)` only — no span parameter.
- All 18 tests pass.
- Live smoke run with Langfuse produces the same span tree as before.
- Live smoke run without Langfuse produces identical output with no wrapper overhead.
