---
name: implementation-plan
author: Igor Malyarov
version: "1.1.0"
description: Use when authoring, editing, or validating implementation plans under any docs/plans path; defines task/phase/step vocabulary, required execution declarations, and the acceptance checklist that catches invalid worktree, branch, and push-policy declarations before execution starts.
trigger: when creating or modifying implementation plans, especially files under **/docs/plans/**.md
---

# Implementation Plan

Use this before writing or editing any implementation plan declaration block.
This skill owns plan authoring vocabulary and declaration acceptance. Use
`process-gates` for execution-time preflight, step closeout, commit, push, and
completion gates.

## Vocabulary

- **Task** — the unit that owns a worktree, branch, and push policy. One task
  produces one PR unless the user or plan explicitly declares otherwise.
- **Phase** — an ordered sub-unit inside a task. Phases share the task's
  worktree, branch, and PR. A phase never declares its own worktree, branch, or
  push policy.
- **Step** — the smallest commit-sized unit, inside a phase or directly inside
  a task.

If a supposed phase needs its own branch, worktree, or PR, it is a task. Rename
or restructure it before execution.

## Required Declaration Block

Every implementation plan must declare these seven fields before Step 1. They
split into two groups by who owns them and when they are set.

**Planning intent — author-set at authoring time:**

- `Execution mode`: `auto-continue` or `human-review-gated`
- `Human review between tasks`: `yes` or `no`
- `Push policy`: `no push`, `push after task`, or `push at closeout`

**Execution lock — executor-set at execution start:**

- `Worktree mode`: `create new`, `reuse existing`, or `none`
- `Expected worktree`: a concrete path or single resolvable pattern
- `Expected branch`: a concrete branch name or single resolvable pattern
- `Preflight check`: unchecked while authoring; checked only after verified
  execution preflight evidence exists

The author sets the planning-intent fields. The executor sets the execution-lock
fields against the real session at execution start. An author may pre-fill the
execution lock **only** when authoring and execution are the same session and
worktree.

This does not relax the rule that every field is declared before Step 1: the
executor populates the lock *at execution start, which precedes Step 1*. The
split assigns ownership and timing; it does not move any field past Step 1.

Do not invent declaration values. Values like `standard`, `normal`, `phase
branch`, or `push at the end of each phase as one PR` fail the declaration
check.

## Acceptance Checklist

Run this checklist before Step 1 of any implementation plan. Halt on any
failure and fix the plan first.

- [ ] All required declaration fields are present and non-empty.
- [ ] The declaration block respects the planning-intent vs execution-lock split:
  planning-intent fields are author-set; execution-lock fields are executor-set at
  execution start, and are pre-filled at authoring only when authoring and
  execution are the same session and worktree.
- [ ] `Worktree mode` is exactly one of `create new`, `reuse existing`, `none`.
- [ ] `Push policy` is exactly one of `no push`, `push after task`,
  `push at closeout`.
- [ ] `Execution mode` is exactly one of `auto-continue`,
  `human-review-gated`.
- [ ] If the plan has phases, no phase declares its own worktree, branch, or
  push policy.
- [ ] `Expected worktree` and `Expected branch` resolve to one task-level target,
  not a different target per phase.
- [ ] Push cadence aligns with task boundaries, not phase boundaries.

## Existing Plan Migration

When interacting with an existing plan, reconcile its declaration block against
the checklist before continuing. Do not sweep every old plan preemptively; fix
plans at the moment they are edited or executed.

If a legacy plan describes per-phase worktrees, branches, or PRs, either:

- rename those units to tasks, or
- merge them into one task whose phases share one worktree, branch, and PR.
