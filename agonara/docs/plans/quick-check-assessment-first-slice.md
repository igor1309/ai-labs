---
date: 2026-06-02
model: gpt-5
description: "Implementation plan: Agonara deterministic single-select quick-check assessment first slice."
---

# Quick-Check Assessment First Slice Implementation Plan

## Goal

Deliver the Agonara v0.0.1 deterministic single-select quick-check assessment slice so Corpus Storage owns draft candidates, accepted revisions, options, and answer keys while Student Workspace owns immutable idempotent attempts, matched results, and student-specific evidence.

This plan implements [Quick-Check Assessment First Slice](../specs/quick-check-assessment-first-slice.md) and [ADR-016](../adr/adr-016-quick-check-assessment-boundary.md). It preserves the Product Intent requirement that students can answer checks during study and receive personal evidence while deferring UI, HTTP routes, CLI commands, option randomization, non-single-select checks, learner-state interpretation, grading, analytics, external providers, evaluator workers, queues, and human review.

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push

## Execution lock

Worktree mode: reuse existing
Expected worktree: `worktrees/agonara-student-attempt-api`
Expected branch: `codex/agonara-student-attempt-api`
Preflight check: [x] done

## Scope guardrails

### In scope

- Corpus Storage quick-check candidate persistence with draft, accepted, and rejected lifecycle state.
- Corpus Storage accepted quick-check entity and revision persistence with stable options and protected answer keys.
- Program Curator command and query behavior for candidate creation, listing, acceptance, rejection, and curation revision reads.
- Student-safe delivery projections for current and historical accepted quick-check revisions.
- Internal accepted-revision resolution for Student Workspace evaluation after Student authorization.
- Student Workspace quick-check attempt submission, idempotency, immutable matched results, owner-only attempt reads, and list filters.
- Protected backup and restore preservation plus malformed graph rejection for quick-check candidates, accepted entities, accepted revisions, answer keys, attempts, and matched results.
- Redaction and non-mutation checks for answer keys, option correctness metadata, idempotency keys, curator-only metadata, operational secrets, adjacent accepted corpus, Program Membership, Identity, session, credential, Admin authority, CSRF, and learner-state interpretation.
- Product Intent traceability, Agonara log updates, phase status updates, adversarial review hardening, and final plan archive closeout.

### Out of scope

- HTTP routes, CLI commands, Student UI, Admin UI, Curator UI, Program UI, or generated frontend artifacts.
- Option randomization, localization, accessibility presentation, rich media, multiple-select checks, ordering checks, matching checks, code checks, free-form deterministic checks, adaptive checks, or spaced-repetition checks.
- Topic-level checks, period-level checks, mastery calculation, weak-area calculation, progress interpretation, review scheduling, next-step recommendation, topic readiness, period readiness, grading, analytics, reporting, certification, classroom, cohort, plagiarism, proctoring, or identity verification workflows.
- External provider calls, evaluator workers, durable queues, human review queues, reviewer assignment, or deployment topology.
- Mutating open-answer checks, assessment criteria, unrelated accepted corpus, unrelated curator candidates, Program Membership state, Identity state, sessions, credentials, Admin authority, or CSRF state.
- Pushes, PRs, merges, or protected-trunk operations.

## ADR traceability matrix

| ADR | Invariant | Phase |
|---|---|---|
| ADR-010 | Accepted Program corpus crosses from candidate state only through explicit curator acceptance. | Phase 2, Phase 3 |
| ADR-011 | Accepted checks remain Corpus Storage state while attempts and evidence remain Student Workspace state. | Phase 2, Phase 3, Phase 5 |
| ADR-016 | Corpus Storage owns accepted quick-check revisions, options, and answer keys. | Phase 1, Phase 2 |
| ADR-016 | Student-facing delivery projections exclude answer keys and option correctness metadata. | Phase 4, Phase 7 |
| ADR-016 | Student Workspace owns immutable attempts, selected options, matched results, and quick-check evidence. | Phase 5, Phase 6 |
| ADR-016 | Submission is idempotent for equivalent client retries and rejects material conflicts. | Phase 5 |
| ADR-016 | Historical attempts remain tied to the accepted revision used at submission time. | Phase 5, Phase 8 |
| ADR-016 | Quick-check behavior must not create hidden mastery, progress, readiness, grading, analytics, or reporting state. | Phase 7, Phase 8 |
| ADR-016 | Protected backup and restore preserve answer keys and reject malformed quick-check graphs. | Phase 8 |

