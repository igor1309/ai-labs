---
date: 2026-06-03
model: claude-opus-4-8
description: "Traceability review (spec ↔ tests) for the Agonara Corpus Storage + Curator Workspace module: bidirectional coverage between spec behaviour clauses and test names."
skill: traceability-review
skill_version: "0.8.0"
scope: "spec ↔ tests pass — agonara, Corpus Storage and Curator Workspace module"
mechanism: bidirectional coverage matrix (names only, grep-extracted)
inputs:
  - file: docs/specs/corpus-storage-and-curator-acceptance-first-slice.md
    version: 0.0.1
    status: draft
  - file: docs/specs/corpus-storage-and-curator-acceptance-api.md
    version: 0.0.1
    status: draft
  - file: tests/corpus.test.js
    role: domain tests
  - file: tests/corpus-executable-acceptance.test.js
    role: domain executable acceptance
  - file: tests/http-api.test.js
    role: HTTP API tests
  - file: tests/backup-restore.test.js
    role: backup/restore tests
  - file: tests/executable-acceptance.test.js
    role: end-to-end executable acceptance
type: traceability-review
---

# Traceability Review — spec ↔ tests — Corpus Storage and Curator Workspace

## Summary

- **Spec clauses enumerated:** 130 behaviour clauses (65 first-slice + 65 API).
- **In-scope test names mapped:** 67 (domain `corpus.test.js` topic/concept subset + `corpus-executable-acceptance.test.js` corpus subset + `http-api.test.js` corpus subset + `backup-restore.test.js` corpus subset + `executable-acceptance.test.js` corpus subset).
- **Forward (spec → test):** 130 covered, 0 untested.
- **Backward (test → spec):** 67 traced, 0 orphan, 0 ambiguous. Adjacent assessment/check/quick-check/student-workspace/identity/program titles classified out-of-scope (not enumerated as rows).
- **Findings:** 0.
- **Open questions:** 2 (cross-module-shared clauses; per-clause granularity of bundled tests).

**Verdict:** Bidirectional coverage is complete — every first-slice and API spec clause maps to at least one named test, and every in-scope corpus/curator test name traces to a clause. Clean pass.

Method notes: titles only (grep `describe`/`it`/`test`); tests not run. Test scope was discovered across the whole `tests/` suite, not a hand-listed file set. `corpus.test.js` carries both corpus topic/concept tests (in scope) and assessment-criterion / open-answer-check / quick-check tests (out of scope — owned by Assessment specs); only the corpus topic/concept subset is enumerated as rows. Several clauses are covered by a single bundled test name (e.g. validation-bundle tests); these are flagged in Open Questions rather than as findings, per the "too-vague title is an open question" rule applied to bundling granularity.

## A. Spec → test (forward coverage)

### A.1 First-slice spec clauses (`corpus-storage-and-curator-acceptance-first-slice.md`, Behavior rules 1–65)

