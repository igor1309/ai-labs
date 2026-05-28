---
date: 2026-05-28
model: gpt-5
description: "Implementation plan: Agonara Corpus Storage and Curator Acceptance HTTP API."
---

# Corpus Storage and Curator Acceptance HTTP API Implementation Plan

## Goal

Deliver the Agonara v0.0.1 Corpus Storage and Curator Acceptance HTTP API so browser clients can record Program sources, create and review Corpus candidates, explicitly accept or reject candidates, read accepted corpus revisions, and inspect scoped Corpus events through the existing session, CSRF, envelope, pagination, and redaction conventions.

This plan implements [Corpus Storage and Curator Acceptance API](../specs/corpus-storage-and-curator-acceptance-api.md), [Corpus Storage and Curator Acceptance First Slice](../specs/corpus-storage-and-curator-acceptance-first-slice.md), and [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md). It must preserve the existing Identity API and Program API transport contracts and must not introduce Admin UI, Curator UI, Student UI, CLI commands, material storage, LLM execution, assessment, Student Workspace state, or new Corpus domain rules.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push

## Execution lock

Worktree mode: create new
Expected worktree: `worktrees/agonara-corpus-api`
Expected branch: `codex/agonara-corpus-api`
Preflight check: [ ] done

## Scope guardrails

### In scope

- Server composition changes that inject `corpusCommands` beside `identityCommands` and `programCommands`.
- HTTP route adapters for the endpoints listed in [Corpus Storage and Curator Acceptance API](../specs/corpus-storage-and-curator-acceptance-api.md).
- Session and CSRF reuse through the existing `agonara_session` and `X-Agonara-CSRF` contract.
- Response-shaping adapters from existing Corpus command/query result names to API response names.
- HTTP status mapping for Corpus, session, and CSRF rejection reasons.
- Request-body parsing that distinguishes missing bodies, malformed JSON, non-object JSON, empty objects, and non-empty JSON where the API spec requires different behavior.
- Bounded pagination and opaque cursors for Program source, Corpus candidate, accepted corpus, and Corpus event list routes.
- Redaction checks for Corpus responses, cursors, events, and faults.
- Executable HTTP and acceptance tests that cover the API spec's required tests.

### Out of scope

- Admin UI, Curator UI, Student UI, Program UI, or any other UI work.
- Corpus CLI commands.
- New Corpus domain behavior beyond the accepted service contract.
- Material file storage, source ingestion jobs, scraping, copying, licensing policy, source reliability scoring, or citation-format enforcement beyond existing source metadata fields.
- LLM prompt execution, model calls, suggestion generation, automated acceptance, accepted checks, accepted criteria, assessment, Student Workspace state, learning progress, mastery state, weak-area state, or student attempts.
- Program archival, Program deletion, Program ownership transfer, curator leave/removal, collaborative editing, branching, merging, or conflict resolution.
- Program Membership mutation beyond existing session authorization and effective participation checks.
- Reworking Identity API or Program API routes except where shared helpers must support Corpus route status mapping, JSON parsing, pagination, or redaction consistently.
- Replacing the existing server framework.

## ADR traceability matrix

| ADR | Invariant | Phase |
|---|---|---|
| ADR-007 | Effective participation is the read-only authorization contract used by other modules. | Phase 2, Phase 3, Phase 4, Phase 5, Phase 6 |
| ADR-009 | Accepted corpus records are scoped to stable Program shells. | Phase 2, Phase 3, Phase 5 |
| ADR-010 | Corpus Storage owns accepted Program corpus and stable accepted revisions. | Phase 4, Phase 5, Phase 7 |
| ADR-010 | Curator Workspace owns candidates, drafts, LLM suggestions, and review state before acceptance. | Phase 3, Phase 4 |
| ADR-010 | Candidate material must not appear as accepted corpus before explicit Program Curator acceptance. | Phase 3, Phase 4, Phase 5, Phase 7 |
| ADR-010 | Acceptance must preserve candidate/source/rationale provenance and acting Identity attribution. | Phase 4, Phase 5, Phase 7 |
| ADR-010 | Student Workspace state must remain separate from accepted corpus. | Phase 5, Phase 7 |

