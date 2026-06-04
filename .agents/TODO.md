---
date: 2026-06-04
model: claude-opus-4-8
description: "Immediate TODO for the .agents folder — decide whether its files become skills"
---

# .agents — Immediate TODO

## Task

Analyse the content that would live in `.agents/` and decide, for each candidate
topic, whether it should become:

- a **skill** (`.claude/skills/<name>/SKILL.md`) — reusable, versioned, visible to CLI
  and web agents, the preferred target per the migration plan;
- a **doc** that stays in `.agents/` — read on demand, but not behavior-gating enough
  to warrant a skill;
- a **`.claude/rules/` entry** — always-loaded or path-scoped behavioral default.

## Inputs

- Migration plan and skill-vs-doc decision criteria:
  [`../docs/agents-md-to-skills-migration.md`](../docs/agents-md-to-skills-migration.md)
- Organization research (include/exclude table, what-belongs-where):
  [`../research/agents-md-organization.md`](../research/agents-md-organization.md)
- Loose source material to triage: `../migrate-to-skills/guides/`, `../research/`,
  and the inline sections still in the root `CLAUDE.md`.

## Output

A short decision note (per candidate: skill / doc / rule, with one-line rationale)
that drives the next change set. An initial set of topic docs already exists; the
remaining triage covers the inline sections still in the root `CLAUDE.md`,
`migrate-to-skills/guides/`, and `research/`.
