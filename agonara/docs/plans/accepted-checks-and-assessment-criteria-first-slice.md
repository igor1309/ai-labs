---
date: 2026-05-28
model: gpt-5
description: "Implementation plan: Agonara accepted checks and assessment criteria first slice."
---

# Accepted Checks and Assessment Criteria First Slice Implementation Plan

## Goal

Deliver the Agonara v0.0.1 backend domain contract for Program-scoped accepted assessment criteria and accepted open-answer checks as versioned Program corpus, with curator-owned candidate state before acceptance.

This plan implements [Accepted Checks and Assessment Criteria First Slice](../specs/accepted-checks-and-assessment-criteria-first-slice.md), [ADR-011](../adr/adr-011-accepted-checks-and-student-assessment-boundary.md), [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md), and the effective participation contract from [ADR-007](../adr/adr-007-effective-participation-authorization-contract.md). It must preserve INT-05 from [Product Intent](../intent_learning_program_app.md) by making accepted criteria and open-answer checks addressable without introducing student attempts or feedback in this slice.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push

## Execution lock

Worktree mode: create new
Expected worktree: `worktrees/agonara-accepted-checks-first-slice`
Expected branch: `codex/agonara-accepted-checks-first-slice`
Preflight check: [ ] done

## Scope guardrails

### In scope

- Storage records and helpers for assessment criterion candidates, accepted assessment criterion entities, accepted assessment criterion revisions, open-answer check candidates, accepted open-answer check entities, and accepted open-answer check revisions.
- A domain command/query boundary for the interface in [Accepted Checks and Assessment Criteria First Slice](../specs/accepted-checks-and-assessment-criteria-first-slice.md).
- Effective Program Curator authorization for all candidate creation, candidate listing, acceptance, and rejection commands.
- Effective Student, Program Curator, or Admin authorization for accepted criterion and accepted open-answer check read queries.
- Candidate lifecycle states `draft`, `accepted`, and `rejected`.
- Acceptance into new accepted entities and acceptance into existing entities as new current revisions.
- Stable historical accepted criterion and open-answer check revisions.
- Open-answer check acceptance that snapshots current accepted criterion revision ids from referenced criterion entities.
- Program-scoped source, criterion, and check reference validation.
- Backup/restore coverage for the new persistent records and revision graph invariants.
- Redaction coverage for all new accepted assessment response shapes and rejection results.
- Executable acceptance coverage for the full criterion-to-check lifecycle.

### Out of scope

- Admin UI, Curator UI, Student UI, Program UI, HTTP routes, CLI commands, or generated frontend artifacts.
- Quick checks, topic-level checks, period-level checks, multiple-choice checks, grading workflows, classroom/cohort grading, analytics, or reporting.
- Student Workspace attempts, submitted answers, selected answers, evaluation results, feedback, progress evidence, mastery state, weak-area state, review state, or learning history.
- Assessment scoring, rubric scoring, evaluator orchestration, human review workflow, LLM prompt execution, model calls, or generated feedback.
- Material file storage, source ingestion jobs, scraping, copying, licensing policy, citation-format enforcement, or source reliability scoring.
- Program archival, Program deletion, Program ownership transfer, collaborative editing, branching, merging, conflict resolution, curator invitations, or Program Membership mutation.
- Reworking Identity, Program shell, Program Membership, existing Corpus topic/concept behavior, existing Corpus HTTP routes, or existing backup/restore behavior beyond adding the new assessment records.

### ADR traceability matrix

| ADR | Invariant | Phase |
|---|---|---|
| ADR-007 | Other modules use effective participation instead of reading Program Membership internals. | Phase 2, Phase 3, Phase 4 |
| ADR-010 | Accepted Program corpus belongs to Corpus Storage and is stable by Program scope. | Phase 1, Phase 2, Phase 3, Phase 5 |
| ADR-010 | Candidate material remains outside accepted corpus until explicit curator acceptance. | Phase 2, Phase 3, Phase 5 |
| ADR-011 | Accepted checks and assessment criteria live in Corpus Storage as accepted Program corpus. | Phase 1, Phase 2, Phase 3, Phase 5 |
| ADR-011 | Student attempts, answers, feedback, progress, mastery, and weak areas remain Student Workspace state. | Phase 4, Phase 5 |
| ADR-011 | Student Workspace must reference accepted check and criterion revisions later instead of copying corpus ownership. | Phase 3, Phase 5 |
| ADR-011 | Updating accepted criteria must not rewrite already accepted check revisions. | Phase 3, Phase 5 |

