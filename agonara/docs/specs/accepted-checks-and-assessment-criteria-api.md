---
date: 2026-05-30
model: gpt-5
description: "Spec: Agonara accepted checks and assessment criteria HTTP API."
version: 0.0.1
status: draft
type: spec
---

# Accepted Checks and Assessment Criteria API

## Goal

Define the public HTTP API for Agonara Program-scoped accepted assessment criteria and accepted open-answer checks, owned by the Corpus Storage and Curator Workspace API boundary.

This spec operationalizes [Accepted Checks and Assessment Criteria First Slice](accepted-checks-and-assessment-criteria-first-slice.md) and [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md) through the existing session, CSRF, envelope, pagination, and redaction conventions from [Corpus Storage and Curator Acceptance API](corpus-storage-and-curator-acceptance-api.md). It defines HTTP behavior only; it does not add Admin UI, Curator UI, Student UI, CLI commands, Student Workspace attempts, submitted answers, selected answers, scoring, generated feedback, mastery, weak areas, progress evidence, LLM execution, or human review workflow.

## Public interface

### Shared result envelope

Successful HTTP operations return:

```ts
type AcceptedResult<T> = {
  status: "accepted";
  value: T;
};
```

Rejected HTTP operations return:

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

Request bodies:

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

Acceptance routes accept a missing body or an empty JSON object when no `targetEntityId` is supplied. Rejection routes accept a missing body and reject malformed or non-empty JSON bodies with `400 validation_failed`.

## Behavior rules

1. Every route requires a valid active HTTP session.
2. Session resolution rejects missing, unknown, expired, and revoked sessions with the same `401` status and reason as the Identity API.
3. Session resolution rejects inactive Identities with `403 identity_disabled`.
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
34. Criterion candidate rejection resolves the candidate before checking Program Curator authorization for the candidate's Program.
35. Criterion candidate rejection accepts a missing request body and rejects malformed or non-empty JSON bodies with `400 validation_failed`.
36. Criterion candidate rejection changes a draft candidate status to `rejected` and creates no accepted criterion entity or revision.
37. Criterion candidate rejection must not delete accepted criterion revisions.
38. Open-answer check candidate creation maps to `createOpenAnswerCheckCandidate` for the resolved session Identity and requested Program.
39. Open-answer check candidate creation accepts only JSON objects matching `CreateOpenAnswerCheckCandidateRequest`.
40. Open-answer check candidate creation rejects malformed JSON, non-object JSON, missing bodies, unsupported fields, unsupported check kinds, missing titles, empty titles, whitespace-only titles, non-string titles, missing prompts, empty prompts, whitespace-only prompts, non-string prompts, malformed rationales, non-array `sourceIds`, non-string `sourceIds`, missing `criterionEntityIds`, empty `criterionEntityIds`, non-array `criterionEntityIds`, or non-string `criterionEntityIds` with `400 validation_failed`.
41. Open-answer check candidate creation rejects unknown source ids with `409 source_not_found`.
42. Open-answer check candidate creation rejects source ids from another Program with `409 source_program_mismatch`.
43. Open-answer check candidate creation rejects unknown criterion entities with `404 criterion_entity_not_found`.
44. Open-answer check candidate creation rejects criterion entities from another Program with `409 criterion_entity_program_mismatch`.
45. Accepted open-answer check candidate creation creates one `draft` check candidate and no accepted check revision.
46. Open-answer check candidate acceptance resolves the candidate before checking Program Curator authorization for the candidate's Program.
47. Open-answer check candidate acceptance rejects unknown candidates with `404 check_candidate_not_found`.
48. Open-answer check candidate acceptance rejects already accepted candidates with `409 check_candidate_already_accepted`.
49. Open-answer check candidate acceptance rejects already rejected candidates with `409 check_candidate_already_rejected`.
50. Open-answer check candidate acceptance rejects unknown `targetEntityId` values with `404 check_entity_not_found`.
51. Open-answer check candidate acceptance rejects target check entities from another Program with `409 check_entity_program_mismatch`.
52. Open-answer check candidate acceptance snapshots current accepted criterion revision ids for every referenced criterion entity.
53. Open-answer check candidate acceptance without `targetEntityId` creates one accepted open-answer check entity and one current revision.
54. Open-answer check candidate acceptance with `targetEntityId` creates a new current revision and preserves the previous historical revision.
55. Revisions of accepted criteria after check acceptance must not rewrite the accepted check revision's `criterionRevisionIds`.
56. Open-answer check candidate rejection resolves the candidate before checking Program Curator authorization for the candidate's Program.
57. Open-answer check candidate rejection accepts a missing request body and rejects malformed or non-empty JSON bodies with `400 validation_failed`.
58. Open-answer check candidate rejection changes a draft candidate status to `rejected` and creates no accepted check entity or revision.
59. Open-answer check candidate rejection must not delete accepted check revisions or accepted check-to-criterion revision references.
60. Criterion and open-answer check list routes accept `limit` values from `1` through `100`, default to `50`, and reject invalid limits with `400 validation_failed`.
61. List route cursors are opaque strings returned by the API; malformed, unknown, or route-mismatched cursors reject with `400 validation_failed`.
62. List route cursors must not encode secrets, SQL text, filesystem paths, stack traces, session identifiers, CSRF tokens, cookie headers, or authorization headers.
63. Responses and faults never include password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
64. Unexpected failures map to `500` with `FaultResult`.
65. This API slice does not expose Admin UI, Curator UI, Student UI, CLI commands, Student Workspace attempts, submitted answers, selected answers, evaluation results, scoring, generated feedback, mastery calculation, weak-area calculation, progress evidence, LLM prompt execution, human review workflow, quick checks, multiple-choice checks, or topic-level checks.

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

