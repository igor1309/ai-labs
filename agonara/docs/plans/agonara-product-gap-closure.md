---
date: 2026-06-03
model: gpt-5
description: "Implementation plan: close Agonara product and traceability gaps after Quick Check HTTP delivery"
---

# Agonara Product Gap Closure Implementation Plan

## Full Review Findings

### Finding 1 - Quick Check HTTP transport is implemented

Verdict: pass

Why: Quick Check curator candidate, curation, student delivery, and Student Workspace attempt routes are wired through the HTTP server, production composition creates the required command boundaries, and HTTP tests cover production delivery, submission, detail, and list behavior.

Location: `agonara/src/server.js:547`, `agonara/src/server.js:796`, `agonara/src/server.js:1624`, `agonara/tests/http-api.test.js:8440`

Fix: none.

Required tests: none.

### Finding 2 - Quick Check remains backend/API-only for product users

Verdict: warning

Why: The HTTP API exists, but Agonara still has no Student or Curator product UI for Quick Check. Product stories require students to answer checks during study, while current docs explicitly describe the UI transport as deferred.

Location: `agonara/README.md:37`, `agonara/docs/implementation-notes.md:168`, `agonara/docs/student_user_stories.md:110`

Fix: Build Student and Curator UI flows over the existing Quick Check HTTP API. The first UI slice must let an effective Program Curator create, accept, reject, and inspect quick checks, and let an effective Student list deliveries, submit attempts, retry idempotently, and read owned attempts.

Required tests: Add browser/UI acceptance for curator create/accept/reject, student delivery listing, student submission, idempotent retry, owner-only attempt reads, answer-key redaction, and non-owner denial.

### Finding 3 - Materials, topics, concepts, and navigation are not built

Verdict: fail

Why: Product Intent accepts materials-in-context and topic/concept navigation, but INT-03 still has no spec, plan, code, or tests. The current README also lists materials/topic navigation as deferred, so students cannot move through a real learning structure beyond accepted assessment artifacts.

Location: `agonara/docs/intent_learning_program_app.md:183`, `agonara/README.md:38`, `agonara/docs/student_user_stories.md:66`, `agonara/docs/student_user_stories.md:92`, `agonara/docs/curator_user_stories.md:31`, `agonara/docs/curator_user_stories.md:39`

Fix: Specify and implement accepted topic, concept, material, and relationship graph storage; curator acceptance routes; student-safe read routes; and navigation UI that preserves the Corpus Storage / Student Workspace boundary.

Required tests: Add storage graph invariant tests, curator acceptance tests, student topic/material navigation HTTP tests, UI navigation tests, backup/restore graph validation, and boundary tests proving navigation does not create personal progress state by itself.

### Finding 4 - Progress and weak-area interpretation are not built

Verdict: fail

Why: Product Intent accepts personal progress and weak-area visibility, but INT-07 remains a next-slice handoff and the backlog still asks which persisted learner-state summaries are allowed. Existing attempts and feedback are raw evidence, not interpreted progress state.

Location: `agonara/docs/intent_learning_program_app.md:187`, `agonara/docs/backlog.md:19`, `agonara/docs/student_user_stories.md:152`, `agonara/docs/student_user_stories.md:160`, `agonara/docs/module_responsibility_map.md:71`

Fix: Specify a Student Workspace learner-state interpretation boundary that derives progress and weak-area summaries from accepted checks, attempts, and feedback without mutating Program corpus. Then implement summary storage or read-time derivation according to that spec.

Required tests: Add evidence-to-summary derivation tests, separation-from-corpus tests, historical evidence preservation tests, owner-only progress reads, and UI tests that expose supporting evidence behind each progress or weak-area label.

### Finding 5 - Topic-level and period-level checks are not built

Verdict: warning

Why: Product Intent accepts readiness checks for topic or period boundaries, but INT-06 is deferred and current Quick Check absence tests intentionally keep topic/period routes absent. This is not a regression in the Quick Check slice, but it is required before the product can decide whether a student is ready to continue.

Location: `agonara/docs/intent_learning_program_app.md:186`, `agonara/docs/student_user_stories.md:134`, `agonara/tests/http-api.test.js:3013`

