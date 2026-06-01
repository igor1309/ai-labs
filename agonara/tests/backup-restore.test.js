import assert from "node:assert/strict";
import test from "node:test";
import { createCorpusCommands } from "../src/corpus.js";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import {
  countEffectiveAdmins,
  getLocalPasswordCredentialByLogin,
  initializeIdentityStorage,
  listAuditEvents,
  openIdentityDatabase,
} from "../src/storage.js";

test("restoreBackup_shouldRecoverIdentityStateAndExcludeSessions_onExportedBackup", async () => {
  const source = makeSUT({ ids: ["identity-1", "credential-1", "session-1", "audit-1"] });
  const target = makeSUT();

  try {
    await source.commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    const backupResult = source.commands.exportBackup?.();
    const restoreResult = target.commands.restoreBackup?.(backupResult?.value?.backup);

    assert.deepEqual(
      {
        backupStatus: backupResult?.status,
        restoreStatus: restoreResult?.status,
        auditEventTypes: listAuditEvents(target.database).map($0 => $0.eventType),
        effectiveAdminCount: countEffectiveAdmins(target.database),
        restoredCredentialLogin: getLocalPasswordCredentialByLogin(target.database, "admin@example.test")?.login,
        restoredSession: target.commands.resolveSession({ sessionId: "session-1" }),
      },
      {
        backupStatus: "accepted",
        restoreStatus: "accepted",
        auditEventTypes: ["bootstrap_first_admin"],
        effectiveAdminCount: 1,
        restoredCredentialLogin: "admin@example.test",
        restoredSession: {
          status: "rejected",
          reason: "session_not_found",
        },
      },
    );
  } finally {
    source.database.close();
    target.database.close();
  }
});

test("restoreBackup_shouldRejectNoEffectiveAdmin_onRevokedAdminBackup", async () => {
  const logEvents = [];
  const target = makeSUT({
    ids: ["identity-existing", "credential-existing", "session-existing", "audit-existing"],
    logEvents,
  });

  try {
    await target.commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Existing Admin",
      login: "existing@example.test",
      password: "correct horse battery staple",
    });
    logEvents.length = 0;

    const result = target.commands.restoreBackup({
      version: 1,
      identities: [
        {
          id: "identity-1",
          displayName: "Root Admin",
          state: "active",
          createdAt: "2026-05-27T10:00:00.000Z",
          disabledAt: null,
        },
      ],
      localPasswordCredentials: [],
      adminAuthorities: [
        {
          identityId: "identity-1",
          grantedAt: "2026-05-27T10:00:00.000Z",
          revokedAt: "2026-05-27T11:00:00.000Z",
        },
      ],
      auditEvents: [],
    });

    assert.deepEqual(
      {
        result,
        effectiveAdminCount: countEffectiveAdmins(target.database),
        existingCredentialLogin: getLocalPasswordCredentialByLogin(target.database, "existing@example.test")?.login,
        logOutcomes: logEvents.map($0 => ({ outcome: $0.outcome, reason: $0.reason ?? null })),
      },
      {
        result: {
          status: "rejected",
          reason: "last_admin_removal",
        },
        effectiveAdminCount: 1,
        existingCredentialLogin: "existing@example.test",
        logOutcomes: [
          {
            outcome: "started",
            reason: null,
          },
          {
            outcome: "rejected",
            reason: "last_admin_removal",
          },
        ],
      },
    );
  } finally {
    target.database.close();
  }
});

test("exportAndRestoreBackup_shouldEmitAcceptedOperationalLogs_onSuccessfulBackupRoundTrip", async () => {
  const logEvents = [];
  const source = makeSUT({ ids: ["identity-1", "credential-1", "session-1", "audit-1"], logEvents });
  const target = makeSUT({ logEvents });

  try {
    await source.commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    const backupResult = source.commands.exportBackup();
    target.commands.restoreBackup(backupResult.value.backup);

    assert.deepEqual(
      logEvents.map($0 => ({
        component: $0.component,
        operation: $0.operation,
        outcome: $0.outcome,
        severity: $0.severity,
      })),
      [
        {
          component: "identity",
          operation: "identity.backup.export",
          outcome: "started",
          severity: "info",
        },
        {
          component: "identity",
          operation: "identity.backup.export",
          outcome: "accepted",
          severity: "info",
        },
        {
          component: "identity",
          operation: "identity.backup.restore",
          outcome: "started",
          severity: "info",
        },
        {
          component: "identity",
          operation: "identity.backup.restore",
          outcome: "accepted",
          severity: "info",
        },
      ],
    );
  } finally {
    source.database.close();
    target.database.close();
  }
});

