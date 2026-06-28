import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("initializeIdentityStorage_shouldAddStatusColumns_onFreshAndExistingLifecycleStatusTables_status", () => {
  const databasePath = makeTemporaryDatabasePath();
  const freshDatabase = makeInitializedDatabase();
  const oldDatabase = openIdentityDatabase(databasePath);

  try {
    oldDatabase.pragma("foreign_keys = OFF");
    createLegacyLifecycleTables(oldDatabase);
  } finally {
    oldDatabase.close();
  }

  const upgradedDatabase = openIdentityDatabase(databasePath);

  try {
    initializeIdentityStorage(upgradedDatabase);

    assert.deepEqual(
      Object.fromEntries(
        lifecycleTables.map(tableName => [
          tableName,
          {
            fresh: projectLifecycleColumns(freshDatabase, tableName),
            upgraded: projectLifecycleColumns(upgradedDatabase, tableName),
          },
        ]),
      ),
      Object.fromEntries(
        lifecycleTables.map(tableName => [
          tableName,
          {
            fresh: lifecycleColumnProjection,
            upgraded: lifecycleColumnProjection,
          },
        ]),
      ),
    );
  } finally {
    freshDatabase.close();
    upgradedDatabase.close();
    rmSync(databasePath, { force: true });
  }
});

