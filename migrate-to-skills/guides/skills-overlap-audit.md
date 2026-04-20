---
date: 2026-04-20
model: gpt-5
description: "Overlap audit between legacy migrate-to-skills guides and dev-skills/public skills."
---

# Skills Overlap Audit

## Scope

This document compares legacy guides in `migrate-to-skills/guides/` against public skills in `dev-skills/public/` to identify likely overlap in trigger, workflow, and expected output.

The overlap score is a qualitative `0-100` estimate. It is intended to support migration and consolidation decisions, not to claim exact duplication.

## Overlap Results

| guide | matching skill | overlap score | short summary of what overlaps |
|---|---|---:|---|
| `agentic-dev-flow` | `intake` | 78 | Both start with task understanding, reading source material, and establishing scope before execution. |
| `agentic-dev-flow` | `spec-writing` | 70 | Both treat specification as a first-class stage before implementation. |
| `agentic-dev-flow` | `tdd-interactive` | 64 | Both include executable-spec-to-TDD progression as the core delivery loop. |
| `agentic-dev-flow` | `process-gates` | 58 | Both add structured execution discipline around planning, logging, and verified step transitions. |
| `arch-reviewer-sharp` | `arch-spec-review` | 82 | Both review mature architecture artifacts for boundaries, flows, dependencies, risks, and unstated assumptions. |
| `arch-reviewer-sharp` | `arch-reviewer` | 74 | Both are detached architecture critiques focused on clarity, coherence, and rationale. |
| `arch-sketch-reviewer` | `arch-reviewer` | 91 | Nearly the same trigger and goal: review early architecture sketches for intent, coherence, and blind spots. |
| `component-improvement-review-guideline` | `arch-reviewer` | 56 | Both produce structured design critique around cohesion, boundaries, and clarity, though the legacy guide goes deeper into root causes and remediation framing. |
| `debugging-analyst` | `rpi-research` | 38 | Both are investigation-and-report workflows with no direct fix output, but the legacy guide is bug-tracing specific. |
| `executable-specification-scaffolding` | `spec-writing` | 73 | Both define pre-implementation specs around behavior, contracts, and testable rules. |
| `executable-specification-scaffolding` | `tdd-scaffold-review` | 61 | Both care about executable test naming and whether a spec can directly drive tests. |
| `feature-spec-protocol` | `spec-writing` | 77 | Both create structured feature specs with explicit sections and concrete, testable behavior definitions. |
| `feature-spec-protocol` | `discuss` | 49 | Both favor incremental clarification before building, though the legacy guide is stricter and spec-oriented. |
| `manifest-feature-module-playbook` | `swift-package-manifest` | 93 | Both cover static-extension `Package.swift` workflows for adding modules/targets with naming and ordering discipline. |
| `rx-tdd-essentials` | `tdd-interactive` | 66 | Both enforce incremental test-first development; the legacy guide adds Rx reducer/effect-handler-specific patterns. |
| `rx-tdd-essentials` | `strict-tdd` | 54 | Both require behavior-driven minimal implementation from failing tests, but the legacy guide is much more domain-specific. |
| `swift-xctest-testing-master-prompt` | `tdd-scaffold-review` | 68 | Both emphasize precise test naming, behavior-focused tests, and reviewability of XCTest suites. |
| `swift-xctest-testing-master-prompt` | `strict-tdd` | 46 | Partial overlap on TDD/testing discipline, but the legacy guide is broader XCTest style guidance. |
| `tactical-action-plan-guide` | `process-gates` | 71 | Both require atomic, verifiable execution steps with explicit checks before progressing. |
| `tdd-essentials` | `strict-tdd` | 88 | Both define strict RED/GREEN discipline, treat compile errors as not-RED, and require minimal GREEN scope. |
| `tdd-essentials` | `tdd-interactive` | 80 | Both encode cyclical TDD with explicit checkpoints around red, green, commit, and refactor. |
| `tdd-flow` | `tdd-interactive` | 95 | Very strong overlap: same sacred cycle, same stop-at-RED and stop-after-REFACTOR structure. |
| `tdd-flow` | `strict-tdd` | 84 | Both enforce proper RED and minimal GREEN, though `tdd-flow` is more operationally detailed. |
| `tdd-practitioner` | `strict-tdd` | 72 | Both guide feature work through red-green-refactor with minimal implementation principles. |
| `tdd-practitioner` | `tdd-interactive` | 69 | Same core TDD loop, but the public skill adds reviewer gates and stronger process enforcement. |
| `tdd-spec-review` | `tdd-scaffold-review` | 86 | Both review whether test names/spec scaffolds are clear, executable, and free of implementation leakage. |
| `tdd-spec-review` | `spec-writing` | 63 | Both insist specs describe behavior/contracts rather than implementation details. |
| `vortex-seasoned-iOS-developer` | `tdd-scaffold-review` | 52 | Overlap is mostly in XCTest naming and test structure expectations. |
| `vortex-seasoned-iOS-developer` | `strict-tdd` | 35 | Only partial overlap on testing discipline; most of the legacy guide is repo/style-specific Swift guidance. |

