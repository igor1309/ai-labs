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

```bash
SEARXNG_URL=http://localhost:8888 NOMOS_API_KEY=<key> NOMOS_BASE_URL=http://nomos:8000 python web-scout/smoke.py
```

Exits 0 on PASS, 1 on FAIL. Prints the judge verdict and explanation.

### Smoke script environment variables

| Variable         | Required | Description                                      |
|------------------|----------|--------------------------------------------------|
| `SEARXNG_URL`    | yes      | SearXNG instance base URL                        |
| `NOMOS_API_KEY`  | yes      | Bearer token for the `web-scout` project registered in nomos (stored in `web-scout/.env`, not committed) |
| `NOMOS_BASE_URL` | yes      | `https://nomos.enoa.ai` (production); `/v1` is appended internally |

All three are pre-filled in `web-scout/.env` (gitignored). Source it before running:

```bash
set -a && source web-scout/.env && set +a
python web-scout/smoke.py
```

### Running Python unit tests

```bash
python -m pytest web-scout/tests/smoke_test.py -v
```

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