## Product intent traceability

| Story or requirement | Phase preserving or delivering intent |
|---|---|
| Students answer accepted checks during study. | Phase 4, Phase 5, Phase 9 |
| Students see whether a result confirms or challenges current understanding. | Phase 5, Phase 6, Phase 9 |
| Quick-check results become part of the student's personal evidence. | Phase 5, Phase 6, Phase 8, Phase 9 |
| Corpus and Student Workspace boundaries remain explicit. | Phase 1 through Phase 9 |

## TDD and commit discipline

Every implementation phase must use strict TDD:

- Add or update one focused failing domain, storage, backup/restore, or executable acceptance test at a time.
- Run the targeted Agonara test command and capture a RED assertion failure. Compilation errors are not RED.
- Implement the minimum production change that turns that assertion GREEN.
- Repeat RED/GREEN until the phase objective is complete.
- Run the phase validation gates.
- Commit only files tied to the phase after GREEN gates pass.
- Self-review the phase against this plan, the spec, and ADR invariants immediately after the phase commit.
- Fix every fail or warning finding, rerun the phase gates, and commit the fix before advancing.
- Mark phase status complete only after the phase commit and self-review hardening, then commit the plan status update before advancing.

Each phase has its own local commit. Do not bundle unrelated phase work into one commit.

Use Node commands through the repo wrapper:

- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

## Phase 1 — Quick-check storage substrate

**Status**: [x] complete

**Objective**: add persistence for quick-check candidates, accepted entities, accepted revisions, revision options, and attempts without exposing product behavior before storage invariants hold.

**Key work items**:

- Add storage tables and indexes for quick-check candidates, accepted entities, accepted revisions, accepted options, and quick-check attempts.
- Add storage helpers for creating, reading, listing, and status-changing candidates.
- Add storage helpers for creating accepted entities and accepted revisions while preserving previous revisions.
- Add storage helpers for reading accepted revisions with answer keys and for creating immutable attempts.
- Add database-enforced scoped idempotency for acting Student Identity, Program, accepted revision, and idempotency key.
- Add storage invariant checks for option collections, answer-key membership, selected-option membership, and revision/entity scope.

**Dependencies**: implemented Program, Program Membership, Program Source, accepted corpus, and Student Workspace storage conventions.

**Risks**: storage can accidentally make answer keys part of student-safe projections or rely only on domain code for immutable/idempotent behavior. Put answer-key and idempotency invariants in storage tests before domain commands depend on them.

**TDD sequence**:

1. RED/GREEN candidate records persist option ids, answer-key option id, source ids, rationale, lifecycle status, creator attribution, and timestamps.
2. RED/GREEN accepted entity and revision records preserve stable accepted option ids, one answer-key option id, candidate provenance, source ids, rationale, accepting curator attribution, and historical revisions.
3. RED/GREEN malformed option collections and answer-key references reject with storage invariant reasons.
4. RED/GREEN quick-check attempts persist Program, Student Identity, accepted revision, selected option, matched result, idempotency key, and submitted timestamp immutably.
5. RED/GREEN equivalent scoped idempotency-key reuse finds the original attempt while conflicting selected-option reuse rejects.

**Validation**:

- Targeted storage tests for quick-check candidates, accepted revisions, option invariants, attempt immutability, and scoped idempotency.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 1 tests pass, full Node gates pass, and a local phase commit is created.

## Phase 2 — Curator candidate lifecycle

**Status**: [x] complete

**Objective**: expose Program Curator-owned quick-check candidate commands and queries while keeping candidates separate from accepted corpus until acceptance.

**Key work items**:

- Add `createQuickCheckCandidate`, `listQuickCheckCandidates`, and `rejectQuickCheckCandidate` command/query behavior.
- Enforce active Identity and effective Program Curator participation.
- Validate Program existence, source existence, source Program scope, title, prompt, option text, duplicate trimmed option text, status filters, and answer-key index.
- Return candidate summaries that include answer keys only on curator-authorized surfaces.
- Prove Students and Admins without effective Program Curator participation cannot read or mutate candidates.

**Dependencies**: Phase 1 storage substrate.

**Risks**: authorization failures can leak candidate existence or blur Admin authority with Program Curator participation. Keep rejection reasons deterministic and aligned with the spec.

