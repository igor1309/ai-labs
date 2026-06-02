---
date: 2026-06-01
model: gpt-5
description: "Implementation plan: Agonara Student Workspace open-answer attempt first slice."
---

# Student Workspace Open-Answer Attempt First Slice Implementation Plan

## Goal

Deliver the Agonara v0.0.1 backend domain contract for Student Workspace-owned open-answer attempts, submitted answers, evaluation outcomes, failure states, and owner-only attempt reads.

This plan implements [Student Workspace Open-Answer Attempt First Slice](../specs/student-workspace-open-answer-attempt-first-slice.md), [ADR-012](../adr/adr-012-student-workspace-open-answer-attempt-lifecycle.md), the accepted check and criterion revision boundary from [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), the accepted corpus boundary from [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md), and the effective participation contract from [ADR-007](../adr/adr-007-effective-participation-authorization-contract.md). It preserves INT-05 from [Product Intent](../intent_learning_program_app.md) by recording personal attempts and feedback separately from accepted Program corpus.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push

## Execution lock

Worktree mode: create new
Expected worktree: `worktrees/agonara-student-attempt-first-slice`
Expected branch: `codex/agonara-student-attempt-first-slice`
Preflight check: [x] done

## Scope guardrails

### In scope

- Storage records and helpers for open-answer attempts, evaluations, evaluation failures, and idempotent submission lookups.
- A Student Workspace domain command/query boundary for the interface in [Student Workspace Open-Answer Attempt First Slice](../specs/student-workspace-open-answer-attempt-first-slice.md).
- Effective Student authorization for submission and owner-only attempt reads.
- Accepted open-answer check revision and accepted assessment criterion revision references resolved from Corpus Storage.
- Immutable submitted answers with surrounding whitespace trimmed before persistence.
- Client-provided idempotency keys scoped to acting Student Identity, Program, accepted check revision, and key.
- Attempt lifecycle states `submitted`, `evaluating`, `evaluated`, and `evaluation_failed`.
- Evaluation outcomes and evaluation failures stored as Student Workspace state.
- Backup/restore coverage for attempts, evaluations, evaluation failures, idempotency behavior, and accepted revision graph invariants.
- Redaction coverage for all new Student Workspace response shapes and rejection results.
- Executable acceptance coverage for the open-answer attempt and evaluation first slice.

### Out of scope

- Admin UI, Student UI, Curator UI, Program UI, HTTP routes, CLI commands, or generated frontend artifacts.
- Program Curator attempt reads, Admin attempt reads, support/recovery reads, reviewer reads, or ordinary product flows that let non-owning callers inspect attempts.
- LLM provider calls, prompt construction, raw prompt storage, raw model response storage, evaluator diagnostics, background queues, asynchronous workers, or provider retry policy.
- Human review workflow, reviewer assignment, escalation, dispute workflow, or feedback rewriting through curator/admin flows.
- Mastery calculation, weak-area calculation, progress interpretation, review scheduling, topic-level attempts, period-level attempts, quick-check attempts, multiple-choice attempts, institutional grading, analytics, or reporting.
- Mutating accepted checks, accepted criteria, accepted revisions, curator candidates, Program shells, Program Membership state, Identity state, sessions, CSRF behavior, or existing HTTP adapters beyond backup/restore integration needed for this domain slice.
- Reworking the implemented accepted checks and assessment criteria API or the Admin operations UI.

## ADR traceability matrix

| ADR | Invariant | Phase |
|---|---|---|
| ADR-007 | Student Workspace uses effective participation instead of reading Program Membership internals. | Phase 2, Phase 4, Phase 5 |
| ADR-010 | Accepted Program corpus remains Corpus Storage state and is not mutated by Student Workspace attempts or evaluations. | Phase 2, Phase 3, Phase 5 |
| ADR-011 | Student attempts, answers, feedback, progress evidence, mastery, and weak areas are Student Workspace state, not Corpus Storage state. | Phase 1, Phase 2, Phase 3, Phase 5 |
| ADR-011 | Student Workspace references accepted check and criterion revisions instead of copying corpus ownership. | Phase 2, Phase 3, Phase 5 |
| ADR-012 | Attempts are scoped to Program, owning Student Identity, accepted check revision, criterion revision snapshot, and immutable submitted answer. | Phase 1, Phase 2, Phase 5 |
| ADR-012 | Retryable submissions require client-provided idempotency keys and reject conflicting reuse. | Phase 1, Phase 2, Phase 5 |
| ADR-012 | Evaluation failure preserves the submitted attempt and accepted revision references. | Phase 3, Phase 5 |
| ADR-012 | First-slice reads require the owning Student and avoid Admin/Curator read paths. | Phase 4, Phase 5 |

