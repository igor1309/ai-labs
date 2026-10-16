---
date: 2026-10-16
model: claude-opus-5-5
description: "Backlog: the run path after its first two slices: records, holds, staleness, the rest of the model runtimes, the other operators, sources and continuation"
---

# The run path

The first slice (`docs/run-implementation.md`, "The first run") runs a
workflow of bash steps in sequence; the second ("A step on a model
runtime") a step on claude-code or codex. What it leaves out, roughly in the
order it is needed:

- **Records**: `runstore`, a run's and a call's identity, events from
  core, and the record (ADR-001, invariant 6; "Runs").
- **Holds and admission**: `core/admit`, a reader or a writer, a pinned
  revision, a clean worktree (ADR-004, rules 2 and 3); the owner's
  identity and reaping what a dead owner left (ADR-012, rule 6); ending
  what left a program's group, which the supervisor reads no longer
  than the grace and does not yet end.
- **Model runtimes, the rest** (after "A step on a model runtime"): a
  turn on pi; a resumed session, a continuation and recovery; skills
  given to a turn; codex's cost through `ccusage`; the version warning
  (ADR-003, rule 8), from the version the turn reports; a cost limit.
- **Staleness and recovery**: `core/watch`, the supervisor streaming its
  output, `core/call` ending a stale turn and resuming (ADR-006).
- **Operators**: parallel, branch, bounded repetition, a child workflow
  (ADR-011, rule 2); conditions.
- **Sources**: `git.revision`, `git.changed_files`, a file; brief forms
  (ADR-010, rule 5); artifacts.
- **Budgets and continuation**: an enclosing time and cost budget;
  `--continue` (ADR-004, rule 5).
