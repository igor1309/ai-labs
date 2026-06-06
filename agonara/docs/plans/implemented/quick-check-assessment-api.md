---
date: 2026-06-03
model: gpt-5
description: "Implementation plan: Agonara Quick Check assessment HTTP API."
---

# Quick Check Assessment HTTP API Implementation Plan

## Source Review Findings

- **Finding**: Quick Check assessment has implemented backend/domain and storage behavior, but no HTTP transport routes.
- **Impact**: INT-04 is not usable through the session-backed Agonara HTTP API even though Corpus Storage and Student Workspace can already create, deliver, submit, read, back up, and restore Quick Check data internally.
- **Required fix**: implement a bounded Quick Check HTTP API that maps existing Corpus and Student Workspace commands/queries to session-backed routes while preserving answer-key protection, Student ownership, idempotency, and redaction.
- **Required tests**: HTTP tests must prove curator curation surfaces, student delivery surfaces, student attempts, production composition, absence of out-of-scope routes, and redaction.

## Goal

Deliver the Agonara v0.0.1 HTTP API for deterministic single-select Quick Check curation, student-safe delivery, and Student Workspace-owned attempts.

This plan implements [Quick Check Assessment API](../../specs/quick-check-assessment-api.md), [Quick-Check Assessment First Slice](../../specs/quick-check-assessment-first-slice.md), and [ADR-016](../../adr/adr-016-quick-check-assessment-boundary.md). It preserves INT-04 from [Product Intent](../../intent/intent_learning_program_app.md) by exposing checks during study without exposing protected answer keys or adding learner-state interpretation.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push

## Execution lock

Worktree mode: reuse existing
Expected worktree: `worktrees/agonara-gap-closure`
Expected branch: `codex/agonara-gap-closure`
Preflight check: [x] done

## Scope guardrails

### In scope

- HTTP route adapters for every endpoint in [Quick Check Assessment API](../../specs/quick-check-assessment-api.md).
- Reuse of `agonara_session`, `X-Agonara-CSRF`, accepted/rejected/fault envelopes, common completion tracing, bounded pagination, opaque cursors, JSON body classification, and fault redaction.
- Curator candidate creation, listing, acceptance, rejection, and answer-key-inclusive curation revision reads.
- Student-safe delivery listing/detail reads without answer keys, correctness flags, candidate ids, or curator-only metadata.
- Student quick-check attempt submission with `X-Agonara-Idempotency-Key`, deterministic matched result, equivalent retry behavior, and conflict rejection.
- Owner-only attempt detail and Program-scoped attempt listing.
- Production `startServer()` route coverage and Product Intent traceability updates.
- Agonara log updates and final plan archive closeout.

### Out of scope

- Student UI, Curator UI, Admin UI, Program UI, CLI commands, or generated frontend artifacts.
- New Quick Check domain behavior beyond the implemented command/query contracts.
- Option randomization, localization, multiple-select checks, ordering checks, matching checks, code checks, topic-level checks, period-level checks, mastery calculation, weak-area calculation, progress interpretation, review scheduling, next-step recommendation, grading, analytics, reporting, external provider calls, evaluator workers, queues, or human review.
- Mutating open-answer checks, assessment criteria, unrelated accepted corpus, unrelated curator candidates, Program Membership state, Identity state, sessions, credentials, Admin authority, or CSRF behavior.
- Pushes, PRs, merges, or protected-trunk operations.

## ADR traceability matrix

| ADR | Invariant | Phase |
|---|---|---|
| ADR-007 | Quick Check student behavior requires effective Student participation. | Phase 3, Phase 4 |
| ADR-010 | Accepted Program corpus crosses from candidate state only through explicit curator acceptance. | Phase 2 |
| ADR-011 | Accepted checks remain Corpus Storage state while attempts and evidence remain Student Workspace state. | Phase 2, Phase 3, Phase 4 |
| ADR-016 | Corpus Storage owns accepted Quick Check revisions, options, and answer keys. | Phase 2, Phase 3 |
| ADR-016 | Student-facing delivery projections exclude answer keys and option correctness metadata. | Phase 3 |
| ADR-016 | Student Workspace owns immutable attempts, selected options, matched results, and quick-check evidence. | Phase 4 |
| ADR-016 | Submission is idempotent for equivalent client retries and rejects material conflicts. | Phase 4 |
| ADR-016 | HTTP transport must not expose the internal answer-key resolver. | Phase 3, Phase 4, Phase 5 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| INT-04 - Check understanding during study | Phase 3, Phase 4, Phase 5 |
| Student can complete quick checks and see whether understanding is confirmed or challenged | Phase 4 |
| Corpus and Student Workspace state remain separate | Phase 2 through Phase 5 |

