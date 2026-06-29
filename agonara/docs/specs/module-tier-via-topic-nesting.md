---
date: 2026-06-28
model: claude-opus-4-8
description: "Spec for ADR-024 module tier via topic nesting: the topic_includes_topic navigation relationship, its single-parent/acyclic/active-endpoint invariants enforced atomically on accept, reactivation, and restore, the nesting navigation read projection, container-topic gap-diagnostic exemption, and the FK-safe relationship_kind CHECK-widening migration."
---

# Module Tier via Topic Nesting (`topic_includes_topic`)

Enforcement spec for [ADR-024](../adr/adr-024-module-tier-via-topic-nesting.md). It
composes with [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md)
(curator acceptance boundary), [ADR-022](../adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md)
(active/withdrawn lifecycle), and [ADR-023](../adr/adr-023-navigation-relationship-acceptance-uniqueness.md)
(active-uniqueness). ADR-023's uniqueness guard is a **dependency**: it must be
implemented before this spec's code lands (sequencing fixed in the implementation plan).

## Goal

Let a `Program Curator` express `Program → Module → Topic → Concept` (and deeper) by
nesting topic under topic through a new directed navigation relationship
`topic_includes_topic`, accepted via the existing curator candidate→acceptance flow, with
a well-formed-tree contract (single active parent, acyclic, both endpoints active) enforced
atomically, a nesting navigation read, and a container-aware coverage-gap diagnostic. Owned
by Corpus Storage (`src/storage.js`, `src/corpus.js`); read consumed by `src/learn-ui.js`;
diagnostics by `src/curator-workspace.js`.

## Public interface

### Relationship kind

- `topic_includes_topic` is added to `supportedNavigationRelationshipKinds` (`src/corpus.js`)
  and to the endpoint-kind whitelist `isValidNavigationRelationshipEndpointPair`
  (`src/storage.js`) as `from = topic`, `to = topic`. `http-contract.js` has no
  relationship-kind enum, so no enum entry is added there.
- It is accepted through the unchanged navigation paths — `acceptNavigationCandidate`
  (new-entity / `relationship_update` candidate) — and writes through the single shared
  create path `createAcceptedNavigationRelationshipRecord`. No new candidate kind, accepted
  entity family, table, or acceptance path is introduced. `from`/`to` selectors, `label`,
  `rationale`, `sourceIds`, and the candidate envelope are exactly those of any navigation
  relationship draft.

### New rejection reasons

Added to the `ApiRejectionReason` enum (`src/http-contract.js`) and surfaced in the OpenAPI
contract (`docs/api/openapi.yml`); thrown as `StorageInvariantError` in `src/storage.js` and
passed through by `mapNavigationStorageRejection`:

- `navigation_topic_already_has_parent` — the `to` (child) topic already has an active
  `topic_includes_topic` parent.
- `navigation_topic_inclusion_cycle` — the edge would make a topic its own containment
  ancestor.
- `navigation_relationship_endpoint_withdrawn` — an endpoint topic is `withdrawn` at accept,
  reactivation, or restore.

### Navigation read projection (contract change)

`GET /programs/{programId}/navigation` (`listProgramNavigation`, `src/corpus.js`):

- `navigation.topics` MUST contain exactly the **top-level** topics — those with no active
  `topic_includes_topic` parent.
- Each top-level topic node MUST expose its active child topics nested under it, recursively,
  via a `childTopics` array (each child node has the same shape, recursively, with its own
  `childTopics`). A leaf topic has `childTopics: []`.
- A nested child topic MUST NOT also appear at the top level of `navigation.topics`.
- The sibling `ungroupedConcepts` / `ungroupedMaterials` fields are unchanged.
- Each topic node's existing summary fields are unchanged (today
  `currentNavigationNodeSummaries` emits `entityId`, `revisionId`, `acceptedKind`, `title`, and
  the material signal fields — there are **no** per-topic concept/material child arrays). The
  only added field is `childTopics`. Concepts and materials remain represented exactly as today
  (grouped concepts/materials are still filtered out of the `ungrouped*` lists via their
  `topic_includes_concept` / `topic_uses_material` edges); this ADR does not embed them under
  topic nodes.

