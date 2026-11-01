---
date: 2026-06-01
model: gpt-5
description: "Spec: Agonara Student Workspace open-answer attempt first-slice contract."
version: 0.0.1
status: implemented
type: spec
---

# Student Workspace Open-Answer Attempt First Slice

## Goal

Define the Agonara v0.0.1 backend contract for Student Workspace-owned open-answer attempts, submitted answers, evaluation outcomes, and feedback linked to accepted open-answer check and criterion revisions.

## Implementation status

Implemented by [Student Workspace Open-Answer Attempt First Slice Implementation Plan](../plans/implemented/student-workspace-open-answer-attempt-first-slice.md).

### Implementation Evidence

- Student Workspace submit/evaluate/failure/read commands: [student-workspace.js](../../src/student-workspace.js)
- Attempt, evaluation, failure, idempotency, and backup/restore persistence: [storage.js](../../src/storage.js)
- Student Workspace domain coverage: [student-workspace.test.js](../../tests/student-workspace.test.js)
- Storage coverage: [storage.test.js](../../tests/storage.test.js)
- Backup/restore coverage: [backup-restore.test.js](../../tests/backup-restore.test.js)
- Executable acceptance coverage: [executable-acceptance-corpus-navigation.test.js](../../tests/executable-acceptance-corpus-navigation.test.js)

The implemented first slice supports Student-owned submission, scoped idempotency, internal evaluation and failure transitions, owner-only domain reads, accepted-revision snapshot preservation, redacted summaries/details, backup/restore preservation, and orphan graph rejection. This first-slice implementation did not introduce HTTP routes, UI, CLI commands, provider calls, human review, mastery, weak-area, progress, quick-check, topic-level, period-level, or institutional grading behavior; the later public HTTP surface is specified separately by [Student Workspace Open-Answer Attempt API](student-workspace-open-answer-attempt-api.md).

## Public interface

This spec operationalizes [ADR-012](../adr/adr-012-student-workspace-open-answer-attempt-lifecycle.md) through the accepted check and criterion revision boundary from [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), the accepted corpus boundary from [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md), and the effective participation contract from [ADR-007](../adr/adr-007-effective-participation-authorization-contract.md).

### Logical records

```ts
type OpenAnswerAttemptStatus =
  | "submitted"
  | "evaluating"
  | "evaluated"
  | "evaluation_failed";

type OpenAnswerEvaluationCriterionOutcome =
  | "met"
  | "partially_met"
  | "missing"
  | "unclear";

type OpenAnswerEvaluatorKind = "student_workspace";

type OpenAnswerAttempt = {
  id: OpenAnswerAttemptId;
  programId: ProgramId;
  studentIdentityId: IdentityId;
  checkRevisionId: AcceptedOpenAnswerCheckRevisionId;
  criterionRevisionIds: AcceptedAssessmentCriterionRevisionId[];
  submittedAnswer: string;
  idempotencyKey: string;
  status: OpenAnswerAttemptStatus;
  submittedAt: Instant;
  updatedAt: Instant;
};

type OpenAnswerEvaluationCriterionFeedback = {
  criterionRevisionId: AcceptedAssessmentCriterionRevisionId;
  outcome: OpenAnswerEvaluationCriterionOutcome;
  feedback: string;
};

type OpenAnswerEvaluation = {
  id: OpenAnswerEvaluationId;
  attemptId: OpenAnswerAttemptId;
  programId: ProgramId;
  studentIdentityId: IdentityId;
  checkRevisionId: AcceptedOpenAnswerCheckRevisionId;
  criterionRevisionIds: AcceptedAssessmentCriterionRevisionId[];
  evaluatorKind: OpenAnswerEvaluatorKind;
  summaryFeedback: string;
  criterionFeedback: OpenAnswerEvaluationCriterionFeedback[];
  evaluatedAt: Instant;
};

type OpenAnswerEvaluationFailure = {
  attemptId: OpenAnswerAttemptId;
  reason: string;
  failedAt: Instant;
};
```

All identifiers are opaque stable identifiers.

Open-answer attempts reference accepted check revisions, not mutable check entities or check candidates.

Open-answer attempts snapshot criterion revision identifiers from the accepted check revision at submission time.

### Commands

```ts
submitOpenAnswerAttempt(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  checkRevisionId: AcceptedOpenAnswerCheckRevisionId;
  submittedAnswer: string;
  idempotencyKey: string;
}) -> SubmitOpenAnswerAttemptResult

markOpenAnswerAttemptEvaluating(input: {
  attemptId: OpenAnswerAttemptId;
}) -> MarkOpenAnswerAttemptEvaluatingResult

recordOpenAnswerEvaluation(input: {
  attemptId: OpenAnswerAttemptId;
  evaluatorKind: OpenAnswerEvaluatorKind;
  summaryFeedback: string;
  criterionFeedback: OpenAnswerEvaluationCriterionFeedback[];
}) -> RecordOpenAnswerEvaluationResult

recordOpenAnswerEvaluationFailure(input: {
  attemptId: OpenAnswerAttemptId;
  reason: string;
}) -> RecordOpenAnswerEvaluationFailureResult
```

