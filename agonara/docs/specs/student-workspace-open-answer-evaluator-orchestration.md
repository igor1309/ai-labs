---
date: 2026-06-02
model: gpt-5
description: "Spec: Agonara Student Workspace open-answer evaluator orchestration contract."
version: 0.0.1
status: implemented
type: spec
---

# Student Workspace Open-Answer Evaluator Orchestration

## Goal

Define the Agonara v0.0.1 Student Workspace domain contract for scheduling, claiming, retrying, cancelling, timing out, and completing open-answer evaluator work.

This spec operationalizes [ADR-014](../adr/adr-014-student-workspace-open-answer-evaluator-orchestration.md), extends [Student Workspace Open-Answer Evaluation Status and Evidence](student-workspace-open-answer-evaluation-status-and-evidence.md), and preserves STU-13 and INT-05 from [Product Intent](../intent/intent_learning_program_app.md). It does not add public HTTP evaluation mutation routes, queue technology, LLM provider calls, prompt construction, human review queues, UI, mastery, weak-area, progress, next-step, grading, analytics, or deployment topology.

## Implementation status

Implemented by [Student Workspace Open-Answer Evaluator Orchestration Implementation Plan](../plans/implemented/student-workspace-open-answer-evaluator-orchestration.md).

### Implementation Evidence

- Student Workspace orchestration commands and queries: [student-workspace.js](../../src/student-workspace.js)
- Evaluator job persistence, claimable reads, backup, and restore validation: [storage.js](../../src/storage.js)
- Student Workspace domain coverage: [student-workspace.test.js](../../tests/student-workspace.test.js)
- Storage coverage: [storage.test.js](../../tests/storage.test.js)
- Backup/restore coverage: [backup-restore.test.js](../../tests/backup-restore.test.js)
- Executable acceptance coverage: [executable-acceptance-corpus-navigation.test.js](../../tests/executable-acceptance-corpus-navigation.test.js)

The implemented orchestration slice supports scheduling evaluator jobs, claim and renewal leases, leased evidence recording, leased completion, retry/failure behavior, cancellation, timeout recovery, claimable-job reads, backup/restore preservation, redaction, and duplicate-safe final evaluation. It does not implement public evaluator mutation routes, queue technology, provider calls, prompt construction, human-review queues, UI, mastery/progress surfaces, deployment topology, or infrastructure ports.

## Public interface

The interface below is a Student Workspace domain contract. Product-facing HTTP evaluator mutation routes remain out of scope.

### Shared result envelope

```ts
type StudentWorkspaceEvaluatorOrchestrationResult<T> =
  | { status: "accepted"; value: T }
  | { status: "rejected"; reason: StudentWorkspaceEvaluatorOrchestrationRejectionReason };

type StudentWorkspaceEvaluatorOrchestrationRejectionReason =
  | "identity_not_active"
  | "attempt_not_found"
  | "attempt_already_evaluating"
  | "attempt_already_evaluated"
  | "evaluator_job_not_found"
  | "evaluator_job_conflict"
  | "evaluator_job_not_claimed"
  | "evaluator_job_lease_active"
  | "evaluator_job_lease_mismatch"
  | "evaluator_job_lease_expired"
  | "evaluator_budget_exceeded"
  | "evaluator_output_rejected"
  | "validation_failed";
```

### Job, lease, and policy shapes

```ts
type OpenAnswerEvaluatorPathKind =
  | "student_workspace"
  | "deterministic"
  | "llm_assisted"
  | "human_reviewed";

type OpenAnswerEvaluatorJobStatus =
  | "waiting"
  | "leased"
  | "retry_waiting"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out";

type OpenAnswerEvaluatorRetryPolicy = {
  maxAttempts: number;
  backoffSeconds: number[];
};

type OpenAnswerEvaluatorBudgetPolicy = {
  maxProviderCalls?: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxEstimatedCostMinorUnits?: number;
};

type OpenAnswerEvaluatorOutputValidation = {
  validatorPolicyId: string;
  passed: boolean;
  rejectedReason?: string;
};

type OpenAnswerEvaluatorLease = {
  leaseId: string;
  workerId: string;
  claimedAt: string;
  expiresAt: string;
};

type OpenAnswerEvaluatorJob = {
  evaluatorJobId: string;
  evaluatorRunId: string;
  attemptId: string;
  programId: string;
  studentIdentityId: string;
  checkRevisionId: string;
  criterionRevisionIds: string[];
  evaluatorPathKind: OpenAnswerEvaluatorPathKind;
  evaluatorPolicyId: string;
  status: OpenAnswerEvaluatorJobStatus;
  attemptNumber: number;
  retryPolicy: OpenAnswerEvaluatorRetryPolicy;
  budgetPolicy?: OpenAnswerEvaluatorBudgetPolicy;
  lease?: OpenAnswerEvaluatorLease;
  nextRetryAt?: string;
  cancellationReason?: string;
  timeoutReason?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
};

type OpenAnswerEvaluatorJobClaim = {
  evaluatorJob: OpenAnswerEvaluatorJob;
  lease: OpenAnswerEvaluatorLease;
};
```

