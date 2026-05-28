---
date: 2026-05-28
model: gpt-5
description: "Spec: Agonara Corpus Storage and Curator Acceptance HTTP API v0.0.1."
version: 0.0.1
status: draft
type: spec
---

# Corpus Storage and Curator Acceptance API

## Goal

Define the public HTTP API and executable acceptance scenarios for Agonara Corpus Storage and Curator Acceptance v0.0.1, owned by the Corpus Storage and Curator Workspace API boundary.

This spec operationalizes [Corpus Storage and Curator Acceptance First Slice](corpus-storage-and-curator-acceptance-first-slice.md) and [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md) through the existing session, CSRF, envelope, and redaction conventions from [Identity & Role Management API and CLI](identity-role-management-api-cli.md) and [Program Shell and Membership API](program-shell-and-membership-api.md). It defines HTTP behavior only; it does not add UI, CLI, material storage, LLM execution, assessment, Student Workspace state, or new Corpus domain rules.

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

`ApiRejectionReason` includes Corpus rejection reasons from [Corpus Storage and Curator Acceptance First Slice](corpus-storage-and-curator-acceptance-first-slice.md) plus session and CSRF reasons from [Identity & Role Management API and CLI](identity-role-management-api-cli.md):

```ts
type ApiRejectionReason =
  | "identity_not_found"
  | "identity_disabled"
  | "program_not_found"
  | "admin_or_curator_required"
  | "participation_required"
  | "candidate_not_found"
  | "candidate_not_accepted"
  | "revision_not_found"
  | "accepted_entity_not_found"
  | "accepted_entity_program_mismatch"
  | "accepted_kind_mismatch"
  | "candidate_already_accepted"
  | "candidate_already_rejected"
  | "source_not_found"
  | "source_program_mismatch"
  | "validation_failed"
  | "session_not_found"
  | "session_expired"
  | "session_revoked"
  | "csrf_required"
  | "csrf_invalid";

type CorpusEventRejectionReason =
  | "identity_not_found"
  | "identity_disabled"
  | "program_not_found"
  | "admin_or_curator_required"
  | "participation_required"
  | "candidate_not_found"
  | "candidate_not_accepted"
  | "revision_not_found"
  | "accepted_entity_not_found"
  | "accepted_entity_program_mismatch"
  | "accepted_kind_mismatch"
  | "candidate_already_accepted"
  | "candidate_already_rejected"
  | "source_not_found"
  | "source_program_mismatch"
  | "validation_failed";
```

Fault responses do not include secrets, password hashes, session identifiers, CSRF tokens, cookie headers, authorization headers, stack traces, SQL text, filesystem paths, database URLs, or infrastructure details.

### Shared API shapes

```ts
type SourceKind =
  | "public_plan"
  | "exam_requirement"
  | "standard"
  | "textbook"
  | "article"
  | "lecture"
  | "course"
  | "note"
  | "research_result"
  | "other";

type CandidateKind = "topic" | "concept";
type CandidateStatus = "draft" | "accepted" | "rejected";
type AcceptedCorpusKind = "topic" | "concept";

type ProgramSourceSummary = {
  sourceId: string;
  programId: string;
  sourceKind: SourceKind;
  title: string;
  locator?: string;
  citation?: string;
  recordedByIdentityId: string;
  recordedAt: string;
};

type CorpusCandidateSummary = {
  candidateId: string;
  programId: string;
  candidateKind: CandidateKind;
  title: string;
  body?: string;
  sourceIds: string[];
  rationale?: string;
  status: CandidateStatus;
  createdByIdentityId: string;
  createdAt: string;
  updatedAt: string;
};

type AcceptedCorpusSummary = {
  entityId: string;
  revisionId: string;
  programId: string;
  acceptedKind: AcceptedCorpusKind;
  title: string;
  body?: string;
  acceptedFromCandidateId: string;
  sourceIds: string[];
  rationale?: string;
  acceptedByIdentityId: string;
  acceptedAt: string;
};

type CorpusEventSummary = {
  corpusEventId: string;
  eventType:
    | "program_source_recorded"
    | "corpus_candidate_created"
    | "corpus_candidate_accepted"
    | "corpus_candidate_rejected";
  actorIdentityId: string;
  programId?: string;
  targetId?: string;
  occurredAt: string;
  outcome: "accepted" | "rejected";
  reason?: CorpusEventRejectionReason;
};

type CorpusCandidateList = {
  corpusCandidates: CorpusCandidateSummary[];
  nextCursor?: string;
};

type CorpusEventList = {
  corpusEvents: CorpusEventSummary[];
  nextCursor?: string;
};
```