test("restoreBackup_shouldEmitFaultOperationalLog_onInvalidReferenceFault", () => {
  const logEvents = [];
  const target = makeSUT({ logEvents });

  try {
    const thrownMessage = captureThrownMessage(() =>
      target.commands.restoreBackup({
        version: 1,
        identities: [
          {
            id: "identity-1",
            displayName: "Root Admin",
            state: "active",
            createdAt: "2026-05-27T10:00:00.000Z",
            disabledAt: null,
          },
        ],
        localPasswordCredentials: [
          {
            id: "credential-1",
            identityId: "missing-identity",
            login: "admin@example.test",
            passwordHash: "hash",
            createdAt: "2026-05-27T10:00:00.000Z",
          },
        ],
        adminAuthorities: [
          {
            identityId: "identity-1",
            grantedAt: "2026-05-27T10:00:00.000Z",
            revokedAt: null,
          },
        ],
        auditEvents: [],
      }),
    );

    assert.deepEqual(
      {
        thrownMessage,
        logEvents: logEvents.map($0 => ({ outcome: $0.outcome, severity: $0.severity })),
      },
      {
        thrownMessage: "backup_restore_failed",
        logEvents: [
          {
            outcome: "started",
            severity: "info",
          },
          {
            outcome: "fault",
            severity: "error",
          },
        ],
      },
    );
  } finally {
    target.database.close();
  }
});

test("exportBackup_shouldEmitFaultOperationalLog_onStorageFault", () => {
  const logEvents = [];
  const commands = createIdentityCommands({
    bootstrapSecret: "operator-secret",
    database: null,
    now: () => new Date("2026-05-27T10:00:00.000Z"),
    operationLog: event => logEvents.push(event),
  });
  const thrownMessage = captureThrownMessage(() => commands.exportBackup());

  assert.deepEqual(
    {
      thrownMessage,
      logEvents: logEvents.map($0 => ({ outcome: $0.outcome, severity: $0.severity })),
    },
    {
      thrownMessage: "backup_export_failed",
      logEvents: [
        {
          outcome: "started",
          severity: "info",
        },
        {
          outcome: "fault",
          severity: "error",
        },
      ],
    },
  );
});

test("exportBackup_shouldIncludeProgramShellsMembershipsAndEvents_onBackup", async () => {
  const { commands, database } = makeSUT({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
    ],
  });

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    seedProgramRecords(database, {
      identityId: "identity-1",
      programId: "program-1",
      membershipId: "membership-1",
      programEventId: "program-event-1",
      membershipEventId: "membership-event-1",
    });

    const backup = commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        programShellIds: backup.programShells.map($0 => $0.id),
        programMembershipIds: backup.programMemberships.map($0 => $0.id),
        programEventTypes: backup.programEvents.map($0 => $0.eventType),
        programMembershipEventTypes: backup.programMembershipEvents.map($0 => $0.eventType),
      },
      {
        programShellIds: ["program-1"],
        programMembershipIds: ["membership-1"],
        programEventTypes: ["program_created"],
        programMembershipEventTypes: ["initial_curator_membership_created"],
      },
    );
  } finally {
    database.close();
  }
});

test("exportBackup_shouldIncludeCorpusRecords_onBackup", async () => {
  const { commands, database } = makeSUT({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
    ],
  });

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    seedProgramRecords(database, {
      identityId: "identity-1",
      programId: "program-1",
      membershipId: "membership-1",
      programEventId: "program-event-1",
      membershipEventId: "membership-event-1",
    });
    seedCorpusRecords(database, { identityId: "identity-1", programId: "program-1" });

    const backup = commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        sourceIds: backup.programSources?.map($0 => $0.id),
        candidateIds: backup.corpusCandidates?.map($0 => $0.id),
        entityIds: backup.acceptedCorpusEntities?.map($0 => $0.id),
        revisionIds: backup.acceptedCorpusRevisions?.map($0 => $0.id),
        eventTypes: backup.corpusEvents?.map($0 => $0.eventType),
      },
      {
        sourceIds: ["source-1"],
        candidateIds: ["candidate-1"],
        entityIds: ["entity-1"],
        revisionIds: ["revision-1"],
        eventTypes: ["corpus_candidate_accepted"],
      },
    );
  } finally {
    database.close();
  }
});

