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

Restart Claude Code. The `search` tool will be available.

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