test("lifecycleStatusStorage_shouldRejectInvalidStatus_onEntityAndSourceTables", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));

    assert.throws(
      () =>
        database
          .prepare(
            `insert into accepted_quick_check_entities (
               id, program_id, current_revision_id, status
             ) values (?, ?, ?, ?)`,
          )
          .run("quick-check-entity-a", "program-a", "quick-check-revision-a", "archived"),
      error => error.message.includes("CHECK constraint failed"),
    );
    assert.throws(
      () =>
        database
          .prepare(
            `insert into program_sources (
               id,
               program_id,
               source_kind,
               title,
               recorded_by_identity_id,
               recorded_at,
               status
             ) values (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            "source-a",
            "program-a",
            "article",
            "Source source-a",
            "identity-a",
            "2026-05-28T10:00:00.000Z",
            "archived",
          ),
      error => error.message.includes("CHECK constraint failed"),
    );
  } finally {
    database.close();
  }
});

test("updateProgramAdmissionPolicyRecord_shouldPersistInvitationOnlyPolicy_onExistingProgram", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));

    const updated = storage.updateProgramAdmissionPolicyRecord(database, {
      programId: "program-a",
      admissionPolicy: "invitation_only",
    });

    assert.deepEqual(
      {
        updated,
        fetched: storage.getProgramShellRecord(database, "program-a"),
      },
      {
        updated: {
          id: "program-a",
          title: "Program program-a",
          description: null,
          admissionPolicy: "invitation_only",
          createdByIdentityId: "identity-a",
          createdAt: "2026-05-28T09:00:00.000Z",
        },
        fetched: {
          id: "program-a",
          title: "Program program-a",
          description: null,
          admissionPolicy: "invitation_only",
          createdByIdentityId: "identity-a",
          createdAt: "2026-05-28T09:00:00.000Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("createProgramInvitationRecord_shouldPersistAndListStudentInvitations_onExistingProgramAndIdentities", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    createIdentity(database, makeIdentity("identity-b"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));

    const created = storage.createProgramInvitationRecord(
      database,
      makeProgramInvitation({ id: "invitation-a", programId: "program-a", targetIdentityId: "identity-b" }),
    );

    assert.deepEqual(
      {
        created,
        byProgram: storage.listProgramInvitationRecords(database, { programId: "program-a" }),
        byTarget: storage.listProgramInvitationRecords(database, { targetIdentityId: "identity-b" }),
      },
      {
        created: {
          id: "invitation-a",
          programId: "program-a",
          targetIdentityId: "identity-b",
          participationKind: "student",
          status: "pending",
          invitedByIdentityId: "identity-a",
          createdAt: "2026-06-04T09:00:00.000Z",
          updatedAt: "2026-06-04T09:00:00.000Z",
          statusChangedByIdentityId: null,
          statusChangedAt: null,
        },
        byProgram: [
          {
            id: "invitation-a",
            programId: "program-a",
            targetIdentityId: "identity-b",
            participationKind: "student",
            status: "pending",
            invitedByIdentityId: "identity-a",
            createdAt: "2026-06-04T09:00:00.000Z",
            updatedAt: "2026-06-04T09:00:00.000Z",
            statusChangedByIdentityId: null,
            statusChangedAt: null,
          },
        ],
        byTarget: [
          {
            id: "invitation-a",
            programId: "program-a",
            targetIdentityId: "identity-b",
            participationKind: "student",
            status: "pending",
            invitedByIdentityId: "identity-a",
            createdAt: "2026-06-04T09:00:00.000Z",
            updatedAt: "2026-06-04T09:00:00.000Z",
            statusChangedByIdentityId: null,
            statusChangedAt: null,
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("createProgramInvitationRecord_shouldRejectDuplicatePendingScope_onExistingPendingInvitation", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    createIdentity(database, makeIdentity("identity-b"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramInvitationRecord(
      database,
      makeProgramInvitation({ id: "invitation-a", programId: "program-a", targetIdentityId: "identity-b" }),
    );

    assert.throws(
      () =>
        storage.createProgramInvitationRecord(
          database,
          makeProgramInvitation({ id: "invitation-b", programId: "program-a", targetIdentityId: "identity-b" }),
        ),
      error => error instanceof StorageInvariantError && error.reason === "invitation_conflict",
    );
  } finally {
    database.close();
  }
});

test("updateProgramInvitationStatusRecord_shouldPersistStatusAttribution_onExistingInvitation", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    createIdentity(database, makeIdentity("identity-b"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramInvitationRecord(
      database,
      makeProgramInvitation({ id: "invitation-a", programId: "program-a", targetIdentityId: "identity-b" }),
    );

    const updated = storage.updateProgramInvitationStatusRecord(database, {
      id: "invitation-a",
      status: "accepted",
      statusChangedByIdentityId: "identity-b",
      statusChangedAt: "2026-06-04T10:00:00.000Z",
      updatedAt: "2026-06-04T10:00:00.000Z",
    });

    assert.deepEqual(updated, {
      id: "invitation-a",
      programId: "program-a",
      targetIdentityId: "identity-b",
      participationKind: "student",
      status: "accepted",
      invitedByIdentityId: "identity-a",
      createdAt: "2026-06-04T09:00:00.000Z",
      updatedAt: "2026-06-04T10:00:00.000Z",
      statusChangedByIdentityId: "identity-b",
      statusChangedAt: "2026-06-04T10:00:00.000Z",
    });
  } finally {
    database.close();
  }
});

test("updateProgramInvitationStatusRecord_shouldRejectDuplicatePendingScope_onStatusChange", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    createIdentity(database, makeIdentity("identity-b"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramInvitationRecord(
      database,
      makeProgramInvitation({ id: "invitation-a", programId: "program-a", targetIdentityId: "identity-b" }),
    );
    storage.createProgramInvitationRecord(
      database,
      makeProgramInvitation({
        id: "invitation-b",
        programId: "program-a",
        targetIdentityId: "identity-b",
        status: "accepted",
        statusChangedByIdentityId: "identity-b",
        statusChangedAt: "2026-06-04T10:00:00.000Z",
      }),
    );

    assert.throws(
      () =>
        storage.updateProgramInvitationStatusRecord(database, {
          id: "invitation-b",
          status: "pending",
          statusChangedByIdentityId: "identity-a",
          statusChangedAt: "2026-06-04T11:00:00.000Z",
          updatedAt: "2026-06-04T11:00:00.000Z",
        }),
      error => error instanceof StorageInvariantError && error.reason === "invitation_conflict",
    );
  } finally {
    database.close();
  }
});

test("createProgramMembershipEventRecord_shouldPersistPolicyPathAndInvitationStatus_onMembershipEvent", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    createIdentity(database, makeIdentity("identity-b"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));

    const created = storage.createProgramMembershipEventRecord(database, {
      id: "membership-event-a",
      eventType: "student_invitation_accepted",
      actorIdentityId: "identity-b",
      targetIdentityId: "identity-b",
      programId: "program-a",
      participationKind: "student",
      policyPath: "curator_invitation",
      resultingStatus: "active",
      invitationStatus: "accepted",
      occurredAt: "2026-06-04T10:00:00.000Z",
      outcome: "accepted",
    });

    assert.deepEqual(created, {
      id: "membership-event-a",
      eventType: "student_invitation_accepted",
      actorIdentityId: "identity-b",
      targetIdentityId: "identity-b",
      programId: "program-a",
      participationKind: "student",
      policyPath: "curator_invitation",
      resultingStatus: "active",
      invitationStatus: "accepted",
      occurredAt: "2026-06-04T10:00:00.000Z",
      outcome: "accepted",
      reason: null,
    });
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

test("llmCurationSuggestionStorage_shouldPersistDraftSuggestionsAndGenerationIdempotency_onExistingProgram", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));

    const created = storage.createLlmCurationSuggestionRecord?.(
      database,
      makeLlmCurationSuggestion({ id: "suggestion-a", programId: "program-a" }),
    );
    const generation = storage.createLlmCurationSuggestionGenerationRecord?.(
      database,
      {
        id: "generation-a",
        programId: "program-a",
        idempotencyKey: "suggestion-key-a",
        requestFingerprint: "fingerprint-a",
        suggestionIds: ["suggestion-a"],
        createdByIdentityId: "identity-a",
        createdAt: "2026-06-04T12:00:00.000Z",
      },
    );

    assert.deepEqual(
      {
        created,
        generation,
        listed: storage.listLlmCurationSuggestionRecords?.(database, { programId: "program-a" }),
        foundGeneration: storage.getLlmCurationSuggestionGenerationRecord?.(database, {
          programId: "program-a",
          idempotencyKey: "suggestion-key-a",
        }),
      },
      {
        created: makeLlmCurationSuggestion({ id: "suggestion-a", programId: "program-a" }),
        generation: {
          id: "generation-a",
          programId: "program-a",
          idempotencyKey: "suggestion-key-a",
          requestFingerprint: "fingerprint-a",
          suggestionIds: ["suggestion-a"],
          createdByIdentityId: "identity-a",
          createdAt: "2026-06-04T12:00:00.000Z",
        },
        listed: [makeLlmCurationSuggestion({ id: "suggestion-a", programId: "program-a" })],
        foundGeneration: {
          id: "generation-a",
          programId: "program-a",
          idempotencyKey: "suggestion-key-a",
          requestFingerprint: "fingerprint-a",
          suggestionIds: ["suggestion-a"],
          createdByIdentityId: "identity-a",
          createdAt: "2026-06-04T12:00:00.000Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("updateLlmCurationSuggestionStatus_shouldPersistTerminalReviewState_onExistingSuggestion", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    seedRestoreGovernance(database, { programId: "program-a" });
    storage.createCorpusCandidateRecord(
      database,
      makeCorpusCandidate({ id: "candidate-a", programId: "program-a" }),
    );
    storage.createLlmCurationSuggestionRecord(
      database,
      makeLlmCurationSuggestion({ id: "suggestion-materialized", programId: "program-a" }),
    );
    storage.createLlmCurationSuggestionRecord(
      database,
      makeLlmCurationSuggestion({ id: "suggestion-rejected", programId: "program-a" }),
    );

    const materialized = storage.materializeLlmCurationSuggestionRecord?.(database, {
      suggestionId: "suggestion-materialized",
      candidateKind: "navigation_candidate",
      candidateId: "candidate-a",
      materializedByIdentityId: "identity-a",
      materializedAt: "2026-06-04T12:10:00.000Z",
      updatedAt: "2026-06-04T12:10:00.000Z",
    });
    const rejected = storage.rejectLlmCurationSuggestionRecord?.(database, {
      suggestionId: "suggestion-rejected",
      rejectedByIdentityId: "identity-a",
      rejectedAt: "2026-06-04T12:20:00.000Z",
      updatedAt: "2026-06-04T12:20:00.000Z",
    });

    assert.deepEqual(
      {
        materialized: {
          status: materialized.status,
          materializedCandidateKind: materialized.materializedCandidateKind,
          materializedCandidateId: materialized.materializedCandidateId,
          materializedByIdentityId: materialized.materializedByIdentityId,
          materializedAt: materialized.materializedAt,
          updatedAt: materialized.updatedAt,
        },
        rejected: {
          status: rejected.status,
          rejectedByIdentityId: rejected.rejectedByIdentityId,
          rejectedAt: rejected.rejectedAt,
          updatedAt: rejected.updatedAt,
        },
      },
      {
        materialized: {
          status: "materialized",
          materializedCandidateKind: "navigation_candidate",
          materializedCandidateId: "candidate-a",
          materializedByIdentityId: "identity-a",
          materializedAt: "2026-06-04T12:10:00.000Z",
          updatedAt: "2026-06-04T12:10:00.000Z",
        },
        rejected: {
          status: "rejected",
          rejectedByIdentityId: "identity-a",
          rejectedAt: "2026-06-04T12:20:00.000Z",
          updatedAt: "2026-06-04T12:20:00.000Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("llmCurationSuggestionStorage_shouldRejectInvalidOriginAndMaterializedKind_onExistingSuggestion", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createCorpusCandidateRecord(
      database,
      makeCorpusCandidate({ id: "candidate-a", programId: "program-a" }),
    );
    storage.createLlmCurationSuggestionRecord(
      database,
      makeLlmCurationSuggestion({ id: "suggestion-a", programId: "program-a" }),
    );

    assert.deepEqual(
      {
        missingOriginIdentity: captureStorageInvariantReason(() =>
          storage.createLlmCurationSuggestionRecord(
            database,
            {
              ...makeLlmCurationSuggestion({ id: "suggestion-missing-origin", programId: "program-a" }),
              origin: {
                ...makeLlmCurationSuggestion({ id: "suggestion-missing-origin", programId: "program-a" }).origin,
                generatedByIdentityId: "identity-missing",
              },
            },
          ),
        ),
        materializedKindMismatch: captureStorageInvariantReason(() =>
          storage.materializeLlmCurationSuggestionRecord(database, {
            suggestionId: "suggestion-a",
            candidateKind: "quick_check_candidate",
            candidateId: "candidate-a",
            materializedByIdentityId: "identity-a",
            materializedAt: "2026-06-04T12:10:00.000Z",
            updatedAt: "2026-06-04T12:10:00.000Z",
          }),
        ),
      },
      {
        missingOriginIdentity: "identity_not_found",
        materializedKindMismatch: "llm_curation_suggestion_materialized_candidate_kind_mismatch",
      },
    );
  } finally {
    database.close();
  }
});

test("restoreIdentityBackup_shouldPreserveLlmCurationSuggestions_onAcceptedBackup", () => {
  const database = makeInitializedDatabase();
  const restored = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    seedRestoreGovernance(database, { programId: "program-a" });
    storage.createCorpusCandidateRecord(
      database,
      makeCorpusCandidate({ id: "candidate-a", programId: "program-a" }),
    );
    storage.createLlmCurationSuggestionRecord(
      database,
      makeLlmCurationSuggestion({ id: "suggestion-a", programId: "program-a" }),
    );
    storage.materializeLlmCurationSuggestionRecord(database, {
      suggestionId: "suggestion-a",
      candidateKind: "navigation_candidate",
      candidateId: "candidate-a",
      materializedByIdentityId: "identity-a",
      materializedAt: "2026-06-04T12:10:00.000Z",
      updatedAt: "2026-06-04T12:10:00.000Z",
    });
    storage.createLlmCurationSuggestionGenerationRecord(
      database,
      {
        id: "generation-a",
        programId: "program-a",
        idempotencyKey: "suggestion-key-a",
        requestFingerprint: "fingerprint-a",
        suggestionIds: ["suggestion-a"],
        createdByIdentityId: "identity-a",
        createdAt: "2026-06-04T12:00:00.000Z",
      },
    );

    const backup = storage.exportIdentityBackup(database);
    storage.restoreIdentityBackup(restored, backup);

    assert.deepEqual(
      {
        suggestion: storage.getLlmCurationSuggestionRecord(restored, "suggestion-a"),
        generation: storage.getLlmCurationSuggestionGenerationRecord(restored, {
          programId: "program-a",
          idempotencyKey: "suggestion-key-a",
        }),
      },
      {
        suggestion: {
          ...makeLlmCurationSuggestion({ id: "suggestion-a", programId: "program-a" }),
          status: "materialized",
          materializedCandidateKind: "navigation_candidate",
          materializedCandidateId: "candidate-a",
          materializedByIdentityId: "identity-a",
          materializedAt: "2026-06-04T12:10:00.000Z",
          updatedAt: "2026-06-04T12:10:00.000Z",
        },
        generation: {
          id: "generation-a",
          programId: "program-a",
          idempotencyKey: "suggestion-key-a",
          requestFingerprint: "fingerprint-a",
          suggestionIds: ["suggestion-a"],
          createdByIdentityId: "identity-a",
          createdAt: "2026-06-04T12:00:00.000Z",
        },
      },
    );
  } finally {
    database.close();
    restored.close();
  }
});

test("restoreIdentityBackup_shouldRejectMalformedLlmCurationSuggestionGraph_onBackup", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    seedRestoreGovernance(database, { programId: "program-a" });
    storage.createCorpusCandidateRecord(
      database,
      makeCorpusCandidate({ id: "candidate-a", programId: "program-a" }),
    );
    storage.createLlmCurationSuggestionRecord(
      database,
      makeLlmCurationSuggestion({ id: "suggestion-a", programId: "program-a" }),
    );
    storage.createLlmCurationSuggestionGenerationRecord(
      database,
      {
        id: "generation-a",
        programId: "program-a",
        idempotencyKey: "suggestion-key-a",
        requestFingerprint: "fingerprint-a",
        suggestionIds: ["suggestion-a"],
        createdByIdentityId: "identity-a",
        createdAt: "2026-06-04T12:00:00.000Z",
      },
    );

    const backup = storage.exportIdentityBackup(database);
    const cases = [
      {
        backup: {
          ...backup,
          llmCurationSuggestions: backup.llmCurationSuggestions.map($0 => ({
            ...$0,
            status: "accepted",
          })),
        },
        reason: "llm_curation_suggestion_status_invalid",
      },
      {
        backup: {
          ...backup,
          llmCurationSuggestions: backup.llmCurationSuggestions.map($0 => ({
            ...$0,
            origin: { ...$0.origin, rawPrompt: "raw prompt" },
          })),
        },
        reason: "llm_curation_suggestion_raw_artifact_forbidden",
      },
      {
        backup: {
          ...backup,
          llmCurationSuggestions: backup.llmCurationSuggestions.map($0 => ({
            ...$0,
            status: "materialized",
            materializedCandidateKind: "navigation_candidate",
            materializedCandidateId: "candidate-missing",
            materializedByIdentityId: "identity-a",
            materializedAt: "2026-06-04T12:10:00.000Z",
          })),
        },
        reason: "llm_curation_suggestion_materialized_candidate_not_found",
      },
      {
        backup: {
          ...backup,
          llmCurationSuggestionGenerations: [
            ...backup.llmCurationSuggestionGenerations,
            {
              ...backup.llmCurationSuggestionGenerations[0],
              id: "generation-b",
            },
          ],
        },
        reason: "llm_curation_suggestion_generation_idempotency_conflict",
      },
    ];

    assert.deepEqual(
      cases.map($0 => captureRestoreInvariantReason($0.backup)),
      cases.map($0 => $0.reason),
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

test("createAcceptedCorpusRecords_shouldPersistNavigationKindsAndMaterialMetadata_onExistingCandidates", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );

    for (const acceptedKind of ["topic", "concept", "definition", "principle", "material_reference"]) {
      storage.createCorpusCandidateRecord(
        database,
        makeCorpusCandidate({
          id: `candidate-${acceptedKind}`,
          programId: "program-a",
          sourceIds: ["source-a"],
          status: "accepted",
          candidateKind: acceptedKind,
        }),
      );
      storage.createAcceptedCorpusEntityRecord(
        database,
        makeAcceptedCorpusEntity({
          id: `entity-${acceptedKind}`,
          programId: "program-a",
          acceptedKind,
          currentRevisionId: `revision-${acceptedKind}`,
        }),
      );
      storage.createAcceptedCorpusRevisionRecord(
        database,
        makeAcceptedCorpusRevision({
          id: `revision-${acceptedKind}`,
          entityId: `entity-${acceptedKind}`,
          programId: "program-a",
          acceptedFromCandidateId: `candidate-${acceptedKind}`,
          acceptedKind,
          materialReferenceKind: acceptedKind === "material_reference" ? "article" : null,
          locator: acceptedKind === "material_reference" ? "https://example.test/material" : null,
          citation: acceptedKind === "material_reference" ? "Example citation" : null,
        }),
      );
    }

    assert.deepEqual(
      storage.listAcceptedCorpusRevisionRecords(database)
        .map($0 => ({
          acceptedKind: $0.acceptedKind,
          materialReferenceKind: $0.materialReferenceKind ?? null,
          locator: $0.locator ?? null,
          citation: $0.citation ?? null,
        }))
        .sort((left, right) => left.acceptedKind.localeCompare(right.acceptedKind)),
      [
        { acceptedKind: "concept", materialReferenceKind: null, locator: null, citation: null },
        { acceptedKind: "definition", materialReferenceKind: null, locator: null, citation: null },
        {
          acceptedKind: "material_reference",
          materialReferenceKind: "article",
          locator: "https://example.test/material",
          citation: "Example citation",
        },
        { acceptedKind: "principle", materialReferenceKind: null, locator: null, citation: null },
        { acceptedKind: "topic", materialReferenceKind: null, locator: null, citation: null },
      ],
    );
    assert.deepEqual(
      {
        nonMaterialMetadata: captureStorageReason(() =>
          storage.createAcceptedCorpusRevisionRecord(
            database,
            makeAcceptedCorpusRevision({
              id: "revision-topic-invalid-material",
              entityId: "entity-topic",
              programId: "program-a",
              acceptedFromCandidateId: "candidate-topic",
              acceptedKind: "topic",
              materialReferenceKind: "article",
            }),
          ),
        ),
        missingMaterialMetadata: captureStorageReason(() =>
          storage.createAcceptedCorpusRevisionRecord(
            database,
            makeAcceptedCorpusRevision({
              id: "revision-material-invalid",
              entityId: "entity-material_reference",
              programId: "program-a",
              acceptedFromCandidateId: "candidate-material_reference",
              acceptedKind: "material_reference",
            }),
          ),
        ),
      },
      {
        nonMaterialMetadata: "accepted_material_reference_invalid",
        missingMaterialMetadata: "accepted_material_reference_invalid",
      },
    );
  } finally {
    database.close();
  }
});

test("createAcceptedNavigationRelationshipRecords_shouldPersistValidRelationshipsAndRejectWrongEndpointKinds_onAcceptedNavigationEntities", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    seedAcceptedNavigationEntity(database, { acceptedKind: "topic" });
    seedAcceptedNavigationEntity(database, { acceptedKind: "concept" });
    seedAcceptedNavigationEntity(database, { acceptedKind: "definition" });
    seedAcceptedNavigationEntity(database, { acceptedKind: "principle" });
    seedAcceptedNavigationEntity(database, { acceptedKind: "material_reference" });
    storage.createCorpusCandidateRecord(
      database,
      makeCorpusCandidate({
        id: "candidate-relationship",
        programId: "program-a",
        candidateKind: "relationship_update",
        status: "accepted",
      }),
    );

    const relationship = storage.createAcceptedNavigationRelationshipRecord(database, {
      id: "relationship-topic-concept",
      programId: "program-a",
      relationshipKind: "topic_includes_concept",
      fromEntityId: "entity-topic",
      toEntityId: "entity-concept",
      currentRevisionId: "relationship-revision-topic-concept",
    });
    const revision = storage.createAcceptedNavigationRelationshipRevisionRecord(
      database,
      makeAcceptedNavigationRelationshipRevision({
        id: "relationship-revision-topic-concept",
        relationshipId: "relationship-topic-concept",
        relationshipKind: "topic_includes_concept",
        fromEntityId: "entity-topic",
        fromRevisionId: "revision-topic",
        fromKind: "topic",
        toEntityId: "entity-concept",
        toRevisionId: "revision-concept",
        toKind: "concept",
      }),
    );

    assert.deepEqual(
      {
        relationship,
        revision,
        listed: storage.listAcceptedNavigationRelationshipRevisionRecords(database).map($0 => ({
          relationshipKind: $0.relationshipKind,
          fromKind: $0.fromKind,
          toKind: $0.toKind,
          sourceIds: $0.sourceIds,
        })),
        wrongEndpoint: captureStorageReason(() =>
          storage.createAcceptedNavigationRelationshipRecord(database, {
            id: "relationship-wrong",
            programId: "program-a",
            relationshipKind: "topic_includes_concept",
            fromEntityId: "entity-concept",
            toEntityId: "entity-topic",
            currentRevisionId: "relationship-revision-wrong",
          }),
        ),
      },
      {
        relationship: {
          id: "relationship-topic-concept",
          programId: "program-a",
          relationshipKind: "topic_includes_concept",
          fromEntityId: "entity-topic",
          toEntityId: "entity-concept",
          currentRevisionId: "relationship-revision-topic-concept",
        },
        revision: {
          id: "relationship-revision-topic-concept",
          relationshipId: "relationship-topic-concept",
          programId: "program-a",
          relationshipKind: "topic_includes_concept",
          fromEntityId: "entity-topic",
          fromRevisionId: "revision-topic",
          fromKind: "topic",
          toEntityId: "entity-concept",
          toRevisionId: "revision-concept",
          toKind: "concept",
          label: "Relationship relationship-revision-topic-concept",
          sourceIds: ["source-a"],
          acceptedFromCandidateId: "candidate-relationship",
          acceptedByIdentityId: "identity-a",
          acceptedAt: "2026-06-03T10:00:00.000Z",
        },
        listed: [
          {
            relationshipKind: "topic_includes_concept",
            fromKind: "topic",
            toKind: "concept",
            sourceIds: ["source-a"],
          },
        ],
        wrongEndpoint: "navigation_relationship_endpoint_kind_mismatch",
      },
    );
  } finally {
    database.close();
  }
});

test("createAcceptedNavigationRelationshipRecords_shouldRejectCrossProgramEndpointsAndPrerequisiteCycles_onAcceptedNavigationEntities", () => {
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
    seedAcceptedNavigationEntity(database, { acceptedKind: "concept", entityId: "concept-a", programId: "program-a" });
    seedAcceptedNavigationEntity(database, { acceptedKind: "concept", entityId: "concept-b", programId: "program-a" });
    seedAcceptedNavigationEntity(database, { acceptedKind: "concept", entityId: "concept-c", programId: "program-a" });
    seedAcceptedNavigationEntity(database, { acceptedKind: "concept", entityId: "concept-other", programId: "program-b" });

    storage.createAcceptedNavigationRelationshipRecord(database, {
      id: "relationship-a-b",
      programId: "program-a",
      relationshipKind: "concept_prerequisite",
      fromEntityId: "entity-concept-a",
      toEntityId: "entity-concept-b",
      currentRevisionId: "relationship-revision-a-b",
    });
    storage.createAcceptedNavigationRelationshipRecord(database, {
      id: "relationship-b-c",
      programId: "program-a",
      relationshipKind: "concept_prerequisite",
      fromEntityId: "entity-concept-b",
      toEntityId: "entity-concept-c",
      currentRevisionId: "relationship-revision-b-c",
    });

    assert.deepEqual(
      {
        crossProgram: captureStorageReason(() =>
          storage.createAcceptedNavigationRelationshipRecord(database, {
            id: "relationship-cross-program",
            programId: "program-a",
            relationshipKind: "concept_prerequisite",
            fromEntityId: "entity-concept-a",
            toEntityId: "entity-concept-other",
            currentRevisionId: "relationship-revision-cross-program",
          }),
        ),
        cycle: captureStorageReason(() =>
          storage.createAcceptedNavigationRelationshipRecord(database, {
            id: "relationship-c-a",
            programId: "program-a",
            relationshipKind: "concept_prerequisite",
            fromEntityId: "entity-concept-c",
            toEntityId: "entity-concept-a",
            currentRevisionId: "relationship-revision-c-a",
          }),
        ),
      },
      {
        crossProgram: "navigation_relationship_program_mismatch",
        cycle: "navigation_prerequisite_cycle",
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

test("createQuickCheckCandidateRecord_shouldPersistOptionsAnswerKeyAndListByProgramAndStatus_onExistingProgramSources", () => {
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

    const created = storage.createQuickCheckCandidateRecord?.(
      database,
      makeQuickCheckCandidate({
        id: "quick-check-candidate-a",
        programId: "program-a",
        sourceIds: ["source-a"],
      }),
    );
    storage.createQuickCheckCandidateRecord?.(
      database,
      makeQuickCheckCandidate({
        id: "quick-check-candidate-b",
        programId: "program-a",
        status: "rejected",
      }),
    );
    storage.createQuickCheckCandidateRecord?.(
      database,
      makeQuickCheckCandidate({
        id: "quick-check-candidate-c",
        programId: "program-b",
        sourceIds: ["source-b"],
      }),
    );

    assert.deepEqual(
      {
        created,
        listed: storage.listQuickCheckCandidateRecords?.(database, {
          programId: "program-a",
          status: "draft",
        }),
      },
      {
        created: {
          id: "quick-check-candidate-a",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Quick check quick-check-candidate-a",
          prompt: "Quick prompt quick-check-candidate-a",
          options: [
            { id: "quick-check-candidate-a-option-a", text: "Option A quick-check-candidate-a" },
            { id: "quick-check-candidate-a-option-b", text: "Option B quick-check-candidate-a" },
          ],
          answerKeyOptionId: "quick-check-candidate-a-option-a",
          sourceIds: ["source-a"],
          rationale: "Quick rationale quick-check-candidate-a",
          status: "draft",
          createdByIdentityId: "identity-a",
          createdAt: "2026-06-02T11:00:00.000Z",
          updatedAt: "2026-06-02T11:00:00.000Z",
        },
        listed: [
          {
            id: "quick-check-candidate-a",
            programId: "program-a",
            checkKind: "single_select_quick_check",
            title: "Quick check quick-check-candidate-a",
            prompt: "Quick prompt quick-check-candidate-a",
            options: [
              { id: "quick-check-candidate-a-option-a", text: "Option A quick-check-candidate-a" },
              { id: "quick-check-candidate-a-option-b", text: "Option B quick-check-candidate-a" },
            ],
            answerKeyOptionId: "quick-check-candidate-a-option-a",
            sourceIds: ["source-a"],
            rationale: "Quick rationale quick-check-candidate-a",
            status: "draft",
            createdByIdentityId: "identity-a",
            createdAt: "2026-06-02T11:00:00.000Z",
            updatedAt: "2026-06-02T11:00:00.000Z",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("createLearnerEvidenceTargetLinkRecord_shouldPersistIdempotentActiveLinksAndSoftDelete_onExistingProgram", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));

    const created = storage.createLearnerEvidenceTargetLinkRecord?.(
      database,
      makeLearnerEvidenceTargetLink({
        id: "target-link-a",
        targetKind: "topic",
        targetId: "entity-topic-a",
        evidenceOwnerKind: "accepted_quick_check",
        evidenceOwnerEntityId: "quick-check-entity-a",
      }),
    );
    const duplicate = storage.createLearnerEvidenceTargetLinkRecord?.(
      database,
      makeLearnerEvidenceTargetLink({
        id: "target-link-duplicate",
        targetKind: "topic",
        targetId: "entity-topic-a",
        evidenceOwnerKind: "accepted_quick_check",
        evidenceOwnerEntityId: "quick-check-entity-a",
      }),
    );
    const deleted = storage.deleteLearnerEvidenceTargetLinkRecord?.(database, {
      id: "target-link-a",
      updatedAt: "2026-06-03T11:00:00.000Z",
    });
    const recreated = storage.createLearnerEvidenceTargetLinkRecord?.(
      database,
      makeLearnerEvidenceTargetLink({
        id: "target-link-b",
        targetKind: "topic",
        targetId: "entity-topic-a",
        evidenceOwnerKind: "accepted_quick_check",
        evidenceOwnerEntityId: "quick-check-entity-a",
        createdAt: "2026-06-03T11:01:00.000Z",
        updatedAt: "2026-06-03T11:01:00.000Z",
      }),
    );

    assert.deepEqual(
      {
        created,
        duplicate,
        deleted,
        recreated,
        listed: storage.listLearnerEvidenceTargetLinkRecords?.(database, { programId: "program-a" }),
        allLinks: storage.listLearnerEvidenceTargetLinkRecords?.(database, {
          programId: "program-a",
          includeDeleted: true,
        }),
      },
      {
        created: {
          id: "target-link-a",
          programId: "program-a",
          targetKind: "topic",
          targetId: "entity-topic-a",
          evidenceOwnerKind: "accepted_quick_check",
          evidenceOwnerEntityId: "quick-check-entity-a",
          status: "active",
          createdByIdentityId: "identity-a",
          createdAt: "2026-06-03T10:00:00.000Z",
          updatedAt: "2026-06-03T10:00:00.000Z",
        },
        duplicate: {
          id: "target-link-a",
          programId: "program-a",
          targetKind: "topic",
          targetId: "entity-topic-a",
          evidenceOwnerKind: "accepted_quick_check",
          evidenceOwnerEntityId: "quick-check-entity-a",
          status: "active",
          createdByIdentityId: "identity-a",
          createdAt: "2026-06-03T10:00:00.000Z",
          updatedAt: "2026-06-03T10:00:00.000Z",
        },
        deleted: {
          id: "target-link-a",
          programId: "program-a",
          targetKind: "topic",
          targetId: "entity-topic-a",
          evidenceOwnerKind: "accepted_quick_check",
          evidenceOwnerEntityId: "quick-check-entity-a",
          status: "deleted",
          createdByIdentityId: "identity-a",
          createdAt: "2026-06-03T10:00:00.000Z",
          updatedAt: "2026-06-03T11:00:00.000Z",
        },
        recreated: {
          id: "target-link-b",
          programId: "program-a",
          targetKind: "topic",
          targetId: "entity-topic-a",
          evidenceOwnerKind: "accepted_quick_check",
          evidenceOwnerEntityId: "quick-check-entity-a",
          status: "active",
          createdByIdentityId: "identity-a",
          createdAt: "2026-06-03T11:01:00.000Z",
          updatedAt: "2026-06-03T11:01:00.000Z",
        },
        listed: [
          {
            id: "target-link-b",
            programId: "program-a",
            targetKind: "topic",
            targetId: "entity-topic-a",
            evidenceOwnerKind: "accepted_quick_check",
            evidenceOwnerEntityId: "quick-check-entity-a",
            status: "active",
            createdByIdentityId: "identity-a",
            createdAt: "2026-06-03T11:01:00.000Z",
            updatedAt: "2026-06-03T11:01:00.000Z",
          },
        ],
        allLinks: [
          {
            id: "target-link-a",
            programId: "program-a",
            targetKind: "topic",
            targetId: "entity-topic-a",
            evidenceOwnerKind: "accepted_quick_check",
            evidenceOwnerEntityId: "quick-check-entity-a",
            status: "deleted",
            createdByIdentityId: "identity-a",
            createdAt: "2026-06-03T10:00:00.000Z",
            updatedAt: "2026-06-03T11:00:00.000Z",
          },
          {
            id: "target-link-b",
            programId: "program-a",
            targetKind: "topic",
            targetId: "entity-topic-a",
            evidenceOwnerKind: "accepted_quick_check",
            evidenceOwnerEntityId: "quick-check-entity-a",
            status: "active",
            createdByIdentityId: "identity-a",
            createdAt: "2026-06-03T11:01:00.000Z",
            updatedAt: "2026-06-03T11:01:00.000Z",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("restoreIdentityBackup_shouldPreserveLearnerEvidenceTargetLinks_onAcceptedBackup", () => {
  const database = makeInitializedDatabase();
  const restored = makeInitializedDatabase();

  try {
    seedAcceptedQuickCheck(database, { programId: "program-a" });
    seedAcceptedNavigationEntity(database, { acceptedKind: "topic", entityId: "topic-a" });
    seedAcceptedLearnerStateTargetLinkCrossProgramReferences(database);
    storage.createProgramMembershipRecord(database, {
      id: "membership-a",
      programId: "program-a",
      identityId: "identity-a",
      participationKind: "program_curator",
      status: "active",
      createdAt: "2026-06-03T09:00:00.000Z",
      updatedAt: "2026-06-03T09:00:00.000Z",
    });
    storage.grantAdminAuthority(database, {
      identityId: "identity-a",
      grantedAt: "2026-06-03T09:00:00.000Z",
    });
    storage.createLearnerEvidenceTargetLinkRecord(
      database,
      makeLearnerEvidenceTargetLink({
        id: "target-link-a",
        targetKind: "topic",
        targetId: "entity-topic-a",
        evidenceOwnerKind: "accepted_quick_check",
        evidenceOwnerEntityId: "quick-check-entity-a",
      }),
    );
    storage.deleteLearnerEvidenceTargetLinkRecord(database, {
      id: "target-link-a",
      updatedAt: "2026-06-03T11:00:00.000Z",
    });
    storage.createLearnerEvidenceTargetLinkRecord(
      database,
      makeLearnerEvidenceTargetLink({
        id: "target-link-b",
        targetKind: "topic",
        targetId: "entity-topic-a",
        evidenceOwnerKind: "accepted_quick_check",
        evidenceOwnerEntityId: "quick-check-entity-a",
        createdAt: "2026-06-03T11:01:00.000Z",
        updatedAt: "2026-06-03T11:01:00.000Z",
      }),
    );

    const backup = storage.exportIdentityBackup(database);
    storage.restoreIdentityBackup(restored, backup);

    assert.deepEqual(
      {
        exported: backup.learnerEvidenceTargetLinks?.map($0 => ({
          id: $0.id,
          status: $0.status,
        })),
        restored: storage
          .listLearnerEvidenceTargetLinkRecords(restored, {
            programId: "program-a",
            includeDeleted: true,
          })
          .map($0 => ({
            id: $0.id,
            status: $0.status,
          })),
      },
      {
        exported: [
          { id: "target-link-a", status: "deleted" },
          { id: "target-link-b", status: "active" },
        ],
        restored: [
          { id: "target-link-a", status: "deleted" },
          { id: "target-link-b", status: "active" },
        ],
      },
    );
  } finally {
    database.close();
    restored.close();
  }
});

test("restoreIdentityBackup_shouldRejectMalformedLearnerEvidenceTargetLinks_onBackup", () => {
  const database = makeInitializedDatabase();
  const restored = makeInitializedDatabase();

  try {
    seedAcceptedQuickCheck(database, { programId: "program-a" });
    seedAcceptedNavigationEntity(database, { acceptedKind: "topic", entityId: "topic-a" });
    seedAcceptedLearnerStateTargetLinkCrossProgramReferences(database);
    storage.createProgramMembershipRecord(database, {
      id: "membership-a",
      programId: "program-a",
      identityId: "identity-a",
      participationKind: "program_curator",
      status: "active",
      createdAt: "2026-06-03T09:00:00.000Z",
      updatedAt: "2026-06-03T09:00:00.000Z",
    });
    storage.grantAdminAuthority(database, {
      identityId: "identity-a",
      grantedAt: "2026-06-03T09:00:00.000Z",
    });
    storage.createLearnerEvidenceTargetLinkRecord(
      database,
      makeLearnerEvidenceTargetLink({
        id: "target-link-a",
        targetKind: "topic",
        targetId: "entity-topic-a",
        evidenceOwnerKind: "accepted_quick_check",
        evidenceOwnerEntityId: "quick-check-entity-a",
      }),
    );

    const backup = storage.exportIdentityBackup(database);
    const cases = [
      {
        mutate: candidate => {
          candidate.learnerEvidenceTargetLinks[0] = {
            ...candidate.learnerEvidenceTargetLinks[0],
            programId: "missing-program",
          };
        },
        reason: "program_not_found",
      },
      {
        mutate: candidate => {
          candidate.learnerEvidenceTargetLinks[0] = {
            ...candidate.learnerEvidenceTargetLinks[0],
            createdByIdentityId: "missing-identity",
          };
        },
        reason: "identity_not_found",
      },
      {
        mutate: candidate => {
          candidate.learnerEvidenceTargetLinks[0] = {
            ...candidate.learnerEvidenceTargetLinks[0],
            targetKind: "program",
          };
        },
        reason: "learner_state_target_kind_invalid",
      },
      {
        mutate: candidate => {
          candidate.learnerEvidenceTargetLinks[0] = {
            ...candidate.learnerEvidenceTargetLinks[0],
            targetId: "missing-target",
          };
        },
        reason: "accepted_entity_not_found",
      },
      {
        mutate: candidate => {
          candidate.learnerEvidenceTargetLinks[0] = {
            ...candidate.learnerEvidenceTargetLinks[0],
            targetId: "entity-topic-b",
          };
        },
        reason: "learner_state_target_program_mismatch",
      },
      {
        mutate: candidate => {
          candidate.learnerEvidenceTargetLinks[0] = {
            ...candidate.learnerEvidenceTargetLinks[0],
            evidenceOwnerEntityId: "missing-quick-check",
          };
        },
        reason: "quick_check_entity_not_found",
      },
      {
        mutate: candidate => {
          candidate.learnerEvidenceTargetLinks[0] = {
            ...candidate.learnerEvidenceTargetLinks[0],
            evidenceOwnerEntityId: "quick-check-entity-b",
          };
        },
        reason: "learner_state_evidence_owner_program_mismatch",
      },
      {
        mutate: candidate => {
          candidate.learnerEvidenceTargetLinks.push({
            ...candidate.learnerEvidenceTargetLinks[0],
            id: "target-link-duplicate",
          });
        },
        reason: "learner_state_target_link_idempotency_conflict",
      },
      {
        mutate: candidate => {
          candidate.learnerEvidenceTargetLinks.push({
            ...candidate.learnerEvidenceTargetLinks[0],
            targetId: "entity-topic-b",
          });
        },
        reason: "learner_state_target_link_id_conflict",
      },
    ];

    assert.deepEqual(
      cases.map(testCase => {
        const candidateBackup = structuredClone(backup);
        testCase.mutate(candidateBackup);
        const reason = captureStorageInvariantReason(() =>
          storage.restoreIdentityBackup(restored, candidateBackup),
        );
        assert.deepEqual(storage.listLearnerEvidenceTargetLinkRecords(restored), []);
        return reason;
      }),
      cases.map($0 => $0.reason),
    );
  } finally {
    database.close();
    restored.close();
  }
});

test("createAcceptedQuickCheckRecords_shouldPersistEntityCurrentRevisionAndHistoricalOptions_onExistingCandidate", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    storage.createQuickCheckCandidateRecord(
      database,
      makeQuickCheckCandidate({
        id: "quick-check-candidate-a",
        programId: "program-a",
        sourceIds: ["source-a"],
      }),
    );

    const entity = storage.createAcceptedQuickCheckEntityRecord?.(
      database,
      makeAcceptedQuickCheckEntity({
        id: "quick-check-entity-a",
        programId: "program-a",
        currentRevisionId: "quick-check-revision-a",
      }),
    );
    const revision = storage.createAcceptedQuickCheckRevisionRecord?.(
      database,
      makeAcceptedQuickCheckRevision({
        id: "quick-check-revision-a",
        entityId: "quick-check-entity-a",
        programId: "program-a",
        acceptedFromCandidateId: "quick-check-candidate-a",
        sourceIds: ["source-a"],
      }),
    );
    storage.createAcceptedQuickCheckRevisionRecord?.(
      database,
      makeAcceptedQuickCheckRevision({
        id: "quick-check-revision-b",
        entityId: "quick-check-entity-a",
        programId: "program-a",
        acceptedFromCandidateId: "quick-check-candidate-a",
        sourceIds: ["source-a"],
      }),
    );

    assert.deepEqual(
      {
        entity,
        revision,
        updatedEntity: storage.updateAcceptedQuickCheckEntityCurrentRevision?.(database, {
          entityId: "quick-check-entity-a",
          currentRevisionId: "quick-check-revision-b",
        }),
        historicalRevision: storage.getAcceptedQuickCheckRevisionRecord?.(
          database,
          "quick-check-revision-a",
        ),
      },
      {
        entity: {
          id: "quick-check-entity-a",
          programId: "program-a",
          currentRevisionId: "quick-check-revision-a",
        },
        revision: {
          id: "quick-check-revision-a",
          entityId: "quick-check-entity-a",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Accepted quick check quick-check-revision-a",
          prompt: "Accepted quick prompt quick-check-revision-a",
          options: [
            { id: "quick-check-revision-a-option-a", text: "Accepted option A quick-check-revision-a" },
            { id: "quick-check-revision-a-option-b", text: "Accepted option B quick-check-revision-a" },
          ],
          answerKeyOptionId: "quick-check-revision-a-option-a",
          acceptedFromCandidateId: "quick-check-candidate-a",
          sourceIds: ["source-a"],
          rationale: "Accepted quick rationale quick-check-revision-a",
          acceptedByIdentityId: "identity-a",
          acceptedAt: "2026-06-02T11:10:00.000Z",
        },
        updatedEntity: {
          id: "quick-check-entity-a",
          programId: "program-a",
          currentRevisionId: "quick-check-revision-b",
        },
        historicalRevision: {
          id: "quick-check-revision-a",
          entityId: "quick-check-entity-a",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Accepted quick check quick-check-revision-a",
          prompt: "Accepted quick prompt quick-check-revision-a",
          options: [
            { id: "quick-check-revision-a-option-a", text: "Accepted option A quick-check-revision-a" },
            { id: "quick-check-revision-a-option-b", text: "Accepted option B quick-check-revision-a" },
          ],
          answerKeyOptionId: "quick-check-revision-a-option-a",
          acceptedFromCandidateId: "quick-check-candidate-a",
          sourceIds: ["source-a"],
          rationale: "Accepted quick rationale quick-check-revision-a",
          acceptedByIdentityId: "identity-a",
          acceptedAt: "2026-06-02T11:10:00.000Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("quickCheckStorage_shouldRejectMalformedOptionCollectionsAndAnswerKeys_onInvalidGraphs", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );
    storage.createQuickCheckCandidateRecord(
      database,
      makeQuickCheckCandidate({
        id: "quick-check-candidate-a",
        programId: "program-a",
        sourceIds: ["source-a"],
      }),
    );
    storage.createAcceptedQuickCheckEntityRecord(
      database,
      makeAcceptedQuickCheckEntity({
        id: "quick-check-entity-a",
        programId: "program-a",
        currentRevisionId: "quick-check-revision-a",
      }),
    );

    assert.deepEqual(
      {
        candidateWithOneOption: captureStorageInvariantReason(() =>
          storage.createQuickCheckCandidateRecord(
            database,
            makeQuickCheckCandidate({
              id: "quick-check-candidate-one-option",
              programId: "program-a",
              sourceIds: ["source-a"],
              options: [{ id: "quick-check-candidate-one-option-option-a", text: "Only option" }],
              answerKeyOptionId: "quick-check-candidate-one-option-option-a",
            }),
          ),
        ),
        candidateWithDuplicateOptionIds: captureStorageInvariantReason(() =>
          storage.createQuickCheckCandidateRecord(
            database,
            makeQuickCheckCandidate({
              id: "quick-check-candidate-duplicate-options",
              programId: "program-a",
              sourceIds: ["source-a"],
              options: [
                { id: "duplicate-option", text: "First" },
                { id: "duplicate-option", text: "Second" },
              ],
              answerKeyOptionId: "duplicate-option",
            }),
          ),
        ),
        candidateWithMissingAnswerKey: captureStorageInvariantReason(() =>
          storage.createQuickCheckCandidateRecord(
            database,
            makeQuickCheckCandidate({
              id: "quick-check-candidate-missing-answer",
              programId: "program-a",
              sourceIds: ["source-a"],
              answerKeyOptionId: "missing-option",
            }),
          ),
        ),
        revisionWithEmptyOptionText: captureStorageInvariantReason(() =>
          storage.createAcceptedQuickCheckRevisionRecord(
            database,
            makeAcceptedQuickCheckRevision({
              id: "quick-check-revision-empty-option",
              entityId: "quick-check-entity-a",
              programId: "program-a",
              acceptedFromCandidateId: "quick-check-candidate-a",
              sourceIds: ["source-a"],
              options: [
                { id: "quick-check-revision-empty-option-option-a", text: "Correct" },
                { id: "quick-check-revision-empty-option-option-b", text: "" },
              ],
              answerKeyOptionId: "quick-check-revision-empty-option-option-a",
            }),
          ),
        ),
        revisionWithMissingAnswerKey: captureStorageInvariantReason(() =>
          storage.createAcceptedQuickCheckRevisionRecord(
            database,
            makeAcceptedQuickCheckRevision({
              id: "quick-check-revision-missing-answer",
              entityId: "quick-check-entity-a",
              programId: "program-a",
              acceptedFromCandidateId: "quick-check-candidate-a",
              sourceIds: ["source-a"],
              answerKeyOptionId: "missing-option",
            }),
          ),
        ),
      },
      {
        candidateWithOneOption: "quick_check_option_collection_invalid",
        candidateWithDuplicateOptionIds: "quick_check_option_collection_invalid",
        candidateWithMissingAnswerKey: "quick_check_answer_key_option_mismatch",
        revisionWithEmptyOptionText: "quick_check_option_collection_invalid",
        revisionWithMissingAnswerKey: "quick_check_answer_key_option_mismatch",
      },
    );
  } finally {
    database.close();
  }
});

test("createQuickCheckAttemptRecord_shouldPersistImmutableAttemptReferences_onExistingAcceptedRevision", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedQuickCheck(database, { programId: "program-a" });

    assert.deepEqual(
      {
        created: storage.createQuickCheckAttemptRecord?.(
          database,
          makeQuickCheckAttempt({
            id: "quick-check-attempt-a",
            programId: "program-a",
            studentIdentityId: "identity-a",
            checkRevisionId: "quick-check-revision-a",
            selectedOptionId: "quick-check-revision-a-option-a",
            matched: true,
          }),
        ),
        listed: storage.listQuickCheckAttemptRecords?.(database, {
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "quick-check-revision-a",
        }).map($0 => $0.id),
      },
      {
        created: {
          id: "quick-check-attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "quick-check-revision-a",
          selectedOptionId: "quick-check-revision-a-option-a",
          matched: true,
          idempotencyKey: "idempotency-quick-check-attempt-a",
          submittedAt: "2026-06-02T11:20:00.000Z",
        },
        listed: ["quick-check-attempt-a"],
      },
    );
  } finally {
    database.close();
  }
});

test("createReadinessCheckCandidateRecord_shouldPersistTopicAndPeriodScopes_onExistingProgramSources", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramSourceRecord(database, makeProgramSource({ id: "source-a", programId: "program-a" }));
    seedAcceptedNavigationEntity(database, { acceptedKind: "topic", entityId: "topic-a" });
    seedAcceptedNavigationEntity(database, { acceptedKind: "concept", entityId: "concept-a" });

    const topicCandidate = storage.createReadinessCheckCandidateRecord?.(
      database,
      makeReadinessCheckCandidate({
        id: "readiness-candidate-topic",
        programId: "program-a",
        sourceIds: ["source-a"],
      }),
    );
    const periodCandidate = storage.createReadinessCheckCandidateRecord?.(
      database,
      makeReadinessCheckCandidate({
        id: "readiness-candidate-period",
        programId: "program-a",
        scope: {
          scopeKind: "period",
          title: "First algebra period",
          topicEntityIds: ["entity-topic-a"],
        },
        sourceIds: ["source-a"],
      }),
    );

    assert.deepEqual(
      {
        topicCandidate,
        periodCandidate,
        listed: storage.listReadinessCheckCandidateRecords?.(database, {
          programId: "program-a",
          status: "draft",
        }).map($0 => $0.id),
      },
      {
        topicCandidate: makeReadinessCheckCandidate({
          id: "readiness-candidate-topic",
          programId: "program-a",
          sourceIds: ["source-a"],
        }),
        periodCandidate: makeReadinessCheckCandidate({
          id: "readiness-candidate-period",
          programId: "program-a",
          scope: {
            scopeKind: "period",
            title: "First algebra period",
            topicEntityIds: ["entity-topic-a"],
          },
          sourceIds: ["source-a"],
        }),
        listed: ["readiness-candidate-period", "readiness-candidate-topic"],
      },
    );
  } finally {
    database.close();
  }
});

test("createAcceptedReadinessCheckRecords_shouldPreserveHistoricalRevisions_onReplacement", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedReadinessCheck(database, { programId: "program-a" });
    storage.createReadinessCheckCandidateRecord(
      database,
      makeReadinessCheckCandidate({
        id: "readiness-candidate-replacement",
        programId: "program-a",
        sourceIds: ["source-a"],
        status: "accepted",
      }),
    );
    storage.createAcceptedReadinessCheckRevisionRecord(
      database,
      makeAcceptedReadinessCheckRevision({
        id: "readiness-revision-replacement",
        entityId: "readiness-entity-a",
        programId: "program-a",
        acceptedFromCandidateId: "readiness-candidate-replacement",
        sourceIds: ["source-a"],
      }),
    );

    assert.deepEqual(
      {
        updatedEntity: storage.updateAcceptedReadinessCheckEntityCurrentRevision?.(database, {
          entityId: "readiness-entity-a",
          currentRevisionId: "readiness-revision-replacement",
        }),
        historicalRevision: storage.getAcceptedReadinessCheckRevisionRecord?.(
          database,
          "readiness-revision-a",
        ),
        revisionIds: storage.listAcceptedReadinessCheckRevisionRecords?.(database).map($0 => $0.id),
      },
      {
        updatedEntity: {
          id: "readiness-entity-a",
          programId: "program-a",
          currentRevisionId: "readiness-revision-replacement",
        },
        historicalRevision: makeAcceptedReadinessCheckRevision({
          id: "readiness-revision-a",
          entityId: "readiness-entity-a",
          programId: "program-a",
          acceptedFromCandidateId: "readiness-candidate-a",
          sourceIds: ["source-a"],
        }),
        revisionIds: ["readiness-revision-a", "readiness-revision-replacement"],
      },
    );
  } finally {
    database.close();
  }
});

test("createReadinessCheckAttemptRecord_shouldPersistRequirementSnapshotsAndIdempotency_onAcceptedRevision", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedReadinessCheck(database, { programId: "program-a" });

    const original = storage.createReadinessCheckAttemptRecord?.(
      database,
      makeReadinessCheckAttempt({
        id: "readiness-attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        readinessCheckRevisionId: "readiness-revision-a",
      }),
    );

    assert.deepEqual(
      {
        original,
        equivalentRetry: storage.createReadinessCheckAttemptRecord?.(
          database,
          makeReadinessCheckAttempt({
            id: "readiness-attempt-b",
            programId: "program-a",
            studentIdentityId: "identity-a",
            readinessCheckRevisionId: "readiness-revision-a",
          }),
        ),
        conflict: captureStorageInvariantReason(() =>
          storage.createReadinessCheckAttemptRecord(
            database,
            makeReadinessCheckAttempt({
              id: "readiness-attempt-c",
              programId: "program-a",
              studentIdentityId: "identity-a",
              readinessCheckRevisionId: "readiness-revision-a",
              result: "not_ready",
              requirementResults: [
                {
                  requirementId: "requirement-a",
                  targetKind: "topic",
                  targetId: "entity-topic-a",
                  title: "Topic A",
                  requiredLevel: "on_track",
                  observedLevel: "developing",
                  evidenceCount: 1,
                  result: "not_ready",
                },
                {
                  requirementId: "requirement-b",
                  targetKind: "concept",
                  targetId: "entity-concept-a",
                  title: "Concept A",
                  requiredLevel: "developing",
                  observedLevel: "developing",
                  evidenceCount: 1,
                  result: "ready",
                },
              ],
            }),
          ),
        ),
        listed: storage.listReadinessCheckAttemptRecords?.(database, {
          programId: "program-a",
          studentIdentityId: "identity-a",
        }).map($0 => $0.id),
      },
      {
        original: makeReadinessCheckAttempt({
          id: "readiness-attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          readinessCheckRevisionId: "readiness-revision-a",
        }),
        equivalentRetry: makeReadinessCheckAttempt({
          id: "readiness-attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          readinessCheckRevisionId: "readiness-revision-a",
        }),
        conflict: "readiness_attempt_idempotency_conflict",
        listed: ["readiness-attempt-a"],
      },
    );
  } finally {
    database.close();
  }
});

test("createReadinessCheckAttemptRecord_shouldRejectResultMismatches_onInconsistentSnapshots", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedReadinessCheck(database, { programId: "program-a" });

    assert.deepEqual(
      {
        requirementResultMismatch: captureStorageInvariantReason(() =>
          storage.createReadinessCheckAttemptRecord(
            database,
            makeReadinessCheckAttempt({
              id: "readiness-attempt-mismatched-requirement",
              programId: "program-a",
              studentIdentityId: "identity-a",
              readinessCheckRevisionId: "readiness-revision-a",
              requirementResults: [
                {
                  requirementId: "requirement-a",
                  targetKind: "topic",
                  targetId: "entity-topic-a",
                  title: "Topic A",
                  requiredLevel: "on_track",
                  observedLevel: "no_evidence",
                  evidenceCount: 0,
                  result: "ready",
                },
                {
                  requirementId: "requirement-b",
                  targetKind: "concept",
                  targetId: "entity-concept-a",
                  title: "Concept A",
                  requiredLevel: "developing",
                  observedLevel: "developing",
                  evidenceCount: 1,
                  result: "ready",
                },
              ],
            }),
          ),
        ),
        attemptResultMismatch: captureStorageInvariantReason(() =>
          storage.createReadinessCheckAttemptRecord(
            database,
            makeReadinessCheckAttempt({
              id: "readiness-attempt-mismatched-attempt",
              programId: "program-a",
              studentIdentityId: "identity-a",
              readinessCheckRevisionId: "readiness-revision-a",
              result: "in_progress",
              requirementResults: [
                {
                  requirementId: "requirement-a",
                  targetKind: "topic",
                  targetId: "entity-topic-a",
                  title: "Topic A",
                  requiredLevel: "on_track",
                  observedLevel: "needs_attention",
                  evidenceCount: 1,
                  result: "not_ready",
                },
                {
                  requirementId: "requirement-b",
                  targetKind: "concept",
                  targetId: "entity-concept-a",
                  title: "Concept A",
                  requiredLevel: "developing",
                  observedLevel: "in_progress",
                  evidenceCount: 1,
                  result: "in_progress",
                },
              ],
            }),
          ),
        ),
      },
      {
        requirementResultMismatch: "readiness_requirement_result_mismatch",
        attemptResultMismatch: "readiness_attempt_result_mismatch",
      },
    );
  } finally {
    database.close();
  }
});

test("createQuickCheckAttemptRecord_shouldEnforceScopedIdempotency_onEquivalentAndConflictingReuse", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedQuickCheck(database, { programId: "program-a" });
    createIdentity(database, makeIdentity("identity-b"));

    const original = storage.createQuickCheckAttemptRecord(
      database,
      makeQuickCheckAttempt({
        id: "quick-check-attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "quick-check-revision-a",
        selectedOptionId: "quick-check-revision-a-option-a",
        matched: true,
        idempotencyKey: "same-key",
      }),
    );
    storage.createQuickCheckAttemptRecord(
      database,
      makeQuickCheckAttempt({
        id: "quick-check-attempt-b",
        programId: "program-a",
        studentIdentityId: "identity-b",
        checkRevisionId: "quick-check-revision-a",
        selectedOptionId: "quick-check-revision-a-option-a",
        matched: true,
        idempotencyKey: "same-key",
      }),
    );

    assert.deepEqual(
      {
        equivalentRetry: storage.createQuickCheckAttemptRecord(
          database,
          makeQuickCheckAttempt({
            id: "quick-check-attempt-c",
            programId: "program-a",
            studentIdentityId: "identity-a",
            checkRevisionId: "quick-check-revision-a",
            selectedOptionId: "quick-check-revision-a-option-a",
            matched: true,
            idempotencyKey: "same-key",
          }),
        ),
        conflict: captureStorageInvariantReason(() =>
          storage.createQuickCheckAttemptRecord(
            database,
            makeQuickCheckAttempt({
              id: "quick-check-attempt-d",
              programId: "program-a",
              studentIdentityId: "identity-a",
              checkRevisionId: "quick-check-revision-a",
              selectedOptionId: "quick-check-revision-a-option-b",
              matched: false,
              idempotencyKey: "same-key",
            }),
          ),
        ),
        attemptIds: storage.listQuickCheckAttemptRecords(database, {
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "quick-check-revision-a",
        }).map($0 => $0.id),
      },
      {
        equivalentRetry: original,
        conflict: "quick_check_attempt_idempotency_conflict",
        attemptIds: ["quick-check-attempt-a"],
      },
    );
  } finally {
    database.close();
  }
});

test("createQuickCheckAttemptRecord_shouldRejectMalformedMatchedResult_onNonBooleanMatched", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedQuickCheck(database, { programId: "program-a" });

    assert.equal(
      captureStorageInvariantReason(() =>
        storage.createQuickCheckAttemptRecord(
          database,
          makeQuickCheckAttempt({
            id: "quick-check-attempt-a",
            programId: "program-a",
            studentIdentityId: "identity-a",
            checkRevisionId: "quick-check-revision-a",
            selectedOptionId: "quick-check-revision-a-option-a",
            matched: "true",
          }),
        ),
      ),
      "quick_check_attempt_matched_invalid",
    );
  } finally {
    database.close();
  }
});

test("quickCheckStorage_shouldScopeOptionIdentifiersToCandidateAndRevision_onRepeatedOptionIds", () => {
  const database = makeInitializedDatabase();

  try {
    createIdentity(database, makeIdentity("identity-a"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));
    storage.createProgramSourceRecord(
      database,
      makeProgramSource({ id: "source-a", programId: "program-a" }),
    );

    storage.createQuickCheckCandidateRecord(
      database,
      makeQuickCheckCandidate({
        id: "quick-check-candidate-a",
        programId: "program-a",
        sourceIds: ["source-a"],
        options: [
          { id: "option-a", text: "Candidate A option A" },
          { id: "option-b", text: "Candidate A option B" },
        ],
        answerKeyOptionId: "option-a",
      }),
    );
    storage.createQuickCheckCandidateRecord(
      database,
      makeQuickCheckCandidate({
        id: "quick-check-candidate-b",
        programId: "program-a",
        sourceIds: ["source-a"],
        options: [
          { id: "option-a", text: "Candidate B option A" },
          { id: "option-b", text: "Candidate B option B" },
        ],
        answerKeyOptionId: "option-b",
      }),
    );
    storage.createAcceptedQuickCheckEntityRecord(
      database,
      makeAcceptedQuickCheckEntity({
        id: "quick-check-entity-a",
        programId: "program-a",
        currentRevisionId: "quick-check-revision-a",
      }),
    );
    storage.createAcceptedQuickCheckRevisionRecord(
      database,
      makeAcceptedQuickCheckRevision({
        id: "quick-check-revision-a",
        entityId: "quick-check-entity-a",
        programId: "program-a",
        acceptedFromCandidateId: "quick-check-candidate-a",
        sourceIds: ["source-a"],
        options: [
          { id: "option-a", text: "Revision A option A" },
          { id: "option-b", text: "Revision A option B" },
        ],
        answerKeyOptionId: "option-a",
      }),
    );
    storage.createAcceptedQuickCheckRevisionRecord(
      database,
      makeAcceptedQuickCheckRevision({
        id: "quick-check-revision-b",
        entityId: "quick-check-entity-a",
        programId: "program-a",
        acceptedFromCandidateId: "quick-check-candidate-b",
        sourceIds: ["source-a"],
        options: [
          { id: "option-a", text: "Revision B option A" },
          { id: "option-b", text: "Revision B option B" },
        ],
        answerKeyOptionId: "option-b",
      }),
    );

    assert.deepEqual(
      {
        candidateOptionIds: storage.listQuickCheckCandidateRecords(database, {
          programId: "program-a",
        }).map($0 => $0.options.map($1 => $1.id)),
        revisionOptionIds: storage
          .listAcceptedQuickCheckRevisionRecords(database)
          .map($0 => $0.options.map($1 => $1.id)),
      },
      {
        candidateOptionIds: [
          ["option-a", "option-b"],
          ["option-a", "option-b"],
        ],
        revisionOptionIds: [
          ["option-a", "option-b"],
          ["option-a", "option-b"],
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("quickCheckAttemptStorage_shouldRejectRawSelectedOptionOutsideRevision_onDatabaseConstraint", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedQuickCheck(database, { programId: "program-a" });
    storage.createQuickCheckCandidateRecord(
      database,
      makeQuickCheckCandidate({
        id: "quick-check-candidate-b",
        programId: "program-a",
        sourceIds: ["source-a"],
      }),
    );
    storage.createAcceptedQuickCheckRevisionRecord(
      database,
      makeAcceptedQuickCheckRevision({
        id: "quick-check-revision-b",
        entityId: "quick-check-entity-a",
        programId: "program-a",
        acceptedFromCandidateId: "quick-check-candidate-b",
        sourceIds: ["source-a"],
      }),
    );

    assert.throws(
      () =>
        database
          .prepare(
            `insert into quick_check_attempts (
               id,
               program_id,
               student_identity_id,
               check_revision_id,
               selected_option_id,
               matched,
               idempotency_key,
               submitted_at
             ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            "quick-check-attempt-raw",
            "program-a",
            "identity-a",
            "quick-check-revision-a",
            "quick-check-revision-b-option-a",
            0,
            "raw-key",
            "2026-06-02T11:20:00.000Z",
          ),
      error => error.code === "SQLITE_CONSTRAINT_FOREIGNKEY",
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

test("createOpenAnswerEvaluatorRunRecord_shouldPersistRunReferences_onExistingAttempt", () => {
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
      storage.createOpenAnswerEvaluatorRunRecord?.(
        database,
        makeOpenAnswerEvaluatorRun({
          id: "evaluator-run-a",
          attemptId: "attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
        }),
      ),
      {
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        evaluatorPathKind: "deterministic",
        evaluatorPolicyId: "policy-a",
        status: "running",
        requestedByIdentityId: "identity-a",
        reviewerIdentityId: null,
        reviewerCapability: null,
        startedAt: "2026-06-02T10:20:00.000Z",
        completedAt: null,
        failedAt: null,
        failureReason: null,
        priorFailureReason: null,
        priorFailedAt: null,
      },
    );
  } finally {
    database.close();
  }
});

