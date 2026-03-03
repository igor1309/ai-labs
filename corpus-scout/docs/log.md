# Corpus Scout Log

## 2026-03-04

Create synthetic Russian humanities corpus (12 files) and gold dataset (30 cases) for determinism evals. All `must_contain` tokens verified against corpus sections.
Rewrite `determinism-checks.md` for clarity: dedup repeated sections, add structure, remove conversational tone.

## 2026-03-03

Add `determinism-checks.md` documenting eval strategy for corpus-scout.
Implement corpus-scout MCP server end-to-end: corpus-client with ripgrep-backed search and `readSection` (heading + line-range modes), MCP server exposing `search` and `read_section` tools, composition root with startup validation, e2e tests, and smoke script.
Add `determinism-checks.md` documenting eval strategy for corpus-scout.
