---
date: 2026-05-30
model: gpt-5
description: "Spec: Agonara accepted checks and assessment criteria HTTP API."
version: 0.0.1
status: implemented
type: spec
---

# Accepted Checks and Assessment Criteria API

## Goal

Define the public HTTP API for Agonara Program-scoped accepted assessment criteria and accepted open-answer checks, owned by the Corpus Storage and Curator Workspace API boundary.

This spec operationalizes [Accepted Checks and Assessment Criteria First Slice](accepted-checks-and-assessment-criteria-first-slice.md) and [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md) through the existing session, CSRF, envelope, pagination, and redaction conventions from [Corpus Storage and Curator Acceptance API](corpus-storage-and-curator-acceptance-api.md). It defines HTTP behavior only; it does not add Admin UI, Curator UI, Student UI, CLI commands, Student Workspace attempts, submitted answers, selected answers, scoring, generated feedback, mastery, weak areas, progress evidence, LLM execution, or human review workflow.

## Implementation status

Implemented by [Accepted Checks and Assessment Criteria HTTP API Implementation Plan](../plans/implemented/accepted-checks-and-assessment-criteria-api.md).

### Implementation Evidence

- HTTP route adapters and status mapping: [server.js](../../src/server.js)
- Delegated assessment corpus command/query boundary: [corpus.js](../../src/corpus.js)
- Focused HTTP route, session, CSRF, pagination, redaction, and out-of-scope coverage: [http-api-assessment-criteria.test.js](../../tests/http-api-assessment-criteria.test.js), [http-api-open-answer-checks.test.js](../../tests/http-api-open-answer-checks.test.js), [http-api-assessment-validation.test.js](../../tests/http-api-assessment-validation.test.js)
- End-to-end executable acceptance coverage: [executable-acceptance-corpus-navigation.test.js](../../tests/executable-acceptance-corpus-navigation.test.js)

The implemented API exposes the assessment criterion and open-answer check candidate lifecycle, acceptance/rejection commands, current accepted reads, and historical revision reads over the existing session, CSRF, envelope, pagination, and redaction conventions. It delegates policy to the implemented Corpus command/query boundary and preserves the slice boundary by excluding Admin UI, Curator UI, Student UI, CLI commands, Student Workspace attempts, scoring, feedback, LLM execution, and human review workflow.

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

#### Fault HTTP Operations

```ts
type FaultResult = {
  status: "fault";
  reason: "internal_error";
};
```

`ApiRejectionReason` includes the assessment criterion and open-answer check domain reasons from [Accepted Checks and Assessment Criteria First Slice](accepted-checks-and-assessment-criteria-first-slice.md), plus session and CSRF reasons from [Identity & Role Management API and CLI](identity-role-management-api-cli.md):

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
  | "criterion_candidate_not_found"
  | "criterion_candidate_already_accepted"
  | "criterion_candidate_already_rejected"
  | "criterion_entity_not_found"
  | "criterion_entity_program_mismatch"
  | "criterion_revision_not_found"
  | "check_candidate_not_found"
  | "check_candidate_already_accepted"
  | "check_candidate_already_rejected"
  | "check_entity_not_found"
  | "check_entity_program_mismatch"
  | "check_revision_not_found"
  | "validation_failed";
```

The endpoint table lists the session-level disabled Identity response as `403 identity_disabled`. If a delegated domain command returns `identity_not_active`, the HTTP route must preserve that reason and map it to `403`.

Fault responses do not include password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, stack traces, SQL text, filesystem paths, database URLs, or infrastructure details.

### Shared API shapes

```ts
type CandidateStatus = "draft" | "accepted" | "rejected";
type CheckKind = "open_answer";

type AssessmentCriterionCandidateSummary = {
  candidateId: string;
  programId: string;
  title: string;
  body: string;
  sourceIds: string[];
  rationale?: string;
  status: CandidateStatus;
  createdByIdentityId: string;
  createdAt: string;
  updatedAt: string;
};

