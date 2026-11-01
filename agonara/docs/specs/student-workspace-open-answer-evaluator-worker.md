---
date: 2026-06-02
model: gpt-5
description: "Spec: Agonara Student Workspace open-answer evaluator worker contract."
version: 0.0.1
status: implemented
type: spec
---

# Student Workspace Open-Answer Evaluator Worker

## Goal

Define the Agonara v0.0.1 contract for an in-process Student Workspace open-answer evaluator worker that claims evaluator jobs, executes a governed evaluator policy, and submits candidate results back through Student Workspace.

This spec operationalizes [ADR-015](../adr/adr-015-open-answer-evaluator-worker-provider-boundary.md), depends on [Student Workspace Open-Answer Evaluator Orchestration](student-workspace-open-answer-evaluator-orchestration.md), and preserves STU-13 and INT-05 from [Product Intent](../intent/intent_learning_program_app.md). It does not add public HTTP evaluator mutation routes, durable queue technology, external LLM calls, raw artifact persistence, raw artifact backup/export, human-review queues, UI, mastery, weak-area, progress, next-step, grading, analytics, or deployment topology.

## Implementation status

Implemented by [Student Workspace Open-Answer Evaluator Worker Implementation Plan](../plans/implemented/student-workspace-open-answer-evaluator-worker.md).

### Implementation Evidence

- Worker command and policy/provider boundary: [student-workspace.js](../../src/student-workspace.js)
- Worker and Student Workspace domain coverage: [student-workspace.test.js](../../tests/student-workspace.test.js)
- Backup/restore raw-artifact coverage: [backup-restore.test.js](../../tests/backup-restore.test.js)
- Executable acceptance coverage: [executable-acceptance-corpus-navigation.test.js](../../tests/executable-acceptance-corpus-navigation.test.js)

The implemented worker supports single-job and claim-next execution, Student Workspace-owned job claiming, policy and provider-adapter resolution, provider request redaction, output validation, budget checks, redacted evidence recording, leased completion/failure, retry and terminal failure handling, duplicate-safe final evaluation, and raw-artifact exclusion from summaries, logs, backup, and restore. It does not implement public evaluator mutation routes, durable queues, external provider calls by itself, raw artifact persistence, human-review queues, UI, mastery/progress surfaces, deployment topology, or infrastructure ports.

### Related Extension

The later [Open-Answer Evaluator Real-Provider Runtime](open-answer-evaluator-real-provider-runtime.md) spec reuses this worker boundary and is covered separately by [open-answer-evaluator-runtime.js](../../src/open-answer-evaluator-runtime.js) and [open-answer-evaluator-runtime.test.js](../../tests/open-answer-evaluator-runtime.test.js).

## Public interface

The interface below is an internal worker contract. Ordinary Student, Program Curator, and Admin product flows do not receive direct worker authority from this spec.

### Shared result envelope

```ts
type OpenAnswerEvaluatorWorkerResult<T> =
  | { status: "accepted"; value: T }
  | { status: "rejected"; reason: OpenAnswerEvaluatorWorkerRejectionReason };

type OpenAnswerEvaluatorWorkerRejectionReason =
  | "evaluator_job_not_found"
  | "evaluator_job_conflict"
  | "evaluator_job_lease_mismatch"
  | "evaluator_job_lease_expired"
  | "evaluator_policy_not_found"
  | "provider_adapter_not_found"
  | "validation_failed";

type OpenAnswerEvaluatorWorkerFailureReason =
  | "provider_budget_exceeded"
  | "provider_execution_failed"
  | "provider_output_rejected";
```

### Worker and policy shapes

