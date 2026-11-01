---
date: 2026-06-02
model: gpt-5
description: "Spec: Agonara Student Workspace open-answer evaluation status and internal evidence contract."
version: 0.0.1
status: implemented
type: spec
---

# Student Workspace Open-Answer Evaluation Status and Evidence

## Goal

Define the Agonara v0.0.1 Student Workspace contract for explicit open-answer evaluation status and internal evaluator evidence while keeping final feedback Student Workspace-owned.

This spec operationalizes [ADR-013](../adr/adr-013-student-workspace-open-answer-evaluation-governance.md), extends the internal evaluation lifecycle from [Student Workspace Open-Answer Attempt First Slice](student-workspace-open-answer-attempt-first-slice.md), and preserves STU-13 and INT-05 from [Product Intent](../intent/intent_learning_program_app.md). It does not add public HTTP evaluation mutation routes, LLM provider calls, human review workflow, UI, mastery, weak-area, progress, next-step, grading, or analytics behavior.

## Implementation status

Implemented by [Student Workspace Open-Answer Evaluation Status and Evidence Implementation Plan](../plans/implemented/student-workspace-open-answer-evaluation-status-and-evidence.md).

### Implementation Evidence

- Student Workspace evaluator-run commands and owner-only queries: [student-workspace.js](../../src/student-workspace.js)
- Evaluator-run and internal-evidence persistence plus backup/restore validation: [storage.js](../../src/storage.js)
- Student Workspace domain coverage: [student-workspace.test.js](../../tests/student-workspace.test.js)
- Storage coverage: [storage.test.js](../../tests/storage.test.js)
- Backup/restore coverage: [backup-restore.test.js](../../tests/backup-restore.test.js)
- Executable acceptance coverage: [executable-acceptance-corpus-navigation.test.js](../../tests/executable-acceptance-corpus-navigation.test.js)

The implemented status/evidence slice supports explicit evaluator runs, internal redacted evidence metadata, terminal evaluation transitions, owner-only status/evidence reads, backup/restore preservation, redaction, human-review attribution validation, and preservation of accepted revision references. It does not implement public evaluation mutation routes, provider calls, human-review workflow, UI, mastery/progress surfaces, grading, analytics, or transport adapters.

## Public interface

The interface below is a Student Workspace domain contract. Product-facing HTTP evaluation mutation routes remain out of scope.

### Shared result envelope

```ts
type StudentWorkspaceEvaluationResult<T> =
  | { status: "accepted"; value: T }
  | { status: "rejected"; reason: StudentWorkspaceEvaluationRejectionReason };

type StudentWorkspaceEvaluationRejectionReason =
  | "identity_not_active"
  | "attempt_not_found"
  | "attempt_already_evaluating"
  | "attempt_already_evaluated"
  | "evaluator_run_not_found"
  | "evaluator_run_conflict"
  | "validation_failed";
```

### Status and evidence shapes

```ts
type OpenAnswerAttemptStatus =
  | "submitted"
  | "evaluating"
  | "evaluated"
  | "evaluation_failed";

type OpenAnswerEvaluatorPathKind =
  | "student_workspace"
  | "deterministic"
  | "llm_assisted"
  | "human_reviewed";

type OpenAnswerEvaluatorRunStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

type OpenAnswerEvaluatorEvidenceVisibility = "internal";

type OpenAnswerEvaluatorRun = {
  evaluatorRunId: string;
  attemptId: string;
  programId: string;
  studentIdentityId: string;
  checkRevisionId: string;
  criterionRevisionIds: string[];
  evaluatorPathKind: OpenAnswerEvaluatorPathKind;
  evaluatorPolicyId: string;
  status: OpenAnswerEvaluatorRunStatus;
  requestedByIdentityId?: string;
  reviewerIdentityId?: string;
  reviewerCapability?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  failureReason?: string;
};

type OpenAnswerEvaluatorEvidence = {
  evidenceId: string;
  evaluatorRunId: string;
  attemptId: string;
  evidenceKind: string;
  visibility: OpenAnswerEvaluatorEvidenceVisibility;
  redactedSummary?: string;
  recordedAt: string;
};

type OpenAnswerEvaluationStatusDetail = {
  attempt: OpenAnswerAttemptSummary;
  evaluatorRun?: OpenAnswerEvaluatorRun;
  evidence: OpenAnswerEvaluatorEvidence[];
  evaluation?: OpenAnswerEvaluationSummary;
  evaluationFailure?: {
    reason: string;
    failedAt: string;
  };
};
```

