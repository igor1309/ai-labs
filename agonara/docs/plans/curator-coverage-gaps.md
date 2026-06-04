---
date: 2026-06-04
model: gpt-5
description: "Implementation plan: Agonara Curator Coverage Gaps."
---

# Curator Coverage Gaps Implementation Plan

## Full Review Findings

### Finding - Curator coverage gaps are not built

Verdict: warning

Why: Product Intent and the module responsibility map expect Curator Workspace to support gap discovery while keeping draft guidance separate from accepted corpus and Student state. The governing spec now exists, but no Curator Workspace query, HTTP route, UI surface, tests, traceability closeout, or dashboard refresh exists for Phase 6.

Location: `agonara/docs/plans/agonara-product-gap-closure.md:395`, `agonara/docs/specs/curator-coverage-gaps.md:14`, `agonara/docs/module_responsibility_map.md:80`, `agonara/docs/intent_learning_program_app.md:181`

Fix: Implement the read-only Curator Coverage Gaps first slice from `agonara/docs/specs/curator-coverage-gaps.md`, expose it to effective Program Curators through HTTP and `/learn`, then close traceability and archive this plan.

Required tests: Add Curator Workspace diagnostic calculation tests, HTTP authorization/filter/redaction tests, `/learn` browser tests, regression tests proving no accepted corpus, candidate, target-link, LLM suggestion, Student Workspace, Program Membership, Identity, or domain audit/event mutation occurs, and closeout docs checks.

### Finding - Phase 6 spec checkpoint is complete

Verdict: pass

Why: The governing spec defines a read-only Curator Workspace diagnostic over accepted navigation, checks, learner-evidence target links, and readiness requirements. It rejects Student/Admin-only callers, uses deterministic gap ids and ordering, returns `draft_guidance`, and explicitly forbids candidate creation, LLM calls, accepted-corpus mutation, and Student weak-area coupling.

Location: `agonara/docs/specs/curator-coverage-gaps.md:18`, `agonara/docs/specs/curator-coverage-gaps.md:88`, `agonara/docs/specs/curator-coverage-gaps.md:128`, `agonara/docs/specs/curator-coverage-gaps.md:170`

Fix: none for this plan. Implement the spec without adding persisted dispositions, draft candidate creation, provider calls, analytics, or Student-state reads.

Required tests: use the implementation phases below.

## Adversarial Review Closure

### Review finding - optional storage helper changes lacked targeted storage verification

Verdict: warning

Why: The first plan version allowed read-only `agonara/src/storage.js` helper exports if existing accepted-record reads were insufficient, but it did not add a targeted storage command or phase validation tied to that optional edit. A plan should keep verification proportional to every file it authorizes changing.

Fix applied: Added a conditional `coverage storage` targeted command and Phase 1 validation requirement whenever storage helper exports or storage tests change.

### Review finding - Product Intent traceability overclaimed student-story delivery

Verdict: warning

Why: The first plan version mapped INT-03, INT-04, INT-06, and INT-07 directly to Phase 1 without saying they are accepted-corpus inputs or boundary-protection stories. That could make a curator diagnostic look like it delivers student navigation, checking, readiness, or progress UX.

Fix applied: Reworded the Product Intent traceability rows so INT-01 is the delivered curator capability, while INT-03, INT-04, INT-06, and INT-07 are protected as input/boundary constraints.

### Review finding - tracker update commit rule was implicit

Verdict: warning

Why: The first plan version said tracker checkboxes update only after verified gates, but it did not explicitly require a committed tracker update after each green phase. Repo process gates require plan tracker updates to match completed work and be committed.

Fix applied: Added an explicit tracker-update commit rule after each phase's implementation and hardening commits are green.

## Goal

Implement `agonara/docs/specs/curator-coverage-gaps.md` for INT-01 so effective Program Curators can inspect read-only draft guidance about missing accepted-corpus coverage without mutating accepted Program corpus, Student Workspace state, Program Membership, Identity, target links, candidate records, accepted revisions, LLM suggestions, or domain audit/event records.

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

