# web-scout

MCP stdio server that exposes SearXNG search as a tool for Claude Code.

## Local dev setup

### 1. Start SearXNG

Create a local `settings.yml` to enable JSON output:

```yaml
use_default_settings: true
search:
  formats:
    - html
    - json
```

Run SearXNG with that config mounted:

```bash
docker run -d --name searxng \
  -p 8888:8080 \
  -e SEARXNG_SECRET_KEY=dev \
  -v /absolute/path/to/settings.yml:/etc/searxng/settings.yml \
  searxng/searxng:latest
```

Verify it's up: `curl "http://localhost:8888/search?q=test&format=json"`

### 2. Register with Claude Code

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

## Environment variables

| Variable              | Required | Default | Description                        |
|-----------------------|----------|---------|------------------------------------|
| `SEARXNG_URL`         | yes      | —       | SearXNG instance base URL          |
| `SEARXNG_TIMEOUT_MS`  | no       | 5000    | HTTP request timeout (ms)          |
| `SEARXNG_MAX_RESULTS` | no       | 10      | Maximum results returned per query |
