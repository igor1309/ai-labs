---
date: 2026-04-19
author: Igor Malyarov
description: "Review-as-enforcement: using review skills as a proxy for hard constraint enforcement"
---

# Review as Enforcement

## Problem

Agent instruction files (CLAUDE.md, AGENTS.md) cannot reliably enforce constraints. However strongly worded a rule is — "MUST", "NEVER", "BLOCKING" — agents routinely ignore it. The only true hard enforcement layer is hooks (shell commands that gate tool calls), but hooks are blunt instruments suited to a narrow set of mechanical checks, not nuanced process or convention rules.

This creates a gap: rules exist, but compliance is probabilistic.

## The feedback loop

A review skill that references the same rules the process/convention skills define creates a closed enforcement loop:

1. **Skill defines the rule** — e.g., "test naming pattern is `test_<method>_should<Assertion>_on<Condition>`."
2. **Agent works** — may or may not follow the rule during implementation.
3. **Review skill checks against the same rule** — finds violations post-hoc, references the specific skill/rule violated, and produces actionable findings.
4. **Agent fixes violations** — before the work is declared complete.

This is not hard enforcement. The agent can still skip the review, or ignore review findings. But it is a structured second pass that catches drift — analogous to a linter or a code review checklist, not a compile-time guarantee.

## Why this works better than strong wording alone

- **Separation of concerns**: the working agent focuses on the task; the review pass focuses on compliance. Splitting these reduces the cognitive load that causes rule-skipping.
- **Same source of truth**: both the process skill and the review skill reference the same canonical rules. No drift between "what was defined" and "what is checked."
- **Actionable output**: review findings point to specific violations with file:line references and concrete fixes, not vague reminders to "follow AGENTS.md."
- **Composable**: different review skills can check different rule sets — Swift conventions, TDD discipline, commit hygiene — without bloating a single instruction file.

## Enforcement hierarchy

From strongest to weakest:

1. **Hooks** — mechanical, tool-gating, non-bypassable. Use for truly non-negotiable gates (e.g., prevent push to trunk, block commits without test pass).
2. **Review-as-enforcement** — structured post-hoc check using skills. Catches most drift. Requires the agent (or user) to invoke the review.
3. **Instruction file rules** — always-loaded context. Probabilistic compliance. Degrades as instruction count grows.
4. **Hope** — no enforcement mechanism. The agent either remembers or doesn't.

## Implication for AGENTS.md organization

This model supports moving detailed rules out of AGENTS.md and into skills. The root instruction file becomes a slim wiring document; skills carry the knowledge; review skills close the enforcement loop. The net effect is better compliance with fewer always-loaded tokens.
