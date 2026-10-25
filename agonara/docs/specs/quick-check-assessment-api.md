---
date: 2026-06-03
model: gpt-5
description: "Spec: Agonara Quick Check assessment HTTP API."
version: 0.0.1
status: implemented
type: spec
---

# Quick Check Assessment API

## Goal

Define the public HTTP API for Agonara deterministic single-select Quick Check curation, student-safe delivery, and Student Workspace-owned attempts.

## Implementation status

Implemented by [Quick Check Assessment HTTP API Implementation Plan](../plans/implemented/quick-check-assessment-api.md) and covered by [http-api-quick-check-curation.test.js](../../tests/http-api-quick-check-curation.test.js), [http-api-quick-check-delivery.test.js](../../tests/http-api-quick-check-delivery.test.js), [http-api-quick-check-attempts.test.js](../../tests/http-api-quick-check-attempts.test.js), [http-api-server.test.js](../../tests/http-api-server.test.js).

## Public interface

This spec operationalizes [Quick-Check Assessment First Slice](quick-check-assessment-first-slice.md) and [ADR-016](../adr/adr-016-quick-check-assessment-boundary.md) through the session, CSRF, envelope, pagination, and redaction conventions from [Accepted Checks and Assessment Criteria API](accepted-checks-and-assessment-criteria-api.md) and [Student Workspace Open-Answer Attempt API](student-workspace-open-answer-attempt-api.md).

### Shared result envelope

```ts
type AcceptedResult<T> = {
  status: "accepted";
  value: T;
};

type RejectedResult = {
  status: "rejected";
  reason: ApiRejectionReason;
};

type FaultResult = {
  status: "fault";
  reason: "internal_error";
};
```

### Rejection reasons

```ts
type ApiRejectionReason =
  | "identity_disabled"
  | "identity_not_active"
  | "session_not_found"
  | "session_expired"
  | "session_revoked"
  | "csrf_required"
  | "csrf_invalid"
  | "admin_or_curator_required"
  | "participation_required"
  | "program_not_found"
  | "source_not_found"
  | "source_program_mismatch"
  | "quick_check_candidate_not_found"
  | "quick_check_candidate_already_accepted"
  | "quick_check_candidate_already_rejected"
  | "quick_check_entity_not_found"
  | "quick_check_entity_program_mismatch"
  | "quick_check_revision_not_found"
  | "quick_check_revision_program_mismatch"
  | "selected_option_not_found"
  | "attempt_not_found"
  | "idempotency_conflict"
  | "validation_failed";
```

### Shared API shapes

```ts
type QuickCheckCandidateStatus = "draft" | "accepted" | "rejected";

type QuickCheckOptionSummary = {
  optionId: string;
  text: string;
};

type QuickCheckCandidateSummary = {
  candidateId: string;
  programId: string;
  checkKind: "single_select_quick_check";
  title: string;
  prompt: string;
  options: QuickCheckOptionSummary[];
  answerKeyOptionId: string;
  sourceIds: string[];
  rationale?: string;
  status: QuickCheckCandidateStatus;
  createdByIdentityId: string;
  createdAt: string;
  updatedAt: string;
};

type AcceptedQuickCheckForCurationSummary = {
  entityId: string;
  revisionId: string;
  programId: string;
  checkKind: "single_select_quick_check";
  title: string;
  prompt: string;
  options: QuickCheckOptionSummary[];
  answerKeyOptionId: string;
  acceptedFromCandidateId: string;
  sourceIds: string[];
  rationale?: string;
  acceptedByIdentityId: string;
  acceptedAt: string;
};

type QuickCheckDeliverySummary = {
  revisionId: string;
  programId: string;
  checkKind: "single_select_quick_check";
  title: string;
  prompt: string;
  options: QuickCheckOptionSummary[];
};

type QuickCheckAttemptSummary = {
  attemptId: string;
  programId: string;
  studentIdentityId: string;
  checkRevisionId: string;
  selectedOptionId: string;
  matched: boolean;
  submittedAt: string;
};

type QuickCheckCandidateList = {
  quickCheckCandidates: QuickCheckCandidateSummary[];
  nextCursor?: string;
};

type QuickCheckDeliveryList = {
  quickCheckDeliveries: QuickCheckDeliverySummary[];
  nextCursor?: string;
};

type QuickCheckAttemptList = {
  quickCheckAttempts: QuickCheckAttemptSummary[];
  nextCursor?: string;
};
```