## Product intent traceability

| Story | Phase preserving prerequisite or delivering intent |
|---|---|
| STU-12 - Submit open answer | Phase 2, Phase 5 |
| STU-13 - Receive open-answer feedback | Phase 3, Phase 5 |
| CUR-04 - Add checks and assessment items | Phase 2, Phase 5 |
| CUR-05 - Define assessment criteria | Phase 2, Phase 5 |
| CUR-06 - Keep accepted content separate from drafts | Phase 2, Phase 3, Phase 5 |
| INT-05 - Submit an open answer and receive feedback tied to accepted criteria | Phase 2, Phase 3, Phase 4, Phase 5 |

Curator story rows are prerequisite and boundary-preservation coverage only. This plan consumes accepted check and criterion revisions produced by Corpus Storage; it does not add Curator Workspace behavior.

## TDD and commit discipline

Every phase that changes executable behavior must use strict TDD:

- Add or update one focused failing test at a time.
- Run the targeted Agonara test command and capture a RED assertion failure. Compilation errors are not RED.
- Implement the minimum production change that turns that assertion GREEN.
- Repeat RED/GREEN until the phase objective is complete.
- Run the phase validation gates.
- Commit only the files tied to that phase after GREEN gates pass.
- Self-review the phase against this plan, the spec, and ADR invariants before advancing. Fix fail/warn findings immediately, rerun the phase gates, and commit the fix.

Each phase has its own local commit. Do not bundle unrelated phase work into one commit. The docs-only archive closeout uses document gates instead of RED/GREEN behavior tests.

## Phase 1 — Student Workspace persistence substrate

**Status**: [x] completed

**Objective**: add storage-level persistence for open-answer attempts, evaluations, evaluation failures, and idempotency lookup records without exposing domain commands yet.

**Key work items**:

- Add storage schema for open-answer attempts with Program, owning Student Identity, accepted check revision, snapshotted criterion revision ids, submitted answer, idempotency key, status, submitted timestamp, and updated timestamp.
- Add storage schema for open-answer evaluations with attempt, Program, owning Student Identity, accepted check revision, snapshotted criterion revision ids, evaluator kind, summary feedback, criterion feedback, and evaluated timestamp.
- Add storage schema for open-answer evaluation failures with attempt, reason, and failed timestamp.
- Add create/get/list/update helpers for the new records.
- Enforce structural references to Program, Identity, accepted open-answer check revision, and accepted criterion revision records where the storage layer can do so.
- Enforce storage-level uniqueness for scoped idempotency keys.
- Keep storage helpers structural. Authorization, state transitions, validation, and redaction remain in the Student Workspace domain service.

**TDD sequence**:

1. RED/GREEN storage creates and reads an open-answer attempt with accepted check and criterion revision references.
2. RED/GREEN storage lists attempts scoped by owning Student Identity, Program, status, and check revision.
3. RED/GREEN storage enforces scoped idempotency uniqueness without making idempotency keys globally unique.
4. RED/GREEN storage updates attempt status and updated timestamp without changing submitted answer or accepted revision references.
5. RED/GREEN storage creates and reads one evaluation per attempt with criterion feedback tied to the attempt's criterion revision ids.
6. RED/GREEN storage creates and reads evaluation failure state while preserving the attempt record.
7. RED/GREEN storage rejects orphan structural references for attempts, evaluations, and failures.

**Dependencies**: existing SQLite initialization, Identity storage records, Program shell records, and accepted open-answer check and assessment criterion revision records.

**Risks**: embedding command policy in storage would make authorization and lifecycle rules hard to test at the Student Workspace boundary. Storage tests must stay structural.

**Validation**:

- Targeted storage tests for attempt, evaluation, failure, idempotency, and structural graph behavior.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 1 storage tests pass, full Node gates pass, and local commit `add agonara student attempt storage` is created.

## Phase 2 — Attempt submission and idempotency

**Status**: [x] completed

**Objective**: implement `submitOpenAnswerAttempt` with effective Student authorization, accepted revision resolution, immutable submitted answers, and scoped idempotency.

**Key work items**:

- Add a Student Workspace domain module composed with the shared database, accepted check revision reads, identity lookup, effective participation lookup, clock, and id generation.
- Implement `submitOpenAnswerAttempt`.
- Validate active acting Identity, existing Program, effective Student participation, accepted check revision existence, accepted check revision Program match, submitted answer, and idempotency key.
- Trim submitted answers before persistence.
- Resolve criterion revision ids from the accepted check revision at submission time.
- Return the original accepted attempt for equivalent retry input with the same scoped idempotency key.
- Reject conflicting idempotency-key reuse with `idempotency_conflict`.
- Prove submission does not mutate accepted checks, accepted criteria, accepted revisions, or curator candidates.

**TDD sequence**:

1. RED/GREEN submission accepts an effective Student and returns a `submitted` attempt with accepted check and criterion revision references.
2. RED/GREEN submission rejects inactive or unknown Identities with `identity_not_active`.
3. RED/GREEN submission rejects unknown Programs with `program_not_found`.
4. RED/GREEN submission rejects callers without effective Student participation with `participation_required`.
5. RED/GREEN submission rejects unknown accepted check revisions with `check_revision_not_found`.
6. RED/GREEN submission rejects accepted check revisions from another Program with `check_revision_program_mismatch`.
7. RED/GREEN submission rejects invalid submitted answers and invalid idempotency keys with `validation_failed`.
8. RED/GREEN submission trims submitted answers before persistence.
9. RED/GREEN equivalent retry returns the original attempt without creating another attempt.
10. RED/GREEN conflicting scoped idempotency-key reuse returns `idempotency_conflict` without changing the original attempt.
11. RED/GREEN later accepted check or criterion revisions do not rewrite a submitted attempt's accepted revision references.
12. RED/GREEN submission leaves accepted corpus and curator candidate records unchanged.

**Dependencies**: Phase 1 and the implemented accepted open-answer check revision boundary.

**Risks**: idempotency drift is likely if the comparison omits normalized submitted answer or scopes only by key. Tests must prove both equivalent retry and conflicting retry behavior.

**Validation**:

- Targeted Student Workspace domain tests for submission, authorization, revision references, idempotency, and corpus non-mutation.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 2 submission tests pass, full Node gates pass, and local commit `implement agonara student attempt submission` is created.

## Phase 3 — Evaluation lifecycle

**Status**: [x] completed

**Objective**: implement the internal Student Workspace evaluation commands and state transitions while preserving submitted answers and accepted revision references.

**Key work items**:

- Implement `markOpenAnswerAttemptEvaluating`.
- Implement `recordOpenAnswerEvaluation`.
- Implement `recordOpenAnswerEvaluationFailure`.
- Validate supported evaluator kind, summary feedback, criterion feedback count, criterion feedback revision ids, criterion feedback outcomes, criterion feedback text, and failure reasons.
- Enforce state transitions for submitted, evaluating, evaluated, and evaluation_failed attempts.
- Ensure evaluation and failure commands do not mutate submitted answers, accepted check revisions, accepted criterion revisions, or curator candidates.
- Keep the only supported first-slice evaluator kind as `student_workspace`.

**TDD sequence**:

1. RED/GREEN `markOpenAnswerAttemptEvaluating` changes submitted and failed attempts to `evaluating`.
2. RED/GREEN `markOpenAnswerAttemptEvaluating` rejects unknown attempts with `attempt_not_found`.
3. RED/GREEN `markOpenAnswerAttemptEvaluating` rejects already evaluating attempts with `attempt_already_evaluating`.
4. RED/GREEN `markOpenAnswerAttemptEvaluating` rejects evaluated attempts with `attempt_already_evaluated`.
5. RED/GREEN `recordOpenAnswerEvaluation` accepts submitted, evaluating, and failed attempts and returns an evaluated attempt plus evaluation summary.
6. RED/GREEN `recordOpenAnswerEvaluation` rejects unknown and already evaluated attempts with the specified reasons.
7. RED/GREEN `recordOpenAnswerEvaluation` rejects unsupported evaluator kinds, invalid summary feedback, malformed criterion feedback, missing criterion feedback, duplicate criterion feedback, unknown criterion feedback, and extra criterion feedback with `validation_failed`.
8. RED/GREEN `recordOpenAnswerEvaluation` changes the attempt to `evaluated` and stores one evaluation outcome.
9. RED/GREEN `recordOpenAnswerEvaluationFailure` changes submitted, evaluating, and failed attempts to `evaluation_failed`.
10. RED/GREEN `recordOpenAnswerEvaluationFailure` rejects unknown, evaluated, and malformed failure cases with the specified reasons.
11. RED/GREEN evaluation and failure commands preserve submitted answers and accepted revision references.
12. RED/GREEN evaluation and failure commands leave accepted corpus and curator candidate records unchanged.

