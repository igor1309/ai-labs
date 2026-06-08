---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Decision that an Agonara instance must retain recoverable Admin control and attributable sensitive identity operations."
status: accepted
---

# ADR-003 - Admin Recovery Invariant

## Executive Summary

An Agonara private instance must not become operational without recoverable `Admin` control.

After initialization, the instance must retain at least one effective `Admin` identity.

Operations that would remove the last effective `Admin` must be rejected.

Sensitive identity, credential-binding, admin-authority, and exceptional recovery changes must require `Admin` authority and must be attributable.

This ADR decides operational-control invariants only. It does not decide authentication provider, session mechanism, MFA, reauthentication, recovery codes, backup/restore mechanics, storage schema, UI, or concrete permission-framework implementation.

## Context

[ADR-001](adr-001-internal-identity-as-agonara-ownership-subject.md) establishes internal `Identity` as the subject of ownership, action, attribution, and authorization context.

[ADR-002](adr-002-role-authority-scope-model.md) establishes `Admin` as instance-scoped operational authority that does not imply learning-domain authority.

Agonara is intended to run as a private instance. If the instance loses all usable `Admin` authority, identity and role management become unrecoverable through normal product operations.

The [admin user stories](../intent/admin_user_stories.md) require first-admin setup, Admin assignment/revocation, prevention of last-admin removal, auditability of sensitive operations, and backup/restore coverage for identity and operational access state.

The [Identity & Role Management first-slice Pre-ADR](../identity_role_management_first_slice.md) names recoverable admin control, last-active-admin protection, and audit attribution as first-slice candidates.

The rejected alternative is to allow peer-managed or ad hoc recovery without a hard last-Admin invariant. That alternative is rejected because a private instance could enter a state where no accountable identity can operate or recover identity and role management.

## Decision

An Agonara instance MUST have a bootstrap path that creates or designates the first internal `Identity` with `Admin` authority before the instance becomes operational.

After an Agonara instance is operational, it MUST retain at least one effective `Admin` identity.

For this ADR, an effective `Admin` identity means an internal `Identity` that currently has instance-scoped `Admin` authority and is eligible to perform Admin operations under the current identity lifecycle and authorization rules.

Any operation that would remove the last effective `Admin` identity MUST be rejected.

Sensitive identity-management operations MUST require `Admin` authority after bootstrap.

Sensitive identity-management operations MUST be attributable to an acting internal `Identity`, or to an explicit bootstrap actor before the first `Admin` exists.

`Admin` recovery invariants protect operational control only. They MUST NOT grant learning-domain ownership, `Student` authority, or `Program Curator` authority.

## Rules / Invariants

- A new Agonara instance MUST NOT become operational without at least one effective `Admin` identity.
- An operational Agonara instance MUST retain at least one effective `Admin` identity.
- Removing, revoking, disabling, or otherwise invalidating the last effective `Admin` identity MUST be rejected.
- Assigning or revoking `Admin` authority MUST require `Admin` authority after bootstrap.
- Creating, disabling, or changing an internal `Identity` MUST require `Admin` authority after bootstrap.
- Creating or changing credential-binding state MUST require `Admin` authority after bootstrap.
- Exceptional membership recovery operations MUST require `Admin` authority after bootstrap and MUST preserve Program Membership ownership of ordinary participation lifecycle.
- Sensitive identity-management operations MUST produce an audit record.
- Audit records for sensitive identity-management operations MUST identify the acting internal `Identity` when one exists.
- Bootstrap audit records MUST distinguish bootstrap action from ordinary Admin action.
- Audit records MUST identify the affected internal `Identity`, credential-binding state, admin-authority change, or exceptional recovery change.
- Backup or restore flows MUST NOT make an instance operational in a state that violates the effective-Admin invariant.
- Later ADRs MAY define authentication strength, reauthentication, privileged confirmation, backup/restore mechanics, schema, UI, and permission-framework implementation only if they preserve this recovery invariant or explicitly amend this ADR.

## Consequences

Agonara needs invariant checks around identity lifecycle, Admin assignment, exceptional recovery, and restore activation.

The bootstrap path is special because it creates operational control before an acting `Admin` exists. That exception must be explicit and auditable.

Identity and role-management operations become security-sensitive product behavior, not ordinary data edits.

Admins can recover operational control through explicit identity and role-management capabilities, but they do not become implicit owners of curator decisions, accepted program content, student learning state, or assessment results.

The first implementation can keep recovery workflows small, but it must not permit normal operations or restore activation to strand the instance without effective Admin control.

## Non-Goals

This ADR does not decide:

- authentication provider or framework;
- session mechanism;
- MFA, passkeys, recovery codes, or password policy;
- reauthentication or privileged-action confirmation policy;
- exact credential lifecycle operations;
- exact backup/restore file format or restore procedure;
- audit log storage schema, retention, or query UI;
- database schema, storage layout, or migration plan;
- admin UI, API route, or permission-framework implementation;
- organization, team, tenant, or enterprise authorization models.
