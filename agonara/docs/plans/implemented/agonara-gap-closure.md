---
date: 2026-06-03
model: gpt-5
description: "Implementation plan: close Agonara production composition, operational tracing, documentation drift, and next-slice handoff gaps"
---

# Agonara Gap Closure Implementation Plan

## Full Review Findings

### Finding 1 - Production server composition misses Student Workspace

Verdict: fail

Why: The documented Student Workspace open-answer HTTP API is implemented only when tests inject `studentWorkspaceCommands`; the production composition root does not wire those commands, so deployed `startServer()` cannot serve the implemented Student Workspace HTTP routes. This violates the composition-root principle and the Student Workspace API spec's public HTTP route contract.

Location: `agonara/src/server.js:83`, `agonara/src/server.js:560`, `agonara/src/server.js:1330`, `agonara/tests/http-api.test.js:8093`, `agonara/docs/specs/student-workspace-open-answer-attempt-api.md:178`

Fix: Add `createStudentWorkspaceCommands` to the production `startServer()` composition, pass `programCommands.getEffectiveParticipation`, and add a production-composition test that starts through `startServer()` or an equivalent production factory path and proves Student Workspace routes are present.

Required tests: Add a focused failing production-composition test before changing `startServer()`, then run `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`.

### Finding 2 - Operational tracing and diagnostics contract drift

Verdict: fail

Why: The operational spec requires request correlation, completion logs, and the `OperationalDiagnostics` shape for the minimum operational contract. The server currently logs health, diagnostics, and fault paths, but regular Identity, Program, Corpus, and Student Workspace HTTP route completions are not consistently logged. Diagnostics return an accepted envelope with `checkedAt/components`, while the spec defines `status/generatedAt/requestId/checks`.

Location: `agonara/docs/specs/operational-cross-cutting-first-slice.md:20`, `agonara/docs/specs/operational-cross-cutting-first-slice.md:38`, `agonara/docs/specs/operational-cross-cutting-first-slice.md:107`, `agonara/docs/specs/operational-cross-cutting-first-slice.md:111`, `agonara/src/server.js:99`, `agonara/src/server.js:115`, `agonara/src/server.js:126`, `agonara/src/server.js:1395`

Fix: Treat the accepted operational spec as the contract for this closure. Add route-completion logging around implemented HTTP adapters, include the active request id on accepted/rejected/faulted route logs, keep redaction tests in place, and align `/operations/diagnostics` with the documented response shape or explicitly revise the spec in the same phase if the accepted contract changes.

Required tests: Add or update operation and HTTP tests for diagnostics shape, accepted/rejected completion logs, request id propagation, and redaction, then run `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`.

### Finding 3 - Top-level Agonara docs are stale

Verdict: warning

Why: The Agonara README still says only the first Identity and Operations slice is implemented, while the log, specs, code, and tests show Program, Corpus, accepted checks, open-answer Student Workspace, evaluator orchestration, evaluator worker, and Quick Check domain slices. The backlog still says storage is deferred even though storage now contains concrete persisted state across those domains.

Location: `agonara/README.md:9`, `agonara/docs/backlog.md:12`, `agonara/docs/implementation-notes.md:59`, `agonara/docs/intent_learning_program_app.md:177`, `agonara/src/storage.js:3460`

Fix: Refresh README, backlog, implementation notes, and traceability docs so they describe the current implemented backend/domain state, the current production-runtime caveats, and the actual remaining storage/product questions.

Required tests: Run docs verification for front matter, required sections, links touched by the update, and `git diff --check`. Run the full Agonara test wrapper only if executable examples, runtime commands, or code are changed in the same phase.

### Finding 4 - Quick Check remains backend/domain-only

Verdict: warning

Why: Product Intent expects students to answer checks during study, and the Quick Check domain slice implements candidate, delivery, attempt, idempotency, backup/restore, and acceptance behavior. The implemented plan explicitly deferred HTTP routes, CLI commands, and UI, so there is no deployed user-facing Quick Check transport yet.

Location: `agonara/docs/intent_learning_program_app.md:117`, `agonara/docs/specs/quick-check-assessment-first-slice.md:127`, `agonara/docs/specs/quick-check-assessment-first-slice.md:159`, `agonara/docs/specs/quick-check-assessment-first-slice.md:174`, `agonara/docs/plans/implemented/quick-check-assessment-first-slice.md:13`, `agonara/src/student-workspace.js:87`, `agonara/src/student-workspace.js:120`

Fix: Add a Quick Check HTTP API spec and implementation plan before coding transport routes. Then implement student-safe delivery reads, student submission, owner-only attempt reads, curator candidate/acceptance transport where needed, and production composition coverage.

