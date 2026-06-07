---
name: agonara-admin
author: Igor Malyarov
version: "1.0.0"
description: Operate an Agonara private instance as an Admin through its HTTP API — initialize the instance and its first admin, administer internal identities and credential bindings, assign and revoke instance-scoped Admin authority within the last-admin invariant, inspect operational access and audit events, and perform exceptional, attributable membership recovery and revocation. Admin is instance-scoped operational control; it never curates content, never operates normal learning participation, and never grants Student or Program Curator authority. Use when an agent administers an Agonara instance's identities, access, or membership recovery.
trigger: when an agent administers an Agonara instance — bootstrapping it, managing identities and credential bindings, transferring Admin authority, diagnosing access, or recovering/revoking membership in exceptional cases
---

# Agonara admin

Teaches an agent to do an instance Admin's jobs against an Agonara private
instance: initialize it, administer identities and their credential bindings,
transfer instance-scoped Admin authority safely, diagnose access, and perform
exceptional membership recovery and revocation with audit — all through the
contract.

Builds on the two foundations and does not repeat their mechanics:

- [`agonara-api-access`](../agonara-api-access/SKILL.md) — the instance URL,
  password login and the `agonara_session` cookie, the `X-Agonara-CSRF` header
  on mutations, idempotency keys, and the `accepted`/`rejected`/`fault` envelope
  with retry-vs-stop reasoning.
- [`agonara-membership`](../agonara-membership/SKILL.md) — the role-neutral
  participation model: memberships, effective participation, and membership
  history. Admin *inspects* and *exceptionally recovers* participation; it leans
  on this model for the shared vocabulary (`student`/`program_curator`;
  `active`/`left`/`removed`) and does not restate it.

The only assumptions are the foundations' assumptions: an instance URL, Admin
credentials (or a bootstrap secret for a fresh instance), and the instance's
OpenAPI contract as the source of truth for routes, bodies, and rejection
reasons. No repository, source, or tooling.

## The admin boundary (read this first)

Three load-bearing rules define what this role is — and, just as importantly,
what it is not:

1. **Instance-scoped, not learning-domain.** Admin administers identities,
   credential bindings, Admin authority, and access. It **never** reads or
   mutates learning-domain content — corpus, candidates, checks, attempts,
   learner-state, progress. Granting Admin does **not** grant Student or Program
   Curator authority (ADM-08); diagnosing access never recreates it.
2. **Exceptional, not normal-flow.** Admin's membership operations are *recovery
   and audit*, not the everyday join / invite / leave / curate path. Normal
   participation belongs to the **student** and **curator** skills over
   `agonara-membership`; this skill reaches for recovery only when operational
   access is broken or unsafe (ADM-12…14).
3. **Invariant-safe and attributable.** Never drive a sequence that removes,
   disables, or revokes the **last active Admin** — the API rejects it with
   `last_admin_removal` (ADM-09), and the skill must expect and honor that.
   Disabling an identity stops new actions but preserves historical references
   (ADM-04). Every sensitive operation is attributable and lands in the audit
   trail (ADM-10, ADM-15) — never strip or fabricate attribution.

As always, honor the `rejected` reason the API returns instead of inferring
hidden state — a rejection is the contract telling you where a boundary is.

## Bootstrap and identities

Initialize an instance and administer the identities and credential bindings
that authentication resolves to. **Identity is the ownership subject — separate
from the credential that authenticates it and the role it may hold.**

- **Check bootstrap status** — `GET /identity/bootstrap/status` (no auth) reports
  whether the instance still needs its first Admin. An instance cannot become
  operational without at least one active Admin (ADM-01).
- **Bootstrap the first Admin** — `POST /identity/bootstrap/admin`, body
  `{ "bootstrapSecret", "displayName", "login", "password" }`. This pre-session
  mutation carries no CSRF token (you have none yet); on success it sets the
  `agonara_session` cookie, so you are signed in as the first Admin. Expect
  `bootstrap_already_completed` if an Admin already exists, or
  `invalid_bootstrap_secret` for a wrong secret — neither should be blind-retried
  (ADM-01).
- **Create an internal identity** — `POST /identity/identities`, body
  `{ "displayName" }` (session cookie + `X-Agonara-CSRF`). The identity exists
  independently of any credential or product role (ADM-02) — creating it grants
  no ability to authenticate and no participation.
- **Bind a local-password credential** —
  `POST /identity/identities/{identityId}/local-password`, body
  `{ "login", "password" }` (CSRF). This lets a person authenticate *as* that
  identity without the credential becoming the source of ownership (ADM-03).
  Expect `identity_already_has_credential` / `login_already_bound` when a binding
  conflicts, or `identity_not_found` for an unknown identity.
