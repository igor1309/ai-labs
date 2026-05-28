---
date: 2026-05-28
model: gpt-5
description: "Spec: Agonara Corpus Storage and Curator Acceptance first-slice contract."
version: 0.0.1
status: draft
type: spec
---

# Corpus Storage and Curator Acceptance First Slice

## Goal

Define the Agonara v0.0.1 backend contract for Program-scoped source records, curator candidate topic/concept records, explicit acceptance into stable accepted corpus revisions, and read-only accepted corpus queries owned by Corpus Storage and Curator Workspace.

This spec operationalizes [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md) through the Program scope and effective `Program Curator` participation contract accepted by [ADR-009](../adr/adr-009-program-shell-and-initial-curator-participation.md) and [ADR-007](../adr/adr-007-effective-participation-authorization-contract.md).

## Public interface

### Logical records

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

type ProgramSource = {
  id: ProgramSourceId;
  programId: ProgramId;
  sourceKind: SourceKind;
  title: string;
  locator?: string;
  citation?: string;
  recordedByIdentityId: IdentityId;
  recordedAt: Instant;
};

type CorpusCandidate = {
  id: CorpusCandidateId;
  programId: ProgramId;
  candidateKind: CandidateKind;
  title: string;
  body?: string;
  sourceIds: ProgramSourceId[];
  rationale?: string;
  status: CandidateStatus;
  createdByIdentityId: IdentityId;
  createdAt: Instant;
  updatedAt: Instant;
};

type AcceptedCorpusEntity = {
  id: AcceptedCorpusEntityId;
  programId: ProgramId;
  acceptedKind: AcceptedCorpusKind;
  currentRevisionId: AcceptedCorpusRevisionId;
};

type AcceptedCorpusRevision = {
  id: AcceptedCorpusRevisionId;
  entityId: AcceptedCorpusEntityId;
  programId: ProgramId;
  acceptedKind: AcceptedCorpusKind;
  title: string;
  body?: string;
  acceptedFromCandidateId: CorpusCandidateId;
  sourceIds: ProgramSourceId[];
  rationale?: string;
  acceptedByIdentityId: IdentityId;
  acceptedAt: Instant;
};

type CorpusEvent = {
  id: CorpusEventId;
  eventType:
    | "program_source_recorded"
    | "corpus_candidate_created"
    | "corpus_candidate_accepted"
    | "corpus_candidate_rejected";
  actorIdentityId: IdentityId;
  programId?: ProgramId;
  targetId?: string;
  occurredAt: Instant;
  outcome: "accepted" | "rejected";
  reason?: CorpusRejectionReason;
};
```

`ProgramSourceId`, `CorpusCandidateId`, `AcceptedCorpusEntityId`, `AcceptedCorpusRevisionId`, and `CorpusEventId` are opaque stable identifiers.

### Commands

```ts
recordProgramSource(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  sourceKind: SourceKind;
  title: string;
  locator?: string;
  citation?: string;
}) -> RecordProgramSourceResult

createCorpusCandidate(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  candidateKind: CandidateKind;
  title: string;
  body?: string;
  sourceIds?: ProgramSourceId[];
  rationale?: string;
}) -> CreateCorpusCandidateResult

acceptCorpusCandidate(input: {
  actingIdentityId: IdentityId;
  candidateId: CorpusCandidateId;
  targetEntityId?: AcceptedCorpusEntityId;
}) -> AcceptCorpusCandidateResult

rejectCorpusCandidate(input: {
  actingIdentityId: IdentityId;
  candidateId: CorpusCandidateId;
}) -> RejectCorpusCandidateResult
```

Each command result is either:

- `{ status: "accepted"; value: ... }`
- `{ status: "rejected"; reason: CorpusRejectionReason }`

### Queries

```ts
listProgramSources(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
}) -> ListProgramSourcesResult

listCorpusCandidates(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  status?: CandidateStatus;
}) -> ListCorpusCandidatesResult

listAcceptedCorpus(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  acceptedKind?: AcceptedCorpusKind;
}) -> ListAcceptedCorpusResult

getAcceptedCorpusRevision(input: {
  actingIdentityId: IdentityId;
  revisionId: AcceptedCorpusRevisionId;
}) -> GetAcceptedCorpusRevisionResult

