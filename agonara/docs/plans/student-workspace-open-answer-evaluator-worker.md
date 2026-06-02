---
date: 2026-06-02
model: gpt-5
description: "Implementation plan: Agonara Student Workspace open-answer evaluator worker."
---

# Student Workspace Open-Answer Evaluator Worker Implementation Plan

## Goal

Deliver the Agonara v0.0.1 in-process Student Workspace open-answer evaluator worker that claims evaluator jobs, executes a governed evaluator policy through a side-effect-limited provider adapter, and submits candidate results back through Student Workspace commands.

This plan implements [Student Workspace Open-Answer Evaluator Worker](../specs/student-workspace-open-answer-evaluator-worker.md) and [ADR-015](../adr/adr-015-open-answer-evaluator-worker-provider-boundary.md). It preserves STU-13 and INT-05 from [Product Intent](../intent_learning_program_app.md) while keeping final feedback in Student Workspace and deferring public HTTP evaluator mutation routes, durable queues, external LLM calls, raw artifact persistence, UI, mastery, weak-area, progress, grading, analytics, and deployment topology.

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

- In-process single-run evaluator worker command `runOpenAnswerEvaluatorWorkerOnce`.
- Worker modes `single_job` and `claim_next`.
- Evaluator policy resolution and validation for prompt inputs, output validation policy, provider adapter, redaction policy, retry policy, budget policy, and `rawArtifactPolicy: "none"`.
- Side-effect-limited deterministic and LLM-assisted provider adapter interface with test doubles only.
- Provider request construction from claimed job state, accepted revision snapshots, and submitted answer.
- Provider output validation before final feedback acceptance.
- Budget enforcement before completion.
- Redacted evidence recording through `recordOpenAnswerEvaluatorJobEvidence`.
- Job completion and failure through existing Student Workspace evaluator job commands.
- Provider failure, malformed output, budget rejection, and output rejection flowing through Student Workspace retry/failure behavior.
- Raw-artifact and operational-secret exclusion checks for provider requests, summaries, logs, backup/export, and restored summaries.
- Product Intent traceability, Agonara log updates, and final plan archive closeout.

### Out of scope

- Public HTTP evaluator mutation routes, HTTP worker routes, polling route contracts, or transport adapters.
- Durable queue technology, queue schema, broker configuration, worker process topology, scheduler libraries, lock libraries, deployment targets, infrastructure ports, or cross-host filesystem assumptions.
- Real external LLM calls, provider SDK integration, model routing, provider credential configuration, embedding models, prompt template text, or context-window strategy.
- Raw prompt persistence, raw model response persistence, provider diagnostic persistence, reviewer note persistence, raw artifact backup/export, raw artifact restore, or operational artifact store.
- Human review queues, reviewer assignment workflow, escalation, disputes, staffing, compensation, reviewer UI, or feedback rewriting through product roles.
- Student UI, Admin UI, Curator UI, reviewer UI, Program UI, or generated frontend artifacts.
- CLI commands.
- Mastery calculation, weak-area calculation, progress interpretation, review scheduling, next-step selection, quick-check attempts, topic-level attempts, period-level attempts, institutional grading, analytics, reporting, certification, classroom, cohort, or plagiarism/proctoring workflows.
- Mutating accepted checks, accepted criteria, accepted revisions, source records, curator candidates, Program Membership state, Identity state, sessions, credentials, Admin authority, or CSRF state.
- Pushes, PRs, merges, or protected-trunk operations.

## ADR traceability matrix

