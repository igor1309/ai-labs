---
name: agonara-membership
author: Igor Malyarov
version: "1.0.0"
description: Read and reason about Agonara program participation — your own program memberships, invitations addressed to you (accept or decline them), effective participation for an identity, and membership history. Use when an agent needs to know which programs an identity belongs to, in what role, or to act on a program invitation. The shared, role-neutral participation model that curator, student, and admin skills build on; it is not curation, learning state, or admin recovery.
trigger: when an agent needs to read program participation or act on an invitation, before reaching for a role-specific membership operation
---

# Agonara membership

Program **membership** is participation in a program — being a Student or a
Program Curator of it. Every role's glossary names membership as something
governed *outside* its own workspace: it is shared, and owned by none of the
roles. This skill is the role-neutral view of that lifecycle.

Assumes [`agonara-api-access`](../agonara-api-access/SKILL.md) for the instance
URL, login, the `agonara_session` cookie, the `X-Agonara-CSRF` header on
mutations, and the `accepted`/`rejected`/`fault` envelope. This skill does not
repeat those mechanics.

## The shared vocabulary

- **Participation kind** — `student` or `program_curator`. An identity may hold
  either (or neither) in a given program.
- **Membership status** — `active`, `left`, or `removed`.
- **Invitation status** — `pending`, `accepted`, `declined`, or `revoked`.

## Read participation

- **Your own memberships** — `GET /program-memberships/me`. The programs the
  current identity participates in, with their kind and status.
- **Effective participation** —
  `GET /programs/{programId}/participation/{participationKind}` where
  `participationKind` is `student` or `program_curator`. Reads whether
  participation is in effect for the current identity, or for another identity
  via an optional `identityId` query parameter (reading another identity's
  participation needs the authority the API enforces — honor a `rejected`
  reason instead of inferring it).
- **Membership history** — `GET /programs/{programId}/membership-events`
  (paged via `limit`/`cursor`). The audit trail of membership changes;
  available to an Admin or that program's Program Curator.

## Your invitations

- **List** — `GET /program-invitations/me`, optionally filtered by `status`
  (`pending`/`accepted`/`declined`/`revoked`). These are invitations addressed
  to the current Student identity.
- **Accept** — `POST /program-invitations/{invitationId}/acceptance`.
- **Decline** — `POST /program-invitations/{invitationId}/decline`.

Both actions are mutations: send the session cookie and `X-Agonara-CSRF`. They
act only on an invitation addressed to you and only while it is `pending` —
otherwise expect a `rejected` reason such as `invitation_not_found` or
`invitation_not_pending`.

## What membership is not

Keep these out of this skill — they belong to a role skill and *lean on* this
shared model:

- **Not curation, and not learning/corpus state.** Membership says who
  participates; it says nothing about program content, accepted corpus, checks,
  attempts, or learner progress. Those are a separate concern with their own
  routes.
- **Not invitation issuance or participant management** — creating, listing, or
  revoking a program's invitations, listing participants, or removing a Student
  belongs to the **curator** skill.
- **Not joining or leaving** — a Student joining/leaving a self-join program, or
  a Curator leaving one, belongs to the **student** / **curator** skills.
- **Not recovery** — Admin-only exceptional membership recovery or revocation
  belongs to the **admin** skill.

If a task is one of these, this skill's job is to recognize it and hand off,
not to perform it.