## Product intent traceability

| Story | Phase preserving intent |
|---|---|
| CUR-01 - Create program from grounded sources | Phase 2, Phase 5, Phase 7 |
| CUR-02 - Add topics and concepts | Phase 3, Phase 4, Phase 5, Phase 7 |
| CUR-06 - Keep accepted content separate from drafts | Phase 3, Phase 4, Phase 5, Phase 7 |
| CUR-07 - Add external sources | Phase 2 |
| CUR-08 - Extract candidate structure from sources | Phase 3 |
| CUR-10 - Update program after research | Phase 4, Phase 5 |
| CUR-13 - Trace suggestion origin | Phase 2, Phase 4, Phase 5, Phase 6 |
| INT-01 - Собрать программу из источников | Phase 2, Phase 3, Phase 4, Phase 5, Phase 7 |
| INT-02 - Увидеть понятийный аппарат темы | Phase 5, Phase 7 |

## TDD and commit discipline

Every implementation phase must use strict TDD:

- Add or update one focused failing HTTP or executable acceptance test.
- Run the targeted Agonara test command and capture a RED assertion failure. Compilation errors are not RED.
- Implement the minimum production change that turns that assertion GREEN.
- Repeat RED/GREEN for the phase until the phase objective is complete.
- Run the phase validation gates.
- Commit only the files tied to that phase after GREEN gates pass.

Each phase has its own local commit. Do not bundle unrelated phase work into one commit. After each phase commit, self-review the phase against this plan and the API spec; immediately fix fail/warn findings, rerun the phase gates, and commit the fix before moving on.

## Phase 1 — Corpus API composition and shared transport substrate

**Objective**: wire Corpus commands into the HTTP server and establish shared route helpers for session resolution, CSRF, Corpus status mapping, JSON body classification, list pagination, response shaping, and redaction checks.

**Key work items**:

- Add `corpusCommands` as an optional `createServer` dependency.
- Compose `createCorpusCommands` in `startServer` using the same database and existing Program effective participation function used by domain tests.
- Add a `handleCorpusApi` boundary that runs after Program API handling and before `404`.
- Add shared helpers for resolving the session Identity id from `agonara_session`.
- Extend shared HTTP status mapping for Corpus rejection reasons: `participation_required`, `candidate_not_found`, `revision_not_found`, `accepted_entity_not_found`, `accepted_entity_program_mismatch`, `accepted_kind_mismatch`, `candidate_already_accepted`, `candidate_already_rejected`, `source_not_found`, and `source_program_mismatch`.
- Replace or wrap `readJson` for Corpus routes with a parser that can distinguish missing body, malformed JSON, non-object JSON, empty object, and non-empty object.
- Generalize bounded list query parsing and opaque cursor pagination for source, candidate, accepted corpus, and event list route keys.
- Keep the new helpers compatible with existing Identity and Program route behavior.

**TDD sequence**:

1. RED/GREEN `GET /programs/{programId}/sources` without a session returns `401 session_not_found`.
2. RED/GREEN the server can be created with Identity, Program, and Corpus command dependencies without changing existing Identity or Program route behavior.
3. RED/GREEN Corpus status mapping returns the API-specified HTTP statuses for representative `404`, `409`, and `403 participation_required` Corpus reasons.
4. RED/GREEN shared list query parsing defaults `limit` to `50`, rejects invalid limits, and rejects unknown cursors with `400 validation_failed`.
5. RED/GREEN body parsing exposes missing, malformed, non-object, empty object, and non-empty object cases for later Corpus route tests.

**Dependencies**: existing Identity session API, Program HTTP API, and Corpus domain command/query implementation.