test("createOpenAnswerEvaluatorRunRecord_shouldPersistWaitingJobState_onEvaluatorRun", () => {
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
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        jobStatus: "waiting",
        attemptNumber: 1,
        retryPolicy: { maxAttempts: 3, backoffSeconds: [60, 300] },
        budgetPolicy: {
          maxProviderCalls: 2,
          maxInputTokens: 4000,
          maxOutputTokens: 1000,
          maxEstimatedCostMinorUnits: 150,
        },
      }),
    );

    assert.deepEqual(storage.getOpenAnswerEvaluatorJobRecord?.(database, "evaluator-run-a"), {
      evaluatorJobId: "evaluator-run-a",
      evaluatorRunId: "evaluator-run-a",
      attemptId: "attempt-a",
      programId: "program-a",
      studentIdentityId: "identity-a",
      checkRevisionId: "check-revision-a",
      criterionRevisionIds: ["criterion-revision-a"],
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      runStatus: "running",
      jobStatus: "waiting",
      attemptNumber: 1,
      retryPolicy: { maxAttempts: 3, backoffSeconds: [60, 300] },
      budgetPolicy: {
        maxProviderCalls: 2,
        maxInputTokens: 4000,
        maxOutputTokens: 1000,
        maxEstimatedCostMinorUnits: 150,
      },
      lease: null,
      nextRetryAt: null,
      cancellationReason: null,
      timeoutReason: null,
      jobFailureReason: null,
      createdAt: "2026-06-02T10:20:00.000Z",
      updatedAt: "2026-06-02T10:20:00.000Z",
    });
  } finally {
    database.close();
  }
});

