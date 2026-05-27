---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Implementation plan for Agonara Identity & Role Management and operational cross-cutting v0.0.1."
---

# Identity and Operations First-Slice Implementation Plan

## Source

This plan implements the first Agonara backend slice defined by:

- [Identity & Role Management First Slice](../specs/identity-role-management-first-slice.md);
- [Identity & Role Management API and CLI](../specs/identity-role-management-api-cli.md);
- [Operational Cross-Cutting First Slice](../specs/operational-cross-cutting-first-slice.md);
- [ADR-001](../adr/adr-001-internal-identity-as-agonara-ownership-subject.md) through [ADR-008](../adr/adr-008-first-slice-authentication-session-and-credential-boundary.md).

The target outcome is a thin vertical backend slice that proves bootstrap, local-password authentication, server-managed sessions, Admin authority, auditability, request correlation, redaction, health, diagnostics, and executable acceptance behavior before learning-domain modules are implemented.

## Execution Lock

- Execution mode: auto-continue
- Human review between tasks: no
- Worktree mode: create new
- Expected worktree: `worktrees/agonara-identity-operations-first-slice`
- Expected branch: `codex/agonara-identity-operations-first-slice`
- Push policy: no push
- Preflight check: [ ] done
- Final archive behavior: move this file to `agonara/docs/plans/implemented/identity-and-operations-first-slice.md` in the same PR as the implementation closeout.

## Plan Acceptance Checklist

- [ ] Preflight verifies `git worktree list --porcelain`, current branch, current worktree path, and separate worktree status before implementation edits.
- [ ] Installed runtime and package configuration are verified before choosing or using implementation dependencies.
- [ ] Every step ends with targeted verification and a local commit.
- [ ] Every step self-review fixes fail/warn findings before the next step starts.
- [ ] Code/config/dependency/CI changes run `./scripts/run_silent.sh "tests" npm test` and `./scripts/run_silent.sh "build" npx tsc --noEmit` before commit.
- [ ] Docs-only updates run Markdown structure, local-link, and diff-scope checks before commit.
- [ ] Plan tracker checkboxes are updated only after verified evidence.
- [ ] The plan is moved to `implemented/` only after all required implementation and final gates pass.

## Scope

### In Scope

- Agonara backend skeleton and test harness for the first identity/operations slice.
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
- Persistence must support uniqueness and last-Admin invariants atomically; if the chosen storage layer cannot provide this, the step must stop and document the blocking finding before continuing.
- Operational logs and audit events are distinct records. Audit events are queryable security/domain-change records; operational logs are diagnostic records.

## Steps

### Step 1 — Preflight and Implementation Substrate

Create the dedicated worktree and branch declared in the execution lock. Verify current repo state, installed Node/npm/TypeScript versions, package workspace configuration, and available test/build commands. Add the minimal Agonara package or backend skeleton only after the toolchain state is verified.

Expected changes:

- Agonara backend package or equivalent source/test directories.
- Package/workspace configuration only if required by the chosen skeleton.
- Agonara project log entry if source files are introduced.
- Repo-level README/component or release-unit updates only if the implementation creates a new component or release unit under repo rules.

Verification:

- `git worktree list --porcelain`
- `git branch --show-current`
- toolchain/version inspection commands for the chosen runtime
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

Commit:

- `scaffold agonara identity backend`

### Step 2 — Operational Walking Skeleton

Implement request ID generation/propagation, structured operational log emission, generic fault responses, `/operations/health`, and Admin-gated `/operations/diagnostics` with redaction rules.

Expected changes:

- Request correlation middleware or equivalent boundary code.
- Operational log event shape and redaction helpers.
- Health and diagnostics routes.
- Tests for request IDs, redacted faults, unauthenticated health, Admin-only diagnostics, and coarse diagnostic reasons.

Verification:

- targeted operational tests
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

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

Verification:

- targeted HTTP API tests for endpoint contracts, cookies, CSRF, status mappings, rate limits, audit listing, and redaction
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
- Markdown structure and local-link checks for changed docs
- `git status --short` is clean after final commit

Commit:

- `complete agonara identity first slice`

## Final Gate

- [ ] All implementation steps have local commits.
- [ ] All required tests and build checks pass in the implementation worktree.
- [ ] Agonara project log and repo log are current.
- [ ] Plan checkboxes reflect verified evidence.
- [ ] This plan is moved to `agonara/docs/plans/implemented/`.
- [ ] No uncommitted changes remain.
