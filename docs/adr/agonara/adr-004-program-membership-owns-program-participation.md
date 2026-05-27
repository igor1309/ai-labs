---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Decision that Program Membership owns program participation lifecycle and policy for Student and Program Curator participation."
status: accepted
---

# ADR-004 - Program Membership Owns Program Participation

## Executive Summary

Agonara uses a separate Program Membership module to own the lifecycle and policy for an internal `Identity`'s participation in a `Program`.

Program Membership owns participation as `Student` and `Program Curator`.

Student Workspace, Curator Workspace, and Identity & Role Management do not own program membership lifecycle.

Membership policy details are opaque outside Program Membership.

This ADR clarifies ADR-002: product authority remains Program-scoped and explicit, and Program Membership owns the participation grant used to establish effective `Student` or `Program Curator` authority within a Program.

This ADR does not decide concrete membership policies, membership status schema, payment, UI, API routes, storage schema, or permission-framework implementation.

## Context

[ADR-001](adr-001-internal-identity-as-agonara-ownership-subject.md) establishes internal `Identity` as the subject of ownership, action, attribution, and authorization context.

[ADR-002](adr-002-role-authority-scope-model.md) establishes `Student` and `Program Curator` as Program-scoped product roles, and `Admin` as instance-scoped operational authority.

[ADR-003](adr-003-admin-recovery-invariant.md) establishes recoverable `Admin` control and attributable sensitive identity-management operations.

The [Program Membership Pre-ADR](../../../agonara/docs/program_membership_pre_adr_v0.1.0.md) evaluates whether membership belongs in a separate module, in Student and Curator workspaces, or in Identity & Role Management.

The [Module Responsibility Map](../../../agonara/docs/module_responsibility_map_v0.4.1.md) identifies Program Membership as the owner of membership lifecycle, invitation lifecycle, membership policy, membership status, participant visibility, and exceptional recovery hooks.

The membership stories require students to join, leave, rejoin after leave, inspect membership state, and accept or decline invitations; curators to invite, inspect, remove participants, and stop curating; and admins to inspect, recover, revoke, and audit membership state.

The rejected alternatives are embedding membership inside Student and Curator workspaces, or treating program participation as ordinary Identity & Role Management state. Both alternatives place participation policy in modules that do not own the full participation lifecycle.

## Decision

Agonara MUST model Program Membership as a separate module.

Program Membership MUST own the lifecycle and policy for an internal `Identity`'s participation in a `Program`.

Program Membership MUST support participation kinds for:

- `Student`
- `Program Curator`

Program Membership owns the Program-scoped participation grant used to establish effective `Student` or `Program Curator` authority for an `Identity` in a `Program`.

Identity & Role Management owns internal identities, credential bindings, `Admin` authority, and role/access primitives. It MUST NOT own Program membership lifecycle or membership policy.

Student Workspace may create or resume learning state only for an `Identity` with effective `Student` participation for the relevant `Program`.

Curator Workspace may expose curator program-management behavior only for an `Identity` with effective `Program Curator` participation for the relevant `Program`.

Membership policy details such as self-join, invitation, approval, payment, closed cohort, or future per-Program policy variants are internal to Program Membership.

Admin membership operations are exceptional recovery and audit operations. `Admin` MUST NOT become the normal product actor for joining, inviting, leaving, or curating Programs.

## Rules / Invariants

- Program Membership is the owner of Program participation lifecycle.
- Program Membership is the owner of membership policy.
- Program Membership is the owner of membership status.
- Program Membership is the owner of invitation lifecycle.
- Program Membership is the owner of participant visibility rules.
- Program Membership is the owner of exceptional membership recovery hooks.
- Program Membership MUST evaluate whether an `Identity` may participate in a `Program` as `Student` or `Program Curator`.
- Effective `Student` authority for a Program MUST require a Program Membership participation grant for that `Identity` and Program.
- Effective `Program Curator` authority for a Program MUST require a Program Membership participation grant for that `Identity` and Program.
- Credential bindings MUST NOT create membership.
- `Admin` authority MUST NOT create ordinary membership.
- Student Workspace MUST NOT own membership lifecycle, membership policy, or invitation lifecycle.
- Curator Workspace MUST NOT own membership lifecycle, membership policy, or invitation lifecycle.
- Identity & Role Management MUST NOT own Program membership lifecycle, membership policy, or participant visibility rules.
- Program Membership MUST NOT own accepted Program corpus, curator decisions, student answers, assessment feedback, mastery state, identity lifecycle, credential bindings, or `Admin` authority.
- Membership state changes that affect participation MUST be attributable.
- Other modules MUST depend on Program Membership's participation result, not on its internal policy path.
- Later ADRs MAY define concrete membership policies, membership statuses, schema, UI, API routes, and authorization implementation only if they preserve this module boundary or explicitly amend this ADR.

## Consequences

ADR-002's Program-scoped product authority now has an owning module for participation lifecycle: Program Membership.

Identity & Role Management remains responsible for identity and operational access primitives, but no longer needs to own product participation workflow for Programs.

Student Workspace and Curator Workspace can stay focused on learning state and curation work. They must consult Program Membership or an authorization layer backed by Program Membership before allowing participation-sensitive behavior.

Program Membership can evolve from simple self-join to invitation, approval, payment, cohort, or per-Program policy variants without changing Student Workspace or Curator Workspace contracts.

The added module boundary requires clear authorization integration so protected product operations use the effective participation result instead of reimplementing membership policy.

## Non-Goals

This ADR does not decide:

- concrete membership statuses;
- first implementation membership policy;
- who may change a Program's membership policy;
- invitation expiry, revocation, or reissue mechanics;
- payment implementation;
- resource-level permissions inside a Program;
- database schema, storage layout, or migration plan;
- admin UI, student UI, curator UI, or API route shape;
- concrete permission-framework implementation;
- organization, team, tenant, or enterprise authorization models.
