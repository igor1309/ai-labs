---
date: 2026-04-20
model: gpt-5
description: "Current overlap audit for the guides and staged skills that still live under migrate-to-skills/guides."
---

# Skills Overlap Audit

## Scope

This document reflects the current contents of `migrate-to-skills/guides/`.

It covers:

- staged specialized skills under `migrate-to-skills/guides/skills/`
- remaining legacy guides still at the top level of `migrate-to-skills/guides/`

The overlap score is a qualitative `0-100` estimate based on trigger, workflow, and expected output shape.

## Current Layout

### Staged specialized skills

- `skills/bug-analysis`
- `skills/component-arch-review`
- `skills/executable-specification-scaffolding`
- `skills/feature-spec-protocol`
- `skills/tactical-action-plan-guide`
- `skills/vortex-swift-package-manifest`

### Remaining top-level guides

- `rx-tdd-essentials`
- `swift-xctest-testing-master-prompt`
- `tdd-essentials`
- `tdd-flow`
- `tdd-practitioner`
- `tdd-spec-review`
- `vortex-seasoned-iOS-developer`

## Staged Skills

These items still overlap public skills, but the current recommendation is to keep them as specialized staged skills rather than flatten them into `dev-skills/public/`.

| current guide | matching skill | overlap score | short summary of what overlaps |
|---|---|---:|---|
| `skills/bug-analysis` | `rpi-research` | 38 | Both are structured investigation workflows, but `bug-analysis` is specifically for execution tracing, hypotheses, and evidence-backed debugging. |
| `skills/component-arch-review` | `arch-reviewer` | 56 | Both critique structure and design quality, but `component-arch-review` is more root-cause- and remediation-driven for component health. |
| `skills/executable-specification-scaffolding` | `spec-writing` | 73 | Both shape pre-implementation specifications, but the staged skill is stronger on collaborator contracts, orchestration, and executable-spec discipline. |
| `skills/executable-specification-scaffolding` | `tdd-scaffold-review` | 61 | Both care about whether a spec can drive tests, but the staged skill focuses on authoring the executable spec, not reviewing a test-name scaffold. |
| `skills/feature-spec-protocol` | `spec-writing` | 77 | Both produce feature specs, but the staged skill keeps the ordered one-question-at-a-time clarification protocol and explicit spec skeleton. |
| `skills/tactical-action-plan-guide` | `process-gates` | 71 | Both require small verifiable steps, but the staged skill is specifically about turning one approved finding into a machine-readable refactoring plan. |
| `skills/vortex-swift-package-manifest` | `swift-package-manifest` | 93 | Both operate on `Package.swift`, but the staged skill preserves Vortex-specific module conventions, dependency defaults, and human-in-the-loop rules. |

## Remaining Top-Level Guides

These are the guides that still need a decision.

| current guide | matching skill | overlap score | short summary of what overlaps |
|---|---|---:|---|
| `rx-tdd-essentials` | `tdd-interactive` | 66 | Both enforce incremental test-first delivery, but the legacy guide adds Rx reducer and effect-handler specificity. |
| `rx-tdd-essentials` | `strict-tdd` | 54 | Both insist on failing-tests-first discipline, but the legacy guide is much more domain-specific. |
| `swift-xctest-testing-master-prompt` | `tdd-scaffold-review` | 68 | Both care about precise, behavior-oriented tests, but the legacy guide is broader XCTest craft guidance. |
| `swift-xctest-testing-master-prompt` | `strict-tdd` | 46 | There is partial testing-discipline overlap, but the legacy guide is not mainly a TDD operating skill. |
| `tdd-essentials` | `strict-tdd` | 88 | Both define strict RED/GREEN rules, treat compile failures as not-RED, and require the smallest GREEN. |
| `tdd-essentials` | `tdd-interactive` | 80 | Both describe iterative TDD flow, but `tdd-essentials` is less reviewer-gated and more rules-focused. |
| `tdd-flow` | `tdd-interactive` | 95 | Very strong overlap on the same sacred cycle, stop conditions, and red-green-refactor progression. |
| `tdd-flow` | `strict-tdd` | 84 | Both enforce proper RED and minimal GREEN, though `tdd-flow` is more operational and sequence-driven. |
| `tdd-practitioner` | `strict-tdd` | 72 | Both guide feature work through red-green-refactor, but the legacy guide is more general-practitioner coaching. |
| `tdd-practitioner` | `tdd-interactive` | 69 | Both share the same core loop, but the public skill is more explicit about reviewer gates and workflow control. |
| `tdd-spec-review` | `tdd-scaffold-review` | 86 | Both review whether an executable spec is clear enough to drive tests without implementation leakage. |
| `tdd-spec-review` | `spec-writing` | 63 | Both care about behavioral precision, but `tdd-spec-review` is a review skill, not a drafting skill. |
| `vortex-seasoned-iOS-developer` | `tdd-scaffold-review` | 52 | Overlap is mostly in XCTest naming and structure expectations. |
| `vortex-seasoned-iOS-developer` | `strict-tdd` | 35 | Only partial overlap on test discipline; most of the guide is Vortex-specific Swift, SwiftUI, and XCTest conventions. |

## Current Readout

### Strongest remaining merge candidates

- `tdd-flow` -> `tdd-interactive`
- `tdd-essentials` -> `strict-tdd` and `tdd-interactive`
- `tdd-spec-review` -> `tdd-scaffold-review`

### Likely medium-overlap candidates

- `rx-tdd-essentials`
- `swift-xctest-testing-master-prompt`
- `tdd-practitioner`

### Items that should stay specialized

- everything already under `migrate-to-skills/guides/skills/`
- `vortex-seasoned-iOS-developer`, if it becomes anything, should become a narrow Vortex Swift review skill rather than a broad authoring persona