**TDD sequence**:

1. RED/GREEN effective Program Curators create draft candidates with opaque option ids and one answer-key option id.
2. RED/GREEN inactive Identities, unknown Programs, non-curators, invalid content, invalid options, duplicate trimmed options, invalid answer-key indexes, unknown sources, and cross-Program sources reject with specified reasons.
3. RED/GREEN candidate listing scopes to Program and applies supported status filters.
4. RED/GREEN Students, Admins without effective Program Curator participation, and unsupported status filters reject with specified reasons.
5. RED/GREEN rejecting a draft candidate marks it rejected and creates no accepted entity or revision.
6. RED/GREEN rejecting unknown, accepted, or already rejected candidates returns specified reasons.

**Validation**:

- Targeted Corpus Storage and Curator boundary tests for candidate creation, listing, rejection, authorization, validation, and accepted-corpus non-mutation.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 2 tests pass, full Node gates pass, and a local phase commit is created.

## Phase 3 — Candidate acceptance and curation revision reads

**Status**: [x] complete

**Objective**: move draft quick-check candidates into versioned accepted quick-check revisions and expose answer-key reads only to effective Program Curators.

**Key work items**:

- Add `acceptQuickCheckCandidate` behavior for new accepted entities.
- Add `acceptQuickCheckCandidate` behavior for replacement revisions on a target entity.
- Preserve prior revisions as addressable historical revisions.
- Mark accepted candidates and reject unknown, already accepted, already rejected, unknown target, and cross-Program target cases with specified reasons.
- Add `getAcceptedQuickCheckRevisionForCuration` with Program Curator authorization and answer-key-inclusive summary.
- Prove acceptance does not mutate unrelated corpus, Program Membership, Identity, session, credential, Admin authority, CSRF, or Student Workspace attempt state.

**Dependencies**: Phase 2.

**Risks**: replacement revisions can rewrite history or reuse candidate option ids in accepted student-facing surfaces. Preserve historical rows and generate accepted option ids independently from candidate option ids.

**TDD sequence**:

1. RED/GREEN accepting a draft candidate creates one accepted entity and current revision with opaque accepted option ids and one valid answer-key option id.
2. RED/GREEN accepting into a target entity creates a replacement current revision while keeping the prior revision addressable.
3. RED/GREEN acceptance preserves option order, candidate provenance, source ids, rationale, accepting curator attribution, and acceptance time.
4. RED/GREEN unknown, already accepted, already rejected, unknown target, and cross-Program target cases reject with specified reasons.
5. RED/GREEN curation reads return current and historical accepted revisions with answer keys only to effective Program Curators.
6. RED/GREEN inactive Identities, unknown revisions, Students, and Admins without effective Program Curator participation reject with specified reasons.

**Validation**:

- Targeted command/query tests for acceptance, replacement revisions, historical reads, answer-key visibility, authorization, and non-mutation boundaries.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 3 tests pass, full Node gates pass, and a local phase commit is created.

## Phase 4 — Student-safe delivery projections

**Status**: [x] complete

**Objective**: let effective Students list and read accepted quick-check deliveries without exposing answer keys or curator-only metadata.

**Key work items**:

- Add `listQuickCheckDeliveries` for current accepted quick-check revisions in a Program.
- Add `getQuickCheckDelivery` for current or historical accepted quick-check revisions.
- Enforce active Identity, Program existence, revision existence, revision Program scope, and effective Student participation.
- Return delivery summaries with revision id, Program id, check kind, title, prompt, and answerable options only.
- Add redaction coverage for answer keys, correctness flags, candidate ids, rationale, accepting curator attribution, acceptance time, idempotency keys, operational secrets, SQL text, stack traces, filesystem paths, database URLs, and infrastructure details.

**Dependencies**: Phase 3.

**Risks**: delivery reads are the highest answer-key leakage surface. Tests should inspect the whole returned payload and fault surfaces instead of asserting only expected fields.

**TDD sequence**:

1. RED/GREEN delivery listing returns only current accepted quick-check revisions for the requested Program.
2. RED/GREEN delivery revision reads return current and historical student-safe projections.
3. RED/GREEN inactive Identities, unknown Programs, unknown revisions, and callers without effective Student participation reject with specified reasons.
4. RED/GREEN delivery payloads exclude answer keys, option correctness metadata, curator-only metadata, candidate ids, idempotency keys, and operational secrets.
5. RED/GREEN delivery queries do not mutate accepted corpus, candidate state, Student Workspace attempts, Program Membership, Identity, session, credential, Admin authority, or CSRF state.