test("createOpenAnswerEvaluatorRunRecord_shouldRejectMalformedJobState_onInvalidOrchestrationFields", () => {
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
      [
        makeOpenAnswerEvaluatorRun({
          id: "evaluator-run-a",
          attemptId: "attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
          jobStatus: "unknown",
          attemptNumber: 1,
          retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
        }),
        makeOpenAnswerEvaluatorRun({
          id: "evaluator-run-b",
          attemptId: "attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
          jobStatus: "waiting",
          attemptNumber: 0,
          retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
        }),
        makeOpenAnswerEvaluatorRun({
          id: "evaluator-run-c",
          attemptId: "attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
          jobStatus: "waiting",
          attemptNumber: 1,
          retryPolicy: { maxAttempts: 3, backoffSeconds: [60] },
        }),
        makeOpenAnswerEvaluatorRun({
          id: "evaluator-run-d",
          attemptId: "attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
          jobStatus: "waiting",
          attemptNumber: 1,
          retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
          budgetPolicy: { maxProviderCalls: -1 },
        }),
        makeOpenAnswerEvaluatorRun({
          id: "evaluator-run-e",
          attemptId: "attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
          jobStatus: "leased",
          attemptNumber: 1,
          retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
        }),
      ].map(input =>
        captureStorageInvariantReason(() => storage.createOpenAnswerEvaluatorRunRecord(database, input)),
      ),
      [
        "validation_failed",
        "validation_failed",
        "validation_failed",
        "validation_failed",
        "validation_failed",
      ],
    );
  } finally {
    database.close();
  }
});

