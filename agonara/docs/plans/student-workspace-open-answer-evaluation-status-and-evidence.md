---
date: 2026-06-02
model: gpt-5
description: "Implementation plan: Agonara Student Workspace open-answer evaluation status and internal evidence domain contract."
---

# Student Workspace Open-Answer Evaluation Status and Evidence Implementation Plan

## Goal

Deliver the Agonara v0.0.1 Student Workspace domain contract for explicit open-answer evaluator runs, redacted internal evidence metadata, terminal evaluation transitions, and owner-only status reads.

This plan implements [Student Workspace Open-Answer Evaluation Status and Evidence](../specs/student-workspace-open-answer-evaluation-status-and-evidence.md) and [ADR-013](../adr/adr-013-student-workspace-open-answer-evaluation-governance.md). It preserves STU-13 and INT-05 from [Product Intent](../intent_learning_program_app.md) while keeping final feedback in Student Workspace and deferring transport and orchestration concerns.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push

## Execution lock

Worktree mode: reuse existing
Expected worktree: `worktrees/agonara-student-attempt-api`
Expected branch: `codex/agonara-student-attempt-api`
Preflight check: [x] done

## Scope guardrails

### In scope

- Student Workspace storage records and helpers for evaluator runs and internal redacted evidence metadata.
- Student Workspace commands for beginning evaluator runs, recording evidence metadata, completing runs, failing runs, and cancelling runs.
- Student Workspace owner-only queries for evaluation status and evaluator evidence metadata.
- Evaluator-run snapshots of attempt, Program, Student Identity, accepted check revision, and accepted criterion revision ids.
- Compatibility with the implemented final evaluation contract: completed runs record `evaluatorKind: "student_workspace"` while preserving the governed `evaluatorPathKind` on the run.
- Backup/restore preservation and structural graph validation for evaluator runs and evidence metadata.
- Domain, storage, backup/restore, and executable acceptance tests for the specified evaluation status/evidence contract.
- Product intent traceability, Agonara log updates, and final plan archive closeout.

### Out of scope

- Public HTTP evaluation mutation routes, HTTP evaluation status routes, HTTP evidence routes, or transport adapters.
- Student UI, Admin UI, Curator UI, Program UI, reviewer UI, or generated frontend artifacts.
- CLI commands.
- Background queues, asynchronous workers, job leasing, retry policy, timeouts, scheduling, or provider orchestration.
- LLM provider calls, prompt construction, raw prompt storage, raw model response storage, model metadata payload storage, hidden policy instruction storage, reviewer note storage, or evaluator diagnostic storage.
- Human review queues, reviewer assignment workflow, escalation, disputes, or feedback rewriting.
- Changes to the implemented Student Workspace attempt HTTP API.
- Removal or behavioral reinterpretation of the existing internal `markOpenAnswerAttemptEvaluating`, `recordOpenAnswerEvaluation`, or `recordOpenAnswerEvaluationFailure` commands.
- Mastery calculation, weak-area calculation, progress interpretation, review scheduling, next-step selection, quick-check attempts, topic-level attempts, period-level attempts, institutional grading, analytics, or reporting.
- Mutating accepted checks, accepted criteria, accepted revisions, source records, curator candidates, Program Membership state, Identity state, sessions, or CSRF state.
- Pushes, PRs, or merges.

## ADR traceability matrix

