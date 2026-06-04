---
date: 2026-06-04
model: gpt-5
description: "Implementation plan: Agonara Program Membership invitations and exceptional recovery."
---

# Program Membership Invitations and Recovery Implementation Plan

## Full Review Findings

### Finding - Invitation, participant-management, and exceptional membership recovery flows are not built

Verdict: warning

Why: Product traceability keeps invitation and recovery stories deferred. Program Membership has self-join and participation checks, but controlled invitation, participant management, and exceptional recovery flows are still missing.

Location: `agonara/docs/intent_learning_program_app.md:190`, `agonara/docs/backlog.md:14`, `agonara/docs/student_user_stories.md:202`, `agonara/docs/curator_user_stories.md:133`, `agonara/docs/admin_user_stories.md:151`, `agonara/docs/plans/agonara-product-gap-closure.md:71`

Fix: Implement Program Membership invitation and recovery flows without making Admin authority the normal Program role operator.

Required tests: Add invite, accept, decline, revoke, participant listing, removal, curator leave, exceptional recovery, exceptional revocation, attribution, backup/restore, private-error, redaction, UI, and boundary tests proving membership changes do not mutate Student learning state.

### Finding - Phase 5 spec checkpoint is complete

Verdict: pass

Why: The governing spec defines the Student invitation lifecycle, Student-only admission policy toggle, participant listing, Student removal, curator leave, Admin exceptional recovery/revocation, attribution, backup/restore, HTTP routes, browser expectations, and no-mutation boundaries.

Location: `agonara/docs/specs/program-membership-invitations-and-recovery.md:12`, `agonara/docs/specs/program-membership-invitations-and-recovery.md:102`, `agonara/docs/specs/program-membership-invitations-and-recovery.md:227`, `agonara/docs/specs/program-membership-invitations-and-recovery.md:302`

Fix: none for this plan. Implement the spec without widening policy, invitation, Admin, or UI scope.

Required tests: use the implementation phases below.

## Adversarial Review Closure

### Review finding - targeted membership commands could miss curator-leave tests

Verdict: warning

Why: The first plan version used `curator leave|Curator leave` in the targeted `--test-name-pattern` commands. Existing Agonara tests use function-style names such as `leaveCuratorProgram_should...`, so a future targeted run could skip curator-leave tests unless those tests also contain broader membership terms.

Fix applied: Expanded every targeted membership command and final gate regex to include `leaveCurator|LeaveCurator`.

### Review finding - Admin-board preservation was implicit after adding `/admin` membership controls

Verdict: warning

Why: Phase 4 changes `agonara/src/admin-ui.js` for exceptional membership recovery/revocation, but the first plan version only required membership-specific `/admin` browser coverage. Existing Admin-board identity and authority workflows must remain usable after adding membership controls.

Fix applied: Added explicit Admin-board preservation coverage to Phase 4 key work and validation.

## Goal

Implement `agonara/docs/specs/program-membership-invitations-and-recovery.md` for STU-22, STU-23, CUR-14 through CUR-18, ADM-13, and ADM-14 so Program Membership supports controlled Student invitations, participant management, curator leave, and exceptional Admin recovery/revocation with attribution and without mutating Student Workspace or accepted Program corpus state.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push

## Execution lock

Worktree mode: reuse existing
Expected worktree: `worktrees/agonara-gap-closure`
Expected branch: `codex/agonara-gap-closure`
Preflight check: [x] done
Implementation preflight: before Phase 1 and before every later phase, run `git worktree list --porcelain` and `git branch --show-current`; continue only when the current worktree is `worktrees/agonara-gap-closure` and the current branch is `codex/agonara-gap-closure`.

## Scope guardrails

