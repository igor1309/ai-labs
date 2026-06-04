---
date: 2026-06-04
model: gpt-5
description: "Implementation plan: Agonara LLM-assisted curation suggestions."
---

# LLM-Assisted Curation Suggestions Implementation Plan

## Full Review Findings

### Finding - LLM-assisted curation suggestions are not built

Verdict: warning

Why: Product Intent, Curator user stories, the Module Responsibility Map, and the Phase 7 gap-closure plan require LLM-assisted suggestions to be draft Curator Workspace material with provenance and explicit curator review. The governing spec now exists, but no suggestion storage, Curator Workspace provider boundary, provider fake, review lifecycle, HTTP route, UI surface, backup/restore behavior, tests, traceability closeout, or dashboard refresh exists for Phase 7.

Location: `agonara/docs/plans/agonara-product-gap-closure.md:430`, `agonara/docs/specs/llm-assisted-curation-suggestions.md:14`, `agonara/docs/curator_user_stories.md:107`, `agonara/docs/module_responsibility_map.md:70`, `agonara/docs/intent_learning_program_app.md:181`

Fix: Implement `agonara/docs/specs/llm-assisted-curation-suggestions.md` as a Curator Workspace-owned draft suggestion workflow with provider fakes, redacted prompt context, output validation, budget checks, suggestion records, review lifecycle, draft-candidate materialization, HTTP routes, `/learn` UI, backup/restore validation, traceability closeout, and plan archive.

Required tests: Add storage and backup/restore tests for suggestion records and redaction, Curator Workspace tests for generation, provider failure, idempotency, provenance, accept, reject, materialization, and no-mutation boundaries, HTTP tests for curator-only reads/mutations and redaction, browser tests for suggestion generation/review/origin inspection, and boundary tests proving LLM output never becomes accepted corpus without explicit draft-candidate materialization followed by existing candidate acceptance.

### Finding - Phase 7 spec checkpoint is complete

Verdict: pass

Why: The governing spec defines a Curator Workspace-owned provider adapter protocol, policy shape, prompt-context redaction, output validation, draft suggestion records, explicit accept/reject lifecycle, draft-candidate materialization, backup/restore behavior, and out-of-scope provider/configuration limits. It also requires provider fakes before real provider wiring and keeps accepted Program corpus behind existing candidate acceptance rules.

Location: `agonara/docs/specs/llm-assisted-curation-suggestions.md:18`, `agonara/docs/specs/llm-assisted-curation-suggestions.md:69`, `agonara/docs/specs/llm-assisted-curation-suggestions.md:261`, `agonara/docs/specs/llm-assisted-curation-suggestions.md:381`

Fix: none for this plan. Implement the spec without adding hard-coded external provider configuration inside Curator Workspace, direct provider network calls from Curator Workspace, accepted corpus auto-promotion, Student Workspace reads/mutations, learner-state interpretation, Admin UI, Student UI, CLI commands, analytics, reporting, deployment targets, infrastructure ports, or provider-run observability dashboards.

Required tests: use the implementation phases below.

## Adversarial Review Closure

### Review finding - provider file ownership was implicit

Verdict: warning

Why: The first plan version listed `agonara/src/curator-workspace.js` and `agonara/src/server.js` as provider-boundary files, but it did not explicitly say no separate provider module or provider configuration file is in scope. Phase 7 requires exact Curator Workspace/provider files before implementation, and implicit provider file ownership could invite unplanned external-provider wiring.

Fix applied: Added an explicit provider-file note to the exact implementation inventory: the provider protocol and deterministic fake live in `agonara/src/curator-workspace.js`, production composition wires only that deterministic fake through `agonara/src/server.js`, and no separate provider source/configuration file is in scope for this implementation plan.

### Review finding - final closeout omitted browser regression gates

Verdict: warning

Why: Phase 5 requires Quick Check, navigation, coverage-gap, readiness, and membership browser regression commands to prove the new `/learn` panel preserves existing workflows. The first plan version listed those commands in Phase 5, but the final closeout gates only repeated the LLM suggestion browser command.

Fix applied: Added the Phase 5 browser regression commands to Phase 6 validation and the final closeout gates.

## Goal

Implement `agonara/docs/specs/llm-assisted-curation-suggestions.md` for CUR-11, CUR-12, CUR-13, and INT-01 so effective Program Curators can generate, inspect, accept, and reject LLM-assisted draft suggestions with redacted provenance and provider-boundary validation, while accepted Program corpus remains behind existing draft-candidate acceptance rules.

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