| ADR | Invariant | Phase |
|---|---|---|
| ADR-011 | Attempts, answers, feedback, and student-specific evidence remain Student Workspace state. | Phase 1, Phase 3, Phase 4, Phase 5, Phase 6 |
| ADR-011 | Student Workspace references accepted check and criterion revisions rather than owning accepted corpus. | Phase 1, Phase 2, Phase 4, Phase 6 |
| ADR-012 | Evaluation transitions preserve submitted answers and accepted revision references. | Phase 2, Phase 4, Phase 6 |
| ADR-013 | Evaluator paths and policy identity are explicit, attributable Student Workspace records. | Phase 1, Phase 2, Phase 6 |
| ADR-013 | Long-running evaluation is explicit and does not rely on an accidental request-lifecycle side effect. | Phase 1, Phase 2, Phase 4, Phase 6 |
| ADR-013 | Internal evaluator evidence is redacted and raw evaluator artifacts remain out of the first contract. | Phase 1, Phase 3, Phase 5, Phase 6 |
| ADR-013 | Human-reviewed runs require reviewer Identity and capability attribution. | Phase 2, Phase 6 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| STU-13 - Receive open-answer feedback | Phase 4, Phase 5, Phase 6 |
| INT-05 - Submit an open answer and receive feedback tied to accepted criteria | Phase 1, Phase 2, Phase 4, Phase 5, Phase 6 |

## TDD and commit discipline

Every implementation phase must use strict TDD:

- Add or update one focused failing storage, domain, backup/restore, or executable acceptance test at a time.
- Run the targeted Agonara test command and capture a RED assertion failure. Compilation errors are not RED.
- Implement the minimum production change that turns that assertion GREEN.
- Repeat RED/GREEN until the phase objective is complete.
- Run the phase validation gates.
- Commit only files tied to the phase after GREEN gates pass.
- Self-review the phase against this plan, the spec, and ADR invariants immediately after the phase commit. Fix every fail/warning finding, rerun the phase gates, and commit the fix before advancing.

Each phase has its own local commit. Do not bundle unrelated phase work into one commit. The docs-only final closeout uses document gates for the archive move in addition to the final code gates.

## Phase 1 — Evaluator run and evidence persistence substrate

**Status**: [x] completed

**Objective**: establish Student Workspace-owned evaluator-run and evidence metadata records with structural invariants, without adding successful domain transitions yet.

**Key work items**:

- Add evaluator-run persistence with attempt, Program, Student Identity, accepted check revision, accepted criterion revision, evaluator path kind, evaluator policy id, lifecycle status, optional requester attribution, optional human reviewer attribution, timestamps, failure reason, and the prior active-failure snapshot required by cancellation restoration.
- Add internal evaluator-evidence persistence with evaluator run id, attempt id, evidence kind, `visibility: "internal"`, optional redacted summary, and recorded timestamp.
- Add create, update, get, and list helpers required by the domain contract.
- Enforce storage-level linkage between evaluator runs and their snapshotted attempt references.
- Enforce storage-level linkage between evidence records and their evaluator run attempt.
- Enforce at most one `running` evaluator run per attempt.
- Keep raw prompt, raw model response, model metadata payload, hidden policy instruction, reviewer note, and evaluator diagnostic fields absent from the schema and storage helper inputs.
- Prove the existing attempt, final evaluation, and active failure records continue to behave unchanged.

**TDD sequence**:

1. RED/GREEN evaluator-run storage records a running run with snapshotted attempt references and governed evaluator attribution.
2. RED/GREEN evaluator-run storage rejects mismatched attempt, Program, Student Identity, check revision, or criterion revision references.
3. RED/GREEN evaluator-run status updates preserve run references and accept only supported lifecycle statuses.
4. RED/GREEN evaluator-evidence storage records only internal metadata and an optional redacted summary.
5. RED/GREEN evaluator-evidence storage rejects attempt/run mismatches.
6. RED/GREEN evaluator-run storage rejects a second `running` run for the same attempt.
7. RED/GREEN storage records and helpers have no raw evaluator artifact surface.
8. RED/GREEN existing attempt, final evaluation, and active failure storage tests remain green.

**Dependencies**: implemented Student Workspace attempt, evaluation, and active-failure records.

**Risks**: evaluator runs can become detached audit fragments if linkage is validated only in domain code. Storage helpers must reject structural mismatch independently.

**Validation**:

- Targeted storage tests for evaluator-run persistence, evidence persistence, linkage invariants, supported statuses, and raw-artifact absence.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 1 tests pass, full Node gates pass, and local commit `add agonara evaluator run storage` is created.

