---
name: implementation-plan-review
description: Use when an implementation plan exists and needs adversarial review for sequencing, dependency handling, risk isolation, validation gates, or boundary respect before or during execution.
---

# Implementation Plan Review

## Overview

Use this skill to pressure-test an implementation plan that already exists. Implementation-plan review checks whether the plan is a credible execution path rather than a loose task list.

The goal is not to make the plan sound organized. The goal is to test whether the plan can guide execution without hiding risk, reopening design, or deferring validation.

## Trigger

This skill applies when:

- a drafted implementation plan needs review before execution begins
- execution reveals hidden dependencies, weak sequencing, or missing validation
- a reader suspects the plan is really a backlog export rather than an execution path
- downstream work needs confidence that the plan isolates risk and respects upstream decisions

Do not use this skill to redesign architecture or rewrite behavior. If the plan fails because the spec or ADR is unstable, escalate explicitly.

## Inspect Before Acting

Read the implementation plan under review first, then pull only the context needed to test it:

- the accepted spec the plan claims to implement
- accepted ADRs when they constrain sequencing or boundaries
- known delivery, migration, or operational constraints where they affect ordering
- the implementation-plan structure at [structure.md](../../../05-implementation-plan/structure.md)
- the example at [example.md](../../../05-implementation-plan/example.md) if a concrete standard would help

Review the plan against execution needs, not against preferences that belong in ADR or spec work.

## Preserve This Judgment

- Review tests whether the plan is a usable execution path, not whether it sounds comprehensive.
- The plan must remain execution-oriented.
- Review may conclude that the plan already holds. That is useful work, not failure.
- If the plan is weak because design or behavior is unstable, escalate explicitly rather than patching over the problem with task structure.
- Review must not demand architecture or behavioral detail that belongs in ADR or spec.

## Review For

- **Order with reason**: does the sequence reflect dependency structure, risk, and validation needs?
- **Incrementality**: is the work divided into slices that can be observed and checked?
- **Risk isolation**: are fragile or unknown parts surfaced early enough?
- **Boundary respect**: does the plan follow ADRs and spec rather than redesigning them?
- **Validation awareness**: does every slice have a meaningful check or gate?
- **Commit discipline**: does the plan require green validation before completion and commit?

## Produce

Help produce one of these outputs:

- review findings that identify concrete weaknesses in the implementation plan
- confirmation that the plan is strong enough to guide execution
- guidance for revising the plan without collapsing it into ADR or spec work
- explicit escalation when the problem is architectural or behavioral rather than executional

## Workflow

1. Read the plan and identify the execution path it claims to define.
2. Test whether the sequence has clear reasons grounded in dependency, risk, and validation.
3. Probe for hidden dependencies, deferred risks, or slices that are too large to validate well.
4. Check whether each slice has a meaningful validation gate.
5. Check whether the plan respects the accepted ADRs and spec.
6. Decide whether the plan holds, needs revision, or should escalate to another layer.
7. Return concrete findings or revision guidance.

## Failure Modes To Avoid

- treating review as formatting cleanup only
- accepting arbitrary task order with no dependency or risk rationale
- missing hidden design drift inside task decomposition
- allowing validation to stay vague or delayed
- mistaking a backlog export for an execution plan
- assuming a revisit means the plan was automatically wrong rather than stressed by new execution knowledge

## When Review Forces Change

If the plan is sound, keep it and execute. If the plan is weak but the spec and ADR still hold, revise the plan. If the weakness comes from unresolved behavior or unstable architecture, return to spec or ADR work explicitly.
