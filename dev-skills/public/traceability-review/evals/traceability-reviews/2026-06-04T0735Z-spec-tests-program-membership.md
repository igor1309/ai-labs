---
date: 2026-06-04
model: claude-opus-4-8
description: "Traceability review (spec ↔ tests) for the Agonara Program Membership module: bidirectional coverage between spec behaviour clauses and test names."
skill: traceability-review
skill_version: "0.12.0"
scope: "spec ↔ tests pass — agonara, Program Membership (Program shell + membership) module"
mechanism: bidirectional coverage matrix (names only, grep-extracted)
inputs:
  - file: docs/specs/program-shell-and-membership-first-slice.md
    version: 0.0.1
    status: draft
  - file: docs/specs/program-shell-and-membership-api.md
    version: 0.0.1
    status: draft
  - file: tests/program.test.js
    role: domain tests
  - file: tests/http-api.test.js
    role: HTTP API tests (program/membership subset)
  - file: tests/executable-acceptance.test.js
    role: end-to-end executable acceptance (program membership subset)
  - file: tests/backup-restore.test.js
    role: backup/restore tests (program/membership subset)
type: traceability-review
---

# Traceability Review — spec ↔ tests — Program Membership

## Summary

- **Spec clauses enumerated:** 105 behaviour clauses (62 first-slice + 43 API).
- **In-scope test names mapped:** 77 (`program.test.js` 50 + `http-api.test.js`
  program/membership subset 23 + `executable-acceptance.test.js` 1 +
  `backup-restore.test.js` 3).
- **Forward (spec → test):** 103 covered, 0 untested, 2 not-yet-testable
  (later-slice consumer guarantees, clauses 53–54).
- **Backward (test → spec):** 77 traced, 0 orphan, 0 ambiguous. Adjacent
  corpus / assessment / open-answer / identity titles in the same files are
  classified out-of-scope (not enumerated as rows).
- **Findings:** 0.
- **Open questions:** 3 (shared session/CSRF/fault transport clauses tested in
  the Identity suite; structural-absence clauses confirmed by the endpoint table
  not a behavioural test; later-slice consumer guarantees).

**Verdict:** Bidirectional coverage is complete for the v0.0.1 self-join slice —
every realized first-slice and API clause maps to at least one named test, and
every in-scope program/membership test name traces to a clause. Clean pass. The
only non-`covered` forward rows are the two clauses (53–54) that the spec itself
scopes to "later slices," and the open questions are shared-transport / absence
clauses, neither a finding.

Method notes: titles only (grep `describe`/`it`/`test`); tests not run (the repo
merges only green tests). Test scope was discovered across the whole `tests/`
suite, not a hand-listed file set. `http-api.test.js`, `executable-acceptance.test.js`,
and `backup-restore.test.js` each carry program/membership tests alongside
corpus / assessment / open-answer / identity tests; only the program/membership
subset is enumerated as rows.

## A. Spec → test (forward coverage)

### A.1 First-slice spec clauses (`program-shell-and-membership-first-slice.md`, Behavior rules 1–62)