`OpenAnswerAttemptSummary` and `OpenAnswerEvaluationSummary` are the same shapes defined by [Student Workspace Open-Answer Attempt API](student-workspace-open-answer-attempt-api.md).

Evaluator evidence is internal Student Workspace evidence. The first evaluator evidence contract exposes only metadata and optional redacted summaries; it does not expose raw prompts, raw model responses, model metadata payloads, reviewer notes, hidden policy instructions, or evaluator diagnostics.

### Commands

```ts
beginOpenAnswerEvaluatorRun(input: {
  attemptId: string;
  evaluatorPathKind: OpenAnswerEvaluatorPathKind;
  evaluatorPolicyId: string;
  requestedByIdentityId?: string;
  reviewerIdentityId?: string;
  reviewerCapability?: string;
}) -> StudentWorkspaceEvaluationResult<{
  evaluatorRun: OpenAnswerEvaluatorRun;
  attempt: OpenAnswerAttemptSummary;
}>

recordOpenAnswerEvaluatorEvidence(input: {
  evaluatorRunId: string;
  evidenceKind: string;
  redactedSummary?: string;
}) -> StudentWorkspaceEvaluationResult<{
  evidence: OpenAnswerEvaluatorEvidence;
}>

completeOpenAnswerEvaluatorRun(input: {
  evaluatorRunId: string;
  summaryFeedback: string;
  criterionFeedback: OpenAnswerEvaluationCriterionFeedback[];
}) -> StudentWorkspaceEvaluationResult<{
  evaluatorRun: OpenAnswerEvaluatorRun;
  attempt: OpenAnswerAttemptSummary;
  evaluation: OpenAnswerEvaluationSummary;
}>

failOpenAnswerEvaluatorRun(input: {
  evaluatorRunId: string;
  reason: string;
}) -> StudentWorkspaceEvaluationResult<{
  evaluatorRun: OpenAnswerEvaluatorRun;
  attempt: OpenAnswerAttemptSummary;
  evaluationFailure: { reason: string; failedAt: string };
}>

cancelOpenAnswerEvaluatorRun(input: {
  evaluatorRunId: string;
  reason: string;
}) -> StudentWorkspaceEvaluationResult<{
  evaluatorRun: OpenAnswerEvaluatorRun;
  attempt: OpenAnswerAttemptSummary;
}>
```

### Queries

```ts
getOpenAnswerEvaluationStatus(input: {
  actingIdentityId: string;
  attemptId: string;
}) -> StudentWorkspaceEvaluationResult<OpenAnswerEvaluationStatusDetail>

listOpenAnswerEvaluatorEvidence(input: {
  actingIdentityId: string;
  evaluatorRunId: string;
}) -> StudentWorkspaceEvaluationResult<{
  evidence: OpenAnswerEvaluatorEvidence[];
}>
```

Status and evidence queries require the owning Student Identity. Program Curator and Admin reads are out of scope for ordinary product flows.

## Behavior rules

