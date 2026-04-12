---
title: Pre-Coding Phase
date: 2026-04-12
author: Igor Malyarov
version: 0.0.2
format: note
---

# Pre-Coding Phase

This note describes an opinionated approach to the pre-coding phase. It is explicitly a personal working method rather than a claim of universal process correctness. At the same time, it is grounded in real delivery experience and in repeated exposure to ambiguity, design drift, and implementation waste caused by starting to code too early.

The core premise is simple: coding should be the execution step, not the primary thinking step.

## Core idea

The pre-coding phase exists to reduce ambiguity before implementation starts. Its purpose is to:

- clarify intent
- expose unknowns, contradictions, and weak assumptions
- separate exploratory thinking from committed decisions
- define boundaries, responsibilities, and contracts
- make implementation a constrained follow-through rather than discovery-by-coding

This is not documentation for its own sake. It is a way to improve decision quality and reduce avoidable churn.

## Typical sequence

### 1. Research

Research is the exploration layer.

Its purpose is to:

- understand domain constraints
- surface relevant patterns, tradeoffs, and precedents
- identify unstable assumptions early
- gather material needed for design discussion

This stage is not yet about commitment. It is about input gathering and problem framing. Research proceeds primarily through directed Q&A cycles with AI assistants rather than passive reading.

Typical output may include:

- framing of the problem
- candidate approaches
- constraints
- risks
- terminology
- open questions

The practical value of this stage is that it avoids fake certainty.

### 2. Pre-ADR

Pre-ADR is the thinking workspace before a formal architectural decision is recorded.

Its purpose is to:

- discuss architecture without pretending the decision is already settled
- compare options
- capture the rough shape of the system
- allow correction before freezing anything

A pre-ADR can later become partially outdated. That is acceptable. Its role is exploratory, not contractual.

Typical characteristics:

- higher tolerance for ambiguity
- broader option space
- room for architecture sketches, questions, and emerging constraints
- usefulness even when later replaced by sharper documents

Its function is not authority. Its function is design digestion. A deliberate break is often taken before moving to ADR, allowing perspective to refresh.

### 3. ADR

ADR is the commitment layer.

Its purpose is to:

- record the decision actually taken
- explain why this path was chosen over alternatives
- make boundaries explicit
- reduce future reinterpretation

In this approach, ADRs are not ceremony. They are decision records. Their quality depends on:

- intent integrity
- boundary clarity
- consistency with other decisions
- stability of the chosen direction

An ADR should not read like brainstorming. It should read like resolved architecture.

### 4. Spec

The spec is where architecture turns into implementable behavior.

Its purpose is to:

- define what the system must do
- clarify contracts between parts
- specify flows, states, inputs, outputs, and edge cases
- remove ambiguity that ADR alone does not eliminate

The spec translates structural decisions into expected behavior.

Typical content may include:

- domain behavior
- component responsibilities
- API or data contracts
- state transitions
- failure cases
- UX or system interaction expectations where relevant

This is the document that makes implementation reviewable against intent.

### 5. Implementation plan

The implementation plan is the execution bridge.

Its purpose is to:

- break the spec into ordered work
- identify dependencies and sequencing
- define what gets built first
- isolate riskier parts
- make implementation incremental and testable

This is not another design document. It is operational.

Typical output may include:

- stepwise build order
- slices or phases
- dependency notes
- validation strategy
- per-step test/validation gates with commit-on-green discipline
- rollout or migration notes where needed

By this stage, the main architectural thinking should already be done.

## How these artifacts differ

### Research
Explores the problem space.

### Pre-ADR
Explores the solution space.

### ADR
Commits the architectural decision.

### Spec
Defines expected behavior and contract shape.

### Implementation plan
Defines execution order and delivery path.

## AI assistants

AI assistants are used heavily throughout the pre-coding phase — not as a convenience layer, but as thinking partners. Different models (GPT, Claude, and others) are rotated deliberately across stages and review cycles to reduce blind spots inherent to any single model's reasoning style.

Each artifact goes through adversarial review. Review is not a rubber stamp: it challenges assumptions, probes for hidden tradeoffs, tests whether boundaries hold under pressure, and checks for drifts and contradictions across existing ADRs, code, and tests.

## Artifacts commit

Pre-coding artifacts are committed to the repository as they are produced. Research notes, pre-ADRs, ADRs, specs, and implementation plans are version-controlled alongside the code they govern. This makes the decision history inspectable, reviewable, and traceable — not buried in chat logs or lost between sessions.

## Biases in this approach

This method strongly favors several principles.

### 1. Decision before mechanics

Architecture, responsibility, and boundaries should be settled before implementation details dominate the conversation.

### 2. Explicit boundaries

Ownership matters. Layer responsibility matters. Coupling must be introduced deliberately rather than by accident.

### 3. Progressive commitment

This approach does not favor premature formality, but it also does not tolerate indefinite vagueness. The sequence from research to pre-ADR to ADR exists to gradually increase commitment.

### 4. Separation of exploratory and committed documents

Early documents are allowed to be imperfect or later outdated, provided they served exploration honestly. Committed documents should be sharper and more stable.

### 5. Implementation as execution, not architecture discovery

The later the stage, the less room there should be for invention. Coding should not be the first place where the system is truly understood.

## Summary

This pre-coding phase can be described as a funnel that converts uncertainty into explicit decisions, explicit contracts, and an execution path.

It is an opinionated method, but not an arbitrary one. It comes from practical experience with the cost of ambiguity, hidden assumptions, and premature implementation. Its value lies in making difficult thinking happen before code is written, when change is still cheap and architectural mistakes are still reversible.