```ts
type OpenAnswerEvaluatorWorkerMode = "single_job" | "claim_next";

type OpenAnswerEvaluatorPolicy = {
  evaluatorPolicyId: string;
  evaluatorPathKind: "deterministic" | "llm_assisted";
  providerAdapterId: string;
  outputValidatorPolicyId: string;
  promptInputPolicy: {
    includeSubmittedAnswer: true;
    includeAcceptedCheckRevision: true;
    includeAcceptedCriterionRevisions: true;
  };
  redactionPolicyId: string;
  retryPolicy: OpenAnswerEvaluatorRetryPolicy;
  budgetPolicy?: OpenAnswerEvaluatorBudgetPolicy;
  rawArtifactPolicy: "none";
};

type OpenAnswerEvaluatorWorkerInput = {
  workerId: string;
  mode: OpenAnswerEvaluatorWorkerMode;
  evaluatorJobId?: string;
  leaseDurationSeconds: number;
  now: string;
};

type OpenAnswerEvaluatorProviderRequest = {
  evaluatorJobId: string;
  attemptId: string;
  programId: string;
  studentIdentityId: string;
  checkRevisionId: string;
  criterionRevisionIds: string[];
  submittedAnswer: string;
  evaluatorPolicyId: string;
  outputValidatorPolicyId: string;
};

type OpenAnswerEvaluatorProviderResult = {
  summaryFeedback: string;
  criterionFeedback: OpenAnswerEvaluationCriterionFeedback[];
  providerUsage?: {
    providerCalls?: number;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostMinorUnits?: number;
  };
  outputValidation: OpenAnswerEvaluatorOutputValidation;
  redactedEvidenceSummary?: string;
};

type OpenAnswerEvaluatorProviderAdapter = {
  providerAdapterId: string;
  evaluatorPathKind: "deterministic" | "llm_assisted";
  evaluate(request: OpenAnswerEvaluatorProviderRequest) -> OpenAnswerEvaluatorProviderResult;
};

type OpenAnswerEvaluatorWorkerRunSummary = {
  mode: OpenAnswerEvaluatorWorkerMode;
  workerId: string;
  evaluatorJobId?: string;
  claimed: boolean;
  completed: boolean;
  retried: boolean;
  failed: boolean;
  rejectionReason?: OpenAnswerEvaluatorWorkerRejectionReason;
  failureReason?: OpenAnswerEvaluatorWorkerFailureReason;
};
```

`OpenAnswerEvaluatorRetryPolicy`, `OpenAnswerEvaluatorBudgetPolicy`, `OpenAnswerEvaluatorOutputValidation`, and `OpenAnswerEvaluationCriterionFeedback` are the same shapes defined by [Student Workspace Open-Answer Evaluator Orchestration](student-workspace-open-answer-evaluator-orchestration.md).

### Commands

```ts
runOpenAnswerEvaluatorWorkerOnce(input: OpenAnswerEvaluatorWorkerInput) -> OpenAnswerEvaluatorWorkerResult<{
  summary: OpenAnswerEvaluatorWorkerRunSummary;
  evaluatorJob?: OpenAnswerEvaluatorJob;
  evaluation?: OpenAnswerEvaluationSummary;
}>
```

## Behavior rules

