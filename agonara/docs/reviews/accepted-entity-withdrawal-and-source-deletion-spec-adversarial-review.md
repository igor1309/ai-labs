---
date: 2026-06-28
model: claude-opus-4-8
description: "Adversarial review of the accepted-entity withdrawal and source-deletion spec against ADR-022, the My Way spec structure, and the implemented Agonara schema."
---

# Accepted Entity Withdrawal and Source Deletion Spec — Adversarial Review

## Scope

Reviewed `agonara/docs/specs/accepted-entity-withdrawal-and-source-deletion.md` against
[ADR-022](../adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md), the
[accepted-entity withdrawal pre-ADR](../pre-adr/accepted-entity-withdrawal_pre_adr.md), the My
Way [spec structure](../../../docs/my-way/04-spec/structure.md) and the `spec-review` skill,
the sibling [material content spec](../specs/material-content-storage.md), and the implemented
schema (`src/storage.js`), rejection vocabulary (`src/http-contract.js`), and dependency model
(`docs/specs/topic-period-readiness-checks.md`). The review tested behavioral clarity, ADR
boundary fidelity, edge/failure coverage, and groundedness against the real codebase. Findings
marked "fail, fixed" / "warn, fixed" were corrected in the same change set as this review.

## Findings

### ADR fidelity — lifecycle, authority, history preservation

- **Verdict:** pass.
- **Location:** spec rules 1–7, 19–20; Done criteria.
- **Why:** The spec carries ADR-022's core decisions intact: entity-level (never per-revision)
  `active`/`withdrawn` status defaulting to `active`; reversible withdraw/reactivate;
  reactivation restores `current_revision_id` unchanged; withdrawal preserves all revisions,
  attempts, evaluations, evidence, and learner state; curator-authorized, attributable,
  Program-scoped, Admin not the ordinary path; backup preserves status and restore validates it
  before mutation. The six entity families enumerated match the six `current_revision_id`-bearing
  accepted-entity tables in `src/storage.js` plus `program_sources`.
- **Fix:** None required.
- **Tests:** Cross-checked rule-by-rule against ADR-022 Decision items 1–7 and Rules/Invariants.

### Active-dependent block understated and partly inaccurate

- **Verdict:** fail, fixed.
- **Location:** spec rule 9 and Tests rule 6.
- **Why:** The draft listed readiness-check dependents as "a member check or criterion," but
  `docs/specs/topic-period-readiness-checks.md` rule 7 establishes that readiness requirements
  may target accepted **topic, concept, material-reference, quick-check, open-answer-check, or
  assessment-criterion** entities. Withdrawing a corpus topic/concept/material targeted by an
  active readiness requirement must therefore also block, which the draft missed. Separately,
  the draft described the open-answer-check dependent as referencing "the criterion," but
  `accepted_open_answer_check_revisions.criterion_revision_ids_json` pins criterion
  **revisions**, not the criterion entity. Without an explicit revision→owning-entity
  resolution rule, an implementer could check entity ids that never appear in the reference and
  let a blocked withdrawal through.
