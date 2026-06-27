---
name: agonara-curator-participation
author: Igor Malyarov
version: "1.1.0"
description: Assist a human Agonara Program Curator to manage who participates in a program they curate — set the admission policy, invite students and revoke invitations, list invitations and current participants, remove a student, stop curating, and read membership history. Use when a curator's assistant agent is managing participation rather than content. Builds on the shared membership skill; participant views never expose private student learning state, and changing participation never mutates accepted corpus.
trigger: when a curator's assistant agent needs to invite/remove participants, set admission policy, stop curating, or read a program's participation state
---

# Agonara curator assistant — participation

Manage who participates in a curator-controlled program: admission policy,
invitations, participants, and the curator's own membership. This is the
curator-side of participation — it adds curator operations on top of the shared,
role-neutral model and does not re-implement it.

**You are the curator's assistant, not the curator.** A human Program Curator
owns the program and its decisions; you do the API work on their behalf and
confirm choices with them — you don't decide for them.

Assumes [`agonara-api-access`](../agonara-api-access/SKILL.md) for auth, the
`X-Agonara-CSRF` header on mutations, and the envelope. Leans on
[`agonara-membership`](../agonara-membership/SKILL.md) for the shared vocabulary
— participation kinds (`student` / `program_curator`), membership status
(`active` / `left` / `removed`), and invitation status
(`pending` / `accepted` / `declined` / `revoked`). Read that skill first; this
one only adds the curator's operations.

## Admission policy

- **Set** — `PATCH /programs/{programId}/admission-policy` with
  `{ "admissionPolicy": "self_join" | "invitation_only" }`. This controls whether
  students join directly or only by invitation.

## Invitations

- **Invite a student** — `POST /programs/{programId}/invitations` with
  `{ "participationKind": "student", "targetIdentityId" }` (CUR-14). The
  invitation is membership state; it does **not** by itself create any student
  learning state.
- **List** — `GET /programs/{programId}/invitations`, optionally filtered by
  `status` — see pending and accepted invitations to understand who can
  participate (CUR-15).
- **Revoke** — `POST /program-invitations/{invitationId}/revocation` for a
  pending invitation. Expect `invitation_not_pending` / `invitation_not_found`
  if it is already resolved.

(A student accepting or declining an invitation addressed to them is the
*student's* action — `agonara-membership` covers it; it is not a curator
operation.)

## Participants

- **List** — `GET /programs/{programId}/participants`, optionally filtered by
  `participationKind` and membership `status` (`active`/`left`/`removed`). This
  reflects membership state only — it does **not** expose any student's private
  attempts, results, weak areas, or progress (CUR-16).
- **Remove a student** —
  `DELETE /programs/{programId}/participants/student/{identityId}` (CUR-17).
  Removal changes membership `status` to `removed`; it does **not** delete the
  student's historical learning evidence.

## Stop curating

- **Leave as curator** — `DELETE /programs/{programId}/curator-membership`
  (CUR-18). This changes *your* program membership; it does **not** mutate the
  program's accepted corpus content. If you are the program's only curator,
  expect `last_curator_required` — the program cannot be left without a curator.

## Membership history

- **Read** — `GET /programs/{programId}/membership-events` (paged via
  `limit`/`cursor`): the audit trail of membership changes, available to that
  program's curator (or an Admin).

## Boundaries this skill keeps

- **Participation, not learning state.** Every view here is membership state.
  Never read or expose private student learning state through a participant view
  (CUR-16) — that capability does not belong to a curator.
- **Participation changes don't touch content.** Removing a student or stopping
  curation changes membership only; accepted corpus and historical learning
  evidence are preserved (CUR-17, CUR-18).
- **Shared model stays shared.** Reading own memberships/invitations, accepting
  or declining invitations addressed to you, and effective-participation reads
  are [`agonara-membership`](../agonara-membership/SKILL.md); admin-only
  membership recovery/revocation is the **admin** skill. This skill performs only
  the curator-side operations above.
