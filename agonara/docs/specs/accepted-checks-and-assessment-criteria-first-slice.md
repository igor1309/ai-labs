---
date: 2026-05-28
model: gpt-5
description: "Spec: Agonara accepted checks and assessment criteria first-slice contract."
version: 0.0.1
status: implemented
type: spec
---

# Accepted Checks and Assessment Criteria First Slice

## Goal

Define the Agonara v0.0.1 backend contract for Program-scoped accepted open-answer checks and assessment criteria owned by Corpus Storage, with curator candidate state owned by Curator Workspace.

## Implementation status

Implemented by [Accepted Checks and Assessment Criteria First Slice Implementation Plan](../plans/implemented/accepted-checks-and-assessment-criteria-first-slice.md).

### Implementation Evidence

- Corpus assessment criterion and open-answer check candidate lifecycle commands and accepted revision queries: [corpus.js](../../src/corpus.js)
- Accepted assessment criterion and open-answer check persistence, graph validation, backup, and restore support: [storage.js](../../src/storage.js)
- Corpus command/query coverage: [corpus.test.js](../../tests/corpus.test.js)
- Storage persistence and graph-invariant coverage: [storage.test.js](../../tests/storage.test.js)
- Backup/restore coverage: [backup-restore.test.js](../../tests/backup-restore.test.js)
- Executable acceptance coverage: [executable-acceptance-corpus-navigation.test.js](../../tests/executable-acceptance-corpus-navigation.test.js)

The implemented first slice supports the Program Curator draft/reject/accept lifecycle for assessment criteria and open-answer checks, current and historical accepted revisions, criterion-revision snapshotting on accepted check revisions, accepted-read authorization for Student/Curator/Admin callers, redaction, Student Workspace non-mutation, backup/restore preservation, and malformed graph rejection. This domain-slice implementation did not introduce Student Workspace attempts, evaluation results, scoring, feedback generation, mastery/weak-area/progress interpretation, LLM execution, human review, UI, HTTP routes, or CLI commands; the later public HTTP surface is specified separately by [Accepted Checks and Assessment Criteria API](accepted-checks-and-assessment-criteria-api.md).

## Public interface

This spec operationalizes [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md) through the accepted Program corpus boundary from [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md) and the effective participation contract from [ADR-007](../adr/adr-007-effective-participation-authorization-contract.md).

### Logical records

```ts
type CheckKind = "open_answer";
type CheckCandidateStatus = "draft" | "accepted" | "rejected";
type CriterionCandidateStatus = "draft" | "accepted" | "rejected";

type AssessmentCriterionCandidate = {
  id: AssessmentCriterionCandidateId;
  programId: ProgramId;
  title: string;
  body: string;
  sourceIds: ProgramSourceId[];
  rationale?: string;
  status: CriterionCandidateStatus;
  createdByIdentityId: IdentityId;
  createdAt: Instant;
  updatedAt: Instant;
};

type AcceptedAssessmentCriterionEntity = {
  id: AcceptedAssessmentCriterionEntityId;
  programId: ProgramId;
  currentRevisionId: AcceptedAssessmentCriterionRevisionId;
};

type AcceptedAssessmentCriterionRevision = {
  id: AcceptedAssessmentCriterionRevisionId;
  entityId: AcceptedAssessmentCriterionEntityId;
  programId: ProgramId;
  title: string;
  body: string;
  acceptedFromCandidateId: AssessmentCriterionCandidateId;
  sourceIds: ProgramSourceId[];
  rationale?: string;
  acceptedByIdentityId: IdentityId;
  acceptedAt: Instant;
};

type OpenAnswerCheckCandidate = {
  id: OpenAnswerCheckCandidateId;
  programId: ProgramId;
  title: string;
  prompt: string;
  sourceIds: ProgramSourceId[];
  criterionEntityIds: AcceptedAssessmentCriterionEntityId[];
  rationale?: string;
  status: CheckCandidateStatus;
  createdByIdentityId: IdentityId;
  createdAt: Instant;
  updatedAt: Instant;
};

type AcceptedOpenAnswerCheckEntity = {
  id: AcceptedOpenAnswerCheckEntityId;
  programId: ProgramId;
  currentRevisionId: AcceptedOpenAnswerCheckRevisionId;
};

type AcceptedOpenAnswerCheckRevision = {
  id: AcceptedOpenAnswerCheckRevisionId;
  entityId: AcceptedOpenAnswerCheckEntityId;
  programId: ProgramId;
  checkKind: CheckKind;
  title: string;
  prompt: string;
  acceptedFromCandidateId: OpenAnswerCheckCandidateId;
  sourceIds: ProgramSourceId[];
  criterionRevisionIds: AcceptedAssessmentCriterionRevisionId[];
  rationale?: string;
  acceptedByIdentityId: IdentityId;
  acceptedAt: Instant;
};
```