### Migration

A startup schema migration widens the `relationship_kind` CHECK to admit
`topic_includes_topic` on both `accepted_navigation_relationships` and
`accepted_navigation_relationship_revisions`. Because the CHECK cannot be altered in place
and `foreign_keys = ON`, it is an FK-safe table-rebuild (see Behavior rules → Migration).

### Curator skill

`agonara-curator-corpus` (`agonara/skills/agonara-curator-corpus/SKILL.md`) documents
modeling a module as a nesting topic via `topic_includes_topic`, that a container topic need
not carry direct concepts/materials/checks, and that nesting is accepted through the existing
numbered-handle acceptance gate.

## Behavior rules

All rules are scoped to **active** relationships unless stated otherwise (use
`listAcceptedNavigationRelationshipRecords(database, { programId, status: "active" })`).

### Endpoint kind

1. A `topic_includes_topic` edge whose `from` or `to` endpoint entity is not of accepted kind
   `topic` MUST be rejected `navigation_relationship_endpoint_kind_mismatch`
   (`isValidNavigationRelationshipEndpointPair`).
2. A `topic_includes_topic` edge whose `from` and `to` resolve to the same entity MUST be
   rejected `navigation_relationship_self_reference` (existing guard, unchanged).

### Both endpoints active

3. A `topic_includes_topic` edge MUST be rejected `navigation_relationship_endpoint_withdrawn`
   when either endpoint topic is `withdrawn`, on first acceptance, on `relationship_update`,
   on `withdrawn → active` reactivation, and on restore.

### Single parent (tree)

4. Among active `topic_includes_topic` relationships, the `to` (child) topic MUST have at most
   one parent. An acceptance, `relationship_update`, or reactivation that would give a child a
   second active parent MUST be rejected `navigation_topic_already_has_parent`. The check
   considers only `active` edges, so a child whose only parent edge is `withdrawn` MAY be
   re-parented.

### Acyclic

5. `topic_includes_topic` MUST NOT create a containment cycle: a topic MUST NOT be its own
   ancestor through active `topic_includes_topic` edges. A violating accept,
   `relationship_update`, or reactivation MUST be rejected `navigation_topic_inclusion_cycle`.
   This is a **separate** graph from the `concept_prerequisite` graph guarded by
   `assertNavigationRelationshipDoesNotCreateCycle`; the prerequisite cycle reason
   (`navigation_prerequisite_cycle`) is unchanged and never raised for containment, and vice
   versa.

### Atomic lifecycle transition

6. On acceptance/`relationship_update` (`acceptNavigationCandidate`) and on
   `withdrawn → active` reactivation (`setAcceptedNavigationRelationshipLifecycleStatus`), the
   endpoint-kind, both-endpoints-active, single-parent, acyclicity, and ADR-023 uniqueness
   checks AND the status/row write MUST execute in **one** `database.transaction`. A
   concurrent acceptance/reactivation MUST NOT be able to commit two active parents for one
   child, a cycle, or an edge to a withdrawn endpoint. Reactivation runs the full check set
   because ADR-023's reactivation guard is tuple-scoped and would not stop a *different* parent
   edge being reactivated while one is active.

### Restore

7. `restoreIdentityBackup` MUST validate single-parent, acyclicity, and active-endpoint
   invariants for `topic_includes_topic` before mutation, rejecting a backup that violates any
   with the corresponding reason.

### Navigation read

8. `listProgramNavigation` MUST present top-level topics as exactly those with no active
   `topic_includes_topic` parent and nest each active child topic under its parent via
   `childTopics`, recursively, per Public interface → Navigation read projection. Withdrawn
   `topic_includes_topic` edges and withdrawn topics MUST NOT appear in the projection.

