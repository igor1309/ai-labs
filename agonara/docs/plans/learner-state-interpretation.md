---
date: 2026-06-03
model: gpt-5
description: "Implementation plan: Agonara learner-state interpretation."
---

# Learner-State Interpretation Implementation Plan

## Full Review Findings

### Finding - Progress and weak-area interpretation are not built

Verdict: fail

Why: Product Intent accepts personal progress and weak-area visibility, but INT-07 remains a next-slice handoff and the backlog still asks which persisted learner-state summaries are allowed. Existing attempts and feedback are raw evidence, not interpreted progress state.

Location: `agonara/docs/intent_learning_program_app.md:187`, `agonara/docs/backlog.md:19`, `agonara/docs/student_user_stories.md:152`, `agonara/docs/student_user_stories.md:160`, `agonara/docs/module_responsibility_map.md:71`

Fix: Specify a Student Workspace learner-state interpretation boundary that derives progress and weak-area summaries from accepted checks, attempts, and feedback without mutating Program corpus. Then implement read-time derivation according to the spec.

Required tests: Add evidence-to-summary derivation tests, separation-from-corpus tests, historical evidence preservation tests, owner-only progress reads, and UI tests that expose supporting evidence behind each progress or weak-area label.

### Finding - Phase 3 spec checkpoint is complete

Verdict: pass

Why: The governing learner-state interpretation spec defines owner-only read-time summaries, explicit learner evidence target links, target-link curation commands, Student-safe evidence summaries, HTTP routes, redaction rules, backup/restore preservation, and the no-implicit-target-inference invariant.

Location: `agonara/docs/specs/learner-state-interpretation.md:14`, `agonara/docs/specs/learner-state-interpretation.md:42`, `agonara/docs/specs/learner-state-interpretation.md:147`

Fix: none for this plan. Implement the spec without widening scope.

Required tests: use the implementation phases below.

## Goal

Implement `agonara/docs/specs/learner-state-interpretation.md` for INT-07 so Agonara can derive owner-only personal progress, weak-area, and supporting-evidence summaries from accepted checks and Student evidence without persisting authoritative learner-state labels or mutating accepted Program corpus.

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

- Do not add topic-level checks, period-level checks, readiness decisions, recommendation ranking, grades, analytics, learner-model caches, LLM/provider calls, evaluator-worker execution, source extraction, scoring services, resume/last-position recording, material scraping, or new frontend frameworks.
- Do not persist final progress labels, mastery labels, weak-area labels, recommendation labels, or next-step labels as authoritative state.
- Do not infer topic, concept, or material-reference progress from shared `sourceIds`, matching titles, matching text, source co-occurrence, candidate provenance, evaluator output, provider output, or navigation relationship proximity.
- Do not let Student Workspace create, update, delete, or infer `LearnerEvidenceTargetLink` records. Target-link curation belongs to the accepted Program corpus boundary.
- Do not let learner-state reads create, update, reject, delete, or rewrite Program sources, candidates, accepted corpus entities, accepted revisions, navigation entities, navigation relationships, accepted checks, accepted criteria, Program Membership records, sessions, attempts, answers, evaluations, evaluator evidence, evaluator jobs, or audit events.
- Do not expose answer keys, candidate ids, accepted-by identity ids, source ids, curator rationale, idempotency keys, evaluator leases, provider diagnostics, raw prompts, raw model responses, sessions, CSRF tokens, cookies, SQL text, filesystem paths, stack traces, database URLs, provider credentials, or infrastructure details on learner-state HTTP responses or UI surfaces.
- Do not add Admin or Program Curator learner-state reads. Program Curators can curate target links; only owning Students can read learner-state summaries and target details.
- Do not start implementation until this plan has passed adversarial review and been committed.
- Do not commit any implementation phase until targeted tests, full Agonara tests, root build, `git diff --check`, and post-implementation self/adversarial review are clean.
- Do not mark parent Phase 3 complete until this child plan is fully implemented, verified, reviewed clean, archived, and committed.

## Exact implementation inventory

Expected files:

- `agonara/src/storage.js` - learner evidence target-link records, idempotent active-link creation, soft deletion, active-link listing, backup export, and restore validation for target links.
- `agonara/src/corpus.js` - target-link curation commands owned by the accepted Program corpus boundary, including Program Curator authorization and accepted target/evidence-owner validation.
- `agonara/src/student-workspace.js` - read-time learner-state derivation, evidence projection, latest-per-source-key level calculation, weak-area sorting, navigation rollups, owner-only query authorization, and Student-safe target detail.
- `agonara/src/server.js` - target-link and learner-state HTTP route parsing, CSRF/session enforcement, status mapping, redacted response mapping, and production composition wiring.
- `agonara/src/learn-ui.js` - `/learn` learner-state UI for Program Curator target-link curation and Student progress/weak-area/evidence reads.
- `agonara/tests/storage.test.js` - target-link storage, idempotency, soft deletion, backup/restore round-trip, and malformed restore rejection tests.
- `agonara/tests/corpus.test.js` - target-link domain validation, authorization, accepted-target checks, accepted-evidence-owner checks, and no-Student-state mutation tests.
- `agonara/tests/corpus-executable-acceptance.test.js` - executable target-link curation flow over Corpus commands.
- `agonara/tests/student-workspace.test.js` - evidence-to-summary derivation, latest-per-source-key levels, rollups, historical evidence preservation, owner-only reads, and no-corpus-mutation boundary tests.
- `agonara/tests/http-api.test.js` - HTTP route contracts, CSRF/session gates, Program Curator target-link mutations, owning-Student learner-state reads, non-owner denial, status mapping, and redaction tests.
- `agonara/tests/executable-acceptance.test.js` - end-to-end HTTP learner-state flow from accepted checks and attempts to Student-owned summaries.
- `agonara/tests/backup-restore.test.js` - target-link backup/restore preservation and malformed restored target-link rejection.
- `agonara/tests/learner-state-interpretation.playwright.js` - browser workflow, redaction, layout, accessibility, target-link curation, Student weak-area summary, and supporting-evidence detail tests.
- `agonara/playwright.config.js` - reuse existing Agonara Playwright config unless the new browser test needs a strictly additive project setting.
- `agonara/docs/specs/learner-state-interpretation.md` - update status and implementation status during closeout.
- `agonara/docs/intent_learning_program_app.md` - update INT-07 implementation-plan and code/test traceability during closeout.
- `agonara/docs/backlog.md` - remove or narrow the deferred INT-07 learner-state interpretation gap during closeout.
- `agonara/README.md` - move progress and weak-area interpretation from deferred to implemented snapshot during closeout.
- `agonara/docs/implementation-notes.md` - update current-state notes during closeout.
- `agonara/docs/log.md` - record each completed phase outcome.
- `agonara/docs/plans/implemented/learner-state-interpretation.md` - archived plan after completion.
- `agonara/docs/plans/agonara-product-gap-closure.md` - mark parent Phase 3 complete only after this plan's final gates pass.
- `docs/loc-dashboard.html` - refresh during final closeout after code and docs LOC changes.

HTTP and shell routes:

- `GET /learn`
- `POST /identity/sessions`
- `GET /identity/session`
- `DELETE /identity/session`
- `GET /programs/{programId}/learner-state-target-links`
- `POST /programs/{programId}/learner-state-target-links`
- `DELETE /learner-state-target-links/{linkId}`
- `GET /programs/{programId}/learner-state`
- `GET /learner-state/targets/{targetKind}/{targetId}`

Required UI screens and stable element ids:

- Learner-state app section: `#learner-state-section`.
- Target-link curation panel: `#learner-state-target-link-panel`.
- Target-link form: `#learner-state-target-link-form`, `#learner-state-target-kind-input`, `#learner-state-target-id-input`, `#learner-state-evidence-owner-kind-input`, `#learner-state-evidence-owner-id-input`.
- Target-link list and actions: `#learner-state-target-link-list`, `#refresh-learner-state-target-links-button`, `data-action="delete-learner-state-target-link"`, `#learner-state-target-link-status`.
- Student learner-state panel: `#learner-state-student-panel`, `#refresh-learner-state-button`, `#learner-state-summary`.
- Target summary lists: `#learner-state-weak-area-list`, `#learner-state-topic-list`, `#learner-state-concept-list`, `#learner-state-material-list`, `#learner-state-check-list`, `#learner-state-criterion-list`.
- Target detail and evidence: `#learner-state-target-detail`, `#learner-state-evidence-list`, `data-action="open-learner-state-target"`.
- Learner-state status: `#learner-state-status`.

