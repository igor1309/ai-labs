---
title: Agonara Accepted-Entity Lifecycle and Withdrawal Pre-ADR
date: 2026-06-22
description: Pre-ADR pressure-testing an entity-level lifecycle status that lets a curator withdraw an accepted check/corpus item from active delivery without erasing the historical revisions student evidence depends on.
model: claude-opus-4-8
version: 0.1.0
---

# Agonara Accepted-Entity Lifecycle and Withdrawal Pre-ADR

## Purpose

This document pressure-tests adding an **entity-level lifecycle status** to accepted
Program corpus so a `Program Curator` can **withdraw** an accepted item (quick check,
open-answer check, assessment criterion, topic/concept/material, readiness check) from
active delivery and coverage **without** deleting the historical revisions that student
attempts and evidence reference.

This document is not a data model, schema, API design, UI specification, or
implementation plan. It is not an accepted ADR. It captures the gap, the options, and a
candidate direction for a future ADR that would extend — not overturn —
[ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md),
[ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), and
[ADR-016](../adr/adr-016-quick-check-assessment-boundary.md).

## Context

The operating premise that triggered this note: accepted materials — including tests —
were treated as append-only, and that proved wrong in practice. People and bots make
mistakes, and once accepted those mistakes are preserved with no ordinary curator path
to retire them.

What the accepted-corpus model already provides today:

- Every accepted entity is a thin row holding `current_revision_id`
  (`src/storage.js:316` for `accepted_quick_check_entities`; same shape for
  `accepted_open_answer_check_entities`, `accepted_assessment_criterion_entities`,
  `accepted_corpus_entities`, `accepted_readiness_check_entities`,
  `accepted_navigation_relationship_*`).
- **Replacement revisions** already work: accepting a candidate with `targetEntityId`
  writes a new revision under the same entity and repoints `current_revision_id`
  (`src/corpus.js:402-447`), preserving the prior revision as history
  (`docs/specs/corpus-storage-and-curator-acceptance-api.md:391`).
- **Delivery serves only the current revision**
  (`docs/specs/quick-check-assessment-api.md:207`), while old revisions stay
  addressable so historical attempts never break (ADR-016:66, ADR-011:85).

So "fix a weak item" is already possible by accepting a corrected revision onto the same
entity. That is now documented for curators in the `agonara-curator-assessment` skill.

## The gap

There is no **entity-level lifecycle status**:

- No `accepted_*` entity table has a `status` column (`src/storage.js:258-628`); an
  accepted entity is always live because `current_revision_id` is `NOT NULL` and always
  resolves.
- There is **no DELETE / withdraw / retire route** on any accepted entity. The only
  DELETE routes are session, admin, memberships, and learner-state target links
  (`src/http-contract.js:1503-6407`).
- Consequence: an item accepted **in error** (one that should not exist, not merely one
  that needs better wording) can only be papered over with a replacement revision. It
  cannot be removed from delivery and coverage while its history is preserved.

Withdrawal is **unaddressed**, not rejected: neither ADR-010, ADR-011, nor ADR-016 lists
deletion or withdrawal in its Non-Goals. The decision was simply never made.

## Existing precedent for the right shape

`learner_evidence_target_links` already implements exactly the soft-delete pattern one
layer over the accepted entities: `status text not null check (status in
('active','deleted'))` with a partial unique index `where status = 'active'`
(`src/storage.js:674-688`). Its documented behavior is "deletion marks the link
`deleted`, excludes it from future derivation, and **must not delete attempts,
evaluations, accepted checks**…" (`docs/specs/learner-state-interpretation.md:229`),
exposed as `DELETE /learner-state-target-links/{id}`. This is the template: withdraw =
a soft status that drops the entity from forward use while leaving every historical
reference intact.

## Options considered

### Option A — Hard delete of accepted entities/revisions

Rejected. It would break the addressability invariants that protect student evidence
(ADR-010:82, ADR-011:85, ADR-016:66) and contradicts the append-only protections the
ADRs deliberately established for *evidence-referenced* revisions.

### Option B — Entity-level lifecycle status (active → withdrawn, with reactivate)

Recommended candidate. Add a `status` to each accepted entity, mirroring the
`learner_evidence_target_links` precedent. Withdrawn entities are excluded from student
delivery listings and from curator coverage-gap derivation, but all revisions remain
addressable so prior attempts resolve. Withdrawal is a `Program Curator` action,
attributable to the acting Identity, scoped to the Program — the same authority boundary
as acceptance (ADR-010:56), with Admin not the ordinary path (ADR-010:62). A
reactivate path (withdrawn → active) makes a mistaken withdrawal reversible.

### Option C — Replacement-only (status quo)

Insufficient. Replacement can change an item's content but cannot express "this slot
should not exist," and `current_revision_id` cannot be nulled.

### Option D — Tombstone revision

A special "withdrawn" revision as the current revision. Possible, but it conflates
*content* (the revision) with *lifecycle* (the entity) and would leak a withdrawn marker
into the delivery/projection path. Option B keeps the two concepts separate.

## Candidate direction

> **Promoted to [ADR-022 — Accepted Entity Withdrawal and Source Deletion](../adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md)**,
> which adopts Option B (entity-level `active → withdrawn` status), generalizes it to
> Program source records with two-tier deletion (hard-delete unreferenced, withdraw
> referenced), and resolves the open questions below (entity-level granularity;
> block-on-active-reference, no cascade; reactivate restores the current revision;
> backup/restore preserves status).

A small ADR ("Accepted Entity Lifecycle and Withdrawal") deciding:

- Accepted entities gain a lifecycle status `active → withdrawn` (and a `withdrawn →
  active` reactivate), soft, modeled on the target-link precedent — never a hard delete
  of revisions referenced by evidence.
- Withdrawal is curator-authorized, attributable, and Program-scoped; Admin is not the
  ordinary path.
- Withdrawn entities are excluded from student delivery and from curator coverage-gap
  derivation; all historical revisions stay addressable.
- Applies uniformly across the accepted entity families (quick-check, open-answer-check,
  criterion, corpus topic/concept/material, readiness check, navigation relationship).

## Open questions

- Granularity: status on the entity only, or also a per-revision marker?
- Referential effects: what happens to a readiness-check requirement, learner-evidence
  target link, or open-answer check that references a now-withdrawn criterion/check —
  block withdrawal, cascade, or warn?
- Reactivation: does reactivating restore the prior `current_revision_id` as-is, and can
  a curator reactivate after later structural changes?
- Backup/restore: how does a withdrawn entity round-trip through the protected backup
  contract (cf. ADR-016 restore-graph validation rules)?

## Non-goals

- Hard deletion of revisions referenced by student evidence.
- Analytics, reporting, or mastery interpretation.
- Curator-facing visibility into student assessment **results** — tracked separately in
  [Curator-Facing Assessment Results Pre-ADR](curator-facing-assessment-results_pre_adr.md).
- Concrete schema, routes, UI, or migration strategy.
