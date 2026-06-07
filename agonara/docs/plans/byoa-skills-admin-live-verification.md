---
date: 2026-06-07
model: claude
description: "Follow-up plan: execute the deferred G5 live-instance verification for the BYOA Admin skill — the only gate not satisfiable when the skill was authored (no running instance + Admin credentials)."
---

# BYOA Admin Skill — Live-Instance Verification (G5)

Follow-up to the implemented
[`implemented/byoa-skills-admin.md`](implemented/byoa-skills-admin.md). That skill
(`agonara/skills/agonara-admin/SKILL.md`) shipped with gates **G1–G4, G6, G7
satisfied**. **G5 (live-instance verification) was deferred** because the authoring
environment had no running Agonara instance or Admin credentials. This plan exists
so that gap is tracked, not lost — the skill is not *fully* done against its own
done-criteria until this runs.

Grounded in the same substrate: [`../api/openapi.yml`](../api/openapi.yml) and
[`../intent/admin_user_stories.md`](../intent/admin_user_stories.md).

## Goal

Confirm, against a running Agonara instance, that an agent loaded with
`agonara-admin` (over the api-access + membership foundations) can complete the
admin job end-to-end through the API — including the **last-admin invariant
rejection** — and capture the transcript as evidence, satisfying G5 for the admin
skill.

## Execution mode

```
Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gate, no reachable instance, missing Admin/bootstrap credentials, destructive operations beyond the scripted arc, explicit user interruption
Push policy: push at closeout
```

## Prerequisites

- A reachable Agonara instance (project compose stands one up locally). A **fresh**
  instance is preferred so the bootstrap step is live rather than contract-reasoned.
- Either the **bootstrap secret** for a fresh instance (to exercise ADM-01 live) or
  Admin credentials for an existing instance.
- A program with at least one identity holding membership, so the membership
  recovery/revocation arc has real state to act on.
- The `agonara-admin` skill plus the two foundations loaded into the agent.

If any prerequisite is missing, stop and report — do not fabricate a transcript.
Where a fresh instance is unavailable, mark the bootstrap step *contract-reasoned*
rather than skipping the rest.

## G5 — the journey to verify

Drive the full admin arc through the API (the SKILL.md is the script), and record
request/response envelopes for each step:

1. **Bootstrap & identities** — `GET /identity/bootstrap/status`; on a fresh
   instance `POST /identity/bootstrap/admin` and confirm the `agonara_session`
   cookie is set (ADM-01); then re-call bootstrap and **confirm the second attempt
   is rejected `bootstrap_already_completed`**. Create an identity
   (`POST /identity/identities`), bind a credential
   (`POST /identity/identities/{id}/local-password`), and **prove identity ≠
   credential**: the identity exists before binding and a second bind conflicts
   (`identity_already_has_credential` / `login_already_bound`). Disable an identity
   (`POST /identity/identities/{id}/disable`) and confirm via
   `GET /identity/identities` that it reads as disabled **and its historical
   references survive** (ADM-04, ADM-05).
2. **Admin authority & the last-admin invariant** — grant Admin to the new identity
   (`POST /identity/identities/{id}/admin`), confirm via
   `GET /identity/identities/{id}/operational-access` that it now holds Admin
   **but no Student/Curator authority** (ADM-08); revoke it
   (`DELETE …/admin`). Then **attempt to remove the last active Admin** (revoke the
   sole remaining Admin, or disable its identity) and **capture the
   `last_admin_removal` rejection** (ADM-09) — the load-bearing assertion of this
   verification. Confirm the grant-new-before-revoke-old transfer path succeeds
   where the reverse is refused.
3. **Access inspection & audit** — read `GET /identity/identities/{id}/operational-access`
   as a current snapshot (ADM-06) and `GET /identity/audit-events` (paged) and
   confirm the identity/credential/admin operations above appear **attributed**
   (acting Admin + affected subject) with **sensitive values redacted** (ADM-07,
   ADM-10).
4. **Exceptional membership recovery & audit** — inspect membership state via
   `GET /programs/{id}/membership-events` and the membership foundation (ADM-12);
   run a recovery (`POST /admin/program-memberships/recovery` with
   `{programId,identityId,participationKind,reason}`) and a revocation
   (`POST /admin/program-memberships/revocation`, same body), then confirm via
   `membership-events` + `audit-events` that each change is **logged with the
   acting identity, affected identity, program, participation kind, and resulting
   state**, and that the truthful `reason` is preserved (ADM-13, ADM-14, ADM-15).

### ADM coverage

The transcript above exercises the core arc. For closeout, record an explicit
**ADM-01…10, ADM-12…15 coverage table** marking each story as *live-verified* in
the transcript or, where the test instance lacks the data to trigger it (e.g. no
recoverable broken membership), *contract-reasoned* with the route that would
serve it — so the done-criterion "each is reachable" is auditable rather than
assumed. **ADM-11 stays out of scope** (deployment-host backup/restore, not an API
operation) and is noted, not verified here.

## Boundary/invariant spot-checks (G3/G4 against live data)

While the instance is up, confirm the boundaries hold in practice, not just on
paper:

- A non-Admin session is **rejected** (`admin_required`) when reaching an admin
  route (e.g. `GET /identity/identities`, `POST /admin/program-memberships/recovery`)
  — capture the reason.
- Removing the last active Admin is rejected `last_admin_removal` (step 2).
- Admin authority does **not** confer Student/Curator participation: after granting
  Admin, `operational-access` and effective-participation reads show no program
  participation was created.
- The skill performs **no** learning-domain read/mutation (no corpus, candidate,
  check, attempt, or learner-state call appears in the transcript).

## Done criteria

- A captured transcript shows steps 1–4 completing through the API with an Admin
  session, including the `bootstrap_already_completed`, `last_admin_removal`, and
  attribution/redaction assertions.
- An ADM-01…10, ADM-12…15 coverage table marks each story live-verified or
  contract-reasoned (with the serving route); ADM-11 noted out-of-scope.
- The boundary/invariant spot-checks pass (non-admin rejected `admin_required`;
  last-admin removal refused; admin grants no learning authority; no
  learning-domain access).
- `docs/log.md` records G5 as satisfied for the admin skill, and this plan is moved
  to `docs/plans/implemented/byoa-skills-admin-live-verification.md`.

## Closeout

```
Final gate: G5 (live-instance transcript + boundary/invariant spot-checks)
Archive plan: move to docs/plans/implemented/byoa-skills-admin-live-verification.md
Commit archive move: yes
Push/PR: push at closeout; PR per repo conventions only if requested
```