- Do not add hard-coded external provider configuration inside Curator Workspace or direct provider network calls from Curator Workspace; composition may supply adapters that satisfy the Curator Workspace-owned provider protocol.
- Do not add accepted corpus auto-promotion. Accepting an LLM suggestion may materialize one draft candidate only; existing candidate acceptance remains the only path into accepted Program corpus.
- Do not read or mutate Student Workspace attempts, submitted answers, readiness attempts, learner-state summaries, weak areas, progress labels, learning sessions, feedback, evaluator evidence, or student identity ids.
- Do not mutate accepted Program corpus, accepted check revisions, accepted readiness revisions, Program Membership state, Identity state, sessions, credentials, Admin authority, CSRF state, learner-evidence target links, or domain audit/event records during suggestion generation, listing, detail, acceptance, or rejection.
- Do not make Admin authority satisfy Program Curator participation for this product workflow.
- Do not persist, export, restore, log, or render raw prompts, raw model responses, provider request payloads, provider response payloads, provider diagnostics, hidden policy instructions, provider credentials, authorization headers, cookies, CSRF tokens, session identifiers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
- Do not include existing accepted-check answer keys, candidate ids, generated-by identity ids, accepted-by identity ids, or Student Workspace state in provider requests.
- Do not add Admin UI, Student UI, CLI commands, analytics, reporting, deployment targets, infrastructure ports, provider-run observability dashboards, new frontend frameworks, or provider credential management.
- Do not start implementation until this plan and the governing spec have passed adversarial review and been committed.
- Do not start or resume a phase if implementation preflight reports a different worktree or branch.
- Do not commit any implementation phase until targeted tests, full Agonara tests, root build, `git diff --check`, and post-implementation self/adversarial review are clean.
- Do not mark parent Phase 7 complete until this child plan is fully implemented, verified, reviewed clean, archived, dashboard-refreshed, and committed.

## Exact implementation inventory

Expected files:

- `agonara/src/storage.js` - LLM suggestion tables/records, generation idempotency records, status transitions, materialized candidate references, backup export, restore import, and restore graph/redaction validation.
- `agonara/src/curator-workspace.js` - Curator Workspace-owned suggestion policy, provider adapter protocol, provider fake hooks, prompt-context assembly, provider output validation, budget checks, suggestion generation, listing, detail, acceptance, rejection, candidate materialization, authorization, and redaction.
- `agonara/src/server.js` - suggestion HTTP routes, session/CSRF enforcement, body/query parsing, status mapping, response redaction, and production composition wiring with deterministic provider fake configuration only.
- `agonara/src/learn-ui.js` - `/learn` Program Curator suggestion generation, filter/list, detail/origin inspection, accept, reject, status, and protected-metadata redaction surfaces.
- `agonara/tests/storage.test.js` - suggestion storage, status transitions, idempotency, redaction constraints, and low-level restore graph validation tests when storage helpers are directly testable there.
- `agonara/tests/backup-restore.test.js` - backup/export preservation, restore round-trip, malformed restore rejection, raw-artifact rejection, and materialized candidate reference validation.
- `agonara/tests/curator-workspace.test.js` - generation, provider fake, policy validation, prompt-context redaction, provider failure, budget/output validation, idempotency, listing, detail, accept, reject, materialization, and no-mutation boundary tests.
- `agonara/tests/http-api.test.js` - suggestion HTTP route authorization, validation, CSRF/session behavior, status mapping, response redaction, private errors, and route absence tests.
- `agonara/tests/executable-acceptance.test.js` - end-to-end HTTP flow for Program Curator generation, detail origin inspection, acceptance into a draft candidate, rejection, and accepted-corpus non-promotion.
- `agonara/tests/llm-assisted-curation-suggestions.playwright.js` - browser workflow, layout, redaction, Program Curator-only generation/review, accept/reject, and existing `/learn` regression coverage.
- `agonara/playwright.config.js` - reuse existing Agonara Playwright config unless the new browser test needs a strictly additive project setting.
- `agonara/docs/specs/llm-assisted-curation-suggestions.md` - update status and implementation status during closeout.
- `agonara/docs/intent_learning_program_app.md` - update INT-01 implementation-plan and code/test traceability during closeout.
- `agonara/docs/backlog.md` - remove or narrow the deferred LLM-assisted curation gap during closeout if present.
- `agonara/README.md` - move LLM-assisted curation suggestions from deferred to implemented snapshot during closeout if listed.
- `agonara/docs/implementation-notes.md` - update current-state behavior and first-slice limits during closeout.
- `agonara/docs/log.md` - record each completed phase outcome.
- `agonara/docs/plans/implemented/llm-assisted-curation-suggestions.md` - archived plan after completion.
- `agonara/docs/plans/agonara-product-gap-closure.md` - mark parent Phase 7 complete only after this plan's final gates pass.
- `docs/loc-dashboard.html` - refresh during final closeout after code and docs LOC changes.

