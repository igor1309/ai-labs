---
date: 2026-05-27
model: gpt-5
description: "Implementation plan: build the Agonara Admin operations UI board over the existing Identity API."
---

# Admin Operations UI Board Implementation Plan

## Goal

Build a thin, private-instance Admin operations board for the already implemented Agonara Identity HTTP API. The board lets an operator initialize the instance, sign in, inspect identities, create and disable identities, bind local password credentials, grant or revoke Admin authority, inspect operational access, and inspect audit events without expanding into student, curator, or Program Membership workflows.

Source artifacts:

- [Identity & Role Management First Slice](../../specs/identity-role-management-first-slice.md);
- [Identity & Role Management API and CLI](../../specs/identity-role-management-api-cli.md);
- [Operational Cross-Cutting First Slice](../../specs/operational-cross-cutting-first-slice.md);
- [Agonara Admin User Stories](../../admin_user_stories.md), especially ADM-01 through ADM-05, ADM-08 through ADM-11;
- [ADR-001](../../adr/adr-001-internal-identity-as-agonara-ownership-subject.md), [ADR-002](../../adr/adr-002-role-authority-scope-model.md), [ADR-003](../../adr/adr-003-admin-recovery-invariant.md), and [ADR-008](../../adr/adr-008-first-slice-authentication-session-and-credential-boundary.md).

## Execution mode

- Mode: auto-continue
- Human review between tasks: no
- Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
- Push policy: no push

## Execution lock

- Worktree mode: create new
- Expected worktree: `worktrees/agonara-admin-operations-ui-board`
- Expected branch: `codex/agonara-admin-operations-ui-board`
- Preflight check: [x] done

Gate checklist:

- [x] Preflight verifies `git worktree list --porcelain`, current branch, current worktree path, and separate worktree status before implementation edits.
- [x] Existing Agonara runtime, package scripts, API routes, Docker behavior, and UI dependency state are verified before choosing the UI substrate.
- [x] Every phase ends with targeted verification and a local commit.
- [x] Every phase self-review fixes fail/warn findings before the next phase starts.
- [x] Code, config, CI, generated-artifact, or executable-example changes run `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "tests" npm test` and `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit` before commit.
- [x] Docker-producing changes run local `docker build`, container start, health check, and UI/API smoke verification before push.
- [x] UI changes run browser verification against desktop and mobile viewports, with screenshots or equivalent checked evidence.
- [x] Docs-only updates run Markdown structure, local-link, and diff-scope checks before commit.
- [x] Plan tracker checkboxes are updated only after verified evidence.

## Scope guardrails

In scope:

- A browser-accessible Admin operations UI served by the Agonara backend or another Agonara-owned runtime chosen during preflight.
- First-Admin bootstrap screen.
- Login, active session display, and logout.
- Identity list with active/disabled state and effective Admin indication.
- Identity creation.
- Local password credential binding for an existing Identity.
- Identity disablement with last-Admin rejection surfaced clearly.
- Admin grant and revoke with last-Admin rejection surfaced clearly.
- Operational access inspection for an Identity.
- Audit event list for identity, credential, Admin, and bootstrap operations.
- CSRF token handling using the existing HTTP API contract.
- Error rendering for accepted, rejected, and fault responses without leaking secrets, password hashes, session identifiers, or audit target session identifiers.
- Tests for state transitions, API integration, and UI behavior.
- Docker and CI updates only where required to verify or serve the UI.

Out of scope:

- Student Workspace UI.
- Curator Workspace UI.
- Program Membership UI and ordinary participation flows.
- Corpus editing, learning progress, assessment, or LLM-assisted learning behavior.
- MFA, passkeys, OIDC, SSO, recovery codes, and self-service credential recovery.
- Multi-tenant, organization, or team administration.
- A general-purpose design system.
- Marketing, landing-page, or public website work.

Implementation guardrails:

- The current backend HTTP API remains the primary integration boundary.
- The first UI should prefer the smallest substrate that fits the existing Node backend and test stack. A server-served static HTML/CSS/JavaScript board is the default candidate unless preflight finds an existing accepted frontend substrate.
- No new frontend framework dependency should be added unless preflight shows that the no-framework board would be materially harder to test, maintain, or serve.
- Browser session state should rely on the existing `agonara_session` cookie and CSRF token responses.
- UI state should be refreshed from API reads after each mutation rather than trusting local optimistic state for authority decisions.
- Secrets and passwords may be entered into forms but must not be echoed back into visible UI, logs, URLs, or persisted client state.
- The UI must not implement client-side authority rules that differ from the API; the API remains the source of truth for acceptance, rejection, CSRF, session, and last-Admin invariants.

