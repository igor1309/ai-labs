---
date: 2026-08-24
model: gpt-5
description: "Move generic skill-business conventions into the renamed skill-conventions skill"
---

# Rename skill-review to skill-conventions and centralize skill business

## Problem

Generic skill-business rules are split between the published `skill-review`
skill in `dev-skills` and the repository-local `ios.config` skill-conventions
skill. The split duplicates review and conventions guidance and makes the
global skill depend on a project-specific implementation.

The published skill should be the single owner of reusable skill-business
knowledge. Fora/iOS-specific instructions belong in that repository's
`AGENTS.md`, path rules, hooks, and local domain skills.

## Proposed direction

Rename the published `skill-review` skill to `skill-conventions`. Make it own
the reusable skill-business lifecycle:

- skill taxonomy and boundaries;
- skill quality review and findings format;
- descriptions, frontmatter, progressive disclosure, and folder shape;
- hook/skill/script ownership and failure observability;
- definitions of done, backlogs, ADRs, and research references;
- actionable review-to-improvement workflow.

Keep review and improvement as explicit modes. Review reports findings and a
change plan; edits require an explicit implementation request.

## Migration

1. Rename `public/skill-review/` to `public/skill-conventions/`, update
   frontmatter, and preserve the review method and its behavior.
2. Move reusable conventions from `ios.config` into the renamed published
   skill; keep the detailed review method in `SKILL.md` or a gated reference.
3. Classify the remaining `ios.config` content. Move Fora/iOS-specific policy
   to local `AGENTS.md`, path rules, hooks, or domain skills.
4. Remove the repository-local `skill-conventions` and any repository-local
   `skill-review` skill from `ios.config`.
5. Update marketplace metadata, catalog entries, cross-references, and
   version fields for the rename.
6. Do not edit generated plugin caches; publish from the source repository.

## Acceptance checks

- `dev-skills` publishes exactly one canonical `skill-conventions` skill for
  reusable skill-business work.
- `ios.config` contains neither a local `skill-conventions/SKILL.md` nor a
  local `skill-review/SKILL.md`.
- Fora/iOS-specific rules remain available through local `AGENTS.md`, path
  rules, hooks, or domain skills.
- The review axes, failure-observability requirement, and improvement workflow
  have one authoritative reusable definition.
- A planted-defect skill produces the expected findings, and a clean skill
  produces no findings.
- Review output includes an actionable change plan without mutating files
  unless implementation was explicitly requested.
- Marketplace metadata, catalog links, and skill versions remain consistent
  after the consolidation.

## Non-goals

- Do not change the review criteria as part of a structural consolidation.
- Do not merge session-specific `postmortem` work into the skill review method.
- Do not move Fora/iOS application-domain skills into `dev-skills`.