- Do not add payment, cohorts, organizations, external email delivery, notification delivery, invitation expiry, ownership transfer, curator invitation workflow, role-assignment primitives, resource-level permissions, recommendation ranking, analytics, LLM/provider calls, or new frontend frameworks.
- Do not widen `setProgramAdmissionPolicy` beyond Student `self_join` versus `invitation_only`.
- Do not let ordinary Program Curator or Student flows recover removed membership; only Admin exceptional recovery may recover removed or missing membership, and only with a non-empty reason and attribution.
- Do not make Admin the normal invitation operator or Program participation manager. Admin may inspect participant/event views and may use exceptional recovery/revocation routes only.
- Do not create Program Curator participation through invitation, self-join, Student routes, Curator Workspace, Identity & Role Management, Student Workspace, Corpus, Quick Check, learner-state, or readiness code.
- Do not mutate accepted Program corpus, accepted revisions, navigation graph, Quick Check attempts, open-answer attempts, learner-state target links, readiness attempts, Student Workspace state, credentials, sessions, Admin authority, or operational audit state during ordinary membership changes.
- Do not expose invitation records outside the caller's Program Curator or target-Student scope; non-target acceptance and decline must use `invitation_not_found`.
- Do not expose password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, provider details, idempotency keys, Student Workspace progress, answers, feedback, learner-state evidence, or readiness attempts in membership HTTP responses or UI surfaces.
- Do not start implementation until this plan and the governing spec have passed adversarial review and been committed.
- Do not start or resume a phase if implementation preflight reports a different worktree or branch.
- Do not commit any implementation phase until targeted tests, full Agonara tests, root build, `git diff --check`, and post-implementation self/adversarial review are clean.
- Do not mark parent Phase 5 complete until this child plan is fully implemented, verified, reviewed clean, archived, dashboard-refreshed, and committed.

## Exact implementation inventory

Expected files:

- `agonara/src/storage.js` - Student admission policy update helper, Program invitation records, invitation status transitions, participant listing helpers, membership status helpers, membership event extensions, backup export, and restore validation.
- `agonara/src/program.js` - Program Membership commands and queries for admission policy, invitations, participant listing, Student removal, curator leave, exceptional recovery, exceptional revocation, and effective-participation regression behavior.
- `agonara/src/server.js` - invitation, participant, curator-leave, Admin recovery/revocation HTTP routes, session/CSRF enforcement, status mapping, response redaction, and production composition wiring.
- `agonara/src/learn-ui.js` - `/learn` Program Curator invitation/participant controls and Student invitation decision surfaces.
- `agonara/src/admin-ui.js` - `/admin` exceptional Program Membership recovery/revocation controls and membership event inspection wiring.
- `agonara/tests/storage.test.js` - invitation storage, admission policy persistence, membership status transitions, backup/restore round-trip, and malformed restore rejection tests.
- `agonara/tests/program.test.js` - Program Membership domain tests for policy, invitation lifecycle, participant listing, Student removal, curator leave, Admin exceptional recovery/revocation, attribution, private errors, and boundary regressions.
- `agonara/tests/http-api.test.js` - membership HTTP routes, status mapping, session/CSRF gates, authorization, private non-target invitation errors, redaction, and Admin exceptional route tests.
- `agonara/tests/executable-acceptance.test.js` - end-to-end HTTP flow from controlled invitation through Student acceptance, participant listing, Student removal, Admin recovery, and event inspection.
- `agonara/tests/backup-restore.test.js` - membership invitation/recovery backup round-trip and malformed graph rejection.
- `agonara/tests/program-membership-invitations-and-recovery.playwright.js` - browser workflow, layout, redaction, `/learn` Curator/Student membership flows, and `/admin` exceptional recovery/revocation flows.
- `agonara/playwright.config.js` - reuse existing Agonara Playwright config unless the new browser test needs a strictly additive project setting.
- `agonara/docs/specs/program-membership-invitations-and-recovery.md` - update status and implementation status during closeout.
- `agonara/docs/intent_learning_program_app.md` - update STU-22..STU-23, CUR-14..CUR-18, ADM-13..ADM-14 implementation-plan and code/test traceability during closeout.
- `agonara/docs/backlog.md` - remove or narrow the deferred invitation/recovery gap during closeout.
- `agonara/README.md` - move membership invitation/recovery flows from deferred to implemented snapshot during closeout.
- `agonara/docs/implementation-notes.md` - update current-state behavior and first-slice limits during closeout.
- `agonara/docs/log.md` - record each completed phase outcome.
- `agonara/docs/plans/implemented/program-membership-invitations-and-recovery.md` - archived plan after completion.
- `agonara/docs/plans/agonara-product-gap-closure.md` - mark parent Phase 5 complete only after this plan's final gates pass.
- `docs/loc-dashboard.html` - refresh during final closeout after code and docs LOC changes.