Fix: Specify aggregate check semantics separately from deterministic single-select Quick Check. Implement topic/period check definitions in Corpus Storage, attempts in Student Workspace, and readiness result derivation with evidence links.

Required tests: Add topic/period check lifecycle tests, readiness derivation tests, historical revision tests, owner-only read tests, and absence/regression tests proving raw Quick Check attempts are not silently promoted into aggregate readiness.

### Finding 6 - Invitation, participant-management, and exceptional membership recovery flows are not built

Verdict: warning

Why: Product traceability keeps invitation and recovery stories deferred. Program Membership has self-join and participation checks, but controlled invitation, participant management, and exceptional recovery flows are still missing.

Location: `agonara/docs/intent_learning_program_app.md:190`, `agonara/docs/backlog.md:20`, `agonara/docs/student_user_stories.md:202`, `agonara/docs/curator_user_stories.md:133`, `agonara/docs/admin_user_stories.md:151`

Fix: Specify and implement Program Membership invitation and recovery flows without making Admin authority the normal Program role operator.

Required tests: Add invite, accept, decline, revoke, participant listing, removal, curator leave, exceptional recovery, exceptional revocation, attribution, backup/restore, and boundary tests proving membership changes do not mutate Student learning state.

### Finding 7 - LLM-assisted curation is still only product intent

Verdict: warning

Why: Curator stories accept LLM-assisted suggestion generation, review, and origin tracing, but no suggestion provider boundary, suggestion storage, or curator review flow exists.

Location: `agonara/docs/curator_user_stories.md:107`, `agonara/docs/curator_user_stories.md:115`, `agonara/docs/curator_user_stories.md:123`, `agonara/docs/module_responsibility_map.md:113`

Fix: Specify Curator Workspace suggestion records, provenance, provider boundary, and explicit accept/reject flow. Implement suggestions as draft material until a curator action moves accepted content into Corpus Storage.

Required tests: Add suggestion creation tests with provider fakes, provenance/redaction tests, accept/reject tests, provider-failure tests, backup/restore tests, and boundary tests proving LLM output never becomes accepted corpus without curator acceptance.

### Finding 8 - Quick Check API spec status has traceability drift

Verdict: warning

Why: The Quick Check HTTP API has been implemented and archived, but the spec front matter still says `status: draft`. This weakens traceability because Product Intent now points to an implemented API while the spec metadata still advertises draft state.

Location: `agonara/docs/specs/quick-check-assessment-api.md:6`

Fix: Update the spec status to `implemented` or `accepted`, and add a short implementation status section linking the archived plan and HTTP tests.

Required tests: Run Markdown/front-matter/link checks and `git diff --check`.

## Adversarial Review Closure

### Review finding 1 - execution mode was too broad for unspecced product work

Verdict: fail

Why: The initial plan used `auto-continue` across UI, corpus graph, learner-state interpretation, aggregate checks, membership recovery, and LLM-assisted curation. Several of those areas do not yet have accepted specs, so auto-continuing from the review findings into code would reopen design during implementation.

Fix applied: The plan now uses `human-review-gated` mode. Each phase must produce or update its governing spec/ADR first, run adversarial review on that artifact, and stop for human review before implementation continues.

### Review finding 2 - the plan lacked a phase-status tracker

Verdict: warning

Why: Repo process gates require plan tracker updates after completed steps. The initial plan had phase sections but no central tracker that could be updated and committed after each phase.

Fix applied: Added `## Phase tracker` with unchecked entries for every phase and an explicit requirement to update the tracker only after verified gates pass.

### Review finding 3 - large phases hid spec dependencies inside implementation work

Verdict: warning

Why: The initial phase bodies included "add a spec" and "implement" in the same broad task list. That can hide contract uncertainty and make implementation responsible for architecture decisions.

Fix applied: Each phase now requires an accepted spec or ADR review gate before code changes begin. If the spec/ADR review produces fail or warning findings, the phase must fix and commit those docs before implementation work starts.

## Goal

Close the Agonara product and traceability gaps that remain after Quick Check HTTP delivery. The plan converts the current review findings into buildable slices while preserving the accepted separation between Program corpus, Student state, Program Membership, Curator Workspace, Identity, and operational concerns.

## Execution mode

Mode: human-review-gated
Human review between tasks: yes
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push

## Execution lock

