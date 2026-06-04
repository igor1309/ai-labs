---
date: 2026-06-04
model: claude-opus-4-8
description: "Open task backlog and parked decisions for the traceability-review skill"
---

# Traceability Review — TODO

## Candidates
- **Cross-module coverage** — passes 5–7 + umbrella ledger across the other Agonara
  modules. **In progress** (branch `worktree-traceability`, outputs in
  `agonara/docs/traceability-reviews/`):
  - **Program Membership** — passes 5, 6, 7 done (clean). ADR-004/005/006/007 + 009.
  - **Identity & Role Management** — passes 5, 6, 7 done. Pass 6 surfaced **1 warning
    (W1)**: first-slice clause 10 (password ≥12 chars → `validation_failed`) has no
    test of that name in the suite. ADR-001/002/003/008.
  - **Assessment** — pass 5 (ADR→spec) done (clean). **Passes 6 (spec↔tests) and 7
    (orphan) remain.** ADR-011 + ADR-016; specs accepted-checks-and-assessment-criteria
    (first-slice + api) + quick-check-assessment-first-slice. Note: ADR-011's
    open-answer attempt/evaluation decisions are owned by the Student Workspace specs
    (deferred), realized there not in the accepted-checks slice; quick-check is realized
    end-to-end in the quick-check spec.
  - **Student Workspace** — **not started** (largest module: ADR-012/013/014/015, 5
    specs ~1480 lines, a 9985-line test file). Dedicated session.
  - **Umbrella ledger** — re-run over ALL module passes once Assessment 6/7 are done;
    must aggregate W1 + the per-pass open questions. Existing Corpus/Curator umbrella:
    `agonara/docs/traceability-reviews/2026-06-03T2019Z-umbrella-ledger.md`.
  - These are project-bound reference outputs (no SKILL version bump); evals.json was
    not extended for the new outputs this round — decide whether to freeze them as
    regression fixtures.
- **Spec-level upward orphan check** — pass 7 covers ADR→intent (every ADR decision must trace back to a source intent); the spec→ADR/intent counterpart — does every spec clause trace back — is the natural extension if spec-level scope creep needs guarding. Vocabulary grounded in `research/orphan-requirement-allocation-completeness.md`.

## Parked
- **Publishing workflow** — when merging to trunk: `marketplace.json` + `plugin.json` bump, log entry, PR (per `dev-skills/.claude/CLAUDE.md`).
- **Hosting / triggering** — single vs multi agent; where it runs in anger.
- **CUR-13 refinement** — distinguish acceptance-time provenance from pre-acceptance visibility (the passes stably classify it allocated/carried; an arguable under-flag).
