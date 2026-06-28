---
date: 2026-06-28
model: claude-opus-4-8
description: "Implementation plan for accepted-entity withdrawal and two-tier source deletion (ADR-022, spec accepted-entity-withdrawal-and-source-deletion)."
status: implemented
type: implementation-plan
---

# Accepted Entity Withdrawal and Source Deletion Implementation Plan

## Goal

Implement [Accepted Entity Withdrawal and Source Deletion](../../specs/accepted-entity-withdrawal-and-source-deletion.md)
under [ADR-022](../../adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md) so a
`Program Curator` can reversibly withdraw and reactivate every accepted-entity family and
Program source record, with withdrawn items leaving student delivery and curator coverage while
all revisions stay addressable, and so unreferenced source records hard-delete while referenced
ones are withdraw-only — completing the deletion tiers [ADR-021](../../adr/adr-021-material-content-storage-and-role-gated-reading.md)
deferred.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: push at closeout

## Execution lock

Worktree mode: none
Expected worktree: `/Users/igormalyarov/.codex/worktrees/fd17/ai-labs` (user override, 2026-06-28)
Expected branch: `codex/adr-22-withdrawal-implementation` (user override, 2026-06-28)
Preflight check: [x] done — `git worktree list --porcelain` shows this worktree on
`refs/heads/codex/adr-22-withdrawal-implementation`; `git branch --show-current` returned
`codex/adr-22-withdrawal-implementation`.

## Scope guardrails

- Implement only the ADR-022 withdrawal/source-deletion spec. Do **not** add per-revision
  lifecycle markers, hard deletion of revisions/attempts/evidence, program archival/deletion/
  ownership transfer, analytics/reporting, curator visibility into student assessment results,
  or any purge/retention policy for long-withdrawn entities (ADR-022 Non-Goals).
- Status is **entity-level** (and source-record-level) only. No revision table gains a status
  column.
- Withdrawal MUST NOT delete, rewrite, or make unaddressable any accepted revision, attempt,
  evaluation, feedback, evidence, mastery state, weak-area summary, or learning history. Reads
  serving historical revisions MUST continue to resolve withdrawn entities.
- Reactivation restores the entity to `active` with `current_revision_id` unchanged; it never
  creates, repoints, or deletes a revision.