- Do not add persisted coverage-gap records, dismissal/disposition state, draft candidate creation, accepted corpus writes, target-link writes, LLM/provider calls, source ingestion, recommendation ranking, analytics, notifications, scheduling, classroom/cohort workflows, or new frontend frameworks.
- Do not read Student Workspace attempts, readiness attempts, learner-state summaries, weak areas, progress labels, feedback, evaluator evidence, learning sessions, submitted answers, or readiness result history.
- Do not mutate Corpus Storage, Curator Workspace candidate records, Student Workspace, Program Membership, Identity, accepted revisions, learner-evidence target links, LLM suggestion records, operational domain audit/event records, sessions, or credentials.
- Do not make Admin authority satisfy Program Curator participation for this product workflow.
- Do not expose answer keys, correctness metadata, candidate ids, accepted-by identity ids, curator rationale, idempotency keys, submitted answers, feedback, evaluator leases, provider diagnostics, raw prompts, raw model responses, sessions, CSRF tokens, cookies, SQL text, filesystem paths, database URLs, provider credentials, stack traces, or infrastructure details in HTTP or UI output.
- Do not treat coverage gaps as Student weak areas, Student progress, readiness results, or accepted corpus facts.
- Do not start implementation until this plan and the governing spec have passed adversarial review and been committed.
- Do not start or resume a phase if implementation preflight reports a different worktree or branch.
- Do not commit any implementation phase until targeted tests, full Agonara tests, root build, `git diff --check`, and post-implementation self/adversarial review are clean.
- Do not mark parent Phase 6 complete until this child plan is fully implemented, verified, reviewed clean, archived, dashboard-refreshed, and committed.

## Exact implementation inventory

Expected files:

- `agonara/src/curator-workspace.js` - new Curator Workspace read boundary for `inspectCuratorCoverageGaps`, authorization, input validation, accepted-corpus diagnostics, deterministic gap ids/order, severity filtering, and redacted report summaries.
- `agonara/src/storage.js` - read-only helper exports only if existing accepted navigation, accepted check, learner-evidence target-link, or readiness reads are not already exposed; no schema changes or write helpers. Any storage helper change must include targeted storage coverage.
- `agonara/src/server.js` - session-backed `GET /programs/{programId}/coverage-gaps` route, query parsing, status mapping, redacted response, and production composition wiring.
- `agonara/src/learn-ui.js` - `/learn` Program Curator coverage inspection UI and drill-down state.
- `agonara/tests/curator-workspace.test.js` - Curator Workspace diagnostic calculation, authorization, filtering, deterministic ordering, redaction, and no-mutation tests.
- `agonara/tests/http-api.test.js` - coverage-gap HTTP route authorization, validation, status mapping, filtering, redaction, and private error tests.
- `agonara/tests/executable-acceptance.test.js` - end-to-end HTTP coverage-gap inspection over accepted navigation/check/readiness corpus.
- `agonara/tests/curator-coverage-gaps.playwright.js` - browser workflow, layout, redaction, Program Curator-only inspection, and existing `/learn` regression coverage.
- `agonara/playwright.config.js` - reuse existing Agonara Playwright config unless the new browser test needs a strictly additive project setting.
- `agonara/docs/specs/curator-coverage-gaps.md` - update status and implementation status during closeout.
- `agonara/docs/intent_learning_program_app.md` - update INT-01 implementation-plan and code/test traceability during closeout.
- `agonara/docs/backlog.md` - remove or narrow the deferred coverage-gap gap during closeout if present.
- `agonara/README.md` - move curator coverage-gap inspection from deferred to implemented snapshot during closeout if listed.
- `agonara/docs/implementation-notes.md` - update current-state behavior and first-slice limits during closeout.
- `agonara/docs/log.md` - record each completed phase outcome.
- `agonara/docs/plans/implemented/curator-coverage-gaps.md` - archived plan after completion.
- `agonara/docs/plans/agonara-product-gap-closure.md` - mark parent Phase 6 complete only after this plan's final gates pass.
- `docs/loc-dashboard.html` - refresh during final closeout after code and docs LOC changes.

HTTP routes:

- `GET /programs/{programId}/coverage-gaps?scopeKind={program|topic|concept}&scopeId={id}&minimumSeverity={info|warning|critical}&gapKind={kind}`
- `GET /learn`

Required UI screens and stable element ids:

- Coverage app section: `#coverage-gap-section`.
- Curator panel: `#coverage-gap-curator-panel`.
- Filter form: `#coverage-gap-filter-form`, `#coverage-gap-scope-kind-input`, `#coverage-gap-scope-id-input`, `#coverage-gap-minimum-severity-input`, `#coverage-gap-kind-filter-input`.
- Refresh and status: `#refresh-coverage-gaps-button`, `#coverage-gap-status`.
- Report surfaces: `#coverage-gap-summary`, `#coverage-gap-list`, `data-action="open-coverage-gap"`, `#coverage-gap-detail`.

