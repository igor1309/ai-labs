---
date: 2026-05-27
model: gpt-5
description: "Decision for Agonara Program shell ownership and initial Program Curator participation."
status: accepted
---

# ADR-009 - Program Shell and Initial Curator Participation

## Executive Summary

Agonara uses a minimal accepted `Program` shell as the stable Program scope before topics, materials, checks, criteria, or learner state exist.

Corpus Storage owns the accepted Program shell.

Any active internal `Identity` may create a Program shell in the first product slice, and Program creation must establish that Identity's initial `Program Curator` participation through Program Membership.

Program creation is not an Admin operation. Admin remains operational recovery authority and does not become the normal creator or owner of Programs.

This ADR decides Program shell ownership, first Program creation authority, and initial curator participation only. It does not decide full corpus schema, curation workflow, Program UI, Student Workspace, invitations, ownership transfer, or resource-level permissions.

## Context

[ADR-001](adr-001-internal-identity-as-agonara-ownership-subject.md) establishes internal `Identity` as the subject of ownership, action, attribution, and authorization context.

[ADR-002](adr-002-role-authority-scope-model.md) establishes `Student` and `Program Curator` as Program-scoped product roles and `Admin` as instance-scoped operational authority.

[ADR-004](adr-004-program-membership-owns-program-participation.md) through [ADR-007](adr-007-effective-participation-authorization-contract.md) establish Program Membership as the owner of Program participation lifecycle, first membership state and policy, the narrative Program Membership Manager actor, and the effective participation authorization contract.

[ADR-005](adr-005-program-membership-state-and-first-admission-policy.md) leaves Program Curator participation closed to self-join and says curator participation may be established by a future Program creation or ownership workflow that requests Program Membership to establish participation.

The [Module Responsibility Map](../module_responsibility_map.md) identifies Corpus Storage as the owner of accepted Programs and Program Membership as the owner of participation grants. It still treats the Corpus Storage / Curator Workspace boundary as provisional until a Program creation decision exists.

The accepted curator stories require a curator to create a Program from grounded sources and then add topics, concepts, materials, checks, criteria, and reviewed suggestions. The first implementable boundary needs a stable Program scope before those later curation behaviors can attach to it.

The rejected alternatives are making `Admin` the normal Program creator, storing Program shells in Curator Workspace as draft-only state, and granting `Program Curator` authority directly from a Program owner field. Making Admin the normal creator leaks operational authority into learning-domain behavior. Keeping Program shells as draft-only curator state leaves Program Membership without a stable Program scope. Granting curator authority from a Program owner field bypasses Program Membership and contradicts the accepted effective participation contract.

## Decision

Agonara MUST model a minimal accepted `Program` shell before accepted topics, concepts, materials, checks, criteria, or learner state are required.

A Program shell is the accepted Program record that provides a stable Program identifier and enough operator-visible metadata to distinguish the Program from other Programs. It is not a draft suggestion, curator workspace item, student learning state, or membership record.

Corpus Storage MUST own the accepted Program shell and its stable Program identifier.

The first Program creation flow MUST allow any active internal `Identity` to request Program creation when ordinary validation passes.

Program creation MUST create an accepted Program shell and request Program Membership to establish active `Program Curator` participation for the acting `Identity` in that Program.

Initial `Program Curator` authority MUST be represented as Program Membership participation, not as an `Admin` grant, credential binding, session claim, or authoritative Program owner field.

The first Program creation flow MUST initialize the Program's Student admission policy as self-join.

Program creation MUST be attributable to the acting internal `Identity` through a Program creation event and a corresponding initial membership state-change event.

Admin authority MAY inspect or exceptionally recover Program and membership state in later flows, but Admin authority MUST NOT be required for ordinary Program creation and MUST NOT create ordinary Program Curator participation by itself.

## Rules / Invariants

- `Program` is the stable scope key for accepted corpus, Program Membership, Curator Workspace, and Student Workspace behavior.
- A Program shell MUST provide a stable Program identifier before Program-scoped membership or workspace behavior can be created.
- A Program shell MUST NOT contain accepted topics, concepts, materials, checks, criteria, draft suggestions, or learner state by itself.
- Corpus Storage owns the accepted Program shell.
- Curator Workspace MUST NOT be the owner of the accepted Program shell.
- Program Membership owns initial and later `Program Curator` participation.
- Identity & Role Management MUST NOT own Program shells or Program Curator participation.
- A Program creation request MUST identify an acting internal `Identity`.
- A Program creation request MUST be rejected when the acting internal `Identity` is not active.
- Program creation MUST establish active `Program Curator` participation for the acting `Identity` through Program Membership.
- Program creation MUST NOT grant `Admin` authority.
- Program creation MUST NOT grant `Student` participation to the creator by default.
- Program creation MUST NOT create learner state.
- Program creation MUST NOT accept topics, concepts, materials, checks, criteria, or LLM suggestions by itself.
- Program creation MUST initialize self-join Student admission policy for the first product slice.
- Creating a Program shell and establishing initial `Program Curator` participation MUST be atomic from the caller's perspective.
- Failed Program creation MUST NOT leave a Program shell without initial `Program Curator` participation.
- Initial curator authority MUST be evaluated through Program Membership's effective participation contract before curator-sensitive behavior runs.
- Program creation MUST emit a Program creation event attributed to the acting internal `Identity`.
- Initial `Program Curator` participation MUST emit a Program Membership state-change event attributed to the acting internal `Identity`.
- Program creation events and Program Membership events are not operational logs and MUST NOT be used as the source of authorization.
- Later ADRs MAY define Program ownership transfer, Program archival, controlled Program creation, curator invitations, invitation expiry, policy changes, corpus versioning, schema, UI, API routes, and resource-level permissions only if they preserve Corpus Storage ownership of accepted Program shells and Program Membership ownership of participation.

## Consequences

Program Membership can now be implemented against a real Program scope without inventing Program ownership in the membership layer.

The first product slice can create a Program and grant the creator curator access without giving Admin ordinary learning-domain authority.

Corpus Storage becomes necessary earlier than full corpus editing because it owns the minimal accepted Program shell.

The first Program creation flow is intentionally permissive for active Identities. This fits a private-instance MVP, but later deployments that need restricted Program creation must add a policy decision without changing Admin into the default Program creator.

Self-join Student admission keeps the first Student onboarding path compatible with ADR-006. Controlled Programs, invitations, and curator-managed admission remain extension points.

The atomic Program creation plus initial membership requirement adds coordination between Corpus Storage and Program Membership. The implementation must prevent orphaned Program shells without initial curator participation.

## Non-Goals

This ADR does not decide:

- full Program corpus schema;
- topic, concept, material, check, or assessment criteria schema;
- Curator Workspace draft and suggestion workflow;
- LLM-assisted curation behavior;
- Student Workspace behavior;
- Program UI or Admin UI;
- Program archival, deletion, or lifecycle status beyond initial creation;
- Program ownership transfer;
- curator invitation workflow;
- controlled Program creation;
- invitation expiry, revocation, or reissue mechanics;
- who may change a Program's membership policy after creation;
- payment, approval, cohort, organization, team, tenant, or enterprise authorization models;
- database schema, storage layout, migrations, API route names, or implementation plan.