1. `beginOpenAnswerEvaluatorRun` rejects unknown attempts with `attempt_not_found`.
2. `beginOpenAnswerEvaluatorRun` rejects already `evaluating` attempts with `attempt_already_evaluating`.
3. `beginOpenAnswerEvaluatorRun` rejects already `evaluated` attempts with `attempt_already_evaluated`.
4. `beginOpenAnswerEvaluatorRun` accepts `submitted` and `evaluation_failed` attempts.
5. `beginOpenAnswerEvaluatorRun` requires a supported `evaluatorPathKind`.
6. `beginOpenAnswerEvaluatorRun` rejects missing, empty, whitespace-only, or non-string `evaluatorPolicyId` with `validation_failed`.
7. `beginOpenAnswerEvaluatorRun` changes the attempt status to `evaluating`.
8. `beginOpenAnswerEvaluatorRun` records an evaluator run in `running` status by default.
9. `beginOpenAnswerEvaluatorRun` snapshots the attempt's Program, Student Identity, accepted check revision id, and accepted criterion revision ids onto the evaluator run.
10. `beginOpenAnswerEvaluatorRun` records `requestedByIdentityId` only when provided as an active internal Identity.
11. `beginOpenAnswerEvaluatorRun` rejects inactive or unknown `requestedByIdentityId` with `identity_not_active`.
12. `beginOpenAnswerEvaluatorRun` requires `reviewerIdentityId` and `reviewerCapability` when `evaluatorPathKind` is `human_reviewed`.
13. `beginOpenAnswerEvaluatorRun` rejects `human_reviewed` runs with inactive or unknown `reviewerIdentityId` using `identity_not_active`.
14. `beginOpenAnswerEvaluatorRun` rejects `human_reviewed` runs with missing, empty, whitespace-only, or non-string `reviewerCapability` using `validation_failed`.
15. Non-human evaluator runs reject `reviewerIdentityId` or `reviewerCapability` with `validation_failed`.
16. `recordOpenAnswerEvaluatorEvidence` rejects unknown evaluator runs with `evaluator_run_not_found`.
17. `recordOpenAnswerEvaluatorEvidence` accepts evidence only for evaluator runs in `running` status.
18. `recordOpenAnswerEvaluatorEvidence` rejects evidence for `succeeded`, `failed`, or `cancelled` runs with `evaluator_run_conflict`.
19. `recordOpenAnswerEvaluatorEvidence` rejects missing, empty, whitespace-only, or non-string `evidenceKind` with `validation_failed`.
20. `recordOpenAnswerEvaluatorEvidence` stores evidence with `visibility: "internal"`.
21. `recordOpenAnswerEvaluatorEvidence` accepts an omitted `redactedSummary`.
22. `recordOpenAnswerEvaluatorEvidence` rejects non-string, empty, or whitespace-only `redactedSummary` values with `validation_failed` when the field is present.
23. `recordOpenAnswerEvaluatorEvidence` must not persist or return raw prompts, raw model responses, hidden policy instructions, model metadata payloads, evaluator diagnostics, reviewer notes, secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
24. `completeOpenAnswerEvaluatorRun` rejects unknown evaluator runs with `evaluator_run_not_found`.
25. `completeOpenAnswerEvaluatorRun` accepts only evaluator runs in `running` status.
26. `completeOpenAnswerEvaluatorRun` rejects `succeeded`, `failed`, or `cancelled` runs with `evaluator_run_conflict`.
27. `completeOpenAnswerEvaluatorRun` applies the same summary feedback, criterion feedback, supported outcome, duplicate criterion, missing criterion, extra criterion, and accepted criterion revision validation rules as `recordOpenAnswerEvaluation`.
28. `completeOpenAnswerEvaluatorRun` records the final evaluation outcome with `evaluatorKind: "student_workspace"` and preserves the run's `evaluatorPathKind` on the evaluator run.
29. `completeOpenAnswerEvaluatorRun` changes the evaluator run to `succeeded`.
30. `completeOpenAnswerEvaluatorRun` changes the attempt status to `evaluated`.
31. `completeOpenAnswerEvaluatorRun` clears any active evaluation failure for the attempt.
32. `completeOpenAnswerEvaluatorRun` must not mutate the submitted answer or accepted revision references.
33. `failOpenAnswerEvaluatorRun` rejects unknown evaluator runs with `evaluator_run_not_found`.
34. `failOpenAnswerEvaluatorRun` accepts only evaluator runs in `running` status.
35. `failOpenAnswerEvaluatorRun` rejects `succeeded`, `failed`, or `cancelled` runs with `evaluator_run_conflict`.
36. `failOpenAnswerEvaluatorRun` rejects missing, empty, whitespace-only, or non-string reasons with `validation_failed`.
37. `failOpenAnswerEvaluatorRun` changes the evaluator run to `failed`.
38. `failOpenAnswerEvaluatorRun` changes the attempt status to `evaluation_failed`.
39. `failOpenAnswerEvaluatorRun` records an active evaluation failure for the attempt.
40. `failOpenAnswerEvaluatorRun` preserves the submitted answer and accepted revision references.
41. `cancelOpenAnswerEvaluatorRun` rejects unknown evaluator runs with `evaluator_run_not_found`.
42. `cancelOpenAnswerEvaluatorRun` accepts only evaluator runs in `running` status.
43. `cancelOpenAnswerEvaluatorRun` rejects `succeeded`, `failed`, or `cancelled` runs with `evaluator_run_conflict`.
44. `cancelOpenAnswerEvaluatorRun` rejects missing, empty, whitespace-only, or non-string reasons with `validation_failed`.
45. `cancelOpenAnswerEvaluatorRun` changes the evaluator run to `cancelled`.
46. `cancelOpenAnswerEvaluatorRun` returns the attempt to `submitted` when no active evaluation failure existed before the run began.
47. `cancelOpenAnswerEvaluatorRun` returns the attempt to `evaluation_failed` when an active evaluation failure existed before the run began.
48. `cancelOpenAnswerEvaluatorRun` preserves the submitted answer, accepted revision references, and existing final evaluation state.
49. `getOpenAnswerEvaluationStatus` rejects inactive or unknown acting Identities with `identity_not_active`.
50. `getOpenAnswerEvaluationStatus` rejects unknown attempts with `attempt_not_found`.
51. `getOpenAnswerEvaluationStatus` rejects non-owning Students, Program Curators, Admins, and other callers with `attempt_not_found`.
52. `getOpenAnswerEvaluationStatus` returns the owning Student's attempt status, active evaluator run when present, internal evidence metadata, final evaluation when present, and active failure when present.
53. `listOpenAnswerEvaluatorEvidence` rejects inactive or unknown acting Identities with `identity_not_active`.
54. `listOpenAnswerEvaluatorEvidence` rejects unknown evaluator runs with `evaluator_run_not_found`.
55. `listOpenAnswerEvaluatorEvidence` rejects non-owning Students, Program Curators, Admins, and other callers with `attempt_not_found`.
56. `listOpenAnswerEvaluatorEvidence` returns only internal evidence metadata for the evaluator run.
57. Status and evidence responses must not expose raw prompts, raw model responses, hidden policy instructions, model metadata payloads, evaluator diagnostics, reviewer notes, secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
58. Evaluation status and evidence commands must not mutate accepted checks, accepted criteria, accepted revisions, source records, curator candidates, Program Membership state, Identity state, sessions, or CSRF state.
59. Evaluation status and evidence commands must not create mastery, weak-area, progress, review-scheduling, next-step, grading, analytics, reporting, or institutional state.
60. This spec does not expose public HTTP evaluation mutation routes, CLI commands, Student UI, Admin UI, Curator UI, Program Curator attempt reads, Admin attempt reads, LLM provider calls, raw prompt storage, human review queues, mastery calculation, weak-area calculation, progress interpretation, quick-check attempts, topic-level attempts, period-level attempts, or institutional grading behavior.

