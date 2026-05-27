---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Decision that Agonara product roles are program-scoped and Admin is instance-scoped operational authority."
status: accepted
---

# ADR-002 - Role Authority Scope Model

## Executive Summary

Agonara attaches authority to internal `Identity` records through explicit product participation grants and operational role assignments.

`Student` and `Program Curator` are product roles scoped to a specific Program.

`Admin` is an operational role scoped to the Agonara instance.

`Admin` authority does not imply `Student` or `Program Curator` authority, and product roles do not imply `Admin` authority.

This ADR decides role authority scope only. It does not decide last-admin protection, first-admin setup, credential lifecycle, authentication provider, session mechanism, schema, UI, or concrete permission-framework implementation.

## Context

[ADR-001](adr-001-internal-identity-as-agonara-ownership-subject.md) establishes internal `Identity` as the subject of ownership, action, attribution, and authorization context.

Agonara now needs to decide what kinds of authority can attach to that internal subject and at what scope.

The [Product Intent](../intent_learning_program_app_v0.3.0.md) separates student learning from curator program construction and names administrator responsibility as private-instance operation, not learning-domain authority.

The [Module Responsibility Map](../module_responsibility_map_v0.4.3.md) treats Identity & Role Management as the module that defines identity and access primitives while not owning program membership, program content, curator decisions, learner state, assessment logic, or progress interpretation.

The [Identity & Role Management first-slice Pre-ADR](../identity_role_management_first_slice_v0.2.3.md) compares program-scoped product roles with flat global product roles, and instance-scoped Admin with peer role management.

The [admin user stories](../admin_user_stories_v0.2.1.md) require program participation inspection, participation-change tracing, exceptional membership recovery, and Admin changes to preserve separation between learning-domain authority and operational control.

[ADR-006](adr-006-program-membership-policy-actor.md) confirms that `Program Membership Manager` is not a grantable role and does not amend this role vocabulary.

The rejected alternatives are flat global product roles and treating `Admin` as a learning-domain superuser. Flat global product roles are too broad for private instances where one person may curate one Program and study another. Treating `Admin` as a learning-domain superuser would blur operational control with curator and student ownership.

## Decision

Agonara MUST grant product authority through explicit Program-scoped participation grants.

Agonara supports these product roles:

- `Student`
- `Program Curator`

An `Identity` MAY hold `Student`, `Program Curator`, both product roles, or no product role for a given Program.

An `Identity` MAY hold different product roles in different Programs.

Agonara supports `Admin` as an operational role scoped to the Agonara instance.

`Admin` authority applies to instance-level operation of identity and role-management capabilities. It MUST NOT make the `Identity` a `Student` or `Program Curator` in any Program.

Product roles MUST NOT grant instance-scoped `Admin` authority.

Credential bindings MUST NOT grant product or operational roles.

## Rules / Invariants

- Authority is denied unless explicitly granted.
- Product authority MUST be evaluated against both `Identity` and Program scope.
- `Student` authority is valid only within the Program scope where it is granted.
- `Program Curator` authority is valid only within the Program scope where it is granted.
- `Admin` authority is valid only at the Agonara instance scope.
- `Admin` is not a product role.
- `Student` and `Program Curator` are not operational roles.
- A single `Identity` MAY have multiple product participation grants across Programs.
- A single `Identity` MAY combine `Student` and `Program Curator` in the same Program.
- Product participation grants MUST NOT mutate accepted Program content, curator workspace state, or student learning state by themselves.
- Later ADRs MAY define admin recovery invariants, privileged operation sets, resource-level permissions, schema, UI, and permission-framework implementation only if they preserve this role authority scope model or explicitly amend this ADR.

## Consequences

Every protected product operation needs an authorization check that includes the acting `Identity`, the required product role, and the relevant Program scope.

Agonara needs to resolve product authority separately from credentials and separately from learning-domain state.

Private instances can support mixed responsibility without broad global authority. The same person can study one Program, curate another Program, or do both in one Program through explicit assignments.

Operational administration remains separate from learning-domain ownership. Admins can operate identity and role-management concerns without becoming implicit curators or students.

The model is more explicit than flat global roles and requires careful scope checks, but it reduces accidental cross-program authority.

## Non-Goals

This ADR does not decide:

- first-admin setup;
- last-active-admin protection;
- which exact operations require `Admin`;
- admin recovery workflow;
- participation approval workflow;
- resource-level permissions inside a Program;
- organization, team, tenant, or enterprise authorization models;
- credential lifecycle or credential-binding cardinality;
- authentication provider or framework;
- session mechanism;
- database schema, storage layout, or migration plan;
- admin UI, API route, or permission-framework implementation.
