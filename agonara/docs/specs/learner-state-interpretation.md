---
date: 2026-06-03
model: gpt-5
description: "Spec: Agonara learner-state interpretation."
version: 0.0.1
status: draft
type: spec
---

# Learner-State Interpretation

## Goal

Define the Student Workspace-owned contract for deriving personal progress, weak-area, and evidence summaries from accepted Program checks and Student evidence without mutating accepted Program corpus or Program Membership state.

## Public interface

This spec operationalizes STU-15, STU-16, STU-17, and INT-07 from [Product Intent](../intent_learning_program_app.md) through [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), [ADR-012](../adr/adr-012-student-workspace-open-answer-attempt-lifecycle.md), [ADR-016](../adr/adr-016-quick-check-assessment-boundary.md), and [Topic, Concept, and Material Navigation](topic-concept-material-navigation.md).

Learner-state interpretation is a read contract. The first slice derives summaries at read time from immutable Student Workspace attempts, accepted check revisions, accepted criterion revisions, accepted navigation entities, and redacted evaluator evidence.

### Shared kinds

```ts
type LearnerStateTargetKind =
  | "program"
  | "topic"
  | "concept"
  | "material_reference"
  | "quick_check"
  | "open_answer_check"
  | "assessment_criterion";

type LearnerStateLevel =
  | "no_evidence"
  | "in_progress"
  | "developing"
  | "on_track"
  | "needs_attention";

type LearnerEvidenceSourceKind =
  | "quick_check_attempt"
  | "open_answer_attempt"
  | "open_answer_criterion_feedback"
  | "open_answer_evaluator_evidence";

type LearnerEvidenceSignal =
  | "positive"
  | "partial"
  | "negative"
  | "pending";
```

### Logical target links

```ts
type LearnerEvidenceTargetLink = {
  programId: ProgramId;
  targetKind: Exclude<LearnerStateTargetKind, "program">;
  targetId: string;
  evidenceOwnerKind:
    | "accepted_quick_check"
    | "accepted_open_answer_check"
    | "accepted_assessment_criterion";
  evidenceOwnerEntityId: string;
};
```

`LearnerEvidenceTargetLink` is accepted Program corpus metadata. It states which accepted check or criterion can contribute evidence to a navigation target. Student Workspace reads may consume these links but must not create, update, delete, or infer them.

### Student-safe evidence summaries

```ts
type LearnerEvidenceSummary = {
  evidenceId: string;
  sourceKind: LearnerEvidenceSourceKind;
  signal: LearnerEvidenceSignal;
  programId: string;
  studentIdentityId: string;
  occurredAt: string;
  attemptId?: string;
  checkRevisionId?: string;
  criterionRevisionId?: string;
  targetKind: LearnerStateTargetKind;
  targetId: string;
  title: string;
  summary: string;
};
```

Evidence summaries are student-safe. They may expose the owning student's attempt id, accepted check revision id, accepted criterion revision id, submitted answer text, selected option text, matched/not-matched result, criterion outcome, final feedback, and redacted evaluator evidence summaries. They must not expose answer keys, candidate ids, accepted-by identity ids, source ids, curator rationale, idempotency keys, evaluator leases, provider diagnostics, raw prompts, raw model responses, sessions, CSRF tokens, cookies, SQL text, filesystem paths, stack traces, database URLs, provider credentials, or infrastructure details.

### Target summaries

```ts
type LearnerStateTargetSummary = {
  targetKind: LearnerStateTargetKind;
  targetId: string;
  programId: string;
  title: string;
  level: LearnerStateLevel;
  evidenceCount: number;
  latestEvidenceAt?: string;
  positiveEvidenceCount: number;
  partialEvidenceCount: number;
  negativeEvidenceCount: number;
  pendingEvidenceCount: number;
};

type LearnerStateProgramSummary = {
  programId: string;
  studentIdentityId: string;
  generatedAt: string;
  level: LearnerStateLevel;
  totals: {
    targets: number;
    onTrack: number;
    developing: number;
    needsAttention: number;
    inProgress: number;
    noEvidence: number;
  };
  weakAreas: LearnerStateTargetSummary[];
  topics: LearnerStateTargetSummary[];
  concepts: LearnerStateTargetSummary[];
  materialReferences: LearnerStateTargetSummary[];
  checks: LearnerStateTargetSummary[];
  criteria: LearnerStateTargetSummary[];
};

type LearnerStateTargetDetail = LearnerStateTargetSummary & {
  evidence: LearnerEvidenceSummary[];
};
```

### Queries

```ts
getLearnerStateProgramSummary(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
}) -> GetLearnerStateProgramSummaryResult

getLearnerStateTargetDetail(input: {
  actingIdentityId: IdentityId;
  targetKind: LearnerStateTargetKind;
  targetId: string;
}) -> GetLearnerStateTargetDetailResult
```

