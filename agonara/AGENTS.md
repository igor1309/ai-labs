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

## Hermes skill/SOUL layering

Skills deploy to the Hermes bots, where a skill **body loads on-demand** (a
discoverable pointer), not every turn — a rule that must fire every turn lives in
the profile **SOUL.md**, which only *points* to the skill (no restated content).
Before changing student/curator behavior, read inventory `vps/Hermes/gotchas.md`
(#11) and `agonara-student-quiz-presentation.md`.

### Self-evolution drift (live host vs this repo)

The bots are **self-learning**: they rewrite their own `memories/*.md` and edit
deployed `SKILL.md` / `references/*.md` in place on the host. A skill file can keep
the **same `version:` string while its content drifts** — a version check then
reports "in sync" while the bytes diverged. The host (box 2, `172.245.246.108`)
carries three deployed skill trees (canonical store + each profile); this repo is
the source of truth for skill *folders* only — memories and agent-accumulated
`references/` are **not** in this repo and live only on the host.

Tooling lives in the **inventory** repo, `vps/Hermes/scripts/` (run from a trusted
machine, not the VPS):
- `check-agonara-drift.sh` — repo↔host skill drift, flags the `!! SAME-VERSION`
  silent-drift case; pre-deploy gate.
- `agonara-self-watch.sh` — host-side cron; emits a Telegram digest (via the
  infra-monitor Worker `/notify` relay) on silent drift / memory edits, plus a
  daily roll-up.
- `harvest-agonara-self-state.sh` — pulls host memories + skill trees into
  `inventory/vps/Hermes/profiles/agonara-{curator,student}/` (commit-on-change;
  git stays off the host).

## Deployment Discipline

For Agonara deployment work, read `docs/deployment-discipline.md`.
