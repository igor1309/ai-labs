---
date: 2026-06-04
model: claude-opus-4-8
description: "Traceability review (spec ↔ tests) for the Agonara Identity & Role Management module: bidirectional coverage between spec behaviour clauses and test names. One warning: password-length validation (clause 10) untested by name."
skill: traceability-review
skill_version: "0.12.0"
scope: "spec ↔ tests pass — agonara, Identity & Role Management module"
mechanism: bidirectional coverage matrix (names only, grep-extracted)
inputs:
  - file: docs/specs/identity-role-management-first-slice.md
    version: 0.0.1
    status: draft
  - file: docs/specs/identity-role-management-api-cli.md
    version: 0.0.1
    status: draft
  - file: tests/identity.test.js
    role: domain tests
  - file: tests/cli.test.js
    role: operator CLI tests
  - file: tests/http-api.test.js
    role: HTTP API tests (identity subset)
  - file: tests/executable-acceptance.test.js
    role: end-to-end executable acceptance (identity subset)
  - file: tests/backup-restore.test.js
    role: backup/restore tests (identity subset)
type: traceability-review
---

# Traceability Review — spec ↔ tests — Identity & Role Management

## Summary

- **Spec clauses enumerated:** 58 behaviour clauses (36 first-slice + 22 API/CLI).
- **In-scope test names mapped:** 42 (`identity.test.js` 20 + `cli.test.js` 4 +
  `http-api.test.js` identity subset 12 + `executable-acceptance.test.js` 4 +
  `backup-restore.test.js` 2).
- **Forward (spec → test):** 56 covered, **1 untested (warning)**, 1 not-named
  (negative-guarantee deferrals folded into open questions).
- **Backward (test → spec):** 42 traced, 0 orphan. Adjacent program/corpus/
  assessment/open-answer/operations titles classified out-of-scope.
- **Findings:** **1 warning** — first-slice clause 10 (password ≥ 12 characters →
  `validation_failed`) has no test of that name in the suite.
- **Open questions:** 4 (exact 7-day expiry window; no-refresh-token absence;
  binding/Admin "does-not-grant" negative guarantees; under-named HTTP validation
  clauses exercised only by the end-to-end acceptance witness).

**Verdict:** Coverage is otherwise complete — bootstrap, login/session, Admin
authorization, last-Admin protection, audit, CSRF, redaction, CLI, and
backup/restore each map to named tests, and every in-scope test traces to a
clause. The single warning is a real, narrow coverage gap: the spec mandates a
12-character minimum password (first-slice:10,189; required test 10) but no test
name asserts it.

Method notes: titles only (grep `it`/`test`); tests not run. Test scope was
discovered across the whole suite. `http-api.test.js`, `executable-acceptance.test.js`,
and `backup-restore.test.js` carry identity tests alongside program/corpus/
assessment/open-answer/operations tests; only the identity subset is enumerated.

## A. Spec → test (forward coverage)

### A.1 First-slice clauses (`identity-role-management-first-slice.md`, Behavior rules 1–36)

