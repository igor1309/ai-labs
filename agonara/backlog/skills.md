---
date: 2026-06-07
model: claude
description: "Forward backlog for Agonara BYOA operator skills — the gaps remaining now that the per-role skill set is complete, with a recommended sequencing."
---

# Skills Backlog

Forward tasks for the Agonara BYOA operator skills. The **per-role skill set is
complete** — foundations (`agonara-api-access`, `agonara-membership`), the curator
bucket (`-corpus`/`-assessment`/`-research`/`-participation`), `agonara-student`,
and `agonara-admin` cover every actor in the intent docs. No missing *role* skill
remains; what follows is everything still open around that set.

Design source of truth: [`docs/plans/byoa-operator-skills.md`](../docs/plans/byoa-operator-skills.md).
This file holds forward tasks only — status and findings live in git history,
the plans, and `docs/log.md`.

## Gap 1 — Close the deferred G5 live-instance verifications

`agonara-student` and `agonara-admin` shipped with **G5 (live-instance
verification) deferred** — the authoring environment had no running instance or
role credentials. Until each runs against a live instance and captures a
transcript, the skill is not fully done against its own done-criteria.

- Run [`docs/plans/byoa-skills-student-live-verification.md`](../docs/plans/byoa-skills-student-live-verification.md)
  (full student arc; preview-creates-no-state, idempotency-replay, rejoin-reuses-state).
- Run [`docs/plans/byoa-skills-admin-live-verification.md`](../docs/plans/byoa-skills-admin-live-verification.md)
  (full admin arc; `bootstrap_already_completed` + `last_admin_removal` rejection
  assertions, attribution/redaction, no learning-domain access).

Prerequisite for both: a reachable instance (project compose) plus role
credentials. Foundations were already verified live; curator's live pass, if not
yet captured, belongs here too.

## Gap 2 — Skill discovery / publishing / packaging

The brief's explicit still-open question #1. The skills live in-repo with no
distribution story: how does an operator *find and load* the skill for a job?

- Decide packaging/home: shipped **with the instance** (served by the API,
  versioned with the contract) vs. standalone installables an operator pulls in.
  This choice shapes where skills assume they run.
- Define the versioning surface and install flow (the brief parks "marketplace,
  install flow, versioning surface" under discovery/publishing — to be resolved
  here, not in the skill content).

This is the largest *structural* next step; it is design work, not a content
skill.

## Gap 3 — Skill–contract drift guard

Tracked in [`docs/backlog.md`](../docs/backlog.md) ("Skill–contract drift
guard"). The skills cite concrete `docs/api/openapi.yml` paths, but nothing in CI
fails when a contract change renames or removes a cited route — caught today only
by manual G1 spot-checks at authoring time.

- Choose the lightest guard worth its maintenance cost: a path-existence test
  extracting the `/...` routes a SKILL.md cites and asserting each resolves in
  `openapi.yml`; a scheduled `doc-drift-audit` over `skills/`; or accepting
  manual review.
- A test must tolerate prose that mentions paths illustratively without
  over-fitting to phrasing.

This is protective tooling for all six skills, not a new skill.

## Not recommended (yet) — a standalone instance-operations skill

A thin operations skill (health/diagnostics/operational reads) is a conceivable
new skill, but it overlaps `agonara-api-access` (which already teaches
`/operations/health`) and `agonara-admin`, and the host-level concerns it would
otherwise reach for (backup/restore, deploy — ADM-11) sit **outside** the
contract-as-substrate model by design. Do not add it without a concrete operator
job it uniquely serves.

## Recommended sequencing

1. **Gap 1 — live-verifications.** Finishes the role set honestly against its own
   done-criteria; smallest, most concrete, unblocks confidence in everything
   already shipped. Needs only a running instance + credentials.
2. **Gap 3 — drift guard.** Keeps all six skills trustworthy as the contract
   evolves; cheap, protective, and worth landing before the surface grows.
3. **Gap 2 — discovery/publishing.** The deeper design effort; take it up as its
   own branch once the set is verified and protected, since packaging decisions
   are easier to make against skills known to be correct and drift-guarded.
