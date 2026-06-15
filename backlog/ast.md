---
date: 2026-06-15
model: claude-opus-4
description: "Forward tasks for adopting AST code-search tooling (ast-index / ast-grep) in ai-labs."
version: 0.0.1
---

# Backlog — AST code-search tooling

Findings and rationale: [`docs/research/ast-code-search-tools.md`](../docs/research/ast-code-search-tools.md).

## Trial ast-index on this repo

Time-box an evaluation of [`defendend/ast-index`](https://github.com/defendend/Claude-ast-index-search)
as the Claude Code navigation backbone.

- Install the binary and build the index for ai-labs.
- Measure index **build time** and **on-disk size** — the deciding factor in the
  remote/ephemeral execution environment, where the index is rebuilt per session.
- Verify symbol coverage across the repo's polyglot mix (TS/Node + Swift).
- Confirm Claude actually invokes the MCP tools in practice without heavy
  prompting.

## Decide adoption shape

After the trial, decide between:

- navigation-first (ast-index only),
- refactor-first (ast-grep only),
- or both (ast-index for finding/understanding, ast-grep for transforming).

If adopting ast-index, decide committed-vs-local config (`.ast-index.yaml`,
`.claude/rules`) and whether/how to handle the per-session index rebuild cost in
the ephemeral container (e.g. session-start hook, caching).

## Evaluate ast-grep for codemods/lint

Only if a concrete repo-wide refactor or structural-lint need exists. If pursued,
consider adding the [`ast-grep/claude-skill`](https://github.com/ast-grep/claude-skill)
wrapper so Claude drives ast-grep idiomatically rather than via ad-hoc Bash.
