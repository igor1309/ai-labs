---
date: 2026-06-03
model: claude-opus-4-8
description: "Umbrella ledger for Agonara — cross-cutting aggregation of all seven authoritative per-pass traceability-review outputs into one resolution-session register"
skill: traceability-review
skill_version: "0.11.0"
scope: "umbrella ledger — agonara"
mechanism: umbrella-ledger
inputs:
  - { file: "agonara/docs/traceability-reviews/2026-06-03T1007Z-intent.md", pass: "intent × intent", skill_version: "0.0.1" }
  - { file: "agonara/docs/traceability-reviews/2026-06-03T1127Z-intent-adr-corpus-curator.md", pass: "intent → ADR (Corpus Storage + Curator Workspace)", skill_version: "0.2.0" }
  - { file: "agonara/docs/traceability-reviews/2026-06-03T1204Z-adr-adr-crossmodule.md", pass: "ADR × ADR", skill_version: "0.3.0" }
  - { file: "agonara/docs/traceability-reviews/2026-06-03T1406Z-intent-allocation.md", pass: "allocation completeness", skill_version: "0.4.0" }
  - { file: "agonara/docs/traceability-reviews/2026-06-03T1807Z-adr-spec-corpus-curator.md", pass: "ADR → spec (Corpus Storage + Curator Workspace)", skill_version: "0.7.0" }
  - { file: "agonara/docs/traceability-reviews/2026-06-03T1843Z-spec-tests-corpus-curator.md", pass: "spec ↔ tests (Corpus Storage + Curator Workspace)", skill_version: "0.8.0" }
  - { file: "agonara/docs/traceability-reviews/2026-06-03T1928Z-orphan-adr-intent-corpus-curator.md", pass: "upward orphan check (Corpus Storage + Curator Workspace)", skill_version: "0.9.0" }
---

# Umbrella Ledger — Agonara

## Summary

- **Findings:** 5 total — 0 fail, 5 warning. (One intent→ADR `carried-with-loss`; four ADR×ADR `map-adr-drift`.)
- **Open questions:** 15.
- **Total items enumerated:** 20.
- **Resolving-layer histogram (each item once, by primary layer):**
  - map revision: 5 (U-02, U-03, U-04, U-05, U-10)
  - ADR (current / future): 5 (U-01, U-12, U-13, U-15, U-16)
  - intent: 6 (U-06, U-07, U-11, U-14, U-19, U-20)
  - spec / schema: 2 (U-08, U-09)
  - spec ↔ tests scope / granularity: 2 (U-17, U-18)
- **Threads:** 4.

What the resolution session should settle first: the **map-drift cluster** — the four ADR×ADR `map-adr-drift` warnings (F-2/F-3/F-4/F-5 below) plus the ADR×ADR open question on map-revision timing all land on one decision (revise `module_responsibility_map.md` to absorb the now-accepted ADRs 009/016/014), so settling that single map revision clears the largest contiguous block of items.

## Ledger

Complete enumeration: one row per finding and one row per open question across all seven aggregated outputs, pinned to `(pass, item-id)`. Each row links to its source output; it does not re-quote the source evidence.

