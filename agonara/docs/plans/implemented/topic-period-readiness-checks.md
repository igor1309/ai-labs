---
date: 2026-06-03
model: gpt-5
description: "Implementation plan: Agonara topic and period readiness checks."
---

# Topic and Period Readiness Checks Implementation Plan

## Full Review Findings

### Finding - Topic-level and period-level checks are not built

Verdict: fail

Why: Product Intent accepts readiness checks for topic or period boundaries, but INT-06 is deferred and current Quick Check absence tests intentionally keep topic/period routes absent. This is required before the product can explicitly answer whether a Student is ready to continue.

Location: `agonara/docs/intent_learning_program_app.md:186`, `agonara/docs/student_user_stories.md:134`, `agonara/docs/plans/implemented/agonara-product-gap-closure.md:59`, `agonara/docs/specs/quick-check-assessment-first-slice.md:341`, `agonara/tests/student-workspace.test.js:2162`

Fix: Specify aggregate readiness semantics separately from deterministic single-select Quick Check. Implement topic/period readiness definitions in Corpus Storage, attempts in Student Workspace, and readiness result derivation with explicit evidence links.

Required tests: Add topic/period check lifecycle tests, readiness derivation tests, historical revision tests, owner-only read tests, UI tests, backup/restore tests, and absence/regression tests proving raw Quick Check attempts are not silently promoted into aggregate readiness.

### Finding - Learner-state interpretation prerequisite is complete

Verdict: pass

Why: The implemented learner-state interpretation slice now provides owner-only read-time target summaries, weak-area summaries, and evidence detail that readiness attempts can snapshot without mutating accepted Program corpus.

Location: `agonara/docs/specs/learner-state-interpretation.md:6`, `agonara/docs/specs/learner-state-interpretation.md:301`, `agonara/docs/plans/implemented/learner-state-interpretation.md:144`, `agonara/docs/plans/implemented/agonara-product-gap-closure.md:189`

Fix: none for this plan. Build readiness on explicit learner-state reads and preserve Quick Check/open-answer semantics.

Required tests: use the implementation phases below.

## Goal

Implement `agonara/docs/specs/topic-period-readiness-checks.md` for INT-06 so Program Curators can define topic/period readiness checks and owning Students can explicitly submit readiness attempts whose results are evidence-backed, owner-only, and separate from grades, recommendations, analytics, and raw assessment attempts.

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

- Do not add grades, scores, analytics dashboards, recommendation ranking, next-step scheduling, certifications, classroom/cohort workflows, due dates, calendar periods, notification behavior, proctoring, plagiarism checks, LLM/provider calls, evaluator-worker execution, source extraction, or new frontend frameworks.
- Do not mutate raw Quick Check attempts, open-answer attempts, final evaluations, evaluator evidence, learner-state evidence, accepted check revisions, accepted criteria, navigation entities, navigation relationships, learner evidence target links, Program Membership records, sessions, or audit events during readiness reads.
- Do not silently promote Quick Check or open-answer attempts into readiness attempts. Readiness results require an accepted readiness check revision and an explicit Student readiness attempt submission.
- Do not expose answer keys, candidate ids on Student deliveries, accepted-by identity ids, source ids, curator rationale, idempotency keys, evaluator leases, provider diagnostics, raw prompts, raw model responses, sessions, CSRF tokens, cookies, SQL text, filesystem paths, stack traces, database URLs, provider credentials, or infrastructure details on Student readiness responses or UI surfaces.
- Do not let Program Curators or Admins read Student readiness attempt detail/list responses.
- Do not start implementation until this plan and the governing spec have passed adversarial review and been committed.
- Do not start or resume a phase if implementation preflight reports a different worktree or branch.
- Do not commit any implementation phase until targeted tests, full Agonara tests, root build, `git diff --check`, and post-implementation self/adversarial review are clean.
- Do not mark parent Phase 4 complete until this child plan is fully implemented, verified, reviewed clean, archived, dashboard-refreshed, and committed.

## Exact implementation inventory

Expected files:

- `agonara/src/storage.js` - readiness check candidate records, accepted readiness check entities/revisions, readiness attempt records, idempotency history, backup export, and restore validation.
- `agonara/src/corpus.js` - Program Curator-owned readiness check candidate creation/list/accept/reject/curation commands and accepted scope/requirement validation.
- `agonara/src/student-workspace.js` - Student readiness deliveries, explicit readiness attempt submission, owner-only attempt reads, learner-state snapshot derivation, idempotency handling, and non-mutation boundaries.
- `agonara/src/server.js` - readiness candidate, revision, delivery, attempt HTTP routes, CSRF/session/idempotency enforcement, status mapping, response redaction, and production composition wiring.
- `agonara/src/learn-ui.js` - `/learn` readiness UI for Curator candidate curation and Student readiness delivery/attempt/result/evidence views.
- `agonara/tests/storage.test.js` - readiness storage, replacement revision, attempt idempotency, backup export, and malformed restore rejection tests.
- `agonara/tests/corpus.test.js` - readiness candidate validation, authorization, accepted scope/requirement checks, and no-Student-state mutation tests.
- `agonara/tests/corpus-executable-acceptance.test.js` - executable readiness curation flow over Corpus commands.
- `agonara/tests/student-workspace.test.js` - readiness result derivation, historical snapshots, idempotency, owner-only reads, raw-assessment non-promotion, and boundary tests.
- `agonara/tests/http-api.test.js` - readiness HTTP route contracts, status mapping, CSRF/session/idempotency gates, owner-only reads, and redaction tests.
- `agonara/tests/executable-acceptance.test.js` - end-to-end HTTP readiness flow from accepted definition to Student attempt result.
- `agonara/tests/backup-restore.test.js` - readiness backup/restore round-trip and malformed graph rejection.
- `agonara/tests/topic-period-readiness-checks.playwright.js` - browser workflow, layout, redaction, Curator curation, Student delivery/attempt/result, and existing `/learn` regression tests.
- `agonara/playwright.config.js` - reuse existing Agonara Playwright config unless the new browser test needs a strictly additive project setting.
- `agonara/docs/specs/topic-period-readiness-checks.md` - update status and implementation status during closeout.
- `agonara/docs/intent_learning_program_app.md` - update INT-06 implementation-plan and code/test traceability during closeout.
- `agonara/docs/backlog.md` - remove or narrow the deferred topic/period readiness gap during closeout.
- `agonara/README.md` - move topic/period readiness checks from deferred to implemented snapshot during closeout.
- `agonara/docs/implementation-notes.md` - update current-state behavior and first-slice limits during closeout.
- `agonara/docs/log.md` - record each completed phase outcome.
- `agonara/docs/plans/implemented/topic-period-readiness-checks.md` - archived plan after completion.
- `agonara/docs/plans/implemented/agonara-product-gap-closure.md` - mark parent Phase 4 complete only after this plan's final gates pass.
- `docs/loc-dashboard.html` - refresh during final closeout after code and docs LOC changes.

HTTP routes:

- `GET /learn`
- `GET /programs/{programId}/readiness-checks/candidates?status={status}`
- `POST /programs/{programId}/readiness-checks/candidates`
- `POST /readiness-checks/candidates/{candidateId}/acceptance`
- `POST /readiness-checks/candidates/{candidateId}/rejection`
- `GET /readiness-checks/revisions/{revisionId}/curation`
- `GET /programs/{programId}/readiness-checks`
- `POST /programs/{programId}/readiness-check-attempts`
- `GET /programs/{programId}/readiness-check-attempts`
- `GET /readiness-check-attempts/{attemptId}`

Required UI screens and stable element ids:

- Readiness app section: `#readiness-check-section`.
- Curator readiness panel: `#readiness-check-curator-panel`.
- Candidate form: `#readiness-check-candidate-form`, `#readiness-check-title-input`, `#readiness-check-scope-kind-input`, `#readiness-check-topic-id-input`, `#readiness-check-period-title-input`, `#readiness-check-period-topic-ids-input`, `#readiness-check-requirements-input`, `#readiness-check-source-ids-input`, `#readiness-check-rationale-input`.
- Candidate list/actions: `#readiness-check-candidate-list`, `#readiness-check-candidate-status-filter`, `#refresh-readiness-check-candidates-button`, `data-action="accept-readiness-check-candidate"`, `data-action="reject-readiness-check-candidate"`, `data-action="read-readiness-check-curation"`, `#readiness-check-candidate-action-status`, `#readiness-check-curation-detail`.
- Student readiness panel: `#readiness-check-student-panel`, `#refresh-readiness-checks-button`, `#readiness-check-delivery-list`, `data-action="open-readiness-check-delivery"`, `#readiness-check-delivery-detail`, `#readiness-check-submit-form`, `#readiness-check-submit-status`, `#readiness-check-attempt-list`, `#readiness-check-attempt-id-input`, `data-action="open-readiness-check-attempt"`, `#readiness-check-attempt-detail`, `#readiness-check-requirement-result-list`, `data-action="open-readiness-evidence-target"`.

Targeted commands:

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness storage" node --test --test-name-pattern "readiness|Readiness" agonara/tests/storage.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness corpus" node --test --test-name-pattern "readiness|Readiness" agonara/tests/corpus.test.js agonara/tests/corpus-executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness domain" node --test --test-name-pattern "readiness|Readiness" agonara/tests/student-workspace.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness http" node --test --test-name-pattern "readiness|Readiness" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness backup restore" node --test --test-name-pattern "readiness|Readiness" agonara/tests/backup-restore.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx playwright --version`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness browser" npx playwright test agonara/tests/topic-period-readiness-checks.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "quick check product ui browser" npx playwright test agonara/tests/quick-check-product-ui.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state browser" npx playwright test agonara/tests/learner-state-interpretation.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation browser" npx playwright test agonara/tests/topic-concept-material-navigation.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `./scripts/loc-dashboard.sh --sort=name`
- `git diff --check`

## Phase tracker

- [x] Phase 1 - Readiness Storage and Restore Validation
- [x] Phase 2 - Corpus Readiness Check Curation
- [x] Phase 3 - Student Workspace Readiness Attempt Derivation
- [x] Phase 4 - HTTP Readiness API
- [x] Phase 5 - Product UI Readiness Surfaces
- [x] Phase 6 - Traceability, Dashboard, Archive, and Parent Closeout

Update tracker checkboxes only after the phase's required verification passes and the phase commit is created.

## ADR traceability matrix

| ADR / spec invariant | Phase |
|---|---|
| ADR-010 keeps accepted Program corpus metadata behind curator acceptance. | Phase 1, Phase 2, Phase 4, Phase 5 |
| ADR-011 keeps accepted checks in Corpus Storage while attempts/evidence stay in Student Workspace. | Phase 2, Phase 3, Phase 4 |
| ADR-016 keeps Quick Check attempts as evidence and forbids hidden readiness side effects. | Phase 3, Phase 4, Phase 5 |
| Learner-State Interpretation provides explicit owner-only evidence summaries for readiness snapshots. | Phase 3, Phase 4, Phase 5 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| INT-06 - Topic-level or period-level readiness checks | Phase 2, Phase 3, Phase 4, Phase 5 |
| STU-14 - Pass topic-level check | Phase 3, Phase 4, Phase 5 |
| INT-04 - Check understanding during study | Phase 3, Phase 4 |
| INT-07 - Personal mastery, weak areas, and evidence | Phase 3 |

## Phase 1 - Readiness Storage and Restore Validation

**Objective**: add persistence for readiness check candidates, accepted readiness check entities/revisions, readiness attempts, idempotency records, and restore-time validation.

**Key work items**:

- Add RED storage tests for readiness candidates with topic and period scopes, requirements, attribution, and timestamps.
- Add RED storage tests for accepted readiness check entity creation, replacement revisions, historical revisions, and current revision lookup.
- Add RED storage tests for readiness attempt creation with requirement-result snapshots and idempotency replay/conflict behavior.
- Add RED backup/restore tests for round-tripping candidates, accepted revisions, attempts, idempotency records, and historical snapshots.
- Add RED malformed restore tests for duplicate ids, duplicate idempotency scopes, missing Programs, missing Identities, cross-Program scopes, cross-Program requirements, unsupported kinds, and attempts pointing at missing revisions.
- Implement storage and restore validation in `agonara/src/storage.js`.