1. `runOpenAnswerEvaluatorWorkerOnce` rejects missing, empty, whitespace-only, or non-string `workerId` with `validation_failed`.
2. `runOpenAnswerEvaluatorWorkerOnce` rejects missing, non-integer, zero, or negative `leaseDurationSeconds` with `validation_failed`.
3. `runOpenAnswerEvaluatorWorkerOnce` rejects malformed `mode` with `validation_failed`.
4. `single_job` mode rejects missing, empty, whitespace-only, or non-string `evaluatorJobId` with `validation_failed`.
5. `single_job` mode claims only the specified evaluator job.
6. `claim_next` mode claims the first job returned by `listClaimableOpenAnswerEvaluatorJobs({ now, limit: 1 })`.
7. `claim_next` mode returns an accepted summary with `claimed: false` when no job is claimable.
8. Unknown jobs reject with `evaluator_job_not_found`.
9. Leased, succeeded, failed, cancelled, timed-out, or not-yet-due retry jobs reject with `evaluator_job_conflict`.
10. The worker must claim a job through `claimOpenAnswerEvaluatorJob` before reading prompt inputs or calling a provider adapter.
11. The worker must use the claimed job's `evaluatorPolicyId` to resolve exactly one `OpenAnswerEvaluatorPolicy`.
12. Missing evaluator policies reject with `evaluator_policy_not_found`.
13. A policy whose `evaluatorPathKind` does not match the claimed job rejects with `validation_failed`.
14. A policy whose `rawArtifactPolicy` is not `"none"` rejects with `validation_failed`.
15. A policy whose prompt input policy omits the submitted answer, accepted check revision, or accepted criterion revisions rejects with `validation_failed`.
16. A policy with missing, empty, whitespace-only, or non-string `providerAdapterId`, `outputValidatorPolicyId`, or `redactionPolicyId` rejects with `validation_failed`.
17. A policy whose `retryPolicy` does not match the claimed job's `retryPolicy` rejects with `validation_failed`.
18. The worker must resolve exactly one provider adapter by `providerAdapterId`.
19. Missing provider adapters reject with `provider_adapter_not_found`.
20. A provider adapter whose `evaluatorPathKind` does not match the policy rejects with `validation_failed`.
21. The provider request must include the evaluator job id, attempt id, Program id, Student Identity id, accepted check revision id, accepted criterion revision ids, submitted answer, evaluator policy id, and output validator policy id.
22. The provider request must not include provider credentials, authorization headers, cookies, CSRF tokens, session identifiers, raw prompt transcripts, raw model responses, SQL text, stack traces, filesystem paths, database URLs, hidden policy instructions, or infrastructure details.
23. Provider adapters must return structured `OpenAnswerEvaluatorProviderResult` values.
24. Thrown adapter failures fail the claimed job through `failOpenAnswerEvaluatorJob` with `retryRequested: true` and `failureReason: "provider_execution_failed"`.
25. Malformed adapter results fail the claimed job through `failOpenAnswerEvaluatorJob` with `retryRequested: true` and `failureReason: "provider_execution_failed"`.
26. Provider usage is normalized before completion.
27. Provider usage that exceeds the claimed job's budget policy fails the claimed job through `failOpenAnswerEvaluatorJob` with `retryRequested: true` and `failureReason: "provider_budget_exceeded"`.
28. Provider usage summaries must not contain provider credentials, authorization headers, cookies, CSRF tokens, session identifiers, raw request payloads, raw response payloads, SQL text, stack traces, filesystem paths, database URLs, hidden policy instructions, or infrastructure details.
29. `llm_assisted` provider output must include output validation with the policy's `outputValidatorPolicyId` and `passed: true`.
30. `llm_assisted` provider output with missing, malformed, mismatched, or failed output validation fails the claimed job through `failOpenAnswerEvaluatorJob` with `retryRequested: true` and `failureReason: "provider_output_rejected"`.
31. Deterministic provider output must include output validation with the policy's `outputValidatorPolicyId` and `passed: true`.
32. Deterministic provider output with missing, malformed, mismatched, or failed output validation fails the claimed job through `failOpenAnswerEvaluatorJob` with `retryRequested: true` and `failureReason: "provider_output_rejected"`.
33. Provider output must include one criterion feedback entry for every accepted criterion revision id snapshotted on the job and no unknown criterion revision ids.
34. Provider output with missing, duplicate, unknown, or extra criterion feedback fails the claimed job through `failOpenAnswerEvaluatorJob` with `retryRequested: true` and `failureReason: "provider_output_rejected"`.
35. Provider output with missing, empty, whitespace-only, or unsafe `summaryFeedback` fails the claimed job through `failOpenAnswerEvaluatorJob` with `retryRequested: true` and `failureReason: "provider_output_rejected"`.
36. Provider output with unsafe criterion feedback or unsafe redacted evidence summary fails the claimed job through `failOpenAnswerEvaluatorJob` with `retryRequested: true` and `failureReason: "provider_output_rejected"`.
37. When `redactedEvidenceSummary` is present, the worker records it through `recordOpenAnswerEvaluatorJobEvidence` before completion.
38. Evidence recording must use the active lease returned by the claim.
39. Completion must use the active lease returned by the claim.
40. The worker must revalidate the active lease through Student Workspace evidence and completion commands rather than mutating storage directly.
41. Successful provider output completes the job through `completeOpenAnswerEvaluatorJob`.
42. Successful completion returns an accepted summary with `claimed: true`, `completed: true`, `retried: false`, and `failed: false`.
43. Equivalent repeated worker execution against an already succeeded job rejects with `evaluator_job_conflict` and must not create duplicate final evaluations.
44. Retryable worker failure returns an accepted summary with `claimed: true`, `completed: false`, `retried: true`, `failed: false`, and the provider failure reason.
45. Exhausted worker failure returns an accepted summary with `claimed: true`, `completed: false`, `retried: false`, `failed: true`, and the provider failure reason.
46. Worker failure handling must preserve submitted answers and accepted revision references.
47. If lease renewal is not part of the run, the worker must complete or fail within the claimed lease duration.
48. The worker must not create public HTTP evaluator mutation routes, CLI commands, durable queue state, external provider calls, raw artifact persistence, raw artifact backup/export, human-review queues, UI, mastery, weak-area, progress, next-step, grading, analytics, reporting, deployment targets, infrastructure ports, or worker topology assumptions.
49. The worker must not mutate accepted checks, accepted criteria, accepted revisions, source records, curator candidates, Program Membership state, Identity state, sessions, credentials, Admin authority, or CSRF state.
50. The worker must not expose raw prompts, raw model responses, provider diagnostics, reviewer notes, hidden policy instructions, provider credentials, secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details through run summaries, evaluator job summaries, evidence summaries, evaluation summaries, logs, backups, or restored summaries.

