---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Implementation plan for Agonara Identity & Role Management and operational cross-cutting v0.0.1."
---

# Identity and Operations First-Slice Implementation Plan

## Source

This plan implements the first Agonara backend slice defined by:

- [Identity & Role Management First Slice](../../specs/identity-role-management-first-slice.md);
- [Identity & Role Management API and CLI](../../specs/identity-role-management-api-cli.md);
- [Operational Cross-Cutting First Slice](../../specs/operational-cross-cutting-first-slice.md);
- [ADR-001](../../adr/adr-001-internal-identity-as-agonara-ownership-subject.md), [ADR-002](../../adr/adr-002-role-authority-scope-model.md), [ADR-003](../../adr/adr-003-admin-recovery-invariant.md), [ADR-004](../../adr/adr-004-program-membership-owns-program-participation.md), [ADR-005](../../adr/adr-005-program-membership-state-and-first-admission-policy.md), [ADR-006](../../adr/adr-006-program-membership-policy-actor.md), [ADR-007](../../adr/adr-007-effective-participation-authorization-contract.md), and [ADR-008](../../adr/adr-008-first-slice-authentication-session-and-credential-boundary.md).

The target outcome is a thin vertical backend slice that proves bootstrap, local-password authentication, server-managed sessions, Admin authority, auditability, request correlation, redaction, health, diagnostics, and executable acceptance behavior before learning-domain modules are implemented.

## Execution Lock

- Execution mode: auto-continue
- Human review between tasks: no
- Worktree mode: create new
- Expected worktree: `worktrees/agonara-identity-operations-first-slice`
- Expected branch: `codex/agonara-identity-operations-first-slice`
- Push policy: no push
- Preflight check: [x] done
- Final archive behavior: move this file to `agonara/docs/plans/implemented/identity-and-operations-first-slice.md` in the same PR as the implementation closeout.

## Plan Acceptance Checklist

- [x] Preflight verifies `git worktree list --porcelain`, current branch, current worktree path, and separate worktree status before implementation edits.
- [x] Installed runtime and package configuration are verified before choosing or using implementation dependencies.
- [x] Every step ends with targeted verification and a local commit.
- [x] Every step self-review fixes fail/warn findings before the next step starts.
- [x] Code/config/dependency/CI changes run `./scripts/run_silent.sh "tests" npm test` and `./scripts/run_silent.sh "build" npx tsc --noEmit` before commit.
- [x] Docs-only updates run Markdown structure, local-link, and diff-scope checks before commit.
- [x] Plan tracker checkboxes are updated only after verified evidence.
- [x] The plan is moved to `implemented/` only after all required implementation and final gates pass.

## Scope

### In Scope

- Agonara backend skeleton and test harness for the first identity/operations slice.
- Agonara per-project CI wiring for backend tests, build, and Docker smoke verification.
- Dockerfile and local compose/runtime smoke path for the first private self-hosted backend container.
- Persistent Identity, local password credential, session, Admin authority, and audit state.
- Request ID propagation, structured operational logs, health, diagnostics, and redaction behavior.
- HTTP API endpoints required by the Identity API/CLI spec.
- `agonara identity` bootstrap CLI surface.
- Executable acceptance scenarios for clean-instance bootstrap, login, Admin operations, last-Admin protection, CSRF, rate limiting, audit listing, redaction, and operational diagnostics.
- Minimum backup/restore behavior required by the identity spec: Identity, credential, Admin authority, and audit state are recoverable; active sessions are not restored; restore activation refuses no-Admin state.

### Out of Scope

- Student Workspace, Curator Workspace, Corpus Storage, and Program Membership implementation.
- Product analytics.
- MFA, passkeys, OIDC, SSO, self-service recovery, recovery codes, and privileged-action confirmation.
- Multi-tenant, organization, or team authorization.
- Program content, learner progress, curator decisions, assessment logic, and LLM workflow behavior.

## Implementation Assumptions