Provider files:

- The provider adapter protocol and deterministic first-slice provider fake live in `agonara/src/curator-workspace.js`.
- Production composition wires only that deterministic first-slice provider fake through `agonara/src/server.js`.
- No separate provider source file, provider configuration file, provider credentials file, provider SDK wrapper, external-provider network adapter, or provider observability file is in scope for this implementation plan.

HTTP routes:

- `POST /programs/{programId}/llm-curation-suggestions`
- `GET /programs/{programId}/llm-curation-suggestions?status={draft_suggestion|materialized|rejected}&suggestionKind={kind}&limit={limit}&cursor={cursor}`
- `GET /llm-curation-suggestions/{suggestionId}`
- `POST /llm-curation-suggestions/{suggestionId}/acceptance`
- `POST /llm-curation-suggestions/{suggestionId}/rejection`
- `GET /learn`

Required UI screens and stable element ids:

- Suggestion app section: `#llm-curation-suggestion-section`.
- Curator panel: `#llm-curation-suggestion-curator-panel`.
- Generation form: `#llm-curation-suggestion-generation-form`, `#llm-curation-suggestion-policy-input`, `#llm-curation-suggestion-instruction-input`, `#llm-curation-suggestion-coverage-gap-ids-input`, `#llm-curation-suggestion-context-entity-ids-input`, `#llm-curation-suggestion-kind-input`, `#llm-curation-suggestion-max-input`, `#generate-llm-curation-suggestions-button`, `#llm-curation-suggestion-generation-status`.
- Filter/list controls: `#llm-curation-suggestion-filter-form`, `#llm-curation-suggestion-status-filter`, `#llm-curation-suggestion-kind-filter`, `#refresh-llm-curation-suggestions-button`, `#llm-curation-suggestion-list-status`, `#llm-curation-suggestion-list`.
- Detail and origin surfaces: `data-action="open-llm-curation-suggestion"`, `#llm-curation-suggestion-detail`, `#llm-curation-suggestion-origin`, `#llm-curation-suggestion-supporting-evidence`, `#llm-curation-suggestion-draft-preview`.
- Review actions: `data-action="accept-llm-curation-suggestion"`, `data-action="reject-llm-curation-suggestion"`, `#llm-curation-suggestion-review-status`.

Targeted commands:

- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "llm suggestion storage" node --test --test-name-pattern "llm|LLM|suggestion|Suggestion|provider|Provider|curation|Curation|backup|restore" agonara/tests/storage.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "llm suggestion backup restore" node --test --test-name-pattern "llm|LLM|suggestion|Suggestion|provider|Provider|curation|Curation|backup|restore" agonara/tests/backup-restore.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "llm suggestion workspace" node --test --test-name-pattern "llm|LLM|suggestion|Suggestion|provider|Provider|curation|Curation" agonara/tests/curator-workspace.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "llm suggestion http" node --test --test-name-pattern "llm|LLM|suggestion|Suggestion|provider|Provider|curation|Curation" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" npx playwright --version`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "llm suggestion browser" npx playwright test agonara/tests/llm-assisted-curation-suggestions.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "quick check product ui browser" npx playwright test agonara/tests/quick-check-product-ui.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation browser" npx playwright test agonara/tests/topic-concept-material-navigation.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "coverage browser" npx playwright test agonara/tests/curator-coverage-gaps.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness browser" npx playwright test agonara/tests/topic-period-readiness-checks.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "membership browser" npx playwright test agonara/tests/program-membership-invitations-and-recovery.playwright.js --config agonara/playwright.config.js`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `./scripts/loc-dashboard.sh --sort=name`
- `git diff --check`

## Phase tracker

- [x] Phase 1 - Suggestion Storage and Restore Validation
- [x] Phase 2 - Provider-Boundary Suggestion Generation
- [x] Phase 3 - Suggestion Review and Draft-Candidate Materialization
- [ ] Phase 4 - HTTP Suggestion API
- [ ] Phase 5 - Product UI Suggestion Review
- [ ] Phase 6 - Traceability, Dashboard, Archive, and Parent Closeout

