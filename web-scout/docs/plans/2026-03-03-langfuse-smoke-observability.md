---
date: 2026-03-03
model: claude-sonnet-4-6
description: "Plan: Langfuse observability for web-scout smoke script (v0.0.3)"
---

# Langfuse Smoke Observability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Instrument `smoke.py` with opt-in Langfuse tracing — one trace per run with nested scout, judge, and MCP spans, including token/cost capture — with zero behavioural change when Langfuse keys are absent.

**Architecture:** Add optional `langfuse=None` parameter to `run()`. When provided, `run()` creates a trace, wraps `scout()` and `judge()` calls in named spans, sets trace level from the verdict, and calls `langfuse.flush()` exactly once via `try/finally`. A new `make_langfuse_client(env)` factory handles opt-in client creation at the CLI entry point. `make_scout()` and `make_judge()` receive the Langfuse client and parent observation IDs so the real CrewAI executions emit nested MCP and LLM spans. All existing `run()` tests are unchanged.

**Tech Stack:** Python 3.13, `langfuse>=0.30.0`, `unittest.mock.MagicMock`, pytest

**Execution lock:**
- Worktree required: yes
- Expected worktree: `worktrees/langfuse-smoke-observability`
- Expected branch: `codex/langfuse-smoke-observability`
- Preflight check: [ ] done

---

## Preflight

Before any file edits:

```bash
git worktree add -b codex/langfuse-smoke-observability worktrees/langfuse-smoke-observability trunk
```

Verify:

```bash
git worktree list --porcelain
git branch --show-current
```

Expected: branch is `codex/langfuse-smoke-observability`, cwd is inside `worktrees/langfuse-smoke-observability`.

---

## Task 1: Add langfuse dependency

**Files:**
- Modify: `web-scout/requirements.txt`

**Step 1: Add langfuse to requirements.txt**

Append a new line to `web-scout/requirements.txt`:

```
langfuse>=0.30.0
```

Final file should be:

```
crewai[tools]>=0.100.0
mcp>=1.0.0
pytest>=8.0.0
langfuse>=0.30.0
```

**Step 2: Install the new dependency**

Run from the `web-scout/` directory (using the existing venv):

```bash
web-scout/.venv/bin/pip install langfuse
```

Expected: installs without error. Verify:

```bash
web-scout/.venv/bin/python3 -c "import langfuse; print(langfuse.__version__)"
```

Expected: prints a version string (e.g. `2.x.x` or `0.30.x`).

**Step 3: Run existing tests to confirm nothing broke**

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v
```

Expected: all 12 existing tests pass.

**Step 4: Commit**

```bash
git add web-scout/requirements.txt
git commit -m "add langfuse dependency"
```

---

## Task 2: Write 8 new unit tests (RED)

**Files:**
- Modify: `web-scout/tests/smoke_test.py`

**Step 1: Add imports and helpers at the top of the test file**

Add after the existing imports (`import json`, `import pytest`, `from smoke import run`):

```python
from unittest.mock import MagicMock, call, patch
```

Add these two helpers in the `# --- Helpers ---` section, after `make_deps`:

```python
def make_langfuse_env(**overrides):
    base = {
        "LANGFUSE_SECRET_KEY": "sk-test",
        "LANGFUSE_PUBLIC_KEY": "pk-test",
        "LANGFUSE_BASE_URL": "http://langfuse:3000",
    }
    base.update(overrides)
    return {k: v for k, v in base.items() if v is not None}


def make_mock_langfuse():
    lf = MagicMock()
    trace = MagicMock()
    scout_span = MagicMock()
    judge_span = MagicMock()
    lf.trace.return_value = trace
    trace.span.side_effect = lambda name, **kw: scout_span if name == "scout-agent" else judge_span
    return lf, trace, scout_span, judge_span
```

**Step 2: Add 8 new tests at the end of the file**