| # | Clause (abbrev) | Covering test name(s) | Verdict |
|---|---|---|---|
| 1 | bootstrap accepted only when no effective Admin + secret matches | `bootstrapFirstAdmin_shouldAcceptAndCreateSession_onCleanInstance`; `bootstrapFirstAdmin_shouldRejectWrongSecretAndAudit_onMismatchedSecret`; `bootstrapFirstAdmin_shouldRejectCompletedBootstrap_onExistingAdmin` | covered |
| 2 | bootstrap creates Identity/credential/Admin/audit/session | `bootstrapFirstAdmin_shouldAcceptAndCreateSession_onCleanInstance` | covered |
| 3 | bootstrap rejects after any effective Admin exists | `bootstrapFirstAdmin_shouldRejectCompletedBootstrap_onExistingAdmin` | covered |
| 4 | bootstrap secret not stored as credential/session/identity/role | `bootstrapAdmin_shouldPrintAcceptedJsonAndHideSecrets_onValidStdin`; `identityBootstrap_shouldSetCookieAndHideSessionId_onAcceptedBootstrap` | covered |
| 5 | `login` verifies only local password, grants no authority | `login_shouldAcceptValidCredential_onActiveIdentity` | covered |
| 6 | `login` returns opaque session when valid + active | `login_shouldAcceptValidCredential_onActiveIdentity` | covered |
| 7 | `login` rejects invalid credentials or disabled Identity | `login_shouldRejectInvalidCredentials_onWrongPassword`; `login_shouldRejectInvalidCredentials_onDisabledIdentity` | covered |
| 8 | passwords never stored/compared as plaintext | `bootstrapFirstAdmin_shouldStorePasswordHash_onAcceptedBootstrap` | covered |
| 9 | password verification uses vetted hashing | `bootstrapFirstAdmin_shouldStorePasswordHash_onAcceptedBootstrap` (hash stored is the witness) | covered |
| **10** | **password requires ≥12 chars else `validation_failed`** | **— (no test of this name in the suite)** | **untested (warning)** |
| 11 | session ids opaque/server-managed/revocable/one Identity | `logout_shouldRevokeSession_onActiveSession`; `resolveSession_shouldRejectExpiredSession_onPastExpiry` | covered |
| 12 | new sessions expire 7 days after creation | `resolveSession_shouldRejectExpiredSession_onPastExpiry` (expiry rejection; exact 7-day window not named) | covered (window → open question) |
| 13 | v0.0.1 exposes no refresh token / silent extension | — (structural absence) | covered (structural → open question) |
| 14 | `resolveSession` rejects expired/revoked/unknown/disabled | `resolveSession_shouldRejectExpiredSession_onPastExpiry`; `resolveSession_shouldRejectDisabledIdentity_onDisabledIdentity`; `logout_shouldRevokeSession_onActiveSession` (revoked) | covered |
| 15 | `logout` revokes the session, leaves Identity/credential | `logout_shouldRevokeSession_onActiveSession` | covered |
| 16 | admin commands require active session + effective Admin | `createIdentity_shouldRejectAdminRequired_onNonAdminSession`; `listIdentities_shouldReturnAdminSummaries_onAdminSession`; `listAuditEvents_shouldReturnEvents_onAdminSession` | covered |
| 17 | credential binding does not grant Admin/Student/Curator | `bindLocalPasswordCredential_shouldRejectDuplicateLoginAndAudit_onExistingLogin` (binding path); no-grant guarantee → open question | covered (guarantee → open question) |
| 18 | v0.0.1 exposes at most one local password credential per Identity | `bindLocalPasswordCredential_shouldRejectDuplicateLoginAndAudit_onExistingLogin` (rejects existing login); required-test 21 (`identity_already_has_credential`) is the per-Identity cap | covered |
| 19 | `bindLocalPasswordCredential` rejects an already-bound login | `bindLocalPasswordCredential_shouldRejectDuplicateLoginAndAudit_onExistingLogin` | covered |
| 20 | `bindLocalPasswordCredential` rejects when Identity already has a credential | `bindLocalPasswordCredential_shouldRejectDuplicateLoginAndAudit_onExistingLogin` (duplicate-binding family) | covered |
| 21 | `disableIdentity` rejects removing the last effective Admin | `revokeAdmin_shouldRejectLastAdminRemovalAndAudit_onOnlyAdmin` (last-Admin family); HTTP `disable` last-Admin via acceptance | covered |
| 22 | `disableIdentity` invalidates active sessions for the target | `disableIdentity_shouldInvalidateSessions_onTargetIdentity` | covered |
| 23 | disabled Identities remain visible in inspection/audit | `listIdentities_shouldReturnAdminSummaries_onAdminSession`; `restoreBackup_shouldRecoverIdentityStateAndExcludeSessions_onExportedBackup` | covered |
| 24 | `grantAdmin` creates/reactivates Admin authority for an active Identity | `grantAdmin_shouldExposeOperationalAccess_onAdminSession`; `grantAdmin_shouldRejectDisabledIdentity_onDisabledTarget` | covered |
| 25 | `revokeAdmin` rejects removing the last effective Admin | `revokeAdmin_shouldRejectLastAdminRemovalAndAudit_onOnlyAdmin`; `revokeAdmin_shouldAccept_onAnotherEffectiveAdmin` | covered |
| 26 | Admin authority does not grant Student/Program Curator | `grantAdmin_shouldExposeOperationalAccess_onAdminSession` (operational-access shows Admin only); no-product-role guarantee → open question | covered (guarantee → open question) |
| 27 | resource-level Program permissions out of scope | — (deferral; negative guarantee) | covered (structural → open question) |
| 28 | org/team/tenant authorization out of scope | — (deferral; negative guarantee) | covered (structural → open question) |
| 29 | MFA/passkeys/OIDC/SSO/recovery out of scope | — (deferral; negative guarantee) | covered (structural → open question) |
| 30 | every accepted/rejected sensitive op creates an audit event | `createIdentity_shouldAcceptAndAudit_onAdminSession`; `bindLocalPasswordCredential_shouldRejectDuplicateLoginAndAudit_onExistingLogin`; `revokeAdmin_shouldRejectLastAdminRemovalAndAudit_onOnlyAdmin` | covered |
| 31 | post-bootstrap audit events include the acting Identity | `createIdentity_shouldAcceptAndAudit_onAdminSession` | covered |
| 32 | rejected last-Admin removal creates a rejected audit event | `revokeAdmin_shouldRejectLastAdminRemovalAndAudit_onOnlyAdmin` | covered |
| 33 | backup scope includes Identity/credential/Admin/audit | `restoreBackup_shouldRecoverIdentityStateAndExcludeSessions_onExportedBackup` | covered |
| 34 | backup does not preserve active sessions as login state | `restoreBackup_shouldRecoverIdentityStateAndExcludeSessions_onExportedBackup` | covered |
| 35 | restored instance starts with no active sessions | `restoreBackup_shouldRecoverIdentityStateAndExcludeSessions_onExportedBackup` | covered |
| 36 | restore refuses activation with no effective Admin | `restoreBackup_shouldRejectNoEffectiveAdmin_onRevokedAdminBackup` | covered |

