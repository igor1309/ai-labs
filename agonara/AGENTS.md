---
date: 2026-06-07
model: gpt-5
description: "Agent instructions for the Agonara project"
---

# AGENTS

Agonara aims to follow the My Way approach.

Use the repository-level instructions as the baseline, and use `../docs/my-way/`
as the source of truth for My Way methodology when product intent, pre-ADR, ADR,
spec, implementation-plan, or review work is in scope.

## Project-Local Skills

Operator-facing BYOA skills (per-role, plus shared API-access and membership
foundations) will live under `skills/` in subfolders. None are implemented yet —
see the design and rationale in `docs/plans/byoa-operator-skills.md`. The earlier
developer-facing `agonara-api` skill was removed as built for the wrong consumer.

## Deployment Discipline

For Agonara deployment work, read `docs/deployment-discipline.md`.
