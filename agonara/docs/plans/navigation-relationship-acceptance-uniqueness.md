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
to_entity_id)` among **active** rows: new active duplicates are prevented unconditionally by
application guards (the create-path duplicate check covering acceptance and `relationship_update`,
the reactivation guard, and restore validation), all surfacing
`navigation_relationship_already_accepted`; and a partial-unique index is added as a database
backstop via a guarded startup step that skips-with-diagnostic until a curator has cleaned the
pre-existing duplicates — never auto-withdrawing or deleting accepted rows.

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
  canonicalization, uniqueness for non-navigation accepted-entity families, any automated
  removal/withdrawal of already-accepted duplicates, or any change to acceptance authority,
  endpoint-kind, self-reference, or prerequisite-cycle validation (ADR-023 Non-Goals).
- Uniqueness is **scoped to `status = 'active'`**; withdrawn relationships are never subject to it
  and never block acceptance or reactivation.
- **Prevention of new duplicates is the primary mechanism and is unconditional**: application guards
  at the single create path (`createAcceptedNavigationRelationshipRecord`, covering acceptance and
  `relationship_update`), the reactivation path, and restore validation, each surfacing the graceful
  `navigation_relationship_already_accepted` reason (restore surfaces a restore-validation
  rejection), never a raw constraint error. These guards MUST NOT depend on the backstop index
  existing.
- Reactivation gains a navigation-relationship-only precondition that narrows ADR-022 spec rule 10;
  do not change withdrawal or same-status no-op semantics from the ADR-022 spec.
- The partial-unique index is a **backstop**, not the prevention mechanism. It MUST be created by a
  guarded idempotent startup step (`create unique index if not exists … where status = 'active'`)
  that first checks for active duplicates and, if any remain, **skips creation, emits a diagnostic**
  naming the offending tuples, and does NOT throw. The step MUST NOT auto-withdraw, hard-delete, or
  otherwise mutate accepted rows to force the index — that would be an un-attributed status change
  violating ADR-022 spec rule 4. Pre-existing active duplicates are cleaned only by an attributable
  `Program Curator` withdrawal through the ADR-022 API; the index materializes on the next startup
  once the data is clean. Agonara has **no migration framework** (schema is `create table if not
  exists` plus idempotent startup `pragma table_info` + `alter table` steps), so this is a startup
  step, not a migration.
- Do not change any existing rejection reason or request/response shape; the only contract addition
  is `navigation_relationship_already_accepted`.
- Do not start implementation until this plan passes adversarial review and is committed, and the
  dependency gate above is satisfied.
- Do not commit any phase until targeted tests, full Agonara tests, root build, `git diff --check`,
  and post-implementation self/adversarial review are clean.

## Exact implementation inventory

Expected files:

- `agonara/src/storage.js` — (1) a pre-insert duplicate check in
  `createAcceptedNavigationRelationshipRecord` raising a `StorageInvariantError` for an existing
  active tuple (the primary, index-independent guard); (2) restore graph validation extended to
  reject a backup with two active relationships sharing a tuple; (3) a **guarded** idempotent
  startup step — a conditional JS step run *after/outside* the static schema DDL block (the existing
  `one_active_*` partial indexes are static DDL and cannot be guarded in place, so the navigation
  index MUST NOT be added to that block) — that checks for active duplicate `(program_id,
  relationship_kind, from_entity_id, to_entity_id)` tuples and, only when none remain, runs `create
  unique index if not exists one_active_navigation_relationship on accepted_navigation_relationships
  (program_id, relationship_kind, from_entity_id, to_entity_id) where status = 'active'`; when
  duplicates remain it surfaces a diagnostic naming the tuples and skips, never throwing and never
  mutating rows. `storage.js` has no logging/diagnostic seam today, so the step also needs one (a log
  line, a structured warning return, or equivalent) — the mechanism is an implementation choice but
  the diagnostic MUST be operator-observable.
- `agonara/src/corpus.js` — map the storage duplicate invariant to
  `navigation_relationship_already_accepted` on the `acceptNavigationCandidate` path (via
  `mapNavigationStorageRejection`), covering the `relationship_update` candidate kind; add the
  active-duplicate precondition (pre-check + reason mapping) on the navigation-relationship
  reactivation path within the ADR-022 `setEntityLifecycleStatus` handling for
  `accepted_navigation_relationships`.
- `agonara/src/http-contract.js` — add `navigation_relationship_already_accepted` to the
  `ApiRejectionReason` enum (next to the existing `navigation_relationship_*` reasons).
- `agonara/src/openapi-generator.js` — regenerate the OpenAPI surface for the new reason.
- `agonara/tests/storage.test.js` — create-path guard rejects an active duplicate and permits a
  withdrawn tuple (index-independent); the guarded startup step skips-with-diagnostic and mutates no
  row on a pre-seeded duplicate database, then creates the index after the extra is withdrawn
  (idempotent).
- `agonara/tests/corpus.test.js`, `agonara/tests/corpus-executable-acceptance.test.js` — acceptance
  duplicate rejection with atomic rollback; `relationship_update` duplicate rejection; withdrawn
  tuple re-acceptance; reactivation collision rejection then success after withdrawal.
- `agonara/tests/http-api-navigation.test.js`, `agonara/tests/executable-acceptance-corpus-navigation.test.js` — acceptance and
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

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "uniqueness storage" node --test --test-name-pattern "uniqueness|duplicate|backstop|already_accepted" agonara/tests/storage.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "uniqueness corpus domain" node --test --test-name-pattern "duplicate|already_accepted|reactivat|relationship_update" agonara/tests/corpus.test.js agonara/tests/corpus-executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "uniqueness http" node --test --test-name-pattern "duplicate|already_accepted|reactivat" agonara/tests/http-api-navigation.test.js agonara/tests/executable-acceptance-corpus-navigation.test.js agonara/tests/openapi-contract.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "uniqueness backup restore" node --test --test-name-pattern "duplicate|uniqueness" agonara/tests/backup-restore.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git diff --check`