**Validation**:

- Targeted delivery query tests for current listing, historical read, authorization, redaction, fault hygiene, and non-mutation boundaries.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 4 tests pass, full Node gates pass, and a local phase commit is created.

## Phase 5 — Student Workspace attempt submission

**Status**: [x] complete

**Objective**: record immutable Student-owned quick-check attempts with deterministic matched results and scoped idempotency.

**Key work items**:

- Add `submitQuickCheckAttempt` to the Student Workspace command surface.
- Enforce active Identity, Program existence, effective Student participation, accepted revision resolution, revision Program scope, selected option membership, and idempotency-key validation.
- Resolve the accepted revision and answer key through an internal boundary only after authorization checks pass.
- Add direct internal-boundary coverage that `resolveAcceptedQuickCheckRevisionForEvaluation` returns answer-key-inclusive accepted revisions only for accepted revision ids in the requested Program.
- Add direct internal-boundary coverage that unknown revisions, candidate ids, and cross-Program revisions reject with the specified reasons.
- Compare selected option id to answer-key option id server-side and persist the matched result.
- Return the original attempt for equivalent scoped idempotency-key reuse and reject conflicting reuse.
- Prove corrective answers create new attempts with new idempotency keys and do not mutate previous attempts.
- Prove later accepted revisions do not rewrite historical attempts or results.

**Dependencies**: Phase 4.

**Risks**: the internal answer-key boundary can become an unauthorized product-role query or run before Student access checks. Sequence tests around authorization-before-resolution and surface absence.

**TDD sequence**:

1. RED/GREEN effective Students submit accepted quick-check attempts and receive immutable selected-option and matched-result summaries.
2. RED/GREEN inactive Identities, unknown Programs, non-Students, unknown revisions, candidate ids, cross-Program revisions, invalid selected option ids, and invalid idempotency keys reject with specified reasons.
3. RED/GREEN accepted revision answer keys are resolved only after active Identity, Program, and effective Student checks pass.
4. RED/GREEN `resolveAcceptedQuickCheckRevisionForEvaluation` returns answer-key-inclusive accepted revisions for matching Program scope and rejects unknown revisions, candidate ids, and cross-Program revisions with specified reasons.
5. RED/GREEN equivalent idempotency-key retry returns the original attempt without duplicate creation.
6. RED/GREEN conflicting selected-option reuse of the same scoped idempotency key rejects with `idempotency_conflict`.
7. RED/GREEN corrective answers create new attempts without mutating prior attempts or results.
8. RED/GREEN later accepted revisions do not rewrite historical attempts or matched results.

**Validation**:

- Targeted Student Workspace tests for submission, authorization, internal resolution ordering, internal resolver behavior, selected-option validation, idempotency, immutability, corrective answers, and historical revision stability.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 5 tests pass, full Node gates pass, and a local phase commit is created.

## Phase 6 — Owner-only attempt reads

**Status**: [x] complete

**Objective**: expose quick-check attempts as owning-Student personal evidence without answer keys, per-option correctness metadata, or idempotency keys.

**Key work items**:

- Add `getQuickCheckAttempt` and `listQuickCheckAttempts`.
- Enforce active Identity, owning Student scope, Program existence, effective Student participation, and accepted revision filter validation.
- Return only attempts owned by the acting Student Identity.
- Apply `checkRevisionId` filters after Program and owning-Student scope.
- Keep non-owning Students, Program Curators, Admins, and other callers from discovering private attempts.

**Dependencies**: Phase 5.

**Risks**: read behavior can leak private attempt existence or answer-key metadata through filters and faults. Keep non-owner behavior private and filter validation ordered after owner scope where the spec requires it.

**TDD sequence**:

1. RED/GREEN `getQuickCheckAttempt` returns the owning Student's attempt result without answer keys, per-option correctness metadata, or idempotency key.
2. RED/GREEN `getQuickCheckAttempt` rejects inactive Identities, unknown attempts, non-owning Students, Program Curators, Admins, and other callers with specified reasons.
3. RED/GREEN `listQuickCheckAttempts` returns only attempts owned by the acting Student in the requested Program.
4. RED/GREEN accepted revision filters apply after Program and owning-Student scope.
5. RED/GREEN unknown and cross-Program accepted revision filters reject with specified reasons.
6. RED/GREEN attempt read responses and faults exclude answer keys, option correctness metadata, idempotency keys, curator-only metadata, and operational secrets.

