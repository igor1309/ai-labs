---
title: Spec
date: 2026-04-12
author: Igor Malyarov
version: 0.0.2
format: note
---

# Spec

## Purpose

The spec is the stage where architecture is translated into implementable behavior.

Its purpose is to define what the system must do, how its parts are expected to behave, and what contracts must hold between them. It exists to reduce ambiguity before implementation by making expected behavior explicit enough that coding, review, and testing are aligned to the same understanding.

A spec does not decide architecture. It operationalizes it.

## What it is / what it is not

Spec is:

- a behavioral definition
- a contract-shaping artifact
- a description of expected flows, states, and interactions
- a reference point for implementation and review
- a basis for testing and validation

Spec is not:

- research
- pre-ADR
- ADR
- an implementation task list
- a vague product wish list
- a place to reopen architectural decisions that were already made

If the central question is still “how should the system be structured?”, the work is not yet at the spec stage.

## Inputs

Typical inputs include:

- accepted ADRs
- pre-ADR artifacts where still relevant for context
- research artifacts where they clarify constraints or terminology
- product or business requirements
- domain rules
- existing system contracts
- UI or UX requirements where applicable
- notes from design discussions and Q&A sub-sessions
- known edge cases and failure scenarios

The spec should consume prior decisions and translate them into behavioral clarity.

## Outputs

A useful spec should make clear:

- what the system or feature does
- responsibilities of relevant parts
- inputs and outputs
- states and transitions where applicable
- interaction flows
- invariants and rules
- edge cases
- failure behavior
- contract expectations between components or systems
- what is explicitly out of scope

Depending on the problem, this may include API shapes, event flows, lifecycle behavior, validation rules, or user-visible outcomes.

## Quality criteria

A strong spec has several properties.

### 1. Behavioral clarity

It defines expected behavior precisely enough that different implementers do not produce materially different systems from the same document.

### 2. Contract clarity

It makes interfaces, obligations, and assumptions visible, especially where multiple components or teams interact.

### 3. Boundary discipline

It respects architectural decisions rather than quietly redefining them.

### 4. Edge-case awareness

It does not describe only the happy path. It addresses failure, absence, invalid input, timing, and incomplete states where relevant.

### 5. Reviewability

It is specific enough that implementation can be checked against it and deviations can be discussed concretely.

## Exit criteria

A spec is complete when:

- expected behavior is explicit
- key contracts are defined
- relevant flows and states are clear
- edge cases and failure behavior are addressed to the needed degree
- downstream implementation can proceed without relying on private interpretation
- testing and review can meaningfully use the document as a reference

A spec is not complete merely because the main flow has been described.

## Review

Each spec undergoes adversarial review with model rotation (GPT / Claude). Review checks:

- behavioral clarity — are flows, states, and contracts specific enough to be implemented without private interpretation?
- boundary discipline — does the spec respect accepted ADRs without quietly redefining them?
- edge-case coverage — are failure, absence, invalid input, and timing scenarios addressed?
- contract completeness — are interfaces and obligations between components explicit?
- drifts and contradictions against existing ADRs, code, and tests

Review targets the spec's completeness as an implementation reference, not its prose quality.

## Common mistakes

### 1. Confusing spec with ADR

The spec should not re-decide architecture. It should work from accepted decisions.

### 2. Staying too high-level

If the document sounds correct but leaves critical behavior open to interpretation, it is not yet an effective spec.

### 3. Omitting failure behavior

Many implementation mistakes originate not in the main path but in unspoken edge cases.

### 4. Smuggling implementation plan into the spec

The spec defines behavior and contracts, not execution order, ticket structure, or delivery slicing.

### 5. Writing for agreement instead of execution

A spec must be usable by implementers, reviewers, and testers. General alignment language is not enough.

## Summary

The spec is the behavioral layer of the pre-coding phase.

It takes architectural decisions and turns them into explicit expectations about flows, states, contracts, and failure handling. Its value lies in making implementation less interpretive, less accidental, and more reviewable before code is written.
