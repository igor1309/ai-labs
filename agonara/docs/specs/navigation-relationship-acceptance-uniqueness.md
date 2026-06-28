---
date: 2026-06-28
model: claude-opus-4-8
description: "Spec: uniqueness of accepted navigation relationships among active rows — reject duplicate acceptance, guard reactivation, validate restore."
version: 0.0.1
status: draft
type: spec
---

# Navigation-Relationship Acceptance Uniqueness

## Goal

Define the contract, owned by Corpus Storage and the navigation-acceptance domain command, that
makes an accepted navigation relationship unique per directed `(program_id, relationship_kind,
from_entity_id, to_entity_id)` among **active** rows, so a `Program Curator` cannot accumulate
duplicate accepted edges. Governed by
[ADR-023](../adr/adr-023-navigation-relationship-acceptance-uniqueness.md); depends on and is
sequenced after the [accepted-entity withdrawal spec](accepted-entity-withdrawal-and-source-deletion.md)
([ADR-022](../adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md)), whose
`active`/`withdrawn` lifecycle status this uniqueness is scoped to. This is the **prevention** half
of the duplicate-navigation problem; **cleanup** of relationships already accepted in error is the
ADR-022 withdrawal path.

## Scope

In scope: application guards that prevent new active duplicates (the create-path check covering
acceptance and `relationship_update`, the reactivation precondition that narrows ADR-022 spec rule
10, and restore rejection of duplicate-bearing backups); a new rejection reason; and a guarded
backstop database index added once existing duplicates are cleaned. Out of scope (ADR-023 Non-Goals):
removal/withdrawal/repair of relationships already accepted in error (the ADR-022 withdrawal path);
reverse-direction / symmetric-kind canonicalization of the key; uniqueness for non-navigation
accepted-entity families; any change to acceptance authority, endpoint-kind, self-reference, or
prerequisite-cycle validation (ADR-010 and the navigation spec).

## Dependency and sequencing

This spec consumes the `active`/`withdrawn` lifecycle status that the ADR-022 withdrawal spec adds
to `accepted_navigation_relationships`; it MUST NOT be implemented before that status column
exists. The application guards (rules 2–8) ship as soon as that status column exists and are
otherwise unconditional — they fire on writes, not on rows already present, so they prevent new
duplicates regardless of existing data. Only the backstop index (rule 9) is data-dependent: because
the ADR-022 status migration backfills every existing relationship — including already-accepted
duplicates — to `active`, the index cannot be created until a curator has withdrawn the extras
through the ADR-022 API, and until then the guarded startup step skips it with a diagnostic.

## Public interface

No new HTTP routes and no request/response shape changes. Two existing surfaces gain
duplicate-aware behavior, and one rejection reason is added.

- **Acceptance command** — `corpus.acceptNavigationCandidate`, exposed as
  `POST /navigation-candidates/{candidateId}/acceptance`.
- **Reactivation command** — the navigation-relationship lifecycle write (`setEntityLifecycleStatus`,
  introduced by the ADR-022 spec), exposed as `PUT /navigation-relationships/{entityId}/status`, on
  the `withdrawn → active` transition.
- **New rejection reason** — `navigation_relationship_already_accepted`, added to
  `ApiRejectionReason` in `src/http-contract.js` alongside the existing `navigation_relationship_*`
  reasons.

```ts
type ApiRejectionReason =
  | /* …existing reasons… */
  | "navigation_relationship_already_accepted";
```

## Behavior rules

### Uniqueness key

1. An accepted navigation relationship is identified by the directed tuple `(program_id,
   relationship_kind, from_entity_id, to_entity_id)`. Among relationships whose ADR-022 lifecycle
   `status` is `active`, that tuple MUST be unique within a Program. A `withdrawn` relationship is
   not subject to the constraint and never blocks.

### Acceptance

2. Accepting a navigation candidate whose draft would create a second **active** relationship with
   a tuple already named by an active relationship in the same Program MUST be rejected with
   `navigation_relationship_already_accepted`. This applies to every navigation candidate kind that
   originates relationships, including `relationship_update`.
3. A rejected duplicate acceptance MUST be atomic: it leaves no accepted corpus entity, revision,
   relationship, or candidate-status change behind (the acceptance transaction rolls back in full).
4. Accepting a tuple whose only existing relationship is `withdrawn` MUST succeed, producing a new
   active relationship; the prior withdrawn relationship and its revisions remain addressable.

### Reactivation (narrows ADR-022 spec rule 10)

5. Reactivating (`withdrawn → active`) a navigation relationship via
   `PUT /navigation-relationships/{entityId}/status` MUST be rejected with
   `navigation_relationship_already_accepted` when another active relationship with the same tuple
   already exists. This is a navigation-relationship-only precondition that narrows ADR-022 spec
   rule 10 ("reactivation has no dependent precondition"): reactivation MUST NOT be able to produce
   two active relationships with the same tuple. Withdrawal (`active → withdrawn`) and same-status
   no-ops (ADR-022 spec rule 5) are unchanged.
