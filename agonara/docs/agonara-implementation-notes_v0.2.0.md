---
title: Agonara Implementation Notes
date: 2026-05-26
description: "Research notes on mapping external authentication to Agonara internal identity and roles."
model: gpt-5.5-thinking
version: 0.2.0
---

# Agonara Implementation Notes

## Purpose

Explore how external or framework authentication should map to Agonara internal Identity and role assignments. This research supports the Identity & Role Management first-slice Pre-ADR by clarifying the boundary between credential verification, internal ownership, and product roles.

## Identity & Roles

Use external/framework authentication for credential verification.

Use Agonara internal Identity as the subject of ownership and action.

Use custom Agonara role assignments for product and operational roles.

Do not delegate Program-scoped Student / Program Curator roles to the authentication provider.

Do not use framework roles as the source of Agonara ownership.

## Boundary Sketch

Auth Provider / Framework:

- verifies credential;
- returns authenticated principal.

Identity & Role Management:

- maps credential/principal to internal Identity;
- manages role assignments;
- manages admin operations.

Identity & Roles:

- defines Identity;
- defines Student / Program Curator / Admin;
- defines ownership rules.

Application modules:

- ask whether this Identity can act as this role in this Program.

## Open questions

- Which auth frameworks fit the dockerized private-instance deployment target?
- How does credential rotation preserve the same internal Identity?
- What audit record is required when a credential binding is created, changed, or removed?
- Should the first slice support multiple credential bindings per Identity?
- Which role checks belong in application modules and which belong in Identity & Role Management?