### HTTP session transport

The API authenticates browser clients with the existing server-managed `agonara_session` cookie.

State-changing routes require `X-Agonara-CSRF: <csrfToken>` from the active session. Read-only `GET` routes do not require a CSRF header.

Quick Check attempt submission requires `X-Agonara-Idempotency-Key: <clientKey>`. The idempotency key must be a non-empty string from `1` through `255` characters after trimming surrounding whitespace. It is never returned in responses, cursors, operational logs, or fault bodies.

### HTTP endpoints

| Method | Path | Auth | Accepted response | Rejected status mapping |
|---|---|---|---|---|
| `GET` | `/programs/{programId}/quick-checks/candidates?status={status}&limit={limit}&cursor={cursor}` | Program Curator session | `AcceptedResult<QuickCheckCandidateList>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_or_curator_required`, `404 program_not_found` |
| `POST` | `/programs/{programId}/quick-checks/candidates` | Program Curator session and CSRF header | `AcceptedResult<{ quickCheckCandidate: QuickCheckCandidateSummary }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `403 admin_or_curator_required`, `404 program_not_found`, `409 source_not_found`, `409 source_program_mismatch` |
| `POST` | `/quick-checks/candidates/{candidateId}/acceptance` | Program Curator session and CSRF header | `AcceptedResult<{ acceptedQuickCheck: AcceptedQuickCheckForCurationSummary }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `403 admin_or_curator_required`, `404 quick_check_candidate_not_found`, `404 quick_check_entity_not_found`, `409 quick_check_candidate_already_accepted`, `409 quick_check_candidate_already_rejected`, `409 quick_check_entity_program_mismatch` |
| `POST` | `/quick-checks/candidates/{candidateId}/rejection` | Program Curator session and CSRF header | `AcceptedResult<{ quickCheckCandidate: QuickCheckCandidateSummary }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `403 admin_or_curator_required`, `404 quick_check_candidate_not_found`, `409 quick_check_candidate_already_accepted`, `409 quick_check_candidate_already_rejected` |
| `GET` | `/quick-checks/revisions/{revisionId}/curation` | Program Curator session | `AcceptedResult<{ acceptedQuickCheck: AcceptedQuickCheckForCurationSummary }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_or_curator_required`, `404 quick_check_revision_not_found` |
| `GET` | `/programs/{programId}/quick-checks?limit={limit}&cursor={cursor}` | Student session | `AcceptedResult<QuickCheckDeliveryList>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 participation_required`, `404 program_not_found` |
| `GET` | `/quick-checks/revisions/{revisionId}` | Student session | `AcceptedResult<{ quickCheckDelivery: QuickCheckDeliverySummary }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 participation_required`, `404 quick_check_revision_not_found` |
| `POST` | `/programs/{programId}/quick-check-attempts` | Student session, CSRF header, and idempotency header | `AcceptedResult<{ quickCheckAttempt: QuickCheckAttemptSummary }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `403 identity_not_active`, `403 participation_required`, `404 program_not_found`, `404 quick_check_revision_not_found`, `404 selected_option_not_found`, `409 quick_check_revision_program_mismatch`, `409 idempotency_conflict` |
| `GET` | `/quick-check-attempts/{attemptId}` | owning Student session | `AcceptedResult<{ quickCheckAttempt: QuickCheckAttemptSummary }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 identity_not_active`, `404 attempt_not_found` |
| `GET` | `/programs/{programId}/quick-check-attempts?checkRevisionId={checkRevisionId}&limit={limit}&cursor={cursor}` | owning Student session | `AcceptedResult<QuickCheckAttemptList>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 identity_not_active`, `403 participation_required`, `404 program_not_found`, `404 quick_check_revision_not_found`, `409 quick_check_revision_program_mismatch` |

### Request bodies

