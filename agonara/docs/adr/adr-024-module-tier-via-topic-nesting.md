---
date: 2026-06-28
model: claude-opus-4-8
status: proposed
description: "Decision to add a module tier to the corpus as a structural role of an existing topic via a new directed navigation relationship topic_includes_topic, rather than a new entity kind, with single-parent + acyclicity + active-endpoint invariants enforced atomically on accept and reactivation, gap-diagnostic adjustments for container topics, and a data-compatible rollout that still requires an FK-safe schema migration to widen the relationship_kind CHECK."
---

# ADR-024 — Module Tier via Topic Nesting (`topic_includes_topic`)

## Executive Summary

Agonara's corpus is structurally flat above the concept: a `Program` has top-level **topics**,
and a topic includes **concepts** and **materials**; there is no module, unit, or section tier
and no way to place one topic under another. A curator who needs `Program → Module → Topic →
Concept` has no mechanism — both the module and the topic become sibling top-level topics, and
the intended nesting cannot be expressed (reported in practice).

This ADR adds the module tier **without a new entity kind**. A "module" is a **role an existing
topic plays**: a topic that contains other topics. The mechanism is a new directed navigation
relationship **`topic_includes_topic`** (`from` parent topic → `to` child topic), accepted
through the same curator candidate→acceptance flow as every other navigation edge. A topic with
outgoing `topic_includes_topic` edges *is* a module; a topic with an incoming one is nested.
Nesting MAY be of arbitrary depth.

Three invariants keep the nesting a well-formed tree: a child topic MUST have **at most one**
active parent (`navigation_topic_already_has_parent`); `topic_includes_topic` MUST be **acyclic**
— a topic MUST NOT be its own ancestor (`navigation_topic_inclusion_cycle`); and an edge's two
endpoints MUST both be **active**, not withdrawn (`navigation_relationship_endpoint_withdrawn`).
These checks plus the status write MUST run in **one transaction**, on first acceptance **and** on
ADR-022 reactivation. The edge is otherwise an ordinary navigation relationship: it inherits
ADR-010's curator acceptance boundary, ADR-022's active/withdrawn lifecycle, and ADR-023's
`(program, kind, from, to)` active-uniqueness, and the existing self-reference and endpoint-kind
guards. The navigation read projection MUST nest child topics under their parent; top-level topics
are those with no active parent. Coverage-gap diagnostics MUST treat a container topic (one with
active child topics) as structured by its children, so a module is not falsely flagged
`topic_without_concepts` / `_materials` / `_checks`.

**Grounding (as of v0.4.0).** ADR-022's withdrawal lifecycle **is now implemented for navigation**
— `accepted_navigation_relationships` carries `status … check (status in ('active','withdrawn'))`
plus `status_updated_by_identity_id` / `status_updated_at` — so the `active`-scoped invariants here
are implementable today. ADR-023's uniqueness guard is **still not implemented** (no
`navigation_relationship_already_accepted` reason, no active-unique index), so ADR-024 depends on
that landing. The `relationship_kind` CHECK still lists only the original eight kinds, and there is
no migration framework, so admitting `topic_includes_topic` requires an **FK-safe table-rebuild
migration**; existing rows and programs are unaffected in meaning. This ADR extends
[ADR-010](adr-010-corpus-storage-and-curator-acceptance-boundary.md), composes with
[ADR-022](adr-022-accepted-entity-withdrawal-and-source-deletion.md) and
[ADR-023](adr-023-navigation-relationship-acceptance-uniqueness.md), and explicitly rejects a
first-class `module` entity and a presentational grouping attribute.

## Context

The structural relationship kinds today are `topic_includes_concept`, `topic_uses_material`,
`concept_uses_material`, `concept_has_definition`, `concept_has_principle`, `concept_prerequisite`,
`concept_related`, and `concept_distinguishes_from`. None nests topics; "module" does not exist as
an entity, relationship, or attribute. The shape guidance in the corpus skill already maps "a
section / module / unit of organization → a topic," so a module is conceptually a topic — there is
just no relationship to express a topic containing topics.