Worktree mode: reuse existing
Expected worktree: `worktrees/agonara-gap-closure`
Expected branch: `codex/agonara-gap-closure`
Preflight check: [ ] done

## Scope guardrails

- Do not merge unrelated product slices into one commit. Each phase ends with targeted verification and a local commit.
- Do not weaken answer-key redaction, idempotency, owner-only reads, session, or CSRF behavior in the existing Quick Check HTTP API.
- Do not mix Program corpus with Student state. Topic/material structure remains shared corpus; attempts, progress, weak areas, and evidence remain Student Workspace state.
- Do not make Admin authority the normal operator for Program participation, curation, or learning-domain behavior.
- Do not let LLM output become accepted corpus without explicit curator acceptance.
- Do not introduce external provider calls before the provider boundary, redaction rules, failure behavior, and tests are specified.
- Do not start code changes for a phase until the phase's governing spec or ADR has passed adversarial review and been committed.
- Do not commit phase implementation until post-implementation self-review and adversarial review are clean, every fail or warning is fixed, and required gates have been rerun.
- Do not push or open a PR unless the user explicitly asks after local commits are complete.

## ADR traceability matrix

| ADR / architecture invariant | Phase |
|---|---|
| ADR-010 keeps accepted Program corpus behind curator acceptance. | Phase 2, Phase 6, Phase 7 |
| ADR-011 keeps accepted checks in Corpus Storage and attempts/evidence in Student Workspace. | Phase 1, Phase 3, Phase 4 |
| ADR-016 keeps Quick Check answer keys protected and Student-facing projections redacted. | Phase 1 |
| Program Membership owns participation lifecycle and recovery hooks. | Phase 5 |
| Module Responsibility Map keeps LLM suggestions draft until owning modules accept them. | Phase 7 |

## Product intent traceability

| Story | Phase preserving or delivering intent |
|---|---|
| INT-03 - Study materials in program context | Phase 2 |
| INT-04 - Check understanding during study | Phase 1 |
| INT-06 - Topic-level or period-level readiness checks | Phase 4 |
| INT-07 - Personal mastery, weak areas, and evidence | Phase 3 |
| STU-22..STU-23, CUR-14..CUR-18, ADM-13..ADM-14 - Invitation, participation management, and recovery | Phase 5 |
| CUR-11..CUR-13 - LLM-assisted curation and provenance | Phase 7 |

## Phase tracker

- [ ] Phase 1 - Quick Check Product UI and Spec Status
- [ ] Phase 2 - Topic, Concept, and Material Navigation
- [ ] Phase 3 - Learner-State Interpretation
- [ ] Phase 4 - Topic-Level and Period-Level Checks
- [ ] Phase 5 - Program Membership Invitations and Recovery
- [ ] Phase 6 - Curator Coverage Gaps
- [ ] Phase 7 - LLM-Assisted Curation Suggestions

Update tracker checkboxes only after the phase's required verification passes and the phase commit is created.

## Phase 1 - Quick Check Product UI and Spec Status

**Objective**: make the implemented Quick Check HTTP API usable by effective Program Curators and Students, and repair implemented-spec traceability.

**Key work items**:

- Update `agonara/docs/specs/quick-check-assessment-api.md` from draft status to implemented or accepted, with links to the implemented plan and HTTP tests.
- Add or update a Quick Check product UI spec that covers role-specific screens, state transitions, redaction, validation, and failure states.
- Run adversarial review on the UI spec and fix every fail or warning before code changes begin.
- Add or extend the product UI shell needed for Quick Check curator and student workflows.
- Implement curator UI for candidate create, candidate listing, candidate acceptance, candidate rejection, and curation read.
- Implement student UI for delivery listing, delivery detail, attempt submission, idempotent retry handling, attempt detail, and attempt list.
- Keep answer keys, candidate ids on student surfaces, idempotency keys, CSRF tokens, session ids, and operational details out of rendered student UI.
- Update `agonara/docs/log.md` after implementation.

**Dependencies**: Existing Quick Check HTTP API tests and production-composition tests are green before the phase starts.

**Risks**: UI rendering can accidentally expose curator-only metadata that the HTTP API already redacts from student routes, especially if curator and student projections are reused.

**Validation**:

- Spec gate: Markdown/front-matter/link checks, adversarial review cleanout, and `git diff --check` before UI code begins.
- Targeted UI/browser tests for curator and student Quick Check flows.
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git diff --check`
- Post-implementation review gate: self-review and adversarial review the phase implementation against this plan, the Quick Check HTTP API spec, UI spec, and redaction rules; fix every fail or warning and rerun affected gates before committing.

**Completion signal**: A curator can manage Quick Checks through UI, a student can answer and inspect Quick Checks through UI, implemented spec metadata matches the shipped API, and tests/build pass.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 2 - Topic, Concept, and Material Navigation

**Objective**: implement the accepted Program corpus graph needed for topic/concept/material navigation and student-safe traversal.

**Key work items**:

- Add a spec for accepted topics, concepts, definitions, principles, material references, and their relationships.
- Run adversarial review on the corpus navigation spec and fix every fail or warning before storage, HTTP, or UI code changes begin.
- Add storage records and graph validation for accepted topic/concept/material revisions.
- Add curator candidate and acceptance routes for topic, concept, and material graph updates.
- Add student read routes for program coverage, topic details, linked materials, and material-to-concept back navigation.
- Add UI for program preview, topic view, concept view, linked materials, and back navigation from materials.
- Update Product Intent traceability, backlog, README, and `agonara/docs/log.md`.

**Dependencies**: Phase 1 is complete so Quick Check remains stable while navigation introduces the surrounding learning context.

**Risks**: Topic/material navigation can become personal progress by accident if the implementation records viewing state in Corpus Storage.

**Validation**:

- Spec gate: Markdown/front-matter/link checks, adversarial review cleanout, and `git diff --check` before implementation begins.
- Targeted storage tests for graph invariants and malformed restore rejection.
- HTTP tests for curator acceptance and student-safe navigation reads.
- UI/browser tests for topic and material traversal.
- Backup/restore tests for topic/concept/material graph preservation.
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git diff --check`
- Post-implementation review gate: self-review and adversarial review the phase implementation against this plan, the corpus navigation spec, ADR-010, and Corpus/Student boundary rules; fix every fail or warning and rerun affected gates before committing.

**Completion signal**: Students can navigate accepted topics, concepts, and linked materials without creating personal learner state, and curators can accept graph updates through tested boundaries.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 3 - Learner-State Interpretation

**Objective**: derive and expose personal progress and weak-area summaries from accepted checks, attempts, feedback, and evidence.

**Key work items**:

- Add a spec for learner-state interpretation inputs, summary shape, persistence or read-time derivation, and evidence links.
- Run adversarial review on the learner-state spec and fix every fail or warning before Student Workspace or UI code changes begin.
- Implement Student Workspace commands/queries for owner-only progress, weak areas, and evidence reads.
- Add UI surfaces for progress labels, weak topics/concepts, and evidence behind each label.
- Keep progress summaries separate from Program corpus and membership state.
- Update Product Intent traceability, backlog, README, and `agonara/docs/log.md`.

**Dependencies**: Phase 2 is complete so progress and weak areas can link back to accepted topics/concepts/materials.

**Risks**: Derived summaries can become opaque labels unless every label links back to attempts, answers, checks, or feedback.

**Validation**:

- Spec gate: Markdown/front-matter/link checks, adversarial review cleanout, and `git diff --check` before implementation begins.
- Targeted Student Workspace tests for evidence-to-summary derivation.
- HTTP tests for owner-only progress and weak-area reads.
- UI/browser tests showing progress labels and supporting evidence.
- Boundary tests proving summaries do not mutate Program corpus or membership state.
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git diff --check`
- Post-implementation review gate: self-review and adversarial review the phase implementation against this plan, the learner-state spec, owner-only read rules, and Corpus/Student separation; fix every fail or warning and rerun affected gates before committing.

**Completion signal**: Students can inspect personal progress and weak areas with evidence links, and the shared Program corpus remains unchanged by interpretation.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 4 - Topic-Level and Period-Level Checks

**Objective**: implement aggregate readiness checks that answer whether a student is ready to continue after a topic or period.

**Key work items**:

- Add a spec for topic-level and period-level check definitions, accepted revisions, attempts, and readiness result derivation.
- Run adversarial review on the aggregate-check spec and fix every fail or warning before Corpus, Student Workspace, or UI code changes begin.
- Implement Corpus Storage support for aggregate check definitions and accepted revisions.
- Implement Student Workspace attempt submission, owner-only reads, and readiness evidence.
- Add UI for starting aggregate checks, viewing results, and drilling into evidence.
- Preserve raw Quick Check and open-answer attempt semantics without silently promoting them into aggregate readiness.
- Update Product Intent traceability and `agonara/docs/log.md`.

**Dependencies**: Phase 3 is complete so readiness can use established learner-state evidence rules.

**Risks**: Aggregate readiness can look like grading or analytics if the boundary is not explicit.

**Validation**:

- Spec gate: Markdown/front-matter/link checks, adversarial review cleanout, and `git diff --check` before implementation begins.
- Storage and domain tests for aggregate check definitions and attempts.
- HTTP tests for submission, owner-only reads, historical revisions, and readiness evidence.
- UI/browser tests for topic/period check flow.
- Regression tests proving Quick Check routes and attempts keep their existing semantics.
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git diff --check`
- Post-implementation review gate: self-review and adversarial review the phase implementation against this plan, the aggregate-check spec, readiness evidence rules, and Quick Check regression constraints; fix every fail or warning and rerun affected gates before committing.

**Completion signal**: Students can complete topic/period readiness checks and inspect evidence-backed results without changing accepted corpus.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 5 - Program Membership Invitations and Recovery

**Objective**: implement controlled Program participation flows and exceptional recovery without moving normal participation control into Admin authority.

**Key work items**:

- Add a spec for invitation creation, acceptance, decline, revocation, participant listing, student removal, curator leave, exceptional recovery, and exceptional revocation.
- Run adversarial review on the membership invitation/recovery spec and fix every fail or warning before Program Membership, HTTP, or UI code changes begin.
- Implement Program Membership storage and command behavior for invitation and recovery records.
- Add curator routes for invitation and participant-management behavior.
- Add student routes for accepting and declining invitations.
- Add Admin exceptional recovery routes with attribution and audit behavior.
- Add UI for curator invitations, student invitation decisions, participant visibility, and Admin recovery inspection.
- Update Product Intent traceability, backlog, README, and `agonara/docs/log.md`.

**Dependencies**: Phase 2 is complete so participant visibility can reference programs with meaningful accepted corpus.

**Risks**: Admin recovery flows can become ordinary membership management unless each exceptional path is explicitly attributed and separated from curator/student flows.

**Validation**:

- Spec gate: Markdown/front-matter/link checks, adversarial review cleanout, and `git diff --check` before implementation begins.
- Program Membership domain tests for invite, accept, decline, revoke, remove, curator leave, recovery, and exceptional revocation.
- HTTP tests for authorization, attribution, private errors, and event reads.
- UI/browser tests for invitation and recovery workflows.
- Backup/restore tests for invitation and recovery history.
- Boundary tests proving membership changes do not mutate Student Workspace learning state.
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git diff --check`
- Post-implementation review gate: self-review and adversarial review the phase implementation against this plan, the membership invitation/recovery spec, attribution rules, and Admin-vs-Program-role boundary; fix every fail or warning and rerun affected gates before committing.

**Completion signal**: Controlled invitations, participant management, and exceptional recovery work through tested Program Membership boundaries with attribution.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 6 - Curator Coverage Gaps

**Objective**: let curators see missing or weak coverage across accepted topics, concepts, materials, and checks without treating suggestions as accepted corpus.

**Key work items**:

- Add a spec for coverage-gap inputs, output shape, and draft status.
- Run adversarial review on the coverage-gap spec and fix every fail or warning before Curator Workspace, HTTP, or UI code changes begin.
- Implement Curator Workspace coverage-gap reads over accepted Program corpus.
- Add UI for curator coverage inspection and drill-down.
- Keep coverage output separate from Student progress and weak-area interpretation.
- Update Product Intent traceability and `agonara/docs/log.md`.

**Dependencies**: Phase 2 is complete so coverage can analyze accepted topic/concept/material/check relationships.

**Risks**: Curator coverage gaps and Student weak areas use similar words but belong to different modules and must not share state.

**Validation**:

- Spec gate: Markdown/front-matter/link checks, adversarial review cleanout, and `git diff --check` before implementation begins.
- Curator Workspace tests for coverage gap calculation.
- HTTP tests for curator-only reads and redaction.
- UI/browser tests for coverage inspection.
- Boundary tests proving coverage gaps do not create accepted corpus or Student state.
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git diff --check`
- Post-implementation review gate: self-review and adversarial review the phase implementation against this plan, the coverage-gap spec, Curator Workspace ownership, and Student weak-area separation; fix every fail or warning and rerun affected gates before committing.

