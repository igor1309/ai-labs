---
date: 2026-06-28
model: claude-opus-4-8
status: planned
description: "Implementation plan for module tier via topic nesting (ADR-024, spec module-tier-via-topic-nesting): the topic_includes_topic navigation relationship, its single-parent/acyclic/active-endpoint invariants enforced atomically on accept, reactivation, and restore, the nesting navigation read, container-topic gap exemption, and the FK-safe relationship_kind CHECK-widening migration. Depends on ADR-023 uniqueness landing first."
---

# Module Tier via Topic Nesting Implementation Plan

## Goal

Implement [Module Tier via Topic Nesting](../specs/module-tier-via-topic-nesting.md) under
[ADR-024](../adr/adr-024-module-tier-via-topic-nesting.md): add the directed
`topic_includes_topic` navigation relationship so a curator can nest topic under topic to
express `Program → Module → Topic → Concept`, enforce the single-active-parent, acyclic, and
both-endpoints-active invariants atomically on acceptance, reactivation, and restore, nest the
navigation read, exempt container topics from the three `topic_without_*` coverage gaps, and
widen the `relationship_kind` CHECK with an FK-safe table-rebuild migration. No new entity
kind, candidate kind, accepted-entity family, or acceptance path.

## Execution mode

Execution mode: auto-continue
Human review between tasks: no
Push policy: push at closeout

## Execution lock

Worktree mode: create new
Expected worktree: set at execution
Expected branch: `claude/agonara-adr-024-impl-*`
Preflight check: [ ] (executor establishes the lock at execution start per process-gates)

This plan is authored for **later** execution in a separate session; the execution lock is
intent only. Do not honor the authoring branch (`claude/agonara-adr-024-module-tier`) as a
target — it carries the ADR/spec/plan docs and goes dead once this plan merges.

## Dependency gate

[ADR-023](../adr/adr-023-navigation-relationship-acceptance-uniqueness.md) navigation-relationship
acceptance uniqueness MUST be implemented before this plan's code lands. ADR-024 composes with —
does not duplicate — ADR-023's active-uniqueness guard and `navigation_relationship_already_accepted`
reason. Preflight MUST confirm `navigation_relationship_already_accepted` exists in
`src/storage.js` / `src/http-contract.js` before starting Phase 2. ADR-022's navigation
withdrawal/status lifecycle is already implemented (v0.4.0): `accepted_navigation_relationships`
carries the `status` column and `setAcceptedNavigationRelationshipLifecycleStatus` exists, so the
`active`-scoped rules are buildable now. Preflight MUST confirm the `status` column is present.

## Scope guardrails

- No new candidate kind, accepted-entity family, table, or acceptance path. `topic_includes_topic`
  rides `accepted_navigation_relationships` / `_revisions` and the single create path
  `createAcceptedNavigationRelationshipRecord`.
- `relationship_kind` is the only schema element widened. `from_kind`/`to_kind` already allow
  `'topic'`; do not touch them.
- The cycle guard for containment is a **separate** graph from `concept_prerequisite`. Do not
  merge the two; `navigation_prerequisite_cycle` is never raised for containment and vice versa.
- All new invariant scans consider only `active` relationships
  (`listAcceptedNavigationRelationshipRecords(database, { programId, status: "active" })`).
- Do not change ADR-010 acceptance authority or ADR-022 withdrawal beyond adding
  `topic_includes_topic` as a participating kind.
- No UI rendering redesign beyond making the confirmed flat consumer render the nested read.

## Exact implementation inventory

- `src/storage.js`
  - `accepted_navigation_relationships` and `accepted_navigation_relationship_revisions`:
    widen the `relationship_kind` CHECK to add `'topic_includes_topic'` via an FK-safe
    table-rebuild migration at startup (lines ~642–696).
  - `isValidNavigationRelationshipEndpointPair` (~5160): add
    `relationshipKind === "topic_includes_topic" && fromKind === "topic" && toKind === "topic"`.
  - `assertNavigationRelationshipDoesNotCreateCycle` (~5173): add a containment pass for
    `topic_includes_topic` over **active** edges, throwing `navigation_topic_inclusion_cycle`.
  - New asserts in the shared create path (~4297 create site, ~5096) and restore path
    (~6169 `restoreIdentityBackup`): single-parent (`navigation_topic_already_has_parent`) and
    both-endpoints-active (`navigation_relationship_endpoint_withdrawn`).
  - `setAcceptedNavigationRelationshipLifecycleStatusRecord` (~4366): on `withdrawn → active`,
    run the full invariant set inside the same transaction.
