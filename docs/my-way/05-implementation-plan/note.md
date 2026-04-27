---
title: Implementation Plan
date: 2026-04-12
author: Igor Malyarov
version: 0.0.3
format: note
---

# Implementation Plan

## Purpose

The implementation plan is the execution layer of the pre-coding phase.

Its purpose is to turn an accepted spec into an ordered delivery path. It defines how the work will be approached, in what sequence major parts will be built, where dependencies exist, and how risk will be contained during implementation.

The implementation plan is not where the system is designed. It is where already-shaped work is organized for execution.

## What it is / what it is not

Implementation plan is:

- an execution-oriented document
- a sequencing artifact
- a way to decompose work into implementable slices
- a dependency and risk management aid
- a bridge from spec to delivery

Implementation plan is not:

- research
- pre-ADR
- ADR
- a spec
- a backlog dump
- a substitute for unresolved design

If the core architecture or behavior is still unclear, the work is not ready for implementation planning.

## How to create

1. Start from the accepted spec. Identify the foundational slice — the smallest piece of work that makes the rest possible.
2. Layer dependent work on top, ordered by dependency structure and risk.
3. For each slice, define: objective, key work items, dependencies, risks, validation approach, and completion signal.
4. Move high-risk or uncertain slices earlier in the sequence to avoid late-stage collapse.
5. Attach a validation gate to every slice — no slice is complete without a test/check pass.
6. Review the plan against the spec and ADRs for drift or scope leakage.
7. Submit for adversarial review. Fix issues and re-review until clean.

## Execution contract

Every implementation plan must declare its operational contract instead of inheriting it from skills or local memory:

- execution mode: `auto-continue` or `human-review-gated`
- human review between tasks: `yes` or `no`
- worktree mode: `create new`, `reuse existing`, or `none`
- push policy: `no push`, `push after task`, or `push at closeout`
- stop conditions
- final archive path

Self-review and human review are different gates. Self-review is always part of disciplined execution; human review happens only when the plan declares it or the user asks for it.

Active plan directories should contain active plans only. Completed plans move to `docs/plans/implemented/` or `<project>/docs/plans/implemented/` as the last plan closeout step.

## Inputs

Typical inputs include:

- accepted ADRs
- the current spec
- known constraints affecting delivery
- dependency information
- existing system boundaries
- rollout or migration constraints where relevant
- operational or testing constraints
- unresolved items that were explicitly deferred but do not block implementation start

The plan should consume prior decisions rather than reopen them.

## Outputs

A useful implementation plan should make clear:

- what should be built first
- how the work is divided into slices or phases
- what dependencies shape ordering
- what technical risks should be isolated early
- where validation should happen
- what supporting work is required
- what can be deferred safely
- what constitutes meaningful progress

The output should support implementation, review, and coordination without drifting back into architecture discussion.

## Quality criteria

A strong implementation plan has several properties.

### 1. Order with reason

The sequence is not arbitrary. It reflects dependency structure, risk, and validation needs.

### 2. Incrementality

The work is divided into slices that allow progress to be observed and checked before everything is complete.

### 3. Risk isolation

Unknown or fragile parts are surfaced early enough to avoid late-stage collapse.

### 4. Boundary respect

The plan follows the architecture and spec instead of quietly redesigning them through task ordering.

### 5. Validation awareness

The plan acknowledges how correctness will be checked, not only how code will be written.

### 6. Commit discipline

Each step or stage has mandatory test runs. Commits happen only on green. No step is considered complete until its tests pass.

## Exit criteria

An implementation plan is complete when:

- execution order is clear
- major slices or phases are identified
- important dependencies are visible
- the riskiest work is not hidden at the end
- validation approach is known
- each step has an explicit test/validation gate before commit
- implementation can begin without improvising the whole path

An implementation plan is not complete merely because a list of tasks exists.

## Common mistakes

### 1. Planning around components instead of delivery slices

