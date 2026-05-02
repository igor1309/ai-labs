---
title: ADR — Mandatory Structure
date: 2026-04-12
model: gpt-5.5-thinking
description: "ADR artifact mandatory structure."
author: Igor Malyarov
version: 0.0.1
format: structure
---

# ADR — Mandatory Structure

## Front-matter

```yaml
---
date: YYYY-MM-DD
model: <model used>
description: "<one-line summary of the decision>"
---
```

## Sections

### `# ADR-NNN — Title`

Number and short title that names the decision. Use imperative or declarative form.

### `## Executive summary`

Ten lines or fewer. What is decided, why at high level, scope boundary.

### `## Context`

Problem being solved. Constraints that shaped the decision. Reference Product Intent when the decision enables, protects, or constrains an accepted user story. Rejected alternatives (brief).

### `## Decision`

Precise normative statement of what was chosen.

### `## Rules / invariants`

Enforceable statements using MUST / MUST NOT language. Include file names, tag patterns, CI expectations where relevant.

### `## Consequences`

Operational impact. Tradeoffs accepted. Future extension points.

### `## Non-goals`

Explicit exclusions to prevent scope creep.
