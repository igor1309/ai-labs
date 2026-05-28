---
date: 2026-05-28
model: gpt-5
description: "Implementation plan: Agonara Corpus Storage and Curator Acceptance first slice."
---

# Corpus Storage and Curator Acceptance First Slice Implementation Plan

## Goal

Deliver the Agonara v0.0.1 Corpus Storage and Curator Acceptance domain contract so effective Program Curators can record Program sources, create topic/concept candidates, explicitly accept or reject candidates, and expose stable accepted corpus revisions without introducing UI, HTTP routes, CLI commands, material storage, LLM execution, assessment, or Student Workspace state.

This plan implements [Corpus Storage and Curator Acceptance First Slice](../specs/corpus-storage-and-curator-acceptance-first-slice.md) and [ADR-010](../adr/adr-010-corpus-storage-and-curator-acceptance-boundary.md). It must preserve the accepted Program shell and effective participation contracts from [ADR-009](../adr/adr-009-program-shell-and-initial-curator-participation.md) and [ADR-007](../adr/adr-007-effective-participation-authorization-contract.md).

## Execution mode

Mode: auto-continue
Human review between tasks: no
Stop conditions: failed gates, unclear scope, missing credentials/tooling, destructive operations, explicit user interruption
Push policy: no push

## Execution lock

Worktree mode: create new
Expected worktree: `worktrees/agonara-corpus-acceptance-first-slice`
Expected branch: `codex/agonara-corpus-acceptance-first-slice`
Preflight check: [ ] done

## Scope guardrails

### In scope

- Storage records and helpers for Program source records, Corpus candidates, accepted corpus entities, accepted corpus revisions, and Corpus events.
- A domain command/query boundary for the interface in [Corpus Storage and Curator Acceptance First Slice](../specs/corpus-storage-and-curator-acceptance-first-slice.md).
- Effective Program Curator authorization for curator commands and curator-only queries.
- Effective Student, Program Curator, or Admin authorization for accepted corpus read queries.
- Candidate status transitions for `draft`, `accepted`, and `rejected`.
- Acceptance into a new accepted corpus entity and acceptance into an existing entity as a new current revision.
- Stable historical accepted revisions.
- Program-scoped source, candidate, accepted corpus, and Corpus event query behavior.
- Backup/restore coverage for all new Corpus Storage and Curator Workspace records.
- Redaction coverage for new source, candidate, accepted corpus, and event response shapes.
- Executable acceptance coverage for the full domain flow.

### Out of scope

- HTTP routes, CLI commands, Admin UI, Curator Workspace UI, Student Workspace UI, or Program UI.
- Material file storage, scraping, copying, licensing policy, source reliability scoring, or citation-format enforcement beyond source metadata fields.
- Accepted checks, accepted assessment criteria, assessment scoring, open-answer feedback, student attempts, progress state, mastery state, weak areas, or learning sessions.
- LLM prompt execution, model calls, suggestion generation, or automated acceptance.
- Program archival, Program deletion, Program ownership transfer, corpus publication workflows, collaborative editing, branching, merging, or conflict resolution.
- Program Membership invitation flows, curator leave/removal, membership recovery mutations, or new membership policy.
- Reworking Identity, Program shell, or Program Membership behavior except for using existing effective participation and backup/restore seams.

## ADR traceability matrix

| ADR | Invariant | Phase |
|---|---|---|
| ADR-007 | Effective participation is the read-only authorization contract used by other modules. | Phase 2, Phase 3, Phase 4, Phase 6 |
| ADR-009 | Accepted corpus records are scoped to stable Program shells. | Phase 1, Phase 2, Phase 4 |
| ADR-010 | Corpus Storage owns accepted Program corpus and stable accepted revisions. | Phase 1, Phase 4, Phase 6 |
| ADR-010 | Curator Workspace owns candidates, drafts, LLM suggestions, and review state before acceptance. | Phase 1, Phase 3 |
| ADR-010 | Candidate material must not appear as accepted corpus before explicit Program Curator acceptance. | Phase 3, Phase 4 |
| ADR-010 | Acceptance must preserve candidate/source/rationale provenance and acting Identity attribution. | Phase 2, Phase 4, Phase 6 |
| ADR-010 | Student Workspace state must remain separate from accepted corpus. | Phase 4, Phase 7 |