HTTP routes:

- `PATCH /programs/{programId}/admission-policy`
- `POST /programs/{programId}/invitations`
- `GET /programs/{programId}/invitations?status={status}`
- `GET /program-invitations/me?status={status}`
- `POST /program-invitations/{invitationId}/acceptance`
- `POST /program-invitations/{invitationId}/decline`
- `POST /program-invitations/{invitationId}/revocation`
- `GET /programs/{programId}/participants?participationKind={kind}&status={status}`
- `DELETE /programs/{programId}/participants/student/{identityId}`
- `DELETE /programs/{programId}/curator-membership`
- `POST /admin/program-memberships/recovery`
- `POST /admin/program-memberships/revocation`
- `GET /programs/{programId}/membership-events?limit={limit}&cursor={cursor}`
- `GET /learn`
- `GET /admin`

Required UI screens and stable element ids:

- Membership app section: `#program-membership-section`.
- Curator invitation panel: `#program-membership-curator-panel`.
- Admission policy controls: `#program-admission-policy-form`, `#program-admission-policy-input`, `#program-admission-policy-status`.
- Invitation form: `#program-invitation-form`, `#program-invitation-target-input`, `#create-program-invitation-button`, `#program-invitation-status`.
- Invitation list/actions: `#program-invitation-list`, `#program-invitation-status-filter`, `#refresh-program-invitations-button`, `data-action="revoke-program-invitation"`.
- Participant list/actions: `#program-participant-list`, `#program-participant-kind-filter`, `#program-participant-status-filter`, `#refresh-program-participants-button`, `data-action="remove-student-participant"`, `#program-participant-action-status`.
- Curator leave controls: `#curator-leave-program-form`, `#curator-leave-program-button`, `#curator-leave-program-status`.
- Student invitation panel: `#program-membership-student-panel`, `#my-program-invitation-list`, `#refresh-my-program-invitations-button`, `data-action="accept-program-invitation"`, `data-action="decline-program-invitation"`, `#my-program-invitation-status`.
- Admin recovery panel: `#program-membership-admin-panel`, `#program-membership-recovery-form`, `#program-membership-recovery-program-id-input`, `#program-membership-recovery-target-id-input`, `#program-membership-recovery-kind-input`, `#program-membership-recovery-reason-input`, `#program-membership-recovery-status`.
- Admin revocation panel: `#program-membership-revocation-form`, `#program-membership-revocation-program-id-input`, `#program-membership-revocation-target-id-input`, `#program-membership-revocation-kind-input`, `#program-membership-revocation-reason-input`, `#program-membership-revocation-status`.
- Membership event inspection: `#program-membership-event-list`, `#refresh-program-membership-events-button`.

