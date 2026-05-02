---
title: Product Intent Layer — Handoff for My Way Redesign
date: 2026-05-02
author: Igor Malyarov
model: gpt-5.5-thinking
version: 0.3.0
format: handoff
status: final-reviewed
---

# Product Intent Layer — Handoff for My Way Redesign

## Purpose

This document locks the expanded frame for redesigning `my-way` so the workflow has an explicit product-intent layer above research, ADRs, specs, implementation plans, and code.

It is written as a handoff to a senior analyst who will redesign the existing `my-way` docs and skills.

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

This is strong for reducing technical ambiguity, separating exploration from commitment, and making implementation constrained. However, it does not define the product-intent layer that governs the whole chain.

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
- what must happen when that promise changes

This is why user stories are missing not only as text, but as a governing concept.

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

`Product Intent` is not a vision document and not a PRD replacement. It is the governing product artifact that defines accepted user stories, their surrounding product context, and the downstream accountability chain.

Within `Product Intent`, user stories are the primary traceable product abstraction: they define the user-facing capabilities and outcomes that downstream artifacts must preserve. Goals, actors, activity flow, boundaries, and acceptance criteria frame those stories; they do not replace them.

## Why Product Intent, not only User Stories

User stories are necessary and should become first-class. However, by themselves they are too thin to govern an architecture-heavy workflow unless they are surrounded by goal, actor, boundary, acceptance, and traceability context.

The recommended artifact is `Product Intent`, containing user stories plus the surrounding product frame:

- goal / desired product outcome
- actors
- user activities or narrative shape where needed
- user stories
- acceptance criteria
- boundaries / non-goals
- open product questions
- downstream traceability
- change-cascade rules

This avoids reducing product reasoning to story cards while still preserving industry-standard user-story practice.

## Internal hierarchy of Product Intent

Product Intent must not read as a flat checklist of unrelated sections.

Required hierarchy:

```text
Product goal / outcome
→ actors
→ user activities / narrative flow
→ user stories
→ acceptance criteria
→ downstream traceability
```

Layer responsibilities:

| Layer | Responsibility |
|---|---|
| Product goal / outcome | Defines why the product area or feature exists |
| Actors | Defines who the product intent is for |
| User activities / narrative flow | Describes the shape of what the user is trying to do across stories |
| User stories | Defines user-facing capabilities and outcomes in standard story form |
| Acceptance criteria | Confirms whether a specific story is satisfied |
| Downstream traceability | Connects accepted stories to research, ADRs, specs, plans, and validation |

Default scoping rule:

- acceptance criteria should normally be scoped per user story
- product-level acceptance signals may exist, but must not replace story-level acceptance criteria
- goals frame stories; they are not substitutes for stories
- traceability should attach primarily to accepted stories, and secondarily to product goals when the work is too broad for a single story

## User stories: standard practice constraint

Do not invent a non-standard user-story format unless there is a concrete reason.

Use the common form as the default:

```text
As a <type of user>,
I want <some goal / capability>,
so that <some reason / outcome>.
```

The workflow may add metadata around a story, but must not replace the standard story concept with an idiosyncratic local invention.

Allowed metadata:

| Field | Purpose |
|---|---|
| ID | Stable traceability key, e.g. `US-001` |
| Status | `proposed`, `accepted`, `changed`, `deprecated` |
| Acceptance criteria | Conditions that make the story satisfied |
| Notes | Clarifications, constraints, or unresolved questions |

The story itself should remain recognizable as a normal user story.

## Product Intent artifact shape

The exact file layout may change during the redesign, but the artifact must preserve the hierarchy and traceability rules defined above.

Recommended location:

```text
00-product-intent/
  structure.md
  example.md
  note.md
```

Recommended skill location if skills are extracted:

```text
skills/product-intent/
  SKILL.md
skills/product-intent/product-intent-review/
  SKILL.md
```

Required baseline structure:

```markdown
---
date: YYYY-MM-DD
model: <model used>
description: "Product intent: <feature / product area>"
---

# Product Intent: <Feature / Product Area>

## Definition

This is the governing product artifact for <feature / product area>. It defines accepted user stories, their surrounding product context, and the downstream accountability chain.

## Product goal / outcome

## Actors

## User activities / narrative flow

## User stories

| ID | User story | Status | Notes |
|---|---|---|---|

## Acceptance criteria

Acceptance criteria are normally scoped per story. Product-level acceptance signals may be added only when they do not replace story-level confirmation.

| Story | Acceptance criteria |
|---|---|

## Boundaries / non-goals

## Open product questions

## Downstream traceability

| Story / goal | Research | ADRs | Specs | Plans |
|---|---|---|---|---|

## Change cascade
```

## Narrative shape and story mapping

A flat list of user stories is sufficient for small features. It may fail for larger product areas because the product becomes unreadable from its own intent document.

The redesign should explicitly evaluate whether Product Intent needs a lightweight narrative-shape layer above individual stories.

