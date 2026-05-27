---
title: Agonara Implementation Notes
model: gpt-5.5-thinking
version: 0.1.0
---

# Agonara Implementation Notes

## Identity & Roles

Use external/framework authentication for credential verification.

Use Agonara internal Identity as the subject of ownership and action.

Use custom Agonara role assignments for product and operational roles.

Do not delegate Program-scoped Student / Program Curator roles to the authentication provider.

Do not use framework roles as the source of Agonara ownership.

Auth Provider / Framework
  verifies credential
  returns authenticated principal

Identity & Role Management
  maps credential/principal to internal Identity
  manages role assignments
  manages admin operations

Identity & Roles
  defines Identity
  defines Student / Program Curator / Admin
  defines ownership rules

Application modules
  ask: can this Identity act as this role in this Program?