---
date: 2026-06-28
model: claude-opus-4-8
status: accepted
description: "Decision to make accepted navigation relationships unique per (program, kind, from, to) among active relationships, rejecting duplicate acceptance at the storage layer, scoped to the ADR-022 active/withdrawn lifecycle."
---

# ADR-023 — Navigation-Relationship Acceptance Uniqueness

## Executive Summary

Agonara MUST NOT let a `Program Curator` accept a second navigation relationship that
duplicates an already-accepted one. An accepted navigation relationship is identified by the
directed tuple `(program_id, relationship_kind, from_entity_id, to_entity_id)`; among **active**
relationships that tuple MUST be unique. Acceptance of a draft that would create a second active
duplicate is **rejected** (`navigation_relationship_already_accepted`), not silently merged. New
duplicates are prevented at the application's single relationship-create path (covering new-entity
acceptance and `relationship_update`), with explicit reactivation and restore guards; a
partial-unique index scoped to `status = active` is added as a database **backstop** once existing
duplicates are cleaned. Uniqueness is scoped to `status = active`, so an edge withdrawn under
[ADR-022](adr-022-accepted-entity-withdrawal-and-source-deletion.md) may be re-accepted while
ADR-022 reactivation is held to the same guard. This is
the **prevention** half of the duplicate-navigation problem; the **cleanup** of edges already
accepted in error is the `active → withdrawn` path ADR-022 decides. This ADR extends the
acceptance boundary of [ADR-010](adr-010-corpus-storage-and-curator-acceptance-boundary.md) and
depends on ADR-022's lifecycle status; it adds no migration that mutates accepted rows —
pre-existing duplicates are cleaned by attributable curator withdrawal, not automatically.

## Context

A curator accepting a navigation relationship goes through a corpus candidate
(`acceptNavigationCandidate`, `src/corpus.js`). The draft is validated for kind, endpoint
selectors, self-reference, prerequisite cycles, and source validity
(`validateNavigationRelationshipDrafts`, `assertNavigationRelationshipEndpoints`,
`assertNavigationRelationshipDoesNotCreateCycle`), and the row is written once through
`createAcceptedNavigationRelationshipRecord` (`src/storage.js`). None of these layers compares the
draft against the relationships already accepted, and `accepted_navigation_relationships` carries
no unique index on the endpoint tuple. So accepting the same `topic_includes_concept` for one
topic/concept pair twice succeeds and leaves two redundant edges in accepted navigation — reported
in practice by a curator who could neither prevent nor (pre-ADR-022) repair the duplicate. The
same `createAcceptedNavigationRelationshipRecord` path serves both first-time acceptance and the
`relationship_update` candidate kind, so a single storage-layer guard covers every write that
originates a relationship.

Constraints: the live DB already contains duplicate **active** rows (the reported pair), so a
unique index cannot be introduced until those are resolved; and ADR-022 — accepted but not yet
implemented — is about to add the `active`/`withdrawn` status the index must be scoped to.

Rejected alternatives: **silent idempotent return** of the existing edge (hides that nothing was
created and diverges from the existing `*_candidate_already_accepted` rejection family; true
client retries are already covered by idempotency keys at the envelope layer); **full directed +
reverse uniqueness for symmetric kinds** (`concept_related`, `concept_distinguishes_from`) now
(adds per-kind canonicalization before the simpler directed invariant is even in place); **a check
only in the acceptance-validation path (`corpus.js`)** (would miss the restore and reactivation
paths — the guard belongs at the shared create function plus explicit restore and reactivation
checks); **an auto-dedup startup migration** that withdraws or deletes pre-existing duplicate rows
to make room for the index (an un-attributed status change, violating ADR-022's curator-attribution
invariant — cleanup must be an attributable curator action).

## Decision

1. **Uniqueness key.** An accepted navigation relationship is identified by the directed tuple
   `(program_id, relationship_kind, from_entity_id, to_entity_id)`. Among relationships whose
   ADR-022 lifecycle `status` is `active`, that tuple MUST be unique within a Program.
