---
date: 2026-06-28
model: claude-opus-4-8
description: "Spec: Agonara accepted-entity withdrawal lifecycle and two-tier Program source deletion."
version: 1.0.0
status: implemented
type: spec
---

# Accepted Entity Withdrawal and Source Deletion

## Goal

Define the contract, owned by Corpus Storage and the accepted-entity domain commands, for a
`Program Curator` to retire accepted content and Program sources without erasing the history
student evidence depends on: every accepted entity family and every Program source record
gains a reversible `active ↔ withdrawn` lifecycle status, and source records gain a two-tier
deletion (hard-delete when unreferenced, withdraw-only when referenced). Governed by
[ADR-022](../adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md); extends — does
not overturn — the addressability invariants of
[ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md),
[ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), and
[ADR-016](../adr/adr-016-quick-check-assessment-boundary.md), and completes the deletion tiers
[ADR-021](../adr/adr-021-material-content-storage-and-role-gated-reading.md) deferred. Models
the soft-status precedent already implemented for `learner_evidence_target_links`
([learner-state interpretation spec](learner-state-interpretation.md)).

## Scope

In scope: the lifecycle `status` column on each accepted-entity family and on Program source
records; curator-authorized withdraw/reactivate; the active-dependent block; read-path
filtering for delivery, listings, and coverage-gap derivation; two-tier source-record
deletion; the material-content deletion tiers ADR-021 deferred; backup/restore of status. Out
of scope (per ADR-022 Non-Goals): per-revision lifecycle markers; hard deletion of revisions,
attempts, or evidence; program archival/deletion/ownership transfer; analytics or curator
visibility into student assessment results; any purge/retention policy for long-withdrawn
entities or unreferenced content.

## Accepted-entity families covered

The lifecycle status applies uniformly to the six accepted-entity families that each hold a
thin entity row with a `NOT NULL` `current_revision_id`, plus Program source records:

| Family | Entity table | Status route base |
|---|---|---|
| Quick check | `accepted_quick_check_entities` | `/quick-checks/{entityId}` |
| Open-answer check | `accepted_open_answer_check_entities` | `/open-answer-checks/{entityId}` |
| Assessment criterion | `accepted_assessment_criterion_entities` | `/assessment-criteria/{entityId}` |
| Readiness check | `accepted_readiness_check_entities` | `/readiness-checks/{entityId}` |
| Corpus (topic/concept/definition/principle/material reference) | `accepted_corpus_entities` | `/corpus/{entityId}` |
| Navigation relationship | `accepted_navigation_relationships` | `/navigation-relationships/{entityId}` |
| Program source record | `program_sources` | `/sources/{sourceId}` |

## Public interface

### Shared kinds

```ts
type LifecycleStatus = "active" | "withdrawn";

// Body for every lifecycle-status write (entity families and source records).
type SetLifecycleStatusInput = {
  status: LifecycleStatus;          // target status; setting current status is a no-op
};

// Redacted confirmation returned by every lifecycle-status write. Carries no content.
type LifecycleStatusResult = {
  id: string;                       // entity id or source id
  status: LifecycleStatus;
  updatedByIdentityId: string;
  updatedAt: string;                // ISO-8601
};
```

### Domain commands

Each accepted-entity family exposes a single status-transition command, and source records
add a hard-delete command, all attributable to the acting `Identity` and Program-scoped:

```ts
// Per family (quick check, open-answer check, criterion, readiness check, corpus,
// navigation relationship). entityId addresses the thin entity row.
setEntityLifecycleStatus(entityId: string, input: SetLifecycleStatusInput): LifecycleStatusResult

// Source records.
setSourceLifecycleStatus(sourceId: string, input: SetLifecycleStatusInput): LifecycleStatusResult
deleteSourceRecord(sourceId: string): { source: { id: string } } // hard delete, unreferenced only
```

### HTTP endpoints

| Method | Path | Auth | Accepted response |
|---|---|---|---|
| `PUT` | `<family base>/{entityId}/status` | Program Curator session and CSRF header | `AcceptedResult<{ entity: LifecycleStatusResult }>` |
| `PUT` | `/sources/{sourceId}/status` | Program Curator session and CSRF header | `AcceptedResult<{ source: LifecycleStatusResult }>` |
| `DELETE` | `/sources/{sourceId}` | Program Curator session and CSRF header | `AcceptedResult<{ source: { id: string } }>` |

`<family base>` is one of the six entity-family bases in the table above. The status routes
take `SetLifecycleStatusInput`. `DELETE /sources/{sourceId}` removes the whole source record
(metadata and `source_ids_json` provenance edges); the source raw content blob continues to
hard-delete independently through `DELETE /sources/{sourceId}/content`
([material content spec](material-content-storage.md)).