```python
# --- Langfuse observability tests ---

def test_noLangfuseKeys_doesNotInstantiateLangfuseClient():
    from smoke import make_langfuse_client
    client = make_langfuse_client({})
    assert client is None


def test_langfuseKeys_present_clientInstantiated():
    with patch("langfuse.Langfuse") as MockLangfuse:
        mock_instance = MagicMock()
        MockLangfuse.return_value = mock_instance
        from smoke import make_langfuse_client
        client = make_langfuse_client(make_langfuse_env())
        MockLangfuse.assert_called_once_with(
            secret_key="sk-test",
            public_key="pk-test",
            host="http://langfuse:3000",
        )
        assert client is mock_instance


def test_smokePass_traceFlushed():
    lf, *_ = make_mock_langfuse()
    run(**make_deps(), langfuse=lf)
    lf.flush.assert_called_once()


def test_smokeFail_traceFlushed():
    lf, *_ = make_mock_langfuse()
    run(**make_deps(judge=make_judge(result="FAIL not relevant")), langfuse=lf)
    lf.flush.assert_called_once()


def test_scoutException_spanMarkedError_traceFlushed():
    lf, trace, scout_span, _ = make_mock_langfuse()
    run(**make_deps(scout=make_scout(raises=True)), langfuse=lf)
    scout_span.update.assert_any_call(level="ERROR")
    lf.flush.assert_called_once()


def test_traceOutput_isVerdictString():
    lf, trace, *_ = make_mock_langfuse()
    run(**make_deps(judge=make_judge(result="PASS results look relevant")), langfuse=lf)
    trace.update.assert_any_call(output="PASS results look relevant", level="DEFAULT")


def test_traceLevelError_onFail():
    lf, trace, *_ = make_mock_langfuse()
    code = run(**make_deps(judge=make_judge(result="FAIL not relevant")), langfuse=lf)
    assert code == 1
    trace.update.assert_any_call(output="FAIL not relevant", level="ERROR")


def test_traceLevelDefault_onPass():
    lf, trace, *_ = make_mock_langfuse()
    code = run(**make_deps(), langfuse=lf)
    assert code == 0
    trace.update.assert_any_call(output="PASS results look relevant", level="DEFAULT")
```

Note: `make_judge()` default result is `"PASS results look relevant"`, so tests 6 and 8 use that default.

**Step 3: Run tests to verify RED**

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v -k "Langfuse or langfuse or Trace or trace or Flush or flush"
```

Expected: all 8 new tests fail. Typical failure for tests 3–8: `TypeError: run() got an unexpected keyword argument 'langfuse'`. For tests 1–2: `ImportError: cannot import name 'make_langfuse_client' from 'smoke'`. This confirms the tests are wired.

**Step 4: Confirm existing tests still pass**

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v -k "not Langfuse and not langfuse and not Trace and not trace and not Flush and not flush"
```

Expected: all 12 original tests pass.

**Step 5: Commit**

```bash
git add web-scout/tests/smoke_test.py
git commit -m "add langfuse observability tests (red)"
```

---

## Task 3: Implement `make_langfuse_client()` — GREEN for tests 1–2

**Files:**
- Modify: `web-scout/smoke.py`

**Step 1: Add `make_langfuse_client()` to smoke.py**

Append after the `run()` function and before `_make_llm()`:

```python
def make_langfuse_client(env):
    """Returns a Langfuse client when keys are present, None otherwise."""
    secret = env.get("LANGFUSE_SECRET_KEY")
    public = env.get("LANGFUSE_PUBLIC_KEY")
    if not secret or not public:
        return None
    from langfuse import Langfuse
    kwargs = {"secret_key": secret, "public_key": public}
    host = env.get("LANGFUSE_BASE_URL")
    if host:
        kwargs["host"] = host
    return Langfuse(**kwargs)
```

**Step 2: Run tests 1–2 to verify GREEN**

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py::test_noLangfuseKeys_doesNotInstantiateLangfuseClient web-scout/tests/smoke_test.py::test_langfuseKeys_present_clientInstantiated -v
```

Expected: both pass.

**Step 3: Run all tests to confirm no regression**

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v
```

