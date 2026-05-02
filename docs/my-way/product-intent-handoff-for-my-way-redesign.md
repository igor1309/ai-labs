---
title: Product Intent Layer — Directional Handoff for My Way Redesign
date: 2026-05-02
author: Igor Malyarov
model: gpt-5.5-thinking
version: 0.5.0
format: directional-handoff
status: reviewed
---

# Product Intent Layer — Directional Handoff for My Way Redesign

## Purpose

This document captures the expanded frame for redesigning `my-way` so the workflow has an explicit product-intent layer above research, ADRs, specs, implementation plans, and code.

It is a handoff to a senior analyst who will redesign the existing `my-way` docs and skills.

This is not a specification for the Product Intent artifact, not a workflow algorithm, and not a template contract.

## Boundary of this handoff

This document should do three things:

1. identify the structural gap in the current model
2. explain why Product Intent is the likely missing layer
3. name the design tensions the analyst must resolve

It should not prescribe implementation details such as exact tables, lifecycle states, mandatory section layouts, escalation heuristics, edit-classification mechanics, or story-map rules.

Those decisions belong to the redesign work.

## Core problem

The current `my-way` workflow starts too low.

Current frame:

```text
Research
→ Pre-ADR
→ ADR
→ Spec
→ Implementation Plan
→ Code
```

This frame is strong for technical and architectural work. It helps separate exploration from commitment, preserve reasoning, constrain implementation, and keep downstream artifacts accountable to prior decisions.

But it does not define the product-intent layer above that chain.

As a result, the workflow can explain:

- what uncertainty exists
- what options were considered
- what architecture was chosen
- what behavior must be implemented
- how implementation should proceed

But it does not explicitly define:

- who the work is for
- what user capability is being created
- what user outcome matters
- which user-facing promise downstream artifacts must preserve
- what should happen when that promise changes

That is why user stories are missing not only as text, but as a governing concept.

## Required conceptual correction

Add a product-intent layer above the current pre-coding stack.

Target frame:

```text
Product Intent
→ Research
→ Pre-ADR
→ ADR
→ Spec
→ Implementation Plan
→ Code
```

Product Intent should become the parent frame for downstream engineering artifacts.

It should define the user-facing intent that research, ADRs, specs, implementation plans, and code must preserve.

## Why Product Intent, not only User Stories

User stories should become first-class. However, a standalone list of stories is probably too thin to govern an architecture-heavy workflow.

The better direction is a broader Product Intent layer where user stories are central, but surrounded by enough product context to make them useful:

- product goal / outcome
- actors
- user stories
- acceptance criteria or confirmation method
- boundaries / non-goals
- open product questions
- downstream traceability
- change-propagation expectations

This preserves user-story centrality without reducing the artifact to a ticket list.

## User-story standard-practice constraint

The redesign should not invent an idiosyncratic user-story format without a concrete reason.

The standard form should remain recognizable:

```text
As a <type of user>,
I want <some goal / capability>,
so that <some reason / outcome>.
```

The analyst may decide what metadata, surrounding context, or traceability mechanism is needed, but those additions should not replace the user-story concept itself.

## Product Intent should be story-centered, not vision-centered

The name `Product Intent` is useful, but it is semantically broad. It can drift toward a vision document, goal statement, or lightweight PRD.

The redesign should prevent that drift.

Product Intent should be explicitly framed as the governing product artifact that contains accepted user stories and the surrounding context needed to make downstream engineering artifacts accountable to those stories.

If Product Intent becomes a soft vision document, the redesign fails.

If user stories are buried as a minor subsection, the redesign also fails.

## Internal hierarchy to resolve

The previous draft over-prescribed the internal structure. The analyst should still resolve the hierarchy explicitly.

The unresolved design question:

> How should Product Intent relate goals, actors, user stories, acceptance criteria, boundaries, and downstream traceability without becoming a checklist of unrelated sections?

The likely conceptual relationship is:

```text
Goals explain why.
Actors define who.
User stories define what capability and outcome matter.
Acceptance criteria or confirmation methods define how satisfaction is recognized.
Traceability connects accepted intent to downstream artifacts.
```

The analyst should turn this into an appropriate document structure.

## Narrative shape / story-map question

A flat list of user stories may be enough for a small feature.

For a larger product area, a flat list can lose the narrative shape of what the product does as a whole. This is the point from story-mapping practice that the redesign should not ignore.

Open design question:

> Should Product Intent govern individual stories directly, or should it also support a structured set of stories arranged around user activities, workflow steps, or a lightweight narrative flow?

This handoff does not prescribe story mapping or an escalation trigger. It only names the risk: traceability tables alone can preserve references while losing product readability.

