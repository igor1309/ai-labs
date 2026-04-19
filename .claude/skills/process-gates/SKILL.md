---
name: process-gates
description: Pre-commit, step closeout, pre-push, preflight, hard gates, and plan creation locks for implementation work
trigger: when implementing, committing, pushing code, or creating implementation plans
---

# Process Gates

## Pre-Commit Scope Check

Before each commit:

1. Verify every changed file is directly tied to the current step.
2. Verify no out-of-scope files were added.
3. Run the required verification for the changed scope:
   - `./scripts/run_silent.sh "tests" npm test` for Node/TypeScript or repo-wide integration changes covered by the root suite
   - native unit checks such as `swift test` / `swift build` for Swift-only scopes

## Step closeout protocol

Mandatory after each implementation step:

1. Self-review the step against the approved spec and implementation plan scope.
2. Fix any issues found in the self-review.
3. Run the full test suite and fix failures until it passes.
4. Summarize what changed and why.
5. Commit only files related to the current step.
6. Update plan tracker checkboxes only for gates with verified evidence (successful command/check output).
7. Push the branch to `origin` unless explicitly instructed not to push.
8. Stop and wait for review approval before starting the next step.

## Pre-Push / Pre-PR Gate (Blocking)

Before pushing a branch or creating a PR, verify ALL of the following. Do not push until every item passes:

1. **Log updated**: relevant `docs/log.md` or `<project>/docs/log.md` reflects what changed.
2. **Plan updated**: active plan checkboxes match completed work.
3. **No leftover changes**: `git status` is clean — no uncommitted docs, config, or code changes that belong in this branch.
4. **Docker verified**: for Docker-producing units, `docker build` must pass (see "Local Docker Verification").
5. **Tests pass**: full test suite for the changed scope is green.

If any item fails, fix it and commit before pushing. Do not push code and leave docs for a follow-up commit.

## Implementation Preflight Gate (Blocking)

Before any implementation action (editing files, running implementation tests, or committing), run and report preflight:

1. Confirm whether the active plan requires a separate worktree/branch.
2. Verify with git commands (minimum): `git worktree list --porcelain` and `git branch --show-current`.
3. Capture current worktree path and branch.
4. Emit a preflight status line:
   - `Preflight: worktree=<path>, branch=<branch>, separate_worktree=<pass|fail>`
   - `separate_worktree=pass` means the current worktree is a newly created, non-root worktree (typically under `worktrees/<slug>`) and the branch is the dedicated work branch (typically `codex/<slug>`).
5. If separate worktree is required and preflight is `fail`, create a new separate worktree and rerun preflight until it is `pass` (do not implement from the root worktree). Example: `git worktree add -b codex/<slug> worktrees/<slug> trunk`
6. If any preflight item fails, no file edits are allowed.

## Process Discipline Hard Gates

- Execution lock is mandatory, never advisory.
- If a plan requires a separate worktree/branch, no edits may start before preflight passes.
- User scope changes do not implicitly waive plan locks.
- If a requested action would violate a plan lock, ask one explicit override question first and proceed only after confirmation.
- Commit is forbidden while any mandatory plan gate is incomplete, unless the user explicitly approves overriding that gate.
- Immediately before commit, list gate status (`passed` or `not passed`) for required preflight, tests, build, step closeout, and plan-tracker updates.
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
   - Use `./scripts/run_silent.sh "tests" npm test` when the step changes Node/TypeScript scope covered by the root suite or cross-project integration covered by that suite.
   - Use native unit verification such as `swift test` / `swift build` for Swift-only scopes.
6. Proceed only if green; if tests fail, fix first and re-run until green.
7. Commit step changes only after green.
8. Self-review immediately after each step commit; fix any fail/warning findings immediately, re-test, and commit fixes.
9. Mark implemented step status in the plan and commit the plan status update.
10. Repeat the same process for each next step.
11. At completion, run the final gates required by the changed scope.
   - Node/TypeScript or cross-project integration touching the root suite: `./scripts/run_silent.sh "build" npx tsc --noEmit` and `./scripts/run_silent.sh "tests" npm test`
   - Swift-only scope: native final gates such as `swift build` and `swift test`
12. Move completed plan from `docs/plans/` to `docs/plans/implemented/` (or `<project>/docs/plans/` → `<project>/docs/plans/implemented/` for project-scoped plans), commit the move, and create a PR.
