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

Consequence (observed): the skill *requires* a concrete `Expected branch` and warns "Do not
invent declaration values," which pushes an author to pin the only concrete branch available —
the authoring branch. When that plan is merged before execution, the pin goes dead. A later
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

Land IP-1 → IP-2 → IP-3 together (they are the fix); IP-4/IP-5 add lifecycle and the
`process-gates` boundary; IP-6/IP-7 reinforce; IP-8 is the release wrapper that gates shipping.

### IP-1 — Split the declaration block into "planning intent" vs "execution lock", with owners (P0)

- **Change** `## Required Declaration Block`: group the seven fields and name the owner of each:
  - *Planning intent — author-set at authoring:* `Execution mode`, `Human review between tasks`,
    `Push policy`.
  - *Execution lock — executor-set at execution start:* `Worktree mode`, `Expected worktree`,
    `Expected branch`, `Preflight check`.
  - State: an author may pre-fill the execution lock **only** when authoring and execution are
    the same session and worktree.
- **DoD:** the two groups and the ownership sentence exist in the skill; the `Acceptance
  Checklist` references the split.

### IP-2 — Allow a deferred placeholder for `Expected worktree` / `Expected branch` (P0)

- **Change:** explicitly permit the literal value `set at execution` (or a resolvable pattern,
  e.g. `claude/<feature>-impl-*`) for these two fields when the plan is authored for
  separate/later execution. Clarify that a concrete live branch is required only when authoring
  == execution. Reconcile with "Do not invent declaration values" so the placeholder/pattern is
  not read as an invented value.
- **DoD:** the allowed placeholder is enumerated beside the field definitions and is not
  flagged by the `Acceptance Checklist`.

### IP-3 — Add `Acceptance Checklist` guards against a stale/foreign pinned branch (P0)

- **Change** `## Acceptance Checklist`: add two lines:
  - "If `Expected branch` names a concrete branch, this plan is executed and pushed from that
    branch **in this session**; otherwise it is a pattern or `set at execution`."
  - "A plan intended to be committed/merged before execution MUST NOT pin a concrete authoring
    branch as `Expected branch`."
- **DoD:** both lines present; authoring halts when either fails. This is the review-as-
  enforcement hook that would have caught the original defect.

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
- **DoD:** example present and consistent with IP-1/IP-2.

### IP-7 — Reconcile `## Existing Plan Migration` with the new lifecycle rules (P2)

- **Change:** add a clause: when executing a previously-merged plan, treat its execution lock as
  intent and re-establish it (IP-4/IP-5) rather than honoring a dead pin.
- **DoD:** clause present and consistent with IP-4/IP-5.

### IP-8 — Release hygiene for the change set (P0 to complete)

- **Change:** per `dev-skills/.claude/CLAUDE.md`, MINOR-bump `implementation-plan` (new
  section/behavior) and `process-gates` (IP-5); sync `public/.claude-plugin/marketplace.json` and
  `public/.codex-plugin/plugin.json` versions; update `dev-skills/docs/log.md`; PR into `trunk`
  with auto-merge; post-merge, verify CI and the public skills repo.
- **DoD:** versions bumped/synced, logs updated, single PR merged, post-merge checks pass.

## Open question

IP-5 deliberately puts the execution-time re-validation in `process-gates`, not
`implementation-plan`, to keep the authoring-skill vs execution-skill responsibilities clean —
the same author/executor split this backlog is closing. If the preference is to keep authoring
and execution guidance in one skill, IP-5's home changes accordingly.
