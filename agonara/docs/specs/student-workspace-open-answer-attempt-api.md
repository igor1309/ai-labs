---
date: 2026-06-02
model: gpt-5
description: "Spec: Agonara Student Workspace open-answer attempt HTTP API."
version: 0.0.1
status: implemented
type: spec
---

# Student Workspace Open-Answer Attempt API

## Goal

Define the public HTTP API for Agonara Student Workspace-owned open-answer attempt submission and owner-only attempt reads.

This spec operationalizes [Student Workspace Open-Answer Attempt First Slice](student-workspace-open-answer-attempt-first-slice.md) and [ADR-012](../adr/adr-012-student-workspace-open-answer-attempt-lifecycle.md) through the existing session, CSRF, envelope, pagination, and redaction conventions from [Accepted Checks and Assessment Criteria API](accepted-checks-and-assessment-criteria-api.md). It defines HTTP behavior only; it does not add Student UI, Admin UI, Curator UI, CLI commands, HTTP evaluation mutation routes, LLM provider calls, human review workflow, mastery, weak areas, progress interpretation, quick-check attempts, topic-level attempts, period-level attempts, or institutional grading behavior.

## Implementation status

Implemented by [Student Workspace Open-Answer Attempt HTTP API Implementation Plan](../plans/implemented/student-workspace-open-answer-attempt-api.md).

### Implementation Evidence

- HTTP route adapters and status mapping: [server.js](../../src/server.js)
- Student Workspace submit/detail/list commands: [student-workspace.js](../../src/student-workspace.js)
- HTTP route coverage: [http-api-open-answer-attempt-submission.test.js](../../tests/http-api-open-answer-attempt-submission.test.js), [http-api-open-answer-attempt-detail.test.js](../../tests/http-api-open-answer-attempt-detail.test.js), [http-api-open-answer-attempt-list.test.js](../../tests/http-api-open-answer-attempt-list.test.js), [http-api-open-answer-attempt-acceptance.test.js](../../tests/http-api-open-answer-attempt-acceptance.test.js), [http-api-server.test.js](../../tests/http-api-server.test.js)
- Student Workspace domain coverage: [student-workspace.test.js](../../tests/student-workspace.test.js)
- Executable acceptance coverage: [executable-acceptance.test.js](../../tests/executable-acceptance.test.js)

The implemented attempt API supports session-backed submission with CSRF and idempotency headers, owner-only detail reads, Program-scoped owner-only listing, status/check filters, bounded opaque cursors, rejection/status mapping, production composition wiring, executable acceptance, and redaction of sessions, CSRF tokens, idempotency keys, raw evaluator artifacts, diagnostics, and infrastructure details. It does not implement Student UI, Admin UI, Curator UI, CLI commands, HTTP evaluation mutation routes, provider calls, human review, mastery, weak-area, progress, quick-check, topic-level, period-level, or institutional grading behavior.

## Public interface

### Shared result envelope

#### Successful HTTP Operations

```ts
type AcceptedResult<T> = {
  status: "accepted";
  value: T;
};
```

#### Rejected HTTP Operations

```ts
type RejectedResult = {
  status: "rejected";
  reason: ApiRejectionReason;
};
```

HTTP `5xx` responses return:

```ts
type FaultResult = {
  status: "fault";
  reason: "internal_error";
};
```

`ApiRejectionReason` includes the Student Workspace attempt reasons from [Student Workspace Open-Answer Attempt First Slice](student-workspace-open-answer-attempt-first-slice.md), plus session and CSRF reasons from [Identity & Role Management API and CLI](identity-role-management-api-cli.md):

```ts
type ApiRejectionReason =
  | "identity_disabled"
  | "identity_not_active"
  | "session_not_found"
  | "session_expired"
  | "session_revoked"
  | "csrf_required"
  | "csrf_invalid"
  | "participation_required"
  | "program_not_found"
  | "check_revision_not_found"
  | "check_revision_program_mismatch"
  | "attempt_not_found"
  | "idempotency_conflict"
  | "validation_failed";
```

The endpoint table lists the session-level disabled Identity response as `403 identity_disabled`. If a delegated domain command or query returns `identity_not_active`, the HTTP route must preserve that reason and map it to `403`.

Fault responses do not include password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, raw LLM prompts, raw model responses, evaluator diagnostics, stack traces, SQL text, filesystem paths, database URLs, or infrastructure details.

