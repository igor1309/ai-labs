Add
- Self review and fix cycle
- Adversarial review and fix cycle with model rotation
- must have steps/stages with mandatory test runs before commits, commit on green only
- Must reference appropriate skills/guides for implementation details (stores/state machines/layers/etc)

---
title: Implementation Plan
date: 2026-04-12
author: Igor Malyarov
model: GPT-5.4 Thinking
version: 0.0.1
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

## Exit criteria

An implementation plan is complete when:

- execution order is clear
- major slices or phases are identified
- important dependencies are visible
- the riskiest work is not hidden at the end
- validation approach is known
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

The exact shape can vary, but the essential property is execution clarity.

## Example grouped test names

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

## Summary

The implementation plan is the execution bridge between spec and coding.

It organizes delivery into an explicit path with sequence, dependencies, risk handling, and validation in view. Its value is practical: implementation starts with a known route rather than with ad hoc motion.
