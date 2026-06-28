---
date: 2026-06-28
model: claude-opus-4-8
description: "Adversarial review of the implementation-plan execution-lock backlog against the actual skill text and the dev-skills forward-tasks-only convention."
---

# implementation-plan Execution-Lock Backlog — Adversarial Review

## Scope

Reviewed `dev-skills/TODO/implementation-plan-execution-lock-ownership.md` against the current
`dev-skills/public/implementation-plan/SKILL.md`, the `dev-skills/.claude/CLAUDE.md` release
rules, and the repo-root convention that `TODO`/backlog files hold forward tasks only. The
review tested whether each backlog claim about the skill is accurate, whether the proposed
changes are non-redundant with what the skill already says, and whether the doc stays in
forward-task form. Findings marked "fixed" were corrected in the same change set.

## Findings

### IP-2 mischaracterized the skill's allowed values for `Expected branch`/`Expected worktree`

- **Verdict:** fail, fixed.
- **Location:** backlog IP-2 and the `## Why` "Consequence" sentence.
- **Why:** the skill already defines these fields as "a concrete branch name or single resolvable
  pattern" (`SKILL.md:36-37`), so a *pattern* is permitted today. IP-2 read as if patterns were
  disallowed and needed to be introduced, which would send an implementer to add something
  partly already present and misstate the actual gap. The real gaps are narrower: there is no
  `set at execution` literal, and no rule steering an author to the deferred form for a plan
  executed later.
- **Fix:** rewrote IP-2 to note the pattern is already allowed, and to scope the change to (a)
  adding the `set at execution` literal and whitelisting it against "Do not invent declaration
  values," and (b) requiring the pattern/`set at execution` form for separate/later execution.
  Corrected the `## Why` "Consequence" sentence to say the skill *permits* a pattern but gives no
  rule steering the author toward it.
- **Tests:** verified against `SKILL.md:36-37` and the "Do not invent declaration values" rule
  (`SKILL.md:42-44`).

### IP-1 could be read as contradicting the "declared before Step 1" rule

- **Verdict:** warn, fixed.
- **Location:** backlog IP-1.
- **Why:** the skill states "Every implementation plan must declare these fields before Step 1"
  (`SKILL.md:31`). Assigning the execution-lock fields to "executor-set at execution start"
  could be misread as relaxing that requirement.
- **Fix:** added a clause that execution start *precedes* Step 1, so executor-set-at-execution-
  start still satisfies "before Step 1"; the split assigns ownership and timing without relaxing
  the rule.
- **Tests:** consistency check against `SKILL.md:31` and the `Preflight check` definition
  (`SKILL.md:39-40`), which already ties that field to execution evidence.

### "Why" leaned toward a session finding rather than timeless rationale

- **Verdict:** warn, fixed.
- **Location:** backlog `## Why`.
- **Why:** the repo-root convention is that backlog files hold forward tasks only — "never
  session status, done-markers, per-item progress, or findings." The "(observed)" framing read
  as a session finding.
- **Fix:** removed "(observed)" and stated the consequence as a standing property of the skill's
  rules. The motivating mechanism is retained as forward-task rationale, matching the existing
  `process-gates` entry in `TODO/todo.md`, which cites its motivating incident the same way.
- **Tests:** compared against the `process-gates` precedent in `TODO/todo.md`.

### Section references, boundary assignment, and release hygiene

- **Verdict:** pass.
- **Location:** backlog IP-1, IP-3, IP-5, IP-7, IP-8.
- **Why:** every referenced section name exists in the skill (`## Vocabulary`,
  `## Required Declaration Block`, `## Acceptance Checklist`, `## Existing Plan Migration`). The
  quoted rules ("Do not invent declaration values", "Preflight check: unchecked while authoring")
  are accurate. IP-5 correctly routes execution-start re-validation to `process-gates`, matching
  the skill's own delegation ("Use `process-gates` for execution-time preflight, step closeout,
  commit, push, and completion gates", `SKILL.md:12-14`). IP-8's release steps match
  `dev-skills/.claude/CLAUDE.md` (version bumps, marketplace/plugin sync, log, PR, post-merge
  verify).
- **Fix:** none required.
- **Tests:** cross-checked each reference against `SKILL.md` and the dev-skills release rules.

### Forward-task actionability

- **Verdict:** pass.
- **Location:** whole document.
- **Why:** every item carries a concrete Change and a checkable DoD, sequencing is explicit
  (IP-1→IP-2→IP-3 together, then IP-4/IP-5, then IP-6/IP-7, IP-8 as the release wrapper), and the
  one genuine design choice (IP-5's home) is surfaced as an open question rather than silently
  decided.
- **Fix:** none required.
- **Tests:** structure inspection against the dev-skills `TODO/*.md` precedent
  (`extract-postmortem-command.md`).

## Verdict

The backlog holds after one fail and two warns, all fixed. The fail was a real accuracy
defect — claiming a change the skill already partly provides — now narrowed to the genuine gaps
(`set at execution` literal and a steer toward the deferred form). No remaining fails or warns;
references, boundary assignment, release hygiene, and forward-task discipline pass.