### Shared API shapes

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

type OpenAnswerAttemptList = {
  attempts: OpenAnswerAttemptSummary[];
  nextCursor?: string;
};
```

### HTTP session transport

The API authenticates browser clients with the existing server-managed `agonara_session` cookie.

State-changing routes require `X-Agonara-CSRF: <csrfToken>` from the active session. Read-only `GET` routes do not require a CSRF header.

Attempt submission requires `X-Agonara-Idempotency-Key: <clientKey>` in addition to the CSRF header. The idempotency key is a retry key for the submission command only; it must be a non-empty string from `1` through `255` characters after trimming surrounding whitespace. It is not authentication material and is never returned in responses, cursors, logs exposed through this API, or fault bodies.

The API never returns the session identifier, CSRF token, idempotency key, or cookie header. Clients obtain CSRF tokens through the Identity session API.

### HTTP endpoints

| Method | Path | Auth | Accepted response | Rejected status mapping |
|---|---|---|---|---|
| `POST` | `/programs/{programId}/open-answer-attempts` | Student session, CSRF header, and idempotency header | `AcceptedResult<{ attempt: OpenAnswerAttemptSummary }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 identity_not_active`, `403 csrf_required`, `403 csrf_invalid`, `403 participation_required`, `404 program_not_found`, `404 check_revision_not_found`, `409 check_revision_program_mismatch`, `409 idempotency_conflict` |
| `GET` | `/open-answer-attempts/{attemptId}` | owning Student session | `AcceptedResult<OpenAnswerAttemptDetail>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 identity_not_active`, `404 attempt_not_found` |
| `GET` | `/programs/{programId}/open-answer-attempts?status={status}&checkRevisionId={checkRevisionId}&limit={limit}&cursor={cursor}` | owning Student session | `AcceptedResult<OpenAnswerAttemptList>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 identity_not_active`, `403 participation_required`, `404 program_not_found` |

### Request Bodies

```ts
type SubmitOpenAnswerAttemptRequest = {
  checkRevisionId: string;
  submittedAnswer: string;
};