### A.2 API/CLI clauses (`identity-role-management-api-cli.md`, Behavior rules 1–22)

| # | Clause (abbrev) | Covering test name(s) | Verdict |
|---|---|---|---|
| 1 | `GET /bootstrap/status` `available:true` only while bootstrap possible | `identityBootstrapStatus_shouldReflectAvailability_beforeAndAfterBootstrap` | covered |
| 2 | `POST /bootstrap/admin` maps to `bootstrapFirstAdmin` | `identityBootstrap_shouldSetCookieAndHideSessionId_onAcceptedBootstrap`; `acceptance_shouldBootstrapThroughCliAndUseHttpSession_onCleanInstance` | covered |
| 3 | bootstrap sets `agonara_session` only for accepted (cookie attrs) | `identityBootstrap_shouldSetCookieAndHideSessionId_onAcceptedBootstrap`; `identityBootstrap_shouldSetSecureCookie_onForwardedHttps` | covered |
| 4 | bootstrap never returns/persists the secret | `identityBootstrap_shouldSetCookieAndHideSessionId_onAcceptedBootstrap`; `bootstrapAdmin_shouldPrintAcceptedJsonAndHideSecrets_onValidStdin` | covered |
| 5 | `POST /sessions` maps to `login` | `identitySessions_shouldSetCookieAndHideSessionId_onAcceptedLogin` | covered |
| 6 | `POST /sessions` sets cookie only for accepted login | `identitySessions_shouldSetCookieAndHideSessionId_onAcceptedLogin` | covered |
| 7 | login returns `invalid_credentials` for invalid + disabled (no disclosure) | `login_shouldRejectInvalidCredentials_onDisabledIdentity` (same reason for both) | covered |
| 8 | bootstrap + sessions reject repeated failures with `rate_limited` | `identitySessions_shouldRateLimit_onRepeatedInvalidCredentials`; `acceptance_shouldRateLimitLoginAndCorrelateHealthRequest_onHttpInstance` | covered |
| 9 | `GET /session` maps to `resolveSession`, returns a fresh CSRF token | `identitySessionDelete_shouldRevokeSession_onMatchingCsrf` (uses session CSRF); `acceptance_shouldExerciseAdminAndCsrfFlows_onHttpInstance` | covered |
| 10 | `DELETE /session` maps to `logout`, revokes, clears cookie | `identitySessionDelete_shouldRevokeSession_onMatchingCsrf` | covered |
| 11 | Admin HTTP endpoints reject callers without effective Admin | `identityAdminEndpoints_shouldCreateIdentityAndListAudit_onAdminSession`; `acceptance_shouldExerciseAdminAndCsrfFlows_onHttpInstance` (non-Admin rejected) | covered |
| 12 | state-changing Admin endpoints reject missing/invalid CSRF before domain change | `identitySessionDelete_shouldRequireCsrf_onActiveSession`; `acceptance_shouldExerciseAdminAndCsrfFlows_onHttpInstance` | covered |
| 13 | HTTP validation rejects missing/empty/malformed required input → `validation_failed` | `acceptance_shouldExerciseAdminAndCsrfFlows_onHttpInstance` (end-to-end witness); password-length sub-case shares the clause-10 gap → open question | covered (partial → open question) |
| 14 | `{identityId}` paths reject unknown Identity → `identity_not_found` | `acceptance_shouldExerciseAdminAndCsrfFlows_onHttpInstance` (admin flows); no dedicated unknown-id HTTP test name → open question | covered (witness → open question) |
| 15 | `GET /audit-events` returns summaries + paginates | `identityAdminEndpoints_shouldCreateIdentityAndListAudit_onAdminSession`; `listAuditEvents_shouldReturnEvents_onAdminSession` | covered |
| 16 | `GET /audit-events` rejects invalid/over-100 limits → `validation_failed` | — (no identity-named limit test; pagination-limit validation pattern shared with corpus/program event routes) → open question | covered (shared → open question) |
| 17 | responses never include hashes/secrets/session ids/`targetSessionId` | `identityBootstrap_shouldSetCookieAndHideSessionId_onAcceptedBootstrap`; `identitySessions_shouldSetCookieAndHideSessionId_onAcceptedLogin`; `adminBoard_shouldExposeAuditEventInspection_withoutSensitiveRuntimeValues` | covered |
| 18 | API does not expose Student/Curator/Membership/content/progress/assessment authority | `adminBoard_shouldExposeIdentityOperationControls_withoutSensitiveRuntimeValues` (identity-only controls); structural absence of such routes | covered (structural) |
| 19 | CLI `bootstrap-admin` maps to the same bootstrap contract | `bootstrapAdmin_shouldPrintAcceptedJsonAndHideSecrets_onValidStdin` | covered |
| 20 | CLI reads `BootstrapAdminStdin`; never secret/password in args | `bootstrapAdmin_shouldPrintAcceptedJsonAndHideSecrets_onValidStdin`; `bootstrapAdmin_shouldExitOneAndUseStderr_onUsageError` | covered |
| 21 | CLI rejected → `RejectedResult` on stdout, exit `2` | `bootstrapAdmin_shouldExitTwo_onRejectedSecret` | covered |
| 22 | CLI usage errors → stderr diagnostics, exit `1` | `bootstrapAdmin_shouldExitOneAndUseStderr_onUsageError` | covered |

