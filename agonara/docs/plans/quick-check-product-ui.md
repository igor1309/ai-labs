---
date: 2026-06-03
model: gpt-5
description: "Implementation plan: Agonara Quick Check product UI."
---

# Quick Check Product UI Implementation Plan

## Source Review Findings

### Finding - Quick Check remains backend/API-only for product users

Verdict: warning

Why: The HTTP API exists, but Agonara still has no Student or Curator product UI for Quick Check. Product stories require students to answer checks during study, while current docs explicitly describe the UI transport as deferred.

Location: `agonara/README.md:37`, `agonara/docs/implementation-notes.md:168`, `agonara/docs/student_user_stories.md:110`

Fix: Build Student and Curator UI flows over the existing Quick Check HTTP API. The first UI slice must let an effective Program Curator create, accept, reject, and inspect quick checks, and let an effective Student list deliveries, submit attempts, retry idempotently, and read owned attempts.

Required tests: Add browser/UI acceptance for curator create/accept/reject, student delivery listing, student submission, idempotent retry, owner-only attempt reads, answer-key redaction, and non-owner denial.

### Finding - Quick Check API spec status has traceability drift

Verdict: warning

Why: The Quick Check HTTP API has been implemented and archived, but the spec front matter still says `status: draft`. This weakens traceability because Product Intent now points to an implemented API while the spec metadata still advertises draft state.

Location: `agonara/docs/specs/quick-check-assessment-api.md:6`

Fix: Update the spec status to `implemented` or `accepted`, and add a short implementation status section linking the archived plan and HTTP tests.

Required tests: Run Markdown/front-matter/link checks and `git diff --check`.

## Goal

Implement [Quick Check Product UI](../specs/quick-check-product-ui.md) as the first Agonara product UI surface at `GET /learn`, while preserving the implemented Quick Check HTTP API's answer-key protection, Student ownership, CSRF, idempotency, and redaction boundaries.

## Execution mode

Mode: human-review-gated
Human review between tasks: yes
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push

## Execution lock

Worktree mode: reuse existing
Expected worktree: `worktrees/agonara-gap-closure`
Expected branch: `codex/agonara-gap-closure`
Preflight check: [x] done

## Scope guardrails

- Do not modify Quick Check HTTP route contracts except where tests prove existing behavior is preserved.
- Do not expose answer-key option ids, candidate ids, rationale, curator attribution, acceptance time, CSRF tokens, session ids, cookie names, idempotency keys, SQL text, paths, or stack traces on Student UI screens.
- Do not add Program discovery, material navigation, topic-level checks, period-level checks, progress, weak areas, grading, analytics, provider calls, workers, queues, or human review behavior.
- Do not add a new frontend framework. Use the existing single-file static UI pattern from `agonara/src/admin-ui.js`.
- Do not start implementation until this plan has passed adversarial review and been committed.
- Do not commit any implementation phase until targeted tests, Agonara tests, root build, `git diff --check`, and post-implementation self/adversarial review are clean.

## Exact implementation inventory

Expected files:

- `agonara/src/learn-ui.js` - new static Quick Check product UI shell.
- `agonara/src/server.js` - add `GET /learn` route and import `learnUiHtml`.
- `agonara/tests/http-api.test.js` - add shell route, shell redaction, and out-of-scope route tests.
- `agonara/tests/quick-check-product-ui.playwright.js` - new Playwright browser workflow tests.
- `agonara/playwright.config.js` - new Agonara-specific Playwright config used by the targeted browser gate.
- `agonara/docs/specs/quick-check-product-ui.md` - update status and implementation status during closeout.
- `agonara/docs/log.md` - record each completed phase outcome.
- `agonara/docs/plans/quick-check-product-ui.md` - update phase tracker during implementation.
- `agonara/docs/plans/agonara-product-gap-closure.md` - mark parent Phase 1 only after this plan is fully complete.
- `docs/loc-dashboard.html` - refresh during final closeout when the implementation changes repo LOC.

HTTP and shell routes:

- `GET /learn`
- `POST /identity/sessions`
- `GET /identity/session`
- `DELETE /identity/session`
- `GET /programs/{programId}/quick-checks/candidates`
- `POST /programs/{programId}/quick-checks/candidates`
- `POST /quick-checks/candidates/{candidateId}/acceptance`
- `POST /quick-checks/candidates/{candidateId}/rejection`
- `GET /quick-checks/revisions/{revisionId}/curation`
- `GET /programs/{programId}/quick-checks`
- `GET /quick-checks/revisions/{revisionId}`
- `POST /programs/{programId}/quick-check-attempts`
- `GET /quick-check-attempts/{attemptId}`
- `GET /programs/{programId}/quick-check-attempts`

Required UI screens and stable element ids:

- App root: `#learn-app`.
- Sign-in: `#signin-form`, `#signin-status`.
- Session: `#session-panel`, `#session-summary`, `#refresh-session-button`, `#logout-button`.
- Program context: `#program-context-form`, `#program-id-input`, `#curator-mode-tab`, `#student-mode-tab`.
- Curator panel: `#curator-panel`.
- Curator candidate list: `#quick-check-candidate-status-filter`, `#quick-check-candidate-list`, `#refresh-candidates-button`.
- Curator candidate creation: `#quick-check-candidate-form`, `#quick-check-title-input`, `#quick-check-prompt-input`, `#quick-check-options-fieldset`, `#quick-check-rationale-input`.
- Curator candidate actions: `data-action="accept-quick-check"`, `data-action="reject-quick-check"`, `data-action="read-quick-check-curation"`, `#quick-check-curation-detail`.
- Student panel: `#student-panel`.
- Student delivery list/detail: `#quick-check-delivery-list`, `#quick-check-delivery-detail`, `data-action="open-quick-check-delivery"`.
- Student submission: `#quick-check-answer-form`, `#quick-check-answer-options`, `#quick-check-submit-status`.
- Student attempt list/detail: `#quick-check-attempt-list`, `#quick-check-attempt-detail`, `data-action="open-quick-check-attempt"`.

Targeted commands:

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "quick check product ui http" node --test --test-name-pattern "quickCheckProductUi|learnRoute" agonara/tests/http-api.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx playwright --version`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "quick check product ui browser" npx playwright test agonara/tests/quick-check-product-ui.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git diff --check`

## Phase tracker

- [x] Phase 1 - Shell Route and Redaction
- [x] Phase 2 - Session and Program Context UI
- [x] Phase 3 - Curator Quick Check UI
- [x] Phase 4 - Student Quick Check UI
- [ ] Phase 5 - Layout, Accessibility, Traceability, and Closeout

Update tracker checkboxes only after the phase's required verification passes and the phase commit is created.

## ADR traceability matrix

| ADR / spec invariant | Phase |
|---|---|
| ADR-016 protects answer keys and separates curation projections from Student delivery projections. | Phase 3, Phase 4 |
| ADR-011 keeps attempts and evidence in Student Workspace. | Phase 4 |
| Quick Check Product UI requires `/learn` to avoid embedded secrets. | Phase 1 |
| Quick Check Product UI requires desktop/mobile layout and accessibility checks. | Phase 5 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| INT-04 - Check understanding during study | Phase 4 |
| STU-11 - Answer quick checks | Phase 4 |
| CUR-04 - Add checks and assessment items | Phase 3 |
| CUR-06 - Keep accepted content separate from drafts | Phase 3 |

## Phase 1 - Shell Route and Redaction

**Objective**: serve the Quick Check product UI shell at `/learn` without runtime secret leakage.

**Key work items**:

- Add RED HTTP tests for `GET /learn` returning HTML with `#learn-app`.
- Add RED HTTP tests that `/learn` omits bootstrap secrets, plaintext passwords, password hashes, session ids, CSRF tokens, cookie names, idempotency keys, answer-key strings, SQL text, filesystem paths, database URLs, and stack traces.
- Add `agonara/src/learn-ui.js` exporting `learnUiHtml`.
- Wire `GET /learn` in `agonara/src/server.js`.
- Add out-of-scope route absence checks for `/learn/quick-check-topic-attempts`, `/learn/quick-check-period-attempts`, `/learn/progress`, `/learn/weak-areas`, `/learn/provider/jobs`, `/learn/worker/jobs`, `/learn/queue/jobs`, and `/learn/human-review/jobs`.

