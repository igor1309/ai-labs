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
foundations) live under `skills/` in subfolders — see `skills/README.md` for the
implemented set and the design and rationale in
`docs/plans/byoa-operator-skills.md`. The shared foundations
(`agonara-api-access`, `agonara-membership`), the curator bucket
(`agonara-curator-corpus`/`-assessment`/`-research`/`-participation`), the
`agonara-student` skill, and the `agonara-admin` skill are implemented —
completing the per-role build sequence. The earlier developer-facing
`agonara-api` skill was removed as built for the wrong consumer.

## Deployment Discipline

For Agonara deployment work, read `docs/deployment-discipline.md`.
