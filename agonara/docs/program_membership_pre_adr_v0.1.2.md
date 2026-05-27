---
title: Agonara Program Membership Pre-ADR
date: 2026-05-27
description: Pre-ADR for Program Membership module ownership, participation lifecycle, and policy boundaries.
model: gpt-5.5-thinking
version: 0.1.2
---

# Agonara Program Membership Pre-ADR

## Purpose

This document pressure-tests Program Membership as a separate Agonara module.

It uses the membership stories in the student, curator, and admin catalogs to clarify how an internal Identity becomes, remains, or stops being a participant in a Program.

This document is not a data model, schema, API design, UI specification, permission-framework design, or implementation plan.

It is not an accepted ADR. Its candidate direction is accepted by [ADR-004](adr/adr-004-program-membership-owns-program-participation.md), which makes the Program Membership / Identity & Role Management contract explicit. First membership state and policy are accepted by [ADR-005](adr/adr-005-program-membership-state-and-first-admission-policy.md). The Program Membership Manager narrative actor is accepted by [ADR-006](adr/adr-006-program-membership-policy-actor.md). The effective participation authorization contract is accepted by [ADR-007](adr/adr-007-effective-participation-authorization-contract.md).

## Context

[ADR-001](adr/adr-001-internal-identity-as-agonara-ownership-subject.md) establishes internal Identity as the subject of ownership, action, attribution, and authorization context.

[ADR-002](adr/adr-002-role-authority-scope-model.md) establishes Student and Program Curator as Program-scoped product roles, and Admin as instance-scoped operational authority.

[ADR-003](adr/adr-003-admin-recovery-invariant.md) establishes recoverable Admin control and attributable sensitive identity-management operations.

The [Module Responsibility Map](module_responsibility_map_v0.4.3.md) introduces Program Membership as the candidate module that owns program participation lifecycle, invitation lifecycle, membership policy, membership status, participant visibility, effective participation decisions, and exceptional membership recovery hooks.

The story catalogs now include membership stories:

- [Student User Stories](student_user_stories_v0.3.1.md): STU-18 through STU-23.
- [Curator User Stories](curator_user_stories_v0.3.0.md): CUR-14 through CUR-18.
- [Admin User Stories](admin_user_stories_v0.2.1.md): ADM-12 through ADM-15.

The missing architectural question was not whether Agonara has identities or Program-scoped roles. Those are already accepted. ADR-004 accepts which module owns the product lifecycle of participation in a Program, and ADR-005 accepts the first membership state and admission policy.

## Options considered

### Option A — Separate Program Membership module

- **Description**: Program Membership owns membership lifecycle and policy for an Identity's participation in a Program as Student or Program Curator.
- **Tradeoffs**: keeps membership policy out of Student Workspace, Curator Workspace, and Identity & Role Management. Adds a module boundary that must coordinate with authorization checks.
- **Product intent fit**: strong fit because joining, invitations, participant visibility, leaving, and exceptional recovery are not learning state, curator content, or identity lifecycle.
- **Risks**: the contract between Program Membership participation grants and ADR-002 role authority must be explicit.

### Option B — Membership inside Student Workspace and Curator Workspace

- **Description**: Student Workspace owns student join/leave state, and Curator Workspace owns curator invitations and participant management.
- **Tradeoffs**: fewer modules at first. Splits one participation lifecycle across two workspaces.
- **Product intent fit**: weak fit because membership policy is neither student learning state nor curator content work.
- **Risks**: duplicated policy, inconsistent participant visibility, and unclear admin recovery.

### Option C — Membership inside Identity & Role Management

- **Description**: Identity & Role Management owns Program-scoped participation state as role assignment state.
- **Tradeoffs**: centralizes authority checks. Expands identity management into product participation lifecycle.
- **Product intent fit**: weak fit because joining, invitations, leaving, and participant visibility are product participation behavior, not identity lifecycle or credential management.
- **Risks**: Identity & Role Management becomes a product workflow module and starts owning state that belongs between Programs and workspaces.

### Rejected option — Admin-assigned membership as normal flow

- **Description**: Admin assigns ordinary Student or Program Curator participation in Programs.
- **Tradeoffs**: operationally simple, but makes Admin the normal operator of learning participation.
- **Product intent fit**: poor fit because Admin is operational authority and must not replace student or curator product behavior.
- **Risks**: Admin authority leaks into learning-domain participation and hides product policy decisions inside operations.

## Emerging direction

Option A is the current best candidate.

Program Membership should be a peer module. It owns the lifecycle and policy for an Identity's participation in a Program as Student or Program Curator.

Student Workspace and Curator Workspace should depend on Program Membership instead of owning membership lifecycle.

Identity & Role Management should provide internal Identity, credential, Admin, and access primitives without owning Program participation lifecycle.

Policy details such as self-join, curator invitation, approval, payment, closed cohort, or future per-Program policy variants should be encapsulated inside Program Membership. Other modules should depend on Program Membership's effective participation decision and should not branch on those policy details.

## Primary actor

`Program Membership Manager` is the narrative and policy actor for this module.

It represents Program Membership executing accepted policy and does not represent a grantable internal role.

Membership events should record the real acting internal Identity when one exists, plus the policy path that allowed or rejected the transition.

## Candidate design decisions

The following decisions were candidate invariants before ADR-004 accepted the Program Membership ownership direction.

Program Membership owns membership lifecycle for an internal Identity in a Program.

Program Membership supports participation as:

- Student;
- Program Curator.

Program Membership decides whether participation can be created, changed, suspended, left, resumed, invited, accepted, declined, recovered, or revoked under the Program's membership policy.

Program Membership decides whether an Identity has effective Student or Program Curator participation in a Program.

Membership policy is opaque outside Program Membership.

Student Workspace may create or resume student learning state only after Program Membership permits Student participation.

Curator Workspace may expose curator participant-management behavior only after Program Membership permits Program Curator participation.

Admin may inspect and exceptionally recover membership state, but Admin is not the normal product actor for joining, inviting, leaving, or curating Programs.

Membership state must not own accepted Program corpus, curator decisions, student answers, assessment feedback, mastery state, identity lifecycle, credential bindings, or Admin authority.

## Candidate authorization questions

ADR-002 says product authority is Program-scoped and explicitly granted.

ADR-004 accepts the first interpretation below. The alternatives remain here as the pressure test that led to the accepted decision.

- Program Membership owns the Program-scoped participation grant used for Student and Program Curator authorization.
- Program Membership owns membership state, while Identity & Role Management owns separate Program-scoped role assignments that membership policy may require or update.
- Program Membership owns participation status, while a separate authorization layer derives effective product authority from membership plus role primitives.

The first option is the accepted architectural direction. ADR-007 defines the effective participation contract that other modules use instead of reading raw membership status, invitation state, or policy internals.

## Provisional boundaries

### Included

Program Membership includes:

- Program membership lifecycle;
- Student participation membership;
- Program Curator participation membership;
- join and leave behavior;
- invitation lifecycle;
- membership status;
- membership policy;
- effective participation decisions;
- participant visibility;
- exceptional admin recovery hooks;
- membership-change audit events.

### Excluded

Program Membership excludes:

- internal Identity lifecycle;
- credential bindings;
- Admin authority;
- accepted Program corpus;
- curator content decisions;
- student answers;
- assessment feedback;
- mastery, weakness, and progress interpretation;
- authentication provider;
- session mechanism;
- payment implementation;
- database schema;
- UI layout.

## Open questions

- Who may change a Program's membership policy?
- How should invitations expire, be revoked, or be reissued?
- What membership events require audit records?
- What is the minimum exceptional Admin recovery surface for membership state?
