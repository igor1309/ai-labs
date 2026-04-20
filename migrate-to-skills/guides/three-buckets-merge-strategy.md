---
date: 2026-04-20
model: gpt-5
description: "Three-bucket strategy for merging legacy migrate-to-skills guides into dev-skills/public skills."
---

# Three Buckets Merge Strategy

## Purpose

This note captures the recommended three-bucket approach for consolidating legacy guides from `migrate-to-skills/guides/` into `dev-skills/public/`.

## Bucket 1: Direct Retire and Map

Use this bucket when overlap is very high and the public skill already owns the same trigger and output shape.

- Retire the legacy guide.
- Map callers, docs, or migration notes to the public skill.
- Do this only when the public skill already covers the practical behavior, not just the general topic.

Typical threshold:

- `85+` overlap

Examples:

- `arch-sketch-reviewer` -> `arch-reviewer`
- `manifest-feature-module-playbook` -> `swift-package-manifest`
- `tdd-flow` -> `tdd-interactive`
- `tdd-spec-review` -> `tdd-scaffold-review`

## Bucket 2: Fold the Delta into the Public Skill

Use this bucket when there is clear overlap, but the legacy guide still contains practical details that would be lost in a direct retirement.

- Keep the public skill as the long-term destination.
- Extract only the missing behavioral signal from the legacy guide.
- Remove duplicated wording, generic advice, and style-only text.
- Retire the legacy guide only after the public skill has absorbed the useful delta.

Typical threshold:

- `60-84` overlap

Examples:

- `arch-reviewer-sharp` -> enrich `arch-spec-review`
- `feature-spec-protocol` -> enrich `spec-writing`
- `executable-specification-scaffolding` -> enrich `spec-writing` and `tdd-scaffold-review`
- `tactical-action-plan-guide` -> enrich `process-gates`
- `rx-tdd-essentials` -> enrich `tdd-interactive`

## Bucket 3: Preserve or Split Out a Narrow Skill

Use this bucket when public coverage is weak, the trigger does not really match an existing public skill, or the guide contains repo- or product-specific knowledge.

- Keep the legacy guide for now, or
- Split out a new narrow skill that clearly owns the capability.

Do not force-merge these into a public skill just because the topics sound adjacent.

Typical threshold:

- `<60` overlap

Examples:

- `debugging-analyst`
- `component-improvement-review-guideline`
- `vortex-seasoned-iOS-developer`

## Operating Rule

Merge by capability, not by filename.

For each legacy guide:

1. Confirm which public skill truly owns the trigger.
2. Decide which bucket applies.
3. Move only the content that changes agent behavior in a meaningful way.
4. Retire the legacy guide only after the destination skill is behaviorally complete.

## Recommended Starting Point

Start with the TDD cluster first.

It has the highest overlap density and the clearest consolidation path:

- Keep `strict-tdd` for hard constraints.
- Keep `tdd-interactive` for the reviewer-gated workflow.
- Move reusable XCTest and Rx testing patterns into references or companion docs.
- Retire overlapping legacy TDD guides after the missing details are absorbed.