`submitOpenAnswerAttempt` is the student-facing command and requires effective `Student` participation for the Program.

`markOpenAnswerAttemptEvaluating`, `recordOpenAnswerEvaluation`, and `recordOpenAnswerEvaluationFailure` are Student Workspace internal commands. They are not product-role commands for Students, Program Curators, or Admins.

### Command Result Envelope

- `{ status: "accepted"; value: ... }`
- `{ status: "rejected"; reason: StudentWorkspaceAttemptRejectionReason }`

### Queries

```ts
getOpenAnswerAttempt(input: {
  actingIdentityId: IdentityId;
  attemptId: OpenAnswerAttemptId;
}) -> GetOpenAnswerAttemptResult

listOpenAnswerAttempts(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  status?: OpenAnswerAttemptStatus;
  checkRevisionId?: AcceptedOpenAnswerCheckRevisionId;
}) -> ListOpenAnswerAttemptsResult
```

Attempt read queries require the owning `Student` Identity. Program Curator and Admin read access are out of scope for this first slice.

### Result summaries

```ts
type OpenAnswerAttemptSummary = {
  attemptId: string;
  programId: string;
  studentIdentityId: string;
  checkRevisionId: string;
  criterionRevisionIds: string[];
  submittedAnswer: string;
  status: OpenAnswerAttemptStatus;
  submittedAt: string;
  updatedAt: string;
};

type OpenAnswerEvaluationSummary = {
  evaluationId: string;
  attemptId: string;
  programId: string;
  studentIdentityId: string;
  checkRevisionId: string;
  criterionRevisionIds: string[];
  evaluatorKind: OpenAnswerEvaluatorKind;
  summaryFeedback: string;
  criterionFeedback: Array<{
    criterionRevisionId: string;
    outcome: OpenAnswerEvaluationCriterionOutcome;
    feedback: string;
  }>;
  evaluatedAt: string;
};

type OpenAnswerAttemptDetail = {
  attempt: OpenAnswerAttemptSummary;
  evaluation?: OpenAnswerEvaluationSummary;
  evaluationFailure?: {
    reason: string;
    failedAt: string;
  };
};
```

### Rejection reasons

```ts
type StudentWorkspaceAttemptRejectionReason =
  | "identity_not_active"
  | "participation_required"
  | "program_not_found"
  | "check_revision_not_found"
  | "check_revision_program_mismatch"
  | "attempt_not_found"
  | "attempt_already_evaluating"
  | "attempt_already_evaluated"
  | "idempotency_conflict"
  | "validation_failed";
```

## Behavior rules

