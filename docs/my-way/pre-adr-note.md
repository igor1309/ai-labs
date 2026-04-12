Add: 
- often a break is taken between pre-adr and adr for brain to settle down and pov refresh
- review is mostly used to mark gaps as explicit open questions
- iterative and interactive - ongoing discussion with different models (gpt/claude) to close gaps

---
title: Pre-ADR
date: 2026-04-12
author: Igor Malyarov
model: GPT-5.4 Thinking
version: 0.0.1
format: note
---

# Pre-ADR

## Purpose

Pre-ADR is the exploratory design stage that sits between research and formal architectural decision recording.

Its purpose is to turn raw understanding into structured architectural discussion before commitment is made. It helps examine candidate directions, pressure-test assumptions, and shape the system at a stage where correction is still relatively cheap.

Pre-ADR is not the final decision record. It is the workspace in which that decision is approached.

## What it is / what it is not

Pre-ADR is:

- an exploratory architecture discussion artifact
- a place to assess options, alternatives, and tradeoffs
- a way to organize emerging understanding before formal commitment
- a vehicle for making architectural tensions visible
- a bridge between research and ADR

Pre-ADR is not:

- a final ADR
- a finalized spec
- an implementation plan
- a purely passive summary of research
- a place to present already-made decisions as if they were still open

Its role is to support architectural thinking, not to simulate certainty too early.

## Nature of the process

A strong pre-ADR usually emerges from a highly interactive process rather than from solitary writing.

That process often includes:

- brainstorming
- Q&A sub-sessions
- clarification of assumptions
- assessment of alternatives
- comparison of tradeoffs
- discussion of constraints
- iterative reframing of the problem
- gradual sharpening of boundaries and responsibilities

For that reason, a pre-ADR should be understood not merely as a document, but as the result of design interaction. The document captures the current state of that interaction in a form that can be reviewed, challenged, and refined.

## Inputs

Typical inputs include:

- research artifacts
- notes from Q&A sub-sessions
- domain constraints
- existing system context
- candidate architectural directions
- known risks and tensions
- terminology alignment work
- unresolved assumptions carried over from research

Research artifacts are often a major input, but pre-ADR should not mechanically restate them. It should use them to move the discussion from understanding the problem toward shaping the solution space.

## Outputs

A pre-ADR should produce a compact but useful design artifact such as:

- architecture framing
- candidate solution directions
- alternatives considered
- major tradeoffs
- relevant constraints
- identified risks
- provisional boundary definitions
- open questions requiring resolution before ADR
- areas that already appear stable enough to carry forward

The output should make the eventual ADR easier to write and more defensible.

## Exit criteria

Pre-ADR is complete when:

- the main architectural options have been surfaced and discussed
- key constraints are visible in the solution discussion
- major tradeoffs are explicit
- obvious weak directions have been eliminated or deprioritized
- the decision space has narrowed enough to support a formal ADR
- remaining open questions are known and bounded

Pre-ADR is not complete merely because an architecture sketch exists.

## Common mistakes

### 1. Treating pre-ADR as a draft ADR with softer wording

If the real decision is already fixed, the process has skipped the exploratory stage.

### 2. Repeating research without moving into solution shaping

Pre-ADR should build on research, not duplicate it.

### 3. Hiding unresolved tensions

Unresolved issues should be made visible. That is one of the main reasons this stage exists.

### 4. Letting the discussion remain vague

Exploration is not an excuse for imprecision. The document should gradually sharpen the discussion.

### 5. Turning interaction into undocumented intuition

If important understanding emerged through brainstorming or Q&A, the resulting artifact should preserve the substance of that reasoning in usable form.

## Summary

Pre-ADR is the exploratory architecture layer of the pre-coding phase.

It is explicitly interactive, shaped through brainstorming, questioning, comparison, and refinement. Its job is to transform research and discussion into a clearer solution space, so that the eventual ADR records a real decision rather than becoming the first place where architectural thinking happens.