6. The curator resolves the conflict by withdrawing the colliding active relationship first, then
   reactivating; because withdrawal is reversible (ADR-022), either edge may be the one kept active.

### Enforcement surface

7. New active duplicates MUST be prevented by application-level guards that fire on every write —
   the duplicate check in `createAcceptedNavigationRelationshipRecord` (covering the acceptance and
   `relationship_update` paths), the reactivation guard (rule 5), and the restore validation (rule
   8) — each surfacing the graceful `navigation_relationship_already_accepted` reason (restore
   surfaces a restore-validation rejection). These guards MUST work regardless of whether the
   backstop index (rule 9) exists; prevention MUST NOT depend on the index being present. A
   database partial-unique index scoped to `status = 'active'` is added as a backstop per rule 9.

### Restore

8. Restore MUST reject, before mutation, a backup that contains two **active** navigation
   relationships sharing a tuple within a Program. This extends the ADR-022 restore graph
   validation (status vocabulary + withdrawn-graph resolution) with an active-duplicate check; a
   backup with one active and one withdrawn relationship for the same tuple MUST restore cleanly.

### Introducing the backstop index (guarded, no auto-mutation)

9. The backstop partial-unique index is created by a guarded idempotent startup step. Because the
   existing partial indexes live in a static schema DDL block that cannot be made conditional, this
   step MUST be a conditional JS step run *outside* that block: it MUST check for active duplicate
   tuples and, only when none remain, run `create unique index if not exists … where status =
   'active'`. If active duplicates remain it MUST **skip creation and surface a diagnostic** naming
   the offending tuples, and MUST NOT throw. The diagnostic MUST be observable to an operator
   (`storage.js` has no logging seam today, so the implementation MUST add one — a log line, a
   returned/structured warning, or an equivalent surface; the exact mechanism is an implementation
   choice). The step MUST NOT auto-withdraw, hard-delete, or otherwise mutate accepted rows to force
   the index — an un-attributed status change would violate ADR-022 spec rule 4. Pre-existing active
   duplicates are cleaned only by an attributable `Program Curator` withdrawal through the ADR-022
   API; once the data is clean, the next startup creates the index. Re-running the step is a no-op
   (the index already exists, or the diagnostic repeats).

## Tests (required)

### Storage tests

1. The create-path guard in `createAcceptedNavigationRelationshipRecord` rejects a second active
   relationship with the same `(program_id, relationship_kind, from_entity_id, to_entity_id)`, and
   permits the same tuple when the existing relationship is `withdrawn` — independent of whether the
   backstop index exists.
2. The guarded backstop-index startup step, run on a database pre-seeded with two active duplicate
   relationships for one tuple, **skips** index creation, emits a diagnostic naming the offending
   tuple, does **not** throw, and does **not** mutate any row (both duplicates remain active);
   after the extra is withdrawn through the ADR-022 path, the next run creates the index; running
   the step again once the index exists is a no-op.

### Domain tests — acceptance

3. `acceptNavigationCandidate` rejects a draft duplicating an existing active relationship with
   `navigation_relationship_already_accepted`, leaves the original edge intact, and writes no new
   entity/revision/relationship and no candidate-status change (atomic rollback).
4. `acceptNavigationCandidate` via the `relationship_update` candidate kind is rejected identically
   when it would duplicate an existing active tuple.
5. `acceptNavigationCandidate` succeeds for a tuple whose only existing relationship is `withdrawn`,
   producing a new active relationship while the withdrawn one stays addressable.

### Domain tests — reactivation

6. Reactivating a withdrawn navigation relationship is rejected with
   `navigation_relationship_already_accepted` when an active duplicate exists; after withdrawing the
   colliding active edge, the reactivation succeeds.

### HTTP tests

7. `POST /navigation-candidates/{candidateId}/acceptance` surfaces
   `navigation_relationship_already_accepted` on a duplicate, under the existing curator + CSRF
   gate, leaving no partial accepted corpus.
8. `PUT /navigation-relationships/{entityId}/status` surfaces
   `navigation_relationship_already_accepted` on a colliding reactivation.
9. The OpenAPI contract enumerates `navigation_relationship_already_accepted` in `ApiRejectionReason`.

### Backup/restore tests

10. Restore rejects, before mutation, a backup containing two active relationships sharing a tuple;
    a backup with one active and one withdrawn relationship for the same tuple restores cleanly.

## Done criteria

- New active duplicates are prevented across acceptance, `relationship_update`, reactivation, and
  restore by application guards that do not depend on the backstop index existing.
- Duplicate acceptance and colliding reactivation are rejected with
  `navigation_relationship_already_accepted`; the original edge is untouched and acceptance is atomic.
- A `withdrawn` tuple is re-acceptable; the uniqueness scope is active rows only.
- Restore rejects active-duplicate-bearing backups before mutation.
- The backstop index is created by a guarded startup step that skips-with-diagnostic (never throws,
  never mutates rows) while active duplicates remain, and materializes once a curator has cleaned
  them through the ADR-022 API.
- The new reason appears in the OpenAPI surface; no other rejection reason or request/response shape
  changes.
- Implementation is sequenced after the ADR-022 withdrawal spec is implemented.
