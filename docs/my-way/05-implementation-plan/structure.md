---
title: Implementation Plan — Mandatory Structure
date: 2026-04-12
author: Igor Malyarov
version: 0.0.2
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

### `## Execution mode`

Required fields:

```
Mode: auto-continue | human-review-gated
Human review between tasks: yes | no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push | push after task | push at closeout
```

`auto-continue` means the implementer proceeds after green gates and local commit. `human-review-gated` means the implementer stops for approval at the plan-defined checkpoints.

### `## Execution lock`

Required fields:

```
Worktree mode: create new | reuse existing | none
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

### `## Final closeout`

Required fields:

```
Final gates: <commands/checks>
Archive plan: move to docs/plans/implemented/ or <project>/docs/plans/implemented/
Commit archive move: yes
Push/PR: follow push policy
```