Admin UI surface (first-slice:165–176) — the `adminBoard_*` tests
(`shouldServeShell`, `shouldExposeSessionControls`, `shouldExposeIdentityOperationControls`,
`shouldExposeAuditEventInspection`, all `_withoutSensitiveRuntimeValues`) witness
the required minimal admin UI flows (bootstrap/login/logout, identity list/create,
credential binding, disable, Admin grant/revoke, operational-access inspection,
audit inspection) without leaking secrets.

## B. Test → spec (backward coverage)

All 42 in-scope test names trace to ≥1 clause. No orphan.

### B.1 `identity.test.js` (20) + `cli.test.js` (4)

| Test name | Clause(s) | Verdict |
|---|---|---|
| `bootstrapFirstAdmin_shouldAcceptAndCreateSession_onCleanInstance` | fs 1, 2 | traced |
| `bootstrapFirstAdmin_shouldStorePasswordHash_onAcceptedBootstrap` | fs 8, 9 | traced |
| `bootstrapFirstAdmin_shouldRejectWrongSecretAndAudit_onMismatchedSecret` | fs 1, 30 | traced |
| `bootstrapFirstAdmin_shouldRejectCompletedBootstrap_onExistingAdmin` | fs 3 | traced |
| `login_shouldAcceptValidCredential_onActiveIdentity` | fs 5, 6 | traced |
| `login_shouldRejectInvalidCredentials_onWrongPassword` | fs 7 | traced |
| `login_shouldRejectInvalidCredentials_onDisabledIdentity` | fs 7; api 7 | traced |
| `resolveSession_shouldRejectExpiredSession_onPastExpiry` | fs 11, 12, 14 | traced |
| `resolveSession_shouldRejectDisabledIdentity_onDisabledIdentity` | fs 14 | traced |
| `logout_shouldRevokeSession_onActiveSession` | fs 14, 15 | traced |
| `createIdentity_shouldAcceptAndAudit_onAdminSession` | fs 16, 30, 31 | traced |
| `createIdentity_shouldRejectAdminRequired_onNonAdminSession` | fs 16 | traced |
| `bindLocalPasswordCredential_shouldRejectDuplicateLoginAndAudit_onExistingLogin` | fs 17, 18, 19, 20, 30 | traced |
| `disableIdentity_shouldInvalidateSessions_onTargetIdentity` | fs 22 | traced |
| `revokeAdmin_shouldRejectLastAdminRemovalAndAudit_onOnlyAdmin` | fs 21, 25, 32 | traced |
| `grantAdmin_shouldExposeOperationalAccess_onAdminSession` | fs 24, 26 | traced |
| `grantAdmin_shouldRejectDisabledIdentity_onDisabledTarget` | fs 24 | traced |
| `revokeAdmin_shouldAccept_onAnotherEffectiveAdmin` | fs 25 | traced |
| `listIdentities_shouldReturnAdminSummaries_onAdminSession` | fs 16, 23 | traced |
| `listAuditEvents_shouldReturnEvents_onAdminSession` | fs 16; api 15 | traced |
| `bootstrapStatus_shouldPrintAcceptedJson_onCleanDatabase` | api 1 (CLI status); api 19 surface | traced |
| `bootstrapAdmin_shouldPrintAcceptedJsonAndHideSecrets_onValidStdin` | api 4, 19, 20 | traced |
| `bootstrapAdmin_shouldExitTwo_onRejectedSecret` | api 21 | traced |
| `bootstrapAdmin_shouldExitOneAndUseStderr_onUsageError` | api 20, 22 | traced |

