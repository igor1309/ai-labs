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

`async (query: string) => string` — returns raw JSON from the MCP tool call.

- Model: Claude Haiku
- MCP server: web-scout stdio — `node web-scout/src/index.js` with `SEARXNG_URL` from env
- Allowed tools: `['mcp__web-scout__search']` — exhaustive list, nothing else permitted (no WebSearch, no WebFetch)
- Prompt: `"Call the search tool with query '{query}'. Return only the raw JSON result verbatim, no commentary."`
- Returns: `result.result` (raw JSON string)
- Budget: `maxBudgetUsd: 0.02`

### Docker logs

After scout completes, wait 500ms then capture `docker logs --tail 50 searxng` via `execFile`. Passed as a string to the judge. If the container is not running or the command fails, logs are passed as `"(unavailable)"` — does not abort the script.

### Judge agent

`async (query, resultsJson, logs) => { verdict, explanation }`

- Model: Claude Haiku
- No tools — pure reasoning only
- Prompt:
  ```
  Query: '{query}'

  Search results:
  {resultsJson}

  Docker logs:
  {logs}

  Did the search return relevant results and did the docker logs show successful processing?
  Start your answer with PASS or FAIL.
  ```
- Verdict: extracted by checking whether `result.result` starts with `PASS` or `FAIL`
- Budget: `maxBudgetUsd: 0.03`

## Fixed query

`"Python programming language"` — broad, reliably returns results, relevance is unambiguous for the judge.

## Behavior rules

1. Exits non-zero if `SEARXNG_URL` or `ANTHROPIC_API_KEY` is missing.
2. Exits non-zero if the scout agent exceeds budget or returns no result.
3. Exits non-zero if the judge verdict is FAIL or unparseable.
4. Docker logs unavailability does not abort — logs are passed as `"(unavailable)"`.
5. Total budget ceiling across both agents: `$0.05`.

## Done criteria

- Script exits 0 when SearXNG is running and returns results for the fixed query.
- Script exits 1 when SearXNG is down or returns no results.
- Both agent costs printed to stdout.
