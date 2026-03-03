---
date: 2026-03-03
model: claude-sonnet-4-6
description: "Plan: migrate web-scout smoke script to CrewAI + nomos (v0.0.2)"
---

# web-scout Smoke Script v0.0.2 — CrewAI + nomos Migration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Claude Agent SDK JS smoke script with a Python CrewAI smoke script that routes LLM calls through nomos.

**Architecture:** `smoke.py` exports `run(scout, judge, docker_logs, env, print_fn)` for unit testability. `make_scout()` and `make_judge()` are the real CrewAI implementations wired at the CLI entry point. The MCP server (`node src/index.js`) is unchanged; only the orchestration layer changes.

**Tech Stack:** Python 3.11+, CrewAI (with MCP tool support), pytest

**Execution lock:**
- Worktree required: yes
- Expected worktree: `worktrees/smoke-crewai-nomos`
- Expected branch: `codex/smoke-crewai-nomos`
- Preflight check: [ ] done

---

## Preflight

Before any file edits:

```bash
git worktree add -b codex/smoke-crewai-nomos worktrees/smoke-crewai-nomos trunk
```

Verify:

```bash
git worktree list --porcelain
git branch --show-current
```

Expected output: branch is `codex/smoke-crewai-nomos`, cwd is inside `worktrees/smoke-crewai-nomos`.

---

## Task 1: Python environment setup

**Files:**
- Create: `web-scout/requirements.txt`
- Create: `web-scout/conftest.py`

**Step 1: Create requirements.txt**

```
crewai[tools]>=0.100.0
pytest>=8.0.0
```

**Step 2: Create conftest.py** (makes `smoke` importable from `tests/`)

```python
# web-scout/conftest.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
```

**Step 3: Install deps**

```bash
pip install -r web-scout/requirements.txt
```

Expected: installs without error. Verify: `python -c "import crewai; print(crewai.__version__)"`.

**Step 4: Commit**

```bash
git add web-scout/requirements.txt web-scout/conftest.py
git commit -m "add python deps: crewai + pytest"
```

---

## Task 2: Write unit tests (RED)

**Files:**
- Create: `web-scout/tests/smoke_test.py`

**Step 1: Write the full test file**

```python
# web-scout/tests/smoke_test.py
import json
import pytest
from smoke import run

VALID_RESULTS_JSON = json.dumps({
    "results": [{"title": "Python", "url": "https://python.org"}],
    "query": "Python programming language",
    "number_of_results": 1,
})


# --- Helpers ---

def make_scout(result=VALID_RESULTS_JSON, raises=False):
    def scout(query):
        if raises:
            raise RuntimeError("scout failed")
        return result
    return scout


def make_judge(result="PASS results look relevant"):
    def judge(query, results_json, logs):
        return result
    return judge


def make_docker_logs(logs="some logs", raises=False):
    def docker_logs():
        if raises:
            raise RuntimeError("docker not running")
        return logs
    return docker_logs


def make_env(**overrides):
    base = {
        "SEARXNG_URL": "http://localhost:8888",
        "NOMOS_API_KEY": "test-key",
        "NOMOS_BASE_URL": "http://nomos:8080",
    }
    base.update(overrides)
    return {k: v for k, v in base.items() if v is not None}


def make_deps(**overrides):
    base = dict(
        scout=make_scout(),
        judge=make_judge(),
        docker_logs=make_docker_logs(),
        env=make_env(),
        print_fn=lambda *_: None,
    )
    base.update(overrides)
    return base


# --- Tests ---

def test_exits_nonzero_whenSearxngUrlMissing():
    code = run(**make_deps(env=make_env(SEARXNG_URL=None)))
    assert code == 1


def test_exits_nonzero_whenNomosApiKeyMissing():
    code = run(**make_deps(env=make_env(NOMOS_API_KEY=None)))
    assert code == 1


def test_exits_nonzero_whenNomosBaseUrlMissing():
    code = run(**make_deps(env=make_env(NOMOS_BASE_URL=None)))
    assert code == 1


def test_exits_nonzero_whenScoutRaisesException():
    code = run(**make_deps(scout=make_scout(raises=True)))
    assert code == 1


def test_exits_nonzero_whenScoutReturnsEmptyOutput():
    code = run(**make_deps(scout=make_scout(result="")))
    assert code == 1


def test_exits_nonzero_whenResultsJsonUnparseable():
    code = run(**make_deps(scout=make_scout(result="not json")))
    assert code == 1


def test_exits_nonzero_whenResultsArrayEmpty():
    empty = json.dumps({"results": [], "query": "Python programming language", "number_of_results": 0})
    code = run(**make_deps(scout=make_scout(result=empty)))
    assert code == 1


def test_exits_nonzero_whenResultMissingTitleOrUrl():
    missing_url = json.dumps({"results": [{"title": "Python"}], "number_of_results": 1})
    code = run(**make_deps(scout=make_scout(result=missing_url)))
    assert code == 1


def test_exits_nonzero_whenJudgeVerdictIsFail():
    code = run(**make_deps(judge=make_judge(result="FAIL results not relevant")))
    assert code == 1


def test_exits_nonzero_whenJudgeVerdictIsUnparseable():
    code = run(**make_deps(judge=make_judge(result="maybe this is ok")))
    assert code == 1


def test_logsUnavailable_doesNotAbort_scriptContinuesToJudge():
    judge_called = []

    def judge(query, results_json, logs):
        judge_called.append(logs)
        return "PASS ok"

    code = run(**make_deps(docker_logs=make_docker_logs(raises=True), judge=judge))
    assert code == 0
    assert judge_called == ["(unavailable)"]


def test_exits_zero_whenSearxngRunningAndResultsRelevant():
    code = run(**make_deps())
    assert code == 0
```