test("exportBackup_shouldIncludeAssessmentRecords_onBackup", async () => {
  const { commands, database } = makeSUT({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
    ],
  });

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    seedProgramRecords(database, {
      identityId: "identity-1",
      programId: "program-1",
      membershipId: "membership-1",
      programEventId: "program-event-1",
      membershipEventId: "membership-event-1",
    });
    seedCorpusRecords(database, { identityId: "identity-1", programId: "program-1" });
    seedAssessmentStorageRecords(database, { identityId: "identity-1", programId: "program-1" });

    const backup = commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        criterionCandidateIds: backup.assessmentCriterionCandidates?.map($0 => $0.id),
        criterionEntityIds: backup.acceptedAssessmentCriterionEntities?.map($0 => $0.id),
        criterionRevisionIds: backup.acceptedAssessmentCriterionRevisions?.map($0 => $0.id),
        checkCandidateIds: backup.openAnswerCheckCandidates?.map($0 => $0.id),
        checkEntityIds: backup.acceptedOpenAnswerCheckEntities?.map($0 => $0.id),
        checkRevisionIds: backup.acceptedOpenAnswerCheckRevisions?.map($0 => $0.id),
        checkCriterionRevisionIds: backup.acceptedOpenAnswerCheckRevisions?.flatMap(
          $0 => $0.criterionRevisionIds,
        ),
      },
      {
        criterionCandidateIds: ["criterion-candidate-existing"],
        criterionEntityIds: ["criterion-entity-existing"],
        criterionRevisionIds: ["criterion-revision-existing"],
        checkCandidateIds: ["check-candidate-existing"],
        checkEntityIds: ["check-entity-existing"],
        checkRevisionIds: ["check-revision-existing"],
        checkCriterionRevisionIds: ["criterion-revision-existing"],
      },
    );
  } finally {
    database.close();
  }
});

test("restoreBackup_shouldRejectOrphanProgramShellWithoutActiveCuratorMembership", async () => {
  const source = makeSUT({ ids: ["identity-1", "credential-1", "session-1", "audit-1"] });
  const target = makeSUT();

  try {
    await source.commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    seedProgramRecords(source.database, {
      identityId: "identity-1",
      programId: "program-1",
      membershipId: "membership-1",
      programEventId: "program-event-1",
      membershipEventId: "membership-event-1",
    });

    const backup = source.commands.exportBackup().value.backup;
    // Drop the curator membership while keeping the program shell to simulate orphan state.
    backup.programMemberships = [];

    const restoreResult = target.commands.restoreBackup(backup);

    assert.deepEqual(restoreResult, {
      status: "rejected",
      reason: "program_curator_missing",
    });
  } finally {
    source.database.close();
    target.database.close();
  }
});

test("restoreBackup_shouldRestoreProgramShellsMembershipsAndEvents_onAcceptedBackup", async () => {
  const source = makeSUT({ ids: ["identity-1", "credential-1", "session-1", "audit-1"] });
  const target = makeSUT();

  try {
    await source.commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    seedProgramRecords(source.database, {
      identityId: "identity-1",
      programId: "program-1",
      membershipId: "membership-1",
      programEventId: "program-event-1",
      membershipEventId: "membership-event-1",
    });

    const backup = source.commands.exportBackup().value.backup;
    const restoreResult = target.commands.restoreBackup(backup);

    const restoredBackup = target.commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        restoreStatus: restoreResult.status,
        shellIds: restoredBackup.programShells.map($0 => $0.id),
        membershipIds: restoredBackup.programMemberships.map($0 => $0.id),
        programEventIds: restoredBackup.programEvents.map($0 => $0.id),
        membershipEventIds: restoredBackup.programMembershipEvents.map($0 => $0.id),
      },
      {
        restoreStatus: "accepted",
        shellIds: ["program-1"],
        membershipIds: ["membership-1"],
        programEventIds: ["program-event-1"],
        membershipEventIds: ["membership-event-1"],
      },
    );
  } finally {
    source.database.close();
    target.database.close();
  }
});