Targeted commands:

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state storage" node --test --test-name-pattern "learner|Learner" agonara/tests/storage.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state corpus" node --test --test-name-pattern "learner|Learner" agonara/tests/corpus.test.js agonara/tests/corpus-executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state domain" node --test --test-name-pattern "learner|Learner" agonara/tests/student-workspace.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state http" node --test --test-name-pattern "learner|Learner" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state backup restore" node --test --test-name-pattern "learner|Learner" agonara/tests/backup-restore.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx playwright --version`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state browser" npx playwright test agonara/tests/learner-state-interpretation.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "quick check product ui browser" npx playwright test agonara/tests/quick-check-product-ui.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation browser" npx playwright test agonara/tests/topic-concept-material-navigation.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git diff --check`

## Phase tracker

- [ ] Phase 1 - Target-Link Storage and Restore Validation
- [ ] Phase 2 - Corpus Target-Link Curation Commands
- [ ] Phase 3 - Student Workspace Learner-State Derivation
- [ ] Phase 4 - HTTP Learner-State API
- [ ] Phase 5 - Product UI Learner-State Surfaces
- [ ] Phase 6 - Traceability, Dashboard, Archive, and Parent Closeout

Update tracker checkboxes only after the phase's required verification passes and the phase commit is created.

## ADR traceability matrix

| ADR / spec invariant | Phase |
|---|---|
| ADR-010 keeps accepted Program corpus metadata behind curator acceptance. | Phase 1, Phase 2, Phase 4, Phase 5 |
| ADR-011 keeps accepted checks and criteria in Corpus Storage while attempts, feedback, mastery, weak areas, and progress evidence stay in Student Workspace. | Phase 2, Phase 3, Phase 4, Phase 5 |
| ADR-012 keeps open-answer attempts and feedback owner-only Student state. | Phase 3, Phase 4, Phase 5 |
| ADR-016 protects Quick Check answer keys while allowing matched/not-matched evidence. | Phase 3, Phase 4, Phase 5 |
| Topic, Concept, and Material Navigation requires explicit target links for navigation progress and forbids implicit source/title/text inference. | Phase 2, Phase 3, Phase 4, Phase 5 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| INT-07 - Personal mastery, weak areas, and evidence | Phase 3, Phase 4, Phase 5 |
| STU-15 - See personal progress state | Phase 3, Phase 4, Phase 5 |
| STU-16 - See weak areas | Phase 3, Phase 4, Phase 5 |
| STU-17 - See evidence behind progress | Phase 3, Phase 4, Phase 5 |
| CUR-06 - Keep accepted content separate from drafts | Phase 1, Phase 2 |
| INT-03 - Study materials in program context | Phase 2, Phase 3, Phase 5 |
| INT-04 - Check understanding during study | Phase 3, Phase 4, Phase 5 |

## Phase 1 - Target-Link Storage and Restore Validation

**Objective**: add persistence for learner evidence target links with idempotent active-link creation, soft deletion, active-link listing, and restore-time validation.

**Key work items**:

- Add RED storage tests for creating active links with Program id, target kind/id, evidence owner kind/entity id, creator identity, and timestamps.
- Add RED storage tests proving duplicate active links for the same Program, target, and evidence owner return the existing active link instead of creating another row.
- Add RED storage tests proving deleting a link marks it `deleted`, updates `updatedAt`, and excludes it from active-link lists.
- Add RED storage tests proving a deleted link does not block later creation of a new active link for the same Program, target, and evidence owner.
- Add RED backup/restore tests proving active and deleted target links round-trip with stable ids and timestamps.
- Add RED backup/restore tests proving malformed target-link records, duplicate active links, missing Programs, missing creator identities, unsupported kinds, and cross-Program target or evidence-owner references are rejected before mutation.
- Implement target-link storage and restore validation in `agonara/src/storage.js`.

**Dependencies**: this child plan is committed; parent Phase 3 spec checkpoint is complete.

**Risks**: duplicate active-link records can make read-time derivation double-count evidence, and restore validation can import target links that point at non-current or cross-Program accepted entities.

**Validation**:

- Targeted storage command.
- Targeted backup/restore command.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against storage uniqueness, deletion semantics, and restore rejection; fix every fail or warning and rerun affected gates.

**Completion signal**: target-link storage preserves active/deleted history, lists only active links, and restore rejects malformed or cross-boundary target-link graphs before mutation.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 2 - Corpus Target-Link Curation Commands