### HTTP session transport

The Corpus API authenticates browser clients with the existing server-managed `agonara_session` cookie.

State-changing Corpus API requests require `X-Agonara-CSRF: <csrfToken>` from the active session. Read-only `GET` requests do not require a CSRF header.

The Corpus API never returns the session identifier or CSRF token. Clients obtain CSRF tokens through the Identity session API.

### HTTP endpoints

| Method | Path | Auth | Accepted response | Rejected status mapping |
|---|---|---|---|---|
| `GET` | `/programs/{programId}/sources` | Program Curator session | `AcceptedResult<{ programSources: ProgramSourceSummary[] }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_or_curator_required`, `404 program_not_found` |
| `POST` | `/programs/{programId}/sources` | Program Curator session and CSRF header | `AcceptedResult<{ programSource: ProgramSourceSummary }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `403 admin_or_curator_required`, `404 program_not_found` |
| `GET` | `/programs/{programId}/corpus-candidates?status={status}&limit={limit}&cursor={cursor}` | Program Curator session | `AcceptedResult<CorpusCandidateList>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_or_curator_required`, `404 program_not_found` |
| `POST` | `/programs/{programId}/corpus-candidates` | Program Curator session and CSRF header | `AcceptedResult<{ corpusCandidate: CorpusCandidateSummary }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `403 admin_or_curator_required`, `404 program_not_found`, `409 source_not_found`, `409 source_program_mismatch` |
| `POST` | `/corpus-candidates/{candidateId}/acceptance` | Program Curator session and CSRF header | `AcceptedResult<{ acceptedCorpus: AcceptedCorpusSummary }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `403 admin_or_curator_required`, `404 candidate_not_found`, `404 accepted_entity_not_found`, `409 accepted_entity_program_mismatch`, `409 accepted_kind_mismatch`, `409 candidate_already_accepted`, `409 candidate_already_rejected` |
| `POST` | `/corpus-candidates/{candidateId}/rejection` | Program Curator session and CSRF header | `AcceptedResult<{ corpusCandidate: CorpusCandidateSummary }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 csrf_required`, `403 csrf_invalid`, `403 admin_or_curator_required`, `404 candidate_not_found`, `409 candidate_already_accepted`, `409 candidate_already_rejected` |
| `GET` | `/programs/{programId}/accepted-corpus?acceptedKind={acceptedKind}` | Student, Program Curator, or Admin session | `AcceptedResult<{ acceptedCorpus: AcceptedCorpusSummary[] }>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 participation_required`, `404 program_not_found` |
| `GET` | `/accepted-corpus-revisions/{revisionId}` | Student, Program Curator, or Admin session | `AcceptedResult<{ acceptedCorpus: AcceptedCorpusSummary }>` | `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 participation_required`, `404 revision_not_found`, `404 program_not_found` |
| `GET` | `/programs/{programId}/corpus-events?limit={limit}&cursor={cursor}` | Program Curator session | `AcceptedResult<CorpusEventList>` | `400 validation_failed`, `401 session_not_found`, `401 session_expired`, `401 session_revoked`, `403 identity_disabled`, `403 admin_or_curator_required`, `404 program_not_found` |

Request bodies:

```ts
type RecordProgramSourceRequest = {
  sourceKind: SourceKind;
  title: string;
  locator?: string;
  citation?: string;
};

type CreateCorpusCandidateRequest = {
  candidateKind: CandidateKind;
  title: string;
  body?: string;
  sourceIds?: string[];
  rationale?: string;
};

type AcceptCorpusCandidateRequest = {
  targetEntityId?: string;
};

type CorpusCandidateQuery = {
  status?: CandidateStatus;
  limit?: number;
  cursor?: string;
};

