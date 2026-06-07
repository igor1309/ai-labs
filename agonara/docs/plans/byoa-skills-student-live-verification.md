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
   (`GET /programs/{id}/accepted-corpus`, `GET /programs/{id}/navigation`); then
   **prove the preview created no state** — before joining, `GET
   /program-memberships/me` omits the program and `GET /programs/{id}/learner-state`
   is absent/empty (capture the reason). Join with `POST
   /programs/{id}/student-membership`; `GET /program-memberships/me` shows it
   `active`.
2. **Learn & next step** — `GET /programs/{id}/learner-state` for position/next
   step; `GET /programs/{id}/navigation` and `GET /navigation/entities/{id}` to
   study a concept, see a confusable-concept distinction (STU-07), and reach a
   material and return (STU-09, STU-10).
3. **Check & assess** — find a quick check (`GET /programs/{id}/quick-checks`,
   `GET /quick-checks/revisions/{id}`) and answer it
   (`POST /programs/{id}/quick-check-attempts` with `X-Agonara-CSRF` +
   `X-Agonara-Idempotency-Key`); submit an open answer
   (`POST /programs/{id}/open-answer-attempts`) and read feedback
   (`GET /open-answer-attempts/{id}`); take a readiness check
   (`GET /programs/{id}/readiness-checks` →
   `POST /programs/{id}/readiness-check-attempts` →
   `GET /readiness-check-attempts/{id}`, STU-14). **Replay one submission with
   the same idempotency key and confirm no duplicate attempt is created** — the
   point of the key.
4. **Results & progress** — `GET /programs/{id}/learner-state` for results/weak
   areas linked back to structure (STU-16);
   `GET /learner-state/targets/{targetKind}/{id}` to drill into the evidence
   behind a label (STU-17).
5. **Membership lifecycle** — `DELETE /programs/{id}/student-membership` (leave,
   STU-19); confirm `GET /program-memberships/me` shows `left` and historical
   evidence survives; then `POST /programs/{id}/student-membership` (rejoin) and
   **confirm prior attempts/learner-state are reused, not duplicated** (STU-20).
   Where the program is invitation-only, exercise accept/decline
   (`POST /program-invitations/{id}/acceptance` and `/decline`, STU-22, STU-23).

### STU coverage

The transcript above exercises the core arc. For closeout, record an explicit
**STU-01…23 coverage table** marking each story as *live-verified* in the
transcript or, where the test instance lacks the data to trigger it (e.g. no
pending invitation), *contract-reasoned* with the route that would serve it — so
the done-criterion "STU-01…23 are each reachable" is auditable rather than
assumed.

## Ownership-safety spot-checks (G4 against live data)

While the instance is up, confirm the boundary holds in practice, not just on
paper:

- A Student session is **rejected** when reaching a curator candidate route
  (e.g. `…/quick-checks/candidates`) — capture the `rejected` reason.
- Attempt and feedback reads expose no answer key, correctness metadata, or
  evaluator/provider internals.
- A Student cannot read another identity's attempts or learner-state.

## Done criteria

- A captured transcript shows steps 1–5 completing through the API with a
  Student session, including the preview-creates-no-state, idempotency-replay,
  and rejoin-reuses-state assertions.
- An STU-01…23 coverage table marks each story live-verified or
  contract-reasoned (with the serving route).
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