**Objective**: implement target-link curation commands in the Corpus boundary with effective Program Curator authorization and accepted-target/evidence-owner validation.

**Key work items**:

- Add RED Corpus tests for `createLearnerEvidenceTargetLink`, `deleteLearnerEvidenceTargetLink`, and `listLearnerEvidenceTargetLinks`.
- Add RED Corpus tests proving active Identity and effective Program Curator participation are required for target-link creation, deletion, and listing.
- Add RED Corpus tests proving unsupported target kinds, missing navigation targets, draft/rejected navigation targets, non-navigation targets, and cross-Program navigation targets reject with spec reasons.
- Add RED Corpus tests proving missing accepted quick checks, missing accepted open-answer checks, missing accepted assessment criteria, draft/rejected evidence owners, and cross-Program evidence owners reject with spec reasons.
- Add RED Corpus tests proving successful curation does not create Student Workspace attempts, feedback, learner-state labels, progress events, weak-area records, or Student Workspace mutations.
- Add RED executable Corpus acceptance coverage for curator-created target links and soft deletion.
- Implement target-link curation commands in `agonara/src/corpus.js` over the Phase 1 storage helpers.

**Dependencies**: Phase 1 is complete.

**Risks**: putting target-link curation in Student Workspace would blur ownership, while weak target/evidence validation would let learner-state reads derive summaries from unrelated Programs.

**Validation**:

- Targeted corpus command.
- Targeted storage command if storage helper contracts change.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against Corpus ownership, Program Curator authorization, target/evidence validation, and Student Workspace non-mutation; fix every fail or warning and rerun affected gates.

**Completion signal**: Program Curators can curate explicit learner evidence target links as accepted Program corpus metadata, and no Student Workspace state changes during curation.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 3 - Student Workspace Learner-State Derivation

**Objective**: derive owner-only learner-state Program summaries and target details at read time from accepted checks, attempts, feedback, evaluator evidence, accepted navigation graph, and active target links.

**Key work items**:

- Add RED Student Workspace tests for Quick Check evidence mapping: matched attempts produce `positive`, unmatched attempts produce `negative`, and answer keys stay unavailable in summaries.
- Add RED Student Workspace tests for open-answer check evidence mapping: submitted/evaluating/evaluation-failed attempts without final evaluation produce `pending`; evaluated attempts produce check-level and criterion-level evidence.
- Add RED Student Workspace tests for criterion outcome mapping: `met` maps to `positive`, `partially_met` and `unclear` map to `partial`, and `missing` maps to `negative`.
- Add RED Student Workspace tests for latest-per-source-key level calculation across `no_evidence`, `in_progress`, `developing`, `on_track`, and `needs_attention`.
- Add RED Student Workspace tests proving later positive evidence can change the target level while target detail still preserves earlier negative evidence in reverse chronological order.
- Add RED Student Workspace tests for Program summary totals, Program level derivation, weak-area filtering, and weak-area sorting by latest evidence descending then title ascending.
- Add RED Student Workspace tests for explicit active target-link contribution to topic, concept, and material-reference targets.
- Add RED Student Workspace tests proving deleted links and missing links prevent navigation-target contribution.
- Add RED Student Workspace tests for topic rollups through current accepted `topic_includes_concept` relationships and concept rollups through current accepted `concept_has_definition`, `concept_has_principle`, and `concept_uses_material` relationships.
- Add RED Student Workspace tests proving no implicit target inference from source ids, titles, text, co-occurrence, candidate provenance, evaluator output, or provider output.
- Add RED Student Workspace tests proving owner-only reads reject Curators, Admins, other Students in the Program, Students outside the Program, disabled identities, unknown Programs, unsupported target kinds, malformed target ids, and cross-Program target ids.
- Add RED Student Workspace boundary tests proving learner-state reads do not mutate Program corpus, target links, navigation entities, navigation relationships, accepted checks, accepted criteria, membership, sessions, attempts, answers, evaluations, evaluator evidence, evaluator jobs, or audit events.
- Implement learner-state derivation in `agonara/src/student-workspace.js` using read-only adapters over storage, Corpus, navigation, Quick Check, and open-answer evidence.

**Dependencies**: Phase 2 is complete.

**Risks**: the derivation can accidentally become a hidden recommendation engine, persist labels, leak answer keys, or conflate shared Program corpus with personal Student evidence.

