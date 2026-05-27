---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Deferred design decisions for Agonara."
version: 0.0.3
---

# Backlog

## Storage ownership

Storage design is deferred until module behavior and state ownership are clarified.

Storage must be derived from module responsibilities, not specified as an independent axis.

## Under consideration

Documents parked in [`under-consideration/`](under-consideration/) need an owning decision before downstream docs are revised. Do not let this folder go stale.

- [`program_membership_manager_rationale_v0.1.0.md`](under-consideration/program_membership_manager_rationale_v0.1.0.md) + [peer review](under-consideration/program_membership_manager_rationale_review_v0.1.0.md): decide whether `Program Membership Manager` is a grantable role or a narrative actor. Cascading updates to ADR-002 (or a new ADR), the module responsibility map, the Program Membership Pre-ADR, and the Student/Curator/Admin story catalogs are gated on this decision.

When a parked document is resolved, move it out of `under-consideration/` (into `agonara/docs/` for accepted direction, or `archive/` if rejected) and log the decision in `agonara/docs/log.md`.