1. `submitOpenAnswerAttempt` rejects inactive or unknown acting Identities with `identity_not_active`.
2. `submitOpenAnswerAttempt` rejects unknown Programs with `program_not_found`.
3. `submitOpenAnswerAttempt` rejects callers without effective `Student` participation for the Program with `participation_required`.
4. `submitOpenAnswerAttempt` rejects unknown accepted check revision ids with `check_revision_not_found`.
5. `submitOpenAnswerAttempt` rejects accepted check revisions from another Program with `check_revision_program_mismatch`.
6. `submitOpenAnswerAttempt` rejects missing, empty, whitespace-only, or non-string submitted answers with `validation_failed`.
7. `submitOpenAnswerAttempt` stores the submitted answer with surrounding whitespace trimmed.
8. `submitOpenAnswerAttempt` rejects missing, empty, whitespace-only, or non-string idempotency keys with `validation_failed`.
9. `submitOpenAnswerAttempt` scopes idempotency to acting student Identity, Program, accepted check revision, and idempotency key.
10. `submitOpenAnswerAttempt` returns the original accepted attempt for an equivalent retry with the same scoped idempotency key.
11. `submitOpenAnswerAttempt` rejects reuse of the same scoped idempotency key with a different submitted answer with `idempotency_conflict`.
12. `submitOpenAnswerAttempt` creates one attempt in `submitted` status on first accepted submission.
13. `submitOpenAnswerAttempt` snapshots the criterion revision ids from the accepted check revision at submission time.
14. Later accepted check or accepted criterion revisions must not rewrite an existing attempt's check revision id, criterion revision ids, or submitted answer.
15. Submitting an attempt must not create, update, reject, or delete accepted checks, accepted criteria, accepted revisions, or curator candidates.
16. `markOpenAnswerAttemptEvaluating` rejects unknown attempts with `attempt_not_found`.
17. `markOpenAnswerAttemptEvaluating` changes a `submitted` or `evaluation_failed` attempt to `evaluating`.
18. `markOpenAnswerAttemptEvaluating` rejects an already `evaluating` attempt with `attempt_already_evaluating`.
19. `markOpenAnswerAttemptEvaluating` rejects an `evaluated` attempt with `attempt_already_evaluated`.
20. `recordOpenAnswerEvaluation` rejects unknown attempts with `attempt_not_found`.
21. `recordOpenAnswerEvaluation` accepts `submitted`, `evaluating`, or `evaluation_failed` attempts.
22. `recordOpenAnswerEvaluation` rejects already evaluated attempts with `attempt_already_evaluated`.
23. `recordOpenAnswerEvaluation` requires `evaluatorKind` to be `student_workspace`.
24. `recordOpenAnswerEvaluation` rejects missing, empty, whitespace-only, or non-string summary feedback with `validation_failed`.
25. `recordOpenAnswerEvaluation` requires exactly one criterion feedback item for each criterion revision id snapshotted on the attempt.
26. `recordOpenAnswerEvaluation` rejects missing, duplicate, unknown, or extra criterion feedback revision ids with `validation_failed`.
27. `recordOpenAnswerEvaluation` requires every criterion feedback item to include a supported outcome and non-empty feedback text.
28. `recordOpenAnswerEvaluation` stores one evaluation outcome and changes the attempt status to `evaluated`.
29. `recordOpenAnswerEvaluation` must not mutate the submitted answer.
30. `recordOpenAnswerEvaluation` must not mutate accepted checks, accepted criteria, accepted revisions, or curator candidates.
31. `recordOpenAnswerEvaluationFailure` rejects unknown attempts with `attempt_not_found`.
32. `recordOpenAnswerEvaluationFailure` accepts `submitted`, `evaluating`, or `evaluation_failed` attempts.
33. `recordOpenAnswerEvaluationFailure` rejects evaluated attempts with `attempt_already_evaluated`.
34. `recordOpenAnswerEvaluationFailure` rejects missing, empty, whitespace-only, or non-string failure reasons with `validation_failed`.
35. `recordOpenAnswerEvaluationFailure` changes the attempt status to `evaluation_failed`.
36. `recordOpenAnswerEvaluationFailure` preserves the submitted answer and accepted revision references.
37. `getOpenAnswerAttempt` rejects unknown attempts with `attempt_not_found`.
38. `getOpenAnswerAttempt` rejects inactive or unknown acting Identities with `identity_not_active`.
39. `getOpenAnswerAttempt` rejects non-owning Students, Program Curators, Admins, and other callers with `attempt_not_found`.
40. `getOpenAnswerAttempt` returns the attempt detail, including evaluation or failure detail when present.
41. `listOpenAnswerAttempts` rejects inactive or unknown acting Identities with `identity_not_active`.
42. `listOpenAnswerAttempts` rejects unknown Programs with `program_not_found`.
43. `listOpenAnswerAttempts` rejects callers without effective `Student` participation for the Program with `participation_required`.
44. `listOpenAnswerAttempts` returns only attempts owned by the acting Student Identity for the requested Program.
45. `listOpenAnswerAttempts` applies supported status filters and rejects unsupported status filters with `validation_failed`.
46. `listOpenAnswerAttempts` applies `checkRevisionId` filters only after enforcing Program and owning-student scope.
47. Attempt summaries and details must not expose idempotency keys, raw LLM prompts, raw model responses, evaluator diagnostics, password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
48. Backup export and restore must preserve open-answer attempts, evaluation outcomes, evaluation failures, and accepted revision references.
49. Restore must reject backups that orphan attempts from required Program, Identity, accepted check revision, or accepted criterion revision records.
50. This first slice does not expose HTTP routes, CLI commands, Student UI, Admin UI, Program Curator read access, Admin read access, LLM provider calls, raw prompt storage, human review workflow, mastery calculation, weak-area calculation, review scheduling, progress interpretation, quick-check attempts, topic-level attempts, period-level attempts, or institutional grading behavior.

## Tests (required)