| ADR | Invariant | Phase |
|---|---|---|
| ADR-011 | Accepted checks and criteria remain Corpus Storage state while attempts, feedback, and evidence remain Student Workspace state. | Phase 2, Phase 5, Phase 6 |
| ADR-013 | Evaluator outputs become final feedback only through Student Workspace evaluation rules. | Phase 5, Phase 6 |
| ADR-014 | Worker execution must happen behind Student Workspace evaluator jobs and leases. | Phase 1, Phase 5 |
| ADR-014 | Retries and terminal failure remain Student Workspace job behavior. | Phase 6 |
| ADR-015 | Evaluator workers and provider adapters are execution agents, not product-state owners. | Phase 2, Phase 5, Phase 6 |
| ADR-015 | Prompt construction uses accepted revision snapshots and excludes secrets/raw artifacts. | Phase 3, Phase 7 |
| ADR-015 | Provider output must pass explicit validation before final feedback acceptance. | Phase 4, Phase 5 |
| ADR-015 | Provider budget policy bounds provider usage before completion. | Phase 4, Phase 6 |
| ADR-015 | Raw evaluator artifacts are not persisted, logged, exported, restored, or surfaced in summaries. | Phase 3, Phase 4, Phase 7 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| STU-13 - Receive open-answer feedback | Phase 5, Phase 6, Phase 7 |
| INT-05 - Submit an open answer and receive feedback tied to accepted criteria | Phase 3, Phase 4, Phase 5, Phase 7 |

## TDD and commit discipline

Every implementation phase must use strict TDD:

- Add or update one focused failing domain, storage, backup/restore, logging, or executable acceptance test at a time.
- Run the targeted Agonara test command and capture a RED assertion failure. Compilation errors are not RED.
- Implement the minimum production change that turns that assertion GREEN.
- Repeat RED/GREEN until the phase objective is complete.
- Run the phase validation gates.
- Commit only files tied to the phase after GREEN gates pass.
- Self-review the phase against this plan, the spec, and ADR invariants immediately after the phase commit. Fix every fail/warning finding, rerun the phase gates, and commit the fix before advancing.
- Mark phase status complete only after the phase commit and self-review hardening, then commit the plan status update before advancing.

Each phase has its own local commit. Do not bundle unrelated phase work into one commit.

Use Node commands through the repo wrapper and explicit Node path:

- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

## Phase 1 — Worker command substrate and job claiming

**Status**: [x] complete

**Objective**: add the in-process worker command boundary and make it claim jobs without reading prompt inputs or calling provider adapters on rejected claims.

**Key work items**:

- Add `runOpenAnswerEvaluatorWorkerOnce` to the Student Workspace command surface.
- Define worker result, worker summary, failure reason, evaluator policy, provider request, provider result, and provider adapter shapes in the implementation boundary.
- Validate malformed `workerId`, `leaseDurationSeconds`, `mode`, and `single_job` `evaluatorJobId`.
- Implement `single_job` mode through `claimOpenAnswerEvaluatorJob`.
- Implement `claim_next` mode through `listClaimableOpenAnswerEvaluatorJobs({ now, limit: 1 })` followed by `claimOpenAnswerEvaluatorJob`.
- Return an accepted no-op summary when `claim_next` finds no claimable job.
- Prove unknown, leased, terminal, and not-yet-due retry jobs reject before prompt input reads or provider adapter calls.

**Dependencies**: implemented evaluator orchestration commands and claimable-job reads.

**Risks**: worker code can accidentally duplicate claim ordering or bypass Student Workspace lease behavior. Keep claiming entirely behind existing Student Workspace commands and test that rejected claims do not call adapters.

**TDD sequence**:

1. RED/GREEN malformed worker inputs reject with `validation_failed`.
2. RED/GREEN `single_job` claims only the requested waiting job.
3. RED/GREEN `claim_next` claims the first job returned by `listClaimableOpenAnswerEvaluatorJobs({ now, limit: 1 })`.
4. RED/GREEN `claim_next` returns an accepted no-op summary when nothing is claimable.
5. RED/GREEN unknown, leased, terminal, and not-yet-due retry jobs reject before provider adapter calls.
6. RED/GREEN worker result summaries expose claim/completion/retry/failure booleans without raw artifacts.

**Validation**:

- Targeted Student Workspace worker tests for validation, `single_job`, `claim_next`, no-op, rejected claims, and no provider call before claim success.
- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

**Completion signal**: Phase 1 tests pass, full Node gates pass, and local commit `add agonara evaluator worker substrate` is created.

## Phase 2 — Evaluator policy and provider adapter resolution

**Status**: [x] complete

**Objective**: require a governed evaluator policy and matching provider adapter before worker execution can build provider requests.

**Key work items**:

- Add evaluator policy registry/dependency to the Student Workspace worker composition path.
- Add provider adapter registry/dependency to the Student Workspace worker composition path.
- Resolve the claimed job's `evaluatorPolicyId`.
- Reject missing policies with `evaluator_policy_not_found`.
- Reject policies whose evaluator path kind does not match the claimed job.
- Reject policies with non-`none` raw artifact policy.
- Reject policies whose prompt input policy omits submitted answer, accepted check revision, or accepted criterion revisions.
- Reject policies with malformed provider adapter id, output validator policy id, redaction policy id, or retry policy mismatch against the claimed job.
- Resolve exactly one provider adapter and reject missing or path-kind mismatched adapters.
- Prove policy/adapter failures do not mutate accepted corpus, Program Membership, Identity, session, credential, Admin authority, CSRF, final evaluation, or backup state.

**Dependencies**: Phase 1.

**Risks**: policy resolution could become hidden defaults. Require explicit policy and adapter dependencies in tests; no fallback provider or default policy is allowed.

**TDD sequence**:

1. RED/GREEN missing evaluator policy rejects with `evaluator_policy_not_found`.
2. RED/GREEN mismatched evaluator path kind rejects with `validation_failed`.
3. RED/GREEN non-`none` raw artifact policy rejects with `validation_failed`.
4. RED/GREEN malformed prompt input policy, provider adapter id, output validator policy id, redaction policy id, and retry policy mismatch reject with `validation_failed`.
5. RED/GREEN missing provider adapter rejects with `provider_adapter_not_found`.
6. RED/GREEN mismatched provider adapter path kind rejects with `validation_failed`.
7. RED/GREEN rejected policy/adapter resolution leaves adjacent ownership domains unchanged.

**Validation**:

- Targeted worker tests for policy resolution, missing/malformed/mismatched policies, adapter resolution, missing/mismatched adapters, and non-mutation boundaries.
- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

**Completion signal**: Phase 2 tests pass, full Node gates pass, and local commit `implement agonara evaluator worker policy resolution` is created.

## Phase 3 — Provider request construction and redaction

**Status**: [ ] pending

**Objective**: build provider requests from claimed job state, accepted revision snapshots, and submitted answers while excluding credentials, raw artifacts, and operational details.

**Key work items**:

- Read prompt inputs only after a successful claim and valid policy/adapter resolution.
- Build provider requests containing evaluator job id, attempt id, Program id, Student Identity id, accepted check revision id, accepted criterion revision ids, submitted answer, evaluator policy id, and output validator policy id.
- Ensure provider requests do not include provider credentials, authorization headers, cookies, CSRF tokens, session identifiers, raw prompt transcripts, raw model responses, SQL text, stack traces, filesystem paths, database URLs, hidden policy instructions, or infrastructure details.
- Ensure provider request construction does not read mutable draft curator state as accepted corpus.
- Prove provider requests use accepted revision snapshots from the job, not current accepted revisions after curator changes.

**Dependencies**: Phase 2.

**Risks**: provider request construction can drift into prompt-template implementation or raw artifact storage. Keep this phase to structured request fields and redaction checks; prompt template text remains out of scope.

**TDD sequence**:

1. RED/GREEN provider request is built only after successful claim and policy/adapter resolution.
2. RED/GREEN provider request includes job, attempt, Program, Student Identity, accepted check revision, accepted criterion revision, submitted answer, evaluator policy, and output validator policy identifiers.
3. RED/GREEN provider request omits credentials, authorization headers, cookies, CSRF tokens, session identifiers, raw prompt transcripts, raw model responses, SQL text, stack traces, filesystem paths, database URLs, hidden policy instructions, and infrastructure details.
4. RED/GREEN provider request uses snapshotted accepted revision ids after current accepted revisions change.
5. RED/GREEN provider request construction does not read draft curator state as accepted corpus.

**Validation**:

- Targeted worker tests for provider request contents, forbidden-field exclusion, post-claim read timing, accepted-revision snapshot preservation, and draft curator state exclusion.
- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

**Completion signal**: Phase 3 tests pass, full Node gates pass, and local commit `implement agonara evaluator worker request construction` is created.

## Phase 4 — Provider output validation and budget failure

**Status**: [ ] pending

**Objective**: validate provider output and budget before completion, routing invalid post-claim provider results through Student Workspace retry/failure behavior.

**Key work items**:

- Validate structured provider results and treat thrown adapter failures or malformed adapter results as `provider_execution_failed`.
- Normalize provider usage.
- Enforce job budget policy before completion and route over-budget output through `failOpenAnswerEvaluatorJob` with `retryRequested: true` and `failureReason: "provider_budget_exceeded"`.
- Require matching passed output validation for deterministic and LLM-assisted provider output.
- Reject missing, failed, mismatched, or malformed output validation through `failOpenAnswerEvaluatorJob` with `failureReason: "provider_output_rejected"`.
- Validate criterion feedback covers exactly the job's accepted criterion revision ids.
- Validate summary feedback, criterion feedback, and redacted evidence summaries against unsafe detail rules.
- Prove failed provider output does not record final evaluation feedback.

**Dependencies**: Phase 3.

**Risks**: post-claim provider failures can be modeled as ordinary envelope rejections and leave leased jobs stuck. Every post-claim provider failure must call Student Workspace failure behavior and produce either retry-waiting or terminal failed job state.

**TDD sequence**:

1. RED/GREEN thrown adapter failures fail the claimed job with `failureReason: "provider_execution_failed"`.
2. RED/GREEN malformed adapter results fail the claimed job with `failureReason: "provider_execution_failed"`.
3. RED/GREEN over-budget provider usage fails the claimed job with `failureReason: "provider_budget_exceeded"` before completion.
4. RED/GREEN missing, failed, mismatched, or malformed output validation fails the claimed job with `failureReason: "provider_output_rejected"`.
5. RED/GREEN missing, duplicate, unknown, or extra criterion feedback fails the claimed job with `failureReason: "provider_output_rejected"`.
6. RED/GREEN unsafe summary, criterion feedback, or redacted evidence summary fails the claimed job with `failureReason: "provider_output_rejected"`.
7. RED/GREEN retryable provider failure produces retry-waiting state and exhausted provider failure records active evaluation failure.

**Validation**:

- Targeted worker tests for thrown/malformed adapter results, budget failure, output validation failure, criterion feedback mismatch, unsafe feedback, unsafe evidence summary, failure reason summaries, retry-waiting state, exhausted failure state, and absence of final evaluation on provider failure.
- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

**Completion signal**: Phase 4 tests pass, full Node gates pass, and local commit `implement agonara evaluator worker output gates` is created.

## Phase 5 — Redacted evidence and successful completion

**Status**: [ ] pending

**Objective**: record optional redacted evidence and complete valid provider output through existing Student Workspace leased job commands.

**Key work items**:

- Record `redactedEvidenceSummary` through `recordOpenAnswerEvaluatorJobEvidence` using the active lease when present.
- Complete valid provider output through `completeOpenAnswerEvaluatorJob` using the active lease.
- Return accepted summaries for successful completion with `claimed: true`, `completed: true`, `retried: false`, and `failed: false`.
- Preserve equivalent repeated completion idempotency and reject repeated worker execution against succeeded jobs without duplicate final evaluations.
- Prove evidence and completion revalidate leases through Student Workspace commands and do not write storage directly.
- Prove stale lease, mismatched lease, cancelled job, timed-out job, and terminal job cases reject through Student Workspace commands.