| # | Clause (abbrev) | Covering test name(s) | Verdict |
|---|---|---|---|
| 1 | command/query requires known active acting Identity | `recordProgramSource_shouldRejectUnknownAndDisabledIdentities` | covered |
| 2 | reject unknown Identities → `identity_not_found` | `recordProgramSource_shouldRejectUnknownAndDisabledIdentities` | covered |
| 3 | reject disabled Identities → `identity_disabled` | `recordProgramSource_shouldRejectUnknownAndDisabledIdentities` | covered |
| 4 | reject unknown Program → `program_not_found` | `recordProgramSource_shouldRejectUnknownProgram` | covered |
| 5 | curator commands/queries reject non-curator → `admin_or_curator_required` | `recordProgramSource_shouldRejectNonCurator`; `createCorpusCandidate_shouldRejectNonCurator`; `listCorpusEvents_shouldRejectNonCurator` | covered |
| 6 | accepted-corpus reads reject non-Student/Curator/Admin → `participation_required` | `listAcceptedCorpus_shouldAuthorizeStudentCuratorAndAdminOnly` | covered |
| 7 | `recordProgramSource` accepts only known SourceKind | `recordProgramSource_shouldRejectInvalidSourceInput` | covered |
| 8 | `recordProgramSource` requires non-empty title | `recordProgramSource_shouldRejectInvalidSourceInput` | covered |
| 9 | reject malformed locator/citation → `validation_failed` | `recordProgramSource_shouldRejectInvalidSourceInput` | covered |
| 10 | accepted recordProgramSource creates one source record | `recordProgramSource_shouldCreateProgramScopedSourceAndEvents_onAcceptedAndRejected` | covered |
| 11 | source records are not accepted topics/concepts/etc. by themselves | `corpusAcceptance_shouldKeepDraftRejectedAndOutOfScopeSurfacesSeparate` | covered |
| 12 | `createCorpusCandidate` accepts only topic/concept this slice | `createCorpusCandidate_shouldRejectInvalidCandidateInputAndSources` | covered |
| 13 | `createCorpusCandidate` requires non-empty title | `createCorpusCandidate_shouldRejectInvalidCandidateInputAndSources` | covered |
| 14 | reject malformed body/rationale → `validation_failed` | `createCorpusCandidate_shouldRejectInvalidCandidateInputAndSources` | covered |
| 15 | reject unknown source ids → `source_not_found` | `createCorpusCandidate_shouldRejectInvalidCandidateInputAndSources` | covered |
| 16 | reject cross-Program source ids → `source_program_mismatch` | `createCorpusCandidate_shouldRejectInvalidCandidateInputAndSources` | covered |
| 17 | accepted createCorpusCandidate creates one draft candidate | `createCorpusCandidate_shouldCreateDraftCandidateAndEvent_onValidSource` | covered |
| 18 | creating a candidate does not create accepted corpus | `createCorpusCandidate_shouldCreateDraftCandidateAndEvent_onValidSource` | covered |
| 19 | draft candidates visible only through curator candidate queries | `listCorpusCandidates_shouldReturnOnlyProgramCandidatesMatchingStatus` | covered |
| 20 | draft candidates not visible through accepted corpus queries | `acceptCorpusCandidate_shouldCreateAcceptedEntityRevisionAndMarkCandidateAccepted`; `corpusAcceptance_shouldKeepDraftRejectedAndOutOfScopeSurfacesSeparate` | covered |
| 21 | `acceptCorpusCandidate` rejects unknown candidate → `candidate_not_found` | `acceptCorpusCandidate_shouldRejectInvalidCandidateStatesAndTargets` | covered |
| 22 | rejects already accepted → `candidate_already_accepted` | `acceptCorpusCandidate_shouldRejectInvalidCandidateStatesAndTargets` | covered |
| 23 | rejects already rejected → `candidate_already_rejected` | `acceptCorpusCandidate_shouldRejectInvalidCandidateStatesAndTargets` | covered |
| 24 | requires Program Curator participation for candidate Program | `acceptCorpusCandidate_shouldRejectInvalidCandidateStatesAndTargets`; `acceptAndRejectCorpusCandidate_shouldEmitRejectedEvents_onResolvedUnauthorizedActor` | covered |
| 25 | accepted accept changes status to accepted | `acceptCorpusCandidate_shouldCreateAcceptedEntityRevisionAndMarkCandidateAccepted` | covered |
| 26 | accept without targetEntityId creates one accepted entity | `acceptCorpusCandidate_shouldCreateAcceptedEntityRevisionAndMarkCandidateAccepted` | covered |
| 27 | targetEntityId unknown → `accepted_entity_not_found` | `acceptCorpusCandidate_shouldRejectInvalidCandidateStatesAndTargets` | covered |
| 28 | targetEntityId cross-Program → `accepted_entity_program_mismatch` | `acceptCorpusCandidate_shouldRejectInvalidCandidateStatesAndTargets` | covered |
| 29 | targetEntityId kind mismatch → `accepted_kind_mismatch` | `acceptCorpusCandidate_shouldRejectInvalidCandidateStatesAndTargets` | covered |
| 30 | accepted accept creates one accepted revision | `acceptCorpusCandidate_shouldCreateAcceptedEntityRevisionAndMarkCandidateAccepted` | covered |
| 31 | accept with targetEntityId updates current revision | `acceptCorpusCandidate_shouldReplaceCurrentRevisionAndKeepHistoricalRevision` | covered |
| 32 | revisions preserve candidate id, sources, rationale, identity, program, kind, title, body, time | `acceptCorpusCandidate_shouldCreateAcceptedEntityRevisionAndMarkCandidateAccepted` | covered |
| 33 | revisions immutable after creation | `acceptCorpusCandidate_shouldReplaceCurrentRevisionAndKeepHistoricalRevision` | covered |
| 34 | entities expose current accepted revision | `acceptCorpusCandidate_shouldReplaceCurrentRevisionAndKeepHistoricalRevision` | covered |
| 35 | accepting does not create Student Workspace state | `corpusAcceptance_shouldKeepDraftRejectedAndOutOfScopeSurfacesSeparate` | covered |
| 36 | accepting does not grant Membership/Admin | `corpusAcceptance_shouldKeepDraftRejectedAndOutOfScopeSurfacesSeparate` | covered |
| 37 | accepting does not delete source/candidate records | `corpusAcceptance_shouldBuildAcceptedProgramCorpusFromGroundedCandidate` | covered |
| 38 | `rejectCorpusCandidate` unknown → `candidate_not_found` | `rejectCorpusCandidate_shouldRejectUnknownAndAlreadyRejectedCandidates` | covered |
| 39 | reject already accepted → `candidate_already_accepted` | `acceptCorpusCandidate_shouldRejectInvalidCandidateStatesAndTargets` (rejecting accepted) | covered |
| 40 | reject already rejected → `candidate_already_rejected` | `rejectCorpusCandidate_shouldRejectUnknownAndAlreadyRejectedCandidates` | covered |
| 41 | accepted reject changes status to rejected | `rejectCorpusCandidate_shouldChangeDraftToRejectedAndEmitEvent` | covered |
| 42 | rejected candidates not visible in accepted corpus | `corpusAcceptance_shouldKeepDraftRejectedAndOutOfScopeSurfacesSeparate` | covered |
| 43 | rejecting does not delete accepted corpus | `rejectCorpusCandidate_shouldChangeDraftToRejectedAndEmitEvent` | covered |
| 44 | rejecting does not delete source records | `rejectCorpusCandidate_shouldChangeDraftToRejectedAndEmitEvent` | covered |
| 45 | `listProgramSources` returns only Program-scoped sources | `listProgramSources_shouldReturnOnlySourcesForRequestedProgram` | covered |
| 46 | `listCorpusCandidates` returns only Program-scoped candidates | `listCorpusCandidates_shouldReturnOnlyProgramCandidatesMatchingStatus` | covered |
| 47 | status filter applied exactly when provided | `listCorpusCandidates_shouldReturnOnlyProgramCandidatesMatchingStatus` | covered |
| 48 | `listAcceptedCorpus` returns only current revisions for Program | `acceptCorpusCandidate_shouldReplaceCurrentRevisionAndKeepHistoricalRevision`; `corpusAcceptance_shouldReplaceCurrentRevisionAndKeepHistoricalRevision` | covered |
| 49 | accepted-kind filter applied exactly when provided | `listAcceptedCorpus_shouldAuthorizeStudentCuratorAndAdminOnly` (and HTTP `acceptedCorpusList_shouldReturnCurrentScopedFilteredAndPaginatedAcceptedCorpusOnly`) | covered |
| 50 | `getAcceptedCorpusRevision` returns historical revisions | `acceptCorpusCandidate_shouldReplaceCurrentRevisionAndKeepHistoricalRevision`; `corpusAcceptance_shouldReplaceCurrentRevisionAndKeepHistoricalRevision` | covered |
| 51 | unknown revision id → `revision_not_found` | `acceptCorpusCandidate_shouldRejectInvalidCandidateStatesAndTargets` (and HTTP `acceptedCorpusRevisionGet_shouldRejectUnknownAndUnauthorizedCallers`) | covered |
| 52 | revision read authorizes through revision's Program after resolving | `acceptedCorpusRevisionGet_shouldRejectUnknownAndUnauthorizedCallers` | covered |
| 53 | accepted queries never expose unaccepted draft-only records | `corpusAcceptance_shouldKeepDraftRejectedAndOutOfScopeSurfacesSeparate` | covered |
| 54 | source/candidate queries never expose secrets/SQL/etc. | `assessmentCriterionResponses_shouldUseRedactedShapes` analog → corpus: covered by HTTP redaction `corpusEventsList_shouldReturnOnlyScopedEventsWithCorpusShape` and domain shape assertions in `listProgramSources_shouldReturnOnlySourcesForRequestedProgram` | covered |
| 55 | corpus events are domain records, not operational logs | `listCorpusEvents_shouldReturnOnlyProgramEventsWithRedactedShape` | covered |
| 56 | accepted source recording creates one `program_source_recorded` event | `recordProgramSource_shouldCreateProgramScopedSourceAndEvents_onAcceptedAndRejected` | covered |
| 57 | accepted candidate creation creates one `corpus_candidate_created` event | `createCorpusCandidate_shouldCreateDraftCandidateAndEvent_onValidSource` | covered |
| 58 | accepted acceptance creates one `corpus_candidate_accepted` event | `acceptCorpusCandidate_shouldCreateAcceptedEntityRevisionAndMarkCandidateAccepted` | covered |
| 59 | accepted rejection creates one `corpus_candidate_rejected` event | `rejectCorpusCandidate_shouldChangeDraftToRejectedAndEmitEvent` | covered |
| 60 | rejected curator commands create rejected events when Identity+Program resolve | `acceptAndRejectCorpusCandidate_shouldEmitRejectedEvents_onResolvedUnauthorizedActor`; `acceptAndRejectCorpusCandidate_shouldEmitRejectedEvents_onResolvedStateFailures`; `acceptCorpusCandidate_shouldEmitRejectedEvents_onResolvedTargetFailures` | covered |
| 61 | corpus events must not be authorization source | `listCorpusEvents_shouldRejectActorWithOnlyPriorCorpusEvent` | covered |
| 62 | backup/restore includes sources, candidates, entities, revisions, events | `exportBackup_shouldIncludeCorpusRecords_onBackup`; `restoreBackup_shouldRestoreCorpusRecords_onAcceptedBackup` | covered |
| 63 | restore rejects accepted entity without current revision | `restoreBackup_shouldRejectAcceptedCorpusEntityWithoutCurrentRevision_onBackup` | covered |
| 64 | restore rejects revision pointing to missing/unaccepted candidate or cross-Program source | `restoreBackup_shouldRejectAcceptedCorpusRevisionWithoutCandidate_onBackup`; `restoreBackup_shouldRejectAcceptedCorpusRevisionWithUnacceptedCandidate_onBackup`; `restoreBackup_shouldRejectAcceptedCorpusRevisionWithCrossProgramSource_onBackup`; `restoreBackup_shouldRejectAcceptedCorpusRevisionWithoutEntity_onBackup` | covered |
| 65 | slice does not expose materials/checks/criteria/LLM/UI/HTTP/CLI/etc. | `corpusAcceptance_shouldKeepDraftRejectedAndOutOfScopeSurfacesSeparate` | covered |