- `src/corpus.js`
  - `supportedNavigationRelationshipKinds` (~127): add `"topic_includes_topic"`.
  - `setAcceptedNavigationRelationshipLifecycleStatus` (~1052): ensure reactivation invariants
    run transactionally and map storage rejections.
  - `mapNavigationStorageRejection` (~3912): pass the three new reasons through (default branch
    already returns the reason unchanged — confirm, add only if a remap is needed).
  - `listProgramNavigation` (~1431): build the nested projection (`childTopics`, recursive;
    top-level = no active `topic_includes_topic` parent), active-only.
- `src/curator-workspace.js`
  - `inspectCuratorCoverageGaps` (~427) / `coverageGapKinds` (~26): container topics (≥1 active
    child topic) exempt from `topic_without_concepts` / `_materials` / `_checks`; non-container
    topics suppressed only by own corresponding direct evidence; withdrawing a parent re-flags
    the now-childless former parent, not the child.
- `src/http-contract.js`
  - `ApiRejectionReason` enum (~1084): add `navigation_topic_already_has_parent`,
    `navigation_topic_inclusion_cycle`, `navigation_relationship_endpoint_withdrawn`.
- `src/learn-ui.js`
  - flat navigation consumer (~3079–3083): render `childTopics` recursively (or read the flat
    index the spec keeps) so nested topics display.
- `docs/api/openapi.yml`: surface the three new reasons in the `ApiRejectionReason` schema.
- `agonara/skills/agonara-curator-corpus/SKILL.md`: teach the module-as-nesting-topic model.

## Phase tracker

- [ ] Phase 1 — FK-safe `relationship_kind` CHECK-widening migration
- [ ] Phase 2 — Relationship kind, endpoint-kind, and accept-time invariants (atomic)
- [ ] Phase 3 — Reactivation and restore enforcement
- [ ] Phase 4 — Navigation read nesting projection and learn-ui consumer
- [ ] Phase 5 — Coverage-gap container exemption and former-parent re-flag
- [ ] Phase 6 — HTTP contract and OpenAPI reasons
- [ ] Phase 7 — Curator skill, docs/log, traceability, closeout

## ADR traceability matrix

| ADR-024 invariant | Spec rule | Phase | Tests |
|---|---|---|---|
| New kind `topic_includes_topic`, both endpoints `topic` | 1–2 | 2 | 1, 2, 3 |
| Both endpoints active | 3 | 2 (accept), 3 (reactivate/restore) | 8, 22 |
| Single active parent (tree) | 4 | 2, 3 | 4, 5, 9 |
| Acyclic, separate from prerequisite graph | 5 | 2, 3 | 6, 7, 10 |
| Atomic lifecycle transition | 6 | 2, 3 | 12 |
| Restore validates invariants before mutation | 7 | 3 | 21, 22 |
| Nesting navigation read | 8 | 4 | 13, 14, 15, 16 |
| Container topics exempt from `topic_without_*` | 9–11 | 5 | 17, 18, 19 |
| FK-safe CHECK-widening migration, idempotent | 12–13 | 1 | 23, 24 |
| Compatibility (existing rows/programs unchanged) | 14 | 1, 4 | 14, 23 |
| Composes with ADR-023 uniqueness | (dependency) | gate + 2 | 11 |
| Three reasons in enum + OpenAPI | interface | 6 | 20 |

## Product intent traceability

A curator can express `Program → Module → Topic → Concept` (and deeper) through the acceptance
flow and numbered-handle gate they already use, with no new entity and no new authority —
serving the reported need for a module tier the flat corpus could not express.

## Phase 1 — FK-safe `relationship_kind` CHECK-widening migration

Add the startup migration that rebuilds `accepted_navigation_relationships` and
`accepted_navigation_relationship_revisions` to widen the `relationship_kind` CHECK to include
`topic_includes_topic`, FK-safe and idempotent.

- Step 1.1 — Add an idempotent startup migration: detect the old CHECK (e.g. probe by attempting
  a guarded insert, or inspect `sqlite_master` DDL) and, if not yet widened, within one
  transaction with `PRAGMA foreign_keys = OFF` for its span: create the new-shape tables, copy
  all rows preserving every column (`status`, `status_updated_by_identity_id`,
  `status_updated_at` included), drop old, rename new, recreate every index, run
  `PRAGMA foreign_key_check` (must be clean), and verify each `current_revision_id` resolves to a
  revision of its relationship. Re-enable FK after commit.
- Step 1.2 — Tests 23, 24: a pre-widening fixture DB reads unchanged after migration (rows,
  indexes, status preserved, `foreign_key_check` clean); running the migration twice is a no-op;
  a `topic_includes_topic` row inserts successfully afterward.
- Run `./scripts/run_silent.sh "tests" npm test` and `./scripts/run_silent.sh "build" npx tsc
  --noEmit`; commit `agonara: ADR-024 phase 1 — FK-safe relationship_kind CHECK widening`.

## Phase 2 — Relationship kind, endpoint-kind, and accept-time invariants (atomic)

