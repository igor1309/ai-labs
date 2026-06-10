---
date: 2026-06-07
model: claude
description: "Forward tasks for Agonara's BYOA operator-skill product — distribution, versioning, and discovery of the per-role operator skills."
---

# Backlog — BYOA Operator Skills

Forward tasks for the **BYOA operator-skill product**: the per-role skills an
operator loads to drive an Agonara instance (foundations + curator bucket +
student + admin, all implemented). This is distinct from
[`dev-skills.md`](dev-skills.md), which tracks the *agent's own* process and
toolchain skills — agent-process skill work (the adversarial-review skill, the
OpenAPI-automation migration skill, the traceability negative-guarantee, etc.) is
owned there, not here.

Design source of truth:
[`../docs/plans/implemented/byoa-operator-skills.md`](../docs/plans/implemented/byoa-operator-skills.md).

## Guard skill-stated request bodies against contract drift

The operator skills hand-restate field-level request-body rules that the
published OpenAPI contract deliberately leaves untyped. Several of the most
complex request bodies are declared in `docs/api/openapi.yml` as
`type: object, additionalProperties: true` — `NavigationCandidate`,
`QuickCheckCandidate`, `ReadinessCheckCandidate`, `OpenAnswerCheckCandidate`,
`AssessmentCriterionCandidate`, `LearnerStateTargetLink`, and
`LlmCurationSuggestionGeneration` — while the per-role skills carry the real
structure (enum members, `answerKeyOptionIndex` semantics, the topic-vs-period
`scope` discriminator, `maxSuggestions` 1–20, the relationship-kind and
material-reference-kind enums, "at least one of …" preconditions). Because the
contract does not type these, the existing `operatorSkills_shouldOnlyCiteRoutes…`
check cannot catch a skill body diverging from the domain spec or
implementation.

Add an automated tie-back so skill-stated body shapes stay pinned to their source
of truth (the linked Agonara Markdown specs / implementation), not to memory:

- decide the source of truth for each untyped body's field rules;
- add a contract/generation check that fails when a skill documents a field,
  enum value, or constraint absent from (or contradicting) that source;
- cover the bodies the OpenAPI leaves as `additionalProperties: true`, where the
  route-level contract provides no guard.

## Skill discovery, publishing, and packaging

The brief's deferred open question #1 — the operator skills exist in-repo with no
distribution story: how does an operator *find and load* the skill for a job?

- **Packaging / home.** Decide whether skills ship **with the instance** (served
  by the API, versioned with the contract) or as **standalone installables** an
  operator pulls in. The choice shapes where a skill may assume it runs.
- **Versioning surface.** How a skill version is declared and matched to an
  instance/contract version.
- **Discovery / install flow.** How an operator finds the right skill and loads
  it into their agent (marketplace, install command, or instance-served listing).

Design work, not a content skill. Sequence it **after** the `dev-skills.md`
hardening items (the traceability/drift guards, the adversarial-review skill, and
process-gates): packaging decisions are easier to make against a skill set known
correct and drift-guarded.

## Self-describing API — runtime discovery and follow-up hints

Make the instance surface, at runtime and scoped to the caller's role and state,
which operations are available and meaningful next — so an agent does not
re-derive the next step from static skill prose every time. The AgenticOps idea
of CLI command discovery + "follow-up commands" adapted to Agonara's HTTP
substrate; reasoning and open questions in
[`agenticops-affordances.md`](agenticops-affordances.md)
(Idea 1).

- Decide where the affordance lives: an additive `next`/`links` field on
  `accepted` responses (state-aware), typed link relations in the OpenAPI
  contract, or a single discovery endpoint the skill calls once.
- Keep it generated from the route declarations (source of truth), not
  hand-maintained, so it cannot drift the way the untyped request bodies can.
- Honor the same role/visibility boundary the rest of the API enforces — exposing
  "what's next" must not leak state the caller should not see.

Separable from the CLI-vs-HTTP packaging choice (Agonara deliberately chose
skill-over-HTTP); this affordance can be adopted without reversing that. Relates
to "Skill discovery, publishing, and packaging" above, but is an envelope/contract
change rather than a distribution one.

## Formalize "platform owns repeatable processes" as a design principle

State explicitly, in the BYOA design brief
(`docs/plans/implemented/byoa-operator-skills.md`), the principle Agonara already
follows implicitly: repeatable multi-step processes belong in the API/platform so
the agent takes fewer steps and **does not pollute its context with topology
details**, and so topology/component changes happen platform-side without
rewriting agent instructions. Drawn from the AgenticOps platform write-up; see
[`agenticops-affordances.md`](agenticops-affordances.md)
("Cross-cutting principle worth formalizing"). The forward task is to write the
principle into the brief so it guides future "API/platform vs. skill" boundary
decisions.
