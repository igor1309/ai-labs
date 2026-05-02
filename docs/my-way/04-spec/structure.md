---
title: Spec — Mandatory Structure
date: 2026-04-12
model: gpt-5.5-thinking
description: "Spec artifact mandatory structure."
author: Igor Malyarov
version: 0.0.1
format: structure
---

# Spec — Mandatory Structure

## Front-matter

```yaml
---
date: YYYY-MM-DD
model: <model used>
description: "Spec: <component name and one-line purpose>"
---
```

## Sections

### `# Spec: Component Name (version)`

Name the component. Include version if iterating.

### `## Goal`

One to three sentences. What the component does and who owns it. Reference the ADR that established the architectural decision if applicable, and Product Intent when the spec operationalizes accepted user stories.

### `## Public interface`

Function signatures, input/output shapes. Use code blocks or typed descriptions. Include sub-sections for distinct operations if the interface has multiple entry points.

### `## Behavior rules`

Numbered or grouped rules covering:

- validation
- error handling
- state transitions
- edge cases
- caching behavior (if applicable)
- failure propagation

Each rule should be concrete and testable.

### `## Product intent traceability`

Map behavior rules or scenarios back to accepted Product Intent stories when those stories exist. Omit when the spec is purely technical and no user-facing intent is affected.

### `## Tests (required)`

Enumerated test cases that cover the behavior rules. Group by concern (e.g., "service tests", "pure helper tests"). Each test should map to at least one behavior rule.

### `## Done criteria`

What "finished" means — typically: interface matches spec, all listed tests pass, protocols are owned by client module.