## TDD and commit discipline

Every implementation phase must use strict TDD:

- Add or update one focused failing HTTP or executable acceptance test at a time.
- Run the targeted Agonara test command and capture a RED assertion failure. Compilation errors are not RED.
- Implement the minimum production change that turns that assertion GREEN.
- Repeat RED/GREEN until the phase objective is complete.
- Run the phase validation gates.
- Commit only files tied to the phase after GREEN gates pass.
- Self-review the phase against this plan, the API spec, ADR invariants, and redaction risks before advancing. Fix fail/warn findings immediately, rerun gates, and commit the fix.

Use Node commands through the repo wrapper:

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`

## Phase 1 - HTTP Substrate

**Status**: [x] complete

**Objective**: establish Quick Check route recognition, shared status mapping, body/query parsing, and redaction without successful domain mutations yet.

**Key work items**:

- Add route dispatch for Quick Check candidate, curation revision, delivery, and attempt endpoints.
- Add Quick Check rejection-to-HTTP status mapping.
- Add Quick Check list query parsing with bounded limits and opaque cursors.
- Add Quick Check submission idempotency-header parsing.
- Reuse common completion logging and fault redaction.

**TDD sequence**:

1. RED/GREEN candidate creation without a session returns `401 session_not_found`.
2. RED/GREEN candidate creation with a session but missing/invalid CSRF returns `403 csrf_required` or `403 csrf_invalid`.
3. RED/GREEN attempt submission rejects missing and malformed idempotency headers with `400 validation_failed`.
4. RED/GREEN representative Quick Check fault responses and operational logs keep request ids and omit secrets, answer keys, idempotency keys, cookies, CSRF tokens, SQL, paths, and stack traces.
5. RED/GREEN representative existing Identity, Program, Corpus, accepted assessment, and Student Workspace routes keep their prior envelope and status behavior.

**Validation**:

- Targeted HTTP tests for substrate behavior.
- Full Agonara tests.
- Root build.
- `git diff --check`.

**Completion signal**: substrate routes reject correctly, existing HTTP surfaces are not regressed, gates pass, and a phase commit is created.

## Phase 2 - Curator Candidate And Acceptance Routes

**Status**: [x] complete

**Objective**: expose Program Curator-owned Quick Check candidate lifecycle and answer-key-inclusive curation reads over HTTP.

**Key work items**:

- Implement `GET /programs/{programId}/quick-checks/candidates`.
- Implement `POST /programs/{programId}/quick-checks/candidates`.
- Implement `POST /quick-checks/candidates/{candidateId}/acceptance`.
- Implement `POST /quick-checks/candidates/{candidateId}/rejection`.
- Implement `GET /quick-checks/revisions/{revisionId}/curation`.
- Keep answer keys visible only in curator-authorized candidate and curation revision responses.

**TDD sequence**:

1. RED/GREEN effective Program Curators create candidates with opaque options and answer-key option ids.
2. RED/GREEN creation rejects invalid bodies, unsupported fields, invalid `checkKind`, invalid title/prompt, invalid options, duplicate trimmed options, invalid answer-key indexes, unknown sources, and cross-Program sources.
3. RED/GREEN listing scopes candidates to Program and applies status, limit, and cursor behavior.
4. RED/GREEN Students and Admins without effective Program Curator participation cannot list or mutate candidates.
5. RED/GREEN acceptance creates accepted Quick Check summaries and supports replacement revisions.
6. RED/GREEN rejection marks draft candidates rejected and creates no accepted entity or revision.
7. RED/GREEN curation revision reads expose answer keys only to effective Program Curators.

**Validation**:

- Targeted HTTP tests for curator routes.
- Full Agonara tests.
- Root build.
- `git diff --check`.

**Completion signal**: curator HTTP routes match the spec, answer-key exposure is constrained to curator surfaces, gates pass, and a phase commit is created.

## Phase 3 - Student Delivery Routes

**Status**: [x] complete

**Objective**: expose current and historical Quick Check deliveries to effective Students without answer-key or curator-only leakage.

**Key work items**:

- Implement `GET /programs/{programId}/quick-checks`.
- Implement `GET /quick-checks/revisions/{revisionId}`.
- Enforce effective Student participation.
- Return only student-safe delivery summaries.
- Add positive redaction controls for answer keys, option correctness flags, candidate ids, rationale, curator attribution, acceptance time, idempotency keys, and operational details.

**TDD sequence**:

1. RED/GREEN delivery listing returns current accepted Quick Checks for effective Students.
2. RED/GREEN delivery detail returns current and historical revisions for effective Students.
3. RED/GREEN delivery routes reject unknown Programs or revisions, disabled sessions, and callers without effective Student participation.
4. RED/GREEN delivery cursors apply bounded limits and reject malformed, unknown, route-mismatched, or filter-mismatched cursors.
5. RED/GREEN delivery responses, cursors, faults, and logs omit answer keys, correctness flags, candidate ids, curator-only metadata, idempotency keys, and operational secrets.

**Validation**:

- Targeted HTTP tests for delivery routes and redaction.
- Full Agonara tests.
- Root build.
- `git diff --check`.

**Completion signal**: student delivery routes expose only answerable Quick Check projections, gates pass, and a phase commit is created.

## Phase 4 - Student Attempt Routes

**Status**: [x] complete

**Objective**: expose Student Workspace-owned Quick Check attempt submission and owner-only reads over HTTP.

**Key work items**:

- Implement `POST /programs/{programId}/quick-check-attempts`.
- Implement `GET /quick-check-attempts/{attemptId}`.
- Implement `GET /programs/{programId}/quick-check-attempts`.
- Enforce CSRF, idempotency, effective Student participation, owner-only reads, and bounded pagination.
- Return matched-or-not-matched results without answer keys or per-option correctness metadata.

**TDD sequence**:

1. RED/GREEN attempt submission accepts an effective Student with CSRF and an idempotency header.
2. RED/GREEN attempt submission rejects invalid bodies, missing/malformed idempotency headers, unknown Programs, non-Students, unknown revisions, cross-Program revisions, selected options outside the revision, and idempotency conflicts.
3. RED/GREEN equivalent retries return the original attempt without creating a duplicate.
4. RED/GREEN attempt detail returns only the owning Student's attempt.
5. RED/GREEN attempt detail rejects unknown attempts, non-owning Students, Program Curators, Admins, and other callers with `404 attempt_not_found`.
6. RED/GREEN attempt listing returns only owning-Student attempts in the requested Program and applies revision filters, limits, and cursors.
7. RED/GREEN attempt responses, cursors, faults, and logs omit answer keys, per-option correctness metadata, idempotency keys, candidate ids, and operational secrets.

**Validation**:

- Targeted HTTP tests for attempt routes, idempotency, owner-only reads, pagination, and redaction.
- Full Agonara tests.
- Root build.
- `git diff --check`.

**Completion signal**: student attempt routes match the spec, gates pass, and a phase commit is created.

## Phase 5 - Production Composition And Closeout

**Status**: [x] complete

**Objective**: prove Quick Check HTTP routes work through production composition and close documentation without adding out-of-scope product surfaces.

**Key work items**:

- Add production `startServer()` coverage for Quick Check routes against a real SQLite database.
- Add executable acceptance coverage for curator candidate acceptance, student delivery, student submission, idempotent retry, owner read, historical revision behavior, and redaction.
- Add absence checks for UI, CLI, option-randomization, multiple-select, topic-level, period-level, mastery, weak-area, progress, grading, provider, worker, queue, and human-review routes.
- Update Product Intent traceability from backend/domain-only to HTTP-implemented for INT-04.
- Update `agonara/docs/log.md`.
- Archive this plan after implementation.

**TDD sequence**:

1. RED/GREEN production composition exposes Quick Check candidate, delivery, and attempt routes.
2. RED/GREEN executable HTTP acceptance covers the full Quick Check transport flow.
3. RED/GREEN absence checks prove out-of-scope routes remain unavailable.
4. Update traceability, log, and archive the plan only after code gates pass.

**Validation**:

- Targeted executable acceptance tests.
- Full Agonara tests.
- Root build.
- Markdown/front-matter/link checks for changed docs.
- `git diff --check`.

**Completion signal**: Quick Check HTTP transport is implemented, traceability is updated, the plan is archived under `agonara/docs/plans/implemented/`, gates pass, and a closeout commit is created.

## Done criteria

- Every endpoint in [Quick Check Assessment API](../../specs/quick-check-assessment-api.md) is implemented.
- Quick Check HTTP routes are exposed through production `startServer()` composition.
- Program Curator routes constrain answer-key visibility to curator-authorized surfaces.
- Student delivery routes never expose answer keys, per-option correctness metadata, candidate ids, or curator-only metadata.
- Student attempt routes preserve CSRF, idempotency, owner-only reads, matched result visibility, and redaction.
- Existing Identity, Program, Corpus, accepted assessment, open-answer Student Workspace, operations, backup/restore, and CLI behavior is not regressed.
- All code phases pass the Agonara test wrapper, root build wrapper, and `git diff --check`.
- Remaining UI and learner-state product work stays out of scope.

## Final closeout

Final gates: `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara` and `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`.
Archive plan: move to `agonara/docs/plans/implemented/quick-check-assessment-api.md` and repair archive-relative links.
Commit archive move: yes.