### Product intent traceability

Student story rows below are prerequisite and boundary-preservation coverage only. This plan makes accepted check and criterion revisions available for later Student Workspace behavior; it does not deliver student attempts, feedback, progress, mastery, or weak-area behavior.

| Story | Phase preserving intent |
|---|---|
| CUR-04 - Add checks and assessment items | Phase 3, Phase 5 |
| CUR-05 - Define assessment criteria | Phase 2, Phase 3, Phase 5 |
| CUR-06 - Keep accepted content separate from drafts | Phase 2, Phase 3, Phase 5 |
| CUR-10 - Update program after research | Phase 2, Phase 3 |
| CUR-13 - Trace suggestion origin | Phase 2, Phase 3 |
| STU-12 - Submit open answer | Phase 3, Phase 4 |
| STU-13 - Receive open-answer feedback | Phase 3, Phase 4 |
| INT-05 - Submit an open answer and receive feedback tied to accepted criteria | Phase 3, Phase 4, Phase 5 |

### TDD and commit discipline

Every implementation phase must use strict TDD:

- Add or update one focused failing test at a time.
- Run the targeted Agonara test command and capture a RED assertion failure. Compilation errors are not RED.
- Implement the minimum production change that turns that assertion GREEN.
- Repeat RED/GREEN until the phase objective is complete.
- Run the phase validation gates.
- Commit only the files tied to that phase after GREEN gates pass.
- Self-review the phase against this plan, the spec, and the ADR invariants before advancing. Fix fail/warn findings immediately, rerun the phase gates, and commit the fix.

Each phase has its own local commit. Do not bundle unrelated phase work into one commit.

## Phase 1 — Assessment corpus persistence substrate

**Objective**: add storage-level persistence for criterion and open-answer check candidate, entity, and revision records without exposing domain commands yet.

**Key work items**:

- Add storage schema for assessment criterion candidates, accepted assessment criterion entities, accepted assessment criterion revisions, open-answer check candidates, accepted open-answer check entities, and accepted open-answer check revisions.
- Add storage create/get/list/update helpers for the new records.
- Enforce structural Program scoping for candidates, entities, revisions, sources, and criterion references.
- Preserve accepted entity current-revision integrity and historical revision addressability.
- Keep storage helpers structural. Authorization, lifecycle transitions, and candidate policy remain in the domain service.

**TDD sequence**:

1. RED/GREEN storage creates and lists assessment criterion candidates scoped by Program and status.
2. RED/GREEN storage creates accepted criterion entities and accepted criterion revisions with current-revision linkage.
3. RED/GREEN storage preserves historical criterion revisions after a newer current revision is linked.
4. RED/GREEN storage creates and lists open-answer check candidates scoped by Program and status.
5. RED/GREEN storage creates accepted open-answer check entities and accepted check revisions with current-revision linkage.
6. RED/GREEN storage persists criterion revision references on accepted open-answer check revisions.
7. RED/GREEN storage rejects accepted entity/current revision graph breaks for criterion and check records.

**Dependencies**: existing SQLite storage initialization, Program shell storage helpers, and Program source storage helpers.

**Risks**: embedding authorization or acceptance policy inside storage would make later lifecycle tests brittle. The implementation must keep storage policy-neutral and prove only structural invariants here.

**Validation**:

- Targeted storage tests for assessment candidate, entity, revision, and graph-integrity behavior.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 1 storage tests pass, full Node gates pass, and local commit `add agonara assessment corpus storage` is created.

## Phase 2 — Assessment criterion candidate lifecycle

