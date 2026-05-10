# corpus-scout

Read-only MCP server that provides lexical search and section reading over a local text corpus (e.g., Markdown files). Exposes two tools: **search** (pattern matching, returns matching lines with context) and **read_section** (extracts file content by heading or line range). Configured via environment variables (`CORPUS_ROOT`, file glob, result limits), it returns deterministic JSON results — same query always yields identical output. No embeddings, no indexing, no corpus mutation. Designed as a reusable retrieval primitive for LLM-driven workflows over any file-based knowledge base.

## Requirements

- Node.js (see `.node-version`)
- [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`) installed and on PATH

## Local dev setup

### 1. Install dependencies

```bash
npm install
```

### 2. Register with Claude Code

Add to your local `.mcp.json` (do not commit):

```json
{
  "mcpServers": {
    "corpus-scout": {
      "command": "node",
      "args": ["corpus-scout/src/index.js"],
      "env": {
        "CORPUS_ROOT": "/absolute/path/to/your/corpus"
      }
    }
  }
}
```

### 3. Enable the server and approve permissions

Create `.claude/settings.local.json` (do not commit):

```json
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["corpus-scout"],
  "permissions": {
    "allow": [
      "mcp__corpus-scout__search",
      "mcp__corpus-scout__read_section"
    ]
  }
}
```

Restart Claude Code. The `search` and `read_section` tools will be available.

## Using from another repo

To use corpus-scout as an MCP server from a different repo on the same machine, add to that project's `.mcp.json` (do not commit):

```json
{
  "mcpServers": {
    "corpus-scout": {
      "command": "node",
      "args": ["/absolute/path/to/ai-labs/corpus-scout/src/index.js"],
      "env": {
        "CORPUS_ROOT": "/absolute/path/to/your/corpus"
      }
    }
  }
}
```

Then add to `.claude/settings.local.json` (do not commit):

```json
{
  "permissions": {
    "allow": [
      "mcp__corpus-scout__search",
      "mcp__corpus-scout__read_section"
    ]
  }
}
```

Restart Claude Code. No `npm install` needed in the other repo — the server runs from the ai-labs checkout.

## Tools

### `search`

Search the corpus for a pattern using ripgrep.

| Parameter | Required | Description |
|---|---|---|
| `query` | yes | Ripgrep search pattern |
| `caseSensitive` | no | Default `false` |
| `fileGlob` | no | Override `CORPUS_GLOB` for this query |

Returns array of `{ file, line, text, before, after }` with 1 line of context.

### `read_section`

Read a file or a specific section from it.

| Parameter | Required | Description |
|---|---|---|
| `file` | yes | Path relative to `CORPUS_ROOT` |
| `heading` | no | Heading text to extract section for |
| `startLine` | no | Start of line range (1-based) |
| `endLine` | no | End of line range (inclusive) |

Returns `{ file, content, startLine, endLine, truncated }`.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `CORPUS_ROOT` | yes | — | Absolute path to corpus directory |
| `CORPUS_GLOB` | no | `**/*.md` | File pattern to search within |
| `CORPUS_MAX_RESULTS` | no | `20` | Maximum search results returned |
| `CORPUS_MAX_LINES` | no | `200` | Maximum lines returned by `read_section` |
| `LOG_LEVEL` | no | `info` | `info` logs every call; `silent` suppresses all output |

## Log format

Structured JSON lines written to `stderr`. Set `LOG_LEVEL=silent` to suppress all output.

```json
{"event":"startup","corpusRoot":"/path/to/corpus"}
{"event":"search","query":"dragon","latencyMs":42,"resultCount":5}
{"event":"read_section","file":"characters/hero.md","latencyMs":3,"lines":25}
```

## Smoke test

Requires Langfuse keys (`LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`) and a corpus directory. The eval corpus at `tools/evals/corpus/` is in Russian; the default query matches it.

Run from the repo root:

```bash
set -a && source web-scout/.env && set +a
CORPUS_ROOT="$(pwd)/corpus-scout/tools/evals/corpus" node corpus-scout/scripts/smoke.js
```

Override the search query with `SMOKE_QUERY`:

```bash
SMOKE_QUERY="театр" CORPUS_ROOT=... node corpus-scout/scripts/smoke.js
```

Exit 0 = PASS, exit 1 = FAIL.

## Description

A read-only MCP server with two tools — pattern search and section reading over Markdown files. Powered by ripgrep, *deterministic and stateless*: no embeddings, no indexing, no mutation.

## Stack

- Node.js
- MCP
- ripgrep
