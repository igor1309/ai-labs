---
date: 2026-10-16
model: claude-opus-5-5
description: "Backlog: a run stopped by a usage limit goes on from where it stopped, on the same runtime after its reset or on another, from the agister-run branch"
---

# A run stopped by a usage limit goes on

From the agister-run branch, 2026-10-16. A usage limit, unlike capacity
(`run-implementation.md`, "Capacity"), comes with its reset time, often
an hour away. Three things cost a run each:

- An implement run stopped halfway leaves its changes in the worktree.
  A run on another agent is refused, as the worktree is not clean, so
  the changes had to be saved as a patch by hand and the files reset.
- A review's judge stopped by the limit threw away five finished
  reviews (since "Reuse", `--reuse` runs the judge alone).
- Nothing waited for the reset: the caller watched the clock and ran
  it again.

## Wanted

- A run stopped by a usage limit is recorded with the reset time the
  runtime gave.
- It can be continued on its own runtime after the reset, its session
  resumed, or on another agent from the changes it recorded, without
  hand work on the worktree; the record says which.
- A caller may ask to wait for the reset rather than fail.

## Where it lands

ADR-004 for the worktree a continued call starts from, and the run
path's continuation (`run-path.md`).