A curator accepts a navigation relationship through a candidate (`acceptNavigationCandidate`,
`src/corpus.js`): drafts are validated for kind, endpoint selectors, self-reference, prerequisite
cycles, and source validity (`validateNavigationRelationshipDrafts`,
`assertNavigationRelationshipEndpoints`, `assertNavigationRelationshipDoesNotCreateCycle`), and the
row is written once through `createAcceptedNavigationRelationshipRecord` (`src/storage.js`) — the
single create path that also serves `relationship_update`. The accepted graph is read through
`GET /programs/{programId}/navigation` (`listProgramNavigation`).

Implementation realities, confirmed in source at v0.4.0:

- **Navigation withdrawal lifecycle exists.** `accepted_navigation_relationships` now has
  `status text not null default 'active' check (status in ('active','withdrawn'))`,
  `status_updated_by_identity_id`, and `status_updated_at` (`src/storage.js`); ADR-022 was
  implemented and released in v0.4.0. The `active`-scoped rules below are therefore buildable now.
- **ADR-023 uniqueness is not yet implemented.** No `navigation_relationship_already_accepted`
  reason and no active-unique navigation index exist; ADR-024 depends on that work.
- **`relationship_kind` is a fixed CHECK and there is no migration framework.** Both
  `accepted_navigation_relationships` and `accepted_navigation_relationship_revisions` pin
  `relationship_kind` to a hardcoded `check (... in (<8 kinds>))`; the schema is created only via
  `create table if not exists` with no `ALTER TABLE` / `pragma user_version` / rebuild logic. A
  ninth kind needs a table-rebuild migration. (`from_kind`/`to_kind` already allow `'topic'`, so
  only `relationship_kind` blocks it.)
- **`foreign_keys = ON`** (`src/storage.js`, `openIdentityDatabase`), and
  `accepted_navigation_relationship_revisions` references `accepted_navigation_relationships(id)`
  (both reference `accepted_corpus_*`), so any rebuild must be FK-safe.
- **The navigation read is flat today.** `listProgramNavigation` returns `navigation.topics` as a
  flat list of all topics plus sibling `ungroupedConcepts` / `ungroupedMaterials`; concepts are
  not nested under topics. A nesting projection is a read-contract change. The one confirmed
  consumer of `navigation.topics` is `learn-ui` (`src/learn-ui.js:3079-3083`), which renders it as
  a single flat level.
- **The kind set lives in `corpus.js`.** Candidate validation checks
  `supportedNavigationRelationshipKinds` (`src/corpus.js:110`); `http-contract.js` has no
  relationship-kind enum. Rejection reasons live in its `ApiRejectionReason` enum.

Rejected alternatives:

| Alternative | Why rejected |
|---|---|
| **First-class `module` entity** (new candidate kind + accepted entity/revision tables + `program_includes_module`/`module_includes_topic` kinds + navigation, UI, backup/restore arrays, gap kinds) | Largest possible surface for an outcome the existing topic entity already models ("section/module/unit → a topic"). Deferred, not foreclosed — if modules later need semantics topics cannot carry, this ADR does not block promoting them to an entity. |
| **Presentational grouping attribute** (a `moduleLabel`/order column on topics) | Modules could not own structure or content and would not be navigable; grouping would live outside the candidate→acceptance model, breaking the invariant that program structure is *accepted navigation*. Not the hierarchy requested. |
| **Multi-parent DAG** | Ambiguous tree rendering and ownership; "which module is this topic in" has no single answer. A single-parent tree matches the course-hierarchy model and keeps the projection deterministic. |
| **Forbid mixed containment** | Over-constrains authoring (a module with its own overview concept is reasonable). Mixed is allowed; gap diagnostics are adjusted instead. |
| **Capped nesting depth** | An arbitrary cap is arbitrary; acyclicity already bounds the graph to a finite tree. |
| **New `acceptModuleCandidate` path** | A second acceptance path would miss `relationship_update` and restore writers; reusing the single navigation create path picks up the ADR-022/023 guards instead of duplicating them per path. |

## Decision

1. **Module is a role of a topic, expressed by a relationship — not a new entity.** A "module" is
   a topic that has one or more active outgoing `topic_includes_topic` edges. No new candidate
   kind, accepted-entity family, or table is introduced.