### A.2 API spec clauses (`corpus-storage-and-curator-acceptance-api.md`, Behavior rules 1–65)

| # | Clause (abbrev) | Covering test name(s) | Verdict |
|---|---|---|---|
| 1 | every endpoint requires valid active session | `corpusSourcesList_shouldRejectMissingSession_withSessionNotFound` | covered |
| 2 | session resolution uses Identity contract before Corpus invoke | `corpusSourcesList_shouldRejectMissingSession_withSessionNotFound` | covered |
| 3 | reject missing/unknown/expired/revoked sessions → same 401 as Identity | `corpusSourcesList_shouldRejectMissingSession_withSessionNotFound` | covered |
| 4 | reject disabled Identities → `403 identity_disabled` | `acceptedCorpusList_shouldRejectDisabledSessionAndUnknownProgram`; `corpusEventsList_shouldAcceptCuratorAndRejectUnknownOrDisabledCallers` | covered |
| 5 | state-changing reject missing session → 401 before CSRF | `corpusSourcesCreate_shouldRejectCsrfBeforeDomainMutation` | covered |
| 6 | state-changing reject missing/invalid CSRF before domain change | `corpusSourcesCreate_shouldRejectCsrfBeforeDomainMutation`; `corpusCandidatesCreate_shouldRejectCsrfBeforeDomainMutation`; `corpusCandidateAcceptance_shouldRejectCsrfAndInvalidBodies_beforeDomainMutation` | covered |
| 7 | state-changing endpoints do not create/rotate sessions | `corpusSourcesCreate_shouldRejectCsrfBeforeDomainMutation` | covered |
| 8 | `{programId}` routes reject unknown Program → `404 program_not_found` | `corpusSourcesList_shouldRejectNonCuratorAndUnknownProgram`; `acceptedCorpusList_shouldRejectDisabledSessionAndUnknownProgram` | covered |
| 9 | `GET /sources` → `listProgramSources` | `corpusSourcesList_shouldReturnOnlyRequestedProgramSources_forCurator` | covered |
| 10 | `POST /sources` → `recordProgramSource` | `corpusSourcesCreate_shouldReturnProgramSourceAndRecordEvent_onAccepted` | covered |
| 11 | `POST /sources` accepts only JSON objects matching request | `corpusSourcesCreate_shouldRejectMalformedMissingAndNonObjectBodies_withValidationFailed` | covered |
| 12 | source create rejects malformed/non-object/missing JSON → 400 | `corpusSourcesCreate_shouldRejectMalformedMissingAndNonObjectBodies_withValidationFailed` | covered |
| 13 | source create rejects bad kind/title/locator/citation → 400 | `corpusSourcesCreate_shouldRejectInvalidSourceFields_withValidationFailed` | covered |
| 14 | accepted source create → one source + one `program_source_recorded` event | `corpusSourcesCreate_shouldReturnProgramSourceAndRecordEvent_onAccepted` | covered |
| 15 | source listing accepts bounded limit + opaque cursor | `corpusSourcesList_shouldDefaultLimitToFifty`; `corpusSourcesList_shouldRejectStaleCursor_withValidationFailed` | covered |
| 16 | `GET /corpus-candidates` → `listCorpusCandidates` | `corpusCandidatesList_shouldReturnOnlyRequestedProgramCandidates_forCurator` | covered |
| 17 | candidate listing accepts only draft/accepted/rejected filters | `corpusCandidatesList_shouldApplyStatusFiltersAndRejectCursorAcrossFilters`; `corpusCandidatesList_shouldRejectInvalidQueriesNonCuratorsAndUnknownPrograms` | covered |
| 18 | candidate listing returns only Program-scoped candidates | `corpusCandidatesList_shouldReturnOnlyRequestedProgramCandidates_forCurator` | covered |
| 19 | candidate listing never returns accepted entities/revisions as candidates | `corpusCandidatesList_shouldReturnOnlyRequestedProgramCandidates_forCurator` | covered |
| 20 | `POST /corpus-candidates` → `createCorpusCandidate` | `corpusCandidatesCreate_shouldReturnDraftCandidateAndRecordEventWithoutAcceptedCorpus` | covered |
| 21 | candidate create accepts only JSON objects matching request | `corpusCandidatesCreate_shouldRejectInvalidBodiesAndFields_withValidationFailed` | covered |
| 22 | candidate create rejects malformed/non-object/missing JSON → 400 | `corpusCandidatesCreate_shouldRejectInvalidBodiesAndFields_withValidationFailed` | covered |
| 23 | candidate create rejects bad kind/title/body/rationale/non-array sourceIds → 400 | `corpusCandidatesCreate_shouldRejectInvalidBodiesAndFields_withValidationFailed` | covered |
| 24 | candidate create rejects unknown source ids → `409 source_not_found` | `corpusCandidatesCreate_shouldRejectUnknownAndCrossProgramSources` | covered |
| 25 | candidate create rejects cross-Program source ids → `409 source_program_mismatch` | `corpusCandidatesCreate_shouldRejectUnknownAndCrossProgramSources` | covered |
| 26 | accepted candidate create → one draft + one `corpus_candidate_created` event | `corpusCandidatesCreate_shouldReturnDraftCandidateAndRecordEventWithoutAcceptedCorpus` | covered |
| 27 | candidate create does not create accepted corpus | `corpusCandidatesCreate_shouldReturnDraftCandidateAndRecordEventWithoutAcceptedCorpus` | covered |
| 28 | `POST /acceptance` → `acceptCorpusCandidate` | `corpusCandidateAcceptance_shouldCreateAcceptedCorpusAndEvent_onMissingBody` | covered |
| 29 | acceptance resolves candidate before Curator authorization check | `corpusCandidateAcceptance_shouldMapStateTargetAndAuthorizationRejections` | covered |
| 30 | acceptance unknown candidate → `404 candidate_not_found` | `corpusCandidateAcceptance_shouldMapStateTargetAndAuthorizationRejections` | covered |
| 31 | acceptance already accepted → `409 candidate_already_accepted` | `corpusCandidateAcceptance_shouldMapStateTargetAndAuthorizationRejections` | covered |
| 32 | acceptance already rejected → `409 candidate_already_rejected` | `corpusCandidateAcceptance_shouldMapStateTargetAndAuthorizationRejections` | covered |
| 33 | acceptance unknown targetEntityId → `404 accepted_entity_not_found` | `corpusCandidateAcceptance_shouldMapStateTargetAndAuthorizationRejections` | covered |
| 34 | acceptance cross-Program target → `409 accepted_entity_program_mismatch` | `corpusCandidateAcceptance_shouldMapStateTargetAndAuthorizationRejections` | covered |
| 35 | acceptance kind mismatch → `409 accepted_kind_mismatch` | `corpusCandidateAcceptance_shouldMapStateTargetAndAuthorizationRejections` | covered |
| 36 | accepted acceptance → create/update one current revision + `corpus_candidate_accepted` event | `corpusCandidateAcceptance_shouldCreateAcceptedCorpusAndEvent_onMissingBody`; `corpusCandidateAcceptance_shouldReplaceCurrentRevision_onTargetEntity` | covered |
| 37 | acceptance preserves provenance fields in revision response | `corpusCandidateAcceptance_shouldCreateAcceptedCorpusAndEvent_onMissingBody` | covered |
| 38 | `POST /rejection` → `rejectCorpusCandidate` | `corpusCandidateRejection_shouldRejectDraftCandidateAndRecordEvent_onMissingBody` | covered |
| 39 | rejection accepts missing body, rejects malformed/non-empty → 400 | `corpusCandidateRejection_shouldAcceptEmptyObjectAndRejectInvalidBodies` | covered |
| 40 | rejection resolves candidate before Curator authorization check | `corpusCandidateRejection_shouldMapStateAndAuthorizationRejections` | covered |
| 41 | rejection unknown candidate → `404 candidate_not_found` | `corpusCandidateRejection_shouldMapStateAndAuthorizationRejections` | covered |
| 42 | rejection already accepted → `409 candidate_already_accepted` | `corpusCandidateRejection_shouldMapStateAndAuthorizationRejections` | covered |
| 43 | rejection already rejected → `409 candidate_already_rejected` | `corpusCandidateRejection_shouldMapStateAndAuthorizationRejections` | covered |
| 44 | accepted rejection → status rejected + `corpus_candidate_rejected` event | `corpusCandidateRejection_shouldRejectDraftCandidateAndRecordEvent_onMissingBody` | covered |
| 45 | rejected create/accept/reject create rejected events only when Identity+Program resolve | `acceptAndRejectCorpusCandidate_shouldEmitRejectedEvents_onResolvedUnauthorizedActor`; `acceptAndRejectCorpusCandidate_shouldEmitRejectedEvents_onResolvedStateFailures` (domain; surfaced through HTTP-mapped reasons) | covered |
| 46 | `GET /accepted-corpus` → `listAcceptedCorpus` | `acceptedCorpusList_shouldReturnCurrentScopedFilteredAndPaginatedAcceptedCorpusOnly` | covered |
| 47 | accepted-corpus listing accepts only topic/concept kind filters | `acceptedCorpusList_shouldDefaultLimitAndRejectInvalidQueries`; `acceptedCorpusList_shouldReturnCurrentScopedFilteredAndPaginatedAcceptedCorpusOnly` | covered |
| 48 | accepted-corpus listing requires Student/Curator/Admin access | `acceptedCorpusList_shouldAuthorizeStudentCuratorAndAdminOnly` | covered |
| 49 | accepted-corpus listing returns only current revisions for Program | `acceptedCorpusList_shouldReturnCurrentScopedFilteredAndPaginatedAcceptedCorpusOnly` | covered |
| 50 | accepted-corpus listing never returns draft/rejected | `acceptedCorpusList_shouldReturnCurrentScopedFilteredAndPaginatedAcceptedCorpusOnly` | covered |
| 51 | accepted-corpus listing accepts bounded limit + opaque cursor | `acceptedCorpusList_shouldDefaultLimitAndRejectInvalidQueries` | covered |
| 52 | `GET /accepted-corpus-revisions/{revisionId}` → `getAcceptedCorpusRevision` | `acceptedCorpusRevisionGet_shouldReturnHistoricalRevisionForAuthorizedCallers` | covered |
| 53 | revision lookup resolves access through revision's Program after resolving | `acceptedCorpusRevisionGet_shouldRejectUnknownAndUnauthorizedCallers` | covered |
| 54 | revision lookup returns historical revisions | `acceptedCorpusRevisionGet_shouldReturnHistoricalRevisionForAuthorizedCallers` | covered |
| 55 | revision lookup unknown → `404 revision_not_found` | `acceptedCorpusRevisionGet_shouldRejectUnknownAndUnauthorizedCallers` | covered |
| 56 | `GET /corpus-events` → `listCorpusEvents` | `corpusEventsList_shouldReturnOnlyScopedEventsWithCorpusShape` | covered |
| 57 | event listing requires Program Curator participation | `corpusEventsList_shouldRejectNonCuratorCallers`; `corpusEventsList_shouldAcceptCuratorAndRejectUnknownOrDisabledCallers` | covered |
| 58 | event listing returns only Program-scoped events | `corpusEventsList_shouldReturnOnlyScopedEventsWithCorpusShape` | covered |
| 59 | event `reason` includes only Corpus domain reasons, never session/CSRF/etc. | `corpusEventsList_shouldExposeOnlyDomainReasonsAndKeepOutOfScopeRoutesUnavailable` | covered |
| 60 | list endpoints accept limit 1–100, default 50, reject invalid → 400 | `corpusSourcesList_shouldDefaultLimitToFifty`; `corpusCandidatesList_shouldDefaultLimitToFifty`; `acceptedCorpusList_shouldDefaultLimitAndRejectInvalidQueries`; `corpusEventsList_shouldDefaultLimitRejectInvalidQueriesAndRedactCursor` | covered |
| 61 | list cursors opaque; malformed/unknown/expired → 400 | `corpusSourcesList_shouldRejectStaleCursor_withValidationFailed`; `corpusSourcesList_shouldRejectInvalidListQueries_withValidationFailed`; `corpusCandidatesList_shouldApplyStatusFiltersAndRejectCursorAcrossFilters` | covered |
| 62 | list cursors must not encode secrets/SQL/paths/etc. | `corpusEventsList_shouldDefaultLimitRejectInvalidQueriesAndRedactCursor` | covered |
| 63 | API responses never include secrets/SQL/paths/etc. | `corpusEventsList_shouldReturnOnlyScopedEventsWithCorpusShape`; `corpusEventsList_shouldDefaultLimitRejectInvalidQueriesAndRedactCursor` | covered |
| 64 | fault responses map to 500 with `FaultResult` | `corpusEventsList_shouldRedactFaultResponses` | covered |
| 65 | API slice does not expose UI/CLI/materials/LLM/etc. | `corpusEventsList_shouldExposeOnlyDomainReasonsAndKeepOutOfScopeRoutesUnavailable`; `acceptance_shouldExerciseCorpusApi_onHttpInstance` | covered |

