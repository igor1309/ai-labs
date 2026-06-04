---
date: 2026-06-04
model: claude-opus-4-8
description: "Next steps for the traceability-review skill: pipeline + ledger complete, optional extensions, parked decisions"
---

# Traceability Review — TODO

## Next
- No task is queued. The seven passes **and** the umbrella ledger (v0.11.1) are implemented and validated on Agonara (Corpus/Curator + the intent/ADR layers), and all the work is committed on the `traceability` branch (unpushed; publishing is parked). Pick from the optional candidates below, or run passes 5–7 across the other Agonara modules — the per-module passes currently cover only Corpus Storage + Curator Workspace, and extending them is real remediation work the passes are ready for.

## Possible extension
- **Spec-level upward orphan check** — pass 7 (v0.9.0) implements the upward orphan check at the **ADR→intent** layer (every ADR decision must trace back to a source intent). The spec→ADR/intent counterpart — does every spec clause trace back to an ADR decision or intent — is the natural extension if spec-level scope creep needs guarding. Vocabulary grounded in `research/orphan-requirement-allocation-completeness.md`.

## Parked
- **Publishing workflow** — when merging to trunk: `marketplace.json` + `plugin.json` bump, log entry, PR (per `dev-skills/.claude/CLAUDE.md`). Decide public vs internal.
- **Hosting / triggering** — single vs multi agent; where it runs in anger.
- **CUR-13 refinement** — distinguish acceptance-time provenance from pre-acceptance visibility (the passes stably classify it allocated/carried; an arguable under-flag).