## Behavior rules

### Lifecycle status column

1. Each of the six accepted-entity families and the `program_sources` table carries a `status`
   column constrained by a database `check` to `active` or `withdrawn`, defaulting to `active`.
   Status is entity-level (source-record-level for sources), never per-revision; no revision
   table gains a status column.
2. The status migration sets `status = 'active'` for every existing accepted entity and source
   record, so the change is backward-compatible and no existing item leaves forward use.

### Authority

3. `PUT …/status` (entity and source) and `DELETE /sources/{sourceId}` require a valid session
   for an effective `Program Curator` of the entity's or source's Program and a valid
   `X-Agonara-CSRF` header. Non-curator participation is rejected with
   `admin_or_curator_required`; `Admin` is not the ordinary withdrawal or deletion path.
4. Every status change and source deletion is attributable to the acting `Identity` and scoped
   to the addressed item's Program — the same authority boundary as acceptance.

### Withdraw and reactivate

5. A status write to a value equal to the item's current status is an accepted no-op: it
   returns the item's current `LifecycleStatusResult` and never errors on "already in state."
   A no-op records the request as an attributable action (actor and timestamp), so the returned
   `updatedByIdentityId`/`updatedAt` reflect the most recent write.
6. Withdrawing (`active → withdrawn`) MUST NOT delete, rewrite, or make unaddressable any
   accepted revision, student attempt, evaluation, feedback, evidence, mastery state, weak-area
   summary, or learning history. All revisions of a withdrawn entity remain addressable.
7. Reactivating (`withdrawn → active`) restores the entity to `active` with its
   `current_revision_id` unchanged. Reactivation never creates, repoints, or deletes a
   revision; later structural change goes through normal replacement acceptance after
   reactivation.
8. An addressed entity or source that does not exist is rejected with the family's existing
   not-found reason (e.g. `quick_check_entity_not_found`, `criterion_entity_not_found`,
   `navigation_entity_not_found`, `source_not_found`); a malformed body or a `status` outside
   `{active, withdrawn}` is rejected with `validation_failed`.

### Active-dependent block (no cascade)

9. Withdrawing an entity that is referenced by an **active** dependent MUST be rejected with
   `entity_withdrawal_blocked`; the curator must withdraw or repoint the active dependents
   first. Withdrawal MUST NOT cascade to dependents. A reference is resolved at the entity
   level: a dependent that pins a specific revision is treated as referencing that revision's
   owning entity. Active dependents are:
   - an `active` accepted readiness check whose current revision's requirements target the
     entity — readiness requirements may target accepted topic, concept, material-reference,
     quick-check, open-answer-check, or assessment-criterion entities
     ([readiness spec](topic-period-readiness-checks.md) rule 7);
   - an `active` accepted open-answer check whose current revision lists, in
     `criterion_revision_ids`, a revision of the criterion entity being withdrawn;
   - an `active` `learner_evidence_target_links` row whose `evidence_owner_entity_id` is the
     entity;
   - an `active` accepted navigation relationship whose `from_entity_id` or `to_entity_id` is
     the corpus entity being withdrawn.
10. A `withdrawn` dependent does not block withdrawal. Reactivation has no dependent
    precondition — an entity may be reactivated regardless of its dependents' statuses.

### Read-path filtering

11. Student delivery, student listings, and curator listings of accepted entities filter on
    `status = 'active'`; withdrawn entities are excluded from these read paths. The
    partial-unique-index pattern of `one_active_learner_evidence_target_link` is the model for
    any uniqueness that must hold only over active rows.
12. Curator coverage-gap derivation treats withdrawn entities as absent: a withdrawn entity
    contributes neither coverage nor a satisfied gap, exactly as if it had never been accepted,
    while withdrawn sources are excluded from active source listings.
13. Reads that serve historical revisions (e.g. a past attempt's question, a stored evaluation,
    an addressed `…/revisions/{revisionId}` read) MUST continue to resolve a withdrawn entity's
    revisions. Withdrawal changes forward use only, never historical addressability.
14. A withdrawn entity and a withdrawn source remain visible to the `Program Curator` for
    reactivation through a curator-facing surface that does not filter on `status`; the curator
    can see what was withdrawn in order to reverse it.

### Two-tier source deletion