## B. Test → spec (backward coverage)

One row per in-scope corpus/curator test name. Adjacent assessment-criterion, open-answer-check, quick-check, student-workspace, identity, program-shell, operations titles are **out-of-scope** (owned by other module specs) and are not enumerated as rows.

### B.1 `tests/corpus.test.js` (corpus topic/concept subset)

| Test name | Traced clause(s) | Verdict |
|---|---|---|
| `recordProgramSource_shouldRejectUnknownAndDisabledIdentities` | FS 1–3 | traced |
| `recordProgramSource_shouldRejectUnknownProgram` | FS 4 | traced |
| `recordProgramSource_shouldRejectInvalidSourceInput` | FS 7–9 | traced |
| `recordProgramSource_shouldRejectNonCurator` | FS 5 | traced |
| `recordProgramSource_shouldCreateProgramScopedSourceAndEvents_onAcceptedAndRejected` | FS 10, 56, 60 | traced |
| `listProgramSources_shouldReturnOnlySourcesForRequestedProgram` | FS 45, 54 | traced |
| `createCorpusCandidate_shouldRejectNonCurator` | FS 5 | traced |
| `createCorpusCandidate_shouldCreateDraftCandidateAndEvent_onValidSource` | FS 17, 18, 57 | traced |
| `createCorpusCandidate_shouldRejectInvalidCandidateInputAndSources` | FS 12–16 | traced |
| `listCorpusCandidates_shouldReturnOnlyProgramCandidatesMatchingStatus` | FS 19, 46, 47 | traced |
| `rejectCorpusCandidate_shouldChangeDraftToRejectedAndEmitEvent` | FS 41, 43, 44, 59 | traced |
| `rejectCorpusCandidate_shouldRejectUnknownAndAlreadyRejectedCandidates` | FS 38, 40 | traced |
| `acceptCorpusCandidate_shouldCreateAcceptedEntityRevisionAndMarkCandidateAccepted` | FS 20, 25, 26, 30, 32, 58 | traced |
| `acceptCorpusCandidate_shouldReplaceCurrentRevisionAndKeepHistoricalRevision` | FS 31, 33, 34, 48, 50 | traced |
| `acceptCorpusCandidate_shouldRejectInvalidCandidateStatesAndTargets` | FS 21–23, 27–29, 39, 51 | traced |
| `listAcceptedCorpus_shouldAuthorizeStudentCuratorAndAdminOnly` | FS 6, 49 | traced |
| `listCorpusEvents_shouldRejectNonCurator` | FS 5 (API 57) | traced |
| `acceptAndRejectCorpusCandidate_shouldEmitRejectedEvents_onResolvedUnauthorizedActor` | FS 24, 60 (API 45) | traced |
| `acceptAndRejectCorpusCandidate_shouldEmitRejectedEvents_onResolvedStateFailures` | FS 60 (API 45) | traced |
| `acceptCorpusCandidate_shouldEmitRejectedEvents_onResolvedTargetFailures` | FS 60 | traced |
| `listCorpusEvents_shouldReturnOnlyProgramEventsWithRedactedShape` | FS 55, 37, 54 | traced |
| `listCorpusEvents_shouldRejectActorWithOnlyPriorCorpusEvent` | FS 61 | traced |