## Phase tracker

- [ ] Phase 1 — Application Guards (Create-Path Check, Reactivation, Restore Validation), Reason Mapping, and OpenAPI
- [ ] Phase 2 — Guarded Backstop Index Startup Step
- [ ] Phase 3 — Docs, Product Intent, Traceability, Dashboard, Archive

Update tracker checkboxes only after the phase's required verification passes and the phase commit is created.

## ADR traceability matrix

| ADR / spec invariant | Phase |
|---|---|
| ADR-023 #1 / spec rule 1: directed tuple unique among `status = active` rows, per Program; withdrawn never blocks. | Phase 1, Phase 2 |
| ADR-023 #3 / spec rule 7: prevention is the application guards, index-independent; index is a backstop. | Phase 1 |
| ADR-023 #2 / spec rules 2–3: duplicate acceptance rejected with `navigation_relationship_already_accepted`, atomic rollback. | Phase 1 |
| ADR-023 / spec rule 2: `relationship_update` candidate kind covered identically. | Phase 1 |
| ADR-023 #5 / spec rules 4–6: withdrawn tuple re-acceptable; reactivation guarded (narrows ADR-022 rule 10). | Phase 1 |
| ADR-023 / spec rule 8: restore rejects active-duplicate-bearing backups before mutation. | Phase 1 |
| ADR-023 / spec rule on interface: `navigation_relationship_already_accepted` added to `ApiRejectionReason` and OpenAPI. | Phase 1 |
| ADR-023 #6 / spec rule 9: guarded backstop index, skip-with-diagnostic, no auto-mutation (ADR-022 rule 4 preserved). | Phase 2 |
| ADR-023 #4 / spec Non-Goals: directed tuple only; no symmetric-kind canonicalization. | Phase 1, Phase 2 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| New CUR story — a curator who accepts a relationship identical to an accepted one is told it already exists rather than silently creating a duplicate | Phase 1, Phase 3 |
| Existing acceptance authority boundary (ADR-010) and ADR-022 withdrawal/reactivation semantics preserved, only narrowed for navigation uniqueness | Phase 1, Phase 2 |

## Phase 1 — Application Guards (Create-Path Check, Reactivation, Restore Validation), Reason Mapping, and OpenAPI

**Objective**: prevent every new active duplicate unconditionally and index-independently — the
duplicate check in `createAcceptedNavigationRelationshipRecord` (covering acceptance and
`relationship_update`), the reactivation guard, and restore validation — surfacing
`navigation_relationship_already_accepted`, with the reason added to the contract and OpenAPI.

**Key work items**:

- Add RED storage tests: the create-path guard rejects a second active relationship for a tuple and
  permits the tuple when the existing relationship is withdrawn, with no index present (the guard is
  index-independent).
- Add RED domain tests: `acceptNavigationCandidate` rejects a duplicate with
  `navigation_relationship_already_accepted`, leaves the original edge intact, and writes nothing
  (atomic rollback); the `relationship_update` candidate kind is rejected identically; a tuple whose
  only existing relationship is withdrawn is accepted, producing a new active relationship.
- Add RED domain tests: reactivating a withdrawn relationship is rejected when an active duplicate
  exists, and succeeds once the colliding active edge is withdrawn.