Both query results are either:

- `{ status: "accepted"; value: ... }`
- `{ status: "rejected"; reason: LearnerStateInterpretationRejectionReason }`

### HTTP endpoints

| Method | Path | Auth | Accepted response |
|---|---|---|---|
| `GET` | `/programs/{programId}/learner-state` | Owning Student session | `AcceptedResult<{ learnerState: LearnerStateProgramSummary }>` |
| `GET` | `/learner-state/targets/{targetKind}/{targetId}` | Owning Student session | `AcceptedResult<{ learnerStateTarget: LearnerStateTargetDetail }>` |

Student Workspace must hide non-owner target detail behind the same rejection reason used for missing or unavailable targets.

### Rejection reasons

```ts
type LearnerStateInterpretationRejectionReason =
  | "identity_not_active"
  | "participation_required"
  | "program_not_found"
  | "learner_state_target_not_found"
  | "validation_failed";
```

## Behavior rules

1. Learner-state reads require an active acting Identity.
2. Learner-state reads require effective `Student` participation for the target Program.
3. Learner-state reads are owner-only. Program Curators, Admins, other Students in the Program, and Students outside the Program must not read another Student's learner-state summary or target detail.
4. `getLearnerStateProgramSummary` rejects unknown Programs with `program_not_found`.
5. `getLearnerStateTargetDetail` rejects unsupported target kinds, empty target ids, malformed target ids, and target ids that cannot resolve to an accepted target with `learner_state_target_not_found`.
6. Learner-state summaries are derived at read time from accepted Student Workspace evidence. The first slice must not persist final progress labels, mastery labels, weak-area labels, recommendation labels, or next-step labels as authoritative state.
7. A future cache may store derived summaries only if each cache row is invalidated by source evidence changes and the underlying evidence remains the source of truth.
8. Quick Check attempts produce one evidence item for the accepted quick-check revision: `matched: true` maps to `positive`; `matched: false` maps to `negative`.
9. Submitted, evaluating, or evaluation-failed open-answer attempts with no final evaluation produce `pending` evidence for the accepted open-answer check revision.
10. Evaluated open-answer attempts produce evidence for the accepted open-answer check revision and each accepted criterion revision in the attempt snapshot.
11. Open-answer criterion outcome `met` maps to `positive`.
12. Open-answer criterion outcome `partially_met` or `unclear` maps to `partial`.
13. Open-answer criterion outcome `missing` maps to `negative`.
14. Redacted evaluator evidence may appear as supporting evidence only when it is already visible through owner-only Student Workspace reads.
15. Evidence linked to an accepted check or criterion contributes to accepted navigation topic, concept, or material-reference targets only through explicit accepted `LearnerEvidenceTargetLink` records.
16. Learner-state interpretation must not infer topic, concept, or material-reference progress from shared `sourceIds`, matching titles, matching text, source co-occurrence, candidate provenance, or LLM/provider output.
17. When an accepted check or criterion has no explicit target links, its evidence contributes to the Program summary and check or criterion summaries, but not to topic, concept, or material-reference summaries.
18. A target with no evidence returns `level: "no_evidence"` and zero evidence counts.
19. A target with only pending evidence returns `level: "in_progress"`.
20. A target with at least one latest negative evidence item returns `level: "needs_attention"`.
21. A target with no latest negative evidence and at least one latest partial evidence item returns `level: "developing"`.
22. A target with at least one latest positive evidence item and no latest pending, partial, or negative evidence items returns `level: "on_track"`.
23. "Latest" means the most recent evidence per evidence source key. The source key is the accepted quick-check revision id for Quick Check evidence and the accepted criterion revision id for criterion feedback evidence. Open-answer check-level pending evidence uses the accepted open-answer check revision id.
24. A later positive attempt for the same source key can replace an earlier negative signal for that source key; it must not remove the earlier evidence from target detail.
25. Target detail lists all supporting evidence in reverse chronological order, even when the target's level uses only latest evidence per source key.
26. Program summary level is derived from target summaries: `needs_attention` when any target needs attention, `developing` when no target needs attention and any target is developing, `in_progress` when no target needs attention or is developing and any target is in progress, `on_track` when at least one target is on track and no target has another evidence-backed level, and `no_evidence` when every target has no evidence.
27. `weakAreas` contains only target summaries with `level: "needs_attention"`, sorted by latest evidence descending and then title ascending.
28. Topic summaries include direct topic evidence plus rollups from concepts connected by current accepted `topic_includes_concept` relationships.
29. Concept summaries include direct concept evidence plus direct evidence from definitions, principles, and material references connected through current accepted `concept_has_definition`, `concept_has_principle`, and `concept_uses_material` relationships.
30. Material-reference summaries include only direct material-reference evidence.
31. Navigation rollups use current accepted navigation relationships. Historical navigation revisions remain evidence links in target detail only when the evidence directly references those historical accepted revisions.
32. Learner-state reads must not create, update, reject, delete, or rewrite Program sources, candidates, accepted corpus entities, accepted revisions, navigation entities, navigation relationships, accepted checks, accepted criteria, Program Membership records, sessions, attempts, answers, evaluations, evaluator evidence, evaluator jobs, or audit events.
33. Learner-state reads must not call LLM providers, evaluator workers, provider adapters, source extraction, scoring services, recommendation engines, or external URLs.
34. Student-safe learner-state responses must not expose answer keys, candidate ids, accepted-by identity ids, source ids, curator rationale, idempotency keys, evaluator leases, provider diagnostics, raw prompts, raw model responses, sessions, CSRF tokens, cookies, SQL text, filesystem paths, stack traces, database URLs, provider credentials, or infrastructure details.
35. Backup and restore must preserve the immutable evidence that learner-state reads derive from. Because the first slice derives labels at read time, backup and restore must not require stored learner-state labels to recover personal progress.
36. This spec does not add topic-level checks, period-level checks, readiness decisions, recommendation ranking, next-step scheduling, notification behavior, institutional grades, analytics dashboards, Program Curator reads of Student state, Admin reads of Student state, LLM-assisted interpretation, or persisted mastery models.

