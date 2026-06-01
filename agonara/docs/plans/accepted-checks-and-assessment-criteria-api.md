---
date: 2026-06-01
model: gpt-5
description: "Implementation plan: Agonara accepted checks and assessment criteria HTTP API."
---

# Accepted Checks and Assessment Criteria HTTP API Implementation Plan

## Goal

Deliver the Agonara v0.0.1 HTTP API for Program-scoped accepted assessment criteria and accepted open-answer checks so browser clients can curate candidates, explicitly accept or reject them, and read current or historical accepted revisions through the existing session, CSRF, envelope, pagination, and redaction conventions.

This plan implements [Accepted Checks and Assessment Criteria API](../specs/accepted-checks-and-assessment-criteria-api.md), [Accepted Checks and Assessment Criteria First Slice](../specs/accepted-checks-and-assessment-criteria-first-slice.md), [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), and the accepted Corpus HTTP boundary from [Corpus Storage and Curator Acceptance API](../specs/corpus-storage-and-curator-acceptance-api.md). It exposes the implemented assessment corpus domain contract without introducing Admin UI, Curator UI, Student UI, CLI commands, Student Workspace attempts, scoring, feedback, LLM execution, or human review workflow.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push

## Execution lock

Worktree mode: create new
Expected worktree: `worktrees/agonara-assessment-api`
Expected branch: `codex/agonara-assessment-api`
Preflight check: [ ] done

## Scope guardrails

### In scope

- HTTP route adapters for every endpoint listed in [Accepted Checks and Assessment Criteria API](../specs/accepted-checks-and-assessment-criteria-api.md).
- Extension of the existing Corpus HTTP adapter over the implemented assessment methods on `corpusCommands`.
- Reuse of the existing `agonara_session` cookie and `X-Agonara-CSRF` contract.
- Reuse of existing accepted/rejected/fault envelopes, bounded list pagination, opaque cursors, JSON body classification, and redaction conventions.
- HTTP status mapping for assessment criterion, open-answer check, session, CSRF, and participation rejection reasons.
- Strict request validation for candidate creation, candidate acceptance, and candidate rejection.
- Curator-only candidate authoring routes and Student/Curator/Admin accepted-read routes.
- Executable HTTP and acceptance tests covering the API spec's required behavior.

### Out of scope

- Admin UI, Curator UI, Student UI, Program UI, or generated frontend artifacts.
- CLI commands.
- New assessment corpus domain behavior beyond the implemented command/query contract.
- Student Workspace attempts, submitted answers, selected answers, evaluation results, scoring, generated feedback, progress evidence, mastery state, weak-area state, review state, or learning history.
- Quick checks, topic-level checks, period-level checks, multiple-choice checks, grading workflows, classroom/cohort grading, analytics, or reporting.
- LLM prompt execution, model calls, evaluator orchestration, automated acceptance, or human review workflow.
- Material storage, source ingestion, scraping, licensing policy, source reliability scoring, or citation-format enforcement.
- Program Membership mutation, Program archival, Program deletion, Program ownership transfer, curator leave/removal, collaborative editing, branching, merging, or conflict resolution.
- Reworking Identity, Program, or existing Corpus HTTP routes except where shared helpers must recognize the assessment API's specified rejection reasons or preserve existing behavior.
- Replacing the existing server framework.

## ADR traceability matrix

| ADR | Invariant | Phase |
|---|---|---|
| ADR-007 | Other modules use effective participation rather than reading Program Membership internals. | Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7 |
| ADR-010 | Accepted Program corpus remains in Corpus Storage and crosses the explicit curator acceptance boundary. | Phase 2, Phase 3, Phase 5, Phase 6, Phase 8 |
| ADR-010 | Candidate material remains outside accepted corpus until explicit Program Curator acceptance. | Phase 2, Phase 3, Phase 5, Phase 6, Phase 8 |
| ADR-011 | Accepted assessment criteria and accepted checks are stable Program corpus revisions. | Phase 3, Phase 4, Phase 6, Phase 7, Phase 8 |
| ADR-011 | Accepted check revisions preserve the criterion revisions used at acceptance time. | Phase 6, Phase 7, Phase 8 |
| ADR-011 | Student-specific attempts, answers, evaluation results, feedback, mastery, weak areas, and progress evidence remain outside Corpus Storage. | Phase 7, Phase 8 |