## Product intent traceability

| Story | Phase preserving intent |
|---|---|
| CUR-01 - Create program from grounded sources | Phase 2, Phase 4 |
| CUR-02 - Add topics and concepts | Phase 3, Phase 4 |
| CUR-06 - Keep accepted content separate from drafts | Phase 3, Phase 4 |
| CUR-07 - Add external sources | Phase 2 |
| CUR-08 - Extract candidate structure from sources | Phase 3 |
| CUR-10 - Update program after research | Phase 4 |
| CUR-11 - Use LLM assistance for program structuring | Phase 3 |
| CUR-12 - Review LLM suggestions | Phase 3, Phase 4 |
| CUR-13 - Trace suggestion origin | Phase 2, Phase 4 |
| INT-01 - Собрать программу из источников | Phase 2, Phase 4, Phase 7 |
| INT-02 - Увидеть понятийный аппарат темы | Phase 4, Phase 7 |

## TDD and commit discipline

Every phase must use strict TDD:

- Add or update one focused failing test at a time.
- Run the targeted Agonara test command and capture a RED assertion failure. Compilation errors are not RED.
- Implement the minimum production change that turns that assertion GREEN.
- Repeat RED/GREEN until the phase objective is complete.
- Run the phase validation gates.
- Commit only the files tied to that phase after GREEN gates pass.

Each implementation phase has its own local commit. Do not bundle unrelated phase work into one commit.

## Phase 1 — Corpus persistence substrate

**Objective**: add storage-level persistence for the new Corpus Storage and Curator Workspace records without exposing domain commands yet.

**Key work items**:

- Add storage schema for Program source records, Corpus candidates, accepted corpus entities, accepted corpus revisions, and Corpus events.
- Add storage create/get/list helpers for the new records.
- Enforce structural Program scoping checks for source and candidate records.
- Enforce accepted entity current revision integrity.
- Keep new storage helpers separate from Identity, Program shell, and Program Membership ownership rules.

**TDD sequence**:

1. RED/GREEN storage creates and lists Program source records scoped by Program.
2. RED/GREEN storage creates and lists Corpus candidate records scoped by Program and status.
3. RED/GREEN storage creates accepted corpus entities and accepted corpus revisions with current revision linkage.
4. RED/GREEN storage keeps historical accepted revisions addressable after a newer current revision is created.
5. RED/GREEN storage creates and lists Corpus events scoped by Program.
6. RED/GREEN storage rejects accepted entity/current revision integrity breaks.

**Dependencies**: existing SQLite storage initialization and Program shell storage helpers.

**Risks**: accidentally making storage policy-aware instead of preserving policy in the domain service. Keep storage helpers structural and let later phases own authorization and transitions.

**Validation**:

- Targeted storage tests for Corpus records.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 1 storage tests pass, full Node gates pass, and local commit `add agonara corpus storage records` is created.

## Phase 2 — Program source commands and events

**Objective**: expose `recordProgramSource`, `listProgramSources`, and source event behavior behind effective Program Curator authorization.

**Key work items**:

- Add a Corpus command/query module composed with the shared database, existing Identity resolution, and Program Membership effective participation/access checks.
- Implement `recordProgramSource`.
- Implement `listProgramSources`.
- Validate `SourceKind`, `title`, `locator`, and `citation`.
- Emit accepted and rejected `program_source_recorded` Corpus events when the acting Identity and Program can be resolved.
- Preserve response redaction for source summaries and Corpus events.

**TDD sequence**:

1. RED/GREEN `recordProgramSource` rejects unknown and disabled acting Identities.
2. RED/GREEN `recordProgramSource` rejects unknown Programs.
3. RED/GREEN `recordProgramSource` rejects callers without effective Program Curator participation.
4. RED/GREEN `recordProgramSource` rejects invalid source kinds, empty titles, and malformed optional fields.
5. RED/GREEN accepted `recordProgramSource` creates one Program-scoped source record.
6. RED/GREEN accepted and rejected source recording emits Corpus events.
7. RED/GREEN `listProgramSources` returns only sources for the requested Program.
8. RED/GREEN source and event summaries satisfy redaction rules.

**Dependencies**: Phase 1.

**Risks**: duplicating Program Membership policy in Corpus code. The implementation must ask the existing effective participation/access contract instead of reading membership internals directly.

**Validation**:

- Targeted Corpus domain tests for source behavior.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 2 source command/query tests pass, full Node gates pass, and local commit `implement agonara corpus source commands` is created.

## Phase 3 — Candidate draft and rejection flow

**Objective**: implement curator-owned candidate creation, candidate listing, candidate rejection, status filtering, and draft isolation from accepted corpus.

**Key work items**:

- Implement `createCorpusCandidate`.
- Implement `listCorpusCandidates`.
- Implement `rejectCorpusCandidate`.
- Validate `CandidateKind`, title, body, rationale, source existence, and source Program ownership.
- Keep `draft` and `rejected` candidates out of accepted corpus reads.
- Emit `corpus_candidate_created` and `corpus_candidate_rejected` events.

**TDD sequence**:

1. RED/GREEN `createCorpusCandidate` rejects callers without effective Program Curator participation.
2. RED/GREEN `createCorpusCandidate` rejects unsupported candidate kinds, empty titles, malformed bodies, and malformed rationales.
3. RED/GREEN `createCorpusCandidate` rejects unknown source ids and cross-Program source ids.
4. RED/GREEN accepted candidate creation creates one `draft` candidate and one accepted event.
5. RED/GREEN `listCorpusCandidates` scopes by Program and honors the optional status filter.
6. RED/GREEN draft candidates do not appear in `listAcceptedCorpus`.
7. RED/GREEN `rejectCorpusCandidate` rejects unknown, accepted, and already rejected candidates.
8. RED/GREEN accepted candidate rejection changes status to `rejected`, creates an event, and remains absent from accepted corpus.

**Dependencies**: Phase 2.

**Risks**: turning candidate records into accepted content too early. The phase must prove candidate creation and rejection do not create accepted corpus entities or revisions.

**Validation**:

- Targeted Corpus domain tests for candidate creation/list/rejection.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 3 candidate tests pass, full Node gates pass, and local commit `implement agonara corpus candidate flow` is created.

## Phase 4 — Candidate acceptance and accepted corpus reads

**Objective**: implement explicit Program Curator acceptance into stable accepted corpus revisions and read-only accepted corpus queries.

**Key work items**:

- Implement `acceptCorpusCandidate`.
- Implement `listAcceptedCorpus`.
- Implement `getAcceptedCorpusRevision`.
- Support accepting into a new accepted corpus entity.
- Support accepting into an existing accepted corpus entity as a new current revision.
- Preserve historical accepted revisions after a new revision becomes current.
- Enforce target entity existence, Program match, and accepted kind match.
- Enforce accepted corpus read access for Student, Program Curator, and Admin.
- Emit `corpus_candidate_accepted` events.

**TDD sequence**:

1. RED/GREEN `acceptCorpusCandidate` rejects unknown, already accepted, and already rejected candidates.
2. RED/GREEN `acceptCorpusCandidate` rejects callers without effective Program Curator participation for the candidate Program.
3. RED/GREEN accepted candidate acceptance changes candidate status to `accepted`.
4. RED/GREEN acceptance without `targetEntityId` creates one accepted corpus entity and one accepted revision.
5. RED/GREEN accepted revisions preserve candidate id, source ids, rationale, accepting Identity id, Program id, accepted kind, title, body, and acceptance time.
6. RED/GREEN accepting another candidate into an existing entity creates a new current revision while the previous revision remains addressable.
7. RED/GREEN target entity errors return `accepted_entity_not_found`, `accepted_entity_program_mismatch`, and `accepted_kind_mismatch`.
8. RED/GREEN accepted corpus reads reject unauthorized callers with `participation_required`.
9. RED/GREEN accepted corpus reads accept effective Student, Program Curator, and Admin callers for the Program.
10. RED/GREEN `listAcceptedCorpus` scopes to Program and honors accepted kind filtering.
11. RED/GREEN `getAcceptedCorpusRevision` resolves access through the revision's Program and returns historical revisions.
12. RED/GREEN accepted corpus reads never expose draft-only or rejected candidate records.

**Dependencies**: Phase 3.

**Risks**: collapsing entity and revision semantics. The implementation must keep accepted corpus entity identity stable while accepted revisions are immutable and independently addressable.

**Validation**:

- Targeted Corpus domain tests for acceptance and accepted corpus reads.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 4 acceptance/read tests pass, full Node gates pass, and local commit `implement agonara corpus acceptance flow` is created.

## Phase 5 — Backup, restore, and integrity coverage

**Objective**: include Corpus records in backup/restore and reject restored data that violates accepted corpus invariants.

**Key work items**:

- Extend backup export with Program source records, Corpus candidates, accepted corpus entities, accepted corpus revisions, and Corpus events.
- Extend restore import for the new records.
- Reject or refuse activation when an accepted corpus entity has no current accepted revision.
- Reject or refuse activation when an accepted corpus revision points to a missing accepted candidate.
- Reject or refuse activation when an accepted corpus revision references a source from another Program.
- Keep active sessions excluded from backup behavior.

**TDD sequence**:

1. RED/GREEN backup includes Program sources, candidates, accepted corpus entities, accepted corpus revisions, and Corpus events.
2. RED/GREEN restore recreates the full accepted source/candidate/revision/event graph.
3. RED/GREEN restore rejects accepted corpus entities without current accepted revisions.
4. RED/GREEN restore rejects accepted revisions pointing to missing candidates.
5. RED/GREEN restore rejects accepted revisions pointing to sources from another Program.
6. RED/GREEN backup/restore keeps sessions excluded and does not create Student Workspace state.

**Dependencies**: Phase 4.

**Risks**: backup/restore can silently bypass domain invariants if it imports rows directly. Restore checks must validate the graph before accepting the restored Corpus state.

**Validation**:

- Targeted backup/restore tests for Corpus records and invariant failures.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 5 backup/restore tests pass, full Node gates pass, and local commit `add agonara corpus backup restore` is created.

## Phase 6 — Corpus event queries and redaction hardening

**Objective**: complete Corpus event query behavior and response redaction across source, candidate, accepted corpus, and event results.

**Key work items**:

- Implement `listCorpusEvents`.
- Ensure Corpus events are Program-scoped domain records.
- Ensure Corpus events are never used as authorization input.
- Add redaction coverage for all new result shapes and rejected/fault paths touched by Corpus behavior.
- Confirm rejected curator commands create rejected Corpus events only when the acting Identity and Program can be resolved.

**TDD sequence**:

1. RED/GREEN `listCorpusEvents` rejects callers without effective Program Curator participation.
2. RED/GREEN `listCorpusEvents` returns only Corpus events for the requested Program.
3. RED/GREEN accepted and rejected curator commands create the expected Corpus events.
4. RED/GREEN Corpus events are not consulted for authorization decisions.
5. RED/GREEN source, candidate, accepted corpus, and event responses do not expose password hashes, plaintext passwords, bootstrap secrets, sessions, CSRF tokens, cookie headers, authorization headers, SQL text, stack traces, or infrastructure details.

**Dependencies**: Phase 5.

**Risks**: event records can be mistaken for audit logs or authorization state. Keep event queries read-only and require live effective participation/access checks.

