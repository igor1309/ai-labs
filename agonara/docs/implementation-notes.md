---
title: Agonara Implementation Notes
date: 2026-05-27
description: "Research notes on mapping external authentication to Agonara internal identity and authority."
model: gpt-5.5-thinking
version: 0.2.5
---

# Agonara Implementation Notes

## Purpose

Explore how external or framework authentication should map to Agonara internal Identity and authority. This research supports the Identity & Role Management first-slice Pre-ADR by clarifying the boundary between credential verification, internal ownership, and membership-backed product roles.

## Identity & Roles

Use external/framework authentication for credential verification.

Use Agonara internal Identity as the subject of ownership and action.

Use Agonara-owned authority state: Program Membership grants for product participation and Identity & Role Management state for Admin authority and operational access primitives.

Do not delegate Program-scoped Student / Program Curator roles to the authentication provider.

Do not use framework roles as the source of Agonara ownership.

## Boundary Sketch

Auth Provider / Framework:

- verifies the first local password credential;
- returns an authenticated credential result.

Identity & Role Management:

- maps credential/principal to internal Identity;
- manages the first local password credential binding;
- manages server-side opaque sessions that resolve to an internal Identity;
- manages one-time first-Admin bootstrap while no effective Admin exists;
- manages Admin authority and operational access primitives;
- manages admin operations.

Program Membership:

- manages Student and Program Curator participation grants;
- answers effective participation decisions for an internal Identity, Program, and participation kind;
- hides membership policy details.

Identity & Roles:

- defines Identity;
- defines Student / Program Curator / Admin;
- defines ownership rules.

Application modules:

- ask Program Membership for the effective participation decision before participation-sensitive Student or Program Curator behavior.

## Step 1 Substrate Verification

The first implementation slice uses the repo-standard Node workspace model:

- runtime: Node `v22.21.1`, matching `.node-version`;
- package manager: npm `10.9.4` under Node 22;
- typecheck: TypeScript `5.9.3`;
- server API used in Step 1: Node built-in `node:http` `createServer` and `listen`;
- entrypoint detection API used in Step 1: Node built-in `node:url` `pathToFileURL`;
- Docker tooling: Docker `29.5.2` and Docker Compose `v5.1.2`;
- CI topology: `.github/workflows/ci.yml` remains the dispatcher; `.github/workflows/agonara-core.yml` is the per-project reusable workflow.

Step 1 adds no third-party runtime dependencies. Storage, migration, password hashing, cookie, CSRF, and CLI libraries are not called by the Step 1 skeleton and must be verified before their first implementation use in later steps.

## Step 3 Storage Verification

The Identity persistence slice uses the repo-existing SQLite binding:

- runtime: Node `v22.21.1`;
- dependency: `better-sqlite3` `11.10.0`, resolved from the root lockfile;
- package contract added to Agonara: `better-sqlite3` `^11.8.1`, matching the existing `nomos` workspace range;
- APIs verified before implementation use: `exec`, `prepare`, `transaction`, and `pragma`;
- storage substrate: local SQLite-compatible database with foreign-key enforcement enabled per opened connection.

The first storage boundary creates tables for Identity, local password credential, session, Admin authority, and audit event records. It enforces duplicate-login, one-credential-per-Identity, and last-effective-Admin protection at the repository layer backed by database uniqueness constraints and transaction-scoped checks.

## Step 4 Identity Core Verification

The Identity command slice uses Node's built-in crypto APIs for local-password handling:

- runtime: Node `v22.21.1`;
- APIs verified before implementation use: `node:crypto` `scrypt`, `randomBytes`, `timingSafeEqual`, `createHash`, and `randomUUID`;
- password hash format: `scrypt$N=16384,r=8,p=1$<salt>$<derived-key>`;
- session duration: seven days from the session creation instant, persisted server-side as an opaque session record.

The command boundary implements first-Admin bootstrap, login, session resolution, and logout. Bootstrap creates the Identity, local password credential, Admin authority, accepted audit event, and initial session in one database transaction after password hashing. Rejected bootstrap attempts append rejected audit events. Login rejects disabled Identities as `invalid_credentials` so it does not disclose account state.

## Step 5 Admin Command Verification

The Admin command slice adds protected Identity and Admin authority operations on top of session resolution:

- protected commands first resolve the acting session and then require effective Admin authority from server-side storage;
- Identity creation, credential binding, Identity disablement, Admin grant, and Admin revoke append accepted or rejected audit events;
- disabled targets cannot receive Admin authority;
- disabling an Identity revokes its active sessions;
- last-effective-Admin removal remains guarded at the storage boundary and is audited when rejected.

Admin inspection queries expose Identity summaries, effective Admin state, and audit events for the first internal command layer. HTTP-specific response redaction and pagination are deferred to the HTTP API step.

## Step 6 HTTP API Verification

The HTTP boundary adds the first Identity API routes on top of the command layer:

- accepted bootstrap and login set `agonara_session` with `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when the request is HTTPS or forwarded as HTTPS;
- JSON session responses include Identity summary, expiry, and CSRF token, but not the opaque session identifier;
- state-changing session-backed routes require `X-Agonara-CSRF`;
- invalid bootstrap/login attempts are rate-limited after repeated failures;
- Admin routes map command rejections to HTTP status codes and redact `targetSessionId` from audit-event responses;
- `/operations/diagnostics` accepts active Admin sessions and keeps unauthenticated diagnostics rejected.

The server factory supports injecting Identity commands for executable tests. The production entrypoint initializes the local SQLite store from `AGONARA_DB_PATH` and requires the operator to provide `AGONARA_BOOTSTRAP_SECRET` for first-Admin bootstrap. The Docker image writes runtime state under `/data`, and Compose maps that path to a named volume rather than a host bind mount.

## Step 7 Operator CLI Verification

The first operator CLI is exposed as the `agonara` bin:

- `agonara identity bootstrap-status --json` opens the configured local store and returns the shared accepted JSON envelope;
- `agonara identity bootstrap-admin --display-name <name> --login <login> --stdin-json --json` reads `bootstrapSecret` and `password` from JSON stdin;
- accepted CLI output redacts bootstrap secrets, plaintext passwords, password hashes, and opaque session identifiers;
- accepted operations exit `0`, rejected domain operations exit `2`, and usage/runtime errors exit `1`.

The CLI uses the same `AGONARA_DB_PATH` and `AGONARA_BOOTSTRAP_SECRET` runtime inputs as the server entrypoint.

## Step 8 Backup and Restore Verification

The minimum Identity backup/restore path stays inside the command and storage boundaries:

- exported backups include Identity, local password credential, Admin authority, and audit records;
- active sessions are intentionally excluded from backups and are cleared on restore;
- audit records may retain historical `targetSessionId` values without requiring those sessions to exist;
- restore rejects backups that would activate with no effective Admin;
- backup and restore emit operational log events for started, accepted, rejected, and faulted outcomes.

## Step 9 Executable Acceptance Verification

Executable acceptance now exercises the first slice across real process/runtime boundaries:

- CLI first-Admin bootstrap persists to the configured SQLite database and HTTP login/session/logout works against the same instance state;
- HTTP bootstrap prevents a later CLI bootstrap from creating a second first Admin;
- Admin HTTP flows cover Identity creation, local password credential binding, non-Admin rejection, Admin grant/revoke, last-Admin protection, audit listing, and CSRF enforcement;
- rate limiting and request correlation are covered through black-box HTTP requests;
- acceptance responses are checked for bootstrap secret, plaintext password, password hash, and session identifier leakage.

## Current Runtime State

The original Identity and Operations first slice has been extended by later backend/domain slices:

- Program Shell and Membership owns Program creation, Student self-join/leave/rejoin, Student invitation lifecycle, participant listing, Student removal, curator leave, Admin exceptional recovery/revocation, effective participation checks, Program event reads, and Program Membership event reads.
- Corpus owns Program sources, Corpus candidates, acceptance/rejection, accepted revisions, scoped Corpus event reads, and backup/restore graph validation.
- Topic, concept, and material navigation is accepted Program corpus with curator candidate management, accepted graph relationships, historical revisions, student-safe traversal reads, `/learn` navigation UI support, and backup/restore graph validation.
- Accepted assessment criteria and open-answer checks are accepted Program corpus, with curator/admin/student read separation at the HTTP boundary.
- Student Workspace owns open-answer attempt submission, idempotency, owner-only attempt reads, evaluation status/evidence reads, evaluator orchestration, evaluator worker execution, and backup/restore preservation.
- Quick Check assessment has HTTP, backend/domain, storage, and `/learn` product UI support for Curator candidate management, Student delivery reads, immutable attempts, matched evidence, idempotent retries, owner-only reads, protected answer keys, and backup/restore validation.
- Learner-state interpretation derives progress, weak-area, and evidence summaries at read time from accepted checks, Student evidence, explicit active learner evidence target links, and accepted navigation relationships. Target-link curation is Program Curator-owned Corpus metadata; learner-state summary and target-detail reads are owner-only Student Workspace reads exposed through HTTP and `/learn`.
- Topic and period readiness checks are accepted Program corpus definitions with topic or named-period scopes. Owning Students explicitly submit readiness attempts whose results snapshot learner-state requirement evidence at submission time; HTTP and `/learn` surfaces support Curator curation, Student delivery, idempotent retry, owner-only attempt reads, and evidence drill-down.
- Program Membership invitations and recovery support Student-only invitation creation, acceptance, decline, and revocation; participant listing; Student removal; curator leave with last-curator protection; Admin-only exceptional recovery/revocation with required reasons; membership event inspection; backup/restore preservation; and role-separated `/learn` and `/admin` surfaces.

The production server entrypoint now composes Identity, Program, Corpus, and Student Workspace command boundaries against the configured SQLite database. Operational completion tracing is emitted from a common HTTP response boundary so accepted, rejected, and faulted Identity, Program, Corpus, Student Workspace, health, and diagnostics routes share request correlation without logging request bodies, cookies, CSRF tokens, idempotency keys, SQL, provider details, or raw evaluator artifacts.

## Deferred Runtime State

Current backend/domain support does not imply a complete product UI:

- Recommendation ranking, persisted mastery models, curator coverage-gap analysis, and LLM-assisted curation suggestions still need separate downstream artifacts.
- The Admin board is implemented for operational Identity/Admin work and exceptional Program Membership recovery/revocation. `/learn` is implemented for Quick Check, topic/concept/material navigation, learner-state interpretation, readiness, and membership Student/Curator product slices. Broader Student and Curator product screens remain outside the current runtime.

## Open questions

- How does credential rotation preserve the same internal Identity?
- What audit record is required when a credential binding is created, changed, or removed?
- Should the first slice support multiple credential bindings per Identity?