`evaluatorJobId` may be the same identifier as `evaluatorRunId` or may identify a separate worker-claim record linked to the evaluator run. This spec defines observable behavior, not storage layout.

### Commands

```ts
scheduleOpenAnswerEvaluatorJob(input: {
  attemptId: string;
  evaluatorPathKind: OpenAnswerEvaluatorPathKind;
  evaluatorPolicyId: string;
  retryPolicy: OpenAnswerEvaluatorRetryPolicy;
  budgetPolicy?: OpenAnswerEvaluatorBudgetPolicy;
  requestedByIdentityId?: string;
  reviewerIdentityId?: string;
  reviewerCapability?: string;
}) -> StudentWorkspaceEvaluatorOrchestrationResult<{
  evaluatorJob: OpenAnswerEvaluatorJob;
  attempt: OpenAnswerAttemptSummary;
}>

claimOpenAnswerEvaluatorJob(input: {
  evaluatorJobId: string;
  workerId: string;
  leaseDurationSeconds: number;
  now: string;
}) -> StudentWorkspaceEvaluatorOrchestrationResult<OpenAnswerEvaluatorJobClaim>

renewOpenAnswerEvaluatorJobLease(input: {
  evaluatorJobId: string;
  leaseId: string;
  workerId: string;
  leaseDurationSeconds: number;
  now: string;
}) -> StudentWorkspaceEvaluatorOrchestrationResult<OpenAnswerEvaluatorJobClaim>

recordOpenAnswerEvaluatorJobEvidence(input: {
  evaluatorJobId: string;
  leaseId: string;
  workerId: string;
  evidenceKind: string;
  redactedSummary?: string;
}) -> StudentWorkspaceEvaluatorOrchestrationResult<{
  evaluatorJob: OpenAnswerEvaluatorJob;
  evidence: OpenAnswerEvaluatorEvidence;
}>

completeOpenAnswerEvaluatorJob(input: {
  evaluatorJobId: string;
  leaseId: string;
  workerId: string;
  summaryFeedback: string;
  criterionFeedback: OpenAnswerEvaluationCriterionFeedback[];
  providerUsage?: {
    providerCallCount?: number;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostMinorUnits?: number;
  };
  outputValidation?: OpenAnswerEvaluatorOutputValidation;
}) -> StudentWorkspaceEvaluatorOrchestrationResult<{
  evaluatorJob: OpenAnswerEvaluatorJob;
  attempt: OpenAnswerAttemptSummary;
  evaluation: OpenAnswerEvaluationSummary;
}>

failOpenAnswerEvaluatorJob(input: {
  evaluatorJobId: string;
  leaseId: string;
  workerId: string;
  reason: string;
  retryRequested: boolean;
  now: string;
}) -> StudentWorkspaceEvaluatorOrchestrationResult<{
  evaluatorJob: OpenAnswerEvaluatorJob;
  attempt: OpenAnswerAttemptSummary;
  evaluationFailure?: { reason: string; failedAt: string };
}>

cancelOpenAnswerEvaluatorJob(input: {
  evaluatorJobId: string;
  reason: string;
}) -> StudentWorkspaceEvaluatorOrchestrationResult<{
  evaluatorJob: OpenAnswerEvaluatorJob;
  attempt: OpenAnswerAttemptSummary;
}>

timeOutOpenAnswerEvaluatorJob(input: {
  evaluatorJobId: string;
  now: string;
  reason: string;
}) -> StudentWorkspaceEvaluatorOrchestrationResult<{
  evaluatorJob: OpenAnswerEvaluatorJob;
  attempt: OpenAnswerAttemptSummary;
  evaluationFailure: { reason: string; failedAt: string };
}>
```