## Product intent traceability

Student story rows below are prerequisite and boundary-preservation coverage only. This plan exposes accepted check and criterion revisions for a later Student Workspace slice; it does not deliver attempts, feedback, progress, mastery, or weak-area behavior.

| Story | Phase preserving intent |
|---|---|
| CUR-04 - Add checks and assessment items | Phase 5, Phase 6, Phase 7, Phase 8 |
| CUR-05 - Define assessment criteria | Phase 2, Phase 3, Phase 4, Phase 8 |
| CUR-06 - Keep accepted content separate from drafts | Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7, Phase 8 |
| CUR-10 - Update program after research | Phase 3, Phase 4, Phase 6, Phase 7, Phase 8 |
| CUR-13 - Trace suggestion origin | Phase 2, Phase 3, Phase 5, Phase 6, Phase 8 |
| STU-12 - Submit open answer | Phase 7, Phase 8 |
| STU-13 - Receive open-answer feedback | Phase 4, Phase 7, Phase 8 |
| INT-05 - Submit an open answer and receive feedback tied to accepted criteria | Phase 4, Phase 7, Phase 8 |

## TDD and commit discipline

Every implementation phase must use strict TDD:

- Add or update one focused failing HTTP or executable acceptance test at a time.
- Run the targeted Agonara test command and capture a RED assertion failure. Compilation errors are not RED.
- Implement the minimum production change that turns that assertion GREEN.
- Repeat RED/GREEN until the phase objective is complete.
- Run the phase validation gates.
- Commit only files tied to the phase after GREEN gates pass.
- Self-review the phase against this plan, the API spec, and the ADR invariants before advancing. Fix fail/warn findings immediately, rerun the phase gates, and commit the fix.

Each phase has its own local commit. Do not bundle unrelated phase work into one commit.

## Phase 1 — Assessment HTTP substrate

**Objective**: establish assessment route dispatch and shared transport behavior by extending the existing Corpus HTTP adapter without changing domain policy.

**Key work items**:

- Extend the existing Corpus HTTP handler with assessment route recognition before its unhandled return path.
- Reuse the composed `corpusCommands`; do not introduce a parallel assessment command container.
- Reuse existing session resolution, CSRF enforcement, accepted/rejected/fault envelopes, bounded list query parsing, opaque cursors, and JSON body classification.
- Extend HTTP status mapping for assessment-specific reasons, including delegated `identity_not_active`.
- Prove existing Identity, Program, and Corpus HTTP behavior remains unchanged.

**TDD sequence**:

1. RED/GREEN `GET /programs/{programId}/assessment-criteria` without a session returns `401 session_not_found`.
2. RED/GREEN `GET /programs/{programId}/open-answer-checks` with a disabled session Identity returns `403 identity_disabled`.
3. RED/GREEN the assessment handler delegates through the existing `corpusCommands` dependency without changing existing route behavior.
4. RED/GREEN assessment reason mapping returns the API-specified representative `403`, `404`, and `409` statuses, including `403 identity_not_active`.
5. RED/GREEN assessment list query parsing defaults `limit` to `50`, rejects invalid limits, and rejects malformed or route-mismatched cursors with `400 validation_failed`.
6. RED/GREEN assessment body parsing distinguishes missing, malformed, non-object, empty-object, supported-object, and unsupported-field cases for later route tests.

**Dependencies**: existing Identity session API, Program API, Corpus HTTP adapter, and implemented assessment methods on `corpusCommands`.

**Risks**: shared-helper changes could regress existing Identity, Program, or Corpus behavior. Keep assessment routing additive and run the existing HTTP suite after each helper change.

**Validation**:

- Targeted HTTP tests for assessment route dispatch and shared transport behavior.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 1 tests pass, full Node gates pass, and local commit `wire agonara assessment api substrate` is created.

## Phase 2 — Assessment criterion candidate routes

**Objective**: implement curator-only criterion candidate listing and creation while preserving draft isolation from accepted criterion reads.

**Key work items**:

- Implement `GET /programs/{programId}/assessment-criteria/candidates?status={status}&limit={limit}&cursor={cursor}`.
- Implement `POST /programs/{programId}/assessment-criteria/candidates`.
- Map domain results to `AssessmentCriterionCandidateList` and `{ assessmentCriterionCandidate }`.
- Require effective Program Curator participation for reads and writes.
- Require CSRF on creation before domain mutation.
- Accept only `draft`, `accepted`, and `rejected` status filters.
- Reject malformed JSON, non-object JSON, missing bodies, unsupported fields, invalid title/body/rationale values, malformed `sourceIds`, unknown sources, and cross-Program sources with the specified reasons.

**TDD sequence**:

1. RED/GREEN candidate listing accepts an effective Program Curator and returns only candidates scoped to the requested Program.
2. RED/GREEN candidate listing applies supported status filters and rejects unsupported filters, invalid limits, and malformed cursors.
3. RED/GREEN candidate listing rejects Students, Admin-without-curator, and other non-curators with `403 admin_or_curator_required`.
4. RED/GREEN candidate creation rejects missing or invalid CSRF before domain mutation.
5. RED/GREEN accepted candidate creation returns a `draft` candidate and creates no accepted criterion revision.
6. RED/GREEN invalid candidate creation bodies reject with `400 validation_failed`.
7. RED/GREEN candidate creation maps unknown and cross-Program source ids to the specified `409` reasons.
8. RED/GREEN candidate listing and creation reject unknown Program path ids with `404 program_not_found`.

**Dependencies**: Phase 1.

**Risks**: route-level filtering can accidentally expose candidates across Programs or treat draft candidates as accepted criteria. Keep Program scoping and accepted-read absence assertions in focused tests.

**Validation**:

- Targeted HTTP tests for criterion candidate list/create routes.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 2 tests pass, full Node gates pass, and local commit `implement agonara criterion candidate api` is created.

## Phase 3 — Assessment criterion acceptance and rejection routes

**Objective**: implement explicit criterion acceptance and rejection with CSRF, strict body rules, target validation, and historical revision preservation.

**Key work items**:

- Implement `POST /assessment-criteria/candidates/{candidateId}/acceptance`.
- Implement `POST /assessment-criteria/candidates/{candidateId}/rejection`.
- Map domain results to `{ acceptedAssessmentCriterion }` and `{ assessmentCriterionCandidate }`.
- Require CSRF before domain mutation on both routes.
- Allow acceptance with a missing body, empty object, or object containing only optional `targetEntityId`.
- Reject malformed JSON, non-object JSON, unsupported fields, and malformed `targetEntityId` values with `400 validation_failed`.
- Allow rejection with a missing body and reject malformed or non-empty JSON bodies with `400 validation_failed`.
- Preserve acceptance into a new entity and acceptance into an existing entity as a new current revision while retaining historical revisions.

**TDD sequence**:

1. RED/GREEN acceptance accepts a Program Curator for the candidate Program and returns `AcceptedAssessmentCriterionSummary`.
2. RED/GREEN acceptance without `targetEntityId` creates one accepted entity and current revision.
3. RED/GREEN acceptance with `targetEntityId` creates a new current revision and preserves the previous historical revision.
4. RED/GREEN acceptance rejects malformed JSON, non-object JSON, unsupported fields, and malformed `targetEntityId` values with `400 validation_failed`.
5. RED/GREEN acceptance maps unknown candidate, already accepted, already rejected, unknown target, cross-Program target, and non-curator cases to the specified statuses.
6. RED/GREEN rejection accepts a Program Curator and returns the rejected candidate.
7. RED/GREEN rejection accepts a missing body and rejects malformed or non-empty JSON bodies with `400 validation_failed`.
8. RED/GREEN rejection maps unknown candidate, already accepted, already rejected, and non-curator cases to the specified statuses.
9. RED/GREEN rejection does not delete accepted criterion revisions.

**Dependencies**: Phase 2.

**Risks**: acceptance body parsing differs from candidate creation and rejection parsing. Keep each body category explicit in route tests so malformed input cannot silently become an empty object.

**Validation**:

- Targeted HTTP tests for criterion acceptance and rejection routes.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 3 tests pass, full Node gates pass, and local commit `implement agonara criterion acceptance api` is created.

## Phase 4 — Accepted assessment criterion read routes

**Objective**: expose current and historical accepted criterion revisions to authorized Students, Program Curators, and Admins without exposing draft or rejected candidates.

**Key work items**:

- Implement `GET /programs/{programId}/assessment-criteria?limit={limit}&cursor={cursor}`.
- Implement `GET /assessment-criteria/revisions/{revisionId}`.
- Map domain results to `AcceptedAssessmentCriterionList` and `{ acceptedAssessmentCriterion }`.
- Accept effective Student, effective Program Curator, and effective Admin callers.
- Reject callers without accepted-read access with `403 participation_required`.
- Return only current accepted revisions on list routes and preserve historical revision lookup by revision id.
- Apply bounded pagination and opaque cursors to accepted criterion list routes.

**TDD sequence**:

1. RED/GREEN accepted criterion listing accepts Student, Program Curator, and Admin callers.
2. RED/GREEN accepted criterion listing rejects unauthorized callers with `403 participation_required`.
3. RED/GREEN listing returns only current revisions scoped to the requested Program and excludes draft or rejected candidates.
4. RED/GREEN listing defaults `limit` to `50` and rejects invalid limits or malformed cursors.
5. RED/GREEN historical revision lookup returns addressable old revisions for authorized callers.
6. RED/GREEN historical revision lookup rejects unknown revisions with `404 criterion_revision_not_found` and unauthorized callers with `403 participation_required`.
7. RED/GREEN accepted criterion listing rejects unknown Program path ids with `404 program_not_found`.

**Dependencies**: Phase 3.

**Risks**: historical revision routes have no Program id in their path, so authorization must resolve through the revision's Program after existence resolution. Keep unknown-revision and unauthorized-caller tests separate.

**Validation**:

- Targeted HTTP tests for accepted criterion list and historical revision routes.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 4 tests pass, full Node gates pass, and local commit `implement agonara accepted criterion api` is created.

## Phase 5 — Open-answer check candidate routes

**Objective**: implement curator-only open-answer check candidate listing and creation with criterion-entity validation and draft isolation.

**Key work items**:

- Implement `GET /programs/{programId}/open-answer-checks/candidates?status={status}&limit={limit}&cursor={cursor}`.
- Implement `POST /programs/{programId}/open-answer-checks/candidates`.
- Map domain results to `OpenAnswerCheckCandidateList` and `{ openAnswerCheckCandidate }`.
- Require effective Program Curator participation for reads and writes.
- Require CSRF on creation before domain mutation.
- Accept only `open_answer` checks and supported status filters.
- Reject malformed JSON, non-object JSON, missing bodies, unsupported fields, invalid title/prompt/rationale values, malformed source arrays, malformed or empty criterion arrays, unknown sources, cross-Program sources, unknown criterion entities, and cross-Program criterion entities with the specified reasons.

**TDD sequence**:

1. RED/GREEN candidate listing accepts an effective Program Curator and returns only checks scoped to the requested Program.
2. RED/GREEN candidate listing applies supported status filters and rejects unsupported filters, invalid limits, and malformed cursors.
3. RED/GREEN candidate listing rejects Students, Admin-without-curator, and other non-curators with `403 admin_or_curator_required`.
4. RED/GREEN candidate creation rejects missing or invalid CSRF before domain mutation.
5. RED/GREEN accepted candidate creation returns a `draft` open-answer check and creates no accepted check revision.
6. RED/GREEN invalid candidate creation bodies reject with `400 validation_failed`.
7. RED/GREEN candidate creation maps unknown and cross-Program source or criterion references to the specified `404` and `409` reasons.
8. RED/GREEN candidate listing and creation reject unknown Program path ids with `404 program_not_found`.

**Dependencies**: Phase 4.

**Risks**: open-answer checks depend on accepted criterion entities. Run criterion-route tests alongside check-route tests so a check adapter cannot accidentally bind draft criterion data or cross-Program references.

**Validation**:

- Targeted HTTP tests for open-answer check candidate list/create routes.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 5 tests pass, full Node gates pass, and local commit `implement agonara check candidate api` is created.

## Phase 6 — Open-answer check acceptance and rejection routes

**Objective**: implement explicit open-answer check acceptance and rejection with CSRF, strict body rules, stable revision replacement, and criterion-revision snapshot preservation.

**Key work items**:

- Implement `POST /open-answer-checks/candidates/{candidateId}/acceptance`.
- Implement `POST /open-answer-checks/candidates/{candidateId}/rejection`.
- Map domain results to `{ acceptedOpenAnswerCheck }` and `{ openAnswerCheckCandidate }`.
- Require CSRF before domain mutation on both routes.
- Apply the same acceptance and rejection body rules established for criteria.
- Preserve acceptance into a new entity and replacement acceptance into an existing entity.
- Preserve the accepted check revision's snapped `criterionRevisionIds` after later criterion revisions.

**TDD sequence**:

1. RED/GREEN acceptance accepts a Program Curator for the candidate Program and returns `AcceptedOpenAnswerCheckSummary`.
2. RED/GREEN acceptance without `targetEntityId` creates one accepted entity and current revision.
3. RED/GREEN acceptance snapshots current criterion revision ids.
4. RED/GREEN acceptance with `targetEntityId` creates a new current revision and preserves the previous historical revision.
5. RED/GREEN acceptance rejects malformed JSON, non-object JSON, unsupported fields, and malformed `targetEntityId` values with `400 validation_failed`.
6. RED/GREEN acceptance maps unknown candidate, already accepted, already rejected, unknown target, cross-Program target, and non-curator cases to the specified statuses.
7. RED/GREEN rejection accepts a Program Curator and returns the rejected candidate.
8. RED/GREEN rejection accepts a missing body and rejects malformed or non-empty JSON bodies with `400 validation_failed`.
9. RED/GREEN rejection maps unknown candidate, already accepted, already rejected, and non-curator cases to the specified statuses.
10. RED/GREEN rejection does not delete accepted check revisions or criterion revision references.

**Dependencies**: Phase 5.

**Risks**: replacing a current criterion after check acceptance could accidentally rewrite historical check interpretation. Prove criterion revision snapshot preservation in the acceptance route tests rather than deferring it to closeout.

**Validation**:

- Targeted HTTP tests for open-answer check acceptance and rejection routes.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 6 tests pass, full Node gates pass, and local commit `implement agonara check acceptance api` is created.

## Phase 7 — Accepted open-answer check reads and boundary guards

**Objective**: expose current and historical accepted open-answer check revisions with bounded reads, redaction, and explicit Student Workspace exclusion.

**Key work items**:

- Implement `GET /programs/{programId}/open-answer-checks?limit={limit}&cursor={cursor}`.
- Implement `GET /open-answer-checks/revisions/{revisionId}`.
- Map domain results to `AcceptedOpenAnswerCheckList` and `{ acceptedOpenAnswerCheck }`.
- Accept effective Student, effective Program Curator, and effective Admin callers.
- Reject callers without accepted-read access with `403 participation_required`.
- Return only current accepted revisions on list routes and preserve historical revision lookup by revision id.
- Verify responses, cursors, and faults do not expose password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
- Verify out-of-scope UI, CLI, Student Workspace, scoring, feedback, LLM, review, and additional check-type HTTP surfaces remain absent.

**TDD sequence**:

1. RED/GREEN accepted check listing accepts Student, Program Curator, and Admin callers.
2. RED/GREEN accepted check listing rejects unauthorized callers with `403 participation_required`.
3. RED/GREEN listing returns only current revisions scoped to the requested Program and excludes draft or rejected candidates.
4. RED/GREEN listing defaults `limit` to `50` and rejects invalid limits or malformed cursors.
5. RED/GREEN historical revision lookup returns addressable old revisions for authorized callers.
6. RED/GREEN historical revision lookup rejects unknown revisions with `404 check_revision_not_found` and unauthorized callers with `403 participation_required`.
7. RED/GREEN a check revision remains linked to the original criterion revision after the accepted criterion is revised.
8. RED/GREEN assessment API responses, cursors, and faults satisfy redaction rules.
9. RED/GREEN out-of-scope HTTP routes remain unavailable.
10. RED/GREEN accepted check listing rejects unknown Program path ids with `404 program_not_found`.

**Dependencies**: Phase 6.

**Risks**: accepted check reads are a prerequisite for later Student Workspace work, but this phase must not introduce student attempt or evaluation state. Keep route-absence guards explicit.

**Validation**:

- Targeted HTTP tests for accepted check reads, historical revisions, redaction, and out-of-scope guards.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 7 tests pass, full Node gates pass, and local commit `implement agonara accepted check api` is created.

## Phase 8 — Executable acceptance and closeout

**Objective**: prove the complete assessment corpus HTTP slice through an end-to-end browser-client flow, update traceability, and archive this plan in the same change set.