**Completion signal**: Curators can inspect corpus coverage gaps as draft guidance without mutating accepted corpus or Student state.

**Commit**: Commit this phase after validation with a short imperative message.

## Phase 7 - LLM-Assisted Curation Suggestions

**Objective**: implement LLM-assisted curation as draft suggestion workflow with provenance and explicit curator acceptance.

**Key work items**:

- Add a provider-boundary spec for suggestion generation, prompt context, output validation, provenance, redaction, and provider failure behavior.
- Run adversarial review on the provider-boundary spec and fix every fail or warning before Curator Workspace, HTTP, provider, or UI code changes begin.
- Implement Curator Workspace suggestion records with draft status and origin metadata.
- Add provider fakes for tests before wiring any real provider configuration.
- Add curator review routes for suggestion listing, detail, accept, and reject.
- Add UI for reviewing suggestions and their origin.
- Update Product Intent traceability, module responsibility notes if needed, and `agonara/docs/log.md`.

**Dependencies**: Phase 6 is complete so suggestions can be informed by coverage gaps without being accepted automatically.

**Risks**: Provider output can leak raw prompts, credentials, or unsupported content into logs, UI, accepted corpus, or backups.

**Validation**:

- Spec gate: Markdown/front-matter/link checks, adversarial review cleanout, and `git diff --check` before implementation begins.
- Curator Workspace tests for suggestion creation, validation, provenance, accept, reject, and provider failure.
- HTTP tests for curator-only suggestion reads and mutations.
- UI/browser tests for suggestion review and origin inspection.
- Backup/restore tests for suggestion records and redaction.
- Boundary tests proving no suggestion becomes accepted corpus without explicit curator acceptance.
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git diff --check`
- Post-implementation review gate: self-review and adversarial review the phase implementation against this plan, the provider-boundary spec, provenance/redaction rules, and draft-to-accepted Corpus rules; fix every fail or warning and rerun affected gates before committing.

**Completion signal**: Curators can generate, inspect, accept, and reject LLM-assisted suggestions with provenance, redaction, and draft-state protection.

**Commit**: Commit this phase after validation with a short imperative message.

## Done criteria

- Quick Check spec metadata reflects the implemented HTTP API, and Quick Check has tested Curator and Student UI flows.
- Accepted topic, concept, material, and navigation behavior is implemented across storage, HTTP, UI, and backup/restore.
- Student progress and weak-area summaries are evidence-backed, owner-only, and separate from Program corpus.
- Topic-level and period-level checks produce evidence-backed readiness results without changing raw Quick Check semantics.
- Program Membership invitation and exceptional recovery flows are implemented with attribution and without turning Admin into the normal Program role operator.
- Curator coverage-gap and LLM suggestion workflows keep draft guidance separate from accepted corpus until explicit acceptance.
- Every code/config/generated-artifact phase passes the Agonara test wrapper, root build wrapper, and `git diff --check`.
- Every docs-only phase passes Markdown/front-matter/link checks and `git diff --check`.
- Every phase's governing spec or ADR passes adversarial review before implementation code begins.
- Every phase passes post-implementation self-review and adversarial review, fixes every fail or warning, and reruns affected gates before commit.
- The implementation plan tracker is updated after each completed phase and committed.

## Final closeout

Final gates: `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`, `PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" ./scripts/run_silent.sh "build" npx tsc --noEmit`, Markdown/front-matter/link checks for touched docs, and `git diff --check`.
LOC dashboard: refresh `docs/loc-dashboard.html` with `./scripts/loc-dashboard.sh --sort=name`, then verify the summary cards, table footer, `data` array, and `Last updated` line match the script output.
Archive plan: move to `agonara/docs/plans/implemented/agonara-product-gap-closure.md`
Commit archive move: yes
Push/PR: follow push policy; no push unless explicitly requested.