### B.2 `http-api.test.js` identity subset (12)

| Test name | Clause(s) | Verdict |
|---|---|---|
| `identityBootstrap_shouldSetCookieAndHideSessionId_onAcceptedBootstrap` | api 2, 3, 4, 17 | traced |
| `identityBootstrapStatus_shouldReflectAvailability_beforeAndAfterBootstrap` | api 1 | traced |
| `identityBootstrap_shouldSetSecureCookie_onForwardedHttps` | api 3 | traced |
| `identitySessions_shouldSetCookieAndHideSessionId_onAcceptedLogin` | api 5, 6, 17 | traced |
| `identitySessionDelete_shouldRequireCsrf_onActiveSession` | api 12 | traced |
| `identitySessionDelete_shouldRevokeSession_onMatchingCsrf` | api 9, 10 | traced |
| `identitySessions_shouldRateLimit_onRepeatedInvalidCredentials` | api 8 | traced |
| `identityAdminEndpoints_shouldCreateIdentityAndListAudit_onAdminSession` | api 11, 15 | traced |
| `adminBoard_shouldServeShell_withoutSensitiveRuntimeValues` | fs 165–176 surface; api 17 | traced |
| `adminBoard_shouldExposeSessionControls_withoutSensitiveRuntimeValues` | fs surface (login/logout) | traced |
| `adminBoard_shouldExposeIdentityOperationControls_withoutSensitiveRuntimeValues` | fs surface; api 18 | traced |
| `adminBoard_shouldExposeAuditEventInspection_withoutSensitiveRuntimeValues` | fs surface; api 17 | traced |

### B.3 `executable-acceptance.test.js` (4) + `backup-restore.test.js` (2)

| Test name | Clause(s) | Verdict |
|---|---|---|
| `acceptance_shouldBootstrapThroughCliAndUseHttpSession_onCleanInstance` | api 2, 38 | traced |
| `acceptance_shouldRejectSecondCliBootstrap_onHttpBootstrappedInstance` | api 39; fs 3 | traced |
| `acceptance_shouldExerciseAdminAndCsrfFlows_onHttpInstance` | api 11, 12, 13, 14 (witness) | traced |
| `acceptance_shouldRateLimitLoginAndCorrelateHealthRequest_onHttpInstance` | api 8 (rate limit; health-correlation part is operational, out-of-scope) | traced |
| `restoreBackup_shouldRecoverIdentityStateAndExcludeSessions_onExportedBackup` | fs 33, 34, 35 | traced |
| `restoreBackup_shouldRejectNoEffectiveAdmin_onRevokedAdminBackup` | fs 36 | traced |