## Synthesis

The strongest overlap clusters are:

- Architecture review: `arch-reviewer-sharp`, `arch-sketch-reviewer`
- Spec creation and review: `feature-spec-protocol`, `executable-specification-scaffolding`, `tdd-spec-review`
- Swift package manifest work: `manifest-feature-module-playbook`
- TDD workflow: `tdd-essentials`, `tdd-flow`, `tdd-practitioner`, `rx-tdd-essentials`, `swift-xctest-testing-master-prompt`

The weakest direct coverage in `dev-skills/public/` is:

- Bug-specific structured debugging analysis from `debugging-analyst`
- Rx-specific reducer and effect-handler testing patterns from `rx-tdd-essentials`
- Team- or product-specific Swift/XCTest conventions from `vortex-seasoned-iOS-developer`

## Suggested Merge Strategy

### 1. Direct retire-and-map for very high-overlap guides

Retire the legacy guide and map callers or documentation to the public skill when overlap is `85+` and the public skill covers the same trigger and output shape.

Candidates:

- `arch-sketch-reviewer` -> `arch-reviewer`
- `manifest-feature-module-playbook` -> `swift-package-manifest`
- `tdd-flow` -> `tdd-interactive`
- `tdd-essentials` -> `strict-tdd` and `tdd-interactive`
- `tdd-spec-review` -> `tdd-scaffold-review`

### 2. Fold useful details into the public skill for medium-overlap guides

For overlap in the `60-84` range, keep the public skill as the destination but migrate missing details from the legacy guide before retiring it.

Candidates:

- `arch-reviewer-sharp` -> enrich `arch-spec-review`
- `executable-specification-scaffolding` -> enrich `spec-writing` and `tdd-scaffold-review`
- `feature-spec-protocol` -> enrich `spec-writing`
- `tactical-action-plan-guide` -> enrich `process-gates`
- `rx-tdd-essentials` -> enrich `tdd-interactive`
- `swift-xctest-testing-master-prompt` -> enrich `tdd-scaffold-review`
- `tdd-practitioner` -> enrich `strict-tdd` or `tdd-interactive`

### 3. Preserve as standalone or extract a narrow new skill where public coverage is weak

Do not force-merge low-overlap guides into a public skill that does not really own the trigger.

Candidates:

- `debugging-analyst`: keep standalone or create a dedicated debugging skill
- `vortex-seasoned-iOS-developer`: keep as repo- or product-specific guidance, or split reusable XCTest rules from Vortex-specific rules
- `component-improvement-review-guideline`: either keep separate or extract a focused architectural/code-health review skill

### 4. Merge by capability, not by filename

Use this sequence for each legacy guide:

1. Confirm the public skill owns the same trigger.
2. Move only the delta that changes agent behavior in a useful way.
3. Drop wording that is generic, duplicated, or merely stylistic.
4. Retire the legacy guide only after the public skill absorbs the missing behavioral signal.

### 5. Treat the TDD cluster as a consolidation project

The TDD guides are the densest overlap area and should be merged intentionally:

- Keep `strict-tdd` for hard behavioral constraints
- Keep `tdd-interactive` for the reviewer-gated operating workflow
- Fold reusable XCTest and Rx test-pattern details into references or companion docs
- Retire overlapping legacy TDD guides after their unique rules are absorbed
