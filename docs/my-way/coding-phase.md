---
title: Coding Phase
date: 2026-05-02
model: claude-opus-4-7
description: "Personal note describing the coding phase as the execution-and-knowledge-preservation half of the method, complementary to the pre-coding phase."
author: Igor Malyarov
version: 0.0.1
format: note
---

# Coding Phase

This note describes the coding phase of the method. It is the execution-and-knowledge-preservation half, complementary to [pre-coding-phase.md](pre-coding-phase.md). Where the pre-coding phase reduces ambiguity before implementation begins, the coding phase keeps execution honest against intent and turns the work into durable knowledge as it progresses.

The core premise is symmetric to the pre-coding one. Coding is execution, but it is also feedback: test outcomes, log entries, and artifacts are not afterthoughts — they are the channels through which implementation reality re-enters earlier layers.

## Core idea

The coding phase exists to:

- turn intent into testable, executable form
- execute through iterative verification
- compress what changed and why it matters
- preserve durable knowledge that outlives the immediate work

This is not bookkeeping. It is the part of the loop where execution and recorded knowledge are kept aligned with intent.

## Typical sequence

What follows is a common sequence, not a deterministic recipe. Some layers may be revisited multiple times within a single piece of work, and feedback from later layers may force revision of earlier ones — including layers in the pre-coding phase or in the product intent above it.

### 1. Executable spec

The executable spec turns intent into something concrete enough to execute, simulate, or test.

Its purpose is to:

- bridge abstract design and concrete implementation
- make commitment verifiable rather than aspirational
- expose hidden ambiguity in the spec or product intent before implementation cost is paid

Typical forms:

- behavior contracts
- expected input/output examples
- acceptance criteria expressed as tests or scenarios

This stage is where the spec's behavioral rules become testable. It is also where ambiguity in the spec or unspoken assumptions in the product intent tend to surface — making it a useful pressure test on earlier layers before code is written.

### 2. TDD cycle

TDD is the execution of the work through iterative verification.

Each loop:

1. Write a failing test that expresses the missing behavior.
2. Make the code compile and the test pass with the minimum change.
3. Refactor and reconcile the result with the spec, plan, and product intent.

In this method, compilation errors are not RED. RED means the code and tests compile and the test fails on its assertion — the gap is behavioral, not structural.

Test outcomes are not only validation. They are feedback that may force updates to earlier stages: a failing test that cannot be passed cleanly may indicate spec ambiguity; a refactor that proves impossible without violating a boundary may indicate ADR-level pressure; a behavior the test cannot express may indicate that the product intent itself is underspecified.

### 3. Log

The log compresses what changed and why it matters.

Its purpose is to:

- record outcome and impact, not implementation detail
- make work legible to future readers without forcing them through the diff
- separate "what was done" (git) from "what changed for the user or the system" (log)

Rules:

- keep entries concise and outcome-focused
- write user-facing impact, not commit summaries
- let git track implementation detail; let the log track impact

### 4. Artifact

The artifact stage preserves durable knowledge beyond the current coding step.

Its purpose is to:

- record knowledge that does not belong in code, ADRs, or specs
- preserve context that future agents and maintainers will need
- prevent reasoning loss when the work moves on

Examples:

- design decisions that informed the work but did not rise to ADR-level commitment
- architectural outlines that capture the shape of a subsystem
- postmortems and incident retrospectives
- onboarding context for future agents or maintainers

Artifacts are not produced for ceremony. They exist when the knowledge is durable and would otherwise be lost between sessions.

## Non-linear behavior

This phase is intentionally non-sequential.

- Executable spec and TDD evolve together. Failing tests reshape the executable spec, and a sharper executable spec produces sharper tests.
- TDD continuously pressure-tests the spec, the plan, the ADRs, and the product intent. Returning upward when tests reveal incoherence is part of the method, not a failure of it.
- Log and artifact work reflect reasoning, not just completion. They may be written mid-work when something becomes worth preserving, not only at the end.

The practical point is to allow the loop to return upward when implementation reality contradicts an earlier commitment, instead of pretending earlier layers were permanently settled.

## Relationship to other layers

- **Product Intent** governs the whole loop. Coding-phase outputs (logs, artifacts, test outcomes) feed back into product intent when implementation reality reveals that a user-facing commitment is unstable.
- **Pre-coding artifacts** (research, pre-ADR, ADR, spec, plan) are the inputs the coding phase operationalizes. The coding phase does not invent intent; it executes against committed intent and reports back when reality pushes back.
- **Code and tests** are the ground truth of what is actually built. They are not the documentation of intent — that is what the upper layers exist for.

## Summary

The coding phase is where intent becomes executable, where execution becomes verifiable, and where the work becomes durable knowledge. It is the back half of the same loop that the pre-coding phase begins: coding is not separate from thinking; it is thinking pressure-tested against reality.