- **Disable an identity** — `POST /identity/identities/{identityId}/disable`
  (CSRF; optional body). Disabling **stops new actions** for that identity but
  **preserves historical ownership and audit references** — it is not a delete
  (ADM-04). Do not present it as deletion. Disabling the last active Admin is
  refused with `last_admin_removal`.
- **Inspect identities and bindings** — `GET /identity/identities` lists active
  and disabled identities with their credential-binding state, so you can
  diagnose access and recovery posture (ADM-05).

## Admin authority and access inspection

Transfer operational control safely and diagnose access read-only. **Admin
authority is instance-scoped: it governs instance operations only and never
confers Student or Program Curator authority.**

- **Assign Admin authority** — `POST /identity/identities/{identityId}/admin`
  (CSRF). Grants instance-scoped Admin to an existing identity (ADM-08).
- **Revoke Admin authority** — `DELETE /identity/identities/{identityId}/admin`
  (CSRF). Removes instance-scoped Admin (ADM-08).
- **The last-admin invariant (ADM-09)** — never sequence the removal of the last
  active Admin, whether by revoking its authority or disabling its identity. The
  API rejects such an attempt with `last_admin_removal`; treat that reason as a
  hard stop, not something to retry. When transferring control, **grant the new
  Admin first, confirm it, then revoke the old** — never the reverse.
- **Inspect operational access** —
  `GET /identity/identities/{identityId}/operational-access` reads an identity's
  effective access: its Admin authority and its program participation grants and
  scope. Use it to diagnose whether an identity has effective Student or Program
  Curator authority in a program, and to trace how access was lost or restored —
  **without creating or changing membership** (ADM-06, ADM-07). This is a
  read-only diagnosis; it never recreates revoked access.
- **Read audit events** — `GET /identity/audit-events` (paged via `limit` /
  `cursor`) lists the attributable, redacted record of identity, credential-
  binding, Admin-authority, and exceptional-recovery operations — each carrying
  the acting Admin and the affected subject (ADM-10). Sensitive values are
  redacted; read attribution and change, not secrets.

## Membership recovery and audit (exceptional only)

Restore or revoke participation when operational access is broken or unsafe —
**not** the normal way people join, leave, or get invited. Frame every operation
here as exceptional recovery/audit and defer normal participation to the
student/curator skills over `agonara-membership`.

- **Inspect membership state** — read participation through the membership
  foundation (effective participation, a program's
  `GET /programs/{programId}/membership-events`) to diagnose an access or
  participation issue *before* acting (ADM-12). Inspecting is not operating: do
  not slide from a read into running normal participation.
- **Recover broken membership access** —
  `POST /admin/program-memberships/recovery`, body
  `{ "programId", "identityId", "participationKind", "reason" }` (CSRF;
  `participationKind` is `student` or `program_curator`). Restores valid
  membership access for an identity that should have it, **preserving
  attribution** — the `reason` is part of the audit record, so make it
  truthful and specific (ADM-13). Expect reasons like `program_not_found`,
  `identity_not_found`, or `membership_already_active` when recovery does not
  apply.
- **Revoke operationally invalid membership** —
  `POST /admin/program-memberships/revocation`, same body shape (CSRF). Removes
  membership in exceptional operational cases (incorrect or unsafe access state)
  without making Admin the normal manager of participation (ADM-14). The `reason`
  is recorded for audit.
- **Confirm the change is audited** — every membership change records the acting
  identity, the affected identity, the program, the participation kind, and the
  resulting membership state (ADM-15). Verify via
  `GET /programs/{programId}/membership-events` and `GET /identity/audit-events`;
  never drop or fabricate attribution to make a change look cleaner.

## Out of scope (deployment-host operational)

**Backup and restore coverage of identity and access state (ADM-11)** is an
instance *operational* concern realized by the deployment host's backup/restore
scripts, **not** an API operation in this contract. It is not driven through this
skill — see the instance's deployment discipline, not these routes.

## What this skill is not

Recognize these and hand off rather than attempt them:

- **Not curation or authoring** — creating sources, corpus or check *candidates*,
  accepting/rejecting them, or any learning-content operation belongs to the
  **curator** skill. Admin authority does not satisfy curator participation and
  must never be presented as a way to curate.
- **Not student learning** — discovering/joining programs, studying, taking
  checks, or reading learner-state belongs to the **student** skill. Admin
  authority does not satisfy student participation.
- **Not normal membership flow** — joining, inviting, leaving, declining, or
  removing participants in the everyday path belongs to the **student** /
  **curator** skills over `agonara-membership`. This skill's membership
  operations are exceptional recovery/revocation only.
- **Not the membership model itself** — reading memberships, effective
  participation, and membership history lives in **`agonara-membership`**; this
  skill leans on it and adds only the admin-exclusive recovery/revocation and
  identity/authority administration.
