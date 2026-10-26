---
date: 2026-06-04
model: gpt-5
description: "Spec: Agonara curator coverage gaps."
version: 0.0.1
status: implemented
type: spec
---

# Curator Coverage Gaps

## Goal

Define the Curator Workspace-owned read contract for diagnosing missing accepted-corpus coverage across topics, concepts, materials, checks, learner-evidence target links, and readiness requirements without mutating accepted Program corpus or Student Workspace state.

## Public interface

This spec operationalizes curator-side gap discovery for INT-01 from [Product Intent](../intent/intent_learning_program_app.md) while preserving the boundaries in [Module Responsibility Map](../module_responsibility_map.md), [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md), [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), [Topic, Concept, and Material Navigation](topic-concept-material-navigation.md), [Learner-State Interpretation](learner-state-interpretation.md), and [Topic and Period Readiness Checks](topic-period-readiness-checks.md).

Coverage-gap inspection is a read-only Curator Workspace diagnostic. It consumes accepted Program corpus metadata, accepted checks, accepted readiness checks, and active learner-evidence target links. It does not create draft candidates, call an LLM provider, accept content into Corpus Storage, or read Student attempts, progress, weak areas, readiness attempts, sessions, feedback, or evaluator evidence.

### Shared kinds

```ts
type CoverageGapScopeKind = "program" | "topic" | "concept";

type CoverageGapKind =
  | "topic_without_concepts"
  | "topic_without_materials"
  | "concept_without_materials"
  | "topic_without_checks"
  | "concept_without_checks"
  | "check_without_target_links"
  | "readiness_requirement_without_evidence_path";

type CoverageGapSeverity = "info" | "warning" | "critical";

type CoverageGapStatus = "draft_guidance";

type CoverageGapTargetKind =
  | "program"
  | "topic"
  | "concept"
  | "material_reference"
  | "quick_check"
  | "open_answer_check"
  | "assessment_criterion"
  | "readiness_check";

type CoverageGapSourceKind =
  | "accepted_navigation"
  | "accepted_check"
  | "learner_evidence_target_link"
  | "accepted_readiness_check";
```

### Report shapes

```ts
type CoverageGapSummary = {
  gapId: string;
  programId: ProgramId;
  gapKind: CoverageGapKind;
  severity: CoverageGapSeverity;
  status: CoverageGapStatus;
  targetKind: CoverageGapTargetKind;
  targetId?: string;
  targetTitle: string;
  title: string;
  description: string;
  sourceKind: CoverageGapSourceKind;
  sourceIds: string[];
  acceptedEvidencePathCount: number;
  detectedAt: Instant;
};

type CoverageGapReport = {
  programId: ProgramId;
  scopeKind: CoverageGapScopeKind;
  scopeId?: string;
  generatedAt: Instant;
  gaps: CoverageGapSummary[];
};
```

`acceptedEvidencePathCount` counts active accepted-corpus links or accepted check definitions that can produce learner-state evidence for the diagnostic target. It does not count Student evidence or attempts.

`gapId` is deterministic from `programId`, `gapKind`, `targetKind`, `targetId`, and sorted `sourceIds`. `generatedAt` and `detectedAt` are the current inspection timestamp for the read-time report and are not persisted lifecycle fields.

### Query

```ts
inspectCuratorCoverageGaps(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  scopeKind?: CoverageGapScopeKind;
  scopeId?: string;
  gapKinds?: CoverageGapKind[];
  minimumSeverity?: CoverageGapSeverity;
}) -> InspectCuratorCoverageGapsResult
```

The result is either:

- `{ status: "accepted"; value: { report: CoverageGapReport } }`
- `{ status: "rejected"; reason: CuratorCoverageGapsRejectionReason }`

### HTTP endpoint

| Method | Path | Auth | Accepted response |
|---|---|---|---|
| `GET` | `/programs/{programId}/coverage-gaps` | Program Curator session | `AcceptedResult<{ report: CoverageGapReport }>` |

The route accepts `scopeKind`, `scopeId`, `gapKind`, and `minimumSeverity` query parameters. Repeated `gapKind` parameters filter to any requested kind.

### Rejection reasons

```ts
type CuratorCoverageGapsRejectionReason =
  | "identity_not_active"
  | "program_curator_required"
  | "program_not_found"
  | "coverage_gap_scope_not_found"
  | "coverage_gap_scope_program_mismatch"
  | "validation_failed";
```

## Behavior rules