**Validation**:

- Targeted domain command.
- Targeted corpus command if target-link projections change.
- Targeted storage command if evidence reads change storage helpers.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against owner-only reads, redaction, latest-evidence semantics, explicit target-link semantics, rollups, and non-mutation boundaries; fix every fail or warning and rerun affected gates.

**Completion signal**: owning Students can derive Program summaries and target details at read time, with weak areas and evidence details matching the spec and no persisted authoritative learner-state labels.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 4 - HTTP Learner-State API

**Objective**: expose target-link curation and owner-only learner-state read routes through the HTTP server with session, CSRF, status mapping, and redaction.

**Key work items**:

- Add RED HTTP tests for `GET /programs/{programId}/learner-state-target-links`.
- Add RED HTTP tests for `POST /programs/{programId}/learner-state-target-links` with mutation CSRF.
- Add RED HTTP tests for `DELETE /learner-state-target-links/{linkId}` with mutation CSRF.
- Add RED HTTP tests for `GET /programs/{programId}/learner-state`.
- Add RED HTTP tests for `GET /learner-state/targets/{targetKind}/{targetId}`.
- Add RED HTTP tests for Program Curator-only target-link curation and owner-only Student learner-state reads.
- Add RED HTTP tests for non-owner target detail hiding behind the same rejection reason used for missing or unavailable targets.
- Add RED HTTP tests for malformed bodies, unsupported target/evidence kinds, invalid target ids, invalid owner ids, status mapping, session failures, CSRF failures, and disabled identities.
- Add RED HTTP tests proving responses omit protected fields and operational details named by the spec.
- Add RED executable HTTP acceptance coverage from target-link curation through Student-owned summary and target detail reads.
- Implement route parsing, request validation, result mapping, CSRF/session enforcement, and response redaction in `agonara/src/server.js`.

**Dependencies**: Phase 3 is complete.

**Risks**: HTTP mapping can reveal private target existence to non-owners or expose internal evidence/provenance fields that the domain projection keeps hidden.

**Validation**:

- Targeted HTTP command.
- Targeted domain and corpus commands if route mapping changes command contracts.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against route contracts, CSRF/session behavior, owner-only privacy, status mapping, redaction, and existing-route preservation; fix every fail or warning and rerun affected gates.

**Completion signal**: HTTP clients can curate target links as Program Curators and read learner-state summaries as owning Students without privacy or redaction regressions.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 5 - Product UI Learner-State Surfaces

**Objective**: extend `/learn` with target-link curation controls for Program Curators and learner-state summary/detail views for owning Students.

**Key work items**:

- Verify the installed Playwright version and browser availability before writing browser tests.
- Add RED Playwright tests for Program Curator target-link list, create, idempotent create, delete, and refresh workflows.
- Add RED Playwright tests proving Curator target-link controls do not expose Student progress summaries, attempts, answers, feedback, evaluator evidence, or learner-state labels.
- Add RED Playwright tests for Student learner-state summary refresh, Program level, totals, weak-area list, topic/concept/material/check/criterion lists, and target detail opening.
- Add RED Playwright tests proving target detail exposes supporting evidence summaries without answer keys, candidate ids, curator rationale, accepted-by identity ids, source ids, idempotency keys, evaluator leases, provider diagnostics, raw prompts, raw model responses, sessions, CSRF tokens, cookies, SQL text, filesystem paths, stack traces, database URLs, provider credentials, or infrastructure details.
- Add RED Playwright tests for non-owner learner-state denial and private target-detail denial.
- Add RED desktop and mobile layout checks proving learner-state text fits, panels do not overlap, target/evidence lists remain stable, and existing Quick Check and navigation UI sections remain reachable.
- Implement the UI in `agonara/src/learn-ui.js` using the existing static app pattern and the stable ids in this plan.

**Dependencies**: Phase 4 is complete.

**Risks**: UI state shared across Curator and Student modes can leak Student-specific evidence to Program Curators or render protected curation metadata in Student detail.

**Validation**:

- Targeted browser command.
- Quick Check product UI browser regression command.
- Navigation browser regression command.
- Targeted HTTP command if UI route shell or route assumptions change.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against UI redaction, owner-only behavior, role-mode isolation, layout, accessibility, and existing `/learn` workflow preservation; fix every fail or warning and rerun affected gates.