Required tests: Start with API tests for session, CSRF, idempotency, answer-key redaction, delivery reads, submission, owner reads, cursor/filter behavior if added, and absence of out-of-scope evaluator/provider/UI behavior. Run `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`.

### Finding 5 - Major product slices remain intentionally unbuilt

Verdict: warning

Why: Product Intent traceability marks materials navigation, topic/period checks, personal progress/weak areas, and several invitation/recovery membership flows as `n/a`. Those are not regressions in the current implementation, but they are required future work before Agonara satisfies the accepted product outcome.

Location: `agonara/docs/intent_learning_program_app.md:183`, `agonara/docs/intent_learning_program_app.md:186`, `agonara/docs/intent_learning_program_app.md:187`, `agonara/docs/intent_learning_program_app.md:190`

Fix: Do not fold these large product areas into this closure. Add a bounded next-slice handoff that names the missing product capabilities, defines the first follow-up spec/ADR artifact needed for each, and links them from Product Intent or backlog so they are visible without pretending they are implemented.

Required tests: Docs verification for front matter, links, traceability, and `git diff --check`.

## Adversarial Review Closure

### Review finding 1 - code phases omitted the build gate

Verdict: fail

Why: Repo process gates require both `./scripts/run_silent.sh "tests" npm test` and `./scripts/run_silent.sh "build" npx tsc --noEmit` for Node/TypeScript code, config, dependency, CI, release, or generated-artifact changes. The initial plan only required the Agonara test wrapper for code phases.

Fix applied: Phase 1, Phase 2, the Quick Check HTTP implementation phase, and the done criteria now require both the Agonara test wrapper and the root build wrapper.

### Review finding 2 - Quick Check transport stopped at handoff

Verdict: fail

Why: The review finding says Quick Check remains backend/domain-only. A plan that only adds another spec and implementation plan would leave that implementation gap open.

Fix applied: Quick Check work is split into a spec/plan phase and a separate HTTP implementation phase with route tests, production composition checks, redaction checks, and build gates.

### Review finding 3 - tracing phase allowed implementation-time spec drift

Verdict: warning

Why: The operational tracing phase allowed implementation to revise the accepted operational spec inside the same phase. That hides architecture/spec instability in implementation work.

Fix applied: Phase 2 now treats the operational spec as source of truth and stops for a separate spec/ADR review if the contract is wrong.

## Goal

Close the current Agonara implementation and documentation gaps that make implemented behavior unavailable in production composition, make operational tracing ambiguous, or leave current-state docs misleading. The plan also records the next buildable product handoffs for Quick Check transport and broader learning-product slices without bundling those long-range product features into this closure.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push

## Execution lock

Worktree mode: create new
Expected worktree: `worktrees/agonara-gap-closure`
Expected branch: `codex/agonara-gap-closure`
Preflight check: [x] done

## Scope guardrails

- Do not add product UI in this closure except where a later Quick Check transport/UI plan explicitly scopes it.
- Do not introduce external LLM provider calls, durable queues, human-review queues, analytics, grading, mastery interpretation, weak-area interpretation, or progress state in the production-composition or tracing phases.
- Do not change accepted ADR ownership boundaries for Identity, Program Membership, Corpus Storage, Curator Workspace, Student Workspace, or operational cross-cutting behavior.
- Do not broaden Admin authority into ordinary Student or Program Curator behavior.
- Do not rewrite storage architecture except for changes directly required by production composition, tracing, diagnostics, or explicitly planned future slices.
- Do not update unrelated projects or repo-level dashboards unless the implementation phase changes those surfaces.

## ADR traceability matrix

| ADR / spec invariant | Phase |
|---|---|
| Student Workspace owns open-answer attempt submission and owner-only reads under Program Membership authorization. | Phase 1 |
| Operational cross-cutting owns request correlation, completion logs, diagnostics, health, redaction, and audit/log separation. | Phase 2 |
| Corpus, Program Membership, Student Workspace, and Identity boundaries stay visible in current-state docs. | Phase 3 |
| Quick Check accepted revisions and answer keys stay protected while Student Workspace owns attempts. | Phase 4, Phase 5 |
| Deferred product slices stay explicit without silently changing accepted architecture. | Phase 6 |

## Product intent traceability

