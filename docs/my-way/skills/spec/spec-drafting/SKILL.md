---
name: spec-drafting
description: Use when accepted architectural decisions need to be translated into explicit behavior, contracts, flows, edge cases, and testable expectations before implementation.
---

# Spec Drafting

## Overview

Use this skill to turn accepted architectural decisions into a spec. The spec is the behavioral layer of the pre-coding phase: it defines what the system must do, how its parts are expected to behave, and what contracts must hold between them.

A spec does not decide architecture. It operationalizes it.

## Trigger

This skill applies when:

- accepted ADRs exist and need to be translated into implementable behavior
- the missing clarity is behavioral rather than architectural
- downstream implementation, review, or testing needs explicit expectations
- an existing spec draft needs revision so behavior and contracts are no longer left to interpretation

Do not use this skill when the central question is still how the system should be structured. That belongs in pre-ADR or ADR work.

## Inspect Before Acting

Read the minimum context needed to define behavior:

- accepted ADRs being operationalized
- pre-ADR or research artifacts only when they clarify constraints or terminology
- product or business requirements
- domain rules and existing contracts
- UI or UX requirements where they materially shape behavior
- known edge cases and failure scenarios
- the spec structure at [structure.md](../../../04-spec/structure.md)
- the example at [example.md](../../../04-spec/example.md) if a concrete pattern would help

Read enough to define behavior clearly. Do not reopen already-settled architectural decisions inside the spec.

## Preserve This Judgment

- The spec is a behavioral definition, not an architectural decision record.
- The spec must work from accepted ADRs rather than quietly redefining them.
- The spec must make behavior explicit enough that implementation and testing do not depend on private interpretation.
- The spec must stay out of execution order, delivery slicing, and other implementation-plan concerns.
- The spec must address failure behavior and edge cases, not only the happy path.

## Produce

Help produce or revise a spec that makes clear:

- what the system or feature does
- the responsibilities of relevant parts
- public interfaces and input/output shapes
- behavior rules, states, flows, and transitions
- invariants, validation, and contract expectations
- edge cases and failure behavior
- tests required to cover the rules
- what is explicitly out of scope

Write the spec so implementation, review, and testing can use it as a common reference.

## Workflow

1. Start from accepted ADRs and identify what architectural decisions the spec is operationalizing.
2. Define the public interface and contract surface.
3. Write concrete behavior rules, including validation, state changes, and failure behavior.
4. Enumerate test cases that cover those rules.
5. Define done criteria in terms of interface and tests.
6. Check boundary discipline so the spec does not re-decide architecture or drift into implementation planning.
7. Submit the spec for adversarial review rather than treating the first draft as final.

## Failure Modes To Avoid

- using the spec to reopen architecture that should already be settled
- staying so high-level that different implementers could produce materially different systems
- omitting edge cases or failure behavior
- smuggling implementation-plan detail into the spec
- writing for agreement instead of execution
- leaving contracts or state transitions implicit

## Boundary Rule

If the central uncertainty is architectural, return to ADR-level work. If the central uncertainty is execution order or delivery slicing, move to the implementation plan instead of bloating the spec.
