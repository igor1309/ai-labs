---
title: ADR
date: 2026-04-12
author: Igor Malyarov
model: GPT-5.4 Thinking
version: 0.0.1
format: note
---

# ADR

## Purpose

ADR is the commitment stage of the pre-coding phase.

Its purpose is to record an architectural decision that has been made, explain why it was made, and make its implications explicit enough that future work is not forced to reconstruct the reasoning from memory, folklore, or code.

An ADR exists to reduce reinterpretation, drift, and repeated debate around already-resolved matters.

## What it is / what it is not

ADR is:

- a decision record
- a statement of chosen direction
- an explanation of the reasoning behind that choice
- a boundary-setting artifact
- a reference point for future design and implementation work

ADR is not:

- an exploratory brainstorming document
- a research note
- a pre-ADR
- a spec
- an implementation plan
- a retrospective attempt to justify accidental architecture after the fact

If the decision is still genuinely open, the work belongs in pre-ADR or another exploratory format, not in ADR.

## Inputs

Typical inputs include:

- pre-ADR artifacts
- research artifacts
- notes from design discussions and Q&A sub-sessions
- constraints that proved decisive
- alternatives considered
- tradeoff analysis
- already-established adjacent ADRs
- system context needed to define the decision boundary

ADR should be informed by prior exploration, but it should not repeat that exploratory process in full. It should capture the decision that emerged from it.

## Outputs

A useful ADR should make clear:

- what decision was made
- why this direction was chosen
- what alternatives were considered and why they were not selected
- what constraints materially influenced the decision
- what boundaries, responsibilities, or contracts are established by the decision
- what consequences follow from adopting it
- what remains intentionally out of scope

The output should be strong enough that a later reader can understand the decision without reconstructing the entire design history.

## Quality criteria

A strong ADR has several properties.

### 1. Intent integrity

It records the real decision, not a softened or distorted version of it.

### 2. Boundary clarity

It makes clear what this decision governs and what it does not.

### 3. Cross-decision consistency

It does not quietly conflict with other accepted decisions without naming and addressing that conflict.

### 4. Decision stability

It captures something that is stable enough to be worth recording, not a transient thought that still belongs to exploration.

### 5. Explicit consequences

It acknowledges what the decision enables, restricts, or makes more expensive later.

## Exit criteria

An ADR is complete when:

- the decision is stated unambiguously
- the main reasons for the decision are visible
- relevant alternatives have been addressed
- the decision boundary is clear
- consequences are explicit
- downstream work can treat the decision as settled unless formally revisited

An ADR is not complete merely because a preferred option has been named.

## Common mistakes

### 1. Writing ADRs too early

If the document is still mainly comparing possibilities, it is not yet an ADR.

### 2. Writing ADRs too late

If architecture is already embedded in code and team behavior, the ADR often degrades into post-hoc storytelling.

### 3. Hiding tradeoffs

A useful ADR does not pretend the chosen option is cost-free.

### 4. Recording conclusions without boundaries

A decision without a boundary invites misuse and future confusion.

### 5. Confusing ADR with spec

ADR states the architectural decision. It does not replace the behavioral or contractual detail that belongs in a spec.

## Summary

ADR is the formal commitment layer of the pre-coding phase.

It is the point where exploration stops and the chosen architectural direction is recorded explicitly. Its value is not ceremonial. Its value is in preserving the real decision, its rationale, and its consequences, so implementation and later design work can proceed from an explicit foundation rather than from guesswork.
