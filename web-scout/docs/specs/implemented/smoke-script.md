---
date: 2026-03-02
model: claude-sonnet-4-6
description: "Spec: web-scout smoke script — two-agent local stack verification"
---

# web-scout Smoke Script

## Goal

Standalone script that exercises the full local web-scout stack (SearXNG + MCP stdio server) and evaluates results using a separate judge agent.

## Public interface

```bash
SEARXNG_URL=http://localhost:8888 ANTHROPIC_API_KEY=... node web-scout/smoke.js
```

- Exit 0 = PASS, exit 1 = FAIL
- Prints: verdict, judge explanation, scout agent cost, judge agent cost

## Components

### Scout agent

`async (query: string) => string` — executes the web-scout MCP `search` tool with the given query and returns the raw JSON result. Only the web-scout MCP `search` tool is permitted; built-in web search or fetch tools are explicitly excluded. Budget ceiling: `$0.02`.

_Implementation notes:_ model Claude Haiku; MCP server spawned as `node web-scout/src/index.js` with `SEARXNG_URL` from env; prompt instructs the agent to return only the raw JSON result verbatim; result extracted from `result.result`; SDK option `maxBudgetUsd: 0.02`.

### Docker logs

Captured from the SearXNG container after scout completes. If unavailable, passed as `"(unavailable)"` — does not abort the script.

_Implementation notes:_ `docker logs --tail 50 searxng`.

### Judge agent

`async (query: string, resultsJson: string, logs: string) => { verdict: "PASS" | "FAIL", explanation: string }` — evaluates result relevance and log health given the query, scout output, and docker logs. No search or fetch tools permitted. Budget ceiling: `$0.03`.

_Implementation notes:_ model Claude Haiku; no tools; prompt provides query, results JSON, and docker logs and asks the agent to start its answer with PASS or FAIL; verdict extracted by checking the first word of `result.result`; SDK option `maxBudgetUsd: 0.03`.

## Fixed query

`"Python programming language"` — broad, reliably returns results, relevance is unambiguous for the judge.

## Behavior rules

1. Exits non-zero if `SEARXNG_URL` or `ANTHROPIC_API_KEY` is missing.
2. Exits non-zero if the scout returns no result or cost exceeds `$0.02`.
3. Exits non-zero if the judge cost exceeds `$0.03`.
4. Exits non-zero if combined cost exceeds `$0.05`.
5. Results JSON must be parseable; exits non-zero otherwise.
6. `results` array must be non-empty; exits non-zero otherwise.
7. Each result must have a non-empty `title` (string) and `url` (string); exits non-zero otherwise.
8. Exits non-zero if the judge verdict is FAIL or unparseable.
9. Docker logs unavailability does not abort — logs are passed as `"(unavailable)"`.

## Tests

1. `exits_nonzero_whenSearxngUrlMissing`
2. `exits_nonzero_whenAnthropicApiKeyMissing`
3. `exits_nonzero_whenScoutReturnsNoResult`
4. `exits_nonzero_whenResultsJsonUnparseable`
5. `exits_nonzero_whenResultsArrayEmpty`
6. `exits_nonzero_whenResultMissingTitleOrUrl`
7. `exits_nonzero_whenJudgeVerdictIsFail`
8. `exits_nonzero_whenJudgeVerdictIsUnparseable`
9. `logsUnavailable_doesNotAbort_scriptContinuesToJudge`
10. `exits_nonzero_whenScoutCostExceedsLimit`
11. `exits_nonzero_whenJudgeCostExceedsLimit`
12. `exits_nonzero_whenTotalCostExceedsLimit`
13. `exits_zero_whenSearxngRunningAndResultsRelevant`

## Done criteria

Script exits 0 (PASS) or 1 (FAIL) with verdict, explanation, and both agent costs printed to stdout.