Open design question for the analyst:

> Is the unit of governance the individual user story, or a structured set of stories arranged around user activities, workflow steps, or a lightweight story map?

Do not prescribe full story mapping by default. The expected solution should remain lightweight, but it must preserve the product narrative when a flat story table becomes too weak.

Possible candidate:

```markdown
## User activities / narrative flow

| Activity / step | Stories |
|---|---|
| Capture input | US-001, US-002 |
| Review generated artifact | US-003 |
| Apply correction | US-004 |
```

This layer should organize stories; it should not replace them.

## Relationship to existing artifacts

### Product Intent → Research

Research should start from either a user story, a product goal, or a product tension blocking a story.

Research must answer:

> What do we need to understand to preserve or implement the intended user outcome?

Recommended addition to research docs:

```markdown
## Product intent referenced

- Product Intent: <link>
- Stories: US-001, US-002
```

Research remains exploratory. It does not become commitment.

### Product Intent → Pre-ADR

Pre-ADR should compare solution options against product intent, not only technical tradeoffs.

Recommended addition:

```markdown
## Product-intent drivers

| Story / goal | Design pressure |
|---|---|
```

Options considered should include product impact where relevant:

```markdown
### Option A — <name>

- Technical tradeoffs:
- Product impact:
- Risks:
```

Pre-ADR remains provisional.

### Product Intent → ADR

ADRs should be traceable to product intent when the decision exists to enable, constrain, or protect a user-facing capability.

Recommended addition:

```markdown
## Product-intent traceability

| Story / goal | Relevance | Impact |
|---|---|---|
```

This section prevents ADRs from becoming elegant architecture detached from product value.

ADR rules and invariants should still remain architectural. Product intent explains why the decision matters; it should not turn the ADR into a product requirements document.

### Product Intent → Spec

Specs should operationalize product intent into behavior.

Recommended addition near the top of the spec:

```markdown
## User stories covered

| Story | Behavior rules | Tests |
|---|---|---|
```

Behavior rules should remain concrete and testable. User stories explain why the behavior matters and provide traceability.

### Product Intent → Implementation Plan

Implementation plans should slice by user story where practical. If slicing by technical layer is more appropriate, the plan must still preserve story traceability.

Recommended addition:

```markdown
## Story traceability matrix

| Story | Phase / task | Validation |
|---|---|---|
```

The implementation plan remains operational. It should not rediscover product intent during execution.

## Change cascade

User stories are living artifacts. A semantic change to an accepted story must trigger impact review downward. Editorial corrections must not trigger this path.

Required cascade:

```text
Accepted user story semantically changed
→ Product Intent updated
→ affected research reviewed for stale assumptions
→ affected Pre-ADRs reviewed for invalidated options or constraints
→ affected ADRs reviewed for continued validity, supersession, or clarification
→ affected specs patched if behavior changed
→ affected implementation plans re-sliced or revalidated
→ code/tests updated if required
```

Minimum workflow status metadata:

```text
proposed
→ accepted
→ changed
→ deprecated
```

Status semantics:

These statuses are workflow metadata around otherwise standard user stories. They must not change the story format itself.

| Status | Meaning |
|---|---|
| proposed | Being explored; may inform research but should not govern committed artifacts yet |
| accepted | Governing intent; downstream artifacts should trace to it where relevant |
| changed | Previously accepted intent changed semantically and requires downstream impact review before it is treated as stable again |
| deprecated | No longer governing; downstream references must be reviewed or removed |

### Cascade cost boundary

Not every edit to a user story should trigger a full downstream audit.

Distinguish editorial edits from semantic changes:

| Change type | Definition | Required action |
|---|---|---|
| Editorial edit | Clarifies wording without changing actor, capability, outcome, acceptance criteria, or boundaries | Update Product Intent only; no cascade required |
| Semantic change | Changes actor, capability, outcome, acceptance criteria, boundary, or product promise | Trigger downstream impact review |
| Deprecation / replacement | Removes or replaces an accepted story | Trigger explicit cascade review and remove or update downstream references |

Cascade review should be impact-based, not ceremonial. The reviewer must identify affected artifacts, not blindly reopen every document in the chain. A story may return to `accepted` after required downstream impact has been reviewed and necessary patches are complete.

## Ownership boundaries

Product Intent owns:

- user-facing goal
- actors
- user activities / narrative flow where needed
- user stories
- acceptance criteria
- product boundaries / non-goals
- product-level open questions
- change-cascade trigger

Research owns:

- discovery
- uncertainty reduction
- terminology
- constraints
- patterns and precedents
- risks and open questions

Pre-ADR owns:

- solution-space exploration
- options
- provisional boundaries
- unresolved architectural questions

ADR owns:

- committed architectural decision
- rules / invariants
- consequences
- architectural non-goals

Spec owns:

- behavior
- interfaces
- rules
- edge cases
- test expectations