| Story | Phase |
|---|---|
| INT-04 - Answer checks during study | Phase 4 creates the transport contract and Phase 5 implements Quick Check user-facing HTTP routes. |
| INT-05 - Submit open answers and receive feedback tied to accepted criteria | Phase 1 makes implemented Student Workspace HTTP routes available through production composition. |
| INT-07 - See personal state and evidence | Phase 6 keeps progress/weak-area work visible as deferred follow-up rather than hidden side effects. |
| ADM-01..ADM-11 - Admin-owned identity and operational recovery | Phase 2 preserves operational tracing and diagnostics redaction while Phase 3 refreshes current-state docs. |

## Phase 1 - Production Student Workspace Composition

**Objective**: make the implemented Student Workspace open-answer HTTP API available through the production server composition path.

**Key work items**:

- Add a failing production-composition test that starts Agonara through the same command wiring used by `startServer()` and proves `POST /programs/{programId}/open-answer-attempts`, `GET /open-answer-attempts/{attemptId}`, and `GET /programs/{programId}/open-answer-attempts` are reachable when valid state exists.
- Import and instantiate `createStudentWorkspaceCommands` in `agonara/src/server.js`.
- Pass `database`, `generateId` if production composition has one, `now` if production composition has one, and `programCommands.getEffectiveParticipation`.
- Preserve existing injected-command tests for isolated HTTP route behavior.
- Update production-composition tests so they fail if future slices are implemented only by injected test servers.

**Dependencies**: Current Agonara test suite is green before the phase starts.

**Risks**: Production composition may currently use real random identifiers and wall-clock time, so the test must avoid brittle generated-id assumptions.

**Validation**:

- Targeted command: `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- Build command: `./scripts/run_silent.sh "build" npx tsc --noEmit`
- Inspect `git diff --check`.

**Completion signal**: Production-composition coverage proves Student Workspace open-answer HTTP routes are available through the real server wiring, and the Agonara test/build wrappers pass.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 2 - Operational Tracing and Diagnostics Contract

**Objective**: align request tracing, completion logs, diagnostics shape, and redaction with the operational cross-cutting spec.

**Key work items**:

- Add failing tests for `/operations/diagnostics` matching the documented diagnostics shape.
- Add failing tests proving accepted and rejected Identity, Program, Corpus, and Student Workspace HTTP routes emit redacted completion log events with the active request id.
- Add or refactor a common HTTP route completion logging path so route handlers do not have to duplicate redaction-sensitive log assembly.
- Preserve the distinction between operational logs, audit events, Program events, Program Membership events, and Corpus events.
- Add a test that fault responses and fault logs share the same request id and keep internal details redacted.
- If implementation shows the operational spec itself is wrong, stop this phase and create a separate spec/ADR review task before changing runtime behavior.

**Dependencies**: Phase 1 is complete so Student Workspace routes can participate in production-level logging coverage.

**Risks**: Logging every route can accidentally expose request bodies, session cookies, CSRF tokens, idempotency keys, SQL text, or provider/evaluator details.

**Validation**:

- Targeted command: `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- Build command: `./scripts/run_silent.sh "build" npx tsc --noEmit`
- Inspect `git diff --check`.

**Completion signal**: Operational tests cover request ids, accepted/rejected/fault logs, diagnostics shape, and redaction for the implemented HTTP surfaces.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 3 - Current-State Documentation Refresh

**Objective**: make top-level Agonara docs describe the actual implemented backend/domain state and current caveats.

**Key work items**:

- Update `agonara/README.md` so it names the implemented Identity, Program, Corpus, accepted checks, open-answer Student Workspace, evaluator, and Quick Check backend/domain slices.
- Update `agonara/docs/backlog.md` so storage ownership is no longer described as fully deferred; replace it with concrete remaining storage questions.
- Update `agonara/docs/implementation-notes.md` with post-first-slice current-state notes or split stale first-slice notes into a clearly historical section.
- Update `agonara/docs/intent_learning_program_app.md` traceability only where code/test surfaces changed in Phases 1 and 2 or where stale `n/a` entries need a clearer follow-up handoff.
- Update `agonara/docs/log.md` with the closure outcome.

**Dependencies**: Phases 1 and 2 are complete so docs can describe final behavior.

**Risks**: Docs may accidentally claim UI or production product capabilities that remain backend/domain-only.

**Validation**:

- Check touched Markdown files for front matter, heading hierarchy, and link correctness.
- Run `git diff --check`.
- Run `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara` if executable examples or runtime command examples changed.

**Completion signal**: README, backlog, implementation notes, Product Intent traceability, and log entries agree with implemented runtime and domain surfaces.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 4 - Quick Check HTTP API Handoff

**Objective**: turn the backend/domain-only Quick Check finding into a buildable transport slice without hiding answer-key or learner-state risks.

**Key work items**:

- Add a Quick Check HTTP API spec that maps existing domain commands and queries to session-backed routes.
- Define session, CSRF, idempotency, redaction, answer-key exclusion, owner-only reads, student delivery reads, curator candidate/acceptance routes, and rejection status mapping.
- Add an implementation plan for the Quick Check HTTP API under `agonara/docs/plans/`.
- Update Product Intent traceability so INT-04 points to the new API spec/plan as the next transport closure.
- Update `agonara/docs/log.md`.

**Dependencies**: Phase 3 has refreshed current-state docs so the new Quick Check handoff is not confused with already-implemented UI.

**Risks**: The API spec could leak protected answer-key behavior by treating Corpus curation reads and Student delivery reads as the same transport surface.

**Validation**:

- Check touched Markdown files for front matter, mandatory implementation-plan sections, traceability links, and `git diff --check`.
- No full test run is required if this phase remains docs-only and does not change executable examples or runtime behavior.

**Completion signal**: Quick Check HTTP work has a spec and implementation plan that are ready for strict TDD execution.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 5 - Quick Check HTTP API Implementation

**Objective**: implement the Quick Check HTTP API specified in Phase 4 while preserving answer-key protection and Student Workspace attempt ownership.

**Key work items**:

- Add failing HTTP API tests for student delivery listing/detail reads without answer keys or curator-only metadata.
- Add failing HTTP API tests for student quick-check submission with CSRF and idempotency behavior.
- Add failing HTTP API tests for owner-only quick-check attempt detail and list reads.
- Add failing HTTP API tests for curator candidate creation, listing, acceptance, rejection, and answer-key-inclusive curation reads if the Phase 4 API spec includes curator transport in this slice.
- Add route handling in `agonara/src/server.js` that delegates to existing Corpus and Student Workspace command/query boundaries.
- Add production-composition coverage for the new Quick Check routes.
- Update Product Intent traceability and `agonara/docs/log.md` after implementation.

**Dependencies**: Phase 4 is complete and the Quick Check HTTP API spec has stable route, envelope, redaction, and rejection contracts.

**Risks**: Student-facing delivery and attempt routes can leak answer keys, per-option correctness metadata, candidate ids, idempotency keys, or curator-only metadata if curation and student projections are mixed.

**Validation**:

- Targeted command: `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- Build command: `./scripts/run_silent.sh "build" npx tsc --noEmit`
- Inspect `git diff --check`.

**Completion signal**: Quick Check HTTP API tests and production-composition tests prove student delivery, submission, owner reads, and any scoped curator routes work through the real server wiring without protected answer-key leakage.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 6 - Deferred Product Slice Handoff

**Objective**: keep remaining accepted product stories visible as intentional future work with enough structure for separate specs and plans.

**Key work items**:

- Add or update a bounded Agonara next-slices document that names materials navigation, topic/period checks, progress/weak-area interpretation, and membership invitation/recovery flows.
- For each missing product area, name the first required artifact: research, ADR, spec, or implementation plan.
- Link the handoff from Product Intent or backlog.
- Update `agonara/docs/log.md`.

**Dependencies**: Phase 5 has separated Quick Check transport from broader product-slice work.

**Risks**: The handoff can become a vague backlog if it lacks owning artifacts and validation expectations.

**Validation**:

- Check touched Markdown files for front matter, links, and `git diff --check`.
- No full test run is required if this phase remains docs-only and does not change executable examples or runtime behavior.

**Completion signal**: Remaining product gaps are recorded as next-slice handoffs without being described as implemented.

**Commit**: Commit this phase after validation with a short imperative message.

## Done criteria

- Production `startServer()` wires Student Workspace commands when the implemented Student Workspace HTTP routes are part of the deployed runtime.
- Operational tracing and diagnostics behavior is either aligned with the current operational spec or the spec is revised in the same phase with matching tests.
- Top-level Agonara docs and traceability no longer describe the project as only an Identity and Operations implementation.
- Quick Check HTTP work has a spec, implementation plan, and implemented HTTP route tests that preserve answer-key protection and Student Workspace ownership.
- Remaining accepted product gaps are represented as bounded follow-up handoffs.
- All code/config phases pass `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`.
- All code/config phases pass `./scripts/run_silent.sh "build" npx tsc --noEmit`.
- `git diff --check` passes before each commit.

## Final closeout

Final gates: `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara` and `./scripts/run_silent.sh "build" npx tsc --noEmit` after code/config changes; docs-only phases require Markdown/front-matter/link checks plus `git diff --check`.
Archive plan: move to `agonara/docs/plans/implemented/agonara-gap-closure.md`
Commit archive move: yes
Push/PR: follow push policy
