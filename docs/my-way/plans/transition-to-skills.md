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
  - product intent
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

## Task 3 — Establish And Promote Research Skill

**Objective**: Create a single research skill as a self-sufficient, first-class artifact without forcing an artificial drafting/review split.

**Key work items**:
- Create `docs/my-way/skills/research/SKILL.md`.
- Extract the skill from `docs/my-way/01-research/note.md` as operational form.
- Keep the distinction explicit:
  - research explores the problem space
  - research is not pre-ADR
  - research is not ADR
  - research is not spec
  - research is not implementation plan
- Keep lightweight review inside the skill as gap surfacing and open-question marking rather than as a separate adversarial review skill.
- Make the skill self-sufficient without relying on `docs/my-way/01-research/note.md`.

**Dependencies**:
- Existing research note, structure, and example.

**Risks**:
- The skill drifts into solution commitment too early.
- The skill becomes too loose and loses decision value.
- A forced split would over-formalize the earliest exploratory layer.

**Validation**:
- Read the skill against the research note and confirm the problem-space boundary holds.
- Confirm the skill can be used correctly without consulting `docs/my-way/01-research/note.md`.

**Completion signal**:
- A single research skill exists as a self-sufficient, first-class skill.

## Task 4 — Establish And Promote Spec Skills

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

## Task 5 — Establish And Promote Implementation-Plan Skills

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

## Task 6 — Establish And Promote Pre-ADR Skills

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

## Task 7 — Expand Remaining Artifact Skills One By One

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
- Task 3 research skill established.
- Task 4 spec pair established.
- Task 5 implementation-plan pair established.
- Task 6 pre-ADR pair established.

**Risks**:
- The migration becomes a large undifferentiated batch.
- Artifact boundaries blur as more skills are added.

**Validation**:
- Review each new skill against its source note before moving to the next artifact.
- Confirm the notes remain comprehensible and primary throughout the transition period.

**Completion signal**:
- Each targeted artifact has its own transitional skill or skill pair, added in small reviewable steps.

## Task 8 — Establish Product Intent Layer And Skills

**Objective**: Add Product Intent as the story-centered parent artifact above the existing pre-coding chain.

**Key work items**:
- Create `docs/my-way/00-product-intent/note.md`.
- Create `docs/my-way/00-product-intent/structure.md`.
- Create `docs/my-way/00-product-intent/example.md`.
- Create `docs/my-way/skills/product-intent/product-intent-drafting/SKILL.md`.
- Create `docs/my-way/skills/product-intent/product-intent-review/SKILL.md`.
- Update downstream artifact structures and skills so research, pre-ADR, ADR, spec, and implementation plan can reference accepted Product Intent without absorbing its responsibility.
- Update lightweight variant paths so minor features can use compact story references and bug fixes escalate to Product Intent only when accepted user intent is missing, ambiguous, or changing.

**Dependencies**:
- Product Intent directional handoff.
- Existing My Way artifact structures and skills.

**Risks**:
- Product Intent drifts into broad product vision or PRD work.
- User stories become metadata instead of the artifact's center.
- Downstream artifacts start duplicating Product Intent instead of tracing to it.

**Validation**:
- Confirm Product Intent files use required Markdown front matter and exactly one `#` title.
- Confirm Product Intent skills preserve story centrality and boundary discipline.
- Confirm downstream structures mention Product Intent only where it governs or traces accepted user stories.

**Completion signal**:
- Product Intent exists as a first-class My Way artifact layer with drafting/review skills and downstream traceability guidance.

## Done criteria

- The transition has an explicit plan artifact.
- A single research skill exists as the first promoted first-class research artifact.
- ADR drafting and review skills exist as the first promoted first-class pair.
- Spec drafting and review skills exist as the next promoted first-class pair.
- Implementation-plan drafting and review skills exist as the next promoted first-class pair.
- Pre-ADR drafting and review skills exist as the next promoted first-class pair.
- Product Intent note, structure, example, drafting skill, and review skill exist as the story-centered parent layer.
- Notes remain the source of truth for artifacts that have not yet been promoted.
- Remaining artifact skills can be added incrementally without losing responsibility clarity.