type AcceptedAssessmentCriterionSummary = {
  entityId: string;
  revisionId: string;
  programId: string;
  title: string;
  body: string;
  acceptedFromCandidateId: string;
  sourceIds: string[];
  rationale?: string;
  acceptedByIdentityId: string;
  acceptedAt: string;
};

type OpenAnswerCheckCandidateSummary = {
  candidateId: string;
  programId: string;
  checkKind: CheckKind;
  title: string;
  prompt: string;
  sourceIds: string[];
  criterionEntityIds: string[];
  rationale?: string;
  status: CandidateStatus;
  createdByIdentityId: string;
  createdAt: string;
  updatedAt: string;
};

type AcceptedOpenAnswerCheckSummary = {
  entityId: string;
  revisionId: string;
  programId: string;
  checkKind: CheckKind;
  title: string;
  prompt: string;
  acceptedFromCandidateId: string;
  sourceIds: string[];
  criterionRevisionIds: string[];
  rationale?: string;
  acceptedByIdentityId: string;
  acceptedAt: string;
};

type AssessmentCriterionCandidateList = {
  assessmentCriterionCandidates: AssessmentCriterionCandidateSummary[];
  nextCursor?: string;
};

type OpenAnswerCheckCandidateList = {
  openAnswerCheckCandidates: OpenAnswerCheckCandidateSummary[];
  nextCursor?: string;
};

type AcceptedAssessmentCriterionList = {
  acceptedAssessmentCriteria: AcceptedAssessmentCriterionSummary[];
  nextCursor?: string;
};