### Queries

```ts
getOpenAnswerEvaluatorJob(input: {
  evaluatorJobId: string;
}) -> StudentWorkspaceEvaluatorOrchestrationResult<{
  evaluatorJob: OpenAnswerEvaluatorJob;
}>

listClaimableOpenAnswerEvaluatorJobs(input: {
  now: string;
  limit?: number;
}) -> StudentWorkspaceEvaluatorOrchestrationResult<{
  evaluatorJobs: OpenAnswerEvaluatorJob[];
}>
```

These commands and queries are internal Student Workspace domain operations. Ordinary Student, Program Curator, and Admin product flows do not receive direct evaluator-job mutation authority from this spec.

## Behavior rules

1. `scheduleOpenAnswerEvaluatorJob` rejects unknown attempts with `attempt_not_found`.
2. `scheduleOpenAnswerEvaluatorJob` rejects attempts already in `evaluating` status with `attempt_already_evaluating`.
3. `scheduleOpenAnswerEvaluatorJob` rejects attempts already in `evaluated` status with `attempt_already_evaluated`.
4. `scheduleOpenAnswerEvaluatorJob` accepts attempts in `submitted` or `evaluation_failed` status.
5. `scheduleOpenAnswerEvaluatorJob` validates `evaluatorPathKind`, `evaluatorPolicyId`, requester attribution, and human-review attribution using the same rules as `beginOpenAnswerEvaluatorRun`.
6. `scheduleOpenAnswerEvaluatorJob` rejects missing, non-integer, zero, or negative `retryPolicy.maxAttempts` with `validation_failed`.
7. `scheduleOpenAnswerEvaluatorJob` rejects a `retryPolicy.backoffSeconds` value that is missing, not an array, contains negative values, contains non-integers, or has fewer entries than `maxAttempts - 1` with `validation_failed`.
8. `scheduleOpenAnswerEvaluatorJob` rejects a malformed `budgetPolicy` with `validation_failed`.
9. `scheduleOpenAnswerEvaluatorJob` records a job in `waiting` status with `attemptNumber: 1`.
10. `scheduleOpenAnswerEvaluatorJob` links the job to one evaluator run and snapshots the attempt's Program, Student Identity, accepted check revision id, and accepted criterion revision ids.
11. `scheduleOpenAnswerEvaluatorJob` changes the attempt status to `evaluating`.
12. `scheduleOpenAnswerEvaluatorJob` clears the active evaluation failure only after preserving enough prior failure state for cancellation restoration.
13. `scheduleOpenAnswerEvaluatorJob` must not create a duplicate attempt.
14. `scheduleOpenAnswerEvaluatorJob` must not expose raw prompts, raw model responses, provider diagnostics, reviewer notes, secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
15. `claimOpenAnswerEvaluatorJob` rejects unknown jobs with `evaluator_job_not_found`.
16. `claimOpenAnswerEvaluatorJob` rejects missing, empty, whitespace-only, or non-string `workerId` with `validation_failed`.
17. `claimOpenAnswerEvaluatorJob` rejects missing, non-integer, zero, or negative `leaseDurationSeconds` with `validation_failed`.
18. `claimOpenAnswerEvaluatorJob` accepts jobs in `waiting` status.
19. `claimOpenAnswerEvaluatorJob` accepts jobs in `retry_waiting` status only when `now` is greater than or equal to `nextRetryAt`.
20. `claimOpenAnswerEvaluatorJob` rejects `leased`, `succeeded`, `failed`, `cancelled`, and `timed_out` jobs with `evaluator_job_conflict`.
21. `claimOpenAnswerEvaluatorJob` changes the job status to `leased`, records a new lease id, records the worker id, and sets `expiresAt` to `now + leaseDurationSeconds`.
22. `claimOpenAnswerEvaluatorJob` must not mutate the submitted answer, accepted revision references, final evaluation state, accepted corpus, Program Membership, Identity, session, or CSRF state.
23. `renewOpenAnswerEvaluatorJobLease` rejects unknown jobs with `evaluator_job_not_found`.
24. `renewOpenAnswerEvaluatorJobLease` rejects non-`leased` jobs with `evaluator_job_not_claimed`.
25. `renewOpenAnswerEvaluatorJobLease` rejects mismatched `leaseId` or `workerId` with `evaluator_job_lease_mismatch`.
26. `renewOpenAnswerEvaluatorJobLease` rejects expired leases with `evaluator_job_lease_expired`.
27. `renewOpenAnswerEvaluatorJobLease` extends `expiresAt` to `now + leaseDurationSeconds` when the lease is valid.
28. `recordOpenAnswerEvaluatorJobEvidence` accepts evidence only for `leased` jobs with a valid, unexpired matching lease.
29. `recordOpenAnswerEvaluatorJobEvidence` applies the same evidence-kind, redacted-summary, internal-visibility, and raw-artifact exclusion rules as `recordOpenAnswerEvaluatorEvidence`.
30. `recordOpenAnswerEvaluatorJobEvidence` rejects unknown, unclaimed, mismatched-lease, expired-lease, and terminal-job cases with the specified reasons.
31. `completeOpenAnswerEvaluatorJob` accepts only `leased` jobs with a valid, unexpired matching lease.
32. `completeOpenAnswerEvaluatorJob` rejects provider usage that exceeds `budgetPolicy` with `evaluator_budget_exceeded`.
33. `completeOpenAnswerEvaluatorJob` requires `outputValidation` with a non-empty `validatorPolicyId` and `passed: true` for `llm_assisted` jobs.
34. `completeOpenAnswerEvaluatorJob` rejects `llm_assisted` completion with missing, malformed, or failed `outputValidation` using `evaluator_output_rejected` before feedback can be recorded.
35. `completeOpenAnswerEvaluatorJob` accepts omitted `outputValidation` for `student_workspace`, `deterministic`, and `human_reviewed` jobs.
36. `completeOpenAnswerEvaluatorJob` applies the same summary feedback, criterion feedback, supported outcome, duplicate criterion, missing criterion, extra criterion, and accepted criterion revision validation rules as `completeOpenAnswerEvaluatorRun`.
37. `completeOpenAnswerEvaluatorJob` changes the job status to `succeeded`, clears the lease, changes the evaluator run to `succeeded`, changes the attempt status to `evaluated`, clears active evaluation failure state, and records final evaluation feedback.
38. `completeOpenAnswerEvaluatorJob` is idempotent for repeated calls with the same `evaluatorJobId`, `leaseId`, `workerId`, equivalent final feedback, equivalent provider usage, and equivalent output validation after the job already succeeded.
39. `completeOpenAnswerEvaluatorJob` rejects attempts to complete a cancelled, failed, timed-out, superseded, or differently leased job with `evaluator_job_conflict` or `evaluator_job_lease_mismatch`.
40. `completeOpenAnswerEvaluatorJob` must not create duplicate final evaluation records for one successful job result.
41. `failOpenAnswerEvaluatorJob` accepts only `leased` jobs with a valid, unexpired matching lease.
42. `failOpenAnswerEvaluatorJob` rejects missing, empty, whitespace-only, or non-string reasons with `validation_failed`.
43. `failOpenAnswerEvaluatorJob` changes the job to `retry_waiting`, clears the lease, increments `attemptNumber`, and sets `nextRetryAt` from the retry policy when `retryRequested` is true and retry attempts remain.
44. `failOpenAnswerEvaluatorJob` changes the job to `failed`, clears the lease, changes the evaluator run to `failed`, changes the attempt status to `evaluation_failed`, and records an active evaluation failure when `retryRequested` is false.
45. `failOpenAnswerEvaluatorJob` changes the job to `failed` and records an active evaluation failure when `retryRequested` is true but retry attempts are exhausted.
46. `failOpenAnswerEvaluatorJob` must preserve submitted answer and accepted revision references.
47. `cancelOpenAnswerEvaluatorJob` accepts jobs in `waiting`, `retry_waiting`, or `leased` status.
48. `cancelOpenAnswerEvaluatorJob` rejects `succeeded`, `failed`, `cancelled`, and `timed_out` jobs with `evaluator_job_conflict`.
49. `cancelOpenAnswerEvaluatorJob` rejects missing, empty, whitespace-only, or non-string reasons with `validation_failed`.
50. `cancelOpenAnswerEvaluatorJob` changes the job to `cancelled`, clears any lease, changes the evaluator run to `cancelled`, and restores the attempt to `submitted` or `evaluation_failed` according to the pre-run failure state.
51. `cancelOpenAnswerEvaluatorJob` must make later completion, evidence, failure, renewal, or timeout calls for the cancelled job reject.
52. `timeOutOpenAnswerEvaluatorJob` accepts only `leased` jobs whose lease `expiresAt` is less than or equal to `now`.
53. `timeOutOpenAnswerEvaluatorJob` rejects unexpired leases with `evaluator_job_lease_active`.
54. `timeOutOpenAnswerEvaluatorJob` rejects terminal jobs with `evaluator_job_conflict`.
55. `timeOutOpenAnswerEvaluatorJob` changes the job to `timed_out`, clears the lease, changes the evaluator run to `failed`, changes the attempt status to `evaluation_failed`, and records an active timeout failure.
56. `timeOutOpenAnswerEvaluatorJob` must preserve submitted answer and accepted revision references.
57. `getOpenAnswerEvaluatorJob` returns the job by id without raw evaluator artifacts.
58. `listClaimableOpenAnswerEvaluatorJobs` returns only `waiting` jobs and `retry_waiting` jobs whose `nextRetryAt` is due.
59. `listClaimableOpenAnswerEvaluatorJobs` applies a bounded default and maximum limit.
60. All job responses must omit raw prompts, raw model responses, provider diagnostics, reviewer notes, secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, and infrastructure details.
61. Orchestration commands must not mutate accepted checks, accepted criteria, accepted revisions, source records, curator candidates, Program Membership state, Identity state, sessions, or CSRF state.
62. Orchestration commands must not create mastery, weak-area, progress, review-scheduling, next-step, grading, analytics, reporting, or institutional state.
63. This spec does not expose public HTTP evaluation mutation routes, CLI commands, Student UI, Admin UI, Curator UI, reviewer UI, LLM provider calls, raw prompt storage, human review queues, mastery, weak-area, progress, next-step, grading, analytics, reporting, queue technology, worker process topology, deployment target, or infrastructure port behavior.

