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
{"event":"startup","searxngUrl":"http://localhost:8888"}
{"event":"search","query":"rust async","latencyMs":312,"resultCount":5}
{"event":"search_error","query":"test","latencyMs":2,"error":"SearXNG down"}
```

## Docker logs

```bash
docker logs searxng
docker logs -f searxng   # follow
```

- [Smoke test](docs/smoke.md)
- [Langfuse observability](docs/langfuse.md)

## Description

An MCP stdio server that exposes web search as a tool — runs locally, connects to a self-hosted SearXNG instance, and returns *structured JSON results* with per-call logging.

## Stack

- Node.js
- MCP
- SearXNG
- Docker
