---
name: implementation-plan
author: Igor Malyarov
version: "1.0.0"
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

Every implementation plan must declare these fields before Step 1:

- `Execution mode`: `auto-continue` or `human-review-gated`
- `Human review between tasks`: `yes` or `no`
- `Worktree mode`: `create new`, `reuse existing`, or `none`
- `Expected worktree`: a concrete path or single resolvable pattern
- `Expected branch`: a concrete branch name or single resolvable pattern
- `Push policy`: `no push`, `push after task`, or `push at closeout`
- `Preflight check`: unchecked while authoring; checked only after verified
  execution preflight evidence exists

Do not invent declaration values. Values like `standard`, `normal`, `phase
branch`, or `push at the end of each phase as one PR` fail the declaration
check.

## Acceptance Checklist

Run this checklist before Step 1 of any implementation plan. Halt on any
failure and fix the plan first.

- [ ] All required declaration fields are present and non-empty.
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
