---
date: 2026-02-09
model: gpt-5.3-codex
description: "Reusable feature delivery framework: pre-plan to review loop with strict test and commit gates"
---

# Feature Delivery Playbook

This playbook provides a reusable feature-level workflow that emphasizes clear boundaries, intent-first planning, incremental delivery, and strict verification gates before commit and progression.

## Core Principles

- Boundary first: define scope and explicit out-of-scope before discussing implementation.
- Intent before implementation: pre-plan, spec, then implementation plan.
- Lock key decisions early: avoid building on unresolved semantics.
- Small, self-contained steps: each step has objective, deliverables, tests, and commit gate.
- Verify before commit: tests must pass before each commit.
- No history rewriting: no amend; preserve step-by-step review trail.
- Minimalism over speculation: avoid abstractions for unknown future requirements.
- Spec-conformance review: evaluate against approved artifacts, not gut feel.

## Standard Delivery Ladder

1. Pre-plan
2. Spec
3. Implementation plan
4. Implementation
5. Review and fix loop
6. Closeout and artifact sync

## 1. Pre-plan

## Purpose

Align on boundaries and high-level approach before writing code.

## Required Sections

- Scope
- Out of scope
- Goals
- Locked decisions
- Open questions
- Delivery workflow
- Testing strategy expectations

## Exit Criteria

- Scope boundaries are explicit.
- High-impact decisions are locked.
- Open questions are either resolved or explicitly accepted for later.

## 2. Spec

## Purpose

Define behavioral contract and quality gates.

## Required Sections

- Assumptions
- Locked decisions
- Open questions
- Functional requirements
- Non-functional requirements
- Testing requirements
- Acceptance criteria

## Exit Criteria

- Spec approved before implementation plan drafting.
- Requirements are testable and unambiguous.

## 3. Implementation Plan

## Purpose

Convert spec into executable, reviewable slices.

## Step Requirements

Each step must include:

- Objective
- Deliverables
- Tests to run
- Commit gate
- Stop-for-review gate

## Mandatory Rules

- Small self-contained steps.
- Commit after each step only if tests pass.
- No commit amend.
- Do not proceed to next step without review approval.

## 4. Implementation

## Execution Rules

- Implement one step at a time.
- Keep changes surgical and scoped.
- Update tests in the same step as production changes.
- Avoid adjacent refactors unless required by the step.

## 5. Review and Fix Loop

## Review Standard

Review against governing artifacts (spec + implementation plan).

Each finding must include:

- What is wrong
- Why it violates intent/principle
- Minimal fix
- Test delta
- Risk/impact
- Exact evidence (`file:line`)

## Resolution Loop

1. Apply minimal fix.
2. Re-run targeted tests.
3. Commit after passing tests.
4. Repeat until no High/Medium findings remain.

## 6. Closeout and Sync

## Required Closeout

- Confirm acceptance criteria satisfied.
- Ensure all required artifacts are updated and synchronized.
- Document final status and residual risks (if any).

## Reusable Prompt Pack

## Pre-plan prompt

```text
Do not code. Produce a pre-plan with: scope, out-of-scope, goals, locked decisions, open questions, delivery workflow, and test strategy expectations.
```

## Spec prompt

```text
Draft spec only. Include: Assumptions, Locked decisions, Open questions, Functional requirements, Non-functional requirements, Testing requirements, Acceptance criteria.
```

## Implementation plan prompt

```text
Create an implementation plan with small self-contained steps. Each step must define objective, deliverables, exact tests, and commit gate. Tests must pass before commit. No amend. Stop after each step for review.
```

## Review prompt

```text
Review strictly against approved spec and plan. Report findings with file:line, violation reason, minimal fix, test delta, and impact. Return INCONCLUSIVE if required intent artifacts are missing.
```

## Lightweight Step Checklist

- Scope still valid for this step.
- Required tests identified.
- Implementation complete for step objective.
- Tests passed.
- Commit created (no amend).
- Waiting for review approval before next step.
