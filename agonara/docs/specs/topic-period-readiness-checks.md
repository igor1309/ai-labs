---
date: 2026-06-03
model: gpt-5
description: "Spec: Agonara topic and period readiness checks."
version: 0.0.1
status: implemented
type: spec
---

# Topic and Period Readiness Checks

## Goal

Define the Corpus-owned contract for accepted topic and period readiness check definitions, and the Student Workspace-owned contract for explicit Student readiness attempts whose results are derived from learner-state evidence without mutating accepted Program corpus or raw assessment attempts.

## Implementation status

Implemented in the Topic and Period Readiness Checks plan:

- Plan archive: [Topic and Period Readiness Checks Implementation Plan](../plans/implemented/topic-period-readiness-checks.md)
- Storage and backup/restore coverage: [storage.test.js](../../tests/storage.test.js), [backup-restore.test.js](../../tests/backup-restore.test.js)
- Corpus/domain coverage: [corpus.test.js](../../tests/corpus.test.js), [corpus-executable-acceptance.test.js](../../tests/corpus-executable-acceptance.test.js)
- Student Workspace coverage: [student-workspace.test.js](../../tests/student-workspace.test.js)
- HTTP and executable acceptance coverage: [http-api-readiness-checks.test.js](../../tests/http-api-readiness-checks.test.js), [executable-acceptance-corpus-navigation.test.js](../../tests/executable-acceptance-corpus-navigation.test.js)
- Browser coverage: [topic-period-readiness-checks.playwright.js](../../tests/topic-period-readiness-checks.playwright.js)
- Runtime surfaces: [Corpus domain service](../../src/corpus.js), [Student Workspace domain service](../../src/student-workspace.js), [HTTP adapter](../../src/server.js), [`/learn` product UI](../../src/learn-ui.js)

The implemented first slice supports accepted topic/period readiness definitions, explicit owning-Student readiness attempts, owner-only attempt reads, idempotent retry, evidence-backed requirement snapshots, backup/restore preservation, and `/learn` Curator/Student workflows. It does not implement grades, recommendations, analytics, certification, schedules, notifications, classroom reporting, persisted mastery models, or automatic promotion decisions.

## Public interface

This spec operationalizes INT-06 and STU-14 from [Product Intent](../intent/intent_learning_program_app.md) through [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md), [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), [ADR-016](../adr/adr-016-quick-check-assessment-boundary.md), [Topic, Concept, and Material Navigation](topic-concept-material-navigation.md), and [Learner-State Interpretation](learner-state-interpretation.md).

Readiness checks are explicit aggregate assessment boundaries. Existing Quick Check, open-answer, criterion, and learner-state evidence may contribute to a readiness result only when a Program Curator has accepted a readiness check definition and an owning Student explicitly submits a readiness attempt.

### Shared kinds

```ts
type ReadinessScopeKind = "topic" | "period";

type ReadinessResult = "ready" | "not_ready" | "in_progress";

type ReadinessRequirementTargetKind =
  | "topic"
  | "concept"
  | "material_reference"
  | "quick_check"
  | "open_answer_check"
  | "assessment_criterion";

type ReadinessRequiredLevel = "developing" | "on_track";

type ReadinessCheckCandidateStatus = "draft" | "accepted" | "rejected";
```

### Logical records