## Tests (required)

1. Domain test derives `no_evidence` Program, check, topic, concept, material, and criterion summaries for an owning Student with no attempts.
2. Domain test maps matched Quick Check attempts to positive evidence and unmatched Quick Check attempts to negative evidence.
3. Domain test maps open-answer criterion outcomes `met`, `partially_met`, `unclear`, and `missing` to positive, partial, partial, and negative evidence.
4. Domain test maps submitted, evaluating, and evaluation-failed open-answer attempts without final evaluation to pending evidence.
5. Domain test derives `on_track`, `developing`, `needs_attention`, and `in_progress` levels from latest evidence per source key.
6. Domain test proves a later positive attempt for the same source key changes the target level while preserving earlier evidence in target detail.
7. Domain test lists weak areas only for `needs_attention` targets and sorts by latest evidence descending and title ascending.
8. Domain test rolls concept evidence into topic summaries through current accepted `topic_includes_concept` relationships.
9. Domain test rolls definition, principle, and material evidence into concept summaries only through current accepted concept relationships.
10. Domain test proves material-reference summaries do not inherit unrelated topic or concept evidence.
11. Boundary test proves learner-state reads do not mutate Corpus Storage, Program Membership, Identity sessions, Student Workspace attempts, evaluations, evaluator evidence, evaluator jobs, or audit events.
12. Boundary test proves learner-state reads do not infer navigation target progress from shared source ids, matching titles, matching text, source co-occurrence, candidate provenance, or provider output.
13. HTTP test verifies `GET /programs/{programId}/learner-state` requires a session and effective Student participation.
14. HTTP test verifies `GET /learner-state/targets/{targetKind}/{targetId}` is owner-only and hides non-owner targets as unavailable.
15. HTTP test verifies Student-safe learner-state responses omit answer keys, candidate ids, accepted-by identity ids, source ids, curator rationale, idempotency keys, evaluator leases, provider diagnostics, raw prompts, raw model responses, sessions, CSRF tokens, cookies, SQL text, filesystem paths, stack traces, database URLs, provider credentials, and infrastructure details.
16. HTTP test verifies unsupported target kinds and malformed target ids are rejected without operational detail leakage.
17. Browser test shows Program progress, weak areas, and counts for an owning Student.
18. Browser test opens a weak topic or concept and shows supporting attempts, answers, checks, criterion feedback, and redacted evaluator evidence behind the label.
19. Browser test proves the learner-state UI does not render protected metadata or another Student's evidence.
20. Backup/restore test proves restored attempts, evaluations, and evidence produce the same learner-state summaries without stored progress labels.
21. Absence/regression test proves no Program Curator, Admin, public, LLM, recommendation, topic-level readiness, period-level readiness, grading, analytics, or provider route is added by this slice.

## Done criteria

- Owner-only Student Workspace learner-state queries return deterministic Program summaries, weak-area lists, target summaries, and target evidence detail.
- Progress and weak-area labels are derived from immutable attempts, accepted check revisions, accepted criterion revisions, explicit target links, and redacted evidence.
- Every label exposes supporting evidence and no label is derived from implicit text/source matching or candidate provenance.
- Learner-state reads do not mutate Program corpus, Program Membership, Identity, Student Workspace evidence, evaluator state, or audit state.
- HTTP and browser surfaces are student-safe, owner-only, and free of protected metadata and operational details.
- Backup/restore preserves source evidence so derived learner-state summaries remain reproducible after restore.
- Agonara tests, root build, docs checks, and `git diff --check` pass after implementation.
