---
date: 2026-06-07
model: claude
description: "Implementation plan: shared foundations for Agonara BYOA operator skills — the api-access skill (auth, session, CSRF, idempotency, envelope) and the membership skill (participation lifecycle), under agonara/skills/."
---

# BYOA Operator Skills — Foundations (api-access + membership)

Implements the **Foundations** step of the build sequence in
[`byoa-operator-skills.md`](byoa-operator-skills.md). Produces the two shared
skills every role skill leans on, grounded in the OpenAPI contract
[`../api/openapi.yml`](../api/openapi.yml). The three role plans
(`byoa-skills-curator.md`, `byoa-skills-student.md`, `byoa-skills-admin.md`)
depend on this plan landing first.

## Goal

Deliver `agonara/skills/agonara-api-access/` and
`agonara/skills/agonara-membership/` so any agent, pointed at an Agonara
instance, can authenticate, hold a session, send mutations correctly, read the
result envelope, and reason about program participation — without assuming this
repo, `src/`, the test harness, or any specific agent runtime. Preserves the
brief's consumer model: the skill is the portable operating surface; the
contract is the substrate.

## Execution mode

```
Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: push at closeout
```

## Execution lock

```
Worktree mode: create new
Expected worktree: worktrees/byoa-skills-foundations
Expected branch: <author>/byoa-skills-foundations
Preflight check: [ ] done
```

Preflight: run `git worktree list --porcelain` and `git branch --show-current`;
proceed only when the worktree and branch match the pattern above. Plan
authoring happens on the skills-plan branch; this lock governs the *build*.

## Scope guardrails

- **Foundations only.** No role-specific jobs (no curation, learning, or admin
  operations). Role operations live in the three role plans.
- **No repo/runtime coupling.** The skills must not mention `src/`, `server.js`,
  the test harness, `run_silent.sh`, `npm`/`tsc`/`swift`, worktrees, or a named
  agent runtime. Assume only: an instance URL, credentials, and the contract.
- **No hidden route knowledge.** Every endpoint, header, cookie, status, and
  envelope field the skills cite must exist in `../api/openapi.yml`. Do not
  invent routes or copy internal spec/source detail.
- **No discovery/publishing surface.** Install flow, marketplace, and versioning
  surface are out of scope (deferred by the brief).
- **No product repositioning.** Intent/README/landing edits belong to
  `agonara-byoa-repositioning-handoff.md`, not here. This plan may update only
  `agonara/skills/README.md`, the repo-root skills/Components reference for the
  two new skills, `docs/log.md`, and the LOC dashboard.

## Product intent traceability

The foundations are cross-cutting enablers, not deliverers of any single story.
They make every role's stories *reachable through an agent*.

| Story group | How foundations preserve it |
|---|---|
| All curator (CUR-01…18) | api-access gives the authenticated, CSRF-correct, idempotent mutation path their jobs require. |
| All student (STU-01…23) | api-access gives session + envelope handling; membership gives the join/leave/invitation vocabulary STU-18…23 lean on. |
| All admin (ADM-01…15) | api-access gives the authenticated mutation path; membership gives the participation model ADM-12…15 inspect/recover. |
| "Membership governed outside my workspace" (all three glossaries) | The membership skill names participation as a shared, role-neutral concern owned by none of them. |

## Validation gates (reused by every phase)

Skills are documentation artifacts, not `src/` code, so gates are
contract-grounding and live-instance checks, not `npm test`/`tsc`.

- **G1 — Contract-grounded.** Every operation, header (`X-Agonara-CSRF`),
  cookie (`agonara_session`), status, and envelope field the skill names is
  present in `../api/openapi.yml`. Spot-check by locating each cited path.
- **G2 — Portable.** The skill body contains no reference to `src/`,
  `server.js`, tests, `run_silent.sh`, `npm`, `tsc`, `swift`, worktrees, or a
  specific agent runtime. It states its only assumptions (instance URL,
  credentials, contract) explicitly.
- **G3 — Role-scoped.** api-access and membership reference only shared
  concerns; no curator/student/admin job leaks in.
- **G4 — Ownership-safe.** The skill instructs the agent to honor the API's
  projection and error envelope rather than inferring hidden state.
- **G5 — Live-instance verification.** Stand up an instance (project compose),
  load the skill into an agent, and confirm: log in, read `/identity/session`,
  perform one CSRF-protected mutation with an idempotency key, and read one
  membership view through the API. Capture the transcript as evidence.
- **G6 — Docs gates.** Front-matter/markdown/link checks on changed docs;
  `agonara/skills/README.md` lists the two skills; `docs/log.md` updated;
  refresh `docs/loc-dashboard.html` via `./scripts/loc-dashboard.sh --sort=name`
  if the markdown addition is substantial, and verify cards/footer/`data`/`Last
  updated` match.
- **G7 — Skill review.** Self-review then adversarial review of each SKILL.md
  (the dev `skill-review` skill is the natural lens): clear trigger/description,
  no dead or speculative instructions, and G1–G4 actually hold on reading. Fix
  every fail/warn before commit.

