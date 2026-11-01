---
date: 2026-06-02
model: gpt-5
description: "Spec: Agonara deterministic single-select quick-check assessment first-slice contract."
version: 0.0.1
status: implemented
type: spec
---

# Quick-Check Assessment First Slice

## Goal

Define the Agonara v0.0.1 backend contract for Corpus Storage-owned accepted deterministic single-select quick checks and Student Workspace-owned immutable quick-check attempts, results, and personal evidence.

## Implementation status

Implemented by [Quick-Check Assessment First Slice Implementation Plan](../plans/implemented/quick-check-assessment-first-slice.md).

### Implementation Evidence

- Corpus quick-check candidate, accepted-revision, delivery, and curator-read commands: [corpus.js](../../src/corpus.js)
- Student Workspace quick-check submission and owner-only attempt reads: [student-workspace.js](../../src/student-workspace.js)
- Quick-check candidate, accepted-revision, answer-key, attempt, and backup/restore persistence: [storage.js](../../src/storage.js)
- Corpus command/query coverage: [corpus.test.js](../../tests/corpus.test.js)
- Student Workspace attempt coverage: [student-workspace.test.js](../../tests/student-workspace.test.js)
- Storage coverage: [storage.test.js](../../tests/storage.test.js)
- Backup/restore coverage: [backup-restore.test.js](../../tests/backup-restore.test.js)
- Executable acceptance coverage: [executable-acceptance-corpus-navigation.test.js](../../tests/executable-acceptance-corpus-navigation.test.js)

The implemented first slice supports Program Curator quick-check candidate lifecycle, accepted single-select quick-check revisions with protected answer keys, student-safe delivery projections, internal answer-key resolution after Student authorization, immutable Student Workspace attempts, scoped idempotency, owner-only attempt reads, answer-key redaction, adjacent-domain non-mutation checks, backup/restore preservation, and malformed graph rejection. This first-slice implementation did not introduce HTTP routes, UI, CLI commands, option randomization, multi-select checks, learner-state interpretation, grading, analytics, provider calls, evaluator workers, queues, or human review behavior; later HTTP and learner-state surfaces are specified separately by [Quick Check Assessment API](quick-check-assessment-api.md) and [Learner-State Interpretation](learner-state-interpretation.md).

## Public interface

This spec operationalizes [ADR-016](../adr/adr-016-quick-check-assessment-boundary.md) through the accepted corpus boundary from [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md), the accepted checks and Student Workspace boundary from [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), and the effective participation contract from [ADR-007](../adr/adr-007-effective-participation-authorization-contract.md).

### Logical records

```ts
type QuickCheckCandidateStatus = "draft" | "accepted" | "rejected";

type QuickCheckCandidateOption = {
  id: QuickCheckCandidateOptionId;
  text: string;
};

type QuickCheckCandidate = {
  id: QuickCheckCandidateId;
  programId: ProgramId;
  title: string;
  prompt: string;
  options: QuickCheckCandidateOption[];
  answerKeyOptionId: QuickCheckCandidateOptionId;
  sourceIds: ProgramSourceId[];
  rationale?: string;
  status: QuickCheckCandidateStatus;
  createdByIdentityId: IdentityId;
  createdAt: Instant;
  updatedAt: Instant;
};

type AcceptedQuickCheckOption = {
  id: AcceptedQuickCheckOptionId;
  text: string;
};

type AcceptedQuickCheckEntity = {
  id: AcceptedQuickCheckEntityId;
  programId: ProgramId;
  currentRevisionId: AcceptedQuickCheckRevisionId;
};

type AcceptedQuickCheckRevision = {
  id: AcceptedQuickCheckRevisionId;
  entityId: AcceptedQuickCheckEntityId;
  programId: ProgramId;
  checkKind: "single_select_quick_check";
  title: string;
  prompt: string;
  options: AcceptedQuickCheckOption[];
  answerKeyOptionId: AcceptedQuickCheckOptionId;
  acceptedFromCandidateId: QuickCheckCandidateId;
  sourceIds: ProgramSourceId[];
  rationale?: string;
  acceptedByIdentityId: IdentityId;
  acceptedAt: Instant;
};

type QuickCheckDeliveryOption = {
  optionId: AcceptedQuickCheckOptionId;
  text: string;
};

type QuickCheckDelivery = {
  revisionId: AcceptedQuickCheckRevisionId;
  programId: ProgramId;
  checkKind: "single_select_quick_check";
  title: string;
  prompt: string;
  options: QuickCheckDeliveryOption[];
};

type QuickCheckAttempt = {
  id: QuickCheckAttemptId;
  programId: ProgramId;
  studentIdentityId: IdentityId;
  checkRevisionId: AcceptedQuickCheckRevisionId;
  selectedOptionId: AcceptedQuickCheckOptionId;
  matched: boolean;
  idempotencyKey: string;
  submittedAt: Instant;
};
```