type OpenAnswerAttemptListQuery = {
  status?: OpenAnswerAttemptStatus;
  checkRevisionId?: string;
  limit?: number;
  cursor?: string;
};
```

`POST /programs/{programId}/open-answer-attempts` accepts only JSON objects matching `SubmitOpenAnswerAttemptRequest`. It rejects malformed JSON, non-object JSON, missing bodies, unsupported fields, malformed `checkRevisionId`, malformed `submittedAnswer`, or missing `X-Agonara-Idempotency-Key` values with `400 validation_failed`.

## Behavior rules

1. Every route requires a valid active HTTP session.
2. Session resolution rejects missing, unknown, expired, and revoked sessions with the same `401` status and reason as the Identity API.
3. Session resolution rejects disabled Identities with `403 identity_disabled`; delegated domain `identity_not_active` rejections map to `403 identity_not_active`.
4. State-changing routes reject missing sessions with `401 session_not_found` before CSRF validation.
5. State-changing routes reject missing or invalid CSRF tokens before parsing, validating, or applying submission bodies.
6. State-changing routes do not create or rotate sessions.
7. `POST /programs/{programId}/open-answer-attempts` maps to `submitOpenAnswerAttempt` for the resolved session Identity, requested Program, request `checkRevisionId`, request `submittedAnswer`, and `X-Agonara-Idempotency-Key`.
8. Attempt submission requires effective `Student` participation for the requested Program.
9. Attempt submission rejects unknown Programs with `404 program_not_found`.
10. Attempt submission rejects callers without effective Student participation with `403 participation_required`.
11. Attempt submission rejects unknown accepted open-answer check revision ids with `404 check_revision_not_found`.
12. Attempt submission rejects accepted open-answer check revisions from another Program with `409 check_revision_program_mismatch`.
13. Attempt submission accepts only JSON objects with exactly `checkRevisionId` and `submittedAnswer` fields.
14. Attempt submission rejects malformed JSON, non-object JSON, missing bodies, unsupported fields, missing `checkRevisionId`, non-string `checkRevisionId`, empty `checkRevisionId`, whitespace-only `checkRevisionId`, missing `submittedAnswer`, non-string `submittedAnswer`, empty `submittedAnswer`, or whitespace-only `submittedAnswer` with `400 validation_failed`.
15. Attempt submission stores the submitted answer with surrounding whitespace trimmed.
16. Attempt submission rejects a missing, empty, whitespace-only, non-string, or overlong `X-Agonara-Idempotency-Key` with `400 validation_failed`.
17. Attempt submission scopes idempotency to the resolved session Identity, requested Program, accepted check revision id, and idempotency key.
18. Equivalent retries with the same scoped idempotency key return the original accepted attempt summary without creating another attempt.
19. Reusing the same scoped idempotency key with a different submitted answer rejects with `409 idempotency_conflict` without creating or changing an attempt.
20. Accepted submission returns the created or idempotently resolved attempt summary in `submitted`, `evaluating`, `evaluated`, or `evaluation_failed` status.
21. Accepted submission snapshots criterion revision ids from the accepted check revision used at submission time.
22. Later accepted check or accepted criterion revisions must not rewrite any existing attempt response.
23. Attempt submission must not create, update, reject, or delete accepted checks, accepted criteria, accepted revisions, source records, curator candidates, membership records, sessions, mastery state, weak-area state, progress evidence, or review-scheduling state.
24. `GET /open-answer-attempts/{attemptId}` maps to `getOpenAnswerAttempt` for the resolved session Identity.
25. Attempt detail reads return only attempts owned by the resolved session Identity.
26. Attempt detail reads reject unknown attempts, attempts owned by another Student, and attempts requested by Program Curators, Admins, or other non-owning callers with `404 attempt_not_found`.
27. Attempt detail responses include evaluation detail when an evaluation exists.
28. Attempt detail responses include evaluation failure detail when an evaluation failure exists and no later successful evaluation has superseded it.
29. `GET /programs/{programId}/open-answer-attempts` maps to `listOpenAnswerAttempts` for the resolved session Identity and requested Program.
30. Attempt listing requires effective `Student` participation for the requested Program.
31. Attempt listing returns only attempts owned by the resolved session Identity for the requested Program.
32. Attempt listing applies supported `status` filters and rejects unsupported status values with `400 validation_failed`.
33. Attempt listing applies `checkRevisionId` filters only after enforcing Program and owning-student scope.
34. Attempt listing accepts `limit` values from `1` through `100`, defaults to `50`, and rejects invalid limits with `400 validation_failed`.
35. Attempt listing cursors are opaque strings returned by the API; malformed, unknown, expired, route-mismatched, status-filter-mismatched, or check-filter-mismatched cursors reject with `400 validation_failed`.
36. Attempt listing cursors must not encode secrets, submitted answers, idempotency keys, SQL text, filesystem paths, stack traces, session identifiers, CSRF tokens, cookie headers, authorization headers, raw LLM prompts, raw model responses, evaluator diagnostics, or infrastructure details.
37. Responses and faults never include idempotency keys, password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, raw LLM prompts, raw model responses, evaluator diagnostics, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
38. Unexpected failures map to `500` with `FaultResult`.
39. This API slice does not expose Student UI, Admin UI, Curator UI, CLI commands, HTTP routes for `markOpenAnswerAttemptEvaluating`, `recordOpenAnswerEvaluation`, or `recordOpenAnswerEvaluationFailure`, Program Curator attempt reads, Admin attempt reads, LLM provider calls, raw prompt storage, human review workflow, mastery calculation, weak-area calculation, progress interpretation, quick-check attempts, topic-level attempts, period-level attempts, or institutional grading behavior.

## Product intent traceability

| Story | Behavior covered |
|---|---|
| STU-12 - Submit open answer | `POST /programs/{programId}/open-answer-attempts` records the session Student's open-answer attempt against an accepted check revision. |
| STU-13 - Receive open-answer feedback | The attempt detail route returns Student Workspace evaluation or failure state when it exists for the owning Student. |
| INT-05 - Submit an open answer and receive feedback tied to accepted criteria | Submission snapshots accepted criterion revision ids, owner-only reads return feedback tied to those revision ids, and the API keeps accepted corpus separate from personal Student Workspace state. |

## Tests (required)

### HTTP Session, CSRF, and Idempotency

1. `POST /programs/{programId}/open-answer-attempts` rejects a missing session with `401 session_not_found`.
2. `GET /open-answer-attempts/{attemptId}` rejects a disabled session Identity with `403 identity_disabled`.
3. `POST /programs/{programId}/open-answer-attempts` rejects a valid session without CSRF with `403 csrf_required`.
4. `POST /programs/{programId}/open-answer-attempts` rejects an invalid CSRF token with `403 csrf_invalid`.
5. `POST /programs/{programId}/open-answer-attempts` rejects a missing or malformed idempotency header with `400 validation_failed`.
6. Attempt API responses do not include session identifiers, CSRF tokens, cookie headers, or idempotency keys.

### Submission Route

7. `POST /programs/{programId}/open-answer-attempts` accepts an effective Student with a valid body, CSRF token, and idempotency header, returning a `submitted` attempt summary.
8. Accepted submission snapshots the accepted check revision id and accepted criterion revision ids.
9. Accepted submission trims the submitted answer before returning and persisting it.
10. Submission rejects malformed JSON, non-object JSON, missing bodies, unsupported fields, malformed `checkRevisionId`, and malformed `submittedAnswer` with `400 validation_failed`.
11. Submission rejects unknown Programs with `404 program_not_found`.
12. Submission rejects callers without effective Student participation with `403 participation_required`.
13. Submission rejects unknown check revision ids with `404 check_revision_not_found`.
14. Submission rejects check revisions from another Program with `409 check_revision_program_mismatch`.
15. Equivalent retries with the same scoped idempotency key return the original attempt without creating a duplicate.
16. Conflicting reuse of the same scoped idempotency key rejects with `409 idempotency_conflict`.
17. Submission does not mutate accepted checks, accepted criteria, accepted revisions, source records, curator candidates, membership records, sessions, mastery state, weak-area state, progress evidence, or review-scheduling state.

### Attempt Detail Route

18. `GET /open-answer-attempts/{attemptId}` returns the owning Student's attempt detail.
19. Attempt detail includes evaluation detail when the attempt has a recorded evaluation.
20. Attempt detail includes evaluation failure detail when the attempt has an active evaluation failure.
21. Attempt detail rejects unknown attempts with `404 attempt_not_found`.
22. Attempt detail rejects another Student's attempt with `404 attempt_not_found`.
23. Attempt detail rejects Program Curator, Admin, and other non-owning callers with `404 attempt_not_found`.

### Attempt Listing Route

24. `GET /programs/{programId}/open-answer-attempts` returns only attempts owned by the session Student in the requested Program.
25. Attempt listing rejects callers without effective Student participation with `403 participation_required`.
26. Attempt listing applies supported status filters.
27. Attempt listing applies `checkRevisionId` filters after Program and owner scope.
28. Attempt listing defaults `limit` to `50`.
29. Attempt listing rejects invalid limits and malformed, unknown, route-mismatched, status-filter-mismatched, or check-filter-mismatched cursors with `400 validation_failed`.
30. Attempt listing responses and cursors do not expose secrets, submitted answers inside cursors, idempotency keys, SQL text, stack traces, filesystem paths, database URLs, session identifiers, CSRF tokens, raw LLM prompts, raw model responses, or evaluator diagnostics.

### Executable Acceptance Flow

31. A logged-in Student joins a Program, reads an accepted open-answer check revision, submits an open answer with CSRF and an idempotency header, retries the same submission without duplicating the attempt, receives evaluation detail after Student Workspace records evaluation internally, lists only its own attempts for the Program, fails to read another Student's attempt, and verifies the API exposes no evaluation mutation, UI, CLI, curator attempt-read, admin attempt-read, LLM, human-review, mastery, weak-area, or progress routes.

## Done criteria

- HTTP routes match the endpoint table and shared result envelope.
- Attempt API routes use the existing Identity session and CSRF transport contract.
- Attempt submission uses a client-provided idempotency header and never returns idempotency keys.
- All behavior rules have executable HTTP acceptance or integration coverage.
- All listed tests pass in the Agonara workspace and the repo-wide Node gates.
- Responses, cursors, and faults satisfy the redaction rules in this spec and the Identity API spec.
- No Student UI, Admin UI, Curator UI, CLI, HTTP evaluation mutation, LLM provider, human review, mastery, weak-area, progress, quick-check, topic-level, period-level, or grading behavior is introduced by this API slice.
