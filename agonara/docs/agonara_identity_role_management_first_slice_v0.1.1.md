---
title: Agonara Identity & Role Management First Slice
description: First implementable slice for Agonara Identity & Role Management.
model: gpt-5.5-thinking
version: 0.1.1
date: 2026-05-27
---

# Agonara Identity & Role Management First Slice

## Purpose

This document defines the first implementable slice for Agonara Identity & Role Management.

The goal of this slice is to make an Agonara private instance operationally controllable before implementing the learning-specific modules.

This document stays at module-design level.

It is not a data model, schema, authentication-provider choice, UI specification, deployment script, or permission-framework design.

## Context

The Responsibility Map defines `Identity & Role Management` as the module that defines and manages identities, credentials, roles, and access boundaries.

The Deployment Decision points toward a dockerized private self-hosted Agonara instance with API-first access, network web UI, small private group tenancy, and admin operational responsibility.

This slice uses Identity & Role Management as the first working module because it has limited domain uncertainty and exercises the operational foundation early.

## Slice Goal

An Agonara instance can be initialized, accessed by an admin, and used to manage identities and role assignments.

The slice should prove that Agonara has an internal subject of ownership and action, instead of treating a credential, session, or external account as the domain owner.

## Design Decisions

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

Admin manages identities, credential bindings, role assignments, settings, and recovery-level operations.

Admin is not a learning role and does not replace Program Curator ownership of accepted program content.

Admin does not automatically receive Student or Program Curator authority in any program.

## Authorization Principles

Access is denied by default.

Authorization is evaluated for each protected operation.

An Identity may act only when the required product role or operational authority is explicitly assigned for the relevant scope.

Product roles are granted explicitly within a program scope.

Admin authority is instance-scoped and does not imply Student or Program Curator authority.

Credential bindings authenticate an Identity but do not grant roles by themselves.

An Agonara instance must retain at least one active Admin.

Identity creation, credential binding changes, role assignments, role revocations, admin changes, and identity disablement must be attributable to an acting Admin identity.

## Identity Lifecycle

The first slice supports two identity states:

- `active`
- `disabled`

Disabled identities cannot initiate new actions.

Historical ownership and audit references must remain intact when an identity is disabled.

## First Slice Capabilities

| Capability | Purpose |
|---|---|
| Initialize instance with first admin | Makes a private Agonara instance operationally controllable. |
| Create identity | Establishes an internal subject of ownership and action. |
| Bind credential to identity | Allows Agonara to recognize an identity without making the credential the owner or role source. |
| Assign Student role for a specific program | Establishes program-scoped student participation. |
| Assign Program Curator role for a specific program | Establishes program-scoped curator responsibility. |
| Revoke product role from a specific program | Keeps role assignment reversible. |
| Assign or revoke Admin role | Supports operational control of the private instance. |
| Prevent removing the last active Admin | Protects the instance from losing operational control. |
| Disable identity | Allows admin-level access control without deleting historical ownership. |
| View identities and role assignments | Allows admin to inspect the operational access state. |
| Log attributable identity, credential, role, and admin operations | Provides auditability for operationally sensitive actions. |
| Include identity and role state in backup/restore scope | Ensures access and ownership context can survive recovery. |

## Slice Boundaries

### Included

This slice includes:

- internal identities;
- credential-to-identity binding;
- instance-scoped admin role;
- program-scoped Student role;
- program-scoped Program Curator role;
- role assignment and revocation;
- prevention of last-active-admin removal;
- identity disablement;
- admin inspection of identities and role assignments;
- attributable logging of identity and role-management operations;
- backup/restore coverage for identity and role-management state.

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

## Cross-cutting Checks

This slice is the first place to exercise several cross-cutting concerns without expanding into learning-domain behavior.

| Concern | Check |
|---|---|
| Deployment | The Agonara instance can be initialized and accessed through the selected private-instance deployment shape. |
| CI/CD | Identity and role-management rules are covered by automated checks in the delivery pipeline. |
| Logging | Admin actions, credential binding changes, role changes, and identity disablement are logged with attribution. |
| Backup / Restore | Identity, credential bindings, and role assignments are recoverable. |
| Observability | Instance health and identity/role-management failures are visible enough for admin diagnosis. |

## Consistency Rules

Identity is not a role.

Role is not a credential.

Credential is not ownership.

Credential binding is not role assignment.

Student and Program Curator are product roles.

Admin is an operational role.

Product roles are scoped to programs.

Admin is scoped to the instance.

Authorization is denied unless explicitly granted.

Student Workspace and Curator Workspace may rely on identity and role decisions, but they do not manage identity lifecycle.

Identity & Role Management does not own program content, curator decisions, learner state, assessment logic, or progress interpretation.

## Deferred Decisions

The following decisions are intentionally deferred:

- authentication provider;
- session mechanism;
- concrete credential types;
- password policy, if local passwords are ever supported;
- MFA policy;
- privileged action confirmation;
- schema and storage layout;
- admin UI shape;
- resource-level permissions;
- organization/team model;
- multi-tenant SaaS authorization model.

## Critical Review Applied

### Review Finding: Slice must be vertical, not theoretical

The slice is framed around a working private instance that can be initialized, accessed by admin, and used to manage identities and roles.

It avoids starting with an abstract permission framework.

### Review Finding: Role scope must remain explicit

Product roles are stated as program-scoped.

The document avoids treating `Student` and `Program Curator` as global user properties.

### Review Finding: Admin must not be confused with curator

Admin is defined as an operational role.

Curator remains the product role responsible for program curation.

Admin does not automatically receive Student or Program Curator authority in any program.

### Review Finding: Authorization safety invariants were under-specified

The document now states deny-by-default, per-operation authorization, explicit scoped grants, credential binding separation, and prevention of last-active-admin removal.

### Review Finding: Identity lifecycle was under-specified

The first slice now supports `active` and `disabled` identity states.

Disablement blocks new actions while preserving historical ownership and audit references.

### Review Finding: Auditability needed attribution

Identity creation, credential binding changes, role assignments, role revocations, admin changes, and identity disablement must be attributable to an acting Admin identity.

### Review Finding: Avoid premature implementation detail

The document does not define tables, IDs, auth provider, login flow, API routes, UI screens, or specific storage mechanisms.

### Review Finding: Cross-cutting concerns must be grounded

Logging, backup/restore, observability, deployment, and CI/CD are included only as checks exercised by this slice.
