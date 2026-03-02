# Log

## 2026-03-03

Add smoke script (`web-scout/smoke.js`): two-agent local stack verification using Claude Haiku via Agent SDK. Scout agent runs the MCP `search` tool; judge agent evaluates result relevance and docker log health. Exits 0/1 with verdict and agent costs. 13 unit tests added, all passing.

## 2026-03-02

Update README: expand local dev setup (add `npm install` step, Claude Code permissions config via `settings.local.json`), add Docker logs section, add `LOG_LEVEL` to env vars table, and add log format section with example JSON lines.
Add structured JSON logging to stderr: startup event in `index.js`, per-call success/error events in `mcp-server.js`, suppressed when `LOG_LEVEL=silent`. Spec updated with Rule 6 and `LOG_LEVEL` config entry. All 10 tests pass. Verified end-to-end with Docker + live SearXNG search and Docker logs inspection.
Add local dev README: SearXNG Docker setup with JSON format config, Claude Code `.mcp.json` registration, and env var reference.
Ship web-scout v0.0.1: SearXNG HTTP client (`searxng-client.js`) with full error handling (empty query, non-2xx, non-JSON, timeout, truncation) and MCP stdio server (`mcp-server.js`) with zod-validated `search` tool, error propagation, and env-based wiring in `index.js`. All behavior rules covered by `node:test` unit tests.