```ts
type CreateQuickCheckCandidateRequest = {
  checkKind: "single_select_quick_check";
  title: string;
  prompt: string;
  options: string[];
  answerKeyOptionIndex: number;
  sourceIds?: string[];
  rationale?: string;
};

type AcceptQuickCheckCandidateRequest = {
  targetEntityId?: string;
};

type SubmitQuickCheckAttemptRequest = {
  checkRevisionId: string;
  selectedOptionId: string;
};
```

## Behavior rules

1. Every route requires a valid active HTTP session.
2. State-changing routes reject missing sessions with `401 session_not_found` before CSRF validation.
3. State-changing routes reject missing or invalid CSRF tokens before parsing, validating, or applying request bodies.
4. Candidate creation maps to `createQuickCheckCandidate` with `checkKind`, `title`, `prompt`, `options`, `answerKeyOptionIndex`, `sourceIds`, and `rationale` from the JSON body.
5. Candidate creation accepts only JSON objects with supported fields and rejects malformed JSON, non-object JSON, missing bodies, unsupported fields, malformed fields, fewer than two options, duplicate trimmed options, and invalid answer-key indexes with `400 validation_failed`.
6. Candidate listing maps to `listQuickCheckCandidates` and applies supported `draft`, `accepted`, and `rejected` status filters.
7. Candidate listing and candidate mutation require effective Program Curator participation; Admin authority alone is insufficient.
8. Candidate acceptance maps to `acceptQuickCheckCandidate`, accepts an optional `targetEntityId`, and returns an answer-key-inclusive accepted Quick Check summary only to the effective Program Curator.
9. Candidate rejection maps to `rejectQuickCheckCandidate` and creates no accepted Quick Check entity or revision.
10. Curation revision reads map to `getAcceptedQuickCheckRevisionForCuration` and return current or historical answer-key-inclusive revisions only to effective Program Curators.
11. Student delivery listing maps to `listQuickCheckDeliveries` and returns only current accepted Quick Check revisions for the requested Program.
12. Student delivery detail maps to `getQuickCheckDelivery` and can return current or historical accepted revisions as student-safe projections.
13. Student delivery responses must not include answer keys, option correctness flags, candidate ids, rationale, accepting curator attribution, acceptance time, or other curator-only metadata.
14. Attempt submission maps to `submitQuickCheckAttempt` using the resolved session Identity, Program path id, request `checkRevisionId`, request `selectedOptionId`, and `X-Agonara-Idempotency-Key`.
15. Attempt submission requires effective Student participation for the requested Program.
16. Attempt submission accepts only JSON objects with exactly `checkRevisionId` and `selectedOptionId`.
17. Attempt submission rejects malformed JSON, non-object JSON, missing bodies, unsupported fields, missing or malformed `checkRevisionId`, missing or malformed `selectedOptionId`, and malformed idempotency headers with `400 validation_failed`.
18. Attempt submission returns the original attempt for an equivalent retry with the same scoped idempotency key and selected option id.
19. Attempt submission rejects conflicting selected-option reuse of the same scoped idempotency key with `409 idempotency_conflict`.
20. Attempt submission responses include `matched` for the selected answer result but never include the accepted revision answer key or per-option correctness metadata.
21. Attempt detail maps to `getQuickCheckAttempt` and returns only the owning Student's attempt.
22. Attempt detail rejects unknown attempts, non-owning Students, Program Curators, Admins, and other callers with `404 attempt_not_found`.
23. Attempt listing maps to `listQuickCheckAttempts`, returns only attempts owned by the session Student in the requested Program, and applies `checkRevisionId` filters after Program and owner scope.
24. Attempt listing accepts `limit` values from `1` through `100`, defaults to `50`, and rejects invalid limits with `400 validation_failed`.
25. Cursors are opaque and reject malformed, unknown, expired, route-mismatched, or filter-mismatched values with `400 validation_failed`.
26. Responses, cursors, operational logs, and faults must not expose answer keys, per-option correctness metadata, idempotency keys, candidate ids on student-facing routes, password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, provider details, or infrastructure details.
27. Unexpected failures map to `500` with `FaultResult`.
28. This API does not expose Student UI, Admin UI, Curator UI, CLI commands, option randomization, multiple-select checks, topic-level checks, period-level checks, mastery calculation, weak-area calculation, progress interpretation, review scheduling, next-step recommendation, grading, analytics, reporting, external provider calls, evaluator workers, queues, or human review behavior.

