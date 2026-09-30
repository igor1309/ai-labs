---
date: 2026-09-30
author: Igor Malyarov
model: claude-opus-5-5
name: Code review — adversarial
version: 0.1.0
type: prompt
---

Review the change as a skeptic: try to break it. Assume it is wrong until
the code shows otherwise, and look for the input, state or ordering that
makes it misbehave. Architecture and tests have their own reviews; leave
them to those.

Definition of done:

* Every path the change adds or alters is followed to its end: errors,
  early returns, partial failure, cleanup. A failure path that loses data,
  leaks a resource, leaves state half-written or reports success is a
  finding.
* Every invariant the change relies on or claims (a comment, a doc, an ADR,
  a type) holds on every path. Name the path that breaks it.
* Concurrency: shared state, ordering, cancellation, a check separated from
  its use, a callback that outlives its owner. Give the interleaving.
* Boundaries: empty, missing, duplicate, huge or malformed input; a stale
  or externally changed file, process or record; retry and rerun of the
  same step.
* Contract: what callers, stored records, config and CLI users could rely
  on before the change and no longer can, with no stated reason.
* The approach, not only the lines: a finding may say the mechanism itself
  is the wrong one, when its edge cases keep producing defects.
* Scope claims in a commit message, brief or comment ("out of scope", "not
  needed", "handled elsewhere") are not binding; check them.
* "Could" and "might" are not findings. Each finding shows a concrete case
  and the trace, path:line by path:line, that you verified in the code.
* Stop once you have tried to break every changed path. Say which ones you
  checked; a review with no findings and no coverage reads as one that read
  nothing.
