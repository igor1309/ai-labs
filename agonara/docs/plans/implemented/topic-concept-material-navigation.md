---
date: 2026-06-03
model: gpt-5
description: "Implementation plan: Agonara topic, concept, and material navigation."
---

# Topic, Concept, and Material Navigation Implementation Plan

## Full Review Findings

### Finding - Materials, topics, concepts, and navigation are not built

Verdict: fail

Why: Product Intent accepts materials-in-context and topic/concept navigation, but INT-03 still has no implemented code or tests. The current README also lists materials/topic navigation as deferred, so students cannot move through a real learning structure beyond accepted assessment artifacts.

Location: `agonara/docs/intent_learning_program_app.md:183`, `agonara/README.md:38`, `agonara/docs/student_user_stories.md:66`, `agonara/docs/student_user_stories.md:92`, `agonara/docs/curator_user_stories.md:31`, `agonara/docs/curator_user_stories.md:39`

Fix: Specify and implement accepted topic, concept, material, and relationship graph storage; curator acceptance routes; student-safe read routes; and navigation UI that preserves the Corpus Storage / Student Workspace boundary.

Required tests: Add storage graph invariant tests, curator acceptance tests, student topic/material navigation HTTP tests, UI navigation tests, backup/restore graph validation, and boundary tests proving navigation does not create personal progress state by itself.

### Finding - Phase 2 spec checkpoint is complete

Verdict: pass

Why: The governing navigation spec defines accepted navigation kinds, relationship kinds, curator candidate and acceptance routes, student-safe read projections, historical revision reads, backup/restore rejection rules, and the no-Student-state-on-navigation invariant.

Location: `agonara/docs/specs/topic-concept-material-navigation.md:14`, `agonara/docs/specs/topic-concept-material-navigation.md:206`, `agonara/docs/specs/topic-concept-material-navigation.md:220`

Fix: none for this plan. Implement the spec without widening scope.

Required tests: use the implementation phases below.

## Goal

Implement [Topic, Concept, and Material Navigation](../../specs/topic-concept-material-navigation.md) for INT-03 so accepted Program corpus can represent topics, concepts, definitions, principles, material references, and graph relationships that effective Students can navigate without creating learner state.

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

## Scope guardrails

- Do not modify existing `/corpus-candidates`, `/accepted-corpus`, Quick Check, open-answer, Program Membership, Identity, Operations, or Admin board contracts except where tests prove existing behavior is preserved.
- Do not store viewing history, last position, progress, mastery, weak areas, attempts, answers, or evidence in Corpus Storage.
- Do not expose `sourceIds`, candidate ids, curator rationale, accepted-by identity ids, acceptance timestamps, draft/rejected candidates, session ids, CSRF tokens, cookies, SQL text, filesystem paths, stack traces, provider details, or infrastructure details on Student navigation surfaces.
- Do not add topic-level checks, period-level checks, learner-state interpretation, weak-area interpretation, resume/last-position recording, recommendation ranking, LLM-assisted curation, provider calls, source extraction, material file storage, material scraping, material licensing policy, collaborative editing, or a new frontend framework.
- Do not start implementation until this plan has passed adversarial review and been committed.
- Do not commit any implementation phase until targeted tests, full Agonara tests, root build, `git diff --check`, and post-implementation self/adversarial review are clean.
- Do not mark parent Phase 2 complete until this child plan is fully implemented, verified, reviewed clean, archived, and committed.

## Exact implementation inventory

Expected files:

- `agonara/src/storage.js` - navigation candidate fields, accepted navigation entity/revision records, accepted relationship/revision records, backup export/restore validation.
- `agonara/src/corpus.js` - navigation candidate validation, acceptance/rejection commands, graph invariant checks, student-safe navigation read queries.
- `agonara/src/server.js` - navigation HTTP route parsing, body validation, pagination, session/CSRF enforcement, redacted response mapping.
- `agonara/src/learn-ui.js` - extend `/learn` with curator navigation management and student navigation traversal screens.
- `agonara/tests/storage.test.js` - storage graph and current/historical revision tests.
- `agonara/tests/corpus.test.js` - domain validation, acceptance atomicity, authorization, and no-Student-state boundary tests.
- `agonara/tests/http-api.test.js` - route contracts, status mapping, CSRF/session gates, participation gates, and Student redaction tests.
- `agonara/tests/backup-restore.test.js` - navigation graph round-trip and malformed restore rejection tests.
- `agonara/tests/corpus-executable-acceptance.test.js` - domain executable acceptance for curator graph acceptance and student-safe traversal.
- `agonara/tests/executable-acceptance.test.js` - HTTP executable acceptance for accepted graph traversal.
- `agonara/tests/topic-concept-material-navigation.playwright.js` - browser workflow, redaction, layout, and accessibility tests.
- `agonara/playwright.config.js` - reuse existing Agonara Playwright config unless the new browser test needs a strictly additive project setting.
- `agonara/docs/specs/topic-concept-material-navigation.md` - update status and implementation status during closeout.
- `agonara/docs/intent_learning_program_app.md` - update INT-03 implementation-plan and code/test traceability during closeout.
- `agonara/docs/backlog.md` - remove or narrow the deferred INT-03 topic/material navigation gap during closeout.
- `agonara/README.md` - move materials/topic navigation from deferred to implemented snapshot during closeout.
- `agonara/docs/implementation-notes.md` - update current-state notes during closeout.
- `agonara/docs/log.md` - record each completed phase outcome.
- `agonara/docs/plans/implemented/topic-concept-material-navigation.md` - archived plan after completion.
- `agonara/docs/plans/agonara-product-gap-closure.md` - mark parent Phase 2 complete only after this plan's final gates pass.
- `docs/loc-dashboard.html` - refresh during final closeout after code and docs LOC changes.

HTTP and shell routes:

- `GET /learn`
- `POST /identity/sessions`
- `GET /identity/session`
- `DELETE /identity/session`
- `GET /programs/{programId}/navigation-candidates?status={status}&limit={limit}&cursor={cursor}`
- `POST /programs/{programId}/navigation-candidates`
- `POST /navigation-candidates/{candidateId}/acceptance`
- `POST /navigation-candidates/{candidateId}/rejection`
- `GET /programs/{programId}/navigation`
- `GET /navigation/entities/{entityId}`
- `GET /navigation/revisions/{revisionId}`

Required UI screens and stable element ids:

- Navigation app section: `#navigation-section`.
- Curator navigation panel: `#navigation-curator-panel`.
- Navigation candidate list: `#navigation-candidate-status-filter`, `#navigation-candidate-list`, `#refresh-navigation-candidates-button`.
- Navigation candidate creation: `#navigation-candidate-form`, `#navigation-kind-input`, `#navigation-title-input`, `#navigation-body-input`, `#navigation-material-kind-input`, `#navigation-locator-input`, `#navigation-citation-input`, `#navigation-source-ids-input`, `#navigation-relationships-input`, `#navigation-rationale-input`.
- Navigation candidate actions: `data-action="accept-navigation-candidate"`, `data-action="reject-navigation-candidate"`, `#navigation-candidate-action-status`.
- Student navigation panel: `#navigation-student-panel`.
- Program coverage: `#program-navigation-summary`, `#navigation-topic-list`, `#navigation-ungrouped-concept-list`, `#navigation-ungrouped-material-list`, `#refresh-navigation-button`.
- Navigation detail: `#navigation-node-detail`, `data-action="open-navigation-node"`, `data-action="open-navigation-revision"`.
- Material back navigation: `#navigation-material-backlinks`.
- Navigation status: `#navigation-status`.

Targeted commands:

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation storage" node --test --test-name-pattern "navigation|Navigation" agonara/tests/storage.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation domain" node --test --test-name-pattern "navigation|Navigation" agonara/tests/corpus.test.js agonara/tests/corpus-executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation http" node --test --test-name-pattern "navigation|Navigation" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation backup restore" node --test --test-name-pattern "navigation|Navigation" agonara/tests/backup-restore.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx playwright --version`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation browser" npx playwright test agonara/tests/topic-concept-material-navigation.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git diff --check`

## Phase tracker

- [x] Phase 1 - Storage Substrate and Restore Graph Validation
- [x] Phase 2 - Corpus Domain Navigation Commands and Queries
- [x] Phase 3 - HTTP Navigation API
- [x] Phase 4 - Product UI Navigation
- [x] Phase 5 - Traceability, Dashboard, Archive, and Parent Closeout

Update tracker checkboxes only after the phase's required verification passes and the phase commit is created.