Update tracker checkboxes only after the phase's required verification passes and the phase commit is created.

After each phase's implementation commit and any adversarial-review hardening commit are green, update this tracker and commit the tracker-only status update before starting the next phase. Phase 6 archives the plan instead of leaving an active tracker copy.

## ADR traceability matrix

| ADR / spec invariant | Phase |
|---|---|
| ADR-010 keeps accepted Program corpus behind curator acceptance. | Phase 3, Phase 4, Phase 5 |
| ADR-011 keeps accepted checks and criteria in Program corpus while attempts and evidence stay in Student Workspace. | Phase 2, Phase 3, Phase 4, Phase 5 |
| The Curator Workspace owns LLM-assisted curation suggestions before any owning curation command accepts material. | Phase 1, Phase 2, Phase 3 |
| Provider adapter protocols are owned by Curator Workspace and supplied by composition. | Phase 2, Phase 4 |
| Raw provider artifacts are not persisted, exported, restored, logged, or rendered. | Phase 1, Phase 2, Phase 4, Phase 5 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| CUR-11 - Use LLM assistance for program structuring | Phase 2 generates draft suggestions from provider fake output and accepted Program context. |
| CUR-12 - Review LLM suggestions | Phase 3, Phase 4, and Phase 5 deliver explicit list, detail, accept, and reject flows. |
| CUR-13 - Trace suggestion origin | Phase 1, Phase 2, Phase 4, and Phase 5 preserve and render redacted origin, prompt context summary, rationale, and supporting evidence. |
| CUR-06 - Keep accepted content separate from drafts | Phase 3, Phase 4, and Phase 5 prove suggestion acceptance materializes draft candidates only. |
| INT-01 - Assemble program from sources | Phase 2 through Phase 5 add curator-side draft assistance while Phase 6 closes traceability to implemented evidence. |

## Phase 1 - Suggestion Storage and Restore Validation

**Objective**: add durable suggestion records, generation idempotency state, status transitions, materialized candidate references, backup export, and restore validation without provider execution or candidate materialization.

**Key work items**:

- Add RED storage tests for creating `draft_suggestion` records with Program id, suggestion kind, title, summary, redacted origin, structured draft request, rationale, supporting evidence, status, creator, and timestamps.
- Add RED storage tests for scoped generation idempotency records that return equivalent suggestions and reject conflicting retries.
- Add RED storage tests for materialized and rejected status transitions, terminal transition conflicts, materialized candidate references, and curator attribution.
- Add RED backup/restore tests proving suggestions, redacted origin, structured draft requests, supporting evidence, idempotency state, statuses, and materialized candidate references round-trip.
- Add RED restore rejection tests for malformed status, malformed origin, unsupported suggestion kind, unsupported draft request shape, duplicate ids, duplicate idempotency scope, unsafe raw artifacts, cross-Program materialized candidate references, missing materialized candidates, and mismatched materialized candidate kinds.
- Add RED backup redaction tests proving raw prompts, raw model responses, provider request/response payloads, provider diagnostics, hidden policy instructions, credentials, sessions, CSRF tokens, cookies, SQL text, stack traces, filesystem paths, database URLs, and infrastructure details are absent.
- Implement storage helpers, schema, export, restore import, and restore graph validation in `agonara/src/storage.js`.

**Dependencies**: this child plan is committed; the governing spec has passed adversarial review.

**Risks**: storing structured draft requests can accidentally persist raw provider payloads, and restore can create materialized suggestions that point at missing or cross-Program draft candidates.

**Validation**:

- Targeted LLM suggestion storage command.
- Targeted LLM suggestion backup/restore command.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against storage invariants, redaction, idempotency, terminal transitions, restore rejection, and no accepted-corpus or Student Workspace mutation; fix every fail or warning and rerun affected gates.

**Completion signal**: storage and backup/restore preserve only redacted suggestion records and reject malformed or unsafe suggestion graphs before mutation.

**DoD**: Phase 1 is done only when targeted storage and backup/restore tests, full Agonara tests, root build, `git diff --check`, self-review, adversarial review, fixes for every fail/warning, implementation commit, and tracker-status commit are complete.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 2 - Provider-Boundary Suggestion Generation

**Objective**: implement Curator Workspace suggestion generation with provider fakes, redacted prompt context, policy validation, provider output validation, budget checks, idempotency, provenance, and no domain mutation beyond draft suggestion storage.

**Key work items**:

- Add RED Curator Workspace tests for active Identity and effective Program Curator authorization.
- Add RED tests proving Student-only and Admin-only callers are rejected with `program_curator_required`.
- Add RED validation tests for malformed policy ids, idempotency keys, `maxSuggestions`, allowed suggestion kinds, empty context, unsupported context ids, unknown Programs, and stale coverage gap ids.
- Add RED policy tests for missing policies, malformed adapter ids, malformed validator ids, malformed redaction ids, empty allowed kinds, malformed prompt input policy, and non-`none` raw artifact policy.
- Add RED provider fake tests proving the Curator Workspace-owned adapter protocol is resolved by `providerAdapterId` and missing adapters reject with `provider_adapter_not_found`.
- Add RED prompt-context tests proving provider requests include only permitted accepted navigation, accepted checks, accepted readiness, coverage gaps, policy, validator, and curator-instruction context.
- Add RED redaction tests proving provider requests omit Student Workspace state, generated-by identity ids, accepted-by identity ids, candidate ids, existing answer keys, credentials, sessions, CSRF tokens, raw prompts, raw model responses, SQL text, stack traces, filesystem paths, database URLs, hidden policy instructions, and infrastructure details.
- Add RED provider failure tests for thrown adapter errors, malformed outputs, budget overflow, missing output validation, failed validation, mismatched validator policy, unsupported suggestion kinds, empty provider fields, missing supporting evidence, and invalid draft requests.
- Add RED idempotency tests proving equivalent retries return existing suggestions without calling the provider again and conflicting retries reject without new suggestions.
- Add RED no-mutation tests proving generation creates only `draft_suggestion` records and does not create draft candidates, accepted candidates, accepted corpus revisions, target links, Student Workspace state, Program Membership, Identity state, sessions, credentials, Admin authority, CSRF state, or domain audit/event records.
- Implement generation, policy/provider fake resolution, prompt context assembly, provider output validation, budget checks, redacted provenance, and idempotent suggestion creation in `agonara/src/curator-workspace.js`.

**Dependencies**: Phase 1 is complete.

**Risks**: prompt context can accidentally include Student state or existing answer keys, and provider fake output can bypass candidate validation before storage.

**Validation**:

- Targeted LLM suggestion workspace command.
- Targeted LLM suggestion storage command if storage helper contracts change.
- Targeted LLM suggestion backup/restore command if stored shape changes.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against provider protocol ownership, provider fake usage, prompt redaction, budget/output gates, idempotency, candidate validation before storage, and no adjacent-domain mutation; fix every fail or warning and rerun affected gates.

**Completion signal**: effective Program Curators can generate redacted `draft_suggestion` records through Curator Workspace using deterministic provider fakes, while invalid provider output creates no records.

**DoD**: Phase 2 is done only when targeted workspace tests, any affected storage/backup tests, full Agonara tests, root build, `git diff --check`, self-review, adversarial review, fixes for every fail/warning, implementation commit, and tracker-status commit are complete.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 3 - Suggestion Review and Draft-Candidate Materialization

**Objective**: implement Curator Workspace listing, detail, acceptance, rejection, terminal-state handling, and draft-candidate materialization without accepted-corpus auto-promotion.

**Key work items**:

- Add RED Curator Workspace tests for listing Program-scoped suggestions by status, suggestion kind, limit, cursor, deterministic order, and private cross-Program behavior.
- Add RED detail tests proving only effective Program Curators can inspect redacted origin, rationale, supporting evidence, and structured draft requests.
- Add RED tests for accepting draft navigation suggestions into one navigation draft candidate.
- Add RED tests for accepting draft Quick Check suggestions into one Quick Check draft candidate with a new answer key only inside the candidate draft request.
- Add RED tests for accepting draft assessment criterion suggestions into one criterion draft candidate.
- Add RED tests for accepting draft open-answer check suggestions into one open-answer check draft candidate.
- Add RED tests for accepting draft readiness check suggestions into one readiness draft candidate.
- Add RED tests for materialization failures keeping the suggestion in `draft_suggestion` and creating no candidate.
- Add RED terminal transition tests for repeated acceptance, accepting rejected suggestions, repeated rejection, and rejecting materialized suggestions.
- Add RED rejection tests proving rejected suggestions create no candidates and mutate no accepted Program corpus.
- Add RED no-mutation tests proving acceptance creates exactly one draft candidate and does not create accepted corpus content, accepted check revisions, accepted readiness revisions, Student Workspace state, Program Membership state, Identity state, sessions, credentials, Admin authority, CSRF state, learner-evidence target links, or domain audit/event records.
- Implement list/detail/accept/reject and materialization in `agonara/src/curator-workspace.js` by calling existing candidate creation commands rather than writing accepted corpus directly.