All identifiers are opaque stable identifiers. Accepted check revisions reference criterion revisions, not just criterion entities, so later student attempts can identify the exact accepted criteria available when the check revision was accepted.

### Commands

```ts
createAssessmentCriterionCandidate(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  title: string;
  body: string;
  sourceIds?: ProgramSourceId[];
  rationale?: string;
}) -> CreateAssessmentCriterionCandidateResult

acceptAssessmentCriterionCandidate(input: {
  actingIdentityId: IdentityId;
  candidateId: AssessmentCriterionCandidateId;
  targetEntityId?: AcceptedAssessmentCriterionEntityId;
}) -> AcceptAssessmentCriterionCandidateResult

rejectAssessmentCriterionCandidate(input: {
  actingIdentityId: IdentityId;
  candidateId: AssessmentCriterionCandidateId;
}) -> RejectAssessmentCriterionCandidateResult

createOpenAnswerCheckCandidate(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  checkKind: CheckKind;
  title: string;
  prompt: string;
  sourceIds?: ProgramSourceId[];
  criterionEntityIds: AcceptedAssessmentCriterionEntityId[];
  rationale?: string;
}) -> CreateOpenAnswerCheckCandidateResult

acceptOpenAnswerCheckCandidate(input: {
  actingIdentityId: IdentityId;
  candidateId: OpenAnswerCheckCandidateId;
  targetEntityId?: AcceptedOpenAnswerCheckEntityId;
}) -> AcceptOpenAnswerCheckCandidateResult

rejectOpenAnswerCheckCandidate(input: {
  actingIdentityId: IdentityId;
  candidateId: OpenAnswerCheckCandidateId;
}) -> RejectOpenAnswerCheckCandidateResult
```

### Command Result Envelope

- `{ status: "accepted"; value: ... }`
- `{ status: "rejected"; reason: AcceptedAssessmentRejectionReason }`

All commands require effective `Program Curator` participation for the Program.

### Queries

```ts
listAssessmentCriterionCandidates(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  status?: CriterionCandidateStatus;
}) -> ListAssessmentCriterionCandidatesResult

listOpenAnswerCheckCandidates(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  status?: CheckCandidateStatus;
}) -> ListOpenAnswerCheckCandidatesResult

listAcceptedAssessmentCriteria(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
}) -> ListAcceptedAssessmentCriteriaResult

getAcceptedAssessmentCriterionRevision(input: {
  actingIdentityId: IdentityId;
  revisionId: AcceptedAssessmentCriterionRevisionId;
}) -> GetAcceptedAssessmentCriterionRevisionResult

listAcceptedOpenAnswerChecks(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
}) -> ListAcceptedOpenAnswerChecksResult

getAcceptedOpenAnswerCheckRevision(input: {
  actingIdentityId: IdentityId;
  revisionId: AcceptedOpenAnswerCheckRevisionId;
}) -> GetAcceptedOpenAnswerCheckRevisionResult
```

Candidate list queries require effective `Program Curator` participation for the Program.

Accepted criterion and accepted check queries require effective `Student` participation, effective `Program Curator` participation, or effective `Admin` authority for the Program.

Historical revision queries resolve access through the revision's Program after resolving that the revision exists.

### Result summaries

```ts
type AssessmentCriterionCandidateSummary = {
  candidateId: string;
  programId: string;
  title: string;
  body: string;
  sourceIds: string[];
  rationale?: string;
  status: CriterionCandidateStatus;
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
  checkKind: "open_answer";
  title: string;
  prompt: string;
  sourceIds: string[];
  criterionEntityIds: string[];
  rationale?: string;
  status: CheckCandidateStatus;
  createdByIdentityId: string;
  createdAt: string;
  updatedAt: string;
};

type AcceptedOpenAnswerCheckSummary = {
  entityId: string;
  revisionId: string;
  programId: string;
  checkKind: "open_answer";
  title: string;
  prompt: string;
  acceptedFromCandidateId: string;
  sourceIds: string[];
  criterionRevisionIds: string[];
  rationale?: string;
  acceptedByIdentityId: string;
  acceptedAt: string;
};
```

### Rejection reasons

