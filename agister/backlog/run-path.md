---
date: 2026-10-16
model: claude-opus-5-5
description: "Backlog: the run path after its first fifteen slices: the rest of the record, reaping, the rest of the model runtimes, the other operators, sources and budgets"
---

# The run path

The first slice (`docs/run-implementation.md`, "The first run") runs a
workflow of bash steps in sequence; the second ("A step on a model
runtime") a step on claude-code or codex; the third ("Inputs and
progress") the file and git sources, brief forms, and a run's progress
on stderr; the fourth ("A step in a held worktree") admission, holds
and staleness; the fifth ("Parallel steps and a join") a parallel of
steps and the join after it; the sixth ("Records") a run's record; the seventh
("Continuation") `--continue`; the eighth ("Recovery") a stale turn
resumed; the ninth ("Runs") inputs recorded and `runs export`; the
tenth ("Retiring the archive") this Agister installed as `agister`;
the eleventh ("Reuse") an earlier run's completed calls taken; the
twelfth ("Capacity") a turn at capacity retried; the thirteenth
("A binding continuing a session") a step continuing an earlier step's
session; the fourteenth ("A call's changes") the HEAD a call left and a
pinned call's patch; the fifteenth ("Definitions") each call's
definitions with their digests, compared by a reuse.
What it leaves out, roughly in the
order it is needed:

- **The rest of the record**: the process's environment, the permission plan (ADR-001, invariant 6);
  other commands on runs.
- **Reaping**: the owner's identity and reaping what a dead owner's
  programs left running (ADR-012, rule 6); ending
  what left a program's group, which the supervisor reads no longer
  than the grace and does not yet end.
- **Model runtimes, the rest** (after "A step on a model runtime"): a
  turn on pi; skills
  given to a turn; codex's cost through `ccusage`; the version warning
  (ADR-003, rule 8), from the version the turn reports; a cost limit.
- **Staleness on bash**: the no-event limit on every runtime (ADR-012,
  rule 6), bash's lines reported as the models' are.
- **Operators**: a parallel of more than steps, and a field read
  within its outputs; branch, bounded
  repetition, a child workflow (ADR-011, rule 2); conditions.
- **Sources, the rest**: `git.merge_base`, `git.diff`; artifacts; the
  record keeping each call's bytes (ADR-010, rule 4).
- **Budgets**: an enclosing time and cost budget.
- **A fallback agent**: a call failed at capacity, its retries spent,
  made on another agent the settings declare, the record showing it
  (ADR-004, rule 8).
