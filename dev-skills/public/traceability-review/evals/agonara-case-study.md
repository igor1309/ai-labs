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

The actual matrices/registers live in `evals/traceability-reviews/`; the
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
- **upward orphan check** — **0 orphans** across 63 ADR-decision rows (ADR-010 +
  ADR-009, Corpus/Curator). Every Decision/Rule traces back to an accepted intent
  (INT-/CUR-/STU-/ADM-) or is a legitimate *derived* decision (storage/separation
  mechanism, acceptance attribution/provenance, atomicity, event emission) of a
  traced one. The parent-less-*looking* decisions — the Program shell + its
  operator-visible metadata (ADR-009), the self-join admission default, stable
  accepted revisions — reproduced as the same judgement calls on every run and
  were routed to open questions (intent layer), never forced to ORPHAN. This is
  the *upward* counterpart to allocation completeness: allocation found 0
  unallocated (no intent without an owner), this found 0 orphan (no ADR decision
  without an intent parent).
- **umbrella ledger** (cross-cutting) — aggregating the seven authoritative
  outputs gave **20 items: 5 findings** (4 ADR×ADR `map-adr-drift` + 1 intent→ADR
  `carried-with-loss`, all warnings, 0 fail) **+ 15 open questions**. The
  resolving-layer rollup put the largest block on **one map revision** (the four
  map-drift findings + the map-revision-timing question all clear together — the
  resolution session's first move), with the rest routing to ADR (5), intent (6),
  spec/schema (2), and spec↔tests (2). Threads surfaced the cross-pass tensions
  (map-drift cluster; the confusable-concept loss + its downstream schema
  question; the deferred first-slice backlog; the intent-underspecification set).
  *Validated across 3 runs — the 20-item / 5-finding enumeration and the 15
  open-question split reproduced exactly; the resolving-layer bucketing and
  thread count (4/4/5) are the expected unpinned judgement wobble.*

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
  pending / system-level owner) come from requirements-engineering practice — the
  orphan / unallocated / derived-requirement vocabulary and the
  allocation-completeness check. They are what stops a deferred, cross-cutting, or
  owned-elsewhere capability being mis-flagged as unallocated.
- **Deferred ≠ finding; record-owned-but-view-deferred = allocated.** Deferring
  a capability's *shape* (via a Non-Goal) does not defer its *existence*; a
  capability whose record is owned but whose presentation is a downstream
  concern is allocated, with the view logged as an open question.
- **Vocabulary.** "Unallocated" = no *downward* owner (allocation completeness);
  "orphan" = no *upward* parent (the upward orphan check). Don't conflate.
- **The orphan check's row unit is softer than the ID-pinned passes.** Allocation
  and intent→ADR pin rows to externally numbered IDs (INT-01, CUR-01…), so counts
  are stable. The orphan check pins to *ADR prose decisions*, which carry no IDs —
  so the count drifted when runs folded coupled bullets or promoted
  Executive-Summary restatements (63 / 63 / 53 / 48 across early runs). The
  0-orphan verdict and *which* decisions are borderline reproduced perfectly
  throughout; only the count moved. v0.10.1 tightened the guard to *one row per
  bullet exactly as written — no folding, even of bullets sharing a parent
  decision*; runs reading only the skill then reproduced 63. The unit is still
  softer than ID-pinned in principle, so the eval pins the row-generation rule +
  the verdict + the named borderline decisions, not a number.
- **Derived requirement ≠ orphan.** A decision with no direct intent parent is not
  automatically scope creep: a *derived requirement* — a technical/architectural
  means that necessarily follows from honouring a traced decision — legitimately
  has no stakeholder parent. ORPHAN fires only for *user-observable* scope that is
  neither a derivation nor an intent-left-open elaboration. Without this guard the
  pass would false-positive on every storage/attribution/atomicity rule.
- **The umbrella ledger aggregates, it does not re-analyse.** Its hard rule is
  *no new findings* — it indexes and groups what the passes already produced, and
  links back rather than re-quoting. Enumeration (one row per finding/open
  question) is near-deterministic; the **threads** are the judgement layer (which
  cross-pass items move together), so the eval pins the enumeration + the
  resolving-layer rollup, not the thread set. The rollup by *resolving layer* is
  the payload — it turns 20 scattered items into a work queue (one map revision
  clears five). And it is a **generated snapshot**, not a tracker: persistence
  lives in source-doc edits / Linear, so the ledger stays consistent with the
  perishable per-pass outputs it rolls up.
- **spec ↔ tests scope is discovered, not listed.** A module's clauses are
  tested across several files (domain, API, backup, executable); hand-listing
  files produced false "untested" findings until the pass grepped titles across
  the *whole* suite. And `grep` beats a written extraction script (measured: the
  script added authoring + run cost and pushed the whole suite through context,
  with no accuracy gain for names-only extraction). A negative/"does-not"
  guarantee that no test names is an open question — names-only can't confirm an
  *absence* — not an untested finding.