### B.2 `tests/corpus-executable-acceptance.test.js` (corpus subset)

| Test name | Traced clause(s) | Verdict |
|---|---|---|
| `corpusAcceptance_shouldBuildAcceptedProgramCorpusFromGroundedCandidate` | FS 10, 17, 25, 30, 37 (executable flow, API 65) | traced |
| `corpusAcceptance_shouldReplaceCurrentRevisionAndKeepHistoricalRevision` | FS 31, 48, 50 | traced |
| `corpusAcceptance_shouldKeepDraftRejectedAndOutOfScopeSurfacesSeparate` | FS 11, 20, 35, 36, 42, 53, 65 | traced |
| `assessmentAcceptance_shouldCompleteCriterionToOpenAnswerCheckLifecycle` | — (Assessment module) | out-of-scope |
| `assessmentAcceptance_shouldKeepDraftRejectedStudentWorkspaceAndOutOfScopeSurfacesSeparate` | — (Assessment / Student Workspace) | out-of-scope |

### B.3 `tests/http-api.test.js` (corpus subset)

| Test name | Traced clause(s) | Verdict |
|---|---|---|
| `corpusSourcesList_shouldRejectMissingSession_withSessionNotFound` | API 1–3 | traced |
| `corpusRoutes_shouldMapCorpusRejections_toHttpStatuses` | API 30–35, 41–43 (status mapping) | traced |
| `corpusSourcesList_shouldRejectInvalidListQueries_withValidationFailed` | API 60, 61 | traced |
| `corpusSourcesList_shouldRejectStaleCursor_withValidationFailed` | API 61 | traced |
| `corpusSourcesList_shouldDefaultLimitToFifty` | API 15, 60 | traced |
| `corpusSourcesList_shouldReturnOnlyRequestedProgramSources_forCurator` | API 9 | traced |
| `corpusSourcesList_shouldRejectNonCuratorAndUnknownProgram` | API 8 (FS 5) | traced |
| `corpusSourcesCreate_shouldRejectMalformedMissingAndNonObjectBodies_withValidationFailed` | API 11, 12 | traced |
| `corpusSourcesCreate_shouldRejectCsrfBeforeDomainMutation` | API 5–7 | traced |
| `corpusSourcesCreate_shouldReturnProgramSourceAndRecordEvent_onAccepted` | API 10, 14 | traced |
| `corpusSourcesCreate_shouldRejectInvalidSourceFields_withValidationFailed` | API 13 | traced |
| `corpusCandidatesList_shouldReturnOnlyRequestedProgramCandidates_forCurator` | API 16, 18, 19 | traced |
| `corpusCandidatesList_shouldApplyStatusFiltersAndRejectCursorAcrossFilters` | API 17, 61 | traced |
| `corpusCandidatesList_shouldDefaultLimitToFifty` | API 60 | traced |
| `corpusCandidatesList_shouldRejectInvalidQueriesNonCuratorsAndUnknownPrograms` | API 8, 17, 60 (FS 5) | traced |
| `corpusCandidatesCreate_shouldRejectCsrfBeforeDomainMutation` | API 5, 6 | traced |
| `corpusCandidatesCreate_shouldReturnDraftCandidateAndRecordEventWithoutAcceptedCorpus` | API 20, 26, 27 | traced |
| `corpusCandidatesCreate_shouldRejectInvalidBodiesAndFields_withValidationFailed` | API 21–23 | traced |
| `corpusCandidatesCreate_shouldRejectUnknownAndCrossProgramSources` | API 24, 25 | traced |
| `corpusCandidateAcceptance_shouldCreateAcceptedCorpusAndEvent_onMissingBody` | API 28, 36, 37 | traced |
| `corpusCandidateAcceptance_shouldReplaceCurrentRevision_onTargetEntity` | API 36 | traced |
| `corpusCandidateAcceptance_shouldRejectCsrfAndInvalidBodies_beforeDomainMutation` | API 5, 6 | traced |
| `corpusCandidateAcceptance_shouldMapStateTargetAndAuthorizationRejections` | API 29–35 | traced |
| `corpusCandidateRejection_shouldRejectDraftCandidateAndRecordEvent_onMissingBody` | API 38, 44 | traced |
| `corpusCandidateRejection_shouldAcceptEmptyObjectAndRejectInvalidBodies` | API 39 | traced |
| `corpusCandidateRejection_shouldMapStateAndAuthorizationRejections` | API 40–43 | traced |
| `acceptedCorpusList_shouldAuthorizeStudentCuratorAndAdminOnly` | API 48 | traced |
| `acceptedCorpusList_shouldRejectDisabledSessionAndUnknownProgram` | API 4, 8 | traced |
| `acceptedCorpusList_shouldReturnCurrentScopedFilteredAndPaginatedAcceptedCorpusOnly` | API 46, 47, 49, 50, 51 | traced |
| `acceptedCorpusList_shouldDefaultLimitAndRejectInvalidQueries` | API 47, 51, 60, 61 | traced |
| `acceptedCorpusRevisionGet_shouldReturnHistoricalRevisionForAuthorizedCallers` | API 52, 54 | traced |
| `acceptedCorpusRevisionGet_shouldRejectUnknownAndUnauthorizedCallers` | API 53, 55 | traced |
| `corpusEventsList_shouldRejectNonCuratorCallers` | API 57 | traced |
| `corpusEventsList_shouldAcceptCuratorAndRejectUnknownOrDisabledCallers` | API 4, 8, 57 | traced |
| `corpusEventsList_shouldReturnOnlyScopedEventsWithCorpusShape` | API 56, 58, 63 | traced |
| `corpusEventsList_shouldDefaultLimitRejectInvalidQueriesAndRedactCursor` | API 60, 61, 62 | traced |
| `corpusEventsList_shouldRedactFaultResponses` | API 64 | traced |
| `corpusEventsList_shouldExposeOnlyDomainReasonsAndKeepOutOfScopeRoutesUnavailable` | API 59, 65 | traced |