Expected: 14 pass, 6 fail (tests 3–8 still failing because `run()` doesn't accept `langfuse=` yet).

**Step 4: Commit**

```bash
git add web-scout/smoke.py
git commit -m "add make_langfuse_client()"
```

---

## Task 4: Instrument `run()` with trace/spans — GREEN for tests 3–8

**Files:**
- Modify: `web-scout/smoke.py`

**Step 1: Replace `run()` signature and body**

Replace the entire `run()` function with the instrumented version below. The logic is identical to v0.0.2 — only Langfuse instrumentation is added around the agent calls and at the return paths via `try/finally`.

```python
def run(scout, judge, docker_logs, env=None, print_fn=print, langfuse=None):
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

    trace = langfuse.trace(name="web-scout-smoke") if langfuse is not None else None
    try:
        scout_span = trace.span(name="scout-agent") if trace else None
        try:
            result = scout(QUERY)
        except Exception:
            if scout_span:
                scout_span.update(level="ERROR")
                scout_span.end()
            if trace:
                trace.update(level="ERROR")
            print_fn("FAIL: scout agent raised an exception")
            return 1
        if scout_span:
            scout_span.end()

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

        judge_span = trace.span(name="judge-agent") if trace else None
        judge_result = judge(QUERY, result, logs)
        if judge_span:
            judge_span.end()

        words = (judge_result or "").strip().split()
        first_word = words[0].upper() if words else ""

        if first_word not in ("PASS", "FAIL"):
            print_fn("FAIL: judge verdict unparseable (must start with PASS or FAIL)")
            return 1
        if first_word == "FAIL":
            if trace:
                trace.update(output=judge_result, level="ERROR")
            print_fn(f"FAIL\n{judge_result}")
            return 1

        if trace:
            trace.update(output=judge_result, level="DEFAULT")
        print_fn(f"PASS\n{judge_result}")
        return 0
    finally:
        if langfuse is not None:
            langfuse.flush()
```

**Step 2: Run all 8 new tests to verify GREEN**

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v -k "Langfuse or langfuse or Trace or trace or Flush or flush"
```

Expected: all 8 pass.

**Step 3: Run full test suite to confirm no regression**

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v
```

Expected: all 20 tests pass (12 original + 8 new).

**Step 4: Commit**

```bash
git add web-scout/smoke.py
git commit -m "instrument run() with langfuse trace and spans"
```

---

## Task 5: Wire production MCP and LLM spans in `make_scout()` and `make_judge()`

This task wires the real CrewAI execution to Langfuse for nested span visibility in the Langfuse UI. It does not affect unit tests.

**Files:**
- Modify: `web-scout/smoke.py`

**Step 1: Update `make_scout()` to accept Langfuse context**

Replace the `make_scout(env)` function signature and add a `LangfuseCallbackHandler` to the crew kickoff. The callback links the CrewAI execution to the existing scout span created in `run()`.

First, check the installed Langfuse version's callback API:

```bash
web-scout/.venv/bin/python3 -c "from langfuse.callback import LangfuseCallbackHandler; print('ok')"
```

If that import succeeds, use the callback approach. The updated `make_scout()`:

```python
def make_scout(env, langfuse_client=None, parent_observation_id=None):
    from pathlib import Path
    from crewai import Agent, Task, Crew
    from crewai_tools import MCPServerAdapter
    from mcp import StdioServerParameters

    llm = _make_llm(env)
    index_path = str(Path(__file__).parent / "src" / "index.js")

    def scout(query):
        mcp_params = StdioServerParameters(
            command="node",
            args=[index_path],
            env=dict(env),
        )
        with MCPServerAdapter(mcp_params) as mcp:
            mcp_search = next((t for t in mcp if t.name == "search"), None)
            if mcp_search is None:
                raise ValueError("search tool not found in MCP server")

            from crewai.tools import BaseTool
            from pydantic import BaseModel, Field

            class SearchInput(BaseModel):
                query: str = Field(..., description="Search query string")

            class SearchTool(BaseTool):
                name: str = "search"
                description: str = "Search the web using SearXNG and return JSON results"
                args_schema: type[BaseModel] = SearchInput

                def _run(self, query: str) -> str:
                    return mcp_search._run(query=query)

            search_tools = [SearchTool()]
            agent = Agent(
                role="Web Scout",
                goal=f'Search for "{query}" and return the raw JSON result verbatim',
                backstory="You are a web search agent. Use the search tool and return only the raw JSON result, nothing else.",
                tools=search_tools,
                llm=llm,
                verbose=False,
            )
            task = Task(
                description=f'Use the search tool to search for "{query}" and return only the raw JSON result verbatim, with no other text.',
                expected_output="Raw JSON string from the search tool",
                agent=agent,
            )
            crew = Crew(agents=[agent], tasks=[task], verbose=False)

            callbacks = []
            if langfuse_client is not None and parent_observation_id is not None:
                from langfuse.callback import LangfuseCallbackHandler
                callbacks = [LangfuseCallbackHandler(
                    observation_id=parent_observation_id,
                    update_stateful_client=False,
                )]

            output = crew.kickoff(callbacks=callbacks).raw
            if not output or not output.strip():
                raise ValueError("Scout agent produced empty output")
            return output.strip()

    return scout
```

**Step 2: Update `make_judge()` similarly**

Replace `make_judge(env)` with:

```python
def make_judge(env, langfuse_client=None, parent_observation_id=None):
    from crewai import Agent, Task, Crew

    llm = _make_llm(env)

    def judge(query, results_json, logs):
        agent = Agent(
            role="Search Result Judge",
            goal=f'Evaluate web search results for the query "{query}"',
            backstory="You evaluate search result quality. Begin your response with PASS or FAIL.",
            tools=[],
            llm=llm,
            verbose=False,
        )
        task = Task(
            description=(
                f'Evaluate these web search results for the query "{query}".\n\n'
                f'Results JSON:\n{results_json}\n\n'
                f'Docker logs:\n{logs}\n\n'
                'Start your answer with PASS or FAIL, then explain why.'
            ),
            expected_output="Verdict starting with PASS or FAIL followed by explanation",
            agent=agent,
        )
        crew = Crew(agents=[agent], tasks=[task], verbose=False)

        callbacks = []
        if langfuse_client is not None and parent_observation_id is not None:
            from langfuse.callback import LangfuseCallbackHandler
            callbacks = [LangfuseCallbackHandler(
                observation_id=parent_observation_id,
                update_stateful_client=False,
            )]

        return crew.kickoff(callbacks=callbacks).raw or ""

    return judge
```

**Step 3: Update the CLI entry point to wire Langfuse end-to-end**

Replace the `if __name__ == "__main__":` block with:

```python
if __name__ == "__main__":
    import sys

    env = dict(os.environ)
    langfuse_client = make_langfuse_client(env)
    code = run(
        scout=make_scout(env),
        judge=make_judge(env),
        docker_logs=make_docker_logs(),
        env=env,
        langfuse=langfuse_client,
    )
    sys.exit(code)
```

Note: The MCP and LLM spans inside `make_scout()` and `make_judge()` are linked to the trace via the `LangfuseCallbackHandler`. The `parent_observation_id` wiring requires capturing the span IDs from the trace created inside `run()`. If the Langfuse SDK version does not support `observation_id` in `LangfuseCallbackHandler`, remove that parameter and the callbacks will create independent traces (still useful for LLM cost capture). Verify the exact API from the installed version's source or docs before including it.

**Step 4: Run full test suite to confirm no regression**

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v
```

Expected: all 20 tests pass.

**Step 5: Commit**

```bash
git add web-scout/smoke.py
git commit -m "wire langfuse callbacks in make_scout and make_judge for mcp/llm spans"
```

---

## Task 6: Update log, move spec, push and open PR

**Files:**
- Modify: `web-scout/docs/log.md`
- Move: `web-scout/docs/specs/langfuse-smoke-observability.md` → `web-scout/docs/specs/implemented/langfuse-smoke-observability.md`
- Move: `web-scout/docs/plans/2026-03-03-langfuse-smoke-observability.md` → `web-scout/docs/plans/implemented/2026-03-03-langfuse-smoke-observability.md`

**Step 1: Add log entry to `web-scout/docs/log.md`**

Prepend under the `## 2026-03-03` section (after the existing first entry for that date):

```
Add Langfuse observability to smoke script (v0.0.3): opt-in tracing via `LANGFUSE_SECRET_KEY`/`LANGFUSE_PUBLIC_KEY`/`LANGFUSE_BASE_URL`; one trace per run with scout-agent, judge-agent spans and trace level; `langfuse.flush()` via try/finally; zero behavioural change when keys absent; 8 new unit tests, all 20 smoke tests pass.
```

**Step 2: Move spec and plan to implemented**

```bash
git mv web-scout/docs/specs/langfuse-smoke-observability.md web-scout/docs/specs/implemented/langfuse-smoke-observability.md
git mv web-scout/docs/plans/2026-03-03-langfuse-smoke-observability.md web-scout/docs/plans/implemented/2026-03-03-langfuse-smoke-observability.md
```

**Step 3: Run final full test suite**

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v
```

Expected: all 20 tests pass.

**Step 4: Commit and push**

```bash
git add web-scout/docs/log.md web-scout/docs/specs/implemented/langfuse-smoke-observability.md web-scout/docs/plans/implemented/2026-03-03-langfuse-smoke-observability.md
git commit -m "log v0.0.3 langfuse observability; move spec and plan to implemented"
git push -u origin codex/langfuse-smoke-observability
```

**Step 5: Open PR**

```bash
gh pr create --title "smoke script v0.0.3: langfuse observability" --body "$(cat <<'EOF'
## Summary
- Add opt-in Langfuse tracing to `smoke.py` — zero behavioural change when keys absent
- New `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_BASE_URL` env vars
- `run()` creates one trace (`web-scout-smoke`) with `scout-agent` and `judge-agent` spans
- Scout exception marks span and trace `level=ERROR`; judge FAIL sets trace `level=ERROR`
- `langfuse.flush()` called exactly once via `try/finally` after all agent logic
- 8 new unit tests; all 20 smoke tests pass

## Test plan
- [ ] `web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v` — all 20 pass
- [ ] Manual: run with Langfuse keys pointing at local Docker stack, confirm trace in UI with scout/judge spans
EOF
)"
```

---

## Notes

### LangfuseCallbackHandler API

The `observation_id` / `parent_observation_id` parameter name and availability varies by Langfuse SDK version. Before Task 5, check the exact constructor signature:

```bash
web-scout/.venv/bin/python3 -c "import inspect; from langfuse.callback import LangfuseCallbackHandler; print(inspect.signature(LangfuseCallbackHandler.__init__))"
```

If `observation_id` is not supported, remove that parameter from the callback instantiation. The callbacks will still capture LLM generations and costs under a separate trace, which is still valuable for observability even without strict span nesting.

### Local Langfuse Docker stack

When testing with the local stack (see `web-scout/docs/plans/2026-03-03-langfuse-local-docker.md`), set:

```bash
export LANGFUSE_PUBLIC_KEY=<LANGFUSE_INIT_PROJECT_PUBLIC_KEY from web-scout/.env>
export LANGFUSE_SECRET_KEY=<LANGFUSE_INIT_PROJECT_SECRET_KEY from web-scout/.env>
export LANGFUSE_BASE_URL=http://localhost:3000
```

Then run `python3 web-scout/smoke.py` and check `http://localhost:3000` for the trace.
