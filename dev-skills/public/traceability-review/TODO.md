---
date: 2026-06-04
model: claude-opus-4-8
description: "Open task backlog and parked decisions for the traceability-review skill"
---

# Traceability Review — TODO

## Candidates
- **Cross-module coverage** — run passes 5–7 + the umbrella ledger across Agonara's
  remaining modules. Remediation the passes are ready for, not new tooling. Outputs go
  to `agonara/docs/traceability-reviews/`; project-bound, no SKILL version bump.
  Remaining work:
  - **Assessment** — passes 6 (spec↔tests) and 7 (orphan). ADR-011 + ADR-016; specs
    accepted-checks-and-assessment-criteria (first-slice + api) + quick-check-assessment-first-slice.
  - **Student Workspace** — passes 5–7. Largest module (ADR-012/013/014/015, 5 specs,
    a ~10k-line test file); split each pass by clustered concern.
  - **Umbrella ledger** — regenerate over all covered module passes once the per-module
    passes are complete.
  - Open decision: whether to freeze the new reference outputs as `evals/evals.json`
    regression fixtures.
- **Spec-level upward orphan check** — pass 7 covers ADR→intent (every ADR decision must trace back to a source intent); the spec→ADR/intent counterpart — does every spec clause trace back — is the natural extension if spec-level scope creep needs guarding. Vocabulary grounded in `research/orphan-requirement-allocation-completeness.md`.

## Parked
- **Publishing workflow** — when merging to trunk: `marketplace.json` + `plugin.json` bump, log entry, PR (per `dev-skills/.claude/CLAUDE.md`).
- **Hosting / triggering** — single vs multi agent; where it runs in anger.
- **CUR-13 refinement** — distinguish acceptance-time provenance from pre-acceptance visibility (the passes stably classify it allocated/carried; an arguable under-flag).
