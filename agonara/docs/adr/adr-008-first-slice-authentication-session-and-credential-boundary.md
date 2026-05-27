---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Decision for Agonara first-slice authentication, session, credential binding, and first-Admin bootstrap boundaries."
status: accepted
---

# ADR-008 - First-Slice Authentication, Session, and Credential Boundary

## Executive Summary

Agonara v0.0.1 uses an Agonara-owned local password credential for the first private-instance Identity & Role Management slice.

Authentication verifies a credential and resolves it through an explicit credential binding to an internal `Identity`.

The authenticated web session is a server-managed opaque session associated with an internal `Identity`, not an Agonara ownership subject or role source.

The first `Admin` is created through a bootstrap path that is available only while no effective `Admin` exists and requires an out-of-band bootstrap secret.

This ADR decides the first-slice authentication, session, credential-binding, and first-Admin bootstrap boundary. It does not decide database schema, UI layout, exact API routes, password hashing library, MFA, passkeys, OIDC, SSO, or self-service account recovery.

## Context

[ADR-001](adr-001-internal-identity-as-agonara-ownership-subject.md) establishes internal `Identity` as the subject of ownership, action, attribution, and authorization context.

[ADR-002](adr-002-role-authority-scope-model.md) establishes explicit role authority outside credential binding.

[ADR-003](adr-003-admin-recovery-invariant.md) requires a bootstrap path for the first effective `Admin` and requires the instance to retain at least one effective `Admin`.

The [Identity & Role Management first-slice Pre-ADR](../identity_role_management_first_slice_v0.2.3.md) identified authentication provider, session mechanism, concrete credential types, password policy, MFA, and privileged-action confirmation as implementation handoff blockers.

The [Deployment Target](../deployment-target_v0.2.0.md) points toward a dockerized private self-hosted instance with a network web UI, API-first backend, and small private group tenancy.

The first implementation needs a concrete authentication and session boundary without turning external provider roles, framework users, cookies, or sessions into Agonara authority.

The rejected alternatives are using framework user records as Agonara ownership subjects, using provider roles as Agonara roles, shipping default Admin credentials, implementing SSO before the private-instance slice needs it, or using stateless client-held authorization claims as the source of Agonara authority.

## Decision

Agonara v0.0.1 MUST use an Agonara-owned local password credential as the first credential type.

A local password credential authenticates access to an internal `Identity` only through a credential binding.

Credential bindings MUST be owned by Identity & Role Management.

Credential bindings MUST NOT grant `Admin`, `Student`, or `Program Curator` authority.

The first web session mechanism MUST be a server-managed opaque session.

The session MUST resolve to an internal `Identity` before any protected Agonara operation is authorized.

The session MUST NOT contain Agonara role grants as authoritative client-held claims.

Authorization for protected operations MUST be evaluated from server-side Agonara authority state after the session resolves to an internal `Identity`.

The first-Admin bootstrap path MUST be available only while no effective `Admin` identity exists.

The first-Admin bootstrap path MUST require an out-of-band bootstrap secret supplied through deployment or operator-controlled configuration.

The first-Admin bootstrap path MUST create or designate:

- one active internal `Identity`;
- one local password credential binding for that `Identity`;
- one instance-scoped `Admin` authority assignment for that `Identity`;
- one bootstrap audit record.

The bootstrap secret MUST NOT become an Agonara credential, session, role, or ownership subject.

After the first effective `Admin` exists, ordinary identity creation, credential-binding changes, and `Admin` authority changes MUST require effective `Admin` authority.

MFA, passkeys, OIDC, SSO, recovery codes, self-service credential recovery, and additional credential providers are deferred from v0.0.1.

## Rules / Invariants

- Authentication verifies a credential.
- Credential binding resolves an authenticated credential to an internal `Identity`.
- Authorization decides whether the resolved internal `Identity` may act.
- A local password credential MUST NOT be stored or compared as plaintext.
- Password verification MUST use a vetted password-hashing implementation supplied by the chosen implementation stack.
- Session identifiers MUST be opaque, server-managed, and revocable.
- Session state MUST be invalidated when the resolved internal `Identity` is disabled.
- Session state MUST NOT be treated as domain ownership.
- Client-held session data MUST NOT be the authority source for `Admin`, `Student`, or `Program Curator` decisions.
- First-Admin bootstrap MUST be auditable and distinguishable from ordinary Admin action.
- First-Admin bootstrap MUST be rejected after an effective `Admin` exists.
- The bootstrap secret MUST be operator-controlled and out-of-band from ordinary Agonara login.
- The bootstrap secret MUST NOT be reusable after successful first-Admin bootstrap.
- Ordinary credential-binding changes MUST require `Admin` authority after bootstrap.
- Ordinary `Admin` assignment and revocation MUST require `Admin` authority after bootstrap and must preserve the last-effective-Admin invariant.
- Later ADRs MAY add MFA, passkeys, OIDC, SSO, recovery codes, self-service credential recovery, reauthentication, privileged-action confirmation, or additional credential providers only if they preserve the internal `Identity` and explicit authorization model.

## Consequences

The first Identity & Role Management implementation can proceed without selecting an enterprise identity provider.

The private-instance deployment has a concrete bootstrap path and avoids default credentials.

The credential and session model remains compatible with future password replacement, passkeys, OIDC, SSO, or multiple credential bindings because Agonara ownership stays on internal `Identity`.

Implementation must include secure password handling, session revocation, and last-effective-Admin checks before exposing identity and admin operations.

The first slice accepts that local-password operation is enough for a private MVP, while stronger authentication and privileged-action confirmation remain explicit future decisions.

## Non-Goals

This ADR does not decide:

- database schema, storage layout, or migration plan;
- exact API route names, request fields, or response fields;
- UI layout or user-facing copy;
- exact password hashing library or parameter values;
- password complexity rules beyond using a vetted password-hashing implementation;
- MFA, passkeys, recovery codes, OIDC, SSO, or external identity-provider integration;
- self-service account creation, credential reset, merge, split, or transfer workflows;
- reauthentication or privileged-action confirmation policy;
- session duration, idle timeout, or refresh-token mechanics;
- rate limiting, lockout, abuse prevention, or operational alert thresholds;
- organization, team, tenant, or enterprise authorization models.