## Product intent traceability

| Story | Behavior covered |
|---|---|
| STU-13 - Receive open-answer feedback | Orchestration makes feedback-producing work observable and recoverable instead of hiding long-running evaluation inside a request. |
| INT-05 - Submit an open answer and receive feedback tied to accepted criteria | Jobs preserve accepted check and criterion revision snapshots through claim, retry, timeout, cancellation, and completion. |

## Tests (required)

### Scheduling

1. `scheduleOpenAnswerEvaluatorJob` accepts a submitted attempt, creates a waiting job linked to one evaluator run, snapshots accepted revision references, and changes the attempt to `evaluating`.
2. `scheduleOpenAnswerEvaluatorJob` accepts an `evaluation_failed` attempt and preserves prior failure state for cancellation restoration.
3. `scheduleOpenAnswerEvaluatorJob` rejects unknown, evaluating, and evaluated attempts with the specified reasons.
4. `scheduleOpenAnswerEvaluatorJob` rejects malformed evaluator path, policy, requester, reviewer, retry policy, and budget policy inputs.
5. `scheduleOpenAnswerEvaluatorJob` does not duplicate attempts or mutate accepted corpus, Program Membership, Identity, session, or CSRF state.

### Claiming and Leases

6. `claimOpenAnswerEvaluatorJob` claims a waiting job, records a lease, and changes the job to `leased`.
7. `claimOpenAnswerEvaluatorJob` claims a due retry job and rejects a retry job whose `nextRetryAt` is still in the future.
8. `claimOpenAnswerEvaluatorJob` rejects malformed worker and lease inputs.
9. `claimOpenAnswerEvaluatorJob` rejects leased and terminal jobs with the specified reasons.
10. `renewOpenAnswerEvaluatorJobLease` extends a valid lease and rejects unknown, unclaimed, mismatched, and expired leases.