## Phase 1 — `agonara-api-access` skill

**Objective**: teach an arbitrary agent to talk to an Agonara instance at all —
the connective tissue under every role.

**Key work items**:

- Create `agonara/skills/agonara-api-access/SKILL.md` with front-matter
  (`name`, `author: Igor Malyarov`, `version`, `description`).
- Document, grounded in the contract: instance base URL + connectivity check
  (`GET /operations/health`, optional `GET /identity/bootstrap/status`);
  login (`POST /identity/sessions`) and the `agonara_session` cookie; whoami
  (`GET /identity/session`); logout (`DELETE /identity/session`).
- Document the mutation contract: when `X-Agonara-CSRF` is required, how
  idempotency keys are supplied, and how retries stay safe.
- Document the response envelope: the `accepted` / `rejected` / `fault`
  shape, how to read it, and what each implies for retry vs. stop.
- State portability assumptions explicitly (instance URL, credentials, contract
  — nothing else). Add a short `references/` only if the envelope/CSRF detail
  is too long for the main body.

**Dependencies**: none (foundational slice).

**Risks**: leaking repo/runtime assumptions (G2); citing headers/cookies the
contract does not define (G1); drifting into role jobs (G3).

**Validation**: G1, G2, G3, G4; G5 limited to login → whoami → one CSRF+idempotent
mutation → envelope read.

**Completion signal**: an agent with only this skill, an instance URL, and
credentials can authenticate, hold a session, perform a safe mutation, and
interpret the envelope.

**Commit** after gates pass.

## Phase 2 — `agonara-membership` skill

**Objective**: give every role a shared, role-neutral model of program
participation — the lifecycle named in all three glossaries as governed
*outside* each workspace.

**Key work items**:

- Create `agonara/skills/agonara-membership/SKILL.md` (same front-matter rules).
- Document the participation model grounded in the contract: read own
  memberships (`GET /program-memberships/me`); read own invitations and act on
  them (`GET /program-invitations/me`,
  `POST /program-invitations/{id}/acceptance`,
  `POST /program-invitations/{id}/decline`); inspect program participation
  state (`GET /programs/{id}/participation/{participationKind}`); read
  membership history (`GET /programs/{id}/membership-events`).
- Make explicit what membership is **not**: it is not curation, not learning
  state, not admin recovery. Role-specific membership *operations* (curator
  invites/participants, student join/leave, admin recovery) stay in the role
  skills and *lean on* this one.
- State that membership and learning/corpus state are separate (the glossaries'
  load-bearing boundary).

**Dependencies**: Phase 1 (the membership skill assumes api-access for auth,
CSRF, envelope; it references but does not duplicate it).

**Risks**: absorbing role-specific membership ops (G3) — e.g. pulling curator
invitation creation or admin recovery into the shared skill; blurring the
membership↔learning-state boundary (G4).

**Validation**: G1, G2, G3, G4; G5 limited to reading own memberships and own
invitations against a live instance.

**Completion signal**: an agent can, through this skill plus api-access, read
its participation and act on invitations, and can tell what belongs to a role
skill instead.

**Commit** after gates pass.

## Phase 3 — Closeout

**Objective**: make the two skills discoverable and the docs honest.

**Key work items**:

- Update `agonara/skills/README.md`: replace "No skills are implemented here
  yet" with the two foundation skills and a one-line role-skill forward
  pointer.
- Update `agonara/README.md` only if it enumerates operator surfaces/skills.
  (Individual skills are not repo-root `## Components` rows; do not add them
  there.)
- Add a `docs/log.md` entry.
- Refresh `docs/loc-dashboard.html` if the addition is substantial (G6).
- Move this plan to `docs/plans/implemented/byoa-skills-foundations.md` in the
  same PR as the skills.

**Dependencies**: Phases 1–2 complete and gates green.

**Validation**: G6.

**Completion signal**: both skills exist, are referenced, docs/log/dashboard are
current, and the plan is archived.

**Commit** after gates pass.

## Done criteria

- `agonara/skills/agonara-api-access/` and `agonara/skills/agonara-membership/`
  exist, each with a contract-grounded, portable, role-scoped, ownership-safe
  `SKILL.md`.
- Each skill passes G1–G5; the live-instance transcript exists as evidence.
- `agonara/skills/README.md`, the skills/Components reference, `docs/log.md`,
  and (if substantial) the LOC dashboard are updated.
- Plan archived to `docs/plans/implemented/`.

## Final closeout

```
Final gates: G1–G7 for both skills (contract spot-checks, portability scan, live-instance transcript, skill review, docs/front-matter/link checks, dashboard refresh-and-verify if substantial)
Archive plan: move to agonara/docs/plans/implemented/byoa-skills-foundations.md
Commit archive move: yes
Push/PR: push at closeout; open PR per repo conventions (merge commit, --auto --delete-branch) only if requested
```
