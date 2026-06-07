---
date: 2026-06-07
model: claude
description: "Design brief: BYOA operator-facing skills for Agonara — consumer model, structure, and constraints. Captures the decision to remove the developer-facing agonara-api skill and build per-role operator skills under agonara/skills/."
---

# BYOA Operator Skills — Design Brief

> Status: design brief (intake output). No operator skills implemented yet.
> Discovery and publishing are deliberately out of scope here.

## Why this exists

A developer-facing `agonara-api` skill was added (PRs #512/#513) and then
removed. It was not badly built — it was built for the **wrong consumer**. It
served an agent *editing Agonara's codebase* (it assumed `src/server.js`, the
test harness, `run_silent.sh`, strict-TDD gates, "write a failing HTTP test").
That is the builder's question, not the operator's.

This brief captures the consumer Agonara actually wants to serve and the skill
structure that follows from it.

## The consumer: BYOA

Agonara is **bring-your-own-agent**. There is no plan to ship a bespoke curator
UI, student UI, or bundled chat as *the* way to use the product. Instead:

> An operator brings the agent they already work in — Claude Code, Codex,
> Cursor, a custom agent, whatever — points it at their Agonara instance, loads
> the skill for the job they are doing, and the skill teaches *their* agent how
> to perform that job against the API.

The skill **is** the product's operating surface for that role. It must survive
across agent runtimes. The consumer is "an agent (or a human driven by one)
operating Agonara through its API to do a role's job."

This is a different audience from the removed skill, with a different substrate:

| | Removed `agonara-api` skill | BYOA operator skills |
|---|---|---|
| Consumer | Agent building Agonara's code | Agent operating an Agonara instance |
| Assumes | This repo, `src/`, tests, TDD gates | An instance URL, credentials, the contract |
| Substrate | Source + spec docs | The published OpenAPI contract |
| Lives | In-repo dev tooling | `agonara/skills/` (portable, instance-targeting) |

## The axis: role jobs, not modules

The product's intent layer is already cut by **actor**, not by implementation
module:

- `docs/intent/curator_user_stories.md` — assemble / refine / accept program
  content (CUR-01…07).
- `docs/intent/student_user_stories.md` — discover, learn, progress
  (STU-01…07+).
- `docs/intent/admin_user_stories.md` — operate the private instance: identity,
  credentials, recovery (ADM-01…06+).

The five-module split (Corpus Storage, Program Membership, Curator Workspace,
Student Workspace, Identity & Role Management; ADR-004…016) is how the *builders*
keep ownership honest. It is an implementation detail. A curator does not think
"Corpus Storage + Curator Workspace + Navigation"; they think "build my
program." Skills are organized for the operator, so the axis is the **role's
jobs**, not the module map. (Organizing skills by module would project the
builder's map onto the user's hand — the original mistake.)

## Proposed structure

A thin shared base, with role skills on top. Two cross-cutting concerns are
shared by all roles, exactly as the intent docs already signal:

- **API access / connect** — every role-agent must talk to Agonara at all: log
  in, hold the `agonara_session` cookie, send `X-Agonara-CSRF` on mutations,
  respect idempotency keys, read the `accepted` / `rejected` / `fault` envelope.
- **Membership** — every actor's glossary names program membership as
  participation "governed *outside* my workspace." It is referenced by all three
  roles and owned by none of them.

```
agonara/skills/
  <shared: api access / connect>      # auth, session, CSRF, idempotency, envelope
  <shared: membership>                # participation lifecycle all roles lean on
  <curator ...>                       # likely a bucket — most distinct jobs
  <student ...>
  <admin ...>
```

Curator has the most distinct jobs (curation, external sources, checks,
criteria, navigation, coverage gaps, LLM suggestions) and is the most likely to
fan out into a **bucket** of several skills rather than a single skill. Student
and Admin are plausibly single skills initially. Exact granularity is deferred
to the build step; this brief fixes the axis and the foundations, not the final
file count.

## Constraints any operator skill must honor

- **Portable.** No assumption of this repo, `src/`, the test harness, a build
  tool, or a specific agent runtime. Assume only: an instance URL, credentials,
  and the OpenAPI contract.
- **Contract is the substrate.** Ground in `docs/api/openapi.yml`, not in source
  or internal specs. Never duplicate hidden route knowledge.
- **Role-scoped.** An operator loads only the skill for the job at hand; skills
  do not bleed other roles' jobs into scope.
- **Ownership-safe.** Honor the same projection rules the API enforces — students
  never see curator drafts / answer keys / provider internals, etc.

## Decisions taken (this branch)

- Removed the developer-facing `agonara-api` skill and all its in-repo
  references (AGENTS pointer, API TODO section, landing surface card).
- Established `agonara/skills/` as the parent for operator-skill subfolders
  (seeded with a README stating intent).
- Captured this design as the source of truth for the build step.

## Out of scope (for now)

- Skill discovery and publishing (marketplace, install flow, versioning surface)
  — to be addressed later.
- Building the operator skills themselves.
- The product/docs **repositioning** that this implies — that is a separate,
  significant job with its own branch and handoff:
  `agonara-byoa-repositioning-handoff.md`.

## Open questions to resolve before building skills

1. **Packaging/home of operator skills.** Shipped *with the product* (served by
   the instance, versioned with the API) vs. published as standalone installables
   an operator pulls in. (Parked under "discovery/publishing — later," but it
   shapes where skills assume they run.)
2. **Skill granularity.** One skill per role vs. curator-as-bucket; how finely to
   split jobs. Resolve against real job volume when building.
3. **Relationship to the existing `/learn` and `/admin` UIs.** Do those become
   reference clients, get demoted, or get deprecated under BYOA-first? (Tracked
   in the repositioning handoff — it is a positioning decision, not a skill
   decision.)
