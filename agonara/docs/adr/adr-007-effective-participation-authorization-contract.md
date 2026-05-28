---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Decision for the Program Membership effective participation authorization contract."
status: accepted
---

# ADR-007 - Effective Participation Authorization Contract

## Executive Summary

Program Membership is the decision authority for effective `Student` and `Program Curator` participation in a `Program`.

Other modules must ask Program Membership for an effective participation decision instead of reading raw membership, invitation, or policy state.

The decision contract returns stable authorization semantics: allowed or denied participation for one internal `Identity`, one `Program`, and one participation kind.

State-changing membership operations remain separate Program Membership commands.

This ADR decides the module contract for effective participation checks. It does not decide schema, API route names, UI copy, permission-framework implementation, or resource-level permissions inside a Program.

## Context

[ADR-001](adr-001-internal-identity-as-agonara-ownership-subject.md) establishes internal `Identity` as the subject of ownership, action, attribution, and authorization context.

[ADR-002](adr-002-role-authority-scope-model.md) establishes `Student` and `Program Curator` as Program-scoped product roles.

[ADR-004](adr-004-program-membership-owns-program-participation.md) establishes Program Membership as the owner of Program participation lifecycle and policy.

[ADR-005](adr-005-program-membership-state-and-first-admission-policy.md) establishes the first participation states and says other modules must depend on Program Membership's effective participation result.

[ADR-006](adr-006-program-membership-policy-actor.md) confirms that `Program Membership Manager` is a narrative policy actor, not a grantable role.

Agonara now needs the contract that lets Student Workspace, Curator Workspace, Admin diagnosis, and future application services use membership-backed product authority without reconstructing membership policy.

The rejected alternatives are letting each workspace read membership state directly, moving product participation decisions into Identity & Role Management, or exposing policy-specific branches such as self-join, invitation, approval, or payment checks to every caller.

## Decision

Program Membership MUST provide the effective participation decision for Program-scoped product authority.

An effective participation decision answers whether one internal `Identity` currently has effective participation in one `Program` for one participation kind.

The first participation kinds supported by this contract are:

- `Student`
- `Program Curator`

The decision result MUST distinguish allowed participation from denied participation.

An allowed `Student` decision means the caller may treat the `Identity` as having effective `Student` authority for that `Program`.

An allowed `Program Curator` decision means the caller may treat the `Identity` as having effective `Program Curator` authority for that `Program`.

A denied decision means the caller MUST NOT perform participation-sensitive behavior for that participation kind and Program.

Denied decisions MAY include a coarse reason category for product flow, diagnosis, logging, or support.

The first coarse reason categories are:

- `identity_not_active`
- `program_not_accepting_participation`
- `membership_missing`
- `membership_left`
- `membership_removed`
- `policy_not_satisfied`
- `unsupported_participation_kind`

Coarse reason categories are contract vocabulary. They MUST NOT expose raw invitation records, payment details, approval internals, or other policy-specific state outside Program Membership.

State-changing operations such as join, leave, rejoin, invite, accept invitation, decline invitation, revoke invitation, remove participant, and exceptional recovery are Program Membership commands. They MUST remain separate from effective participation decisions.

## Rules / Invariants

- Program Membership MUST own the effective participation decision contract.
- An effective participation decision request MUST identify an internal `Identity`, a `Program`, and a participation kind.
- Program Membership MUST evaluate effective `Student` participation using Program Membership-owned state and policy.
- Program Membership MUST evaluate effective `Program Curator` participation using Program Membership-owned state and policy.
- Student Workspace MUST use an allowed `Student` decision before creating, resuming, or exposing participation-sensitive student learning behavior for a Program.
- Curator Workspace MUST use an allowed `Program Curator` decision before exposing participation-sensitive curator behavior for a Program.
- Identity & Role Management MUST NOT decide effective `Student` or `Program Curator` participation from role primitives, credentials, or Admin authority.
- Admin diagnosis MAY inspect Program Membership-owned participation state through Program Membership-owned inspection views, but Admin authority MUST NOT bypass the effective participation decision contract for ordinary product behavior.
- Other modules MUST NOT read raw membership status, invitation state, policy configuration, or policy path to decide effective participation.
- Effective participation decisions MUST be read-only and MUST NOT create, reactivate, remove, recover, or otherwise mutate membership state.
- State-changing membership commands MUST emit attributable membership events when they change participation state.
- Effective participation decisions MAY be logged or traced for diagnosis, but a read-only denied decision is not itself a membership state change.
- A caller MAY branch on allowed versus denied and on coarse reason categories, but MUST NOT branch on Program Membership policy internals.
- Later ADRs MAY add participation kinds, reason categories, policy variants, API shapes, or permission-framework implementation only if they preserve this boundary or explicitly amend this ADR.

## Consequences

Student Workspace and Curator Workspace can remain focused on their domain state while relying on a stable Program Membership authorization contract.

Program Membership can evolve from open self-join to invitation-only, approval, payment, cohorts, or other per-Program policies without forcing callers to change their authorization logic.

Admin inspection and recovery remain possible without turning Admin into the ordinary product actor for participation.

The contract adds an explicit module dependency: participation-sensitive behavior must call Program Membership or an authorization layer backed by Program Membership before it acts.

Implementation will need test coverage that proves callers cannot authorize product behavior from raw membership rows, invitation rows, credentials, or Admin authority.

## Non-Goals

This ADR does not decide:

- database schema, storage layout, or migration plan;
- API route names, request fields, or response field names;
- UI layout or user-facing copy;
- concrete permission-framework implementation;
- caching strategy for participation decisions;
- payment, approval, cohort, or entitlement implementation;
- invitation expiry, revocation, or reissue mechanics;
- who may change a Program's membership policy;
- Program creation workflow or ownership transfer;
- resource-level permissions inside a Program;
- organization, team, tenant, or enterprise authorization models.