## Phase 2 — Begin evaluator run transition

**Status**: [x] completed

**Objective**: implement the governed transition from a submitted or previously failed attempt into an explicit running evaluator run.

**Key work items**:

- Implement `beginOpenAnswerEvaluatorRun`.
- Accept `submitted` and `evaluation_failed` attempts while rejecting unknown, already evaluating, and already evaluated attempts with the specified reasons.
- Validate supported evaluator path kinds and non-empty evaluator policy ids.
- Record optional requester attribution only for active internal Identities.
- Require active reviewer Identity and non-empty reviewer capability attribution for `human_reviewed` runs.
- Reject reviewer attribution on non-human runs.
- Snapshot attempt references and any pre-run active failure metadata onto the evaluator run, clear the active failure record, and move the attempt to `evaluating`.
- Preserve the snapshotted pre-run failure reason and timestamp until cancellation decides whether to restore them.
- Apply evaluator-run creation, prior-failure snapshot/clear, and attempt-status mutation atomically in one database transaction.

**TDD sequence**:

1. RED/GREEN beginning a run for a submitted attempt records a running run, snapshots accepted revision references, and moves the attempt to `evaluating`.
2. RED/GREEN beginning a run for an `evaluation_failed` attempt snapshots prior-failure restoration state and clears the active failure while the attempt is `evaluating`.
3. RED/GREEN unknown, evaluating, and evaluated attempts reject with the specified reasons.
4. RED/GREEN malformed evaluator path kinds and evaluator policy ids reject with `validation_failed`.
5. RED/GREEN inactive or unknown requester Identity rejects with `identity_not_active`.
6. RED/GREEN `human_reviewed` runs require an active reviewer Identity and reviewer capability.
7. RED/GREEN non-human runs reject reviewer attribution.
8. RED/GREEN beginning a run preserves submitted answer and accepted revision references.
9. RED/GREEN rejected run-start cases leave attempt, failure, and evaluator-run records unchanged.

**Dependencies**: Phase 1.

**Risks**: clearing an active failure without first snapshotting its reason and timestamp would make cancellation lossy. Snapshot the pre-run failure onto the evaluator run, then clear the active failure record before the attempt becomes `evaluating`.

**Validation**:

- Targeted Student Workspace domain tests for begin-run authorization, attribution validation, snapshotting, state transitions, preservation, and prior-failure restoration state.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 2 tests pass, full Node gates pass, and local commit `implement agonara evaluator run start` is created.

## Phase 3 — Redacted evaluator evidence recording

**Status**: [x] completed

**Objective**: record bounded internal evidence metadata for running evaluator runs without admitting raw evaluator artifacts.

**Key work items**:

- Implement `recordOpenAnswerEvaluatorEvidence`.
- Accept evidence only for `running` evaluator runs.
- Validate non-empty evidence kinds and optional non-empty redacted summaries.
- Store and return `visibility: "internal"` with metadata and an optional redacted summary only.
- Reject unknown runs with `evaluator_run_not_found` and terminal runs with `evaluator_run_conflict`.
- Ignore unsupported raw evaluator artifact input fields without persistence or response leakage, matching the existing domain-command convention.

**TDD sequence**:

1. RED/GREEN evidence recording stores and returns internal metadata for a running evaluator run.
2. RED/GREEN omitted redacted summaries are accepted.
3. RED/GREEN malformed evidence kinds and present-but-malformed redacted summaries reject with `validation_failed`.
4. RED/GREEN unknown runs reject with `evaluator_run_not_found`.
5. RED/GREEN succeeded, failed, and cancelled runs reject evidence writes with `evaluator_run_conflict`.
6. RED/GREEN raw prompts, raw model responses, model metadata payloads, hidden policy instructions, reviewer notes, evaluator diagnostics, and secret/infra sentinels are not persisted or returned.

