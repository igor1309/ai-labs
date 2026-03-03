---
date: 2026-03-03
model: claude-opus-4-6
description: "Implementation plan: split web-scout README into three focused files"
---

# README split implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split `web-scout/README.md` into three files — MCP server (README), smoke test (`docs/smoke.md`), Langfuse (`docs/langfuse.md`) — so each concern is self-contained.

**Architecture:** Extract smoke and Langfuse content into new docs, rewrite README to cover only MCP server, add links at the end. No code changes.

**Tech Stack:** Markdown only.

**Design doc:** `web-scout/docs/plans/2026-03-03-readme-split-design.md`

---

## Preflight

- Worktree required: no
- Expected branch: trunk
- Preflight check: [ ] done

---

### Task 1: Create `web-scout/docs/smoke.md`

**Files:**
- Create: `web-scout/docs/smoke.md`

**Step 1: Write the file**

```markdown
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

\`\`\`bash
python3 -m venv web-scout/.venv
web-scout/.venv/bin/pip install -r web-scout/requirements.txt "crewai-tools[mcp]"
\`\`\`

> **Note:** Use Python 3.11–3.13. Python 3.14+ is not yet supported by all deps.
> `bare python` may resolve to a broken system shim on macOS — always use `python3` or the full venv path.

## Run

> **Run all commands from the repo root.** Never `cd` into `web-scout/` — use relative paths from the root.

\`\`\`bash
set -a && source web-scout/.env && set +a
web-scout/.venv/bin/python3 web-scout/smoke.py
\`\`\`

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

\`\`\`bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v
\`\`\`
```

**Step 2: Verify the file renders correctly**

Skim the created file for broken markdown, missing code fences, table alignment.

**Step 3: Commit**

```bash
git add web-scout/docs/smoke.md
git commit -m "add web-scout/docs/smoke.md: extract smoke test docs from README"
```

---

### Task 2: Create `web-scout/docs/langfuse.md`

**Files:**
- Create: `web-scout/docs/langfuse.md`

**Step 1: Write the file**

```markdown
---
date: 2026-03-03
model: claude-opus-4-6
description: "Langfuse observability: optional local tracing for web-scout smoke runs"
---

# Langfuse observability

Optional local tracing for smoke runs. When `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL` are set, each run produces one trace in Langfuse. All three values are pre-filled in `web-scout/.env`.

## How it works

Each smoke run creates a span tree:

\`\`\`
web-scout-smoke
├── scout-agent
│   └── mcp-search
└── judge-agent
\`\`\`

When the Langfuse env vars are absent, tracing is skipped with no behavioural change.

## Start the stack

\`\`\`bash
docker compose -f web-scout/docker/langfuse/docker-compose.yml --env-file web-scout/.env up -d
\`\`\`

UI available at `http://localhost:3000`. Sign in with `LANGFUSE_INIT_USER_EMAIL` / `LANGFUSE_INIT_USER_PASSWORD` from `web-scout/.env`.

## Stop the stack

\`\`\`bash
docker compose -f web-scout/docker/langfuse/docker-compose.yml down
\`\`\`

## Bind-mount warning

Always start the stack from the **same workspace tree where you intend to keep it running**. Bind-mount paths (e.g. `./clickhouse-config`) are resolved relative to the compose file at `docker compose up` time and frozen into the container. If that source path later disappears — for example because the git worktree it lived in was deleted — ClickHouse silently loses its config and falls back to loopback-only on port 8123. The container health check (TCP port 9000) still passes, masking the breakage.

**Teardown order when using worktrees:** stop the stack before removing the worktree, not after.
```

**Step 2: Verify the file renders correctly**

Skim the created file for broken markdown.

**Step 3: Commit**

```bash
git add web-scout/docs/langfuse.md
git commit -m "add web-scout/docs/langfuse.md: extract Langfuse docs from README"
```

---

### Task 3: Rewrite `web-scout/README.md`

**Files:**
- Modify: `web-scout/README.md` (full rewrite)

**Step 1: Replace the file with MCP-server-only content**

