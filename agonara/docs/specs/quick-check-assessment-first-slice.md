---
date: 2026-06-02
model: gpt-5
description: "Spec: Agonara deterministic single-select quick-check assessment first-slice contract."
version: 0.0.1
status: draft
type: spec
---

# Quick-Check Assessment First Slice

## Goal

Define the Agonara v0.0.1 backend contract for Corpus Storage-owned accepted deterministic single-select quick checks and Student Workspace-owned immutable quick-check attempts, results, and personal evidence.

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

Each command result is either:

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
26. Delivery revision reads return current or historical accepted quick-check revisions as student-safe delivery projections after resolving access through the revision's Program.
27. Delivery queries require an active Identity with effective `Student` participation for the Program.
28. Delivery projections include revision id, Program id, check kind, title, prompt, and answerable options.
29. Delivery projections must not expose answer keys, option correctness flags, curator-only metadata, candidate ids, rationale, accepting curator attribution, or acceptance time.
30. `submitQuickCheckAttempt` rejects inactive or unknown acting Identities with `identity_not_active`.
31. `submitQuickCheckAttempt` rejects unknown Programs with `program_not_found`.
32. `submitQuickCheckAttempt` rejects callers without effective `Student` participation for the Program with `participation_required`.
33. `submitQuickCheckAttempt` rejects unknown accepted revision ids, draft candidate ids, and rejected candidate ids with `quick_check_revision_not_found`.
34. `submitQuickCheckAttempt` rejects accepted revisions from another Program with `quick_check_revision_program_mismatch`.
35. `submitQuickCheckAttempt` rejects option ids outside the accepted revision with `selected_option_not_found`.
36. `submitQuickCheckAttempt` rejects missing, empty, whitespace-only, or non-string idempotency keys with `validation_failed`.
37. `submitQuickCheckAttempt` scopes idempotency to acting Student Identity, Program, accepted quick-check revision, and idempotency key.
38. `submitQuickCheckAttempt` returns the original accepted attempt for an equivalent retry with the same scoped idempotency key and selected option id.
39. `submitQuickCheckAttempt` rejects reuse of the same scoped idempotency key with a different selected option id with `idempotency_conflict`.
40. `submitQuickCheckAttempt` creates one immutable attempt on first accepted submission.
41. `submitQuickCheckAttempt` records whether the selected option matched the accepted revision answer key.
42. A corrective answer creates a new attempt with a new idempotency key and must not mutate the prior attempt or result.
43. Later accepted quick-check revisions must not rewrite historical attempts or results.
44. Attempt queries return only attempts owned by the acting Student Identity.
45. `getQuickCheckAttempt` rejects unknown attempts with `attempt_not_found`.
46. `getQuickCheckAttempt` rejects inactive Identities with `identity_not_active`.
47. `getQuickCheckAttempt` rejects non-owning Students, Program Curators, Admins, and other callers with `attempt_not_found`.
48. `listQuickCheckAttempts` rejects inactive Identities with `identity_not_active`, unknown Programs with `program_not_found`, and callers without effective Student participation with `participation_required`.
49. `listQuickCheckAttempts` applies `checkRevisionId` filters only after enforcing Program and owning-Student scope.
50. Student-facing delivery and attempt responses must not expose answer keys, option correctness metadata for individual options, idempotency keys, candidate ids, curator-only metadata, password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
51. Candidate acceptance, delivery queries, attempt submission, and attempt queries must not create, update, reject, or delete open-answer checks, assessment criteria, unrelated accepted corpus, unrelated curator candidates, Program Membership state, Identity state, sessions, credentials, Admin authority, or CSRF state.
52. Quick-check behavior must not create or update mastery, weak-area, progress, review-scheduling, next-step, topic-readiness, period-readiness, grading, analytics, or reporting state.
53. Protected operational backup and restore must preserve quick-check candidates, accepted entities, accepted revisions, accepted options, answer keys, attempts, results, and historical references.
54. Restore must reject accepted revisions with fewer than two options, duplicate accepted option ids, missing answer keys, duplicated answer keys, or answer keys outside the accepted revision.
55. Restore must reject attempts that reference missing Programs, missing Identities, missing accepted quick-check revisions, or selected option ids outside the referenced revision.
56. Restore must reject candidate records whose answer key does not reference one option on that candidate.
57. This first slice does not expose HTTP routes, CLI commands, Student UI, Admin UI, Curator UI, option randomization, multiple-select checks, topic-level checks, period-level checks, mastery interpretation, progress interpretation, review scheduling, next-step recommendation, grading, analytics, reporting, external provider calls, evaluator workers, queues, or human review behavior.

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
18. `submitQuickCheckAttempt` accepts an effective Student and returns an immutable attempt referencing the accepted revision, selected option, and matched-or-not-matched result.
19. `submitQuickCheckAttempt` rejects inactive Identities, unknown Programs, callers without effective Student participation, unknown revisions, candidate ids, cross-Program revisions, option ids outside the revision, and invalid idempotency keys with the specified reasons.
20. `submitQuickCheckAttempt` returns the original attempt for an equivalent retry with the same scoped idempotency key and selected option id.
21. `submitQuickCheckAttempt` rejects conflicting selected-option reuse of the same scoped idempotency key with `idempotency_conflict`.
22. A corrective answer creates a new attempt without mutating the prior attempt or result.
23. Later accepted quick-check revisions do not rewrite historical attempts or results.
24. `getQuickCheckAttempt` returns the owning Student's attempt result.
25. `getQuickCheckAttempt` rejects inactive Identities, unknown attempts, non-owning Students, Program Curators, Admins, and other callers with the specified reasons.
26. `listQuickCheckAttempts` returns only attempts owned by the acting Student in the requested Program.
27. `listQuickCheckAttempts` applies accepted revision filters after enforcing Program and owning-Student scope.
28. Student-facing delivery and attempt responses exclude answer keys, per-option correctness metadata, idempotency keys, candidate ids, curator-only metadata, secrets, session identifiers, CSRF tokens, SQL text, stack traces, filesystem paths, database URLs, and infrastructure details.
29. Quick-check behavior does not mutate open-answer checks, assessment criteria, unrelated accepted corpus, unrelated curator candidates, Program Membership state, Identity state, session state, credential state, Admin authority, or CSRF state.
30. Quick-check behavior does not create mastery, weak-area, progress, review-scheduling, next-step, topic-readiness, period-readiness, grading, analytics, or reporting state.
31. Backup and restore preserve candidates, accepted revisions, accepted options, answer keys, attempts, matched results, and historical references.
32. Restore rejects malformed accepted revisions with fewer than two options, duplicate option ids, missing or duplicated answer keys, or answer keys outside the accepted revision.
33. Restore rejects attempts that reference missing Programs, missing Identities, missing accepted revisions, or selected option ids outside the referenced revision.
34. Restore rejects candidate records whose answer key does not reference an option on that candidate.
35. Executable acceptance flow: a Program Curator creates and accepts a quick-check candidate, a Student receives a delivery projection without the answer key, submits a matching answer, retries with the same idempotency key without duplicating the attempt, submits a corrective answer as a new attempt, the curator accepts a later revision, the Student reads historical results still linked to their original accepted revisions, backup and restore preserve the graph, and no open-answer, mastery, weak-area, progress, UI, CLI, provider, worker, queue, or human review state is introduced.

