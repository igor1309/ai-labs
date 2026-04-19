---
date: 2026-04-19
model: gpt-5
description: "Implementation plan for transitioning My Way notes into transitional skills while keeping the notes as source of truth."
---

# My Way Notes To Skills Transition Plan

## Goal

Transition `docs/my-way/` from note-only guidance to a mixed note-and-skill form, one artifact at a time, while keeping the notes as source of truth during the transition period.

## Execution lock

Worktree required: yes
Expected worktree: `worktrees/my-way`
Expected branch: `my-way`
Preflight check: [x] done

## Scope guardrails

- This plan covers transitional skill extraction only.
- The source notes remain authoritative during the transition.
- Do not rewrite the philosophy of `My Way` while extracting skills.
- Do not collapse multiple artifact responsibilities into one generic skill.
- Do not pretend the skills are a deterministic framework.
- Do not remove or deprecate the original notes until the transition is intentionally closed.

## Task 1 — Establish Transitional ADR Skills

**Objective**: Create the first pair of skills as the reference pattern for the transition.

**Key work items**:
- Create `docs/my-way/skills/adr/adr-drafting/SKILL.md`.
- Create `docs/my-way/skills/adr/adr-review/SKILL.md`.
- Make both skills explicitly transitional and subordinate to `docs/my-way/03-adr/note.md`.
- Encode operational form rather than copying the note verbatim:
  - when the skill should trigger
  - what it should inspect before acting
  - what judgment it should preserve
  - what artifact it should help produce or review
  - what failure modes it should avoid

**Dependencies**:
- Existing ADR note, structure, and example.

**Risks**:
- The skill becomes a rigid template instead of a judgment-support tool.
- Drafting and review concerns collapse into one vague trigger.

**Validation**:
- Read both skills against the ADR note and confirm responsibility separation holds.
- Confirm the skills explicitly treat the note as source of truth during transition.

**Completion signal**:
- Two ADR skills exist and are usable as transitional operationalizations of the ADR note.

## Task 2 — Define Transition Rules For Remaining Artifact Skills

**Objective**: Make the migration pattern explicit so the remaining artifacts can be converted consistently.

**Key work items**:
- Record the transition intent in this plan and keep it updated as new skills are added.
- Use the ADR pair as the baseline extraction pattern for the remaining artifacts:
  - research
  - pre-ADR
  - spec
  - implementation plan
- Decide per artifact whether it needs one skill or a drafting/review split.
- Keep each skill narrowly triggered by a specific thinking mode or artifact responsibility.

**Dependencies**:
- Task 1 pattern established.

**Risks**:
- Later skills drift away from the transitional model.
- Skills are split or merged for convenience instead of responsibility clarity.

**Validation**:
- For each new artifact skill, verify that the trigger and preserved judgment are specific to that artifact.
- Verify that no skill asks one artifact to absorb another artifact's responsibility.

**Completion signal**:
- A repeatable extraction pattern exists for the next artifacts without turning the transition into a framework rewrite.

## Task 3 — Expand Artifact Skills One By One

**Objective**: Convert the remaining `My Way` artifacts incrementally instead of as a bulk rewrite.

**Key work items**:
- Add the next artifact skill only after agreeing on its responsibility boundary.
- Keep each addition reviewable and independently commit-worthy.
- Reuse the operational form:
  - trigger
  - inspect
  - preserved judgment
  - produced artifact or review output
  - failure modes
- Update this plan as each artifact moves from note-only to note-plus-skill.

**Dependencies**:
- Task 2 transition rules.

**Risks**:
- The migration becomes a large undifferentiated batch.
- Artifact boundaries blur as more skills are added.

**Validation**:
- Review each new skill against its source note before moving to the next artifact.
- Confirm the notes remain comprehensible and primary throughout the transition period.

**Completion signal**:
- Each targeted artifact has its own transitional skill or skill pair, added in small reviewable steps.

## Done criteria

- The transition has an explicit plan artifact.
- ADR drafting and review skills exist as the first transitional pair.
- The notes remain the source of truth during the transition.
- Remaining artifact skills can be added incrementally without losing responsibility clarity.
