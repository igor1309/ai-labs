---
date: 2026-08-03
model: gpt-5.6
description: "Intake brief for separating adversarial-cycle orchestration from Claude and Codex execution profiles, including Luna Max selection."
---

# Adversarial Cycle Runtime Portability Intake

## What I'm Building

A reusable task brief for making `adversarial-cycle` portable across Claude and
Codex. The orchestration process must be separated from runtime-specific
execution configuration, with one default configuration for Claude and one for
Codex. The Codex configuration must support Luna Max as a selectable model.

This intake defines the required outcome and current constraints. It does not
choose the configuration schema, file layout, or implementation mechanism.

## What I'm Touching

The task concerns these process surfaces:

- `.claude/skills/adversarial-cycle/SKILL.md`: orchestration roles, lifecycle,
  review gates, tracking, and completion contract.
- `.claude/skills/adversarial-cycle/evidence-discipline.md`: runtime-independent
  proof requirements used by the Reviewer.
- `~/.claude/commands/codex-judge.md`: the current Claude-oriented Codex review
  entry point invoked by the cycle.
- The Codex native subagent runtime: concrete model selection and reasoning
  effort supplied when agents are spawned.

No application code, tests, or product behavior are in scope.

## Findings

- **Scope:** Fully read the cycle skill, its evidence rules, backlog, DoD note,
  `codex-judge`, and the intake skill. Inspected the installed Codex CLI command
  surface and the current native Codex subagent interface. Did not execute an
  adversarial cycle or a nested Codex review.
- **Pattern evidence:** The cycle contains explicit Claude model assignments,
  one explicit Codex cross-model gate, and no declared runtime-selection or
  caller-override contract.
- The cycle assigns Planner to Opus and Implementer to Sonnet. Its escalation
  policy also names Opus.
- The cycle describes the Codex reviewer as a cross-model gate and requires a
  committed Codex audit for the plan and every implementation step.
- The cycle does not currently declare configuration inputs for selecting the
  Planner, Implementer, Reviewer, or independent review model.
- The installed `codex-cli 0.146.0` recognizes the command and flags used by
  `codex-judge`. This verifies command-shape compatibility only; nested
  execution from a Codex-orchestrated cycle has not been exercised.
- When Codex is the orchestrator, another Codex invocation does not by itself
  provide the cross-vendor property promised by the current cycle description.
- The cycle says accepted review findings return to the owning Planner or
  Implementer. `codex-judge` instead directs its invoker to apply accepted fixes
  and run verification directly.
- Luna Max is a model that Codex can use. It is a concrete model-selection
  requirement for the Codex execution configuration, not a task nickname or a
  persistent agent identity.
- The aligned task requires one runtime-neutral orchestration process and two
  default execution configurations: Claude and Codex. Explicit caller model
  selection is also required.

## Key Constraints

- Preserve the orchestration contract independently of the host runtime:
  Planner, one Implementer per step, a fresh cold Reviewer, review-round caps,
  committed tracker transitions, evidence audits, and terminal receipts.
- Keep runtime-specific model and tool choices outside the shared orchestration
  process.
- Provide a default Claude execution configuration and a default Codex
  execution configuration.
- Allow the Codex configuration to select Luna Max.
- Preserve explicit caller overrides rather than silently replacing an
  unavailable requested model.
- Keep the meaning of the independent review gate accurate for each runtime.
- Resolve the ownership conflict between cycle-routed follow-up fixes and the
  direct-fix behavior of `codex-judge` without weakening the cycle's audit
  trail.
- Intake makes no code or documentation design decision beyond requirements
  explicitly aligned by the user.

## Risks & Unknowns

- Nested `codex exec` is syntactically supported but has not been verified from
  an active Codex-orchestrated cycle.
- A Codex-on-Codex review may satisfy an independent second-pass requirement
  while failing the current cross-model claim.
- Runtime defaults and explicit caller overrides have no documented precedence
  in the current skill.
- The current tracker does not record which runtime configuration or concrete
  models produced each artifact.
- The behavior when a configured model is unavailable is unspecified.
- `codex-judge` is stored as a Claude command outside the cycle skill, making
  its availability and invocation runtime-dependent.