test("updateOpenAnswerEvaluatorJobLease_shouldPreserveRunStatus_onExistingRun", () => {
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
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        jobStatus: "waiting",
        attemptNumber: 1,
        retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      }),
    );

    storage.updateOpenAnswerEvaluatorJobLease?.(database, {
      evaluatorJobId: "evaluator-run-a",
      leaseId: "lease-a",
      workerId: "worker-a",
      claimedAt: "2026-06-02T10:30:00.000Z",
      expiresAt: "2026-06-02T10:35:00.000Z",
    });

    assert.deepEqual(
      {
        runStatus: storage.getOpenAnswerEvaluatorRunRecord(database, "evaluator-run-a").status,
        job: storage.getOpenAnswerEvaluatorJobRecord(database, "evaluator-run-a"),
      },
      {
        runStatus: "running",
        job: {
          evaluatorJobId: "evaluator-run-a",
          evaluatorRunId: "evaluator-run-a",
          attemptId: "attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          runStatus: "running",
          jobStatus: "leased",
          attemptNumber: 1,
          retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
          budgetPolicy: null,
          lease: {
            leaseId: "lease-a",
            workerId: "worker-a",
            claimedAt: "2026-06-02T10:30:00.000Z",
            expiresAt: "2026-06-02T10:35:00.000Z",
          },
          nextRetryAt: null,
          cancellationReason: null,
          timeoutReason: null,
          jobFailureReason: null,
          createdAt: "2026-06-02T10:20:00.000Z",
          updatedAt: "2026-06-02T10:30:00.000Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("listClaimableOpenAnswerEvaluatorJobRecords_shouldReturnWaitingAndDueRetryJobs_onExistingJobs", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedOpenAnswerCheck(database, { programId: "program-a" });
    for (const attemptId of ["attempt-a", "attempt-b", "attempt-c", "attempt-d"]) {
      storage.createOpenAnswerAttemptRecord(
        database,
        makeOpenAnswerAttempt({
          id: attemptId,
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
        }),
      );
    }
    for (const input of [
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-waiting",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        jobStatus: "waiting",
        attemptNumber: 1,
        retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      }),
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-due",
        attemptId: "attempt-b",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        status: "failed",
        jobStatus: "retry_waiting",
        attemptNumber: 2,
        retryPolicy: { maxAttempts: 3, backoffSeconds: [60, 300] },
        nextRetryAt: "2026-06-02T10:30:00.000Z",
      }),
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-early",
        attemptId: "attempt-c",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        status: "failed",
        jobStatus: "retry_waiting",
        attemptNumber: 2,
        retryPolicy: { maxAttempts: 3, backoffSeconds: [60, 300] },
        nextRetryAt: "2026-06-02T10:40:00.000Z",
      }),
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-terminal",
        attemptId: "attempt-d",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        status: "failed",
        jobStatus: "failed",
        attemptNumber: 2,
        retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      }),
    ]) {
      storage.createOpenAnswerEvaluatorRunRecord(database, input);
    }

    assert.deepEqual(
      storage
        .listClaimableOpenAnswerEvaluatorJobRecords?.(database, {
          now: "2026-06-02T10:35:00.000Z",
        })
        .map($0 => $0.evaluatorJobId),
      ["evaluator-run-waiting", "evaluator-run-due"],
    );
  } finally {
    database.close();
  }
});

test("clearOpenAnswerEvaluatorJobLease_shouldRemoveLeaseWithoutChangingSnapshots_onExistingJob", () => {
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
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        jobStatus: "waiting",
        attemptNumber: 1,
        retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      }),
    );
    storage.updateOpenAnswerEvaluatorJobLease(database, {
      evaluatorJobId: "evaluator-run-a",
      leaseId: "lease-a",
      workerId: "worker-a",
      claimedAt: "2026-06-02T10:30:00.000Z",
      expiresAt: "2026-06-02T10:35:00.000Z",
    });

    assert.deepEqual(
      storage.clearOpenAnswerEvaluatorJobLease?.(database, {
        evaluatorJobId: "evaluator-run-a",
        jobStatus: "retry_waiting",
        updatedAt: "2026-06-02T10:31:00.000Z",
      }),
      {
        evaluatorJobId: "evaluator-run-a",
        evaluatorRunId: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        evaluatorPathKind: "deterministic",
        evaluatorPolicyId: "policy-a",
        runStatus: "running",
        jobStatus: "retry_waiting",
        attemptNumber: 1,
        retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
        budgetPolicy: null,
        lease: null,
        nextRetryAt: null,
        cancellationReason: null,
        timeoutReason: null,
        jobFailureReason: null,
        createdAt: "2026-06-02T10:20:00.000Z",
        updatedAt: "2026-06-02T10:31:00.000Z",
      },
    );
  } finally {
    database.close();
  }
});

test("updateOpenAnswerEvaluatorJobLease_shouldRejectMalformedLease_onExistingJob", () => {
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
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        jobStatus: "waiting",
        attemptNumber: 1,
        retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      }),
    );

    assert.deepEqual(
      [
        { evaluatorJobId: "evaluator-run-a", leaseId: "", workerId: "worker-a" },
        { evaluatorJobId: "evaluator-run-a", leaseId: "lease-a", workerId: " " },
        { evaluatorJobId: "evaluator-run-a", leaseId: "lease-a", workerId: "worker-a", claimedAt: "" },
        {
          evaluatorJobId: "evaluator-run-a",
          leaseId: "lease-a",
          workerId: "worker-a",
          claimedAt: "2026-06-02T10:30:00.000Z",
          expiresAt: "",
        },
      ].map(input =>
        captureStorageInvariantReason(() =>
          storage.updateOpenAnswerEvaluatorJobLease(database, {
            claimedAt: "2026-06-02T10:30:00.000Z",
            expiresAt: "2026-06-02T10:35:00.000Z",
            ...input,
          }),
        ),
      ),
      ["validation_failed", "validation_failed", "validation_failed", "validation_failed"],
    );
  } finally {
    database.close();
  }
});

test("clearOpenAnswerEvaluatorJobLease_shouldRejectMalformedJobStatus_onExistingJob", () => {
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
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        jobStatus: "waiting",
        attemptNumber: 1,
        retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      }),
    );

    assert.equal(
      captureStorageInvariantReason(() =>
        storage.clearOpenAnswerEvaluatorJobLease(database, {
          evaluatorJobId: "evaluator-run-a",
          jobStatus: "unknown",
          updatedAt: "2026-06-02T10:31:00.000Z",
        }),
      ),
      "validation_failed",
    );
  } finally {
    database.close();
  }
});

test("getOpenAnswerEvaluatorJobRecord_shouldNotExposeRawEvaluatorArtifacts_onExistingJob", () => {
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
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        jobStatus: "waiting",
        attemptNumber: 1,
        retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
        rawPrompt: "authorization: bearer secret",
        rawModelResponse: "select * from secrets",
        providerDiagnostics: "stack trace",
        reviewerNotes: "hidden reviewer note",
      }),
    );

    assert.deepEqual(
      Object.keys(storage.getOpenAnswerEvaluatorJobRecord(database, "evaluator-run-a")).filter(key =>
        key.toLowerCase().includes("raw") ||
        key.toLowerCase().includes("diagnostic") ||
        key.toLowerCase().includes("reviewernote"),
      ),
      [],
    );
  } finally {
    database.close();
  }
});

test("createOpenAnswerEvaluatorRunRecord_shouldRejectMismatchedAttemptReferences_onGraphMismatch", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedOpenAnswerCheck(database, { programId: "program-a" });
    createIdentity(database, makeIdentity("identity-b"));
    storage.createProgramShellRecord(database, makeProgramShell({ id: "program-b" }));
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
      [
        makeOpenAnswerEvaluatorRun({
          id: "evaluator-run-a",
          attemptId: "attempt-a",
          programId: "program-b",
          studentIdentityId: "identity-a",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
        }),
        makeOpenAnswerEvaluatorRun({
          id: "evaluator-run-b",
          attemptId: "attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-b",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
        }),
        makeOpenAnswerEvaluatorRun({
          id: "evaluator-run-c",
          attemptId: "attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "unknown-check-revision",
          criterionRevisionIds: ["criterion-revision-a"],
        }),
        makeOpenAnswerEvaluatorRun({
          id: "evaluator-run-d",
          attemptId: "attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["unknown-criterion-revision"],
        }),
      ].map(input =>
        captureStorageInvariantReason(() => storage.createOpenAnswerEvaluatorRunRecord(database, input)),
      ),
      [
        "evaluator_run_attempt_mismatch",
        "evaluator_run_attempt_mismatch",
        "evaluator_run_attempt_mismatch",
        "evaluator_run_attempt_mismatch",
      ],
    );
  } finally {
    database.close();
  }
});

test("updateOpenAnswerEvaluatorRunStatus_shouldPreserveRunReferences_onExistingRun", () => {
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
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );

    assert.deepEqual(
      storage.updateOpenAnswerEvaluatorRunStatus?.(database, {
        evaluatorRunId: "evaluator-run-a",
        status: "failed",
        failedAt: "2026-06-02T10:25:00.000Z",
        failureReason: "temporary evaluator outage",
      }),
      {
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        evaluatorPathKind: "deterministic",
        evaluatorPolicyId: "policy-a",
        status: "failed",
        requestedByIdentityId: "identity-a",
        reviewerIdentityId: null,
        reviewerCapability: null,
        startedAt: "2026-06-02T10:20:00.000Z",
        completedAt: null,
        failedAt: "2026-06-02T10:25:00.000Z",
        failureReason: "temporary evaluator outage",
        priorFailureReason: null,
        priorFailedAt: null,
      },
    );
  } finally {
    database.close();
  }
});

test("listOpenAnswerEvaluatorRunRecords_shouldFilterByAttemptAndStatus", () => {
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
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-b",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-b",
        attemptId: "attempt-b",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        status: "failed",
      }),
    );

    assert.deepEqual(
      storage.listOpenAnswerEvaluatorRunRecords?.(database, {
        attemptId: "attempt-a",
        status: "running",
      }).map($0 => $0.id),
      ["evaluator-run-a"],
    );
  } finally {
    database.close();
  }
});

test("createOpenAnswerEvaluatorRunRecord_shouldRejectSecondRunningRun_onExistingRunningRun", () => {
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
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );

    assert.equal(
      captureStorageInvariantReason(() =>
        storage.createOpenAnswerEvaluatorRunRecord(
          database,
          makeOpenAnswerEvaluatorRun({
            id: "evaluator-run-b",
            attemptId: "attempt-a",
            programId: "program-a",
            studentIdentityId: "identity-a",
            checkRevisionId: "check-revision-a",
            criterionRevisionIds: ["criterion-revision-a"],
          }),
        ),
      ),
      "evaluator_run_conflict",
    );
  } finally {
    database.close();
  }
});

test("openAnswerEvaluatorRunStorage_shouldRejectRawSecondRunningRun_onDatabaseConstraint", () => {
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
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );

    assert.throws(
      () =>
        database
          .prepare(
            `insert into open_answer_evaluator_runs (
               id, attempt_id, program_id, student_identity_id, check_revision_id,
               criterion_revision_ids_json, evaluator_path_kind, evaluator_policy_id, status
             ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            "evaluator-run-b",
            "attempt-a",
            "program-a",
            "identity-a",
            "check-revision-a",
            JSON.stringify(["criterion-revision-a"]),
            "deterministic",
            "policy-b",
            "running",
          ),
      error => error.code === "SQLITE_CONSTRAINT_UNIQUE",
    );
  } finally {
    database.close();
  }
});

test("openAnswerEvaluatorRunStorage_shouldRejectRawAttemptReferenceMismatch_onDatabaseConstraint", () => {
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
      }),
    );

    assert.throws(
      () =>
        database
          .prepare(
            `insert into open_answer_evaluator_runs (
               id, attempt_id, program_id, student_identity_id, check_revision_id,
               criterion_revision_ids_json, evaluator_path_kind, evaluator_policy_id, status
             ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            "evaluator-run-a",
            "attempt-a",
            "program-a",
            "identity-b",
            "check-revision-a",
            JSON.stringify(["criterion-revision-a"]),
            "deterministic",
            "policy-a",
            "running",
          ),
      error => error.code === "SQLITE_CONSTRAINT_FOREIGNKEY",
    );
  } finally {
    database.close();
  }
});

