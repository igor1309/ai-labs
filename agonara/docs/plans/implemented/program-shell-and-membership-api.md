---
date: 2026-05-28
model: gpt-5
description: "Implementation plan: Agonara Program shell and membership HTTP API."
---

# Program Shell and Membership HTTP API Implementation Plan

## Goal

Deliver the Agonara v0.0.1 Program shell and Program Membership HTTP API so browser clients can create and inspect Program shells, join/leave/rejoin Student membership, inspect effective participation, and inspect scoped Program domain events without introducing UI, CLI, corpus editing, or new Program domain rules.

This plan implements [Program Shell and Membership API](../../specs/program-shell-and-membership-api.md), [Program Shell and Membership First Slice](../../specs/program-shell-and-membership-first-slice.md), and ADR-004 through ADR-007 plus ADR-009. The API must preserve the existing Identity API conventions for envelopes, session cookies, CSRF, status mapping, redaction, and fault responses.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push

## Execution lock

Worktree mode: create new
Expected worktree: `worktrees/agonara-program-membership-api`
Expected branch: `codex/agonara-program-membership-api`
Preflight check: [x] done

## Scope guardrails

### In scope

- Server composition changes that inject `programCommands` beside `identityCommands`.
- HTTP route adapters for the endpoints listed in [Program Shell and Membership API](../../specs/program-shell-and-membership-api.md).
- Session and CSRF reuse through the existing `agonara_session` and `X-Agonara-CSRF` contract.
- Response-shaping adapters from existing Program service result names to API response names.
- HTTP status mapping for Program, session, and CSRF rejection reasons.
- Bounded event pagination and redaction for scoped Program and Program Membership event routes.
- Executable HTTP and acceptance tests that cover the API spec's required tests.

### Out of scope

- Admin UI or any Program UI.
- Program CLI commands.
- New Program domain behavior beyond the accepted service contract.
- Invitation creation, invitation acceptance, invitation decline, invitation revocation, Program archival, Program deletion, Program ownership transfer, Program policy changes, controlled Program admission, curator leave, curator removal, Admin exceptional recovery mutations, accepted corpus editing, Curator Workspace state, or Student Workspace state.
- Reworking Identity API routes except where shared helpers must handle Program API status mapping or malformed JSON consistently.
- Replacing the existing server framework.

## ADR traceability matrix

| ADR | Invariant | Phase |
|---|---|---|
| ADR-004 | Program Membership owns participation; API must call the Program Membership service instead of deriving authority from Identity roles. | Phase 3, Phase 4 |
| ADR-005 | Student first admission is self-join; active/left/removed membership states remain observable. | Phase 3 |
| ADR-006 | Program Membership remains the policy actor; HTTP routes are transport adapters. | Phase 2, Phase 3 |
| ADR-007 | Effective participation is a read-only authorization contract. | Phase 4 |
| ADR-009 | Program creation establishes initial Program Curator participation and does not grant Admin or Student participation. | Phase 2 |

## Product intent traceability

| Story | Phase preserving intent |
|---|---|
| CUR-01 - Create program from grounded sources | Phase 2 |
| STU-01 - See available programs | Phase 1 and Phase 2 |
| STU-18 - Join self-join program | Phase 3 |
| STU-19 - Leave active program | Phase 3 |
| STU-20 - Rejoin left program | Phase 3 |
| STU-21 - View my program membership state | Phase 3 |
| ADM-12 - View program membership state | Phase 4 and Phase 5 |
| ADM-15 - Audit membership changes | Phase 5 |

## TDD and commit discipline

Every implementation phase must use strict TDD:

- Add or update one focused failing HTTP or acceptance test.
- Run the targeted Agonara test command and capture a RED assertion failure. Compilation errors are not RED.
- Implement the minimum production change that turns that assertion GREEN.
- Repeat RED/GREEN for the phase until the phase objective is complete.
- Run the phase validation gates.
- Commit only the files tied to that phase after GREEN gates pass.

Each phase has its own local commit. Do not bundle unrelated phase work into one commit.

## Phase 1 — Program API composition and session bridge

**Objective**: wire Program commands into the HTTP server and prove read-only Program route session behavior through tests.

**Key work items**:

- Add `programCommands` as an optional `createServer` dependency.
- Compose `createProgramCommands` in `startServer` using the same database as Identity commands.
- Add a `handleProgramApi` boundary that runs after Identity API handling and before `404`.
- Add shared helpers for resolving the session Identity id and for shaping accepted/rejected Program API responses.
- Extend shared HTTP status mapping for Program rejection reasons so unknown Program reasons do not fall through to `500`.
- Implement the minimum `GET /programs` route needed to prove session resolution and empty-list response behavior.

**TDD sequence**:

1. RED: `GET /programs` without a session returns `401 session_not_found`.
2. GREEN: add Program route dispatch and session rejection mapping.
3. RED: `GET /programs` with a disabled session Identity returns `403 identity_disabled`.
4. GREEN: reuse Identity session resolution before calling Program commands.
5. RED: `GET /programs` with a valid active session returns `AcceptedResult<{ programs: [] }>` for an empty store.
6. GREEN: inject `programCommands`, resolve the session Identity, call `listProgramShells`, and map Program rejections through the shared HTTP status helper.

**Dependencies**: existing Identity session API and Program service implementation.

**Risks**: breaking existing Identity routes or server startup composition. Keep the Program handler optional in direct `createServer` tests and enabled in `startServer`.

**Validation**:

- Targeted HTTP tests for Phase 1 behavior.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 1 tests pass, full Node gates pass, and local commit `wire agonara program api session bridge` is created.

## Phase 2 — Program shell routes

**Objective**: implement Program list, create, and get routes with CSRF, validation, response shaping, and status mapping.

**Key work items**:

- Complete `GET /programs`.
- Implement `POST /programs`.
- Implement `GET /programs/{programId}`.
- Map service `programShell` to API `program`.
- Map service `initialCuratorMembership` to API `initialCuratorMembership`.
- Treat malformed JSON, missing body, non-object body, invalid title, and malformed description as `400 validation_failed`.
- Preserve redaction: no session ids, CSRF tokens, password data, SQL text, stack traces, or infrastructure details in responses or faults.

**TDD sequence**:

1. RED/GREEN `POST /programs` rejects missing CSRF before domain mutation.
2. RED/GREEN accepted `POST /programs` returns `ProgramCreated` and initial active `program_curator` membership.
3. RED/GREEN `POST /programs` invalid-body cases reject with `400 validation_failed`.
4. RED/GREEN accepted `GET /programs` lists created Program shells.
5. RED/GREEN `GET /programs/{programId}` returns known Programs and rejects unknown Programs with `404 program_not_found`.
6. RED/GREEN response redaction checks for Program shell routes.

**Dependencies**: Phase 1.

**Risks**: silently accepting malformed JSON because the current shared parser returns `{}` on parse failure. This phase must make malformed JSON behavior explicit for Program routes.

**Validation**:

- Targeted HTTP tests for Program shell routes.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 2 tests pass, full Node gates pass, and local commit `implement agonara program shell api` is created.

## Phase 3 — Student membership routes

**Objective**: implement current-user membership listing and Student self-join/leave/rejoin routes.

**Key work items**:

- Implement `GET /program-memberships/me`.
- Implement `POST /programs/{programId}/student-membership`.
- Implement `DELETE /programs/{programId}/student-membership`.
- Map service `programMembership` to API `membership`.
- Preserve idempotent active join and rejoin of left membership.
- Map leave conflicts to `409 membership_missing`, `409 membership_left`, and `409 membership_removed`.

**TDD sequence**:

1. RED/GREEN `GET /program-memberships/me` returns only memberships for the session Identity.
2. RED/GREEN first join creates active Student membership.
3. RED/GREEN repeated active join returns existing membership without a duplicate event.
4. RED/GREEN leave changes active Student membership to `left`.
5. RED/GREEN rejoin reactivates left Student membership.
6. RED/GREEN missing/left/removed leave and removed-join conflicts return specified `409` reasons.
7. RED/GREEN unknown Program paths return `404 program_not_found`.

**Dependencies**: Phase 2.

**Risks**: tests may need storage-level setup for removed membership because no public HTTP route creates removed Student membership in this slice. Use existing domain/storage helpers inside test setup only.

**Validation**:

- Targeted HTTP tests for Student membership routes.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 3 tests pass, full Node gates pass, and local commit `implement agonara student membership api` is created.

## Phase 4 — Effective participation route

**Objective**: expose read-only effective participation checks with self, Admin, and Program Curator authorization rules.

**Key work items**:

- Implement `GET /programs/{programId}/participation/{participationKind}`.
- Default omitted `identityId` to the session Identity.
- Require effective Admin or active Program Curator participation when checking another Identity.
- Reject unsupported participation kinds with `400 validation_failed`.
- Reject unknown Program path ids with `404 program_not_found` before returning participation data.
- Return `identity_not_active`, `program_not_accepting_participation`, membership-state reasons, and `allowed: true` exactly as specified.
- Prove the route is read-only.

**TDD sequence**:

1. RED/GREEN self Student and Program Curator checks for the session Identity.
2. RED/GREEN cross-identity check rejects an ordinary caller with `403 admin_or_curator_required`.
3. RED/GREEN cross-identity check accepts Admin callers.
4. RED/GREEN cross-identity check accepts active Program Curator callers for the Program.
5. RED/GREEN unknown target Identity returns `allowed: false` with `identity_not_active` after authorization.
6. RED/GREEN unsupported participation kind returns `400 validation_failed`.
7. RED/GREEN unknown Program returns `404 program_not_found`.
8. RED/GREEN read-only invariant: checks do not create or change membership rows or events.

**Dependencies**: Phase 3.

