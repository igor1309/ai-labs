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

IP-8 is the release wrapper that gates shipping. It ships the declaration-block split, the
`set at execution` deferral marker, the stale-pin acceptance guards, the `Plan Lifecycle`
section (same-session vs deferred modes), the deferred-lock declaration example, and the
`## Existing Plan Migration` reconciliation in `implementation-plan`, plus the execution-lock
realignment step in the `process-gates` Implementation Preflight Gate.

### IP-8 — Release hygiene for the change set (P0 to complete)

- **Change:** per `dev-skills/.claude/CLAUDE.md`, MINOR-bump `implementation-plan` (new
  section/behavior) and `process-gates` (execution-lock realignment step) — version bumps for
  this change set are deliberately deferred to here, not done per-commit. Sync `public/.claude-plugin/marketplace.json`
  and `public/.codex-plugin/plugin.json` versions; update `dev-skills/docs/log.md`; PR into
  `trunk` with auto-merge; post-merge, verify CI and the public skills repo.
- **DoD:** versions bumped/synced, logs updated, single PR merged, post-merge checks pass.