listCorpusEvents(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
}) -> ListCorpusEventsResult
```

`recordProgramSource`, `createCorpusCandidate`, `acceptCorpusCandidate`, `rejectCorpusCandidate`, `listProgramSources`, `listCorpusCandidates`, and `listCorpusEvents` require effective `Program Curator` participation for the Program.

`listAcceptedCorpus` and `getAcceptedCorpusRevision` require effective `Student` participation, effective `Program Curator` participation, or effective `Admin` authority for the Program.

### Result shapes

```ts
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
  reason?: CorpusRejectionReason;
};

type CorpusRejectionReason =
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

## Behavior rules

1. Every command and query requires a known active acting internal Identity.
2. Commands and queries reject unknown acting Identities with `identity_not_found`.
3. Commands and queries reject disabled acting Identities with `identity_disabled`.
4. Program-scoped commands and queries reject unknown Program identifiers with `program_not_found`.
5. Curator commands and curator-only queries reject callers without effective `Program Curator` participation for the Program with `admin_or_curator_required`.
6. Accepted corpus read queries reject callers without effective `Student`, `Program Curator`, or `Admin` access for the Program with `participation_required`.
7. `recordProgramSource` accepts only known `SourceKind` values.
8. `recordProgramSource` requires a non-empty `title`.
9. `recordProgramSource` rejects malformed `locator` or `citation` values with `validation_failed`.
10. Accepted `recordProgramSource` creates one Program-scoped source record.
11. Program source records are not accepted topics, concepts, materials, checks, criteria, or learner state by themselves.
12. `createCorpusCandidate` accepts only `topic` and `concept` candidates in this slice.
13. `createCorpusCandidate` requires a non-empty `title`.
14. `createCorpusCandidate` rejects malformed `body` or `rationale` values with `validation_failed`.
15. `createCorpusCandidate` rejects unknown source identifiers with `source_not_found`.
16. `createCorpusCandidate` rejects source identifiers from another Program with `source_program_mismatch`.
17. Accepted `createCorpusCandidate` creates one `draft` candidate scoped to the Program.
18. Creating a candidate does not create accepted corpus.
19. Draft candidates are visible through curator candidate queries only.
20. Draft candidates are not visible through accepted corpus queries.
21. `acceptCorpusCandidate` rejects unknown candidates with `candidate_not_found`.
22. `acceptCorpusCandidate` rejects already accepted candidates with `candidate_already_accepted`.
23. `acceptCorpusCandidate` rejects already rejected candidates with `candidate_already_rejected`.
24. `acceptCorpusCandidate` requires effective `Program Curator` participation for the candidate's Program.
25. Accepted `acceptCorpusCandidate` changes the candidate status to `accepted`.
26. `acceptCorpusCandidate` without `targetEntityId` creates one accepted corpus entity.
27. `acceptCorpusCandidate` with `targetEntityId` rejects unknown target entities with `accepted_entity_not_found`.
28. `acceptCorpusCandidate` with `targetEntityId` rejects target entities from another Program with `accepted_entity_program_mismatch`.
29. `acceptCorpusCandidate` with `targetEntityId` rejects target entities whose accepted kind differs from the candidate kind with `accepted_kind_mismatch`.
30. Accepted `acceptCorpusCandidate` creates one accepted corpus revision.
31. Accepted `acceptCorpusCandidate` with `targetEntityId` updates that entity's current revision to the new revision.
32. Accepted corpus revisions preserve the accepted candidate id, source ids, curator rationale when present, accepting Identity id, Program id, accepted kind, title, body, and acceptance time.
33. Accepted corpus revisions are immutable after creation.
34. Accepted corpus entities expose their current accepted revision.
35. Accepting a candidate does not create Student Workspace state.
36. Accepting a candidate does not grant Program Membership or Admin authority.
37. Accepting a candidate does not delete source records or candidate records.
38. `rejectCorpusCandidate` rejects unknown candidates with `candidate_not_found`.
39. `rejectCorpusCandidate` rejects already accepted candidates with `candidate_already_accepted`.
40. `rejectCorpusCandidate` rejects already rejected candidates with `candidate_already_rejected`.
41. Accepted `rejectCorpusCandidate` changes the candidate status to `rejected`.
42. Rejected candidates are not visible through accepted corpus queries.
43. Rejecting a candidate does not delete accepted corpus.
44. Rejecting a candidate does not delete source records.
45. `listProgramSources` returns only source records scoped to the requested Program.
46. `listCorpusCandidates` returns only candidates scoped to the requested Program.
47. `listCorpusCandidates` applies the optional status filter exactly when provided.
48. `listAcceptedCorpus` returns only accepted current revisions scoped to the requested Program.
49. `listAcceptedCorpus` applies the optional accepted kind filter exactly when provided.
50. `getAcceptedCorpusRevision` returns historical accepted revisions even when they are no longer current.
51. `getAcceptedCorpusRevision` rejects unknown revision identifiers with `revision_not_found`.
52. `getAcceptedCorpusRevision` applies accepted corpus read authorization for the revision's Program after resolving the revision.
53. Accepted corpus queries never expose draft-only candidate records that have not been accepted.
54. Source and candidate queries never expose password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, or infrastructure details.
55. Corpus events are domain records, not operational logs.
56. Accepted source recording creates one accepted `program_source_recorded` Corpus event.
57. Accepted candidate creation creates one accepted `corpus_candidate_created` Corpus event.
58. Accepted candidate acceptance creates one accepted `corpus_candidate_accepted` Corpus event.
59. Accepted candidate rejection creates one accepted `corpus_candidate_rejected` Corpus event.
60. Rejected curator commands create rejected Corpus events when the acting Identity and Program can be resolved.
61. Corpus events must not be used as the source of authorization.
62. Backup/restore scope includes Program source records, candidate records, accepted corpus entities, accepted corpus revisions, and Corpus events.
63. Restore must reject or refuse activation if an accepted corpus entity has no current accepted revision.
64. Restore must reject or refuse activation if an accepted corpus revision points to a missing candidate, an unaccepted candidate, or a source from another Program.
65. This slice does not expose material file storage, accepted checks, accepted assessment criteria, LLM prompt execution, source reliability scoring, student attempts, assessment feedback, progress state, corpus editing UI, Student Workspace UI, Admin UI, HTTP routes, CLI commands, collaborative editing, branching, merge, or conflict-resolution behavior.