**Completion signal**: Program Curators can manage learner-state target links in `/learn`, owning Students can inspect progress, weak areas, and evidence in `/learn`, and existing `/learn` Quick Check and navigation flows remain usable.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 6 - Traceability, Dashboard, Archive, and Parent Closeout

**Objective**: close documentation, dashboard, parent-plan tracker, and archive requirements after implementation is verified and reviewed clean.

**Key work items**:

- Update `agonara/docs/specs/learner-state-interpretation.md` to `status: implemented` with an implementation status section linking the archived plan, route tests, domain tests, browser tests, and final gates.
- Update `agonara/docs/intent_learning_program_app.md` so INT-07 points to implemented learner-state routes, UI, tests, and archived plan.
- Update `agonara/docs/backlog.md` to remove or narrow the deferred learner-state interpretation gap.
- Update `agonara/README.md` so progress and weak-area interpretation appears in the implemented snapshot rather than deferred status.
- Update `agonara/docs/implementation-notes.md` with current-state behavior and first-slice limits.
- Update `agonara/docs/log.md` with concise outcome-focused closeout entry.
- Update this plan's Phase tracker to mark Phase 6 complete only after final gates pass.
- Update `agonara/docs/plans/agonara-product-gap-closure.md` to mark Phase 3 complete only after this plan's final gates pass.
- Run `./scripts/loc-dashboard.sh --sort=name` and refresh `docs/loc-dashboard.html`.
- Move this plan to `agonara/docs/plans/implemented/learner-state-interpretation.md` in the same closeout commit.

**Dependencies**: Phase 5 is complete and all implementation gates are green.

**Risks**: traceability can overstate implementation beyond the first slice, or the parent plan can be marked complete before dashboard and archive closeout are actually committed.

**Validation**:

- Docs/front-matter/required-section/link checks.
- `./scripts/loc-dashboard.sh --sort=name`
- Full Agonara tests.
- Root build.
- Browser commands from Phase 5.
- `git diff --check`.
- Post-closeout self-review and adversarial review against traceability, dashboard freshness, archive placement, parent tracker status, and no-overclaim wording; fix every fail or warning and rerun affected gates.

**Completion signal**: learner-state implementation is documented as implemented, parent Phase 3 is marked complete, LOC dashboard is refreshed, this plan is archived, and all final gates pass.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Done criteria

- All six phases are implemented in order, each with targeted verification, full Agonara tests, root build, `git diff --check`, post-implementation self-review, adversarial review, fixes for every fail or warning, and a local commit on green.
- Target-link curation is implemented as explicit accepted Program corpus metadata, with active/deleted status, backup/restore preservation, and no Student Workspace mutation.
- Learner-state summaries and target details are derived at read time from accepted checks, attempts, feedback, evaluator evidence, active target links, and accepted navigation graph relationships.
- Owner-only learner-state reads reject or hide unavailable target details according to the spec and never expose protected fields or operational details.
- `/learn` exposes Program Curator target-link curation and owning-Student progress/weak-area/evidence views while preserving existing Quick Check and navigation workflows.
- The learner-state spec, Product Intent, backlog, README, implementation notes, log, parent gap-closure plan, and LOC dashboard all reflect the implemented first slice without overclaiming topic/period readiness, recommendations, grades, analytics, or persisted mastery labels.
- This implementation plan is archived under `agonara/docs/plans/implemented/` in the same branch change set as the implementation.

## Final closeout

Final gates: `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state storage" node --test --test-name-pattern "learner|Learner" agonara/tests/storage.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state corpus" node --test --test-name-pattern "learner|Learner" agonara/tests/corpus.test.js agonara/tests/corpus-executable-acceptance.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state domain" node --test --test-name-pattern "learner|Learner" agonara/tests/student-workspace.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state http" node --test --test-name-pattern "learner|Learner" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state backup restore" node --test --test-name-pattern "learner|Learner" agonara/tests/backup-restore.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state browser" npx playwright test agonara/tests/learner-state-interpretation.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "quick check product ui browser" npx playwright test agonara/tests/quick-check-product-ui.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation browser" npx playwright test agonara/tests/topic-concept-material-navigation.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`; `./scripts/loc-dashboard.sh --sort=name`; docs/front-matter/required-section/link checks; `git diff --check`
Archive plan: move to `agonara/docs/plans/implemented/learner-state-interpretation.md`
Commit archive move: yes
Push/PR: follow push policy