2. **Reject duplicates on acceptance.** Accepting a candidate whose draft would create a second
   **active** relationship with an existing tuple MUST be rejected with the rejection reason
   `navigation_relationship_already_accepted`. The first relationship and the candidate are left
   unchanged; no partial accepted corpus is written (acceptance is transactional).
3. **Enforced primarily in the application; index is a deferred backstop.** The *primary*
   enforcement is an explicit duplicate check in `createAcceptedNavigationRelationshipRecord` (the
   single create path, covering first-time acceptance and `relationship_update`), the reactivation
   guard (Decision 5), and the pre-mutation restore validation (Decision 7) — all of which map to a
   graceful `navigation_relationship_already_accepted` rejection. These prevent *new* duplicates
   unconditionally and ship independent of any existing data, because they only fire on a write, not
   on rows already present. A partial-unique index on `accepted_navigation_relationships` scoped to
   `status = active` (following the proven `one_active_learner_evidence_target_link` pattern in
   `src/storage.js`) is a database-level **backstop** that binds every writer including any future
   one; because it cannot coexist with pre-existing active duplicates, it is added only after the
   data is clean (Decision 6) and never as a precondition for the prevention behavior.
4. **Directed tuple only.** Uniqueness is over the tuple exactly as stored. Reverse-direction
   collapse for semantically symmetric kinds is out of scope (Non-Goals).
5. **Scoped to active; re-acceptance allowed, reactivation guarded.** Because uniqueness is partial
   on `status = active`, a relationship withdrawn under ADR-022 does NOT block re-accepting the same
   tuple; the prior withdrawn edge remains addressable. The same scoping means the invariant also
   binds ADR-022 **reactivation** (`withdrawn → active`): reactivating a withdrawn relationship MUST
   be rejected when an active relationship with the same tuple already exists, so reactivation can
   never resurrect a second active duplicate. This makes the index dependent on ADR-022's `status`
   column and extends ADR-022's reactivation semantics with this uniqueness guard.