- The implementation should follow the existing repo's Node/TypeScript test and build gates unless preflight discovers an accepted Agonara-specific implementation decision that supersedes them.
- New third-party runtime dependencies must be added only after verifying installed versions, package manager state, and the concrete APIs used by the implementation.
- The v0.0.1 default substrate is a Node/TypeScript Agonara backend package with a local transactional SQL store and checked-in migrations.
- The default storage target is SQLite-compatible local persistence for the private self-hosted slice unless preflight finds an already accepted Agonara storage decision.
- The v0.0.1 deployment substrate is Dockerized private self-hosting, matching [Agonara Deployment Target](../../deployment-target.md).
- Docker-producing implementation changes must follow the Docker Discipline gate: local `docker build`, container start, health check, and request/log verification before push.
- Persistence must support uniqueness and last-Admin invariants atomically; if SQLite-compatible persistence or the chosen storage layer cannot provide this, the step must stop and document the blocking finding before continuing.
- Password hashing, cookie, CSRF, CLI, and storage dependencies must have their concrete APIs verified before implementation code calls them.
- Operational logs and audit events are distinct records. Audit events are queryable security/domain-change records; operational logs are diagnostic records.

## Steps

### Step 1 — Preflight and Implementation Substrate

Create the dedicated worktree and branch declared in the execution lock. Verify current repo state, installed Node/npm/TypeScript versions, package workspace configuration, available test/build commands, Docker availability, and candidate runtime dependency APIs. Add the minimal Agonara package or backend skeleton only after the toolchain, Docker, and dependency API state is verified.

Expected changes:

- Agonara backend package or equivalent source/test directories.
- `.github/workflows/agonara-core.yml` reusable workflow for Agonara backend tests, build, and Docker smoke verification.
- `.github/workflows/ci.yml` dispatcher updates: Agonara path filters, `agonara-core` job, and `report`/`notify` dependencies.
- Dockerfile and local compose or equivalent container smoke path for the Agonara backend.
- Package/workspace configuration only if required by the chosen skeleton.
- Checked-in note or plan tracker evidence naming the runtime, Docker, storage, migration, password-hashing, cookie, CSRF, and CLI APIs that were verified.
- Agonara project log entry for the backend skeleton and CI handoff.
- Repo-level README/component or release-unit updates only if the implementation creates a new component or release unit under repo rules.

Verification:

- `git worktree list --porcelain`
- `git branch --show-current`
- toolchain/version inspection commands for the chosen runtime
- Docker version/build capability inspection
- dependency API inspection commands for any runtime dependency used by the skeleton
- workflow structure check against `.github/workflows/AGENTS.md` and `.github/workflows/README.md`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- local `docker build` for the Agonara backend container
- local container start and `/operations/health` smoke request once the health route exists; until then, container process start is the Step 1 smoke check

Commit:

- `scaffold agonara identity backend`

### Step 2 — Operational Walking Skeleton

Implement request ID generation/propagation, structured operational log emission, generic fault responses, unauthenticated `/operations/health`, and the unauthenticated rejection path for `/operations/diagnostics`. Full Admin-session diagnostics acceptance is completed after Identity session resolution exists.

Expected changes:

- Request correlation middleware or equivalent boundary code.
- Operational log event shape and redaction helpers.
- Health and diagnostics routes.
- Tests for request IDs, redacted faults, unauthenticated health, and unauthenticated diagnostics rejection.

Verification:

- targeted operational tests for request IDs, redacted faults, health, and diagnostics rejection
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- local `docker build`
- local container start
- `/operations/health` smoke request through the container
- structured operational log verification for that health request, with no bind mounts to temporary worktree-only paths

Commit:

- `implement agonara operational skeleton`

### Step 3 — Persistence, Migrations, and Domain Invariants

Implement persisted records and migration/bootstrap storage for Identity, local password credential, session, Admin authority, and audit events. Encode uniqueness and invariant checks close to the storage boundary.

Expected changes:

- Migration or schema initialization path.
- Repository/store functions for the identity records.
- Tests for unique login, one credential per Identity, session expiry/revocation fields, audit append behavior, and atomic last-Admin checks.

Verification:

- targeted persistence/domain invariant tests
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

Commit:

- `persist agonara identity records`

### Step 4 — Identity Core Commands

Implement `bootstrapFirstAdmin`, `login`, `resolveSession`, and `logout`.

Expected changes:

- Local password hashing and verification using a vetted implementation from the chosen stack.
- Bootstrap secret validation without persisting the secret as Agonara state.
- Server-managed opaque session creation, seven-day expiry, revocation, and disabled-Identity rejection.
- Accepted/rejected audit events for bootstrap.

