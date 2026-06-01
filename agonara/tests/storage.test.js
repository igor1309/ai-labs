import assert from "node:assert/strict";
import test from "node:test";
import * as storage from "../src/storage.js";
import {
  StorageInvariantError,
  createAuditEvent,
  createIdentity,
  createLocalPasswordCredential,
  createSession,
  grantAdminAuthority,
  initializeIdentityStorage,
  listAuditEvents,
  openIdentityDatabase,
  revokeAdminAuthority,
  revokeSession,
} from "../src/storage.js";

test("initializeIdentityStorage_shouldCreateIdentityTables_onEmptyDatabase", () => {
  const database = openIdentityDatabase();

  try {
    initializeIdentityStorage(database);

    const tableNames = database
      .prepare(
        "select name from sqlite_master where type = 'table' and name in (?, ?, ?, ?, ?) order by name",
      )
      .all("admin_authorities", "audit_events", "identities", "local_password_credentials", "sessions")
      .map($0 => $0.name);

    assert.deepEqual(tableNames, [
      "admin_authorities",
      "audit_events",
      "identities",
      "local_password_credentials",
      "sessions",
    ]);
  } finally {
    database.close();
  }
});

test("createLocalPasswordCredential_shouldRejectDuplicateLogin_onExistingCredential", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    createIdentity(database, makeIdentity("identity-b"));
    createLocalPasswordCredential(
      database,
      makeLocalPasswordCredential({ id: "credential-a", identityId: "identity-a", login: "same-login" }),
    );

    assert.throws(
      () =>
        createLocalPasswordCredential(
          database,
          makeLocalPasswordCredential({ id: "credential-b", identityId: "identity-b", login: "same-login" }),
        ),
      error => error instanceof StorageInvariantError && error.reason === "login_already_bound",
    );
  } finally {
    database.close();
  }
});

test("createLocalPasswordCredential_shouldRejectSecondCredential_onExistingIdentityCredential", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    createLocalPasswordCredential(
      database,
      makeLocalPasswordCredential({ id: "credential-a", identityId: "identity-a", login: "first-login" }),
    );

    assert.throws(
      () =>
        createLocalPasswordCredential(
          database,
          makeLocalPasswordCredential({ id: "credential-b", identityId: "identity-a", login: "second-login" }),
        ),
      error => error instanceof StorageInvariantError && error.reason === "identity_already_has_credential",
    );
  } finally {
    database.close();
  }
});

test("revokeSession_shouldPersistRevocationTime_onExistingSession", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    createSession(database, {
      id: "session-a",
      identityId: "identity-a",
      createdAt: "2026-05-27T10:00:00.000Z",
      expiresAt: "2026-06-03T10:00:00.000Z",
    });

    assert.deepEqual(revokeSession(database, { id: "session-a", revokedAt: "2026-05-27T11:00:00.000Z" }), {
      id: "session-a",
      identityId: "identity-a",
      createdAt: "2026-05-27T10:00:00.000Z",
      expiresAt: "2026-06-03T10:00:00.000Z",
      revokedAt: "2026-05-27T11:00:00.000Z",
    });
  } finally {
    database.close();
  }
});

test("createAuditEvent_shouldAppendQueryableEvents_onAcceptedAndRejectedOutcomes", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    createAuditEvent(database, {
      id: "audit-a",
      eventType: "bootstrap_first_admin",
      targetIdentityId: "identity-a",
      occurredAt: "2026-05-27T10:00:00.000Z",
      outcome: "accepted",
    });
    createAuditEvent(database, {
      id: "audit-b",
      eventType: "revoke_admin",
      actorIdentityId: "identity-a",
      targetIdentityId: "identity-a",
      occurredAt: "2026-05-27T10:01:00.000Z",
      outcome: "rejected",
      reason: "last_admin_removal",
    });

    assert.deepEqual(
      listAuditEvents(database).map($0 => ({
        id: $0.id,
        eventType: $0.eventType,
        outcome: $0.outcome,
        reason: $0.reason,
      })),
      [
        {
          id: "audit-a",
          eventType: "bootstrap_first_admin",
          outcome: "accepted",
          reason: null,
        },
        {
          id: "audit-b",
          eventType: "revoke_admin",
          outcome: "rejected",
          reason: "last_admin_removal",
        },
      ],
    );
  } finally {
    database.close();
  }
});

test("createAuditEvent_shouldAppendHistoricalSessionReference_onMissingActiveSession", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    createAuditEvent(database, {
      id: "audit-a",
      eventType: "session_logout",
      actorIdentityId: "identity-a",
      targetSessionId: "historical-session",
      occurredAt: "2026-05-27T10:00:00.000Z",
      outcome: "accepted",
    });

    assert.deepEqual(
      listAuditEvents(database).map($0 => $0.targetSessionId),
      ["historical-session"],
    );
  } finally {
    database.close();
  }
});

