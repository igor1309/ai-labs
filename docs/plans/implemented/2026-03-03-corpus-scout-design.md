---
date: 2026-03-03
model: claude-opus-4-6
description: "Design: corpus-scout — reusable MCP server for lexical search over any local text corpus"
---

# Design: Corpus Scout MCP Server

## Goal

Reusable MCP server over stdio that exposes lexical search and section reading for any local text corpus. Implements ADR-0001 file-first retrieval architecture without embeddings or vector indexing.

## Architecture

Three-file structure mirroring web-scout:

| File | Responsibility |
|---|---|
| `src/index.js` | Composition root: validate env, wire deps, connect stdio |
| `src/mcp-server.js` | MCP tool registration (`search`, `read_section`) |
| `src/corpus-client.js` | Filesystem operations: ripgrep wrapper + file/section reader |

Communication: stdin/stdout (MCP JSON-RPC 2.0). Logging: stderr as JSON lines.

## Configuration (environment variables)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `CORPUS_ROOT` | Yes | — | Absolute path to corpus directory |
| `CORPUS_GLOB` | No | `**/*.md` | File pattern to search within |
| `CORPUS_MAX_RESULTS` | No | `20` | Max search results returned |
| `CORPUS_MAX_LINES` | No | `200` | Max lines returned by `read_section` |
| `LOG_LEVEL` | No | `info` | `silent` suppresses all stderr |

## Tool: `search`

Input:
- `query: string` — required, min 1 char, ripgrep pattern
- `caseSensitive?: boolean` — default `false`
- `fileGlob?: string` — override `CORPUS_GLOB` for this query

Output: JSON array of matches:

```json
[{
  "file": "characters/protagonist.md",
  "line": 42,
  "text": "The matching line content",
  "before": ["context line above"],
  "after": ["context line below"]
}]
```

Paths are relative to `CORPUS_ROOT`. Context is 1 line before/after.

## Tool: `read_section`

Two modes:

- **Heading mode**: `file: string` + `heading?: string` — reads from that heading to the next heading of equal or higher level. No heading = full file.
- **Line-range mode**: `file: string` + `startLine: number` + `endLine: number`

Output: `{ file, content, startLine, endLine, truncated }`. Truncated at `CORPUS_MAX_LINES` with `truncated: true`.

File paths are relative to `CORPUS_ROOT`.

## Security

- `CORPUS_ROOT` validated at startup: must exist, must be a directory.
- All file paths resolved relative to `CORPUS_ROOT`, checked to not escape it (no `..` traversal).
- ripgrep invoked with `--no-messages`, scoped to `CORPUS_ROOT`.

## Testing strategy

- **Unit tests** (`corpus-client.test.js`): injectable command runner for ripgrep, temp directories for file reads.
- **MCP tests** (`mcp-server.test.js`): `InMemoryTransport` with stubbed corpus client.
- **E2E test** (`e2e.test.js`): launch `src/index.js` as subprocess with real temp corpus directory.

## Dependencies

- `@modelcontextprotocol/sdk` — MCP server + transport
- `zod` — input validation

Runtime requirement: `rg` (ripgrep) installed on host.

## ADR traceability

| ADR-0001 invariant | Implementation |
|---|---|
| Lexical search only | ripgrep, no embeddings |
| File path + heading/line citations | `search` returns `file` + `line`; `read_section` returns bounded content |
| No corpus mutation | Read-only: search + read only |
| No vector store / background indexing | No indexing, no state files |
| Retrieval depth configurable | `CORPUS_MAX_RESULTS`, `CORPUS_MAX_LINES` |
| Deterministic retrieval primitive | Same query + corpus = same results |
