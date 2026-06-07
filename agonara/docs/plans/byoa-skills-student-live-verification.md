---
date: 2026-06-07
model: claude
description: "Follow-up plan: execute the deferred G5 live-instance verification for the BYOA Student skill — the only gate not satisfiable when the skill was authored (no running instance + Student credentials)."
---

# BYOA Student Skill — Live-Instance Verification (G5)

Follow-up to the implemented
[`implemented/byoa-skills-student.md`](implemented/byoa-skills-student.md). That
skill (`agonara/skills/agonara-student/SKILL.md`) shipped with gates **G1–G4, G6,
G7 satisfied**. **G5 (live-instance verification) was deferred** because the
authoring environment had no running Agonara instance or Student credentials.
This plan exists so that gap is tracked, not lost — the skill is not *fully*
done against its own done-criteria until this runs.

Grounded in the same substrate: [`../api/openapi.yml`](../api/openapi.yml) and
[`../intent/student_user_stories.md`](../intent/student_user_stories.md).

## Goal

Confirm, against a running Agonara instance with a Student session, that an agent
loaded with `agonara-student` (over the api-access + membership foundations) can
complete the student job end-to-end through the API, and capture the transcript
as evidence — satisfying G5 for the student skill.

## Execution mode

```
Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gate, no reachable instance, missing Student credentials, destructive operations, explicit user interruption
Push policy: push at closeout
```

## Prerequisites

- A reachable Agonara instance (project compose stands one up locally).
- Student credentials for an identity on that instance, in a program that has
  **accepted** corpus and at least one quick check, open-answer check, and
  readiness check delivered.
- The `agonara-student` skill plus the two foundations loaded into the agent.

If any prerequisite is missing, stop and report — do not fabricate a transcript.

## G5 — the journey to verify

Drive the full student arc through the API (the SKILL.md is the script), and
record request/response envelopes for each step:

1. **Discover & join** — `GET /programs`; preview one program state-free
   (`GET /programs/{id}/accepted-corpus`, `GET /programs/{id}/navigation`) and
   confirm no student state was created; `POST /programs/{id}/student-membership`
   to join; `GET /program-memberships/me` shows it `active`.
2. **Learn & next step** — `GET /programs/{id}/learner-state` for position/next
   step; `GET /programs/{id}/navigation` and `GET /navigation/entities/{id}` to
   study a concept and reach a material.
3. **Check & assess** — find a quick check (`GET /programs/{id}/quick-checks`,
   `GET /quick-checks/revisions/{id}`) and answer it
   (`POST /programs/{id}/quick-check-attempts` with `X-Agonara-CSRF` +
   `X-Agonara-Idempotency-Key`); submit an open answer
   (`POST /programs/{id}/open-answer-attempts`) and read feedback
   (`GET /open-answer-attempts/{id}`).
4. **Results & progress** — `GET /programs/{id}/learner-state` for results/weak
   areas; `GET /learner-state/targets/{targetKind}/{id}` to drill into the
   evidence behind a label.

## Ownership-safety spot-checks (G4 against live data)

While the instance is up, confirm the boundary holds in practice, not just on
paper:

- A Student session is **rejected** when reaching a curator candidate route
  (e.g. `…/quick-checks/candidates`) — capture the `rejected` reason.
- Attempt and feedback reads expose no answer key, correctness metadata, or
  evaluator/provider internals.
- A Student cannot read another identity's attempts or learner-state.

## Done criteria

- A captured transcript shows steps 1–4 completing through the API with a
  Student session.
- The ownership-safety spot-checks pass (curator-only routes rejected; no
  key/correctness/provider-internal leakage; no cross-student reads).
- `docs/log.md` records G5 as satisfied for the student skill, and this plan is
  moved to `docs/plans/implemented/byoa-skills-student-live-verification.md`.

## Closeout

```
Final gate: G5 (live-instance transcript + ownership-safety spot-checks)
Archive plan: move to docs/plans/implemented/byoa-skills-student-live-verification.md
Commit archive move: yes
Push/PR: push at closeout; PR per repo conventions only if requested
```