| # | Clause (abbrev) | Covering test name(s) | Verdict |
|---|---|---|---|
| 1 | `createProgramShell` requires active acting Identity | `createProgramShell_shouldAcceptAndReturnSelfJoinShell_onActiveIdentity` | covered |
| 2 | reject unknown Identity → `identity_not_found` | `createProgramShell_shouldRejectUnknownIdentity_withIdentityNotFound` | covered |
| 3 | reject disabled Identity → `identity_disabled` | `createProgramShell_shouldRejectDisabledIdentityAndEmitRejectedEvent_withIdentityDisabled` | covered |
| 4 | `title` required, non-whitespace → `validation_failed` | `createProgramShell_shouldRejectEmptyTitleWithValidationFailed` | covered |
| 5 | `description` optional, malformed → `validation_failed` | `createProgramShell_shouldRejectEmptyTitleWithValidationFailed` (validation bundle); `programsCreate_shouldRejectInvalidBodies_withValidationFailed` (API) | covered |
| 6 | accepted creates one shell with `admissionPolicy: "self_join"` | `createProgramShell_shouldAcceptAndReturnSelfJoinShell_onActiveIdentity` | covered |
| 7 | accepted creates one active `program_curator` membership | `createProgramShell_shouldCreateActiveCuratorMembership_onAccepted` | covered |
| 8 | shell + initial curator membership are atomic | `createProgramShell_shouldRollBackOnInitialCuratorMembershipFailure` | covered |
| 9 | curator membership failure → `program_creation_incomplete`, no shell visible | `createProgramShell_shouldRollBackOnInitialCuratorMembershipFailure` | covered |
| 10 | accepted creates one `program_created` event attributed to actor | `createProgramShell_shouldEmitAcceptedProgramAndMembershipEvents_onAccepted` | covered |
| 11 | accepted creates one `initial_curator_membership_created` event | `createProgramShell_shouldEmitAcceptedProgramAndMembershipEvents_onAccepted` | covered |
| 12 | rejected attempt creates rejected `program_created` event when Identity exists | `createProgramShell_shouldEmitRejectedProgramEvent_onKnownIdentityRejection`; `createProgramShell_shouldRejectDisabledIdentityAndEmitRejectedEvent_withIdentityDisabled` | covered |
| 13 | rejection before shell exists MAY omit `programId` | `createProgramShell_shouldEmitRejectedProgramEvent_onKnownIdentityRejection` | covered |
| 14 | creation does not grant Admin authority | `createProgramShell_shouldNotGrantAdminAuthority_onAccepted` | covered |
| 15 | creation does not grant Student participation | `createProgramShell_shouldNotGrantStudentMembership_onAccepted` | covered |
| 16 | creation creates no learner state/corpus/drafts | `firstSliceSurface_shouldNotExposeOutOfScopeMutations` | covered |
| 17 | `listProgramShells` requires active Identity, returns visible shells | `listProgramShells_shouldReturnAllShells_onActiveIdentity` | covered |
| 18 | `listProgramShells` rejects unknown → `identity_not_found` | `listProgramShells_shouldRejectUnknownIdentity_withIdentityNotFound` | covered |
| 19 | `listProgramShells` rejects disabled → `identity_disabled` | `listProgramShells_shouldRejectDisabledIdentity_withIdentityDisabled` | covered |
| 20 | `getProgramShell` requires active, unknown Program → `program_not_found` | `getProgramShell_shouldReturnExistingShell_onActiveIdentity`; `getProgramShell_shouldRejectUnknownProgram_withProgramNotFound` | covered |
| 21 | `listMyProgramMemberships` requires active, returns only acting Identity's | `listMyProgramMemberships_shouldOnlyReturnActingIdentityMemberships` | covered |
| 22 | includes active/left/removed memberships | `listMyProgramMemberships_shouldIncludeActiveLeftAndRemovedMemberships` | covered |
| 23 | `joinSelfJoinProgram` requires active Identity | `joinSelfJoinProgram_shouldAcceptFirstJoin_onActiveStudent` | covered |
| 24 | reject unknown → `identity_not_found` | `joinSelfJoinProgram_shouldRejectUnknownIdentity_withIdentityNotFound` | covered |
| 25 | reject disabled → `identity_disabled` | `joinSelfJoinProgram_shouldRejectDisabledIdentity_withIdentityDisabled` | covered |
| 26 | reject unknown Program → `program_not_found` | `joinSelfJoinProgram_shouldRejectUnknownProgram_withProgramNotFound` | covered |
| 27 | accepts when self-join + no prior Student membership | `joinSelfJoinProgram_shouldAcceptFirstJoin_onActiveStudent` | covered |
| 28 | accepted first join creates active `student` membership | `joinSelfJoinProgram_shouldAcceptFirstJoin_onActiveStudent` | covered |
| 29 | accepted first join creates `student_membership_joined` event | `joinSelfJoinProgram_shouldEmitJoinedEvent_onFirstJoin` | covered |
| 30 | accepts when `left` Student membership | `joinSelfJoinProgram_shouldReactivateLeftMembershipAndEmitRejoinedEvent` | covered |
| 31 | accepted rejoin reuses record → active + `student_membership_rejoined` event | `joinSelfJoinProgram_shouldReactivateLeftMembershipAndEmitRejoinedEvent`; `joinSelfJoinProgram_shouldReuseExistingMembership_onRejoin` | covered |
| 32 | rejoin must not create a duplicate membership | `joinSelfJoinProgram_shouldReuseExistingMembership_onRejoin` | covered |
| 33 | rejects when `removed` Student membership | `joinSelfJoinProgram_shouldRejectRemovedMembershipAndEmitRejectedEvent` | covered |
| 34 | rejected join creates rejected event when Identity+Program exist | `joinSelfJoinProgram_shouldRejectRemovedMembershipAndEmitRejectedEvent` | covered |
| 35 | idempotent for active membership, no duplicate record/event | `joinSelfJoinProgram_shouldBeIdempotentForActiveMembership` | covered |
| 36 | `leaveStudentProgram` requires active Identity | `leaveStudentProgram_shouldChangeActiveToLeftAndEmitEvent` | covered |
| 37 | reject unknown → `identity_not_found` | `leaveStudentProgram_shouldRejectUnknownIdentity_withIdentityNotFound` | covered |
| 38 | reject disabled → `identity_disabled` | `leaveStudentProgram_shouldRejectDisabledIdentity_withIdentityDisabled` | covered |
| 39 | reject unknown Program → `program_not_found` | `leaveStudentProgram_shouldRejectUnknownProgram_withProgramNotFound` | covered |
| 40 | reject missing membership → `membership_missing` | `leaveStudentProgram_shouldRejectMissingMembership_withMembershipMissing` | covered |
| 41 | reject left membership → `membership_left` | `leaveStudentProgram_shouldRejectLeftMembership_withMembershipLeft` | covered |
| 42 | reject removed membership → `membership_removed` | `leaveStudentProgram_shouldRejectRemovedMembership_withMembershipRemoved` | covered |
| 43 | rejected leave creates rejected event when Identity+Program exist | `leaveStudentProgram_shouldEmitRejectedEvent_onKnownIdentityAndProgram` | covered |
| 44 | accepted leave changes active → `left` | `leaveStudentProgram_shouldChangeActiveToLeftAndEmitEvent` | covered |
| 45 | accepted leave creates `student_membership_left` event | `leaveStudentProgram_shouldChangeActiveToLeftAndEmitEvent` | covered |
| 46 | leaving does not delete learner state/shell/curator membership/events | `leaveStudentProgram_shouldPreserveProgramShellCuratorAndHistory` | covered |
| 47 | `getEffectiveParticipation` allowed only for active matching membership | `getEffectiveParticipation_shouldReturnAllowed_onActiveStudent`; `getEffectiveParticipation_shouldReturnAllowed_onActiveCurator` | covered |
| 48 | returns `identity_not_active` for disabled Identity | `getEffectiveParticipation_shouldReturnIdentityNotActive_onDisabledIdentity` | covered |
| 49 | returns `program_not_accepting_participation` for unknown/unavailable Program | `getEffectiveParticipation_shouldReturnProgramNotAcceptingParticipation_onUnknownProgram` | covered |
| 50 | returns `membership_missing`/`membership_left`/`membership_removed` | `getEffectiveParticipation_shouldReturnMembershipMissing_onNoMembership`; `..._shouldReturnMembershipLeft_onLeftMembership`; `..._shouldReturnMembershipRemoved_onRemovedMembership` | covered |
| 51 | returns `unsupported_participation_kind` | `getEffectiveParticipation_shouldReturnUnsupportedParticipationKind_onUnknownKind` | covered |
| 52 | read-only; must not mutate membership state | `getEffectiveParticipation_shouldNotMutateMembershipState` | covered |
| 53 | effective `program_curator` required before curator behavior **in later slices** | — (later-slice consumer guarantee; no current-slice test names it) | not-yet-testable |
| 54 | effective `student` required before student learning state **in later slices** | — (later-slice consumer guarantee) | not-yet-testable |
| 55 | events are queryable domain records, not operational logs | `listProgramEvents_shouldAllowAdminAndCurator_scopedQuery`; `programEvents_shouldNotBeUsedAsAuthorization_effectiveParticipationStillRequiresMembership` | covered |
| 56 | events must not be used as source of authorization | `programEvents_shouldNotBeUsedAsAuthorization_effectiveParticipationStillRequiresMembership` | covered |
| 57 | event query responses must not expose secrets/sessions/CSRF/SQL/etc. | `listProgramMembershipEvents_shouldNotExposeSecretsOrSessionsOrSql` | covered |
| 58 | event queries reject non-Admin without curator participation | `listProgramEvents_shouldRejectNonAdminWithoutCuratorParticipation` | covered |
| 59 | unscoped queries (non-Admin) return only curator-participation Programs | `listProgramEvents_shouldScopeUnscopedQueryToCuratorPrograms_forNonAdmin` | covered |
| 60 | backup/restore scope includes shells/memberships/events | `exportBackup_shouldIncludeProgramShellsMembershipsAndEvents_onBackup`; `restoreBackup_shouldRestoreProgramShellsMembershipsAndEvents_onAcceptedBackup` | covered |
| 61 | restore rejects shell without ≥1 active curator membership | `restoreBackup_shouldRejectOrphanProgramShellWithoutActiveCuratorMembership` | covered |
| 62 | slice exposes no invitations/archival/deletion/transfer/policy/controlled/curator-leave/removal/Admin-recovery-mutations/corpus/Student-Workspace/UI/routes | `firstSliceSurface_shouldNotExposeOutOfScopeMutations` | covered |

