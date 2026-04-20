---
title: Agentic Dev Flow
date: 2025-10-08
model: gpt-5
description: "Personal note describing an end-to-end agentic development flow from intake through artifact preservation."
author: Igor Malyarov
format: note
---

# Agentic Dev Flow

This note describes an end-to-end agentic development flow. It is not a skill trigger. It is a process model: a cyclic path from intake through specification, planning, implementation, logging, and durable artifact creation.

## Core idea

The flow treats software work as a loop rather than a straight line. The goal is not just to produce code, but to keep intent, execution, and recorded knowledge aligned as the work evolves.

## Flow stages

### 1. Intake

Capture the task, bug report, feature request, or observation that triggered the work.

- Goal: identify the external signal that activated the process
- Output: a structured problem statement describing who, what, and why

### 2. Spec

Define intent and constraints before deciding on implementation details.

- Goal: clarify what must exist before deciding how to make it exist
- Role: the minimal DNA of the solution

### 3. Executable spec

Turn the intent into something concrete enough to execute, simulate, or test.

Typical forms:

- behavior contracts
- expected input/output examples
- acceptance criteria expressed as tests or scenarios

This stage bridges abstract design and concrete implementation.

### 4. Plan

Translate executable intent into ordered work.

Typical content:

- task decomposition
- dependency ordering
- implementation sequencing

Planning is not isolated from the spec. Feedback from planning may refine the spec itself.

### 5. TDD cycle

Execute the work through iterative verification.

Each loop:

1. Write failing tests.
2. Make code compile and pass.
3. Refactor and reconcile the result with the spec and plan.

Test outcomes are not only validation. They are feedback that may force updates to earlier stages.

### 6. Log

Compress what changed and why it matters.

- Keep it short.
- Keep it user-facing.
- Let git track implementation detail; let the log track impact.

### 7. Artifact

Preserve durable knowledge beyond the current coding step.

Examples:

- design decisions and rationale
- architectural outlines
- postmortems
- context for future agents or maintainers

## Non-linear behavior

This flow is intentionally non-sequential.

- Spec and executable spec evolve together.
- TDD continuously pressure-tests the spec and plan.
- Log and artifact work reflect reasoning, not just completion.

The practical point is to allow the process to loop back when inconsistency or uncertainty appears, instead of pretending the earlier steps were permanently settled.