## Product intent traceability

| Story | Behavior covered |
|---|---|
| STU-13 - Receive open-answer feedback | Evaluation status keeps feedback availability explicit and returns final feedback only after Student Workspace records an evaluation outcome. |
| INT-05 - Submit an open answer and receive feedback tied to accepted criteria | Evaluator runs snapshot accepted check and criterion revision ids, and completed evaluations remain tied to those revision ids. |

## Tests (required)

### Status Lifecycle

1. `beginOpenAnswerEvaluatorRun` accepts a submitted attempt, changes the attempt to `evaluating`, and records a running evaluator run with accepted revision references.
2. `beginOpenAnswerEvaluatorRun` accepts an `evaluation_failed` attempt and preserves the previous failure for cancellation restoration.
3. `beginOpenAnswerEvaluatorRun` rejects unknown, evaluating, and evaluated attempts with the specified reasons.
4. `beginOpenAnswerEvaluatorRun` rejects malformed evaluator path kinds, malformed evaluator policy ids, inactive requested identities, and malformed reviewer attribution with the specified reasons.
5. `beginOpenAnswerEvaluatorRun` requires reviewer Identity and reviewer capability for `human_reviewed` runs.
6. `beginOpenAnswerEvaluatorRun` rejects reviewer attribution on non-human evaluator runs.

### Evidence