Implementation Plan owns:

- execution order
- work slicing
- validation gates
- closeout rules

## Upstream of Product Intent

This redesign starts at Product Intent.

The sources of product intent are intentionally out of scope for this pass:

- user discovery
- support signals
- telemetry
- stakeholder input
- market observation
- JTBD analysis
- competitive research

The analyst should preserve this as an explicit future design question:

> What feeds Product Intent, and how is the wider product context kept honest before stories enter the engineering workflow?

Do not block the current redesign on this question. The immediate correction is to make Product Intent govern the existing engineering-document chain.

## Non-goals

This redesign must not:

- replace ADRs with product documents
- turn specs into PRDs
- invent a non-standard user-story format without justification
- force every bug fix through a full Product Intent artifact
- require full-funnel ceremony for trivial work
- trigger full cascade review for editorial wording changes
- erase the existing distinction between exploratory and committed documents
- collapse research, ADR, spec, and plan into one document
- solve the upstream discovery / product-signal pipeline in this pass

## Scope variants

### Full path

Use the full path for net-new product or architectural work:

```text
Product Intent
→ Research
→ Pre-ADR
→ ADR
→ Spec
→ Implementation Plan
→ Code
```

### Minor feature

A minor feature may use a lighter path if it fits established architecture.

Recommended shape:

```text
Product Intent reference
→ Delta / mini-spec
→ Short implementation plan
```

Escalate to the full path if the change requires new boundaries, new dependency direction, new protocols, or contradiction of an existing ADR.

### Bug fix

A bug fix does not normally require a new Product Intent artifact.

However, it should reference product intent when expected behavior is disputed or when the defect reveals that the product promise was never captured.

Escalation rule:

```text
Undefined expected behavior
→ patch Product Intent or Spec before implementation proceeds
```

## Required redesign work

The senior analyst should update the docs in this order:

1. Add `00-product-intent/structure.md`.
2. Add `00-product-intent/note.md`.
3. Add `00-product-intent/example.md` using a realistic example, not a fake generic one.
4. Update `pre-coding-phase.md` to include Product Intent as the governing layer above Research.
5. Update Research structure/note to reference product intent when available.
6. Update Pre-ADR structure/note with product-intent drivers.
7. Update ADR structure/note with product-intent traceability.
8. Update Spec structure/note with user-stories-covered traceability.
9. Update Implementation Plan structure/note with story traceability matrix.
10. Update minor-feature and bug-fix variants with escalation/reference rules.
11. Add cascade cost boundaries: editorial edit vs semantic change vs deprecation.
12. Add narrative-shape guidance or an explicit story-map design fork for larger product areas.
13. Add product-intent drafting and review skills if the skill extraction remains the operational direction.

## Quality bar for redesigned docs

The redesign is acceptable only if:

- user stories become visible as a first-class concept
- Product Intent becomes the governing layer, not a buried spec subsection
- Product Intent is clearly defined as a story-centered governing artifact, not a vision document
- user stories remain the primary traceable product abstraction inside Product Intent
- Product Intent has an explicit internal hierarchy: goal → actors → activities → stories → acceptance criteria → traceability
- downstream artifacts explicitly trace to user stories or product goals where relevant
- changed user stories have a bounded cascade-review path
- editorial story edits do not trigger unnecessary cascade work
- standard user-story practice is preserved
- the existing exploratory-versus-committed distinction remains intact
- lightweight paths remain lightweight
- larger product areas have a way to preserve narrative shape beyond a flat story list
- the upstream-of-intent question is explicitly parked as future work
- the docs remain directly usable by agents and humans

## Analyst notes

The important correction is not “add a User Stories section somewhere.”

The important correction is to make Product Intent the parent frame of the whole pre-coding workflow, with user stories as the primary traceable product abstraction inside that frame. The surrounding artifact must also capture actors, goals, narrative shape where needed, boundaries, acceptance criteria, and bounded change cascade.

If this is implemented only as a spec subsection, the redesign fails structurally.

If Product Intent becomes a soft vision document, the redesign also fails. The artifact must remain story-centered and traceable.

## Final adversarial review result

Review outcome: no blocking failures after patch.

Warnings addressed in this version:

- `Mandatory structure candidate` was weak wording; replaced with `Required baseline structure`.
- Acceptance-criteria scope was present but not explicit enough in the artifact template; added story-level scoping language.
- Story status metadata could be mistaken for a custom story format; clarified that statuses are workflow metadata around standard user stories.
- Cascade wording could imply review for every edit; reinforced editorial-vs-semantic distinction and impact-based review.

## Review patch notes

This version incorporates the review feedback by:

- making the internal hierarchy of Product Intent explicit
- adding a narrative-shape / story-map design fork for larger product areas
- strengthening the definition of Product Intent so it cannot be mistaken for a vision document
- bounding cascade cost through editorial-vs-semantic change distinction
- parking upstream sources of product intent as future work