```ts
type AcceptedAssessmentRejectionReason =
  | "identity_not_active"
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

## Behavior rules

1. Candidate creation accepts only active internal `Identity` actors with effective `Program Curator` participation for the Program.
2. Accepted check and criterion read queries accept effective `Student`, effective `Program Curator`, and effective `Admin` callers for the Program.
3. Candidate list queries are curator-only and must not be readable by Students.
4. Candidate creation rejects unknown Programs with `program_not_found`.
5. Candidate creation rejects unknown source ids with `source_not_found`.
6. Candidate creation rejects source ids from another Program with `source_program_mismatch`.
7. Criterion candidate creation rejects missing, empty, whitespace-only, or non-string `title` and `body` with `validation_failed`.
8. Open-answer check candidate creation rejects missing, empty, whitespace-only, or non-string `title` and `prompt` with `validation_failed`.
9. Open-answer check candidate creation rejects unsupported check kinds; the first slice accepts only `open_answer`.
10. Open-answer check candidate creation requires at least one accepted criterion entity reference.
11. Open-answer check candidate creation rejects missing, empty, or non-array criterion references with `validation_failed`.
12. Open-answer check candidate creation rejects unknown criterion entities with `criterion_entity_not_found`.
13. Open-answer check candidate creation rejects criterion entities from another Program with `criterion_entity_program_mismatch`.
14. Candidate records start in `draft` status and remain separate from accepted corpus.
15. Candidate listing returns only candidates scoped to the requested Program.
16. Candidate listing accepts `draft`, `accepted`, and `rejected` status filters and rejects unsupported filters with `validation_failed`.
17. Criterion acceptance accepts only draft criterion candidates.
18. Criterion acceptance without `targetEntityId` creates a new accepted criterion entity and one current revision.
19. Criterion acceptance with `targetEntityId` creates a new current revision for the target entity and preserves previous revisions as addressable historical revisions.
20. Criterion acceptance rejects unknown candidates with `criterion_candidate_not_found`.
21. Criterion acceptance rejects already accepted candidates with `criterion_candidate_already_accepted`.
22. Criterion acceptance rejects already rejected candidates with `criterion_candidate_already_rejected`.
23. Criterion acceptance rejects unknown target entities with `criterion_entity_not_found`.
24. Criterion acceptance rejects target entities from another Program with `criterion_entity_program_mismatch`.
25. Check acceptance accepts only draft open-answer check candidates.
26. Check acceptance snapshots current accepted criterion revision ids for every referenced criterion entity at the moment the check revision is accepted.
27. Check acceptance without `targetEntityId` creates a new accepted open-answer check entity and one current revision.
28. Check acceptance with `targetEntityId` creates a new current revision for the target check entity and preserves previous revisions as addressable historical revisions.
29. Check acceptance rejects unknown candidates with `check_candidate_not_found`.
30. Check acceptance rejects already accepted candidates with `check_candidate_already_accepted`.
31. Check acceptance rejects already rejected candidates with `check_candidate_already_rejected`.
32. Check acceptance rejects unknown target entities with `check_entity_not_found`.
33. Check acceptance rejects target entities from another Program with `check_entity_program_mismatch`.
34. Rejection changes a draft candidate to `rejected` and must not create accepted corpus.
35. Rejection rejects unknown, already accepted, and already rejected candidates with the matching rejection reason.
36. Accepted criterion listing returns only current accepted criterion revisions scoped to the requested Program.
37. Accepted check listing returns only current accepted open-answer check revisions scoped to the requested Program.
38. Historical revision queries return addressable historical criterion and check revisions after they are no longer current.
39. Historical revision queries reject unknown revisions with `criterion_revision_not_found` or `check_revision_not_found`.
40. Updating accepted criteria must not rewrite accepted check revisions that already snapshotted earlier criterion revisions.
41. Updating accepted checks or criteria must not create, rewrite, or delete Student Workspace attempts, answers, feedback, progress evidence, mastery state, or weak-area state.
42. Candidate cleanup or rejection must not delete accepted check revisions, accepted criterion revisions, or future student references to those revisions.
43. Admin authority may read accepted checks and criteria but must not create, accept, or reject candidate checks or criteria through this first-slice contract unless the Admin is also an effective Program Curator.
44. Commands and queries must not expose password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
45. This first slice does not expose student attempts, submitted answers, selected answers, evaluation results, feedback generation, scoring, mastery calculation, weak-area calculation, LLM prompt execution, human review workflow, UI, HTTP routes, or CLI commands.

## Tests

1. `createAssessmentCriterionCandidate` accepts an effective Program Curator and returns a draft criterion candidate.
2. `createAssessmentCriterionCandidate` rejects non-curators with `admin_or_curator_required`.
3. `createAssessmentCriterionCandidate` rejects unknown Programs with `program_not_found`.
4. `createAssessmentCriterionCandidate` rejects invalid `title` and `body` values with `validation_failed`.
5. `createAssessmentCriterionCandidate` rejects unknown and cross-Program source ids with `source_not_found` and `source_program_mismatch`.
6. `acceptAssessmentCriterionCandidate` creates a new accepted criterion entity and current revision from a draft candidate.
7. `acceptAssessmentCriterionCandidate` creates a replacement current revision for `targetEntityId` and keeps the prior revision addressable.
8. `acceptAssessmentCriterionCandidate` rejects unknown, already accepted, already rejected, unknown target, and cross-Program target cases with the specified reasons.
9. `rejectAssessmentCriterionCandidate` marks a draft criterion candidate rejected and creates no accepted criterion entity or revision.
10. `listAcceptedAssessmentCriteria` accepts Student, Program Curator, and Admin callers and rejects unauthorized callers with `participation_required`.
11. `listAcceptedAssessmentCriteria` returns only current accepted criterion revisions for the requested Program.
12. `getAcceptedAssessmentCriterionRevision` returns a historical criterion revision to authorized callers and rejects unknown revisions with `criterion_revision_not_found`.
13. `createOpenAnswerCheckCandidate` accepts an effective Program Curator and returns a draft open-answer check candidate.
14. `createOpenAnswerCheckCandidate` rejects invalid `title`, invalid `prompt`, unsupported check kind, non-array source references, and missing, empty, or non-array criterion references with `validation_failed`.
15. `createOpenAnswerCheckCandidate` rejects unknown and cross-Program source ids with `source_not_found` and `source_program_mismatch`.
16. `createOpenAnswerCheckCandidate` rejects unknown and cross-Program criterion entities with `criterion_entity_not_found` and `criterion_entity_program_mismatch`.
17. `acceptOpenAnswerCheckCandidate` creates a new accepted open-answer check entity and snapshots current criterion revision ids.
18. `acceptOpenAnswerCheckCandidate` keeps the check revision pointing at the original criterion revision when the criterion is later revised.
19. `acceptOpenAnswerCheckCandidate` creates a replacement current revision for `targetEntityId` and keeps the prior check revision addressable.
20. `acceptOpenAnswerCheckCandidate` rejects unknown, already accepted, already rejected, unknown target, and cross-Program target cases with the specified reasons.
21. `rejectOpenAnswerCheckCandidate` marks a draft check candidate rejected and creates no accepted check entity or revision.
22. `listAcceptedOpenAnswerChecks` accepts Student, Program Curator, and Admin callers and rejects unauthorized callers with `participation_required`.
23. `listAcceptedOpenAnswerChecks` returns only current accepted check revisions for the requested Program.
24. `getAcceptedOpenAnswerCheckRevision` returns a historical check revision to authorized callers and rejects unknown revisions with `check_revision_not_found`.
25. Candidate list queries return only requested-Program candidates and apply `draft`, `accepted`, and `rejected` filters.
26. Candidate list queries reject unsupported status filters with `validation_failed`.
27. Accepted check and criterion responses never include draft or rejected candidates.
28. Candidate rejection or cleanup does not delete accepted revisions.
29. Accepted check and criterion commands do not create Student Workspace attempts, answers, feedback, progress evidence, mastery state, or weak-area state.
30. Admin callers without effective Program Curator participation can read accepted checks and criteria but cannot create, accept, or reject candidates.
31. Responses and rejection results satisfy the redaction rules.
32. Executable acceptance flow: a Program Curator creates and accepts a criterion, creates and accepts an open-answer check linked to that criterion, revises the criterion, verifies the accepted check revision still points at the original criterion revision, lists the accepted check as a Student, fetches historical criterion and check revisions, rejects separate draft candidates, and verifies no Student Workspace state or assessment feedback is created.

## Done criteria

- The first-slice contract exposes accepted open-answer checks and assessment criteria as versioned Program corpus.
- Effective Program Curator participation is required for all candidate creation, acceptance, and rejection commands.
- Effective Student, Program Curator, or Admin authority is required for accepted check and accepted criterion read queries.
- Draft and rejected candidates remain outside accepted corpus.
- Accepted open-answer checks require at least one accepted assessment criterion reference.
- Accepted check revisions snapshot criterion revision ids and do not drift when criteria are revised later.
- Historical check and criterion revisions remain addressable.
- Student Workspace attempts, answers, feedback, progress evidence, mastery state, and weak-area state are not introduced by this slice.
- Every behavior rule is covered by a listed test or the executable acceptance flow.
