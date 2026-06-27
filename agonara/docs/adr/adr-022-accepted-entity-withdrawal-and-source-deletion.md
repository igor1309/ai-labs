---
date: 2026-06-27
model: claude-opus-4-8
status: accepted
description: "Decision for curator-authorized withdrawal of accepted entities and two-tier deletion of Program sources, preserving evidence-referenced history."
---

# ADR-022 — Accepted Entity Withdrawal and Source Deletion

## Executive summary

Agonara MUST give a `Program Curator` an ordinary path to **retire** content they accepted
or loaded, without erasing the history that student evidence depends on. Accepted entities
gain a soft **lifecycle status** `active → withdrawn` (with `withdrawn → active`
reactivation): a withdrawn entity leaves student delivery and curator coverage derivation
while all its revisions stay addressable. Program **sources** gain the same withdrawal plus
a **two-tier deletion**: an unreferenced source record may be hard-deleted, a referenced
source record may only be withdrawn. This promotes the
[accepted-entity withdrawal pre-ADR](../pre-adr/accepted-entity-withdrawal_pre_adr.md),
generalizing it to source records, and supplies the deletion tiers
[ADR-021](adr-021-material-content-storage-and-role-gated-reading.md) deferred. It extends —
does not overturn — the addressability invariants of
[ADR-010](adr-010-corpus-storage-and-curator-acceptance-boundary.md),
[ADR-011](adr-011-accepted-checks-and-student-assessment-boundary.md), and
[ADR-016](adr-016-quick-check-assessment-boundary.md). Concrete schema, routes, and
migration are left to a downstream spec.

## Context

Accepted corpus and sources are effectively append-only: every accepted entity is a thin
row whose `current_revision_id` is `NOT NULL` and always resolves, no `accepted_*` entity
has a `status` column, and the only DELETE routes are for sessions, identities, memberships,
and learner-state target links. People and agents make mistakes; an item accepted in error,
or a stray/test source, can today only be papered over with a replacement revision or
removed by host-level DB surgery. Withdrawal and source deletion were never decided — they
appear in no ADR's Non-Goals.

The right shape already exists one layer up: `learner_evidence_target_links` uses
`status text not null check (status in ('active','deleted'))` with a partial unique index
`where status = 'active'`, and its deletion "marks the link deleted, excludes it from future
derivation, and must not delete attempts, evaluations, or accepted checks." This is the
template: a soft status that drops an item from forward use while leaving every historical
reference intact.

[ADR-021](adr-021-material-content-storage-and-role-gated-reading.md) decided that source
raw content blobs hard-delete freely and that curator delete of evidenced accepted content
resolves to withdrawal, but deferred the withdrawal mechanism and the source-record tiers to
this ADR.

Rejected alternatives: **hard delete of accepted entities/revisions** (breaks the
evidence-addressability invariants ADR-010/011/016 protect); **replacement-only status quo**
(cannot express "this slot should not exist"; `current_revision_id` cannot be nulled);
**tombstone revision** (conflates content with lifecycle and leaks a withdrawn marker into
the delivery path). Entity-level status keeps content and lifecycle separate.

## Decision

1. **Accepted-entity lifecycle.** Every accepted entity family (quick check, open-answer
   check, assessment criterion, corpus topic/concept/definition/principle/material
   reference, readiness check, navigation relationship) gains a lifecycle **status** with
   values `active` and `withdrawn`, defaulting to `active`. Status is a property of the
   entity, not of a revision.
2. **Withdrawal is reversible.** A `Program Curator` may withdraw an `active` entity
   (`active → withdrawn`) and reactivate a `withdrawn` entity (`withdrawn → active`).
   Reactivation restores the entity with its existing `current_revision_id` unchanged.
3. **Withdrawal preserves history.** Withdrawal MUST NOT delete or alter any revision,
   attempt, evaluation, evidence, or learner state. All revisions of a withdrawn entity
   remain addressable.
4. **Withdrawn entities leave forward use.** A withdrawn entity is excluded from student
   delivery and listings and from curator coverage-gap derivation, while remaining visible
   to the curator for reactivation.
