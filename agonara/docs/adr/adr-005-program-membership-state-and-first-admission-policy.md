---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Decision for Agonara Program Membership state and first admission policy."
status: accepted
---

# ADR-005 - Program Membership State and First Admission Policy

## Executive Summary

Agonara Program Membership uses a minimal participation lifecycle for the first implementation.

Student participation starts with open self-join for Programs whose membership policy allows self-join.

Rejoining after leave reuses the existing membership record when policy allows it.

Program Curator participation is closed to self-join in the first implementation.

Other modules must ask for effective participation and must not inspect membership policy internals.

This ADR decides first membership states, first invitation states, and first admission policy only. It does not decide schema, API routes, UI, payment, invitation expiry, or Program creation workflow.

## Context

[ADR-004](adr-004-program-membership-owns-program-participation.md) accepts Program Membership as the owner of Program participation lifecycle and policy.

The [Module Responsibility Map](../module_responsibility_map.md) identifies Program Membership ownership and records this ADR as the first membership state and admission policy decision.

The [Program Membership Pre-ADR](../pre-adr/program_membership_pre_adr.md) identified membership status, Student participation policy, Program Curator participation policy, invitation behavior, audit events, and exceptional Admin recovery as open questions before this ADR.

The [Student stories](../intent/student_user_stories.md) require joining, leaving, rejoining after leave, inspecting membership state, and handling invitations.

The [Curator stories](../intent/curator_user_stories.md) require student invitation, participant visibility, student removal, and stopping curator participation.

The [Admin stories](../intent/admin_user_stories.md) require membership inspection, exceptional recovery, exceptional revocation, and audit.

The rejected alternatives are making Admin the normal membership operator, placing membership state in Student or Curator Workspace, and allowing all curator self-join before Program ownership rules exist.

## Decision

Program Membership MUST model participation as a unique relationship between one internal `Identity`, one `Program`, and one participation kind.

The first participation kinds are:

- `Student`
- `Program Curator`

The first membership statuses describe participation, not invitation state.

The first membership statuses are:

- `active`
- `left`
- `removed`

The first invitation statuses are:

- `pending`
- `accepted`
- `declined`
- `revoked`

A self-join Program is a Program whose Program Membership policy allows Student participation without an invitation.

A controlled Program is a Program whose Program Membership policy requires invitation evidence for Student admission.

Student admission for a self-join Program is open self-join for active internal Identities.

If a Student has a `left` membership for the same Identity, Program, and participation kind, rejoining MUST reuse that membership record when policy allows rejoin.

Rejoining MUST NOT create a duplicate membership record for the same Identity, Program, and participation kind.

Leaving a Program changes active Student participation to `left` and MUST NOT delete historical learning evidence.

Removing a participant changes active participation to `removed` and MUST NOT delete historical learning evidence, curator decisions, or audit records.

Program Curator participation is closed to self-join in the first implementation.

Program Curator participation may be established only by a future Program creation or ownership workflow that requests Program Membership to establish participation, or by exceptional Admin recovery when operational recovery is required.

Student invitations are supported as admission evidence for controlled Programs.

Accepted Student invitations may establish or reactivate Student membership when Program Membership policy allows it.

Declined or revoked invitations MUST NOT create Student membership.

Invitation policy details remain internal to Program Membership.

Admin membership operations are limited to inspection, exceptional recovery, exceptional revocation, and audit.

## Rules / Invariants

- Program Membership MUST be the only module that creates, changes, or evaluates membership status.
- Effective `Student` participation requires an `active` Student membership for the Identity and Program.
- Effective `Program Curator` participation requires an `active` Program Curator membership for the Identity and Program.
- A membership record MUST be unique by Identity, Program, and participation kind.
- Invitation records MUST be separate from membership records.
- A left Student membership MAY become active again when Program Membership policy allows rejoin.
- Rejoin MUST preserve membership continuity and MUST NOT fork membership history.
- Leaving, removal, rejoin, invitation acceptance, invitation decline, invitation revocation, and exceptional recovery MUST be attributable membership events.
- Removed membership MUST NOT become active again through ordinary self-join.
- Student Workspace MUST NOT create membership records.
- Curator Workspace MUST NOT create Student membership records directly; it may request Program Membership invitation or removal operations.
- Identity & Role Management MUST NOT create ordinary Student or Program Curator membership.
- Admin authority MUST NOT create ordinary membership.
- Other modules MUST depend on Program Membership's effective participation result, not on raw membership status or policy details.
- Membership status MUST NOT delete or mutate accepted Program corpus, curator decisions, student answers, assessment feedback, mastery state, identity lifecycle, credential bindings, or `Admin` authority.

## Consequences

Student onboarding can be implemented without an approval workflow for self-join Programs.

Controlled Program participation can still use invitations without exposing invitation policy outside Program Membership.

Rejoining after leave preserves continuity for audit, membership history, and existing student learning state.

Program Curator admission remains intentionally incomplete until Program creation and ownership rules are accepted.

The first implementation needs membership events and uniqueness checks before Student Workspace and Curator Workspace depend on participation state.

Future policies can add approval, payment, cohorts, invitation expiry, or per-Program variants without changing Student Workspace or Curator Workspace ownership.

## Non-Goals

This ADR does not decide:

- database schema, storage layout, or migration plan;
- API route names or request/response shapes;
- UI layout or copy;
- payment or entitlement implementation;
- invitation expiry or reissue mechanics;
- who may change a Program's membership policy;
- Program creation workflow;
- Program ownership transfer;
- curator invitation workflow;
- resource-level permissions inside a Program;
- organization, team, tenant, or enterprise authorization models.