HTTP session and CSRF:

1. `GET /programs/{programId}/assessment-criteria` rejects a missing session with `401 session_not_found`.
2. `GET /programs/{programId}/open-answer-checks` rejects an inactive session Identity with `403 identity_disabled`.
3. `POST /programs/{programId}/assessment-criteria/candidates` rejects a valid session without CSRF with `403 csrf_required`.
4. `POST /programs/{programId}/open-answer-checks/candidates` rejects an invalid CSRF token with `403 csrf_invalid`.
5. Responses do not include session identifiers or CSRF tokens.

Criterion candidate routes:

6. `GET /programs/{programId}/assessment-criteria/candidates` accepts an effective Program Curator and returns only criterion candidates for the requested Program.
7. `GET /programs/{programId}/assessment-criteria/candidates` applies `draft`, `accepted`, and `rejected` status filters.
8. `GET /programs/{programId}/assessment-criteria/candidates` rejects unsupported status filters, invalid limits, and malformed cursors with `400 validation_failed`.
9. `GET /programs/{programId}/assessment-criteria/candidates` rejects Students, Admin-without-curator, and other non-curators with `403 admin_or_curator_required`.
10. `POST /programs/{programId}/assessment-criteria/candidates` accepts valid criterion input and returns a `draft` `AssessmentCriterionCandidateSummary`.
11. Accepted criterion candidate creation does not create accepted criteria.
12. Criterion candidate creation rejects malformed JSON, non-object JSON, missing bodies, unsupported fields, missing titles, empty titles, malformed bodies, malformed rationales, non-array `sourceIds`, and non-string `sourceIds` with `400 validation_failed`.
13. Criterion candidate creation rejects unknown source ids with `409 source_not_found`.
14. Criterion candidate creation rejects cross-Program source ids with `409 source_program_mismatch`.

Criterion acceptance and rejection routes:

15. `POST /assessment-criteria/candidates/{candidateId}/acceptance` accepts a Program Curator for the candidate Program and returns `AcceptedAssessmentCriterionSummary`.
16. Criterion acceptance without `targetEntityId` creates one accepted entity and one accepted revision.
17. Criterion acceptance with `targetEntityId` creates a new current revision and preserves the previous historical revision.
18. Criterion acceptance rejects unknown candidates with `404 criterion_candidate_not_found`.
19. Criterion acceptance rejects already accepted candidates with `409 criterion_candidate_already_accepted`.
20. Criterion acceptance rejects already rejected candidates with `409 criterion_candidate_already_rejected`.
21. Criterion acceptance rejects unknown target entities with `404 criterion_entity_not_found`.
22. Criterion acceptance rejects cross-Program target entities with `409 criterion_entity_program_mismatch`.
23. Criterion acceptance rejects non-curator callers with `403 admin_or_curator_required`.
24. `POST /assessment-criteria/candidates/{candidateId}/rejection` accepts a Program Curator and returns the rejected `AssessmentCriterionCandidateSummary`.
25. Criterion rejection rejects malformed and non-empty JSON bodies with `400 validation_failed`.
26. Criterion rejection rejects unknown candidates with `404 criterion_candidate_not_found`.
27. Criterion rejection rejects already accepted candidates with `409 criterion_candidate_already_accepted`.
28. Criterion rejection rejects already rejected candidates with `409 criterion_candidate_already_rejected`.
29. Criterion rejection rejects non-curator callers with `403 admin_or_curator_required`.
30. Criterion rejection does not delete accepted criterion revisions.

Accepted criterion routes:

31. `GET /programs/{programId}/assessment-criteria` accepts an effective Student for the requested Program.
32. `GET /programs/{programId}/assessment-criteria` accepts an effective Program Curator for the requested Program.
33. `GET /programs/{programId}/assessment-criteria` accepts an effective Admin.
34. `GET /programs/{programId}/assessment-criteria` rejects callers without Student, Curator, or Admin access with `403 participation_required`.
35. Criterion listing returns only current accepted revisions scoped to the requested Program.
36. Criterion listing never exposes draft or rejected candidates.
37. Criterion listing defaults `limit` to `50` and rejects invalid limits or malformed cursors with `400 validation_failed`.
38. `GET /assessment-criteria/revisions/{revisionId}` returns an addressable historical criterion revision for an authorized Student, Curator, or Admin.
39. `GET /assessment-criteria/revisions/{revisionId}` rejects unknown revision ids with `404 criterion_revision_not_found`.
40. `GET /assessment-criteria/revisions/{revisionId}` rejects unauthorized callers with `403 participation_required`.

Open-answer check candidate routes:

41. `GET /programs/{programId}/open-answer-checks/candidates` accepts an effective Program Curator and returns only check candidates for the requested Program.
42. `GET /programs/{programId}/open-answer-checks/candidates` applies `draft`, `accepted`, and `rejected` status filters.
43. `GET /programs/{programId}/open-answer-checks/candidates` rejects unsupported status filters, invalid limits, and malformed cursors with `400 validation_failed`.
44. `GET /programs/{programId}/open-answer-checks/candidates` rejects Students, Admin-without-curator, and other non-curators with `403 admin_or_curator_required`.
45. `POST /programs/{programId}/open-answer-checks/candidates` accepts valid open-answer check input and returns a `draft` `OpenAnswerCheckCandidateSummary`.
46. Accepted check candidate creation does not create accepted checks.
47. Check candidate creation rejects malformed JSON, non-object JSON, missing bodies, unsupported fields, unsupported check kinds, malformed titles, malformed prompts, malformed rationales, non-array `sourceIds`, non-string `sourceIds`, missing `criterionEntityIds`, empty `criterionEntityIds`, non-array `criterionEntityIds`, and non-string `criterionEntityIds` with `400 validation_failed`.
48. Check candidate creation rejects unknown source ids with `409 source_not_found`.
49. Check candidate creation rejects cross-Program source ids with `409 source_program_mismatch`.
50. Check candidate creation rejects unknown criterion entities with `404 criterion_entity_not_found`.
51. Check candidate creation rejects cross-Program criterion entities with `409 criterion_entity_program_mismatch`.

Open-answer check acceptance and rejection routes:

52. `POST /open-answer-checks/candidates/{candidateId}/acceptance` accepts a Program Curator for the candidate Program and returns `AcceptedOpenAnswerCheckSummary`.
53. Check acceptance without `targetEntityId` creates one accepted entity and one accepted revision.
54. Check acceptance snapshots current criterion revision ids for every referenced criterion entity.
55. Check acceptance with `targetEntityId` creates a new current revision and preserves the previous historical revision.
56. Check acceptance rejects unknown candidates with `404 check_candidate_not_found`.
57. Check acceptance rejects already accepted candidates with `409 check_candidate_already_accepted`.
58. Check acceptance rejects already rejected candidates with `409 check_candidate_already_rejected`.
59. Check acceptance rejects unknown target entities with `404 check_entity_not_found`.
60. Check acceptance rejects cross-Program target entities with `409 check_entity_program_mismatch`.
61. Check acceptance rejects non-curator callers with `403 admin_or_curator_required`.
62. `POST /open-answer-checks/candidates/{candidateId}/rejection` accepts a Program Curator and returns the rejected `OpenAnswerCheckCandidateSummary`.
63. Check rejection rejects malformed and non-empty JSON bodies with `400 validation_failed`.
64. Check rejection rejects unknown candidates with `404 check_candidate_not_found`.
65. Check rejection rejects already accepted candidates with `409 check_candidate_already_accepted`.
66. Check rejection rejects already rejected candidates with `409 check_candidate_already_rejected`.
67. Check rejection rejects non-curator callers with `403 admin_or_curator_required`.
68. Check rejection does not delete accepted check revisions or criterion revision references.

Accepted open-answer check routes:

69. `GET /programs/{programId}/open-answer-checks` accepts an effective Student for the requested Program.
70. `GET /programs/{programId}/open-answer-checks` accepts an effective Program Curator for the requested Program.
71. `GET /programs/{programId}/open-answer-checks` accepts an effective Admin.
72. `GET /programs/{programId}/open-answer-checks` rejects callers without Student, Curator, or Admin access with `403 participation_required`.
73. Check listing returns only current accepted revisions scoped to the requested Program.
74. Check listing never exposes draft or rejected candidates.
75. Check listing defaults `limit` to `50` and rejects invalid limits or malformed cursors with `400 validation_failed`.
76. `GET /open-answer-checks/revisions/{revisionId}` returns an addressable historical check revision for an authorized Student, Curator, or Admin.
77. `GET /open-answer-checks/revisions/{revisionId}` rejects unknown revision ids with `404 check_revision_not_found`.
78. `GET /open-answer-checks/revisions/{revisionId}` rejects unauthorized callers with `403 participation_required`.
79. A check revision remains linked to the original criterion revision after the accepted criterion is revised.

Redaction and out-of-scope routes:

80. Candidate, accepted-list, historical-revision, acceptance, and rejection responses do not expose password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
81. Candidate and accepted-list cursors do not expose secrets, SQL text, filesystem paths, stack traces, session identifiers, CSRF tokens, cookie headers, or authorization headers.
82. Fault responses map unexpected errors to `500 internal_error` without leaking implementation details.
83. The API does not expose Admin UI, Curator UI, Student UI, CLI commands, Student Workspace attempts, submitted answers, selected answers, evaluation results, scoring, generated feedback, mastery calculation, weak-area calculation, progress evidence, LLM execution, or human review workflow.

Executable acceptance flow:

84. A logged-in Program Curator creates a Program through the existing Program API, records a source, creates and accepts a criterion, creates and accepts an open-answer check linked to that criterion, revises the criterion, verifies the accepted check revision still points at the original criterion revision, lists accepted checks and criteria as a Student, fetches historical criterion and check revisions, rejects separate draft criterion and check candidates, confirms draft/rejected candidates are absent from accepted reads, and verifies no Student Workspace state, scoring, feedback, LLM, human review, UI, or CLI surface is introduced.

## Done criteria

- HTTP routes match the endpoint table and shared result envelope.
- HTTP routes use the existing Identity session, CSRF, redaction, and bounded opaque-cursor conventions.
- HTTP routes delegate to the implemented accepted-checks and assessment-criteria domain command/query boundary instead of duplicating Program Membership or Corpus policy.
- All behavior rules have executable HTTP acceptance or integration coverage.
- All listed tests pass in the Agonara workspace and the repo-wide Node gates.
- Responses, cursors, and faults satisfy the redaction rules in this spec and the Identity API spec.
- Admin authority without Program Curator participation is read-only for accepted checks and criteria.
- No Admin UI, Curator UI, Student UI, CLI commands, Student Workspace attempts, submitted answers, selected answers, scoring, generated feedback, mastery state, weak-area state, progress evidence, LLM execution, or human review workflow is introduced by this API slice.
