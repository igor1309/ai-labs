---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Decision that Program Membership Manager is a policy actor, not a grantable role, and that v0.0.1 Student membership uses simple self-join."
status: accepted
---

# ADR-006 - Program Membership Policy Actor

## Executive Summary

`Program Membership Manager` is a narrative and policy actor for the Program Membership module.

It is not a grantable role, product role, operational role, or identity authority.

ADR-002's role vocabulary remains `Student`, `Program Curator`, and `Admin`.

Program Membership v0.0.1 uses the simplest Student admission policy: any active internal `Identity` may acquire Student membership in a self-join Program.

This ADR decides the Program Membership policy actor and v0.0.1 Student self-join rule only. It does not decide Program creation, Program ownership, curator invitation policy, payment, or resource-level permissions.

## Context

[ADR-002](adr-002-role-authority-scope-model.md) accepts `Student` and `Program Curator` as Program-scoped product roles and `Admin` as instance-scoped operational authority.

[ADR-004](adr-004-program-membership-owns-program-participation.md) accepts Program Membership as the owner of Program participation lifecycle and policy.

[ADR-005](adr-005-program-membership-state-and-first-admission-policy.md) accepts the first membership statuses, invitation statuses, and admission boundary.

The archived [Program Membership Manager rationale](../../../agonara/docs/archive/program_membership_manager_rationale_v0.1.1.md) and [peer review](../../../agonara/docs/archive/program_membership_manager_rationale_review_v0.1.1.md) identified one blocking ambiguity: whether `Program Membership Manager` is a real role or a narrative actor for the Program Membership module.

The rejected alternatives are adding `Program Membership Manager` as a grantable role before a real human workflow exists, making `Admin` the normal membership operator, or hiding Program Membership policy execution inside Student Workspace or Curator Workspace.

## Decision

`Program Membership Manager` is the narrative and policy actor for Program Membership.

`Program Membership Manager` means "the Program Membership module executing its accepted policy."

`Program Membership Manager` MUST NOT be grantable to an internal `Identity`.

`Program Membership Manager` MUST NOT be added to ADR-002's role vocabulary.

`Program Membership Manager` MUST NOT appear in Admin role-assignment or role-revocation flows.

Membership events MUST record the real acting internal `Identity` when one exists.

Membership events MAY also record the Program Membership policy path that allowed or rejected the transition.

Program Membership v0.0.1 uses a simple Student self-join policy: any active internal `Identity` may acquire Student membership in a self-join Program.

The v0.0.1 Student self-join policy MUST NOT grant Program Curator participation.

The v0.0.1 Student self-join policy MUST NOT grant `Admin` authority.

## Rules / Invariants

- `Program Membership Manager` is a documentation and policy-execution actor only.
- `Program Membership Manager` is not a product role.
- `Program Membership Manager` is not an operational role.
- `Program Membership Manager` is not an authorization subject.
- ADR-002's accepted grantable roles remain `Student`, `Program Curator`, and `Admin`.
- A self-join Student membership request MUST identify the acting internal `Identity`.
- A self-join Student membership request MUST be rejected when the internal `Identity` is not active.
- A self-join Student membership request MUST be rejected when the target Program is not a self-join Program.
- A self-join Student membership request MUST create or reactivate only Student membership.
- Program Membership MUST remain the owner of membership state transitions.
- Student Workspace, Curator Workspace, Identity & Role Management, and Admin operations MUST NOT bypass Program Membership by creating membership directly.
- Admin exceptional recovery MUST be distinguishable from ordinary Program Membership policy execution in membership events.

## Consequences

The Manager ambiguity is closed without expanding Agonara's role model.

Program Membership can still have clear story and design language without adding a premature human-facing permission surface.

The first Student onboarding path is intentionally fast: active Identities can join self-join Programs without approval, invitation, payment, or curator action.

Authorization remains explicit because protected student behavior still depends on Program Membership returning effective Student participation.

Curator admission remains conservative until Program creation and ownership rules are accepted.

Future policies may introduce approval, invitation-only admission, payment, cohorts, or a separate grantable membership-management role through a later ADR that explicitly amends the role vocabulary.

## Non-Goals

This ADR does not decide:

- Program creation workflow;
- Program ownership;
- curator invitation workflow;
- who may change a Program's membership policy;
- payment or entitlement implementation;
- approval workflows;
- organization, team, tenant, or enterprise authorization models;
- database schema, storage layout, or migration plan;
- API route names or UI layout;
- resource-level permissions inside a Program.
