---
date: 2026-04-19
model: gpt-5
description: "Implementation plan for transitioning My Way notes into skills with explicit first-class promotion by artifact."
---

# My Way Notes To Skills Transition Plan

## Goal

Transition `docs/my-way/` from note-only guidance to a mixed note-and-skill form, one artifact at a time, while keeping the notes as source of truth unless a skill is explicitly promoted to first-class.

## Execution lock

Worktree required: yes
Expected worktree: `worktrees/my-way`
Expected branch: `my-way`
Preflight check: [x] done

## Scope guardrails

- This plan covers skill extraction and explicit promotion from transitional to first-class status.
- Source notes remain authoritative unless a skill has been explicitly promoted.
- Do not rewrite the philosophy of `My Way` while extracting skills.
- Do not collapse multiple artifact responsibilities into one generic skill.
- Do not pretend the skills are a deterministic framework.
- Do not remove or deprecate the original notes until the transition is intentionally closed, even after promotion.

## Task 1 — Establish And Promote ADR Skills

**Objective**: Create the first pair of skills as the reference pattern for the transition and promote them to first-class once they are self-sufficient.

**Key work items**:
- Create `docs/my-way/skills/adr/adr-drafting/SKILL.md`.
- Create `docs/my-way/skills/adr/adr-review/SKILL.md`.
- Initially extract both skills from `docs/my-way/03-adr/note.md` as operational form.
- Encode operational form rather than copying the note verbatim:
  - when the skill should trigger
  - what it should inspect before acting
  - what judgment it should preserve
  - what artifact it should help produce or review
  - what failure modes it should avoid
- Remove the `note.md` dependency once both skills are operationally sufficient on their own.

**Dependencies**:
- Existing ADR note, structure, and example.

**Risks**:
- The skill becomes a rigid template instead of a judgment-support tool.
- Drafting and review concerns collapse into one vague trigger.

**Validation**:
- Read both skills against the ADR note and confirm responsibility separation holds.
- Confirm both skills can be used correctly without consulting `docs/my-way/03-adr/note.md`.

**Completion signal**:
- Two ADR skills exist as self-sufficient, first-class skills.

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

## Task 3 — Establish And Promote Spec Skills

**Objective**: Create the spec pair as self-sufficient, first-class skills using the ADR extraction pattern.

**Key work items**:
- Create `docs/my-way/skills/spec/spec-drafting/SKILL.md`.
- Create `docs/my-way/skills/spec/spec-review/SKILL.md`.
- Extract both skills from `docs/my-way/04-spec/note.md` as operational form.
- Keep the distinction explicit:
  - spec operationalizes ADRs into behavior and contracts
  - spec is not ADR
  - spec is not implementation plan
- Make both skills self-sufficient without relying on `docs/my-way/04-spec/note.md`.

**Dependencies**:
- Task 1 ADR pattern.
- Existing spec note, structure, and example.

**Risks**:
- The spec skills absorb architectural decision work that should remain in ADR.
- The spec skills absorb execution detail that should remain in implementation planning.

**Validation**:
- Read both skills against the spec note and confirm the behavior/contract boundary holds.
- Confirm both skills can be used correctly without consulting `docs/my-way/04-spec/note.md`.

**Completion signal**:
- Two spec skills exist as self-sufficient, first-class skills.

## Task 4 — Establish And Promote Implementation-Plan Skills

**Objective**: Create the implementation-plan pair as self-sufficient, first-class skills using the ADR/spec extraction pattern.

**Key work items**:
- Create `docs/my-way/skills/implementation-plan/implementation-plan-drafting/SKILL.md`.
- Create `docs/my-way/skills/implementation-plan/implementation-plan-review/SKILL.md`.
- Extract both skills from `docs/my-way/05-implementation-plan/note.md` as operational form.
- Keep the distinction explicit:
  - implementation plan organizes execution from an accepted spec
  - implementation plan is not ADR
  - implementation plan is not spec
- Make both skills self-sufficient without relying on `docs/my-way/05-implementation-plan/note.md`.

**Dependencies**:
- Task 1 ADR pattern.
- Task 3 spec pair established.
- Existing implementation-plan note, structure, and example.

**Risks**:
- The implementation-plan skills absorb behavioral clarification that should remain in spec.
- Task decomposition quietly redesigns architecture or contracts.

**Validation**:
- Read both skills against the implementation-plan note and confirm the execution boundary holds.
- Confirm both skills can be used correctly without consulting `docs/my-way/05-implementation-plan/note.md`.

**Completion signal**:
- Two implementation-plan skills exist as self-sufficient, first-class skills.

## Task 5 — Establish And Promote Pre-ADR Skills

**Objective**: Create the pre-ADR pair as self-sufficient, first-class skills using the same extraction pattern while preserving its exploratory role.

**Key work items**:
- Create `docs/my-way/skills/pre-adr/pre-adr-drafting/SKILL.md`.
- Create `docs/my-way/skills/pre-adr/pre-adr-review/SKILL.md`.
- Extract both skills from `docs/my-way/02-pre-adr/note.md` as operational form.
- Keep the distinction explicit:
  - pre-ADR shapes the solution space before commitment
  - pre-ADR is not ADR
  - pre-ADR is not spec
  - pre-ADR is not implementation plan
- Make both skills self-sufficient without relying on `docs/my-way/02-pre-adr/note.md`.

**Dependencies**:
- Task 1 ADR pattern.
- Existing pre-ADR note, structure, and example.

**Risks**:
- The pre-ADR skills become too commitment-heavy and collapse into ADR.
- The pre-ADR skills repeat research without moving into architectural solution shaping.

**Validation**:
- Read both skills against the pre-ADR note and confirm the exploratory boundary holds.
- Confirm both skills can be used correctly without consulting `docs/my-way/02-pre-adr/note.md`.

**Completion signal**:
- Two pre-ADR skills exist as self-sufficient, first-class skills.

## Task 6 — Expand Remaining Artifact Skills One By One

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
- Task 3 spec pair established.
- Task 4 implementation-plan pair established.
- Task 5 pre-ADR pair established.

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
- ADR drafting and review skills exist as the first promoted first-class pair.
- Spec drafting and review skills exist as the next promoted first-class pair.
- Implementation-plan drafting and review skills exist as the next promoted first-class pair.
- Pre-ADR drafting and review skills exist as the next promoted first-class pair.
- Notes remain the source of truth for artifacts that have not yet been promoted.
- Remaining artifact skills can be added incrementally without losing responsibility clarity.
