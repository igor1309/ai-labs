---
date: 2026-06-04
model: gpt-5
description: "Spec: Agonara LLM-assisted curation suggestions."
version: 0.0.1
status: implemented
type: spec
---

# LLM-Assisted Curation Suggestions

## Goal

Define the Curator Workspace-owned contract for generating, storing, reviewing, accepting, and rejecting LLM-assisted curation suggestions as draft material with provenance, provider-boundary validation, and raw-artifact redaction.

This spec operationalizes CUR-11, CUR-12, CUR-13, and INT-01 from [Product Intent](../intent/intent_learning_program_app.md) while preserving [Module Responsibility Map](../module_responsibility_map.md), [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md), [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), [Topic, Concept, and Material Navigation](topic-concept-material-navigation.md), [Quick Check Assessment API](quick-check-assessment-api.md), [Accepted Checks and Assessment Criteria API](accepted-checks-and-assessment-criteria-api.md), [Topic and Period Readiness Checks](topic-period-readiness-checks.md), and [Curator Coverage Gaps](curator-coverage-gaps.md). It does not add accepted corpus auto-promotion, Student Workspace reads, Student Workspace mutation, learner-state interpretation, scoring, hard-coded provider configuration inside Curator Workspace, direct provider network calls from Curator Workspace, CLI commands, Admin UI, Student UI, analytics, reporting, deployment topology, or infrastructure port behavior.

## Public interface

LLM-assisted curation suggestions are Curator Workspace records. The provider adapter protocol is owned by Curator Workspace and supplied by composition. Provider adapters cannot directly mutate Corpus Storage, Student Workspace, Program Membership, Identity, session, credential, Admin authority, CSRF, backup, or logging state.

### Shared result envelope

```ts
type LlmCurationSuggestionResult<T> =
  | { status: "accepted"; value: T }
  | { status: "rejected"; reason: LlmCurationSuggestionRejectionReason };

type LlmCurationSuggestionRejectionReason =
  | "identity_not_active"
  | "program_curator_required"
  | "program_not_found"
  | "coverage_gap_not_found"
  | "suggestion_policy_not_found"
  | "provider_adapter_not_found"
  | "provider_execution_failed"
  | "provider_budget_exceeded"
  | "provider_output_rejected"
  | "llm_curation_suggestion_not_found"
  | "llm_curation_suggestion_already_materialized"
  | "llm_curation_suggestion_already_rejected"
  | "suggestion_materialization_rejected"
  | "validation_failed";
```

### Suggestion kinds and status

```ts
type LlmCurationSuggestionStatus =
  | "draft_suggestion"
  | "materialized"
  | "rejected";

type LlmCurationSuggestedCandidateKind =
  | "navigation_candidate"
  | "quick_check_candidate"
  | "assessment_criterion_candidate"
  | "open_answer_check_candidate"
  | "readiness_check_candidate";

type LlmCurationSuggestionSourceKind =
  | "curator_instruction"
  | "coverage_gap"
  | "accepted_corpus_context";
```

`navigation_candidate` covers topic, concept, definition, principle, material-reference, and relationship-update draft candidate requests. `quick_check_candidate`, `assessment_criterion_candidate`, `open_answer_check_candidate`, and `readiness_check_candidate` map to the existing draft candidate creation contracts in the owning curation modules.

### Suggestion policy and provider adapter

