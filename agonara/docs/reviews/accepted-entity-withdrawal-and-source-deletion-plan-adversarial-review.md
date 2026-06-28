---
date: 2026-06-28
model: claude-opus-4-8
description: "Adversarial review of the accepted-entity withdrawal and source-deletion implementation plan against ADR-022, its spec, the mandatory implementation-plan structure, and the implemented Agonara schema."
---

# Accepted Entity Withdrawal and Source Deletion Plan — Adversarial Review

## Scope

Reviewed `agonara/docs/plans/accepted-entity-withdrawal-and-source-deletion.md` against the My
Way [implementation-plan structure](../../../docs/my-way/05-implementation-plan/structure.md),
the `implementation-plan` skill's declaration acceptance checklist, the `process-gates` skill,
[ADR-022](../adr/adr-022-accepted-entity-withdrawal-and-source-deletion.md), the
[spec](../specs/accepted-entity-withdrawal-and-source-deletion.md), and the implemented schema
(`src/storage.js`), domain ownership (`src/corpus.js`, `src/curator-workspace.js`,
`src/student-workspace.js`), and route conventions (`src/http-contract.js`). Findings marked
"fail, fixed" / "warn, fixed" were corrected in the same change set as this review.

## Findings

### Declaration block validity

- **Verdict:** pass.
- **Location:** plan `## Execution mode` and `## Execution lock`.
- **Why:** All required fields are present and legal: `Mode: auto-continue`, `Human review
  between tasks: no`, `Push policy: push at closeout`, `Worktree mode: none`, a resolvable
  `Expected worktree` and `Expected branch`, and `Preflight check: [ ] done` left unchecked at
  authoring time per the skill. No phase declares its own worktree, branch, or push policy;
  `Expected worktree`/`Expected branch` resolve to one task-level target; push cadence is at the
  task boundary (closeout). The six phases are genuine ordered sub-units of one task (one PR).
- **Fix:** None required.
- **Tests:** Ran the implementation-plan acceptance checklist item by item.

### Non-existent migration mechanism

- **Verdict:** fail, fixed.
- **Location:** plan inventory `src/storage.js` entry and Phase 1.
- **Why:** The draft specified "a migration that backfills existing rows to `active`," but
  Agonara has **no migration framework**: `src/storage.js` builds the schema from 43
  `create table if not exists` statements in one `database.exec`, with no `ALTER TABLE`, no
  `pragma user_version`, and no migration runner. `create table if not exists` is a no-op on an
  already-created table, so a deployed database would never receive the new `status` column, and
  ADR-022's backward-compatibility requirement (spec rule 2) would silently fail on existing
  instances. The draft also implied an always-present attribution value, which a backfilled row
  cannot have.
- **Fix:** Rewrote the inventory and Phase 1 to add the columns two converging ways: in the
  `create table` DDL for fresh databases, and via an idempotent startup schema-upgrade step that
  reads `pragma table_info(<table>)` and runs `alter table <table> add column status text not
  null default 'active' check (...)` only when the column is absent — SQLite `ADD COLUMN` with a
  `NOT NULL DEFAULT` backfills existing rows, so no separate backfill pass is needed. Made the
  attribution columns nullable and populated on each status write, added a RED test for the
  reopened-existing-database path, and updated the Phase 1 objective and risks accordingly.
- **Tests:** Verified the absence of any migration/ALTER mechanism in `src/storage.js`
  (`grep` for `alter table`, `migration`, `user_version` returns nothing; 43
  `create table if not exists`). The fix is covered by the new Phase 1 reopened-database RED test.

### Parallel-phase ambiguity

- **Verdict:** warn, fixed.
- **Location:** plan Phase 3 Dependencies.
- **Why:** The draft said "Phase 2 may proceed in parallel" and made Phase 3's source reference
  check conditional on whether a shared resolver "is available." The implementation-plan skill
  defines a phase as an *ordered* sub-unit; parallel phases and conditional dependency-ordering
  blur the build order the plan exists to fix.
- **Fix:** Set Phase 3 to depend on Phase 2 and stated plainly that the source reference check
  (over accepted-corpus `source_ids_json`) is distinct from the entity active-dependent resolver
  and is added on the source side in this phase.
- **Tests:** Structure inspection against the `implementation-plan` vocabulary.

### Domain-ownership and route groundedness

- **Verdict:** pass.
- **Location:** plan inventory and HTTP routes.
- **Why:** The inventory targets the correct modules: `curator-workspace.js` owns the
  check/criterion/readiness families and coverage-gap derivation; `corpus.js` owns corpus
  entities, navigation relationships, sources, and learner target links; `student-workspace.js`
  owns student delivery. The six entity-status routes plus `PUT /sources/{sourceId}/status` and
  `DELETE /sources/{sourceId}` match the spec's route table, and the new reasons
  (`entity_withdrawal_blocked`, `source_hard_delete_blocked`) match the spec. The `/corpus/{entityId}/status`
  base is a new unified base over the single `accepted_corpus_entities` table, consistent with
  the spec's choice.
- **Fix:** None required.
- **Tests:** Cross-checked module ownership via `grep` (`coverage` → `curator-workspace.js`;
  `recordProgramSource`/`deleteLearnerStateTargetLink` handler keys → `corpus.js`) and route
  prefixes in `src/http-contract.js`.

### ADR / spec fidelity and scope guardrails

- **Verdict:** pass.
- **Location:** plan Scope guardrails, ADR traceability matrix, phases.
- **Why:** The guardrails restate ADR-022's invariants (entity-level status; history
  preservation; reactivation restores `current_revision_id`; block-on-active-reference with no
  cascade and entity-level reference resolution; source two-tier deletion; curator authority with
  Admin not the ordinary path; backward-compatible backfill) and exclude every ADR-022 Non-Goal
  (per-revision markers, hard deletion of revisions/evidence, program lifecycle, analytics,
  retention policy). The ADR traceability matrix maps each invariant to an owning phase, and the
  corrected active-dependent reference kinds (readiness requirements over all targetable
  families; open-answer `criterion_revision_ids` resolved to the owning entity) carry the spec's
  fixed rule 9 into the build.
- **Fix:** None required.
- **Tests:** Cross-read against ADR-022 Decision/Rules/Non-Goals and the spec's behavior rules
  and tests.

### Verification coverage and closeout

- **Verdict:** pass.
- **Location:** plan targeted commands, per-phase Validation, `## Done criteria`, `## Final
  closeout`.
- **Why:** Each phase pins targeted `run_silent.sh` commands plus full Agonara tests, root build,
  and `git diff --check`, and requires a post-implementation self + adversarial review with
  fail/warn remediation — matching the process-gates discipline. `## Final closeout` declares all
  four required fields (`Final gates`, `Archive plan`, `Commit archive move`, `Push/PR`). The
  Node-22 `PATH` prefix required by the project is present on every Node command.
- **Fix:** None required.
- **Tests:** Checked command coverage per phase and the closeout field set against the structure.

## Verdict

The plan holds as an execution-ready implementation plan after the corrections above (one fail,
one warn). The fail was a real groundedness defect — a referenced migration mechanism that does
not exist — now replaced with an idempotent additive-column approach matching Agonara's
SQLite/`better-sqlite3` reality. No remaining fails or warns; the declaration block, scope,
traceability, verification coverage, and closeout all pass.