test("restoreBackup_shouldRestoreCorpusRecords_onAcceptedBackup", async () => {
  const source = makeSUT({ ids: ["identity-1", "credential-1", "session-1", "audit-1"] });
  const target = makeSUT();

  try {
    await source.commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    seedProgramRecords(source.database, {
      identityId: "identity-1",
      programId: "program-1",
      membershipId: "membership-1",
      programEventId: "program-event-1",
      membershipEventId: "membership-event-1",
    });
    seedCorpusRecords(source.database, { identityId: "identity-1", programId: "program-1" });

    const restoreResult = target.commands.restoreBackup(source.commands.exportBackup().value.backup);
    const restoredBackup = target.commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        restoreStatus: restoreResult.status,
        sourceIds: restoredBackup.programSources.map($0 => $0.id),
        candidateIds: restoredBackup.corpusCandidates.map($0 => $0.id),
        entityIds: restoredBackup.acceptedCorpusEntities.map($0 => $0.id),
        revisionIds: restoredBackup.acceptedCorpusRevisions.map($0 => $0.id),
        eventIds: restoredBackup.corpusEvents.map($0 => $0.id),
      },
      {
        restoreStatus: "accepted",
        sourceIds: ["source-1"],
        candidateIds: ["candidate-1"],
        entityIds: ["entity-1"],
        revisionIds: ["revision-1"],
        eventIds: ["corpus-event-1"],
      },
    );
  } finally {
    source.database.close();
    target.database.close();
  }
});

test("restoreBackup_shouldRestoreAssessmentRecordsAndRevisionGraph_onAcceptedBackup", async () => {
  const source = makeSUT({ ids: ["identity-1", "credential-1", "session-1", "audit-1"] });
  const target = makeSUT();

  try {
    await source.commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });
    seedProgramRecords(source.database, {
      identityId: "identity-1",
      programId: "program-1",
      membershipId: "membership-1",
      programEventId: "program-event-1",
      membershipEventId: "membership-event-1",
    });
    seedCorpusRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedAssessmentStorageRecords(source.database, { identityId: "identity-1", programId: "program-1" });

    const restoreResult = target.commands.restoreBackup(source.commands.exportBackup().value.backup);
    const restoredBackup = target.commands.exportBackup().value.backup;
    const corpusCommands = makeCorpusCommands(target.database);

    assert.deepEqual(
      {
        restoreStatus: restoreResult.status,
        criterionCandidateIds: restoredBackup.assessmentCriterionCandidates.map($0 => $0.id),
        criterionEntityIds: restoredBackup.acceptedAssessmentCriterionEntities.map($0 => $0.id),
        criterionRevisionIds: restoredBackup.acceptedAssessmentCriterionRevisions.map($0 => $0.id),
        checkCandidateIds: restoredBackup.openAnswerCheckCandidates.map($0 => $0.id),
        checkEntityIds: restoredBackup.acceptedOpenAnswerCheckEntities.map($0 => $0.id),
        checkRevisionIds: restoredBackup.acceptedOpenAnswerCheckRevisions.map($0 => $0.id),
        acceptedCriterionTitles: corpusCommands.listAcceptedAssessmentCriteria({
          actingIdentityId: "identity-1",
          programId: "program-1",
        }).value.acceptedAssessmentCriteria.map($0 => $0.title),
        historicalCheckCriterionRevisionIds: corpusCommands.getAcceptedOpenAnswerCheckRevision({
          actingIdentityId: "identity-1",
          revisionId: "check-revision-existing",
        }).value.acceptedOpenAnswerCheck.criterionRevisionIds,
      },
      {
        restoreStatus: "accepted",
        criterionCandidateIds: ["criterion-candidate-existing"],
        criterionEntityIds: ["criterion-entity-existing"],
        criterionRevisionIds: ["criterion-revision-existing"],
        checkCandidateIds: ["check-candidate-existing"],
        checkEntityIds: ["check-entity-existing"],
        checkRevisionIds: ["check-revision-existing"],
        acceptedCriterionTitles: ["Accepted criterion"],
        historicalCheckCriterionRevisionIds: ["criterion-revision-existing"],
      },
    );
  } finally {
    source.database.close();
    target.database.close();
  }
});

