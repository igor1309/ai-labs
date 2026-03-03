---
date: 2026-03-03
model: claude-opus-4-6
description: "Split web-scout README into three focused files: MCP server, smoke test, Langfuse"
---

# README split design

## Problem

`web-scout/README.md` mixes three independent concerns — MCP server setup, smoke test operation, and Langfuse observability — accumulated through incremental additions. Structure has degraded: run commands appear before setup, env var tables are duplicated across scopes, SearXNG docker logs sit between Langfuse sections and MCP server config.

## Decision

Split into three files, each self-contained with its own setup/run/env vars.

## File 1: `web-scout/README.md` — MCP server only

```
# web-scout
[one-line description]

## Local dev setup
  ### 1. Start SearXNG
  ### 2. Install dependencies
  ### 3. Register with Claude Code
  ### 4. Enable and approve permissions

## Environment variables       (SEARXNG_URL, SEARXNG_TIMEOUT_MS, SEARXNG_MAX_RESULTS, LOG_LEVEL)

## Log format                  (JSON lines to stderr, 3 examples)

## Docker logs                 (docker logs searxng)

- [Smoke test](docs/smoke.md)
- [Langfuse observability](docs/langfuse.md)
```

No overview blurbs — just links at the end.

## File 2: `web-scout/docs/smoke.md` — smoke test

```
# Smoke test
[one-line description]

## Prerequisites               (SearXNG running, nomos running, Python venv)

## Python setup (one-time)     (venv creation, pip install)

## Run                         (source .env, run smoke.py, exit codes)

## Environment variables       (SEARXNG_URL, NOMOS_API_KEY, NOMOS_BASE_URL, CREWAI_DISABLE_TELEMETRY, CREWAI_TRACING_ENABLED)

## CrewAI telemetry            (tightened to ~8 lines, no System A/B labels, lead with actionable fix, timing gotcha)

## Unit tests                  (pytest command)
```

Key fix: prerequisites and Python setup come before run command.

## File 3: `web-scout/docs/langfuse.md` — observability

```
# Langfuse observability
[one-line description]

## How it works                (opt-in via 3 env vars, span tree diagram)

## Start the stack             (docker compose up, UI URL, sign-in creds)

## Stop the stack              (docker compose down)

## Bind-mount warning          (worktree gotcha, teardown order)
```

Span tree (`web-scout-smoke → scout-agent → mcp-search`, `→ judge-agent`) gets its own section instead of being buried mid-paragraph.