- Step 2.1 — Add `"topic_includes_topic"` to `supportedNavigationRelationshipKinds`
  (`src/corpus.js`) and the topic/topic pair to `isValidNavigationRelationshipEndpointPair`
  (`src/storage.js`).
- Step 2.2 — Add the single-parent guard (`navigation_topic_already_has_parent`) and
  both-endpoints-active guard (`navigation_relationship_endpoint_withdrawn`) at the shared create
  path, active-scoped; extend `assertNavigationRelationshipDoesNotCreateCycle` with the
  containment pass (`navigation_topic_inclusion_cycle`), kept distinct from the prerequisite
  graph. Ensure all run inside the existing `acceptNavigationCandidate` transaction.
- Step 2.3 — Tests 1–8, 12 (accept-time): nest accepted; endpoint-kind mismatch; self-reference;
  second active parent rejected; re-parent after withdrawal allowed; cycle rejected (shallow and
  deep); graph isolation vs `concept_prerequisite`; withdrawn endpoint rejected; concurrent
  acceptance does not commit two parents/cycle.
- Run tests + build; commit `agonara: ADR-024 phase 2 — topic_includes_topic kind and accept-time invariants`.

## Phase 3 — Reactivation and restore enforcement

- Step 3.1 — In `setAcceptedNavigationRelationshipLifecycleStatus` (`withdrawn → active`), run the
  endpoint-active, single-parent, acyclicity, and ADR-023 uniqueness checks plus the status write
  in one transaction.
- Step 3.2 — In `restoreIdentityBackup`, validate single-parent, acyclicity, and active-endpoint
  for `topic_includes_topic` before mutation.
- Step 3.3 — Tests 8 (reactivate), 9, 10, 21, 22.
- Run tests + build; commit `agonara: ADR-024 phase 3 — reactivation and restore enforcement`.

## Phase 4 — Navigation read nesting projection and learn-ui consumer

- Step 4.1 — `listProgramNavigation`: top-level topics = those with no active
  `topic_includes_topic` parent; nest active child topics recursively under `childTopics`;
  withdrawn edges/topics excluded; `ungroupedConcepts`/`ungroupedMaterials` unchanged.
- Step 4.2 — Update the `learn-ui.js` consumer (~3079–3083) to render `childTopics` recursively.
- Step 4.3 — Tests 13–16.
- Run tests + build; commit `agonara: ADR-024 phase 4 — nesting navigation read and learn-ui`.

## Phase 5 — Coverage-gap container exemption and former-parent re-flag

- Step 5.1 — `inspectCuratorCoverageGaps`: container topics (≥1 active child topic) exempt from
  the three `topic_without_*` gaps; non-container topics suppressed only by own corresponding
  direct evidence; withdrawing a parent re-flags the now-childless former parent, not the child.
- Step 5.2 — Tests 17–19.
- Run tests + build; commit `agonara: ADR-024 phase 5 — container-aware coverage gaps`.

## Phase 6 — HTTP contract and OpenAPI reasons

- Step 6.1 — Add `navigation_topic_already_has_parent`, `navigation_topic_inclusion_cycle`,
  `navigation_relationship_endpoint_withdrawn` to the `ApiRejectionReason` enum
  (`src/http-contract.js`) and to `docs/api/openapi.yml`; confirm each maps to the documented
  HTTP status.
- Step 6.2 — Test 20.
- Run tests + build; commit `agonara: ADR-024 phase 6 — HTTP/OpenAPI rejection reasons`.

## Phase 7 — Curator skill, docs/log, traceability, closeout

- Step 7.1 — `agonara-curator-corpus` SKILL: teach modeling a module as a nesting topic via
  `topic_includes_topic`, container topics needing no direct concepts, and acceptance through the
  numbered-handle gate. Bump the skill version.
- Step 7.2 — Update `agonara/docs/log.md`; move the spec to `docs/specs/implemented/` and this
  plan to `docs/plans/implemented/` at closeout; update README Components if affected.
- Step 7.3 — Final tests + build green.
- Commit `agonara: ADR-024 phase 7 — curator skill, docs, closeout`.

## Done criteria

- All 24 spec tests pass; `./scripts/run_silent.sh "tests" npm test` and `npx tsc --noEmit` green
  (Node 22).
- ADR-023 uniqueness present (dependency gate satisfied); test 11 passes.
- Every ADR-024 invariant maps to ≥1 passing test (traceability matrix above).
- No existing accepted row changes meaning; every existing flat program reads unchanged
  (tests 14, 23).
- Spec and plan moved to their `implemented/` directories; log updated.

## Final closeout

- Open one PR for the task (push at closeout); CI green via `release-unit`/core path.
- Confirm a follow-up release decision (ADR-024 is a feature; a subsequent `agonara_v0.x.0`
  release deploys it) — release is a separate task, not part of this plan.
