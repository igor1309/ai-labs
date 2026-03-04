# Corpus Scout Log

## 2026-03-04

Add testing corpus scout documentation.
Implement determinism eval runner (ADR-0002): adapter spawns MCP subprocess and queries via keyword extraction, eval engine computes ESM/NCFB/MUST boolean gates, reporter emits `report.json` per ADR schema. Gold dataset integrity preflight verifies `must_contain` tokens exist in corpus. 27/30 cases pass with zero run-to-run drift across 3 consecutive runs.
Create synthetic Russian humanities corpus (12 files) and gold dataset (30 cases) for determinism evals. All `must_contain` tokens verified against corpus sections.
Rewrite `determinism-checks.md` for clarity: dedup repeated sections, add structure, remove conversational tone.

## 2026-03-03

Add `determinism-checks.md` documenting eval strategy for corpus-scout.
Implement corpus-scout MCP server end-to-end: corpus-client with ripgrep-backed search and `readSection` (heading + line-range modes), MCP server exposing `search` and `read_section` tools, composition root with startup validation, e2e tests, and smoke script.
Add `determinism-checks.md` documenting eval strategy for corpus-scout.