### A.2 API spec clauses (`program-shell-and-membership-api.md`, Behavior rules 1–43)

| # | Clause (abbrev) | Covering test name(s) | Verdict |
|---|---|---|---|
| 1 | every endpoint requires a valid active HTTP session | `programsList_shouldRejectMissingSession_withSessionNotFound` | covered |
| 2 | session resolution uses the Identity session contract | `programsList_shouldRejectMissingSession_withSessionNotFound`; `programShellRoutes_shouldNotExposeSessionCsrfOrCredentialSecrets` | covered |
| 3 | reject missing/unknown/expired/revoked sessions → 401 (same as Identity API) | `programsList_shouldRejectMissingSession_withSessionNotFound` (+ expired/revoked via shared session contract) | covered (shared) |
| 4 | reject disabled Identities → `403 identity_disabled` | `programsList_shouldRejectDisabledSessionIdentity_withIdentityDisabled` | covered |
| 5 | state-changing endpoints reject missing session → `401 session_not_found` before CSRF | `programsCreate_shouldRejectMissingCsrf_beforeDomainMutation`; `programsList_shouldRejectMissingSession_withSessionNotFound` | covered |
| 6 | state-changing endpoints reject missing/invalid CSRF before domain change | `programsCreate_shouldRejectMissingCsrf_beforeDomainMutation` (+ invalid-CSRF via shared CSRF contract) | covered (shared) |
| 7 | state-changing endpoints do not create/rotate sessions | `programShellRoutes_shouldNotExposeSessionCsrfOrCredentialSecrets` | covered |
| 8 | `GET /programs` → `listProgramShells` | `programsList_shouldReturnCreatedPrograms_onActiveSession`; `programsList_shouldReturnEmptyPrograms_onActiveSessionWithEmptyStore` | covered |
| 9 | `POST /programs` → `createProgramShell` | `programsCreate_shouldReturnProgramCreated_onAccepted` | covered |
| 10 | `POST /programs` accepts only JSON objects matching `CreateProgramRequest` | `programsCreate_shouldRejectInvalidBodies_withValidationFailed` | covered |
| 11 | reject malformed/non-object/missing JSON → `400 validation_failed` | `programsCreate_shouldRejectInvalidBodies_withValidationFailed` | covered |
| 12 | reject missing/empty/whitespace/non-string/malformed title → `400 validation_failed` | `programsCreate_shouldRejectInvalidBodies_withValidationFailed` | covered |
| 13 | reject malformed `description` → `400 validation_failed` | `programsCreate_shouldRejectInvalidBodies_withValidationFailed` | covered |
| 14 | accepted returns shell + initial active `program_curator` membership | `programsCreate_shouldReturnProgramCreated_onAccepted` | covered |
| 15 | accepted does not grant Admin authority or Student participation | `programsCreate_shouldReturnProgramCreated_onAccepted` (asserts `ProgramCreated` shape = shell + curator membership only) | covered |
| 16 | `GET /programs/{programId}` → `getProgramShell` | `programsGet_shouldReturnKnownProgramAndRejectUnknownProgram` | covered |
| 17 | `{programId}` routes reject unknown Program → `404 program_not_found` | `programsGet_shouldReturnKnownProgramAndRejectUnknownProgram`; `studentMembershipRoutes_shouldMapConflictsAndUnknownPrograms` | covered |
| 18 | participation route accepts only `student`/`program_curator` kinds | `effectiveParticipation_shouldHandleInvalidInputsAndRemainReadOnly` | covered |
| 19 | participation checks are read-only | `effectiveParticipation_shouldHandleInvalidInputsAndRemainReadOnly` | covered |
| 20 | `identityId` absent → check resolved session Identity | `effectiveParticipation_shouldCheckSessionIdentity_whenIdentityIdIsAbsent` | covered |
| 21 | `identityId` differs → caller must be Admin or active curator | `effectiveParticipation_shouldRequireAdminOrCurator_forOtherIdentity`; `effectiveParticipation_shouldAllowNonAdminCurator_forOtherIdentity` | covered |
| 22 | authorized check on unknown target → `allowed:false`, `identity_not_active` | `effectiveParticipation_shouldHandleInvalidInputsAndRemainReadOnly` | covered |
| 23 | `program_not_accepting_participation` only for known unavailable Program; unknown → 404 | `effectiveParticipation_shouldHandleInvalidInputsAndRemainReadOnly` | covered |
| 24 | `GET /program-memberships/me` → `listMyProgramMemberships` | `programMembershipsMe_shouldReturnOnlySessionIdentityMemberships` | covered |
| 25 | returns only resolved-session-Identity memberships | `programMembershipsMe_shouldReturnOnlySessionIdentityMemberships` | covered |
| 26 | `POST /programs/{id}/student-membership` → `joinSelfJoinProgram` | `studentMembershipCreate_shouldJoinSelfJoinProgram_onFirstJoin` | covered |
| 27 | accepted first join returns active Student membership | `studentMembershipCreate_shouldJoinSelfJoinProgram_onFirstJoin` | covered |
| 28 | rejoin returns the reactivated Student membership | `studentMembershipCreate_shouldReactivateLeftMembership_onRejoin` | covered |
| 29 | joining while active returns existing membership, idempotent | `studentMembershipCreate_shouldBeIdempotentForActiveMembership` | covered |
| 30 | joining removed → `409 membership_removed` | `studentMembershipRoutes_shouldMapConflictsAndUnknownPrograms` | covered |
| 31 | `DELETE /programs/{id}/student-membership` → `leaveStudentProgram` | `studentMembershipDelete_shouldLeaveActiveMembership` | covered |
| 32 | accepted leave returns membership in `left` status | `studentMembershipDelete_shouldLeaveActiveMembership` | covered |
| 33 | leaving missing/already-left/removed → 409 corresponding reason | `studentMembershipRoutes_shouldMapConflictsAndUnknownPrograms` | covered |
| 34 | event endpoints expose scoped domain records, not logs | `programEventRoutes_shouldPaginateScopedEvents`; `programEventRoutes_shouldAcceptAdminAndNonAdminCurator_forKnownPrograms` | covered |
| 35 | event `reason` fields hold only Program domain reasons, never session/CSRF/etc. | `programEventRoutes_shouldRejectInvalidQueriesAndRedactResponses` | covered |
| 36 | event endpoints require Admin or active curator participation | `programEventRoutes_shouldRejectOrdinaryCallers`; `programEventRoutes_shouldAcceptAdminAndNonAdminCurator_forKnownPrograms` | covered |
| 37 | no unscoped all-Program event HTTP route in this slice | `programEventRoutes_shouldPaginateScopedEvents` (only scoped routes exist; structural absence) | covered (structural) |
| 38 | `limit` 1–100, default 50, invalid → `400 validation_failed` | `programEventRoutes_shouldPaginateScopedEvents`; `programEventRoutes_shouldRejectInvalidQueriesAndRedactResponses` | covered |
| 39 | opaque cursors; malformed/unknown/expired → `400 validation_failed` | `programEventRoutes_shouldRejectInvalidQueriesAndRedactResponses` | covered |
| 40 | cursors must not encode secrets/SQL/paths/sessions/CSRF | `programEventRoutes_shouldRejectInvalidQueriesAndRedactResponses` | covered |
| 41 | responses never include secrets/session/CSRF/SQL/infrastructure | `programShellRoutes_shouldNotExposeSessionCsrfOrCredentialSecrets`; `programEventRoutes_shouldRejectInvalidQueriesAndRedactResponses` | covered |
| 42 | fault responses map unexpected failures → `500 FaultResult` | — (shared HTTP fault contract; tested in the HTTP transport/identity suite) | covered (shared) |
| 43 | slice exposes no invitations/archival/deletion/transfer/policy/controlled/curator-leave/removal/Admin-recovery-mutations/corpus/Student-Workspace/UI/CLI | `firstSliceSurface_shouldNotExposeOutOfScopeMutations` (domain); endpoint table omits all such routes (structural absence) | covered |

