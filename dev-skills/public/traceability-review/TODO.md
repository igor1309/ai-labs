---
date: 2026-06-04
model: claude-opus-4-8
description: "Open task backlog and parked decisions for the traceability-review skill"
---

# Traceability Review — TODO

## Candidates
- **Cross-module coverage** — passes 5–7 (ADR→spec, spec↔tests, orphan check) and the umbrella ledger currently cover only Corpus Storage + Curator Workspace. Run them across the other Agonara modules (Program Membership, Student Workspace, Identity & Role Management, Assessment). Remediation the passes are ready for, not new tooling.
- **Spec-level upward orphan check** — pass 7 covers ADR→intent (every ADR decision must trace back to a source intent); the spec→ADR/intent counterpart — does every spec clause trace back — is the natural extension if spec-level scope creep needs guarding. Vocabulary grounded in `research/orphan-requirement-allocation-completeness.md`.

## Parked
- **Publishing workflow** — when merging to trunk: `marketplace.json` + `plugin.json` bump, log entry, PR (per `dev-skills/.claude/CLAUDE.md`).
- **Hosting / triggering** — single vs multi agent; where it runs in anger.
- **CUR-13 refinement** — distinguish acceptance-time provenance from pre-acceptance visibility (the passes stably classify it allocated/carried; an arguable under-flag).
