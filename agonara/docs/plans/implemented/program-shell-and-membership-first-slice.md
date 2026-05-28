---
date: 2026-05-27
model: claude-opus-4-7
description: "Implementation plan for Agonara Program Shell and Membership First Slice (v0.0.1)."
---

# Program Shell and Membership First-Slice Implementation Plan

## Source

This plan implements:

- [Program Shell and Membership First Slice](../specs/program-shell-and-membership-first-slice.md);
- [ADR-004](../adr/adr-004-program-membership-owns-program-participation.md), [ADR-005](../adr/adr-005-program-membership-state-and-first-admission-policy.md), [ADR-006](../adr/adr-006-program-membership-policy-actor.md), [ADR-007](../adr/adr-007-effective-participation-authorization-contract.md), and [ADR-009](../adr/adr-009-program-shell-and-initial-curator-participation.md).

The target outcome is a thin vertical backend slice that proves Program shell creation, atomic initial Program Curator participation, Student self-join/leave/rejoin, effective-participation read decisions, queryable Program and Program Membership events, and backup/restore coverage for these records.

## Goal

Deliver the Agonara v0.0.1 internal service contract for Program shells and Program Membership: commands `createProgramShell`, `joinSelfJoinProgram`, `leaveStudentProgram`; queries `listProgramShells`, `getProgramShell`, `getEffectiveParticipation`, `listMyProgramMemberships`, `listProgramEvents`, `listProgramMembershipEvents`; and the persisted records, atomicity, authorization, and backup/restore behavior they require.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: push at closeout

## Execution lock

Worktree mode: create new
Expected worktree: `worktrees/agonara-program-shell-and-membership-first-slice`
Expected branch: `agonara-program-shell-and-membership-first-slice`
Preflight check: [x] done

## Scope guardrails

### In scope

- New `agonara/src/program.js` module exposing the spec command/query surface as `createProgramCommands({ database, generateId, now })`.
- `agonara/src/storage.js` schema and helpers for Program shells, Program Memberships, Program events, and Program Membership events.
- Atomicity of Program shell creation and initial Program Curator membership.
- `getEffectiveParticipation` read-only authorization contract.
- Backup/restore coverage for the new records, including the "no orphan Program shell" guard.
- Tests covering every numbered requirement in the spec's `Tests (required)` section.

### Out of scope

- HTTP API surface and CLI for Program shell or membership operations (the spec calls for an internal service contract; HTTP/CLI routes are deferred to a later slice).
- Admin UI changes for Program inspection.
- Program invitation creation, controlled-admission policies, archival, deletion, ownership transfer, curator leave/removal, policy changes, accepted-corpus editing, learner state, draft suggestions, Student Workspace.
- Cross-cutting operational logs beyond what is already implemented for identity (no new operational log shapes are introduced by this slice).

## ADR traceability matrix

| ADR | Invariant | Phase |
|---|---|---|
| ADR-004 | Program Membership owns participation | Phase 2 (commands) |
| ADR-005 | First admission policy is `self_join`; state model active/left/removed | Phase 2 (commands), Phase 3 (events) |
| ADR-006 | Program Membership is the policy actor | Phase 2 (commands) |
| ADR-007 | Effective-participation is a read-only authorization contract | Phase 3 (queries) |
| ADR-009 | Program shell creation atomically creates initial curator membership | Phase 2 (commands) |

## Product intent traceability

| Story | Phase preserving intent |
|---|---|
| CUR-01 — Create program from grounded sources | Phase 2 — `createProgramShell` |
| STU-01 — See available programs | Phase 3 — `listProgramShells` / `getProgramShell` |
| STU-18 — Join self-join program | Phase 2 — `joinSelfJoinProgram` first join |
| STU-19 — Leave active program | Phase 2 — `leaveStudentProgram` |
| STU-20 — Rejoin left program | Phase 2 — `joinSelfJoinProgram` rejoin path |
| STU-21 — View my program membership state | Phase 3 — `listMyProgramMemberships` |
| ADM-12 — View program membership state | Phase 3 — event/membership queries |
| ADM-15 — Audit membership changes | Phase 2 + Phase 3 — accepted and rejected events |

## Phase 1 — Storage substrate

Objective: extend the SQLite schema and storage helpers to persist Program shells, Program Memberships, Program events, and Program Membership events.

Key work items:

- Add `program_shells`, `program_memberships`, `program_events`, `program_membership_events` tables in `initializeIdentityStorage`.
- Add insertion, lookup, and listing helpers used by the command and query layer.
- Encode Program Membership uniqueness per `(program_id, identity_id, participation_kind)` so rejoin reuses the existing row.