All identifiers are opaque stable identifiers. Student-facing accepted option identifiers must not encode option correctness, answer-key status, or curator-only metadata.

Accepted quick-check revisions retain the option order presented by the accepted revision. Option randomization is out of scope for this first slice.

### Commands

```ts
createQuickCheckCandidate(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  title: string;
  prompt: string;
  options: string[];
  answerKeyOptionIndex: number;
  sourceIds?: ProgramSourceId[];
  rationale?: string;
}) -> CreateQuickCheckCandidateResult

acceptQuickCheckCandidate(input: {
  actingIdentityId: IdentityId;
  candidateId: QuickCheckCandidateId;
  targetEntityId?: AcceptedQuickCheckEntityId;
}) -> AcceptQuickCheckCandidateResult

rejectQuickCheckCandidate(input: {
  actingIdentityId: IdentityId;
  candidateId: QuickCheckCandidateId;
}) -> RejectQuickCheckCandidateResult

submitQuickCheckAttempt(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  checkRevisionId: AcceptedQuickCheckRevisionId;
  selectedOptionId: AcceptedQuickCheckOptionId;
  idempotencyKey: string;
}) -> SubmitQuickCheckAttemptResult
```

Candidate commands require effective `Program Curator` participation for the Program.

`submitQuickCheckAttempt` requires effective `Student` participation for the Program.

### Command Result Envelope

- `{ status: "accepted"; value: ... }`
- `{ status: "rejected"; reason: QuickCheckAssessmentRejectionReason }`

### Queries

```ts
listQuickCheckCandidates(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  status?: QuickCheckCandidateStatus;
}) -> ListQuickCheckCandidatesResult

getAcceptedQuickCheckRevisionForCuration(input: {
  actingIdentityId: IdentityId;
  revisionId: AcceptedQuickCheckRevisionId;
}) -> GetAcceptedQuickCheckRevisionForCurationResult

listQuickCheckDeliveries(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
}) -> ListQuickCheckDeliveriesResult

getQuickCheckDelivery(input: {
  actingIdentityId: IdentityId;
  revisionId: AcceptedQuickCheckRevisionId;
}) -> GetQuickCheckDeliveryResult

getQuickCheckAttempt(input: {
  actingIdentityId: IdentityId;
  attemptId: QuickCheckAttemptId;
}) -> GetQuickCheckAttemptResult

listQuickCheckAttempts(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  checkRevisionId?: AcceptedQuickCheckRevisionId;
}) -> ListQuickCheckAttemptsResult
```

Candidate queries and curation revision reads require effective `Program Curator` participation for the Program.

Delivery queries require effective `Student` participation for the Program. They return student-safe projections and never return answer keys.

Attempt queries require the owning `Student` Identity. Program Curator and Admin read access are out of scope for this first slice.

### Internal collaborator boundary

```ts
resolveAcceptedQuickCheckRevisionForEvaluation(input: {
  programId: ProgramId;
  revisionId: AcceptedQuickCheckRevisionId;
}) -> ResolveAcceptedQuickCheckRevisionForEvaluationResult
```

`resolveAcceptedQuickCheckRevisionForEvaluation` is an internal Corpus Storage query for Student Workspace submission handling. It returns the accepted revision, including its answer key, only after `submitQuickCheckAttempt` has established the active acting Identity, Program, and effective `Student` participation. It is not a product-role query and must not be reachable through student-facing, Program Curator, Admin, HTTP, or CLI surfaces.