### Evidence and Completion

11. `recordOpenAnswerEvaluatorJobEvidence` records redacted internal evidence only when the job has a valid lease.
12. `recordOpenAnswerEvaluatorJobEvidence` rejects unknown, unclaimed, mismatched, expired, and terminal jobs.
13. `completeOpenAnswerEvaluatorJob` completes a valid leased job, records final feedback, marks job/run succeeded, changes the attempt to `evaluated`, and clears active failure state.
14. `completeOpenAnswerEvaluatorJob` rejects budget-exceeded provider usage.
15. `completeOpenAnswerEvaluatorJob` rejects missing, malformed, or failed output validation for `llm_assisted` jobs.
16. `completeOpenAnswerEvaluatorJob` accepts omitted output validation for non-LLM jobs.
17. `completeOpenAnswerEvaluatorJob` is idempotent for equivalent repeated completion under the same job and lease.
18. `completeOpenAnswerEvaluatorJob` does not create duplicate final evaluations.
19. `completeOpenAnswerEvaluatorJob` rejects cancelled, failed, timed-out, superseded, mismatched-lease, and expired-lease cases.

### Failure, Retry, Cancellation, and Timeout

20. `failOpenAnswerEvaluatorJob` schedules a retry when retry is requested and attempts remain.
21. `failOpenAnswerEvaluatorJob` records a final evaluation failure when retry is not requested.
22. `failOpenAnswerEvaluatorJob` records a final evaluation failure when retry is requested but attempts are exhausted.
23. `cancelOpenAnswerEvaluatorJob` cancels waiting, retry-waiting, and leased jobs and restores the attempt according to pre-run failure state.
24. `cancelOpenAnswerEvaluatorJob` makes later completion, evidence, failure, renewal, and timeout calls reject.
25. `timeOutOpenAnswerEvaluatorJob` times out an expired leased job and records an active timeout failure.
26. `timeOutOpenAnswerEvaluatorJob` rejects unexpired jobs with `evaluator_job_lease_active` and terminal jobs with `evaluator_job_conflict`.
27. Failure, retry, cancellation, and timeout preserve submitted answers and accepted revision references.

