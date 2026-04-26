---
name: process-gates
version: "1.0.1"
description: Pre-commit, step closeout, pre-push, preflight, hard gates, and plan creation locks for implementation work
trigger: when implementing, committing, pushing code, or creating implementation plans
---

# Process Gates

## Pre-Commit Scope Check

Before each commit:

1. Verify every changed file is directly tied to the current step.
2. Verify no out-of-scope files were added.
3. Run the required verification for the changed scope.

## Step Closeout Protocol

Mandatory after each implementation step:

1. Self-review the step against the approved spec and implementation plan scope.
2. Fix any issues found in the self-review.
3. Run the required verification for the changed scope and fix failures until it passes.
4. Summarize what changed and why.
5. Commit only files related to the current step.
6. Update plan tracker checkboxes only for gates with verified evidence (successful command/check output).
7. Push the branch to `origin` unless explicitly instructed not to push.
8. Stop and wait for review approval before starting the next step.

## Pre-Push / Pre-PR Gate (Blocking)

Before pushing a branch or creating a PR, verify ALL of the following. Do not push until every item passes:

1. **Log updated**: relevant changelog reflects what changed.
2. **Plan updated**: active plan checkboxes match completed work.
3. **No leftover changes**: `git status` is clean — no uncommitted docs, config, or code changes that belong in this branch.
4. **Docker verified**: for Docker-producing units, `docker build` must pass.
5. **Verification passes**: required verification for the changed scope is green.

If any item fails, fix it and commit before pushing. Do not push code and leave docs for a follow-up commit.

Required verification is scope-based:

- Code, config, dependency, CI, release, or generated-artifact changes require the targeted or full test/build gates defined by repo instructions.
- Docs-only changes require document-structure and content checks only, unless they change executable examples, generated outputs, CI/release behavior, or package/tooling configuration.
- Mixed changes require every applicable gate.

## Implementation Preflight Gate (Blocking)

Before any implementation action (editing files, running implementation tests, or committing), run and report preflight:

1. Confirm whether the active plan requires a separate worktree/branch.
2. Verify with git commands (minimum): `git worktree list --porcelain` and `git branch --show-current`.
3. Capture current worktree path and branch.
4. Emit a preflight status line:
   - `Preflight: worktree=<path>, branch=<branch>, separate_worktree=<pass|fail>`
   - `separate_worktree=pass` means the current worktree is a newly created, non-root worktree and the branch is the dedicated work branch.
5. If separate worktree is required and preflight is `fail`, create a new separate worktree and rerun preflight until it is `pass` (do not implement from the root worktree).
6. If any preflight item fails, no file edits are allowed.

## Process Discipline Hard Gates

- Execution lock is mandatory, never advisory.
- If a plan requires a separate worktree/branch, no edits may start before preflight passes.
- User scope changes do not implicitly waive plan locks.
- If a requested action would violate a plan lock, ask one explicit override question first and proceed only after confirmation.
- Commit is forbidden while any mandatory plan gate is incomplete, unless the user explicitly approves overriding that gate.
- Immediately before commit, list gate status (`passed` or `not passed`) for required preflight, scope verification, step closeout, and plan-tracker updates.
- Do not claim completion ("done", "in full", "completed") unless all mandatory gates have passed.
- If blocked by environment (tooling, network, permissions), report blocked status and list exact unmet gates.
- If the agent detects it already violated a lock, report that violation immediately before any further action.

## Plan Creation Lock

When creating implementation plans (especially from review findings), the plan must include an explicit execution lock:

1. Include explicit preflight fields:
   - `Worktree required: yes/no`
   - `Expected worktree: <path or pattern>`
   - `Expected branch: <name or pattern>`
   - `Preflight check: [ ] done`
2. Start from a new separate git worktree with a dedicated branch when required by the plan.
3. Require preflight verification before Step 1; if preflight fails, halt immediately.
4. Execute one step at a time with a green gate per step.
5. For each step, run the required targeted verification for the changed unit.
6. Proceed only if green; if tests fail, fix first and re-run until green.
7. Commit step changes only after green.
8. Self-review immediately after each step commit; fix any fail/warning findings immediately, re-test, and commit fixes.
9. Mark implemented step status in the plan and commit the plan status update.
10. Repeat the same process for each next step.
11. At completion, run the final gates required by the changed scope.
12. Move completed plan to the implemented plans directory, commit the move, and create a PR.

## Completion Verification

After an implementation step or plan completion, verify:

- [ ] Every changed file is tied to the current step (no scope creep).
- [ ] Required verification passes for the changed scope.
- [ ] Plan tracker checkboxes match completed work.
- [ ] `git status` is clean before push.
- [ ] Preflight passed before any edits (if required by plan).
- [ ] No gate was skipped without explicit user override.
