---
date: 2026-06-07
model: gpt-5
description: "BYOA Admin skill verification evidence"
---

# BYOA Admin Skill Verification

## Scope

This verifies `agonara/skills/agonara-admin/SKILL.md`, the Admin BYOA operator
skill created from `agonara/docs/plans/implemented/byoa-skills-admin.md`.

## Live HTTP Gate

Command:

```bash
PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "admin skill live gate" node --test --test-name-pattern "acceptance_shouldExerciseAdminAndCsrfFlows_onHttpInstance|acceptance_shouldExerciseControlledProgramMembershipLifecycle_onHttpInstance" agonara/tests/executable-acceptance.test.js
```

Result: pass.

Covered flows:

- First-Admin bootstrap over HTTP.
- CSRF rejection and CSRF-protected identity creation.
- Local-password credential binding and non-Admin denial.
- Admin grant/revoke and last-Admin removal rejection.
- Identity audit-event read.
- Invitation-only program membership lifecycle.
- Admin exceptional membership recovery and revocation.
- Program membership-event history read.

## Contract-Grounding Gate

Result: pass.

The skill's cited Admin routes are present in `agonara/docs/api/openapi.yml`:

- `GET /identity/bootstrap/status`
- `POST /identity/bootstrap/admin`
- `GET` / `POST /identity/identities`
- `POST /identity/identities/{identityId}/local-password`
- `POST /identity/identities/{identityId}/disable`
- `POST` / `DELETE /identity/identities/{identityId}/admin`
- `GET /identity/identities/{identityId}/operational-access`
- `GET /identity/audit-events`
- `GET /programs/{programId}/membership-events`
- `POST /admin/program-memberships/recovery`
- `POST /admin/program-memberships/revocation`

During verification, the Admin membership recovery/revocation request bodies in
OpenAPI were corrected to match the implemented runtime fields:
`targetIdentityId`, `recoveryReason`, and `revocationReason`.

## Portability And Role Scope

Result: pass.

The skill states only the portable assumptions: instance URL, Admin credentials
or first-bootstrap secret, and the OpenAPI contract. Static scan found no
references to source files, test harnesses, workspace commands, TypeScript
tooling, Swift tooling, worktrees, or agent-runtime-specific behavior.

The skill remains Admin-scoped: it excludes curation, learning, shared
membership basics, normal participant management, and host-side data recovery.

## Skill Review

Verdict: pass.

- Front matter includes `name`, `author`, `version`, `description`, and
  `trigger`; the description names what the skill does and when it should be
  selected.
- Signal is route-centered and Agonara-specific. It does not repeat generic HTTP
  advice or duplicate the shared auth/envelope mechanics from
  `agonara-api-access`.
- The last-Admin invariant, disable-preserves-history rule, credential versus
  identity boundary, Admin-versus-program-participation boundary, and
  exceptional-membership framing are explicit.
- The skill is under 500 lines and has no extra bundled files.

## Verification Commands

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "admin skill live gate" node --test --test-name-pattern "acceptance_shouldExerciseAdminAndCsrfFlows_onHttpInstance|acceptance_shouldExerciseControlledProgramMembershipLifecycle_onHttpInstance" agonara/tests/executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "tests" npm test`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `./scripts/loc-dashboard.sh --sort=name`
- `git diff --check`
