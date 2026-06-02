---
date: 2026-06-02
model: gpt-5
description: "Implementation plan: Agonara Student Workspace open-answer evaluator orchestration domain contract."
---

# Student Workspace Open-Answer Evaluator Orchestration Implementation Plan

## Goal

Deliver the Agonara v0.0.1 Student Workspace domain contract for scheduling, claiming, renewing, retrying, cancelling, timing out, and completing open-answer evaluator work.

This plan implements [Student Workspace Open-Answer Evaluator Orchestration](../../specs/student-workspace-open-answer-evaluator-orchestration.md) and [ADR-014](../../adr/adr-014-student-workspace-open-answer-evaluator-orchestration.md). It preserves STU-13 and INT-05 from [Product Intent](../../intent_learning_program_app.md) while keeping final feedback in Student Workspace and deferring HTTP mutation routes, provider calls, queues, UI, and deployment topology.

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

- Student Workspace storage support for evaluator orchestration fields by extending evaluator-run records with a distinct orchestration job status, attempt number, retry policy, budget policy, lease, retry timing, and terminal reasons.
- Student Workspace domain commands for scheduling evaluator jobs, claiming jobs, renewing leases, recording leased evidence, completing leased jobs, failing jobs with retry behavior, cancelling jobs, timing out expired leases, and reading claimable jobs.
- Domain, storage, backup/restore, and executable acceptance tests for the orchestration contract.
- Redaction, idempotent completion, accepted-revision preservation, and absence-of-out-of-scope-surface tests.
- Product Intent traceability, Agonara log updates, and final plan archive closeout.

### Out of scope

- Public HTTP evaluator mutation routes, HTTP evaluator job routes, transport adapters, or polling route contracts.
- Student UI, Admin UI, Curator UI, reviewer UI, Program UI, or generated frontend artifacts.
- CLI commands.
- Queue technology, queue schema, broker configuration, worker process topology, scheduler libraries, deployment targets, infrastructure ports, or cross-host filesystem assumptions.
- LLM provider calls, prompt construction, raw prompt storage, raw model response storage, model metadata payload storage, provider diagnostic storage, reviewer note storage, or model-routing policy.
- Human review queues, reviewer assignment workflow, escalation, disputes, staffing, compensation, or feedback rewriting through product roles.
- Mastery calculation, weak-area calculation, progress interpretation, review scheduling, next-step selection, quick-check attempts, topic-level attempts, period-level attempts, institutional grading, analytics, or reporting.
- Mutating accepted checks, accepted criteria, accepted revisions, source records, curator candidates, Program Membership state, Identity state, sessions, or CSRF state.
- Pushes, PRs, merges, or protected-trunk operations.

## ADR traceability matrix

| ADR | Invariant | Phase |
|---|---|---|
| ADR-011 | Student attempts, feedback, evidence, and learner state remain Student Workspace state. | Phase 1, Phase 2, Phase 4, Phase 5, Phase 6, Phase 7 |
| ADR-012 | Evaluation transitions preserve submitted answers and accepted revision references. | Phase 2, Phase 5, Phase 6, Phase 7 |
| ADR-013 | Evaluator outputs become final feedback only through Student Workspace evaluation rules. | Phase 4, Phase 5, Phase 6 |
| ADR-014 | Evaluator jobs are Student Workspace-owned and linked to one evaluator run. | Phase 1, Phase 2, Phase 7 |
| ADR-014 | Running work requires leases or equivalent claims before worker execution. | Phase 3, Phase 4, Phase 5, Phase 6 |
| ADR-014 | Retries, cancellation, timeout recovery, and final acceptance are explicit and observable. | Phase 3, Phase 5, Phase 6, Phase 7 |
| ADR-014 | Provider and human-review adapters do not own final learner state. | Phase 5, Phase 6, Phase 7 |
| ADR-014 | Specs and plans do not assume queue technology, worker topology, deployment target, ports, or shared filesystems. | Phase 1, Phase 7 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| STU-13 - Receive open-answer feedback | Phase 5, Phase 6, Phase 7 |
| INT-05 - Submit an open answer and receive feedback tied to accepted criteria | Phase 2, Phase 3, Phase 5, Phase 6, Phase 7 |

## TDD and commit discipline

Every implementation phase must use strict TDD:

