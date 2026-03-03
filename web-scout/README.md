# web-scout

MCP stdio server that exposes SearXNG search as a tool for Claude Code. Runs as a local Node.js process connected to a SearXNG instance; writes structured JSON logs to `stderr` on startup and per tool call.

## Local dev setup

### 1. Start SearXNG

Create a local `settings.yml` to enable JSON output:

```yaml
use_default_settings: true
server:
  secret_key: "change-me-local"
search:
  formats:
    - html
    - json
```

Run SearXNG with that config mounted:

```bash
docker run -d --name searxng -p 8888:8080 -v /absolute/path/to/settings.yml:/etc/searxng/settings.yml searxng/searxng:latest
```

Verify it's up: `curl "http://localhost:8888/search?q=test&format=json"`

### 2. Install dependencies

```bash
npm install --prefix web-scout
```

### 3. Register with Claude Code

Add to your local `.mcp.json` (do not commit):

```json
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
```

### 4. Enable the server and approve permissions

Create `.claude/settings.local.json` (do not commit):

```json
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["web-scout"],
  "permissions": {
    "allow": ["mcp__web-scout__search"]
  }
}
```

Restart Claude Code. The `search` tool will be available.

## Smoke script

Verifies the full local stack (SearXNG + MCP server) using two CrewAI agents routed through nomos. Requires SearXNG running, nomos running, and the three env vars below set.

> **Run all commands from the repo root.** Never `cd` into `web-scout/` — use relative paths from the root.

```bash
set -a && source web-scout/.env && set +a
web-scout/.venv/bin/python3 web-scout/smoke.py
```

Exits 0 on PASS, 1 on FAIL. Prints the judge verdict and explanation.

### Python setup (one-time)

The smoke script and its unit tests run in an isolated virtualenv. Create it once:

```bash
python3 -m venv web-scout/.venv
web-scout/.venv/bin/pip install -r web-scout/requirements.txt "crewai-tools[mcp]"
```

> **Note:** Use Python 3.11–3.13. Python 3.14+ is not yet supported by all deps.
> `bare python` may resolve to a broken system shim on macOS — always use `python3` or the full venv path.

### Smoke script environment variables

| Variable                  | Required | Description                                                                                   |
|---------------------------|----------|-----------------------------------------------------------------------------------------------|
| `SEARXNG_URL`             | yes      | SearXNG instance base URL                                                                     |
| `NOMOS_API_KEY`           | yes      | Bearer token for the `web-scout` project registered in nomos (stored in `web-scout/.env`, not committed) |
| `NOMOS_BASE_URL`          | yes      | `https://nomos.enoa.ai` (production); `/v1` is appended internally                           |
| `CREWAI_TRACING_ENABLED`  | no       | Set to `false` to suppress CrewAI telemetry connection noise                                  |

All four are pre-filled in `web-scout/.env` (gitignored).

### Running Python unit tests

```bash
web-scout/.venv/bin/python3 -m pytest web-scout/tests/smoke_test.py -v
```

## Langfuse observability (local)

Optional. When `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_BASE_URL` are set, each smoke run produces one trace in Langfuse with nested spans: `web-scout-smoke → scout-agent → mcp-search` and `web-scout-smoke → judge-agent`. All three values are pre-filled in `web-scout/.env`.

### Start the stack

```bash
docker compose -f web-scout/docker/langfuse/docker-compose.yml --env-file web-scout/.env up -d
```

UI available at `http://localhost:3000`. Sign in with `LANGFUSE_INIT_USER_EMAIL` / `LANGFUSE_INIT_USER_PASSWORD` from `web-scout/.env`.

### Stop the stack

```bash
docker compose -f web-scout/docker/langfuse/docker-compose.yml down
```

### Bind-mount warning

Always start the stack from the **same workspace tree where you intend to keep it running**. Bind-mount paths (e.g. `./clickhouse-config`) are resolved relative to the compose file at `docker compose up` time and frozen into the container. If that source path later disappears — for example because the git worktree it lived in was deleted — ClickHouse silently loses its config and falls back to loopback-only on port 8123. The container health check (TCP port 9000) still passes, masking the breakage.

**Teardown order when using worktrees:** stop the stack before removing the worktree, not after.

## Docker logs

```bash
docker logs searxng
docker logs -f searxng   # follow
```

## Environment variables

| Variable              | Required | Default | Description                                          |
|-----------------------|----------|---------|------------------------------------------------------|
| `SEARXNG_URL`         | yes      | —       | SearXNG instance base URL                            |
| `SEARXNG_TIMEOUT_MS`  | no       | 5000    | HTTP request timeout (ms)                            |
| `SEARXNG_MAX_RESULTS` | no       | 10      | Maximum results returned per query                   |
| `LOG_LEVEL`           | no       | `info`  | `info` logs every call; `silent` suppresses all output |

## Log format

Structured JSON lines written to `stderr`. Set `LOG_LEVEL=silent` to suppress all output.

```json
{"event":"startup","searxngUrl":"http://localhost:8888","timeoutMs":5000,"maxResults":10}
{"event":"search","query":"rust async","latencyMs":312,"resultCount":5}
{"event":"search_error","query":"test","latencyMs":2,"error":"SearXNG down"}
```