Verification:

- targeted command tests for bootstrap, login, session resolution, logout, password hashing, disabled identities, and no plaintext persistence
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

Commit:

- `implement agonara identity core commands`

### Step 5 — Admin Commands and Audit

Implement Admin-only identity creation, credential binding, Identity disablement, Admin grant/revoke, operational access inspection, audit listing, and last-effective-Admin protection.

Expected changes:

- Admin authority checks for all protected commands.
- Duplicate-login and one-credential-per-Identity rejection paths.
- Session invalidation for disabled Identities.
- Accepted and rejected audit events, including rejected last-Admin attempts.

Verification:

- targeted Admin command and audit tests
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

Commit:

- `implement agonara admin identity commands`

### Step 6 — HTTP API, Sessions, CSRF, and Rate Limiting

Implement the HTTP endpoints from the Identity API/CLI spec and connect them to the operational cross-cutting boundary.

Expected changes:

- Bootstrap, session, identity, credential, Admin, operational-access, and audit-event routes.
- `agonara_session` cookie behavior.
- CSRF token creation and verification for state-changing session-backed requests.
- API status/reason mapping.
- Login/bootstrap rate limiting that avoids credential or disabled-account disclosure.
- Sensitive-value redaction in responses, faults, and logs.
- Full `/operations/diagnostics` Admin-session acceptance using resolved Identity sessions.

Verification:

- targeted HTTP API tests for endpoint contracts, cookies, CSRF, status mappings, rate limits, audit listing, Admin diagnostics acceptance, and redaction
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

Commit:

- `implement agonara identity http api`

### Step 7 — Operator CLI

Implement `agonara identity bootstrap-status --json` and `agonara identity bootstrap-admin --display-name <name> --login <login> --stdin-json --json`.

Expected changes:

- CLI command parsing.
- JSON stdin contract for `BootstrapAdminStdin`.
- Shared accepted/rejected result envelope.
- Exit codes `0`, `1`, and `2`.
- Diagnostics on stderr with no secret leakage.

Verification:

- targeted CLI tests for accepted bootstrap, rejected bootstrap, usage errors, stdout/stderr separation, and secret redaction
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

Commit:

- `implement agonara identity cli`

### Step 8 — Backup and Restore Minimum

Implement the minimum backup/restore behavior required for the identity first slice.

Expected changes:

- Export/import path for Identity, local password credential, Admin authority, and audit state.
- Restore path that starts with no active sessions.
- Restore activation guard that rejects no-effective-Admin state.
- Operational log events for backup/restore start, accepted completion, rejected completion, and faulted completion.

Verification:

- targeted backup/restore tests for included state, excluded active sessions, historical audit references, no-Admin restore rejection, and operational log events
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

Commit:

- `implement agonara identity backup restore`

### Step 9 — Executable Acceptance and Closeout

Add black-box executable acceptance scenarios for the first slice and complete documentation/log closeout.

Expected changes:

- Executable acceptance tests for clean bootstrap via CLI and HTTP, login/session resolution, logout, non-Admin rejection, Admin grant/revoke, last-Admin protection, CSRF, rate limiting, audit listing, request correlation, redacted faults, and Admin-only diagnostics.
- Updated Agonara and repo logs for implementation completion.
- Plan tracker updates with verified evidence.
- Plan moved to `agonara/docs/plans/implemented/identity-and-operations-first-slice.md`.

Verification:

- executable acceptance tests
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- final local `docker build`, container start, `/operations/health` smoke request, and structured-log verification
- Markdown structure and local-link checks for changed docs
- `git status --short` is clean after final commit

Commit:

- `complete agonara identity first slice`

## Final Gate

- [x] All implementation steps have local commits.
- [x] All required tests and build checks pass in the implementation worktree.
- [x] Agonara CI workflow wiring exists and is covered by the dispatcher once Agonara backend code exists.
- [x] Docker build, container start, `/operations/health`, and structured-log verification pass for the final implementation state.
- [x] Agonara project log and repo log are current.
- [x] Plan checkboxes reflect verified evidence.
- [x] This plan is moved to `agonara/docs/plans/implemented/`.
- [x] No uncommitted changes remain.