**Objective**: implement curator-owned assessment criterion candidate creation, listing, acceptance, rejection, accepted criterion reads, and historical criterion revision lookup.

**Key work items**:

- Add or extend the Corpus Storage command/query boundary for accepted assessment criteria, composed with the shared database and existing effective participation function.
- Implement `createAssessmentCriterionCandidate`.
- Implement `listAssessmentCriterionCandidates`.
- Implement `acceptAssessmentCriterionCandidate`.
- Implement `rejectAssessmentCriterionCandidate`.
- Implement `listAcceptedAssessmentCriteria`.
- Implement `getAcceptedAssessmentCriterionRevision`.
- Validate criterion title/body, optional source ids, optional rationale, candidate status filters, target entity ids, and Program ownership.
- Enforce effective Program Curator participation for candidate creation, candidate listing, acceptance, and rejection.
- Enforce effective Student, Program Curator, or Admin access for accepted criterion reads.
- Preserve candidate/source/rationale provenance and acting Identity attribution on accepted revisions.

**TDD sequence**:

1. RED/GREEN criterion candidate creation accepts an effective Program Curator and returns a `draft` candidate.
2. RED/GREEN criterion candidate creation rejects inactive identities, unknown Programs, non-curators, invalid title/body values, unknown sources, and cross-Program sources with the spec reasons.
3. RED/GREEN criterion candidate listing is curator-only, Program-scoped, and applies `draft`, `accepted`, and `rejected` filters.
4. RED/GREEN criterion candidate listing rejects unsupported status filters with `validation_failed`.
5. RED/GREEN criterion acceptance without `targetEntityId` creates a new accepted criterion entity and one current revision.
6. RED/GREEN criterion acceptance with `targetEntityId` creates a new current revision and keeps the previous revision addressable.
7. RED/GREEN criterion acceptance rejects unknown, already accepted, already rejected, unknown target, and cross-Program target cases with the specified reasons.
8. RED/GREEN criterion rejection marks a draft candidate rejected and creates no accepted criterion entity or revision.
9. RED/GREEN accepted criterion listing accepts Student, Program Curator, and Admin callers and rejects unauthorized callers.
10. RED/GREEN accepted criterion listing returns only current accepted criterion revisions for the requested Program.
11. RED/GREEN historical criterion revision lookup returns old revisions and rejects unknown revisions with `criterion_revision_not_found`.
12. RED/GREEN criterion responses and rejection results satisfy the redaction rules.

**Dependencies**: Phase 1 and existing Program effective participation behavior.

**Risks**: Admin authority can read accepted criteria but must not become an ordinary authoring path. Tests must prove Admin-without-curator can read accepted criteria and cannot create, accept, or reject candidates.

**Validation**:

- Targeted Corpus Storage domain tests for criterion candidate lifecycle and accepted criterion reads.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 2 criterion tests pass, full Node gates pass, and local commit `implement agonara assessment criteria` is created.

## Phase 3 — Open-answer check candidate lifecycle

**Objective**: implement curator-owned open-answer check candidate creation, listing, acceptance, rejection, accepted check reads, historical check revision lookup, and criterion-revision snapshotting.

**Key work items**:

- Implement `createOpenAnswerCheckCandidate`.
- Implement `listOpenAnswerCheckCandidates`.
- Implement `acceptOpenAnswerCheckCandidate`.
- Implement `rejectOpenAnswerCheckCandidate`.
- Implement `listAcceptedOpenAnswerChecks`.
- Implement `getAcceptedOpenAnswerCheckRevision`.
- Validate `checkKind`, title, prompt, optional source ids, required criterion entity ids, optional rationale, candidate status filters, target entity ids, and Program ownership.
- Require at least one accepted assessment criterion entity reference for open-answer check candidates.
- Reject unknown and cross-Program criterion entity references.
- Snapshot current accepted criterion revision ids when an open-answer check revision is accepted.
- Preserve accepted check revisions when referenced criteria are later revised.

**TDD sequence**:

1. RED/GREEN open-answer check candidate creation accepts an effective Program Curator and returns a `draft` candidate.
2. RED/GREEN open-answer check candidate creation rejects inactive identities, unknown Programs, non-curators, invalid title/prompt values, unsupported check kinds, invalid source references, and missing/empty/non-array criterion references.
3. RED/GREEN open-answer check candidate creation rejects unknown and cross-Program criterion entities with the spec reasons.
4. RED/GREEN open-answer check candidate listing is curator-only, Program-scoped, and applies `draft`, `accepted`, and `rejected` filters.
5. RED/GREEN open-answer check candidate listing rejects unsupported status filters with `validation_failed`.
6. RED/GREEN check acceptance without `targetEntityId` creates a new accepted open-answer check entity and one current revision.
7. RED/GREEN check acceptance snapshots current accepted criterion revision ids for every referenced criterion entity.
8. RED/GREEN revising a criterion after check acceptance does not rewrite the accepted check revision's criterion revision references.
9. RED/GREEN check acceptance with `targetEntityId` creates a new current check revision and keeps the previous check revision addressable.
10. RED/GREEN check acceptance rejects unknown, already accepted, already rejected, unknown target, and cross-Program target cases with the specified reasons.
11. RED/GREEN check rejection marks a draft candidate rejected and creates no accepted check entity or revision.
12. RED/GREEN accepted open-answer check listing accepts Student, Program Curator, and Admin callers and rejects unauthorized callers.
13. RED/GREEN accepted open-answer check listing returns only current accepted check revisions for the requested Program.
14. RED/GREEN historical check revision lookup returns old revisions and rejects unknown revisions with `check_revision_not_found`.
15. RED/GREEN check responses and rejection results satisfy the redaction rules.

**Dependencies**: Phase 2.

**Risks**: accepting checks by criterion entity id without snapshotting revision ids would let later criterion edits silently change historical check meaning. The phase must make criterion revision snapshots an asserted invariant, not an incidental field.

**Validation**:

- Targeted Corpus Storage domain tests for open-answer check candidate lifecycle, acceptance, accepted reads, and revision snapshotting.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 3 open-answer check tests pass, full Node gates pass, and local commit `implement agonara open answer checks` is created.

## Phase 4 — Boundary hardening and Student Workspace exclusion

**Objective**: prove the first slice exposes only accepted corpus and curator candidate state while leaving Student Workspace assessment execution, attempts, feedback, progress, mastery, and weak areas unimplemented.

**Key work items**:

- Add or extend tests that project all new response shapes and rejection results through redaction sentinels.
- Add explicit absence checks proving accepted check and criterion commands do not create Student Workspace attempts, submitted answers, feedback, progress evidence, mastery state, weak-area state, review state, or learning history.
- Add out-of-scope surface checks for HTTP routes, CLI commands, LLM prompt execution, scoring, and feedback generation.
- Verify draft and rejected criterion/check candidates never appear in accepted criterion/check reads.
- Verify rejection and cleanup behavior does not delete accepted criterion revisions, accepted check revisions, or revision references.

**TDD sequence**:

1. RED/GREEN accepted criterion and open-answer check responses never include draft or rejected candidates.
2. RED/GREEN criterion/check candidate rejection does not delete accepted criterion revisions, accepted check revisions, or criterion revision references.
3. RED/GREEN accepted check and criterion commands leave Student Workspace attempts, answers, feedback, progress evidence, mastery state, and weak-area state absent.
4. RED/GREEN the first slice does not expose HTTP routes, CLI commands, LLM execution, scoring, feedback generation, or human review workflow.
5. RED/GREEN redaction sentinel tests cover all new assessment response and rejection result shapes.

**Dependencies**: Phase 3.

**Risks**: tests can accidentally assert only current behavior without defending ADR-011. Keep absence checks tied to the named Student Workspace state and out-of-scope surfaces from the spec.

**Validation**:

- Targeted assessment boundary tests for accepted/draft isolation, Student Workspace exclusion, out-of-scope surfaces, and redaction.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 4 boundary tests pass, full Node gates pass, and local commit `harden agonara assessment boundary` is created.

