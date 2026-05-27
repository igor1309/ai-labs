---
date: 2026-05-27
model: gpt-5.5-thinking
description: "Deferred design decisions for Agonara."
version: 0.0.4
---

# Backlog

## Storage ownership

Storage design is deferred until module behavior and state ownership are clarified.

Storage must be derived from module responsibilities, not specified as an independent axis.

## Under consideration

Documents parked in [`under-consideration/`](under-consideration/) need an owning decision before downstream docs are revised. Do not let this folder go stale.

No active under-consideration documents.

When a parked document is resolved, move it out of `under-consideration/` (into `agonara/docs/` for accepted direction, or `archive/` if rejected) and log the decision in `agonara/docs/log.md`.
