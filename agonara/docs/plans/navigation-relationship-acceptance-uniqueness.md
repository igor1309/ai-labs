---
date: 2026-06-28
model: claude-opus-4-8
description: "Implementation plan for navigation-relationship acceptance uniqueness (ADR-023, spec navigation-relationship-acceptance-uniqueness)."
status: planned
type: implementation-plan
---

# Navigation-Relationship Acceptance Uniqueness Implementation Plan

## Goal

Implement [Navigation-Relationship Acceptance Uniqueness](../specs/navigation-relationship-acceptance-uniqueness.md)
under [ADR-023](../adr/adr-023-navigation-relationship-acceptance-uniqueness.md) so an accepted
navigation relationship is unique per directed `(program_id, relationship_kind, from_entity_id,
to_entity_id)` among **active** rows: duplicate acceptance and colliding reactivation are rejected
with `navigation_relationship_already_accepted`, the invariant is enforced at the storage layer
across acceptance, `relationship_update`, reactivation, and restore, and the active-scoped
constraint is introduced non-destructively after pre-existing duplicates are withdrawn.

## Dependency gate

This task is **sequenced after** the [accepted-entity withdrawal plan](accepted-entity-withdrawal-and-source-deletion.md)
([ADR-022](../adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md)). Do **not** start
Phase 1 until that plan is implemented and merged — specifically until
`accepted_navigation_relationships` carries the `active`/`withdrawn` `status` column and the
navigation-relationship withdraw/reactivate command (`PUT /navigation-relationships/{entityId}/status`)
and restore graph validation exist. Preflight MUST confirm the `status` column is present before
any RED test is written.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, unmet dependency gate, explicit user interruption
Push policy: push at closeout

## Execution lock

Worktree mode: none
Expected worktree: not applicable (`Worktree mode: none`; work in the primary checkout at `/home/user/ai-labs`)
Expected branch: `claude/curator-api-relationship-removal-7ppw99`
Preflight check: [ ] done

## Scope guardrails

- Implement only the ADR-023 uniqueness spec. Do **not** add reverse-direction / symmetric-kind
  canonicalization, uniqueness for non-navigation accepted-entity families, removal/withdrawal of
  already-accepted duplicates beyond the dedup-first introduction step, or any change to acceptance
  authority, endpoint-kind, self-reference, or prerequisite-cycle validation (ADR-023 Non-Goals).
- Uniqueness is **scoped to `status = 'active'`**; withdrawn relationships are never subject to it
  and never block acceptance or reactivation.
- The invariant is enforced at the **storage layer** so it binds every writer (acceptance,
  `relationship_update`, reactivation, restore); the acceptance and reactivation paths MUST surface
  the graceful `navigation_relationship_already_accepted` reason, never a raw constraint error.
- Reactivation gains a navigation-relationship-only precondition that narrows ADR-022 spec rule 10;
  do not change withdrawal or same-status no-op semantics from the ADR-022 spec.
- Introducing the constraint MUST be non-destructive and dedup-first: reduce pre-existing active
  duplicates to one active relationship per tuple by withdrawing the extras (preserving withdrawn
  rows and revisions), then establish the active-scoped uniqueness constraint. The reduction MUST be
  deterministic and idempotent. Agonara has **no migration framework** (schema is `create table if
  not exists` plus idempotent startup `pragma table_info` + `alter table` steps), so the dedup and
  the index are added as one ordered idempotent startup step, not a migration.
- Do not change any existing rejection reason or request/response shape; the only contract addition
  is `navigation_relationship_already_accepted`.
- Do not start implementation until this plan passes adversarial review and is committed, and the
  dependency gate above is satisfied.
- Do not commit any phase until targeted tests, full Agonara tests, root build, `git diff --check`,
  and post-implementation self/adversarial review are clean.

## Exact implementation inventory

Expected files:

- `agonara/src/storage.js` — (1) an ordered idempotent startup step that, before creating the
  index, **withdraws** all but one active relationship per duplicate `(program_id,
  relationship_kind, from_entity_id, to_entity_id)` tuple (deterministic ordering, e.g. keep the
  lowest `id`; uses the ADR-022 `status` column and attribution), then creates
  `create unique index if not exists one_active_navigation_relationship on
  accepted_navigation_relationships (program_id, relationship_kind, from_entity_id, to_entity_id)
  where status = 'active'` (mirroring the existing `one_active_learner_evidence_target_link`
  pattern); (2) a pre-insert duplicate check in `createAcceptedNavigationRelationshipRecord` raising
  a `StorageInvariantError` for an existing active tuple; (3) restore graph validation extended to
  reject a backup with two active relationships sharing a tuple.
- `agonara/src/corpus.js` — map the storage duplicate invariant to
  `navigation_relationship_already_accepted` on the `acceptNavigationCandidate` path (via
  `mapNavigationStorageRejection`), covering the `relationship_update` candidate kind; add the
  active-duplicate precondition (pre-check + reason mapping) on the navigation-relationship
  reactivation path within the ADR-022 `setEntityLifecycleStatus` handling for
  `accepted_navigation_relationships`.
- `agonara/src/http-contract.js` — add `navigation_relationship_already_accepted` to the
  `ApiRejectionReason` enum (next to the existing `navigation_relationship_*` reasons).
- `agonara/src/openapi-generator.js` — regenerate the OpenAPI surface for the new reason.
- `agonara/tests/storage.test.js` — active-scoped uniqueness constraint (rejects active duplicate,
  permits withdrawn tuple); dedup-first idempotent introduction on a pre-seeded duplicate database.
- `agonara/tests/corpus.test.js`, `agonara/tests/corpus-executable-acceptance.test.js` — acceptance
  duplicate rejection with atomic rollback; `relationship_update` duplicate rejection; withdrawn
  tuple re-acceptance; reactivation collision rejection then success after withdrawal.
- `agonara/tests/http-api.test.js`, `agonara/tests/executable-acceptance.test.js` — acceptance and
  reactivation routes surface `navigation_relationship_already_accepted` under curator + CSRF with
  no partial accepted corpus.
- `agonara/tests/openapi-contract.test.js` — OpenAPI enumerates the new reason.
- `agonara/tests/backup-restore.test.js` — restore rejects an active-duplicate-bearing backup;
  active + withdrawn for the same tuple restores cleanly.
- `agonara/docs/specs/navigation-relationship-acceptance-uniqueness.md` — update status to
  `implemented` with implementation/verification links at closeout.
- `agonara/docs/intent/curator_user_stories.md`, `agonara/docs/intent/intent_learning_program_app.md`
  — add the duplicate-prevention curator story and code/test traceability at closeout.
- `agonara/backlog/README.md` — close the "Navigation-relationship acceptance uniqueness — spec +
  implementation" forward task.
- `agonara/README.md` — reflect the capability in the snapshot if listed.
- `agonara/docs/log.md` — record each completed phase outcome.
- `agonara/docs/plans/implemented/navigation-relationship-acceptance-uniqueness.md` — archived plan
  after completion.
- `docs/loc-dashboard.html` — refresh at final closeout.

HTTP routes (no new routes; behavior added to existing):

- `POST /navigation-candidates/{candidateId}/acceptance` — rejects duplicate with the new reason.
- `PUT /navigation-relationships/{entityId}/status` — rejects colliding reactivation with the new reason.

