---
title: Agonara Implementation Notes
date: 2026-05-27
description: "Research notes on mapping external authentication to Agonara internal identity and authority."
model: gpt-5.5-thinking
version: 0.2.2
---

# Agonara Implementation Notes

## Purpose

Explore how external or framework authentication should map to Agonara internal Identity and authority. This research supports the Identity & Role Management first-slice Pre-ADR by clarifying the boundary between credential verification, internal ownership, and membership-backed product roles.

## Identity & Roles

Use external/framework authentication for credential verification.

Use Agonara internal Identity as the subject of ownership and action.

Use Agonara-owned authority state: Program Membership grants for product participation and Identity & Role Management state for Admin authority and operational access primitives.

Do not delegate Program-scoped Student / Program Curator roles to the authentication provider.

Do not use framework roles as the source of Agonara ownership.

## Boundary Sketch

Auth Provider / Framework:

- verifies credential;
- returns authenticated principal.

Identity & Role Management:

- maps credential/principal to internal Identity;
- manages Admin authority and operational access primitives;
- manages admin operations.

Program Membership:

- manages Student and Program Curator participation grants;
- answers effective participation decisions for an internal Identity, Program, and participation kind;
- hides membership policy details.

Identity & Roles:

- defines Identity;
- defines Student / Program Curator / Admin;
- defines ownership rules.

Application modules:

- ask Program Membership for the effective participation decision before participation-sensitive Student or Program Curator behavior.

## Open questions

- Which auth frameworks fit the dockerized private-instance deployment target?
- How does credential rotation preserve the same internal Identity?
- What audit record is required when a credential binding is created, changed, or removed?
- Should the first slice support multiple credential bindings per Identity?
