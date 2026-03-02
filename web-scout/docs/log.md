# Log

## 2026-03-02

Add local dev README: SearXNG Docker setup with JSON format config, Claude Code `.mcp.json` registration, and env var reference.
Ship web-scout v0.0.1: SearXNG HTTP client (`searxng-client.js`) with full error handling (empty query, non-2xx, non-JSON, timeout, truncation) and MCP stdio server (`mcp-server.js`) with zod-validated `search` tool, error propagation, and env-based wiring in `index.js`. All behavior rules covered by `node:test` unit tests.