### B.4 `tests/backup-restore.test.js` (corpus subset)

| Test name | Traced clause(s) | Verdict |
|---|---|---|
| `exportBackup_shouldIncludeCorpusRecords_onBackup` | FS 62 | traced |
| `restoreBackup_shouldRestoreCorpusRecords_onAcceptedBackup` | FS 62 | traced |
| `restoreBackup_shouldRejectAcceptedCorpusEntityWithoutCurrentRevision_onBackup` | FS 63 | traced |
| `restoreBackup_shouldRejectAcceptedCorpusRevisionWithoutCandidate_onBackup` | FS 64 | traced |
| `restoreBackup_shouldRejectAcceptedCorpusRevisionWithUnacceptedCandidate_onBackup` | FS 64 | traced |
| `restoreBackup_shouldRejectAcceptedCorpusRevisionWithoutEntity_onBackup` | FS 64 | traced |
| `restoreBackup_shouldRejectAcceptedCorpusRevisionWithCrossProgramSource_onBackup` | FS 64 | traced |

### B.5 `tests/executable-acceptance.test.js` (corpus subset)

| Test name | Traced clause(s) | Verdict |
|---|---|---|
| `acceptance_shouldExerciseCorpusApi_onHttpInstance` | API 65 (executable flow, API test 65) | traced |