**Step 2: Run tests to verify RED**

```bash
python -m pytest web-scout/tests/smoke_test.py -v
```

Expected: `ModuleNotFoundError: No module named 'smoke'` or `ImportError`. This confirms the tests are wired up and waiting for the implementation.

**Step 3: Commit**

```bash
git add web-scout/tests/smoke_test.py
git commit -m "add smoke unit tests (red)"
```

---

## Task 3: Implement `run()` (GREEN)

**Files:**
- Create: `web-scout/smoke.py`

**Step 1: Write `smoke.py` with `run()` only (no CrewAI yet)**

```python
# web-scout/smoke.py
import json
import os

QUERY = "Python programming language"


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

**Step 2: Run tests to verify GREEN**

```bash
python -m pytest web-scout/tests/smoke_test.py -v
```

Expected: all 12 tests pass.

**Step 3: Commit**

```bash
git add web-scout/smoke.py
git commit -m "implement run() — all unit tests green"
```

---

## Task 4: Implement `_make_llm()` and `make_scout()` with CrewAI + nomos + MCP

**Files:**
- Modify: `web-scout/smoke.py` — append shared LLM helper and `make_scout()`

**Step 1: Add `_make_llm()` and `make_scout()` to `smoke.py`**

Append after the `run()` function:

```python
def _make_llm(env):
    from crewai import LLM
    return LLM(
        model="openai/gpt-5-nano",
        base_url=env["NOMOS_BASE_URL"] + "/v1",
        api_key=env["NOMOS_API_KEY"],
    )


def make_scout(env):
    from pathlib import Path
    from crewai import Agent, Task, Crew
    from crewai.tools.mcp_tools import MCPServerAdapter
    from mcp import StdioServerParameters

    llm = _make_llm(env)
    index_path = str(Path(__file__).parent / "src" / "index.js")

    def scout(query):
        mcp_params = StdioServerParameters(
            command="node",
            args=[index_path],
            env={**env, "SEARXNG_URL": env["SEARXNG_URL"]},
        )
        with MCPServerAdapter(mcp_params) as mcp:
            search_tools = [t for t in mcp.tools if t.name == "search"]
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
            output = crew.kickoff().raw
            if not output or not output.strip():
                raise ValueError("Scout agent produced empty output")
            return output.strip()

    return scout
```

**Step 2: Verify unit tests still pass**

```bash
python -m pytest web-scout/tests/smoke_test.py -v
```

Expected: all 12 tests still pass (unit tests do not call `make_scout()`).

**Step 3: Commit**

```bash
git add web-scout/smoke.py
git commit -m "add make_scout() — crewai + nomos + mcp"
```

---

## Task 5: Implement `make_judge()` and `make_docker_logs()`, add CLI entry point

**Files:**
- Modify: `web-scout/smoke.py` — append remaining factories and CLI block

**Step 1: Append to `smoke.py`**

```python
def make_judge(env):
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
        return crew.kickoff().raw or ""

    return judge


