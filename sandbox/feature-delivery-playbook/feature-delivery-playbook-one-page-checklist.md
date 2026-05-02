---
date: 2026-02-09
model: gpt-5.3-codex
description: "One-page checklist for feature delivery from pre-plan to review closeout"
---

# Feature Delivery One-Page Checklist

Use this checklist for fast execution control across feature work.

## 1. Boundaries

- [ ] Scope is explicit.
- [ ] Out-of-scope is explicit.
- [ ] No hidden integration work slipped in.

## 2. Intent Artifacts

- [ ] Pre-plan exists.
- [ ] Spec exists and is approved.
- [ ] Implementation plan exists and is approved.
- [ ] Open questions are resolved or explicitly deferred.

## 3. Step Quality

For each step:

- [ ] Objective is clear and narrow.
- [ ] Deliverables are explicit.
- [ ] Tests for this step are defined before coding.
- [ ] Step is self-contained and reviewable.

## 4. Testing Gate

- [ ] Tests were run with required project conventions.
- [ ] Tests passed before commit.
- [ ] Negative cases are covered where behavior could regress.
- [ ] If behavior/state logic changed, tests assert both state and side effects.

## 5. Commit Gate

- [ ] Exactly one commit for the completed step (or clearly justified minimal set).
- [ ] No amend used.
- [ ] Commit includes only step-related files.
- [ ] Commit message is concise and behavior-oriented.

## 6. Review Gate

- [ ] Step paused for review approval.
- [ ] Review checks against spec + plan, not assumptions.
- [ ] Findings include: what, why, minimal fix, test delta, impact, `file:line`.
- [ ] High/Medium findings resolved before moving on.

## 7. Fix Loop

For each review finding:

- [ ] Minimal patch applied.
- [ ] Targeted tests rerun and passing.
- [ ] Fix committed (no amend).
- [ ] Repeat until no blocking findings remain.

## 8. Closeout

- [ ] Acceptance criteria all satisfied.
- [ ] Artifacts synced across required locations.
- [ ] Residual risks documented (if any).
- [ ] Final status communicated with exact references.

## Prompt Shortcuts

## Pre-plan

```text
No code. Draft pre-plan with scope, out-of-scope, locked decisions, open questions, workflow, and test strategy.
```

## Spec

```text
Draft spec only. Include assumptions, locked decisions, open questions, functional/non-functional requirements, testing requirements, acceptance criteria.
```

## Plan

```text
Create small self-contained implementation steps. Define objective, deliverables, tests, commit gate, and stop-for-review after each step.
```

## Review

```text
Review against approved spec and plan. Report findings with file:line, violation reason, minimal fix, test delta, and impact.
```