**Dependencies**: this child plan is committed and the current Agonara HTTP tests are green.

**Risks**: copying Admin board shell patterns can accidentally include operational copy or Admin-only controls in the learning product shell.

**Validation**:

- Targeted command: `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "quick check product ui http" node --test --test-name-pattern "quickCheckProductUi|learnRoute" agonara/tests/http-api.test.js`
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against shell secrecy and out-of-scope route absence.

**Completion signal**: `/learn` serves a secret-free Quick Check product shell and no out-of-scope product routes are introduced.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 2 - Session and Program Context UI

**Objective**: let browser users sign in, refresh session state, logout, and set a Program context before role-specific Quick Check actions.

**Key work items**:

- Verify the installed Playwright version and browser availability before writing browser tests.
- Add `agonara/playwright.config.js` for local Agonara browser tests.
- Add RED Playwright tests for sign-in through `#signin-form`.
- Add RED Playwright tests for `GET /identity/session` refresh and `DELETE /identity/session` logout through visible controls.
- Add RED Playwright tests for `#program-context-form`, Program id entry, Curator tab selection, and Student tab selection.
- Implement runtime session state in `learnUiHtml` without rendering CSRF token, session cookie name, session id, plaintext password, or bootstrap secret.
- Ensure unauthenticated users cannot trigger Quick Check API calls from Curator or Student panels.

**Dependencies**: Phase 1 is complete.

**Risks**: Playwright may be installed without browser binaries in a local environment; if the pinned command fails for missing browsers, stop and report the environment gate rather than switching harnesses.

**Validation**:

- Targeted Playwright version check and browser command.
- Targeted HTTP shell tests when shell markup changes.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against session, CSRF, and redaction behavior.

**Completion signal**: Browser users can sign in, refresh, logout, and choose Program/role context without secret leakage.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 3 - Curator Quick Check UI

**Objective**: let effective Program Curators create, list, accept, reject, and inspect Quick Check curation data.

**Key work items**:

- Add RED Playwright tests for candidate creation with title, prompt, two options, answer-key selection, and optional rationale.
- Add RED Playwright tests for draft candidate listing with status filter and refresh.
- Add RED Playwright tests for candidate acceptance and rejection.
- Add RED Playwright tests for curation detail that allows answer-key display only inside Curator mode.
- Implement Curator panel controls using existing Quick Check curator HTTP routes.
- Keep candidate ids, answer-key ids, rationale, curator attribution, and acceptance time out of Student panel DOM.

**Dependencies**: Phase 2 is complete.

**Risks**: Curator UI can leak answer-key-inclusive curation projections into shared state that the Student panel later renders.

**Validation**:

- Targeted Playwright browser command.
- Targeted HTTP tests for existing Quick Check curator routes if route interaction changes.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against answer-key projection separation.

**Completion signal**: Curators can complete candidate lifecycle work through UI, and answer-key-inclusive data remains confined to Curator screens.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 4 - Student Quick Check UI

**Objective**: let effective Students list deliveries, submit attempts, retry pending submissions idempotently, and inspect owned attempts.

**Key work items**:

- Add RED Playwright tests for accepted delivery listing and detail read in Student mode.
- Add RED Playwright tests for selecting an option and submitting an attempt with `X-Agonara-Idempotency-Key`.
- Add RED Playwright tests for explicit retry of the same pending submission without duplicate rendered rows or idempotency-key exposure.
- Add RED Playwright tests for attempt listing and owned attempt detail.
- Add RED Playwright tests that non-owner attempt detail displays unavailable without ownership disclosure.
- Implement Student panel controls using existing Quick Check delivery and attempt HTTP routes.
- Keep answer-key option ids, candidate ids, rationale, curator attribution, acceptance time, per-option correctness metadata, CSRF token, session id, cookie name, and idempotency key out of Student panel DOM.