type AcceptedCorpusQuery = {
  acceptedKind?: AcceptedCorpusKind;
};

type CorpusEventQuery = {
  limit?: number;
  cursor?: string;
};
```

`POST /corpus-candidates/{candidateId}/acceptance` accepts an empty JSON object when no `targetEntityId` is supplied. `POST /corpus-candidates/{candidateId}/rejection` ignores no request body and rejects malformed JSON bodies with `400 validation_failed`.

## Behavior rules

1. Every Corpus API endpoint requires a valid active HTTP session.
2. Corpus API session resolution uses the existing Identity session contract before invoking Corpus commands or queries.
3. Session resolution rejects missing, unknown, expired, and revoked sessions with the same `401` status and reason as the Identity API.
4. Session resolution rejects disabled Identities with `403 identity_disabled`.
5. State-changing Corpus API endpoints reject missing sessions with `401 session_not_found` before CSRF validation.
6. State-changing Corpus API endpoints reject missing or invalid CSRF tokens before applying Corpus domain changes.
7. State-changing Corpus API endpoints do not create or rotate sessions.
8. Routes containing `{programId}` reject unknown Program identifiers with `404 program_not_found` before returning Program-scoped data.
9. `GET /programs/{programId}/sources` maps to `listProgramSources` for the resolved session Identity and requested Program.
10. `POST /programs/{programId}/sources` maps to `recordProgramSource` for the resolved session Identity and requested Program.
11. `POST /programs/{programId}/sources` accepts only JSON objects matching `RecordProgramSourceRequest`.
12. Source creation rejects malformed JSON, non-object JSON, missing bodies, or bodies that cannot be parsed as JSON with `400 validation_failed`.
13. Source creation rejects unsupported `sourceKind`, missing titles, empty titles, whitespace-only titles, non-string titles, malformed `locator`, or malformed `citation` with `400 validation_failed`.
14. Accepted source creation creates one Program-scoped source and one accepted `program_source_recorded` Corpus event.
15. `GET /programs/{programId}/corpus-candidates` maps to `listCorpusCandidates` for the resolved session Identity and requested Program.
16. Candidate listing accepts only `draft`, `accepted`, and `rejected` status filters.
17. Candidate listing returns only candidates scoped to the requested Program.
18. Candidate listing never returns accepted corpus entities or accepted corpus revisions as candidate records.
19. `POST /programs/{programId}/corpus-candidates` maps to `createCorpusCandidate` for the resolved session Identity and requested Program.
20. Candidate creation accepts only JSON objects matching `CreateCorpusCandidateRequest`.
21. Candidate creation rejects malformed JSON, non-object JSON, missing bodies, or bodies that cannot be parsed as JSON with `400 validation_failed`.
22. Candidate creation rejects unsupported `candidateKind`, missing titles, empty titles, whitespace-only titles, non-string titles, malformed `body`, malformed `rationale`, or non-array `sourceIds` with `400 validation_failed`.
23. Candidate creation rejects unknown source identifiers with `409 source_not_found`.
24. Candidate creation rejects source identifiers from another Program with `409 source_program_mismatch`.
25. Accepted candidate creation creates one `draft` candidate and one accepted `corpus_candidate_created` Corpus event.
26. Candidate creation does not create accepted corpus.
27. `POST /corpus-candidates/{candidateId}/acceptance` maps to `acceptCorpusCandidate` for the resolved session Identity and candidate identifier.
28. Candidate acceptance resolves the candidate before checking Program Curator authorization for the candidate's Program.
29. Candidate acceptance rejects unknown candidates with `404 candidate_not_found`.
30. Candidate acceptance rejects already accepted candidates with `409 candidate_already_accepted`.
31. Candidate acceptance rejects already rejected candidates with `409 candidate_already_rejected`.
32. Candidate acceptance rejects unknown `targetEntityId` values with `404 accepted_entity_not_found`.
33. Candidate acceptance rejects target accepted corpus entities from another Program with `409 accepted_entity_program_mismatch`.
34. Candidate acceptance rejects target accepted corpus entities whose accepted kind differs from the candidate kind with `409 accepted_kind_mismatch`.
35. Accepted candidate acceptance creates or updates one stable accepted corpus entity current revision and one accepted `corpus_candidate_accepted` Corpus event.
36. Candidate acceptance preserves source ids, candidate id, rationale, accepting Identity id, Program id, accepted kind, title, body, and acceptance time in the accepted revision response.
37. `POST /corpus-candidates/{candidateId}/rejection` maps to `rejectCorpusCandidate` for the resolved session Identity and candidate identifier.
38. Candidate rejection resolves the candidate before checking Program Curator authorization for the candidate's Program.
39. Candidate rejection rejects unknown candidates with `404 candidate_not_found`.
40. Candidate rejection rejects already accepted candidates with `409 candidate_already_accepted`.
41. Candidate rejection rejects already rejected candidates with `409 candidate_already_rejected`.
42. Accepted candidate rejection changes the candidate status to `rejected` and creates one accepted `corpus_candidate_rejected` Corpus event.
43. Rejected candidate creation, acceptance, and rejection commands create rejected Corpus events only when the acting Identity and Program can be resolved.
44. `GET /programs/{programId}/accepted-corpus` maps to `listAcceptedCorpus` for the resolved session Identity and requested Program.
45. Accepted corpus listing accepts only `topic` and `concept` accepted-kind filters.
46. Accepted corpus listing requires effective Student participation, effective Program Curator participation, or effective Admin authority for the requested Program.
47. Accepted corpus listing returns only current accepted revisions scoped to the requested Program.
48. Accepted corpus listing never returns draft or rejected candidates.
49. `GET /accepted-corpus-revisions/{revisionId}` maps to `getAcceptedCorpusRevision` for the resolved session Identity and requested revision.
50. Accepted revision lookup resolves access through the revision's Program after resolving the revision.
51. Accepted revision lookup returns historical revisions even when they are no longer current.
52. Accepted revision lookup rejects unknown revision identifiers with `404 revision_not_found`.
53. `GET /programs/{programId}/corpus-events` maps to `listCorpusEvents` for the resolved session Identity and requested Program.
54. Corpus event listing requires effective Program Curator participation for the requested Program.
55. Corpus event listing returns only Corpus events scoped to the requested Program.
56. Corpus event endpoint `reason` fields include only Corpus domain rejection reasons, never session, CSRF, cookie, transport, or fault reasons.
57. Candidate and event list endpoints accept `limit` values from `1` through `100`, default to `50`, and reject invalid limits with `400 validation_failed`.
58. Candidate and event list cursors are opaque strings returned by the API; malformed, unknown, or expired cursors reject with `400 validation_failed`.
59. Candidate and event list cursors must not encode secrets, SQL text, filesystem paths, stack traces, session identifiers, CSRF tokens, cookie headers, or authorization headers.
60. Corpus API responses never include password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
61. Corpus API fault responses map unexpected failures to `500` with `FaultResult`.
62. This API slice does not expose Admin UI, Curator UI, Student UI, CLI commands, material file storage, source ingestion jobs, LLM execution, assessment, Student Workspace state, accepted checks, accepted criteria, Program Membership mutation beyond existing session authorization, Program archival, Program deletion, Program ownership transfer, curator leave/removal, collaborative editing, branching, merging, or conflict-resolution behavior.

## Product intent traceability

| Story | Behavior covered |
|---|---|
| CUR-01 - Create program from grounded sources | Source and accepted corpus routes expose source-grounded Program content after Program shell creation. |
| CUR-02 - Add topics and concepts | Candidate creation and acceptance routes expose topic/concept acceptance into the Program corpus. |
| CUR-06 - Keep accepted content separate from drafts | Candidate routes remain curator-only; accepted corpus routes expose only accepted revisions. |
| CUR-07 - Add external sources | Program source routes expose source metadata capture and listing. |
| CUR-08 - Extract candidate structure from sources | Candidate routes expose reviewable candidate topic/concept records grounded in source ids. |
| CUR-10 - Update program after research | Acceptance into an existing entity exposes revision replacement without erasing historical revisions. |
| CUR-13 - Trace suggestion origin | Accepted corpus responses preserve candidate and source provenance. |
| INT-01 - Собрать программу из источников | HTTP routes expose accepted source-to-candidate-to-corpus flow. |
| INT-02 - Увидеть понятийный аппарат темы | Accepted corpus routes expose accepted topic/concept summaries to authorized students and curators. |

## Tests (required)

HTTP session and CSRF:

1. `GET /programs/{programId}/sources` rejects a missing session with `401 session_not_found`.
2. `GET /programs/{programId}/accepted-corpus` rejects a disabled session Identity with `403 identity_disabled`.
3. `POST /programs/{programId}/sources` rejects a valid session without CSRF with `403 csrf_required`.
4. `POST /programs/{programId}/corpus-candidates` rejects an invalid CSRF token with `403 csrf_invalid`.
5. Corpus API responses do not include session identifiers or CSRF tokens.

Source routes:

6. `GET /programs/{programId}/sources` accepts an effective Program Curator and returns only sources for the requested Program.
7. `GET /programs/{programId}/sources` rejects a non-curator caller with `403 admin_or_curator_required`.
8. `GET /programs/{programId}/sources` rejects an unknown Program with `404 program_not_found`.
9. `POST /programs/{programId}/sources` accepts a valid Program Curator request and returns `ProgramSourceSummary`.
10. Accepted `POST /programs/{programId}/sources` creates one accepted `program_source_recorded` Corpus event.
11. `POST /programs/{programId}/sources` rejects malformed JSON, non-object JSON, and missing bodies with `400 validation_failed`.
12. `POST /programs/{programId}/sources` rejects unsupported source kinds, missing titles, empty titles, malformed locators, and malformed citations with `400 validation_failed`.

Candidate routes:

13. `GET /programs/{programId}/corpus-candidates` accepts an effective Program Curator and returns only candidates for the requested Program.
14. `GET /programs/{programId}/corpus-candidates` applies `draft`, `accepted`, and `rejected` status filters.
15. `GET /programs/{programId}/corpus-candidates` rejects unsupported status filters, invalid limits, and malformed cursors with `400 validation_failed`.
16. `GET /programs/{programId}/corpus-candidates` rejects a non-curator caller with `403 admin_or_curator_required`.
17. `POST /programs/{programId}/corpus-candidates` accepts valid candidate input and returns a `draft` `CorpusCandidateSummary`.
18. Accepted candidate creation creates one accepted `corpus_candidate_created` Corpus event.
19. Accepted candidate creation does not create accepted corpus.
20. `POST /programs/{programId}/corpus-candidates` rejects malformed JSON, non-object JSON, and missing bodies with `400 validation_failed`.
21. `POST /programs/{programId}/corpus-candidates` rejects unsupported candidate kinds, missing titles, empty titles, malformed bodies, malformed rationales, and non-array `sourceIds` with `400 validation_failed`.
22. Candidate creation rejects unknown source ids with `409 source_not_found`.
23. Candidate creation rejects cross-Program source ids with `409 source_program_mismatch`.

Candidate acceptance and rejection routes:

24. `POST /corpus-candidates/{candidateId}/acceptance` accepts a Program Curator for the candidate Program and returns `AcceptedCorpusSummary`.
25. Acceptance without `targetEntityId` creates one accepted entity and one accepted revision.
26. Acceptance with `targetEntityId` creates a new current revision and preserves the previous historical revision.
27. Candidate acceptance rejects unknown candidates with `404 candidate_not_found`.
28. Candidate acceptance rejects already accepted candidates with `409 candidate_already_accepted`.
29. Candidate acceptance rejects already rejected candidates with `409 candidate_already_rejected`.
30. Candidate acceptance rejects unknown target entities with `404 accepted_entity_not_found`.
31. Candidate acceptance rejects cross-Program target entities with `409 accepted_entity_program_mismatch`.
32. Candidate acceptance rejects accepted-kind mismatches with `409 accepted_kind_mismatch`.
33. Candidate acceptance rejects non-curator callers with `403 admin_or_curator_required`.
34. Accepted candidate acceptance creates one accepted `corpus_candidate_accepted` Corpus event.
35. Rejected candidate acceptance creates a rejected `corpus_candidate_accepted` Corpus event when the acting Identity and Program resolve.
36. `POST /corpus-candidates/{candidateId}/rejection` accepts a Program Curator and returns the rejected `CorpusCandidateSummary`.
37. Candidate rejection rejects unknown candidates with `404 candidate_not_found`.
38. Candidate rejection rejects already accepted candidates with `409 candidate_already_accepted`.
39. Candidate rejection rejects already rejected candidates with `409 candidate_already_rejected`.
40. Candidate rejection rejects non-curator callers with `403 admin_or_curator_required`.
41. Accepted candidate rejection creates one accepted `corpus_candidate_rejected` Corpus event.
42. Rejected candidate rejection creates a rejected `corpus_candidate_rejected` Corpus event when the acting Identity and Program resolve.

Accepted corpus routes:

43. `GET /programs/{programId}/accepted-corpus` accepts an effective Student for the requested Program.
44. `GET /programs/{programId}/accepted-corpus` accepts an effective Program Curator for the requested Program.
45. `GET /programs/{programId}/accepted-corpus` accepts an effective Admin.
46. `GET /programs/{programId}/accepted-corpus` rejects a caller without Student, Curator, or Admin access with `403 participation_required`.
47. `GET /programs/{programId}/accepted-corpus` returns only current accepted revisions scoped to the requested Program.
48. `GET /programs/{programId}/accepted-corpus` applies `topic` and `concept` accepted-kind filters.
49. `GET /programs/{programId}/accepted-corpus` rejects unsupported accepted-kind filters with `400 validation_failed`.
50. Accepted corpus listing never exposes draft or rejected candidates.
51. `GET /accepted-corpus-revisions/{revisionId}` returns an addressable historical revision for an authorized Student, Curator, or Admin.
52. `GET /accepted-corpus-revisions/{revisionId}` rejects unknown revision ids with `404 revision_not_found`.
53. `GET /accepted-corpus-revisions/{revisionId}` rejects unauthorized callers with `403 participation_required`.

Corpus event routes:

54. `GET /programs/{programId}/corpus-events` rejects non-curator callers with `403 admin_or_curator_required`.
55. `GET /programs/{programId}/corpus-events` accepts active Program Curator callers for their Programs.
56. `GET /programs/{programId}/corpus-events` rejects unknown Programs with `404 program_not_found`.
57. Corpus event routes return only Corpus events scoped to the requested Program.
58. Corpus event route `reason` fields include only Corpus domain rejection reasons, not session, CSRF, cookie, transport, or fault reasons.
59. Corpus event routes default `limit` to `50`.
60. Corpus event routes reject `limit` values below `1`, above `100`, non-numeric values, and malformed cursors with `400 validation_failed`.
61. Corpus event route responses and cursors do not expose password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.

Executable acceptance flow:

62. A logged-in Program Curator creates a Program through the existing Program API, records a source, creates a candidate topic, accepts it into accepted corpus, lists accepted corpus as a Student, replaces the current revision with a later accepted candidate, fetches the historical revision, rejects a separate draft candidate, confirms draft/rejected candidates are absent from accepted corpus, and inspects scoped Corpus events with CSRF enforced on all state-changing requests.
63. The Corpus API does not expose Admin UI, Curator UI, Student UI, CLI commands, material file storage, source ingestion jobs, LLM execution, assessment, Student Workspace state, accepted checks, accepted criteria, Program archival, Program deletion, Program ownership transfer, curator leave/removal, collaborative editing, branching, merging, or conflict-resolution behavior.

## Done criteria

- HTTP routes match the endpoint table and shared result envelope.
- Corpus API routes use the existing Identity session and CSRF transport contract.
- Corpus API routes delegate to the implemented Corpus domain command/query boundary instead of duplicating Program Membership or Corpus policy.
- All behavior rules have executable HTTP acceptance or integration coverage.
- All listed tests pass in the Agonara workspace and the repo-wide Node gates.
- Responses, cursors, events, and faults satisfy the redaction rules in this spec and the Identity API spec.
- No Admin UI, Curator UI, Student UI, CLI commands, material storage, source ingestion jobs, LLM execution, assessment, Student Workspace state, accepted checks, accepted criteria, or new Corpus domain rules are introduced by this API slice.
