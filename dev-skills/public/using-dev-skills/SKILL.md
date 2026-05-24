---
name: using-dev-skills
author: Igor Malyarov
version: "1.0.1"
description: Use when starting any conversation - maps the dev-skills toolkit by ladder (TDD, spec, review, planning, release, Swift) so the right skill is invoked before any response or action.
trigger: at the start of any task before exploring the repo, writing code, or answering a codebase-specific question
---

# Using dev-skills

Entry map for the local `dev-skills` toolkit. It does not prescribe a methodology; it groups skills by the input they apply to so the right one can be invoked.

## Ladders

Each ladder is a cluster of skills that apply to the same artifact or phase. Use the input you have to pick the ladder; invoke the matching skill via the `Skill` tool.

### TDD ladder
For test-first work. Applies on a list of test names to evaluate, a failing test to drive, or a request for RED/GREEN discipline.

### Spec ladder
For going from a vague feature ask to a reviewable contract. Applies on a feature request, a component boundary to define, or a service spec needing explicit collaborator boundaries.

### Architecture review ladder
For reviewing design or implementation against architectural intent. Applies on a design doc PR, an architecture spec, a sketch of system flow, an implemented component up for critique, or a REST contract change.

### Debugging ladder
For investigating broken behavior. Applies on a bug report, a stack trace, or the need to trace execution before changing code.

### Planning ladder
For aligning before code is written. Applies on a new task with unclear scope, an exploration request, a review finding that needs an implementation plan, or a gate before commit/push.

### Release / CI ladder
For shipping work. Applies on ADRs, per-unit releases, PR CI monitoring, or docker compose / deploy changes.

### Swift / iOS ladder
For Swift packages and iOS. Applies on composition root wiring, protocol ownership, `Package.swift`, time-dependent tests, `xcodebuild` runs, or simulator install / settings tasks.

### Skill maintenance
For the toolkit itself. Applies on the first message of a session (replay-before-execute) or on evaluating an existing skill.

## Ladder selection cues

| You have… | Ladder |
|---|---|
| A bug report or stack trace | Debugging |
| A vague feature request | Spec |
| An approved review finding | Planning |
| A test name list or RED/GREEN ask | TDD |
| A PR open and CI running | Release / CI |
| A design doc or arch sketch in review | Architecture review |
| A Swift package or iOS simulator task | Swift / iOS |
| None of the above | Ask one clarifying question, then re-check |

## What this skill is not

- Not a methodology. Ladders compose per task; there is no required sequence.
- Not a catalog. It points to ladders; the invoked skill governs.
- Not exhaustive. Skills outside any ladder are discoverable via their own descriptions; new skills land outside any ladder before they cluster.