Dependencies: existing identity/storage layer.

Risks: schema migration drift against existing tests. Mitigated by additive `create table if not exists` and by re-running the full suite.

Validation:

- Targeted storage tests for the new tables (uniqueness, lookup, listing).
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

Completion signal: new storage helpers land with passing targeted tests and the full suite still green. Local commit `persist agonara program shell and membership records`.

## Phase 2 — Program commands

Objective: implement `createProgramShell`, `joinSelfJoinProgram`, and `leaveStudentProgram` with their accepted/rejected event side effects.

Key work items:

- New `agonara/src/program.js` exposing `createProgramCommands({ database, generateId, now })`.
- Atomic Program shell + initial curator membership transaction.
- Active/left/removed Student membership transitions, including idempotent active-join and rejoin reuse of the existing membership row.
- Rejected paths emit Program or Program Membership events when the acting Identity (and Program, for membership commands) both exist.

Dependencies: Phase 1.

Risks: subtle event-emission order under rejection. Mitigated by per-rule tests asserting event shape and outcome.

Validation:

- Targeted command tests covering spec requirements 1–34.
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

Completion signal: command tests pass; full suite green. Local commit `implement agonara program commands`.

## Phase 3 — Program queries and effective participation

Objective: implement `listProgramShells`, `getProgramShell`, `getEffectiveParticipation`, `listMyProgramMemberships`, `listProgramEvents`, and `listProgramMembershipEvents`.

Key work items:

- Read-only `getEffectiveParticipation` mapping membership state to allowed/reason.
- `listMyProgramMemberships` scoping to the acting Identity, including non-active rows.
- Event queries with Admin-or-curator authorization for each returned Program.
- Unscoped event queries for non-Admins return only events for Programs where the caller has effective curator participation.

Dependencies: Phase 2.

Risks: leaking events for Programs where the caller lacks effective curator participation. Mitigated by per-Program filter on the read path and tests for both scoped and unscoped queries.

Validation:

- Targeted query tests covering spec requirements 35–48 and 51.
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

Completion signal: query tests pass; full suite green. Local commit `implement agonara program queries`.

## Phase 4 — Backup/restore extension

Objective: include the new records in identity backup/restore and reject restores whose Program shells lack at least one active Program Curator membership.

Key work items:

- Extend `exportIdentityBackup` with `programShells`, `programMemberships`, `programEvents`, `programMembershipEvents`.
- Extend `restoreIdentityBackup` to insert and validate the new state in the same transaction.
- Restore guard: refuse activation if any Program shell would be restored without at least one active `program_curator` membership.

Dependencies: Phase 1.

Risks: existing backup-restore tests depending on backup shape. Mitigated by additive fields and tolerating absence in legacy backups.

Validation:

- Targeted backup/restore tests covering spec requirements 49–50.
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

Completion signal: backup/restore tests pass; full suite green. Local commit `extend agonara backup restore for program state`.

## Phase 5 — Closeout

Objective: refresh logs, move the plan to `implemented/`, open the PR.

Key work items:

- `agonara/docs/log.md` entry: implement Program Shell and Membership first slice.
- `docs/log.md` entry: same outcome at repo level.
- `git mv` this plan to `agonara/docs/plans/implemented/program-shell-and-membership-first-slice.md` in the same PR.
- Push branch and open PR with `--merge --auto --delete-branch` once CI is green.

Dependencies: Phases 1–4.

Risks: skipping the plan-archive move. Mitigated by making it part of the same closeout commit.

Validation:

- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git status --short` clean after final commit.

Completion signal: PR is open, auto-merge enabled.

## Done criteria

- All phases complete with passing targeted tests.
- Full Agonara test suite green (`./scripts/run_silent.sh "tests" npm test`).
- Repo Node/TypeScript typecheck green (`./scripts/run_silent.sh "build" npx tsc --noEmit`).
- Every numbered requirement in the spec's `Tests (required)` section is exercised by at least one test.
- Backup/restore exports and imports the new state and refuses orphan Program shells without active curator membership.

## Final closeout

Final gates: targeted suites, `./scripts/run_silent.sh "tests" npm test`, `./scripts/run_silent.sh "build" npx tsc --noEmit`, `git status --short` clean.
Archive plan: move to `agonara/docs/plans/implemented/program-shell-and-membership-first-slice.md`.
Commit archive move: yes — bundled in the implementation PR.
Push/PR: push branch, open PR with `--merge --auto --delete-branch`.