2. **New relationship kind `topic_includes_topic`.** Directed, `from` = parent topic, `to` = child
   topic. Added to `supportedNavigationRelationshipKinds` (`src/corpus.js`, the set candidate
   validation checks — `http-contract.js` has no relationship-kind enum) and to endpoint-kind
   validation so both endpoints MUST be `topic` (`navigation_relationship_endpoint_kind_mismatch`
   otherwise). Admitting it also requires **widening the hardcoded `relationship_kind` CHECK** on
   `accepted_navigation_relationships` and `accepted_navigation_relationship_revisions` via an
   FK-safe table-rebuild migration (Decision 10). Accepted through the ordinary navigation
   candidate / `relationship_update` flow — a `Program Curator` action, attributable to the acting
   `Identity`, scoped to the `Program` (ADR-010). No new authority.
3. **Single parent (tree, not DAG).** Among active relationships, a child topic MUST have at most
   one `topic_includes_topic` parent; a second active-parent acceptance MUST be rejected
   `navigation_topic_already_has_parent`. This check MUST run on first acceptance / `relationship_update`
   **and** on ADR-022 `withdrawn → active` reactivation (ADR-023's reactivation guard is
   tuple-scoped and would not stop a *different* parent edge being reactivated while one is active).
4. **Acyclic.** `topic_includes_topic` MUST NOT create a cycle: a topic MUST NOT be its own
   ancestor. Enforced by extending the existing cycle guard
   (`assertNavigationRelationshipDoesNotCreateCycle`) to this kind, scoped to the containment graph
   and kept distinct from the prerequisite graph it already guards; rejected
   `navigation_topic_inclusion_cycle`. The cycle check MUST run on reactivation as well as first
   acceptance. Self-reference remains caught by `navigation_relationship_self_reference`.
5. **Both endpoints must be active.** A `topic_includes_topic` edge MUST NOT be accepted or
   reactivated when either endpoint topic is `withdrawn` (ADR-022 can withdraw an edge and then its
   endpoint topics, so a later reactivation would otherwise point at a withdrawn topic). Rejected
   `navigation_relationship_endpoint_withdrawn`; restore enforces the same. (Stated for
   `topic_includes_topic`; it likely generalizes to all navigation kinds and may later be promoted
   to ADR-022/023, but ADR-024 depends on it and asserts it for its own kind.)
6. **Atomic lifecycle transition.** The endpoint-kind, both-endpoints-active, single-parent,
   acyclicity, and ADR-023 uniqueness checks together with the status write (`draft → active` on
   acceptance, `withdrawn → active` on reactivation) MUST execute in one write transaction, so a
   concurrent acceptance/reactivation cannot read a valid graph and commit an invalid one.
7. **Nesting depth unbounded; mixed containment allowed.** Arbitrary depth is permitted
   (acyclicity bounds it to a finite tree). A topic MAY simultaneously include child topics and its
   own concepts/materials.
8. **Navigation read nests (a read-contract change).** Today `navigation.topics` is a flat list of
   all topics with sibling `ungroupedConcepts` / `ungroupedMaterials`. This ADR changes that
   contract: `navigation.topics` MUST present top-level topics (no active `topic_includes_topic`
   parent) with each child topic reachable under its parent. The exact shape — child nested only,
   or also in a separately-named flat index — MUST be fixed in the spec; the confirmed consumer
   `learn-ui` (`src/learn-ui.js:3079-3083`) renders one flat level, so the spec MUST either keep a
   flat index or make that consumer render recursively. (Readiness-check `period` scope is
   unaffected: it validates request-supplied `topicEntityIds` regardless of nesting.)
9. **Gap diagnostics account for container topics.** A topic with active child topics is a
   container and MUST NOT be flagged `topic_without_concepts`, `topic_without_materials`, or
   `topic_without_checks`. For a non-container topic, each of the three direct diagnostics is
   suppressed only by its **own corresponding direct evidence** (own concepts do not suppress a
   missing material or check). Withdrawing a parent edge leaves the **former parent** without that
   active child; if it then has no active children and lacks its own direct evidence, the former
   parent MUST be re-flagged per its now-leaf diagnostics, while the former child returns to
   top-level governed by its own content.
