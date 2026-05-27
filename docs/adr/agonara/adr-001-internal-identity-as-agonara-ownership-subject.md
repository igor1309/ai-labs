---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Decision that Agonara uses an internal Identity as the stable ownership subject."
status: accepted
---

# ADR-001 - Internal Identity as Agonara Ownership Subject

## Executive Summary

Agonara uses an internal `Identity` as the stable subject of ownership, action, attribution, and authorization context.

Credentials, external accounts, and authentication-provider principals may authenticate access to an internal `Identity`, but they do not own Agonara domain state and do not grant product or operational roles by themselves.

This decision protects learner state, curator decisions, admin audit records, and recovery flows from credential rotation or authentication-provider changes.

This ADR decides the identity subject model only. It does not decide role scope, admin recovery rules, authentication provider, session mechanism, credential types, storage schema, or UI/API shape.

## Context

Agonara is designed as a private learning-program application with curator, student, and administrator responsibilities. Curator decisions, learner progress, role-management actions, and audit records need a stable subject that remains meaningful when a credential changes, an external account is replaced, or an authentication provider changes.

The [Identity & Role Management first-slice Pre-ADR](../../../agonara/docs/identity_role_management_first_slice_v0.2.2.md) evaluates two identity-source options: internal Identity ownership versus credential or external account ownership. It favors internal Identity ownership because product history and operational recovery should not be coupled to external account shape.

The [admin user stories](../../../agonara/docs/admin_user_stories_v0.2.1.md) require admins to create internal identities, bind credentials, disable identities without deleting historical references, inspect credential bindings, and audit sensitive identity and access operations.

The alternative is to treat a credential, external account, session principal, or authentication-provider user as the direct Agonara owner. That alternative is rejected because it makes ownership continuity fragile under credential rotation, provider migration, and recovery.

## Decision

Agonara MUST use an internal `Identity` as the subject of ownership and action.

Agonara domain records that require an owner or actor MUST reference an internal `Identity`, not a credential, session, external account, or authentication-provider principal as the ownership subject.

Credentials and external principals MAY be bound to an internal `Identity` so that authentication can resolve to that `Identity`.

A credential binding authenticates access to an internal `Identity`; it MUST NOT create Agonara ownership, grant product roles, grant operational authority, or replace explicit authorization checks.

The architecture MUST permit an internal `Identity` to be reachable through one or more credential bindings. The first implementation MAY expose a narrower binding workflow, but it MUST NOT encode credential-to-Identity one-to-one ownership as an architectural invariant.

## Rules / Invariants

- `Identity` is the Agonara ownership subject.
- `Identity` is not a role.
- Credential is not ownership.
- Credential binding is not role assignment.
- Authentication proves access to an `Identity`; authorization decides whether that `Identity` may act.
- Domain ownership and audit attribution MUST survive credential rotation, credential replacement, and authentication-provider migration.
- Later identity lifecycle decisions MUST preserve historical ownership and audit references for existing `Identity` records.
- Credential-binding state changes MUST be auditable as identity-management operations.
- Product and operational roles MUST be granted explicitly outside credential binding.
- Later ADRs MAY define role scope, admin recovery invariants, credential lifecycle, session management, provider boundaries, and schema details only if they preserve this identity-subject model or explicitly amend this ADR.

## Consequences

Agonara needs an explicit identity-mapping layer between authentication and domain authorization.

Credential binding mistakes become security-sensitive because an incorrect binding may route authentication to the wrong internal `Identity`.

Provider migration and credential recovery become safer because domain ownership, learner state, curator decisions, and audit references stay attached to internal `Identity` records.

Role and authorization design remains separable from authentication-provider capabilities. This avoids making provider roles or account claims the source of Agonara product authority.

The first implementation can keep credential-management workflows small, but it must preserve the architectural ability to support multiple bindings, recovery bindings, or provider changes later.

## Non-Goals

This ADR does not decide:

- program-scoped versus global product roles;
- instance-scoped admin authority or last-admin recovery invariants;
- authentication provider or framework;
- session mechanism;
- concrete credential types;
- password, passkey, OIDC, MFA, or privileged-action confirmation policy;
- whether multiple credential bindings are exposed in the first UI;
- credential-binding lifecycle details such as primary credentials, self-service changes, admin-only recovery, merge, split, or transfer;
- database schema, storage layout, or migration plan;
- admin UI, API route, or permission-framework implementation.