test("restoreBackup_shouldClearAssessmentStorageRecords_onBackupWithoutAssessmentPayload", async () => {
  const backup = await makeExportedCorpusBackup();
  const target = makeSUT({ ids: ["identity-existing", "credential-existing", "session-existing", "audit-existing"] });

  try {
    await target.commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Existing Admin",
      login: "existing@example.test",
      password: "correct horse battery staple",
    });
    seedProgramRecords(target.database, {
      identityId: "identity-existing",
      programId: "program-existing",
      membershipId: "membership-existing",
      programEventId: "program-event-existing",
      membershipEventId: "membership-event-existing",
    });
    seedCorpusRecords(target.database, {
      identityId: "identity-existing",
      programId: "program-existing",
    });
    seedAssessmentStorageRecords(target.database, {
      identityId: "identity-existing",
      programId: "program-existing",
    });

    const restoreResult = target.commands.restoreBackup(backup);

    assert.deepEqual(
      {
        restoreStatus: restoreResult.status,
        assessmentRows: countAssessmentStorageRows(target.database),
      },
      {
        restoreStatus: "accepted",
        assessmentRows: 0,
      },
    );
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldClearStudentAttemptStorageBeforeAssessmentRecords_onBackupWithoutAttempts", async () => {
  const backup = await makeExportedCorpusBackup();
  const target = makeSUT({ ids: ["identity-existing", "credential-existing", "session-existing", "audit-existing"] });

  try {
    await target.commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Existing Admin",
      login: "existing@example.test",
      password: "correct horse battery staple",
    });
    seedProgramRecords(target.database, {
      identityId: "identity-existing",
      programId: "program-existing",
      membershipId: "membership-existing",
      programEventId: "program-event-existing",
      membershipEventId: "membership-event-existing",
    });
    seedCorpusRecords(target.database, {
      identityId: "identity-existing",
      programId: "program-existing",
    });
    seedAssessmentStorageRecords(target.database, {
      identityId: "identity-existing",
      programId: "program-existing",
    });
    seedStudentAttemptStorageRecords(target.database, {
      identityId: "identity-existing",
      programId: "program-existing",
    });

    const restoreResult = target.commands.restoreBackup(backup);

    assert.deepEqual(
      {
        restoreStatus: restoreResult.status,
        studentAttemptRows: countStudentAttemptStorageRows(target.database),
      },
      {
        restoreStatus: "accepted",
        studentAttemptRows: 0,
      },
    );
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectAcceptedAssessmentCriterionEntityWithoutCurrentRevision_onBackup", async () => {
  const backup = await makeExportedAssessmentBackup();
  const target = makeSUT();

  try {
    backup.acceptedAssessmentCriterionRevisions = [];

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "criterion_revision_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectAcceptedAssessmentCriterionRevisionWithoutCandidate_onBackup", async () => {
  const backup = await makeExportedAssessmentBackup();
  const target = makeSUT();

  try {
    backup.assessmentCriterionCandidates = [];

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "criterion_candidate_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectAcceptedAssessmentCriterionRevisionWithoutEntity_onBackup", async () => {
  const backup = await makeExportedAssessmentBackup();
  const target = makeSUT();

  try {
    backup.acceptedAssessmentCriterionEntities = [];

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "criterion_entity_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectAcceptedAssessmentCriterionRevisionWithUnacceptedCandidate_onBackup", async () => {
  const backup = await makeExportedAssessmentBackup();
  const target = makeSUT();

  try {
    backup.assessmentCriterionCandidates[0] = {
      ...backup.assessmentCriterionCandidates[0],
      status: "draft",
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "criterion_candidate_not_accepted",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectAcceptedOpenAnswerCheckRevisionWithUnacceptedCandidate_onBackup", async () => {
  const backup = await makeExportedAssessmentBackup();
  const target = makeSUT();

  try {
    backup.openAnswerCheckCandidates[0] = {
      ...backup.openAnswerCheckCandidates[0],
      status: "draft",
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "check_candidate_not_accepted",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectAcceptedOpenAnswerCheckEntityWithoutCurrentRevision_onBackup", async () => {
  const backup = await makeExportedAssessmentBackup();
  const target = makeSUT();

  try {
    backup.acceptedOpenAnswerCheckRevisions = [];

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "check_revision_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectAcceptedOpenAnswerCheckRevisionWithoutCandidate_onBackup", async () => {
  const backup = await makeExportedAssessmentBackup();
  const target = makeSUT();

  try {
    backup.openAnswerCheckCandidates = [];

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "check_candidate_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectAcceptedOpenAnswerCheckRevisionWithoutEntity_onBackup", async () => {
  const backup = await makeExportedAssessmentBackup();
  const target = makeSUT();

  try {
    backup.acceptedOpenAnswerCheckEntities = [];

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "check_entity_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectAcceptedOpenAnswerCheckRevisionWithMissingCriterionRevision_onBackup", async () => {
  const backup = await makeExportedAssessmentBackup();
  const target = makeSUT();

  try {
    backup.acceptedOpenAnswerCheckRevisions[0] = {
      ...backup.acceptedOpenAnswerCheckRevisions[0],
      criterionRevisionIds: ["criterion-revision-missing"],
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "criterion_revision_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectOpenAnswerCheckCandidateWithCrossProgramCriterionEntity_onBackup", async () => {
  const backup = await makeExportedAssessmentBackup();
  const target = makeSUT();

  try {
    backup.openAnswerCheckCandidates[0] = {
      ...backup.openAnswerCheckCandidates[0],
      programId: "other-program",
      sourceIds: [],
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "criterion_entity_program_mismatch",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectAcceptedCorpusEntityWithoutCurrentRevision_onBackup", async () => {
  const backup = await makeExportedCorpusBackup();
  const target = makeSUT();

  try {
    backup.acceptedCorpusRevisions = [];

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "accepted_revision_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectAcceptedCorpusRevisionWithoutCandidate_onBackup", async () => {
  const backup = await makeExportedCorpusBackup();
  const target = makeSUT();

  try {
    backup.corpusCandidates = [];

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "candidate_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectAcceptedCorpusRevisionWithUnacceptedCandidate_onBackup", async () => {
  const backup = await makeExportedCorpusBackup();
  const target = makeSUT();

  try {
    backup.corpusCandidates[0] = {
      ...backup.corpusCandidates[0],
      status: "draft",
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "candidate_not_accepted",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectAcceptedCorpusRevisionWithoutEntity_onBackup", async () => {
  const backup = await makeExportedCorpusBackup();
  const target = makeSUT();

  try {
    backup.acceptedCorpusEntities = [];

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "accepted_entity_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectAcceptedCorpusRevisionWithCrossProgramSource_onBackup", async () => {
  const backup = await makeExportedCorpusBackup();
  const target = makeSUT();

  try {
    backup.programSources[0] = {
      ...backup.programSources[0],
      programId: "other-program",
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "source_program_mismatch",
    });
  } finally {
    target.database.close();
  }
});

function seedProgramRecords(database, {
  identityId,
  programId,
  membershipId,
  programEventId,
  membershipEventId,
  createdAt = "2026-05-27T10:01:00.000Z",
}) {
  database
    .prepare(
      `insert into program_shells (
         id, title, description, admission_policy, created_by_identity_id, created_at
       ) values (?, ?, ?, ?, ?, ?)`,
    )
    .run(programId, "Sample Program", null, "self_join", identityId, createdAt);
  database
    .prepare(
      `insert into program_memberships (
         id, program_id, identity_id, participation_kind, status, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(membershipId, programId, identityId, "program_curator", "active", createdAt, createdAt);
  database
    .prepare(
      `insert into program_events (
         id, event_type, actor_identity_id, program_id, occurred_at, outcome, reason
       ) values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(programEventId, "program_created", identityId, programId, createdAt, "accepted", null);
  database
    .prepare(
      `insert into program_membership_events (
         id, event_type, actor_identity_id, target_identity_id, program_id,
         participation_kind, resulting_status, occurred_at, outcome, reason
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      membershipEventId,
      "initial_curator_membership_created",
      identityId,
      identityId,
      programId,
      "program_curator",
      "active",
      createdAt,
      "accepted",
      null,
    );
}

function seedCorpusRecords(database, { identityId, programId }) {
  database
    .prepare(
      `insert into program_sources (
         id, program_id, source_kind, title, locator, citation, recorded_by_identity_id, recorded_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "source-1",
      programId,
      "article",
      "Source",
      "https://example.test/source",
      "Citation",
      identityId,
      "2026-05-27T10:02:00.000Z",
    );
  database
    .prepare(
      `insert into corpus_candidates (
         id, program_id, candidate_kind, title, body, source_ids_json, rationale, status,
         created_by_identity_id, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "candidate-1",
      programId,
      "topic",
      "Candidate",
      "Body",
      JSON.stringify(["source-1"]),
      "Rationale",
      "accepted",
      identityId,
      "2026-05-27T10:03:00.000Z",
      "2026-05-27T10:04:00.000Z",
    );
  database
    .prepare(
      `insert into accepted_corpus_entities (
         id, program_id, accepted_kind, current_revision_id
       ) values (?, ?, ?, ?)`,
    )
    .run("entity-1", programId, "topic", "revision-1");
  database
    .prepare(
      `insert into accepted_corpus_revisions (
         id, entity_id, program_id, accepted_kind, title, body, accepted_from_candidate_id,
         source_ids_json, rationale, accepted_by_identity_id, accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "revision-1",
      "entity-1",
      programId,
      "topic",
      "Accepted",
      "Accepted Body",
      "candidate-1",
      JSON.stringify(["source-1"]),
      "Rationale",
      identityId,
      "2026-05-27T10:05:00.000Z",
    );
  database
    .prepare(
      `insert into corpus_events (
         id, event_type, actor_identity_id, program_id, target_id, occurred_at, outcome, reason
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "corpus-event-1",
      "corpus_candidate_accepted",
      identityId,
      programId,
      "candidate-1",
      "2026-05-27T10:06:00.000Z",
      "accepted",
      null,
    );
}

function seedAssessmentStorageRecords(database, { identityId, programId }) {
  database
    .prepare(
      `insert into assessment_criterion_candidates (
         id, program_id, title, body, source_ids_json, rationale, status,
         created_by_identity_id, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "criterion-candidate-existing",
      programId,
      "Criterion",
      "Criterion body",
      JSON.stringify(["source-1"]),
      "Criterion rationale",
      "accepted",
      identityId,
      "2026-05-27T10:07:00.000Z",
      "2026-05-27T10:08:00.000Z",
    );
  database
    .prepare(
      `insert into accepted_assessment_criterion_entities (
         id, program_id, current_revision_id
       ) values (?, ?, ?)`,
    )
    .run("criterion-entity-existing", programId, "criterion-revision-existing");
  database
    .prepare(
      `insert into accepted_assessment_criterion_revisions (
         id, entity_id, program_id, title, body, accepted_from_candidate_id, source_ids_json,
         rationale, accepted_by_identity_id, accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "criterion-revision-existing",
      "criterion-entity-existing",
      programId,
      "Accepted criterion",
      "Accepted criterion body",
      "criterion-candidate-existing",
      JSON.stringify(["source-1"]),
      "Criterion rationale",
      identityId,
      "2026-05-27T10:09:00.000Z",
    );
  database
    .prepare(
      `insert into open_answer_check_candidates (
         id, program_id, check_kind, title, prompt, source_ids_json, criterion_entity_ids_json,
         rationale, status, created_by_identity_id, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "check-candidate-existing",
      programId,
      "open_answer",
      "Check",
      "Prompt",
      JSON.stringify(["source-1"]),
      JSON.stringify(["criterion-entity-existing"]),
      "Check rationale",
      "accepted",
      identityId,
      "2026-05-27T10:10:00.000Z",
      "2026-05-27T10:11:00.000Z",
    );
  database
    .prepare(
      `insert into accepted_open_answer_check_entities (
         id, program_id, current_revision_id
       ) values (?, ?, ?)`,
    )
    .run("check-entity-existing", programId, "check-revision-existing");
  database
    .prepare(
      `insert into accepted_open_answer_check_revisions (
         id, entity_id, program_id, check_kind, title, prompt, accepted_from_candidate_id,
         source_ids_json, criterion_revision_ids_json, rationale, accepted_by_identity_id, accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "check-revision-existing",
      "check-entity-existing",
      programId,
      "open_answer",
      "Accepted check",
      "Accepted prompt",
      "check-candidate-existing",
      JSON.stringify(["source-1"]),
      JSON.stringify(["criterion-revision-existing"]),
      "Check rationale",
      identityId,
      "2026-05-27T10:12:00.000Z",
    );
}

function countAssessmentStorageRows(database) {
  return [
    "assessment_criterion_candidates",
    "accepted_assessment_criterion_entities",
    "accepted_assessment_criterion_revisions",
    "open_answer_check_candidates",
    "accepted_open_answer_check_entities",
    "accepted_open_answer_check_revisions",
  ].reduce((count, tableName) => {
    const row = database.prepare(`select count(*) as count from ${tableName}`).get();
    return count + row.count;
  }, 0);
}

function seedStudentAttemptStorageRecords(database, { identityId, programId }) {
  database
    .prepare(
      `insert into open_answer_attempts (
         id,
         program_id,
         student_identity_id,
         check_revision_id,
         criterion_revision_ids_json,
         submitted_answer,
         idempotency_key,
         status,
         submitted_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "attempt-existing",
      programId,
      identityId,
      "check-revision-existing",
      JSON.stringify(["criterion-revision-existing"]),
      "Submitted answer",
      "idempotency-existing",
      "evaluated",
      "2026-05-27T10:13:00.000Z",
      "2026-05-27T10:14:00.000Z",
    );
  database
    .prepare(
      `insert into open_answer_evaluations (
         id,
         attempt_id,
         program_id,
         student_identity_id,
         check_revision_id,
         criterion_revision_ids_json,
         evaluator_kind,
         summary_feedback,
         criterion_feedback_json,
         evaluated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "evaluation-existing",
      "attempt-existing",
      programId,
      identityId,
      "check-revision-existing",
      JSON.stringify(["criterion-revision-existing"]),
      "student_workspace",
      "Summary feedback",
      JSON.stringify([
        {
          criterionRevisionId: "criterion-revision-existing",
          outcome: "met",
          feedback: "Criterion feedback",
        },
      ]),
      "2026-05-27T10:15:00.000Z",
    );
  database
    .prepare(
      `insert into open_answer_evaluation_failures (attempt_id, reason, failed_at)
       values (?, ?, ?)`,
    )
    .run("attempt-existing", "temporary evaluator outage", "2026-05-27T10:16:00.000Z");
}

function countStudentAttemptStorageRows(database) {
  return [
    "open_answer_evaluation_failures",
    "open_answer_evaluations",
    "open_answer_attempts",
  ].reduce((count, tableName) => {
    const row = database.prepare(`select count(*) as count from ${tableName}`).get();
    return count + row.count;
  }, 0);
}

async function makeExportedCorpusBackup() {
  const source = makeSUT({ ids: ["identity-1", "credential-1", "session-1", "audit-1"] });

  try {
    await source.commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });
    seedProgramRecords(source.database, {
      identityId: "identity-1",
      programId: "program-1",
      membershipId: "membership-1",
      programEventId: "program-event-1",
      membershipEventId: "membership-event-1",
    });
    seedCorpusRecords(source.database, { identityId: "identity-1", programId: "program-1" });

    return source.commands.exportBackup().value.backup;
  } finally {
    source.database.close();
  }
}

async function makeExportedAssessmentBackup() {
  const source = makeSUT({ ids: ["identity-1", "credential-1", "session-1", "audit-1"] });

  try {
    await source.commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });
    seedProgramRecords(source.database, {
      identityId: "identity-1",
      programId: "program-1",
      membershipId: "membership-1",
      programEventId: "program-event-1",
      membershipEventId: "membership-event-1",
    });
    seedCorpusRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedAssessmentStorageRecords(source.database, { identityId: "identity-1", programId: "program-1" });

    return source.commands.exportBackup().value.backup;
  } finally {
    source.database.close();
  }
}

function makeSUT({ ids = [], logEvents = [] } = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const commands = createIdentityCommands({
    bootstrapSecret: "operator-secret",
    database,
    generateId: makeIdGenerator(ids),
    now: () => new Date("2026-05-27T10:00:00.000Z"),
    operationLog: event => logEvents.push(event),
  });
  return { commands, database };
}

function makeCorpusCommands(database) {
  const programCommands = createProgramCommands({
    database,
    generateId: makeIdGenerator([]),
    now: () => new Date("2026-05-27T10:00:00.000Z"),
  });
  return createCorpusCommands({
    database,
    generateId: makeIdGenerator([]),
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
    now: () => new Date("2026-05-27T10:00:00.000Z"),
  });
}

function makeIdGenerator(ids) {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function captureThrownMessage(action) {
  try {
    action();
    return null;
  } catch (error) {
    return error.message;
  }
}
