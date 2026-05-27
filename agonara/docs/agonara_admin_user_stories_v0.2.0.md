---
title: Agonara Admin User Stories
date: 2026-05-27
description: Admin-facing user stories for Agonara private-instance identity, role, and membership recovery.
model: gpt-5.5-thinking
version: 0.2.0
---

# Agonara Admin User Stories

## Terms

| Term | Meaning |
|---|---|
| Agonara admin | Instance-scoped operational role responsible for identity, credential, role, settings, and recovery-level operations. |
| Internal Identity | Agonara-owned subject of ownership and action. |
| Credential binding | Link between an external or framework-authenticated principal and an internal Identity. |
| Product role | Program-scoped Student or Program Curator role. |
| Program membership | Participation relationship between an identity and a program, governed outside Identity & Role Management. |

## Instance Setup

### ADM-01 — Initialize private instance

As an Agonara admin,
I want to initialize a private instance with a first admin identity,
so that the instance can be operated and recovered.

Status: accepted

Acceptance signal: a new instance cannot become operational without at least one active Admin.

## Identity Administration

### ADM-02 — Create internal identity

As an Agonara admin,
I want to create an internal Identity,
so that Agonara has a stable subject for ownership and action.

Status: accepted

Acceptance signal: the created Identity exists independently of any credential or product role.

### ADM-03 — Bind credential to identity

As an Agonara admin,
I want to bind a credential or authenticated principal to an internal Identity,
so that a person can authenticate without making the credential the source of ownership.

Status: accepted

Acceptance signal: authentication can resolve to the intended Identity while role grants remain separate.

### ADM-04 — Disable identity

As an Agonara admin,
I want to disable an Identity,
so that access can be stopped without deleting historical ownership and audit references.

Status: accepted

Acceptance signal: a disabled Identity cannot initiate new actions, and existing historical references remain readable.

### ADM-05 — Inspect identities and credential bindings

As an Agonara admin,
I want to view identities and their credential bindings,
so that I can diagnose access and recovery state.

Status: accepted

Acceptance signal: the admin can inspect active and disabled identities with their credential-binding state.

## Role Administration

### ADM-06 — Assign program role

As an Agonara admin,
I want to assign a Student or Program Curator role within a specific program,
so that an Identity can act in that program with explicit authority.

Status: accepted

Acceptance signal: the role assignment is scoped to one program and does not grant authority in other programs.

### ADM-07 — Revoke program role

As an Agonara admin,
I want to revoke a Student or Program Curator role within a specific program,
so that access remains reversible and explicit.

Status: accepted

Acceptance signal: the Identity can no longer use the revoked role in that program after revocation.

### ADM-08 — Assign or revoke admin role

As an Agonara admin,
I want to assign or revoke instance-scoped Admin authority,
so that operational control can be transferred without changing learning-domain ownership.

Status: accepted

Acceptance signal: Admin changes affect only instance-level operations and do not automatically grant Student or Program Curator authority.

### ADM-09 — Prevent last-admin removal

As an Agonara admin,
I want Agonara to prevent removal of the last active Admin,
so that the private instance cannot lose operational control.

Status: accepted

Acceptance signal: disabling, revoking, or otherwise removing the last active Admin is rejected.

## Audit and Recovery

### ADM-10 — Audit identity and role operations

As an Agonara admin,
I want identity, credential-binding, role, and admin operations to be attributable,
so that sensitive access changes can be audited.

Status: accepted

Acceptance signal: each sensitive operation records the acting Admin identity and the affected identity, credential, or role assignment.

### ADM-11 — Include identity state in backup and restore

As an Agonara admin,
I want identity and role-management state included in backup and restore scope,
so that recovered instances preserve access and ownership context.

Status: accepted

Acceptance signal: backup/restore coverage includes identities, credential bindings, role assignments, and admin authority.

## Membership Recovery and Audit

### ADM-12 — View program membership state

As an Agonara admin,
I want to inspect program membership state,
so that I can diagnose access and participation issues.

Status: accepted

Acceptance signal: the admin can inspect membership state without becoming the normal operator of learning participation.

### ADM-13 — Recover broken membership access

As an Agonara admin,
I want to recover broken membership access,
so that a valid student or curator can regain access when operational recovery is needed.

Status: accepted

Acceptance signal: exceptional recovery can restore valid membership access while preserving attribution.

### ADM-14 — Revoke operationally invalid membership

As an Agonara admin,
I want to revoke membership in exceptional operational cases,
so that the instance can recover from incorrect or unsafe access state.

Status: accepted

Acceptance signal: exceptional revocation changes membership state without making Admin the normal manager of program participation.

### ADM-15 — Audit membership changes

As an Agonara admin,
I want membership changes to be logged with attribution,
so that participation changes can be diagnosed and audited.

Status: accepted

Acceptance signal: membership changes record the acting identity, affected identity, program, participation kind, and resulting membership state.

## Boundaries

Admin stories describe operational control of a private Agonara instance.

They do not describe student learning flow, curator content acceptance, corpus editing, assessment semantics, progress interpretation, or learning-domain authority.

Admin authority does not replace Program Curator ownership of accepted program content and does not automatically grant Student or Program Curator authority.

Admin membership operations are exceptional recovery and audit operations, not the normal product flow for joining, inviting, leaving, or curating programs.