**Dependencies**: Phase 2 is complete.

**Risks**: acceptance can accidentally call existing accepted-candidate commands instead of draft-candidate creation, and materialization can leak provider provenance into accepted corpus or Student-safe surfaces.

**Validation**:

- Targeted LLM suggestion workspace command.
- Targeted LLM suggestion storage command if status/materialization storage contracts change.
- Targeted LLM suggestion backup/restore command if materialized reference behavior changes.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against draft-candidate-only materialization, terminal state handling, private Program scope, provenance redaction, and no accepted-corpus or Student Workspace mutation; fix every fail or warning and rerun affected gates.

**Completion signal**: Program Curators can list, inspect, accept, and reject suggestions through Curator Workspace, and acceptance materializes one draft candidate without accepting it into Program corpus.

**DoD**: Phase 3 is done only when targeted workspace tests, any affected storage/backup tests, full Agonara tests, root build, `git diff --check`, self-review, adversarial review, fixes for every fail/warning, implementation commit, and tracker-status commit are complete.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 4 - HTTP Suggestion API

**Objective**: expose LLM-assisted curation suggestions through session-backed Program Curator HTTP routes with CSRF, private errors, redaction, and executable acceptance coverage.

**Key work items**:

- Add RED HTTP tests for `POST /programs/{programId}/llm-curation-suggestions` success with Program Curator session, CSRF, deterministic provider fake output, and redacted summaries.
- Add RED HTTP tests for generation validation, signed-out callers, disabled Identities, Student-only callers, Admin-only callers, unknown Programs, missing policies, missing provider adapters, provider failures, budget failures, output validation failures, stale coverage gaps, and unsupported context ids.
- Add RED HTTP tests proving session resolution happens before CSRF validation on every mutation route.
- Add RED HTTP tests for listing suggestions by Program, status, suggestion kind, limit, cursor, deterministic ordering, and private cross-Program behavior.
- Add RED HTTP tests for detail origin inspection with redacted rationale, supporting evidence, and structured draft request.
- Add RED HTTP tests for acceptance, rejection, terminal transition conflicts, materialization rejection, and accepted-corpus non-promotion.
- Add RED response/fault redaction tests for raw prompts, raw model responses, provider request/response payloads, provider diagnostics, hidden policy instructions, credentials, sessions, CSRF tokens, cookies, SQL text, stack traces, filesystem paths, database URLs, existing answer keys, candidate ids in Student-safe routes, and infrastructure details.
- Add RED executable acceptance coverage from Program Curator generation through detail origin inspection, acceptance into draft candidate, candidate listing, rejection of a separate suggestion, and proof no accepted corpus is created by suggestion acceptance.
- Implement route parsing, request validation, result mapping, CSRF/session enforcement, response redaction, and production composition wiring in `agonara/src/server.js`.

**Dependencies**: Phase 3 is complete.

**Risks**: HTTP responses can expose provider diagnostics or private suggestion existence, and production composition can hard-code provider configuration instead of using deterministic fakes for the first implementation slice.

**Validation**:

- Targeted LLM suggestion HTTP command.
- Targeted LLM suggestion workspace command if route mapping changes command contracts.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against route contracts, session/CSRF ordering, Program Curator-only authorization, private errors, redaction, provider fake composition, and accepted-corpus non-promotion; fix every fail or warning and rerun affected gates.

**Completion signal**: Program Curators can generate, list, inspect, accept, and reject LLM curation suggestions over HTTP, while unauthorized callers and protected data remain isolated.

**DoD**: Phase 4 is done only when targeted HTTP/workspace tests, full Agonara tests, root build, `git diff --check`, self-review, adversarial review, fixes for every fail/warning, implementation commit, and tracker-status commit are complete.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 5 - Product UI Suggestion Review

**Objective**: add `/learn` Program Curator UI workflows for suggestion generation, list/detail origin inspection, acceptance, rejection, redaction, and browser-tested regression preservation.

**Key work items**:

- Verify installed Playwright version and browser availability before writing browser tests.
- Add RED Playwright tests for Program Curator suggestion generation with deterministic provider fake output.
- Add RED Playwright tests for suggestion status/kind filtering, list refresh, detail opening, origin/provenance inspection, supporting evidence display, and structured draft preview.
- Add RED Playwright tests for accepting a suggestion, showing the materialized draft candidate reference, and proving no accepted Program corpus appears from suggestion acceptance alone.
- Add RED Playwright tests for rejecting a suggestion, terminal-state disabled actions, and review status feedback.
- Add RED Playwright tests proving Student-only and Admin-only sessions cannot generate, list, inspect, accept, or reject suggestions.
- Add RED browser redaction checks for raw prompts, raw model responses, provider request/response payloads, provider diagnostics, hidden policy instructions, credentials, sessions, CSRF tokens, cookies, SQL text, stack traces, filesystem paths, database URLs, existing answer keys, Student Workspace state, and infrastructure details.
- Add RED layout/accessibility tests for desktop and mobile viewports, named controls, `aria-live` status, non-overlapping review rows, and existing `/learn` workflow preservation.
- Implement the suggestion review section in `agonara/src/learn-ui.js` using the stable ids in this plan.
- Preserve existing Quick Check, navigation, coverage-gap, readiness, and membership UI workflows.

**Dependencies**: Phase 4 is complete.

**Risks**: suggestion detail can become too large for the `/learn` work surface, and rendering structured draft requests can leak protected answer keys or provider artifacts.

**Validation**:

- Playwright version command.
- LLM suggestion browser command.
- Quick Check product UI browser regression command.
- Navigation browser regression command.
- Coverage browser regression command.
- Readiness browser regression command.
- Membership browser regression command.
- Targeted LLM suggestion HTTP command if route assumptions change.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-implementation self-review and adversarial review against UI redaction, role isolation, mobile/desktop layout, stable element ids, terminal-state controls, accepted-corpus non-promotion, and regression preservation for existing `/learn` workflows; fix every fail or warning and rerun affected gates.

**Completion signal**: `/learn` lets Program Curators generate, inspect, accept, and reject LLM-assisted suggestions with visible redacted provenance and without exposing protected data or promoting accepted corpus.

**DoD**: Phase 5 is done only when Playwright version, targeted browser/regression browser commands, affected HTTP tests, full Agonara tests, root build, `git diff --check`, self-review, adversarial review, fixes for every fail/warning, implementation commit, and tracker-status commit are complete.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Phase 6 - Traceability, Dashboard, Archive, and Parent Closeout

**Objective**: close Phase 7 traceability after implementation is verified and reviewed clean.

**Key work items**:

- Update `agonara/docs/specs/llm-assisted-curation-suggestions.md` to `status: implemented` and add an implementation status section linking this archived plan, runtime files, and test files.
- Update INT-01 downstream traceability in `agonara/docs/intent_learning_program_app.md` with this implementation plan and LLM-assisted curation code/test/UI evidence.
- Update `agonara/README.md`, `agonara/docs/backlog.md`, and `agonara/docs/implementation-notes.md` only where they currently describe LLM-assisted curation suggestions as missing or deferred.
- Add a closeout entry to `agonara/docs/log.md`.
- Mark parent Phase 7 complete in `agonara/docs/plans/agonara-product-gap-closure.md` only after all previous phases are committed and reviewed clean.
- Refresh `docs/loc-dashboard.html` with `./scripts/loc-dashboard.sh --sort=name`.
- Verify the LOC dashboard summary cards, table footer, `data` array, and `Last updated` line match the script output.
- Move this plan to `agonara/docs/plans/implemented/llm-assisted-curation-suggestions.md`.

**Dependencies**: Phase 5 is complete and all implementation review findings are fixed.

**Risks**: traceability can overstate real-provider integration, automatic corpus acceptance, Student Workspace behavior, or provider observability; dashboard refresh can be skipped during docs closeout.

**Validation**:

- Markdown/front-matter/link checks for touched docs.
- LOC dashboard command and manual comparison against generated output.
- Targeted LLM suggestion workspace command.
- Targeted LLM suggestion HTTP command.
- LLM suggestion browser command.
- Quick Check product UI browser regression command.
- Navigation browser regression command.
- Coverage browser regression command.
- Readiness browser regression command.
- Membership browser regression command.
- Full Agonara tests.
- Root build.
- `git diff --check`.
- Post-closeout self-review and adversarial review against spec status, Product Intent traceability, README/backlog/runtime status, parent-plan tracker, dashboard freshness, archive placement, no stale active-plan copy, and no overclaiming real-provider or accepted-corpus behavior; fix every fail or warning and rerun affected gates.

