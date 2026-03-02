---
date: 2026-03-02
model: claude-sonnet-4-6
description: "Implementation plan: web-scout smoke script with two-agent local stack verification"
---

# Smoke Script Implementation Plan

## Context

The web-scout MCP server is complete and tested, but has no way to verify the full local stack end-to-end (SearXNG + MCP stdio server + Claude). The smoke script fills this gap: it runs two Claude agents (scout and judge) to perform a real search and evaluate the results, providing a pass/fail verdict with cost accountability.

Spec: `web-scout/docs/specs/smoke-script.md`

## Execution Lock

- Worktree required: no
- Preflight check: [ ] done

## Files

| Action | Path |
|--------|------|
| CREATE | `web-scout/smoke.js` |
| CREATE | `web-scout/tests/smoke.test.js` |
| MODIFY | `web-scout/package.json` — add `@anthropic-ai/claude-agent-sdk` |

## Design

### smoke.js structure

Export `run(deps)` for unit-testability; CLI entry point calls it and passes exit code to `process.exit`.

```
run({ scout, judge, dockerLogs, env, print })
  → Promise<0 | 1>
```

**`deps.scout`**: `async (query: string) => { result: string | null, costUsd: number, isError: boolean }`

**`deps.judge`**: `async (query, resultsJson, logs) => { result: string | null, costUsd: number, isError: boolean }`

**`deps.dockerLogs`**: `async () => string` — throws on failure; caller catches and falls back to `"(unavailable)"`

**`deps.env`**: env object (defaults to `process.env`)

**`deps.print`**: output writer (defaults to `console.log`)

### run() flow

1. Check `env.SEARXNG_URL` — exit 1 if missing
2. Check `env.ANTHROPIC_API_KEY` — exit 1 if missing
3. Call `scout("Python programming language")`
   - `isError || !result` → exit 1
   - `costUsd > 0.02` → exit 1
4. Parse result as JSON — exit 1 on parse error
5. `results` array empty → exit 1
6. Any result missing non-empty `title` or `url` → exit 1
7. Call `dockerLogs()` — on throw, use `"(unavailable)"`
8. Call `judge(query, resultsJson, logs)`
   - `judgeRes.costUsd > 0.03` → exit 1
   - `scoutCost + judgeCost > 0.05` → exit 1
   - first word of `judgeRes.result` is not `PASS` or `FAIL` → exit 1 (unparseable)
   - first word is `FAIL` → exit 1
9. Print verdict, explanation, scout cost, judge cost; exit 0

### Real agent implementations (used when run as CLI)

**Scout** — `makeScout(env)`:
- `query()` with model `claude-haiku-4-5`, `maxBudgetUsd: 0.02`, `permissionMode: 'dontAsk'`
- MCP server: `{ 'web-scout': { command: 'node', args: ['web-scout/src/index.js'], env: { SEARXNG_URL: env.SEARXNG_URL } } }`
- Prompt instructs agent to return only the raw JSON result verbatim
- Extracts `total_cost_usd`, `is_error`, `result` from the result message (when `msg.type === 'result'`)

**Judge** — `makeJudge()`:
- `query()` with model `claude-haiku-4-5`, `maxBudgetUsd: 0.03`, `permissionMode: 'dontAsk'`, no MCP servers, no allowed tools
- Prompt provides query, results JSON, docker logs; asks agent to start answer with PASS or FAIL

**Docker logs** — `makeDockerLogs()`:
- `execFile('docker', ['logs', '--tail', '50', 'searxng'])` via `promisify`
- Returns stdout string

### Agent SDK result message

The `query()` async generator from `@anthropic-ai/claude-agent-sdk` yields messages. The result message has `msg.type === 'result'` and exposes:
- `msg.total_cost_usd` — actual spend
- `msg.is_error` — true when `subtype` is `error_max_budget_usd` etc.
- `msg.result` — text result (when `is_error === false`)

## Tests (smoke.test.js)

All 13 tests use `node:test` + `node:assert/strict`. No subprocesses needed — all tests call `run()` directly with mock deps and assert the returned exit code.

Helper `makeRun(overrides)` constructs a default valid deps set and merges overrides, reducing boilerplate.

Default valid deps (used as baseline):
```
scout  → { result: '{"results":[{"title":"Python","url":"https://python.org"}],"query":"...","number_of_results":1}', costUsd: 0.01, isError: false }
judge  → { result: 'PASS looks relevant', costUsd: 0.01, isError: false }
docker → resolves to "some logs"
env    → { SEARXNG_URL: 'http://localhost:8888', ANTHROPIC_API_KEY: 'key' }
print  → no-op
```

| # | Test name | Mock override |
|---|-----------|---------------|
| 1 | `exits_nonzero_whenSearxngUrlMissing` | `env.SEARXNG_URL` absent |
| 2 | `exits_nonzero_whenAnthropicApiKeyMissing` | `env.ANTHROPIC_API_KEY` absent |
| 3 | `exits_nonzero_whenScoutReturnsNoResult` | scout returns `{ result: null, costUsd: 0, isError: true }` |
| 4 | `exits_nonzero_whenResultsJsonUnparseable` | scout returns `{ result: 'not json', costUsd: 0.01, isError: false }` |
| 5 | `exits_nonzero_whenResultsArrayEmpty` | scout returns `{ result: '{"results":[],"query":"...","number_of_results":0}', costUsd: 0.01, isError: false }` |
| 6 | `exits_nonzero_whenResultMissingTitleOrUrl` | scout returns result with `[{ url: "https://x.com" }]` (no title) |
| 7 | `exits_nonzero_whenJudgeVerdictIsFail` | judge returns `{ result: 'FAIL not relevant', costUsd: 0.01, isError: false }` |
| 8 | `exits_nonzero_whenJudgeVerdictIsUnparseable` | judge returns `{ result: 'maybe this is ok', costUsd: 0.01, isError: false }` |
| 9 | `logsUnavailable_doesNotAbort_scriptContinuesToJudge` | dockerLogs throws; verify judge is called and script exits 0 |
| 10 | `exits_nonzero_whenScoutCostExceedsLimit` | scout returns `{ result: validJson, costUsd: 0.025, isError: false }` |
| 11 | `exits_nonzero_whenJudgeCostExceedsLimit` | judge returns `{ result: 'PASS ok', costUsd: 0.04, isError: false }` |
| 12 | `exits_nonzero_whenTotalCostExceedsLimit` | scout `costUsd: 0.02`, judge `costUsd: 0.04` (total 0.06 > 0.05) |
| 13 | `exits_zero_whenSearxngRunningAndResultsRelevant` | all defaults → exit 0 |

Test 9 additionally asserts that the judge mock was called (captured via a flag) to confirm the script did not abort after the docker log failure.

## Verification

```bash
# Install new dependency first
npm install --prefix web-scout @anthropic-ai/claude-agent-sdk

# Run tests (smoke.test.js only for speed, then full suite)
./scripts/run_silent.sh "tests" npm test

# Manual end-to-end (requires running SearXNG on :8888)
SEARXNG_URL=http://localhost:8888 ANTHROPIC_API_KEY=<key> node web-scout/smoke.js
```

## Post-implementation

Move spec: `web-scout/docs/specs/smoke-script.md` → `web-scout/docs/specs/implemented/smoke-script.md`
Move plan: `web-scout/docs/plans/smoke-script.md` → `web-scout/docs/plans/implemented/smoke-script.md`