### Queries and Boundaries

28. `getOpenAnswerEvaluatorJob` returns job state without raw evaluator artifacts.
29. `listClaimableOpenAnswerEvaluatorJobs` returns only waiting and due retry jobs with bounded pagination.
30. Job responses satisfy the redaction rules.
31. Orchestration commands do not mutate accepted checks, accepted criteria, accepted revisions, source records, curator candidates, Program Membership state, Identity state, sessions, or CSRF state.
32. Orchestration commands do not create mastery, weak-area, progress, review-scheduling, next-step, grading, analytics, reporting, or institutional state.
33. Executable acceptance flow: a Student submits an open answer, Student Workspace schedules evaluator work, a worker claims the job, records redacted internal evidence, renews the lease, completes the job into final feedback tied to accepted criterion revision ids, verifies idempotent repeated completion, verifies non-claimable terminal state, verifies redaction, and verifies no public HTTP mutation route, UI, CLI, LLM provider call, human-review queue, mastery, weak-area, progress, next-step, grading, analytics, reporting, queue technology, worker topology, deployment target, or infrastructure port behavior is introduced.

## Done criteria

- Student Workspace exposes the evaluator orchestration command/query contract in this spec.
- Scheduled jobs link to one evaluator run and preserve attempt, Program, Student Identity, accepted check revision, and accepted criterion revision references.
- Claim, renew, evidence, completion, failure, retry, cancellation, and timeout behavior is explicit and testable.
- Leased worker operations require matching unexpired leases.
- Completion is idempotent for equivalent repeated completion and does not duplicate final evaluations.
- Retry behavior is bounded by explicit retry policy.
- Budget and LLM output-validation gates are specified before provider integration exists.
- Redaction rules prevent raw evaluator artifacts and operational secrets from surfacing through job responses.
- Accepted corpus, curator candidates, Program Membership, Identity, session, and CSRF state are not mutated by orchestration behavior.
- Mastery, weak-area, progress, review scheduling, next-step, grading, analytics, reporting, LLM provider calls, human-review workflow, UI, CLI, queue technology, worker topology, deployment targets, infrastructure ports, and public HTTP evaluator mutation routes remain out of scope.
- Every behavior rule is covered by a listed test or the executable acceptance flow.