test("createProgramSourceRecord_shouldPersistAndListByProgram_onExistingPrograms", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-b" }));

    const created = storage.createProgramSourceRecord?.(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    storage.createProgramSourceRecord?.(
      database,
      makeProgramSource({ id: "source-b", programId: "program-b", title: "Other source" }),
    );

    assert.deepEqual(
      {
        created,
        listed: storage.listProgramSourceRecords?.(database, { programId: "program-a" }),
      },
      {
        created: {
          id: "source-a",
          programId: "program-a",
          sourceKind: "article",
          title: "Source source-a",
          locator: "https://example.test/source-a",
          citation: "Citation source-a",
          recordedByIdentityId: "identity-a",
          recordedAt: "2026-05-28T10:00:00.000Z",
        },
        listed: [
          {
            id: "source-a",
            programId: "program-a",
            sourceKind: "article",
            title: "Source source-a",
            locator: "https://example.test/source-a",
            citation: "Citation source-a",
            recordedByIdentityId: "identity-a",
            recordedAt: "2026-05-28T10:00:00.000Z",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("createCorpusCandidateRecord_shouldPersistAndListByProgramAndStatus_onExistingProgramSources", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-b" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-b", programId: "program-b" }),
    );

    const created = storage.createCorpusCandidateRecord?.(
      database,
      makeCorpusCandidate({ id: "candidate-a", programId: "program-a", sourceIds: ["source-a"] }),
    );
    storage.createCorpusCandidateRecord?.(
      database,
      makeCorpusCandidate({ id: "candidate-b", programId: "program-a", status: "rejected" }),
    );
    storage.createCorpusCandidateRecord?.(
      database,
      makeCorpusCandidate({ id: "candidate-c", programId: "program-b", sourceIds: ["source-b"] }),
    );

    assert.deepEqual(
      {
        created,
        listed: storage.listCorpusCandidateRecords?.(database, {
          programId: "program-a",
          status: "draft",
        }),
      },
      {
        created: {
          id: "candidate-a",
          programId: "program-a",
          candidateKind: "topic",
          title: "Candidate candidate-a",
          body: "Body candidate-a",
          sourceIds: ["source-a"],
          rationale: "Rationale candidate-a",
          status: "draft",
          createdByIdentityId: "identity-a",
          createdAt: "2026-05-28T10:10:00.000Z",
          updatedAt: "2026-05-28T10:10:00.000Z",
        },
        listed: [
          {
            id: "candidate-a",
            programId: "program-a",
            candidateKind: "topic",
            title: "Candidate candidate-a",
            body: "Body candidate-a",
            sourceIds: ["source-a"],
            rationale: "Rationale candidate-a",
            status: "draft",
            createdByIdentityId: "identity-a",
            createdAt: "2026-05-28T10:10:00.000Z",
            updatedAt: "2026-05-28T10:10:00.000Z",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("createAssessmentCriterionCandidateRecord_shouldPersistAndListByProgramAndStatus_onExistingProgramSources", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-b" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-b", programId: "program-b" }),
    );

    const created = storage.createAssessmentCriterionCandidateRecord?.(
      database,
      makeAssessmentCriterionCandidate({ id: "criterion-candidate-a", programId: "program-a", sourceIds: ["source-a"] }),
    );
    storage.createAssessmentCriterionCandidateRecord?.(
      database,
      makeAssessmentCriterionCandidate({ id: "criterion-candidate-b", programId: "program-a", status: "rejected" }),
    );
    storage.createAssessmentCriterionCandidateRecord?.(
      database,
      makeAssessmentCriterionCandidate({ id: "criterion-candidate-c", programId: "program-b", sourceIds: ["source-b"] }),
    );

    assert.deepEqual(
      {
        created,
        listed: storage.listAssessmentCriterionCandidateRecords?.(database, {
          programId: "program-a",
          status: "draft",
        }),
      },
      {
        created: {
          id: "criterion-candidate-a",
          programId: "program-a",
          title: "Criterion criterion-candidate-a",
          body: "Criterion body criterion-candidate-a",
          sourceIds: ["source-a"],
          rationale: "Criterion rationale criterion-candidate-a",
          status: "draft",
          createdByIdentityId: "identity-a",
          createdAt: "2026-05-28T10:40:00.000Z",
          updatedAt: "2026-05-28T10:40:00.000Z",
        },
        listed: [
          {
            id: "criterion-candidate-a",
            programId: "program-a",
            title: "Criterion criterion-candidate-a",
            body: "Criterion body criterion-candidate-a",
            sourceIds: ["source-a"],
            rationale: "Criterion rationale criterion-candidate-a",
            status: "draft",
            createdByIdentityId: "identity-a",
            createdAt: "2026-05-28T10:40:00.000Z",
            updatedAt: "2026-05-28T10:40:00.000Z",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("createAcceptedCorpusRecords_shouldPersistEntityAndCurrentRevisionLink_onExistingCandidate", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    storage.createCorpusCandidateRecord(
      database,
      makeCorpusCandidate({ id: "candidate-a", programId: "program-a", sourceIds: ["source-a"] }),
    );

    const entity = storage.createAcceptedCorpusEntityRecord?.(
      database,
      makeAcceptedCorpusEntity({ id: "entity-a", programId: "program-a", currentRevisionId: "revision-a" }),
    );
    const revision = storage.createAcceptedCorpusRevisionRecord?.(
      database,
      makeAcceptedCorpusRevision({ id: "revision-a", entityId: "entity-a", programId: "program-a" }),
    );

    assert.deepEqual(
      {
        entity,
        revision,
        listed: storage.listAcceptedCorpusEntityRecords?.(database, { programId: "program-a" }),
      },
      {
        entity: {
          id: "entity-a",
          programId: "program-a",
          acceptedKind: "topic",
          currentRevisionId: "revision-a",
        },
        revision: {
          id: "revision-a",
          entityId: "entity-a",
          programId: "program-a",
          acceptedKind: "topic",
          title: "Accepted revision-a",
          body: "Accepted body revision-a",
          acceptedFromCandidateId: "candidate-a",
          sourceIds: ["source-a"],
          rationale: "Accepted rationale revision-a",
          acceptedByIdentityId: "identity-a",
          acceptedAt: "2026-05-28T10:20:00.000Z",
        },
        listed: [
          {
            id: "entity-a",
            programId: "program-a",
            acceptedKind: "topic",
            currentRevisionId: "revision-a",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("createAcceptedAssessmentCriterionRecords_shouldPersistEntityAndCurrentRevisionLink_onExistingCandidate", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    storage.createAssessmentCriterionCandidateRecord(
      database,
      makeAssessmentCriterionCandidate({
        id: "criterion-candidate-a",
        programId: "program-a",
        sourceIds: ["source-a"],
      }),
    );

    const entity = storage.createAcceptedAssessmentCriterionEntityRecord?.(
      database,
      makeAcceptedAssessmentCriterionEntity({
        id: "criterion-entity-a",
        programId: "program-a",
        currentRevisionId: "criterion-revision-a",
      }),
    );
    const revision = storage.createAcceptedAssessmentCriterionRevisionRecord?.(
      database,
      makeAcceptedAssessmentCriterionRevision({
        id: "criterion-revision-a",
        entityId: "criterion-entity-a",
        programId: "program-a",
      }),
    );

    assert.deepEqual(
      {
        entity,
        revision,
        listed: storage.listAcceptedAssessmentCriterionEntityRecords?.(database, { programId: "program-a" }),
      },
      {
        entity: {
          id: "criterion-entity-a",
          programId: "program-a",
          currentRevisionId: "criterion-revision-a",
        },
        revision: {
          id: "criterion-revision-a",
          entityId: "criterion-entity-a",
          programId: "program-a",
          title: "Accepted criterion criterion-revision-a",
          body: "Accepted criterion body criterion-revision-a",
          acceptedFromCandidateId: "criterion-candidate-a",
          sourceIds: ["source-a"],
          rationale: "Accepted criterion rationale criterion-revision-a",
          acceptedByIdentityId: "identity-a",
          acceptedAt: "2026-05-28T10:50:00.000Z",
        },
        listed: [
          {
            id: "criterion-entity-a",
            programId: "program-a",
            currentRevisionId: "criterion-revision-a",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("updateAcceptedCorpusEntityCurrentRevision_shouldPreserveHistoricalRevision_onNewRevision", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    storage.createCorpusCandidateRecord(
      database,
      makeCorpusCandidate({ id: "candidate-a", programId: "program-a", sourceIds: ["source-a"] }),
    );
    storage.createAcceptedCorpusEntityRecord(
      database,
      makeAcceptedCorpusEntity({ id: "entity-a", programId: "program-a", currentRevisionId: "revision-a" }),
    );
    storage.createAcceptedCorpusRevisionRecord(
      database,
      makeAcceptedCorpusRevision({ id: "revision-a", entityId: "entity-a", programId: "program-a" }),
    );
    storage.createAcceptedCorpusRevisionRecord(
      database,
      makeAcceptedCorpusRevision({ id: "revision-b", entityId: "entity-a", programId: "program-a" }),
    );

    assert.deepEqual(
      {
        entity: storage.updateAcceptedCorpusEntityCurrentRevision?.(database, {
          entityId: "entity-a",
          currentRevisionId: "revision-b",
        }),
        historicalRevision: storage.getAcceptedCorpusRevisionRecord(database, "revision-a"),
      },
      {
        entity: {
          id: "entity-a",
          programId: "program-a",
          acceptedKind: "topic",
          currentRevisionId: "revision-b",
        },
        historicalRevision: {
          id: "revision-a",
          entityId: "entity-a",
          programId: "program-a",
          acceptedKind: "topic",
          title: "Accepted revision-a",
          body: "Accepted body revision-a",
          acceptedFromCandidateId: "candidate-a",
          sourceIds: ["source-a"],
          rationale: "Accepted rationale revision-a",
          acceptedByIdentityId: "identity-a",
          acceptedAt: "2026-05-28T10:20:00.000Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("updateAcceptedAssessmentCriterionEntityCurrentRevision_shouldPreserveHistoricalRevision_onNewRevision", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    storage.createAssessmentCriterionCandidateRecord(
      database,
      makeAssessmentCriterionCandidate({
        id: "criterion-candidate-a",
        programId: "program-a",
        sourceIds: ["source-a"],
      }),
    );
    storage.createAcceptedAssessmentCriterionEntityRecord(
      database,
      makeAcceptedAssessmentCriterionEntity({
        id: "criterion-entity-a",
        programId: "program-a",
        currentRevisionId: "criterion-revision-a",
      }),
    );
    storage.createAcceptedAssessmentCriterionRevisionRecord(
      database,
      makeAcceptedAssessmentCriterionRevision({
        id: "criterion-revision-a",
        entityId: "criterion-entity-a",
        programId: "program-a",
      }),
    );
    storage.createAcceptedAssessmentCriterionRevisionRecord(
      database,
      makeAcceptedAssessmentCriterionRevision({
        id: "criterion-revision-b",
        entityId: "criterion-entity-a",
        programId: "program-a",
      }),
    );

    assert.deepEqual(
      {
        entity: storage.updateAcceptedAssessmentCriterionEntityCurrentRevision?.(database, {
          entityId: "criterion-entity-a",
          currentRevisionId: "criterion-revision-b",
        }),
        historicalRevision: storage.getAcceptedAssessmentCriterionRevisionRecord(database, "criterion-revision-a"),
      },
      {
        entity: {
          id: "criterion-entity-a",
          programId: "program-a",
          currentRevisionId: "criterion-revision-b",
        },
        historicalRevision: {
          id: "criterion-revision-a",
          entityId: "criterion-entity-a",
          programId: "program-a",
          title: "Accepted criterion criterion-revision-a",
          body: "Accepted criterion body criterion-revision-a",
          acceptedFromCandidateId: "criterion-candidate-a",
          sourceIds: ["source-a"],
          rationale: "Accepted criterion rationale criterion-revision-a",
          acceptedByIdentityId: "identity-a",
          acceptedAt: "2026-05-28T10:50:00.000Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("createOpenAnswerCheckCandidateRecord_shouldPersistAndListByProgramAndStatus_onExistingCriterionEntity", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-b" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-b", programId: "program-b" }),
    );
    seedAcceptedAssessmentCriterion(database, {
      candidateId: "criterion-candidate-a",
      entityId: "criterion-entity-a",
      programId: "program-a",
      revisionId: "criterion-revision-a",
      sourceId: "source-a",
    });
    seedAcceptedAssessmentCriterion(database, {
      candidateId: "criterion-candidate-b",
      entityId: "criterion-entity-b",
      programId: "program-b",
      revisionId: "criterion-revision-b",
      sourceId: "source-b",
    });

    const created = storage.createOpenAnswerCheckCandidateRecord?.(
      database,
      makeOpenAnswerCheckCandidate({
        id: "check-candidate-a",
        programId: "program-a",
        sourceIds: ["source-a"],
        criterionEntityIds: ["criterion-entity-a"],
      }),
    );
    storage.createOpenAnswerCheckCandidateRecord?.(
      database,
      makeOpenAnswerCheckCandidate({
        id: "check-candidate-b",
        programId: "program-a",
        criterionEntityIds: ["criterion-entity-a"],
        status: "rejected",
      }),
    );
    storage.createOpenAnswerCheckCandidateRecord?.(
      database,
      makeOpenAnswerCheckCandidate({
        id: "check-candidate-c",
        programId: "program-b",
        sourceIds: ["source-b"],
        criterionEntityIds: ["criterion-entity-b"],
      }),
    );

    assert.deepEqual(
      {
        created,
        listed: storage.listOpenAnswerCheckCandidateRecords?.(database, {
          programId: "program-a",
          status: "draft",
        }),
      },
      {
        created: {
          id: "check-candidate-a",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Check check-candidate-a",
          prompt: "Prompt check-candidate-a",
          sourceIds: ["source-a"],
          criterionEntityIds: ["criterion-entity-a"],
          rationale: "Check rationale check-candidate-a",
          status: "draft",
          createdByIdentityId: "identity-a",
          createdAt: "2026-05-28T11:00:00.000Z",
          updatedAt: "2026-05-28T11:00:00.000Z",
        },
        listed: [
          {
            id: "check-candidate-a",
            programId: "program-a",
            checkKind: "open_answer",
            title: "Check check-candidate-a",
            prompt: "Prompt check-candidate-a",
            sourceIds: ["source-a"],
            criterionEntityIds: ["criterion-entity-a"],
            rationale: "Check rationale check-candidate-a",
            status: "draft",
            createdByIdentityId: "identity-a",
            createdAt: "2026-05-28T11:00:00.000Z",
            updatedAt: "2026-05-28T11:00:00.000Z",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("assessmentCandidateStatusUpdates_shouldPersistUpdatedStatusAndTimestamp_onExistingCandidates", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    seedAcceptedAssessmentCriterion(database, {
      candidateId: "criterion-candidate-a",
      entityId: "criterion-entity-a",
      programId: "program-a",
      revisionId: "criterion-revision-a",
      sourceId: "source-a",
    });
    storage.createOpenAnswerCheckCandidateRecord(
      database,
      makeOpenAnswerCheckCandidate({
        id: "check-candidate-a",
        programId: "program-a",
        sourceIds: ["source-a"],
        criterionEntityIds: ["criterion-entity-a"],
      }),
    );

    assert.deepEqual(
      {
        criterion: storage.updateAssessmentCriterionCandidateStatus?.(database, {
          candidateId: "criterion-candidate-a",
          status: "rejected",
          updatedAt: "2026-05-28T11:20:00.000Z",
        }),
        check: storage.updateOpenAnswerCheckCandidateStatus?.(database, {
          candidateId: "check-candidate-a",
          status: "accepted",
          updatedAt: "2026-05-28T11:21:00.000Z",
        }),
      },
      {
        criterion: {
          ...storage.getAssessmentCriterionCandidateRecord(database, "criterion-candidate-a"),
          status: "rejected",
          updatedAt: "2026-05-28T11:20:00.000Z",
        },
        check: {
          ...storage.getOpenAnswerCheckCandidateRecord(database, "check-candidate-a"),
          status: "accepted",
          updatedAt: "2026-05-28T11:21:00.000Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("createAcceptedOpenAnswerCheckRecords_shouldPersistEntityAndCurrentRevisionLink_onExistingCandidate", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    seedAcceptedAssessmentCriterion(database, {
      candidateId: "criterion-candidate-a",
      entityId: "criterion-entity-a",
      programId: "program-a",
      revisionId: "criterion-revision-a",
      sourceId: "source-a",
    });
    storage.createOpenAnswerCheckCandidateRecord(
      database,
      makeOpenAnswerCheckCandidate({
        id: "check-candidate-a",
        programId: "program-a",
        sourceIds: ["source-a"],
        criterionEntityIds: ["criterion-entity-a"],
      }),
    );

    const entity = storage.createAcceptedOpenAnswerCheckEntityRecord?.(
      database,
      makeAcceptedOpenAnswerCheckEntity({
        id: "check-entity-a",
        programId: "program-a",
        currentRevisionId: "check-revision-a",
      }),
    );
    const revision = storage.createAcceptedOpenAnswerCheckRevisionRecord?.(
      database,
      makeAcceptedOpenAnswerCheckRevision({
        id: "check-revision-a",
        entityId: "check-entity-a",
        programId: "program-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );

    assert.deepEqual(
      {
        entity,
        revision,
        listed: storage.listAcceptedOpenAnswerCheckEntityRecords?.(database, { programId: "program-a" }),
      },
      {
        entity: {
          id: "check-entity-a",
          programId: "program-a",
          currentRevisionId: "check-revision-a",
        },
        revision: {
          id: "check-revision-a",
          entityId: "check-entity-a",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Accepted check check-revision-a",
          prompt: "Accepted prompt check-revision-a",
          acceptedFromCandidateId: "check-candidate-a",
          sourceIds: ["source-a"],
          criterionRevisionIds: ["criterion-revision-a"],
          rationale: "Accepted check rationale check-revision-a",
          acceptedByIdentityId: "identity-a",
          acceptedAt: "2026-05-28T11:10:00.000Z",
        },
        listed: [
          {
            id: "check-entity-a",
            programId: "program-a",
            currentRevisionId: "check-revision-a",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("updateAcceptedOpenAnswerCheckEntityCurrentRevision_shouldPreserveHistoricalRevision_onNewRevision", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    seedAcceptedAssessmentCriterion(database, {
      candidateId: "criterion-candidate-a",
      entityId: "criterion-entity-a",
      programId: "program-a",
      revisionId: "criterion-revision-a",
      sourceId: "source-a",
    });
    storage.createOpenAnswerCheckCandidateRecord(
      database,
      makeOpenAnswerCheckCandidate({
        id: "check-candidate-a",
        programId: "program-a",
        sourceIds: ["source-a"],
        criterionEntityIds: ["criterion-entity-a"],
      }),
    );
    storage.createAcceptedOpenAnswerCheckEntityRecord(
      database,
      makeAcceptedOpenAnswerCheckEntity({
        id: "check-entity-a",
        programId: "program-a",
        currentRevisionId: "check-revision-a",
      }),
    );
    storage.createAcceptedOpenAnswerCheckRevisionRecord(
      database,
      makeAcceptedOpenAnswerCheckRevision({
        id: "check-revision-a",
        entityId: "check-entity-a",
        programId: "program-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );
    storage.createAcceptedOpenAnswerCheckRevisionRecord(
      database,
      makeAcceptedOpenAnswerCheckRevision({
        id: "check-revision-b",
        entityId: "check-entity-a",
        programId: "program-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );

    assert.deepEqual(
      {
        entity: storage.updateAcceptedOpenAnswerCheckEntityCurrentRevision?.(database, {
          entityId: "check-entity-a",
          currentRevisionId: "check-revision-b",
        }),
        historicalRevision: storage.getAcceptedOpenAnswerCheckRevisionRecord(database, "check-revision-a"),
      },
      {
        entity: {
          id: "check-entity-a",
          programId: "program-a",
          currentRevisionId: "check-revision-b",
        },
        historicalRevision: {
          id: "check-revision-a",
          entityId: "check-entity-a",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Accepted check check-revision-a",
          prompt: "Accepted prompt check-revision-a",
          acceptedFromCandidateId: "check-candidate-a",
          sourceIds: ["source-a"],
          criterionRevisionIds: ["criterion-revision-a"],
          rationale: "Accepted check rationale check-revision-a",
          acceptedByIdentityId: "identity-a",
          acceptedAt: "2026-05-28T11:10:00.000Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("createOpenAnswerAttemptRecord_shouldPersistAttemptReferences_onExistingAcceptedCheckRevision", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedOpenAnswerCheck(database, { programId: "program-a" });

    assert.deepEqual(
      storage.createOpenAnswerAttemptRecord?.(
        database,
        makeOpenAnswerAttempt({
          id: "attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
        }),
      ),
      {
        id: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        submittedAnswer: "Submitted answer attempt-a",
        idempotencyKey: "idempotency-attempt-a",
        status: "submitted",
        submittedAt: "2026-06-02T10:00:00.000Z",
        updatedAt: "2026-06-02T10:00:00.000Z",
      },
    );
  } finally {
    database.close();
  }
});

test("listOpenAnswerAttemptRecords_shouldFilterByStudentProgramStatusAndCheckRevision", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedOpenAnswerCheck(database, { programId: "program-a" });
    createIdentity(database, makeIdentity("identity-b"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-b" }));
    storage.createProgramSourceRecord(database, makeProgramSource({ id: "source-b", programId: "program-b" }));
    seedAcceptedAssessmentCriterion(database, {
      candidateId: "criterion-candidate-b",
      entityId: "criterion-entity-b",
      programId: "program-b",
      revisionId: "criterion-revision-b",
      sourceId: "source-b",
    });
    storage.createOpenAnswerCheckCandidateRecord(
      database,
      makeOpenAnswerCheckCandidate({
        id: "check-candidate-b",
        programId: "program-b",
        sourceIds: ["source-b"],
        criterionEntityIds: ["criterion-entity-b"],
      }),
    );
    storage.createAcceptedOpenAnswerCheckEntityRecord(
      database,
      makeAcceptedOpenAnswerCheckEntity({
        id: "check-entity-b",
        programId: "program-b",
        currentRevisionId: "check-revision-b",
      }),
    );
    storage.createAcceptedOpenAnswerCheckRevisionRecord(
      database,
      makeAcceptedOpenAnswerCheckRevision({
        id: "check-revision-b",
        entityId: "check-entity-b",
        programId: "program-b",
        acceptedFromCandidateId: "check-candidate-b",
        sourceIds: ["source-b"],
        criterionRevisionIds: ["criterion-revision-b"],
      }),
    );
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-b",
        programId: "program-a",
        studentIdentityId: "identity-b",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-c",
        programId: "program-b",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-b",
        criterionRevisionIds: ["criterion-revision-b"],
      }),
    );
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-d",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        status: "evaluation_failed",
      }),
    );

    assert.deepEqual(
      storage.listOpenAnswerAttemptRecords?.(database, {
        programId: "program-a",
        studentIdentityId: "identity-a",
        status: "submitted",
        checkRevisionId: "check-revision-a",
      }).map($0 => $0.id),
      ["attempt-a"],
    );
  } finally {
    database.close();
  }
});

test("createOpenAnswerAttemptRecord_shouldEnforceScopedIdempotency_onDuplicateScope", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedOpenAnswerCheck(database, { programId: "program-a" });
    createIdentity(database, makeIdentity("identity-b"));
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        idempotencyKey: "same-key",
      }),
    );
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-b",
        programId: "program-a",
        studentIdentityId: "identity-b",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        idempotencyKey: "same-key",
      }),
    );

    assert.throws(
      () =>
        storage.createOpenAnswerAttemptRecord(
          database,
          makeOpenAnswerAttempt({
            id: "attempt-c",
            programId: "program-a",
            studentIdentityId: "identity-a",
            checkRevisionId: "check-revision-a",
            criterionRevisionIds: ["criterion-revision-a"],
            idempotencyKey: "same-key",
          }),
        ),
      error => error instanceof StorageInvariantError && error.reason === "attempt_idempotency_conflict",
    );
  } finally {
    database.close();
  }
});

test("openAnswerAttemptStorage_shouldRejectRawDuplicateIdempotencyScope_onDatabaseConstraint", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedOpenAnswerCheck(database, { programId: "program-a" });
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        idempotencyKey: "same-key",
      }),
    );

    assert.throws(
      () =>
        database
          .prepare(
            `insert into open_answer_attempts (
               id, program_id, student_identity_id, check_revision_id, criterion_revision_ids_json,
               submitted_answer, idempotency_key, status, submitted_at, updated_at
             ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            "attempt-b",
            "program-a",
            "identity-a",
            "check-revision-a",
            JSON.stringify(["criterion-revision-a"]),
            "Another answer",
            "same-key",
            "submitted",
            "2026-06-02T10:01:00.000Z",
            "2026-06-02T10:01:00.000Z",
          ),
      error => error.code === "SQLITE_CONSTRAINT_UNIQUE",
    );
  } finally {
    database.close();
  }
});

test("updateOpenAnswerAttemptStatus_shouldPreserveSubmittedAnswerAndReferences_onExistingAttempt", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedOpenAnswerCheck(database, { programId: "program-a" });
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );

    assert.deepEqual(
      storage.updateOpenAnswerAttemptStatus?.(database, {
        attemptId: "attempt-a",
        status: "evaluating",
        updatedAt: "2026-06-02T10:05:00.000Z",
      }),
      {
        id: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        submittedAnswer: "Submitted answer attempt-a",
        idempotencyKey: "idempotency-attempt-a",
        status: "evaluating",
        submittedAt: "2026-06-02T10:00:00.000Z",
        updatedAt: "2026-06-02T10:05:00.000Z",
      },
    );
  } finally {
    database.close();
  }
});

test("createOpenAnswerEvaluationRecord_shouldPersistOneEvaluationPerAttempt_onExistingAttempt", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedOpenAnswerCheck(database, { programId: "program-a" });
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );

    assert.deepEqual(
      storage.createOpenAnswerEvaluationRecord?.(
        database,
        makeOpenAnswerEvaluation({
          id: "evaluation-a",
          attemptId: "attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
        }),
      ),
      {
        id: "evaluation-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        evaluatorKind: "student_workspace",
        summaryFeedback: "Summary feedback evaluation-a",
        criterionFeedback: [
          {
            criterionRevisionId: "criterion-revision-a",
            outcome: "met",
            feedback: "Criterion feedback evaluation-a",
          },
        ],
        evaluatedAt: "2026-06-02T10:10:00.000Z",
      },
    );
  } finally {
    database.close();
  }
});

test("createOpenAnswerEvaluationFailureRecord_shouldPersistFailureWithoutChangingAttempt_onExistingAttempt", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedOpenAnswerCheck(database, { programId: "program-a" });
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );

    assert.deepEqual(
      {
        failure: storage.createOpenAnswerEvaluationFailureRecord?.(database, {
          attemptId: "attempt-a",
          reason: "temporary evaluator outage",
          failedAt: "2026-06-02T10:15:00.000Z",
        }),
        attempt: storage.getOpenAnswerAttemptRecord(database, "attempt-a"),
      },
      {
        failure: {
          attemptId: "attempt-a",
          reason: "temporary evaluator outage",
          failedAt: "2026-06-02T10:15:00.000Z",
        },
        attempt: {
          id: "attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
          submittedAnswer: "Submitted answer attempt-a",
          idempotencyKey: "idempotency-attempt-a",
          status: "submitted",
          submittedAt: "2026-06-02T10:00:00.000Z",
          updatedAt: "2026-06-02T10:00:00.000Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("createOpenAnswerAttemptRecord_shouldRejectCriterionRevisionOutsideAcceptedCheck_onGraphMismatch", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedOpenAnswerCheck(database, { programId: "program-a" });
    storage.createAssessmentCriterionCandidateRecord(
      database,
      makeAssessmentCriterionCandidate({
        id: "criterion-candidate-b",
        programId: "program-a",
        sourceIds: ["source-a"],
        status: "accepted",
      }),
    );
    storage.createAcceptedAssessmentCriterionEntityRecord(
      database,
      makeAcceptedAssessmentCriterionEntity({
        id: "criterion-entity-b",
        programId: "program-a",
        currentRevisionId: "criterion-revision-b",
      }),
    );
    storage.createAcceptedAssessmentCriterionRevisionRecord(
      database,
      makeAcceptedAssessmentCriterionRevision({
        id: "criterion-revision-b",
        entityId: "criterion-entity-b",
        programId: "program-a",
        acceptedFromCandidateId: "criterion-candidate-b",
        sourceIds: ["source-a"],
      }),
    );

    assert.throws(
      () =>
        storage.createOpenAnswerAttemptRecord(
          database,
          makeOpenAnswerAttempt({
            id: "attempt-a",
            programId: "program-a",
            studentIdentityId: "identity-a",
            checkRevisionId: "check-revision-a",
            criterionRevisionIds: ["criterion-revision-b"],
          }),
        ),
      error => error instanceof StorageInvariantError && error.reason === "check_criterion_revision_mismatch",
    );
  } finally {
    database.close();
  }
});

test("createCorpusEventRecord_shouldPersistAndListByProgram_onExistingPrograms", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-b" }));

    const created = storage.createCorpusEventRecord?.(
      database,
      makeCorpusEvent({ id: "event-a", programId: "program-a", targetId: "source-a" }),
    );
    storage.createCorpusEventRecord?.(
      database,
      makeCorpusEvent({ id: "event-b", programId: "program-b", targetId: "source-b" }),
    );

    assert.deepEqual(
      {
        created,
        listed: storage.listCorpusEventRecords?.(database, { programId: "program-a" }),
      },
      {
        created: {
          id: "event-a",
          eventType: "program_source_recorded",
          actorIdentityId: "identity-a",
          programId: "program-a",
          targetId: "source-a",
          occurredAt: "2026-05-28T10:30:00.000Z",
          outcome: "accepted",
          reason: null,
        },
        listed: [
          {
            id: "event-a",
            eventType: "program_source_recorded",
            actorIdentityId: "identity-a",
            programId: "program-a",
            targetId: "source-a",
            occurredAt: "2026-05-28T10:30:00.000Z",
            outcome: "accepted",
            reason: null,
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("createCorpusCandidateRecord_shouldRejectCrossProgramSource_onProgramMismatch", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-b" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-b", programId: "program-b" }),
    );

    assert.throws(
      () =>
        storage.createCorpusCandidateRecord(
          database,
          makeCorpusCandidate({ id: "candidate-a", programId: "program-a", sourceIds: ["source-b"] }),
        ),
      error => error instanceof StorageInvariantError && error.reason === "program_source_mismatch",
    );
  } finally {
    database.close();
  }
});

test("createAcceptedAssessmentCriterionRevisionRecord_shouldRejectCrossProgramCandidate_onProgramMismatch", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-b" }));
    storage.createAssessmentCriterionCandidateRecord(
      database,
      makeAssessmentCriterionCandidate({
        id: "criterion-candidate-b",
        programId: "program-b",
        status: "accepted",
      }),
    );
    storage.createAcceptedAssessmentCriterionEntityRecord(
      database,
      makeAcceptedAssessmentCriterionEntity({
        id: "criterion-entity-a",
        programId: "program-a",
        currentRevisionId: "criterion-revision-a",
      }),
    );

    assert.throws(
      () =>
        storage.createAcceptedAssessmentCriterionRevisionRecord(
          database,
          makeAcceptedAssessmentCriterionRevision({
            id: "criterion-revision-a",
            entityId: "criterion-entity-a",
            programId: "program-a",
            acceptedFromCandidateId: "criterion-candidate-b",
            sourceIds: [],
          }),
        ),
      error => error instanceof StorageInvariantError && error.reason === "criterion_candidate_program_mismatch",
    );
  } finally {
    database.close();
  }
});

test("createAcceptedOpenAnswerCheckRevisionRecord_shouldRejectCrossProgramCandidate_onProgramMismatch", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-b" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    seedAcceptedAssessmentCriterion(database, {
      candidateId: "criterion-candidate-a",
      entityId: "criterion-entity-a",
      programId: "program-a",
      revisionId: "criterion-revision-a",
      sourceId: "source-a",
    });
    storage.createOpenAnswerCheckCandidateRecord(
      database,
      makeOpenAnswerCheckCandidate({
        id: "check-candidate-b",
        programId: "program-b",
        criterionEntityIds: [],
      }),
    );
    storage.createAcceptedOpenAnswerCheckEntityRecord(
      database,
      makeAcceptedOpenAnswerCheckEntity({
        id: "check-entity-a",
        programId: "program-a",
        currentRevisionId: "check-revision-a",
      }),
    );

    assert.throws(
      () =>
        storage.createAcceptedOpenAnswerCheckRevisionRecord(
          database,
          makeAcceptedOpenAnswerCheckRevision({
            id: "check-revision-a",
            entityId: "check-entity-a",
            programId: "program-a",
            acceptedFromCandidateId: "check-candidate-b",
            criterionRevisionIds: ["criterion-revision-a"],
          }),
        ),
      error => error instanceof StorageInvariantError && error.reason === "check_candidate_program_mismatch",
    );
  } finally {
    database.close();
  }
});

test("updateAcceptedCorpusEntityCurrentRevision_shouldRejectMissingRevision_onIntegrityBreak", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createAcceptedCorpusEntityRecord(
      database,
      makeAcceptedCorpusEntity({ id: "entity-a", programId: "program-a", currentRevisionId: "revision-a" }),
    );

    assert.throws(
      () =>
        storage.updateAcceptedCorpusEntityCurrentRevision(database, {
          entityId: "entity-a",
          currentRevisionId: "missing-revision",
        }),
      error => error instanceof StorageInvariantError && error.reason === "accepted_revision_not_found",
    );
  } finally {
    database.close();
  }
});

test("revokeAdminAuthority_shouldRejectLastAdminRemoval_onOnlyEffectiveAdmin", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    grantAdminAuthority(database, {
      identityId: "identity-a",
      grantedAt: "2026-05-27T10:00:00.000Z",
    });

    assert.throws(
      () =>
        revokeAdminAuthority(database, {
          identityId: "identity-a",
          revokedAt: "2026-05-27T11:00:00.000Z",
        }),
      error => error instanceof StorageInvariantError && error.reason === "last_admin_removal",
    );
  } finally {
    database.close();
  }
});

test("revokeAdminAuthority_shouldRejectMissingIdentity_onUnknownIdentity", () => {
  const database = makeInitializedDatabase();

  try {
    assert.throws(
      () =>
        revokeAdminAuthority(database, {
          identityId: "missing-identity",
          revokedAt: "2026-05-27T11:00:00.000Z",
        }),
      error => error instanceof StorageInvariantError && error.reason === "identity_not_found",
    );
  } finally {
    database.close();
  }
});

test("revokeAdminAuthority_shouldPersistRevocation_onAnotherEffectiveAdmin", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    createIdentity(database, makeIdentity("identity-b"));
    grantAdminAuthority(database, {
      identityId: "identity-a",
      grantedAt: "2026-05-27T10:00:00.000Z",
    });
    grantAdminAuthority(database, {
      identityId: "identity-b",
      grantedAt: "2026-05-27T10:01:00.000Z",
    });

    assert.deepEqual(
      revokeAdminAuthority(database, {
        identityId: "identity-a",
        revokedAt: "2026-05-27T11:00:00.000Z",
      }),
      {
        identityId: "identity-a",
        grantedAt: "2026-05-27T10:00:00.000Z",
        revokedAt: "2026-05-27T11:00:00.000Z",
      },
    );
  } finally {
    database.close();
  }
});

function makeInitializedDatabase() {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  return database;
}

function makeIdentity(id) {
  return {
    id,
    displayName: `Display ${id}`,
    createdAt: "2026-05-27T10:00:00.000Z",
  };
}

function makeLocalPasswordCredential({ id, identityId, login }) {
  return {
    id,
    identityId,
    login,
    passwordHash: `hash-for-${id}`,
    createdAt: "2026-05-27T10:00:00.000Z",
  };
}

function makeProgramShell({ id }) {
  return {
    id,
    title: `Program ${id}`,
    admissionPolicy: "self_join",
    createdByIdentityId: "identity-a",
    createdAt: "2026-05-28T09:00:00.000Z",
  };
}

function makeProgramSource({ id, programId, title = `Source ${id}` }) {
  return {
    id,
    programId,
    sourceKind: "article",
    title,
    locator: `https://example.test/${id}`,
    citation: `Citation ${id}`,
    recordedByIdentityId: "identity-a",
    recordedAt: "2026-05-28T10:00:00.000Z",
  };
}

function makeCorpusCandidate({ id, programId, sourceIds = [], status = "draft" }) {
  return {
    id,
    programId,
    candidateKind: "topic",
    title: `Candidate ${id}`,
    body: `Body ${id}`,
    sourceIds,
    rationale: `Rationale ${id}`,
    status,
    createdByIdentityId: "identity-a",
    createdAt: "2026-05-28T10:10:00.000Z",
    updatedAt: "2026-05-28T10:10:00.000Z",
  };
}

function makeAssessmentCriterionCandidate({ id, programId, sourceIds = [], status = "draft" }) {
  return {
    id,
    programId,
    title: `Criterion ${id}`,
    body: `Criterion body ${id}`,
    sourceIds,
    rationale: `Criterion rationale ${id}`,
    status,
    createdByIdentityId: "identity-a",
    createdAt: "2026-05-28T10:40:00.000Z",
    updatedAt: "2026-05-28T10:40:00.000Z",
  };
}

function makeAcceptedCorpusEntity({ id, programId, currentRevisionId }) {
  return {
    id,
    programId,
    acceptedKind: "topic",
    currentRevisionId,
  };
}

function makeAcceptedCorpusRevision({ id, entityId, programId }) {
  return {
    id,
    entityId,
    programId,
    acceptedKind: "topic",
    title: `Accepted ${id}`,
    body: `Accepted body ${id}`,
    acceptedFromCandidateId: "candidate-a",
    sourceIds: ["source-a"],
    rationale: `Accepted rationale ${id}`,
    acceptedByIdentityId: "identity-a",
    acceptedAt: "2026-05-28T10:20:00.000Z",
  };
}

function makeAcceptedAssessmentCriterionEntity({ id, programId, currentRevisionId }) {
  return {
    id,
    programId,
    currentRevisionId,
  };
}

function makeAcceptedAssessmentCriterionRevision({
  id,
  entityId,
  programId,
  acceptedFromCandidateId = "criterion-candidate-a",
  sourceIds = ["source-a"],
}) {
  return {
    id,
    entityId,
    programId,
    title: `Accepted criterion ${id}`,
    body: `Accepted criterion body ${id}`,
    acceptedFromCandidateId,
    sourceIds,
    rationale: `Accepted criterion rationale ${id}`,
    acceptedByIdentityId: "identity-a",
    acceptedAt: "2026-05-28T10:50:00.000Z",
  };
}

function makeOpenAnswerCheckCandidate({
  id,
  programId,
  sourceIds = [],
  criterionEntityIds,
  status = "draft",
}) {
  return {
    id,
    programId,
    checkKind: "open_answer",
    title: `Check ${id}`,
    prompt: `Prompt ${id}`,
    sourceIds,
    criterionEntityIds,
    rationale: `Check rationale ${id}`,
    status,
    createdByIdentityId: "identity-a",
    createdAt: "2026-05-28T11:00:00.000Z",
    updatedAt: "2026-05-28T11:00:00.000Z",
  };
}

function makeAcceptedOpenAnswerCheckEntity({ id, programId, currentRevisionId }) {
  return {
    id,
    programId,
    currentRevisionId,
  };
}

function makeAcceptedOpenAnswerCheckRevision({
  id,
  entityId,
  programId,
  acceptedFromCandidateId = "check-candidate-a",
  sourceIds = ["source-a"],
  criterionRevisionIds,
}) {
  return {
    id,
    entityId,
    programId,
    checkKind: "open_answer",
    title: `Accepted check ${id}`,
    prompt: `Accepted prompt ${id}`,
    acceptedFromCandidateId,
    sourceIds,
    criterionRevisionIds,
    rationale: `Accepted check rationale ${id}`,
    acceptedByIdentityId: "identity-a",
    acceptedAt: "2026-05-28T11:10:00.000Z",
  };
}

function makeOpenAnswerAttempt({
  id,
  programId,
  studentIdentityId,
  checkRevisionId,
  criterionRevisionIds,
  idempotencyKey = `idempotency-${id}`,
  status = "submitted",
}) {
  return {
    id,
    programId,
    studentIdentityId,
    checkRevisionId,
    criterionRevisionIds,
    submittedAnswer: `Submitted answer ${id}`,
    idempotencyKey,
    status,
    submittedAt: "2026-06-02T10:00:00.000Z",
    updatedAt: "2026-06-02T10:00:00.000Z",
  };
}

function makeOpenAnswerEvaluation({
  id,
  attemptId,
  programId,
  studentIdentityId,
  checkRevisionId,
  criterionRevisionIds,
}) {
  return {
    id,
    attemptId,
    programId,
    studentIdentityId,
    checkRevisionId,
    criterionRevisionIds,
    evaluatorKind: "student_workspace",
    summaryFeedback: `Summary feedback ${id}`,
    criterionFeedback: [
      {
        criterionRevisionId: criterionRevisionIds[0],
        outcome: "met",
        feedback: `Criterion feedback ${id}`,
      },
    ],
    evaluatedAt: "2026-06-02T10:10:00.000Z",
  };
}

function makeCorpusEvent({ id, programId, targetId }) {
  return {
    id,
    eventType: "program_source_recorded",
    actorIdentityId: "identity-a",
    programId,
    targetId,
    occurredAt: "2026-05-28T10:30:00.000Z",
    outcome: "accepted",
  };
}

function seedAcceptedAssessmentCriterion(
  database,
  { candidateId, entityId, programId, revisionId, sourceId },
) {
  storage.createAssessmentCriterionCandidateRecord(
    database,
    makeAssessmentCriterionCandidate({ id: candidateId, programId, sourceIds: [sourceId], status: "accepted" }),
  );
  storage.createAcceptedAssessmentCriterionEntityRecord(
    database,
    makeAcceptedAssessmentCriterionEntity({ id: entityId, programId, currentRevisionId: revisionId }),
  );
  storage.createAcceptedAssessmentCriterionRevisionRecord(
    database,
    makeAcceptedAssessmentCriterionRevision({
      id: revisionId,
      entityId,
      programId,
      acceptedFromCandidateId: candidateId,
      sourceIds: [sourceId],
    }),
  );
}

function seedAcceptedOpenAnswerCheck(database, { programId }) {
  createIdentity(database, makeIdentity("identity-a"));
  storage.createProgramShellRecord(database, makeProgramShell({ id: programId }));
  storage.createProgramSourceRecord(database, makeProgramSource({ id: "source-a", programId }));
  seedAcceptedAssessmentCriterion(database, {
    candidateId: "criterion-candidate-a",
    entityId: "criterion-entity-a",
    programId,
    revisionId: "criterion-revision-a",
    sourceId: "source-a",
  });
  storage.createOpenAnswerCheckCandidateRecord(
    database,
    makeOpenAnswerCheckCandidate({
      id: "check-candidate-a",
      programId,
      sourceIds: ["source-a"],
      criterionEntityIds: ["criterion-entity-a"],
    }),
  );
  storage.createAcceptedOpenAnswerCheckEntityRecord(
    database,
    makeAcceptedOpenAnswerCheckEntity({
      id: "check-entity-a",
      programId,
      currentRevisionId: "check-revision-a",
    }),
  );
  storage.createAcceptedOpenAnswerCheckRevisionRecord(
    database,
    makeAcceptedOpenAnswerCheckRevision({
      id: "check-revision-a",
      entityId: "check-entity-a",
      programId,
      criterionRevisionIds: ["criterion-revision-a"],
    }),
  );
}
