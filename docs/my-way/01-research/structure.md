---
title: Research — Mandatory Structure
date: 2026-04-12
model: gpt-5.5-thinking
description: "Research artifact mandatory structure."
author: Igor Malyarov
version: 0.0.1
format: structure
---

# Research — Mandatory Structure

## Front-matter

```yaml
---
date: YYYY-MM-DD
model: <model used>
description: "<concise description of what this research investigates>"
---
```

## Sections

### `# Title`

Short, descriptive title. Not "Research" — name the topic.

### `## Purpose`

One to three sentences. What question or tension does this research address? Why now? Reference Product Intent when the research exists to clarify, protect, or unblock an accepted user story.

### Topical sections

The body is flexible — structure it around the problem, not around a fixed template. Common patterns:

- domain concepts and terminology
- constraints and boundaries
- candidate approaches or technologies
- tradeoffs and risks
- data, schemas, or protocol shapes where relevant
- integration considerations

Use `##` for major topics, `###` for subtopics. Tables and code blocks are encouraged where they add clarity.

### `## Open questions`

Explicit list of unresolved items. Each should be concrete enough to act on in the next stage (usually pre-ADR).

Optional — omit if all questions were resolved during the research.
