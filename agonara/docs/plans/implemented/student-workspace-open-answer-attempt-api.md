---
date: 2026-06-02
model: gpt-5
description: "Implementation plan: Agonara Student Workspace open-answer attempt HTTP API."
---

# Student Workspace Open-Answer Attempt HTTP API Implementation Plan

## Goal

Deliver the Agonara v0.0.1 HTTP API for Student Workspace-owned open-answer attempt submission and owner-only attempt reads through the existing session, CSRF, envelope, pagination, idempotency, and redaction conventions.

This plan implements [Student Workspace Open-Answer Attempt API](../../specs/student-workspace-open-answer-attempt-api.md), [Student Workspace Open-Answer Attempt First Slice](../../specs/student-workspace-open-answer-attempt-first-slice.md), and [ADR-012](../../adr/adr-012-student-workspace-open-answer-attempt-lifecycle.md). It preserves STU-12, STU-13, and INT-05 from [Product Intent](../../intent/intent_learning_program_app.md) by exposing submitted open-answer attempts and student-facing feedback reads without moving personal Student Workspace state into accepted Program corpus.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push

## Execution lock

Worktree mode: create new
Expected worktree: `worktrees/agonara-student-attempt-api`
Expected branch: `codex/agonara-student-attempt-api`
Preflight check: [x] done

## Scope guardrails

### In scope

- HTTP route adapters for every endpoint listed in [Student Workspace Open-Answer Attempt API](../../specs/student-workspace-open-answer-attempt-api.md).
- Reuse of the existing `agonara_session` cookie, `X-Agonara-CSRF` header, accepted/rejected/fault envelopes, bounded pagination, opaque cursors, JSON body classification, and redaction conventions.
- The `X-Agonara-Idempotency-Key` header contract for attempt submission.
- HTTP status mapping for Student Workspace attempt, session, CSRF, identity, Program, participation, accepted check revision, and idempotency rejection reasons.
- Student-only submission against accepted open-answer check revisions.
- Owner-only attempt detail reads and owner-only Program-scoped attempt listing.
- HTTP acceptance and integration tests covering the API spec's required behavior.
- Product intent traceability, Agonara log updates, and final plan archive closeout.

### Out of scope

- Student UI, Admin UI, Curator UI, Program UI, or generated frontend artifacts.
- CLI commands.
- New Student Workspace domain behavior beyond the implemented command/query contract.
- HTTP routes for `markOpenAnswerAttemptEvaluating`, `recordOpenAnswerEvaluation`, or `recordOpenAnswerEvaluationFailure`.
- Program Curator attempt reads, Admin attempt reads, support/recovery reads, reviewer reads, or ordinary product flows that let non-owning callers inspect attempts.
- LLM provider calls, prompt construction, raw prompt storage, raw model response storage, evaluator diagnostics, background queues, asynchronous workers, provider retry policy, or evaluator orchestration.
- Human review workflow, reviewer assignment, escalation, dispute workflow, or feedback rewriting through curator/admin flows.
- Mastery calculation, weak-area calculation, progress interpretation, review scheduling, topic-level attempts, period-level attempts, quick-check attempts, multiple-choice attempts, institutional grading, analytics, or reporting.
- Mutating accepted checks, accepted criteria, accepted revisions, source records, curator candidates, Program shells, Program Membership state, Identity state, sessions, or CSRF behavior.
- Reworking the implemented Corpus, Program, Identity, accepted assessment, or Admin operations APIs except where shared helpers must preserve existing behavior while admitting the Student Workspace attempt API's specified rejection reasons.
- Pushes, PRs, or merges.

## ADR traceability matrix

