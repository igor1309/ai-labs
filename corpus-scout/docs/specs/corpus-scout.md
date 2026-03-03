---
date: 2026-03-03
model: claude-opus-4-6
description: "Spec: corpus-scout — reusable MCP server for lexical corpus search"
---

# Spec: Corpus Scout (v0.0.1)

## Goal

MCP server over stdio transport that exposes lexical search and section reading for any local text corpus via ripgrep, owned by corpus-scout.

## Public interface

### Tool: `search`

Input schema (zod-validated):
- `query: string` — required, min 1 char, ripgrep pattern
- `caseSensitive?: boolean` — default false
- `fileGlob?: string` — override default glob for this query

Output: MCP text content block containing JSON array of `{ file, line, text, before, after }`.

On error: MCP error response with descriptive message.

### Tool: `read_section`

Input schema (zod-validated):
- `file: string` — required, min 1 char, relative to CORPUS_ROOT
- `heading?: string` — heading text to extract section for
- `startLine?: number` — start of line range (1-based)
- `endLine?: number` — end of line range (inclusive)

Output: MCP text content block containing JSON `{ file, content, startLine, endLine, truncated }`.

On error: MCP error response with descriptive message.

## Configuration (environment variables)

Required:
- `CORPUS_ROOT` — absolute path to corpus directory

Optional:
- `CORPUS_GLOB` — file pattern, defaults to `**/*.md`
- `CORPUS_MAX_RESULTS` — search result cap, defaults to `20`
- `CORPUS_MAX_LINES` — read section line cap, defaults to `200`
- `LOG_LEVEL` — `info` (default) or `silent`

## Behavior rules

1. Server starts on stdio (stdin/stdout JSON-RPC 2.0).
2. Validates `CORPUS_ROOT` on startup — exits with non-zero code if missing, non-existent, or not a directory.
3. `search` delegates to ripgrep via subprocess, returns matches with 1 line of context.
4. `read_section` reads files relative to `CORPUS_ROOT`:
   - Heading mode: extracts from heading to next heading of equal/higher level.
   - Line-range mode: returns specified line range (1-based, inclusive).
   - Full file mode: returns entire file.
   - Truncates at `CORPUS_MAX_LINES` with `truncated: true`.
5. Path traversal outside `CORPUS_ROOT` is rejected.
6. Catches client errors and returns MCP error responses (does not crash the server).
7. Writes JSON line to `stderr` for each tool call. Suppressed when `LOG_LEVEL=silent`.

## Tests (required)

### corpus-client:
- search returns matches with file, line, text, before, after.
- search returns empty array on no match.
- search respects maxResults.
- search is case insensitive by default.
- search is case sensitive when requested.
- search filters by fileGlob when provided.
- search includes context lines.
- search returns relative paths.
- search throws on empty query.
- readSection returns full file when no heading or range.
- readSection returns heading section when heading provided.
- readSection includes subheadings in section.
- readSection returns line range when start/end provided.
- readSection truncates when exceeding maxLines.
- readSection throws on directory traversal.
- readSection throws on missing file.
- readSection throws on heading not found.

### mcp-server:
- search returns JSON text content on success.
- search returns MCP error on client failure.
- search rejects missing query.
- search rejects empty query.
- search passes optional params to client.
- read_section returns content on success.
- read_section returns MCP error on client failure.
- read_section rejects missing file.
- read_section passes heading to client.
- read_section passes line range to client.
- Writes success log to stderr.
- Does not write log when LOG_LEVEL=silent.

### startup:
- Exits with error when CORPUS_ROOT missing.
- Exits with error when CORPUS_ROOT not a directory.
- Writes startup log to stderr.

### e2e:
- Returns search results via stdio transport.
- Returns section via stdio transport.

## Done criteria

- All tests listed above pass.
- `search` and `read_section` tools respond over stdio to valid MCP tool calls.