- Withdrawal of an entity referenced by an **active** dependent MUST be rejected with
  `entity_withdrawal_blocked`; withdrawal MUST NOT cascade. References resolve at the entity
  level (a revision-pinning dependent references the revision's owning entity).
- A source referenced by any accepted corpus revision's `source_ids_json` MUST NOT hard-delete
  (`source_hard_delete_blocked`) and is withdraw-only; an unreferenced source hard-deletes
  without touching accepted content, revisions, or any student-referenced record. Source raw
  content blobs continue to hard-delete independently per ADR-021.
- Withdraw/reactivate and source deletion are `Program Curator` actions gated by
  `admin_or_curator_required` (the established curator gate), attributable to the acting
  `Identity` and Program-scoped; `Admin` is not the ordinary path.
- The migration backfills every existing accepted entity and source record to `active`; the
  change is backward-compatible and removes no existing item from forward use.
- Do not change Quick Check, open-answer, readiness, criterion, corpus, navigation, Program
  Membership, Identity, Operations, or Admin contracts except to add the lifecycle surface and
  the `status = active` read filters, with tests proving existing behavior is preserved.
- Do not start implementation until this plan passes adversarial review and is committed.
- Do not commit any phase until targeted tests, full Agonara tests, root build,
  `git diff --check`, and post-implementation self/adversarial review are clean.

## Exact implementation inventory

Expected files:

- `agonara/src/storage.js` — add an `active`/`withdrawn` `status` `check` column (default
  `active`) plus **nullable** status attribution (`status_updated_by_identity_id`,
  `status_updated_at`, populated on each status write) to the six accepted-entity tables
  (`accepted_quick_check_entities`, `accepted_open_answer_check_entities`,
  `accepted_assessment_criterion_entities`, `accepted_readiness_check_entities`,
  `accepted_corpus_entities`, `accepted_navigation_relationships`) and `program_sources`. Agonara
  has **no migration framework** (schema is `create table if not exists` only), so add the new
  columns two ways that converge: include them in the `create table` DDL for fresh databases,
  and add an **idempotent startup schema-upgrade step** that, per target table, reads
  `pragma table_info(<table>)` and runs `alter table <table> add column status text not null
  default 'active' check (status in ('active','withdrawn'))` (plus the nullable attribution
  columns) only when absent. SQLite `ADD COLUMN` with `NOT NULL DEFAULT 'active'` backfills every
  existing row to `active`, satisfying the backward-compatibility requirement without a separate
  backfill pass. Also: source-record hard-delete helper; backup export of `status` and
  attribution; restore graph validation (status vocabulary + withdrawn revision/provenance
  resolution before mutation).
- `agonara/src/curator-workspace.js` — coverage-gap derivation and curator coverage listings
  filtered on `status = 'active'`.
- `agonara/src/corpus.js` — withdraw/reactivate domain commands for every accepted-entity family
  and source; the active-dependent resolver (readiness requirements, open-answer criterion
  revisions, learner-evidence target links, and navigation relationships); active curator
  listings; two-tier source-record deletion (reference check over accepted-corpus
  `source_ids_json`, hard-delete unreferenced, `source_hard_delete_blocked` for referenced); and
  material-content deletion tiers (unevidenced content hard-deletes, evidenced content retires
  through entity withdrawal).
- `agonara/src/student-workspace.js` — student delivery and listings filtered on
  `status = 'active'`; historical revision reads still resolve withdrawn entities' revisions.
- `agonara/src/http-contract.js` — per-family `PUT <base>/{entityId}/status` declarations,
  `PUT /sources/{sourceId}/status`, `DELETE /sources/{sourceId}`, and the
  `entity_withdrawal_blocked` / `source_hard_delete_blocked` rejection reasons.
- `agonara/src/server.js` — route parsing, body validation (`SetLifecycleStatusInput`),
  session/CSRF + curator gates, redacted `LifecycleStatusResult` mapping.
- `agonara/src/openapi-generator.js` — regenerate the OpenAPI surface for the new routes/reasons.
- `agonara/src/learn-ui.js` — `/learn` curator withdraw/reactivate controls per family, source
  withdraw/reactivate/delete controls, and a withdrawn-items view for reactivation.
- `agonara/tests/storage.test.js` — status column/constraint, migration backfill, and
  restore-validation tests.
- `agonara/tests/curator-workspace.test.js` — coverage-gap filtering tests.
- `agonara/tests/corpus.test.js`, `agonara/tests/corpus-executable-acceptance.test.js` —
  all-family withdrawal/reactivation, active-dependent blocks and no-cascade behavior,
  source withdraw/reactivate, two-tier source deletion, and material-content deletion-tier tests.
- `agonara/tests/student-workspace.test.js` — delivery/listing exclusion of withdrawn entities
  and historical-revision resolution tests.
- `agonara/tests/http-api.test.js`, `agonara/tests/executable-acceptance.test.js` — lifecycle
  route contracts, auth/CSRF gates, no-op idempotency, redaction, and reason mapping tests.
- `agonara/tests/openapi-contract.test.js` — OpenAPI contract coverage for new routes/reasons.
- `agonara/tests/backup-restore.test.js` — status round-trip and malformed/unresolvable
  withdrawn-graph rejection tests.
- `agonara/tests/quick-check-product-ui.playwright.js`,
  `agonara/tests/topic-concept-material-navigation.playwright.js` — browser curator
  withdraw/reactivate, blocked-dependent guidance, source lifecycle/delete, and responsive
  layout workflows on the established product surfaces.
- `agonara/playwright.config.js` — reuse existing config unless a strictly additive project
  setting is required.
- `agonara/docs/specs/accepted-entity-withdrawal-and-source-deletion.md` — update
  status/implementation status at closeout.
- `agonara/docs/intent/curator_user_stories.md` — add the withdraw/reactivate and source-deletion
  curator stories.
- `agonara/docs/intent/intent_learning_program_app.md` — add code/test traceability at closeout.
- `agonara/README.md` — move withdrawal/source-deletion from deferred to implemented snapshot.
- `agonara/backlog/material-content.md` — close the implemented withdrawal/source-deletion task.
- `agonara/docs/log.md` — record each completed phase outcome.
- `agonara/docs/plans/implemented/accepted-entity-withdrawal-and-source-deletion.md` — archived
  plan after completion.
- `docs/loc-dashboard.html` — refresh at final closeout.

HTTP routes:

- `PUT /quick-checks/{entityId}/status`
- `PUT /open-answer-checks/{entityId}/status`
- `PUT /assessment-criteria/{entityId}/status`
- `PUT /readiness-checks/{entityId}/status`
- `PUT /corpus/{entityId}/status`
- `PUT /navigation-relationships/{entityId}/status`
- `PUT /sources/{sourceId}/status`
- `DELETE /sources/{sourceId}`

Required UI controls and stable element ids:

- Per-family lifecycle controls: `#entity-lifecycle-panel`,
  `data-action="withdraw-entity"`, `data-action="reactivate-entity"`,
  `#entity-lifecycle-status`.
- Source lifecycle/delete controls: `data-action="withdraw-source"`,
  `data-action="reactivate-source"`, `data-action="delete-source-record"`,
  `#source-lifecycle-status`.
- Withdrawn-items view: `#withdrawn-items-view`, `data-action="open-withdrawn-items"`.

Targeted commands:

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "lifecycle storage" node --test --test-name-pattern "status|withdraw|lifecycle" agonara/tests/storage.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "lifecycle curator domain" node --test --test-name-pattern "withdraw|reactivate|status|coverage" agonara/tests/curator-workspace.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "lifecycle corpus domain" node --test --test-name-pattern "withdraw|reactivate|status|source" agonara/tests/corpus.test.js agonara/tests/corpus-executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "lifecycle delivery" node --test --test-name-pattern "withdraw|status|deliver|listing" agonara/tests/student-workspace.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "lifecycle http" node --test --test-name-pattern "withdraw|reactivate|status|source" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js agonara/tests/openapi-contract.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "lifecycle backup restore" node --test --test-name-pattern "status|withdraw" agonara/tests/backup-restore.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx playwright test --config agonara/playwright.config.js agonara/tests/quick-check-product-ui.playwright.js agonara/tests/topic-concept-material-navigation.playwright.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git diff --check`

## Phase tracker

- [x] Phase 1 — Lifecycle Status Substrate, Migration, and Restore Validation
- [x] Phase 2 — Accepted-Entity Withdraw/Reactivate, Active-Dependent Block, and Read Filtering
- [x] Phase 3 — Source Withdrawal and Two-Tier Deletion
- [x] Phase 4 — HTTP Lifecycle API and OpenAPI
- [x] Phase 5 — Product UI Withdraw/Reactivate and Source Delete
- [x] Phase 6 — Docs, Product Intent, Traceability, Dashboard, Archive

Update tracker checkboxes only after the phase's required verification passes and the phase commit is created.

## ADR traceability matrix

| ADR / spec invariant | Phase |
|---|---|
| ADR-022 #1: each entity family and source record carries entity-level `active`/`withdrawn` status, default `active`. | Phase 1 |
| ADR-022: status migration backfills existing rows to `active` (backward-compatible). | Phase 1 |
| ADR-022 #2–3, #6: withdrawal reversible; preserves every revision/attempt/evaluation/evidence/learner state. | Phase 2, Phase 3 |
| ADR-022 #2, #7: reactivation restores `current_revision_id` unchanged. | Phase 2, Phase 3 |
| ADR-022 #4, Rules: withdrawn entities leave delivery, listings, and coverage-gap derivation; stay curator-visible. | Phase 2, Phase 5 |
| ADR-022 Rules: withdrawal of an active-referenced entity is rejected (`entity_withdrawal_blocked`), no cascade. | Phase 2 |
| ADR-022 #5, Rules: source two-tier deletion (hard-delete unreferenced, withdraw-only referenced). | Phase 3 |
| ADR-022 #6 / ADR-021: material-content deletion tiers completed. | Phase 3 |
| ADR-022 #7: withdraw/reactivate/source-deletion are attributable, Program-scoped curator actions; Admin not ordinary. | Phase 2, Phase 3, Phase 4 |
| ADR-022 Rules: historical revision reads still resolve withdrawn entities. | Phase 2 |
| ADR-022 Rules: backup preserves status; restore validates vocabulary and withdrawn-graph resolution before mutation. | Phase 1 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| New CUR story — withdraw/reactivate an accepted item or material, keeping student history | Phase 2, Phase 5, Phase 6 |
| New CUR story — delete an unreferenced source; withdraw a referenced source | Phase 3, Phase 5, Phase 6 |
| Existing acceptance authority boundary (ADR-010) preserved, not redefined | Phase 2, Phase 3, Phase 4 |

## Phase 1 — Lifecycle Status Substrate, Migration, and Restore Validation

**Objective**: persist an entity-level `active`/`withdrawn` status with attribution on the six
accepted-entity tables and `program_sources`, ensure existing databases gain the column and
backfill to `active` despite the absence of a migration framework, and validate status and
withdrawn graphs at restore time.

**Key work items**:

- Add RED storage tests asserting each of the seven tables gains a `status` column constrained
  to `{active, withdrawn}` defaulting to `active`, with nullable attribution columns, on both a
  fresh database (column present from the `create table` DDL) and a database created from the
  prior schema and reopened (the idempotent `pragma table_info` + `alter table add column` step
  adds the column and backfills existing rows to `active`).
- Add RED storage tests rejecting an out-of-vocabulary `status` via the `check` constraint on an
  entity table and on `program_sources`.
- Add RED backup/restore tests round-tripping status (including withdrawn items) and rejecting,
  before mutation, an out-of-vocabulary status, a withdrawn entity whose
  `current_revision_id`/revisions do not resolve, and a withdrawn source whose provenance edges
  do not resolve.
- Implement the columns, migration backfill, source-record hard-delete helper, backup export,
  and restore graph validation in `agonara/src/storage.js`.

**Dependencies**: this plan is committed and reviewed clean.

**Risks**: the idempotent add-column step is skipped or misordered on an existing database,
leaving rows without a `status` column or with a NULL status; the `ADD COLUMN` default fails to
backfill existing rows; restore accepts an unresolvable withdrawn graph and corrupts recovery;
attribution columns omitted, blocking the `LifecycleStatusResult` contract.

**Validation**: targeted lifecycle-storage and backup/restore commands; full Agonara tests; root
build; `git diff --check`; post-implementation self + adversarial review against the status
substrate and restore invariants; fix every fail or warning and rerun affected gates.

**Completion signal**: every entity family and source record carries a constrained, backfilled
status, and restore rejects malformed or unresolvable withdrawn graphs before mutation.

**Commit**: commit after green validation and clean reviews with a short imperative message.

## Phase 2 — Accepted-Entity Withdraw/Reactivate, Active-Dependent Block, and Read Filtering

**Objective**: implement curator-authorized withdraw/reactivate for all six entity families, the
entity-level active-dependent block (no cascade), and `status = active` filtering for delivery,
listings, and coverage-gap derivation while keeping historical revisions addressable.

**Key work items**:

- Add RED domain tests withdrawing an `active` entity (per family), proving exclusion from active
  listings and proving every revision/attempt/evaluation/evidence still resolves byte-identical.
- Add RED domain tests reactivating a `withdrawn` entity, proving `current_revision_id` unchanged
  and return to active listings, and proving a same-status write is an accepted no-op recording
  the latest actor/timestamp.
- Add RED domain tests rejecting withdrawal with `entity_withdrawal_blocked` for each rule-9
  reference kind — a corpus entity targeted by an active readiness requirement; a criterion
  entity whose revision is pinned by an active open-answer check (revision→owning-entity
  resolution); a check/criterion entity referenced by an active learner-evidence target link; a
  corpus entity referenced by an active navigation relationship — proving no dependent is mutated
  (no cascade), then proving withdrawal succeeds once the dependent is withdrawn/repointed.
- Add RED derivation tests proving a withdrawn entity contributes neither coverage nor a
  satisfied coverage gap, restored on reactivation.
- Add RED delivery tests proving student delivery/listings omit withdrawn entities while a
  historical `…/revisions/{revisionId}` read still resolves a withdrawn entity's revision.
- Implement the withdraw/reactivate commands and shared active-dependent reference resolver in
  `agonara/src/corpus.js`, coverage-gap filtering in `agonara/src/curator-workspace.js`, and
  delivery/listing filters in `agonara/src/student-workspace.js`.

**Dependencies**: Phase 1 complete.

**Risks**: a missed reference kind lets a blocked withdrawal through; revision-pinned references
not resolved to their owning entity; a filter excludes a historical read or fails to exclude a
withdrawn entity from a forward read; cascade introduced accidentally.

**Validation**: targeted curator-domain, corpus-domain, and delivery commands; full Agonara
tests; root build; `git diff --check`; post-implementation self + adversarial review against the
block-resolution, no-cascade, read-filtering, and historical-addressability rules; fix every fail
or warning and rerun affected gates.

**Completion signal**: curators withdraw/reactivate every family, blocked-on-active-reference
holds without cascade, and withdrawn entities leave forward reads while historical revisions
still resolve.

**Commit**: commit after green validation and clean reviews with a short imperative message.

## Phase 3 — Source Withdrawal and Two-Tier Deletion

**Objective**: implement source-record withdraw/reactivate and two-tier deletion (hard-delete
unreferenced, withdraw-only referenced), and complete ADR-021's material-content deletion tiers.

**Key work items**:

- Add RED domain tests withdrawing/reactivating a source and proving its provenance edges still
  resolve for any referencing corpus.
- Add RED domain tests hard-deleting an unreferenced source record and rejecting hard deletion of
  a referenced source with `source_hard_delete_blocked` (reference resolved over accepted-corpus
  `source_ids_json` regardless of the referencing entity's own status), then withdrawing it.
- Add RED domain tests proving source-record hard deletion leaves accepted material content,
  accepted revisions, and student-referenced records intact, independent of the raw-content blob.
- Add RED domain tests for the material-content deletion tiers: unevidenced accepted material
  content hard-deletes with its entity; evidenced content is retired only by withdrawing the
  entity and stays byte-identical for historical reads.
- Implement source withdraw/reactivate, the reference check, and the hard-delete path in
  `agonara/src/corpus.js`, reusing the storage hard-delete helper from Phase 1.

**Dependencies**: Phase 2 complete. The source reference check (over accepted-corpus
`source_ids_json`) is distinct from the entity active-dependent resolver built in Phase 2; this
phase adds it on the source side.

**Risks**: a referenced source hard-deleted, breaking corpus provenance; deletion touching
accepted content/revisions/evidence; reference check missing withdrawn-corpus references.

**Validation**: targeted corpus-domain command; full Agonara tests; root build; `git diff --check`;
post-implementation self + adversarial review against the two-tier deletion and deletion-tier
rules; fix every fail or warning and rerun affected gates.

**Completion signal**: unreferenced sources hard-delete safely, referenced sources are
withdraw-only, and ADR-021's material-content deletion tiers are complete.

**Commit**: commit after green validation and clean reviews with a short imperative message.

## Phase 4 — HTTP Lifecycle API and OpenAPI

**Objective**: expose the per-family status routes, the source status route, and the source
hard-delete route with session/CSRF + curator gates, redacted results, the new reasons, and a
regenerated OpenAPI surface.

**Key work items**:

- Declare the eight routes and the `entity_withdrawal_blocked` / `source_hard_delete_blocked`
  reasons in `agonara/src/http-contract.js`; regenerate OpenAPI.
- Add RED HTTP tests: each `PUT …/status` and `DELETE /sources/{sourceId}` requires effective
  Program Curator participation + CSRF, rejects non-curator with `admin_or_curator_required`, and
  returns a `LifecycleStatusResult` carrying no content bytes.
- Add RED HTTP tests: malformed/out-of-vocabulary `status` → `validation_failed`; missing entity/
  source → the family's not-found reason; same-status no-op accepted; `entity_withdrawal_blocked`
  and `source_hard_delete_blocked` surfaced correctly.
- Add RED HTTP tests: a delivery/listing read omits withdrawn entities while a historical revision
  read resolves them; the `LifecycleStatusResult` projection leaks no content/provenance/secrets.
- Add RED OpenAPI-contract tests for the new routes/reasons.
- Implement route parsing, body validation, gates, and redacted mapping in
  `agonara/src/server.js`; update executable HTTP acceptance.

**Dependencies**: Phases 2 and 3 complete.

**Risks**: missing CSRF/session gate; OpenAPI drift from `http-contract.js`; redaction gaps;
inconsistent reason mapping across families.

**Validation**: targeted lifecycle-http command (incl. OpenAPI contract); full Agonara tests;
root build; `git diff --check`; post-implementation self + adversarial review against auth/CSRF,
redaction, reason mapping, and OpenAPI fidelity; fix every fail or warning and rerun affected
gates.

**Completion signal**: all eight routes enforce the spec, surface the correct reasons, and the
OpenAPI surface matches the contract.

**Commit**: commit after green validation and clean reviews with a short imperative message.

## Phase 5 — Product UI Withdraw/Reactivate and Source Delete

**Objective**: extend `/learn` so a curator withdraws/reactivates entities and sources, deletes
unreferenced sources, and reviews withdrawn items for reactivation.

**Key work items**:

- Add RED browser tests: a curator withdraws an accepted item, sees it leave the active list and
  appear in the withdrawn-items view, and reactivates it; layout/accessibility checks (named
  controls, no clipped text) at desktop and mobile widths.
- Add RED browser tests: a curator deletes an unreferenced source, and is blocked (with a clear
  message) from deleting a referenced source, withdrawing it instead.
- Add RED browser test verifying a blocked withdrawal surfaces an actionable
  `entity_withdrawal_blocked` message naming the active dependents.
- Implement the per-family lifecycle controls, source lifecycle/delete controls, and the
  withdrawn-items view in `agonara/src/learn-ui.js` using the declared element ids.

**Dependencies**: Phase 4 complete.

**Risks**: withdrawn items invisible to the curator; a referenced-source delete control offered
without the block; unnamed controls or clipped text.

**Validation**: `npx playwright --version`; targeted lifecycle-browser command; full Agonara
tests; root build; `git diff --check`; post-implementation self + adversarial review against
curator visibility, block messaging, and accessibility; fix every fail or warning and rerun
affected gates.

**Completion signal**: curators withdraw/reactivate and delete sources in-product, with withdrawn
items visible and referenced-source deletion blocked.

**Commit**: commit after green validation and clean reviews with a short imperative message.

## Phase 6 — Docs, Product Intent, Traceability, Dashboard, Archive

**Objective**: land the required doc changes and close out traceability.

**Key work items**:

- Add the curator withdraw/reactivate and source-deletion stories in
  `agonara/docs/intent/curator_user_stories.md`.
- Update `accepted-entity-withdrawal-and-source-deletion.md` to `status: implemented` with
  implementation/verification links; add code/test traceability in
  `intent_learning_program_app.md`.
- Update `README.md` snapshot, close the implemented task in `backlog/material-content.md`,
  refresh `docs/loc-dashboard.html`, and record outcomes in `docs/log.md`.
- Move this plan to `docs/plans/implemented/accepted-entity-withdrawal-and-source-deletion.md`.

**Dependencies**: Phases 1–5 complete and verified.

**Risks**: stale spec status or intent traceability; backlog task left open; dashboard not
refreshed.

**Validation**: full Agonara tests; root build; docs link/front-matter/single-H1 checks;
`git diff --check`; final self + adversarial review of the doc set.

**Completion signal**: docs, intent, traceability, dashboard, and archive reflect the implemented
withdrawal/source-deletion capability.

**Commit**: commit the closeout with a short imperative message.

## Done criteria

- Every accepted-entity family and `program_sources` carries an entity-level `active`/`withdrawn`
  status with a `check` constraint, an `active` default, and existing rows backfilled.
- Curators withdraw/reactivate every family and source, with reactivation restoring
  `current_revision_id` unchanged and withdrawal of an active-referenced entity blocked
  (`entity_withdrawal_blocked`) without cascade.
- Withdrawn entities leave student delivery, listings, and coverage-gap derivation while
  historical revisions stay addressable and withdrawn items stay curator-visible.
- Referenced sources are withdraw-only (`source_hard_delete_blocked`); unreferenced sources
  hard-delete without touching accepted content, revisions, or student-referenced records;
  ADR-021's material-content deletion tiers are complete.
- The eight HTTP routes enforce auth/CSRF, redaction, and reasons, and the OpenAPI surface
  matches; backup/restore preserve status and reject malformed/unresolvable withdrawn graphs.
- Product Intent carries the new curator stories; the spec is marked implemented.
- Agonara tests, root build, docs checks, and `git diff --check` pass; the plan is archived.

## Final closeout

Final gates: all phase tracker boxes checked with their phase commits; spec marked
implemented; intent traceability updated; backlog task closed; dashboard refreshed;
full Agonara tests, root build, docs link/front-matter/single-H1 checks, and
`git diff --check` pass; final self + adversarial review of the doc set is clean.
Archive plan: move to `agonara/docs/plans/implemented/accepted-entity-withdrawal-and-source-deletion.md`.
Commit archive move: yes.
Push/PR: follow push policy; open a single PR for the task.