```markdown
# web-scout

MCP stdio server that exposes SearXNG search as a tool for Claude Code. Runs as a local Node.js process connected to a SearXNG instance; writes structured JSON logs to `stderr` on startup and per tool call.

## Local dev setup

### 1. Start SearXNG

Create a local `settings.yml` to enable JSON output:

\`\`\`yaml
use_default_settings: true
server:
  secret_key: "change-me-local"
search:
  formats:
    - html
    - json
\`\`\`

Run SearXNG with that config mounted:

\`\`\`bash
docker run -d --name searxng -p 8888:8080 -v /absolute/path/to/settings.yml:/etc/searxng/settings.yml searxng/searxng:latest
\`\`\`

Verify it's up: `curl "http://localhost:8888/search?q=test&format=json"`

### 2. Install dependencies

\`\`\`bash
npm install --prefix web-scout
\`\`\`

### 3. Register with Claude Code

Add to your local `.mcp.json` (do not commit):

\`\`\`json
{
  "mcpServers": {
    "web-scout": {
      "command": "node",
      "args": ["web-scout/src/index.js"],
      "env": {
        "SEARXNG_URL": "http://localhost:8888"
      }
    }
  }
}
\`\`\`

### 4. Enable the server and approve permissions

Create `.claude/settings.local.json` (do not commit):

\`\`\`json
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["web-scout"],
  "permissions": {
    "allow": ["mcp__web-scout__search"]
  }
}
\`\`\`

Restart Claude Code. The `search` tool will be available.

## Environment variables

| Variable              | Required | Default | Description                                          |
|-----------------------|----------|---------|------------------------------------------------------|
| `SEARXNG_URL`         | yes      | —       | SearXNG instance base URL                            |
| `SEARXNG_TIMEOUT_MS`  | no       | 5000    | HTTP request timeout (ms)                            |
| `SEARXNG_MAX_RESULTS` | no       | 10      | Maximum results returned per query                   |
| `LOG_LEVEL`           | no       | `info`  | `info` logs every call; `silent` suppresses all output |

## Log format

Structured JSON lines written to `stderr`. Set `LOG_LEVEL=silent` to suppress all output.

\`\`\`json
{"event":"startup","searxngUrl":"http://localhost:8888","timeoutMs":5000,"maxResults":10}
{"event":"search","query":"rust async","latencyMs":312,"resultCount":5}
{"event":"search_error","query":"test","latencyMs":2,"error":"SearXNG down"}
\`\`\`

## Docker logs

\`\`\`bash
docker logs searxng
docker logs -f searxng   # follow
\`\`\`

- [Smoke test](docs/smoke.md)
- [Langfuse observability](docs/langfuse.md)
```

**Step 2: Verify the file renders correctly**

Skim for broken markdown, confirm no smoke or Langfuse content remains.

**Step 3: Commit**

```bash
git add web-scout/README.md
git commit -m "rewrite web-scout README: MCP server only, link to smoke and langfuse docs"
```

---

### Task 4: Move design doc to implemented and update log

**Files:**
- Move: `web-scout/docs/plans/2026-03-03-readme-split-design.md` → `web-scout/docs/plans/implemented/`
- Move: `web-scout/docs/plans/2026-03-03-readme-split.md` → `web-scout/docs/plans/implemented/`
- Modify: `web-scout/docs/log.md`

**Step 1: Move plan files**

```bash
mv web-scout/docs/plans/2026-03-03-readme-split-design.md web-scout/docs/plans/implemented/
mv web-scout/docs/plans/2026-03-03-readme-split.md web-scout/docs/plans/implemented/
```

**Step 2: Add log entry**

Add at the top of the `## 2026-03-03` section in `web-scout/docs/log.md`:

```
Split README into three focused docs: `README.md` (MCP server only), `docs/smoke.md` (smoke test setup, run, CrewAI telemetry), `docs/langfuse.md` (optional observability). Add `CREWAI_DISABLE_TELEMETRY=true` to `.env` to suppress OTLP connection noise.
```

**Step 3: Commit**

```bash
git add web-scout/docs/plans/implemented/ web-scout/docs/log.md
git commit -m "close readme-split plan: move to implemented, update log"
```