10. **Data-compatible, but an FK-safe schema migration is required.** Every existing topic is a
    valid top-level topic with no parent; existing programs read unchanged and no accepted row
    changes meaning. But admitting `topic_includes_topic` requires a table-rebuild migration
    widening the `relationship_kind` CHECK on both navigation tables (Decision 2) — the CHECK
    cannot be altered in place and no migration framework exists, so adding that mechanism is in
    scope. Because `foreign_keys = ON` and the revisions table references the relationships table,
    the rebuild MUST run with FK enforcement disabled for its span inside a transaction, rebuild
    both tables together, recreate every index, **preserve all columns including `status`,
    `status_updated_by_identity_id`, and `status_updated_at`** and every row unchanged, pass
    `PRAGMA foreign_key_check` before commit, and verify each `current_revision_id` still resolves
    to a revision of the same relationship. The edge otherwise rides the existing
    `accepted_navigation_relationships` table and the `exportIdentityBackup` /
    `restoreIdentityBackup` arrays; restore MUST validate single-parent, acyclicity, and
    active-endpoint invariants before mutation.
11. **Sequencing.** ADR-022's navigation withdrawal/status lifecycle is implemented (v0.4.0), so
    the `active`-scoped rules are buildable now. ADR-023's uniqueness guard and
    `navigation_relationship_already_accepted` reason are NOT yet implemented; ADR-024 depends on
    them and MUST compose with (not duplicate) them.
12. **Curator skill teaches the model.** `agonara-curator-corpus` MUST document modeling a module
    as a nesting topic via `topic_includes_topic`, that a container topic need not carry direct
    concepts, and that nesting is accepted through the existing numbered-handle acceptance gate.

## Rules / Invariants

- A `topic_includes_topic` relationship MUST have both endpoints of kind `topic`
  (`navigation_relationship_endpoint_kind_mismatch` otherwise) and both endpoints `active`
  (`navigation_relationship_endpoint_withdrawn` otherwise), on acceptance, reactivation, and
  restore.
- Among active relationships a child topic MUST have at most one `topic_includes_topic` parent
  (`navigation_topic_already_has_parent`); `topic_includes_topic` MUST be acyclic
  (`navigation_topic_inclusion_cycle`); self-reference MUST remain rejected
  (`navigation_relationship_self_reference`).
- The endpoint-kind, both-endpoints-active, single-parent, and acyclicity checks MUST be enforced
  at the shared create path (`createAcceptedNavigationRelationshipRecord`) and candidate validation
  (`acceptNavigationCandidate`/`validateNavigationRelationshipDrafts`), covering first-time
  acceptance and `relationship_update`; they MUST also run on ADR-022 `withdrawn → active`
  reactivation; and backup restore MUST enforce them before mutation.
- On acceptance and reactivation, these checks AND the status write MUST occur in one write
  transaction, so a concurrent acceptance/reactivation cannot commit two active parents, a cycle,
  or an edge to a withdrawn endpoint.
- `topic_includes_topic` MUST be added to `supportedNavigationRelationshipKinds` (`src/corpus.js`),
  not `http-contract.js`. The new reasons `navigation_topic_already_has_parent`,
  `navigation_topic_inclusion_cycle`, and `navigation_relationship_endpoint_withdrawn` MUST be
  added to the `ApiRejectionReason` enum in `src/http-contract.js` and surfaced through the OpenAPI
  contract.
- `topic_includes_topic` MUST obey ADR-023 active-uniqueness on
  `(program_id, relationship_kind, from_entity_id, to_entity_id)` and ADR-022 withdrawal /
  reactivation semantics; nothing here overrides them. ADR-023's guard and reason are a dependency,
  not assumed already present.
- Admitting `topic_includes_topic` MUST widen the `relationship_kind` CHECK on both navigation
  tables via an FK-safe table-rebuild migration (FK disabled for the rebuild span inside a
  transaction, both tables rebuilt together, every index recreated, all columns — including
  `status` and the `status_updated_*` columns — and every row preserved, `PRAGMA foreign_key_check`
  before commit, every `current_revision_id` revalidated).
- `GET /programs/{programId}/navigation` MUST present top-level topics as exactly those with no
  active `topic_includes_topic` parent and nest each child under its parent; the spec MUST define
  the nested and any flat fields and either keep a flat index or migrate `learn-ui`.