type AcceptedOpenAnswerCheckList = {
  acceptedOpenAnswerChecks: AcceptedOpenAnswerCheckSummary[];
  nextCursor?: string;
};
```

### HTTP session transport

The API authenticates browser clients with the existing server-managed `agonara_session` cookie.

State-changing routes require `X-Agonara-CSRF: <csrfToken>` from the active session. Read-only `GET` routes do not require a CSRF header.

The API never returns the session identifier or CSRF token. Clients obtain CSRF tokens through the Identity session API.

### HTTP endpoints

| Method | Path | Auth | Accepted response | Rejected status mapping |
|---|---|---|---|---|
| `GET` | `/programs/{programId}/assessment-criteria/candidates?status={status}&limit={limit}&cursor={cursor}` | Program Curator session | `AcceptedResult<AssessmentCriterionCandidateList>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_or_curator_required`, `404 program_not_found` |
| `POST` | `/programs/{programId}/assessment-criteria/candidates` | Program Curator session and CSRF header | `AcceptedResult<{ assessmentCriterionCandidate: AssessmentCriterionCandidateSummary }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `403 admin_or_curator_required`, `404 program_not_found`, `409 source_not_found`, `409 source_program_mismatch` |
| `POST` | `/assessment-criteria/candidates/{candidateId}/acceptance` | Program Curator session and CSRF header | `AcceptedResult<{ acceptedAssessmentCriterion: AcceptedAssessmentCriterionSummary }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `403 admin_or_curator_required`, `404 criterion_candidate_not_found`, `404 criterion_entity_not_found`, `409 criterion_candidate_already_accepted`, `409 criterion_candidate_already_rejected`, `409 criterion_entity_program_mismatch` |
| `POST` | `/assessment-criteria/candidates/{candidateId}/rejection` | Program Curator session and CSRF header | `AcceptedResult<{ assessmentCriterionCandidate: AssessmentCriterionCandidateSummary }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `403 admin_or_curator_required`, `404 criterion_candidate_not_found`, `409 criterion_candidate_already_accepted`, `409 criterion_candidate_already_rejected` |
| `GET` | `/programs/{programId}/assessment-criteria?limit={limit}&cursor={cursor}` | Student, Program Curator, or Admin session | `AcceptedResult<AcceptedAssessmentCriterionList>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 participation_required`, `404 program_not_found` |
| `GET` | `/assessment-criteria/revisions/{revisionId}` | Student, Program Curator, or Admin session | `AcceptedResult<{ acceptedAssessmentCriterion: AcceptedAssessmentCriterionSummary }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 participation_required`, `404 criterion_revision_not_found`, `404 program_not_found` |
| `GET` | `/programs/{programId}/open-answer-checks/candidates?status={status}&limit={limit}&cursor={cursor}` | Program Curator session | `AcceptedResult<OpenAnswerCheckCandidateList>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_or_curator_required`, `404 program_not_found` |
| `POST` | `/programs/{programId}/open-answer-checks/candidates` | Program Curator session and CSRF header | `AcceptedResult<{ openAnswerCheckCandidate: OpenAnswerCheckCandidateSummary }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `403 admin_or_curator_required`, `404 program_not_found`, `404 criterion_entity_not_found`, `409 source_not_found`, `409 source_program_mismatch`, `409 criterion_entity_program_mismatch` |
| `POST` | `/open-answer-checks/candidates/{candidateId}/acceptance` | Program Curator session and CSRF header | `AcceptedResult<{ acceptedOpenAnswerCheck: AcceptedOpenAnswerCheckSummary }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `403 admin_or_curator_required`, `404 check_candidate_not_found`, `404 check_entity_not_found`, `409 check_candidate_already_accepted`, `409 check_candidate_already_rejected`, `409 check_entity_program_mismatch` |
| `POST` | `/open-answer-checks/candidates/{candidateId}/rejection` | Program Curator session and CSRF header | `AcceptedResult<{ openAnswerCheckCandidate: OpenAnswerCheckCandidateSummary }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `403 admin_or_curator_required`, `404 check_candidate_not_found`, `409 check_candidate_already_accepted`, `409 check_candidate_already_rejected` |
| `GET` | `/programs/{programId}/open-answer-checks?limit={limit}&cursor={cursor}` | Student, Program Curator, or Admin session | `AcceptedResult<AcceptedOpenAnswerCheckList>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 participation_required`, `404 program_not_found` |
| `GET` | `/open-answer-checks/revisions/{revisionId}` | Student, Program Curator, or Admin session | `AcceptedResult<{ acceptedOpenAnswerCheck: AcceptedOpenAnswerCheckSummary }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 participation_required`, `404 check_revision_not_found`, `404 program_not_found` |

### Request Bodies

```ts
type CreateAssessmentCriterionCandidateRequest = {
  title: string;
  body: string;
  sourceIds?: string[];
  rationale?: string;
};

type AcceptAssessmentCriterionCandidateRequest = {
  targetEntityId?: string;
};

type CreateOpenAnswerCheckCandidateRequest = {
  checkKind: "open_answer";
  title: string;
  prompt: string;
  sourceIds?: string[];
  criterionEntityIds: string[];
  rationale?: string;
};

type AcceptOpenAnswerCheckCandidateRequest = {
  targetEntityId?: string;
};

type CandidateListQuery = {
  status?: CandidateStatus;
  limit?: number;
  cursor?: string;
};