6. **Existing duplicates are cleaned by a curator, not by a migration; index creation is guarded.**
   Pre-existing accepted duplicates (present and `active` after ADR-022's backfill) are resolved by
   a `Program Curator` withdrawing all but one of the identical active edges through the ADR-022
   withdrawal API — an attributable, intentional action (ADR-022 rule 4). The system MUST NOT
   auto-withdraw or hard-delete rows at startup to make room for the index: an un-attributed status
   change would violate ADR-022's attribution invariant. The backstop index is therefore created by
   a **guarded** idempotent startup step (`create unique index if not exists … where status =
   'active'`) that first checks for active duplicates and, if any remain, **skips creation and emits
   a startup diagnostic** naming the offending tuples, so startup never throws; the index appears
   automatically on the next start once the curator has cleaned the data.
7. **Restore rejects duplicates.** Backup restore MUST reject, before mutation, a backup that
   contains two active navigation relationships with the same tuple in a Program — consistent with
   ADR-022's pre-mutation restore validation.
8. **Authority unchanged.** This adds no new authority. Acceptance remains a `Program Curator`
   action attributable to the acting `Identity` and scoped to the `Program` (ADR-010); the only
   change to the contract is the new `ApiRejectionReason` value.

## Rules / Invariants

- `createAcceptedNavigationRelationshipRecord` and the reactivation and restore paths MUST prevent
  new active duplicates regardless of whether the backstop index exists; the prevention behavior
  MUST NOT depend on the index being present.
- The backstop partial unique index on `accepted_navigation_relationships (program_id,
  relationship_kind, from_entity_id, to_entity_id) WHERE status = 'active'` (following the existing
  `one_active_learner_evidence_target_link` pattern) MUST be created by a guarded idempotent startup
  step that skips creation and emits a diagnostic when active duplicates remain, and MUST NOT throw,
  auto-withdraw, or hard-delete to force its own creation. It depends on ADR-022's `status` column.
- Pre-existing active duplicates MUST be retired only by an attributable `Program Curator`
  withdrawal through the ADR-022 API, never by an un-attributed startup mutation (ADR-022 rule 4).
- Reactivation (`withdrawn → active`) of a navigation relationship under ADR-022 MUST be rejected
  when an active relationship with the same `(program_id, relationship_kind, from_entity_id,
  to_entity_id)` already exists; the curator must withdraw or re-point the conflicting active edge
  first. Reactivation MUST NOT be able to create a second active duplicate.
- `createAcceptedNavigationRelationshipRecord` (`src/storage.js`) MUST reject creation of an
  active relationship whose tuple already names an active relationship in the same Program, raising
  the storage invariant that `acceptNavigationCandidate` (`src/corpus.js`) maps — via
  `mapNavigationStorageRejection` — to `navigation_relationship_already_accepted`.
- `navigation_relationship_already_accepted` MUST be added to the `ApiRejectionReason` enum in
  `src/http-contract.js` (alongside the existing `navigation_relationship_*` reasons) and surfaced
  through the generated OpenAPI contract.
- Acceptance MUST remain transactional: a rejected duplicate MUST leave no accepted corpus entity,
  revision, relationship, or candidate-status change behind.
- The uniqueness check MUST compare only the directed tuple as stored. It MUST NOT canonicalize or
  collapse reverse-direction edges for symmetric kinds.
- A withdrawn (`status = 'withdrawn'`) relationship MUST NOT block acceptance of the same tuple.
- Backup restore (`src/storage.js`) MUST reject, before any mutation, a backup containing two
  active navigation relationships sharing a tuple within a Program.
- The decision MUST be verified by domain, HTTP-contract, and backup/restore tests in the
  downstream spec, including: duplicate acceptance rejected with the new reason; the original edge
  left intact; a withdrawn edge re-acceptable; reactivation rejected when an active duplicate
  exists; and a duplicate-bearing backup rejected.

## Consequences

- A curator gets a clear, specific rejection instead of silently accumulating redundant edges, and
  the accepted navigation graph stays free of active duplicates by construction.
- Prevention (the application guards) ships **after** ADR-022's `status` column exists but is
  otherwise unconditional — it does not wait on any data cleanup. The backstop index is the only
  part coupled to data state: it materializes once a curator has withdrawn the pre-existing
  duplicates, and until then the guarded startup step simply skips it and reports the offending
  tuples. The system never performs an un-attributed withdrawal or delete to force the index.
- The uniqueness invariant tightens ADR-022's `withdrawn → active` reactivation: a reactivation that
  would collide with an existing active edge is now rejected, matching ADR-022's own
  block-on-active-conflict posture for withdrawal. A curator may need to withdraw the conflicting
  edge first; because withdrawal is itself reversible, the conflict is cheap to resolve in either
  direction.
- The application guard sits at the single create path, so it covers the `relationship_update`
  candidate kind; the reactivation and restore paths are guarded explicitly. The backstop index
  additionally protects any future writer once present.
- Idempotency-key retries of a genuine duplicate request keep returning the original `accepted`
  envelope (envelope-layer behavior, unchanged); only a *new* acceptance of an already-accepted
  tuple is rejected.
- Symmetric-kind reverse duplicates (`concept_related` / `concept_distinguishes_from` with swapped
  endpoints) remain possible until a future decision; deferring keeps this ADR's migration to a
  single directed index.
- Conformance MUST be verified by the downstream spec's acceptance criteria and tests; this ADR is
  the boundary, the spec is its enforcement mechanism.

## Non-Goals

This ADR does not decide:

- removal, retirement, demotion, or repair of relationships **already** accepted in error — that is
  the ADR-022 `active → withdrawn` withdrawal path and its downstream spec;
- any automated clearing of existing duplicates: cleanup is a curator action through the ADR-022
  API, and this ADR only requires the index step to be guarded (skip-with-diagnostic) until the
  data is clean — it adds no migration that mutates accepted rows;
- reverse-direction / symmetric-kind canonicalization of the uniqueness key;
- silent idempotent acceptance semantics (explicitly rejected in favor of an error reason);
- uniqueness or duplicate handling for non-navigation accepted entity families;
- cross-program relationships or any change to acceptance authority, endpoint-kind, self-reference,
  or prerequisite-cycle validation already decided in ADR-010 and the navigation spec.
