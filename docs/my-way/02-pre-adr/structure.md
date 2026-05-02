---
title: Pre-ADR — Mandatory Structure
date: 2026-04-12
model: gpt-5.5-thinking
description: "Pre-ADR artifact mandatory structure."
author: Igor Malyarov
version: 0.0.1
format: structure
---

# Pre-ADR — Mandatory Structure

## Front-matter

```yaml
---
date: YYYY-MM-DD
model: <model used>
description: "<concise description of the architectural question being explored>"
---
```

## Sections

### `# Title`

Short, descriptive title that names the architectural question. Not "Pre-ADR" — name the decision space.

### `## Context`

What problem or tension is driving this exploration? What constraints are already known? Reference Product Intent and research artifacts if they exist and materially shape the decision space.

### `## Options considered`

At least two candidate directions. For each:

- **Description**: what the option entails
- **Tradeoffs**: what it enables and what it costs
- **Product intent fit**: how the option supports, constrains, or risks accepted user stories when relevant
- **Risks**: what could go wrong

### `## Emerging direction`

Which option appears strongest and why. This is provisional — it is not a commitment.

### `## Provisional boundaries`

Tentative ownership, responsibility, and coupling decisions. Mark anything that is still unstable.

### `## Open questions`

Explicit list of items that must be resolved before an ADR can be written. Each should be concrete and bounded.