- Add or update one focused failing storage, domain, backup/restore, or executable acceptance test at a time.
- Run the targeted Agonara test command and capture a RED assertion failure. Compilation errors are not RED.
- Implement the minimum production change that turns that assertion GREEN.
- Repeat RED/GREEN until the phase objective is complete.
- Run the phase validation gates.
- Commit only files tied to the phase after GREEN gates pass.
- Self-review the phase against this plan, the spec, and ADR invariants immediately after the phase commit. Fix every fail/warning finding, rerun the phase gates, and commit the fix before advancing.
- Mark phase status complete only after the phase commit and self-review hardening, then commit the plan status update if the implementation branch is tracking phase completion inside this plan.

Each phase has its own local commit. Do not bundle unrelated phase work into one commit.

Use Node commands through the repo wrapper and explicit Node path:

- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

## Phase 1 — Orchestration persistence substrate

**Status**: [x] completed

**Objective**: extend the existing evaluator-run persistence shape to support separate orchestration job state without changing the existing evaluator-run lifecycle contract.

**Key work items**:

- Extend evaluator-run storage with a separate orchestration `jobStatus` field whose values are `waiting`, `leased`, `retry_waiting`, `succeeded`, `failed`, `cancelled`, and `timed_out`.
- Persist attempt number, retry policy, optional budget policy, lease id, worker id, lease timestamps, next retry timestamp, cancellation reason, timeout reason, and failure reason.
- Keep `evaluatorJobId` equivalent to the existing `evaluatorRunId` for this implementation.
- Add storage helpers to create, read, list claimable, update job state, and clear lease fields.
- Preserve the existing evaluator-run lifecycle status values `running`, `succeeded`, `failed`, and `cancelled`; orchestration job state is additive and MUST NOT reinterpret existing status/evidence behavior.
- Keep raw prompt, raw model response, provider diagnostic, reviewer note, secret, session, CSRF, SQL, stack trace, filesystem path, database URL, and infrastructure fields absent from the storage shape.

**TDD sequence**:

1. RED/GREEN storage records a waiting orchestration job on an evaluator run with retry and optional budget policy.
2. RED/GREEN storage rejects malformed orchestration job statuses and malformed retry/budget policy records.
3. RED/GREEN storage preserves existing evaluator-run lifecycle status separately from orchestration job status.
4. RED/GREEN storage preserves attempt, Program, Student Identity, accepted check revision, and accepted criterion revision snapshots.
5. RED/GREEN storage records, renews, and clears lease fields without changing accepted revision snapshots.
6. RED/GREEN storage lists only waiting and due retry-waiting jobs as claimable.
7. RED/GREEN storage rejects raw evaluator artifact fields.
8. RED/GREEN existing evaluator-run/evidence tests remain green.

**Dependencies**: implemented evaluator-run and evidence storage from the status/evidence slice.

**Risks**: extending evaluator-run records can accidentally break existing status/evidence reads or conflate run lifecycle with orchestration job lifecycle. Keep compatibility tests in the targeted gate and preserve existing response shapes unless the orchestration spec explicitly adds fields.

**Validation**:

- Targeted storage tests for orchestration fields, separate run/job status preservation, claimable listing, lease updates, policy validation, snapshot preservation, and raw-artifact absence.
- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

**Completion signal**: Phase 1 tests pass, full Node gates pass, and local commit `add agonara evaluator job storage` is created.

## Phase 2 — Schedule evaluator jobs

**Status**: [x] completed

**Objective**: implement `scheduleOpenAnswerEvaluatorJob` as the governed transition from submitted or failed attempts into waiting evaluator jobs.

**Key work items**:

- Add `scheduleOpenAnswerEvaluatorJob` to Student Workspace.
- Accept `submitted` and `evaluation_failed` attempts while rejecting unknown, evaluating, and evaluated attempts with spec reasons.
- Reuse evaluator path, evaluator policy, requester attribution, and human-review attribution validation from `beginOpenAnswerEvaluatorRun`.
- Validate retry policy and optional budget policy.
- Create an evaluator run with existing lifecycle status `running`, create waiting orchestration job state on that run, and snapshot attempt references.
- Move the attempt to `evaluating`.
- Preserve prior active-failure state before clearing it so cancellation can restore the previous failed status.
- Prove scheduling does not create duplicate attempts or mutate accepted corpus, Program Membership, Identity, session, or CSRF state.

**TDD sequence**:

1. RED/GREEN schedule accepts a submitted attempt and creates an evaluator run with `running` lifecycle status plus waiting job state with accepted revision snapshots.
2. RED/GREEN schedule accepts an evaluation-failed attempt and preserves prior failure restoration state.
3. RED/GREEN schedule rejects unknown, evaluating, and evaluated attempts.
4. RED/GREEN schedule rejects malformed evaluator path, policy, requester, reviewer, retry policy, and budget policy inputs.
5. RED/GREEN schedule leaves state unchanged on rejected inputs.
6. RED/GREEN schedule does not duplicate attempts or mutate adjacent ownership domains.
7. RED/GREEN schedule responses satisfy redaction rules.

**Dependencies**: Phase 1.

**Risks**: scheduling overlaps with existing `beginOpenAnswerEvaluatorRun` behavior. Keep orchestration scheduling as an additive command and avoid removing or reinterpreting the existing status/evidence commands or run lifecycle statuses during this phase.

**Validation**:

- Targeted Student Workspace domain tests for scheduling, validation, prior-failure preservation, redaction, and non-mutation boundaries.
- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

**Completion signal**: Phase 2 tests pass, full Node gates pass, and local commit `implement agonara evaluator job scheduling` is created.

## Phase 3 — Claim, renew, and claimable job reads

**Status**: [x] completed

**Objective**: implement worker lease acquisition, lease renewal, and claimable job reads without adding evidence or terminal transitions yet.

**Key work items**:

- Implement `claimOpenAnswerEvaluatorJob`.
- Implement `renewOpenAnswerEvaluatorJobLease`.
- Implement `getOpenAnswerEvaluatorJob`.
- Implement `listClaimableOpenAnswerEvaluatorJobs`.
- Accept waiting jobs and due retry-waiting jobs for claims.
- Reject malformed worker ids, malformed lease durations, leased jobs, terminal jobs, early retry-waiting jobs, mismatched leases, and expired leases with spec reasons.
- Apply bounded default and maximum limits for claimable reads.
- Prove claim and renewal do not mutate submitted answers, accepted revision references, final evaluation state, accepted corpus, Program Membership, Identity, session, or CSRF state.

**TDD sequence**:

1. RED/GREEN claim accepts a waiting job, creates a lease, and changes status to `leased`.
2. RED/GREEN claim accepts due retry-waiting jobs and rejects early retry-waiting jobs.
3. RED/GREEN claim rejects malformed worker and lease inputs.
4. RED/GREEN claim rejects leased and terminal jobs.
5. RED/GREEN renewal extends a valid unexpired matching lease.
6. RED/GREEN renewal rejects unknown, unclaimed, mismatched, and expired leases.
7. RED/GREEN `getOpenAnswerEvaluatorJob` returns redacted job state.
8. RED/GREEN claimable listing returns only waiting and due retry-waiting jobs with bounded limits.
9. RED/GREEN claim and renew preserve submitted answers and accepted revision references.

**Dependencies**: Phase 2.

**Risks**: lease semantics are easy to test only on happy paths. Include expired, mismatched, terminal, and due/early retry cases in the phase before adding completion behavior.

**Validation**:

- Targeted Student Workspace domain and storage tests for claim, renew, claimable reads, lease validation, bounds, and preservation.
- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

**Completion signal**: Phase 3 tests pass, full Node gates pass, and local commit `implement agonara evaluator job leases` is created.

## Phase 4 — Leased evidence recording

**Status**: [x] completed

**Objective**: implement `recordOpenAnswerEvaluatorJobEvidence` so evidence writes require an active matching lease.

**Key work items**:

- Add leased evidence recording over the existing evaluator evidence metadata storage.
- Reuse evidence-kind, redacted-summary, internal-visibility, and raw-artifact exclusion rules from `recordOpenAnswerEvaluatorEvidence`.
- Reject unknown jobs, unclaimed jobs, mismatched leases, expired leases, and terminal jobs with spec reasons.
- Revalidate leased job state at write time.
- Prove job evidence responses omit raw evaluator artifacts and operational secrets.

**TDD sequence**:

1. RED/GREEN leased evidence records internal metadata for a valid leased job.
2. RED/GREEN leased evidence rejects unknown and unclaimed jobs.
3. RED/GREEN leased evidence rejects mismatched and expired leases.
4. RED/GREEN leased evidence rejects terminal jobs.
5. RED/GREEN leased evidence applies existing evidence validation and redaction rules.
6. RED/GREEN leased evidence preserves submitted answers and accepted revision references.

**Dependencies**: Phase 3.

**Risks**: leased evidence can bypass orchestration if it delegates directly to the old evidence command without lease checks. Revalidate lease and job state in the new command before recording evidence.