**Risks**: conflating service-level `program_not_accepting_participation` for unknown Programs with HTTP path resource semantics. The HTTP route must perform the Program existence check first and use `404 program_not_found` for unknown path ids.

**Validation**:

- Targeted HTTP tests for effective participation.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 4 tests pass, full Node gates pass, and local commit `implement agonara effective participation api` is created.

## Phase 5 — Scoped event routes and pagination

**Objective**: expose scoped Program and Program Membership event routes with Admin-or-curator authorization, bounded pagination, opaque cursors, and redaction.

**Key work items**:

- Implement `GET /programs/{programId}/events?limit={limit}&cursor={cursor}`.
- Implement `GET /programs/{programId}/membership-events?limit={limit}&cursor={cursor}`.
- Accept Admin callers for known Programs.
- Accept active Program Curator callers for their Programs.
- Reject ordinary callers with `403 admin_or_curator_required`.
- Return only events scoped to the requested Program.
- Default `limit` to `50`, cap accepted limits at `100`, reject invalid limits and malformed cursors with `400 validation_failed`.
- Ensure `reason` fields include only Program domain rejection reasons.
- Do not expose unscoped all-Program event routes in HTTP.

**TDD sequence**:

1. RED/GREEN event routes reject ordinary callers.
2. RED/GREEN event routes accept Admin callers for known Programs.
3. RED/GREEN event routes accept active Program Curator callers for their Programs.
4. RED/GREEN unknown Program paths reject with `404 program_not_found`.
5. RED/GREEN responses include only events scoped to the requested Program.
6. RED/GREEN default limit, max limit, invalid limit, and malformed cursor behavior.
7. RED/GREEN redaction and domain-only event reason checks.
8. RED/GREEN unscoped event HTTP routes remain unavailable.

**Dependencies**: Phase 4.

**Risks**: future cursor format becoming coupled to database internals. Keep cursors opaque at the HTTP contract even if the first implementation encodes a simple bounded offset.

**Validation**:

- Targeted HTTP tests for event routes.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 5 tests pass, full Node gates pass, and local commit `implement agonara program event api` is created.

## Phase 6 — Executable acceptance and closeout

**Objective**: prove the complete API slice through an end-to-end acceptance flow, update logs, and archive the implemented plan in the same change set.

**Key work items**:

- Add or extend executable acceptance coverage for the full logged-in flow from the spec.
- Verify CSRF enforcement across all state-changing Program API requests.
- Verify no Program UI, Admin UI, CLI, invitation, corpus editing, curator workspace, or student workspace behavior was introduced.
- Update `agonara/docs/log.md`.
- Move this plan to `agonara/docs/plans/implemented/program-shell-and-membership-api.md` with `git mv`.

**TDD sequence**:

1. RED/GREEN executable acceptance flow: create Program, receive initial curator membership, list Programs, join as Student, list memberships, leave, rejoin, check effective participation, inspect scoped events.
2. RED/GREEN closeout guard checks for CSRF enforcement and out-of-scope route absence if not already covered by earlier tests.

**Dependencies**: Phase 5.

**Risks**: acceptance test duplication. Keep acceptance coverage broad and behavioral; keep detailed edge cases in focused HTTP tests from earlier phases.

**Validation**:

- Targeted executable acceptance test.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git status --short` clean after final commit.

**Completion signal**: acceptance flow and final gates pass, plan is archived under `implemented/`, and local commit `complete agonara program membership api` is created.

## Done criteria

- The HTTP API implements every endpoint in [Program Shell and Membership API](../../specs/program-shell-and-membership-api.md).
- Every Program API response uses the shared `accepted`, `rejected`, or `fault` envelope.
- Session and CSRF behavior matches the existing Identity HTTP API conventions.
- All state-changing Program API routes reject session and CSRF failures before domain mutation.
- Program shell routes, Student membership routes, effective participation routes, and event routes satisfy their specified status mappings.
- Event route pagination is bounded, cursors are opaque, invalid cursors reject with `400 validation_failed`, and unscoped event HTTP routes are absent.
- Responses and faults satisfy redaction rules for secrets, session identifiers, CSRF tokens, credentials, SQL text, stack traces, and infrastructure details.
- Every required test in the API spec is covered by focused HTTP tests or the executable acceptance flow.
- Each implementation phase has a separate local commit created only after its targeted tests, Agonara workspace tests, repo tests, and typecheck pass.
- Final branch state is clean after closeout.
- No Admin UI, Program UI, CLI, invitation, corpus editing, curator workspace, or student workspace behavior is introduced.

## Final closeout

Final gates: `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`, `./scripts/run_silent.sh "tests" npm test`, `./scripts/run_silent.sh "build" npx tsc --noEmit`, docs structure/link checks for touched Markdown, and `git status --short` clean.
Archive plan: move to `agonara/docs/plans/implemented/program-shell-and-membership-api.md`.
Commit archive move: yes.
Push/PR: follow push policy; do not push unless explicitly requested later.