| id | source (pass · output · finding/line) | kind | severity | type | subject | resolving layer | one-line summary |
|---|---|---|---|---|---|---|---|
| U-01 | intent→ADR · 1127Z · F-1 | finding | warning | carried-with-loss (fidelity) | confusable/related concepts (INT-02, STU-07) | ADR (ADR-010) | ADR-010's accepted-entity enumeration names no confusable/related-concept relation the intent treats as first-class. |
| U-02 | ADR×ADR · 1204Z · F-1 | finding | warning | map-adr-drift | accepted Program shell ownership | map revision | Corpus Storage `Owns` cell does not name the accepted Program shell that ADR-009 settled. |
| U-03 | ADR×ADR · 1204Z · F-2 | finding | warning | map-adr-drift | quick-check answer keys / options / revisions | map revision | Map omits Corpus-Storage-owned quick-check revisions/options/answer-keys (with secrecy obligation) that ADR-016 settled. |
| U-04 | ADR×ADR · 1204Z · F-3 | finding | warning | map-adr-drift | student-facing delivery projection | map revision | No map row for the Corpus-Storage-owned answer-key-excluding delivery projection ADR-016 requires. |
| U-05 | ADR×ADR · 1204Z · F-4 | finding | warning | map-adr-drift | evaluator job/worker orchestration | map revision | Student Workspace `Owns` cell omits the evaluator-job orchestration / worker-provider boundary ADR-014/015 settled. |
| U-06 | intent×intent · 1007Z · Q1 | open-question | — | implicit-distinction | curator membership operation vs policy | intent | Intent never states the operation-vs-policy line; curator does membership ops (CUR-14/17) yet "does not define membership policy". |
| U-07 | intent×intent · 1007Z · Q2 | open-question | — | unspecified-taxonomy | self-join vs invitation join modes (STU-18, STU-22) | intent | Intent does not say whether self-join and invitation are exclusive program types, policy modes, or overlapping. |
| U-08 | intent→ADR · 1127Z · Q1 | open-question | — | schema-shape | confusable/related-concept representation | spec / schema | Even once F-1 (U-01) is fixed at the ADR, the relation's cardinality/direction/payload are spec/schema decisions. |
| U-09 | intent→ADR · 1127Z · Q2 | open-question | — | schema-shape | STU-10 material→concept back-navigation linkage | spec / schema | Spec must decide whether back-navigation is a derived query or a stored reverse edge. |
| U-10 | ADR×ADR · 1204Z · Q1 | open-question | — | map-governance | timing of the map revision | map revision (intent→ADR / map-governance) | Whether to revise the map now or after the next intent-driven slice is a map-governance call, not an ADR×ADR contradiction. |
| U-11 | ADR×ADR · 1204Z · Q2 | open-question | — | out-of-scope-coverage | cross-module seam coverage | intent | Seam coverage (no-owner capabilities) cannot be judged at the ADR×ADR layer; the intent layer owns that check. |
| U-12 | allocation · 1406Z · Q1 | open-question | — | deferred-policy | readiness / progression policy (STU-05, STU-14, INT-06) | ADR / spec | Underlying corpus/attempt records are owned; whether the deferred readiness/progression slice needs its own ADR is open. |
| U-13 | allocation · 1406Z · Q2 | open-question | — | depth-of-ownership | cross-cutting Analytics/Logging/Observability/Backup | Pre-ADR / ADR | Cross-cutting concerns are carried in the map but only Backup/Restore has per-ADR invariants; per-concern ADR need is open. |
| U-14 | allocation · 1406Z · Q3 | open-question | — | upstream-product-question | multiple programs per student at once | intent | Intent leaves "support multiple programs per student" open; no story asserts it, so no allocation gap, but noted upstream. |
| U-15 | ADR→spec · 1807Z · Q1 | open-question | — | deferred-shape | `AcceptedCorpusKind` extension beyond topic/concept | ADR / future spec | First slice realizes only topic/concept; a later spec slice must extend the kind set to honour D2/R10 in full. |
| U-16 | ADR→spec · 1807Z · Q2 | open-question | — | deferred-flow | Admin recovery flow (R23, adr-010:87) | ADR | Admin corpus-recovery flow is deferred to a later ADR; that ADR should confirm the first-slice restore guards stay compatible. |
| U-17 | spec↔tests · 1843Z · Q1 | open-question | — | cross-module-shared | Assessment-shared authorization scaffolding | spec ↔ tests (Assessment module pass) | Corpus and assessment tests share auth scaffolding in one file; confirming the assessment specs own their titles belongs to the Assessment pass. |
| U-18 | spec↔tests · 1843Z · Q2 | open-question | — | granularity | bundled validation tests vs per-clause assertions | spec ↔ tests granularity (observation) | Several clauses share one bundled test name; whether each clause has a distinct assertion can't be judged from titles alone. |
| U-19 | orphan · 1928Z · Q1 | open-question | — | derived-vs-explicit | atomicity + event-emission requirements (adr-009:75,78,79,54) | intent | Internal-integrity derivations with no direct intent parent; tying them to an explicit stakeholder requirement is an intent-layer call. |
| U-20 | orphan · 1928Z · Q2 | open-question | — | borderline-shape | operator-visible Program metadata (adr-009:42) | intent | Closest-to-borderline shape commitment, treated as carried-shape; constraining/forbidding operator metadata is an intent-side decision. |

## Resolving-layer rollup

Deterministic grouping of every ledger row by the layer that settles it — the resolution session's work queue.

### Map revision (5 items)

The largest block; all are stale per-module `Owns` entries vs. accepted ADRs, plus the governance call on when to apply them.

- U-02 (F-1) — add accepted Program shell + stable identifier to Corpus Storage `Owns` (ADR-009).
- U-03 (F-2) — add quick-check revisions/options/answer-keys (with answer-key secrecy boundary) to Corpus Storage `Owns` (ADR-016).
- U-04 (F-3) — add student-facing delivery-projection responsibility (answer-key exclusion) (ADR-016).
- U-05 (F-4) — add evaluator-job orchestration + worker/provider boundary to Student Workspace `Owns` (ADR-014/015).
- U-10 (Q) — decide whether to revise the map now or after the next intent-driven slice.

### ADR (5 items)

Fixes or confirmations that land in an ADR (current or future).

- U-01 (F) — amend ADR-010's accepted-entity enumeration to own confusable/related-concept relations, or add an explicit Non-Goal deferral (converts the finding to `deferred`).
- U-12 (Q) — decide whether a future readiness/progression slice needs its own ADR.
- U-15 (Q) — a later spec slice / ADR must extend `AcceptedCorpusKind` beyond topic/concept.
- U-16 (Q) — the eventual Admin-recovery ADR must confirm first-slice restore guards remain compatible.
- U-13 (Q) — decide (Pre-ADR / ADR) whether Analytics/Logging/Observability each need a dedicated ADR like Backup/Restore.

### Intent (6 items)

Tensions only the intent / user-story layer can settle.