**Validation**:

- Targeted attempt read tests for owner-only detail, owner-only listing, revision filters, private non-owner behavior, redaction, and fault hygiene.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 6 tests pass, full Node gates pass, and a local phase commit is created.

## Phase 7 — Boundary isolation and surface absence

**Status**: [x] complete

**Objective**: prove quick-check behavior remains inside its decided boundaries and does not introduce hidden learner-state interpretation or public surfaces.

**Key work items**:

- Add explicit tests that quick-check commands and queries do not mutate open-answer checks, assessment criteria, unrelated accepted corpus, unrelated curator candidates, Program Membership, Identity, session, credential, Admin authority, or CSRF state.
- Add explicit tests that quick-check behavior does not create mastery, weak-area, progress, review-scheduling, next-step, topic-readiness, period-readiness, grading, analytics, or reporting state.
- Add surface-absence tests for HTTP routes, CLI commands, UI artifacts, provider adapters, evaluator worker paths, queue paths, and human review paths.
- Add positive controls for answer-key and correctness-metadata redaction across student-facing responses, faults, logs, and transport-adjacent summaries.

**Dependencies**: Phase 6.

**Risks**: boundary tests can become superficial snapshots. Use positive controls that would fail if answer keys, correctness metadata, or deferred learner-state surfaces are introduced.

**TDD sequence**:

1. RED/GREEN quick-check candidate, delivery, submission, and read flows leave adjacent domain snapshots unchanged.
2. RED/GREEN quick-check flows do not create learner-state interpretation, grading, analytics, reporting, UI, CLI, provider, worker, queue, or human-review state.
3. RED/GREEN student-facing responses and rejected fault payloads exclude answer keys, per-option correctness metadata, idempotency keys, candidate ids, curator-only metadata, and operational secrets.
4. RED/GREEN internal answer-key resolution is not reachable through student-facing, Program Curator, Admin, HTTP, or CLI surfaces.

**Validation**:

- Targeted boundary tests for adjacent-domain non-mutation, out-of-scope surface absence, redaction positive controls, and internal-boundary isolation.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 7 tests pass, full Node gates pass, and a local phase commit is created.

## Phase 8 — Backup and restore

**Status**: [x] complete

**Objective**: preserve protected quick-check graphs through backup/restore and reject malformed candidates, accepted revisions, answer keys, attempts, and matched results.

**Key work items**:

- Include quick-check candidates, accepted entities, accepted revisions, accepted options, answer keys, attempts, matched results, and historical references in protected backups.
- Restore valid quick-check graphs in dependency order.
- Reject candidates with missing Programs, missing creator Identities, missing or cross-Program sources, invalid option collections, duplicate option ids, duplicate trimmed option text, empty option text, or answer keys outside the candidate.
- Reject accepted entities and revisions with missing or cross-Program owner records, missing candidate provenance, invalid option collections, missing or duplicated answer keys, or answer keys outside the revision.
- Reject attempts that reference missing Programs, missing Identities, missing or cross-Program accepted revisions, selected option ids outside the referenced revision, or matched results inconsistent with the referenced revision answer key.
- Prove restore preserves historical references and idempotency behavior.

**Dependencies**: Phase 7.

**Risks**: protected backup must preserve answer keys while student-facing restore-derived projections must still omit them. Test both protected preservation and post-restore student-safe projection redaction.

**TDD sequence**:

1. RED/GREEN protected backups include quick-check candidates, accepted entities, accepted revisions, accepted options, answer keys, attempts, matched results, and historical references.
2. RED/GREEN restore preserves valid quick-check graphs and restored delivery/attempt reads remain redacted.
3. RED/GREEN malformed candidate graphs reject with storage invariant reasons.
4. RED/GREEN malformed accepted entity and revision graphs reject with storage invariant reasons.
5. RED/GREEN malformed attempt graphs and inconsistent matched results reject with storage invariant reasons.
6. RED/GREEN restored historical attempts remain tied to their original accepted revision and idempotency scope.

**Validation**:

- Targeted backup/restore tests for preservation, post-restore redaction, malformed candidates, malformed accepted revisions, malformed attempts, inconsistent matched results, historical references, and idempotency preservation.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 8 tests pass, full Node gates pass, and a local phase commit is created.

## Phase 9 — Executable acceptance and closeout

**Status**: [ ] pending

**Objective**: prove the full Quick Check first-slice flow end to end and close the implementation plan with traceability, logs, and archive movement.

**Key work items**:

- Add an executable acceptance flow in which a Program Curator creates and accepts a quick-check candidate.
- Verify a Student receives a delivery projection without the answer key.
- Verify Student Workspace resolves the answer key only through the internal authorized submission boundary.
- Verify the Student submits a matching answer, retries with the same idempotency key without duplicating the attempt, and submits a corrective answer as a new attempt.
- Verify a later accepted revision does not rewrite historical results.
- Verify backup and restore preserve the graph and post-restore reads remain redacted.
- Verify no open-answer, mastery, weak-area, progress, UI, CLI, provider, worker, queue, human review, grading, analytics, or reporting state is introduced.
- Update Product Intent traceability references and Agonara log entries for the implemented slice.
- Run final gates, move this plan to `agonara/docs/plans/implemented/quick-check-assessment-first-slice.md`, and commit the archive move in the same change set.

**Dependencies**: Phase 8.

**Risks**: executable acceptance can hide multiple missing unit behaviors if it is the first comprehensive check. Keep it as closeout confirmation; do not defer phase-specific behavior coverage to this phase.

**TDD sequence**:

1. RED/GREEN executable acceptance flow covers curator candidate creation, acceptance, student delivery, authorized submission, idempotent retry, corrective answer, later revision, owner reads, backup/restore, and redaction.
2. RED/GREEN final out-of-scope surface checks remain green after the full flow exists.
3. Review Product Intent traceability and Agonara log entries so they reflect the implemented Quick Check first slice.
4. Review final archive-relative links after moving the plan to `implemented/`.

**Validation**:

- Targeted executable acceptance tests for the full Quick Check first-slice flow.
- Documentation structure and archive-relative link review.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git status --short`

**Completion signal**: Phase 9 tests pass, final gates pass, this plan is moved to `agonara/docs/plans/implemented/quick-check-assessment-first-slice.md`, and the archive move is committed.

## Done criteria

- Corpus Storage persists draft quick-check candidates and versioned accepted single-select quick-check revisions with opaque options and one valid answer key.
- Curator Workspace behavior keeps draft, accepted, and rejected candidate lifecycle separate from accepted corpus.
- Effective Program Curator participation is required for candidate commands, candidate queries, and accepted revision reads that expose answer keys.
- Effective Student participation is required for student-safe delivery projections and Student Workspace attempt submission.
- Student Workspace resolves answer keys only through the internal Corpus Storage evaluation boundary after authorized submission checks.
- Student-facing delivery projections never expose answer keys, option correctness metadata, idempotency keys, or curator-only metadata.
- Student Workspace exposes immutable append-only attempts with selected option, matched result, and scoped idempotency behavior.
- Owning-Student attempt reads expose personal evidence without answer keys, per-option correctness metadata, or idempotency keys.
- Protected backup and restore preserve quick-check graphs and reject malformed owner, answer-key, attempt, or matched-result references.
- Quick-check behavior does not mutate adjacent modules or create hidden learner-state interpretation.
- No HTTP routes, CLI commands, UI, option randomization, multiple-select checks, topic-level checks, period-level checks, mastery interpretation, progress interpretation, review scheduling, next-step recommendation, grading, analytics, reporting, external provider calls, evaluator workers, queues, or human review behavior is introduced by this first slice.
- Every implementation phase has a local commit, a post-commit adversarial self-review, any fail/warning fixes committed, and a phase status update committed before the next phase starts.
- Final Agonara tests, root tests, and TypeScript build gates pass.
- This plan is moved to `agonara/docs/plans/implemented/` in the same change set as the completed implementation.

## Final closeout

Final gates: `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`, `./scripts/run_silent.sh "tests" npm test`, `./scripts/run_silent.sh "build" npx tsc --noEmit`, documentation structure review, implementation-plan checklist review, archive-relative link review, and `git status --short`
Archive plan: move to `agonara/docs/plans/implemented/quick-check-assessment-first-slice.md` and repair archive-relative links
Commit archive move: yes
Push/PR: follow push policy