**Key work items**:

- Add or extend executable HTTP acceptance coverage for the complete logged-in flow from the API spec.
- Verify CSRF enforcement across all state-changing assessment requests.
- Verify criterion-to-check provenance, historical revision access, and criterion-revision snapshot preservation.
- Verify accepted criteria and checks are readable by an authorized Student while draft and rejected candidates remain excluded.
- Verify no Student Workspace, scoring, feedback, LLM, human review, UI, or CLI surface is introduced.
- Update `agonara/docs/log.md`.
- Update [Product Intent](../intent_learning_program_app.md) downstream traceability from active implementation plan to implemented plan and HTTP code/tests.
- Move this plan to `agonara/docs/plans/implemented/accepted-checks-and-assessment-criteria-api.md` with `git mv`.
- Rewrite this plan's relative Markdown links for the `plans/implemented/` depth and verify every local link target after the move.

**TDD sequence**:

1. RED/GREEN executable acceptance flow: a logged-in Program Curator creates a Program, records a source, creates and accepts a criterion, creates and accepts an open-answer check linked to that criterion, revises the criterion, verifies the accepted check revision still points at the original criterion revision, lists accepted criteria and checks as a Student, fetches historical revisions, rejects separate draft candidates, and confirms draft/rejected candidates remain absent from accepted reads.
2. RED/GREEN closeout guard checks for CSRF enforcement and out-of-scope route absence if earlier focused tests do not already prove them.

**Dependencies**: Phase 7.

**Risks**: executable coverage can duplicate focused edge-case tests and become brittle. Keep the closeout flow broad and behavioral; keep invalid-body, status-mapping, pagination, and authorization edge cases in earlier phases.

**Validation**:

- Targeted executable HTTP acceptance test.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- Docs structure/link checks for touched Markdown.
- `git status --short` clean after final commit.

**Completion signal**: executable acceptance and final gates pass, Product Intent traceability points at implemented HTTP code/tests, the plan is archived under `implemented/`, and local commit `complete agonara assessment api` is created.

## Done criteria

- Every endpoint in [Accepted Checks and Assessment Criteria API](../specs/accepted-checks-and-assessment-criteria-api.md) is implemented.
- Every assessment API response uses the shared `accepted`, `rejected`, or `fault` envelope.
- Session and CSRF behavior matches the existing Identity, Program, and Corpus HTTP conventions.
- All state-changing assessment routes reject session and CSRF failures before domain mutation.
- Criterion candidate, criterion acceptance/rejection, accepted criterion read, check candidate, check acceptance/rejection, and accepted check read routes satisfy their specified status mappings.
- Criterion and check list pagination is bounded, cursors are opaque, invalid cursors reject with `400 validation_failed`, and cursors do not expose secrets or infrastructure details.
- Candidate creation, acceptance, and rejection body rules are covered explicitly, including malformed JSON, non-object JSON, unsupported fields, missing bodies where required, and malformed `targetEntityId` values.
- Accepted check revisions preserve the criterion revision ids snapped at acceptance time after later criterion updates.
- Responses, cursors, and faults satisfy redaction rules for secrets, session identifiers, CSRF tokens, credentials, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, and infrastructure details.
- Every required test in the API spec is covered by focused HTTP tests or the executable acceptance flow.
- Each implementation phase has a separate local commit created only after targeted tests, Agonara workspace tests, repo tests, and typecheck pass.
- Product Intent traceability is updated during closeout.
- Final branch state is clean after closeout.
- No Admin UI, Curator UI, Student UI, Program UI, CLI commands, Student Workspace attempts, submitted answers, selected answers, scoring, generated feedback, mastery state, weak-area state, progress evidence, LLM execution, human review workflow, or additional check-type behavior is introduced.

## Final closeout

Final gates: `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`, `./scripts/run_silent.sh "tests" npm test`, `./scripts/run_silent.sh "build" npx tsc --noEmit`, docs structure/link checks for touched Markdown, and `git status --short` clean.
Archive plan: move to `agonara/docs/plans/implemented/accepted-checks-and-assessment-criteria-api.md`, rewrite its relative Markdown links for the archived depth, and verify all local link targets.
Commit archive move: yes.
Push/PR: follow push policy; do not push unless explicitly requested later.