```ts
type LlmCurationSuggestionPolicy = {
  suggestionPolicyId: string;
  providerAdapterId: string;
  outputValidatorPolicyId: string;
  redactionPolicyId: string;
  allowedSuggestionKinds: LlmCurationSuggestedCandidateKind[];
  promptInputPolicy: {
    includeAcceptedNavigationContext: boolean;
    includeAcceptedCheckContext: boolean;
    includeReadinessContext: boolean;
    includeCoverageGapContext: boolean;
    includeStudentWorkspaceState: false;
  };
  budgetPolicy?: {
    maxProviderCalls?: number;
    maxInputTokens?: number;
    maxOutputTokens?: number;
    maxEstimatedCostMinorUnits?: number;
  };
  rawArtifactPolicy: "none";
};

type LlmCurationSuggestionProviderRequest = {
  requestId: string;
  programId: string;
  suggestionPolicyId: string;
  outputValidatorPolicyId: string;
  allowedSuggestionKinds: LlmCurationSuggestedCandidateKind[];
  curatorInstruction?: string;
  context: {
    acceptedNavigationEntities: RedactedAcceptedNavigationContext[];
    acceptedChecks: RedactedAcceptedCheckContext[];
    acceptedReadinessChecks: RedactedAcceptedReadinessContext[];
    coverageGaps: CoverageGapSummary[];
  };
};

type LlmCurationSuggestionProviderOutput = {
  suggestions: LlmCurationProviderSuggestion[];
  outputValidation: {
    validatorPolicyId: string;
    passed: true;
  };
  providerUsage?: {
    providerCalls?: number;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostMinorUnits?: number;
  };
};

type LlmCurationSuggestionProviderAdapter = {
  providerAdapterId: string;
  suggest(request: LlmCurationSuggestionProviderRequest) -> LlmCurationSuggestionProviderOutput;
};
```

`RedactedAcceptedNavigationContext`, `RedactedAcceptedCheckContext`, and `RedactedAcceptedReadinessContext` are curator-safe prompt-context projections. They always omit existing answer keys, candidate ids, accepted-by identity ids, sessions, credentials, secrets, raw prompts, raw model responses, provider diagnostics, SQL text, stack traces, filesystem paths, database URLs, and infrastructure details. Provider output may propose a new answer key only inside a suggested Quick Check draft request, where candidate validation applies before storage.

### Stored suggestion shape

```ts
type LlmCurationProviderSuggestion = {
  suggestionKind: LlmCurationSuggestedCandidateKind;
  title: string;
  summary: string;
  rationale: string;
  suggestedDraft:
    | { candidateKind: "navigation_candidate"; request: CreateNavigationCandidateRequest }
    | { candidateKind: "quick_check_candidate"; request: CreateQuickCheckCandidateRequest }
    | { candidateKind: "assessment_criterion_candidate"; request: CreateAssessmentCriterionCandidateRequest }
    | { candidateKind: "open_answer_check_candidate"; request: CreateOpenAnswerCheckCandidateRequest }
    | { candidateKind: "readiness_check_candidate"; request: CreateReadinessCheckCandidateRequest };
  supportingEvidence: Array<{
    sourceKind: LlmCurationSuggestionSourceKind;
    sourceId: string;
    label: string;
  }>;
};

type LlmCurationSuggestionOrigin = {
  suggestionPolicyId: string;
  providerAdapterId: string;
  outputValidatorPolicyId: string;
  redactionPolicyId: string;
  sourceKinds: LlmCurationSuggestionSourceKind[];
  sourceIds: string[];
  coverageGapIds: string[];
  promptContextSummary: string;
  generatedByIdentityId: string;
  generatedAt: string;
};

type LlmCurationSuggestionSummary = {
  suggestionId: string;
  programId: string;
  suggestionKind: LlmCurationSuggestedCandidateKind;
  title: string;
  summary: string;
  status: LlmCurationSuggestionStatus;
  origin: LlmCurationSuggestionOrigin;
  materializedCandidate?: {
    candidateKind: LlmCurationSuggestedCandidateKind;
    candidateId: string;
    materializedAt: string;
    materializedByIdentityId: string;
  };
  rejectedAt?: string;
  rejectedByIdentityId?: string;
  createdAt: string;
  updatedAt: string;
};

type LlmCurationSuggestionDetail = LlmCurationSuggestionSummary & {
  rationale: string;
  suggestedDraft: LlmCurationProviderSuggestion["suggestedDraft"];
  supportingEvidence: LlmCurationProviderSuggestion["supportingEvidence"];
};
```