1. `submitOpenAnswerAttempt` accepts an effective Student and returns a `submitted` attempt referencing the accepted check revision and snapshotted criterion revision ids.
2. `submitOpenAnswerAttempt` rejects inactive Identities with `identity_not_active`.
3. `submitOpenAnswerAttempt` rejects unknown Programs with `program_not_found`.
4. `submitOpenAnswerAttempt` rejects callers without effective Student participation with `participation_required`.
5. `submitOpenAnswerAttempt` rejects unknown accepted check revisions with `check_revision_not_found`.
6. `submitOpenAnswerAttempt` rejects accepted check revisions from another Program with `check_revision_program_mismatch`.
7. `submitOpenAnswerAttempt` rejects invalid submitted answers and invalid idempotency keys with `validation_failed`.
8. `submitOpenAnswerAttempt` trims submitted answers before persistence.
9. `submitOpenAnswerAttempt` returns the original attempt for equivalent retries with the same scoped idempotency key.
10. `submitOpenAnswerAttempt` rejects conflicting reuse of the same scoped idempotency key with `idempotency_conflict`.
11. `submitOpenAnswerAttempt` does not mutate accepted checks, accepted criteria, accepted revisions, or curator candidates.
12. Later accepted check or criterion revisions do not rewrite the attempt's accepted revision references.
13. `markOpenAnswerAttemptEvaluating` changes submitted and failed attempts to `evaluating`.
14. `markOpenAnswerAttemptEvaluating` rejects an already evaluating attempt with `attempt_already_evaluating`.
15. `markOpenAnswerAttemptEvaluating` rejects evaluated attempts with `attempt_already_evaluated`.
16. `recordOpenAnswerEvaluation` accepts a submitted or evaluating attempt and returns an evaluated attempt plus evaluation summary.
17. `recordOpenAnswerEvaluation` rejects unknown and already evaluated attempts with the specified reasons.
18. `recordOpenAnswerEvaluation` rejects unsupported evaluator kinds, malformed summary feedback, malformed criterion feedback, missing criterion feedback, duplicate criterion feedback, and extra criterion feedback with `validation_failed`.
19. `recordOpenAnswerEvaluation` does not mutate the submitted answer or accepted corpus records.
20. `recordOpenAnswerEvaluationFailure` changes submitted and evaluating attempts to `evaluation_failed`.
21. `recordOpenAnswerEvaluationFailure` rejects unknown, evaluated, and malformed failure cases with the specified reasons.
22. `recordOpenAnswerEvaluationFailure` preserves the submitted answer and accepted revision references.
23. `getOpenAnswerAttempt` returns the owning Student's attempt detail with evaluation detail when present.
24. `getOpenAnswerAttempt` rejects unknown attempts with `attempt_not_found`.
25. `getOpenAnswerAttempt` rejects inactive Identities with `identity_not_active`.
26. `getOpenAnswerAttempt` rejects non-owning Students, Program Curators, Admins, and other callers with `attempt_not_found`.
27. `listOpenAnswerAttempts` returns only attempts owned by the acting Student in the requested Program.
28. `listOpenAnswerAttempts` applies supported status and check revision filters.
29. `listOpenAnswerAttempts` rejects unsupported status filters with `validation_failed`.
30. Attempt responses do not expose idempotency keys, raw LLM prompts, raw model responses, evaluator diagnostics, secrets, session identifiers, CSRF tokens, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
31. Backup and restore preserve attempts, evaluations, failures, and accepted revision references.
32. Restore rejects orphan attempts that reference missing Program, Identity, accepted check revision, or accepted criterion revision records.
33. Executable acceptance flow: a Student joins a Program, submits an open answer against an accepted open-answer check revision, receives an evaluation tied to the accepted criterion revision ids, retries the submission with the same idempotency key without duplicating the attempt, revises the accepted criterion after submission, verifies the attempt still references the original criterion revision ids, reads only the Student's own attempt history, records a failed evaluation for a separate attempt, and verifies no accepted corpus, curator candidate, mastery, weak-area, progress, UI, CLI, LLM provider, or human review state is introduced.

## Done criteria

- Student Workspace exposes the open-answer attempt command/query contract in this spec.
- Attempts are scoped to Program, owning Student Identity, accepted check revision, snapshotted accepted criterion revisions, and immutable submitted answer.
- Effective Student participation is required for submission and owning-student reads.
- Program Curator and Admin read/write behavior stays out of scope for this first slice.
- Submission is idempotent for equivalent retries and rejects conflicting key reuse.
- Evaluation outcome and failure commands preserve submitted answers and accepted revision references.
- Accepted checks, accepted criteria, accepted revisions, and curator candidates are not mutated by attempt or evaluation behavior.
- Attempt responses and failures satisfy the redaction rules.
- Backup and restore preserve attempt/evaluation state and reject orphaned accepted-revision references.
- Every behavior rule is covered by a listed test or the executable acceptance flow.
- No HTTP routes, CLI commands, UI, LLM provider calls, human review workflow, mastery state, weak-area state, progress interpretation, quick-check attempts, topic-level attempts, period-level attempts, or institutional grading behavior is introduced by this first slice.