**Completion signal**: LLM-assisted curation suggestions are implemented, traceable from Product Intent through spec, plan, code, tests, UI, dashboard, and archived plan; parent Phase 7 is marked complete.

**DoD**: Phase 6 is done only when docs checks, LOC dashboard refresh/verification, targeted LLM commands, browser command, full Agonara tests, root build, `git diff --check`, self-review, adversarial review, fixes for every fail/warning, parent tracker update, archive move, and closeout commit are complete.

**Commit**: Commit this phase after green validation and clean reviews with a short imperative message.

## Done criteria

- All six phases are implemented in order, each with targeted verification, full Agonara tests, root build, `git diff --check`, post-implementation self-review, adversarial review, fixes for every fail or warning, and a local commit on green.
- Suggestion storage preserves redacted draft suggestion records, idempotency state, status transitions, materialized draft-candidate references, backup/export behavior, and restore validation.
- Curator Workspace owns suggestion policies, provider adapter protocol, provider fake resolution, prompt context assembly, provider output validation, budget checks, generation, listing, detail, acceptance, rejection, and draft-candidate materialization.
- Provider requests use accepted Program context and coverage gaps without Student Workspace state, existing accepted-check answer keys, identity ids, candidate ids, credentials, sessions, CSRF tokens, raw prompts, raw model responses, SQL text, stack traces, filesystem paths, database URLs, hidden policy instructions, or infrastructure details.
- Provider output is structured, budget-checked, output-validated, and candidate-validated before any suggestion record is stored.
- HTTP exposes suggestion generation, listing, detail, acceptance, and rejection with Program Curator authorization, CSRF for mutations, private errors, response redaction, and executable acceptance coverage.
- `/learn` exposes Program Curator suggestion generation and review with stable UI ids, browser coverage, and no Student/Admin-only access.
- Accepting a suggestion materializes exactly one draft candidate through existing curation commands and never creates accepted Program corpus directly.
- Rejected suggestions create no candidates and mutate no accepted Program corpus.
- Backup/restore preserves redacted suggestion records and validates materialized candidate references while excluding unsafe raw provider artifacts and operational secrets.
- Hard-coded external provider configuration inside Curator Workspace, direct provider network calls from Curator Workspace, accepted corpus auto-promotion, Student Workspace reads, Student Workspace mutation, learner-state interpretation, Admin UI, Student UI, CLI commands, analytics, reporting, deployment targets, infrastructure ports, and provider-run observability dashboards remain out of scope.
- The spec status, Product Intent traceability, README/backlog/implementation notes, project log, parent Phase 7 tracker, LOC dashboard, and plan archive are updated during final closeout without overclaiming real-provider integration.

## Final closeout

Final gates: `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "llm suggestion storage" node --test --test-name-pattern "llm|LLM|suggestion|Suggestion|provider|Provider|curation|Curation|backup|restore" agonara/tests/storage.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "llm suggestion backup restore" node --test --test-name-pattern "llm|LLM|suggestion|Suggestion|provider|Provider|curation|Curation|backup|restore" agonara/tests/backup-restore.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "llm suggestion workspace" node --test --test-name-pattern "llm|LLM|suggestion|Suggestion|provider|Provider|curation|Curation" agonara/tests/curator-workspace.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "llm suggestion http" node --test --test-name-pattern "llm|LLM|suggestion|Suggestion|provider|Provider|curation|Curation" agonara/tests/http-api.test.js agonara/tests/executable-acceptance.test.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "llm suggestion browser" npx playwright test agonara/tests/llm-assisted-curation-suggestions.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "quick check product ui browser" npx playwright test agonara/tests/quick-check-product-ui.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "navigation browser" npx playwright test agonara/tests/topic-concept-material-navigation.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "coverage browser" npx playwright test agonara/tests/curator-coverage-gaps.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "readiness browser" npx playwright test agonara/tests/topic-period-readiness-checks.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "membership browser" npx playwright test agonara/tests/program-membership-invitations-and-recovery.playwright.js --config agonara/playwright.config.js`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`; `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`; Markdown/front-matter/link checks for touched docs; `./scripts/loc-dashboard.sh --sort=name`; `git diff --check`
LOC dashboard: refresh `docs/loc-dashboard.html` with `./scripts/loc-dashboard.sh --sort=name`, then verify the summary cards, table footer, `data` array, and `Last updated` line match the script output.
Archive plan: move to `agonara/docs/plans/implemented/llm-assisted-curation-suggestions.md`
Commit archive move: yes
Push/PR: follow push policy; no push unless explicitly requested.
