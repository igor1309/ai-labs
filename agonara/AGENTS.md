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
`docs/plans/implemented/byoa-operator-skills.md`. The shared foundations
(`agonara-api-access`, `agonara-membership`), curator bucket
(`agonara-curator-corpus`/`-assessment`/`-research`/`-participation`),
`agonara-student`, and `agonara-admin` are implemented.
The earlier developer-facing `agonara-api` skill was removed as built for the
wrong consumer.

## Node Commands

Agonara Node commands must run under Node 22, matching `.node-version`.
Use `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` before direct
`node`, `npm`, `npx`, and `./scripts/run_silent.sh ... npm/npx` commands when
the shell's default Node is different. This avoids native module ABI failures
for dependencies such as `better-sqlite3`.

## Skill authoring: on-demand loading

A skill body loads **on-demand** — until the agent opens it, only its name and
`description` are in context. A rule that must apply on **every** turn cannot rely
on the body being read, so surface it in the `description` (or the runtime's
always-on layer), not buried in the body. This is runtime-neutral skill-design
guidance; see `skills/README.md` for the full authoring constraints.

## Deployment Discipline

For Agonara deployment work, read `docs/deployment-discipline.md`.
