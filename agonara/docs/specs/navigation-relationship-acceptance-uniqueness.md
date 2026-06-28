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

In scope: a uniqueness invariant over active accepted navigation relationships; rejection of
duplicate acceptance with a new reason; a navigation-relationship reactivation precondition that
narrows ADR-022 spec rule 10; restore rejection of duplicate-bearing backups; the non-destructive,
dedup-first ordering for introducing the constraint. Out of scope (ADR-023 Non-Goals):
removal/withdrawal/repair of relationships already accepted in error (the ADR-022 withdrawal path);
reverse-direction / symmetric-kind canonicalization of the key; uniqueness for non-navigation
accepted-entity families; any change to acceptance authority, endpoint-kind, self-reference, or
prerequisite-cycle validation (ADR-010 and the navigation spec).

## Dependency and sequencing

This spec consumes the `active`/`withdrawn` lifecycle status that the ADR-022 withdrawal spec adds
to `accepted_navigation_relationships`; it MUST NOT be implemented before that status column
exists. Because the ADR-022 status migration backfills every existing relationship — including
already-accepted duplicates — to `active`, this spec's uniqueness constraint cannot be enabled
until those pre-existing active duplicates are resolved by withdrawal (rule 9).

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

7. The invariant MUST be enforced at the storage layer so it holds for every writer — the
   acceptance path, the `relationship_update` path, reactivation, and backup restore — not only the
   acceptance-validation path. The acceptance and reactivation paths MUST surface the graceful
   `navigation_relationship_already_accepted` reason rather than a raw constraint error.

### Restore

8. Restore MUST reject, before mutation, a backup that contains two **active** navigation
   relationships sharing a tuple within a Program. This extends the ADR-022 restore graph
   validation (status vocabulary + withdrawn-graph resolution) with an active-duplicate check; a
   backup with one active and one withdrawn relationship for the same tuple MUST restore cleanly.

### Introducing the constraint (non-destructive, dedup-first)

9. Enabling the uniqueness constraint MUST NOT fail or delete data on a database that already
   contains active duplicates. Pre-existing active duplicates MUST first be reduced to a single
   active relationship per tuple by **withdrawing** the extras (ADR-022 withdrawal), preserving
   every withdrawn relationship and its revisions; only then is the active-scoped uniqueness
   constraint established. The reduction MUST be deterministic and idempotent (re-running it is a
   no-op).

## Tests (required)

### Storage tests

1. The active-scoped uniqueness constraint rejects a second active relationship with the same
   `(program_id, relationship_kind, from_entity_id, to_entity_id)`, and permits the same tuple when
   the existing relationship is `withdrawn`.
2. Introducing the constraint on a database pre-seeded with two active duplicate relationships for
   one tuple reduces them to a single active relationship by withdrawing the extra (the withdrawn
   row and its revisions stay resolvable) and then succeeds; re-running the introduction step is a
   no-op.

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

- Among active accepted navigation relationships, the directed tuple is unique per Program,
  enforced at the storage layer across acceptance, `relationship_update`, reactivation, and restore.
- Duplicate acceptance and colliding reactivation are rejected with
  `navigation_relationship_already_accepted`; the original edge is untouched and acceptance is atomic.
- A `withdrawn` tuple is re-acceptable; the constraint is scoped to active rows only.
- Restore rejects active-duplicate-bearing backups before mutation.
- Introducing the constraint is non-destructive and dedup-first on databases that already hold
  active duplicates.
- The new reason appears in the OpenAPI surface; no other rejection reason or request/response shape
  changes.
- Implementation is sequenced after the ADR-022 withdrawal spec is implemented.