| ADR | Invariant | Phase |
|---|---|---|
| ADR-007 | Student Workspace uses effective Student participation for Program-sensitive student behavior. | Phase 1, Phase 2, Phase 4, Phase 5 |
| ADR-010 | Student Workspace reads accepted corpus but does not mutate accepted checks, criteria, revisions, sources, or candidates. | Phase 2, Phase 5 |
| ADR-011 | Attempts, answers, feedback, and student-specific evidence remain Student Workspace state. | Phase 2, Phase 3, Phase 4, Phase 5 |
| ADR-011 | Student Workspace references accepted check and criterion revisions rather than owning accepted corpus. | Phase 2, Phase 3, Phase 5 |
| ADR-012 | Attempt submission requires effective Student participation and preserves accepted revision references. | Phase 2, Phase 5 |
| ADR-012 | Retryable submission APIs require a client-provided idempotency key and reject conflicting reuse. | Phase 1, Phase 2, Phase 5 |
| ADR-012 | First-slice attempt reads require the owning Student. | Phase 3, Phase 4, Phase 5 |
| ADR-012 | Attempt APIs preserve session, CSRF, envelope, pagination, and redaction conventions. | Phase 1, Phase 2, Phase 3, Phase 4, Phase 5 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| STU-12 - Submit open answer | Phase 2, Phase 5 |
| STU-13 - Receive open-answer feedback | Phase 3, Phase 5 |
| INT-05 - Submit an open answer and receive feedback tied to accepted criteria | Phase 2, Phase 3, Phase 4, Phase 5 |

## TDD and commit discipline

Every implementation phase must use strict TDD:

- Add or update one focused failing HTTP or executable acceptance test at a time.
- Run the targeted Agonara test command and capture a RED assertion failure. Compilation errors are not RED.
- Implement the minimum production change that turns that assertion GREEN.
- Repeat RED/GREEN until the phase objective is complete.
- Run the phase validation gates.
- Commit only files tied to the phase after GREEN gates pass.
- Self-review the phase against this plan, the API spec, and ADR invariants before advancing. Fix fail/warn findings immediately, rerun the phase gates, and commit the fix.

Each phase has its own local commit. Do not bundle unrelated phase work into one commit. The docs-only final closeout uses document gates for the archive move in addition to the final code gates.

## Phase 1 — Student attempt HTTP substrate

**Status**: [x] completed

**Objective**: establish route dispatch and shared transport behavior for the Student Workspace attempt API without applying successful attempt mutations yet.

**Key work items**:

- Add route recognition for the three attempt API endpoints before the server's unhandled route return path.
- Reuse existing session resolution, CSRF enforcement, accepted/rejected/fault envelopes, JSON body classification, bounded query parsing, and redaction conventions.
- Add HTTP status mapping for Student Workspace attempt rejection reasons, including delegated `identity_not_active`.
- Add `X-Agonara-Idempotency-Key` parsing and validation for the submission route.
- Prove existing Identity, Program, Corpus, accepted assessment, and Admin routes remain unchanged.

**TDD sequence**:

1. RED/GREEN `POST /programs/{programId}/open-answer-attempts` without a session returns `401 session_not_found`.
2. RED/GREEN `GET /open-answer-attempts/{attemptId}` with a disabled session Identity returns `403 identity_disabled`.
3. RED/GREEN submission rejects a valid session without CSRF with `403 csrf_required`.
4. RED/GREEN submission rejects an invalid CSRF token with `403 csrf_invalid`.
5. RED/GREEN submission rejects missing, empty, whitespace-only, non-string, and overlong idempotency headers with `400 validation_failed`.
6. RED/GREEN attempt API fault and rejection responses do not expose session identifiers, CSRF tokens, cookie headers, authorization headers, or idempotency keys.
7. RED/GREEN representative existing HTTP routes still return their prior status and envelope shape.

**Dependencies**: existing Identity session API, Program API, accepted assessment API, Student Workspace domain service, and server route adapter.

**Risks**: shared-helper edits can regress existing APIs. Keep substrate changes additive and run the existing HTTP suite after each helper change.

**Validation**:

- Targeted HTTP tests for attempt route dispatch, session/CSRF behavior, idempotency header validation, status mapping, and redaction.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 1 tests pass, full Node gates pass, and local commit `wire agonara student attempt api substrate` is created.