```ts
type ReadinessRequirement = {
  requirementId: ReadinessRequirementId;
  targetKind: ReadinessRequirementTargetKind;
  targetId: string;
  requiredLevel: ReadinessRequiredLevel;
};

type TopicReadinessScope = {
  scopeKind: "topic";
  topicEntityId: AcceptedNavigationEntityId;
};

type PeriodReadinessScope = {
  scopeKind: "period";
  title: string;
  topicEntityIds: AcceptedNavigationEntityId[];
};

type ReadinessCheckCandidate = {
  candidateId: ReadinessCheckCandidateId;
  programId: ProgramId;
  title: string;
  scope: TopicReadinessScope | PeriodReadinessScope;
  requirements: ReadinessRequirement[];
  sourceIds: ProgramSourceId[];
  rationale?: string;
  status: ReadinessCheckCandidateStatus;
  createdByIdentityId: IdentityId;
  createdAt: Instant;
  updatedAt: Instant;
};

type AcceptedReadinessCheckEntity = {
  entityId: AcceptedReadinessCheckEntityId;
  programId: ProgramId;
  currentRevisionId: AcceptedReadinessCheckRevisionId;
};

type AcceptedReadinessCheckRevision = {
  revisionId: AcceptedReadinessCheckRevisionId;
  entityId: AcceptedReadinessCheckEntityId;
  programId: ProgramId;
  title: string;
  scope: TopicReadinessScope | PeriodReadinessScope;
  requirements: ReadinessRequirement[];
  sourceIds: ProgramSourceId[];
  rationale?: string;
  acceptedFromCandidateId: ReadinessCheckCandidateId;
  acceptedByIdentityId: IdentityId;
  acceptedAt: Instant;
};

type ReadinessRequirementResult = {
  requirementId: ReadinessRequirementId;
  targetKind: ReadinessRequirementTargetKind;
  targetId: string;
  title: string;
  requiredLevel: ReadinessRequiredLevel;
  observedLevel: LearnerStateLevel;
  evidenceCount: number;
  result: ReadinessResult;
};

type ReadinessCheckAttempt = {
  attemptId: ReadinessCheckAttemptId;
  programId: ProgramId;
  studentIdentityId: IdentityId;
  readinessCheckRevisionId: AcceptedReadinessCheckRevisionId;
  result: ReadinessResult;
  requirementResults: ReadinessRequirementResult[];
  idempotencyKey: string;
  submittedAt: Instant;
};
```

Period readiness scopes are named sets of accepted topic entities. This first slice does not introduce calendars, cohorts, classroom periods, schedules, due dates, or institutional reporting periods.

### Response summaries

```ts
type ReadinessCheckCandidateSummary = {
  candidateId: string;
  programId: string;
  title: string;
  scope: TopicReadinessScope | PeriodReadinessScope;
  requirements: ReadinessRequirement[];
  sourceIds: string[];
  rationale?: string;
  status: ReadinessCheckCandidateStatus;
  createdByIdentityId: string;
  createdAt: string;
  updatedAt: string;
};

type AcceptedReadinessCheckSummary = {
  entityId: string;
  revisionId: string;
  programId: string;
  title: string;
  scope: TopicReadinessScope | PeriodReadinessScope;
  requirements: ReadinessRequirement[];
  acceptedAt: string;
};

type AcceptedReadinessCheckCurationSummary = AcceptedReadinessCheckSummary & {
  acceptedFromCandidateId: string;
  acceptedByIdentityId: string;
  sourceIds: string[];
  rationale?: string;
};

type ReadinessCheckDelivery = {
  revisionId: string;
  programId: string;
  title: string;
  scope: TopicReadinessScope | PeriodReadinessScope;
  requirements: ReadinessRequirement[];
};

type ReadinessCheckAttemptSummary = {
  attemptId: string;
  programId: string;
  studentIdentityId: string;
  readinessCheckRevisionId: string;
  result: ReadinessResult;
  requirementResults: ReadinessRequirementResult[];
  submittedAt: string;
};
```

Student-facing delivery and attempt summaries omit candidate ids, source ids, curator rationale, accepted-by identity ids, and idempotency keys.

### Commands