type AcceptedListQuery = {
  limit?: number;
  cursor?: string;
};
```

Acceptance routes accept a missing body, an empty JSON object, or an object containing only optional `targetEntityId`. Acceptance routes reject malformed JSON, non-object JSON, unsupported fields, or malformed `targetEntityId` values with `400 validation_failed`. Rejection routes accept a missing body and reject malformed or non-empty JSON bodies with `400 validation_failed`.

## Behavior rules

1. Every route requires a valid active HTTP session.
2. Session resolution rejects missing, unknown, expired, and revoked sessions with the same `401` status and reason as the Identity API.
3. Session resolution rejects disabled Identities with `403 identity_disabled`; delegated domain `identity_not_active` rejections map to `403 identity_not_active`.
4. State-changing routes reject missing sessions with `401 session_not_found` before CSRF validation.
5. State-changing routes reject missing or invalid CSRF tokens before applying domain changes.
6. State-changing routes do not create or rotate sessions.
7. Routes containing `{programId}` reject unknown Program identifiers with `404 program_not_found` before returning Program-scoped data.
8. Candidate creation, candidate listing, acceptance, and rejection routes require effective Program Curator participation for the candidate Program.
9. Accepted criterion and accepted check read routes require effective Student participation, effective Program Curator participation, or effective Admin authority for the requested or resolved Program.
10. Admin authority without effective Program Curator participation can read accepted criteria and checks but cannot create, accept, or reject candidates.
11. Candidate list routes accept only `draft`, `accepted`, and `rejected` status filters.
12. Candidate list routes return only candidates scoped to the requested Program.
13. Candidate list routes never return accepted entities or accepted revisions as candidate records.
14. Accepted list routes return only current accepted revisions scoped to the requested Program.
15. Accepted list routes never return draft or rejected candidates.
16. Historical revision lookup resolves access through the revision's Program after resolving that the revision exists.
17. Historical revision lookup returns historical revisions even when they are no longer current.
18. Historical criterion lookup rejects unknown revisions with `404 criterion_revision_not_found`.
19. Historical check lookup rejects unknown revisions with `404 check_revision_not_found`.
20. Criterion candidate creation maps to `createAssessmentCriterionCandidate` for the resolved session Identity and requested Program.
21. Criterion candidate creation accepts only JSON objects matching `CreateAssessmentCriterionCandidateRequest`.
22. Criterion candidate creation rejects malformed JSON, non-object JSON, missing bodies, unsupported fields, missing titles, empty titles, whitespace-only titles, non-string titles, empty bodies, whitespace-only bodies, non-string bodies, malformed rationales, non-array `sourceIds`, or non-string `sourceIds` with `400 validation_failed`.
23. Criterion candidate creation rejects unknown source ids with `409 source_not_found`.
24. Criterion candidate creation rejects source ids from another Program with `409 source_program_mismatch`.
25. Accepted criterion candidate creation creates one `draft` criterion candidate and no accepted criterion revision.
26. Criterion candidate acceptance resolves the candidate before checking Program Curator authorization for the candidate's Program.
27. Criterion candidate acceptance rejects unknown candidates with `404 criterion_candidate_not_found`.
28. Criterion candidate acceptance rejects already accepted candidates with `409 criterion_candidate_already_accepted`.
29. Criterion candidate acceptance rejects already rejected candidates with `409 criterion_candidate_already_rejected`.
30. Criterion candidate acceptance rejects unknown `targetEntityId` values with `404 criterion_entity_not_found`.
31. Criterion candidate acceptance rejects target criterion entities from another Program with `409 criterion_entity_program_mismatch`.
32. Criterion candidate acceptance without `targetEntityId` creates one accepted criterion entity and one current revision.
33. Criterion candidate acceptance with `targetEntityId` creates a new current revision and preserves the previous historical revision.
34. Criterion candidate acceptance rejects malformed JSON, non-object JSON, unsupported fields, and malformed `targetEntityId` values with `400 validation_failed`.
35. Criterion candidate rejection resolves the candidate before checking Program Curator authorization for the candidate's Program.
36. Criterion candidate rejection accepts a missing request body and rejects malformed or non-empty JSON bodies with `400 validation_failed`.
37. Criterion candidate rejection changes a draft candidate status to `rejected` and creates no accepted criterion entity or revision.
38. Criterion candidate rejection must not delete accepted criterion revisions.
39. Open-answer check candidate creation maps to `createOpenAnswerCheckCandidate` for the resolved session Identity and requested Program.
40. Open-answer check candidate creation accepts only JSON objects matching `CreateOpenAnswerCheckCandidateRequest`.
41. Open-answer check candidate creation rejects malformed JSON, non-object JSON, missing bodies, unsupported fields, unsupported check kinds, missing titles, empty titles, whitespace-only titles, non-string titles, missing prompts, empty prompts, whitespace-only prompts, non-string prompts, malformed rationales, non-array `sourceIds`, non-string `sourceIds`, missing `criterionEntityIds`, empty `criterionEntityIds`, non-array `criterionEntityIds`, or non-string `criterionEntityIds` with `400 validation_failed`.
42. Open-answer check candidate creation rejects unknown source ids with `409 source_not_found`.
43. Open-answer check candidate creation rejects source ids from another Program with `409 source_program_mismatch`.
44. Open-answer check candidate creation rejects unknown criterion entities with `404 criterion_entity_not_found`.
45. Open-answer check candidate creation rejects criterion entities from another Program with `409 criterion_entity_program_mismatch`.
46. Accepted open-answer check candidate creation creates one `draft` check candidate and no accepted check revision.
47. Open-answer check candidate acceptance resolves the candidate before checking Program Curator authorization for the candidate's Program.
48. Open-answer check candidate acceptance rejects unknown candidates with `404 check_candidate_not_found`.
49. Open-answer check candidate acceptance rejects already accepted candidates with `409 check_candidate_already_accepted`.
50. Open-answer check candidate acceptance rejects already rejected candidates with `409 check_candidate_already_rejected`.
51. Open-answer check candidate acceptance rejects unknown `targetEntityId` values with `404 check_entity_not_found`.
52. Open-answer check candidate acceptance rejects target check entities from another Program with `409 check_entity_program_mismatch`.
53. Open-answer check candidate acceptance rejects malformed JSON, non-object JSON, unsupported fields, and malformed `targetEntityId` values with `400 validation_failed`.
54. Open-answer check candidate acceptance snapshots current accepted criterion revision ids for every referenced criterion entity.
55. Open-answer check candidate acceptance without `targetEntityId` creates one accepted open-answer check entity and one current revision.
56. Open-answer check candidate acceptance with `targetEntityId` creates a new current revision and preserves the previous historical revision.
57. Revisions of accepted criteria after check acceptance must not rewrite the accepted check revision's `criterionRevisionIds`.
58. Open-answer check candidate rejection resolves the candidate before checking Program Curator authorization for the candidate's Program.
59. Open-answer check candidate rejection accepts a missing request body and rejects malformed or non-empty JSON bodies with `400 validation_failed`.
60. Open-answer check candidate rejection changes a draft candidate status to `rejected` and creates no accepted check entity or revision.
61. Open-answer check candidate rejection must not delete accepted check revisions or accepted check-to-criterion revision references.
62. Criterion and open-answer check list routes accept `limit` values from `1` through `100`, default to `50`, and reject invalid limits with `400 validation_failed`.
63. List route cursors are opaque strings returned by the API; malformed, unknown, or route-mismatched cursors reject with `400 validation_failed`.
64. List route cursors must not encode secrets, SQL text, filesystem paths, stack traces, session identifiers, CSRF tokens, cookie headers, or authorization headers.
65. Responses and faults never include password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
66. Unexpected failures map to `500` with `FaultResult`.
67. This API slice does not expose Admin UI, Curator UI, Student UI, CLI commands, Student Workspace attempts, submitted answers, selected answers, evaluation results, scoring, generated feedback, mastery calculation, weak-area calculation, progress evidence, LLM prompt execution, human review workflow, quick checks, multiple-choice checks, or topic-level checks.

## Product intent traceability

| Story | Behavior covered |
|---|---|
| CUR-04 - Add checks and assessment items | Check candidate and accepted check routes expose curator-authored open-answer checks. |
| CUR-05 - Define assessment criteria | Criterion candidate and accepted criterion routes expose curator-authored criteria. |
| CUR-06 - Keep accepted content separate from drafts | Candidate routes remain curator-only; accepted routes expose only current accepted revisions. |
| CUR-10 - Update program after research | Acceptance into existing criterion/check entities exposes revision replacement without erasing history. |
| CUR-13 - Trace suggestion origin | Accepted criterion/check responses preserve candidate and source provenance. |
| STU-12 - Submit open answer | Student-readable accepted check routes provide the prerequisite stable check revision identifiers without accepting attempts. |
| STU-13 - Receive open-answer feedback | Student-readable accepted criterion routes provide the prerequisite stable criterion revision identifiers without generating feedback. |
| INT-05 - Submit an open answer and receive feedback tied to accepted criteria | The API exposes accepted check and criterion revision ids required by a later Student Workspace implementation. |

## Tests (required)

### HTTP Session and CSRF

1. `GET /programs/{programId}/assessment-criteria` rejects a missing session with `401 session_not_found`.
2. `GET /programs/{programId}/open-answer-checks` rejects an inactive session Identity with `403 identity_disabled`.
3. `POST /programs/{programId}/assessment-criteria/candidates` rejects a valid session without CSRF with `403 csrf_required`.
4. `POST /programs/{programId}/open-answer-checks/candidates` rejects an invalid CSRF token with `403 csrf_invalid`.
5. Responses do not include session identifiers or CSRF tokens.

### Criterion Candidate Routes

6. `GET /programs/{programId}/assessment-criteria/candidates` accepts an effective Program Curator and returns only criterion candidates for the requested Program.
7. `GET /programs/{programId}/assessment-criteria/candidates` applies `draft`, `accepted`, and `rejected` status filters.
8. `GET /programs/{programId}/assessment-criteria/candidates` rejects unsupported status filters, invalid limits, and malformed cursors with `400 validation_failed`.
9. `GET /programs/{programId}/assessment-criteria/candidates` rejects Students, Admin-without-curator, and other non-curators with `403 admin_or_curator_required`.
10. `POST /programs/{programId}/assessment-criteria/candidates` accepts valid criterion input and returns a `draft` `AssessmentCriterionCandidateSummary`.
11. Accepted criterion candidate creation does not create accepted criteria.
12. Criterion candidate creation rejects malformed JSON, non-object JSON, missing bodies, unsupported fields, missing titles, empty titles, malformed bodies, malformed rationales, non-array `sourceIds`, and non-string `sourceIds` with `400 validation_failed`.
13. Criterion candidate creation rejects unknown source ids with `409 source_not_found`.
14. Criterion candidate creation rejects cross-Program source ids with `409 source_program_mismatch`.

### Criterion Acceptance and Rejection Routes

15. `POST /assessment-criteria/candidates/{candidateId}/acceptance` accepts a Program Curator for the candidate Program and returns `AcceptedAssessmentCriterionSummary`.
16. Criterion acceptance without `targetEntityId` creates one accepted entity and one accepted revision.
17. Criterion acceptance with `targetEntityId` creates a new current revision and preserves the previous historical revision.
18. Criterion acceptance rejects unknown candidates with `404 criterion_candidate_not_found`.
19. Criterion acceptance rejects already accepted candidates with `409 criterion_candidate_already_accepted`.
20. Criterion acceptance rejects already rejected candidates with `409 criterion_candidate_already_rejected`.
21. Criterion acceptance rejects unknown target entities with `404 criterion_entity_not_found`.
22. Criterion acceptance rejects cross-Program target entities with `409 criterion_entity_program_mismatch`.
23. Criterion acceptance rejects non-curator callers with `403 admin_or_curator_required`.
24. Criterion acceptance rejects malformed JSON, non-object JSON, unsupported fields, and malformed `targetEntityId` values with `400 validation_failed`.
25. `POST /assessment-criteria/candidates/{candidateId}/rejection` accepts a Program Curator and returns the rejected `AssessmentCriterionCandidateSummary`.
26. Criterion rejection rejects malformed and non-empty JSON bodies with `400 validation_failed`.
27. Criterion rejection rejects unknown candidates with `404 criterion_candidate_not_found`.
28. Criterion rejection rejects already accepted candidates with `409 criterion_candidate_already_accepted`.
29. Criterion rejection rejects already rejected candidates with `409 criterion_candidate_already_rejected`.
30. Criterion rejection rejects non-curator callers with `403 admin_or_curator_required`.
31. Criterion rejection does not delete accepted criterion revisions.

### Accepted Criterion Routes

32. `GET /programs/{programId}/assessment-criteria` accepts an effective Student for the requested Program.
33. `GET /programs/{programId}/assessment-criteria` accepts an effective Program Curator for the requested Program.
34. `GET /programs/{programId}/assessment-criteria` accepts an effective Admin.
35. `GET /programs/{programId}/assessment-criteria` rejects callers without Student, Curator, or Admin access with `403 participation_required`.
36. Criterion listing returns only current accepted revisions scoped to the requested Program.
37. Criterion listing never exposes draft or rejected candidates.
38. Criterion listing defaults `limit` to `50` and rejects invalid limits or malformed cursors with `400 validation_failed`.
39. `GET /assessment-criteria/revisions/{revisionId}` returns an addressable historical criterion revision for an authorized Student, Curator, or Admin.
40. `GET /assessment-criteria/revisions/{revisionId}` rejects unknown revision ids with `404 criterion_revision_not_found`.
41. `GET /assessment-criteria/revisions/{revisionId}` rejects unauthorized callers with `403 participation_required`.

### Open-Answer Check Candidate Routes

42. `GET /programs/{programId}/open-answer-checks/candidates` accepts an effective Program Curator and returns only check candidates for the requested Program.
43. `GET /programs/{programId}/open-answer-checks/candidates` applies `draft`, `accepted`, and `rejected` status filters.
44. `GET /programs/{programId}/open-answer-checks/candidates` rejects unsupported status filters, invalid limits, and malformed cursors with `400 validation_failed`.
45. `GET /programs/{programId}/open-answer-checks/candidates` rejects Students, Admin-without-curator, and other non-curators with `403 admin_or_curator_required`.
46. `POST /programs/{programId}/open-answer-checks/candidates` accepts valid open-answer check input and returns a `draft` `OpenAnswerCheckCandidateSummary`.
47. Accepted check candidate creation does not create accepted checks.
48. Check candidate creation rejects malformed JSON, non-object JSON, missing bodies, unsupported fields, unsupported check kinds, malformed titles, malformed prompts, malformed rationales, non-array `sourceIds`, non-string `sourceIds`, missing `criterionEntityIds`, empty `criterionEntityIds`, non-array `criterionEntityIds`, and non-string `criterionEntityIds` with `400 validation_failed`.
49. Check candidate creation rejects unknown source ids with `409 source_not_found`.
50. Check candidate creation rejects cross-Program source ids with `409 source_program_mismatch`.
51. Check candidate creation rejects unknown criterion entities with `404 criterion_entity_not_found`.
52. Check candidate creation rejects cross-Program criterion entities with `409 criterion_entity_program_mismatch`.

### Open-Answer Check Acceptance and Rejection Routes

53. `POST /open-answer-checks/candidates/{candidateId}/acceptance` accepts a Program Curator for the candidate Program and returns `AcceptedOpenAnswerCheckSummary`.
54. Check acceptance without `targetEntityId` creates one accepted entity and one accepted revision.
55. Check acceptance snapshots current criterion revision ids for every referenced criterion entity.
56. Check acceptance with `targetEntityId` creates a new current revision and preserves the previous historical revision.
57. Check acceptance rejects unknown candidates with `404 check_candidate_not_found`.
58. Check acceptance rejects already accepted candidates with `409 check_candidate_already_accepted`.
59. Check acceptance rejects already rejected candidates with `409 check_candidate_already_rejected`.
60. Check acceptance rejects unknown target entities with `404 check_entity_not_found`.
61. Check acceptance rejects cross-Program target entities with `409 check_entity_program_mismatch`.
62. Check acceptance rejects non-curator callers with `403 admin_or_curator_required`.
63. Check acceptance rejects malformed JSON, non-object JSON, unsupported fields, and malformed `targetEntityId` values with `400 validation_failed`.
64. `POST /open-answer-checks/candidates/{candidateId}/rejection` accepts a Program Curator and returns the rejected `OpenAnswerCheckCandidateSummary`.
65. Check rejection rejects malformed and non-empty JSON bodies with `400 validation_failed`.
66. Check rejection rejects unknown candidates with `404 check_candidate_not_found`.
67. Check rejection rejects already accepted candidates with `409 check_candidate_already_accepted`.
68. Check rejection rejects already rejected candidates with `409 check_candidate_already_rejected`.
69. Check rejection rejects non-curator callers with `403 admin_or_curator_required`.
70. Check rejection does not delete accepted check revisions or criterion revision references.

### Accepted Open-Answer Check Routes

71. `GET /programs/{programId}/open-answer-checks` accepts an effective Student for the requested Program.
72. `GET /programs/{programId}/open-answer-checks` accepts an effective Program Curator for the requested Program.
73. `GET /programs/{programId}/open-answer-checks` accepts an effective Admin.
74. `GET /programs/{programId}/open-answer-checks` rejects callers without Student, Curator, or Admin access with `403 participation_required`.
75. Check listing returns only current accepted revisions scoped to the requested Program.
76. Check listing never exposes draft or rejected candidates.
77. Check listing defaults `limit` to `50` and rejects invalid limits or malformed cursors with `400 validation_failed`.
78. `GET /open-answer-checks/revisions/{revisionId}` returns an addressable historical check revision for an authorized Student, Curator, or Admin.
79. `GET /open-answer-checks/revisions/{revisionId}` rejects unknown revision ids with `404 check_revision_not_found`.
80. `GET /open-answer-checks/revisions/{revisionId}` rejects unauthorized callers with `403 participation_required`.
81. A check revision remains linked to the original criterion revision after the accepted criterion is revised.

### Redaction and Out-of-Scope Routes

82. Candidate, accepted-list, historical-revision, acceptance, and rejection responses do not expose password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
83. Candidate and accepted-list cursors do not expose secrets, SQL text, filesystem paths, stack traces, session identifiers, CSRF tokens, cookie headers, or authorization headers.
84. Fault responses map unexpected errors to `500 internal_error` without leaking implementation details.
85. The API does not expose Admin UI, Curator UI, Student UI, CLI commands, Student Workspace attempts, submitted answers, selected answers, evaluation results, scoring, generated feedback, mastery calculation, weak-area calculation, progress evidence, LLM execution, or human review workflow.

### Executable Acceptance Flow

86. A logged-in Program Curator creates a Program through the existing Program API, records a source, creates and accepts a criterion, creates and accepts an open-answer check linked to that criterion, revises the criterion, verifies the accepted check revision still points at the original criterion revision, lists accepted checks and criteria as a Student, fetches historical criterion and check revisions, rejects separate draft criterion and check candidates, confirms draft/rejected candidates are absent from accepted reads, and verifies no Student Workspace state, scoring, feedback, LLM, human review, UI, or CLI surface is introduced.

## Done criteria

- HTTP routes match the endpoint table and shared result envelope.
- HTTP routes use the existing Identity session, CSRF, redaction, and bounded opaque-cursor conventions.
- HTTP routes delegate to the implemented accepted-checks and assessment-criteria domain command/query boundary instead of duplicating Program Membership or Corpus policy.
- All behavior rules have executable HTTP acceptance or integration coverage.
- All listed tests pass in the Agonara workspace and the repo-wide Node gates.
- Responses, cursors, and faults satisfy the redaction rules in this spec and the Identity API spec.
- Admin authority without Program Curator participation is read-only for accepted checks and criteria.
- No Admin UI, Curator UI, Student UI, CLI commands, Student Workspace attempts, submitted answers, selected answers, scoring, generated feedback, mastery state, weak-area state, progress evidence, LLM execution, or human review workflow is introduced by this API slice.
