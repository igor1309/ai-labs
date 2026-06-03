---
date: 2026-06-03
model: claude-opus-4-8
description: "Worked example behind the traceability-review skill — what each pass found on Agonara, and the methodological lessons that shaped the skill"
---

# Traceability Review — Agonara Case Study (field notes)

The worked example the skill was developed and validated against. **Perishable:**
these findings are a snapshot at the document versions noted in each reference
output; they go stale as Agonara evolves. Re-run a pass and re-confirm via the
human loop rather than trusting this doc as current state.

The actual matrices/registers live in `agonara/docs/traceability-reviews/`; the
eval fixtures (`evals/evals.json`) freeze these as the skill's regression
baseline.

## What each pass found

- **intent × intent** — clean. The role boundaries interlock rather than
  collide (corpus/student-state separation, membership-authority partition, and
  LLM-draft-only restated consistently across roles). The genuine ambiguities
  (curator operation-vs-policy, self-join-vs-invitation) were routed downstream
  as open questions, not forced into findings.
- **intent → ADR** — one real **loss**: INT-02 / STU-07 commit to a
  "confusing neighbors" concept-relation, but ADR-010's closed accepted-entity
  enumeration omits it and no Non-Goal defers it (unacknowledged narrowing).
  CUR-09 (gap discovery) and CUR-13 (suggestion provenance) are faithfully
  **carried**. Lesson below on why this is run per module.
- **ADR × ADR** — cross-module **compatible**: 0 double-ownership, 0 contract
  inconsistency, 0 boundary violation across ~27 ownership rows and ~9 shared
  contracts. The only finding class is **map drift** — the provisional module
  responsibility map lags accepted ADRs (e.g. the Program shell from ADR-009,
  evaluator orchestration from ADR-014, quick-check answer keys from ADR-016).
- **allocation completeness** — **0 unallocated**. Notably, "program discovery"
  (STU-01/02/03), which a noisy whole-surface intent→ADR run had flagged as a
  seam, is **allocated**: the program *record* is owned (Corpus Storage shell +
  Program Membership), and the student-facing *discovery view* is a downstream
  (ADR→spec) concern, not a module-ownership gap. The suppression rules caught
  the would-be false positives (Product Analytics via a system-level owner;
  deferred-mechanics capabilities via an explicit owner).

## Methodological lessons (these are what the skill encodes)

- **Completeness beats sampling.** A whole-surface intent→ADR pass *sampled* —
  three runs barely agreed on any finding. Per-module + a forced-complete matrix
  reliably surfaced the same real defect (and even corrected a whole-surface
  false "uncovered" on CUR-09). This is why intent→ADR runs per module and why
  "enumerate every item" is the one non-negotiable.
- **Pin rows to the source's own units.** Ad-hoc row granularity made
  finding/verdict counts wobble run-to-run (ADR×ADR drift count 4/1/1;
  allocation buckets 71/67/66). Pinning rows to map `Owns` entries / intent
  story IDs stabilises the enumeration.
- **The five allocation false-positive guards** (status / type / multi-owner /
  pending / system-level owner) come from requirements-engineering practice —
  grounded in `research/orphan-requirement-allocation-completeness.md`. They are
  what stops a deferred, cross-cutting, or owned-elsewhere capability being
  mis-flagged as unallocated.
- **Deferred ≠ finding; record-owned-but-view-deferred = allocated.** Deferring
  a capability's *shape* (via a Non-Goal) does not defer its *existence*; a
  capability whose record is owned but whose presentation is a downstream
  concern is allocated, with the view logged as an open question.
- **Vocabulary.** "Unallocated" = no *downward* owner (allocation completeness);
  "orphan" = no *upward* parent (a separate, not-yet-built pass). Don't conflate.