## Tests (required)

### Validation and Claiming

1. `runOpenAnswerEvaluatorWorkerOnce` rejects malformed `workerId`, `leaseDurationSeconds`, `mode`, and `single_job` `evaluatorJobId` inputs.
2. `single_job` mode claims only the requested waiting job.
3. `claim_next` mode claims the first claimable waiting job.
4. `claim_next` mode claims a due retry job and skips not-yet-due retry jobs.
5. `claim_next` mode returns an accepted no-op summary when no job is claimable.
6. The worker rejects unknown, leased, terminal, and not-yet-due retry jobs with the specified reasons.
7. The worker does not read prompt inputs or call the provider adapter when the claim is rejected.

### Policy and Adapter Resolution

8. The worker resolves the claimed job's evaluator policy and rejects missing policies.
9. The worker rejects policies with mismatched evaluator path kind, mismatched retry policy, malformed provider adapter id, malformed output validator policy id, malformed redaction policy id, malformed prompt input policy, or non-`none` raw artifact policy.
10. The worker resolves the policy's provider adapter and rejects missing adapters.
11. The worker rejects provider adapters whose evaluator path kind does not match the policy.

### Provider Request and Output

12. Provider requests include job, attempt, Program, Student Identity, accepted check revision, accepted criterion revision, submitted answer, evaluator policy, and output validator policy identifiers.
13. Provider requests omit credentials, authorization headers, cookies, CSRF tokens, session identifiers, raw prompt transcripts, raw model responses, SQL text, stack traces, filesystem paths, database URLs, hidden policy instructions, and infrastructure details.
14. Thrown adapter failures and malformed adapter results fail the claimed job through Student Workspace retry/failure behavior.
15. Provider usage is normalized and budget-exceeded usage fails the claimed job before completion.
16. Provider usage summaries omit credentials, raw request/response payloads, and operational secrets.
17. LLM-assisted output requires matching passed output validation.
18. Deterministic output requires matching passed output validation.
19. Missing, failed, mismatched, or malformed output validation fails the claimed job with `failureReason: "provider_output_rejected"`.
20. Missing, duplicate, unknown, or extra criterion feedback fails the claimed job with `failureReason: "provider_output_rejected"`.
21. Unsafe summary feedback, unsafe criterion feedback, and unsafe redacted evidence summaries fail the claimed job with `failureReason: "provider_output_rejected"`.