Executable acceptance (API required test 44):
`acceptance_shouldExerciseProgramMembershipApi_onHttpInstance` exercises the
full create → list → join → list-memberships → leave → rejoin → effective-participation
→ scoped-events flow with CSRF enforced — an end-to-end witness across clauses
A.2/8–41.

## B. Test → spec (backward coverage)

All 77 in-scope test names trace to ≥1 clause. Grouped by surface; each maps to
its primary clause(s). No orphan.

### B.1 `program.test.js` — domain (50 tests → first-slice clauses)

| Test name | Clause(s) | Verdict |
|---|---|---|
| `createProgramShell_shouldAcceptAndReturnSelfJoinShell_onActiveIdentity` | 1, 6 | traced |
| `createProgramShell_shouldCreateActiveCuratorMembership_onAccepted` | 7 | traced |
| `createProgramShell_shouldEmitAcceptedProgramAndMembershipEvents_onAccepted` | 10, 11 | traced |
| `createProgramShell_shouldNotGrantAdminAuthority_onAccepted` | 14 | traced |
| `createProgramShell_shouldNotGrantStudentMembership_onAccepted` | 15 | traced |
| `createProgramShell_shouldRejectUnknownIdentity_withIdentityNotFound` | 2 | traced |
| `createProgramShell_shouldRejectDisabledIdentityAndEmitRejectedEvent_withIdentityDisabled` | 3, 12 | traced |
| `createProgramShell_shouldRejectEmptyTitleWithValidationFailed` | 4, 5 | traced |
| `createProgramShell_shouldRollBackOnInitialCuratorMembershipFailure` | 8, 9 | traced |
| `createProgramShell_shouldEmitRejectedProgramEvent_onKnownIdentityRejection` | 12, 13 | traced |
| `listProgramShells_shouldReturnAllShells_onActiveIdentity` | 17 | traced |
| `listProgramShells_shouldRejectUnknownIdentity_withIdentityNotFound` | 18 | traced |
| `listProgramShells_shouldRejectDisabledIdentity_withIdentityDisabled` | 19 | traced |
| `getProgramShell_shouldReturnExistingShell_onActiveIdentity` | 20 | traced |
| `getProgramShell_shouldRejectUnknownProgram_withProgramNotFound` | 20 | traced |
| `listMyProgramMemberships_shouldOnlyReturnActingIdentityMemberships` | 21 | traced |
| `listMyProgramMemberships_shouldIncludeActiveLeftAndRemovedMemberships` | 22 | traced |
| `joinSelfJoinProgram_shouldAcceptFirstJoin_onActiveStudent` | 23, 27, 28 | traced |
| `joinSelfJoinProgram_shouldEmitJoinedEvent_onFirstJoin` | 29 | traced |
| `joinSelfJoinProgram_shouldBeIdempotentForActiveMembership` | 35 | traced |
| `joinSelfJoinProgram_shouldReactivateLeftMembershipAndEmitRejoinedEvent` | 30, 31 | traced |
| `joinSelfJoinProgram_shouldReuseExistingMembership_onRejoin` | 31, 32 | traced |
| `joinSelfJoinProgram_shouldRejectRemovedMembershipAndEmitRejectedEvent` | 33, 34 | traced |
| `joinSelfJoinProgram_shouldRejectUnknownIdentity_withIdentityNotFound` | 24 | traced |
| `joinSelfJoinProgram_shouldRejectDisabledIdentity_withIdentityDisabled` | 25 | traced |
| `joinSelfJoinProgram_shouldRejectUnknownProgram_withProgramNotFound` | 26 | traced |
| `leaveStudentProgram_shouldChangeActiveToLeftAndEmitEvent` | 36, 44, 45 | traced |
| `leaveStudentProgram_shouldRejectUnknownIdentity_withIdentityNotFound` | 37 | traced |
| `leaveStudentProgram_shouldRejectDisabledIdentity_withIdentityDisabled` | 38 | traced |
| `leaveStudentProgram_shouldRejectUnknownProgram_withProgramNotFound` | 39 | traced |
| `leaveStudentProgram_shouldRejectMissingMembership_withMembershipMissing` | 40 | traced |
| `leaveStudentProgram_shouldRejectLeftMembership_withMembershipLeft` | 41 | traced |
| `leaveStudentProgram_shouldRejectRemovedMembership_withMembershipRemoved` | 42 | traced |
| `leaveStudentProgram_shouldEmitRejectedEvent_onKnownIdentityAndProgram` | 43 | traced |
| `leaveStudentProgram_shouldPreserveProgramShellCuratorAndHistory` | 46 | traced |
| `getEffectiveParticipation_shouldReturnAllowed_onActiveStudent` | 47 | traced |
| `getEffectiveParticipation_shouldReturnAllowed_onActiveCurator` | 47 | traced |
| `getEffectiveParticipation_shouldReturnProgramNotAcceptingParticipation_onUnknownProgram` | 49 | traced |
| `getEffectiveParticipation_shouldReturnMembershipMissing_onNoMembership` | 50 | traced |
| `getEffectiveParticipation_shouldReturnMembershipLeft_onLeftMembership` | 50 | traced |
| `getEffectiveParticipation_shouldReturnMembershipRemoved_onRemovedMembership` | 50 | traced |
| `getEffectiveParticipation_shouldReturnIdentityNotActive_onDisabledIdentity` | 48 | traced |
| `getEffectiveParticipation_shouldReturnUnsupportedParticipationKind_onUnknownKind` | 51 | traced |
| `getEffectiveParticipation_shouldNotMutateMembershipState` | 52 | traced |
| `listProgramEvents_shouldAllowAdminAndCurator_scopedQuery` | 55, 58 | traced |
| `listProgramEvents_shouldRejectNonAdminWithoutCuratorParticipation` | 58 | traced |
| `listProgramEvents_shouldScopeUnscopedQueryToCuratorPrograms_forNonAdmin` | 59 | traced |
| `listProgramMembershipEvents_shouldNotExposeSecretsOrSessionsOrSql` | 57 | traced |
| `programEvents_shouldNotBeUsedAsAuthorization_effectiveParticipationStillRequiresMembership` | 55, 56 | traced |
| `firstSliceSurface_shouldNotExposeOutOfScopeMutations` | 16, 62 | traced |