**Validation**:

- Targeted Student Workspace domain tests for leased evidence writes, rejection cases, redaction, and preservation.
- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

**Completion signal**: Phase 4 tests pass, full Node gates pass, and local commit `implement agonara leased evaluator evidence` is created.

## Phase 5 — Leased completion and idempotent final acceptance

**Status**: [x] completed

**Objective**: implement `completeOpenAnswerEvaluatorJob` with lease validation, budget gates, LLM output validation, final feedback recording, and idempotent repeated completion.

**Key work items**:

- Accept only leased jobs with valid unexpired matching leases.
- Reject provider usage that exceeds optional budget policy.
- Require passed output validation for `llm_assisted` jobs and allow omitted output validation for non-LLM jobs.
- Reuse final evaluation validation from `completeOpenAnswerEvaluatorRun`.
- Mark job and evaluator run succeeded, clear the lease, move the attempt to `evaluated`, clear active failure state, and record final feedback.
- Make equivalent repeated completion for the same job, lease, worker, feedback, provider usage, and output validation idempotent.
- Prove duplicate final evaluations are not created.
- Reject cancelled, failed, timed-out, superseded, mismatched-lease, and expired-lease cases.

**TDD sequence**:

1. RED/GREEN completion accepts a valid leased job and records final feedback tied to accepted criterion revisions.
2. RED/GREEN completion rejects budget-exceeded provider usage.
3. RED/GREEN LLM-assisted completion requires passed output validation.
4. RED/GREEN non-LLM completion accepts omitted output validation.
5. RED/GREEN completion applies criterion feedback validation from existing final evaluation behavior.
6. RED/GREEN equivalent repeated completion is idempotent.
7. RED/GREEN repeated completion does not create duplicate final evaluations.
8. RED/GREEN completion rejects terminal, mismatched-lease, expired-lease, and superseded cases.
9. RED/GREEN completion preserves submitted answer and accepted revision references.

**Dependencies**: Phase 4.

**Risks**: idempotent completion can accidentally accept changed feedback or create duplicate final evaluations. Assert equivalent input succeeds and materially different repeated input rejects or leaves the original final evaluation unchanged.

**Validation**:

- Targeted Student Workspace domain tests for completion, budget, output validation, idempotency, duplicate prevention, terminal conflicts, lease conflicts, and preservation.
- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

**Completion signal**: Phase 5 tests pass, full Node gates pass, and local commit `implement agonara evaluator job completion` is created.

## Phase 6 — Failure, retry, cancellation, and timeout recovery

**Status**: [x] completed

**Objective**: implement terminal and recovery paths for failed worker attempts, retries, cancellation, and expired leases.

**Key work items**:

- Implement `failOpenAnswerEvaluatorJob`.
- Implement `cancelOpenAnswerEvaluatorJob`.
- Implement `timeOutOpenAnswerEvaluatorJob`.
- Schedule retry-waiting jobs when retry is requested and attempts remain.
- Terminally fail jobs when retry is not requested or attempts are exhausted.
- Cancel waiting, retry-waiting, and leased jobs while restoring the attempt according to pre-run failure state.
- Time out expired leased jobs, clear leases, mark the evaluator run failed, move the attempt to `evaluation_failed`, and record active timeout failure.
- Make cancelled jobs reject later completion, evidence, failure, renewal, and timeout calls.
- Preserve submitted answers and accepted revision references across all recovery paths.

**TDD sequence**:

1. RED/GREEN failure schedules a retry when retry is requested and attempts remain.
2. RED/GREEN due retry jobs become claimable and early retry jobs do not.
3. RED/GREEN failure records final evaluation failure when retry is not requested.
4. RED/GREEN failure records final evaluation failure when retry is requested but attempts are exhausted.
5. RED/GREEN cancellation cancels waiting jobs and restores attempt status.
6. RED/GREEN cancellation cancels retry-waiting jobs and restores attempt status.
7. RED/GREEN cancellation cancels leased jobs, clears lease state, and blocks later worker operations.
8. RED/GREEN timeout accepts only expired leased jobs and records active timeout failure.
9. RED/GREEN timeout rejects unexpired and terminal jobs.
10. RED/GREEN all recovery paths preserve submitted answers and accepted revision references.

**Dependencies**: Phase 5.

**Risks**: retry exhaustion and cancellation restoration are common sources of stuck `evaluating` attempts. Keep explicit assertions for attempt status, active failure state, lease clearing, and terminal conflict behavior in this phase.