15. `DELETE /sources/{sourceId}` hard-deletes a source record (its `program_sources` row,
    metadata, and `source_ids_json` provenance edges) **only when no accepted corpus references
    it**. A source is referenced when any accepted corpus revision's `source_ids_json` includes
    the `sourceId` (regardless of that corpus entity's own status). An unreferenced source is
    hard-deleted; a referenced source is rejected with `source_hard_delete_blocked` and may be
    retired only by withdrawing it via `PUT /sources/{sourceId}/status`.
16. Hard deletion of a source record MUST NOT delete or invalidate any accepted material
    content, accepted revision, student attempt, evaluation, evidence, or learner state. Source
    raw content blobs hard-delete independently per ADR-021 and are not a precondition for
    source-record deletion.
17. Source withdrawal (`active → withdrawn`) follows rules 5–7 and 11–14: a withdrawn source
    leaves active source listings while its provenance edges stay resolvable for any corpus
    that references it.

### Material-content deletion tiers (completing ADR-021)

18. Unevidenced accepted material content hard-deletes with its entity or revision; accepted
    material content for a revision referenced by student evidence is never hard-erased and is
    retired only by withdrawing the entity. Withdrawing a material entity leaves its accepted
    content byte-identical and addressable for historical reads (consistent with
    [material content spec](material-content-storage.md) rules 9–11).

### Backup and restore

19. Backup MUST preserve the `status` of every accepted entity and source record, including
    withdrawn items and their revisions and provenance edges.
20. Restore MUST accept `active` and `withdrawn` status and MUST, before mutation, reject a
    backup when any status is outside `{active, withdrawn}`, when a withdrawn entity's
    `current_revision_id` or any of its revisions does not resolve, or when a withdrawn source's
    provenance edges do not resolve. Restore MUST still resolve every revision and provenance
    edge of a withdrawn entity or source.

### Rejection vocabulary

21. This spec adds `entity_withdrawal_blocked` and `source_hard_delete_blocked` to the shared
    rejection vocabulary and reuses existing `admin_or_curator_required`, `validation_failed`,
    `source_not_found`, and the per-family `*_not_found` reasons. It changes no existing
    rejection reason.

## Product intent traceability

22. Add a curator story: a `Program Curator` withdraws an accepted item or material loaded in
    error so it leaves student delivery and curator coverage, and reactivates it later if the
    withdrawal was a mistake — without ever losing the student history attached to it.
23. Add a curator story: a `Program Curator` deletes a stray or test source that nothing has
    been accepted from, and for a source that has been used, withdraws it instead of deleting
    it, so accepted corpus keeps resolving its provenance.
24. These stories operationalize ADR-022 and do not redefine the acceptance authority boundary
    established by ADR-010; they extend the curator workspace, not student-facing behavior.

## Tests (required)

### Storage tests

1. Storage migration adds a `status` column constrained to `{active, withdrawn}` defaulting to
   `active` on each of the six entity families and `program_sources`, and backfills existing
   rows to `active`.
2. Storage test rejects an out-of-vocabulary `status` via the `check` constraint on an entity
   table and on `program_sources`.

### Domain tests

3. Domain test withdraws an `active` entity, proves it is excluded from active listings, and
   proves every revision (and any attempt/evaluation/evidence referencing it) still resolves
   byte-identical.
4. Domain test reactivates a `withdrawn` entity and proves `current_revision_id` is unchanged
   and the entity returns to active listings.
5. Domain test proves a status write equal to the current status is an accepted no-op (both
   `active→active` and `withdrawn→withdrawn`) and never errors.
6. Domain test rejects withdrawal with `entity_withdrawal_blocked` for each active-dependent
   case in rule 9: a corpus entity targeted by an active readiness requirement; a criterion
   entity withdrawn while an active open-answer check pins one of its criterion revisions
   (proving revision→owning-entity resolution); a check/criterion entity referenced by an
   active learner-evidence target link; and a corpus entity referenced by an active navigation
   relationship. Each case proves no dependent was mutated (no cascade), then proves withdrawal
   succeeds once the dependent is withdrawn or repointed.
7. Domain test proves a withdrawn dependent does not block withdrawal and that reactivation has
   no dependent precondition.
8. Domain test hard-deletes an unreferenced source record and rejects hard deletion of a
   referenced source with `source_hard_delete_blocked`, then withdraws the referenced source
   and proves its provenance edges still resolve for the referencing corpus.
9. Domain test proves source-record hard deletion leaves accepted material content, accepted
   revisions, and student-referenced records intact.

### Coverage / delivery tests

10. Derivation test proves a withdrawn accepted entity contributes neither coverage nor a
    satisfied coverage gap (treated as absent), and that reactivation restores its coverage
    contribution.

### HTTP tests

11. HTTP test verifies `PUT <family base>/{entityId}/status` and `PUT /sources/{sourceId}/status`
    require effective Program Curator participation and CSRF, reject Student/non-curator
    participation with `admin_or_curator_required`, and return a `LifecycleStatusResult`
    carrying no content bytes.
12. HTTP test verifies `PUT …/status` rejects a body whose `status` is outside
    `{active, withdrawn}` with `validation_failed` and a missing entity/source with the
    family's not-found reason.
13. HTTP test verifies `DELETE /sources/{sourceId}` hard-deletes an unreferenced source under
    curator+CSRF, rejects a referenced source with `source_hard_delete_blocked`, and rejects
    non-curator participation with `admin_or_curator_required`.
14. HTTP test verifies a student delivery/listing read omits withdrawn entities while a
    historical revision read (`…/revisions/{revisionId}`) still resolves a withdrawn entity's
    revision.
15. HTTP test verifies the `LifecycleStatusResult` projection exposes only `id`, `status`,
    `updatedByIdentityId`, and `updatedAt`, leaking no content, source ids, rationale,
    candidate ids, session ids, CSRF tokens, SQL text, stack traces, or infrastructure details.

### Backup/restore tests

16. Backup/restore test round-trips entity and source `status` (including withdrawn items) and
    proves a withdrawn entity's revisions and a withdrawn source's provenance edges still
    resolve after restore.
17. Backup/restore test rejects, before mutation, a backup with an out-of-vocabulary status, a
    withdrawn entity whose `current_revision_id`/revisions do not resolve, and a withdrawn
    source whose provenance edges do not resolve.

## Done criteria

- Each of the six accepted-entity families and `program_sources` carries an entity-level
  `active`/`withdrawn` status with a `check` constraint and an `active` default, backfilled for
  existing rows.
- Effective Program Curators withdraw and reactivate entities and sources, and hard-delete only
  unreferenced source records, all attributable and Program-scoped, with `Admin` not the
  ordinary path.
- Withdrawal preserves every revision, attempt, evaluation, evidence, and learner state;
  reactivation restores `current_revision_id` unchanged; withdrawal of an active-referenced
  entity is blocked with `entity_withdrawal_blocked` and never cascades.
- Student delivery, listings, and curator coverage-gap derivation filter on `status = 'active'`
  while historical revision reads still resolve withdrawn entities; withdrawn items stay visible
  to the curator for reactivation.
- Referenced sources are withdraw-only (`source_hard_delete_blocked`); unreferenced sources
  hard-delete without touching accepted content, revisions, or student-referenced records;
  ADR-021's material-content deletion tiers are completed.
- Backup and restore preserve status and reject malformed or unresolvable withdrawn graphs
  before mutation.
- Product Intent carries the new curator withdraw/reactivate and source-deletion stories.
- Agonara tests, root build, docs checks, and `git diff --check` pass after implementation.

## Implementation status

Implemented by the [Accepted Entity Withdrawal and Source Deletion Implementation
Plan](../plans/implemented/accepted-entity-withdrawal-and-source-deletion.md).

Runtime evidence:

- [Lifecycle storage, migration, backup, and restore validation](../../src/storage.js)
- [Accepted check lifecycle and coverage filtering](../../src/curator-workspace.js)
- [Corpus, navigation, source, and material deletion tiers](../../src/corpus.js)
- [Student delivery and listing filters](../../src/student-workspace.js)
- [HTTP lifecycle routes](../../src/server.js) and [OpenAPI contract](../api/openapi.yml)
- [`/learn` curator lifecycle and source controls](../../src/learn-ui.js)

Verification evidence:

- [Storage tests](../../tests/storage.test.js) and [backup/restore tests](../../tests/backup-restore.test.js)
- [Curator Workspace tests](../../tests/curator-workspace.test.js)
- [Corpus tests](../../tests/corpus.test.js)
- [Student Workspace tests](../../tests/student-workspace.test.js)
- [http-api-lifecycle-status.test.js](../../tests/http-api-lifecycle-status.test.js), [http-api-corpus-sources.test.js](../../tests/http-api-corpus-sources.test.js), [http-api-corpus-accepted.test.js](../../tests/http-api-corpus-accepted.test.js), [http-api-assessment-criteria.test.js](../../tests/http-api-assessment-criteria.test.js), [http-api-open-answer-checks.test.js](../../tests/http-api-open-answer-checks.test.js), [http-api-quick-check-delivery.test.js](../../tests/http-api-quick-check-delivery.test.js), [http-api-readiness-checks.test.js](../../tests/http-api-readiness-checks.test.js), [http-api-navigation.test.js](../../tests/http-api-navigation.test.js) and [OpenAPI contract tests](../../tests/openapi-contract.test.js)
- [Quick Check lifecycle browser tests](../../tests/quick-check-product-ui.playwright.js)
- [Navigation and source lifecycle browser tests](../../tests/topic-concept-material-navigation.playwright.js)