- Coverage-gap diagnostics MUST NOT report a topic with active child topics as
  `topic_without_concepts` / `_materials` / `_checks`; for a non-container topic each direct
  diagnostic is suppressed only by its own corresponding direct evidence; withdrawing a parent
  re-flags the now-childless former parent (not the child).
- The change MUST NOT change the meaning of any existing accepted row or invalidate any existing
  flat program; the rebuild MUST preserve every relationship's id, kind, endpoints, revision, and
  status.
- Acceptance of `topic_includes_topic` MUST remain transactional and curator-attributable
  (ADR-010); it adds no new authority and no new acceptance path.
- The decision MUST be verified by domain, HTTP-contract, navigation-read, gap-diagnostic, and
  backup/restore tests in the downstream spec, including: a child nested under a module; a
  second-parent acceptance rejected; a cycle rejected; a duplicate edge rejected (ADR-023 once
  present); acceptance/reactivation with a withdrawn endpoint rejected
  (`navigation_relationship_endpoint_withdrawn`); reactivating an old parent edge while a different
  parent is active rejected; reactivation that would close a cycle rejected; a competing concurrent
  acceptance/reactivation not committing two active parents; withdrawing a parent re-flagging the
  now-childless former parent (not the child); each direct gap suppressed only by its own evidence;
  a container topic not flagged `topic_without_concepts`/`_materials`/`_checks`; and an existing
  flat program reading unchanged after the FK-safe CHECK-widening migration (rows, indexes, and
  status preserved, `foreign_key_check` clean).

## Consequences

- A curator can express `Program → Module → Topic → Concept` (and deeper) by nesting topics, using
  the acceptance flow and numbered-handle gate they already know — no new entity and no new
  authority.
- Reusing the navigation relationship machinery means modules inherit the now-implemented ADR-022
  withdrawal lifecycle (un-nest by withdrawing the parent edge), and — once ADR-023's guard lands —
  active-uniqueness, alongside the existing self-reference and cycle guards and the backup/restore
  arrays. The net new surface is: one relationship kind, three rejection reasons, the single-parent
  and active-endpoint guards (on accept *and* reactivation, in one transaction), the acyclicity
  extension, the nesting read-contract change, a gap-diagnostic tweak, and — the one non-trivial
  cost — an FK-safe CHECK-widening table-rebuild migration plus the migration mechanism the
  codebase lacks today.
- The single-parent rule makes the tree deterministic and "which module owns this topic"
  unambiguous, at the cost of disallowing a topic under two modules (deferred, not foreclosed).
- Mixed containment keeps authoring flexible. A topic with active children is exempt from all three
  per-topic gaps; a topic without children is judged per-diagnostic by its own direct evidence (own
  concepts clear only `topic_without_concepts`). This removes false container noise while still
  catching genuinely empty leaf topics.
- Existing flat programs are valid as-is and render identically; adoption is incremental and
  reversible (withdraw the parent edge to un-nest).
- Because modules are topics, a future need for module-only semantics (module-level checks,
  ordering) is not served here and would require new decisions or promoting modules to an entity —
  out of scope.
- Conformance MUST be verified by the downstream spec's acceptance criteria and tests; this ADR is
  the boundary, the spec is its enforcement mechanism.

## Non-Goals

This ADR does not decide:

- a first-class `module` entity, `module` candidate kind, or `program_includes_module`
  relationship (revisitable if topics prove insufficient);
- multi-parent / DAG nesting or a topic appearing under more than one module;
- a presentational grouping attribute on topics;
- module-specific semantics distinct from topics (module-level checks, readiness, ordering rules)
  beyond the structural nesting decided here;
- a nesting-depth cap;
- reverse-direction / symmetric handling (`topic_includes_topic` is strictly directed);
- implementing ADR-023's uniqueness guard itself (a dependency, decided in ADR-023);
- any change to ADR-010 acceptance authority or ADR-022 withdrawal beyond adding
  `topic_includes_topic` as a participating kind;
- UI rendering specifics for nested navigation in `learn-ui`/`admin-ui` (the read contract is
  decided here; presentation is spec/implementation work);
- ordering of sibling topics within a module (a separate concern from containment).
