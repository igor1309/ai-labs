---
name: product-intent-drafting
description: Use when user-facing capability, actors, user stories, acceptance signals, boundaries, or downstream traceability need to be captured before research, ADRs, specs, implementation plans, or code.
---

# Product Intent Drafting

## Overview

Use this skill to draft Product Intent: the story-centered parent artifact for the My Way workflow. Product Intent defines the accepted user-facing intent that downstream engineering artifacts must preserve.

Product Intent is not a product vision document and not a PRD. Its center of gravity is accepted user stories plus enough context to make those stories useful for downstream research, decisions, specs, plans, and tests.

## Trigger

This skill applies when:

- work lacks a clear user-facing capability or outcome
- user stories need to become the governing source of intent
- downstream research, ADRs, specs, or implementation plans need a product-intent anchor
- a product-area change needs actors, acceptance signals, boundaries, and traceability captured
- an accepted user story is changing in a way that may affect downstream artifacts

Do not use this skill to decide architecture, write behavior rules, or plan execution order. Those belong to ADR, spec, and implementation-plan work.

## Inspect Before Acting

Read the minimum context needed to frame user intent:

- the request, opportunity, or product problem
- known users, actors, or stakeholders
- existing Product Intent artifacts, if any
- relevant product notes, specs, issues, or support/customer evidence
- downstream artifacts only when they reveal existing commitments that must be preserved
- the Product Intent structure at `../../00-product-intent/structure.md`
- the example at `../../00-product-intent/example.md` if a concrete pattern would help

Read enough to capture intent honestly. Do not use downstream technical artifacts to invent user stories after the fact.

## Preserve This Judgment

- Product Intent is story-centered, not vision-centered.
- User stories should remain recognizable in standard form.
- Goals, actors, acceptance signals, boundaries, and traceability exist to support stories, not replace them.
- Product Intent governs downstream artifacts without absorbing their responsibilities.
- A flat story list is fine for small work; larger product areas may need a narrative or workflow grouping.
- Change review should be impact-based: meaningful intent changes trigger downstream review, editorial cleanup does not.

## Produce

Help produce or revise a Product Intent artifact that makes clear:

- the concrete user-facing outcome
- the actors whose needs shape the work
- accepted user stories
- acceptance signals or confirmation methods
- boundaries and non-goals
- open product questions
- downstream traceability expectations
- meaningful changes to accepted intent and required impact review

Write the artifact so a downstream researcher, architect, spec author, or implementer can tell what user promise they must preserve.

## Workflow

1. Identify the product outcome the work exists to create or protect.
2. Identify the actors that materially shape the stories.
3. Draft user stories in standard form.
4. Attach acceptance signals that make story satisfaction recognizable.
5. Define boundaries and non-goals to prevent inferred commitments.
6. Decide whether a flat story list is enough or whether stories need narrative grouping.
7. Add downstream traceability only where artifacts exist or where traceability expectations need to be explicit.
8. Record open product questions separately from technical unknowns.
9. Check for drift: if the artifact reads like vision, backlog, architecture, or implementation plan, narrow it back to product intent.

## Failure Modes To Avoid

- replacing user stories with vague goals
- burying user stories under broad vision prose
- inventing a non-standard story format without reason
- turning Product Intent into a PRD or backlog
- using Product Intent to decide technical architecture
- forcing full ceremony onto small bug fixes where expected behavior is already clear
- allowing meaningful story changes to bypass downstream review

## Boundary Rule

If the central uncertainty is technical, move to research, pre-ADR, or ADR. If expected behavior needs operational detail, move to spec. If the route to delivery is unclear, move to implementation-plan work. Product Intent should define the user promise, not solve every downstream question.