**Dependencies**: Phase 2.

**Risks**: a metadata endpoint can become an accidental artifact store if input validation permits arbitrary payload fields. Keep the command shape closed and prove raw fields remain absent.

**Validation**:

- Targeted Student Workspace domain tests for evidence validation, run-state conflicts, redaction, and raw-artifact absence.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 3 tests pass, full Node gates pass, and local commit `implement agonara evaluator evidence records` is created.

## Phase 4 — Evaluator run terminal transitions

**Status**: [x] completed

**Objective**: implement completion, failure, and cancellation while preserving the existing final evaluation contract and attempt references.

**Key work items**:

- Implement `completeOpenAnswerEvaluatorRun`, `failOpenAnswerEvaluatorRun`, and `cancelOpenAnswerEvaluatorRun`.
- Accept terminal transitions only for `running` evaluator runs.
- Reuse the existing final-evaluation feedback validation rules for completion.
- Record completed final evaluations with `evaluatorKind: "student_workspace"` while retaining `evaluatorPathKind` on the evaluator run.
- Mark completed runs `succeeded`, move attempts to `evaluated`, and clear stale active failure state.
- Mark failed runs `failed`, move attempts to `evaluation_failed`, and record the active failure reason.
- Mark cancelled runs `cancelled` and restore attempts to `submitted` or `evaluation_failed` according to the pre-run failure state.
- Preserve submitted answers and accepted revision references across every transition.
- Revalidate the `running` state and apply each terminal transition atomically in one database transaction.

**TDD sequence**:

1. RED/GREEN completion records final feedback, marks the run `succeeded`, moves the attempt to `evaluated`, and clears stale failure state.
2. RED/GREEN completion reuses criterion feedback validation and preserves `evaluatorKind: "student_workspace"` compatibility.
3. RED/GREEN completion preserves submitted answer and accepted revision references.
4. RED/GREEN failure marks the run `failed`, moves the attempt to `evaluation_failed`, and records an active failure.
5. RED/GREEN failure preserves submitted answer and accepted revision references.
6. RED/GREEN cancellation restores `submitted` when no pre-run failure existed.
7. RED/GREEN cancellation restores `evaluation_failed` and the prior active failure when one existed.
8. RED/GREEN unknown and non-running runs reject terminal transitions with the specified reasons.
9. RED/GREEN malformed failure and cancellation reasons reject with `validation_failed`.
10. RED/GREEN rejected terminal transitions leave evaluator-run, attempt, evaluation, and active-failure records unchanged.

**Dependencies**: Phase 3.

**Risks**: the new completion path can drift from the existing student-facing evaluation shape. Delegate or share existing validation deliberately and assert the final evaluator-kind compatibility rule.

**Validation**:

- Targeted Student Workspace domain tests for completion, failure, cancellation, terminal conflicts, validation, compatibility, and preservation.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 4 tests pass, full Node gates pass, and local commit `implement agonara evaluator run outcomes` is created.

## Phase 5 — Owner-only status and evidence queries

**Status**: [x] completed

**Objective**: expose owner-only domain reads for explicit evaluation status and bounded evidence metadata without leaking private attempt existence or raw artifacts.

**Key work items**:

- Implement `getOpenAnswerEvaluationStatus`.
- Implement `listOpenAnswerEvaluatorEvidence`.
- Require an active owning Student Identity for both query surfaces.
- Return `attempt_not_found` for non-owning Students, Program Curators, Admins, and other callers.
- Return `evaluator_run_not_found` for unknown evaluator-run ids only after active acting-Identity validation.
- Return active evaluator run, evidence metadata, final evaluation, and active failure state where specified.
- Prove status/evidence responses never expose raw evaluator artifacts, secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.

**TDD sequence**:

1. RED/GREEN status returns the owning Student's attempt, active run, evidence metadata, final evaluation, and active failure state where present.
2. RED/GREEN evidence listing returns only the owning Student's internal evidence metadata for the run.
3. RED/GREEN status omits terminal evaluator runs because the query returns only the active run when one is present.
4. RED/GREEN inactive or unknown acting Identities reject with `identity_not_active`.
5. RED/GREEN unknown attempts reject status reads with `attempt_not_found`.
6. RED/GREEN unknown runs reject evidence reads with `evaluator_run_not_found`.
7. RED/GREEN non-owning Students, Program Curators, Admins, and other callers reject with `attempt_not_found`.
8. RED/GREEN accepted and rejected status/evidence responses satisfy redaction rules.
9. RED/GREEN existing attempt detail/list behavior remains unchanged.

**Dependencies**: Phase 4.

**Risks**: divergent errors for non-owners can leak attempt existence. Assert identical private `attempt_not_found` behavior across every non-owner category.

**Validation**:

- Targeted Student Workspace domain tests for owner-only reads, private rejection behavior, status composition, evidence listing, redaction, and existing-query compatibility.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 5 tests pass, full Node gates pass, and local commit `implement agonara evaluation status reads` is created.

## Phase 6 — Backup, restore, executable acceptance, and closeout

**Status**: [ ] planned

**Objective**: preserve evaluator-run/evidence state through backup/restore, reject malformed restored graphs, prove the full domain flow, and archive the completed plan.

**Key work items**:

- Extend backup creation and restore cleanup/insertion for evaluator runs and internal evidence metadata.
- Validate restored evaluator-run linkage to attempts, Program shells, Student Identities, accepted check revisions, and accepted criterion revisions.
- Validate restored evidence linkage to evaluator runs and their attempts.
- Reject restored graphs with more than one `running` evaluator run for an attempt.
- Reject inconsistent current-state graphs: a `running` run requires an `evaluating` attempt; a `succeeded` run requires an `evaluated` attempt plus a matching final evaluation; an active failure requires an `evaluation_failed` attempt; and cancelled-run prior-failure snapshots must be structurally complete when present.
- Preserve compatibility with backups containing a legacy `evaluating` attempt without an evaluator run because the existing internal `markOpenAnswerAttemptEvaluating` command remains behavior-compatible in this slice.
- Preserve historical `failed` and `cancelled` runs after later retries instead of misclassifying their terminal snapshots as the attempt's current state.
- Keep raw evaluator artifact fields absent from backup output and restored records.
- Extend executable acceptance for STU-13 and INT-05: submit an answer, begin a run, record internal evidence metadata, read owner-only status, complete into final feedback tied to accepted criterion revisions, reject non-owner reads, and prove redaction.
- Prove no public HTTP evaluation mutation/status/evidence routes, UI, CLI, LLM provider, human-review queue, mastery, weak-area, progress, next-step, or grading behavior is introduced.
- Update Product Intent traceability with the implemented plan and delivered code/test surfaces.
- Update the Agonara project log.
- Run final gates.
- Move this plan to `agonara/docs/plans/implemented/student-workspace-open-answer-evaluation-status-and-evidence.md`.
- Update this plan's relative links for the `plans/implemented/` location before committing the archive move.
- Update Product Intent traceability to point at the implemented plan path after the archive move.

**TDD sequence**:

1. RED/GREEN backup/restore preserves evaluator runs, evidence metadata, lifecycle status, attribution, redacted summaries, and cancellation restoration state.
2. RED/GREEN restore rejects orphan or structurally mismatched evaluator runs.
3. RED/GREEN restore rejects orphan or structurally mismatched evidence metadata.
4. RED/GREEN restore rejects more than one `running` evaluator run for an attempt.
5. RED/GREEN restore rejects inconsistent current-state graphs for active runs, evaluated attempts, active failures, and incomplete cancellation-restoration snapshots while preserving valid historical `failed` and `cancelled` runs after retries and legacy `evaluating` attempts without evaluator runs.
6. RED/GREEN backup output and restored records omit raw evaluator artifact fields.
7. RED/GREEN executable acceptance covers Student submission, run start, evidence metadata, owner-only status, completion, final feedback tied to accepted criterion revisions, non-owner rejection, and redaction.
8. RED/GREEN absence checks prove transport, UI, CLI, provider, queue, mastery, weak-area, progress, next-step, and grading surfaces remain absent.
9. GREEN documentation closeout updates Product Intent traceability and the Agonara log.
10. GREEN archive move places this plan under `agonara/docs/plans/implemented/`, updates archive-relative links, and updates Product Intent traceability to the implemented plan path.