## Relationship to downstream artifacts

The redesign should make downstream artifacts accountable to Product Intent.

### Research

Research should be able to reference product intent when the investigation exists to clarify, protect, or unblock a user outcome.

Research should remain exploratory. Product Intent should not turn research into commitment.

### Pre-ADR

Pre-ADR should evaluate options against product intent where relevant, not only technical tradeoffs.

Pre-ADR should remain provisional. Product Intent should constrain the problem being explored, not prematurely choose the solution.

### ADR

ADRs should trace to product intent when an architectural decision exists to enable, protect, or constrain a user-facing capability.

ADRs should remain architectural. Product Intent should explain why the decision matters, not turn the ADR into a product document.

### Spec

Specs should operationalize accepted product intent into behavior, rules, edge cases, and tests.

Specs should not become PRDs. They should translate intent into implementable behavior.

### Implementation Plan

Implementation plans should preserve product intent during execution.

The plan may slice work by story, component, risk, or technical dependency. The redesign should decide how traceability is preserved without forcing an unnatural slicing model.

## Change propagation

User stories are living artifacts. This matters because changing an accepted user story can invalidate assumptions, decisions, specs, implementation plans, or tests downstream.

The redesign should define a bounded way to handle this.

Open design question:

> How should changes to accepted product intent trigger downstream review without turning every wording edit into ceremony?

The handoff should not prescribe exact lifecycle states, edit labels, or cascade mechanics. The important requirement is conceptual:

- meaningful changes to accepted user intent must not silently bypass downstream artifacts
- minor editorial cleanup must not trigger unnecessary full-chain review
- the review should be impact-based, not ceremonial

## Upstream of Product Intent

This redesign starts at Product Intent.

The sources of product intent are out of scope for this pass:

- user discovery
- support signals
- telemetry
- stakeholder input
- market observation
- JTBD analysis
- competitive research

This is a future design question:

> What feeds Product Intent, and how is the wider product context kept honest before stories enter the engineering workflow?

Do not block the current redesign on this question. The immediate correction is to make Product Intent govern the existing engineering-document chain.

## Non-goals

This redesign should not:

- replace ADRs with product documents
- turn specs into PRDs
- invent a non-standard user-story format without justification
- force every bug fix through full Product Intent ceremony
- collapse research, ADR, spec, and implementation plan into one document
- prescribe a closed workflow algorithm in this handoff
- prescribe exact Product Intent tables or templates in this handoff
- solve the upstream discovery / product-signal pipeline in this pass

## Analyst design questions

The analyst should resolve these questions during redesign:

1. What is the minimal Product Intent artifact structure that makes user stories first-class without turning the artifact into a PRD?
2. How should Product Intent preserve standard user-story practice?
3. How should Product Intent represent the relationship between goals, actors, stories, acceptance criteria, boundaries, and traceability?
4. When is a flat story list sufficient, and when does the artifact need narrative shape or story-map-like organization?
5. How should downstream artifacts reference Product Intent without bloating every document?
6. How should accepted user-story changes propagate downstream without excessive ceremony?
7. Which lightweight paths should exist for minor features and bug fixes?
8. Which parts belong in docs, and which parts belong in skills?

## Expected redesign output

The redesign should produce updated `my-way` docs that make Product Intent visible as the governing layer above the current pre-coding workflow.

At minimum, the analyst should consider updates to:

- pre-coding workflow docs
- research docs
- pre-ADR docs
- ADR docs
- spec docs
- implementation-plan docs
- minor-feature / bug-fix workflow variants
- skill docs, if skills remain the operational interface

This handoff does not require a specific file layout. The analyst should choose the layout that best fits the existing `my-way` structure.

## Quality bar

The redesign is successful if:

- user stories become a first-class concept
- Product Intent becomes the governing layer, not a buried spec subsection
- Product Intent remains story-centered, not vision-centered
- standard user-story practice is preserved
- downstream artifacts can trace back to accepted product intent where relevant
- meaningful changes to accepted user intent trigger bounded downstream review
- lightweight paths remain lightweight
- the exploratory-versus-committed distinction remains intact
- unresolved upstream discovery questions are explicitly parked, not accidentally solved

## Review notes for this version

This version intentionally rolls back the over-prescriptive details from v0.4.

Removed or demoted from prescription to analyst-facing design tension:

- exact Product Intent table schemas
- exact baseline template
- exact lifecycle statuses
- exact acceptance-criteria storage rule
- exact change-type declaration mechanism
- exact narrative-flow escalation heuristic
- exact cascade algorithm
- fixed file-layout prescription

The handoff now preserves the strategic frame and leaves implementation mechanics to the senior analyst redesigning `my-way`.