## Phase 2 — Attempt submission route

**Status**: [x] completed

**Objective**: implement student-owned open-answer attempt submission over HTTP with strict request validation, effective Student authorization, accepted revision references, and scoped idempotency.

**Key work items**:

- Implement `POST /programs/{programId}/open-answer-attempts`.
- Map request input to `submitOpenAnswerAttempt` using the resolved session Identity, Program path id, request `checkRevisionId`, request `submittedAnswer`, and idempotency header.
- Return `{ attempt: OpenAnswerAttemptDetail }` in the accepted envelope.
- Reject malformed JSON, non-object JSON, missing bodies, unsupported fields, malformed `checkRevisionId`, and malformed `submittedAnswer` with `400 validation_failed`.
- Map unknown Program, missing Student participation, unknown check revision, cross-Program check revision, and idempotency conflict reasons to the spec's HTTP statuses.
- Prove submission does not mutate accepted checks, accepted criteria, accepted revisions, source records, curator candidates, membership records, sessions, mastery state, weak-area state, progress evidence, or review-scheduling state.

**TDD sequence**:

1. RED/GREEN submission accepts an effective Student with a valid body, CSRF token, and idempotency header, returning a `submitted` attempt detail.
2. RED/GREEN accepted submission snapshots accepted check revision id and criterion revision ids.
3. RED/GREEN accepted submission trims the submitted answer before returning and persisting it.
4. RED/GREEN invalid request bodies reject with `400 validation_failed`.
5. RED/GREEN unknown Program path ids reject with `404 program_not_found`.
6. RED/GREEN callers without effective Student participation reject with `403 participation_required`.
7. RED/GREEN unknown check revision ids reject with `404 check_revision_not_found`.
8. RED/GREEN cross-Program check revision ids reject with `409 check_revision_program_mismatch`.
9. RED/GREEN equivalent retries with the same scoped idempotency key return the original attempt without creating a duplicate.
10. RED/GREEN conflicting reuse of the same scoped idempotency key rejects with `409 idempotency_conflict` without creating or changing an attempt.
11. RED/GREEN submission leaves accepted corpus, curator candidates, membership, session, mastery, weak-area, progress, and review-scheduling state unchanged.

**Dependencies**: Phase 1 and the implemented Student Workspace domain submission command.

**Risks**: idempotency bugs are easy to hide behind route-level validation. Tests must cover equivalent retries and conflicting retries through the HTTP boundary, not only the domain service.

**Validation**:

- Targeted HTTP tests for submission validation, authorization, accepted revision references, idempotency, status mapping, and non-mutation.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 2 tests pass, full Node gates pass, and local commit `implement agonara student attempt submission api` is created.

## Phase 3 — Owner-only attempt detail route

**Status**: [x] completed

**Objective**: implement owner-only attempt detail reads, including evaluation and active failure detail, without leaking private attempt existence to non-owners.

**Key work items**:

- Implement `GET /open-answer-attempts/{attemptId}`.
- Map the route to `getOpenAnswerAttempt` for the resolved session Identity.
- Return `{ attempt: OpenAnswerAttemptDetail }` in the accepted envelope.
- Include evaluation detail when an evaluation exists.
- Include evaluation failure detail when an active evaluation failure exists.
- Return `404 attempt_not_found` for unknown attempts, attempts owned by another Student, Program Curator callers, Admin callers, and other non-owning callers.
- Preserve redaction for attempt detail, evaluation detail, active failure detail, rejected responses, and fault responses.

**TDD sequence**:

1. RED/GREEN attempt detail returns the owning Student's attempt detail.
2. RED/GREEN detail includes evaluation detail when the attempt has a recorded evaluation.
3. RED/GREEN detail includes evaluation failure detail when the attempt has an active evaluation failure.
4. RED/GREEN detail rejects unknown attempts with `404 attempt_not_found`.
5. RED/GREEN detail rejects another Student's attempt with `404 attempt_not_found`.
6. RED/GREEN detail rejects Program Curator, Admin, and other non-owning callers with `404 attempt_not_found`.
7. RED/GREEN detail responses and rejection/fault paths do not expose idempotency keys, raw LLM prompts, raw model responses, evaluator diagnostics, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.