### Coverage-gap diagnostics

9. A **container** topic — one with at least one active child topic — MUST NOT be reported
   `topic_without_concepts`, `topic_without_materials`, or `topic_without_checks`
   (`inspectCuratorCoverageGaps`, `src/curator-workspace.js`).
10. For a **non-container** topic, each of the three direct diagnostics is suppressed only by
    its own corresponding direct evidence: own concepts suppress only `topic_without_concepts`,
    own materials only `topic_without_materials`, own checks only `topic_without_checks`.
11. Withdrawing a `topic_includes_topic` parent edge leaves the **former parent** without that
    active child. If the former parent then has no active children and lacks its own direct
    evidence for a diagnostic, it MUST be re-flagged for that diagnostic. The former child
    returns to top-level and is judged by its own content. Withdrawing the edge MUST NOT
    re-flag the child.

### Migration (FK-safe CHECK widening)

12. A startup migration MUST widen the `relationship_kind` CHECK on
    `accepted_navigation_relationships` and `accepted_navigation_relationship_revisions` to
    include `topic_includes_topic` by rebuilding both tables. Because `PRAGMA foreign_keys` is a
    **no-op inside an open transaction** in SQLite, the FK toggle MUST sit OUTSIDE the
    transaction, in this exact order: `PRAGMA foreign_keys = OFF` → `BEGIN` → create new-shape
    tables, copy all rows, drop old, rename new, recreate every index → `PRAGMA foreign_key_check`
    (must return no rows) → verify each relationship's `current_revision_id` still resolves to a
    revision of the same relationship → `COMMIT` → `PRAGMA foreign_keys = ON`. The FK pragma MUST
    NOT be toggled with `database.transaction(...)` (which opens a transaction). The rebuild MUST
    preserve every column — including `status`, `status_updated_by_identity_id`,
    `status_updated_at` — and every row's meaning, and recreate every index, including any
    active-unique navigation index added by ADR-023 (a Dependency-gate prerequisite).
13. The migration MUST be idempotent: re-running it on an already-widened schema is a no-op,
    and it MUST NOT change the meaning of any existing accepted row or invalidate any existing
    flat program.

### Compatibility

14. Every existing topic with no `topic_includes_topic` parent is a valid top-level topic;
    every existing program reads unchanged after migration. No existing accepted row changes
    meaning. Acceptance remains transactional and curator-attributable (ADR-010); no new
    authority and no new acceptance path are added.

## Tests (required)

Domain (`src/storage.js` / `src/corpus.js`):

1. A `topic_includes_topic` candidate from topic A to topic B is accepted; B nests under A.
2. A `topic_includes_topic` edge with a non-topic endpoint is rejected
   `navigation_relationship_endpoint_kind_mismatch`.
3. A self-referential `topic_includes_topic` edge is rejected
   `navigation_relationship_self_reference`.
4. A second active parent for a child topic is rejected `navigation_topic_already_has_parent`.
5. A child whose only parent edge is `withdrawn` can be re-parented (no
   `navigation_topic_already_has_parent`).
6. A `topic_includes_topic` edge that closes a cycle (A→B exists, accept B→A) is rejected
   `navigation_topic_inclusion_cycle`; a deeper cycle (A→B→C, accept C→A) is likewise rejected.
7. A `concept_prerequisite` cycle still raises `navigation_prerequisite_cycle`, never
   `navigation_topic_inclusion_cycle`, and vice versa (graph isolation).
8. Accepting or reactivating a `topic_includes_topic` edge with a withdrawn endpoint topic is
   rejected `navigation_relationship_endpoint_withdrawn`.
9. Reactivating an old parent edge while a *different* active parent exists for the same child
   is rejected `navigation_topic_already_has_parent`.
10. Reactivating an edge that would close a containment cycle is rejected
    `navigation_topic_inclusion_cycle`.