test("createOpenAnswerEvaluatorEvidenceRecord_shouldPersistInternalMetadata_onExistingRun", () => {
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
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );

    assert.deepEqual(
      storage.createOpenAnswerEvaluatorEvidenceRecord?.(
        database,
        makeOpenAnswerEvaluatorEvidence({
          id: "evidence-a",
          evaluatorRunId: "evaluator-run-a",
          attemptId: "attempt-a",
        }),
      ),
      {
        id: "evidence-a",
        evaluatorRunId: "evaluator-run-a",
        attemptId: "attempt-a",
        evidenceKind: "criterion_match",
        visibility: "internal",
        redactedSummary: "Redacted evidence evidence-a",
        recordedAt: "2026-06-02T10:22:00.000Z",
      },
    );
  } finally {
    database.close();
  }
});

test("createOpenAnswerEvaluatorEvidenceRecord_shouldRejectAttemptRunMismatch_onGraphMismatch", () => {
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
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-b",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );

    assert.equal(
      captureStorageInvariantReason(() =>
        storage.createOpenAnswerEvaluatorEvidenceRecord(
          database,
          makeOpenAnswerEvaluatorEvidence({
            id: "evidence-a",
            evaluatorRunId: "evaluator-run-a",
            attemptId: "attempt-b",
          }),
        ),
      ),
      "evaluator_evidence_attempt_mismatch",
    );
  } finally {
    database.close();
  }
});

test("listOpenAnswerEvaluatorEvidenceRecords_shouldFilterByEvaluatorRun", () => {
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
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-b",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-b",
        attemptId: "attempt-b",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );
    storage.createOpenAnswerEvaluatorEvidenceRecord(
      database,
      makeOpenAnswerEvaluatorEvidence({
        id: "evidence-a",
        evaluatorRunId: "evaluator-run-a",
        attemptId: "attempt-a",
      }),
    );
    storage.createOpenAnswerEvaluatorEvidenceRecord(
      database,
      makeOpenAnswerEvaluatorEvidence({
        id: "evidence-b",
        evaluatorRunId: "evaluator-run-b",
        attemptId: "attempt-b",
      }),
    );

    assert.deepEqual(
      storage
        .listOpenAnswerEvaluatorEvidenceRecords?.(database, { evaluatorRunId: "evaluator-run-a" })
        .map($0 => $0.id),
      ["evidence-a"],
    );
  } finally {
    database.close();
  }
});

