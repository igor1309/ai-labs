---
title: Agonara Identity & Role Management First Slice
description: First implementable slice for Agonara Identity & Role Management.
model: gpt-5.5-thinking
version: 0.1.0
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

## First Slice Capabilities

| Capability | Purpose |
|---|---|
| Initialize instance with first admin | Makes a private Agonara instance operationally controllable. |
| Create identity | Establishes an internal subject of ownership and action. |
| Bind credential to identity | Allows Agonara to recognize an identity without making the credential the owner. |
| Assign Student role for a specific program | Establishes program-scoped student participation. |
| Assign Program Curator role for a specific program | Establishes program-scoped curator responsibility. |
| Revoke product role from a specific program | Keeps role assignment reversible. |
| Assign or revoke Admin role | Supports operational control of the private instance. |
| Disable identity | Allows admin-level access control without deleting historical ownership. |
| View identities and role assignments | Allows admin to inspect the operational access state. |
| Log identity and role-management operations | Provides auditability for operationally sensitive actions. |
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
- identity disablement;
- admin inspection of identities and role assignments;
- logging of identity and role-management operations;
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
- database schema;
- UI layout.

## Cross-cutting Checks

This slice is the first place to exercise several cross-cutting concerns without expanding into learning-domain behavior.

| Concern | Check |
|---|---|
| Deployment | The Agonara instance can be initialized and accessed through the selected private-instance deployment shape. |
| CI/CD | Identity and role-management rules are covered by automated checks in the delivery pipeline. |
| Logging | Admin actions and role changes are logged. |
| Backup / Restore | Identity, credential bindings, and role assignments are recoverable. |
| Observability | Instance health and identity/role-management failures are visible enough for admin diagnosis. |

## Consistency Rules

Identity is not a role.

Role is not a credential.

Credential is not ownership.

Student and Program Curator are product roles.

Admin is an operational role.

Product roles are scoped to programs.

Admin is scoped to the instance.

Student Workspace and Curator Workspace may rely on identity and role decisions, but they do not manage identity lifecycle.

Identity & Role Management does not own program content, curator decisions, learner state, assessment logic, or progress interpretation.

## Deferred Decisions

The following decisions are intentionally deferred:

- authentication provider;
- session mechanism;
- concrete credential types;
- schema and storage layout;
- admin UI shape;
- resource-level permissions;
- organization/team model;
- multi-tenant SaaS authorization model.