Stored suggestions contain redacted provenance and structured draft requests only. They never persist raw prompts, raw model responses, provider request payloads, provider response payloads, hidden policy instructions, provider credentials, authorization headers, cookies, CSRF tokens, session identifiers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.

### Commands

```ts
generateLlmCurationSuggestions(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  suggestionPolicyId: string;
  curatorInstruction?: string;
  coverageGapIds?: string[];
  contextEntityIds?: string[];
  allowedSuggestionKinds?: LlmCurationSuggestedCandidateKind[];
  maxSuggestions: number;
  idempotencyKey: string;
}) -> LlmCurationSuggestionResult<{
  suggestions: LlmCurationSuggestionSummary[];
}>

listLlmCurationSuggestions(input: {
  actingIdentityId: IdentityId;
  programId: ProgramId;
  status?: LlmCurationSuggestionStatus;
  suggestionKind?: LlmCurationSuggestedCandidateKind;
  limit?: number;
  cursor?: string;
}) -> LlmCurationSuggestionResult<{
  suggestions: LlmCurationSuggestionSummary[];
  nextCursor?: string;
}>

getLlmCurationSuggestion(input: {
  actingIdentityId: IdentityId;
  suggestionId: string;
}) -> LlmCurationSuggestionResult<{
  suggestion: LlmCurationSuggestionDetail;
}>

acceptLlmCurationSuggestion(input: {
  actingIdentityId: IdentityId;
  suggestionId: string;
}) -> LlmCurationSuggestionResult<{
  suggestion: LlmCurationSuggestionSummary;
  materializedCandidate: {
    candidateKind: LlmCurationSuggestedCandidateKind;
    candidateId: string;
  };
}>

rejectLlmCurationSuggestion(input: {
  actingIdentityId: IdentityId;
  suggestionId: string;
}) -> LlmCurationSuggestionResult<{
  suggestion: LlmCurationSuggestionSummary;
}>
```

`acceptLlmCurationSuggestion` materializes exactly one existing draft candidate record through the matching curation command. It does not accept that candidate into Corpus Storage. Accepted Program corpus changes still require the existing candidate acceptance command for the materialized candidate.

### HTTP endpoints

| Method | Path | Auth | Accepted response |
|---|---|---|---|
| `POST` | `/programs/{programId}/llm-curation-suggestions` | Program Curator session and CSRF header | `AcceptedResult<{ suggestions: LlmCurationSuggestionSummary[] }>` |
| `GET` | `/programs/{programId}/llm-curation-suggestions?status={status}&suggestionKind={kind}&limit={limit}&cursor={cursor}` | Program Curator session | `AcceptedResult<{ suggestions: LlmCurationSuggestionSummary[]; nextCursor?: string }>` |
| `GET` | `/llm-curation-suggestions/{suggestionId}` | Program Curator session | `AcceptedResult<{ suggestion: LlmCurationSuggestionDetail }>` |
| `POST` | `/llm-curation-suggestions/{suggestionId}/acceptance` | Program Curator session and CSRF header | `AcceptedResult<{ suggestion: LlmCurationSuggestionSummary; materializedCandidate: { candidateKind: LlmCurationSuggestedCandidateKind; candidateId: string } }>` |
| `POST` | `/llm-curation-suggestions/{suggestionId}/rejection` | Program Curator session and CSRF header | `AcceptedResult<{ suggestion: LlmCurationSuggestionSummary }>` |

## Behavior rules