**Dependencies**: Phase 3 is complete.

**Risks**: The Student panel can accidentally reuse accepted curation responses from Curator state instead of student-safe delivery responses.

**Validation**:

- Targeted Playwright browser command.
- Targeted HTTP tests for existing Quick Check delivery/attempt routes if route interaction changes.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against Student ownership, idempotency, and redaction behavior.

**Completion signal**: Students can answer Quick Checks and inspect owned attempts through UI without protected-data leakage.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 5 - Layout, Accessibility, Traceability, and Closeout

**Objective**: close the Quick Check product UI slice with responsive layout, accessibility, docs traceability, and archived-plan readiness.

**Key work items**:

- Add or complete Playwright desktop and mobile viewport screenshot checks for non-overlapping Quick Check UI.
- Add Playwright accessibility checks for accessible names on controls and discoverable status updates.
- Update `agonara/docs/specs/quick-check-product-ui.md` status to `implemented` with implementation status links.
- Update `agonara/docs/intent_learning_program_app.md` INT-04 traceability to include the product UI implementation.
- Update `agonara/README.md` and `agonara/docs/implementation-notes.md` so Quick Check no longer says UI transport is deferred after implementation.
- Refresh `docs/loc-dashboard.html` from `scripts/loc-dashboard.sh --sort=name` and verify the summary cards, table footer, `data` array, and `Last updated` line match the script output.
- Update `agonara/docs/log.md`.
- Mark this plan's phase tracker complete only after verified gates and commits.
- Mark parent `agonara/docs/plans/agonara-product-gap-closure.md` Phase 1 complete only after this plan's final gates pass.

**Dependencies**: Phase 4 is complete.

**Risks**: Documentation can overclaim broader Student/Curator product UI completion beyond Quick Check.

**Validation**:

- Targeted Playwright browser command.
- Full Agonara tests.
- Root build.
- Markdown/front-matter/link checks for touched docs.
- Dashboard consistency check against `./scripts/loc-dashboard.sh --sort=name`.
- `git diff --check`.
- Post-implementation self-review and adversarial review against scope, layout, accessibility, and traceability.

**Completion signal**: Quick Check product UI is implemented, tested across browser workflows, documented as implemented, and parent Phase 1 is ready for human review.

**Commit**: Commit this phase after validation with a short imperative message.

## Done criteria

- `GET /learn` serves a Quick Check product UI shell with no embedded runtime secrets.
- Browser users can sign in, refresh session state, logout, and set Program/role context.
- Effective Program Curators can create, list, accept, reject, and inspect Quick Check curation data through UI.
- Effective Students can list deliveries, submit attempts with idempotent retry behavior, list attempts, and inspect owned attempt detail through UI.
- Student DOM never renders protected answer keys, candidate ids, curator-only metadata, CSRF tokens, session ids, cookie names, or idempotency keys.
- Desktop and mobile Playwright checks show no overlapping or clipped Quick Check controls.
- Accessibility checks cover form labels and status updates.
- Agonara tests, root build, targeted Playwright tests, docs checks, and `git diff --check` pass.
- `docs/loc-dashboard.html` is refreshed and verified against `scripts/loc-dashboard.sh --sort=name` when implementation changes repo LOC.
- Post-implementation self-review and adversarial review are clean for every phase.
- This plan and the parent product-gap plan trackers are updated and committed.

## Final closeout

Final gates: `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "quick check product ui browser" npx playwright test agonara/tests/quick-check-product-ui.playwright.js --config agonara/playwright.config.js`, `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`, `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`, Markdown/front-matter/link checks for touched docs, dashboard consistency check against `scripts/loc-dashboard.sh --sort=name`, and `git diff --check`.
Archive plan: move to `agonara/docs/plans/implemented/quick-check-product-ui.md`.
Commit archive move: yes.
Push/PR: follow push policy; no push unless explicitly requested.
