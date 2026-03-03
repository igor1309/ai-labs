---
date: 2026-03-03
model: claude-sonnet-4-6
description: "Spec: web-scout smoke script v0.0.2 — migrate to CrewAI + nomos"
---

# web-scout Smoke Script

## Goal

Standalone Python script that exercises the full local web-scout stack (SearXNG + MCP stdio server) and evaluates results using a separate judge agent. v0.0.2 replaces the Claude Agent SDK with CrewAI and routes all LLM calls through nomos.

## Public interface

```bash
SEARXNG_URL=http://localhost:8888 NOMOS_API_KEY=... NOMOS_BASE_URL=https://... python web-scout/smoke.py
```

- Exit 0 = PASS, exit 1 = FAIL
- Prints: verdict and judge explanation

### Required env vars

| Variable | Description |
|---|---|
| `SEARXNG_URL` | SearXNG base URL |
| `NOMOS_API_KEY` | Bearer token for nomos |
| `NOMOS_BASE_URL` | nomos OpenAI-compatible API base URL |

## Components

### Model budget

Both agents use `openai/gpt-5-nano` via nomos `base_url` + `api_key`. Fall back to `claude-haiku-4-5` only if gpt-5-nano proves insufficient.

### Scout agent

CrewAI agent that executes the web-scout MCP `search` tool with a fixed query and returns the raw JSON result verbatim. Only the web-scout MCP `search` tool is permitted; built-in web search or fetch tools are explicitly excluded.

_Implementation notes:_ MCP server spawned as `node web-scout/src/index.js` with `SEARXNG_URL` from env.

### Docker logs

Captured from the SearXNG container after scout completes. If unavailable, passed as `"(unavailable)"` — does not abort the script.

_Implementation notes:_ `docker logs --tail 50 searxng`.

### Judge agent

CrewAI agent that evaluates result relevance and log health given the query, scout output, and docker logs. No tools permitted. Must begin its response with `PASS` or `FAIL`.

## Fixed query

`"Python programming language"` — broad, reliably returns results, relevance is unambiguous for the judge.

## Behavior rules

1. Exits non-zero if `SEARXNG_URL`, `NOMOS_API_KEY`, or `NOMOS_BASE_URL` is missing.
2. Exits non-zero if the scout agent raises an exception or produces empty output.
3. Results JSON must be parseable; exits non-zero otherwise.
4. `results` array must be non-empty; exits non-zero otherwise.
5. Each result must have a non-empty `title` (string) and `url` (string); exits non-zero otherwise.
6. Exits non-zero if the judge verdict is FAIL or unparseable (first word not `PASS` or `FAIL`).
7. Docker logs unavailability does not abort — logs are passed as `"(unavailable)"`.

## Tests

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

## Done criteria

Script exits 0 (PASS) or 1 (FAIL) with verdict and explanation printed to stdout. Cost tracking is not enforced by the script; budget governance is delegated to nomos configuration and v0.0.3 Langfuse observability.
