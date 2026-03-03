---
date: 2026-03-03
model: claude-opus-4-6
description: "Plan: decompose smoke test into core MCP validation + Langfuse wrapper"
---

# Smoke Test Decomposition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate `smoke.py` `run()` into a pure core function (zero Langfuse references) and a `run_with_langfuse()` wrapper, so each concern is independently testable.

**Architecture:** Extract all Langfuse span lifecycle code from `run()` into `run_with_langfuse()`. The wrapper wraps the `scout` and `judge` callables to add span management, then delegates to the unchanged core `run()`. The `__main__` block dispatches based on Langfuse env var presence.

**Tech Stack:** Python 3, pytest, unittest.mock

**Execution lock:**
- Worktree required: yes
- Expected worktree: `worktrees/smoke-decomposition`
- Expected branch: `codex/smoke-decomposition`
- Preflight check: [ ] done

---

## Current state → Target state

| Aspect | Current | Target |
|--------|---------|--------|
| `run()` signature | `run(scout, judge, docker_logs, env, print_fn, langfuse=None)` | `run(scout, judge, docker_logs, env, print_fn)` — no `langfuse` param |
| `run()` body | 25+ `if trace`/`if langfuse` guards | Zero Langfuse imports or references |
| `scout` callable | `scout(query, scout_span=None)` | `scout(query) -> str` |
| `_run_with_mcp_span` | Called from `make_scout` closure, lives in module scope | Moves inside `run_with_langfuse` scope |
| `run_with_langfuse` | Does not exist | Wraps scout/judge, delegates to `run()` |
| `__main__` | `run(..., langfuse=langfuse_client)` | `if langfuse_client: run_with_langfuse(...)` else `run(...)` |
| Tests | 21 tests, core tests pass `langfuse=None` | 18 tests: 11 core (no langfuse arg), 7 wrapper |

## Reference files

- **Spec:** `web-scout/docs/specs/smoke-decomposition.md`
- **Production:** `web-scout/smoke.py`
- **Tests:** `web-scout/tests/smoke_test.py`
- **Run tests:** `./scripts/run_silent.sh "tests" npm test`
- **Python-only tests:** `web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v`

---

## Task 1: Strip Langfuse from core `run()` + update core tests

This is the largest task — it removes all Langfuse references from `run()` and updates the `scout` callable signature.

**Files:**
- Modify: `web-scout/smoke.py` (lines 1–88)
- Modify: `web-scout/tests/smoke_test.py` (lines 1–148)

### Step 1: Write updated core tests

The 11 core tests already exist and test the right behaviors. Changes needed:

1. Remove `langfuse=None` from all `run()` calls (it won't be a parameter).
2. Update `make_scout` helper — remove `scout_span=None` from the inner callable signature.
3. Remove `make_mock_langfuse` and `make_langfuse_env` helpers (they move to wrapper tests later).

Updated `make_scout` helper:

```python
def make_scout(result=VALID_RESULTS_JSON, raises=False):
    def scout(query):
        if raises:
            raise RuntimeError("scout failed")
        return result
    return scout
```

Updated `make_deps` — remove `langfuse` key (none existed, but confirm no `langfuse=None` is passed).

The 11 core tests themselves need no assertion changes — only the helper signature changes.

### Step 2: Run core tests to verify they fail

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v -k "not langfuse and not Langfuse and not smokePass and not smokeFail and not scoutException_span and not traceOutput and not traceLevel and not mcpSearch"
```

Expected: FAIL — `run()` still accepts `langfuse` param but `scout` callable signature mismatch causes TypeError in `run()` line 26 (`scout(QUERY, scout_span=scout_span)` vs new `scout(query)`).

### Step 3: Update `run()` to pure core

Remove from `run()`:
- The `langfuse=None` parameter
- Line 22: `trace = langfuse.start_span(...)` and all `if trace` guards
- Lines 24–36: scout span creation, scout_span passing, scout_span error handling
- Lines 62–65: judge span creation/ending
- Lines 74–75, 79–80: trace.update calls
- Lines 83–87: the `finally` block (langfuse flush)
- Change line 26: `scout(QUERY, scout_span=scout_span)` → `scout(QUERY)`

The resulting `run()`:

```python
def run(scout, judge, docker_logs, env=None, print_fn=print):
    if env is None:
        env = os.environ

    if not env.get("SEARXNG_URL"):
        print_fn("FAIL: SEARXNG_URL environment variable is required")
        return 1
    if not env.get("NOMOS_API_KEY"):
        print_fn("FAIL: NOMOS_API_KEY environment variable is required")
        return 1
    if not env.get("NOMOS_BASE_URL"):
        print_fn("FAIL: NOMOS_BASE_URL environment variable is required")
        return 1

    try:
        result = scout(QUERY)
    except Exception:
        print_fn("FAIL: scout agent raised an exception")
        return 1

    if not result or not result.strip():
        print_fn("FAIL: scout agent produced empty output")
        return 1

    try:
        parsed = json.loads(result)
    except (json.JSONDecodeError, ValueError):
        print_fn("FAIL: scout result is not valid JSON")
        return 1

    if not isinstance(parsed.get("results"), list) or len(parsed["results"]) == 0:
        print_fn("FAIL: results array is empty")
        return 1

    for r in parsed["results"]:
        if not r.get("title") or not r.get("url"):
            print_fn("FAIL: result missing non-empty title or url")
            return 1

    try:
        logs = docker_logs()
    except Exception:
        logs = "(unavailable)"

    judge_result = judge(QUERY, result, logs)

    words = (judge_result or "").strip().split()
    first_word = words[0].upper() if words else ""

    if first_word not in ("PASS", "FAIL"):
        print_fn("FAIL: judge verdict unparseable (must start with PASS or FAIL)")
        return 1
    if first_word == "FAIL":
        print_fn(f"FAIL\n{judge_result}")
        return 1

    print_fn(f"PASS\n{judge_result}")
    return 0
```

### Step 4: Run core tests to verify they pass

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v -k "not langfuse and not Langfuse and not smokePass and not smokeFail and not scoutException_span and not traceOutput and not traceLevel and not mcpSearch"
```

Expected: all 11 core tests (13 items with parametrize) PASS.

### Step 5: Commit

```bash
git add web-scout/smoke.py web-scout/tests/smoke_test.py
git commit -m "strip langfuse from core run(), simplify scout signature"
```

---

## Task 2: Update `make_scout` — remove `scout_span` parameter

The real `make_scout` factory in `smoke.py` still passes `scout_span` through the closure and calls `_run_with_mcp_span`. Remove the span plumbing from the production factory.

**Files:**
- Modify: `web-scout/smoke.py` (`make_scout` function, lines 128–186)

### Step 1: Update `make_scout`

Change the inner `scout` callable signature from `scout(query, scout_span=None)` to `scout(query)`.

Remove `_run_with_mcp_span` call from `SearchTool._run` — call `mcp_search._run(query=query)` directly.

Updated `SearchTool._run`:

```python
class SearchTool(BaseTool):
    name: str = "search"
    description: str = "Search the web using SearXNG and return JSON results"
    args_schema: type[BaseModel] = SearchInput

    def _run(self, query: str) -> str:
        return mcp_search._run(query=query)
```

Updated inner `scout` signature:

```python
def scout(query):
    ...
```

### Step 2: Run core tests

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v -k "not langfuse and not Langfuse and not smokePass and not smokeFail and not scoutException_span and not traceOutput and not traceLevel and not mcpSearch"
```

Expected: all 11 core tests PASS (they use the test `make_scout` helper, not the real factory, but this confirms nothing broke).

### Step 3: Commit

```bash
git add web-scout/smoke.py
git commit -m "remove scout_span from make_scout, simplify SearchTool._run"
```

---

## Task 3: Add `run_with_langfuse()` wrapper

**Files:**
- Modify: `web-scout/smoke.py` — add `run_with_langfuse` function

### Step 1: Write failing wrapper tests

Remove the old Langfuse tests (lines 150–227 in current test file) that called `run(..., langfuse=lf)`. Replace with 7 new tests that call `run_with_langfuse(...)`.

Add to `web-scout/tests/smoke_test.py`:

```python
from smoke import run_with_langfuse

# --- Wrapper helpers ---

def make_mock_langfuse():
    lf = MagicMock()
    trace = MagicMock()
    scout_span = MagicMock()
    mcp_span = MagicMock()
    judge_span = MagicMock()
    lf.start_span.return_value = trace
    trace.start_span.side_effect = lambda name, **kw: scout_span if name == "scout-agent" else judge_span
    scout_span.start_span.return_value = mcp_span
    return lf, trace, scout_span, judge_span, mcp_span


# --- Wrapper tests ---

def test_smokePass_traceFlushed():
    lf, *_ = make_mock_langfuse()
    run_with_langfuse(lf, **make_deps())
    lf.flush.assert_called_once()


def test_smokeFail_traceFlushed():
    lf, *_ = make_mock_langfuse()
    run_with_langfuse(lf, **make_deps(judge=make_judge(result="FAIL not relevant")))
    lf.flush.assert_called_once()


def test_scoutException_spanMarkedError_traceFlushed():
    lf, trace, scout_span, _, _ = make_mock_langfuse()
    run_with_langfuse(lf, **make_deps(scout=make_scout(raises=True)))
    scout_span.update.assert_any_call(level="ERROR")
    trace.update.assert_any_call(level="ERROR")
    lf.flush.assert_called_once()


def test_traceOutput_isVerdictString():
    lf, trace, *_ = make_mock_langfuse()
    run_with_langfuse(lf, **make_deps(judge=make_judge(result="PASS results look relevant")))
    trace.update.assert_any_call(output="PASS results look relevant", level="DEFAULT")


def test_traceLevelError_onFail():
    lf, trace, *_ = make_mock_langfuse()
    code = run_with_langfuse(lf, **make_deps(judge=make_judge(result="FAIL not relevant")))
    assert code == 1
    trace.update.assert_any_call(output="FAIL not relevant", level="ERROR")


def test_traceLevelDefault_onPass():
    lf, trace, *_ = make_mock_langfuse()
    code = run_with_langfuse(lf, **make_deps())
    assert code == 0
    trace.update.assert_any_call(output="PASS results look relevant", level="DEFAULT")


def test_mcpSearchSpan_recordsInputAndOutput():
    lf, trace, scout_span, _, mcp_span = make_mock_langfuse()
    code = run_with_langfuse(lf, **make_deps())
    assert code == 0
    scout_span.start_span.assert_called_once_with(name="mcp-search", input={"query": "Python programming language"})
    mcp_span.update.assert_called_once_with(output=VALID_RESULTS_JSON)
    mcp_span.end.assert_called_once()
```

Note: The wrapper tests use `make_deps()` which provides a `scout` callable with signature `scout(query)`. The wrapper must intercept the call to add span lifecycle before/after calling the original scout.

### Step 2: Run tests to verify they fail

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v
```

Expected: `ImportError: cannot import name 'run_with_langfuse' from 'smoke'`

### Step 3: Implement `run_with_langfuse`

Add to `web-scout/smoke.py` after the `run()` function:

```python
def run_with_langfuse(langfuse, scout, judge, docker_logs, env=None, print_fn=print):
    trace = langfuse.start_span(name="web-scout-smoke")
    try:
        scout_span = trace.start_span(name="scout-agent")

        original_scout = scout
        def wrapped_scout(query):
            mcp_span = scout_span.start_span(name="mcp-search", input={"query": query})
            try:
                result = original_scout(query)
                mcp_span.update(output=result)
                return result
            except Exception:
                scout_span.update(level="ERROR")
                scout_span.end()
                trace.update(level="ERROR")
                raise
            finally:
                mcp_span.end()

        def span_ending_scout(query):
            try:
                return wrapped_scout(query)
            finally:
                scout_span.end()

        original_judge = judge
        def wrapped_judge(query, results_json, logs):
            judge_span = trace.start_span(name="judge-agent")
            try:
                result = original_judge(query, results_json, logs)
                return result
            finally:
                judge_span.end()

        code = run(span_ending_scout, wrapped_judge, docker_logs, env=env, print_fn=print_fn)

        # Record verdict on trace
        # Re-read what print_fn received to get the verdict — or capture it from judge
        # Actually, we need to capture the judge result to record on trace.
        # The core run() calls judge and prints the result but doesn't return it.
        # We wrap judge to capture its return value.
        return code
    finally:
        trace.end()
        langfuse.flush()
```

**Problem:** The wrapper needs to capture the judge verdict to record on the trace, but `run()` doesn't expose it — it only returns 0 or 1. We need a different approach.

**Solution:** The wrapped judge captures its own result and records it on the trace after `run()` returns:

```python
def run_with_langfuse(langfuse, scout, judge, docker_logs, env=None, print_fn=print):
    trace = langfuse.start_span(name="web-scout-smoke")
    captured_verdict = {}

    try:
        scout_span = trace.start_span(name="scout-agent")

        original_scout = scout
        def wrapped_scout(query):
            mcp_span = scout_span.start_span(name="mcp-search", input={"query": query})
            try:
                result = original_scout(query)
                mcp_span.update(output=result)
                return result
            except Exception:
                scout_span.update(level="ERROR")
                trace.update(level="ERROR")
                raise
            finally:
                mcp_span.end()
                scout_span.end()

        original_judge = judge
        def wrapped_judge(query, results_json, logs):
            judge_span = trace.start_span(name="judge-agent")
            try:
                result = original_judge(query, results_json, logs)
                captured_verdict["text"] = result
                return result
            finally:
                judge_span.end()

        code = run(wrapped_scout, wrapped_judge, docker_logs, env=env, print_fn=print_fn)

        if "text" in captured_verdict:
            level = "ERROR" if code != 0 else "DEFAULT"
            trace.update(output=captured_verdict["text"], level=level)

        return code
    finally:
        trace.end()
        langfuse.flush()
```

**Edge case — scout exception:** When scout raises, `run()` catches it and returns 1 without calling judge. The wrapped_scout already marks `scout_span` and `trace` as ERROR. The `captured_verdict` dict stays empty, so no trace.update with verdict — which is correct (no judge ran).

### Step 4: Run tests to verify they pass

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v
```

Expected: all 18 tests pass.

### Step 5: Commit

```bash
git add web-scout/smoke.py web-scout/tests/smoke_test.py
git commit -m "add run_with_langfuse wrapper, 7 wrapper tests"
```

---

## Task 4: Update `__main__` block and clean up

**Files:**
- Modify: `web-scout/smoke.py` (`__main__` block and remove `_run_with_mcp_span`)

### Step 1: Update `__main__` block

Replace the current `__main__`:

```python
if __name__ == "__main__":
    import sys

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

### Step 2: Remove `_run_with_mcp_span`

Delete the module-level `_run_with_mcp_span` function (lines 116–125 in current file). Its logic now lives inside `run_with_langfuse`.

### Step 3: Remove old test for `_run_with_mcp_span`

Delete `test_mcpSearch_capturedAsChildOfScoutSpan` (the old test that imported `_run_with_mcp_span` directly). The new `test_mcpSearchSpan_recordsInputAndOutput` in the wrapper tests covers this behavior.

### Step 4: Run full test suite

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: all tests pass (JS + Python).

### Step 5: Commit

```bash
git add web-scout/smoke.py web-scout/tests/smoke_test.py
git commit -m "update __main__ dispatch, remove _run_with_mcp_span"
```

---

## Task 5: Remove stale `make_langfuse_client` tests that tested old integration

**Files:**
- Modify: `web-scout/tests/smoke_test.py`

### Step 1: Review remaining tests

The two `make_langfuse_client` tests (`test_noLangfuseKeys_doesNotInstantiateLangfuseClient` and `test_langfuseKeys_present_clientInstantiated`) test the factory function, not the decomposition. These are still valid and should stay — they test `make_langfuse_client` which is unchanged.

Verify the final test list matches the spec's 18 tests:

**Core (11):**
1. `test_exits_nonzero_whenSearxngUrlMissing`
2. `test_exits_nonzero_whenNomosApiKeyMissing`
3. `test_exits_nonzero_whenNomosBaseUrlMissing`
4. `test_exits_nonzero_whenScoutReturnsNoResult` (parametrized: raises + empty_output)
5. `test_exits_nonzero_whenResultsJsonUnparseable`
6. `test_exits_nonzero_whenResultsArrayEmpty`
7. `test_exits_nonzero_whenResultMissingTitleOrUrl`
8. `test_exits_nonzero_whenJudgeVerdictIsFail`
9. `test_exits_nonzero_whenJudgeVerdictIsUnparseable`
10. `test_logsUnavailable_doesNotAbort_scriptContinuesToJudge`
11. `test_exits_zero_whenSearxngRunningAndResultsRelevant`

**Wrapper (7):**
12. `test_smokePass_traceFlushed`
13. `test_smokeFail_traceFlushed`
14. `test_scoutException_spanMarkedError_traceFlushed`
15. `test_traceOutput_isVerdictString`
16. `test_traceLevelError_onFail`
17. `test_traceLevelDefault_onPass`
18. `test_mcpSearchSpan_recordsInputAndOutput`

The two `make_langfuse_client` factory tests are bonus — they don't count in the spec's 18 but are still valuable. Keep them.

### Step 2: Clean up helpers

Remove `make_langfuse_env` if it's no longer used by any test. The wrapper tests use `make_mock_langfuse()` (mock objects), not env vars.

Check: `test_langfuseKeys_present_clientInstantiated` uses `make_langfuse_env()`. Keep it.

### Step 3: Run full suite

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: all tests pass.

### Step 4: Commit (only if changes were made)

```bash
git add web-scout/tests/smoke_test.py
git commit -m "clean up test helpers after decomposition"
```

---

## Task 6: Final gates and spec archival

### Step 1: Run full test suite

```bash
./scripts/run_silent.sh "tests" npm test
```

### Step 2: Verify done criteria

- [ ] Core `run()` contains zero references to Langfuse, spans, or traces
- [ ] `scout` callables accept `(query: str)` only — no span parameter
- [ ] All 18+ tests pass
- [ ] `__main__` dispatches via `if langfuse_client: run_with_langfuse(...)` else `run(...)`

### Step 3: Move spec to implemented

```bash
mv web-scout/docs/specs/smoke-decomposition.md web-scout/docs/specs/implemented/smoke-decomposition.md
```

### Step 4: Move plan to implemented

```bash
mv web-scout/docs/plans/2026-03-03-smoke-decomposition.md web-scout/docs/plans/implemented/2026-03-03-smoke-decomposition.md
```

### Step 5: Update log

Add entry to `web-scout/docs/log.md` at the top of the `## 2026-03-03` section.

### Step 6: Commit and push

```bash
git add web-scout/docs/
git commit -m "close smoke-decomposition: move spec and plan to implemented, update log"
git push origin codex/smoke-decomposition
```

### Step 7: Create PR

```bash
gh pr create --base trunk --title "decompose smoke test: core run() + langfuse wrapper" --body "$(cat <<'EOF'
## Summary
- Extract all Langfuse span lifecycle from `run()` into `run_with_langfuse()` wrapper
- Core `run()` now has zero Langfuse references — pure MCP validation
- `scout` callable simplified to `(query: str) -> str` — no span parameter
- `__main__` dispatches based on Langfuse env var presence

## Test plan
- [ ] 11 core tests pass (call `run()` directly, no mock Langfuse)
- [ ] 7 wrapper tests pass (call `run_with_langfuse()` with mock Langfuse)
- [ ] Full `npm test` suite passes (JS + Python)
- [ ] Live smoke run with Langfuse produces same span tree
- [ ] Live smoke run without Langfuse works with no wrapper overhead
EOF
)"
```