UX guardrails:

- Show the first actionable operational state immediately.
- Use compact tables, forms, status chips, and action buttons.
- Keep destructive actions explicit and confirmable.
- Show rejected API reasons in operator-readable language.
- Avoid decorative cards, oversized hero sections, and explanatory in-app copy.
- Keep all controls reachable on small desktop and mobile screens without text overlap.

## Product intent traceability

| Story | Delivered or preserved by |
|---|---|
| ADM-01 — Initialize private instance | Phase 3 bootstrap flow |
| ADM-02 — Create internal identity | Phase 4 identity creation |
| ADM-03 — Bind credential to identity | Phase 4 credential binding |
| ADM-04 — Disable identity | Phase 4 disable action |
| ADM-05 — Inspect identities and credential bindings | Phase 4 identity board |
| ADM-08 — Assign or revoke admin role | Phase 4 Admin grant/revoke |
| ADM-09 — Prevent last-admin removal | Phase 4 rejected-state display backed by API invariant |
| ADM-10 — Audit identity and access operations | Phase 5 audit event inspection |
| ADM-11 — Include identity state in backup and restore | Preserved by keeping backup/restore out of UI mutation scope |

## Preflight decision

The Admin board will be a server-served static HTML/CSS/JavaScript surface mounted in the existing Agonara Node runtime. Preflight verified Node 22, npm scripts, Docker, Playwright availability, the packaged CLI symlink after `npm ci`, and the existing Identity HTTP routes. No frontend framework dependency is introduced for this slice.

## Phase 1 — Preflight and UI substrate decision

**Objective**: Establish the implementation worktree and choose the UI substrate from verified repo state.

**Key work items**:

- Create the dedicated worktree and branch declared in the execution lock.
- Verify current Agonara source state, package scripts, Node/npm versions, browser-test tooling availability, Docker behavior, and exact HTTP API responses the UI will consume.
- Decide and document the UI substrate before writing UI code.
- Update the plan tracker preflight checkbox only after verified evidence.

**Dependencies**: None.

**Risks**: Choosing a UI substrate before verifying existing tooling could add unnecessary dependencies or make browser verification harder.

**Validation**:

- `git worktree list --porcelain`
- `git branch --show-current`
- runtime and package script inspection
- API route inspection or executable API smoke commands
- browser tooling availability check
- Docker availability check
- Markdown structure and local-link checks if docs are changed

**Completion signal**: The declared worktree/branch exists, preflight evidence is captured, and the UI substrate decision is recorded before UI code begins.

Commit:

- `prepare agonara admin ui implementation`

## Phase 2 — Serve the Admin board shell

**Objective**: Load the Admin board from the Agonara runtime and route the operator into bootstrap, login, or authenticated board state.

**Key work items**:

- Add Admin UI route or static asset serving.
- Add the board shell with bootstrap, login, authenticated, loading, rejected, and fault states.
- Wire session/bootstrap status API calls through the existing HTTP contract.
- Add tests for route serving, state selection, and no secret/session-id exposure in rendered output.

**Dependencies**: Phase 1 complete.

**Risks**: Serving the board outside the Agonara runtime could drift from Docker/private-instance behavior; shell rendering could accidentally expose response fields that should stay hidden.

**Validation**:

- targeted UI shell tests
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "tests" npm test`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- browser smoke at desktop and mobile viewport

**Completion signal**: A browser can load the board route and the shell selects the correct operational state from API responses.

Commit:

- `serve agonara admin board shell`

## Phase 3 — Bootstrap, login, session, and logout flows

**Objective**: Make the board usable for first setup and authenticated operator sessions.

**Key work items**:

- Implement the bootstrap form using `POST /identity/bootstrap/admin`.
- Implement the login form using `POST /identity/sessions`.
- Display active session state using `GET /identity/session`.
- Implement logout using `DELETE /identity/session` with CSRF.
- Render `invalid_bootstrap_secret`, `bootstrap_already_completed`, `invalid_credentials`, `rate_limited`, `csrf_required`, and session rejection reasons.

**Dependencies**: Phase 2 complete.

**Risks**: CSRF handling can become inconsistent if each action manages token state independently; login errors can leak account state if UI copy goes beyond API reasons.

**Validation**:

- targeted tests for bootstrap/login/logout UI flows
- acceptance test that bootstraps through the UI and then logs out
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "tests" npm test`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- browser verification at desktop and mobile viewport

