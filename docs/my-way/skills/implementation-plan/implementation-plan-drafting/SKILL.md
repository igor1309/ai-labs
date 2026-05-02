---
name: implementation-plan-drafting
description: Use when an accepted spec needs to be turned into an ordered delivery path with slices, dependencies, risks, validation gates, and completion signals before coding starts.
---

# Implementation Plan Drafting

## Overview

Use this skill to turn an accepted spec into an implementation plan. The implementation plan is the execution layer of the pre-coding phase: it organizes already-shaped work into an ordered delivery path with sequence, dependencies, risk handling, and validation in view.

The implementation plan is not where the system is designed. It is where already-shaped work is organized for execution.

## Trigger

This skill applies when:

- an accepted spec exists and implementation needs an explicit delivery path
- the main uncertainty is execution order, slicing, dependency handling, or validation strategy
- work needs to be decomposed into implementable slices rather than left as one undifferentiated body of effort
- an existing implementation plan needs revision because sequence, risk isolation, or validation gates are weak

Do not use this skill when architecture or expected behavior is still unclear. That belongs in ADR or spec work.

## Inspect Before Acting

Read the minimum context needed to plan execution:

- the accepted spec
- accepted Product Intent stories when they constrain delivery slicing or traceability
- accepted ADRs when they constrain execution boundaries
- known delivery, migration, rollout, testing, or operational constraints
- existing system boundaries and dependency information
- unresolved items that were explicitly deferred but do not block implementation start
- the implementation-plan structure at [structure.md](../../../05-implementation-plan/structure.md)
- the example at [example.md](../../../05-implementation-plan/example.md) if a concrete pattern would help

Read enough to sequence the work well. Do not reopen architecture or behavior inside the plan.

## Preserve This Judgment

- The implementation plan is an execution artifact, not a design artifact.
- The plan must preserve accepted Product Intent during execution without forcing every slice to be story-shaped.
- The plan must consume the spec rather than quietly rewriting it through task decomposition.
- The sequence must reflect dependency structure, risk, and validation needs, not arbitrary ordering.
- The plan must divide work into slices that can be observed and checked incrementally.
- Each slice must have an explicit validation gate before it is considered complete.
- Commits happen only on green.

## Produce

Help produce or revise an implementation plan that makes clear:

- what should be built first
- how accepted story intent remains visible during delivery when relevant
- how the work is divided into slices or phases
- what dependencies shape ordering
- what risks should be isolated early
- where validation should happen
- what supporting work is required
- what can be safely deferred
- what completion looks like for each slice and for the plan as a whole

Write the plan so implementation can begin with an explicit route rather than ad hoc motion.

## Workflow

1. Start from the accepted spec and Product Intent traceability, then identify the foundational slice.
2. Order dependent work by dependency structure, risk, and validation needs.
3. For each slice, define objective, key work items, dependencies, risks, validation, and completion signal.
4. Move high-risk or uncertain slices earlier when practical to avoid late-stage collapse.
5. Attach an explicit validation gate to every slice.
6. Review the plan against the spec and ADRs for drift or scope leakage.
7. Submit the plan for adversarial review rather than treating the first draft as final.

## Failure Modes To Avoid

- planning while architecture or behavior is still unresolved
- treating the plan as a backlog dump
- sequencing around components instead of delivery slices
- deferring major risk to the end
- reopening design through task decomposition
- ignoring validation until after coding
- treating a slice as complete without a pass on its checks

## Boundary Rule

If task decomposition starts changing responsibilities or contracts, return to ADR or spec work. If the main problem is still behavioral ambiguity, strengthen the spec before planning execution.
