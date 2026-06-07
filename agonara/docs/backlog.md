---
date: 2026-06-07
model: gpt-5
description: "Deferred design decisions for Agonara."
version: 0.0.9
---

# Backlog

## Future product-state decisions

Storage ownership is no longer deferred as a standalone decision axis. The
current persisted runtime state is tracked in
[`implementation-notes.md`](implementation-notes.md#current-runtime-state) and
the [`README.md`](../README.md#current-implementation-snapshot).

Future persisted state must be introduced only through the owning module's
responsibility, spec, and acceptance rules. Verify that ownership in the module
responsibility map and in the relevant spec or implementation-plan review gate.

Open questions:

- Which future membership-policy variants, if any, are needed beyond implemented
  Student self-join and invitation-only access without turning Admin authority
  into a Program role?
- Which future `/learn` UI artifacts, if any, need persisted learner-facing
  presentation state beyond the implemented Quick Check, navigation,
  learner-state, readiness, membership, Curator coverage-gap, and Curator LLM
  suggestion first slices?

## Under consideration

Documents parked in an `under-consideration/` folder need an owning decision before downstream docs are revised. Do not let that folder go stale.

No active under-consideration documents.

When a parked document is resolved, move it out of `under-consideration/` (into `agonara/docs/` for accepted direction, or `archive/` if rejected) and log the decision in `agonara/docs/log.md`.