**Completion signal**: An operator can bootstrap a clean instance, sign in, see active session state, and log out through the board.

Commit:

- `implement agonara admin session flows`

## Phase 4 — Identity operations board

**Objective**: Expose Admin identity operations without moving authority rules into the client.

**Key work items**:

- Add an identity table or list with state and effective Admin indication.
- Add create Identity, bind local password credential, disable Identity, grant Admin, and revoke Admin controls.
- Add an operational access detail panel.
- Refresh API-backed state after each mutation.
- Render validation, duplicate login, existing credential, identity not found, disabled identity, admin required, and last-Admin removal rejections.

**Dependencies**: Phase 3 complete.

**Risks**: Client-side assumptions could mask API-owned invariants; destructive controls could be too easy to trigger; refresh gaps could show stale authority state.

**Validation**:

- targeted tests for each identity operation and rejection state
- acceptance test that creates a second Identity, binds a credential, grants Admin, revokes Admin, and verifies last-Admin protection stays API-owned
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "tests" npm test`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- browser verification at desktop and mobile viewport

**Completion signal**: An authenticated Admin can perform the minimum identity operations through the board, and rejected last-Admin operations surface API-owned reasons.

Commit:

- `implement agonara admin identity board`

## Phase 5 — Audit event inspection

**Objective**: Let an operator inspect sensitive identity, credential, Admin, and bootstrap operations.

**Key work items**:

- Add an audit event table or feed using `GET /identity/audit-events`.
- Add empty, loading, rejected, and fault states.
- Add redaction checks ensuring target session identifiers and secrets are not rendered.
- Expose basic filtering or pagination only if already supported by the backend and cheap to wire.

**Dependencies**: Phase 4 complete.

**Risks**: Audit UI can become a dumping ground for implementation details; redaction regressions would leak sensitive operational state.

**Validation**:

- targeted audit UI tests
- acceptance test showing audit entries after bootstrap and identity operations
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "tests" npm test`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- browser verification at desktop and mobile viewport

**Completion signal**: The board shows audit events for prior sensitive operations without rendering secrets or session identifiers.

Commit:

- `add agonara admin audit view`

## Phase 6 — Docker, CI, dashboard, and closeout

**Objective**: Ship and verify the Admin board through the same private self-hosted path as the backend.

**Key work items**:

- Update Dockerfile or runtime behavior if needed to serve UI assets.
- Update Agonara CI for UI tests or container smoke if not already covered by prior phases.
- Add container smoke that verifies the board route and at least one identity API path through the running container.
- Update the Agonara README with Admin board run instructions.
- Update Agonara and repo logs.
- Refresh `docs/loc-dashboard.html`.
- Move this plan to `agonara/docs/plans/implemented/admin-operations-ui-board.md` after all gates pass.

**Dependencies**: Phase 5 complete.

**Risks**: Local browser checks can pass while Docker omits assets; CI smoke can become too broad or too slow if it duplicates the full UI acceptance suite.

**Validation**:

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "tests" npm test`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- local `docker build`
- local container start
- `/operations/health` smoke request
- Admin board route smoke request
- browser verification against the containerized runtime
- Markdown structure and local-link checks
- dashboard consistency check against `./scripts/loc-dashboard.sh --sort=name`

**Completion signal**: The board is served by the Dockerized Agonara runtime, CI/local smoke verifies it, docs are current, and the plan is archived in the same closeout change set.

Commit:

- `close agonara admin board implementation`

## Done criteria

- The Admin board exposes every minimum UI flow named in the Identity first-slice spec.
- The board uses the existing API as the authority source for sessions, CSRF, Admin authority, and last-Admin protection.
- Browser-visible output does not include bootstrap secrets, passwords, password hashes, session identifiers, or audit target session identifiers.
- Tests cover bootstrap, login, logout, identity operations, Admin grant/revoke, last-Admin rejection display, operational access inspection, and audit listing.
- Full root tests and build pass with the repo Node 22 runtime.
- Dockerized private self-hosting serves the board and passes health plus UI smoke checks.
- Browser verification passes for desktop and mobile viewports without text overlap or unusable controls.
- Logs and dashboard surfaces are current.
- This plan is moved to `implemented/` in the same PR as the implementation closeout.

## Final closeout

- Final gates: `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "tests" npm test`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`; local Docker build/start/health/UI smoke; browser desktop and mobile verification; Markdown structure and local-link checks; dashboard consistency check.
- Archive plan: move to `agonara/docs/plans/implemented/admin-operations-ui-board.md`.
- Commit archive move: yes.
- Push/PR: follow push policy.
