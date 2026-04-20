---
date: 2026-04-20
model: gpt-5
description: "Current bucket assignment for the guides and staged skills that still live under migrate-to-skills/guides."
---

# Three Buckets Merge Strategy

## Purpose

This document reflects the current state of `migrate-to-skills/guides/`.

It assigns the guides that still live there into three buckets:

- direct retire-and-map
- fold delta into a public skill
- preserve or stage as a narrow specialized skill

## Bucket 1: Direct Retire and Map

Use this bucket when overlap is very high and the public skill already owns the same trigger and output shape.

### Current items in this bucket

- `tdd-flow` -> `tdd-interactive`
- `tdd-spec-review` -> `tdd-scaffold-review`
- `tdd-essentials` -> `strict-tdd` and `tdd-interactive`

### Rule

- retire the legacy guide only after the destination skill absorbs any small missing behavioral delta

## Bucket 2: Fold the Delta into a Public Skill

Use this bucket when there is real overlap, but the guide still contains operational details that would be lost in a direct retirement.

### Current items in this bucket

- `rx-tdd-essentials` -> likely `tdd-interactive`
- `swift-xctest-testing-master-prompt` -> likely `tdd-scaffold-review`
- `tdd-practitioner` -> likely `strict-tdd` or `tdd-interactive`

### Rule

- keep the public skill as the long-term owner
- move only the delta that changes agent behavior
- do not flatten domain-specific constraints into generic wording

## Bucket 3: Preserve or Stage as a Narrow Skill

Use this bucket when public coverage is weak, the trigger does not actually belong to an existing public skill, or the guide contains repo- or product-specific operating knowledge.

### Current items in this bucket

- `skills/bug-analysis`
- `skills/component-arch-review`
- `skills/executable-specification-scaffolding`
- `skills/feature-spec-protocol`
- `skills/tactical-action-plan-guide`
- `skills/vortex-swift-package-manifest`
- `vortex-seasoned-iOS-developer`

### Notes

- The items already under `migrate-to-skills/guides/skills/` are intentionally staged specialized skills, not temporary leftovers.
- `vortex-seasoned-iOS-developer` should not be staged as-is. If it survives, it should become a narrow Vortex Swift review skill for convention compliance.

## Operating Rule

Merge by capability, not by filename.

For each guide:

1. Confirm which skill truly owns the trigger.
2. Keep only the content that changes agent behavior in a meaningful way.
3. Drop duplicated wording, persona fluff, and generic advice.
4. Retire the source only when the destination is behaviorally complete.

## Recommended Next Area

The remaining TDD cluster is the clearest next area:

- `tdd-flow`
- `tdd-essentials`
- `tdd-practitioner`
- `tdd-spec-review`
- `rx-tdd-essentials`
- `swift-xctest-testing-master-prompt`

It still has the highest overlap density and the highest risk of accidental flattening if handled casually.
