---
date: 2026-05-02
model: gpt-5.5-thinking
description: "Product Intent mandatory structure for story-centered product intent artifacts."
---

# Product Intent — Mandatory Structure

## Front-matter

```yaml
---
date: YYYY-MM-DD
model: <model used>
description: "Product intent: <product area and user-facing objective>"
---
```

## Sections

### `# Product Intent: Product Area`

Name the product area or capability being framed. The title should identify the user-facing work, not the implementation surface.

### `## Product outcome`

One to three sentences describing the user outcome this work exists to create or protect. Keep this concrete; avoid broad vision language.

### `## Actors`

The user or stakeholder types whose needs shape the work. Include only actors that materially affect stories, acceptance criteria, or boundaries.

### `## User stories`

Accepted stories in recognizable form:

```text
As a <type of user>,
I want <some goal / capability>,
so that <some reason / outcome>.
```

Each story should have a stable identifier, acceptance signal, and status. For larger product areas, group stories by user activity, workflow step, or narrative flow instead of leaving a long flat list.

### `## Acceptance signals`

How satisfaction of each accepted story will be recognized. This may be acceptance criteria, confirmation scenarios, customer-visible checks, or other evidence that the capability meets the intended outcome.

### `## Boundaries and non-goals`

What this product intent does not promise. Include adjacent capabilities that are intentionally excluded so downstream artifacts do not infer them.

### `## Open product questions`

Product-level uncertainties that remain unresolved. Keep these distinct from technical unknowns, which belong in research, pre-ADR, ADR, spec, or implementation-plan artifacts.

### `## Downstream traceability`

Map accepted stories to downstream artifacts when those artifacts exist.

Typical columns:

- Story
- Research
- Pre-ADR / ADR
- Spec
- Implementation plan
- Code / tests

Keep this table compact. It should preserve accountability, not become a duplicate index of every file touched.

### `## Change review`

Record meaningful changes to accepted product intent and the downstream review they require. Editorial cleanup should not trigger full-chain review; changes that alter user capability, outcome, actor, acceptance signal, or boundary should trigger impact review.