- U-06 (Q) — state the curator membership operation-vs-policy distinction explicitly.
- U-07 (Q) — define the self-join vs invitation join-mode taxonomy.
- U-11 (Q) — own the cross-module seam-coverage check (no-owner capabilities).
- U-14 (Q) — resolve the upstream "multiple programs per student at once" product question.
- U-19 (Q) — decide whether the atomicity/event-emission derivations need explicit stakeholder backing.
- U-20 (Q) — decide whether to constrain or forbid operator-visible Program metadata.

### Spec / schema (2 items)

Concrete representation decisions for relations whose existence is settled (or being settled) upstream.

- U-08 (Q) — choose the accepted-corpus representation (cardinality/direction/payload) of confusable/related-concept relations.
- U-09 (Q) — choose STU-10 material→concept back-navigation linkage (derived query vs stored reverse edge).

### Spec ↔ tests scope / granularity (2 items)

- U-17 (Q) — confirm via the Assessment module's own spec ↔ tests pass that the assessment titles are owned there.
- U-18 (Q) — granularity observation only; no further layer resolves it (would require reading test bodies, which the pass rule forbids).

(Note: U-19 and U-20 both resolve at the intent layer and are listed under Intent; the Intent block therefore carries 6 items. The histogram in the Summary counts each item once by its primary tag.)

## Threads

Judgement grouping of items that are the same underlying tension across passes. Threads may overlap the rollup; they exist to show the session which items move together.

### T1 — Map-drift cluster (the accepted-but-unmapped ADRs)

The dominant thread: four accepted-ownership facts that the provisional v0.4.3 map has not absorbed, plus the governance question of when to absorb them. One map revision discharges all five.

- Bundles: **U-02, U-03, U-04, U-05** (the four ADR×ADR `map-adr-drift` findings) + **U-10** (the map-revision-timing open question).

### T2 — Confusable-concept loss and its downstream schema shape

The intent's first-class "confusing neighbors" capability is narrowed at ADR-010 (the only non-map finding) and, even once restored at the ADR, still needs a concrete schema. The finding and its downstream schema question are one tension surfacing at two layers.

- Bundles: **U-01** (intent→ADR F-1, the ADR-layer loss) + **U-08** (intent→ADR Q1, the spec/schema representation).

### T3 — Deferred first-slice scope (corpus shape carried, realization postponed)

A family of "ownership held, concrete shape/realization deferred to a later slice/ADR" items. None is a loss; together they define the corpus/assessment realization backlog the next slices must pick up.

- Bundles: **U-09** (STU-10 back-navigation linkage), **U-12** (readiness/progression policy), **U-15** (`AcceptedCorpusKind` extension), **U-16** (Admin-recovery flow), **U-13** (cross-cutting depth-of-ownership).

### T4 — Intent-layer underspecification (taxonomies and borderline shapes the intent left open)

Items the downstream passes routed back to the intent because only the user-story layer can settle the distinction — join-mode and membership taxonomies, seam-coverage ownership, the multi-program product question, and the two orphan-check borderline derivations.

- Bundles: **U-06** (operation vs policy), **U-07** (join-mode taxonomy), **U-11** (seam coverage), **U-14** (multiple programs per student), **U-19** (atomicity/event-emission derivations), **U-20** (operator-visible metadata).

(U-17 and U-18 — the spec↔tests scope/granularity observations — stand alone; they are not part of a cross-pass tension.)

## Inspected

### Aggregated outputs (current authoritative output per pass)

| Pass | Output file | skill_version | Findings | Open questions |
|---|---|---|---|---|
| intent × intent | 2026-06-03T1007Z-intent.md | 0.0.1 | 0 | 2 |
| intent → ADR (Corpus Storage + Curator Workspace) | 2026-06-03T1127Z-intent-adr-corpus-curator.md | 0.2.0 | 1 | 2 |
| ADR × ADR (cross-module) | 2026-06-03T1204Z-adr-adr-crossmodule.md | 0.3.0 | 4 | 2 |
| allocation completeness | 2026-06-03T1406Z-intent-allocation.md | 0.4.0 | 0 | 3 |
| ADR → spec (Corpus Storage + Curator Workspace) | 2026-06-03T1807Z-adr-spec-corpus-curator.md | 0.7.0 | 0 | 2 |
| spec ↔ tests (Corpus Storage + Curator Workspace) | 2026-06-03T1843Z-spec-tests-corpus-curator.md | 0.8.0 | 0 | 2 |
| upward orphan check (Corpus Storage + Curator Workspace) | 2026-06-03T1928Z-orphan-adr-intent-corpus-curator.md | 0.9.0 | 0 | 2 |

Totals: 5 findings, 15 open questions, 20 items.

### Excluded (superseded)

- **2026-06-03T1050Z-intent-adr.md** — the whole-surface intent→ADR run. Superseded by the per-module run `2026-06-03T1127Z-intent-adr-corpus-curator.md` (skill_version 0.2.0), which is the current authoritative intent→ADR output. Per the skill's link rule, only the current authoritative output per pass is aggregated; the superseded whole-surface run is excluded to avoid double-counting the same pass.