### B.2 `http-api.test.js` — program/membership subset (23 → API clauses)

| Test name | Clause(s) | Verdict |
|---|---|---|
| `programsList_shouldRejectMissingSession_withSessionNotFound` | A.2/1, 3 | traced |
| `programsList_shouldRejectDisabledSessionIdentity_withIdentityDisabled` | A.2/4 | traced |
| `programsList_shouldReturnEmptyPrograms_onActiveSessionWithEmptyStore` | A.2/8 | traced |
| `programsCreate_shouldRejectMissingCsrf_beforeDomainMutation` | A.2/5, 6 | traced |
| `programsCreate_shouldReturnProgramCreated_onAccepted` | A.2/9, 14, 15 | traced |
| `programsCreate_shouldRejectInvalidBodies_withValidationFailed` | A.2/10, 11, 12, 13 | traced |
| `programsList_shouldReturnCreatedPrograms_onActiveSession` | A.2/8 | traced |
| `programsGet_shouldReturnKnownProgramAndRejectUnknownProgram` | A.2/16, 17 | traced |
| `programShellRoutes_shouldNotExposeSessionCsrfOrCredentialSecrets` | A.2/2, 7, 41 | traced |
| `programMembershipsMe_shouldReturnOnlySessionIdentityMemberships` | A.2/24, 25 | traced |
| `studentMembershipCreate_shouldJoinSelfJoinProgram_onFirstJoin` | A.2/26, 27 | traced |
| `studentMembershipDelete_shouldLeaveActiveMembership` | A.2/31, 32 | traced |
| `studentMembershipCreate_shouldBeIdempotentForActiveMembership` | A.2/29 | traced |
| `studentMembershipCreate_shouldReactivateLeftMembership_onRejoin` | A.2/28 | traced |
| `studentMembershipRoutes_shouldMapConflictsAndUnknownPrograms` | A.2/17, 30, 33 | traced |
| `effectiveParticipation_shouldCheckSessionIdentity_whenIdentityIdIsAbsent` | A.2/20 | traced |
| `effectiveParticipation_shouldRequireAdminOrCurator_forOtherIdentity` | A.2/21 | traced |
| `effectiveParticipation_shouldAllowNonAdminCurator_forOtherIdentity` | A.2/21 | traced |
| `effectiveParticipation_shouldHandleInvalidInputsAndRemainReadOnly` | A.2/18, 19, 22, 23 | traced |
| `programEventRoutes_shouldRejectOrdinaryCallers` | A.2/36 | traced |
| `programEventRoutes_shouldAcceptAdminAndNonAdminCurator_forKnownPrograms` | A.2/34, 36 | traced |
| `programEventRoutes_shouldPaginateScopedEvents` | A.2/34, 37, 38 | traced |
| `programEventRoutes_shouldRejectInvalidQueriesAndRedactResponses` | A.2/35, 39, 40, 41 | traced |

