---
title: Agonara Implementation Notes
date: 2026-05-27
description: "Research notes on mapping external authentication to Agonara internal identity and authority."
model: gpt-5.5-thinking
version: 0.2.3
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

## Open questions

- How does credential rotation preserve the same internal Identity?
- What audit record is required when a credential binding is created, changed, or removed?
- Should the first slice support multiple credential bindings per Identity?