11. ADR-023: a duplicate active `topic_includes_topic` edge `(program, kind, from, to)` is
    rejected `navigation_relationship_already_accepted` (once ADR-023 is present).
12. A competing concurrent acceptance/reactivation does not commit two active parents, a cycle,
    or an edge to a withdrawn endpoint (transactional invariant).

Navigation read (`listProgramNavigation`):

13. With A→B accepted, `navigation.topics` lists A at top level with B under `childTopics`, and
    B does not appear at top level.
14. Arbitrary depth (A→B→C) nests C under B under A.
15. Withdrawing A→B returns B to top-level; B no longer appears under A.
16. A mixed container — topic A includes child topic B (`topic_includes_topic`) and is also the
    `from` of a `topic_includes_concept` edge — appears with `childTopics` containing B, and A's
    grouped concept is filtered out of `ungroupedConcepts` exactly as today (mixed containment
    does not disturb the existing concept/material grouping).

Coverage-gap diagnostics (`inspectCuratorCoverageGaps`):

17. A container topic with active children and no direct concepts/materials/checks is not
    flagged `topic_without_concepts` / `_materials` / `_checks`.
18. A non-container topic with own concepts but no materials is flagged
    `topic_without_materials` only (own concepts do not suppress the material/check gaps).
19. After withdrawing a parent edge, a now-childless former parent lacking its own direct
    evidence is re-flagged per its leaf diagnostics; the former child is not re-flagged.

HTTP contract / OpenAPI:

20. The three new reasons appear in the `ApiRejectionReason` enum and the OpenAPI contract, and
    each is returned with the documented HTTP status on its trigger.

Backup / restore (`exportIdentityBackup` / `restoreIdentityBackup`):

21. A backup containing a valid nested tree round-trips (export then restore) with edges,
    revisions, and `status` preserved.
22. Restoring a backup that violates single-parent, acyclicity, or active-endpoint is rejected
    before mutation with the corresponding reason.

Migration:

23. An existing flat program (pre-widening fixture / DB created before the migration) reads
    unchanged after the migration: every relationship's id, kind, endpoints, revision, and
    status preserved; all indexes recreated; `PRAGMA foreign_key_check` clean; every
    `current_revision_id` resolves to a revision of its relationship.
24. The migration is idempotent: running it twice yields the same schema and rows as running it
    once, and a `topic_includes_topic` row inserts successfully afterward.

`relationship_update` path (the second acceptance branch, distinct from new-candidate
acceptance):

25. A `relationship_update` candidate carrying a valid `topic_includes_topic` draft nests B under
    A (parity with test 1 on the update path).
26. A `relationship_update` draft that would give a child a second active parent is rejected
    `navigation_topic_already_has_parent`.
27. A `relationship_update` draft to a withdrawn endpoint is rejected
    `navigation_relationship_endpoint_withdrawn`; one that closes a containment cycle is rejected
    `navigation_topic_inclusion_cycle`.
28. A `relationship_update` duplicate of an active `topic_includes_topic` edge is rejected
    `navigation_relationship_already_accepted` (ADR-023, once present).

## Done criteria

- The relationship kind, three rejection reasons (enum + OpenAPI), nesting read projection,
  container-aware gap diagnostics, and the FK-safe CHECK-widening migration are implemented per
  Behavior rules.
- ADR-023's uniqueness guard is implemented first (sequencing); `topic_includes_topic` composes
  with it (test 11 passing), and with ADR-022 withdrawal/reactivation.
- All enumerated tests pass; `./scripts/run_silent.sh "tests" npm test` and
  `./scripts/run_silent.sh "build" npx tsc --noEmit` are green (Node 22).
- No existing accepted row changes meaning and every existing flat program reads unchanged
  (test 23; the read contract for a flat program is also exercised by test 13's top-level case).
- Each ADR-024 invariant maps to at least one passing test (traceability carried into the
  implementation plan's ADR Traceability Matrix).