```ts
createReadinessCheckCandidate(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  title: string;
  scope: TopicReadinessScope | PeriodReadinessScope;
  requirements: Array<{
    targetKind: ReadinessRequirementTargetKind;
    targetId: string;
    requiredLevel: ReadinessRequiredLevel;
  }>;
  sourceIds?: ProgramSourceId[];
  rationale?: string;
}) -> CreateReadinessCheckCandidateResult

acceptReadinessCheckCandidate(input: {
  actingIdentityId: IdentityId;
  candidateId: ReadinessCheckCandidateId;
  targetEntityId?: AcceptedReadinessCheckEntityId;
}) -> AcceptReadinessCheckCandidateResult

rejectReadinessCheckCandidate(input: {
  actingIdentityId: IdentityId;
  candidateId: ReadinessCheckCandidateId;
}) -> RejectReadinessCheckCandidateResult

submitReadinessCheckAttempt(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  readinessCheckRevisionId: AcceptedReadinessCheckRevisionId;
  idempotencyKey: string;
}) -> SubmitReadinessCheckAttemptResult
```

Candidate commands require effective `Program Curator` participation for the Program. Attempt submission requires effective `Student` participation for the Program.

### Queries

```ts
listReadinessCheckCandidates(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  status?: ReadinessCheckCandidateStatus;
}) -> ListReadinessCheckCandidatesResult

getAcceptedReadinessCheckRevisionForCuration(input: {
  actingIdentityId: IdentityId;
  revisionId: AcceptedReadinessCheckRevisionId;
}) -> GetAcceptedReadinessCheckRevisionForCurationResult

listReadinessCheckDeliveries(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  scopeKind?: ReadinessScopeKind;
}) -> ListReadinessCheckDeliveriesResult

listReadinessCheckAttempts(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  readinessCheckRevisionId?: AcceptedReadinessCheckRevisionId;
}) -> ListReadinessCheckAttemptsResult

getReadinessCheckAttempt(input: {
  actingIdentityId: IdentityId;
  attemptId: ReadinessCheckAttemptId;
}) -> GetReadinessCheckAttemptResult
```

Candidate queries and curation revision reads require effective `Program Curator` participation. Delivery queries and attempt reads require effective `Student` participation, and attempt reads are owner-only.

### HTTP endpoints

| Method | Path | Auth | Accepted response |
|---|---|---|---|
| `GET` | `/programs/{programId}/readiness-checks/candidates?status={status}` | Program Curator session | `AcceptedResult<{ readinessCheckCandidates: ReadinessCheckCandidateSummary[] }>` |
| `POST` | `/programs/{programId}/readiness-checks/candidates` | Program Curator session and CSRF header | `AcceptedResult<{ readinessCheckCandidate: ReadinessCheckCandidateSummary }>` |
| `POST` | `/readiness-checks/candidates/{candidateId}/acceptance` | Program Curator session and CSRF header | `AcceptedResult<{ acceptedReadinessCheck: AcceptedReadinessCheckSummary }>` |
| `POST` | `/readiness-checks/candidates/{candidateId}/rejection` | Program Curator session and CSRF header | `AcceptedResult<{ readinessCheckCandidate: ReadinessCheckCandidateSummary }>` |
| `GET` | `/readiness-checks/revisions/{revisionId}/curation` | Program Curator session | `AcceptedResult<{ acceptedReadinessCheck: AcceptedReadinessCheckCurationSummary }>` |
| `GET` | `/programs/{programId}/readiness-checks` | Student session | `AcceptedResult<{ readinessChecks: ReadinessCheckDelivery[] }>` |
| `POST` | `/programs/{programId}/readiness-check-attempts` | Student session, CSRF header, and idempotency key | `AcceptedResult<{ readinessCheckAttempt: ReadinessCheckAttemptSummary }>` |
| `GET` | `/programs/{programId}/readiness-check-attempts` | Student session | `AcceptedResult<{ readinessCheckAttempts: ReadinessCheckAttemptSummary[] }>` |
| `GET` | `/readiness-check-attempts/{attemptId}` | Owning Student session | `AcceptedResult<{ readinessCheckAttempt: ReadinessCheckAttemptSummary }>` |

### Rejection reasons

