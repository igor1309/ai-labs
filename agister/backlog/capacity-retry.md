---
date: 2026-10-14
model: claude-opus-5-5
description: "Backlog: a turn that fails on 'model at capacity' is retried, from LAB-249 and the owner's decisions there"
---

# A turn failed on capacity is retried

From LAB-249. A runtime can fail a turn because its model is at capacity:
transient, clearing in minutes, with no reset time. The archive classed
it as a runtime error, retried nothing, and lost a fan-out node or a
whole review to it; every caller wrote its own retry loop.

## The owner's decisions (2026-10-13)

- **The runtime wrapper recognises it** and maps it to a class of its own,
  `capacity`, apart from a runtime error and a usage limit. Only the
  wrapper knows the provider's wording (Codex's "Selected model is at
  capacity", Claude's overloaded error).
- **Core retries it,** one policy for every runtime: 3 attempts by
  default, a backoff between them of 30 to 60 seconds, on by default.
  Each attempt is recorded. The call's time and cost limits bound the
  retries.
- **A resumable session resumes,** keeping the work done before the
  failure; otherwise the turn reruns.
- **In a workflow,** only the failed node is retried; the join waits for
  it.
- **No fallback to another agent** unless the settings declare one, and
  the record shows it.
- Why not inside the wrapper: it cannot see the record, the session, the
  call's limits or the workflow, and its attempts would go uncounted.

## Where it lands

`core/session` (ADR-001) and ADR-006's shape: a failed turn, a budget of
attempts, recorded. Resuming a session is ADR-003's open point.