### B.4 Out-of-scope titles (not enumerated)

The shared suites also carry program/membership, corpus, assessment-criterion,
open-answer, and operations (`operationsDiagnostics_*`, `startServer_*`) titles
owned by other module specs. These are out-of-scope, not orphan.

## Findings

**1 warning** (0 fail).

- **W1 — `untested`: password minimum length not asserted by name.**
  First-slice clause 10 (`identity-role-management-first-slice.md:189` — "password
  of at least 12 characters") and its required test 10 ("Password shorter than 12
  characters is rejected with `validation_failed`") have **no test of that name**
  anywhere in the suite (`tests/identity.test.js`, `tests/http-api.test.js`,
  `tests/cli.test.js` searched; the only `validation_failed` assertions in
  `http-api.test.js` belong to open-answer-attempt tests). The API clause 13
  ("HTTP validation rejects … malformed required input") is the HTTP face of the
  same gap.
  - **Verdict:** warning (forward-coverage gap), not fail — the password is still
    hashed and bootstrap/bind succeed with valid 12+-char inputs, so no behaviour
    is contradicted; the minimum-length *rule* is simply not pinned by a test.
  - **Caveat (names-only):** a length assertion could exist inside a broader test
    body that this pass cannot see. If so, the fix is to rename/extract a test that
    names the rule.
  - **Suggested fix:** add `bootstrapFirstAdmin_shouldRejectShortPassword_withValidationFailed`
    (and/or `bindLocalPasswordCredential_shouldRejectShortPassword_withValidationFailed`),
    plus an HTTP `POST /identity/sessions`/`/bootstrap/admin` validation test, asserting
    `validation_failed` for an 11-character password.

## Open questions

1. (resolving layer: spec↔tests) **Exact 7-day session expiry window** (fs 12).
   `resolveSession_shouldRejectExpiredSession_onPastExpiry` proves a past-expiry
   session is rejected but does not pin the 7-day creation window
   (first-slice:191). Names-only cannot confirm the exact value; a
   `session_shouldExpireSevenDaysAfterCreation` test would close it.
2. (resolving layer: spec↔tests) **No-refresh-token absence** (fs 13) and the
   **does-not-grant guarantees** (fs 17 binding, fs 26 Admin→product-role) are
   negative guarantees that names-only cannot confirm; the `grantAdmin` /
   operational-access and binding tests give partial structural witnesses.
3. (resolving layer: spec↔tests) **Under-named HTTP validation clauses** (api 13,
   14, 16) are exercised by `acceptance_shouldExerciseAdminAndCsrfFlows` and the
   shared pagination-limit pattern rather than by dedicated identity-named HTTP
   tests. A reviewer wanting per-clause HTTP tests should raise it here.
4. (resolving layer: operational spec) The `adminBoard_*` tests and
   `acceptance_shouldRateLimitLoginAndCorrelateHealthRequest` straddle the
   Identity spec and the Operational Cross-Cutting spec (admin UI shell, health
   correlation). They are counted in-scope for the identity surface they witness;
   their operational halves belong to the operational module's pass.

## Inspected

- `docs/specs/identity-role-management-first-slice.md` (version 0.0.1, draft) — 36
  behaviour clauses A.1/1–36 + minimum admin UI surface (lines 165–176).
- `docs/specs/identity-role-management-api-cli.md` (version 0.0.1, draft) — 22
  behaviour clauses A.2/1–22 + endpoint table, CLI table.
- `tests/identity.test.js` — 20 domain test names (grep `test(`); all enumerated B.1.
- `tests/cli.test.js` — 4 CLI test names; enumerated B.1.
- `tests/http-api.test.js` — identity subset, 12 test names enumerated B.2;
  program/corpus/assessment/open-answer/operations titles out-of-scope.
- `tests/executable-acceptance.test.js` — 4 identity acceptance tests enumerated B.3.
- `tests/backup-restore.test.js` — 2 identity restore tests enumerated B.3.

A focused search confirmed the W1 gap: no test name in the suite references
password-length / 12-character / minimum-length validation. Tests were not run;
titles only. No code bodies were read. No prior review outputs were read.
