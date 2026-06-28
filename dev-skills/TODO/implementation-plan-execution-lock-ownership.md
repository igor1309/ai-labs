---
date: 2026-06-28
model: claude-opus-4-8
description: "Close the execution-lock ownership/lifecycle gap in the implementation-plan skill so authored-then-later-executed plans don't pin stale branches that block the implementer."
---

# implementation-plan: execution-lock ownership and plan lifecycle

## Why

The `implementation-plan` skill defines the declaration block's *form* — the required
fields, their legal values, and `Preflight check: unchecked while authoring` — but is silent
on two things:

1. **Ownership.** It never says which fields the *author* sets at authoring time and which the
   *executor* sets at execution start.
2. **Lifecycle.** Its implicit model is one session where author ≈ executor. It does not
   contemplate a plan that is authored, committed/merged, and executed later in a different
   session and branch.

Consequence: the skill permits `Expected branch` to be "a concrete branch name or single
resolvable pattern" and warns "Do not invent declaration values," but gives no rule steering an
author toward the pattern form for a plan executed later — so the author pins the only concrete
branch available, the authoring branch. When that plan is merged before execution, the pin goes dead. A later
implementer that honors `process-gates` reads `Preflight: [ ]` against a now-deleted
`Expected branch` and stalls: a guard meant to protect execution becomes a blocker to it. The
`Acceptance Checklist` passes the plan because it validates form, not whether the pinned branch
matches a real execution context.

This is a Definition-of-Done gap, not a one-off mistake: any agent authoring a plan-to-be-merged
is nudged into the same defect with nothing in the checklist to catch it.

## Outcome

`implementation-plan` (and its `process-gates` boundary) make the author/executor split and the
plan lifecycle explicit and *checkable*, so a plan authored for later/separate execution carries
the execution lock as intent only, and the executor re-establishes it against the real session
before Step 1.

## Forward tasks

IP-4/IP-5 add lifecycle and the `process-gates` boundary; IP-6/IP-7 reinforce; IP-8 is the
release wrapper that gates shipping. These build on the declaration-block split, the
`set at execution` deferral marker, and the stale-pin acceptance guards already present in
`implementation-plan`.

### IP-4 — Add a "Plan lifecycle" subsection (P1)

- **Change:** new short subsection naming both modes:
  - (a) authored-and-executed in one session — the execution lock may be concrete;
  - (b) authored, committed/merged, executed later — the execution lock is **intent only** at
    authoring and MUST be re-established by the executor at execution start.
- **DoD:** subsection exists, names both modes, and cross-references `process-gates` for (b).

### IP-5 — Execution-start re-validation of the lock — boundary with `process-gates` (P1)

- **Change:** one-line pointer in `implementation-plan`; the actual gate lands in
  `public/process-gates/SKILL.md` (its DoD owner): "Before Step 1, the executor establishes /
  realigns the execution lock to the current session's real worktree and branch and checks
  preflight; a pinned-but-dead branch is replaced, not honored as a blocker."
- **DoD:** cross-ref in `implementation-plan`; concrete gate added to `process-gates`.
- **Note:** spans two skills — both need version bumps (see IP-8).

### IP-6 — Worked example of a deferred-lock plan (P2)

- **Change:** add an example fragment (in the skill or `docs/my-way/05-implementation-plan/example.md`)
  showing `Worktree mode: create new`, `Expected branch: claude/<feature>-impl-*` (or
  `set at execution`), `Preflight check: [ ] (executor establishes at execution start)`, so
  agents stop pattern-matching the same-session pinned-branch form.
- **DoD:** example present and consistent with the declaration-block split and the
  `set at execution` deferral marker in `implementation-plan`.

### IP-7 — Reconcile `## Existing Plan Migration` with the new lifecycle rules (P2)

- **Change:** add a clause: when executing a previously-merged plan, treat its execution lock as
  intent and re-establish it (IP-4/IP-5) rather than honoring a dead pin.
- **DoD:** clause present and consistent with IP-4/IP-5.

### IP-8 — Release hygiene for the change set (P0 to complete)

- **Change:** per `dev-skills/.claude/CLAUDE.md`, MINOR-bump `implementation-plan` (new
  section/behavior) and `process-gates` (IP-5) — version bumps for this change set are
  deliberately deferred to here, not done per-commit. Sync `public/.claude-plugin/marketplace.json`
  and `public/.codex-plugin/plugin.json` versions; update `dev-skills/docs/log.md`; PR into
  `trunk` with auto-merge; post-merge, verify CI and the public skills repo.
- **DoD:** versions bumped/synced, logs updated, single PR merged, post-merge checks pass.

## Open question

IP-5 deliberately puts the execution-time re-validation in `process-gates`, not
`implementation-plan`, to keep the authoring-skill vs execution-skill responsibilities clean —
the same author/executor split this backlog is closing. If the preference is to keep authoring
and execution guidance in one skill, IP-5's home changes accordingly.