**Risks**: breaking existing Identity or Program route behavior while generalizing shared helpers. Keep Corpus handler optional in direct `createServer` tests and run the existing HTTP suite after helper changes.

**Validation**:

- Targeted HTTP tests for Phase 1 behavior.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 1 tests pass, full Node gates pass, and local commit `wire agonara corpus api substrate` is created.

## Phase 2 — Program source routes

**Objective**: implement Program source list and creation routes with Program Curator authorization, CSRF, validation, pagination, response shaping, and source event behavior.

**Key work items**:

- Implement `GET /programs/{programId}/sources?limit={limit}&cursor={cursor}`.
- Implement `POST /programs/{programId}/sources`.
- Map `listProgramSources` and `recordProgramSource` results to `ProgramSourceList` and `{ programSource }` API values.
- Require a Program Curator session for source reads and writes.
- Require CSRF on source creation before domain mutation.
- Treat malformed JSON, non-object JSON, missing body, unsupported source kind, missing title, empty title, whitespace-only title, non-string title, malformed locator, and malformed citation as `400 validation_failed`.
- Verify accepted source creation creates one accepted `program_source_recorded` Corpus event through the domain boundary.

**TDD sequence**:

1. RED/GREEN source listing accepts an effective Program Curator and returns only sources for the requested Program.
2. RED/GREEN source listing rejects a non-curator caller with `403 admin_or_curator_required`.
3. RED/GREEN source listing rejects an unknown Program with `404 program_not_found`.
4. RED/GREEN source listing defaults `limit` to `50` and rejects invalid limits or malformed cursors.
5. RED/GREEN source creation rejects missing or invalid CSRF before domain mutation.
6. RED/GREEN accepted source creation returns `ProgramSourceSummary` and creates one accepted `program_source_recorded` Corpus event.
7. RED/GREEN source creation invalid-body cases reject with `400 validation_failed`.

**Dependencies**: Phase 1.

**Risks**: route-level Program existence and authorization order can leak data if list routes call the wrong boundary. Keep route tests explicit for unknown Program, non-curator, and cross-Program source isolation.

**Validation**:

- Targeted HTTP tests for Program source routes.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 2 tests pass, full Node gates pass, and local commit `implement agonara corpus source api` is created.

## Phase 3 — Corpus candidate routes

**Objective**: implement curator-only Corpus candidate listing and creation routes while preserving draft/rejected isolation from accepted corpus.

**Key work items**:

- Implement `GET /programs/{programId}/corpus-candidates?status={status}&limit={limit}&cursor={cursor}`.
- Implement `POST /programs/{programId}/corpus-candidates`.
- Map `listCorpusCandidates` and `createCorpusCandidate` results to `CorpusCandidateList` and `{ corpusCandidate }` API values.
- Accept only `draft`, `accepted`, and `rejected` status filters.
- Require a Program Curator session for candidate reads and writes.
- Require CSRF on candidate creation before domain mutation.
- Treat malformed JSON, non-object JSON, missing body, unsupported candidate kind, missing title, empty title, whitespace-only title, non-string title, malformed body, malformed rationale, and non-array source ids as `400 validation_failed`.
- Map unknown and cross-Program source ids to `409 source_not_found` and `409 source_program_mismatch`.

**TDD sequence**:

1. RED/GREEN candidate listing accepts an effective Program Curator and returns only candidates for the requested Program.
2. RED/GREEN candidate listing applies `draft`, `accepted`, and `rejected` status filters.
3. RED/GREEN candidate listing rejects unsupported status filters, invalid limits, and malformed cursors with `400 validation_failed`.
4. RED/GREEN candidate listing rejects a non-curator caller with `403 admin_or_curator_required`.
5. RED/GREEN accepted candidate creation returns a `draft` `CorpusCandidateSummary`.
6. RED/GREEN accepted candidate creation creates one accepted `corpus_candidate_created` Corpus event and does not create accepted corpus.
7. RED/GREEN candidate creation invalid-body cases reject with `400 validation_failed`.
8. RED/GREEN candidate creation rejects unknown and cross-Program source ids with the specified `409` reasons.

