---
title: Research
date: 2026-04-12
author: Igor Malyarov
version: 0.0.2
format: note
---

# Research

## Purpose

Research is the exploratory stage that precedes architectural commitment.

Its purpose is to improve understanding of the problem space before solution decisions are locked. It helps surface constraints, unknowns, tradeoffs, and relevant precedents early, while changes are still cheap.

Research is not performed for documentation volume. It exists to reduce false certainty and avoid premature design decisions.

## What it is / what it is not

Research is:

- problem-space exploration
- constraint discovery
- terminology alignment
- option surfacing
- risk identification
- precedent and pattern review

Research is not:

- an ADR
- a final architecture proposal
- a spec
- an implementation plan
- a place to quietly smuggle in decisions without naming them as decisions

The output of research may influence later decisions, but it does not itself constitute commitment.

## Inputs

Typical inputs include:

- product or business problem
- known constraints
- existing system context
- prior incidents or pain points
- external patterns, technologies, or domain examples
- major unknowns and assumptions

Research should start from a concrete question, tension, or area of uncertainty. Without that, it easily degrades into unfocused reading.

## Tools and process

AI assistants are used constantly throughout research — Perplexity for search and synthesis, ChatGPT and Claude (including mobile) for rapid Q&A and assumption testing. These are not passive lookup tools; they are active conversation partners used to probe the problem space, challenge framing, and surface gaps faster than solo reading allows.

Q&A is a primary working mode. Rather than reading linearly, research often proceeds through directed question-and-answer cycles: asking pointed questions, evaluating answers, and following up on weak or surprising responses. This interactive style produces sharper outputs than accumulating material and summarizing later.

## Outputs

Research should produce a compact, decision-useful output such as:

- problem framing
- clarified terminology
- relevant constraints
- identified risks
- candidate directions
- key tradeoffs
- open questions
- assumptions requiring validation

The output should make later design discussion sharper. It should not attempt to replace that discussion.

## Exit criteria

Research is complete when:

- the problem is framed clearly enough for design discussion
- the main constraints are visible
- the important unknowns are explicit
- plausible directions have been surfaced
- obvious blind spots have been reduced
- the next step is clear, usually pre-ADR or equivalent design work

Research is not complete merely because many sources were read.

## Common mistakes

### 1. Treating research as passive information collection

Reading without a concrete question produces volume, not clarity.

### 2. Confusing research with design

Research can inform a solution, but once the document starts prescribing architecture, it has moved into another phase.

### 3. Hiding decisions inside exploratory language

If a decision has effectively been made, it should be recorded as a decision, not disguised as “background.”

### 4. Letting research run indefinitely

Research should reduce uncertainty, not become a way to postpone commitment forever.

### 5. Producing output with no decision value

A useful research note sharpens the next conversation. A weak one merely summarizes material.

## Summary

Research is the first reduction step in the pre-coding phase.

It is an explicitly exploratory activity, grounded in practical experience with ambiguity and premature implementation. Its role is to make the problem space legible enough that later documents — such as pre-ADR, ADR, spec, and implementation plan — can be written with better judgment and less noise.
