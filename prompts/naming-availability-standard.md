---
title: Naming Availability Standard
description: Reusable availability-risk standard for product and project naming sessions.
date: 2026-05-12
model: gpt-5.5-thinking
scope: naming, product naming, internal tools, agent orchestration
---

# Naming Availability Standard

## Purpose

This standard defines how to evaluate name availability during naming sessions without over-filtering good candidates too early.

The goal is not global uniqueness. The goal is to avoid meaningful collision inside the relevant product field.

## Scope

Use this standard for early-stage product, project, CLI, tool, and internal system names where:

- the name is not yet intended for broad public launch;
- the project is not necessarily open source;
- perfect global uniqueness is not required;
- semantic fit and usability matter more than pristine search space.

## Availability Principle

Availability is a risk filter, not a primary ranking axis.

A name should not be rejected merely because the same string appears somewhere on the public web. It should be rejected when the collision is close enough to confuse users, create legal risk, or weaken the name inside the target field.

## Hard Blockers

Reject a name if there is a same or highly similar name in any of these areas:

- agent orchestration;
- AI coding agents;
- LLM workflow tooling;
- LLM eval, review, or adjudication tooling;
- developer automation systems with close conceptual overlap;
- review, verdict, policy-routing, or remediation-loop products;
- active trademark-heavy companies in adjacent developer-tooling or AI-infrastructure categories.

Also reject a name if it has:

- strong negative meaning in a target language or market;
- pronunciation or spelling ambiguity severe enough to hurt spoken referenceability;
- package, repo, or command-name conflict in the exact intended technical surface;
- dominant search results from a close product category.

## Soft Concerns

Do not reject a name only because of:

- unrelated historical software;
- unrelated SaaS products;
- small GitHub repositories;
- personal handles;
- non-English morphology or ordinary grammar forms;
- companies in unrelated domains;
- broad word/root usage;
- obscure or inactive projects;
- non-primary package registry appearances outside the intended ecosystem.

Neutral cross-language overlays are soft concerns when they create competing interpretations without negative meaning. Treat them as a documentation cost, not a blocker. The launch or README copy should anchor the intended meaning in one clear sentence.

## Ignore For Now

For early-stage work, mostly ignore:

- perfect global uniqueness;
- pristine domain availability;
- every package registry;
- unrelated consumer apps;
- broad trademark paranoia;
- scattered public-handle usage;
- language coincidences that do not create negative meaning or serious confusion.

## Scoring Weights

Use these weights when comparing names after hard blockers are removed:

| Criterion | Weight |
|---|---:|
| Product fit | 35% |
| Spoken / CLI usability | 25% |
| Tone fit | 15% |
| Memorability | 15% |
| Availability risk | 10% |

## Availability Risk Reading

Use this scale:

| Risk | Meaning |
|---|---|
| Low | No visible close-field collision; unrelated uses only |
| Medium | Some visible usage, but outside the target field |
| High | Close adjacent product, AI/developer tooling overlap, or dominant search collision |
| Blocked | Same or highly similar name in the target field |

## Practical Interpretation

A good candidate can survive medium availability risk if:

- product fit is strong;
- CLI/spoken usability is strong;
- the collision is outside the target category;
- the name has a clear semantic advantage;
- launch materials can explain the intended meaning cleanly.

A weak candidate should not be saved merely because it is unique.

## Naming Target

Prefer names that work inside the actual product reality and do not collide with the relevant field:

> A name should fit the product, survive spoken and CLI use, and avoid close collision in agent orchestration, coding-agent, review-loop, or AI workflow tooling.