### Evidence, Completion, and Failure

22. The worker records redacted evidence through `recordOpenAnswerEvaluatorJobEvidence` using the active lease when `redactedEvidenceSummary` is present.
23. The worker completes valid provider output through `completeOpenAnswerEvaluatorJob` using the active lease.
24. Successful completion marks the job/run/attempt completed and records exactly one final evaluation.
25. Repeated worker execution against a succeeded job rejects and does not create a duplicate final evaluation.
26. Adapter failure before completion calls `failOpenAnswerEvaluatorJob` with `retryRequested: true`.
27. Provider budget or output rejection calls `failOpenAnswerEvaluatorJob` with `retryRequested: true` and returns the provider failure reason in the worker summary.
28. Retryable worker failure makes the job due according to retry policy and preserves accepted revision references.
29. Exhausted worker failure records an active evaluation failure and preserves accepted revision references.
30. Stale lease, mismatched lease, cancelled job, timed-out job, and terminal job cases reject through Student Workspace commands rather than storage writes.

### Boundary and Executable Acceptance

31. Worker execution does not mutate accepted checks, accepted criteria, accepted revisions, source records, curator candidates, Program Membership state, Identity state, sessions, credentials, Admin authority, or CSRF state.
32. Worker execution does not create public HTTP evaluator mutation routes, CLI commands, durable queue state, external provider calls, raw artifact persistence, raw artifact backup/export, human-review queues, UI, mastery, weak-area, progress, next-step, grading, analytics, reporting, deployment targets, infrastructure ports, or worker topology assumptions.
33. Worker summaries, evaluator job summaries, evidence summaries, evaluation summaries, logs, backups, and restored summaries satisfy raw-artifact and operational-secret redaction rules.
34. Executable acceptance flow: a Student submits an open answer, Student Workspace schedules evaluator work, the worker claims the job, builds a provider request from accepted revisions and submitted answer, receives deterministic adapter output, records redacted evidence, completes final feedback tied to accepted criterion revision ids, verifies duplicate-safe completion, verifies redaction, verifies backup/restore excludes raw artifacts, and verifies no public HTTP mutation route, durable queue, external provider call, UI, mastery, weak-area, progress, next-step, grading, analytics, reporting, deployment target, or infrastructure port behavior is introduced.

## Done criteria

- The in-process evaluator worker exposes the single-run command defined by this spec.
- Worker execution consumes the existing Student Workspace evaluator job contract for claim, evidence, completion, and failure.
- Evaluator policies define prompt inputs, output validation, provider adapter, redaction, retry, budget, and raw-artifact handling before provider execution.
- Provider adapters are side-effect-limited and cannot mutate Student Workspace, Corpus Storage, Program Membership, Identity, session, credential, Admin authority, CSRF, or backup state directly.
- Provider requests and run summaries exclude credentials, raw artifacts, and operational secrets.
- Provider output is validated before final feedback is accepted.
- Budget limits are enforced before completion.
- Adapter failures flow through Student Workspace retry/failure behavior.
- Successful execution records at most one final evaluation for the job.
- Raw evaluator artifacts are not persisted, exported in backups, restored from backups, logged, or surfaced in summaries.
- Public HTTP evaluator mutation routes, CLI commands, durable queue technology, external LLM calls, human-review queues, UI, mastery, weak-area, progress, next-step, grading, analytics, reporting, deployment topology, and infrastructure ports remain out of scope.
- Every behavior rule is covered by a listed test or the executable acceptance flow.