1. Every command requires an active acting Identity.
2. Every command requires effective `Program Curator` participation for the Program.
3. Instance `Admin` authority alone does not satisfy the `Program Curator` requirement.
4. Student-only participation must be rejected with `program_curator_required`.
5. State-changing HTTP routes require a valid `X-Agonara-CSRF` header before request body parsing or mutation.
6. Generation requires a non-empty `suggestionPolicyId`, non-empty `idempotencyKey`, `maxSuggestions` from 1 through 20, and at least one of `curatorInstruction`, `coverageGapIds`, or `contextEntityIds`.
7. Generation rejects unknown Programs with `program_not_found`.
8. Generation resolves exactly one Curator Workspace-owned `LlmCurationSuggestionPolicy` by `suggestionPolicyId`.
9. Missing policies reject with `suggestion_policy_not_found`.
10. Policies with empty adapter ids, empty validator ids, empty redaction policy ids, empty allowed suggestion kinds, malformed prompt input policy, or non-`none` raw artifact policy reject with `validation_failed`.
11. Generation resolves exactly one provider adapter by the policy's `providerAdapterId`.
12. Missing provider adapters reject with `provider_adapter_not_found`.
13. `allowedSuggestionKinds` from input must be a non-empty subset of the policy's `allowedSuggestionKinds` when present.
14. `coverageGapIds` are validated against a fresh `inspectCuratorCoverageGaps` report for the same Program and rejected with `coverage_gap_not_found` when any requested gap is absent.
15. `contextEntityIds` must refer to accepted navigation entities, accepted check entities or revisions, or accepted readiness check entities or revisions in the same Program.
16. Prompt context may include accepted Program corpus metadata, accepted check metadata, accepted readiness metadata, current coverage-gap summaries, and the curator instruction.
17. Prompt context must not include Student Workspace attempts, submitted answers, readiness attempts, learner-state summaries, weak areas, progress labels, learning sessions, feedback, evaluator evidence, or student identity ids.
18. Provider requests must not include generated-by identity ids, accepted-by identity ids, candidate ids, answer keys from existing accepted checks, provider credentials, authorization headers, cookies, CSRF tokens, session identifiers, raw prompt transcripts, raw model responses, SQL text, stack traces, filesystem paths, database URLs, hidden policy instructions, or infrastructure details.
19. Provider adapters return structured `LlmCurationSuggestionProviderOutput` values only.
20. Thrown adapter failures and malformed adapter outputs reject generation with `provider_execution_failed` and create no suggestion records.
21. Provider usage is normalized before persistence.
22. Provider usage that exceeds the policy budget rejects generation with `provider_budget_exceeded` and creates no suggestion records.
23. Provider output must include `outputValidation` with the policy's `outputValidatorPolicyId` and `passed: true`.
24. Missing, malformed, mismatched, or failed output validation rejects generation with `provider_output_rejected` and creates no suggestion records.
25. Provider output must contain from 1 through `maxSuggestions` suggestions after validation.
26. Every provider suggestion must use an allowed suggestion kind, have non-empty title, summary, rationale, and at least one supporting evidence item.
27. Every provider suggestion's `suggestedDraft.request` must satisfy the validation rules of its matching draft candidate creation command before a suggestion record can be stored.
28. Suggestion storage creates only `draft_suggestion` LLM suggestion records; it must not create draft candidates, accepted candidates, accepted corpus revisions, target links, Student Workspace state, Program Membership state, Identity state, sessions, credentials, Admin authority, CSRF state, or domain audit/event records.
29. Equivalent generation retries with the same scoped idempotency key return the original suggestions without calling the provider adapter again.
30. Conflicting generation retries with the same scoped idempotency key reject with `validation_failed`.
31. Suggestion ids are opaque and stable.
32. Suggestion listing returns Program-scoped suggestions only and supports `status`, `suggestionKind`, `limit`, and cursor filters.
33. Suggestion listing orders by `createdAt` descending, then `suggestionId` ascending.
34. Suggestion detail returns the redacted origin, rationale, supporting evidence, and structured suggested draft only to effective Program Curators for the owning Program.
35. Suggestion detail, listing, and mutation hide unknown suggestions and cross-Program suggestions behind `llm_curation_suggestion_not_found`.
36. `acceptLlmCurationSuggestion` accepts only `draft_suggestion` records.
37. Accepting a suggestion calls exactly one matching draft candidate creation command with the stored `suggestedDraft.request`, the acting curator Identity, and the suggestion provenance.
38. Acceptance must not create accepted corpus content, accepted check revisions, accepted readiness revisions, Student Workspace state, Program Membership state, Identity state, sessions, credentials, Admin authority, CSRF state, or learner-state target links.
39. If materializing the draft candidate is rejected by the owning curation command, suggestion acceptance rejects with `suggestion_materialization_rejected`, keeps the suggestion in `draft_suggestion`, and creates no candidate.
40. Successful acceptance marks the suggestion `materialized`, stores the materialized candidate kind/id and curator attribution, and returns the materialized draft candidate reference.
41. Repeating acceptance for a materialized suggestion rejects with `llm_curation_suggestion_already_materialized`.
42. Accepting a rejected suggestion rejects with `llm_curation_suggestion_already_rejected`.
43. `rejectLlmCurationSuggestion` accepts only `draft_suggestion` records.
44. Successful rejection marks the suggestion `rejected`, records curator attribution, creates no candidate, and mutates no accepted corpus.
45. Repeating rejection for a rejected suggestion rejects with `llm_curation_suggestion_already_rejected`.
46. Rejecting a materialized suggestion rejects with `llm_curation_suggestion_already_materialized`.
47. Suggestion records and accepted responses must not expose raw prompts, raw model responses, provider request payloads, provider response payloads, provider diagnostics, hidden policy instructions, provider credentials, authorization headers, cookies, CSRF tokens, session identifiers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
48. Suggestion backup/export preserves suggestion records, status, redacted origin, suggested draft requests, supporting evidence, and materialized candidate references.
49. Suggestion backup/export excludes raw prompts, raw model responses, provider request payloads, provider response payloads, provider diagnostics, hidden policy instructions, credentials, sessions, CSRF tokens, cookies, SQL text, stack traces, filesystem paths, database URLs, and infrastructure details.
50. Restore validates suggestion Program ownership, status values, allowed suggestion kinds, required origin fields, supported draft request shapes, materialized candidate references, and redaction constraints before importing records.
51. Restore rejects materialized suggestions whose referenced candidate is missing, belongs to another Program, or has a mismatched candidate kind.
52. The `/learn` Curator UI may expose suggestion generation, list, detail, accept, and reject workflows only for effective Program Curators and must render origin/provenance without protected raw artifacts.
53. Curator Workspace must not own hard-coded external provider configuration or make direct network calls to provider services; composition may supply adapters that satisfy the Curator Workspace-owned provider protocol.
54. This spec does not add accepted corpus auto-promotion, Student Workspace reads, Student Workspace mutation, learner-state interpretation, Admin UI, Student UI, CLI commands, analytics, reporting, deployment targets, infrastructure ports, or provider-run observability dashboards.

