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
- `Expected worktree`: a concrete path, a single resolvable pattern, or
  `set at execution`
- `Expected branch`: a concrete branch name, a single resolvable pattern, or
  `set at execution`
- `Preflight check`: unchecked while authoring; checked only after verified
  execution preflight evidence exists

The author sets the planning-intent fields. The executor sets the execution-lock
fields against the real session at execution start. An author may pre-fill the
execution lock **only** when authoring and execution are the same session and
worktree.

This does not relax the rule that every field is declared before Step 1: the
executor populates the lock *at execution start, which precedes Step 1*. The
split assigns ownership and timing; it does not move any field past Step 1.

A concrete live branch (or worktree path) is required for `Expected branch` and
`Expected worktree` only when authoring and execution are the same session. A
plan authored for separate or later execution MUST use the pattern form (e.g.
`claude/<feature>-impl-*`) or the literal `set at execution`, never a pinned
authoring branch — that branch goes dead once the plan is committed or merged,
and a later executor that honors it stalls against a guard meant to protect
execution.

Do not invent declaration values. Values like `standard`, `normal`, `phase
branch`, or `push at the end of each phase as one PR` fail the declaration
check. The literal `set at execution` is the one allowed deferral marker for
`Expected worktree` and `Expected branch`; it is not an invented value and does
not fail the check.

## Plan Lifecycle

A plan runs in one of two lifecycle modes. They differ only in whether the
execution lock can be concrete at authoring time.

- **Same-session — authored and executed together.** Authoring and execution
  share one session, worktree, and branch. The execution lock may be concrete:
  the author records the real worktree and branch, and `Preflight check` is
  satisfied once execution preflight evidence exists.
- **Deferred — authored, committed/merged, executed later.** The plan is
  authored in one session and executed later in a different session and branch.
  At authoring the execution lock is **intent only**: express `Expected
  worktree`/`Expected branch` as a pattern or `set at execution`, never a pinned
  authoring branch (which goes dead once the plan is committed or merged). The
  executor re-establishes the lock against the real session at execution start —
  see `process-gates` for the execution-start re-validation gate.

### Deferred-lock declaration example

A plan authored now for execution in a later session declares the execution lock
as intent only. The author sets the planning-intent fields; the execution-lock
fields use the pattern or `set at execution` form, and `Preflight check` is left
for the executor:

```
Execution mode: auto-continue
Human review between tasks: no
Push policy: push at closeout
Worktree mode: create new
Expected worktree: set at execution
Expected branch: claude/<feature>-impl-*
Preflight check: [ ] (executor establishes the lock at execution start)
```

Because `Expected branch` is a pattern (or `set at execution`), merging this plan
before execution leaves no concrete branch to go stale. The executor resolves
both lock fields against the real session per the `process-gates` Implementation
Preflight Gate. Do not pin the authoring branch here — that is the same-session
form, and it goes dead once the plan is merged.

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
- [ ] If `Expected branch` names a concrete branch, this plan is executed and
  pushed from that branch **in this session**; otherwise it is a pattern or
  `set at execution`.
- [ ] A plan intended to be committed/merged before execution MUST NOT pin a
  concrete authoring branch as `Expected branch`.
- [ ] Push cadence aligns with task boundaries, not phase boundaries.

## Existing Plan Migration

When interacting with an existing plan, reconcile its declaration block against
the checklist before continuing. Do not sweep every old plan preemptively; fix
plans at the moment they are edited or executed.

If a legacy plan describes per-phase worktrees, branches, or PRs, either:

- rename those units to tasks, or
- merge them into one task whose phases share one worktree, branch, and PR.

When executing a previously-committed or merged plan, treat its execution lock as
intent, not as a live target: re-establish `Expected worktree`/`Expected branch`
against the current session per the `Plan Lifecycle` deferred mode and the
`process-gates` execution-lock realignment step. A pinned authoring branch that no
longer exists is replaced, not honored as a blocker.
