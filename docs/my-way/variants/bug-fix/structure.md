---
title: Bug Fix — Mandatory Structure
date: 2026-04-12
author: Igor Malyarov
version: 0.0.1
format: structure
---

# Bug Fix — Mandatory Structure

## Front-matter

```yaml
---
date: YYYY-MM-DD
model: <model used>
description: "Bug fix: <one-line defect summary>"
---
```

## Sections

### `# Bug Fix: Short Defect Title`

Name the defect, not the component. The title should make the symptom recognizable at a glance.

### `## Symptom`

One to three sentences. What was observed, where, and under what conditions. No speculation about cause.

### `## Reproduction`

Concrete steps, inputs, environment, and the observed actual outcome. If reproduction is partial or intermittent, say so explicitly and describe the conditions under which the defect has been seen.

### `## Root cause`

Why the system diverges from expected behavior. Distinguish the underlying cause from the visible failure. If the cause is not yet known, mark this section as "under investigation" and list the leading hypotheses.

### `## Fix strategy`

The narrowest change that addresses the cause. Include:

- what code or contract is changed
- what is intentionally left unchanged
- known risks of the change
- alternatives considered and why they were rejected

### `## Regression test`

The automated check that fails on the unfixed system and passes after the fix. Best practice: write this test first, observe it fail, then apply the fix. Reference the test file or describe the assertion shape.

### `## Escalation (if any)`

Optional. Include only when the defect reveals deeper issues:

- expected behavior was never defined → link to the spec update
- the defect violates an invariant no ADR covers → link to the pre-ADR
- the fix would require new boundaries → link to the full pre-coding sequence

Omit this section when no escalation is needed.

### `## Done criteria`

What "fixed" means — typically: regression test passes, root cause is recorded, no scope creep beyond the defect, any escalations are filed.
