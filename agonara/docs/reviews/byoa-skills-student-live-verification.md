---
date: 2026-06-07
model: gpt-5
description: "BYOA Student skill G5 live-instance verification evidence"
---

# BYOA Student Skill Live Verification

## Run

- Instance: `https://staging.agonara.enoa.ai`
- Run ID: `91e1aad8`
- Checked at: `2026-06-07T09:08:42.619Z`
- Disposable self-join program: `064824a3-e61a-4674-a618-955340b82aed`
- Disposable invitation-only program: `dd83abb0-85d1-4084-84fe-ba86c7619879`

The live run used disposable identities, programs, accepted corpus, checks,
attempts, and invitations. Captured evidence excluded passwords, session
cookies, CSRF tokens, idempotency-key values, Nomos credentials, raw provider
artifacts, and evaluator internals.

## Assertions

| Assertion | Result |
| --- | --- |
| Preview creates no membership state | pass |
| Join creates active Student membership | pass |
| Quick-check idempotency replay returns the original attempt | pass |
| Open-answer idempotency replay returns the original attempt | pass |
| Readiness idempotency replay returns the original attempt | pass |
| Open-answer evaluator produced feedback | pass |
| Learner-state level after attempts | `on_track` |
| Rejoin reuses prior learner-state level | pass |
| Curator candidate route rejects Student session | pass |
| Other Student cannot read quick/open/readiness attempts | pass |
| Invitation accept and decline flows complete | pass |
| Sanitized transcript forbidden terms | none |

## Sanitized Route Evidence

| Step | Method | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| Discover programs | `GET` | `/programs` | `200` | Program list returned. |
| Preview accepted corpus | `GET` | `/programs/{programId}/accepted-corpus` | `200` | Returned 3 accepted items: topic, concept, material. |
| Preview navigation | `GET` | `/programs/{programId}/navigation` | `200` | Returned student-safe navigation graph. |
| Memberships before join | `GET` | `/program-memberships/me` | `200` | Returned zero memberships for the disposable Student. |
| Learner state before join | `GET` | `/programs/{programId}/learner-state` | `403` | Rejected with `participation_required`. |
| Join | `POST` | `/programs/{programId}/student-membership` | `200` | Membership became `active`. |
| Memberships after join | `GET` | `/program-memberships/me` | `200` | Active Student membership present. |
| Initial learner state | `GET` | `/programs/{programId}/learner-state` | `200` | Returned `no_evidence`. |
| Navigation | `GET` | `/programs/{programId}/navigation` | `200` | Returned student-safe graph. |
| Concept detail | `GET` | `/navigation/entities/{conceptEntityId}` | `200` | Included one incoming topic edge and one outgoing material edge. |
| Material detail | `GET` | `/navigation/entities/{materialEntityId}` | `200` | Returned material reference detail. |
| Quick checks | `GET` | `/programs/{programId}/quick-checks` | `200` | Returned one delivery. |
| Quick-check revision | `GET` | `/quick-checks/revisions/{revisionId}` | `200` | Returned student-safe delivery revision. |
| Quick-check attempt | `POST` | `/programs/{programId}/quick-check-attempts` | `200` | Accepted matched attempt. |
| Quick-check replay | `POST` | `/programs/{programId}/quick-check-attempts` | `200` | Returned same attempt. |
| Open-answer checks | `GET` | `/programs/{programId}/open-answer-checks` | `200` | Returned one accepted check. |
| Open-answer revision | `GET` | `/open-answer-checks/revisions/{revisionId}` | `200` | Returned accepted check revision. |
| Open-answer attempt | `POST` | `/programs/{programId}/open-answer-attempts` | `200` | Accepted submitted attempt. |
| Open-answer replay | `POST` | `/programs/{programId}/open-answer-attempts` | `200` | Returned same attempt. |
| Schedule evaluator | direct command | `scheduleOpenAnswerEvaluatorJob` | `200` | Job moved attempt to `evaluating`. |
| Evaluator tick | `POST` | `/operations/open-answer-evaluator/tick` | `200` | Worker completed the job. |
| Open-answer feedback | `GET` | `/open-answer-attempts/{attemptId}` | `200` | Attempt became `evaluated`; feedback present. |
| Readiness checks | `GET` | `/programs/{programId}/readiness-checks` | `200` | Returned one readiness check. |
| Readiness attempt | `POST` | `/programs/{programId}/readiness-check-attempts` | `200` | Result was `ready`. |
| Readiness replay | `POST` | `/programs/{programId}/readiness-check-attempts` | `200` | Returned same attempt. |
| Readiness detail | `GET` | `/readiness-check-attempts/{attemptId}` | `200` | Returned owner detail. |
| Learner state after attempts | `GET` | `/programs/{programId}/learner-state` | `200` | Level became `on_track`. |
| Target evidence | `GET` | `/learner-state/targets/topic/{topicEntityId}` | `200` | Included quick-check evidence. |
| Student on curator route | `GET` | `/programs/{programId}/quick-checks/candidates` | `403` | Rejected with `admin_or_curator_required`. |
| Other Student quick attempt | `GET` | `/quick-check-attempts/{attemptId}` | `404` | Rejected with `attempt_not_found`. |
| Other Student open attempt | `GET` | `/open-answer-attempts/{attemptId}` | `404` | Rejected with `attempt_not_found`. |
| Other Student readiness attempt | `GET` | `/readiness-check-attempts/{attemptId}` | `404` | Rejected with `attempt_not_found`. |
| Leave | `DELETE` | `/programs/{programId}/student-membership` | `200` | Membership became `left`. |
| Learner state while left | `GET` | `/programs/{programId}/learner-state` | `403` | Rejected with `participation_required`. |
| Rejoin | `POST` | `/programs/{programId}/student-membership` | `200` | Membership became `active`. |
| Attempts after rejoin | `GET` | quick/open/readiness attempt lists | `200` | Prior attempts remained visible to owner. |
| Learner state after rejoin | `GET` | `/programs/{programId}/learner-state` | `200` | Reused `on_track` learner-state level. |
| Invitation-only program | `POST` + `PATCH` | `/programs`, `/admission-policy` | `200` | Program set to invitation-only. |
| Create invitations | `POST` | `/programs/{programId}/invitations` | `200` | Two pending Student invitations created. |
| Pending invitations | `GET` | `/program-invitations/me?status=pending` | `200` | Pending invitation visible to invitee. |
| Accept invitation | `POST` | `/program-invitations/{id}/acceptance` | `200` | Invitation accepted; membership active. |
| Decline invitation | `POST` | `/program-invitations/{id}/decline` | `200` | Invitation declined. |