1. Coverage-gap inspection requires an active acting Identity.
2. Coverage-gap inspection requires effective `Program Curator` participation for the Program.
3. Instance `Admin` authority alone does not satisfy the `Program Curator` requirement.
4. Effective `Student` participation alone must be rejected with `program_curator_required`.
5. `scopeKind` defaults to `program`; `scopeId` is invalid when `scopeKind` is `program`.
6. `scopeId` is required for `topic` and `concept` scopes.
7. Topic scope rejects when the scoped target is missing, is not an accepted topic, or belongs to another Program.
8. Concept scope rejects when the scoped target is missing, is not an accepted concept, or belongs to another Program.
9. The report considers only current accepted navigation entities, current accepted navigation relationships, current accepted Quick Check revisions, current accepted open-answer check or criterion revisions, current accepted readiness check revisions, and active learner-evidence target links.
10. The report must not read or derive from Student Workspace attempts, readiness attempts, learner-state summaries, weak areas, progress labels, feedback, evaluator evidence, or learning sessions.
11. The report must not mutate Corpus Storage, Student Workspace, Program Membership, Identity, candidate records, accepted revisions, target links, LLM suggestion records, or domain audit/event records.
12. Every gap uses `status: "draft_guidance"`. A coverage gap is diagnostic guidance for a curator; it is not an accepted corpus record, a draft content candidate, an LLM suggestion, or a Student weak-area label.
13. Coverage-gap inspection may emit normal operational access logs only when they follow the repository's operational redaction rules and do not store coverage-gap domain state.
14. `topic_without_concepts` is reported for an accepted topic with no current accepted `topic_includes_concept` relationship.
15. `topic_without_materials` is reported for an accepted topic with no current accepted `topic_uses_material` relationship.
16. `concept_without_materials` is reported for an accepted concept with no current accepted `concept_uses_material` relationship.
17. `topic_without_checks` is reported for an accepted topic with zero active learner-evidence target links from an accepted check or accepted assessment criterion.
18. `concept_without_checks` is reported for an accepted concept with zero active learner-evidence target links from an accepted check or accepted assessment criterion.
19. `check_without_target_links` is reported for each current accepted Quick Check, open-answer check, or assessment criterion with no active learner-evidence target link to a topic, concept, or material reference.
20. `readiness_requirement_without_evidence_path` is reported for each current accepted readiness requirement whose target is not backed by an active learner-evidence target link or by a current accepted check or criterion that can contribute evidence to that target.
21. Severity is deterministic: missing checks or missing readiness evidence paths are `critical`; missing topic/concept material links or check target links are `warning`; missing topic concept links are `info`.
22. `minimumSeverity` filters by `critical` > `warning` > `info`.
23. Output ordering is deterministic: severity descending, then `targetTitle` ascending, then `targetId` ascending with missing ids last, then `gapKind` ascending.
24. Student-safe and curator-safe redaction rules both apply to HTTP output. The report must omit answer keys, correctness metadata, candidate ids, accepted-by identity ids, curator rationale, idempotency keys, submitted answers, feedback, evaluator leases, provider diagnostics, raw prompts, raw model responses, sessions, CSRF tokens, cookies, SQL text, filesystem paths, database URLs, provider credentials, stack traces, and infrastructure details.
25. Unknown `scopeKind`, unknown `gapKind`, invalid `minimumSeverity`, empty required ids, duplicate invalid filters, or malformed query values reject with `validation_failed`.

## Tests (required)

1. Program Curator can inspect a Program-level coverage-gap report over accepted corpus.
2. Student-only and Admin-only identities are rejected from coverage-gap inspection.
3. Topic scope and concept scope validate target existence, kind, and Program ownership.
4. A topic with no accepted concept relationship reports `topic_without_concepts`.
5. A topic with no accepted material relationship reports `topic_without_materials`.
6. A concept with no accepted material relationship reports `concept_without_materials`.
7. Topics and concepts with no active accepted evidence path report their respective check gaps.
8. Accepted Quick Checks, open-answer checks, and assessment criteria without target links report `check_without_target_links`.
9. Accepted readiness requirements without an accepted evidence path report `readiness_requirement_without_evidence_path`.
10. Coverage-gap inspection does not read or mutate Student Workspace attempts, progress, weak areas, readiness attempts, feedback, or evaluator evidence.
11. Coverage-gap inspection does not mutate Corpus Storage, Program Membership, Identity, target links, candidate records, accepted revisions, LLM suggestions, or domain audit/event records.
12. HTTP output omits answer keys, candidate ids, accepted-by identity ids, curator rationale, idempotency keys, submitted answers, feedback, sessions, CSRF tokens, provider data, and infrastructure details.
13. `minimumSeverity`, repeated `gapKind`, and scope filters produce deterministic filtered reports.
14. Gap ids, non-time report fields, and output ordering are stable across repeated reads of unchanged accepted corpus.

## Done criteria

- Curator Workspace exposes the read-only `inspectCuratorCoverageGaps` query for effective Program Curators.
- The HTTP endpoint returns deterministic `draft_guidance` reports with the specified validation, authorization, filtering, ordering, and redaction behavior.
- The `/learn` Curator UI lets Program Curators inspect and drill into coverage gaps without exposing Student Workspace state or protected curator/assessment metadata.
- Tests cover every behavior rule, including no-mutation boundaries for Corpus Storage, Student Workspace, Program Membership, Identity, target links, candidate records, accepted revisions, and LLM suggestions.
- The first implementation slice remains read-only and does not create draft candidates, call LLM providers, or accept content into Corpus Storage.

## Implementation status

Implemented by [Curator Coverage Gaps Implementation Plan](../plans/implemented/curator-coverage-gaps.md).

Runtime evidence:

- [Curator Workspace command boundary](../../src/curator-workspace.js)
- [HTTP API and production composition](../../src/server.js)
- [`/learn` coverage-gap UI](../../src/learn-ui.js)

Verification evidence:

- [Curator Workspace tests](../../tests/curator-workspace.test.js)
- [http-api-coverage-gaps.test.js](../../tests/http-api-coverage-gaps.test.js)
- [Executable HTTP acceptance tests](../../tests/executable-acceptance-corpus-navigation.test.js)
- [Coverage-gap browser tests](../../tests/curator-coverage-gaps.playwright.js)
