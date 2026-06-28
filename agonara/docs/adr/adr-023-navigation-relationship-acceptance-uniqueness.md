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
duplicate is **rejected** (`navigation_relationship_already_accepted`), not silently merged. The
invariant is enforced at the storage layer so it holds uniformly across every acceptance path
(new-entity acceptance and `relationship_update`) and across backup restore. Uniqueness is scoped
to `status = active`, so an edge withdrawn under
[ADR-022](adr-022-accepted-entity-withdrawal-and-source-deletion.md) may be re-accepted. This is
the **prevention** half of the duplicate-navigation problem; the **cleanup** of edges already
accepted in error is the `active → withdrawn` path ADR-022 decides. This ADR extends the
acceptance boundary of [ADR-010](adr-010-corpus-storage-and-curator-acceptance-boundary.md) and
depends on ADR-022's lifecycle status; it decides no schema migration order beyond that sequencing.

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
(adds per-kind canonicalization and a harder migration before the simpler directed invariant is
even in place); **validation-only check in `corpus.js`** without a storage constraint (leaves the
restore path and any future writer unguarded — the invariant belongs at the data layer).

## Decision

1. **Uniqueness key.** An accepted navigation relationship is identified by the directed tuple
   `(program_id, relationship_kind, from_entity_id, to_entity_id)`. Among relationships whose
   ADR-022 lifecycle `status` is `active`, that tuple MUST be unique within a Program.
2. **Reject duplicates on acceptance.** Accepting a candidate whose draft would create a second
   **active** relationship with an existing tuple MUST be rejected with the rejection reason
   `navigation_relationship_already_accepted`. The first relationship and the candidate are left
   unchanged; no partial accepted corpus is written (acceptance is transactional).
3. **Enforced at the storage layer.** The invariant MUST be enforced by
   `createAcceptedNavigationRelationshipRecord` and a partial-unique index on
   `accepted_navigation_relationships` scoped to `status = active`, so it holds uniformly for
   first-time acceptance, the `relationship_update` candidate kind, and any future writer — not
   only the `corpus.js` validation path.
4. **Directed tuple only.** Uniqueness is over the tuple exactly as stored. Reverse-direction
   collapse for semantically symmetric kinds is out of scope (Non-Goals).
5. **Scoped to active; re-acceptance allowed.** Because uniqueness is partial on `status = active`,
   a relationship withdrawn under ADR-022 does NOT block re-accepting the same tuple; the prior
   withdrawn edge remains addressable. This makes the index dependent on ADR-022's `status` column.
6. **Sequenced after duplicate cleanup.** The constraint MUST NOT be enabled while duplicate active
   rows exist. Pre-existing accepted duplicates are resolved by withdrawing the redundant edge via
   the ADR-022 withdrawal path before the partial-unique index is introduced.
7. **Restore rejects duplicates.** Backup restore MUST reject, before mutation, a backup that
   contains two active navigation relationships with the same tuple in a Program — consistent with
   ADR-022's pre-mutation restore validation.
8. **Authority unchanged.** This adds no new authority. Acceptance remains a `Program Curator`
   action attributable to the acting `Identity` and scoped to the `Program` (ADR-010); the only
   change to the contract is the new `ApiRejectionReason` value.

## Rules / Invariants

- `accepted_navigation_relationships` (`src/storage.js`) MUST carry a partial unique index on
  `(program_id, relationship_kind, from_entity_id, to_entity_id) WHERE status = 'active'`. The
  index depends on the `status` column introduced by ADR-022 and MUST NOT be created before
  existing active duplicates are withdrawn.
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
  left intact; a withdrawn edge re-acceptable; and a duplicate-bearing backup rejected.

## Consequences

- A curator gets a clear, specific rejection instead of silently accumulating redundant edges, and
  the accepted navigation graph stays free of active duplicates by construction.
- Prevention is coupled to ADR-022: the index needs ADR-022's `status` column, and existing
  duplicate active rows must be withdrawn through ADR-022 before the constraint can be enabled.
  This ADR therefore ships **after** ADR-022's withdrawal mechanism, not before.
- Enforcing at the storage layer covers the `relationship_update` candidate kind and restore for
  free; no separate per-path validation is needed, and future write paths inherit the guard.
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
- the concrete migration that clears existing duplicates, beyond requiring it to precede the index;
- reverse-direction / symmetric-kind canonicalization of the uniqueness key;
- silent idempotent acceptance semantics (explicitly rejected in favor of an error reason);
- uniqueness or duplicate handling for non-navigation accepted entity families;
- cross-program relationships or any change to acceptance authority, endpoint-kind, self-reference,
  or prerequisite-cycle validation already decided in ADR-010 and the navigation spec.