- **Fix:** Rewrote rule 9 to state references resolve at the entity level (a revision-pinning
  dependent references that revision's owning entity), broadened the readiness bullet to the
  full set of targetable entity families with a citation to the readiness spec, and made the
  open-answer bullet resolve `criterion_revision_ids` to the owning criterion entity. Expanded
  Tests rule 6 to cover each case including the revision→entity resolution and a corpus entity
  targeted by a readiness requirement.
- **Tests:** Verified against `src/storage.js:384-396` (readiness `requirements_json`),
  `src/storage.js:465-477` (`criterion_revision_ids_json`), `src/storage.js:665-692`
  (`learner_evidence_target_links` active partial-unique index), and `src/storage.js:612-630`
  (navigation `from_entity_id`/`to_entity_id`).

### Non-existent rejection-reason example

- **Verdict:** warn, fixed.
- **Location:** spec rule 8.
- **Why:** The draft cited `quick_check_not_found` as an existing not-found reason. The actual
  vocabulary in `src/http-contract.js` uses `quick_check_entity_not_found`,
  `criterion_entity_not_found`, `navigation_entity_not_found`, etc. A wrong reason name in the
  contract invites an implementer to add a new reason or mismatch the existing one.
- **Fix:** Replaced the example with real reason names (`quick_check_entity_not_found`,
  `criterion_entity_not_found`, `navigation_entity_not_found`, `source_not_found`).
- **Tests:** Verified the names exist in `src/http-contract.js:1145-1170`.

### No-op status write semantics murky

- **Verdict:** warn, fixed.
- **Location:** spec rule 5.
- **Why:** The draft said a no-op "does not change `updatedAt` semantics beyond recording the
  request," which is self-contradictory and untestable — a reader cannot tell whether the
  attribution fields advance on a no-op.
- **Fix:** Restated rule 5 so a no-op is an accepted, non-erroring write that records the
  request as an attributable action, with the returned `updatedByIdentityId`/`updatedAt`
  reflecting the most recent write. This is concrete and testable (Tests rule 5).
- **Tests:** Structure/clarity inspection; covered by Tests rule 5.

### Two-tier source deletion and referenced-source semantics

- **Verdict:** pass.
- **Location:** spec rules 15–17; HTTP `DELETE /sources/{sourceId}`.
- **Why:** The spec hard-deletes a source only when no accepted corpus revision's
  `source_ids_json` includes the `sourceId`, rejects a referenced source with
  `source_hard_delete_blocked` (withdraw-only), and keeps source-record deletion independent of
  the raw-content blob delete already shipped under ADR-021. The "referenced regardless of the
  referencing entity's own status" clause correctly prevents a referenced-but-withdrawn corpus
  from making a source falsely deletable. This matches ADR-022 Decision item 5 and Rules.
- **Fix:** None required.
- **Tests:** Cross-checked against `src/storage.js:193-215` (`program_sources` has no status
  today) and the material content spec's raw-blob delete boundary.

### Read-path filtering and historical addressability

- **Verdict:** pass.
- **Location:** spec rules 11–14.
- **Why:** Forward reads (delivery, listings, coverage-gap derivation) filter `status = active`
  while historical revision reads continue to resolve withdrawn entities' revisions, and
  withdrawn items stay curator-visible for reactivation. The partial-unique-index precedent
  (`one_active_learner_evidence_target_link`) is cited as the uniqueness model, matching the
  ADR's stated template. The separation of forward-use filtering from historical addressability
  is exactly ADR-022's Consequences guidance.
- **Fix:** None required.
- **Tests:** Verified the precedent index at `src/storage.js:684-692`.

### Curator gate reason consistency

- **Verdict:** pass.
- **Location:** spec rules 3, 21.
- **Why:** The spec gates writes with `admin_or_curator_required`, the same gate the sibling
  material content spec uses for curator-only source operations. ADR-022 requires Admin not be
  the *ordinary* path (enforced by the curator workflow/skill), which is compatible with the
  established codebase gate reason that admits an admin technically. Choosing the existing gate
  over inventing a curator-only reason keeps the contract consistent with shipped routes.
- **Fix:** None required.
- **Tests:** Cross-checked against material content spec rules 5–6 and the reason vocabulary.

### Structure and boundary discipline

- **Verdict:** pass.
- **Location:** whole document.
- **Why:** The spec follows the My Way structure (Goal with ADR/precedent references, Public
  interface, numbered testable Behavior rules, Product intent traceability, enumerated Tests
  mapped to rules, Done criteria) and the local agonara spec front-matter convention. It stays
  behavioral: it defines status, transitions, the block, read filtering, source tiers, and
  backup/restore without prescribing migration SQL or internal algorithms, and it explicitly
  defers (Scope/Non-Goals alignment) per-revision markers, hard deletion of revisions/evidence,
  program lifecycle, analytics, and retention policy — matching ADR-022 Non-Goals. No
  architecture is redefined; the spec operationalizes the accepted ADR.
- **Fix:** None required.
- **Tests:** Checked against `docs/my-way/04-spec/structure.md` and the `spec-review` skill's
  review-for list.

## Verdict

The spec holds as an implementation-ready behavioral contract after the three corrections
above (one fail, two warns). No architectural instability surfaced; all changes were
behavioral-clarity and groundedness fixes within the ADR-022 boundary. No remaining fails or
warns.