Targeted commands:

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "membership storage" node --test --test-name-pattern "membership|Membership|invitation|Invitation|recovery|Recovery|leaveCurator|LeaveCurator|curator leave|Curator leave" agonara/tests/storage.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "membership domain" node --test --test-name-pattern "membership|Membership|invitation|Invitation|recovery|Recovery|leaveCurator|LeaveCurator|curator leave|Curator leave" agonara/tests/program.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "membership http" node --test --test-name-pattern "membership|Membership|invitation|Invitation|recovery|Recovery|leaveCurator|LeaveCurator|curator leave|Curator leave" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "membership backup restore" node --test --test-name-pattern "membership|Membership|invitation|Invitation|recovery|Recovery|leaveCurator|LeaveCurator|curator leave|Curator leave" agonara/tests/backup-restore.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx playwright --version`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "membership browser" npx playwright test agonara/tests/program-membership-invitations-and-recovery.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "quick check product ui browser" npx playwright test agonara/tests/quick-check-product-ui.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation browser" npx playwright test agonara/tests/topic-concept-material-navigation.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state browser" npx playwright test agonara/tests/learner-state-interpretation.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness browser" npx playwright test agonara/tests/topic-period-readiness-checks.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `./scripts/loc-dashboard.sh --sort=name`
- `git diff --check`

## Phase tracker

- [x] Phase 1 - Membership Storage and Restore Validation
- [ ] Phase 2 - Program Membership Commands and Queries
- [ ] Phase 3 - HTTP Membership API
- [ ] Phase 4 - Product UI Membership Surfaces
- [ ] Phase 5 - Traceability, Dashboard, Archive, and Parent Closeout

Update tracker checkboxes only after the phase's required verification passes and the phase commit is created.

## ADR traceability matrix

| ADR / spec invariant | Phase |
|---|---|
| ADR-004 makes Program Membership the only owner of participation lifecycle and policy. | Phase 1, Phase 2, Phase 3, Phase 4 |
| ADR-005 keeps invitation records separate from membership records and keeps Admin operations exceptional. | Phase 1, Phase 2, Phase 3, Phase 4 |
| ADR-006 keeps Program Membership Manager as a policy actor, not a grantable role. | Phase 2, Phase 3, Phase 4 |
| ADR-007 makes effective participation read-only and forbids callers from using raw invitation or membership policy state for authorization. | Phase 2, Phase 3 |
| Program Membership Invitations and Recovery limits admission policy to Student self-join versus invitation-only. | Phase 1, Phase 2, Phase 3, Phase 4 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| STU-22 - Accept program invitation | Phase 2, Phase 3, Phase 4 |
| STU-23 - Decline program invitation | Phase 2, Phase 3, Phase 4 |
| CUR-14 - Invite student to program | Phase 2, Phase 3, Phase 4 |
| CUR-15 - See invited students | Phase 2, Phase 3, Phase 4 |
| CUR-16 - See program participants | Phase 2, Phase 3, Phase 4 |
| CUR-17 - Remove student from curator-controlled program | Phase 2, Phase 3, Phase 4 |
| CUR-18 - Stop curating a program | Phase 2, Phase 3, Phase 4 |
| ADM-13 - Recover broken membership access | Phase 2, Phase 3, Phase 4 |
| ADM-14 - Revoke operationally invalid membership | Phase 2, Phase 3, Phase 4 |

## Phase 1 - Membership Storage and Restore Validation

**Objective**: add persistence for Student admission policy changes, Program invitations, membership status transitions, membership events, backup export, and restore validation.

**Key work items**:

- Add RED storage tests for updating and reading Program `admissionPolicy` as `self_join` or `invitation_only`.
- Add RED storage tests for Program invitation records with Program id, target Identity, Student participation kind, status, inviter, timestamps, and status-change attribution.
- Add RED storage tests proving duplicate pending invitation scope rejects while accepted, declined, or revoked historical invitations are preserved.
- Add RED storage tests for membership status transitions used by Student removal, curator leave, Admin exceptional recovery, and Admin exceptional revocation.
- Add RED storage tests for membership event records with policy path, actor Identity, target Identity, Program, participation kind, outcome, reason, resulting membership status, and invitation status.
- Add RED backup/restore tests proving admission policy, invitations, membership statuses, and membership events round-trip with stable ids and timestamps.
- Add RED malformed restore tests for unsupported admission policies, duplicate invitation ids, duplicate pending invitation scopes, invitations pointing at missing Programs or Identities, unsupported invitation participation kinds, duplicate membership uniqueness scopes, and restored Programs with no active Program Curator.
- Implement storage and restore validation in `agonara/src/storage.js`.

**Dependencies**: this child plan is committed; the governing spec has passed adversarial review.

**Risks**: malformed restore graphs can create private invitations for missing identities, duplicate active/pending membership state, or Programs without an active curator.

**Validation**:

- Targeted membership storage command.
- Targeted membership backup/restore command.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against invitation uniqueness, policy persistence, event attribution, restore rejection, and no Student Workspace or corpus mutation; fix every fail or warning and rerun affected gates.

**Completion signal**: membership storage preserves policy, invitation, membership, and event history while restore rejects malformed membership graphs before mutation.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 2 - Program Membership Commands and Queries

**Objective**: implement Program Membership domain commands and queries for controlled Student invitations, participant visibility, Student removal, curator leave, and exceptional Admin recovery/revocation.

**Key work items**:

- Add RED Program Membership tests for `setProgramAdmissionPolicy` authorization, validation, event attribution, and Student-only policy scope.
- Add RED tests for `joinSelfJoinProgram` rejecting `invitation_only` Programs while preserving existing self-join behavior outside that policy change.
- Add RED tests for `createProgramInvitation`, `listProgramInvitations`, `listMyProgramInvitations`, `acceptProgramInvitation`, `declineProgramInvitation`, and `revokeProgramInvitation`.
- Add RED tests proving non-target invitation acceptance/decline returns `invitation_not_found` and invitation lists expose only the caller's Program Curator or target-Student scope.
- Add RED tests proving invitation creation, decline, revocation, and participant listing do not create or expose Student Workspace state, learner-state evidence, readiness attempts, accepted corpus data, or assessment attempts.
- Add RED tests proving invitation acceptance creates or reactivates Student membership, does not duplicate active membership, rejects removed membership, and records attribution.
- Add RED tests for `listProgramParticipants` as Program Curator/Admin and redaction of Student Workspace progress, answers, feedback, learner-state evidence, and readiness attempts.
- Add RED tests for `removeProgramParticipant` Student-only removal, removed-member ordinary reactivation blocking, event attribution, and preservation of Student Workspace records.
- Add RED tests for `leaveCuratorProgram` success with another active curator and `last_curator_required` rejection for the last active curator.
- Add RED tests for `recoverProgramMembership` and `revokeProgramMembership` requiring Admin authority, non-empty reasons, target validation, event attribution, and last-curator protection.
- Add RED boundary tests proving Identity & Role Management, Student Workspace, Curator Workspace, Corpus, Quick Check, learner-state, and readiness commands do not create or mutate Program Membership records directly.
- Implement commands and queries in `agonara/src/program.js` over Phase 1 storage helpers.

**Dependencies**: Phase 1 is complete.

**Risks**: ordinary invitation acceptance can accidentally recover removed membership, and Admin recovery can drift into normal Program participation management.

**Validation**:

- Targeted membership domain command.
- Targeted membership storage command if storage helper contracts change.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against Program Membership ownership, Student-only invitation scope, private invitation errors, Admin exceptional separation, last-curator protection, and no adjacent-domain mutation; fix every fail or warning and rerun affected gates.

**Completion signal**: Program Membership commands and queries implement the spec with attributable ordinary and exceptional membership events and no authority leakage.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 3 - HTTP Membership API

**Objective**: expose membership invitation, participant-management, curator-leave, and exceptional Admin recovery/revocation behavior through session-backed HTTP routes.

**Key work items**:

- Add RED HTTP tests for admission-policy PATCH with Program Curator session, CSRF, validation, status mapping, and Student-only policy scope.
- Add RED HTTP tests for curator invitation create/list/revoke routes with session, Program Curator authorization, CSRF on mutations, validation, and status mapping.
- Add RED HTTP tests for Student invitation list/accept/decline routes with target-only scope, CSRF on mutations, private non-target `invitation_not_found`, and status mapping.
- Add RED HTTP tests for participant listing and Student removal with Program Curator/Admin authorization where allowed, CSRF on removal, and redaction.
- Add RED HTTP tests for curator leave route with CSRF, membership status mapping, and last-curator protection.
- Add RED HTTP tests for Admin exceptional recovery/revocation routes with Admin session, CSRF, non-empty reason validation, attribution, last-curator protection, and redaction.
- Add RED HTTP tests proving session resolution happens before CSRF validation on every mutation route.
- Add RED HTTP executable acceptance coverage from controlled invitation through Student acceptance, participant listing, Student removal, Admin exceptional recovery, Admin exceptional revocation, and event inspection.
- Add RED regression tests proving existing Program self-join/leave/rejoin, Quick Check, navigation, learner-state, and readiness routes preserve behavior outside `invitation_only` policy rejection.
- Implement route parsing, request validation, result mapping, CSRF/session enforcement, response redaction, and production composition wiring in `agonara/src/server.js`.

**Dependencies**: Phase 2 is complete.

**Risks**: HTTP mapping can expose private invitation existence, leak Student Workspace data through participant views, or weaken existing session/CSRF conventions.

**Validation**:

- Targeted membership HTTP command.
- Targeted membership domain command if route mapping changes command contracts.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against route contracts, CSRF/session behavior, status mapping, private errors, redaction, Admin-vs-Curator separation, and existing-route preservation; fix every fail or warning and rerun affected gates.

**Completion signal**: membership HTTP routes are session-backed, redacted, private-error preserving, and executable through the accepted end-to-end membership flow.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 4 - Product UI Membership Surfaces

**Objective**: extend `/learn` with Curator/Student membership workflows and `/admin` with exceptional recovery/revocation controls.

**Key work items**:

- Verify installed Playwright version and browser availability before writing browser tests.
- Add RED Playwright tests for Curator admission policy toggle, invitation create/list/revoke, participant listing, Student removal, and curator leave.
- Add RED Playwright tests for Student invitation list, accept, decline, and self-join rejection on invitation-only Programs.
- Add RED Playwright tests proving invitation and participant UI does not render Student Workspace progress, answers, feedback, learner-state evidence, readiness attempts, sessions, CSRF tokens, SQL, stack traces, filesystem paths, database URLs, or operational details.
- Add RED Playwright tests for Admin exceptional recovery/revocation controls with required reasons, attribution, last-curator protection, and event inspection.
- Add RED Playwright tests proving Admin recovery controls are absent from `/learn` Curator/Student panels and ordinary invitation controls are absent from `/admin` recovery-only surfaces.
- Add RED Playwright or executable HTTP regression coverage proving existing Admin-board bootstrap, sign-in, identity list, Admin grant/revoke, and audit inspection workflows remain usable after membership controls are added.
- Add RED layout and accessible-name tests for desktop/mobile and existing `/learn` Quick Check, navigation, learner-state, and readiness workflow preservation.
- Implement `/learn` membership UI in `agonara/src/learn-ui.js` using the stable ids in this plan.
- Implement `/admin` exceptional membership controls in `agonara/src/admin-ui.js` using the stable ids in this plan.

**Dependencies**: Phase 3 is complete.

**Risks**: UI role panels can expose Admin recovery as normal Curator behavior or leak private invitation and Student Workspace state across role, Program, or session changes.

**Validation**:

- Targeted membership browser command.
- Quick Check product UI browser regression command.
- Navigation browser regression command.
- Learner-state browser regression command.
- Readiness browser regression command.
- Targeted membership HTTP command if route assumptions change.
- Admin-board executable HTTP regression coverage if existing `/admin` browser workflow coverage is not added.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against UI redaction, private invitation scope, role-mode isolation, layout, accessibility, Admin exceptional separation, and existing `/learn`/`/admin` workflow preservation; fix every fail or warning and rerun affected gates.

**Completion signal**: Curators and Students can perform ordinary membership workflows in `/learn`, Admins can perform exceptional recovery/revocation in `/admin`, and protected data remains absent from rendered surfaces.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 5 - Traceability, Dashboard, Archive, and Parent Closeout

**Objective**: close documentation, dashboard, parent-plan tracker, and archive requirements after implementation is verified and reviewed clean.

**Key work items**:

- Update `agonara/docs/specs/program-membership-invitations-and-recovery.md` to `status: implemented` with an implementation status section linking the archived plan, storage/domain/HTTP/browser tests, and final gates.
- Update `agonara/docs/intent_learning_program_app.md` so STU-22..STU-23, CUR-14..CUR-18, and ADM-13..ADM-14 point to implemented routes, UI, tests, and archived plan.
- Update `agonara/docs/backlog.md` to remove or narrow the deferred invitation/recovery storage gap.
- Update `agonara/README.md` so membership invitation/recovery flows appear in the implemented snapshot rather than deferred status.
- Update `agonara/docs/implementation-notes.md` with current-state behavior and first-slice limits.
- Update `agonara/docs/log.md` with concise outcome-focused closeout entry.
- Update this plan's Phase tracker to mark Phase 5 complete only after final gates pass.
- Update `agonara/docs/plans/agonara-product-gap-closure.md` to mark parent Phase 5 complete only after this plan's final gates pass.
- Run `./scripts/loc-dashboard.sh --sort=name` and refresh `docs/loc-dashboard.html`.
- Move this plan to `agonara/docs/plans/implemented/program-membership-invitations-and-recovery.md` in the same closeout commit.

**Dependencies**: Phase 4 is complete and all implementation gates are green.

**Risks**: traceability can overstate membership as payment, ownership transfer, curator invitations, organization/cohort management, or Admin-as-normal-operator behavior; parent Phase 5 can be marked complete before dashboard/archive closeout.

**Validation**:

- Docs/front-matter/required-section/link checks.
- `./scripts/loc-dashboard.sh --sort=name`
- Full Agonara tests.
- Root build.
- Browser commands from Phase 4.
- `git diff --check`.
- Post-closeout self-review and adversarial review against traceability, dashboard freshness, archive placement, parent tracker status, and no-overclaim wording; fix every fail or warning and rerun affected gates.

**Completion signal**: membership invitation/recovery flows are documented as implemented, parent Phase 5 is marked complete, LOC dashboard is refreshed, this plan is archived, and all final gates pass.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Done criteria

- All five phases are implemented in order, each with targeted verification, full Agonara tests, root build, `git diff --check`, post-implementation self-review, adversarial review, fixes for every fail or warning, and a local commit on green.
- Program Membership storage preserves admission policy, invitations, membership statuses, and membership events with backup/restore validation.
- Program Membership domain commands implement Student invitation lifecycle, participant listing, Student removal, curator leave, Admin exceptional recovery/revocation, private invitation errors, attribution, and last-curator protection.
- HTTP routes expose the membership contract with session, CSRF, status mapping, redaction, and executable acceptance coverage.
- `/learn` exposes ordinary Curator/Student membership workflows, `/admin` exposes exceptional Admin recovery/revocation, and protected data is not rendered.
- Existing self-join, leave, rejoin, membership event, Quick Check, navigation, learner-state, readiness, Identity, and Admin authority behavior remains unchanged outside the accepted `invitation_only` policy behavior.
- The membership spec, Product Intent, backlog, README, implementation notes, log, parent gap-closure plan, and LOC dashboard all reflect the implemented first slice without overclaiming payment, cohorts, organizations, email/notifications, expiry, ownership transfer, curator invitations, resource-level permissions, analytics, recommendations, or LLM/provider behavior.
- This implementation plan is archived under `agonara/docs/plans/implemented/` in the same branch change set as the implementation.

## Final closeout

Final gates: `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "membership storage" node --test --test-name-pattern "membership|Membership|invitation|Invitation|recovery|Recovery|leaveCurator|LeaveCurator|curator leave|Curator leave" agonara/tests/storage.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "membership domain" node --test --test-name-pattern "membership|Membership|invitation|Invitation|recovery|Recovery|leaveCurator|LeaveCurator|curator leave|Curator leave" agonara/tests/program.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "membership http" node --test --test-name-pattern "membership|Membership|invitation|Invitation|recovery|Recovery|leaveCurator|LeaveCurator|curator leave|Curator leave" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "membership backup restore" node --test --test-name-pattern "membership|Membership|invitation|Invitation|recovery|Recovery|leaveCurator|LeaveCurator|curator leave|Curator leave" agonara/tests/backup-restore.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "membership browser" npx playwright test agonara/tests/program-membership-invitations-and-recovery.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "quick check product ui browser" npx playwright test agonara/tests/quick-check-product-ui.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation browser" npx playwright test agonara/tests/topic-concept-material-navigation.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state browser" npx playwright test agonara/tests/learner-state-interpretation.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness browser" npx playwright test agonara/tests/topic-period-readiness-checks.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`; `./scripts/loc-dashboard.sh --sort=name`; docs/front-matter/required-section/link checks; `git diff --check`
Archive plan: move to `agonara/docs/plans/implemented/program-membership-invitations-and-recovery.md`
Commit archive move: yes
Push/PR: follow push policy
