---
date: 2026-06-07
model: claude
description: "Implementation plan: the Student BYOA operator skill for Agonara — discovery, learning continuity, checks/attempts, and progress — grounded in the OpenAPI contract."
---

# BYOA Operator Skills — Student

Implements the **second role** of the build sequence in
[`byoa-operator-skills.md`](byoa-operator-skills.md). Student is plausibly a
single skill initially (the brief), built in dependency-ordered phases.
Grounded in [`../api/openapi.yml`](../api/openapi.yml) and
[`../intent/student_user_stories.md`](../intent/student_user_stories.md).

**Depends on `byoa-skills-foundations.md` (api-access + membership).**

## Goal

Deliver `agonara/skills/agonara-student/` so an agent operating as a student can
discover and preview programs, join/leave, resume learning and follow the next
step, study concepts and materials, take checks and submit open answers, and
read results and progress with their supporting evidence — through the contract,
seeing only accepted corpus and the student's own state (never curator drafts,
answer keys, or provider internals).

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
Expected worktree: worktrees/byoa-skills-student
Expected branch: <author>/byoa-skills-student
Preflight check: [ ] done
```

Preflight: confirm worktree/branch before each phase.

## Scope guardrails

- **Student jobs only.** No curation/authoring, no admin/identity flows.
- **Lean on foundations.** Auth/CSRF/idempotency/envelope and the participation
  model come from the shared skills; reference, don't restate. Student-side
  membership *operations* (self-join, leave, rejoin, accept/decline invitation)
  live here and lean on `agonara-membership`.
- **Contract is the substrate.** Every cited operation exists in
  `../api/openapi.yml`. No `src/`, tests, tooling, or runtime assumptions.
- **Ownership-safe (the load-bearing student boundary).** The student sees only
  **accepted** corpus and **their own** state. The skill must never read or
  present: curator candidates/drafts, answer keys, correctness metadata,
  acceptance rationale, evaluator/provider internals, raw prompts/responses, or
  other students' state. Previewing a program (STU-03) must not create student
  state. Program corpus and student state stay separate; membership and learning
  state stay separate.
- **No discovery/publishing, no product repositioning.** Same exclusions as the
  foundations plan.

## Product intent traceability

| Phase | Stories delivered |
|---|---|
| Phase 1 — Discover & join | STU-01, STU-02, STU-03, STU-18, STU-19, STU-20, STU-21, STU-22, STU-23 |
| Phase 2 — Learn & navigate | STU-04, STU-05, STU-06, STU-07, STU-08, STU-09, STU-10 |
| Phase 3 — Check & assess | STU-11, STU-12, STU-13, STU-14 |
| Phase 4 — Results & progress | STU-15, STU-16, STU-17 |

Single skill; phases are the build order, not separate skills (unless real job
volume justifies splitting Phase 3–4 into an `agonara-student-assessment`
sibling — decide at build).

## Validation gates (reused by every phase)

Same G1–G7 as `byoa-skills-foundations.md` (incl. **G7 skill review** — self +
adversarial), with student specifics:

- **G1 Contract-grounded** — every cited student operation exists in
  `../api/openapi.yml`.
- **G2 Portable** — no `src/`/tests/tooling/runtime references.
- **G3 Role-scoped** — only student operations + the two foundations.
- **G4 Ownership-safe** — the skill reads only accepted corpus and own state;
  never drafts, answer keys, correctness, provider internals, or other students'
  data; preview creates no state.
- **G5 Live-instance** — against a running instance with a student session, the
  job completes through the API (join → resume/next-step → answer a quick check
  and submit an open answer → read feedback → read learner-state and its
  evidence).
- **G6 Docs gates** — README/skills listing, `docs/log.md`, dashboard refresh.

## Phase 1 — Discover & join

**Objective**: find programs, preview coverage without creating state, and
manage own membership.

**Key work items**: SKILL.md (front-matter incl. `author: Igor Malyarov`)
teaching: list available/started programs (`GET /programs`,
`GET /programs/{id}`) and preview accepted coverage (`GET
/programs/{id}/accepted-corpus`, `GET /programs/{id}/navigation`) without
creating student state (STU-03); self-join and leave (`POST`/`DELETE
/programs/{id}/student-membership`), rejoin reusing existing state (STU-20),
view own membership state (`GET /program-memberships/me`), accept/decline
invitations (lean on `agonara-membership`).

**Dependencies**: foundations landed.

**Risks**: preview creating student state (G4); duplicating shared membership
model (G3).

**Validation**: G1–G5 for discover → preview → join/leave.

**Completion signal**: a student agent discovers, previews state-free, and
controls its own membership.

**Commit** after gates pass.

## Phase 2 — Learn & navigate

**Objective**: resume learning, follow the next step, and study concepts and
materials with navigation intact.

**Key work items**: SKILL.md teaching: resume last position and read the next
recommended step (STU-04,05); read topic concepts/terms/definitions and
confusable-concept distinctions (STU-06,07); surface concepts needing deeper
work as personal state without changing corpus (STU-08); reach materials from
the topic/concept they support and navigate back (STU-09,10) via
`/programs/{id}/navigation`, `/navigation/entities/{id}`, and learner-state
reads. Ground all structure in accepted corpus only.

**Dependencies**: Phase 1 (must be a member to learn).

**Risks**: reading drafts instead of accepted corpus (G4); mutating corpus from
the student side (G4).

**Validation**: G1–G5 for resume → next-step → study a concept/material.

**Completion signal**: a student agent learns within accepted program structure
with navigation continuity.

**Commit** after gates pass.

## Phase 3 — Check & assess

**Objective**: verify understanding through quick checks, open answers, and
topic/readiness checks.

**Key work items**: SKILL.md teaching: answer quick checks
(`/programs/{id}/quick-check-attempts`, `/quick-check-attempts/{id}`); submit
open answers (`/programs/{id}/open-answer-attempts`,
`/open-answer-attempts/{id}`) and read feedback relative to accepted criteria
(STU-13); take readiness checks (`/programs/{id}/readiness-checks`,
`/programs/{id}/readiness-check-attempts`, `/readiness-check-attempts/{id}`) to
judge readiness to continue (STU-14). Stress: the student never sees answer keys
or correctness metadata or evaluator/provider internals — only its own attempt,
result, and feedback.

**Dependencies**: Phase 2 (checks attach to studied corpus).

**Risks**: exposing answer keys/correctness/provider internals (G4); reading
others' attempts (G4).

**Validation**: G1–G5 for quick-check + open-answer attempt + feedback read.

**Completion signal**: a student agent takes checks and reads feedback without
any curator-only or provider-internal leakage.

**Commit** after gates pass.

## Phase 4 — Results & progress

**Objective**: see results, weak areas, and the evidence behind progress labels.

**Key work items**: SKILL.md teaching: read check results and learner-state
(`/programs/{id}/learner-state`, `/learner-state/targets/{targetKind}/{id}`);
see weak topics/concepts linked back to structure (STU-16); and expose the
attempts/answers/feedback behind a "mastered"/"weak" label so it is not just a
label (STU-17). All as personal state that does not change accepted corpus.

**Dependencies**: Phase 3 (progress derives from attempts).

**Risks**: presenting progress without its supporting evidence (STU-17, G4);
coupling student weak areas to corpus mutation (G4).

**Validation**: G1–G5 for results → weak areas → evidence drill-down.

**Completion signal**: a student agent reads evidence-backed progress as personal
state.

**Commit** after gates pass.

## Phase 5 — Closeout

**Key work items**: list the skill in `agonara/skills/README.md` (and
`agonara/README.md` only if it enumerates surfaces/skills — not the repo-root
`## Components` table); `docs/log.md` entry; refresh `docs/loc-dashboard.html` if
substantial; move this plan to
`docs/plans/implemented/byoa-skills-student.md` in the implementing PR.

**Validation**: G6.

**Completion signal**: skill discoverable, docs current, plan archived.

## Done criteria

- `agonara/skills/agonara-student/` exists, contract-grounded, portable,
  role-scoped, ownership-safe.
- STU-01…23 are each reachable through an agent + the skill; the student
  boundary (accepted corpus + own state only; preview state-free; no keys
  /correctness/provider internals/other students) holds across all phases.
- Each phase passes G1–G5 with a live-instance transcript.
- README/skills listing, `docs/log.md`, dashboard (if substantial) updated; plan
  archived.

## Final closeout

```
Final gates: G1–G7 for the student skill (contract spot-checks, portability scan, role-scope + ownership-safety review, skill review, live-instance transcript, docs/link checks, dashboard refresh-and-verify if substantial)
Archive plan: move to agonara/docs/plans/implemented/byoa-skills-student.md
Commit archive move: yes
Push/PR: push at closeout; PR per repo conventions only if requested
```