## STU Coverage

| Story | Status |
| --- | --- |
| STU-01 | live-verified: program discovery and accepted corpus/navigation preview |
| STU-02 | live-verified: join self-join program |
| STU-03 | live-verified: active membership appears in `/program-memberships/me` |
| STU-04 | live-verified: learner-state summary before and after attempts |
| STU-05 | live-verified: accepted corpus and navigation list |
| STU-06 | live-verified: navigation topic/concept/material relationships |
| STU-07 | live-verified: subspace-versus-subset concept detail |
| STU-08 | live-verified: learner-state target detail |
| STU-09 | live-verified: material reference detail reachable from concept |
| STU-10 | live-verified: concept detail links back to topic and material |
| STU-11 | live-verified: quick-check delivery and revision |
| STU-12 | live-verified: quick-check submission and idempotency replay |
| STU-13 | live-verified: open-answer submission and feedback read |
| STU-14 | live-verified: readiness delivery, submission, and detail |
| STU-15 | live-verified: attempt lists reused after rejoin |
| STU-16 | live-verified: learner-state results linked to structure |
| STU-17 | live-verified: target evidence drill-down |
| STU-18 | live-verified: ownership-safe reads and redaction scan |
| STU-19 | live-verified: leave program |
| STU-20 | live-verified: rejoin reuses prior attempts and learner state |
| STU-21 | contract-reasoned: protected state unavailable before join and while left |
| STU-22 | live-verified: accept pending invitation |
| STU-23 | live-verified: decline pending invitation |

## Notes

The first staging probe exposed two live contract defects before the successful
run:

- The Student skill and OpenAPI contract documented open-answer attempt body
  field `answerText`, while the runtime requires `submittedAnswer`.
- Signed-in preview for `GET /programs/{id}/accepted-corpus` and
  `GET /programs/{id}/navigation` required membership, contradicting the
  Student skill's preview-creates-no-state journey.

Both were fixed before the successful G5 run. Detail reads, deliveries,
attempts, learner-state, and curator candidate routes remain participation or
role protected.