## ADR traceability matrix

| ADR / spec invariant | Phase |
|---|---|
| ADR-010 keeps accepted Program corpus in Corpus Storage and draft work in Curator Workspace. | Phase 1, Phase 2, Phase 3 |
| ADR-010 requires explicit curator acceptance before Student visibility. | Phase 2, Phase 3, Phase 4 |
| ADR-010 requires accepted revisions to remain addressable after updates. | Phase 1, Phase 2, Phase 3 |
| Product corpus/student-state separation prevents navigation reads from creating learner state. | Phase 2, Phase 3, Phase 4 |
| Topic, Concept, and Material Navigation requires malformed graph restore rejection. | Phase 1, Phase 5 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| INT-03 - Study materials in program context | Phase 1, Phase 2, Phase 3, Phase 4 |
| STU-03 - Preview program coverage | Phase 3, Phase 4 |
| STU-06 - See key concepts | Phase 3, Phase 4 |
| STU-07 - Distinguish similar concepts | Phase 2, Phase 3, Phase 4 |
| STU-09 - See linked materials | Phase 2, Phase 3, Phase 4 |
| STU-10 - Return from material to concepts | Phase 2, Phase 3, Phase 4 |
| CUR-02 - Add topics and concepts | Phase 2, Phase 3, Phase 4 |
| CUR-03 - Link materials to topics and concepts | Phase 2, Phase 3, Phase 4 |
| CUR-06 - Keep accepted content separate from drafts | Phase 2, Phase 3 |

## Phase 1 - Storage Substrate and Restore Graph Validation

**Objective**: add persistence for navigation candidates, accepted navigation entities/revisions, accepted relationships/revisions, and restore-time graph validation.

**Key work items**:

- Add RED storage tests for accepted topic, concept, definition, principle, and material-reference entities with stable current revision ids.
- Add RED storage tests for accepted relationships covering all valid relationship kinds and wrong endpoint-kind rejection.
- Add RED storage tests for cross-Program source and relationship endpoint rejection.
- Add RED storage tests for `concept_prerequisite` cycle rejection.
- Add RED storage tests for historical revision preservation after replacement.
- Add RED backup/restore tests for navigation graph round-trip with replacements and historical revisions.
- Add RED backup/restore tests for missing references, cross-Program links, wrong endpoint kinds, missing current revisions, and prerequisite cycles rejected before mutation.
- Implement storage records and restore validation in `agonara/src/storage.js`.

**Dependencies**: this child plan is committed; parent Phase 2 spec checkpoint is complete.

**Risks**: restore validation can accept malformed graph records and corrupt backup recovery, or replacement writes can make historical revisions unreachable.

**Validation**:

- Targeted storage command.
- Targeted backup/restore command.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against storage graph invariants and restore rejection; fix every fail or warning and rerun affected gates.

**Completion signal**: navigation storage can persist valid accepted graph records, preserve historical revisions, and reject malformed backup graphs before mutation.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 2 - Corpus Domain Navigation Commands and Queries

**Objective**: implement Corpus domain commands for navigation candidate creation, acceptance, rejection, and student-safe current/historical navigation queries.

**Key work items**:

- Add RED domain tests for invalid candidate kinds, blank titles, blank required bodies, missing material-reference data, malformed relationship drafts, and unknown source ids.
- Add RED domain tests for effective Program Curator authorization on navigation mutations.
- Add RED domain tests for accepting topic, concept, definition, principle, and material-reference candidates.
- Add RED domain tests for accepting relationship drafts and `relationship_update` candidates atomically.
- Add RED domain tests proving failed acceptance leaves candidate status, accepted entities, accepted revisions, accepted relationships, and events unchanged.
- Add RED domain tests for Student, Curator, and Admin participant reads through student-safe projections.
- Add RED boundary tests proving navigation reads do not mutate Student Workspace viewing history, last position, progress, mastery, weak areas, attempts, answers, evidence, or events.
- Implement command/query behavior in `agonara/src/corpus.js`.
- Add or update executable domain acceptance coverage in `agonara/tests/corpus-executable-acceptance.test.js`.

**Dependencies**: Phase 1 is complete.

**Risks**: relationship acceptance can partially mutate graph state on validation failure, and student-safe queries can accidentally reuse curator projections.

**Validation**:

- Targeted domain command.
- Targeted storage command if storage helpers change.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against atomicity, authorization, and Student-safe projection rules; fix every fail or warning and rerun affected gates.

**Completion signal**: Corpus commands enforce the navigation spec and produce student-safe graph reads without Student Workspace mutations.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 3 - HTTP Navigation API

**Objective**: expose the navigation candidate, acceptance, rejection, Program summary, entity detail, and historical revision routes with session, CSRF, pagination, status mapping, and redaction.

**Key work items**:

- Add RED HTTP tests for `GET /programs/{programId}/navigation-candidates?status={status}&limit={limit}&cursor={cursor}`.
- Add RED HTTP tests for `POST /programs/{programId}/navigation-candidates`.
- Add RED HTTP tests for `POST /navigation-candidates/{candidateId}/acceptance`.
- Add RED HTTP tests for `POST /navigation-candidates/{candidateId}/rejection`.
- Add RED HTTP tests for `GET /programs/{programId}/navigation`.
- Add RED HTTP tests for `GET /navigation/entities/{entityId}`.
- Add RED HTTP tests for `GET /navigation/revisions/{revisionId}` returning `isCurrentRevision: false` after replacement.
- Add RED HTTP tests for CSRF/session gates, effective Program Curator mutation authorization, participant read authorization, and validation/status mapping.
- Add RED HTTP tests proving Student-safe reads omit source ids, candidate ids, curator rationale, accepted-by identity ids, acceptance timestamps, draft/rejected candidates, operational metadata, and secrets.
- Implement route parsing, request validation, result mapping, pagination, and response redaction in `agonara/src/server.js`.
- Add or update HTTP executable acceptance coverage in `agonara/tests/executable-acceptance.test.js`.

**Dependencies**: Phase 2 is complete.

**Risks**: HTTP response mapping can expose domain-internal provenance in Student reads or weaken existing Corpus/Quick Check route behavior.

**Validation**:

- Targeted HTTP command.
- Targeted domain command if route mapping changes command contracts.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against route contracts, redaction, session/CSRF behavior, and existing-route preservation; fix every fail or warning and rerun affected gates.

**Completion signal**: navigation HTTP routes satisfy the spec and existing Corpus/Quick Check routes remain green.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 4 - Product UI Navigation

**Objective**: extend `/learn` with curator navigation candidate management and student topic/concept/material traversal.

**Key work items**:

- Verify the installed Playwright version and browser availability before writing browser tests.
- Add RED Playwright tests for Curator navigation candidate creation, listing, acceptance, and rejection.
- Add RED Playwright tests for Student Program coverage preview from accepted topics, concepts, and materials without creating student state.
- Add RED Playwright tests for topic-to-concept traversal, concept-to-material traversal, historical revision read where relevant, and material-to-topic/concept back navigation.
- Add RED Playwright tests that Student navigation DOM omits source ids, candidate ids, curator rationale, accepted-by identity ids, acceptance timestamps, draft/rejected candidates, CSRF tokens, session ids, cookie names, SQL text, filesystem paths, stack traces, provider details, and infrastructure details.
- Add desktop and mobile viewport checks for no overlapping or clipped navigation controls.
- Add accessibility checks for named controls, navigation buttons, form controls, and status updates.
- Implement `/learn` navigation panels and controls in `agonara/src/learn-ui.js` using the Phase 3 HTTP routes.
- Keep Curator navigation responses and Student navigation responses in separate runtime state.

**Dependencies**: Phase 3 is complete.

**Risks**: the existing `/learn` Quick Check UI can regress, or Student navigation can reuse Curator candidate/provenance state in the DOM.

**Validation**:

- Playwright version check.
- Targeted browser command.
- Targeted HTTP command if shell/API interaction changes.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against UI state separation, redaction, layout, accessibility, and Quick Check UI preservation; fix every fail or warning and rerun affected gates.

**Completion signal**: Curators can manage navigation candidates through UI, and Students can traverse accepted Program topics, concepts, and material references through UI without protected-data leakage or Student Workspace mutation.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 5 - Traceability, Dashboard, Archive, and Parent Closeout

**Objective**: close Phase 2 with implemented spec metadata, product traceability, docs status updates, dashboard LOC refresh, plan archival, and parent tracker update.

**Key work items**:

- Update `agonara/docs/specs/topic-concept-material-navigation.md` status to `implemented` and add implementation status links.
- Update `agonara/docs/intent_learning_program_app.md` INT-03 implementation-plan and code/test traceability.
- Update `agonara/docs/backlog.md`, `agonara/README.md`, and `agonara/docs/implementation-notes.md` so topic/concept/material navigation is no longer broadly deferred after implementation.
- Update `agonara/docs/log.md` with the Phase 2 outcome.
- Refresh `docs/loc-dashboard.html` from `scripts/loc-dashboard.sh --sort=name` and verify the summary cards, table footer, `data` array, and `Last updated` line match the script output.
- Mark this plan's phase tracker complete only after verified gates and commits.
- Mark parent `agonara/docs/plans/agonara-product-gap-closure.md` Phase 2 complete only after this plan's implementation gates pass.
- Move this plan to `agonara/docs/plans/implemented/topic-concept-material-navigation.md`.

**Dependencies**: Phase 4 is complete.

**Risks**: docs can overclaim learner-state interpretation, topic-level readiness checks, invitation/recovery flows, curator coverage gaps, or LLM-assisted curation, which remain later parent-plan phases.

**Validation**:

- Targeted browser command.
- Targeted HTTP command.
- Targeted backup/restore command.
- Full Agonara tests.
- Root build.
- Markdown/front-matter/link checks for touched docs.
- Dashboard consistency check against `./scripts/loc-dashboard.sh --sort=name`.
- `git diff --check`.
- Post-implementation self-review and adversarial review against traceability, scope, dashboard, archive, and parent tracker correctness; fix every fail or warning and rerun affected gates.

**Completion signal**: Phase 2 is implemented, documented, dashboard-refreshed, archived, and reflected in the parent product gap closure tracker without overclaiming later phases.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Done criteria

- Accepted navigation storage supports topics, concepts, definitions, principles, material references, stable current revisions, historical revisions, accepted relationships, and relationship revisions.
- Graph validation rejects malformed same-Program, source, endpoint-kind, missing-reference, missing-current-revision, and prerequisite-cycle states before mutation or restore.
- Effective Program Curators can create, list, accept, reject, and inspect navigation candidates and relationship updates through HTTP and UI.
- Effective Students can read Program coverage, topic detail, concept detail, material detail, linked materials, material-to-structure back links, and historical navigation revisions through student-safe HTTP and UI projections.
- Student-safe projections and UI never render source ids, candidate ids, curator rationale, accepted-by identity ids, acceptance timestamps, draft/rejected candidates, session ids, CSRF tokens, cookie names, operational metadata, or secrets.
- Navigation reads do not create or mutate Student Workspace viewing history, last position, progress, mastery, weak areas, attempts, answers, evidence, or events.
- Browser tests cover Program preview, topic traversal, concept traversal, material traversal, back navigation, redaction, accessibility, desktop layout, and mobile layout.
- Agonara tests, root build, targeted storage/domain/HTTP/backup/browser tests, docs checks, dashboard consistency check, and `git diff --check` pass.
- Post-implementation self-review and adversarial review are clean for every phase.
- `docs/loc-dashboard.html` is refreshed and verified against `scripts/loc-dashboard.sh --sort=name`.
- This plan is moved to `agonara/docs/plans/implemented/`, the parent Phase 2 tracker is marked complete, and both changes are committed.

## Final closeout

Final gates: `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation storage" node --test --test-name-pattern "navigation|Navigation" agonara/tests/storage.test.js`, `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation domain" node --test --test-name-pattern "navigation|Navigation" agonara/tests/corpus.test.js agonara/tests/corpus-executable-acceptance.test.js`, `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation http" node --test --test-name-pattern "navigation|Navigation" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js`, `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation backup restore" node --test --test-name-pattern "navigation|Navigation" agonara/tests/backup-restore.test.js`, `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation browser" npx playwright test agonara/tests/topic-concept-material-navigation.playwright.js --config agonara/playwright.config.js`, `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`, `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`, Markdown/front-matter/link checks for touched docs, dashboard consistency check against `scripts/loc-dashboard.sh --sort=name`, and `git diff --check`.
Archive plan: move to `agonara/docs/plans/implemented/topic-concept-material-navigation.md`.
Commit archive move: yes.
Push/PR: follow push policy; no push unless explicitly requested.
