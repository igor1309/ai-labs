---
name: agonara-admin
author: Igor Malyarov
version: "1.0.0"
description: "Operate an Agonara private instance as an Admin through its HTTP API: bootstrap the first Admin, create and disable identities, bind local-password credentials, grant or revoke instance Admin authority while preserving the last-admin invariant, inspect operational access and audit events, and perform exceptional program-membership recovery or revocation. Use when an agent is doing instance administration, identity/credential administration, Admin authority transfer, access diagnosis, or recovery-level membership operations. Admin is not curation or learning and does not grant program participation."
trigger: "when an agent works as an Agonara Admin against an instance - bootstrap, identity or credential administration, Admin authority, audit, access diagnosis, or exceptional membership recovery"
---

# Agonara admin

Teaches an agent to operate a private Agonara instance as an Admin: initialize
the instance, administer identities and credentials, transfer Admin authority
safely, diagnose access, and perform exceptional membership recovery. Every
operation goes through the HTTP contract.

Builds on the shared foundations and does not repeat their mechanics:

- [`agonara-api-access`](../agonara-api-access/SKILL.md) - the instance URL,
  password login and the `agonara_session` cookie, the `X-Agonara-CSRF` header
  on session-backed mutations, and the `accepted`/`rejected`/`fault` envelope.
- [`agonara-membership`](../agonara-membership/SKILL.md) - the role-neutral
  participation vocabulary: `student` / `program_curator`, membership status,
  invitations, effective participation, and membership history.

The only assumptions are the foundations' assumptions: an instance URL, Admin
credentials (or the bootstrap secret before the first Admin exists), and the
instance's OpenAPI contract as the source of truth. No repository, source,
or local project environment.

## The admin boundary

Admin authority is **instance-scoped operational control**. It does not make the
Admin a Program Curator or Student and must never be presented as a way to
curate content, learn, view private learner state, or bypass program
participation.

Keep these boundaries explicit:

- Identity is the stable ownership subject. A credential lets someone
  authenticate; it is not the owner and it is not a program role.
- Disabling an identity stops new actions but preserves historical ownership
  and audit references.
- Admin authority changes affect instance operations only. They do not grant
  `student` or `program_curator` participation in any program.
- Membership recovery and revocation are exceptional operational actions, not
  the normal join/invite/leave/curate flow.
- Learning-domain content and state are out of scope: no corpus, check,
  attempt, answer-key, learner-state, progress, or curation-candidate routes.

As always, honor the API's `rejected` reason instead of inferring hidden state.

## Bootstrap and identities

Initialize an instance and administer identity records. All session-backed
mutations require `agonara_session` plus `X-Agonara-CSRF`; bootstrap runs before
there is a session and is not CSRF-protected.

- **Check bootstrap** - `GET /identity/bootstrap/status`. Use this to learn
  whether first-Admin bootstrap remains available.
- **Create first Admin** - `POST /identity/bootstrap/admin` with
  `{ "bootstrapSecret", "displayName", "login", "password" }`. On success the
  instance sets the `agonara_session` cookie for the new Admin. If bootstrap is
  already closed, expect `bootstrap_already_completed`; if the secret is wrong,
  expect `invalid_bootstrap_secret`.
- **List identities** - `GET /identity/identities`. Use this to inspect active
  and disabled identities plus credential-binding state.
- **Create identity** - `POST /identity/identities` with `{ "displayName" }`.
  This creates the ownership subject independently of any credential, Admin
  authority, or program participation.
- **Bind local password** -
  `POST /identity/identities/{identityId}/local-password` with
  `{ "login", "password" }`. Binding lets authentication resolve to the
  identity; it does not grant Admin authority or program participation. Expect
  `identity_already_has_credential`, `login_already_bound`,
  `target_identity_not_found`, or `target_identity_disabled` when the binding
  cannot be created.
- **Disable identity** - `POST /identity/identities/{identityId}/disable` with
  an optional object body. Disabling is not deletion. Historical ownership,
  membership, and audit references remain readable. If the identity is the last
  active Admin, expect `last_admin_removal` and stop.

## Admin authority and access diagnosis

Use these operations to transfer operational control and diagnose access without
creating or changing program participation.

- **Grant Admin** - `POST /identity/identities/{identityId}/admin`.
- **Revoke Admin** - `DELETE /identity/identities/{identityId}/admin`.

Before revoking Admin authority or disabling an Admin identity, check that
another active Admin will remain. The API enforces this with
`last_admin_removal`; treat that rejection as a hard stop, not a prompt to try a
different removal sequence.

- **Inspect operational access** -
  `GET /identity/identities/{identityId}/operational-access`. Use this for
  read-only diagnosis of Admin authority and program participation authority.
  The result explains access; it does not recreate access.
- **Read identity/audit events** - `GET /identity/audit-events`, paged with
  `limit` and `cursor`. Use this to trace identity, credential-binding,
  Admin-authority, and exceptional recovery operations with attribution.

## Exceptional membership recovery

Use these only for recovery and audit. Normal participation operations remain in
the curator, student, and shared membership skills.

- **Inspect membership history** -
  `GET /programs/{programId}/membership-events`, paged with `limit` and
  `cursor`. Available to an Admin or that program's Program Curator.
- **Recover membership** - `POST /admin/program-memberships/recovery` with
  `{ "programId", "targetIdentityId", "participationKind", "recoveryReason" }`,
  where `participationKind` is `student` or `program_curator`. Use this to
  restore valid participation in exceptional cases while preserving
  attribution.
- **Revoke membership** - `POST /admin/program-memberships/revocation` with
  `{ "programId", "targetIdentityId", "participationKind", "revocationReason" }`.
  Use this for operationally invalid access, not routine participant management.

For recovery/revocation, expect and honor membership rejections such as
`membership_missing`, `membership_already_active`, `membership_left`,
`membership_removed`, `unsupported_participation_kind`, `program_not_found`,
`target_identity_not_found`, or `target_identity_disabled`.

## What this skill is not

Recognize these and hand off rather than attempt them:

- **Not curation** - program creation, corpus candidates, acceptance, checks,
  answer keys, coverage gaps, and LLM suggestions belong to curator skills.
- **Not learning** - discovery, joining/leaving as a Student, study, attempts,
  feedback, learner state, and progress evidence belong to `agonara-student`.
- **Not shared membership basics** - reading your own memberships/invitations,
  acting on an invitation addressed to you, and effective participation
  vocabulary live in `agonara-membership`.
- **Not normal participant management** - curator invitations, participant
  listing/removal, admission policy, and curator leave belong to the curator
  participation skill. Admin recovery is exceptional and attributable.
- **Not host-side data recovery** - identity and operational access state must
  be preserved by instance operations, but host-side preservation drills are
  deployment operations, not an API job taught by this skill.