A component-by-component list often hides whether the system becomes usable or testable at each step.

### 2. Deferring risk to the end

The most uncertain work should usually be confronted earlier, not after surrounding code has already been built.

### 3. Reopening design through task decomposition

If task breakdown starts changing responsibilities or contracts, design work is leaking into execution planning.

### 4. Treating the plan as a backlog export

A backlog may contain tasks. That does not automatically make it an implementation plan.

### 5. Ignoring validation until after coding

A plan that does not account for how the work will be checked usually increases rework.

## Typical structure

A practical implementation plan often includes:

- phase or slice name
- objective
- key work items
- dependencies
- risks
- validation notes
- completion signal
- skill/guide references for implementation details (stores, state machines, layers, composition patterns, etc.)

The exact shape can vary, but the essential property is execution clarity.

## Review

The implementation plan undergoes two review cycles before execution begins.

**Self-review.** The author checks the plan against the accepted spec, ADRs, and existing codebase for alignment, gaps, and contradictions. Issues found are fixed before external review.

**Adversarial review.** Review is a specialized concern with its own knowledge and method. It is encapsulated in a dedicated review skill appropriate to the artifact type. The review skill carries the specific checks (sequencing assumptions, hidden dependencies, architecture boundary respect, drift detection, etc.) so they are applied consistently and do not need to be reinvented each time. Issues found are fixed and re-reviewed until clean.

## Summary

The implementation plan is the execution bridge between spec and coding.

It organizes delivery into an explicit path with sequence, dependencies, risk handling, and validation in view. Its value is practical: implementation starts with a known route rather than with ad hoc motion.

---

## Appendix: example grouped test names

Below is a structured example of test naming aligned with the pattern:

`test_<action>_should<Assert>_on<Setup>`

### Plan construction

- `test_buildPlan_shouldStartWithFoundationalSlice_onValidSpec`
- `test_buildPlan_shouldOrderSlicesByDependency_onMultiPhaseWork`
- `test_buildPlan_shouldSurfaceBlockedSlice_onMissingDependency`
- `test_buildPlan_shouldDeferOptionalWork_onNonBlockingItems`

### Dependency handling

- `test_resolveDependencies_shouldKeepExecutionOrder_onLinearDependencies`
- `test_resolveDependencies_shouldPreserveParallelizableWork_onIndependentSlices`
- `test_resolveDependencies_shouldMarkSliceAsBlocked_onUnresolvedExternalDependency`
- `test_resolveDependencies_shouldFailPlanning_onCircularDependency`

### Risk isolation

- `test_prioritizeRisk_shouldMoveHighRiskSliceEarlier_onFragileIntegration`
- `test_prioritizeRisk_shouldKeepLowRiskSliceLater_onStableSupportWork`
- `test_prioritizeRisk_shouldHighlightUnvalidatedAssumption_onUnknownTechnicalConstraint`

### Validation strategy

- `test_attachValidation_shouldAssignChecksToEachSlice_onIncrementalPlan`
- `test_attachValidation_shouldRequireContractVerification_onBoundaryWork`
- `test_attachValidation_shouldRequireFailureCaseCoverage_onErrorProneFlow`
- `test_attachValidation_shouldRejectSliceWithoutValidation_onIncompletePlan`

### Deferral and scope control

- `test_markDeferredWork_shouldKeepCorePathIntact_onOptionalEnhancements`
- `test_markDeferredWork_shouldExcludeOutOfScopeItems_onNonEssentialRequests`
- `test_markDeferredWork_shouldPreserveDeferredNotes_onKnownFollowUpWork`

### Completion criteria

- `test_completePlan_shouldSucceed_onClearExecutionOrder`
- `test_completePlan_shouldFail_onHiddenCriticalDependency`
- `test_completePlan_shouldFail_onUndefinedValidationApproach`
- `test_completePlan_shouldRemainReviewable_onMultiSlicePlan`
