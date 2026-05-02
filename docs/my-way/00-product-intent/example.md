---
date: 2026-05-02
model: gpt-5.5-thinking
description: "Example Product Intent artifact for a focused My Way workflow capability."
---

# Product Intent: Review Finding Closure

## Product outcome

Agents close review findings without losing the reviewer's intent, bundling unrelated fixes, or bypassing verification gates.

## Actors

- **Implementing agent**: turns review findings into scoped code, docs, or test changes.
- **Reviewer**: expects each finding to be addressed directly and verifiably.
- **Maintainer**: needs the resulting commits and plan updates to be understandable later.

## User stories

### PI-001 — Preserve review intent

As an implementing agent,
I want the full review to remain the source of truth while planning fixes,
so that I do not dilute or reinterpret findings during execution.

Status: accepted

Acceptance signal: the implementation plan includes the full review first, and every task references the finding it closes.

### PI-002 — Fix findings in reviewable slices

As a maintainer,
I want each review finding addressed in its own scoped step when possible,
so that fixes can be verified without unrelated changes obscuring risk.

Status: accepted

Acceptance signal: each plan step has one objective, a targeted verification command, and a local commit after green gates.

### PI-003 — Preserve verification evidence

As a reviewer,
I want each completed fix to record the gate that proved it,
so that the closeout is based on evidence rather than assertion.

Status: accepted

Acceptance signal: the plan tracker records successful verification output before a step is marked complete.

## Acceptance signals

- A plan can be reviewed by matching each task to a source finding.
- A coder can execute the plan without reopening scope decisions.
- A completed closeout shows which command or document check proved each step.

## Boundaries and non-goals

- This intent does not define a new code-review format.
- This intent does not require human review between every task unless the active plan declares it.
- This intent does not require full-chain Product Intent ceremony for every trivial wording correction.

## Open product questions

- Should repeated low-risk review finding patterns get their own lightweight closeout path?
- When should a finding that exposes missing user intent trigger a Product Intent update instead of only a spec or plan update?

## Downstream traceability

| Story | Research | Pre-ADR / ADR | Spec | Implementation plan | Code / tests |
| --- | --- | --- | --- | --- | --- |
| PI-001 | n/a | n/a | n/a | review-finding implementation plans | plan first section and task mapping |
| PI-002 | n/a | n/a | n/a | review-finding implementation plans | per-step commits and verification |
| PI-003 | n/a | n/a | n/a | review-finding implementation plans | plan tracker evidence |

## Change review

| Change | Impact review |
| --- | --- |
| Editorial cleanup to story wording without changing actor, capability, outcome, or acceptance signal | no downstream review required |
| Adding a new required review gate | review implementation-plan structure and process-gates expectations |
| Changing human-review behavior | review process-gates expectations and any active implementation-plan templates |