**Validation**:

- Targeted Corpus domain tests for event query and redaction behavior.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`

**Completion signal**: Phase 6 event/redaction tests pass, full Node gates pass, and local commit `harden agonara corpus events` is created.

## Phase 7 — Executable acceptance and closeout

**Objective**: prove the complete first-slice domain flow, update logs, and archive the implemented plan in the same implementation change set.

**Key work items**:

- Add executable acceptance coverage for Program creation, source recording, candidate creation, candidate acceptance, accepted corpus reads, revision replacement, historical revision lookup, rejection, and Corpus event inspection.
- Prove draft/rejected candidates remain absent from accepted corpus.
- Prove no UI, HTTP route, CLI, material storage, LLM execution, assessment, or Student Workspace behavior was introduced.
- Update `agonara/docs/log.md`.
- Move this plan to `agonara/docs/plans/implemented/corpus-storage-and-curator-acceptance-first-slice.md` with `git mv`.
- Repair relative links after the archive move.

**TDD sequence**:

1. RED/GREEN executable acceptance flow from source record to accepted current revision.
2. RED/GREEN executable acceptance flow for accepting a later candidate into an existing entity while preserving historical revision lookup.
3. RED/GREEN closeout guard checks for draft/rejected candidate isolation and out-of-scope surface absence.
4. RED/GREEN docs closeout: log updated and archived plan links resolve from `implemented/`.

**Dependencies**: Phase 6.

**Risks**: duplicating focused tests in acceptance. Keep acceptance broad and behavioral; detailed edge cases stay in the phase tests.

**Validation**:

- Targeted executable acceptance test for Corpus flow.
- Docs structure/link checks for touched Markdown.
- `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`
- `./scripts/run_silent.sh "tests" npm test`
- `./scripts/run_silent.sh "build" npx tsc --noEmit`
- `git status --short` clean after final commit.

**Completion signal**: Phase 7 acceptance/docs checks pass, full Node gates pass, plan is archived under `implemented/`, and local commit `complete agonara corpus acceptance slice` is created.

## Done criteria

- The domain interface implements every command and query in [Corpus Storage and Curator Acceptance First Slice](../specs/corpus-storage-and-curator-acceptance-first-slice.md).
- Program source records, Corpus candidates, accepted corpus entities, accepted corpus revisions, and Corpus events are persisted.
- Curator commands and curator-only queries require effective Program Curator participation.
- Accepted corpus reads require effective Student participation, effective Program Curator participation, or effective Admin authority for the Program.
- Draft and rejected candidates never appear as accepted corpus.
- Candidate acceptance creates immutable accepted revisions with source/candidate/rationale/actor provenance.
- Accepting into an existing entity creates a new current revision while historical revisions remain addressable.
- Backup/restore includes all new Corpus records and rejects invalid accepted corpus graphs.
- Responses and faults satisfy redaction rules for secrets, sessions, credentials, SQL text, stack traces, and infrastructure details.
- Every required test in the spec is covered by focused domain tests or executable acceptance coverage.
- Each implementation phase has a separate local commit created only after its targeted tests, Agonara workspace tests, repo tests, and typecheck pass.
- Final branch state is clean after closeout.
- No HTTP routes, CLI commands, UI, material file storage, accepted checks, accepted assessment criteria, LLM prompt execution, source reliability scoring, student attempts, assessment feedback, progress state, collaborative editing, branching, merge, or conflict-resolution behavior is introduced.

## Final closeout

Final gates: `./scripts/run_silent.sh "agonara tests" npm test --workspace agonara`, `./scripts/run_silent.sh "tests" npm test`, `./scripts/run_silent.sh "build" npx tsc --noEmit`, docs structure/link checks for touched Markdown, and `git status --short` clean.
Archive plan: move to `agonara/docs/plans/implemented/corpus-storage-and-curator-acceptance-first-slice.md`.
Commit archive move: yes.
Push/PR: follow push policy; do not push unless explicitly requested later.