## Product intent traceability

| Story | Behavior covered |
|---|---|
| CUR-01 - Create program from grounded sources | Program source records and accepted topic/concept revisions preserve grounding for the Program corpus. |
| CUR-02 - Add topics and concepts | Candidate topic/concept acceptance creates accepted corpus revisions. |
| CUR-06 - Keep accepted content separate from drafts | Draft candidates remain outside accepted corpus until explicit acceptance. |
| CUR-07 - Add external sources | Program source records capture source metadata before acceptance. |
| CUR-08 - Extract candidate structure from sources | Candidate topic/concept records can reference Program source records and remain drafts. |
| CUR-10 - Update program after research | Accepted revisions are stable and historical revisions remain addressable. |
| CUR-11 - Use LLM assistance for program structuring | LLM output can be represented only as candidate material in this slice. |
| CUR-12 - Review LLM suggestions | Acceptance and rejection are explicit curator actions. |
| CUR-13 - Trace suggestion origin | Accepted revisions preserve candidate, source, and rationale provenance. |
| INT-01 - Собрать программу из источников | Sources, candidates, and accepted revisions form the first grounded Program corpus path. |
| INT-02 - Увидеть понятийный аппарат темы | Accepted topic/concept queries expose the first inspectable accepted corpus. |

## Tests (required)