Targeted commands:

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "coverage storage" node --test --test-name-pattern "coverage|Coverage|navigation|Navigation|learner.*target|Learner.*Target|readiness|Readiness|quick.*check|Quick.*Check" agonara/tests/storage.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "coverage workspace" node --test --test-name-pattern "coverage|Coverage" agonara/tests/curator-workspace.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "coverage http" node --test --test-name-pattern "coverage|Coverage" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx playwright --version`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "coverage browser" npx playwright test agonara/tests/curator-coverage-gaps.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "quick check product ui browser" npx playwright test agonara/tests/quick-check-product-ui.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation browser" npx playwright test agonara/tests/topic-concept-material-navigation.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "learner state browser" npx playwright test agonara/tests/learner-state-interpretation.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness browser" npx playwright test agonara/tests/topic-period-readiness-checks.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "membership browser" npx playwright test agonara/tests/program-membership-invitations-and-recovery.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `./scripts/loc-dashboard.sh --sort=name`
- `git diff --check`

## Phase tracker

- [x] Phase 1 - Curator Workspace Coverage Diagnostics
- [x] Phase 2 - HTTP Coverage Gaps API
- [x] Phase 3 - Product UI Coverage Inspection
- [ ] Phase 4 - Traceability, Dashboard, Archive, and Parent Closeout

Update tracker checkboxes only after the phase's required verification passes and the phase commit is created.

After each phase's implementation commit and any adversarial-review hardening commit are green, update this tracker and commit the tracker-only status update before starting the next phase. Phase 4 archives the plan instead of leaving an active tracker copy.

## ADR traceability matrix

| ADR / spec invariant | Phase |
|---|---|
| ADR-010 keeps accepted Program corpus behind curator acceptance and forbids diagnostic reads from creating accepted content. | Phase 1, Phase 2, Phase 3 |
| ADR-011 keeps accepted checks in Corpus Storage and Student attempts/evidence in Student Workspace. | Phase 1, Phase 2, Phase 3 |
| Curator Coverage Gaps returns `draft_guidance` and does not create candidates, LLM suggestions, accepted revisions, or target links. | Phase 1, Phase 2, Phase 3 |
| Learner-State Interpretation owns Student weak areas and progress, while coverage diagnostics stay curator-facing. | Phase 1, Phase 2, Phase 3 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| INT-01 - Assemble program from sources | Phase 1, Phase 2, Phase 3 deliver curator-side gap discovery as draft guidance. |
| INT-03 - Study materials in program context | Phase 1 inspects accepted topic/material relationships as corpus coverage inputs only. |
| INT-04 - Check understanding during study | Phase 1 inspects accepted check target links as corpus coverage inputs only. |
| INT-06 - Topic-level or period-level readiness checks | Phase 1 inspects accepted readiness requirement evidence paths as corpus coverage inputs only. |
| INT-07 - Personal mastery, weak areas, and evidence | Phase 1, Phase 2, Phase 3 protect Student weak areas and progress from curator coverage diagnostics. |

## Phase 1 - Curator Workspace Coverage Diagnostics

**Objective**: add the read-only Curator Workspace query that calculates deterministic coverage-gap reports over accepted Program corpus.

**Key work items**:

- Add RED Curator Workspace tests for active Identity and effective Program Curator authorization.
- Add RED tests proving Student-only and Admin-only callers are rejected with `program_curator_required`.
- Add RED validation tests for default Program scope, topic scope, concept scope, missing scope ids, invalid scope kinds, invalid gap kinds, invalid severity filters, cross-Program targets, and missing targets.
- Add RED diagnostic tests for `topic_without_concepts`, `topic_without_materials`, `concept_without_materials`, `topic_without_checks`, `concept_without_checks`, `check_without_target_links`, and `readiness_requirement_without_evidence_path`.
- Add RED tests for deterministic gap ids, deterministic severity ordering, stable non-time report fields, repeated `gapKind` filters, and `minimumSeverity`.
- Add RED redaction tests proving reports omit answer keys, correctness metadata, candidate ids, accepted-by identity ids, curator rationale, idempotency keys, submitted answers, feedback, evaluator/provider/session/CSRF/SQL/filesystem/infrastructure details.
- Add RED no-mutation tests around Corpus Storage, Student Workspace attempts/readiness attempts/learner-state records, Program Membership, Identity, target links, candidate records, accepted revisions, LLM suggestions, and domain audit/event records.
- Implement `createCuratorWorkspaceCommands` and `inspectCuratorCoverageGaps` in `agonara/src/curator-workspace.js`.
- Add storage read helper exports only when existing exports cannot read the accepted records needed for diagnostics.

**Dependencies**: this child plan is committed; the governing spec has passed adversarial review.

**Risks**: diagnostics can accidentally use Student learner-state summaries because the same evidence-link vocabulary appears in Student progress; deterministic ids can become unstable if they depend on generated timestamps or array order.

**Validation**:

- Conditional targeted coverage storage command if `agonara/src/storage.js` or `agonara/tests/storage.test.js` changes.
- Targeted coverage workspace command.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against Curator Workspace ownership, accepted-corpus-only inputs, no Student Workspace reads, no mutation, deterministic ids/order, validation, and redaction; fix every fail or warning and rerun affected gates.

**Completion signal**: `inspectCuratorCoverageGaps` returns deterministic read-only `draft_guidance` reports for effective Program Curators and rejects unauthorized or invalid reads without mutating domain state.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 2 - HTTP Coverage Gaps API

**Objective**: expose coverage-gap inspection through a session-backed Program Curator HTTP route.

**Key work items**:

- Add RED HTTP tests for `GET /programs/{programId}/coverage-gaps` success with Program Curator session.
- Add RED HTTP tests for signed-out, disabled Identity, Student-only, Admin-only, missing Program, invalid scope, invalid filter, and cross-Program scope behavior.
- Add RED HTTP tests for repeated `gapKind` query filters, `minimumSeverity`, Program/topic/concept scopes, deterministic response ordering, and private status mapping.
- Add RED HTTP redaction tests proving coverage responses omit answer keys, candidate ids, accepted-by identity ids, curator rationale, idempotency keys, Student answers, feedback, sessions, CSRF tokens, provider data, and infrastructure details.
- Add RED executable acceptance coverage for a Program Curator inspecting gaps over accepted navigation, Quick Check, learner-evidence target links, and readiness checks.
- Wire `createCuratorWorkspaceCommands` into production HTTP composition in `agonara/src/server.js`.
- Parse and validate query parameters without adding CSRF requirements to this read-only GET route.

**Dependencies**: Phase 1 is complete.

**Risks**: route status mapping can reveal private target existence across Programs, and HTTP composition can accidentally reuse Student Workspace commands to compute diagnostics.

**Validation**:

- Targeted coverage http command.
- Targeted coverage workspace command if query contracts change.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against session authorization, Program Curator-only access, private errors, redaction, read-only GET behavior, and production composition boundaries; fix every fail or warning and rerun affected gates.

**Completion signal**: Program Curators can inspect coverage-gap reports over HTTP with the specified filters and redaction while unauthorized callers receive private rejections.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 3 - Product UI Coverage Inspection

**Objective**: add `/learn` Curator UI controls for filtering, listing, and drilling into coverage gaps without exposing Student or protected curation metadata.

**Key work items**:

- Add RED Playwright tests for a Program Curator refreshing a Program-level coverage report and seeing severity, target, title, description, and `draft_guidance` status.
- Add RED Playwright tests for topic and concept scope filters, repeated gap-kind filtering through the UI, minimum severity filtering, and stable drill-down content.
- Add RED Playwright tests proving Student-only and Admin-only sessions cannot use the coverage UI to read reports.
- Add RED browser redaction checks for answer keys, correctness metadata, candidate ids, accepted-by identity ids, curator rationale, idempotency keys, submitted answers, feedback, sessions, CSRF tokens, provider data, and infrastructure details.
- Add RED layout/accessibility tests for desktop and mobile viewports, named controls, non-overlapping report rows, `aria-live` status, and existing `/learn` workflow preservation.
- Implement the coverage-gap section in `agonara/src/learn-ui.js` using the route from Phase 2.
- Preserve existing Quick Check, navigation, learner-state, readiness, and membership UI workflows.

**Dependencies**: Phase 2 is complete.

**Risks**: adding another `/learn` panel can clutter the work surface, leak curator-only metadata into report text, or break existing browser flows.

**Validation**:

- Playwright version command.
- Coverage browser command.
- Quick Check product UI browser command.
- Navigation browser command.
- Learner-state browser command.
- Readiness browser command.
- Membership browser command.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against UI redaction, Program Curator-only interaction, mobile/desktop layout, stable element ids, and regression preservation for existing `/learn` workflows; fix every fail or warning and rerun affected gates.

**Completion signal**: `/learn` lets Program Curators inspect and drill into coverage-gap draft guidance while Student/Admin-only sessions and protected data remain isolated.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 4 - Traceability, Dashboard, Archive, and Parent Closeout

**Objective**: close Phase 6 traceability after implementation is verified and reviewed clean.

**Key work items**:

- Update `agonara/docs/specs/curator-coverage-gaps.md` to `status: implemented` and add an implementation status section linking this archived plan, runtime files, and test files.
- Update INT-01 downstream traceability in `agonara/docs/intent_learning_program_app.md` with this implementation plan and coverage-gap code/test evidence.
- Update `agonara/README.md`, `agonara/docs/backlog.md`, and `agonara/docs/implementation-notes.md` only where they currently describe coverage gaps as missing or deferred.
- Add a closeout entry to `agonara/docs/log.md`.
- Mark parent Phase 6 complete in `agonara/docs/plans/agonara-product-gap-closure.md` only after all previous phases are committed and reviewed clean.
- Refresh `docs/loc-dashboard.html` with `./scripts/loc-dashboard.sh --sort=name`.
- Verify the LOC dashboard summary cards, table footer, `data` array, and `Last updated` line match the script output.
- Move this plan to `agonara/docs/plans/implemented/curator-coverage-gaps.md`.

**Dependencies**: Phase 3 is complete and all implementation review findings are fixed.

**Risks**: traceability can overstate implementation status before UI/HTTP/domain coverage is complete, and dashboard refresh can be skipped during docs-only closeout.

**Validation**:

- Markdown/front-matter/link checks for touched docs.
- LOC dashboard command and manual comparison against generated output.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-closeout self-review and adversarial review against spec status, Product Intent traceability, README/backlog/runtime status, parent-plan tracker, dashboard freshness, archive placement, and no stale active-plan copy; fix every fail or warning and rerun affected gates.

**Completion signal**: Curator Coverage Gaps is implemented, traceable from Product Intent through spec, plan, code, tests, UI, dashboard, and archived plan; parent Phase 6 is marked complete.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Done criteria

- Curator Workspace exposes a read-only `inspectCuratorCoverageGaps` query for effective Program Curators.
- HTTP exposes `GET /programs/{programId}/coverage-gaps` with Program Curator authorization, validation, filtering, deterministic ordering, and redaction.
- `/learn` exposes Program Curator coverage inspection and drill-down with stable UI ids, browser coverage, and no Student/Admin-only access.
- Coverage-gap diagnostics use only accepted Program corpus, accepted checks, accepted readiness checks, and active learner-evidence target links.
- Coverage-gap diagnostics do not read Student Workspace learner state, attempts, readiness attempts, weak areas, progress, feedback, evaluator evidence, or sessions.
- Coverage-gap diagnostics do not mutate accepted corpus, candidate records, target links, Student Workspace, Program Membership, Identity, accepted revisions, LLM suggestions, or domain audit/event records.
- Every phase passes targeted verification, full Agonara tests, root build, `git diff --check`, self-review, adversarial review, and commit-on-green.
- The spec status, Product Intent traceability, README/backlog/implementation notes, project log, parent Phase 6 tracker, LOC dashboard, and plan archive are updated during final closeout.

## Final closeout

Final gates: `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "coverage workspace" node --test --test-name-pattern "coverage|Coverage" agonara/tests/curator-workspace.test.js`, `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "coverage http" node --test --test-name-pattern "coverage|Coverage" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js`, `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "coverage browser" npx playwright test agonara/tests/curator-coverage-gaps.playwright.js --config agonara/playwright.config.js`, `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`, `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`, Markdown/front-matter/link checks for touched docs, `./scripts/loc-dashboard.sh --sort=name`, and `git diff --check`.
LOC dashboard: refresh `docs/loc-dashboard.html` with `./scripts/loc-dashboard.sh --sort=name`, then verify the summary cards, table footer, `data` array, and `Last updated` line match the script output.
Archive plan: move to `agonara/docs/plans/implemented/curator-coverage-gaps.md`
Commit archive move: yes
Push/PR: follow push policy; no push unless explicitly requested.