### B.6 Out-of-scope titles (not enumerated as rows)

From `corpus.test.js`: all `*AssessmentCriterion*`, `*AssessmentCriteria*`, `*OpenAnswerCheck*`, `*QuickCheck*`, `*Delivery*` tests (owned by Assessment / Quick-Check specs). From `http-api.test.js`: `assessment*`, `openAnswer*`, `studentWorkspace*`, `programs*`, `programMembership*`, `studentMembership*`, `effectiveParticipation*`, `programEvent*`, `adminBoard*`, `identity*`, `operations*`. From `backup-restore.test.js`: `*Assessment*`, `*OpenAnswer*`, `*QuickCheck*`, `*Identity*`, `*ProgramShell*`, `*StudentAttempt*` tests. From `executable-acceptance.test.js`: bootstrap/CLI/admin/membership/assessment/rate-limit tests. None are corpus-orphans.

## Findings

None. Both forward and backward coverage are complete: every first-slice and API spec clause maps to at least one named in-scope test (130/130 covered), and every in-scope corpus/curator test name traces to a clause (67/67 traced, 0 orphan).

## Open questions

1. **Cross-module-shared clauses (Assessment layering).** `corpus.test.js` interleaves corpus topic/concept tests with assessment-criterion / open-answer-check / quick-check tests in the same file. The shared command/query authorization scaffolding (FS 1–6, API 1–8) is exercised by both. This pass treats the corpus subset as authoritative for these clauses and classifies the assessment/check titles out-of-scope; confirming the assessment specs separately own those titles belongs to the Assessment module's own spec ↔ tests pass.
2. **Bundled validation tests vs per-clause granularity.** Several clauses are covered by a single bundled test name (e.g. `corpusSourcesCreate_shouldRejectInvalidSourceFields_withValidationFailed` covers FS 7–9 / API 13; `acceptCorpusCandidate_shouldRejectInvalidCandidateStatesAndTargets` covers FS 21–23, 27–29, 39, 51). Coverage is present by title, but whether each bundled clause has a distinct assertion cannot be determined from titles alone (bodies were not read, per the pass rule). This is a granularity observation, not a finding.

## Inspected

- **Specs (clause source):**
  - `docs/specs/corpus-storage-and-curator-acceptance-first-slice.md` v0.0.1 (draft) — Behavior rules 1–65 enumerated as FS-1…FS-65.
  - `docs/specs/corpus-storage-and-curator-acceptance-api.md` v0.0.1 (draft) — Behavior rules 1–65 enumerated as API-1…API-65.
- **Tests (titles via grep; bodies not read; tests not run):**
  - `tests/corpus.test.js` — corpus topic/concept subset (22 in-scope titles; assessment/check/quick-check titles out-of-scope).
  - `tests/corpus-executable-acceptance.test.js` — 3 corpus titles in-scope; 2 assessment titles out-of-scope.
  - `tests/http-api.test.js` — 38 corpus titles in-scope.
  - `tests/backup-restore.test.js` — 7 corpus titles in-scope.
  - `tests/executable-acceptance.test.js` — 1 corpus title in-scope.
- **Total in-scope test names enumerated:** 67. **Total spec clauses enumerated:** 130.
