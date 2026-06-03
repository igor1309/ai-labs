---
date: 2026-06-03
model: claude-opus-4-8
description: "Next steps for the traceability-review skill: consolidation refactor, remaining passes, parked decisions"
---

# Traceability Review — TODO

## Next
- **Umbrella ledger** — aggregate findings across all passes into what a human resolution session works from. Grows more necessary with each pass; now the clear next step.

## Possible extension
- **Spec-level upward orphan check** — pass 7 (v0.9.0) implements the upward orphan check at the **ADR→intent** layer (every ADR decision must trace back to a source intent). The spec→ADR/intent counterpart — does every spec clause trace back to an ADR decision or intent — is the natural extension if spec-level scope creep needs guarding. Vocabulary grounded in `research/orphan-requirement-allocation-completeness.md`.

## Parked
- **Publishing workflow** — when merging to trunk: `marketplace.json` + `plugin.json` bump, log entry, PR (per `dev-skills/.claude/CLAUDE.md`). Decide public vs internal.
- **Hosting / triggering** — single vs multi agent; where it runs in anger.
- **CUR-13 refinement** — distinguish acceptance-time provenance from pre-acceptance visibility (the passes stably classify it allocated/carried; an arguable under-flag).