- Add RED backup/restore tests: restore rejects, before mutation, a backup with two active
  relationships sharing a tuple; a backup with one active and one withdrawn for the same tuple
  restores cleanly.
- Add RED HTTP/OpenAPI tests: `POST /navigation-candidates/{candidateId}/acceptance` and
  `PUT /navigation-relationships/{entityId}/status` surface the new reason under curator + CSRF with
  no partial accepted corpus; the OpenAPI contract enumerates `navigation_relationship_already_accepted`.
- Implement: the pre-insert duplicate check and restore active-duplicate validation in
  `agonara/src/storage.js`; the reason mapping in `agonara/src/corpus.js` (acceptance via
  `mapNavigationStorageRejection`; reactivation pre-check/mapping in the ADR-022
  navigation-relationship `setEntityLifecycleStatus` path); the reason in
  `agonara/src/http-contract.js`; regenerate OpenAPI.

**Dependencies**: the dependency gate is satisfied (ADR-022 `status` column on
`accepted_navigation_relationships`, the navigation reactivate command, and restore validation
exist); this plan is committed and reviewed clean.

**Risks**: a raw constraint error leaks instead of the graceful reason; the `relationship_update`
path is missed; the restore validation misses an active duplicate; the guard wrongly blocks a
withdrawn tuple; OpenAPI drifts from `http-contract.js`.

**Validation**: targeted uniqueness storage/corpus-domain/http/backup-restore commands (incl.
OpenAPI contract); full Agonara tests; root build; `git diff --check`; post-implementation self +
adversarial review against reason mapping across all paths, atomic rollback, restore validation, and
OpenAPI fidelity; fix every fail or warning and rerun affected gates.

**Completion signal**: every new active duplicate — via acceptance, `relationship_update`,
reactivation, or restore — is prevented and surfaces `navigation_relationship_already_accepted`,
with no dependency on the backstop index, and the OpenAPI surface matches.

**Commit**: commit after green validation and clean reviews with a short imperative message.

## Phase 2 — Guarded Backstop Index Startup Step

**Objective**: add the database-level backstop — a partial-unique index scoped to `status =
'active'` — via a guarded idempotent startup step that never throws and never mutates accepted rows.

**Key work items**:

- Add RED storage tests: on a database pre-seeded with two active duplicate relationships for one
  tuple, the startup step skips index creation, emits a diagnostic naming the offending tuple, does
  not throw, and leaves both rows active (no mutation); after the extra is withdrawn through the
  ADR-022 path, the next run creates the index; running again with the index present is a no-op.
- Add RED storage test: with no duplicates, the step creates
  `one_active_navigation_relationship` and a subsequent active duplicate insert is rejected at the
  DB level (defence-in-depth behind the Phase 1 guard).
- Implement the guarded startup step in `agonara/src/storage.js` as a conditional JS step run
  outside the static schema DDL block (duplicate scan → conditional `create unique index if not
  exists … where status = 'active'` or diagnostic-and-skip). The index DDL mirrors the
  `one_active_learner_evidence_target_link` shape but, unlike it, MUST NOT be placed in the static
  schema string. Add the operator-observable diagnostic seam this requires (none exists today). Do
  **not** add any auto-withdraw or delete.

**Dependencies**: Phase 1 complete.

**Risks**: the navigation index is added to the static schema DDL block where it cannot be guarded
and throws on a duplicate-bearing database; the step "helpfully" withdraws or deletes a row
(un-attributed mutation, violating ADR-022 rule 4); the diagnostic is silent (no logging seam) so an
operator never learns the data needs cleaning; the index is created non-partial and wrongly blocks a
withdrawn tuple.

**Validation**: targeted uniqueness-storage command; full Agonara tests; root build;
`git diff --check`; post-implementation self + adversarial review against the guard condition,
no-mutation guarantee, diagnostic visibility, and partial-index scope; fix every fail or warning and
rerun affected gates.

**Completion signal**: the backstop index materializes only on clean data, the startup step never
throws or mutates rows on duplicate-bearing data, and a diagnostic names any remaining duplicates.

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

- New active duplicates are prevented across acceptance, `relationship_update`, reactivation, and
  restore by application guards that do not depend on the backstop index.
- Duplicate acceptance and colliding reactivation are rejected with
  `navigation_relationship_already_accepted`; the original edge is untouched and acceptance is atomic.
- A withdrawn tuple is re-acceptable; the uniqueness scope is active rows only.
- The backstop index is created by a guarded startup step that skips-with-diagnostic (never throws,
  never mutates rows) on duplicate-bearing databases and materializes once a curator has cleaned
  them; restore rejects active-duplicate backups before mutation.
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