1. `recordProgramSource` rejects unknown acting Identities with `identity_not_found`.
2. `recordProgramSource` rejects disabled acting Identities with `identity_disabled`.
3. `recordProgramSource` rejects callers without effective `Program Curator` participation with `admin_or_curator_required`.
4. `recordProgramSource` rejects unknown Programs with `program_not_found`.
5. `recordProgramSource` rejects unknown source kinds, empty titles, and malformed optional fields with `validation_failed`.
6. Accepted `recordProgramSource` creates one Program-scoped source record and one accepted source event.
7. `createCorpusCandidate` rejects callers without effective `Program Curator` participation with `admin_or_curator_required`.
8. `createCorpusCandidate` rejects unsupported candidate kinds, empty titles, malformed bodies, and malformed rationales with `validation_failed`.
9. `createCorpusCandidate` rejects unknown source ids with `source_not_found`.
10. `createCorpusCandidate` rejects source ids from another Program with `source_program_mismatch`.
11. Accepted `createCorpusCandidate` creates one `draft` candidate and one accepted candidate-created event.
12. Draft candidates do not appear in `listAcceptedCorpus`.
13. `acceptCorpusCandidate` rejects unknown candidates with `candidate_not_found`.
14. `acceptCorpusCandidate` rejects callers without effective `Program Curator` participation for the candidate Program with `admin_or_curator_required`.
15. Accepted `acceptCorpusCandidate` changes candidate status to `accepted`.
16. Accepted `acceptCorpusCandidate` creates one accepted corpus entity and one accepted corpus revision.
17. Accepted revisions preserve candidate id, source ids, rationale, accepting Identity id, Program id, accepted kind, title, body, and acceptance time.
18. Accepted revisions remain addressable through `getAcceptedCorpusRevision`.
19. `getAcceptedCorpusRevision` rejects unknown revision identifiers with `revision_not_found`.
20. Accepting another candidate into an existing accepted entity creates a new current revision while the previous revision remains addressable.
21. Accepting a candidate into an unknown target entity rejects with `accepted_entity_not_found`.
22. Accepting a candidate into a target entity from another Program rejects with `accepted_entity_program_mismatch`.
23. Accepting a candidate into a target entity with a different accepted kind rejects with `accepted_kind_mismatch`.
24. Repeating `acceptCorpusCandidate` for the same candidate rejects with `candidate_already_accepted`.
25. `rejectCorpusCandidate` changes draft candidate status to `rejected`.
26. Rejected candidates do not appear in `listAcceptedCorpus`.
27. Accepting a rejected candidate rejects with `candidate_already_rejected`.
28. Rejecting an accepted candidate rejects with `candidate_already_accepted`.
29. `rejectCorpusCandidate` rejects callers without effective `Program Curator` participation for the candidate Program with `admin_or_curator_required`.
30. `listProgramSources` returns only sources for the requested Program.
31. `listCorpusCandidates` returns only candidates for the requested Program and honors the status filter.
32. `listAcceptedCorpus` rejects callers without effective Student, Program Curator, or Admin access with `participation_required`.
33. `listAcceptedCorpus` returns only accepted current revisions for the requested Program and honors the accepted kind filter.
34. `getAcceptedCorpusRevision` rejects callers without effective Student, Program Curator, or Admin access to the revision's Program with `participation_required`.
35. Accepted corpus reads never expose draft-only candidate records.
36. `listCorpusEvents` rejects callers without effective `Program Curator` participation with `admin_or_curator_required`.
37. `listCorpusEvents` returns only Corpus events for the requested Program.
38. Source, candidate, accepted corpus, and event responses do not expose password hashes, plaintext passwords, bootstrap secrets, sessions, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, or infrastructure details.
39. Corpus events are created for accepted and rejected curator commands and are not used as authorization input.
40. Backup/restore includes source records, candidates, accepted corpus entities, accepted corpus revisions, and Corpus events.
41. Restore rejects accepted corpus entities without current accepted revisions.
42. Restore rejects accepted revisions pointing to missing candidates or sources from another Program.

## Done criteria

- The domain interface exposes source recording, candidate creation, candidate acceptance/rejection, accepted corpus reads, and Corpus event reads with the result shapes above.
- Program source records, candidate records, accepted corpus entities, accepted corpus revisions, and Corpus events are persisted and included in backup/restore.
- Acceptance is authorized through effective `Program Curator` participation and creates stable accepted revisions with provenance.
- Draft and rejected candidates never appear as accepted corpus.
- Accepted corpus read access is limited to effective Student, Program Curator, or Admin access for the Program.
- All required tests pass in the Agonara workspace and repo-wide gates.
- No material file storage, accepted checks, accepted assessment criteria, LLM prompt execution, source reliability scoring, student attempts, assessment feedback, progress state, UI, HTTP route, or CLI behavior is introduced by this slice.