**Dependencies**: Phase 2 and the implemented Student Workspace domain detail query.

**Risks**: distinct unauthorized responses can leak that an attempt exists. Every non-owner category must assert the same `404 attempt_not_found` behavior.

**Validation**:

- Targeted HTTP tests for owner-only detail reads, evaluation/failure detail, non-owner leak prevention, and redaction.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 3 tests pass, full Node gates pass, and local commit `implement agonara student attempt detail api` is created.

## Phase 4 — Owner-only attempt listing route

**Status**: [x] completed

**Objective**: implement Program-scoped owner-only attempt listing with supported filters, bounded pagination, opaque cursors, and cursor-scope rejection.

**Key work items**:

- Implement `GET /programs/{programId}/open-answer-attempts?status={status}&checkRevisionId={checkRevisionId}&limit={limit}&cursor={cursor}`.
- Map the route to `listOpenAnswerAttempts` for the resolved session Identity and requested Program.
- Return `OpenAnswerAttemptList` in the accepted envelope.
- Require effective Student participation for the requested Program.
- Return only attempts owned by the resolved session Identity for the requested Program.
- Apply supported `status` and `checkRevisionId` filters after Program and owner scope.
- Default `limit` to `50`, accept `1` through `100`, and reject invalid limits with `400 validation_failed`.
- Reject malformed, unknown, expired, route-mismatched, status-filter-mismatched, and check-filter-mismatched cursors with `400 validation_failed`.
- Preserve cursor and response redaction.

**TDD sequence**:

1. RED/GREEN listing returns only attempts owned by the session Student in the requested Program.
2. RED/GREEN listing rejects callers without effective Student participation with `403 participation_required`.
3. RED/GREEN listing applies supported status filters and rejects unsupported status values with `400 validation_failed`.
4. RED/GREEN listing applies `checkRevisionId` filters after Program and owner scope.
5. RED/GREEN listing defaults `limit` to `50`.
6. RED/GREEN listing rejects invalid limits with `400 validation_failed`.
7. RED/GREEN listing returns an opaque `nextCursor` when more owner-scoped results remain.
8. RED/GREEN listing rejects malformed, unknown, route-mismatched, status-filter-mismatched, and check-filter-mismatched cursors with `400 validation_failed`.
9. RED/GREEN listing responses and cursors do not expose secrets, submitted answers inside cursors, idempotency keys, SQL text, stack traces, filesystem paths, database URLs, session identifiers, CSRF tokens, raw LLM prompts, raw model responses, or evaluator diagnostics.

**Dependencies**: Phase 3 and the implemented Student Workspace domain list query.

**Risks**: cursor reuse across owners, routes, Programs, or filters can leak private attempt history. Cursor tests must prove scope mismatch rejection, not just happy-path pagination.

**Validation**:

- Targeted HTTP tests for owner-only listing, filters, bounded pagination, cursor-scope rejection, and redaction.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 4 tests pass, full Node gates pass, and local commit `implement agonara student attempt list api` is created.

## Phase 5 — Executable acceptance and closeout

**Status**: [x] completed

**Objective**: prove the full Student Workspace attempt HTTP flow and harden out-of-scope boundaries before archiving the plan.

**Key work items**:

- Extend the executable Agonara acceptance flow for STU-12, STU-13, and INT-05 over HTTP.
- Cover a logged-in Student joining a Program, reading an accepted open-answer check revision, submitting an open answer with CSRF and an idempotency header, retrying the same submission without duplicating the attempt, receiving evaluation detail after Student Workspace records evaluation internally, listing only its own attempts, and failing to read another Student's attempt.
- Prove no HTTP evaluation mutation routes are exposed.
- Prove no Student UI, Admin UI, Curator UI, CLI, Program Curator attempt-read, Admin attempt-read, LLM, human-review, mastery, weak-area, progress, quick-check, topic-level, period-level, or grading behavior is introduced by this API slice.
- Update Product Intent traceability with the implemented plan and HTTP code/test surfaces.
- Update the Agonara project log.
- Run final gates.
- Move this plan to `agonara/docs/plans/implemented/student-workspace-open-answer-attempt-api.md`.
- Update this plan's relative links for the `plans/implemented/` location before committing the archive move.
- Update Product Intent traceability to point at the implemented plan path after the archive move.

**TDD sequence**:

1. RED/GREEN executable HTTP flow covers Student join, accepted check read, attempt submission, idempotent retry, internal evaluation, owner detail read, owner list read, and non-owner read rejection.
2. RED/GREEN absence checks prove evaluation mutation, UI, CLI, curator read, admin read, LLM, human-review, mastery, weak-area, progress, quick-check, topic-level, period-level, and grading routes remain absent.
3. RED/GREEN final redaction sentinels cover attempt API accepted, rejected, cursor, and fault shapes.
4. GREEN documentation closeout updates Product Intent traceability and the Agonara log.
5. GREEN archive move places this plan under `agonara/docs/plans/implemented/`, updates archive-relative links, and updates Product Intent traceability to the implemented plan path.

**Dependencies**: Phase 4.

**Risks**: the executable flow could accidentally rely on domain-only evaluation setup and miss the HTTP contract. Keep the setup explicit: HTTP exercises student-facing routes, while internal Student Workspace commands may seed evaluation state only where the spec keeps evaluation mutation routes out of HTTP scope.

**Validation**:

- Targeted executable acceptance tests for the full HTTP flow and absence checks.
- `git diff --check`
- Markdown structure and link checks for changed docs.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 5 tests and final gates pass, this plan is archived under `agonara/docs/plans/implemented/`, and local commit `archive agonara student attempt api plan` is created.

## Done criteria

- All HTTP endpoints in [Student Workspace Open-Answer Attempt API](../../specs/student-workspace-open-answer-attempt-api.md) are implemented with the specified accepted/rejected/fault envelope shapes.
- The API uses the existing Identity session and CSRF transport contract.
- Submission requires and validates `X-Agonara-Idempotency-Key`, returns equivalent retries idempotently, and rejects conflicting retries.
- Submission stores attempts against accepted check revisions and snapshotted criterion revision ids without mutating accepted corpus or curator candidates.
- Attempt detail and list routes are owner-only and do not expose private attempt existence to non-owners.
- Attempt listing implements supported filters, bounded pagination, opaque cursors, and cursor-scope rejection.
- Responses, cursors, and faults satisfy the spec's redaction rules.
- Executable HTTP acceptance covers STU-12, STU-13, and INT-05.
- Absence checks prove this slice introduces no UI, CLI, HTTP evaluation mutation, Program Curator attempt reads, Admin attempt reads, LLM provider, human review, mastery, weak-area, progress, quick-check, topic-level, period-level, or grading behavior.
- Each implementation phase has a local commit created only after its validation gates pass.
- The final branch state passes Agonara workspace tests, repo-wide Node tests, and TypeScript build.
- This plan is moved to `agonara/docs/plans/implemented/` in the same change set as implementation closeout.
- The archived plan's relative links resolve from `agonara/docs/plans/implemented/`, and Product Intent traceability points to the implemented plan path after archive closeout.

## Final closeout

Final gates: `git diff --check`; Markdown structure and link checks for changed docs, including archived-plan relative links after the move; `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`; `./scripts/run_silent.sh "tests" npm test`; `./scripts/run_silent.sh "build" npx tsc --noEmit`
Archive plan: move to `agonara/docs/plans/implemented/student-workspace-open-answer-attempt-api.md`
Commit archive move: yes
Push/PR: follow push policy (`no push`)
