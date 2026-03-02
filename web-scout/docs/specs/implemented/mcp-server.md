---
date: 2026-03-02
model: claude-opus-4-6
description: "Spec: MCP stdio server exposing SearXNG search as a tool"
---

# Spec: MCP Server (v0.0.1)

## Goal

MCP server over stdio transport, owned by web-scout, that exposes SearXNG search as a tool for Claude Code consumption.

## Public interface

### Tool: `search`

Input schema (zod-validated):
- `query: string` — required, non-empty
- `categories?: string` — optional SearXNG category
- `language?: string` — optional language code
- `pageNo?: number` — optional page number

Output: MCP text content block containing JSON-serialized `SearchResult` (see `searxng-client.md`).

On error: MCP error response with descriptive message.

## Configuration (environment variables)

Required:
- `SEARXNG_URL` — SearXNG instance base URL (e.g. `http://localhost:8888`)

Optional:
- `SEARXNG_TIMEOUT_MS` — request timeout, defaults to `5000`
- `SEARXNG_MAX_RESULTS` — result cap, defaults to `10`

## Behavior rules

1. Server starts on stdio (stdin/stdout JSON-RPC 2.0).
2. Validates `SEARXNG_URL` on startup — exits with non-zero code and stderr message if missing.
3. Delegates search to `searxngClient.search` (see `searxng-client.md`).
4. Returns results as MCP `text` content type with JSON body.
5. Catches `searxngClient` errors and returns MCP error responses (does not crash the server).

## Tests (required)

Using a stubbed `searxngClient`:
- Tool `search` returns JSON text content on successful search.
- Tool `search` returns MCP error on client failure.
- Rejects missing `query` input (zod validation).
- Rejects empty `query` input.
- Passes optional params (`categories`, `language`, `pageNo`) through to client.

Startup:
- Exits with error when `SEARXNG_URL` is not set.

## Done criteria

- All tests listed in the Tests section pass.
- `search` tool responds over stdio to a valid MCP tool call (manual smoke or integration test).