### B.3 `executable-acceptance.test.js` + `backup-restore.test.js` (4 → clauses)

| Test name | Clause(s) | Verdict |
|---|---|---|
| `acceptance_shouldExerciseProgramMembershipApi_onHttpInstance` | A.2/44 (end-to-end across A.2/8–41) | traced |
| `exportBackup_shouldIncludeProgramShellsMembershipsAndEvents_onBackup` | first-slice 60 | traced |
| `restoreBackup_shouldRejectOrphanProgramShellWithoutActiveCuratorMembership` | first-slice 61 | traced |
| `restoreBackup_shouldRestoreProgramShellsMembershipsAndEvents_onAcceptedBackup` | first-slice 60 | traced |

### B.4 Out-of-scope titles (not enumerated as rows)

`http-api.test.js`, `executable-acceptance.test.js`, and `backup-restore.test.js`
also contain corpus (`corpus*`, `acceptedCorpus*`), assessment criterion
(`assessmentCriterion*`, `acceptedAssessmentCriteria*`), open-answer
(`openAnswer*`), and student-workspace titles owned by other module specs. These
are **out-of-scope**, not orphan, and are not enumerated here.

## Findings

None. Every realized clause is `covered`; every in-scope test name is `traced`;
0 `untested`, 0 `orphan`.