**Dependencies**: Phase 2.

**Risks**: accidentally treating candidate creation as accepted content. Keep accepted corpus absence assertions in the candidate creation tests rather than deferring them to closeout.

**Validation**:

- Targeted HTTP tests for Corpus candidate list/create routes.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 3 tests pass, full Node gates pass, and local commit `implement agonara corpus candidate api` is created.

## Phase 4 — Candidate acceptance and rejection routes

**Objective**: implement explicit Program Curator acceptance and rejection routes with CSRF, target validation, state conflict mapping, request-body rules, and Corpus event behavior.

**Key work items**:

- Implement `POST /corpus-candidates/{candidateId}/acceptance`.
- Implement `POST /corpus-candidates/{candidateId}/rejection`.
- Map `acceptCorpusCandidate` and `rejectCorpusCandidate` results to `{ acceptedCorpus }` and `{ corpusCandidate }` API values.
- Require CSRF before domain mutation on both routes.
- Allow acceptance with a missing body or empty JSON object when no `targetEntityId` is supplied.
- Allow rejection with a missing body and reject malformed or non-empty JSON bodies with `400 validation_failed`.
- Preserve acceptance into a new entity and acceptance into an existing target entity.
- Map unknown candidate, already accepted, already rejected, unknown target entity, cross-Program target entity, and accepted-kind mismatch reasons to the API-specified statuses.
- Verify accepted and rejected candidate commands create accepted or rejected Corpus events when the domain contract says they should.

**TDD sequence**:

1. RED/GREEN acceptance accepts a Program Curator for the candidate Program and returns `AcceptedCorpusSummary`.
2. RED/GREEN acceptance without `targetEntityId` creates one accepted entity and one accepted revision.
3. RED/GREEN acceptance with `targetEntityId` creates a new current revision and preserves the previous historical revision.
4. RED/GREEN acceptance rejects unknown, already accepted, and already rejected candidates with specified statuses.
5. RED/GREEN acceptance rejects unknown target entities, cross-Program target entities, and accepted-kind mismatches with specified statuses.
6. RED/GREEN acceptance rejects non-curator callers with `403 admin_or_curator_required`.
7. RED/GREEN rejection accepts a Program Curator and returns the rejected `CorpusCandidateSummary`.
8. RED/GREEN rejection accepts a missing body and rejects malformed and non-empty JSON bodies with `400 validation_failed`.
9. RED/GREEN rejection rejects unknown, already accepted, already rejected, and non-curator cases with specified statuses.
10. RED/GREEN accepted and rejected acceptance/rejection paths create the required Corpus events.

**Dependencies**: Phase 3.

**Risks**: body parsing for rejection is stricter than source/candidate creation because missing body is accepted while malformed or non-empty JSON is rejected. Keep that distinction in focused route tests.

**Validation**:

- Targeted HTTP tests for candidate acceptance and rejection routes.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 4 tests pass, full Node gates pass, and local commit `implement agonara corpus acceptance api` is created.

## Phase 5 — Accepted corpus and revision read routes

**Objective**: expose accepted corpus list and historical revision reads to authorized Students, Program Curators, and Admins without exposing draft or rejected candidates.

**Key work items**:

- Implement `GET /programs/{programId}/accepted-corpus?acceptedKind={acceptedKind}&limit={limit}&cursor={cursor}`.
- Implement `GET /accepted-corpus-revisions/{revisionId}`.
- Map `listAcceptedCorpus` and `getAcceptedCorpusRevision` results to `AcceptedCorpusList` and `{ acceptedCorpus }` API values.
- Accept effective Student, effective Program Curator, and effective Admin callers for accepted corpus reads.
- Reject callers without accepted read access with `403 participation_required`.
- Accept only `topic` and `concept` accepted-kind filters.
- Return only current accepted revisions for list routes and preserve historical revision lookup by revision id.
- Apply bounded pagination and opaque cursors to accepted corpus list routes.
- Verify accepted corpus routes never expose draft or rejected candidates.

