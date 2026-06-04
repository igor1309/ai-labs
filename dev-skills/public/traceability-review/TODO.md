---
date: 2026-06-04
model: claude-opus-4-8
description: "Next steps for the traceability-review skill: umbrella ledger variance check, possible extensions, parked decisions"
---

# Traceability Review — TODO

## Next
- **Umbrella ledger variance check** — the umbrella ledger shipped (v0.11.0) on one qualitative run; its 2nd (variance) run was deferred (session subagent limit). Re-run the ledger over the seven authoritative per-pass outputs and confirm the enumeration (20 items — 5 findings, 15 open questions) reproduces; the thread set is the expected unpinned wobble. Then the ledger is fully validated like the seven passes.

## Possible extension
- **Spec-level upward orphan check** — pass 7 (v0.9.0) implements the upward orphan check at the **ADR→intent** layer (every ADR decision must trace back to a source intent). The spec→ADR/intent counterpart — does every spec clause trace back to an ADR decision or intent — is the natural extension if spec-level scope creep needs guarding. Vocabulary grounded in `research/orphan-requirement-allocation-completeness.md`.

## Parked
- **Publishing workflow** — when merging to trunk: `marketplace.json` + `plugin.json` bump, log entry, PR (per `dev-skills/.claude/CLAUDE.md`). Decide public vs internal.
- **Hosting / triggering** — single vs multi agent; where it runs in anger.
- **CUR-13 refinement** — distinguish acceptance-time provenance from pre-acceptance visibility (the passes stably classify it allocated/carried; an arguable under-flag).