7. `recordOpenAnswerEvaluatorEvidence` records internal evidence metadata on a running evaluator run.
8. `recordOpenAnswerEvaluatorEvidence` accepts omitted redacted summaries and rejects malformed evidence kinds or malformed redacted summaries.
9. `recordOpenAnswerEvaluatorEvidence` rejects unknown or non-running evaluator runs with the specified reasons.
10. Evidence records and responses do not expose raw prompts, raw model responses, model metadata payloads, evaluator diagnostics, reviewer notes, secrets, session identifiers, CSRF tokens, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.

### Completion and Failure

11. `completeOpenAnswerEvaluatorRun` accepts a running evaluator run, records final evaluation feedback, changes the run to `succeeded`, and changes the attempt to `evaluated`.
12. `completeOpenAnswerEvaluatorRun` rejects unknown or non-running evaluator runs with the specified reasons.
13. `completeOpenAnswerEvaluatorRun` applies criterion feedback validation from the attempt lifecycle spec.
14. `completeOpenAnswerEvaluatorRun` preserves submitted answers and accepted revision references.
15. `failOpenAnswerEvaluatorRun` accepts a running evaluator run, records an active evaluation failure, changes the run to `failed`, and changes the attempt to `evaluation_failed`.
16. `failOpenAnswerEvaluatorRun` rejects unknown, non-running, and malformed failure cases with the specified reasons.
17. `cancelOpenAnswerEvaluatorRun` cancels a running evaluator run and restores the attempt to `submitted` when no prior failure existed.
18. `cancelOpenAnswerEvaluatorRun` cancels a running evaluator run and restores the attempt to `evaluation_failed` when a prior failure existed.
19. `cancelOpenAnswerEvaluatorRun` rejects unknown, non-running, and malformed cancellation cases with the specified reasons.

### Queries and Boundaries

20. `getOpenAnswerEvaluationStatus` returns the owning Student's attempt, active run, evidence metadata, evaluation, and failure state.
21. `getOpenAnswerEvaluationStatus` rejects inactive identities, unknown attempts, non-owning Students, Program Curators, Admins, and other callers with the specified reasons.
22. `listOpenAnswerEvaluatorEvidence` returns only internal evidence metadata for the owning Student.
23. `listOpenAnswerEvaluatorEvidence` rejects inactive identities, unknown runs, non-owning Students, Program Curators, Admins, and other callers with the specified reasons.
24. Status and evidence responses satisfy the redaction rules.
25. Evaluation status and evidence commands do not mutate accepted checks, accepted criteria, accepted revisions, source records, curator candidates, Program Membership state, Identity state, sessions, or CSRF state.
26. Evaluation status and evidence commands do not create mastery, weak-area, progress, review-scheduling, next-step, grading, analytics, reporting, or institutional state.
27. Executable acceptance flow: a Student submits an open answer, Student Workspace begins an evaluator run, records internal evidence metadata, exposes owner-only evaluation status, completes the run into final feedback tied to accepted criterion revision ids, rejects non-owner evidence/status reads, verifies evidence redaction, and verifies no public HTTP evaluation mutation, UI, CLI, LLM provider, human-review queue, mastery, weak-area, progress, next-step, or grading behavior is introduced.

## Done criteria

- Student Workspace exposes the evaluation status and internal evidence command/query contract in this spec.
- Evaluator runs preserve attempt, Program, Student Identity, accepted check revision, and accepted criterion revision references.
- Human-reviewed runs require reviewing internal Identity and reviewer capability attribution.
- Automated runs preserve governed evaluator path and policy identity.
- Evidence metadata is internal and redacted; raw evaluator artifacts are not surfaced or persisted by this first evidence contract.
- Completion and failure preserve submitted answers and accepted revision references.
- Owner-only status/evidence queries preserve private attempt boundaries.
- Accepted corpus, curator candidates, Program Membership, Identity, session, and CSRF state are not mutated by evaluation status/evidence behavior.
- Mastery, weak-area, progress, review scheduling, next-step, grading, analytics, reporting, LLM provider calls, human-review workflow, UI, CLI, and public HTTP evaluation mutation routes remain out of scope.
- Every behavior rule is covered by a listed test or the executable acceptance flow.