**Dependencies**: Phase 2.

**Risks**: allowing evaluator-kind expansion here would silently introduce LLM or human-review semantics. The implementation must reject all evaluator kinds except `student_workspace`.

**Validation**:

- Targeted Student Workspace domain tests for evaluation state transitions, validation, preservation, and corpus non-mutation.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 3 evaluation tests pass, full Node gates pass, and local commit `implement agonara student attempt evaluation` is created.

## Phase 4 — Owner-only reads and boundary hardening

**Status**: [x] completed

**Objective**: implement `getOpenAnswerAttempt` and `listOpenAnswerAttempts` with owner-only access, redacted summaries, filters, and first-slice absence checks.

**Key work items**:

- Implement `getOpenAnswerAttempt`.
- Implement `listOpenAnswerAttempts`.
- Require active acting Identity for read queries.
- Require effective Student participation for list queries.
- Return `attempt_not_found` for non-owning Students, Program Curators, Admins, and other callers to avoid private attempt existence leaks.
- Apply supported status and check revision filters only after enforcing owning-student and Program scope.
- Redact idempotency keys, raw LLM prompts, raw model responses, evaluator diagnostics, secret/session/CSRF/auth data, SQL text, stack traces, filesystem paths, database URLs, and infrastructure details from all attempt summaries, details, and rejection results.
- Add absence checks proving this slice does not expose HTTP routes, CLI commands, UI, LLM provider calls, raw prompt storage, human review, mastery, weak-area, progress, quick-check, topic-level, period-level, or institutional grading state.

**TDD sequence**:

1. RED/GREEN `getOpenAnswerAttempt` returns the owning Student's attempt detail without exposing idempotency keys.
2. RED/GREEN `getOpenAnswerAttempt` includes evaluation detail when present.
3. RED/GREEN `getOpenAnswerAttempt` includes evaluation failure detail when present.
4. RED/GREEN `getOpenAnswerAttempt` rejects unknown attempts with `attempt_not_found`.
5. RED/GREEN `getOpenAnswerAttempt` rejects inactive or unknown acting Identities with `identity_not_active`.
6. RED/GREEN `getOpenAnswerAttempt` rejects non-owning Students, Program Curators, Admins, and other callers with `attempt_not_found`.
7. RED/GREEN `listOpenAnswerAttempts` returns only attempts owned by the acting Student in the requested Program.
8. RED/GREEN `listOpenAnswerAttempts` applies supported status and check revision filters.
9. RED/GREEN `listOpenAnswerAttempts` rejects inactive Identities, unknown Programs, non-Student callers, and unsupported status filters with the specified reasons.
10. RED/GREEN redaction sentinel tests cover all new attempt, evaluation, failure, detail, list, and rejection shapes.
11. RED/GREEN absence tests prove the first slice introduces no HTTP, CLI, UI, LLM, human review, mastery, weak-area, progress, quick-check, topic-level, period-level, or grading surfaces.

**Dependencies**: Phase 3.

**Risks**: a distinct unauthorized-owner rejection can leak that an attempt exists. Tests must assert `attempt_not_found` for every non-owner category.

**Validation**:

- Targeted Student Workspace domain tests for owner-only reads, filters, redaction, and out-of-scope surface absence.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 4 read and boundary tests pass, full Node gates pass, and local commit `harden agonara student attempt reads` is created.

## Phase 5 — Backup/restore and executable acceptance closeout

**Status**: [x] completed

**Objective**: preserve Student Workspace attempt state through backup/restore, reject orphan restored graphs, and prove the full first-slice flow end to end.

**Key work items**:

- Extend backup export to include open-answer attempts, evaluations, evaluation failures, and the persisted data required for idempotent retry behavior.
- Extend restore to preserve attempt/evaluation/failure records and accepted revision references.
- Reject backups that orphan attempts from required Program, Identity, accepted check revision, or accepted criterion revision records.
- Add an executable acceptance flow for Student join, open-answer submission, evaluation, idempotent retry, accepted criterion revision drift protection, owner-only history, failed evaluation, and absence of out-of-scope state.
- Update Agonara docs/log and any traceability references required by the implemented behavior.

