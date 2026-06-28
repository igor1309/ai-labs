---
name: process-gates
author: Igor Malyarov
version: "1.3.0"
description: Use during implementation execution for preflight, pre-commit scope checks, step closeout, pre-push/pre-PR gates, hard process gates, and completion verification. For authoring or editing implementation plans, use implementation-plan first.
trigger: when implementing, running preflight, committing, pushing, opening PRs, closing out steps, or verifying completion
---

# Process Gates

For implementation plan authoring and declaration validation, use
`implementation-plan` first. This skill governs execution after a plan exists.

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
7. Follow the active plan's push policy. If no push policy is declared, do not push unless the user explicitly asks.
8. Follow the active plan's execution mode. In `auto-continue` mode, continue to the next step after green gates and local commit. In `human-review-gated` mode, stop and wait for review approval before starting the next step.

## Pre-Push / Pre-PR Gate (Blocking)

Before pushing a branch or creating a PR, verify ALL of the following. Do not push until every item passes:

1. **Log updated**: relevant changelog reflects what changed.
2. **Plan updated**: active plan checkboxes match completed work.
3. **No leftover changes**: `git status` is clean — no uncommitted docs, config, or code changes that belong in this branch.
4. **Docker verified**: for Docker-producing units, `docker build` must pass.
5. **Verification passes**: required verification for the changed scope is green.
6. **Plan adversarial review (if a plan changed)**: when the branch adds or modifies an implementation plan, run an adversarial review against the plan's mandatory structure and any repo-declared plan-review skill. Fix every fail/warn finding and commit before pushing. Scattered equivalent bullets do not substitute for required headings.
7. **PR narrative quality (plan or implementation PRs)**: derive PR title and body from the plan's goal, scope, source artifacts, verification gates, and changed docs/code. A vague commit-summary title or body is not acceptable when the plan provides better context.

If any item fails, fix it and commit before pushing. Do not push code and leave docs for a follow-up commit.

Required verification is scope-based:

- Code, config, dependency, CI, release, or generated-artifact changes require the targeted or full test/build gates defined by repo instructions.
- Docs-only changes require document-structure and content checks only, unless they change executable examples, generated outputs, CI/release behavior, or package/tooling configuration.
- Mixed changes require every applicable gate.

## Implementation Preflight Gate (Blocking)

Before any implementation action (editing files, running implementation tests, or committing), run and report preflight:

1. **Establish/realign the execution lock.** Before Step 1, read the plan's `Expected worktree` and `Expected branch`. When either is a pattern, the literal `set at execution`, or names a branch that no longer exists — the case of a plan authored for deferred execution and then committed/merged — establish the lock against the current session's real worktree and branch instead of honoring the authored value. A pinned-but-dead `Expected branch` is replaced, not honored as a blocker. Record the resolved worktree and branch as the active lock for the remaining steps. A concrete, still-live `Expected branch` is used as-is.
2. Confirm the active plan's worktree mode: `create new`, `reuse existing`, or `none`.
3. Verify with git commands (minimum): `git worktree list --porcelain` and `git branch --show-current`.
4. Capture current worktree path and branch.
5. Emit a preflight status line:
   - `Preflight: worktree=<path>, branch=<branch>, separate_worktree=<pass|fail>`
   - `separate_worktree=pass` means the current worktree satisfies the active plan's worktree mode and branch lock. For `reuse existing`, it may be an existing non-root dedicated worktree.
6. If worktree mode is `create new` and preflight is `fail`, create a new separate worktree and rerun preflight until it is `pass` (do not implement from the root worktree).
7. If worktree mode is `reuse existing` and preflight is `fail`, stop and report the mismatch instead of creating or switching worktrees.
8. If any preflight item fails, no file edits are allowed.

## Process Discipline Hard Gates

- Execution lock is mandatory, never advisory.
- If a plan requires a separate worktree/branch or a specific existing worktree/branch, no edits may start before preflight passes.
- Human review stops are plan-controlled. Self-review is always required; human review is required only when the active plan declares `human-review-gated` mode or the user explicitly asks for it.
- User scope changes do not implicitly waive plan locks.
- If a requested action would violate a plan lock, ask one explicit override question first and proceed only after confirmation.
- Commit is forbidden while any mandatory plan gate is incomplete, unless the user explicitly approves overriding that gate.
- Immediately before commit, list gate status (`passed` or `not passed`) for required preflight, scope verification, step closeout, and plan-tracker updates.
- Do not claim completion ("done", "in full", "completed") unless all mandatory gates have passed.
- If blocked by environment (tooling, network, permissions), report blocked status and list exact unmet gates.
- If the agent detects it already violated a lock, report that violation immediately before any further action.

## Plan Structure Gate (Blocking)

Implementation plans MUST follow the repo's declared mandatory plan structure when one exists. When the repo does not declare one, the following minimum sections apply:

- `Goal`
- `Execution mode`
- `Execution lock`
- `Scope guardrails`
- One or more phases/tasks (`## Phase N — Name` or `## Task N — Name`)
- `Done criteria`
- `Final closeout`

Rules:

1. Missing any required section is a blocking failure, not a style warning.
2. Scattered equivalent bullets do not satisfy a required heading. A `Goal:` line under another section is not a `## Goal` section.
3. `Done criteria` must be explicit and observable, not implied by the phase list.
4. `Final closeout` must declare archive behavior (move completed plan to the implemented directory) and push/PR behavior.
5. Plan-creation, plan-modification, and pre-PR adversarial review (see Pre-Push gate) all enforce this gate.
6. If the repo declares a stricter structure (e.g. `docs/my-way/05-implementation-plan/structure.md` or an equivalent), the stricter list wins and every section it names becomes mandatory.

## Completion Verification

After an implementation step or plan completion, verify:

- [ ] Every changed file is tied to the current step (no scope creep).
- [ ] Required verification passes for the changed scope.
- [ ] Plan tracker checkboxes match completed work.
- [ ] `git status` is clean before push.
- [ ] Preflight passed before any edits (if required by plan).
- [ ] No gate was skipped without explicit user override.
- [ ] Active plan has every required section (see Plan Structure Gate).
- [ ] `Done criteria` are explicit and observable.
- [ ] `Final closeout` declares archive behavior and push/PR behavior.
- [ ] At plan completion: completed plan is moved to the implemented directory in the same change set as the implementation.