**TDD sequence**:

1. RED/GREEN accepted corpus listing accepts an effective Student for the requested Program.
2. RED/GREEN accepted corpus listing accepts an effective Program Curator for the requested Program.
3. RED/GREEN accepted corpus listing accepts an effective Admin.
4. RED/GREEN accepted corpus listing rejects unauthorized callers with `403 participation_required`.
5. RED/GREEN accepted corpus listing returns only current accepted revisions scoped to the requested Program.
6. RED/GREEN accepted corpus listing applies `topic` and `concept` filters and rejects unsupported filters.
7. RED/GREEN accepted corpus listing defaults `limit` to `50` and rejects invalid limits or malformed cursors.
8. RED/GREEN historical revision lookup returns addressable historical revisions for authorized callers.
9. RED/GREEN historical revision lookup rejects unknown revisions with `404 revision_not_found` and unauthorized callers with `403 participation_required`.
10. RED/GREEN accepted corpus route responses never expose draft or rejected candidates.

**Dependencies**: Phase 4.

**Risks**: historical revision lookup does not carry a Program id in the URL, so access must resolve through the revision's Program after the revision exists. Keep unknown revision and unauthorized caller tests separate.

**Validation**:

- Targeted HTTP tests for accepted corpus and revision read routes.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 5 tests pass, full Node gates pass, and local commit `implement agonara accepted corpus api` is created.

## Phase 6 — Corpus event routes, redaction, and out-of-scope guards

**Objective**: expose Program-scoped Corpus event reads with Program Curator authorization, bounded pagination, domain-only reasons, and explicit out-of-scope route absence.

**Key work items**:

- Implement `GET /programs/{programId}/corpus-events?limit={limit}&cursor={cursor}`.
- Map `listCorpusEvents` results to `CorpusEventList`.
- Require effective Program Curator participation for event reads.
- Return only Corpus events scoped to the requested Program.
- Default `limit` to `50`, reject invalid limits, and reject malformed cursors with `400 validation_failed`.
- Ensure Corpus event `reason` fields include only Corpus domain rejection reasons, never session, CSRF, cookie, transport, or fault reasons.
- Verify responses, cursors, events, and faults do not expose password hashes, plaintext passwords, bootstrap secrets, session identifiers, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, or infrastructure details.
- Verify out-of-scope UI, CLI, material storage, ingestion, LLM, assessment, Student Workspace, and unscoped Corpus HTTP surfaces remain absent.

**TDD sequence**:

1. RED/GREEN Corpus event listing rejects non-curator callers with `403 admin_or_curator_required`.
2. RED/GREEN Corpus event listing accepts active Program Curator callers for their Programs.
3. RED/GREEN Corpus event listing rejects unknown Programs with `404 program_not_found`.
4. RED/GREEN Corpus event listing returns only Corpus events scoped to the requested Program.
5. RED/GREEN Corpus event listing defaults `limit` to `50`, rejects invalid limits, and rejects malformed cursors.
6. RED/GREEN Corpus event route `reason` fields include only Corpus domain rejection reasons.
7. RED/GREEN Corpus API responses and cursors satisfy redaction rules.
8. RED/GREEN out-of-scope HTTP routes remain unavailable.

**Dependencies**: Phase 5.

**Risks**: reusing Program event helper names can accidentally shape Corpus events as Program events. Keep route-specific response key assertions for `corpusEvents` and `corpusEventId`.

**Validation**:

- Targeted HTTP tests for Corpus event routes, redaction, and out-of-scope guards.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 6 tests pass, full Node gates pass, and local commit `implement agonara corpus event api` is created.

## Phase 7 — Executable acceptance and closeout