**TDD sequence**:

1. RED/GREEN backup export includes attempts, evaluations, failures, and accepted revision references.
2. RED/GREEN restore preserves attempts, evaluations, failures, and accepted revision references.
3. RED/GREEN restore rejects orphan attempt Program references.
4. RED/GREEN restore rejects orphan attempt Identity references.
5. RED/GREEN restore rejects orphan accepted check revision references.
6. RED/GREEN restore rejects orphan accepted criterion revision references.
7. RED/GREEN executable acceptance flow covers the complete first-slice story from accepted check revision through submitted attempt, evaluation, idempotent retry, historical criterion revision preservation, owner-only reads, failed evaluation, and out-of-scope absence.
8. RED/GREEN every behavior rule in the spec is covered by a listed targeted test or the executable acceptance flow.

**Dependencies**: Phase 4.

**Risks**: restore can pass shallow foreign-key checks while leaving criterion revision snapshots inconsistent with their accepted check revision. Restore tests must prove the full attempt graph is valid, not only that referenced ids exist somewhere.

**Validation**:

- Targeted backup/restore tests for attempts, evaluations, failures, idempotency, and orphan graph rejection.
- Executable Student Workspace open-answer acceptance test.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 5 backup/restore and executable acceptance tests pass, full Node gates pass, and local commit `complete agonara student attempt slice` is created.

## Phase 6 — Plan archive and implementation closeout

**Status**: [ ] pending

**Objective**: close the implementation branch with the plan status, archive move, log, and final gates in the same change set as the implementation.

**Key work items**:

- Confirm every implementation phase has a local commit with green gates.
- Verify this plan's phase checkboxes and completion evidence match the implemented branch state.
- Update Agonara log with the completed Student Workspace attempt slice.
- Move this plan from `agonara/docs/plans/` to `agonara/docs/plans/implemented/`.
- Update relative links if the archive move changes link targets.
- Run final docs checks, full Node gates, and git status checks.

**TDD sequence**:

1. RED/GREEN is not applicable to the archive-only closeout step.

**Dependencies**: Phase 5.

**Risks**: trunk must not see implementation complete while the plan still sits in active plans. The archive move ships in the same PR as the implementation closeout.

**Validation**:

- `git diff --check`
- Markdown/front-matter/link checks for changed docs.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git status --short`

**Completion signal**: plan is archived under `agonara/docs/plans/implemented/`, final gates pass, and local commit `archive agonara student attempt plan` is created.

## Done criteria

- The active implementation worktree preflight has passed before any implementation edits.
- Each implementation phase uses strict TDD with a real RED assertion failure before production changes.
- Each phase has a targeted validation pass, full Node gates pass, self-review pass, and one local commit before the next phase starts.
- Student Workspace exposes the open-answer attempt command/query contract from the spec.
- Attempts are scoped to Program, owning Student Identity, accepted check revision, snapshotted criterion revision ids, idempotency key, immutable submitted answer, and lifecycle status.
- Equivalent idempotent submissions return the original attempt, while conflicting scoped idempotency-key reuse is rejected without changing the original attempt.
- Evaluation and failure commands preserve submitted answers and accepted revision references.
- Owner-only read behavior returns `attempt_not_found` for non-owning Students, Program Curators, Admins, and other callers.
- Attempt/evaluation/failure responses and rejection results satisfy the redaction rules.
- Backup and restore preserve attempts, evaluations, failures, and accepted revision references, and reject orphan restored graphs.
- No accepted corpus mutation, curator candidate mutation, Admin UI, Student UI, HTTP route, CLI command, LLM provider call, raw prompt store, human review workflow, mastery state, weak-area state, progress interpretation, quick-check attempt, topic-level attempt, period-level attempt, or institutional grading behavior is introduced by this first slice.
- The executable acceptance flow covers the full STU-12/STU-13/INT-05 path described by the spec.
- The completed plan is moved to `agonara/docs/plans/implemented/` in the implementation closeout change set.

## Final closeout

Final gates: `git diff --check`; Markdown/front-matter/link checks for changed docs; `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`; `./scripts/run_silent.sh "tests" npm test`; `./scripts/run_silent.sh "build" npx tsc --noEmit`; `git status --short`
Archive plan: move to `agonara/docs/plans/implemented/`
Commit archive move: yes
Push/PR: follow push policy
