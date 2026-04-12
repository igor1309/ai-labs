---
title: Implementation Plan — Mandatory Structure
date: 2026-04-12
author: Igor Malyarov
version: 0.0.1
format: structure
---

# Implementation Plan — Mandatory Structure

## Front-matter

```yaml
---
date: YYYY-MM-DD
model: <model used>
description: "Implementation plan: <what is being built and high-level objective>"
---
```

## Sections

### `# Title`

Name the work being planned. Reference the spec or ADRs being implemented.

### `## Goal`

What the plan delivers and why. Brief — one to three sentences.

### `## Execution lock`

Required fields:

```
Worktree required: yes | no
Expected worktree: <path or pattern>
Expected branch: <name or pattern>
Preflight check: [ ] done
```

### `## Scope guardrails`

Explicit exclusions — what is out of scope for this plan. Reference ADR non-goals where applicable.

### `## ADR traceability matrix`

_Optional — include when the plan implements ADR invariants._

Table mapping each ADR invariant to the phase that establishes it.

### Phases / tasks

Repeating section — one per delivery slice. Use `## Phase N — Name` or `## Task N — Name`.

Each phase contains:

- **Objective**: what this phase accomplishes
- **Key work items**: concrete steps
- **Dependencies**: what must be complete before this phase starts
- **Risks**: what could go wrong in this phase
- **Validation**: how correctness is checked (targeted tests + full suite)
- **Completion signal**: observable outcome that proves the phase is done

### `## Done criteria`

What "finished" means for the entire plan. Typically: all phases complete, full test suite green, build passes, spec fully implemented.