Targeted commands:

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "uniqueness storage" node --test --test-name-pattern "uniqueness|duplicate|dedup|already_accepted" agonara/tests/storage.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "uniqueness corpus domain" node --test --test-name-pattern "duplicate|already_accepted|reactivat|relationship_update" agonara/tests/corpus.test.js agonara/tests/corpus-executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "uniqueness http" node --test --test-name-pattern "duplicate|already_accepted|reactivat" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js agonara/tests/openapi-contract.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "uniqueness backup restore" node --test --test-name-pattern "duplicate|uniqueness" agonara/tests/backup-restore.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git diff --check`

## Phase tracker

- [ ] Phase 1 — Active-Scoped Uniqueness Constraint, Dedup-First Introduction, Storage Guard, and Restore Validation
- [ ] Phase 2 — Acceptance and Reactivation Rejection Mapping (incl. `relationship_update`) and OpenAPI Reason
- [ ] Phase 3 — Docs, Product Intent, Traceability, Dashboard, Archive

Update tracker checkboxes only after the phase's required verification passes and the phase commit is created.

## ADR traceability matrix

| ADR / spec invariant | Phase |
|---|---|
| ADR-023 #1 / spec rule 1: directed tuple unique among `status = active` rows, per Program; withdrawn never blocks. | Phase 1 |
| ADR-023 #3 / spec rule 7: enforced at the storage layer across every writer (partial index + pre-insert check). | Phase 1, Phase 2 |
| ADR-023 #6 / spec rule 9: non-destructive, dedup-first, deterministic and idempotent introduction. | Phase 1 |
| ADR-023 / spec rule 8: restore rejects active-duplicate-bearing backups before mutation. | Phase 1 |
| ADR-023 #2 / spec rules 2–3: duplicate acceptance rejected with `navigation_relationship_already_accepted`, atomic rollback. | Phase 2 |
| ADR-023 / spec rule 2: `relationship_update` candidate kind covered identically. | Phase 2 |
| ADR-023 #5 / spec rules 4–6: withdrawn tuple re-acceptable; reactivation guarded (narrows ADR-022 rule 10). | Phase 2 |
| ADR-023 / spec rule on interface: `navigation_relationship_already_accepted` added to `ApiRejectionReason` and OpenAPI. | Phase 2 |
| ADR-023 #4 / spec Non-Goals: directed tuple only; no symmetric-kind canonicalization. | Phase 1, Phase 2 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| New CUR story — a curator who accepts a relationship identical to an accepted one is told it already exists rather than silently creating a duplicate | Phase 2, Phase 3 |
| Existing acceptance authority boundary (ADR-010) and ADR-022 withdrawal/reactivation semantics preserved, only narrowed for navigation uniqueness | Phase 1, Phase 2 |

## Phase 1 — Active-Scoped Uniqueness Constraint, Dedup-First Introduction, Storage Guard, and Restore Validation

**Objective**: enforce, at the storage layer, that the directed tuple is unique among active
navigation relationships; introduce the constraint non-destructively on databases that already hold
active duplicates; and reject active-duplicate-bearing backups before mutation.

**Key work items**:

- Add RED storage tests: the active-scoped uniqueness constraint rejects a second active
  relationship for a tuple and permits the tuple when the existing relationship is withdrawn;
  introducing the constraint on a database pre-seeded with two active duplicates reduces them to one
  active (withdrawing the extra, which stays resolvable) and then succeeds, and re-running the
  introduction is a no-op.
- Add RED backup/restore tests: restore rejects, before mutation, a backup with two active
  relationships sharing a tuple; a backup with one active and one withdrawn for the same tuple
  restores cleanly.
- Implement, in `agonara/src/storage.js`: the ordered idempotent startup step (dedup-by-withdrawal,
  then `create unique index if not exists … where status = 'active'`), the pre-insert duplicate
  check in `createAcceptedNavigationRelationshipRecord`, and the restore active-duplicate validation.

**Dependencies**: the dependency gate is satisfied (ADR-022 `status` column on
`accepted_navigation_relationships` and restore validation exist); this plan is committed and
reviewed clean.

**Risks**: the index is created before dedup and throws on an existing duplicate-bearing database;
the dedup is non-deterministic and withdraws an unpredictable edge; the constraint is created
non-partial and wrongly blocks a withdrawn tuple; restore validation misses an active duplicate.

**Validation**: targeted uniqueness-storage and backup/restore commands; full Agonara tests; root
build; `git diff --check`; post-implementation self + adversarial review against the active-scoped
constraint, dedup idempotency, and restore validation; fix every fail or warning and rerun affected
gates.

**Completion signal**: active navigation-relationship tuples are unique by construction, the
constraint introduces cleanly on duplicate-bearing databases, and restore rejects active-duplicate
backups before mutation.

**Commit**: commit after green validation and clean reviews with a short imperative message.

## Phase 2 — Acceptance and Reactivation Rejection Mapping (incl. `relationship_update`) and OpenAPI Reason

**Objective**: surface the storage invariant as `navigation_relationship_already_accepted` on the
acceptance path (all relationship-originating candidate kinds, including `relationship_update`) and
on the navigation-relationship reactivation path, and add the reason to the contract and OpenAPI.

**Key work items**:

- Add RED domain tests: `acceptNavigationCandidate` rejects a duplicate with
  `navigation_relationship_already_accepted`, leaves the original edge intact, and writes nothing
  (atomic rollback); the `relationship_update` candidate kind is rejected identically; a tuple whose
  only existing relationship is withdrawn is accepted, producing a new active relationship.
- Add RED domain tests: reactivating a withdrawn relationship is rejected when an active duplicate
  exists, and succeeds once the colliding active edge is withdrawn.
- Add RED HTTP/OpenAPI tests: `POST /navigation-candidates/{candidateId}/acceptance` and
  `PUT /navigation-relationships/{entityId}/status` surface the new reason under curator + CSRF with
  no partial accepted corpus; the OpenAPI contract enumerates `navigation_relationship_already_accepted`.
- Implement the reason mapping in `agonara/src/corpus.js` (acceptance via
  `mapNavigationStorageRejection`; reactivation pre-check/mapping in the ADR-022
  navigation-relationship `setEntityLifecycleStatus` path), add the reason in
  `agonara/src/http-contract.js`, and regenerate OpenAPI.

**Dependencies**: Phase 1 complete.

**Risks**: a raw constraint error leaks instead of the graceful reason; the `relationship_update`
path is missed; the reactivation pre-check races the index and surfaces a 500; OpenAPI drifts from
`http-contract.js`.

**Validation**: targeted uniqueness corpus-domain and http commands (incl. OpenAPI contract); full
Agonara tests; root build; `git diff --check`; post-implementation self + adversarial review against
reason mapping across all paths and OpenAPI fidelity; fix every fail or warning and rerun affected
gates.

**Completion signal**: every duplicate acceptance and colliding reactivation surfaces
`navigation_relationship_already_accepted`, atomically, and the OpenAPI surface matches.

**Commit**: commit after green validation and clean reviews with a short imperative message.

## Phase 3 — Docs, Product Intent, Traceability, Dashboard, Archive

**Objective**: land the required doc changes and close out traceability.

**Key work items**:

- Add the duplicate-prevention curator story in `agonara/docs/intent/curator_user_stories.md`; add
  code/test traceability in `intent_learning_program_app.md`.
- Update `navigation-relationship-acceptance-uniqueness.md` to `status: implemented` with
  implementation/verification links.
- Close the "Navigation-relationship acceptance uniqueness — spec + implementation" task in
  `backlog/README.md`, refresh the `README.md` snapshot if listed, refresh `docs/loc-dashboard.html`,
  and record outcomes in `docs/log.md`.
- Move this plan to `docs/plans/implemented/navigation-relationship-acceptance-uniqueness.md`.

**Dependencies**: Phases 1–2 complete and verified.

**Risks**: stale spec status or intent traceability; backlog task left open; dashboard not refreshed.

**Validation**: full Agonara tests; root build; docs link/front-matter/single-H1 checks;
`git diff --check`; final self + adversarial review of the doc set.

**Completion signal**: docs, intent, traceability, dashboard, and archive reflect the implemented
uniqueness capability.

**Commit**: commit the closeout with a short imperative message.

## Done criteria

- Active navigation-relationship tuples are unique per Program, enforced at the storage layer across
  acceptance, `relationship_update`, reactivation, and restore.
- Duplicate acceptance and colliding reactivation are rejected with
  `navigation_relationship_already_accepted`; the original edge is untouched and acceptance is atomic.
- A withdrawn tuple is re-acceptable; the constraint is scoped to active rows only.
- The constraint introduces non-destructively and dedup-first on duplicate-bearing databases;
  restore rejects active-duplicate backups before mutation.
- The new reason appears in the OpenAPI surface; no other reason or request/response shape changes.
- Agonara tests, root build, docs checks, and `git diff --check` pass; the plan is archived.

## Final closeout

Final gates: all phase tracker boxes checked with their phase commits; spec marked implemented;
intent traceability updated; backlog task closed; dashboard refreshed; full Agonara tests, root
build, docs link/front-matter/single-H1 checks, and `git diff --check` pass; final self +
adversarial review of the doc set is clean.
Archive plan: move to `agonara/docs/plans/implemented/navigation-relationship-acceptance-uniqueness.md`.
Commit archive move: yes.
Push/PR: follow push policy; open a single PR for the task.
