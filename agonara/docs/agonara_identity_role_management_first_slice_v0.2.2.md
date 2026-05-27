---
title: Agonara Identity & Role Management First Slice
description: First implementable slice for Agonara Identity & Role Management.
model: gpt-5.5-thinking
version: 0.2.2
date: 2026-05-27
---

# Agonara Identity & Role Management First Slice

## Purpose

This document defines the first implementable slice for Agonara Identity & Role Management.

The goal of this slice is to make an Agonara private instance operationally controllable before implementing the learning-specific modules.

This document stays at Pre-ADR module-design level. Its direction is provisional until accepted by a later ADR.

It is not a data model, schema, authentication-provider choice, UI specification, deployment script, or permission-framework design.

## Context

The Responsibility Map defines `Identity & Role Management` as the module that defines and manages identities, credentials, operational roles, and access primitives.

The [Deployment Target](agonara-deployment-target_v0.2.0.md) points toward a dockerized private self-hosted Agonara instance with API-first access, network web UI, small private group tenancy, and admin operational responsibility.

This slice uses Identity & Role Management as the first working module because it has limited domain uncertainty and exercises the operational foundation early.

Identity and role management is the right first slice because every later curator or student workflow depends on an internal subject of action, explicit authorization context, and recoverable admin control. Starting here also tests deployment, logging, backup/restore, and operational diagnosis without requiring the learning-domain modules to be implemented first.

## Options considered

### Identity source

#### Option A — Internal Identity owns Agonara actions

- **Description**: credentials authenticate into an internal Agonara Identity; ownership and authorization attach to that Identity.
- **Tradeoffs**: stable ownership survives credential changes and provider changes. Requires an explicit identity mapping layer.
- **Product intent fit**: supports curator and student continuity because program decisions, attempts, and progress attach to an internal subject.
- **Risks**: incorrect credential binding could attach access to the wrong Identity.

#### Option B — Credential or external account owns Agonara actions

- **Description**: the authenticated provider account is the direct owner for roles and domain state.
- **Tradeoffs**: simpler first implementation. Makes credential rotation, provider migration, and account recovery harder.
- **Product intent fit**: weak fit because learning history and curator decisions become coupled to external account shape.
- **Risks**: changing auth provider can break ownership continuity.

### Product role model

#### Option A — Program-scoped Student and Program Curator roles

- **Description**: product participation is granted per program, and one Identity may hold different roles in different programs.
- **Tradeoffs**: matches the product model and keeps authority local to a program. Requires explicit participation and scope checks on protected operations.
- **Product intent fit**: strong fit for separating curator acceptance from student learning state.
- **Risks**: role checks are more complex than a flat global role list.

#### Option B — Flat global product roles

- **Description**: Student and Program Curator are instance-wide roles.
- **Tradeoffs**: simple to inspect and implement. Too broad for private instances with multiple programs or mixed responsibilities.
- **Product intent fit**: weak fit when a person curates one program and studies another.
- **Risks**: accidental cross-program authority.

### Operational role model

#### Option A — Instance-scoped Admin role

- **Description**: Admin controls identities, credential bindings, Admin authority, settings, and recovery operations for the private instance.
- **Tradeoffs**: gives the private instance a clear recovery owner. Must avoid leaking Admin into learning-domain authority.
- **Product intent fit**: supports operational control without replacing Program Curator ownership of accepted content.
- **Risks**: Admin may be mistaken for a learning role unless boundaries are enforced.

#### Option B — No Admin role; peer role management

- **Description**: role holders manage peer access inside programs or through ad hoc recovery processes.
- **Tradeoffs**: avoids a privileged operational role. Makes private-instance recovery and first setup unclear.
- **Product intent fit**: weak fit for self-hosted private instances that need explicit operational responsibility.
- **Risks**: instance can become unrecoverable or governance can become ambiguous.

## Emerging direction

The emerging direction is internal Identity ownership, program-scoped Student and Program Curator roles, and an instance-scoped Admin role.

This direction is provisional. It should become an ADR only after the first slice confirms that setup, credential binding, Admin assignment, last-admin protection, and audit attribution can be expressed without leaking domain ownership into Identity & Role Management.

## Slice Goal

An Agonara instance can be initialized, accessed by an admin, and used to manage identities, credential bindings, Admin authority, and operational access state.

The slice should prove that Agonara has an internal subject of ownership and action, instead of treating a credential, session, or external account as the domain owner.

## Product intent traceability

This slice supports the Product Intent by making curator and student actions attributable to internal Identities. It primarily protects INT-01 through authorization-gated curator acceptance and INT-02 through INT-07 by keeping student actions tied to stable learner state.

The admin-facing stories that drive this slice live in [agonara_admin_user_stories_v0.2.1.md](agonara_admin_user_stories_v0.2.1.md), especially ADM-01 through ADM-11.

## Candidate design decisions

The following decisions are candidate invariants for a future ADR. They are written as the current working direction, not as accepted architecture.

### Identity Source

Agonara uses an internal Identity as the subject of ownership and action.

Credentials and external accounts may be bound to an internal Identity, but they do not define Agonara ownership.

A credential binding may authenticate an Identity but must not grant product or operational roles by itself.

### Product Roles

Agonara supports two product roles:

- `Student`
- `Program Curator`

Product roles are scoped to a specific program.

An Identity may be:

- Student in one program;
- Program Curator in another program;
- both Student and Program Curator in the same program.

### Operational Role

Agonara supports one operational role:

- `Admin`

Admin is scoped to the Agonara instance.

Admin manages identities, credential bindings, Admin authority, settings, and recovery-level operations.

Admin is not a learning role and does not replace Program Curator ownership of accepted program content.

Admin does not automatically receive Student or Program Curator authority in any program.

## Candidate authorization principles

Access is denied by default.

Authorization is evaluated for each protected operation.

An Identity may act only when the required product participation or operational authority is explicitly established for the relevant scope.

Effective product roles require explicit Program Membership participation grants within a program scope.

Admin authority is instance-scoped and does not imply Student or Program Curator authority.

Credential bindings authenticate an Identity but do not grant roles by themselves.

An Agonara instance must retain at least one active Admin.

Identity creation, credential binding changes, Admin authority changes, exceptional recovery operations, and identity disablement must be attributable to an acting Admin identity.

## Candidate identity lifecycle

The first slice supports two identity states:

- `active`
- `disabled`

Disabled identities cannot initiate new actions.

Historical ownership and audit references must remain intact when an identity is disabled.

## Candidate first slice capabilities

| Capability | Purpose |
|---|---|
| Initialize instance with first admin | Makes a private Agonara instance operationally controllable. |
| Create identity | Establishes an internal subject of ownership and action. |
| Bind credential to identity | Allows Agonara to recognize an identity without making the credential the owner or role source. |
| Define product role vocabulary | Gives Program Membership stable Student and Program Curator participation meanings. |
| Inspect program participation authority | Allows admin diagnosis through Program Membership results without changing ordinary participation. |
| Trace program participation authority changes | Allows admin diagnosis of participation changes without recreating revoked access. |
| Assign or revoke Admin role | Supports operational control of the private instance. |
| Prevent removing the last active Admin | Protects the instance from losing operational control. |
| Disable identity | Allows admin-level access control without deleting historical ownership. |
| View identities and operational access state | Allows admin to inspect the operational access state. |
| Log attributable identity, credential, admin, and exceptional recovery operations | Provides auditability for operationally sensitive actions. |
| Include identity and operational access state in backup/restore scope | Ensures access and ownership context can survive recovery. |

## Provisional boundaries

These slice boundaries are provisional and should be revisited before ADR acceptance.

### Included

This slice includes:

- internal identities;
- credential-to-identity binding;
- instance-scoped admin role;
- product role vocabulary and scope rules;
- Program Membership participation inspection;
- exceptional membership recovery hooks;
- prevention of last-active-admin removal;
- identity disablement;
- admin inspection of identities and operational access state;
- attributable logging of identity and operational access operations;
- backup/restore coverage for identity and operational access state.

### Excluded

This slice does not include:

- student learning flow;
- curator content acceptance flow;
- corpus editing;
- assessment and progress semantics;
- resource-level access control;
- enterprise authorization;
- organization or tenant hierarchy;
- choice of authentication provider;
- session mechanism;
- concrete credential types;
- password policy;
- MFA policy;
- database schema;
- UI layout.

## Candidate cross-cutting checks

This slice is the first place to exercise several cross-cutting concerns without expanding into learning-domain behavior.

| Concern | Check |
|---|---|
| Deployment | The Agonara instance can be initialized and accessed through the selected private-instance deployment shape. |
| CI/CD | Identity and role-management rules are covered by automated checks in the delivery pipeline. |
| Logging | Admin actions, credential binding changes, exceptional recovery changes, and identity disablement are logged with attribution. |
| Backup / Restore | Identity, credential bindings, Admin authority, and recovery-relevant access state are recoverable. |
| Observability | Instance health and identity/role-management failures are visible enough for admin diagnosis. |

## Candidate consistency rules

These are candidate invariants for a future ADR, not established rules.

Identity is not a role.

Role is not a credential.

Credential is not ownership.

Credential binding is not role assignment.

Student and Program Curator are product roles.

Admin is an operational role.

Product roles are scoped to programs.

Admin is scoped to the instance.

Authorization is denied unless explicitly granted.

Student Workspace and Curator Workspace may rely on identity and membership-backed authorization decisions, but they do not manage identity lifecycle.

Identity & Role Management does not own program membership lifecycle, program content, curator decisions, learner state, assessment logic, or progress interpretation.

## Open questions

The following questions must be resolved or explicitly deferred before this becomes an accepted ADR:

- Which authentication provider or framework will be used for the first private-instance deployment?
- What session mechanism is acceptable for the selected deployment target?
- Which concrete credential types are required for the first slice?
- Is a password policy needed if local passwords are supported?
- Is MFA in scope for the first operational slice or deferred?
- Do privileged actions need confirmation beyond ordinary admin authorization?
- What schema and storage layout preserve Identity ownership and credential binding history?
- What is the minimum admin UI shape needed to initialize and recover a private instance?
- Are resource-level permissions needed before curator and student workflows exist?
- Is an organization/team model intentionally out of scope for private-instance MVP?
- Is multi-tenant SaaS authorization deferred indefinitely or only outside the private-instance target?
