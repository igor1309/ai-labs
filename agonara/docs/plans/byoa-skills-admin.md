---
date: 2026-06-07
model: claude
description: "Implementation plan: the Admin BYOA operator skill for Agonara — instance setup, identity/credential administration, admin authority, and membership recovery/audit — grounded in the OpenAPI contract."
---

# BYOA Operator Skills — Admin

Implements the **third role** of the build sequence in
[`byoa-operator-skills.md`](byoa-operator-skills.md). Admin is plausibly a single
skill initially (the brief), built in dependency-ordered phases. Grounded in
[`../api/openapi.yml`](../api/openapi.yml) and
[`../intent/admin_user_stories.md`](../intent/admin_user_stories.md).

**Depends on `byoa-skills-foundations.md` (api-access + membership).**

## Goal

Deliver `agonara/skills/agonara-admin/` so an agent operating an Agonara private
instance can initialize it, administer identities and credential bindings,
assign/revoke admin authority within the invariants, and perform exceptional
membership recovery/revocation with audit — through the contract, without
becoming the normal operator of learning participation and without touching
learning-domain content.

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
Expected worktree: worktrees/byoa-skills-admin
Expected branch: <author>/byoa-skills-admin
Preflight check: [ ] done
```

Preflight: confirm worktree/branch before each phase.

## Scope guardrails

- **Admin jobs only.** No curation/authoring, no student learning flows. Admin
  authority does not satisfy curator/student participation and the skill must
  not present it as a way to curate or learn.
- **Exceptional, not normal-flow.** Admin membership operations are *recovery and
  audit*, not the everyday join/invite/leave/curate path. The skill must frame
  them that way and defer normal participation to curator/student skills +
  shared membership.
- **Lean on foundations.** Auth/CSRF/idempotency/envelope from `agonara-api-access`;
  the participation model from `agonara-membership`. Reference, don't restate.
- **Contract is the substrate.** Every cited operation exists in
  `../api/openapi.yml`. No `src/`, tests, tooling, or runtime assumptions.
- **Invariant-safe.** The skill must encode the last-admin invariant (ADM-09):
  never drive a sequence that removes/disables/revokes the last active admin, and
  expect/handle the API's rejection. Disabling an identity stops new actions but
  preserves historical references (ADM-04). Sensitive operations are attributable
  (ADM-10).
- **Boundary-safe.** The skill must not read or mutate learning-domain content
  (corpus, checks, attempts, progress); admin inspects participation authority
  without becoming its operator (ADM-06, ADM-12).
- **No discovery/publishing, no product repositioning.** Same exclusions as the
  foundations plan.

## Product intent traceability

| Phase | Stories delivered |
|---|---|
| Phase 1 — Bootstrap & identities | ADM-01, ADM-02, ADM-03, ADM-04, ADM-05 |
| Phase 2 — Admin authority & access inspection | ADM-06, ADM-07, ADM-08, ADM-09, ADM-10 |
| Phase 3 — Membership recovery & audit | ADM-12, ADM-13, ADM-14, ADM-15 |

ADM-11 (identity state in backup/restore) is an instance **operational** concern
realized by deployment host scripts, not an API operation in the contract; it is
**out of scope for this API-grounded skill** and noted under
`docs/deployment-discipline.md` rather than taught here.

## Validation gates (reused by every phase)

Same G1–G7 as `byoa-skills-foundations.md` (incl. **G7 skill review** — self +
adversarial), with admin specifics:

- **G1 Contract-grounded** — every cited admin operation exists in
  `../api/openapi.yml`.
- **G2 Portable** — no `src/`/tests/tooling/runtime references.
- **G3 Role-scoped** — only admin operations + the two foundations; no
  curation/learning operations.
- **G4 Ownership/invariant-safe** — the skill encodes the last-admin invariant,
  disable-preserves-history, attribution, exceptional-not-normal membership ops,
  and no learning-domain content access; admin inspects authority without
  operating participation.
- **G5 Live-instance** — against a running instance with an admin session, the
  job completes through the API (create identity → bind credential → inspect
  bindings; assign/revoke admin and observe last-admin rejection; inspect
  membership state → run a recovery → read membership/audit events).
- **G6 Docs gates** — README/skills listing, `docs/log.md`, dashboard refresh.

## Phase 1 — Bootstrap & identities

**Objective**: initialize an instance and administer identities and credential
bindings.

**Key work items**: SKILL.md (front-matter incl. `author: Igor Malyarov`)
teaching: check bootstrap status and create the first admin
(`GET /identity/bootstrap/status`, `POST /identity/bootstrap/admin`, ADM-01);
create internal identities independent of credentials/roles
(`POST /identity/identities`, ADM-02); bind credentials / set local password
(`POST /identity/identities/{id}/local-password`, ADM-03); disable an identity
preserving history (`POST /identity/identities/{id}/disable`, ADM-04); inspect
identities and bindings (`GET /identity/identities`, ADM-05). Stress identity is
the ownership subject, separate from credential and role.

**Dependencies**: foundations landed.

**Risks**: conflating identity with credential/role (G4); disable presented as
deletion (ADM-04).

**Validation**: G1–G5 for create identity → bind credential → inspect.

**Completion signal**: an admin agent initializes an instance and administers
identities/bindings through the API.

**Commit** after gates pass.

## Phase 2 — Admin authority & access inspection

**Objective**: transfer operational control safely and diagnose access.

**Key work items**: SKILL.md teaching: assign/revoke instance admin authority
(`POST`/`DELETE /identity/identities/{id}/admin`, ADM-08); the last-admin
invariant (ADM-09) — never sequence the removal of the last active admin, expect
the API rejection; inspect program participation authority and trace authority
changes without recreating access (`GET
/identity/identities/{id}/operational-access`, ADM-06,07); read attributable
audit events (`GET /identity/audit-events`, ADM-10). Stress admin authority is
instance-scoped and does not grant student/curator authority.

**Dependencies**: Phase 1.

**Risks**: driving a last-admin removal (G4/ADM-09); treating admin authority as
learning-domain authority (G3).

**Validation**: G1–G5 incl. observing the last-admin rejection.

**Completion signal**: an admin agent transfers control within the invariants and
diagnoses access read-only.

**Commit** after gates pass.

## Phase 3 — Membership recovery & audit

**Objective**: exceptional recovery and revocation of membership, with audit —
explicitly not the normal participation flow.

**Key work items**: SKILL.md teaching: inspect membership state
(`GET /programs/{id}/membership-events`, participation reads via shared
membership, ADM-12); recover broken membership access
(`POST /admin/program-memberships/recovery`, ADM-13) preserving attribution;
revoke operationally invalid membership
(`POST /admin/program-memberships/revocation`, ADM-14); confirm membership
changes are logged with attribution (ADM-15). Frame all of these as exceptional
recovery/audit, deferring normal join/invite/leave/curate to the curator/student
skills and `agonara-membership`.

**Dependencies**: foundations (membership) + Phase 1; independent of Phase 2.

**Risks**: presenting admin as the normal membership operator (G4); recovery
that drops attribution (ADM-13/15).

**Validation**: G1–G5 for inspect → recover → read audit.

**Completion signal**: an admin agent performs attributable, exceptional
membership recovery without becoming the normal participation operator.

**Commit** after gates pass.

## Phase 4 — Closeout

**Key work items**: list the skill in `agonara/skills/README.md` (and
`agonara/README.md` only if it enumerates surfaces/skills — not the repo-root
`## Components` table); `docs/log.md` entry; refresh `docs/loc-dashboard.html` if
substantial; move this plan to
`docs/plans/implemented/byoa-skills-admin.md` in the implementing PR.

**Validation**: G6.

**Completion signal**: skill discoverable, docs current, plan archived.

## Done criteria

- `agonara/skills/agonara-admin/` exists, contract-grounded, portable,
  role-scoped, invariant/ownership-safe.
- ADM-01…10 and ADM-12…15 are each reachable through an agent + the skill; the
  last-admin invariant, disable-preserves-history, attribution, and
  exceptional-membership framing hold across phases. ADM-11 is documented as
  out-of-scope (deployment-host operational), not silently dropped.
- Each phase passes G1–G5 with a live-instance transcript.
- README/skills listing, `docs/log.md`, dashboard (if substantial) updated; plan
  archived.

## Final closeout

```
Final gates: G1–G7 for the admin skill (contract spot-checks, portability scan, role-scope + invariant/ownership-safety review, skill review, live-instance transcript incl. last-admin rejection, docs/link checks, dashboard refresh-and-verify if substantial)
Archive plan: move to agonara/docs/plans/implemented/byoa-skills-admin.md
Commit archive move: yes
Push/PR: push at closeout; PR per repo conventions only if requested
```