**Dependencies**: Phase 4.

**Risks**: worker success can bypass the existing idempotency and lease checks if it writes directly. Keep completion and evidence exclusively behind existing Student Workspace commands.

**TDD sequence**:

1. RED/GREEN worker records redacted evidence through `recordOpenAnswerEvaluatorJobEvidence` using the active lease.
2. RED/GREEN worker completes valid provider output through `completeOpenAnswerEvaluatorJob` using the active lease.
3. RED/GREEN successful worker execution records exactly one final evaluation.
4. RED/GREEN repeated worker execution against succeeded jobs rejects and does not create duplicate final evaluations.
5. RED/GREEN stale lease, mismatched lease, cancelled job, timed-out job, and terminal job cases reject through Student Workspace commands.
6. RED/GREEN worker evidence and completion tests prove no direct storage mutation path is used.

**Validation**:

- Targeted worker tests for evidence recording, successful completion, final evaluation uniqueness, repeated execution, lease mismatch, stale lease, cancelled/timed-out/terminal job conflicts, and direct-storage-write absence.
- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

**Completion signal**: Phase 5 tests pass, full Node gates pass, and local commit `implement agonara evaluator worker completion` is created.

## Phase 6 — Ownership boundaries and side-effect isolation

**Status**: [ ] pending

**Objective**: prove provider adapters and worker execution cannot mutate adjacent Agonara ownership domains or introduce out-of-scope surfaces.

**Key work items**:

- Add tests proving provider adapters are side-effect-limited test doubles and cannot directly mutate Student Workspace, Corpus Storage, Program Membership, Identity, session, credential, Admin authority, CSRF, or backup state through the worker contract.
- Prove worker execution does not mutate accepted checks, accepted criteria, accepted revisions, source records, curator candidates, Program Membership state, Identity state, sessions, credentials, Admin authority, or CSRF state.
- Prove worker execution does not create public HTTP evaluator mutation routes, CLI commands, durable queue state, external provider calls, human-review queues, UI, mastery, weak-area, progress, next-step, grading, analytics, reporting, deployment targets, infrastructure ports, or worker topology assumptions.
- Keep Agonara logs updated for the implementation slice.

**Dependencies**: Phase 5.

**Risks**: boundary tests can become brittle string scans. Prefer domain-state snapshots and narrow surface guards; use string scans only for explicit out-of-scope public surfaces.

**TDD sequence**:

1. RED/GREEN provider adapter test doubles cannot mutate adjacent ownership domains through the worker contract.
2. RED/GREEN worker execution preserves accepted checks, accepted criteria, accepted revisions, source records, and curator candidates.
3. RED/GREEN worker execution preserves Program Membership, Identity, session, credential, Admin authority, and CSRF state.
4. RED/GREEN worker execution does not create public HTTP evaluator mutation routes, CLI commands, durable queue state, external provider calls, human-review queues, UI, mastery, weak-area, progress, next-step, grading, analytics, reporting, deployment target, infrastructure port, or worker topology surfaces.
5. RED/GREEN Agonara log reflects the implementation slice without leaking raw artifacts or credentials.

**Validation**:

- Targeted worker boundary tests for adjacent-domain non-mutation and out-of-scope surface guards.
- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

**Completion signal**: Phase 6 tests pass, full Node gates pass, and local commit `harden agonara evaluator worker boundaries` is created.

## Phase 7 — Backup, restore, executable acceptance, and closeout

**Status**: [ ] pending

**Objective**: prove worker execution remains backup/restore-safe, add executable acceptance, update traceability, and archive the completed plan.

**Key work items**:

- Extend or add backup/restore tests proving raw evaluator artifacts are not exported, restored, logged, or surfaced in summaries after worker execution.
- Add executable acceptance covering submit, schedule, worker claim, provider request from accepted revisions/submitted answer, deterministic adapter output, redacted evidence, completion, duplicate-safe completion, redaction, backup/restore exclusion, and out-of-scope surface guards.
- Update [Product Intent](../intent_learning_program_app.md) traceability to the implemented worker plan path after archive.
- Update [Agonara log](../log.md) with implementation closeout.
- Move this plan to `agonara/docs/plans/implemented/student-workspace-open-answer-evaluator-worker.md` in the same change set as implementation closeout.
- Rewrite this plan's relative links for the `plans/implemented/` location before committing the archive move.

**Dependencies**: Phase 6.

**Risks**: executable acceptance can accidentally hide missing edge-case coverage behind a happy path. Keep edge cases in prior targeted tests and use acceptance to prove the full worker contract and boundary in one flow.

**TDD sequence**:

1. RED/GREEN backup export after worker execution excludes raw evaluator artifacts.
2. RED/GREEN restore rejects forged worker/evaluator records carrying raw evaluator artifacts or unsafe summaries.
3. RED/GREEN executable acceptance covers submit, schedule, worker claim, provider request, deterministic adapter output, redacted evidence, completion, duplicate-safe completion, redaction, and backup/restore exclusion.
4. RED/GREEN executable acceptance proves no public HTTP mutation route, durable queue, external provider call, UI, mastery, weak-area, progress, next-step, grading, analytics, reporting, deployment target, or infrastructure port behavior is introduced.
5. GREEN archive move updates Product Intent traceability and archive-relative links.

**Validation**:

- Targeted backup/restore tests for raw-artifact exclusion after worker execution.
- Executable acceptance test for the complete worker flow.
- Docs gate verifies Product Intent traceability and archive-relative links.
- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`

**Completion signal**: Phase 7 tests pass, full Node gates pass, the plan is archived under `agonara/docs/plans/implemented/`, and local commit `archive agonara evaluator worker plan` is created.

## Done criteria

- All phases are complete.
- The worker command contract in [Student Workspace Open-Answer Evaluator Worker](../specs/student-workspace-open-answer-evaluator-worker.md) is implemented and covered by tests.
- Worker execution consumes existing Student Workspace evaluator job commands for claim, evidence, completion, and failure.
- Evaluator policies define prompt inputs, output validation, provider adapter, redaction, retry, budget, and raw-artifact handling before provider execution.
- Provider adapters are side-effect-limited and cannot mutate Student Workspace, Corpus Storage, Program Membership, Identity, session, credential, Admin authority, CSRF, or backup state directly.
- Provider requests and run summaries exclude credentials, raw artifacts, and operational secrets.
- Provider output is validated before final feedback is accepted.
- Budget limits are enforced before completion.
- Adapter failures, provider budget rejection, malformed output, and output validation rejection flow through Student Workspace retry/failure behavior.
- Successful worker execution records at most one final evaluation for the job.
- Raw evaluator artifacts are not persisted, exported in backups, restored from backups, logged, or surfaced in summaries.
- Public HTTP evaluator mutation routes, CLI commands, durable queue technology, external LLM calls, human-review queues, UI, mastery, weak-area, progress, next-step, grading, analytics, reporting, deployment topology, and infrastructure ports remain out of scope.
- Agonara log and Product Intent traceability are updated.
- Full Node test and build gates pass.
- Completed plan is moved to `agonara/docs/plans/implemented/` in the same change set as implementation closeout.

## Final closeout

Final gates:

- `./scripts/run_silent.sh "agonara tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test`
- `./scripts/run_silent.sh "build" env PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx tsc --noEmit`
- `git diff --check`

Archive plan: move to `agonara/docs/plans/implemented/student-workspace-open-answer-evaluator-worker.md`
Commit archive move: yes
Push/PR: follow push policy (`no push`)