```ts
type ReadinessCheckRejectionReason =
  | "identity_not_active"
  | "admin_or_curator_required"
  | "participation_required"
  | "program_not_found"
  | "readiness_candidate_not_found"
  | "readiness_candidate_already_accepted"
  | "readiness_candidate_already_rejected"
  | "readiness_entity_not_found"
  | "readiness_entity_program_mismatch"
  | "readiness_revision_not_found"
  | "readiness_revision_program_mismatch"
  | "readiness_scope_not_found"
  | "readiness_scope_program_mismatch"
  | "readiness_requirement_target_not_found"
  | "readiness_requirement_id_conflict"
  | "readiness_requirement_program_mismatch"
  | "attempt_not_found"
  | "idempotency_conflict"
  | "validation_failed";
```

## Behavior rules

1. Readiness check candidates are accepted Program corpus drafts and require an active acting Identity.
2. Candidate creation, listing, acceptance, rejection, and curation reads require effective `Program Curator` participation for the Program.
3. Candidate creation rejects blank titles, unsupported scope kinds, empty requirement lists, unsupported requirement target kinds, unsupported required levels, duplicate requirements, and malformed ids with `validation_failed`.
4. Topic scopes require an accepted current topic entity in the same Program.
5. Period scopes require a non-empty title and one or more accepted current topic entities in the same Program.
6. Period scopes do not create calendar periods, class periods, schedules, cohorts, due dates, or reporting windows.
7. Requirements may target accepted topic, concept, material-reference, quick-check, open-answer-check, or assessment-criterion entities in the same Program.
8. Requirements must not target draft/rejected candidates, historical non-current navigation revisions, historical non-current check revisions, cross-Program entities, or unsupported learner-state target kinds.
9. Candidate acceptance creates or replaces an accepted readiness check entity and accepted revision. Replacing a revision preserves historical accepted revisions and historical attempts.
10. Candidate rejection marks only the candidate rejected and must not create accepted revisions, Student Workspace attempts, learner-state summaries, or readiness attempts.
11. Student deliveries return accepted current readiness check revisions for the Program and omit curator-only metadata.
12. Readiness attempt submission requires effective `Student` participation, an accepted readiness check revision in the same Program, CSRF at the HTTP boundary, and an idempotency key.
13. Readiness attempt submission creates an explicit Student Workspace attempt. Raw Quick Check attempts, open-answer attempts, learner-state reads, and target-link curation must not silently create readiness attempts or readiness results.
14. Attempt submission evaluates every requirement against the owning Student's current learner-state target summary at submission time.
15. Required-level satisfaction is explicit: `on_track` satisfies `on_track`; `developing` and `on_track` satisfy `developing`; `in_progress`, `needs_attention`, and `no_evidence` do not satisfy either required level.
16. A requirement result is `ready` when the observed learner-state level satisfies the required level.
17. A requirement result is `in_progress` when the observed level is `in_progress`.
18. A requirement result is `not_ready` when the observed level is `no_evidence`, `needs_attention`, or below the required level.
19. An attempt result is `ready` only when every requirement result is `ready`.
20. An attempt result is `in_progress` when no requirement is `not_ready` and at least one requirement is `in_progress`.
21. An attempt result is `not_ready` when any requirement is `not_ready`.
22. Attempt results snapshot requirement results, observed levels, evidence counts, titles, and submitted time. Later evidence changes do not rewrite historical attempts.
23. Reusing the same idempotency key for the same Student, Program, readiness revision, and equivalent submission returns the original attempt.
24. Reusing an idempotency key for a different Student, Program, readiness revision, or submission shape rejects with `idempotency_conflict`.
25. Attempt list and detail reads require the owning Student Identity. Program Curators, Admins, other Students in the Program, and Students outside the Program must receive the same unavailable result as a missing attempt.
26. Readiness check reads and attempts must not create, update, delete, accept, reject, or rewrite Program sources, navigation entities, navigation relationships, accepted checks, accepted criteria, learner evidence target links, Quick Check attempts, open-answer attempts, evaluator evidence, evaluator jobs, sessions, audit events, or Program Membership records except for the explicit readiness records named in this spec.
27. Student-safe readiness responses must not expose answer keys, candidate ids on Student deliveries, accepted-by identity ids, source ids, curator rationale, idempotency keys, evaluator leases, provider diagnostics, raw prompts, raw model responses, sessions, CSRF tokens, cookies, SQL text, filesystem paths, stack traces, database URLs, provider credentials, or infrastructure details.
28. Readiness checks are not grades, recommendations, analytics, certification, promotion decisions, schedules, notifications, or classroom reporting.
29. Backup and restore preserve candidates, accepted readiness check entities/revisions, readiness attempts, idempotency records, and historical snapshots. Malformed restore graphs must reject before mutation.