## Phase 5 — Backup/restore and executable acceptance closeout

**Objective**: make the new assessment corpus records recoverable and prove the full first-slice lifecycle through one executable acceptance flow.

**Key work items**:

- Extend backup export to include assessment criterion candidates, accepted assessment criterion entities/revisions, open-answer check candidates, accepted open-answer check entities/revisions, and accepted check-to-criterion revision references.
- Extend restore import to validate and restore the new assessment graph.
- Reject invalid restore graphs: accepted criterion entity without current revision, criterion revision without candidate/entity, accepted check entity without current revision, check revision without candidate/entity, check revision with missing criterion revision reference, cross-Program criterion reference, unaccepted candidate reference, or invalid candidate status.
- Add executable acceptance coverage for the spec's full criterion-to-check flow.
- Update Agonara traceability docs only if implementation changes the current traceability state.
- Move this plan to `agonara/docs/plans/implemented/` during final closeout in the same implementation change set.

**TDD sequence**:

1. RED/GREEN backup export includes every new assessment candidate, entity, revision, and check-to-criterion revision reference.
2. RED/GREEN restore import recreates a valid assessment graph and keeps current/historical revisions addressable.
3. RED/GREEN restore rejects invalid assessment graphs with deterministic storage invariant reasons.
4. RED/GREEN executable acceptance flow creates and accepts a criterion, creates and accepts an open-answer check linked to that criterion, revises the criterion, verifies the accepted check revision still points at the original criterion revision, lists the accepted check as a Student, fetches historical criterion and check revisions, rejects separate draft candidates, and verifies no Student Workspace state or assessment feedback is created.
5. RED/GREEN traceability and out-of-scope guards remain correct after backup/restore and executable acceptance wiring.

**Dependencies**: Phase 4.

**Risks**: backup/restore can preserve records but weaken graph invariants. Restore must validate the assessment graph before import rather than importing inconsistent accepted revisions.

**Validation**:

- Targeted backup/restore and executable acceptance tests for the assessment first slice.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 5 backup/restore and executable acceptance tests pass, full Node gates pass, this plan is moved to `agonara/docs/plans/implemented/`, and local closeout commit `complete agonara accepted checks first slice` is created.

## Done criteria

- The first-slice backend contract exposes accepted assessment criteria and accepted open-answer checks as versioned Program corpus.
- Assessment criterion candidates and open-answer check candidates are curator-owned draft/review state until accepted or rejected.
- Effective Program Curator participation is required for all candidate creation, candidate listing, acceptance, and rejection commands.
- Effective Student, Program Curator, or Admin authority is required for accepted criterion and accepted open-answer check read queries.
- Admin authority without effective Program Curator participation can read accepted checks and criteria but cannot create, accept, or reject candidates.
- Draft and rejected candidates remain outside accepted criterion and accepted open-answer check reads.
- Accepted open-answer checks require at least one accepted assessment criterion entity reference.
- Accepted open-answer check revisions snapshot accepted criterion revision ids and do not drift when criteria are revised later.
- Historical accepted criterion and accepted open-answer check revisions remain addressable after newer revisions become current.
- Backup/restore preserves and validates all new assessment records and revision graph invariants.
- Student Workspace attempts, answers, feedback, progress evidence, mastery state, weak-area state, review state, and learning history are not introduced by this slice.
- HTTP routes, CLI commands, UI, LLM execution, scoring, feedback generation, and human review workflow remain out of scope.
- Every behavior rule and listed test from [Accepted Checks and Assessment Criteria First Slice](../specs/accepted-checks-and-assessment-criteria-first-slice.md) is covered by targeted tests or the executable acceptance flow.
- Every phase has a green targeted test run, a green full Node test/build gate, and its own local commit.

## Final closeout

Final gates: `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`, `./scripts/run_silent.sh "tests" npm test`, `./scripts/run_silent.sh "build" npx tsc --noEmit`, implementation-plan checklist review, and `git status --short`
Archive plan: move to `agonara/docs/plans/implemented/`
Commit archive move: yes
Push/PR: follow push policy