5. **Source two-tier deletion.** A Program **source record** (metadata + `source_ids_json`
   provenance edges) also carries the same `active`/`withdrawn` lifecycle status. A source
   record that is **not referenced** by any accepted corpus may be **hard-deleted** by a
   `Program Curator`. A **referenced** source record may not be hard-deleted; it may only be
   **withdrawn**. (Source raw content blobs hard-delete independently per ADR-021.)
6. **Material content deletion tiers** (completing ADR-021): unevidenced accepted material
   content hard-deletes with its entity/revision; accepted content for a revision referenced
   by student evidence is retired only by withdrawing the entity, never erased.
7. **Authority.** Withdrawal, reactivation, and source deletion are `Program Curator`
   actions, attributable to the acting `Identity` and scoped to the `Program` — the same
   authority boundary as acceptance. `Admin` authority is not the ordinary path.

## Rules / invariants

- Each accepted entity family and each Program source record MUST carry a `status`
  constrained to `active` or `withdrawn`, defaulting to `active`. Status MUST be
  entity-level (or source-record-level), not per-revision.
- Withdrawal and reactivation MUST be authorized through effective `Program Curator`
  participation for the entity's Program, attributable to the acting `Identity`. `Admin`
  MUST NOT be the ordinary withdrawal or deletion path.
- Withdrawal MUST NOT delete, rewrite, or make unaddressable any accepted revision, student
  attempt, evaluation, feedback, evidence, mastery state, weak-area summary, or learning
  history. All revisions of a withdrawn entity MUST remain addressable.
- A withdrawn entity MUST be excluded from student delivery, student listings, and curator
  coverage-gap derivation, and MUST remain visible to the curator for reactivation.
- Reactivation MUST restore the entity to `active` with its `current_revision_id` unchanged.
- Withdrawal of an entity that is referenced by an **active** entity (e.g., a criterion or
  check referenced by an active readiness check, open-answer check, or learner-evidence
  target link) MUST be rejected; the curator MUST withdraw or repoint the active dependents
  first. Withdrawal MUST NOT cascade.
- A `Program Curator` MUST be able to hard-delete a source record that no accepted corpus
  references. A source record referenced by any accepted corpus MUST NOT be hard-deleted and
  MUST be retired only by withdrawal.
- Hard deletion of a source record MUST NOT delete or invalidate accepted material content,
  accepted revisions, or any student-referenced record.
- Accepted material content for a revision referenced by student evidence MUST NOT be
  hard-erased; it is retired only by withdrawing the entity (consistent with ADR-021).
- Backup MUST preserve entity `status` and withdrawn sources. Restore MUST accept
  `active` and `withdrawn` status, MUST still resolve every revision and provenance edge of a
  withdrawn entity or source, and MUST reject a backup before mutation when a status is
  outside the vocabulary or a withdrawn entity's revisions or references do not resolve.

## Consequences

- A curator gains an ordinary, reversible path to retire an item accepted in error or a
  bad material, and to remove stray/test sources — closing the "DB surgery only" gap — while
  student evidence keeps resolving against the frozen revisions.
- The withdrawal mechanism is uniform across accepted entity families and now sources, and
  it completes ADR-021's deletion tiers. The separate "Authorized deletion of corpus
  sources" backlog item's source half is resolved by this ADR (program archival/ownership
  transfer remains out of scope).
- Delivery, coverage-gap, and listing read paths must filter on `status = active`; the
  partial-unique-index pattern from `learner_evidence_target_links` is the model. Reads that
  serve historical revisions (e.g., past attempts) MUST continue to resolve withdrawn
  entities' revisions.
- Block-on-active-reference keeps withdrawal deterministic and non-destructive but means a
  curator may need to withdraw or repoint dependents in order; reactivation makes mistakes
  cheap to reverse.
- Conformance to the Rules above MUST be verified by the downstream withdrawal/source-deletion
  spec's acceptance criteria and tests (domain, HTTP, and backup/restore). This ADR is the
  boundary; the spec is its enforcement mechanism.

## Non-goals

This ADR does not decide:

- concrete database columns, indexes, the status migration, route names, or request/response
  shapes;
- per-revision lifecycle markers (status is entity-level only);
- program archival, deletion, or ownership transfer (the program-lifecycle half of the
  source-deletion backlog item);
- hard deletion of revisions, attempts, or evidence;
- analytics, reporting, mastery interpretation, or curator visibility into student
  assessment results;
- a purge/retention policy for long-withdrawn entities or unreferenced content.
