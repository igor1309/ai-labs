---
date: 2026-05-05
model: claude-opus-4-7
description: "Restructure process-gates skill: split plan-authoring from execution gates, add task/phase vocabulary, add plan-declaration acceptance checklist, improve discovery"
---

# Process-Gates Skill Restructure Plan

> Status: implemented on 2026-06-07. Added
> `dev-skills/public/implementation-plan/SKILL.md`, narrowed
> `dev-skills/public/process-gates/SKILL.md` to execution gates, updated
> discovery in `AGENTS.md`, `.agents/process-gates.md`, and
> `dev-skills/public/using-dev-skills/SKILL.md`, and archived this plan.

## Source incident

The clipdeck MVP implementation plan (`clipdeck/docs/plans/clipdeck-mvp.md:62-70`) declared:

- `Worktree mode. Standard.` — `Standard` is not a value in the `process-gates` enum (`create new | reuse existing | none`).
- `Push policy. Push at the end of each phase as one PR …` — phases are described as owning their own worktree and PR, which conflicts with the user's model that a phase is a sub-unit of a task and inherits the task's infrastructure.

Investigation of session `96847c95-9745-4dbf-90fc-d08f96da3704` (commit `aacd8624`, 2026-05-01) showed the `process-gates` skill was **never invoked** when the plan was authored. Skills actually invoked: `adr-governance`, `arch-doc-review`, `cold-start-checkpoint`, `discuss`, `spec-writing`. The "Plan declarations" block was written free-hand citing repo `CLAUDE.md` prose.

## Root causes

1. **Poor discovery.** No automated trigger fires `process-gates` during plan authoring. The agent must remember to invoke it.
2. **Poor naming.** `process-gates` reads as an execution-time / CI-style gate skill. Its plan-authoring responsibility (the "Plan Creation Lock" section) is hidden behind the name.
3. **Poor vocabulary.** The skill never defines task, phase, or step. Authors invent meanings (e.g., per-phase worktrees) that violate the intended hierarchy.
4. **No acceptance criteria.** Even when invoked, the skill lists fields to include but no checklist that validates the resulting declaration block. Invalid values like `Standard` pass the eye test.
5. **No coverage for greenfield feature plans.** `tactical-action-plan-guide` is scoped to single-finding refactors with a closed YAML schema. Feature plans like clipdeck-mvp have no dedicated authoring skill.

## Proposed changes

### 1. Split `process-gates` into two skills

**New skill: `implementation-plan`** (authoring).

Owns:

- Plan declaration block (the six fields).
- Task / phase / step vocabulary.
- Plan-declaration acceptance checklist.
- Format rules for plans authored under any `**/plans/**.md` path.

**Keep `process-gates`**, narrowed to execution-time gates only.

Owns:

- Pre-commit scope check.
- Step closeout protocol.
- Pre-push / pre-PR gate.
- Implementation preflight gate.
- Process discipline hard gates.
- Completion verification.

Remove the "Plan Creation Lock" section; replace with a one-line pointer to `implementation-plan`.

### 2. Define vocabulary inside `implementation-plan`

- **Task** — the unit that owns a worktree, branch, and push policy. One PR per task.
- **Phase** — an ordered sub-unit *inside* a task. Phases share the task's worktree/branch and contribute commits to the same PR. Phases never declare their own worktree, branch, or push policy.
- **Step** — the smallest commit-sized unit, inside a phase or directly inside a task.

### 3. Add plan-declaration acceptance checklist

Run before Step 1 of any plan. Halt on any failure.

- [ ] All six required declaration fields present and non-empty.
- [ ] `Worktree mode` value is one of `create new | reuse existing | none` (no invented values).
- [ ] `Push policy` value is one of the defined enum values.
- [ ] If the plan describes phases: no phase declares its own worktree, branch, or push policy. Violation = the unit is actually a task; rename or restructure.
- [ ] `Expected worktree` and `Expected branch` resolve to a single concrete path/name per task.
- [ ] `Push policy` cadence aligns with task boundaries, not phase boundaries.

### 4. Improve discovery

- Add CLAUDE.md instruction: *"When authoring or editing any file under `**/plans/**.md`, invoke `implementation-plan` before writing the declarations block."*
- Optional: add a UserPromptSubmit / PreToolUse hook that surfaces a reminder when about to Write a `plans/*.md` file.

### 5. Migration policy for existing plans

When the agent next interacts with an existing plan, it must reconcile the declaration block against the new acceptance checklist before continuing. This catches violations at the moment they matter (next execution) without an immediate sweep of all plans.

Specifically for `clipdeck/docs/plans/clipdeck-mvp.md`: rename "Phase N" units to "Task N" (since each owns its own branch/worktree/PR), or merge them into one task with phases as sub-units sharing one branch and one PR.

## Out of scope

- `tactical-action-plan-guide` — orthogonal scope (refactor micro-plans driven by review findings). Leave untouched.
- Plan-tracker checkbox progression and "implemented/" archive move stay in `process-gates` execution gates, not in `implementation-plan`.

## Open questions

- Should the new `implementation-plan` skill be opinionated about plan structure beyond the declaration block (e.g., required sections, headings)? Current lean: keep it narrow to declarations + vocabulary; let `spec-writing` and `arch-doc-review` cover content shape.
- Hook vs. CLAUDE.md instruction for discovery: instruction-only is cheaper; hook is more reliable. Decide based on how often the agent currently misses skill triggers.

## Verification (after implementation)

- New `implementation-plan` skill exists at `dev-skills/public/implementation-plan/SKILL.md` with the four sections above.
- `process-gates/SKILL.md` no longer contains the "Plan Creation Lock" section.
- CLAUDE.md references both skills with correct scope.
- A test plan authored after the change passes the acceptance checklist; `Standard` and per-phase worktree declarations are caught and rejected.