## Done criteria

- Corpus Storage exposes draft quick-check candidates and versioned accepted single-select quick-check revisions with opaque options and one valid answer key.
- Curator Workspace keeps draft, accepted, and rejected candidate lifecycle separate from accepted corpus.
- Effective Program Curator participation is required for candidate commands, candidate queries, and accepted revision reads that expose answer keys.
- Effective Student participation is required for student-safe delivery projections and Student Workspace attempt submission.
- Student-facing delivery projections never expose answer keys, option correctness metadata, or curator-only metadata.
- Student Workspace exposes immutable append-only attempts with selected option, matched-or-not-matched result, and scoped idempotency behavior.
- Owning-Student attempt reads expose personal evidence without exposing answer keys, per-option correctness metadata, or idempotency keys.
- Protected backup and restore preserve quick-check graphs and reject malformed answer-key or attempt references.
- Quick-check behavior does not mutate adjacent modules or create hidden learner-state interpretation.
- Every behavior rule is covered by a listed test or the executable acceptance flow.
- No HTTP routes, CLI commands, UI, option randomization, multiple-select checks, topic-level checks, period-level checks, mastery interpretation, progress interpretation, review scheduling, next-step recommendation, grading, analytics, reporting, external provider calls, evaluator workers, queues, or human review behavior is introduced by this first slice.