def make_docker_logs():
    import subprocess

    def docker_logs():
        result = subprocess.run(
            ["docker", "logs", "--tail", "50", "searxng"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout

    return docker_logs


if __name__ == "__main__":
    import sys

    env = dict(os.environ)
    code = run(
        scout=make_scout(env),
        judge=make_judge(env),
        docker_logs=make_docker_logs(),
        env=env,
    )
    sys.exit(code)
```

**Step 2: Run unit tests to confirm nothing broke**

```bash
python -m pytest web-scout/tests/smoke_test.py -v
```

Expected: all 12 tests pass.

**Step 3: Commit**

```bash
git add web-scout/smoke.py
git commit -m "add make_judge(), make_docker_logs(), cli entry point"
```

---

## Task 6: Remove JS smoke files

**Files:**
- Delete: `web-scout/smoke.js`
- Delete: `web-scout/tests/smoke.test.js`

**Step 1: Delete JS smoke files**

```bash
git rm web-scout/smoke.js web-scout/tests/smoke.test.js
```

**Step 2: Run full JS test suite to confirm nothing else broke**

```bash
./scripts/run_silent.sh "tests" npm test
```

Expected: pass (remaining JS tests cover `searxng-client`, `mcp-server`, `e2e` — unaffected).

**Step 3: Run Python tests one more time**

```bash
python -m pytest web-scout/tests/smoke_test.py -v
```

Expected: all 12 pass.

**Step 4: Commit**

```bash
git commit -m "remove js smoke script and tests (replaced by python)"
```

---

## Task 7: Update log and move plan

**Step 1: Add log entry to `web-scout/docs/log.md`** (prepend under today's date)

```
Migrate smoke script to Python + CrewAI + nomos (v0.0.2): replace Claude Agent SDK JS implementation with Python; LLM calls routed through nomos OpenAI-compatible API; 12 unit tests ported to pytest.
```

**Step 2: Move plan to implemented**

```bash
git mv web-scout/docs/plans/2026-03-03-smoke-crewai-nomos.md web-scout/docs/plans/implemented/2026-03-03-smoke-crewai-nomos.md
```

**Step 3: Commit and push**

```bash
git add web-scout/docs/log.md web-scout/docs/plans/implemented/2026-03-03-smoke-crewai-nomos.md
git commit -m "log v0.0.2 migration; move plan to implemented"
git push -u origin codex/smoke-crewai-nomos
```

**Step 4: Open PR**

```bash
gh pr create --title "smoke script v0.0.2: crewai + nomos" --body "$(cat <<'EOF'
## Summary
- Replace Claude Agent SDK (JS) smoke script with Python + CrewAI
- LLM calls routed through nomos (OpenAI-compatible proxy)
- Model: openai/gpt-5-nano via nomos (fallback: claude-haiku-4-5)
- 12 unit tests ported to pytest; cost-limit rules removed (delegated to nomos)

## Test plan
- [ ] `python -m pytest web-scout/tests/smoke_test.py -v` — all 12 pass
- [ ] `./scripts/run_silent.sh "tests" npm test` — JS suite unaffected
- [ ] Manual smoke: `SEARXNG_URL=... NOMOS_API_KEY=... NOMOS_BASE_URL=... python web-scout/smoke.py`
EOF
)"
```

---

## Notes

- `NOMOS_BASE_URL` should be the nomos root URL (e.g. `http://localhost:8000`); `/v1` is appended in the factory. Verify the exact path nomos exposes for the OpenAI-compatible endpoint.
- Primary model is `openai/gpt-5-nano` (cheap, fast). Fall back to `openai/claude-haiku-4-5` only if `gpt-5-nano` produces insufficient results. The `openai/` prefix follows LiteLLM's convention for OpenAI-compatible providers.
- If `MCPServerAdapter` import path differs across CrewAI versions, check `crewai.tools` or `crewai_tools` for the correct location.