**Validation**:

- Targeted Student Workspace domain tests for failure, retry, cancellation, timeout, stale worker rejection, preservation, and active failure state.
- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

**Completion signal**: Phase 6 tests pass, full Node gates pass, and local commit `implement agonara evaluator job recovery` is created.

## Phase 7 — Backup, restore, executable acceptance, and closeout

**Status**: [x] completed

**Objective**: preserve evaluator orchestration state through backup/restore, prove the executable acceptance flow, update traceability, and archive the completed plan.

**Key work items**:

- Extend backup export/import for evaluator job orchestration fields.
- Validate restored evaluator jobs preserve graph references to attempts, evaluator runs, identities, accepted check revisions, and accepted criterion revisions.
- Reject restored jobs with impossible state combinations, unsafe leases, duplicate active evaluating slots, malformed retry/budget policies, unsafe redacted summaries, or raw evaluator artifact leaks.
- Add executable acceptance covering submission, scheduling, claim, leased evidence, renewal, completion, idempotent repeated completion, terminal non-claimability, redaction, and absence of out-of-scope surfaces.
- Update Product Intent traceability to include the implemented plan and code/test references.
- Update the Agonara log.
- Move this plan to `agonara/docs/plans/implemented/student-workspace-open-answer-evaluator-orchestration.md` in the same change set as implementation closeout.

**TDD sequence**:

1. RED/GREEN backup export includes evaluator orchestration state without raw evaluator artifacts.
2. RED/GREEN restore preserves valid evaluator orchestration jobs and lease/retry metadata.
3. RED/GREEN restore rejects orphaned jobs, impossible job/run/attempt state combinations, duplicate active evaluating slots, malformed policies, unsafe leases, and unsafe summaries.
4. RED/GREEN executable acceptance covers schedule, claim, evidence, renew, complete, idempotent repeated complete, terminal non-claimability, redaction, and no out-of-scope surfaces.
5. Docs gate verifies traceability and log updates reflect the implemented slice.
6. Docs gate verifies the plan archive move preserves relative links from `plans/implemented/`.

**Dependencies**: Phase 6.

**Risks**: restore can bypass domain validation and admit impossible evaluator states. Restore validation must reject graph and lifecycle states that ordinary commands cannot produce.

**Validation**:

- Targeted backup/restore tests for evaluator orchestration preservation and malformed-graph rejection.
- Targeted executable acceptance test for the full orchestration domain flow.
- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`
- `git diff --check`

**Completion signal**: Phase 7 tests pass, full Node gates pass, the plan is archived under `agonara/docs/plans/implemented/`, and local commit `archive agonara evaluator orchestration plan` is created.

## Done criteria

- All phases are complete.
- Every command and query in [Student Workspace Open-Answer Evaluator Orchestration](../../specs/student-workspace-open-answer-evaluator-orchestration.md) is implemented and covered by tests.
- Evaluator jobs extend evaluator-run records with separate orchestration job state and preserve one job/run identity per scheduled evaluation.
- Scheduling, claiming, renewing, leased evidence, completion, failure, retry, cancellation, timeout, job reads, and claimable listing behavior matches the spec.
- Lease validation prevents stale workers from recording evidence, completion, failure, or renewal.
- Completion is idempotent for equivalent repeated completion and does not duplicate final evaluations.
- Retry, cancellation, and timeout recovery cannot leave attempts permanently stuck in `evaluating`.
- Backup/restore preserves valid evaluator orchestration state and rejects impossible restored graphs.
- Raw evaluator artifacts and operational secrets are absent from storage helper inputs, domain responses, backups, and restored summaries.
- Accepted corpus, curator candidates, Program Membership, Identity, session, and CSRF state are not mutated by orchestration behavior.
- Mastery, weak-area, progress, review scheduling, next-step, grading, analytics, reporting, LLM provider calls, human-review workflow, UI, CLI, queue technology, worker topology, deployment targets, infrastructure ports, and public HTTP evaluator mutation routes remain out of scope.
- Product Intent traceability and the Agonara log are updated.
- Full verification is green: `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`, `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`, `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`, and `git diff --check`.

## Final closeout

Final gates: `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`; `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`; `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`; `git diff --check`; plan structure/link verification after archive move.
Archive plan: move to `agonara/docs/plans/implemented/student-workspace-open-answer-evaluator-orchestration.md`
Commit archive move: yes
Push/PR: follow push policy; push policy is no push