**Dependencies**: Phase 5.

**Risks**: backup acceptance can admit impossible state combinations that normal domain transitions never create. Restore validation must treat evaluator runs and evidence as a structural graph, including lifecycle consistency.

**Validation**:

- Targeted backup/restore tests for preservation, cleanup, graph validation, lifecycle consistency, and raw-artifact absence.
- Targeted executable acceptance tests for the full domain flow, owner-only reads, redaction, and absence checks.
- `git diff --check`
- Markdown structure and link checks for changed docs.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 6 tests and final gates pass, this plan is archived under `agonara/docs/plans/implemented/`, and local commit `archive agonara evaluation status evidence plan` is created.

## Done criteria

- Every command and query in [Student Workspace Open-Answer Evaluation Status and Evidence](../specs/student-workspace-open-answer-evaluation-status-and-evidence.md) is implemented in the Student Workspace domain service.
- Evaluator runs preserve attempt, Program, Student Identity, accepted check revision, and accepted criterion revision references.
- Each attempt has at most one `running` evaluator run.
- Automated evaluator runs preserve governed evaluator path and policy identity.
- Human-reviewed runs require active reviewer Identity and reviewer capability attribution.
- Internal evidence records expose bounded metadata and optional redacted summaries only; raw evaluator artifacts are neither persisted nor returned.
- Completion, failure, and cancellation preserve submitted answers and accepted revision references.
- Run start, completion, failure, and cancellation apply their multi-record mutations atomically and leave no partial state on rejection.
- Completion preserves the implemented final evaluation compatibility rule: `evaluatorKind: "student_workspace"` remains student-facing and `evaluatorPathKind` remains internal on the run.
- Beginning a retry snapshots and clears any active failure before the attempt becomes `evaluating`; cancellation restores the correct attempt state and prior active failure metadata.
- Owner-only status/evidence queries preserve private attempt boundaries.
- Backup/restore preserves valid evaluator-run/evidence state and rejects malformed restored graphs.
- Existing internal evaluation commands remain behavior-compatible, including backup/restore of legacy `evaluating` attempts without evaluator runs.
- Evaluation status/evidence behavior does not mutate accepted corpus, curator candidates, Program Membership, Identity, session, or CSRF state.
- Absence checks prove this slice introduces no HTTP evaluation routes, UI, CLI, LLM provider, human-review queue, mastery, weak-area, progress, next-step, grading, analytics, or reporting behavior.
- Executable acceptance covers STU-13 and INT-05 through the explicit domain flow.
- Each implementation phase has a local commit created only after its validation gates pass.
- The final branch state passes Agonara workspace tests, repo-wide Node tests, and TypeScript build.
- This plan is moved to `agonara/docs/plans/implemented/` in the same change set as implementation closeout.
- The archived plan's relative links resolve from `agonara/docs/plans/implemented/`, and Product Intent traceability points to the implemented plan path after archive closeout.

## Final closeout

Final gates: `git diff --check`; Markdown structure and link checks for changed docs, including archived-plan relative links after the move; `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`; `./scripts/run_silent.sh "tests" npm test`; `./scripts/run_silent.sh "build" npx tsc --noEmit`
Archive plan: move to `agonara/docs/plans/implemented/student-workspace-open-answer-evaluation-status-and-evidence.md`
Commit archive move: yes
Push/PR: follow push policy (`no push`)
