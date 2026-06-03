---
date: 2026-06-03
model: claude-opus-4-8
description: "Next steps for the traceability-review skill: consolidation refactor, remaining passes, parked decisions"
---

# Traceability Review — TODO

Baseline: **v0.6.0** — four validated passes + the intent-driven lean + project specifics lifted to a case study, committed on branch `traceability`. **Re-run the relevant eval after each change** to confirm behavior is preserved before committing.

## Consolidation refactor (remaining moves — one at a time, eval + review after each)

The skill grew prescriptive while we were killing run-to-run variance — right for *discovery*, wrong as the *resting state*. One move remains:

1. **Reclassify evals.** Treat eval fixtures as a **skill-quality regression harness** (does the next version behave like the last on a frozen fixture), **not** a living per-project contract. Per-project fixtures + reference outputs are perishable, provenance-stamped snapshots; refresh them via the human-confirm loop when the target's docs move. Document this so a future reader does not mistake a stale-doc eval failure for a skill regression.

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