## Product intent traceability

| Story | Coverage |
|---|---|
| CUR-11 - Use LLM assistance for program structuring | Generation captures provider output as `draft_suggestion` records with structured draft candidate requests. |
| CUR-12 - Review LLM suggestions | Listing, detail, acceptance, and rejection require explicit Program Curator actions; acceptance materializes a draft candidate rather than accepted corpus. |
| CUR-13 - Trace suggestion origin | Suggestions expose redacted origin, source ids, coverage gap ids, prompt context summary, rationale, and supporting evidence before acceptance. |
| INT-01 - Curator assembles accepted Program corpus from reviewed material | LLM output remains Curator Workspace draft material until the curator materializes a draft candidate and then separately accepts that candidate through existing curation rules. |

## Tests (required)

Validation and authorization:

1. Generation, listing, detail, acceptance, and rejection require an active Identity.
2. Student-only and Admin-only callers are rejected from every suggestion command.
3. State-changing HTTP routes reject missing/invalid CSRF before body parsing or mutation.
4. Generation rejects malformed policy ids, idempotency keys, `maxSuggestions`, allowed suggestion kinds, empty context, unsupported context ids, unknown Programs, and stale coverage gap ids.
5. Listing rejects malformed filters, limits, and cursors.

Policy, provider, and prompt context:

6. Generation resolves the Curator Workspace-owned suggestion policy and rejects missing or malformed policies.
7. Generation resolves the policy provider adapter and rejects missing adapters.
8. Provider requests include only permitted accepted-corpus, accepted-check, readiness, coverage-gap, policy, validator, and curator-instruction context.
9. Provider requests omit Student Workspace state, identity ids, existing answer keys, candidate ids, credentials, sessions, CSRF tokens, raw prompts, raw model responses, SQL text, stack traces, filesystem paths, database URLs, hidden policy instructions, and infrastructure details.
10. Thrown adapter failures and malformed adapter outputs reject generation with `provider_execution_failed` and create no suggestion records.
11. Provider budget overflow rejects generation with `provider_budget_exceeded` and creates no suggestion records.
12. Missing, failed, mismatched, or malformed output validation rejects generation with `provider_output_rejected` and creates no suggestion records.

Suggestion creation and idempotency:

13. Valid provider output creates only `draft_suggestion` records with redacted origin, rationale, supporting evidence, and structured draft requests.
14. Provider suggestions with unsupported kinds, empty fields, missing evidence, or draft requests invalid for their candidate command are rejected before storage.
15. Equivalent generation retries with the same scoped idempotency key return existing suggestions without calling the provider again.
16. Conflicting generation retries reject and create no new suggestions.
17. Suggestion creation does not mutate Corpus Storage accepted content, draft candidates, Student Workspace state, Program Membership, Identity, sessions, credentials, Admin authority, CSRF state, learner-evidence target links, or domain audit/event records.

Review, acceptance, and rejection:

18. Program Curators can list and inspect Program-scoped suggestions with deterministic ordering and redacted detail.
19. Unknown and cross-Program suggestion reads or mutations return `llm_curation_suggestion_not_found`.
20. Accepting a draft navigation suggestion materializes one navigation draft candidate and marks the suggestion `materialized`.
21. Accepting a draft Quick Check suggestion materializes one Quick Check draft candidate and marks the suggestion `materialized`.
22. Accepting a draft assessment criterion suggestion materializes one criterion draft candidate and marks the suggestion `materialized`.
23. Accepting a draft open-answer check suggestion materializes one open-answer check draft candidate and marks the suggestion `materialized`.
24. Accepting a draft readiness check suggestion materializes one readiness check draft candidate and marks the suggestion `materialized`.
25. Acceptance does not create accepted corpus, accepted checks, accepted readiness revisions, Student Workspace state, Program Membership state, Identity state, sessions, credentials, Admin authority, CSRF state, or learner-evidence target links.
26. Materialization rejection keeps the suggestion `draft_suggestion` and creates no candidate.
27. Repeating acceptance for a materialized suggestion rejects with `llm_curation_suggestion_already_materialized`.
28. Accepting a rejected suggestion rejects with `llm_curation_suggestion_already_rejected`.
29. Rejecting a draft suggestion marks it `rejected`, records curator attribution, creates no candidate, and mutates no accepted corpus.
30. Repeating rejection for a rejected suggestion rejects with `llm_curation_suggestion_already_rejected`.
31. Rejecting a materialized suggestion rejects with `llm_curation_suggestion_already_materialized`.

Backup, UI, and boundaries:

32. Backup/export preserves suggestion records, status, redacted origin, suggested draft requests, supporting evidence, and materialized candidate references.
33. Backup/export excludes raw prompts, raw model responses, provider request/response payloads, provider diagnostics, hidden policy instructions, credentials, sessions, CSRF tokens, cookies, SQL text, stack traces, filesystem paths, database URLs, and infrastructure details.
34. Restore rejects malformed suggestion status, malformed origin, unsupported kinds, invalid draft requests, unsafe raw artifacts, cross-Program candidate references, missing materialized candidates, and mismatched materialized candidate kinds.
35. HTTP responses, UI surfaces, logs, backups, and restored summaries exclude raw prompts, raw model responses, provider request/response payloads, provider diagnostics, credentials, sessions, CSRF tokens, cookies, SQL text, stack traces, filesystem paths, database URLs, and infrastructure details.
36. Browser tests cover generation with a fake provider, suggestion list/detail origin inspection, acceptance, rejection, protected-metadata redaction, and Student/Admin denial.
37. Absence tests prove no hard-coded external provider configuration inside Curator Workspace, direct provider network call from Curator Workspace, accepted corpus auto-promotion, Student Workspace read/mutation, learner-state interpretation, Admin UI, Student UI, CLI, analytics, reporting, deployment target, infrastructure port, or provider-run observability dashboard is introduced.

## Done criteria

- Curator Workspace owns the suggestion policy, provider adapter protocol, stored suggestion records, and review commands.
- Generation uses provider fakes in tests before any real provider configuration exists.
- Provider requests use accepted Program context and coverage gaps without Student Workspace state or protected operational data.
- Provider output is structured, budget-checked, and output-validated before any suggestion record is stored.
- Suggestion records preserve redacted origin and supporting evidence while excluding raw prompts, raw model responses, provider payloads, provider diagnostics, credentials, sessions, CSRF tokens, SQL text, stack traces, filesystem paths, database URLs, and infrastructure details.
- Program Curators can generate, list, inspect, accept, and reject suggestions through Curator Workspace and HTTP.
- Accepting a suggestion materializes exactly one draft candidate through an existing curation command and never creates accepted Program corpus directly.
- Rejected suggestions create no candidates and mutate no accepted Program corpus.
- Backup/restore preserves redacted suggestion records and validates materialized candidate references.
- `/learn` exposes Program Curator suggestion review workflows with origin inspection and protected-metadata redaction.
- Every behavior rule is covered by a listed test or executable browser/HTTP acceptance flow.
- Hard-coded external provider configuration inside Curator Workspace, direct provider network calls from Curator Workspace, accepted corpus auto-promotion, Student Workspace reads, Student Workspace mutation, learner-state interpretation, Admin UI, Student UI, CLI commands, analytics, reporting, deployment targets, infrastructure ports, and provider-run observability dashboards remain out of scope.

## Implementation status

Implemented by [LLM-Assisted Curation Suggestions Implementation Plan](../plans/implemented/llm-assisted-curation-suggestions.md).

Runtime evidence:

- [Suggestion storage, backup export, and restore validation](../../src/storage.js)
- [Curator Workspace suggestion policy, provider boundary, generation, review, and materialization](../../src/curator-workspace.js)
- [HTTP routes and deterministic first-slice provider composition](../../src/server.js)
- [`/learn` Program Curator suggestion UI](../../src/learn-ui.js)

Verification evidence:

- [Storage tests](../../tests/storage.test.js)
- [Backup/restore tests](../../tests/backup-restore.test.js)
- [Curator Workspace tests](../../tests/curator-workspace.test.js)
- [http-api-llm-suggestions.test.js](../../tests/http-api-llm-suggestions.test.js)
- [Executable HTTP acceptance tests](../../tests/executable-acceptance.test.js)
- [Suggestion browser tests](../../tests/llm-assisted-curation-suggestions.playwright.js)

The implemented first slice uses deterministic provider fakes supplied by composition. It does not add real provider credential management, direct provider network calls from Curator Workspace, provider observability dashboards, Student/Admin suggestion UI, or automatic accepted-corpus promotion. Accepting a suggestion materializes one draft candidate, and existing candidate acceptance remains the only path into accepted Program corpus.