### Result summaries

```ts
type QuickCheckCandidateSummary = {
  candidateId: string;
  programId: string;
  title: string;
  prompt: string;
  options: Array<{
    optionId: string;
    text: string;
  }>;
  answerKeyOptionId: string;
  sourceIds: string[];
  rationale?: string;
  status: QuickCheckCandidateStatus;
  createdByIdentityId: string;
  createdAt: string;
  updatedAt: string;
};

type AcceptedQuickCheckRevisionForCurationSummary = {
  entityId: string;
  revisionId: string;
  programId: string;
  checkKind: "single_select_quick_check";
  title: string;
  prompt: string;
  options: Array<{
    optionId: string;
    text: string;
  }>;
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
  options: Array<{
    optionId: string;
    text: string;
  }>;
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
```

### Rejection reasons

```ts
type QuickCheckAssessmentRejectionReason =
  | "identity_not_active"
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

## Behavior rules

1. Candidate creation accepts only active internal `Identity` actors with effective `Program Curator` participation for the Program.
2. Candidate creation rejects unknown Programs with `program_not_found`.
3. Candidate creation rejects unknown source ids with `source_not_found`.
4. Candidate creation rejects source ids from another Program with `source_program_mismatch`.
5. Candidate creation rejects missing, empty, whitespace-only, or non-string `title` and `prompt` with `validation_failed`.
6. Candidate creation requires `options` to be an array containing at least two non-empty option texts after surrounding whitespace is trimmed.
7. Candidate creation rejects duplicate option texts after trimming with `validation_failed`.
8. Candidate creation requires an integer `answerKeyOptionIndex` that selects exactly one submitted option.
9. Candidate creation returns a draft candidate whose option identifiers are opaque and whose answer key references one option on that candidate.
10. Candidate records remain separate from accepted corpus until acceptance.
11. Candidate listing returns only candidates scoped to the requested Program.
12. Candidate listing accepts `draft`, `accepted`, and `rejected` status filters and rejects unsupported filters with `validation_failed`.
13. Candidate listing requires effective `Program Curator` participation and must not be readable by Students or Admins who are not effective Program Curators.
14. Candidate acceptance accepts only draft candidates.
15. Candidate acceptance without `targetEntityId` creates one accepted quick-check entity and one current accepted revision.
16. Candidate acceptance with `targetEntityId` creates a new current revision for that entity and preserves previous revisions as addressable historical revisions.
17. Candidate acceptance creates opaque stable accepted option identifiers and one answer-key option identifier that references an option on the accepted revision.
18. Candidate acceptance preserves accepted option order, candidate provenance, source ids, rationale, accepting curator attribution, and acceptance time.
19. Candidate acceptance rejects unknown, already accepted, already rejected, unknown target, and cross-Program target cases with the specified reasons.
20. Candidate rejection changes a draft candidate to `rejected` and creates no accepted entity or revision.
21. Candidate rejection rejects unknown, already accepted, and already rejected candidates with the specified reasons.
22. Curation revision reads return addressable current or historical accepted revisions, including answer keys, only to effective `Program Curator` participants for the revision's Program.
23. Curation revision reads reject unknown revisions with `quick_check_revision_not_found`.
24. Curation revision reads reject inactive Identities with `identity_not_active` and unauthorized callers with `admin_or_curator_required`.
25. Delivery listing returns only current accepted quick-check revisions scoped to the requested Program.
26. Delivery listing rejects inactive Identities with `identity_not_active`, unknown Programs with `program_not_found`, and callers without effective `Student` participation with `participation_required`.
27. Delivery revision reads return current or historical accepted quick-check revisions as student-safe delivery projections after resolving access through the revision's Program.
28. Delivery revision reads reject inactive Identities with `identity_not_active`, unknown revisions with `quick_check_revision_not_found`, and callers without effective `Student` participation with `participation_required`.
29. Delivery projections include revision id, Program id, check kind, title, prompt, and answerable options.
30. Delivery projections must not expose answer keys, option correctness flags, curator-only metadata, candidate ids, rationale, accepting curator attribution, or acceptance time.
31. `submitQuickCheckAttempt` rejects inactive or unknown acting Identities with `identity_not_active`.
32. `submitQuickCheckAttempt` rejects unknown Programs with `program_not_found`.
33. `submitQuickCheckAttempt` rejects callers without effective `Student` participation for the Program with `participation_required`.
34. `submitQuickCheckAttempt` resolves the accepted revision and answer key through `resolveAcceptedQuickCheckRevisionForEvaluation` only after establishing the active acting Identity, Program, and effective `Student` participation.
35. `resolveAcceptedQuickCheckRevisionForEvaluation` rejects unknown accepted revision ids, draft candidate ids, and rejected candidate ids with `quick_check_revision_not_found`.
36. `resolveAcceptedQuickCheckRevisionForEvaluation` rejects accepted revisions from another Program with `quick_check_revision_program_mismatch`.
37. `resolveAcceptedQuickCheckRevisionForEvaluation` must not be reachable through student-facing, Program Curator, Admin, HTTP, or CLI surfaces.
38. `submitQuickCheckAttempt` rejects option ids outside the accepted revision with `selected_option_not_found`.
39. `submitQuickCheckAttempt` rejects missing, empty, whitespace-only, or non-string idempotency keys with `validation_failed`.
40. `submitQuickCheckAttempt` scopes idempotency to acting Student Identity, Program, accepted quick-check revision, and idempotency key.
41. `submitQuickCheckAttempt` returns the original accepted attempt for an equivalent retry with the same scoped idempotency key and selected option id.
42. `submitQuickCheckAttempt` rejects reuse of the same scoped idempotency key with a different selected option id with `idempotency_conflict`.
43. `submitQuickCheckAttempt` creates one immutable attempt on first accepted submission.
44. `submitQuickCheckAttempt` records whether the selected option matched the accepted revision answer key.
45. A corrective answer creates a new attempt with a new idempotency key and must not mutate the prior attempt or result.
46. Later accepted quick-check revisions must not rewrite historical attempts or results.
47. Attempt queries return only attempts owned by the acting Student Identity.
48. `getQuickCheckAttempt` rejects unknown attempts with `attempt_not_found`.
49. `getQuickCheckAttempt` rejects inactive Identities with `identity_not_active`.
50. `getQuickCheckAttempt` rejects non-owning Students, Program Curators, Admins, and other callers with `attempt_not_found`.
51. `listQuickCheckAttempts` rejects inactive Identities with `identity_not_active`, unknown Programs with `program_not_found`, and callers without effective Student participation with `participation_required`.
52. `listQuickCheckAttempts` applies `checkRevisionId` filters only after enforcing Program and owning-Student scope.
53. `listQuickCheckAttempts` rejects unknown `checkRevisionId` filters with `quick_check_revision_not_found` and cross-Program filters with `quick_check_revision_program_mismatch`.
54. Student-facing delivery and attempt responses, faults, operational logs, and transport metadata must not expose answer keys, option correctness metadata for individual options, idempotency keys, candidate ids, curator-only metadata, password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
55. Candidate acceptance, delivery queries, attempt submission, and attempt queries must not create, update, reject, or delete open-answer checks, assessment criteria, unrelated accepted corpus, unrelated curator candidates, Program Membership state, Identity state, sessions, credentials, Admin authority, or CSRF state.
56. Quick-check behavior must not create or update mastery, weak-area, progress, review-scheduling, next-step, topic-readiness, period-readiness, grading, analytics, or reporting state.
57. Protected operational backup and restore must preserve quick-check candidates, accepted entities, accepted revisions, accepted options, answer keys, attempts, results, and historical references.
58. Restore must reject candidates with missing Programs, missing creator Identities, missing or cross-Program sources, fewer than two options, duplicate candidate option ids, duplicate trimmed option text, empty option text, or answer keys outside the candidate.
59. Restore must reject accepted entities with missing Programs, missing current revisions, or current revisions from another Program or entity.
60. Restore must reject accepted revisions with missing Programs, missing or cross-Program entities, missing candidate provenance, missing or cross-Program source records, missing accepting Identities, fewer than two options, duplicate accepted option ids, duplicate trimmed option text, empty option text, missing answer keys, duplicated answer keys, or answer keys outside the accepted revision.
61. Restore must reject attempts that reference missing Programs, missing Identities, missing accepted quick-check revisions, accepted quick-check revisions from another Program, selected option ids outside the referenced revision, or `matched` results inconsistent with the referenced revision answer key.
62. This first slice does not expose HTTP routes, CLI commands, Student UI, Admin UI, Curator UI, option randomization, multiple-select checks, topic-level checks, period-level checks, mastery interpretation, progress interpretation, review scheduling, next-step recommendation, grading, analytics, reporting, external provider calls, evaluator workers, queues, or human review behavior.

## Tests (required)

1. `createQuickCheckCandidate` accepts an effective Program Curator and returns a draft candidate with opaque option ids and one answer-key option id.
2. `createQuickCheckCandidate` rejects inactive Identities, unknown Programs, and callers without effective Program Curator participation with the specified reasons.
3. `createQuickCheckCandidate` rejects invalid title, prompt, options, duplicate trimmed option texts, answer-key index, unknown sources, and cross-Program sources with the specified reasons.
4. `listQuickCheckCandidates` returns only requested-Program candidates and applies supported status filters.
5. `listQuickCheckCandidates` rejects Students, Admins without effective Program Curator participation, and unsupported status filters with the specified reasons.
6. `acceptQuickCheckCandidate` creates a new accepted entity and current revision from a draft candidate with opaque option ids and a valid answer-key option id.
7. `acceptQuickCheckCandidate` creates a replacement current revision for `targetEntityId` and keeps the prior revision addressable.
8. `acceptQuickCheckCandidate` preserves option order, candidate provenance, source ids, rationale, accepting curator attribution, and acceptance time.
9. `acceptQuickCheckCandidate` rejects unknown, already accepted, already rejected, unknown target, and cross-Program target cases with the specified reasons.
10. `rejectQuickCheckCandidate` marks a draft candidate rejected and creates no accepted entity or revision.
11. `rejectQuickCheckCandidate` rejects unknown, already accepted, and already rejected candidates with the specified reasons.
12. `getAcceptedQuickCheckRevisionForCuration` returns a current or historical revision with its answer key to an effective Program Curator.
13. `getAcceptedQuickCheckRevisionForCuration` rejects inactive Identities, unknown revisions, Students, and Admins without effective Program Curator participation with the specified reasons.
14. `listQuickCheckDeliveries` returns only current accepted quick-check revisions for the requested Program.
15. `getQuickCheckDelivery` returns a current or historical student-safe delivery projection to an effective Student.
16. Delivery queries reject inactive Identities, unknown Programs or revisions, and callers without effective Student participation with the specified reasons.
17. Delivery projections exclude answer keys, option correctness flags, curator-only metadata, candidate ids, rationale, accepting curator attribution, and acceptance time.
18. `resolveAcceptedQuickCheckRevisionForEvaluation` returns an accepted revision with its answer key only through the internal Corpus Storage boundary after authorized Student submission checks.
19. `resolveAcceptedQuickCheckRevisionForEvaluation` rejects unknown revisions, candidate ids, and cross-Program revisions with the specified reasons and is not exposed through product-role, HTTP, or CLI surfaces.
20. `submitQuickCheckAttempt` accepts an effective Student and returns an immutable attempt referencing the accepted revision, selected option, and matched-or-not-matched result.
21. `submitQuickCheckAttempt` rejects inactive Identities, unknown Programs, callers without effective Student participation, unknown revisions, candidate ids, cross-Program revisions, option ids outside the revision, and invalid idempotency keys with the specified reasons.
22. `submitQuickCheckAttempt` returns the original attempt for an equivalent retry with the same scoped idempotency key and selected option id.
23. `submitQuickCheckAttempt` rejects conflicting selected-option reuse of the same scoped idempotency key with `idempotency_conflict`.
24. A corrective answer creates a new attempt without mutating the prior attempt or result.
25. Later accepted quick-check revisions do not rewrite historical attempts or results.
26. `getQuickCheckAttempt` returns the owning Student's attempt result.
27. `getQuickCheckAttempt` rejects inactive Identities, unknown attempts, non-owning Students, Program Curators, Admins, and other callers with the specified reasons.
28. `listQuickCheckAttempts` returns only attempts owned by the acting Student in the requested Program.
29. `listQuickCheckAttempts` applies accepted revision filters after enforcing Program and owning-Student scope.
30. `listQuickCheckAttempts` rejects unknown and cross-Program accepted revision filters with the specified reasons.
31. Student-facing delivery and attempt responses, faults, operational logs, and transport metadata exclude answer keys, per-option correctness metadata, idempotency keys, candidate ids, curator-only metadata, secrets, session identifiers, CSRF tokens, SQL text, stack traces, filesystem paths, database URLs, and infrastructure details.
32. Quick-check behavior does not mutate open-answer checks, assessment criteria, unrelated accepted corpus, unrelated curator candidates, Program Membership state, Identity state, session state, credential state, Admin authority, or CSRF state.
33. Quick-check behavior does not create mastery, weak-area, progress, review-scheduling, next-step, topic-readiness, period-readiness, grading, analytics, or reporting state.
34. Backup and restore preserve candidates, accepted entities, accepted revisions, accepted options, answer keys, attempts, matched results, and historical references.
35. Restore rejects malformed candidate graphs, including missing owner records, missing or cross-Program sources, invalid option collections, and invalid answer keys.
36. Restore rejects malformed accepted-entity and accepted-revision graphs, including missing or cross-Program owner records, missing candidate provenance, invalid option collections, and invalid answer keys.
37. Restore rejects attempts that reference missing Programs, missing Identities, missing or cross-Program accepted revisions, selected option ids outside the referenced revision, or inconsistent `matched` results.
38. Executable acceptance flow: a Program Curator creates and accepts a quick-check candidate, a Student receives a delivery projection without the answer key, Student Workspace resolves the answer key only through its internal authorized submission boundary, the Student submits a matching answer, retries with the same idempotency key without duplicating the attempt, submits a corrective answer as a new attempt, the curator accepts a later revision, the Student reads historical results still linked to their original accepted revisions, backup and restore preserve the graph, and no open-answer, mastery, weak-area, progress, UI, CLI, provider, worker, queue, or human review state is introduced.

## Done criteria

- Corpus Storage exposes draft quick-check candidates and versioned accepted single-select quick-check revisions with opaque options and one valid answer key.
- Curator Workspace keeps draft, accepted, and rejected candidate lifecycle separate from accepted corpus.
- Effective Program Curator participation is required for candidate commands, candidate queries, and accepted revision reads that expose answer keys.
- Effective Student participation is required for student-safe delivery projections and Student Workspace attempt submission.
- Student Workspace resolves answer keys only through the internal Corpus Storage evaluation boundary after authorized submission checks.
- Student-facing delivery projections never expose answer keys, option correctness metadata, or curator-only metadata.
- Student Workspace exposes immutable append-only attempts with selected option, matched-or-not-matched result, and scoped idempotency behavior.
- Owning-Student attempt reads expose personal evidence without exposing answer keys, per-option correctness metadata, or idempotency keys.
- Student-facing responses, faults, operational logs, and transport metadata do not expose answer keys or per-option correctness metadata.
- Protected backup and restore preserve quick-check graphs and reject malformed owner, answer-key, attempt, or matched-result references.
- Quick-check behavior does not mutate adjacent modules or create hidden learner-state interpretation.
- Every behavior rule is covered by a listed test or the executable acceptance flow.
- No HTTP routes, CLI commands, UI, option randomization, multiple-select checks, topic-level checks, period-level checks, mastery interpretation, progress interpretation, review scheduling, next-step recommendation, grading, analytics, reporting, external provider calls, evaluator workers, queues, or human review behavior is introduced by this first slice.