**Objective**: prove the complete API slice through an end-to-end browser-client flow, update logs and traceability, and archive the implemented plan in the same change set.

**Key work items**:

- Add or extend executable HTTP acceptance coverage for the full logged-in flow from the API spec.
- Verify CSRF enforcement across all state-changing Corpus API requests.
- Verify source-to-candidate-to-accepted-corpus provenance and historical revision access.
- Verify accepted corpus is readable by an authorized Student and excludes draft/rejected candidates.
- Verify scoped Corpus event inspection.
- Update `agonara/docs/log.md`.
- Update [Product Intent](../intent_learning_program_app.md) downstream traceability from active implementation plan to implemented plan and HTTP code/tests.
- Move this plan to `agonara/docs/plans/implemented/corpus-storage-and-curator-acceptance-api.md` with `git mv`.

**TDD sequence**:

1. RED/GREEN executable acceptance flow: Program Curator creates a Program, records a source, creates a topic candidate, accepts it into accepted corpus, lists accepted corpus as a Student, replaces the current revision with a later accepted candidate, fetches the historical revision, rejects a separate draft candidate, confirms draft/rejected candidates are absent from accepted corpus, and inspects scoped Corpus events.
2. RED/GREEN closeout guard checks for CSRF enforcement on state-changing Corpus requests and out-of-scope surface absence if not already covered by earlier tests.

**Dependencies**: Phase 6.

**Risks**: acceptance coverage can duplicate every edge-case test and become brittle. Keep the executable flow broad and behavioral; keep detailed edge cases in focused HTTP tests from earlier phases.

**Validation**:

- Targeted executable acceptance test.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- Docs structure/link checks for touched Markdown.
- `git status --short` clean after final commit.

**Completion signal**: acceptance flow and final gates pass, Product Intent traceability points at implemented HTTP API code/tests, plan is archived under `implemented/`, and local commit `complete agonara corpus api` is created.

## Done criteria

- The HTTP API implements every endpoint in [Corpus Storage and Curator Acceptance API](../specs/corpus-storage-and-curator-acceptance-api.md).
- Every Corpus API response uses the shared `accepted`, `rejected`, or `fault` envelope.
- Session and CSRF behavior matches the existing Identity HTTP API and Program HTTP API conventions.
- All state-changing Corpus API routes reject session and CSRF failures before domain mutation.
- Source, candidate, acceptance, rejection, accepted corpus, revision, and event routes satisfy their specified status mappings.
- Source, candidate, accepted corpus, and Corpus event list pagination is bounded, cursors are opaque, invalid cursors reject with `400 validation_failed`, and cursors do not expose secrets or infrastructure details.
- Responses, cursors, events, and faults satisfy redaction rules for secrets, session identifiers, CSRF tokens, credentials, cookie headers, authorization headers, SQL text, stack traces, filesystem paths, database URLs, and infrastructure details.
- Every required test in the API spec is covered by focused HTTP tests or the executable acceptance flow.
- Each implementation phase has a separate local commit created only after its targeted tests, Agonara workspace tests, repo tests, and typecheck pass.
- Product Intent traceability is updated during closeout.
- Final branch state is clean after closeout.
- No Admin UI, Curator UI, Student UI, Program UI, CLI commands, material storage, source ingestion jobs, LLM execution, assessment, Student Workspace state, accepted checks, accepted criteria, Program Membership mutation beyond existing session authorization, Program archival, Program deletion, Program ownership transfer, curator leave/removal, collaborative editing, branching, merging, or conflict-resolution behavior is introduced.

## Final closeout

Final gates: `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`, `./scripts/run_silent.sh "tests" npm test`, `./scripts/run_silent.sh "build" npx tsc --noEmit`, docs structure/link checks for touched Markdown, and `git status --short` clean.
Archive plan: move to `agonara/docs/plans/implemented/corpus-storage-and-curator-acceptance-api.md`.
Commit archive move: yes.
Push/PR: follow push policy; do not push unless explicitly requested later.