## Tests (required)

1. Storage test creates readiness check candidates with topic and period scopes, requirements, source ids, rationale, creator attribution, and timestamps.
2. Storage test accepts candidate revisions, preserves historical revisions, and supports replacement of an accepted readiness check entity.
3. Storage test rejects malformed restore graphs, duplicate ids, duplicate active idempotency scopes, missing Programs, missing Identities, cross-Program scopes, cross-Program requirements, unsupported kinds, and attempts pointing at missing revisions.
4. Corpus test creates, lists, accepts, rejects, and reads readiness check candidates as an effective Program Curator.
5. Corpus test rejects Admin-only, Student, disabled Identity, missing participation, invalid scope, draft/rejected/missing scope target, cross-Program scope target, invalid requirement, draft/rejected/missing requirement target, and cross-Program requirement target cases.
6. Corpus boundary test proves candidate operations do not create Student Workspace attempts, learner-state summaries, readiness attempts, Quick Check attempts, open-answer attempts, or Program Membership changes.
7. Student Workspace test submits a readiness attempt that derives `ready` from all requirements meeting their required levels.
8. Student Workspace test derives `not_ready` from `no_evidence`, `needs_attention`, and below-threshold learner-state levels.
9. Student Workspace test derives `in_progress` when requirements are pending and no requirement is not ready.
10. Student Workspace test proves raw Quick Check attempts, open-answer attempts, learner-state reads, and target-link curation do not create readiness attempts.
11. Student Workspace test proves historical readiness attempts keep their snapshot after later learner evidence changes.
12. Student Workspace test proves idempotent replay returns the original attempt and conflicting replay rejects.
13. Student Workspace test proves owner-only attempt list/detail reads and private unavailable behavior for Curators, Admins, other Students, outside Students, disabled Identities, and unknown attempts.
14. HTTP test verifies candidate routes, acceptance/rejection routes, delivery routes, attempt routes, session gates, CSRF mutation gates, idempotency-key gates, status mapping, and redaction.
15. HTTP executable acceptance test covers the end-to-end flow from curator-created readiness check to Student readiness attempt result.
16. Browser test covers Curator readiness candidate create/list/accept/reject/inspect workflows without exposing Student readiness state.
17. Browser test covers Student delivery list, attempt submission, result display, evidence drill-down, idempotent retry, owner-only attempt detail, and protected-data redaction.
18. Browser regression test proves existing Quick Check, learner-state, and navigation workflows remain usable and raw Quick Check attempts are not renamed or promoted into readiness results.
19. Backup/restore test proves readiness candidates, accepted revisions, attempts, idempotency records, and historical snapshots round-trip.
20. Absence/regression test proves this slice does not add grading, analytics, certification, recommendation, notification, classroom reporting, LLM/provider, evaluator-worker, or Admin/Curator Student-read routes.

## Done criteria

- Program Curators can curate accepted topic and period readiness check definitions as Program corpus metadata.
- Owning Students can explicitly submit readiness attempts and read their readiness results with requirement-level evidence.
- Readiness results derive from learner-state evidence at submission time and preserve historical snapshots.
- Raw Quick Check and open-answer attempt semantics remain unchanged and never silently create readiness results.
- Readiness surfaces are owner-only, student-safe, and free of protected metadata and operational details.
- Backup/restore preserves readiness definitions, accepted revisions, attempts, and idempotency history.
- Agonara tests, browser regressions, root build, docs checks, LOC dashboard closeout, and `git diff --check` pass after implementation.
