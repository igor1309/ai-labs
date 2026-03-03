---
date: 2026-03-03
model: claude-opus-4-6
description: "Smoke test: two-agent CrewAI verification of the web-scout local stack"
---

# Smoke test

Two-agent CrewAI verification of the full local stack (SearXNG + MCP server), routed through nomos. A scout agent runs the MCP `search` tool; a judge agent evaluates result relevance. Exits 0 on PASS, 1 on FAIL.

## Prerequisites

- SearXNG running (`docker ps | grep searxng`)
- nomos running and reachable
- Python virtualenv created (see below)

## Python setup (one-time)

The smoke script and its unit tests run in an isolated virtualenv. Create it once:

```bash
python3 -m venv web-scout/.venv
web-scout/.venv/bin/pip install -r web-scout/requirements.txt "crewai-tools[mcp]"
```

> **Note:** Use Python 3.11–3.13. Python 3.14+ is not yet supported by all deps.
> `bare python` may resolve to a broken system shim on macOS — always use `python3` or the full venv path.

## Run

> **Run all commands from the repo root.** Never `cd` into `web-scout/` — use relative paths from the root.

```bash
set -a && source web-scout/.env && set +a
web-scout/.venv/bin/python3 web-scout/smoke.py
```

Prints the judge verdict and explanation.

## Environment variables

| Variable                   | Required | Description                                                                                   |
|----------------------------|----------|-----------------------------------------------------------------------------------------------|
| `SEARXNG_URL`              | yes      | SearXNG instance base URL                                                                     |
| `NOMOS_API_KEY`            | yes      | Bearer token for the `web-scout` project registered in nomos (stored in `web-scout/.env`, not committed) |
| `NOMOS_BASE_URL`           | yes      | `https://nomos.enoa.ai` (production); `/v1` is appended internally                           |
| `CREWAI_DISABLE_TELEMETRY` | no       | Set to `true` to suppress CrewAI anonymous OTLP telemetry (see below)                        |
| `CREWAI_TRACING_ENABLED`   | no       | Set to `false` to prevent CrewAI Plus tracing auto-enable                                    |

All are pre-filled in `web-scout/.env` (gitignored).

## CrewAI telemetry

CrewAI phones home to `telemetry.crewai.com:4319` on every crew kickoff. When the endpoint is unreachable, the OTLP exporter retries 3–4 times and logs each failure at ERROR level — producing the `"Max retries exceeded with url: /v1/traces"` noise.

Set `CREWAI_DISABLE_TELEMETRY=true` to suppress this. The env var must be in `os.environ` **before** `import crewai` executes — the telemetry singleton initialises on first import and cannot be reconfigured afterwards. The recommended run pattern (`set -a && source web-scout/.env && set +a` before launching Python) satisfies this.

`CREWAI_TRACING_ENABLED=false` controls a separate system (CrewAI Plus tracing to `app.crewai.com`) and does not affect the OTLP noise.

## Unit tests

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v
```