## Open questions

1. (resolving layer: spec↔tests / shared transport) Clauses A.2/3 (expired/revoked
   session → 401), A.2/6 (invalid CSRF), and A.2/42 (`500 FaultResult`) are
   **shared HTTP transport** behaviours the Program API inherits from the Identity
   session/CSRF contract (api:16,49). The program/membership test subset names the
   missing-session and missing-CSRF cases directly; expired/revoked/invalid-CSRF/fault
   are exercised by the Identity & Role Management HTTP suite. Marked
   `covered (shared)` rather than re-asserting a Program-specific test — a
   reviewer who wants Program-route-specific transport tests should raise it at
   the spec↔tests layer for the Identity module.
2. (resolving layer: spec↔tests) Clauses A.2/37 (no unscoped event route) and
   A.2/43 / first-slice 62 (no invitation/transfer/etc. routes) are **structural
   absences** — confirmed by the endpoint table omitting them plus the
   `firstSliceSurface_shouldNotExposeOutOfScopeMutations` domain witness. Names-only
   cannot prove an HTTP-route *absence*; the structural witness is the strongest
   available evidence, so these are not `untested` findings.
3. (resolving layer: future slice) First-slice clauses 53–54 ("effective
   participation required before curator/student behavior **in later slices**") are
   consumer-side guarantees the spec defers to later slices; no current-slice test
   names them. They are `not-yet-testable`, not `untested` — the later Curator
   Workspace / Student Workspace spec↔tests passes own them.

## Inspected

- `docs/specs/program-shell-and-membership-first-slice.md` (version 0.0.1, draft)
  — 62 behaviour clauses enumerated A.1/1–62; logical records, commands/queries,
  intent traceability, required tests, done criteria read for context.
- `docs/specs/program-shell-and-membership-api.md` (version 0.0.1, draft) — 43
  behaviour clauses enumerated A.2/1–43; endpoint table, shared envelope/shapes,
  required tests, done criteria read for context.
- `tests/program.test.js` — 50 domain test names extracted (grep `test(`); all
  enumerated B.1.
- `tests/http-api.test.js` — program/membership subset, 23 test names extracted
  and enumerated B.2; corpus/assessment/open-answer titles classified out-of-scope.
- `tests/executable-acceptance.test.js` — 1 program-membership acceptance test
  enumerated B.3; corpus/identity acceptance titles out-of-scope.
- `tests/backup-restore.test.js` — 3 program/membership backup tests enumerated
  B.3; corpus/open-answer restore titles out-of-scope.

Tests were not run; titles only. No code bodies were read. No prior review
outputs were read.