**Dependencies**: this child plan is committed; the governing spec has passed adversarial review.

**Risks**: malformed restore graphs can create readiness attempts detached from accepted revisions, while duplicate idempotency records can make replay nondeterministic.

**Validation**:

- Targeted readiness storage command.
- Targeted readiness backup/restore command.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against storage graph integrity, replacement revision semantics, idempotency, and restore rejection; fix every fail or warning and rerun affected gates.

**Completion signal**: readiness storage preserves candidate, accepted revision, attempt, idempotency, and historical snapshot state while restore rejects malformed graphs before mutation.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 2 - Corpus Readiness Check Curation

**Objective**: implement Program Curator-owned readiness check candidate commands with accepted topic/period scope and requirement validation.

**Key work items**:

- Add RED Corpus tests for `createReadinessCheckCandidate`, `acceptReadinessCheckCandidate`, `rejectReadinessCheckCandidate`, `listReadinessCheckCandidates`, and `getAcceptedReadinessCheckRevisionForCuration`.
- Add RED Corpus authorization tests for active Identity and effective Program Curator participation.
- Add RED validation tests for topic scope, period scope, accepted same-Program topic membership, non-empty period title, non-empty requirements, supported targets, duplicate requirements, accepted same-Program requirement targets, and source/rationale handling.
- Add RED rejection tests for Admin-only, Student, disabled Identity, draft/rejected/missing/cross-Program scope targets, and draft/rejected/missing/cross-Program requirement targets.
- Add RED boundary tests proving curation does not create Student Workspace readiness attempts, Quick Check attempts, open-answer attempts, learner-state summaries, or Program Membership changes.
- Add RED executable Corpus acceptance coverage for readiness candidate acceptance, replacement, and rejection.
- Implement Corpus commands in `agonara/src/corpus.js` over Phase 1 storage helpers.

**Dependencies**: Phase 1 is complete.

**Risks**: weak validation can let readiness checks point at unrelated Program evidence, and curation can accidentally blur accepted corpus with Student state.

**Validation**:

- Targeted readiness corpus command.
- Targeted readiness storage command if storage helper contracts change.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against Program Curator authorization, Corpus ownership, scope/requirement validation, replacement semantics, and no-Student-state mutation; fix every fail or warning and rerun affected gates.

**Completion signal**: Program Curators can curate accepted readiness check definitions as Program corpus metadata, with validated topic/period scopes and requirements.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 3 - Student Workspace Readiness Attempt Derivation

**Objective**: implement explicit owning-Student readiness attempt submission and owner-only reads with readiness results derived from learner-state target summaries at submission time.

**Key work items**:

- Add RED Student Workspace tests for readiness deliveries from accepted current revisions.
- Add RED attempt submission tests for `ready`, `not_ready`, and `in_progress` result derivation from learner-state target summaries and requirement thresholds.
- Add RED tests proving raw Quick Check attempts, open-answer attempts, learner-state reads, and target-link curation do not create readiness attempts or readiness results.
- Add RED tests proving historical readiness attempts preserve requirement-result snapshots after later learner evidence changes.
- Add RED idempotency tests for replay and conflict behavior.
- Add RED owner-only list/detail tests for owning Students, Curators, Admins, other Students, outside Students, disabled Identities, unknown Programs, unknown revisions, and unknown attempts.
- Add RED boundary tests proving readiness reads/submissions do not mutate Program corpus, Program Membership, raw assessment attempts, learner-state target links, evaluator records, sessions, or audit events except explicit readiness attempt records.
- Implement Student Workspace readiness delivery, submission, derivation, and reads in `agonara/src/student-workspace.js`.

**Dependencies**: Phase 2 is complete.

**Risks**: readiness can become hidden grading or recommendation behavior if submission is not explicit, or historical attempts can become unstable if later learner evidence rewrites snapshots.

**Validation**:

- Targeted readiness domain command.
- Targeted learner-state domain tests if learner-state adapter contracts change.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against explicit attempt creation, result derivation, historical snapshot stability, owner-only reads, redaction, and no raw-assessment side effects; fix every fail or warning and rerun affected gates.

**Completion signal**: owning Students can explicitly submit readiness attempts and read stable, evidence-backed readiness snapshots without changing raw assessment semantics.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 4 - HTTP Readiness API

**Objective**: expose readiness curation, delivery, attempt submission, and owner-only attempt reads through session-backed HTTP routes.

**Key work items**:

- Add RED HTTP tests for readiness candidate list/create/accept/reject/curation routes with session, Program Curator, CSRF, validation, and status mapping.
- Add RED HTTP tests for Student delivery routes and student-safe redaction.
- Add RED HTTP tests for readiness attempt submission with session, Student participation, CSRF, idempotency key, idempotent replay, conflict, and status mapping.
- Add RED HTTP tests for owner-only attempt list/detail reads and unavailable behavior for non-owners.
- Add RED HTTP redaction tests for answer keys, candidate ids on Student deliveries, accepted-by identity ids, source ids, rationale, idempotency keys, sessions, CSRF, cookies, SQL, stack traces, provider details, and infrastructure details.
- Add RED executable HTTP acceptance coverage from Curator-created readiness check to Student readiness attempt result.
- Implement routes, mapping, redaction, and production composition wiring in `agonara/src/server.js`.

**Dependencies**: Phase 3 is complete.

**Risks**: route shape can leak curator metadata to Students, weaken CSRF/idempotency gates, or make non-owner attempts distinguishable from missing attempts.

**Validation**:

- Targeted readiness HTTP command.
- Targeted readiness domain command if Student Workspace contracts change.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against route contracts, CSRF/session/idempotency gates, status mapping, redaction, owner-only reads, and production composition; fix every fail or warning and rerun affected gates.

**Completion signal**: readiness HTTP routes are session-backed, student-safe, owner-only where required, and preserve Quick Check/open-answer behavior.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 5 - Product UI Readiness Surfaces

**Objective**: extend `/learn` with Program Curator readiness curation controls and Student readiness delivery, attempt, result, and evidence views.

**Key work items**:

- Verify installed Playwright version and browser availability before writing browser tests.
- Add RED Playwright tests for Curator readiness candidate create/list/accept/reject/inspect workflows.
- Add RED Playwright tests proving Curator readiness controls do not expose Student readiness attempts or learner-state evidence.
- Add RED Playwright tests for Student readiness delivery refresh, opening a delivery, submitting a readiness attempt, idempotent retry, result display, requirement result list, and evidence drill-down.
- Add RED Playwright tests proving protected metadata is not rendered on Student readiness surfaces.
- Add RED owner-only browser tests for private attempt detail denial.
- Add RED layout and accessible-name tests for desktop/mobile and existing `/learn` workflow preservation.
- Implement the UI in `agonara/src/learn-ui.js` using the existing static app pattern and the stable ids in this plan.

**Dependencies**: Phase 4 is complete.

**Risks**: UI accessible names can collide with existing Quick Check, navigation, or learner-state controls, and Curator/Student panels can leak private readiness state across role or Program context changes.

**Validation**:

- Targeted readiness browser command.
- Quick Check product UI browser regression command.
- Learner-state browser regression command.
- Navigation browser regression command.
- Targeted readiness HTTP command if route assumptions change.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against UI redaction, owner-only behavior, role-mode isolation, layout, accessibility, idempotent retry, evidence drill-down, and existing `/learn` workflow preservation; fix every fail or warning and rerun affected gates.

**Completion signal**: Program Curators can manage readiness definitions in `/learn`, owning Students can submit readiness attempts and inspect evidence-backed results in `/learn`, and existing `/learn` Quick Check, navigation, and learner-state flows remain usable.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 6 - Traceability, Dashboard, Archive, and Parent Closeout

**Objective**: close documentation, dashboard, parent-plan tracker, and archive requirements after implementation is verified and reviewed clean.

**Key work items**:

- Update `agonara/docs/specs/topic-period-readiness-checks.md` to `status: implemented` with an implementation status section linking the archived plan, route tests, domain tests, browser tests, and final gates.
- Update `agonara/docs/intent_learning_program_app.md` so INT-06 points to implemented readiness routes, UI, tests, and archived plan.
- Update `agonara/docs/backlog.md` to remove or narrow the deferred topic/period readiness gap.
- Update `agonara/README.md` so topic/period readiness checks appear in the implemented snapshot rather than deferred status.
- Update `agonara/docs/implementation-notes.md` with current-state behavior and first-slice limits.
- Update `agonara/docs/log.md` with concise outcome-focused closeout entry.
- Update this plan's Phase tracker to mark Phase 6 complete only after final gates pass.
- Update `agonara/docs/plans/implemented/agonara-product-gap-closure.md` to mark Phase 4 complete only after this plan's final gates pass.
- Run `./scripts/loc-dashboard.sh --sort=name` and refresh `docs/loc-dashboard.html`.
- Move this plan to `agonara/docs/plans/implemented/topic-period-readiness-checks.md` in the same closeout commit.

**Dependencies**: Phase 5 is complete and all implementation gates are green.

**Risks**: traceability can overstate readiness as grades, recommendations, analytics, or persisted mastery; parent Phase 4 can be marked complete before dashboard/archive closeout.

**Validation**:

- Docs/front-matter/required-section/link checks.
- `./scripts/loc-dashboard.sh --sort=name`
- Full Agonara tests.
- Root build.
- Browser commands from Phase 5.
- `git diff --check`.
- Post-closeout self-review and adversarial review against traceability, dashboard freshness, archive placement, parent tracker status, and no-overclaim wording; fix every fail or warning and rerun affected gates.

**Completion signal**: readiness checks are documented as implemented, parent Phase 4 is marked complete, LOC dashboard is refreshed, this plan is archived, and all final gates pass.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Done criteria

- All six phases are implemented in order, each with targeted verification, full Agonara tests, root build, `git diff --check`, post-implementation self-review, adversarial review, fixes for every fail or warning, and a local commit on green.
- Readiness check definitions are accepted Program corpus metadata with topic and period scopes, accepted revisions, replacement history, and backup/restore preservation.
- Readiness attempts are explicit Student Workspace records with idempotency, owner-only reads, stable historical requirement snapshots, and no raw-assessment side effects.
- Readiness results derive from learner-state evidence at submission time and preserve evidence links for drill-down.
- Quick Check and open-answer attempt semantics remain unchanged and never silently create readiness results.
- `/learn` exposes Program Curator readiness curation and owning-Student readiness delivery/attempt/result/evidence views while preserving existing Quick Check, navigation, and learner-state workflows.
- The readiness spec, Product Intent, backlog, README, implementation notes, log, parent gap-closure plan, and LOC dashboard all reflect the implemented first slice without overclaiming grading, analytics, recommendations, certification, schedules, notifications, or persisted mastery models.
- This implementation plan is archived under `agonara/docs/plans/implemented/` in the same branch change set as the implementation.

## Final closeout

Final gates: `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness storage" node --test --test-name-pattern "readiness|Readiness" agonara/tests/storage.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness corpus" node --test --test-name-pattern "readiness|Readiness" agonara/tests/corpus.test.js agonara/tests/corpus-executable-acceptance.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness domain" node --test --test-name-pattern "readiness|Readiness" agonara/tests/student-workspace.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness http" node --test --test-name-pattern "readiness|Readiness" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness backup restore" node --test --test-name-pattern "readiness|Readiness" agonara/tests/backup-restore.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness browser" npx playwright test agonara/tests/topic-period-readiness-checks.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "quick check product ui browser" npx playwright test agonara/tests/quick-check-product-ui.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state browser" npx playwright test agonara/tests/learner-state-interpretation.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation browser" npx playwright test agonara/tests/topic-concept-material-navigation.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`; `./scripts/loc-dashboard.sh --sort=name`; docs/front-matter/required-section/link checks; `git diff --check`
Archive plan: move to `agonara/docs/plans/implemented/topic-period-readiness-checks.md`
Commit archive move: yes
Push/PR: follow push policy
