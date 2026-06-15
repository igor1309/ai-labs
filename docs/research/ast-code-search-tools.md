---
title: AST Code-Search Tooling for Agent Workflows — ast-index vs ast-grep
date: 2026-06-15
model: claude-opus-4
description: "Comparison of defendend/ast-index and ast-grep/ast-grep as code-search/navigation tooling for Claude Code, and how they relate."
author: Igor Malyarov
format: research
---

# AST Code-Search Tooling for Agent Workflows — ast-index vs ast-grep

## Question

Which tool should we adopt to make Claude Code faster and more accurate at
working in this repo: [`defendend/ast-index`](https://github.com/defendend/Claude-ast-index-search)
or [`ast-grep/ast-grep`](https://github.com/ast-grep/ast-grep)? A third,
related artifact — [`ast-grep/claude-skill`](https://github.com/ast-grep/claude-skill) —
is a thin Claude skill that wraps the ast-grep CLI, so it is in scope as a
possible bridge rather than a competitor.

## Framing

The two tools answer different questions and are not direct substitutes:

- **ast-index** is a code-intelligence *index*: "where is symbol X, who calls
  it, what depends on it?" — built for AI-agent navigation/retrieval.
- **ast-grep** is a structural *search / lint / rewrite* engine: "find (and
  optionally rewrite) every place shaped like this pattern."

Choosing "one" only makes sense once the job is named. For *navigation*,
ast-index. For *codemods/linting*, ast-grep. They overlap only in that both
parse with tree-sitter.

## The two tools

### defendend/ast-index

- Rust; tree-sitter → persistent **SQLite/FTS5** index (symbols, references,
  inheritance, modules, dependencies, language-specific metadata).
- **Native agent integration**: Claude plugin + **MCP server (20+ tools)** +
  auto-generated `.claude/rules/ast-index.md` + git/edit hooks for incremental
  index updates. Claude reaches for it automatically.
- ~34 languages. Incremental `update`; monorepo/`--walk-up` support.
- Claimed lookup speedups on a 29k-file project (e.g. ~90× class lookup, ~260×
  imports) from the pre-built index.
- Activity (as of June 2026): ~426★, 91 releases, MIT, actively maintained
  (v3.46.x added atomic DB swap, rebuild memory caps, dead-FUSE timeouts).
- **Cost**: per-project SQLite index (build time + on-disk size); ~44 MB binary.

### ast-grep/ast-grep

- Rust + tree-sitter; **no index** — scans on each run, multi-core.
- Query model: code-shaped patterns with `$VAR` metavariables
  (`var $X = $Y` → `let $X = $Y`) and **YAML lint rules** for codemods.
- **Core strength: rewriting / large-scale refactor / lint** — ast-index does
  not do this.
- **No built-in MCP/Claude integration** (that is exactly why
  `ast-grep/claude-skill` exists). Claude can still drive it via plain Bash.
- Activity: ~14.4k★, MIT — an established, battle-tested dev-tooling project.

## Comparison

| Dimension | defendend/ast-index | ast-grep/ast-grep |
|---|---|---|
| Primary job | Navigation / retrieval for agents | Structural search + lint + rewrite |
| Index | Persistent SQLite (fast repeats) | None — scans each query |
| Query model | Tool calls (find symbol/usages/callers) | AST patterns + YAML rules |
| Claude integration | Native (MCP + plugin + hooks) | None built in (wrapper skill exists) |
| Codemods/rewrite | No | Yes (core competency) |
| Maturity / reach | Niche but active (~426★) | Industry-standard (~14.4k★) |
| Languages | ~34 | tree-sitter set (~20+) |
| Footprint | ~44 MB binary + per-project index | CLI binary, no index |

## Candidate directions

1. **Navigation-first (recommended for the agent workflow):** adopt
   **ast-index** as the default search/nav backbone for Claude Code, since it is
   the only option with native MCP/plugin integration and an auto-refreshing
   index.
2. **Refactor-first:** if the dominant pain is repo-wide linting/codemods, adopt
   **ast-grep**; rewriting is its core competency and ast-index cannot do it.
3. **Both (complementary):** ast-index for *finding/understanding*, ast-grep for
   *transforming*. Optionally add `ast-grep/claude-skill` so Claude uses
   ast-grep idiomatically rather than via ad-hoc Bash. This is the strongest
   combination and the two do not meaningfully overlap.

## Key tradeoffs

- ast-index buys fast, repeatable lookups at the cost of index build time and
  on-disk size — material in **ephemeral/CI containers** where the index is
  rebuilt each session.
- ast-grep has zero index overhead and unmatched maturity, but gives Claude no
  navigation graph and no native integration.

## Open questions

- What is ast-index's actual index build time and on-disk size on *this*
  repo, and is it acceptable in the remote/ephemeral execution environment
  (rebuilt per session)?
- Does this repo's polyglot mix (TS/Node + Swift) get good symbol coverage from
  ast-index's tree-sitter set?
- Do we want a committed, shared config (`.ast-index.yaml`, `.claude/rules`) or
  per-developer local setup?
- Is repo-wide codemod/lint a real near-term need (justifying ast-grep now) or
  speculative?

## Assumptions requiring validation

- The claimed ast-index speedups generalize to our repo size/shape.
- Claude actually invokes the ast-index MCP tools in practice without heavy
  prompting (the integration's main selling point).

## Summary

Not a head-to-head: **ast-index = navigation, ast-grep = transformation.** For
"make Claude Code better at understanding this repo," lead with **ast-index**
(native integration is decisive). Keep **ast-grep** for codemod/lint work, where
ast-index has nothing to offer. If forced to one and the goal is agent-assisted
navigation, pick ast-index; if the goal is refactoring at scale, pick ast-grep.
Next step is a time-boxed ast-index trial on this repo (see `backlog/ast.md`).