## Tests (required)

1. `POST /programs/{programId}/quick-checks/candidates` rejects a missing session with `401 session_not_found`.
2. Candidate mutation rejects missing and invalid CSRF before domain mutation.
3. Candidate creation accepts an effective Program Curator and returns a draft candidate with opaque option ids and one answer-key option id.
4. Candidate creation rejects malformed bodies, unsupported fields, invalid `checkKind`, invalid title/prompt, invalid options, duplicate trimmed options, invalid answer-key index, unknown sources, and cross-Program sources with the specified statuses.
5. Candidate listing returns Program-scoped candidates and applies supported status filters.
6. Candidate listing rejects Students, Admins without effective Program Curator participation, unknown Programs, invalid limits, unsupported status filters, and invalid cursors with the specified statuses.
7. Candidate acceptance creates accepted Quick Check summaries with answer-key-inclusive curator projections.
8. Candidate acceptance supports replacement revisions through `targetEntityId` and preserves historical revisions.
9. Candidate acceptance and rejection map unknown, accepted, rejected, unknown target, and cross-Program target cases to the specified statuses.
10. Curation revision reads return current or historical answer-key-inclusive summaries only to effective Program Curators.
11. Student delivery listing returns only current accepted Quick Check revisions for an effective Student.
12. Student delivery detail returns current or historical accepted revisions as student-safe projections.
13. Student delivery routes reject disabled sessions, unknown Programs or revisions, non-Students, and invalid cursors with the specified statuses.
14. Delivery responses and cursors exclude answer keys, option correctness flags, candidate ids, rationale, accepting curator attribution, acceptance time, idempotency keys, and operational secrets.
15. `POST /programs/{programId}/quick-check-attempts` rejects missing sessions, missing/invalid CSRF, malformed bodies, and malformed idempotency headers with the specified statuses.
16. Attempt submission accepts an effective Student, returns an immutable attempt summary, and includes the matched-or-not-matched result for the selected option.
17. Attempt submission rejects unknown Programs, callers without Student participation, unknown revisions, cross-Program revisions, selected options outside the revision, and conflicting idempotency reuse with the specified statuses.
18. Equivalent retries with the same scoped idempotency key and selected option return the original attempt without creating a duplicate.
19. Attempt detail returns only the owning Student's attempt.
20. Attempt detail rejects unknown attempts, another Student's attempt, Program Curator callers, Admin callers, and other non-owning callers with `404 attempt_not_found`.
21. Attempt listing returns only the owning Student's attempts for the requested Program and applies `checkRevisionId` filters after Program and owner scope.
22. Attempt listing rejects unknown Programs, callers without Student participation, unknown revision filters, cross-Program revision filters, invalid limits, and invalid cursors with the specified statuses.
23. Attempt responses, cursors, operational logs, and faults exclude answer keys, per-option correctness metadata, idempotency keys, candidate ids, session identifiers, CSRF tokens, cookie headers, SQL text, stack traces, filesystem paths, database URLs, provider details, and infrastructure details.
24. Production `startServer()` exposes the Quick Check HTTP routes through the real Identity, Program, Corpus, and Student Workspace composition.
25. Absence checks prove this API does not introduce UI, CLI, option-randomization, multiple-select, topic-level, period-level, mastery, weak-area, progress, grading, provider, worker, queue, or human-review routes.

## Done criteria

- HTTP routes match the endpoint table and shared result envelope.
- Curator routes expose answer keys only through Program Curator-authorized candidate and curation revision surfaces.
- Student delivery routes expose accepted Quick Check content without answer keys, per-option correctness metadata, or curator-only metadata.
- Student attempt routes use the existing session, CSRF, idempotency, owner-only read, pagination, and redaction conventions.
- Production composition exposes the Quick Check routes through the real server wiring.
- All behavior rules have HTTP or executable acceptance coverage.
- All listed tests pass in the Agonara workspace and the repo-wide Node gates.
- No UI, CLI, learner-state interpretation, grading, provider, worker, queue, or human-review behavior is introduced by this API slice.