test("openAnswerEvaluatorEvidenceStorage_shouldRejectRawAttemptRunMismatch_onDatabaseConstraint", () => {
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
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-b",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );

    assert.throws(
      () =>
        database
          .prepare(
            `insert into open_answer_evaluator_evidence (
               id, evaluator_run_id, attempt_id, evidence_kind, visibility, recorded_at
             ) values (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            "evidence-a",
            "evaluator-run-a",
            "attempt-b",
            "criterion_match",
            "internal",
            "2026-06-02T10:22:00.000Z",
          ),
      error => error.code === "SQLITE_CONSTRAINT_FOREIGNKEY",
    );
  } finally {
    database.close();
  }
});

test("createOpenAnswerEvaluatorEvidenceRecord_shouldPersistNullSummary_onOmittedRedactedSummary", () => {
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
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );

    assert.equal(
      storage.createOpenAnswerEvaluatorEvidenceRecord(database, {
        id: "evidence-a",
        evaluatorRunId: "evaluator-run-a",
        attemptId: "attempt-a",
        evidenceKind: "criterion_match",
        recordedAt: "2026-06-02T10:22:00.000Z",
      }).redactedSummary,
      null,
    );
  } finally {
    database.close();
  }
});

test("openAnswerEvaluatorStorage_shouldNotExposeRawArtifactFields", () => {
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
    const evaluatorRun = storage.createOpenAnswerEvaluatorRunRecord(database, {
      ...makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
      hiddenPolicyInstructions: "secret policy instructions",
      modelMetadataPayload: "secret model metadata",
      rawPrompt: "secret prompt",
      rawModelResponse: "secret response",
    });
    const evidence = storage.createOpenAnswerEvaluatorEvidenceRecord(database, {
      ...makeOpenAnswerEvaluatorEvidence({
        id: "evidence-a",
        evaluatorRunId: "evaluator-run-a",
        attemptId: "attempt-a",
      }),
      evaluatorDiagnostics: "secret diagnostics",
      reviewerNotes: "secret reviewer notes",
    });

    const forbiddenFields = new Set([
      "evaluatorDiagnostics",
      "evaluator_diagnostics",
      "hiddenPolicyInstructions",
      "hidden_policy_instructions",
      "modelMetadataPayload",
      "model_metadata_payload",
      "rawModelResponse",
      "rawPrompt",
      "raw_model_response",
      "raw_prompt",
      "reviewerNotes",
      "reviewer_notes",
    ]);
    assert.deepEqual(
      {
        evidenceColumns: database
          .prepare("pragma table_info(open_answer_evaluator_evidence)")
          .all()
          .map($0 => $0.name)
          .filter($0 => forbiddenFields.has($0)),
        evidenceKeys: Object.keys(evidence).filter($0 => forbiddenFields.has($0)),
        evaluatorRunColumns: database
          .prepare("pragma table_info(open_answer_evaluator_runs)")
          .all()
          .map($0 => $0.name)
          .filter($0 => forbiddenFields.has($0)),
        evaluatorRunKeys: Object.keys(evaluatorRun).filter($0 => forbiddenFields.has($0)),
      },
      {
        evidenceColumns: [],
        evidenceKeys: [],
        evaluatorRunColumns: [],
        evaluatorRunKeys: [],
      },
    );
  } finally {
    database.close();
  }
});

test("updateOpenAnswerEvaluatorRunStatus_shouldAcceptOnlySupportedStatuses", () => {
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
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );

    assert.deepEqual(
      {
        accepted: ["succeeded", "failed", "cancelled", "running"].map(
          status =>
            storage.updateOpenAnswerEvaluatorRunStatus(database, {
              evaluatorRunId: "evaluator-run-a",
              status,
            }).status,
        ),
        rejected: captureSqliteConstraintCode(() =>
          storage.updateOpenAnswerEvaluatorRunStatus(database, {
            evaluatorRunId: "evaluator-run-a",
            status: "queued",
          }),
        ),
      },
      {
        accepted: ["succeeded", "failed", "cancelled", "running"],
        rejected: "SQLITE_CONSTRAINT_CHECK",
      },
    );
  } finally {
    database.close();
  }
});

test("restoreIdentityBackup_shouldClearEvaluatorRecords_beforeDeletingAttempts", () => {
  const database = makeInitializedDatabase();

  try {
    seedAcceptedOpenAnswerCheck(database, { programId: "program-a" });
    storage.updateAssessmentCriterionCandidateStatus(database, {
      candidateId: "criterion-candidate-a",
      status: "accepted",
      updatedAt: "2026-06-02T10:00:00.000Z",
    });
    storage.updateOpenAnswerCheckCandidateStatus(database, {
      candidateId: "check-candidate-a",
      status: "accepted",
      updatedAt: "2026-06-02T10:00:00.000Z",
    });
    grantAdminAuthority(database, {
      identityId: "identity-a",
      grantedAt: "2026-06-02T10:00:00.000Z",
    });
    storage.createProgramMembershipRecord(database, {
      id: "membership-a",
      programId: "program-a",
      identityId: "identity-a",
      participationKind: "program_curator",
      status: "active",
      createdAt: "2026-06-02T10:00:00.000Z",
      updatedAt: "2026-06-02T10:00:00.000Z",
    });
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
    storage.updateOpenAnswerAttemptStatus(database, {
      attemptId: "attempt-a",
      status: "evaluating",
      updatedAt: "2026-06-02T10:01:00.000Z",
    });
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      }),
    );
    storage.createOpenAnswerEvaluatorEvidenceRecord(
      database,
      makeOpenAnswerEvaluatorEvidence({
        id: "evidence-a",
        evaluatorRunId: "evaluator-run-a",
        attemptId: "attempt-a",
      }),
    );

    assert.doesNotThrow(() => storage.restoreIdentityBackup(database, storage.exportIdentityBackup(database)));
  } finally {
    database.close();
  }
});

test("exportIdentityBackup_shouldPreserveOpenAnswerEvaluatorJobOrchestrationState_onBackupRestore", () => {
  const database = makeInitializedDatabase();
  const restored = makeInitializedDatabase();

  try {
    seedAcceptedOpenAnswerCheck(database, { programId: "program-a" });
    storage.updateAssessmentCriterionCandidateStatus(database, {
      candidateId: "criterion-candidate-a",
      status: "accepted",
      updatedAt: "2026-06-02T10:00:00.000Z",
    });
    storage.updateOpenAnswerCheckCandidateStatus(database, {
      candidateId: "check-candidate-a",
      status: "accepted",
      updatedAt: "2026-06-02T10:00:00.000Z",
    });
    grantAdminAuthority(database, {
      identityId: "identity-a",
      grantedAt: "2026-06-02T10:00:00.000Z",
    });
    storage.createProgramMembershipRecord(database, {
      id: "membership-a",
      programId: "program-a",
      identityId: "identity-a",
      participationKind: "program_curator",
      status: "active",
      createdAt: "2026-06-02T10:00:00.000Z",
      updatedAt: "2026-06-02T10:00:00.000Z",
    });
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        status: "evaluating",
      }),
    );
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        jobStatus: "leased",
        attemptNumber: 2,
        retryPolicy: { maxAttempts: 3, backoffSeconds: [60, 300] },
        budgetPolicy: { maxProviderCalls: 2 },
        leaseId: "lease-a",
        workerId: "worker-a",
        leaseClaimedAt: "2026-06-02T10:20:00.000Z",
        leaseExpiresAt: "2026-06-02T10:25:00.000Z",
      }),
    );

    const backup = storage.exportIdentityBackup(database);
    storage.restoreIdentityBackup(restored, backup);

    assert.deepEqual(
      {
        exportedRun: backup.openAnswerEvaluatorRuns[0],
        restoredJob: storage.getOpenAnswerEvaluatorJobRecord(restored, "evaluator-run-a"),
      },
      {
        exportedRun: {
          ...makeOpenAnswerEvaluatorRun({
            id: "evaluator-run-a",
            attemptId: "attempt-a",
            programId: "program-a",
            studentIdentityId: "identity-a",
            checkRevisionId: "check-revision-a",
            criterionRevisionIds: ["criterion-revision-a"],
            jobStatus: "leased",
            attemptNumber: 2,
            retryPolicy: { maxAttempts: 3, backoffSeconds: [60, 300] },
            budgetPolicy: { maxProviderCalls: 2 },
            leaseId: "lease-a",
            workerId: "worker-a",
            leaseClaimedAt: "2026-06-02T10:20:00.000Z",
            leaseExpiresAt: "2026-06-02T10:25:00.000Z",
          }),
        },
        restoredJob: {
          evaluatorJobId: "evaluator-run-a",
          evaluatorRunId: "evaluator-run-a",
          attemptId: "attempt-a",
          programId: "program-a",
          studentIdentityId: "identity-a",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          runStatus: "running",
          jobStatus: "leased",
          attemptNumber: 2,
          retryPolicy: { maxAttempts: 3, backoffSeconds: [60, 300] },
          budgetPolicy: { maxProviderCalls: 2 },
          lease: {
            leaseId: "lease-a",
            workerId: "worker-a",
            claimedAt: "2026-06-02T10:20:00.000Z",
            expiresAt: "2026-06-02T10:25:00.000Z",
          },
          nextRetryAt: null,
          cancellationReason: null,
          timeoutReason: null,
          jobFailureReason: null,
          createdAt: "2026-06-02T10:20:00.000Z",
          updatedAt: "2026-06-02T10:20:00.000Z",
        },
      },
    );
  } finally {
    database.close();
    restored.close();
  }
});

test("restoreIdentityBackup_shouldRejectMalformedOpenAnswerEvaluatorJobOrchestrationState", () => {
  const database = makeInitializedDatabase();
  const restored = makeInitializedDatabase();

  try {
    seedAcceptedOpenAnswerCheck(database, { programId: "program-a" });
    storage.updateAssessmentCriterionCandidateStatus(database, {
      candidateId: "criterion-candidate-a",
      status: "accepted",
      updatedAt: "2026-06-02T10:00:00.000Z",
    });
    storage.updateOpenAnswerCheckCandidateStatus(database, {
      candidateId: "check-candidate-a",
      status: "accepted",
      updatedAt: "2026-06-02T10:00:00.000Z",
    });
    grantAdminAuthority(database, {
      identityId: "identity-a",
      grantedAt: "2026-06-02T10:00:00.000Z",
    });
    storage.createProgramMembershipRecord(database, {
      id: "membership-a",
      programId: "program-a",
      identityId: "identity-a",
      participationKind: "program_curator",
      status: "active",
      createdAt: "2026-06-02T10:00:00.000Z",
      updatedAt: "2026-06-02T10:00:00.000Z",
    });
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        status: "evaluating",
      }),
    );
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        jobStatus: "waiting",
        attemptNumber: 1,
        retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      }),
    );
    const backup = storage.exportIdentityBackup(database);
    backup.openAnswerEvaluatorRuns[0] = {
      ...backup.openAnswerEvaluatorRuns[0],
      jobStatus: "leased",
      leaseId: null,
      workerId: null,
      leaseClaimedAt: null,
      leaseExpiresAt: null,
    };

    assert.deepEqual(
      captureStorageInvariantReason(() => storage.restoreIdentityBackup(restored, backup)),
      "validation_failed",
    );
  } finally {
    database.close();
    restored.close();
  }
});

test("restoreIdentityBackup_shouldRejectRawOpenAnswerEvaluatorArtifactsAndUnsafeSummaries", () => {
  const database = makeInitializedDatabase();
  const restored = makeInitializedDatabase();

  try {
    seedAcceptedOpenAnswerCheck(database, { programId: "program-a" });
    storage.updateAssessmentCriterionCandidateStatus(database, {
      candidateId: "criterion-candidate-a",
      status: "accepted",
      updatedAt: "2026-06-02T10:00:00.000Z",
    });
    storage.updateOpenAnswerCheckCandidateStatus(database, {
      candidateId: "check-candidate-a",
      status: "accepted",
      updatedAt: "2026-06-02T10:00:00.000Z",
    });
    grantAdminAuthority(database, {
      identityId: "identity-a",
      grantedAt: "2026-06-02T10:00:00.000Z",
    });
    storage.createProgramMembershipRecord(database, {
      id: "membership-a",
      programId: "program-a",
      identityId: "identity-a",
      participationKind: "program_curator",
      status: "active",
      createdAt: "2026-06-02T10:00:00.000Z",
      updatedAt: "2026-06-02T10:00:00.000Z",
    });
    storage.createOpenAnswerAttemptRecord(
      database,
      makeOpenAnswerAttempt({
        id: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        status: "evaluating",
      }),
    );
    storage.createOpenAnswerEvaluatorRunRecord(
      database,
      makeOpenAnswerEvaluatorRun({
        id: "evaluator-run-a",
        attemptId: "attempt-a",
        programId: "program-a",
        studentIdentityId: "identity-a",
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
        jobStatus: "waiting",
        attemptNumber: 1,
        retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      }),
    );
    storage.createOpenAnswerEvaluatorEvidenceRecord(
      database,
      makeOpenAnswerEvaluatorEvidence({
        id: "evidence-a",
        evaluatorRunId: "evaluator-run-a",
        attemptId: "attempt-a",
      }),
    );
    const backup = storage.exportIdentityBackup(database);

    assert.deepEqual(
      [
        {
          ...backup,
          openAnswerEvaluatorRuns: [
            {
              ...backup.openAnswerEvaluatorRuns[0],
              rawPrompt: "authorization header leaked",
            },
          ],
        },
        {
          ...backup,
          openAnswerEvaluatorEvidence: [
            {
              ...backup.openAnswerEvaluatorEvidence[0],
              reviewerNotes: "hidden reviewer note",
            },
          ],
        },
        {
          ...backup,
          openAnswerAttempts: backup.openAnswerAttempts.map(attempt => ({
            ...attempt,
            status: "evaluated",
          })),
          openAnswerEvaluations: [
            {
              ...makeOpenAnswerEvaluation({
                id: "evaluation-a",
                attemptId: "attempt-a",
                programId: "program-a",
                studentIdentityId: "identity-a",
                checkRevisionId: "check-revision-a",
                criterionRevisionIds: ["criterion-revision-a"],
              }),
              summaryFeedback: "authorization bearer provider-secret",
            },
          ],
          openAnswerEvaluatorRuns: [],
          openAnswerEvaluatorEvidence: [],
        },
        {
          ...backup,
          openAnswerAttempts: backup.openAnswerAttempts.map(attempt => ({
            ...attempt,
            status: "evaluated",
          })),
          openAnswerEvaluations: [
            {
              ...makeOpenAnswerEvaluation({
                id: "evaluation-a",
                attemptId: "attempt-a",
                programId: "program-a",
                studentIdentityId: "identity-a",
                checkRevisionId: "check-revision-a",
                criterionRevisionIds: ["criterion-revision-a"],
              }),
              criterionFeedback: [
                {
                  criterionRevisionId: "criterion-revision-a",
                  outcome: "met",
                  feedback: "authorization bearer provider-secret",
                },
              ],
            },
          ],
          openAnswerEvaluatorRuns: [],
          openAnswerEvaluatorEvidence: [],
        },
        {
          ...backup,
          openAnswerAttempts: backup.openAnswerAttempts.map(attempt => ({
            ...attempt,
            status: "evaluated",
          })),
          openAnswerEvaluations: [
            {
              ...makeOpenAnswerEvaluation({
                id: "evaluation-a",
                attemptId: "attempt-a",
                programId: "program-a",
                studentIdentityId: "identity-a",
                checkRevisionId: "check-revision-a",
                criterionRevisionIds: ["criterion-revision-a"],
              }),
              rawModelResponse: "hidden response",
            },
          ],
          openAnswerEvaluatorRuns: [],
          openAnswerEvaluatorEvidence: [],
        },
      ].map(candidateBackup =>
        captureStorageInvariantReason(() => storage.restoreIdentityBackup(restored, candidateBackup)),
      ),
      [
        "validation_failed",
        "validation_failed",
        "validation_failed",
        "validation_failed",
        "validation_failed",
      ],
    );
  } finally {
    database.close();
    restored.close();
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

const lifecycleTables = [
  "accepted_assessment_criterion_entities",
  "accepted_quick_check_entities",
  "accepted_readiness_check_entities",
  "accepted_open_answer_check_entities",
  "accepted_corpus_entities",
  "accepted_navigation_relationships",
  "program_sources",
];

const lifecycleColumnProjection = {
  status: {
    notNull: 1,
    defaultValue: "'active'",
  },
  statusUpdatedByIdentityId: {
    notNull: 0,
    defaultValue: null,
  },
  statusUpdatedAt: {
    notNull: 0,
    defaultValue: null,
  },
};

function makeInitializedDatabase() {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  return database;
}

function makeTemporaryDatabasePath() {
  return join(mkdtempSync(join(tmpdir(), "agonara-storage-")), "identity.sqlite");
}

function projectLifecycleColumns(database, tableName) {
  return Object.fromEntries(
    database
      .prepare(`pragma table_info(${tableName})`)
      .all()
      .filter($0 => ["status", "status_updated_by_identity_id", "status_updated_at"].includes($0.name))
      .map($0 => [
        snakeToLifecycleColumnName($0.name),
        {
          notNull: $0.notnull,
          defaultValue: $0.dflt_value,
        },
      ]),
  );
}

function snakeToLifecycleColumnName(name) {
  return {
    status: "status",
    status_updated_by_identity_id: "statusUpdatedByIdentityId",
    status_updated_at: "statusUpdatedAt",
  }[name];
}

function createLegacyLifecycleTables(database) {
  database.exec(`
    create table accepted_assessment_criterion_entities (
      id text primary key,
      program_id text not null,
      current_revision_id text not null
    );

    create table accepted_quick_check_entities (
      id text primary key,
      program_id text not null,
      current_revision_id text not null
    );

    create table accepted_readiness_check_entities (
      id text primary key,
      program_id text not null,
      current_revision_id text not null
    );

    create table accepted_open_answer_check_entities (
      id text primary key,
      program_id text not null,
      current_revision_id text not null
    );

    create table accepted_corpus_entities (
      id text primary key,
      program_id text not null,
      accepted_kind text not null check (
        accepted_kind in ('topic', 'concept', 'definition', 'principle', 'material_reference')
      ),
      current_revision_id text not null
    );

    create table accepted_navigation_relationships (
      id text primary key,
      program_id text not null,
      relationship_kind text not null check (
        relationship_kind in (
          'topic_includes_concept',
          'topic_uses_material',
          'concept_uses_material',
          'concept_has_definition',
          'concept_has_principle',
          'concept_prerequisite',
          'concept_related',
          'concept_distinguishes_from'
        )
      ),
      from_entity_id text not null,
      to_entity_id text not null,
      current_revision_id text not null
    );

    create table program_sources (
      id text primary key,
      program_id text not null,
      source_kind text not null check (
        source_kind in (
          'public_plan',
          'exam_requirement',
          'standard',
          'textbook',
          'article',
          'lecture',
          'course',
          'note',
          'research_result',
          'other'
        )
      ),
      title text not null,
      locator text,
      citation text,
      recorded_by_identity_id text not null,
      recorded_at text not null
    );
  `);
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

function makeProgramInvitation({
  id,
  programId,
  targetIdentityId,
  status = "pending",
  statusChangedByIdentityId = null,
  statusChangedAt = null,
}) {
  return {
    id,
    programId,
    targetIdentityId,
    participationKind: "student",
    status,
    invitedByIdentityId: "identity-a",
    createdAt: "2026-06-04T09:00:00.000Z",
    updatedAt: statusChangedAt ?? "2026-06-04T09:00:00.000Z",
    statusChangedByIdentityId,
    statusChangedAt,
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

function makeCorpusCandidate({ id, programId, candidateKind = "topic", sourceIds = [], status = "draft" }) {
  return {
    id,
    programId,
    candidateKind,
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

function makeAcceptedCorpusEntity({ id, programId, acceptedKind = "topic", currentRevisionId }) {
  return {
    id,
    programId,
    acceptedKind,
    currentRevisionId,
  };
}

function makeAcceptedCorpusRevision({
  id,
  entityId,
  programId,
  acceptedKind = "topic",
  acceptedFromCandidateId = "candidate-a",
  sourceIds = ["source-a"],
  materialReferenceKind = null,
  locator = null,
  citation = null,
}) {
  return {
    id,
    entityId,
    programId,
    acceptedKind,
    title: `Accepted ${id}`,
    body: `Accepted body ${id}`,
    acceptedFromCandidateId,
    sourceIds,
    rationale: `Accepted rationale ${id}`,
    acceptedByIdentityId: "identity-a",
    acceptedAt: "2026-05-28T10:20:00.000Z",
    materialReferenceKind,
    locator,
    citation,
  };
}

function seedAcceptedNavigationEntity(database, {
  acceptedKind,
  entityId = acceptedKind,
  programId = "program-a",
  sourceId = programId === "program-a" ? "source-a" : "source-b",
}) {
  storage.createCorpusCandidateRecord(
    database,
    makeCorpusCandidate({
      id: `candidate-${entityId}`,
      programId,
      sourceIds: [sourceId],
      status: "accepted",
      candidateKind: acceptedKind,
    }),
  );
  storage.createAcceptedCorpusEntityRecord(
    database,
    makeAcceptedCorpusEntity({
      id: `entity-${entityId}`,
      programId,
      acceptedKind,
      currentRevisionId: `revision-${entityId}`,
    }),
  );
  return storage.createAcceptedCorpusRevisionRecord(
    database,
    makeAcceptedCorpusRevision({
      id: `revision-${entityId}`,
      entityId: `entity-${entityId}`,
      programId,
      acceptedFromCandidateId: `candidate-${entityId}`,
      acceptedKind,
      materialReferenceKind: acceptedKind === "material_reference" ? "article" : null,
      locator: acceptedKind === "material_reference" ? "https://example.test/material" : null,
      citation: acceptedKind === "material_reference" ? "Example citation" : null,
      sourceIds: [sourceId],
    }),
  );
}

function seedAcceptedLearnerStateTargetLinkCrossProgramReferences(database) {
  storage.createProgramShellRecord(database, makeProgramShell({ id: "program-b" }));
  storage.createProgramMembershipRecord(database, {
    id: "membership-b",
    programId: "program-b",
    identityId: "identity-a",
    participationKind: "program_curator",
    status: "active",
    createdAt: "2026-06-03T09:00:00.000Z",
    updatedAt: "2026-06-03T09:00:00.000Z",
  });
  storage.createProgramSourceRecord(database, makeProgramSource({ id: "source-b", programId: "program-b" }));
  seedAcceptedNavigationEntity(database, {
    acceptedKind: "topic",
    entityId: "topic-b",
    programId: "program-b",
    sourceId: "source-b",
  });
  storage.createQuickCheckCandidateRecord(
    database,
    makeQuickCheckCandidate({
      id: "quick-check-candidate-b",
      programId: "program-b",
      sourceIds: ["source-b"],
      status: "accepted",
    }),
  );
  storage.createAcceptedQuickCheckEntityRecord(
    database,
    makeAcceptedQuickCheckEntity({
      id: "quick-check-entity-b",
      programId: "program-b",
      currentRevisionId: "quick-check-revision-b",
    }),
  );
  storage.createAcceptedQuickCheckRevisionRecord(
    database,
    makeAcceptedQuickCheckRevision({
      id: "quick-check-revision-b",
      entityId: "quick-check-entity-b",
      programId: "program-b",
      acceptedFromCandidateId: "quick-check-candidate-b",
      sourceIds: ["source-b"],
    }),
  );
}

function makeAcceptedNavigationRelationshipRevision({
  id,
  relationshipId,
  programId = "program-a",
  relationshipKind,
  fromEntityId,
  fromRevisionId,
  fromKind,
  toEntityId,
  toRevisionId,
  toKind,
  sourceIds = ["source-a"],
}) {
  return {
    id,
    relationshipId,
    programId,
    relationshipKind,
    fromEntityId,
    fromRevisionId,
    fromKind,
    toEntityId,
    toRevisionId,
    toKind,
    label: `Relationship ${id}`,
    sourceIds,
    acceptedFromCandidateId: "candidate-relationship",
    acceptedByIdentityId: "identity-a",
    acceptedAt: "2026-06-03T10:00:00.000Z",
  };
}

function captureStorageReason(action) {
  try {
    action();
  } catch (error) {
    if (error instanceof StorageInvariantError) {
      return error.reason;
    }
    throw error;
  }
  return null;
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

function makeQuickCheckCandidate({
  id,
  programId,
  sourceIds = [],
  status = "draft",
  options = [
    { id: `${id}-option-a`, text: `Option A ${id}` },
    { id: `${id}-option-b`, text: `Option B ${id}` },
  ],
  answerKeyOptionId = `${id}-option-a`,
}) {
  return {
    id,
    programId,
    checkKind: "single_select_quick_check",
    title: `Quick check ${id}`,
    prompt: `Quick prompt ${id}`,
    options,
    answerKeyOptionId,
    sourceIds,
    rationale: `Quick rationale ${id}`,
    status,
    createdByIdentityId: "identity-a",
    createdAt: "2026-06-02T11:00:00.000Z",
    updatedAt: "2026-06-02T11:00:00.000Z",
  };
}

function makeAcceptedQuickCheckEntity({ id, programId, currentRevisionId }) {
  return {
    id,
    programId,
    currentRevisionId,
  };
}

function makeAcceptedQuickCheckRevision({
  id,
  entityId,
  programId,
  acceptedFromCandidateId = "quick-check-candidate-a",
  sourceIds = ["source-a"],
  options = [
    { id: `${id}-option-a`, text: `Accepted option A ${id}` },
    { id: `${id}-option-b`, text: `Accepted option B ${id}` },
  ],
  answerKeyOptionId = `${id}-option-a`,
}) {
  return {
    id,
    entityId,
    programId,
    checkKind: "single_select_quick_check",
    title: `Accepted quick check ${id}`,
    prompt: `Accepted quick prompt ${id}`,
    options,
    answerKeyOptionId,
    acceptedFromCandidateId,
    sourceIds,
    rationale: `Accepted quick rationale ${id}`,
    acceptedByIdentityId: "identity-a",
    acceptedAt: "2026-06-02T11:10:00.000Z",
  };
}

function makeQuickCheckAttempt({
  id,
  programId,
  studentIdentityId,
  checkRevisionId,
  selectedOptionId,
  matched,
  idempotencyKey = `idempotency-${id}`,
}) {
  return {
    id,
    programId,
    studentIdentityId,
    checkRevisionId,
    selectedOptionId,
    matched,
    idempotencyKey,
    submittedAt: "2026-06-02T11:20:00.000Z",
  };
}

function makeReadinessCheckCandidate({
  id,
  programId,
  scope = { scopeKind: "topic", topicEntityId: "entity-topic-a" },
  sourceIds = [],
  status = "draft",
}) {
  return {
    id,
    programId,
    title: `Readiness check ${id}`,
    scope,
    requirements: [
      {
        requirementId: "requirement-a",
        targetKind: "topic",
        targetId: "entity-topic-a",
        requiredLevel: "on_track",
      },
      {
        requirementId: "requirement-b",
        targetKind: "concept",
        targetId: "entity-concept-a",
        requiredLevel: "developing",
      },
    ],
    sourceIds,
    rationale: `Readiness rationale ${id}`,
    status,
    createdByIdentityId: "identity-a",
    createdAt: "2026-06-03T11:00:00.000Z",
    updatedAt: "2026-06-03T11:00:00.000Z",
  };
}

function makeLlmCurationSuggestion({
  id,
  programId,
  status = "draft_suggestion",
  materializedCandidateKind = null,
  materializedCandidateId = null,
  materializedByIdentityId = null,
  materializedAt = null,
  rejectedByIdentityId = null,
  rejectedAt = null,
  updatedAt = "2026-06-04T12:00:00.000Z",
}) {
  return {
    id,
    programId,
    suggestionKind: "navigation_candidate",
    title: `Suggestion ${id}`,
    summary: `Summary ${id}`,
    rationale: `Rationale ${id}`,
    suggestedDraft: {
      candidateKind: "navigation_candidate",
      request: {
        candidateKind: "topic",
        title: `Draft ${id}`,
        body: `Draft body ${id}`,
        sourceIds: [],
        rationale: `Draft rationale ${id}`,
      },
    },
    supportingEvidence: [
      {
        sourceKind: "curator_instruction",
        sourceId: "instruction-a",
        label: "Curator instruction",
      },
    ],
    origin: {
      suggestionPolicyId: "policy-a",
      providerAdapterId: "provider-a",
      outputValidatorPolicyId: "validator-a",
      redactionPolicyId: "redaction-a",
      sourceKinds: ["curator_instruction"],
      sourceIds: ["instruction-a"],
      coverageGapIds: [],
      promptContextSummary: "Accepted corpus titles only",
      generatedByIdentityId: "identity-a",
      generatedAt: "2026-06-04T12:00:00.000Z",
    },
    status,
    createdByIdentityId: "identity-a",
    createdAt: "2026-06-04T12:00:00.000Z",
    updatedAt,
    materializedCandidateKind,
    materializedCandidateId,
    materializedByIdentityId,
    materializedAt,
    rejectedByIdentityId,
    rejectedAt,
  };
}

function seedRestoreGovernance(
  database,
  {
    programId,
    identityId = "identity-a",
    membershipId = "membership-a",
    at = "2026-06-04T12:00:00.000Z",
  },
) {
  storage.createProgramMembershipRecord(database, {
    id: membershipId,
    programId,
    identityId,
    participationKind: "program_curator",
    status: "active",
    createdAt: at,
    updatedAt: at,
  });
  grantAdminAuthority(database, {
    identityId,
    grantedAt: at,
  });
}

function captureRestoreInvariantReason(backup) {
  const database = makeInitializedDatabase();

  try {
    return captureStorageInvariantReason(() => storage.restoreIdentityBackup(database, backup));
  } finally {
    database.close();
  }
}

function makeAcceptedReadinessCheckEntity({ id, programId, currentRevisionId }) {
  return {
    id,
    programId,
    currentRevisionId,
  };
}

function makeAcceptedReadinessCheckRevision({
  id,
  entityId,
  programId,
  acceptedFromCandidateId = "readiness-candidate-a",
  sourceIds = ["source-a"],
}) {
  return {
    id,
    entityId,
    programId,
    title: `Accepted readiness check ${id}`,
    scope: { scopeKind: "topic", topicEntityId: "entity-topic-a" },
    requirements: [
      {
        requirementId: "requirement-a",
        targetKind: "topic",
        targetId: "entity-topic-a",
        requiredLevel: "on_track",
      },
      {
        requirementId: "requirement-b",
        targetKind: "concept",
        targetId: "entity-concept-a",
        requiredLevel: "developing",
      },
    ],
    sourceIds,
    rationale: `Accepted readiness rationale ${id}`,
    acceptedFromCandidateId,
    acceptedByIdentityId: "identity-a",
    acceptedAt: "2026-06-03T11:10:00.000Z",
  };
}

function makeReadinessCheckAttempt({
  id,
  programId,
  studentIdentityId,
  readinessCheckRevisionId,
  result = "ready",
  requirementResults = [
    {
      requirementId: "requirement-a",
      targetKind: "topic",
      targetId: "entity-topic-a",
      title: "Topic A",
      requiredLevel: "on_track",
      observedLevel: "on_track",
      evidenceCount: 2,
      result: "ready",
    },
    {
      requirementId: "requirement-b",
      targetKind: "concept",
      targetId: "entity-concept-a",
      title: "Concept A",
      requiredLevel: "developing",
      observedLevel: "developing",
      evidenceCount: 1,
      result: "ready",
    },
  ],
  idempotencyKey = "idempotency-readiness",
}) {
  return {
    id,
    programId,
    studentIdentityId,
    readinessCheckRevisionId,
    result,
    requirementResults,
    idempotencyKey,
    submittedAt: "2026-06-03T11:20:00.000Z",
  };
}

function makeLearnerEvidenceTargetLink({
  id,
  programId = "program-a",
  targetKind,
  targetId,
  evidenceOwnerKind,
  evidenceOwnerEntityId,
  status = "active",
  createdByIdentityId = "identity-a",
  createdAt = "2026-06-03T10:00:00.000Z",
  updatedAt = "2026-06-03T10:00:00.000Z",
}) {
  return {
    id,
    programId,
    targetKind,
    targetId,
    evidenceOwnerKind,
    evidenceOwnerEntityId,
    status,
    createdByIdentityId,
    createdAt,
    updatedAt,
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

function makeOpenAnswerEvaluatorRun({
  id,
  attemptId,
  programId,
  studentIdentityId,
  checkRevisionId,
  criterionRevisionIds,
  evaluatorPathKind = "deterministic",
  evaluatorPolicyId = "policy-a",
  status = "running",
  requestedByIdentityId = "identity-a",
  reviewerIdentityId = null,
  reviewerCapability = null,
  startedAt = "2026-06-02T10:20:00.000Z",
  completedAt = null,
  failedAt = null,
  failureReason = null,
  priorFailureReason = null,
  priorFailedAt = null,
  jobStatus = null,
  attemptNumber = null,
  retryPolicy = null,
  budgetPolicy = null,
  leaseId = null,
  workerId = null,
  leaseClaimedAt = null,
  leaseExpiresAt = null,
  nextRetryAt = null,
  cancellationReason = null,
  timeoutReason = null,
  jobFailureReason = null,
  jobCreatedAt = startedAt,
  jobUpdatedAt = startedAt,
}) {
  return {
    id,
    attemptId,
    programId,
    studentIdentityId,
    checkRevisionId,
    criterionRevisionIds,
    evaluatorPathKind,
    evaluatorPolicyId,
    status,
    requestedByIdentityId,
    reviewerIdentityId,
    reviewerCapability,
    startedAt,
    completedAt,
    failedAt,
    failureReason,
    priorFailureReason,
    priorFailedAt,
    jobStatus,
    attemptNumber,
    retryPolicy,
    budgetPolicy,
    leaseId,
    workerId,
    leaseClaimedAt,
    leaseExpiresAt,
    nextRetryAt,
    cancellationReason,
    timeoutReason,
    jobFailureReason,
    jobCreatedAt,
    jobUpdatedAt,
  };
}

function makeOpenAnswerEvaluatorEvidence({
  id,
  evaluatorRunId,
  attemptId,
  evidenceKind = "criterion_match",
  redactedSummary = `Redacted evidence ${id}`,
  recordedAt = "2026-06-02T10:22:00.000Z",
}) {
  return {
    id,
    evaluatorRunId,
    attemptId,
    evidenceKind,
    redactedSummary,
    recordedAt,
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

function captureStorageInvariantReason(operation) {
  try {
    operation();
    return null;
  } catch (error) {
    if (error instanceof StorageInvariantError) {
      return error.reason;
    }
    throw error;
  }
}

function captureSqliteConstraintCode(operation) {
  try {
    operation();
    return null;
  } catch (error) {
    return error.code;
  }
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

function seedAcceptedQuickCheck(database, { programId }) {
  createIdentity(database, makeIdentity("identity-a"));
  storage.createProgramShellRecord(database, makeProgramShell({ id: programId }));
  storage.createProgramSourceRecord(database, makeProgramSource({ id: "source-a", programId }));
  storage.createQuickCheckCandidateRecord(
    database,
    makeQuickCheckCandidate({
      id: "quick-check-candidate-a",
      programId,
      sourceIds: ["source-a"],
      status: "accepted",
    }),
  );
  storage.createAcceptedQuickCheckEntityRecord(
    database,
    makeAcceptedQuickCheckEntity({
      id: "quick-check-entity-a",
      programId,
      currentRevisionId: "quick-check-revision-a",
    }),
  );
  storage.createAcceptedQuickCheckRevisionRecord(
    database,
    makeAcceptedQuickCheckRevision({
      id: "quick-check-revision-a",
      entityId: "quick-check-entity-a",
      programId,
      acceptedFromCandidateId: "quick-check-candidate-a",
      sourceIds: ["source-a"],
    }),
  );
}

function seedAcceptedReadinessCheck(database, { programId }) {
  createIdentity(database, makeIdentity("identity-a"));
  storage.createProgramShellRecord(database, makeProgramShell({ id: programId }));
  storage.createProgramSourceRecord(database, makeProgramSource({ id: "source-a", programId }));
  seedAcceptedNavigationEntity(database, { acceptedKind: "topic", entityId: "topic-a", programId });
  seedAcceptedNavigationEntity(database, { acceptedKind: "concept", entityId: "concept-a", programId });
  storage.createReadinessCheckCandidateRecord(
    database,
    makeReadinessCheckCandidate({
      id: "readiness-candidate-a",
      programId,
      sourceIds: ["source-a"],
      status: "accepted",
    }),
  );
  storage.createAcceptedReadinessCheckEntityRecord(
    database,
    makeAcceptedReadinessCheckEntity({
      id: "readiness-entity-a",
      programId,
      currentRevisionId: "readiness-revision-a",
    }),
  );
  storage.createAcceptedReadinessCheckRevisionRecord(
    database,
    makeAcceptedReadinessCheckRevision({
      id: "readiness-revision-a",
      entityId: "readiness-entity-a",
      programId,
      acceptedFromCandidateId: "readiness-candidate-a",
      sourceIds: ["source-a"],
    }),
  );
}

const CONTENT_TS = "2026-05-27T10:00:00.000Z";

function makeMaterialContentFixture() {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  storage.createIdentity(database, { id: "identity-1", displayName: "Curator", createdAt: CONTENT_TS });
  storage.createProgramShellRecord(database, {
    id: "program-1",
    title: "Program",
    admissionPolicy: "self_join",
    createdByIdentityId: "identity-1",
    createdAt: CONTENT_TS,
  });
  storage.createProgramSourceRecord(database, {
    id: "source-1",
    programId: "program-1",
    sourceKind: "lecture",
    title: "Source",
    recordedByIdentityId: "identity-1",
    recordedAt: CONTENT_TS,
  });
  storage.createCorpusCandidateRecord(database, {
    id: "candidate-1",
    programId: "program-1",
    candidateKind: "material_reference",
    title: "Material",
    materialReferenceKind: "lecture",
    locator: "loc",
    sourceIds: ["source-1"],
    status: "accepted",
    createdByIdentityId: "identity-1",
    createdAt: CONTENT_TS,
    updatedAt: CONTENT_TS,
  });
  storage.createAcceptedCorpusEntityRecord(database, {
    id: "entity-1",
    programId: "program-1",
    acceptedKind: "material_reference",
    currentRevisionId: "revision-1",
  });
  for (const id of ["revision-1", "revision-2"]) {
    storage.createAcceptedCorpusRevisionRecord(database, {
      id,
      entityId: "entity-1",
      programId: "program-1",
      acceptedKind: "material_reference",
      title: "Material",
      materialReferenceKind: "lecture",
      locator: "loc",
      acceptedFromCandidateId: "candidate-1",
      sourceIds: ["source-1"],
      acceptedByIdentityId: "identity-1",
      acceptedAt: CONTENT_TS,
    });
  }
  // A non-material_reference revision, to prove accepted content is material-only.
  storage.createCorpusCandidateRecord(database, {
    id: "topic-candidate-1",
    programId: "program-1",
    candidateKind: "topic",
    title: "Topic",
    sourceIds: ["source-1"],
    status: "accepted",
    createdByIdentityId: "identity-1",
    createdAt: CONTENT_TS,
    updatedAt: CONTENT_TS,
  });
  storage.createAcceptedCorpusEntityRecord(database, {
    id: "topic-entity-1",
    programId: "program-1",
    acceptedKind: "topic",
    currentRevisionId: "topic-revision-1",
  });
  storage.createAcceptedCorpusRevisionRecord(database, {
    id: "topic-revision-1",
    entityId: "topic-entity-1",
    programId: "program-1",
    acceptedKind: "topic",
    title: "Topic",
    acceptedFromCandidateId: "topic-candidate-1",
    sourceIds: ["source-1"],
    acceptedByIdentityId: "identity-1",
    acceptedAt: CONTENT_TS,
  });
  return database;
}

test("setSourceContentRecord_shouldStoreAndOverwriteContent_onSourceContent", () => {
  const database = makeMaterialContentFixture();

  try {
    storage.setSourceContentRecord(database, {
      sourceId: "source-1",
      content: "# Hello",
      contentFormat: "markdown",
      recordedByIdentityId: "identity-1",
      recordedAt: CONTENT_TS,
    });

    assert.deepEqual(storage.getSourceContentRecord(database, "source-1"), {
      sourceId: "source-1",
      content: "# Hello",
      contentFormat: "markdown",
      byteSize: Buffer.byteLength("# Hello", "utf8"),
      recordedByIdentityId: "identity-1",
      recordedAt: CONTENT_TS,
    });

    storage.setSourceContentRecord(database, {
      sourceId: "source-1",
      content: "plain",
      contentFormat: "plain_text",
      recordedByIdentityId: "identity-1",
      recordedAt: "2026-05-27T11:00:00.000Z",
    });

    const after = storage.getSourceContentRecord(database, "source-1");
    assert.equal(after.content, "plain");
    assert.equal(after.contentFormat, "plain_text");
    assert.equal(after.byteSize, Buffer.byteLength("plain", "utf8"));
  } finally {
    database.close();
  }
});

test("deleteSourceContentRecord_shouldRemoveContentIdempotently_onSourceContent", () => {
  const database = makeMaterialContentFixture();

  try {
    storage.setSourceContentRecord(database, {
      sourceId: "source-1",
      content: "x",
      contentFormat: "markdown",
      recordedByIdentityId: "identity-1",
      recordedAt: CONTENT_TS,
    });

    storage.deleteSourceContentRecord(database, "source-1");
    assert.equal(storage.getSourceContentRecord(database, "source-1"), null);

    storage.deleteSourceContentRecord(database, "source-1");
    assert.equal(storage.getSourceContentRecord(database, "source-1"), null);
  } finally {
    database.close();
  }
});

test("setSourceContentRecord_shouldRejectUnknownFormatAndOversizedContent_onSourceContent", () => {
  const database = makeMaterialContentFixture();

  try {
    assert.deepEqual(
      [
        captureStorageInvariantReason(() =>
          storage.setSourceContentRecord(database, {
            sourceId: "source-1",
            content: "x",
            contentFormat: "html",
            recordedByIdentityId: "identity-1",
            recordedAt: CONTENT_TS,
          }),
        ),
        captureStorageInvariantReason(() =>
          storage.setSourceContentRecord(database, {
            sourceId: "source-1",
            content: "a".repeat(storage.MAX_MATERIAL_CONTENT_BYTES + 1),
            contentFormat: "markdown",
            recordedByIdentityId: "identity-1",
            recordedAt: CONTENT_TS,
          }),
        ),
        storage.getSourceContentRecord(database, "source-1"),
      ],
      ["content_format_invalid", "content_too_large", null],
    );
  } finally {
    database.close();
  }
});

test("setAcceptedMaterialContentRecord_shouldRejectUnknownFormatAndOversizedContent_onMaterialContent", () => {
  const database = makeMaterialContentFixture();

  try {
    assert.deepEqual(
      [
        captureStorageInvariantReason(() =>
          storage.setAcceptedMaterialContentRecord(database, {
            revisionId: "revision-1",
            content: "x",
            contentFormat: "html",
          }),
        ),
        captureStorageInvariantReason(() =>
          storage.setAcceptedMaterialContentRecord(database, {
            revisionId: "revision-1",
            content: "a".repeat(storage.MAX_MATERIAL_CONTENT_BYTES + 1),
            contentFormat: "markdown",
          }),
        ),
        storage.getAcceptedMaterialContentRecord(database, "revision-1"),
      ],
      ["content_format_invalid", "content_too_large", null],
    );
  } finally {
    database.close();
  }
});

test("setAcceptedMaterialContentRecord_shouldRejectOverwriteAndKeepContentUnchanged_onMaterialContent", () => {
  const database = makeMaterialContentFixture();

  try {
    storage.setAcceptedMaterialContentRecord(database, {
      revisionId: "revision-1",
      content: "v1",
      contentFormat: "markdown",
      sourceContentProvenance: { sourceId: "source-1", range: { start: 0, end: 2 } },
    });

    assert.deepEqual(
      {
        overwriteCode: captureSqliteConstraintCode(() =>
          storage.setAcceptedMaterialContentRecord(database, {
            revisionId: "revision-1",
            content: "rewritten",
            contentFormat: "plain_text",
          }),
        ),
        record: storage.getAcceptedMaterialContentRecord(database, "revision-1"),
      },
      {
        overwriteCode: "SQLITE_CONSTRAINT_PRIMARYKEY",
        record: {
          revisionId: "revision-1",
          content: "v1",
          contentFormat: "markdown",
          byteSize: Buffer.byteLength("v1", "utf8"),
          sourceContentProvenance: { sourceId: "source-1", range: { start: 0, end: 2 } },
        },
      },
    );
  } finally {
    database.close();
  }
});

test("setAcceptedMaterialContentRecord_shouldKeepContentImmutablePerRevision_onMaterialContent", () => {
  const database = makeMaterialContentFixture();

  try {
    storage.setAcceptedMaterialContentRecord(database, {
      revisionId: "revision-1",
      content: "v1",
      contentFormat: "markdown",
    });
    storage.setAcceptedMaterialContentRecord(database, {
      revisionId: "revision-2",
      content: "v2",
      contentFormat: "markdown",
      sourceContentProvenance: { sourceId: "source-1", range: { start: 0, end: 2 } },
    });

    assert.equal(storage.getAcceptedMaterialContentRecord(database, "revision-1").content, "v1");
    const second = storage.getAcceptedMaterialContentRecord(database, "revision-2");
    assert.equal(second.content, "v2");
    assert.equal(second.byteSize, Buffer.byteLength("v2", "utf8"));
    assert.deepEqual(second.sourceContentProvenance, { sourceId: "source-1", range: { start: 0, end: 2 } });
  } finally {
    database.close();
  }
});

test("setAcceptedMaterialContentRecord_shouldRejectNonMaterialRevision_onMaterialContent", () => {
  const database = makeMaterialContentFixture();

  try {
    assert.throws(
      () =>
        storage.setAcceptedMaterialContentRecord(database, {
          revisionId: "topic-revision-1",
          content: "x",
          contentFormat: "markdown",
        }),
      storage.StorageInvariantError,
    );
  } finally {
    database.close();
  }
});
