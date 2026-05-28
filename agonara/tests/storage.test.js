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
