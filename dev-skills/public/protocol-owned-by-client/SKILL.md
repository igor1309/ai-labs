---
name: protocol-owned-by-client
version: "1.0.0"
description: Protocol/interface ownership rule — client owns the dependency shape, protocol lives with its client
trigger: when creating or modifying protocols, interfaces, or module boundaries
---

# "Protocol Owned by Client" Rule

- The client defines and owns the dependency shape (protocol/interface/data model).
- A protocol MUST live in the same module as its client. Separating them is a violation.
- If the client is public, its protocol must be public so composition can supply an implementation.
- Composition layer(s) adapts concrete implementations to client-owned protocols.
- Modules MUST NOT know about CLI or each other.
