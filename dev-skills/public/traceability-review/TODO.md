---
date: 2026-06-03
model: claude-opus-4-8
description: "Next steps for the traceability-review skill: consolidation refactor, remaining passes, parked decisions"
---

# Traceability Review — TODO

## Remaining passes
- **ADR → spec** (per module) — each ADR decision honoured by its spec. Same per-module deterministic-matrix mechanism that's now proven.
- **spec ↔ tests** (per module) — test *names* only, no running; every spec clause has a named test, every test name traces to a clause.

## New pass identified (from research)
- **Upward orphan check** — does every ADR/spec trace *back* to a source intent, or is it unrequested scope creep? Distinct from allocation completeness (which is the *downward* check). Vocabulary grounded in `research/orphan-requirement-allocation-completeness.md`.

## Cross-cutting
- **Umbrella ledger** — aggregate findings across all passes into what a human resolution session works from. Grows more necessary with each pass.

## Parked
- **Publishing workflow** — when merging to trunk: `marketplace.json` + `plugin.json` bump, log entry, PR (per `dev-skills/.claude/CLAUDE.md`). Decide public vs internal.
- **Hosting / triggering** — single vs multi agent; where it runs in anger.
- **CUR-13 refinement** — distinguish acceptance-time provenance from pre-acceptance visibility (the passes stably classify it allocated/carried; an arguable under-flag).
