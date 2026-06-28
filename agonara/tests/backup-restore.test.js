import assert from "node:assert/strict";
import test from "node:test";
import { createCorpusCommands } from "../src/corpus.js";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import { createStudentWorkspaceCommands } from "../src/student-workspace.js";
import * as storage from "../src/storage.js";
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
        hasRequestId: typeof $0.requestId === "string",
        operation: $0.operation,
        outcome: $0.outcome,
        severity: $0.severity,
      })),
      [
        {
          component: "identity-role-management",
          hasRequestId: true,
          operation: "identity.backup.export",
          outcome: "started",
          severity: "info",
        },
        {
          component: "identity-role-management",
          hasRequestId: true,
          operation: "identity.backup.export",
          outcome: "accepted",
          severity: "info",
        },
        {
          component: "identity-role-management",
          hasRequestId: true,
          operation: "identity.backup.restore",
          outcome: "started",
          severity: "info",
        },
        {
          component: "identity-role-management",
          hasRequestId: true,
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

test("exportBackup_shouldIncludeProgramInvitationsAndMembershipEventMetadata_onBackup", async () => {
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
    seedMembershipInvitationRecords(database);

    const backup = commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        invitationIds: backup.programInvitations?.map($0 => $0.id),
        invitationStatuses: backup.programInvitations?.map($0 => $0.status),
        eventMetadata: backup.programMembershipEvents.map($0 => ({
          id: $0.id,
          policyPath: $0.policyPath,
          invitationStatus: $0.invitationStatus,
        })),
      },
      {
        invitationIds: ["invitation-1"],
        invitationStatuses: ["accepted"],
        eventMetadata: [
          {
            id: "membership-event-1",
            policyPath: null,
            invitationStatus: null,
          },
          {
            id: "membership-event-2",
            policyPath: "curator_invitation",
            invitationStatus: "accepted",
          },
        ],
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

test("exportBackup_shouldIncludeNavigationRelationshipRecords_onBackup", async () => {
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
    seedNavigationRelationshipRecords(database, { identityId: "identity-1", programId: "program-1" });

    const backup = commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        relationshipIds: backup.acceptedNavigationRelationships?.map($0 => $0.id),
        relationshipRevisionIds: backup.acceptedNavigationRelationshipRevisions?.map($0 => $0.id),
      },
      {
        relationshipIds: ["relationship-1"],
        relationshipRevisionIds: ["relationship-revision-1"],
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

test("exportBackup_shouldIncludeStudentAttemptRecords_onBackup", async () => {
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
    seedStudentAttemptStorageRecords(database, { identityId: "identity-1", programId: "program-1" });

    const backup = commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        attemptIds: backup.openAnswerAttempts?.map($0 => $0.id),
        attemptIdempotencyKeys: backup.openAnswerAttempts?.map($0 => $0.idempotencyKey),
        attemptCheckRevisionIds: backup.openAnswerAttempts?.map($0 => $0.checkRevisionId),
        attemptCriterionRevisionIds: backup.openAnswerAttempts?.flatMap($0 => $0.criterionRevisionIds),
        evaluationIds: backup.openAnswerEvaluations?.map($0 => $0.id),
        evaluationCriterionRevisionIds: backup.openAnswerEvaluations?.flatMap($0 => $0.criterionRevisionIds),
        failureAttemptIds: backup.openAnswerEvaluationFailures?.map($0 => $0.attemptId),
      },
      {
        attemptIds: ["attempt-existing", "attempt-failed"],
        attemptIdempotencyKeys: ["idempotency-existing", "idempotency-failed"],
        attemptCheckRevisionIds: ["check-revision-existing", "check-revision-existing"],
        attemptCriterionRevisionIds: ["criterion-revision-existing", "criterion-revision-existing"],
        evaluationIds: ["evaluation-existing"],
        evaluationCriterionRevisionIds: ["criterion-revision-existing"],
        failureAttemptIds: ["attempt-failed"],
      },
    );
  } finally {
    database.close();
  }
});

test("exportBackup_shouldIncludeOpenAnswerEvaluatorRunsAndEvidence_onBackup", async () => {
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
    seedStudentAttemptStorageRecords(database, { identityId: "identity-1", programId: "program-1" });
    seedOpenAnswerEvaluatorRunAndEvidenceRecords(database, {
      identityId: "identity-1",
      programId: "program-1",
    });

    const backup = commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        runIds: backup.openAnswerEvaluatorRuns?.map($0 => $0.id),
        runAttemptIds: backup.openAnswerEvaluatorRuns?.map($0 => $0.attemptId),
        runCriterionRevisionIds: backup.openAnswerEvaluatorRuns?.flatMap($0 => $0.criterionRevisionIds),
        evidenceIds: backup.openAnswerEvaluatorEvidence?.map($0 => $0.id),
        evidenceRunIds: backup.openAnswerEvaluatorEvidence?.map($0 => $0.evaluatorRunId),
        evidenceVisibility: backup.openAnswerEvaluatorEvidence?.map($0 => $0.visibility),
      },
      {
        runIds: ["evaluator-run-existing"],
        runAttemptIds: ["attempt-existing"],
        runCriterionRevisionIds: ["criterion-revision-existing"],
        evidenceIds: ["evidence-existing"],
        evidenceRunIds: ["evaluator-run-existing"],
        evidenceVisibility: ["internal"],
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

test("restoreBackup_shouldRestoreProgramInvitationsAndMembershipEventMetadata_onAcceptedBackup", async () => {
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
    seedMembershipInvitationRecords(source.database);

    const restoreResult = target.commands.restoreBackup(source.commands.exportBackup().value.backup);
    const restoredBackup = target.commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        restoreStatus: restoreResult.status,
        invitationIds: restoredBackup.programInvitations?.map($0 => $0.id),
        invitationStatuses: restoredBackup.programInvitations?.map($0 => $0.status),
        eventMetadata: restoredBackup.programMembershipEvents.map($0 => ({
          id: $0.id,
          policyPath: $0.policyPath,
          invitationStatus: $0.invitationStatus,
        })),
      },
      {
        restoreStatus: "accepted",
        invitationIds: ["invitation-1"],
        invitationStatuses: ["accepted"],
        eventMetadata: [
          {
            id: "membership-event-1",
            policyPath: null,
            invitationStatus: null,
          },
          {
            id: "membership-event-2",
            policyPath: "curator_invitation",
            invitationStatus: "accepted",
          },
        ],
      },
    );
  } finally {
    source.database.close();
    target.database.close();
  }
});

test("restoreBackup_shouldRejectMalformedProgramInvitations_onBackup", async () => {
  const backup = await makeExportedProgramInvitationBackup();
  const cases = [
    {
      mutate: candidate => {
        candidate.programShells[0] = { ...candidate.programShells[0], admissionPolicy: "approval_required" };
      },
      reason: "validation_failed",
    },
    {
      mutate: candidate => {
        candidate.programInvitations.push({ ...candidate.programInvitations[0] });
      },
      reason: "invitation_conflict",
    },
    {
      mutate: candidate => {
        candidate.programInvitations[0] = {
          ...candidate.programInvitations[0],
          status: "pending",
          statusChangedByIdentityId: null,
          statusChangedAt: null,
        };
        candidate.programInvitations.push({
          ...candidate.programInvitations[0],
          id: "invitation-2",
          status: "pending",
          statusChangedByIdentityId: null,
          statusChangedAt: null,
        });
      },
      reason: "invitation_conflict",
    },
    {
      mutate: candidate => {
        candidate.programInvitations[0] = { ...candidate.programInvitations[0], programId: "missing-program" };
      },
      reason: "program_not_found",
    },
    {
      mutate: candidate => {
        candidate.programInvitations[0] = { ...candidate.programInvitations[0], targetIdentityId: "missing-identity" };
      },
      reason: "identity_not_found",
    },
    {
      mutate: candidate => {
        candidate.programInvitations[0] = { ...candidate.programInvitations[0], participationKind: "program_curator" };
      },
      reason: "unsupported_participation_kind",
    },
    {
      mutate: candidate => {
        candidate.programMemberships.push({ ...candidate.programMemberships[0], id: "membership-duplicate" });
      },
      reason: "membership_conflict",
    },
    {
      mutate: candidate => {
        candidate.programMembershipEvents[1] = {
          ...candidate.programMembershipEvents[1],
          policyPath: "payment",
        };
      },
      reason: "validation_failed",
    },
    {
      mutate: candidate => {
        candidate.programMembershipEvents[1] = {
          ...candidate.programMembershipEvents[1],
          invitationStatus: "expired",
        };
      },
      reason: "validation_failed",
    },
  ];

  const reasons = cases.map(testCase => {
    const candidate = structuredClone(backup);
    testCase.mutate(candidate);
    const target = makeSUT();

    try {
      return target.commands.restoreBackup(candidate).reason;
    } finally {
      target.database.close();
    }
  });

  assert.deepEqual(
    reasons,
    cases.map($0 => $0.reason),
  );
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

test("exportBackup_shouldIncludeLifecycleStatus_onAcceptedEntityAndSourceRecords_status", async () => {
  const backup = await makeExportedCorpusBackup();

  assert.deepEqual(
    {
      sourceStatuses: backup.programSources.map($0 => $0.status),
      sourceStatusAttribution: backup.programSources.map($0 => ({
        updatedByIdentityId: $0.statusUpdatedByIdentityId,
        updatedAt: $0.statusUpdatedAt,
      })),
      entityStatuses: backup.acceptedCorpusEntities.map($0 => $0.status),
      entityStatusAttribution: backup.acceptedCorpusEntities.map($0 => ({
        updatedByIdentityId: $0.statusUpdatedByIdentityId,
        updatedAt: $0.statusUpdatedAt,
      })),
    },
    {
      sourceStatuses: ["active"],
      sourceStatusAttribution: [{ updatedByIdentityId: null, updatedAt: null }],
      entityStatuses: ["active"],
      entityStatusAttribution: [{ updatedByIdentityId: null, updatedAt: null }],
    },
  );
});

test("restoreBackup_shouldRejectInvalidLifecycleStatus_beforeMutation_status", async () => {
  const backup = await makeExportedCorpusBackup();
  const target = makeSUT();

  try {
    const seedResult = target.commands.restoreBackup(backup);
    const invalidBackup = structuredClone(backup);
    invalidBackup.programSources[0] = {
      ...invalidBackup.programSources[0],
      status: "archived",
    };
    const result = target.commands.restoreBackup(invalidBackup);

    assert.deepEqual(
      {
        seedStatus: seedResult.status,
        result,
        restoredSourceStatuses: target.commands.exportBackup().value.backup.programSources.map($0 => $0.status),
      },
      {
        seedStatus: "accepted",
        result: {
          status: "rejected",
          reason: "lifecycle_status_invalid",
        },
        restoredSourceStatuses: ["active"],
      },
    );
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRoundTripWithdrawnEntityAndSourceGraph_status", async () => {
  const backup = await makeExportedWithdrawnCorpusBackup();
  const target = makeSUT();

  try {
    const result = target.commands.restoreBackup(backup);
    const restored = target.commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        result,
        entityStatuses: restored.acceptedCorpusEntities.map($0 => $0.status),
        sourceStatuses: restored.programSources.map($0 => $0.status),
        revisionSources: restored.acceptedCorpusRevisions.map($0 => $0.sourceIds),
      },
      {
        result: { status: "accepted", value: { restored: true } },
        entityStatuses: ["withdrawn"],
        sourceStatuses: ["withdrawn"],
        revisionSources: [["source-1"]],
      },
    );
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectUnresolvableWithdrawnGraphs_beforeMutation_status", async () => {
  const baseline = await makeExportedCorpusBackup();
  const withdrawn = await makeExportedWithdrawnCorpusBackup();
  const target = makeSUT();

  try {
    const seedResult = target.commands.restoreBackup(baseline);
    const missingRevision = structuredClone(withdrawn);
    missingRevision.acceptedCorpusRevisions = [];
    const missingSource = structuredClone(withdrawn);
    missingSource.programSources = [];

    const results = [
      target.commands.restoreBackup(missingRevision),
      target.commands.restoreBackup(missingSource),
    ];
    const restored = target.commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        seedStatus: seedResult.status,
        results,
        entityStatuses: restored.acceptedCorpusEntities.map($0 => $0.status),
        sourceStatuses: restored.programSources.map($0 => $0.status),
      },
      {
        seedStatus: "accepted",
        results: [
          { status: "rejected", reason: "accepted_revision_not_found" },
          { status: "rejected", reason: "program_source_not_found" },
        ],
        entityStatuses: ["active"],
        sourceStatuses: ["active"],
      },
    );
  } finally {
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

test("restoreBackup_shouldRestoreStudentAttemptRecords_onAcceptedBackup", async () => {
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
    seedStudentAttemptStorageRecords(source.database, { identityId: "identity-1", programId: "program-1" });

    const restoreResult = target.commands.restoreBackup(source.commands.exportBackup().value.backup);
    const restoredBackup = target.commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        restoreStatus: restoreResult.status,
        attempts: restoredBackup.openAnswerAttempts.map(projectAttemptBackupRecord),
        evaluations: restoredBackup.openAnswerEvaluations.map(projectEvaluationBackupRecord),
        failures: restoredBackup.openAnswerEvaluationFailures,
      },
      {
        restoreStatus: "accepted",
        attempts: [
          {
            id: "attempt-existing",
            programId: "program-1",
            studentIdentityId: "identity-1",
            checkRevisionId: "check-revision-existing",
            criterionRevisionIds: ["criterion-revision-existing"],
            idempotencyKey: "idempotency-existing",
            status: "evaluated",
          },
          {
            id: "attempt-failed",
            programId: "program-1",
            studentIdentityId: "identity-1",
            checkRevisionId: "check-revision-existing",
            criterionRevisionIds: ["criterion-revision-existing"],
            idempotencyKey: "idempotency-failed",
            status: "evaluation_failed",
          },
        ],
        evaluations: [
          {
            id: "evaluation-existing",
            attemptId: "attempt-existing",
            programId: "program-1",
            studentIdentityId: "identity-1",
            checkRevisionId: "check-revision-existing",
            criterionRevisionIds: ["criterion-revision-existing"],
            evaluatorKind: "student_workspace",
          },
        ],
        failures: [
          {
            attemptId: "attempt-failed",
            reason: "temporary evaluator outage",
            failedAt: "2026-05-27T10:16:00.000Z",
          },
        ],
      },
    );
  } finally {
    source.database.close();
    target.database.close();
  }
});

test("exportBackup_shouldIncludeQuickCheckGraphAndAttempts_onBackup", async () => {
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
    seedQuickCheckStudentIdentityAndMembership(database, { programId: "program-1" });
    seedCorpusRecords(database, { identityId: "identity-1", programId: "program-1" });
    seedQuickCheckStorageRecords(database, { identityId: "identity-1", programId: "program-1" });

    const backup = commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        candidateIds: backup.quickCheckCandidates?.map($0 => $0.id),
        candidateAnswerKeys: backup.quickCheckCandidates?.map($0 => $0.answerKeyOptionId),
        candidateOptionIds: backup.quickCheckCandidates?.flatMap($0 => $0.options.map(option => option.id)),
        entityIds: backup.acceptedQuickCheckEntities?.map($0 => $0.id),
        entityCurrentRevisionIds: backup.acceptedQuickCheckEntities?.map($0 => $0.currentRevisionId),
        revisionIds: backup.acceptedQuickCheckRevisions?.map($0 => $0.id),
        revisionAnswerKeys: backup.acceptedQuickCheckRevisions?.map($0 => $0.answerKeyOptionId),
        revisionCandidateIds: backup.acceptedQuickCheckRevisions?.map($0 => $0.acceptedFromCandidateId),
        revisionOptionIds: backup.acceptedQuickCheckRevisions?.flatMap($0 => $0.options.map(option => option.id)),
        attemptIds: backup.quickCheckAttempts?.map($0 => $0.id),
        attemptRevisionIds: backup.quickCheckAttempts?.map($0 => $0.checkRevisionId),
        attemptSelections: backup.quickCheckAttempts?.map($0 => $0.selectedOptionId),
        attemptMatchedResults: backup.quickCheckAttempts?.map($0 => $0.matched),
        attemptIdempotencyKeys: backup.quickCheckAttempts?.map($0 => $0.idempotencyKey),
      },
      {
        candidateIds: ["quick-check-candidate-existing"],
        candidateAnswerKeys: ["quick-check-candidate-existing-option-a"],
        candidateOptionIds: [
          "quick-check-candidate-existing-option-a",
          "quick-check-candidate-existing-option-b",
        ],
        entityIds: ["quick-check-entity-existing"],
        entityCurrentRevisionIds: ["quick-check-revision-existing"],
        revisionIds: ["quick-check-revision-existing"],
        revisionAnswerKeys: ["quick-check-revision-existing-option-a"],
        revisionCandidateIds: ["quick-check-candidate-existing"],
        revisionOptionIds: [
          "quick-check-revision-existing-option-a",
          "quick-check-revision-existing-option-b",
        ],
        attemptIds: ["quick-check-attempt-existing"],
        attemptRevisionIds: ["quick-check-revision-existing"],
        attemptSelections: ["quick-check-revision-existing-option-a"],
        attemptMatchedResults: [true],
        attemptIdempotencyKeys: ["idempotency-quick-check-existing"],
      },
    );
  } finally {
    database.close();
  }
});

test("exportBackup_shouldIncludeLearnerEvidenceTargetLinks_onBackup", async () => {
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
    seedQuickCheckStudentIdentityAndMembership(database, { programId: "program-1" });
    seedCorpusRecords(database, { identityId: "identity-1", programId: "program-1" });
    seedQuickCheckStorageRecords(database, { identityId: "identity-1", programId: "program-1" });
    seedLearnerEvidenceTargetLinkRecords(database, { identityId: "identity-1", programId: "program-1" });

    const backup = commands.exportBackup().value.backup;

    assert.deepEqual(
      backup.learnerEvidenceTargetLinks?.map($0 => ({
        id: $0.id,
        targetKind: $0.targetKind,
        targetId: $0.targetId,
        evidenceOwnerKind: $0.evidenceOwnerKind,
        evidenceOwnerEntityId: $0.evidenceOwnerEntityId,
        status: $0.status,
      })),
      [
        {
          id: "learner-target-link-deleted",
          targetKind: "topic",
          targetId: "entity-1",
          evidenceOwnerKind: "accepted_quick_check",
          evidenceOwnerEntityId: "quick-check-entity-existing",
          status: "deleted",
        },
        {
          id: "learner-target-link-active",
          targetKind: "topic",
          targetId: "entity-1",
          evidenceOwnerKind: "accepted_quick_check",
          evidenceOwnerEntityId: "quick-check-entity-existing",
          status: "active",
        },
      ],
    );
  } finally {
    database.close();
  }
});

test("restoreBackup_shouldRestoreQuickCheckGraphAndKeepStudentReadsRedacted_onAcceptedBackup", async () => {
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
    seedQuickCheckStudentIdentityAndMembership(source.database, { programId: "program-1" });
    seedCorpusRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedQuickCheckStorageRecords(source.database, { identityId: "identity-1", programId: "program-1" });

    const restoreResult = target.commands.restoreBackup(source.commands.exportBackup().value.backup);
    const restoredBackup = target.commands.exportBackup().value.backup;
    const corpusCommands = makeCorpusCommands(target.database);
    const studentWorkspaceCommands = makeStudentWorkspaceCommands(target.database);

    assert.deepEqual(
      {
        restoreStatus: restoreResult.status,
        candidateIds: restoredBackup.quickCheckCandidates.map($0 => $0.id),
        revisionIds: restoredBackup.acceptedQuickCheckRevisions.map($0 => $0.id),
        attempts: restoredBackup.quickCheckAttempts.map(projectQuickCheckAttemptBackupRecord),
        deliveryContainsForbiddenDetails: containsQuickCheckForbiddenStudentReadDetail(
          corpusCommands.getQuickCheckDelivery({
            actingIdentityId: "identity-student",
            programId: "program-1",
            revisionId: "quick-check-revision-existing",
          }).value.quickCheckDelivery,
        ),
        attemptContainsForbiddenDetails: containsQuickCheckForbiddenStudentReadDetail(
          studentWorkspaceCommands.getQuickCheckAttempt({
            actingIdentityId: "identity-student",
            programId: "program-1",
            attemptId: "quick-check-attempt-existing",
          }).value.quickCheckAttempt,
        ),
      },
      {
        restoreStatus: "accepted",
        candidateIds: ["quick-check-candidate-existing"],
        revisionIds: ["quick-check-revision-existing"],
        attempts: [
          {
            id: "quick-check-attempt-existing",
            programId: "program-1",
            studentIdentityId: "identity-student",
            checkRevisionId: "quick-check-revision-existing",
            selectedOptionId: "quick-check-revision-existing-option-a",
            matched: true,
            idempotencyKey: "idempotency-quick-check-existing",
          },
        ],
        deliveryContainsForbiddenDetails: false,
        attemptContainsForbiddenDetails: false,
      },
    );
  } finally {
    source.database.close();
    target.database.close();
  }
});

test("restoreBackup_shouldRestoreLearnerEvidenceTargetLinks_onAcceptedBackup", async () => {
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
    seedQuickCheckStudentIdentityAndMembership(source.database, { programId: "program-1" });
    seedCorpusRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedQuickCheckStorageRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedLearnerEvidenceTargetLinkRecords(source.database, {
      identityId: "identity-1",
      programId: "program-1",
    });

    const restoreResult = target.commands.restoreBackup(source.commands.exportBackup().value.backup);
    const restoredBackup = target.commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        restoreStatus: restoreResult.status,
        targetLinks: restoredBackup.learnerEvidenceTargetLinks.map($0 => ({
          id: $0.id,
          status: $0.status,
        })),
      },
      {
        restoreStatus: "accepted",
        targetLinks: [
          { id: "learner-target-link-deleted", status: "deleted" },
          { id: "learner-target-link-active", status: "active" },
        ],
      },
    );
  } finally {
    source.database.close();
    target.database.close();
  }
});

test("restoreBackup_shouldPreserveHistoricalQuickCheckAttemptAndIdempotency_onReplacementRevision", async () => {
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
    seedQuickCheckStudentIdentityAndMembership(source.database, { programId: "program-1" });
    seedCorpusRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedQuickCheckStorageRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedQuickCheckReplacementRevision(source.database, { identityId: "identity-1", programId: "program-1" });

    const restoreResult = target.commands.restoreBackup(source.commands.exportBackup().value.backup);
    const corpusCommands = makeCorpusCommands(target.database);
    const studentWorkspaceCommands = makeStudentWorkspaceCommands(target.database);
    const retryResult = studentWorkspaceCommands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-1",
      checkRevisionId: "quick-check-revision-existing",
      selectedOptionId: "quick-check-revision-existing-option-a",
      idempotencyKey: "idempotency-quick-check-existing",
    });

    assert.deepEqual(
      {
        restoreStatus: restoreResult.status,
        currentDeliveryRevisionIds: corpusCommands.listQuickCheckDeliveries({
          actingIdentityId: "identity-student",
          programId: "program-1",
        }).value.quickCheckDeliveries.map($0 => $0.revisionId),
        historicalAttemptRevisionIds: studentWorkspaceCommands.listQuickCheckAttempts({
          actingIdentityId: "identity-student",
          programId: "program-1",
        }).value.quickCheckAttempts.map($0 => $0.checkRevisionId),
        idempotentRetry: projectQuickCheckAttemptSummary(retryResult.value.quickCheckAttempt),
      },
      {
        restoreStatus: "accepted",
        currentDeliveryRevisionIds: ["quick-check-revision-replacement"],
        historicalAttemptRevisionIds: ["quick-check-revision-existing"],
        idempotentRetry: {
          attemptId: "quick-check-attempt-existing",
          checkRevisionId: "quick-check-revision-existing",
          selectedOptionId: "quick-check-revision-existing-option-a",
          matched: true,
        },
      },
    );
  } finally {
    source.database.close();
    target.database.close();
  }
});

test("restoreBackup_shouldRestoreReadinessRecordsAndHistoricalSnapshots_onAcceptedBackup", async () => {
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
    seedQuickCheckStudentIdentityAndMembership(source.database, { programId: "program-1" });
    seedCorpusRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedNavigationRelationshipRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedReadinessStorageRecords(source.database, { identityId: "identity-1", programId: "program-1" });

    const restoreResult = target.commands.restoreBackup(source.commands.exportBackup().value.backup);
    const restoredBackup = target.commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        restoreStatus: restoreResult.status,
        candidateIds: restoredBackup.readinessCheckCandidates?.map($0 => $0.id),
        entityIds: restoredBackup.acceptedReadinessCheckEntities?.map($0 => $0.id),
        revisionIds: restoredBackup.acceptedReadinessCheckRevisions?.map($0 => $0.id),
        attemptSnapshots: restoredBackup.readinessCheckAttempts?.map(projectReadinessAttemptBackupRecord),
      },
      {
        restoreStatus: "accepted",
        candidateIds: ["readiness-candidate-existing"],
        entityIds: ["readiness-entity-existing"],
        revisionIds: ["readiness-revision-existing"],
        attemptSnapshots: [
          {
            id: "readiness-attempt-existing",
            programId: "program-1",
            studentIdentityId: "identity-student",
            readinessCheckRevisionId: "readiness-revision-existing",
            result: "ready",
            requirementIds: ["readiness-requirement-topic", "readiness-requirement-concept"],
            idempotencyKey: "idempotency-readiness-existing",
          },
        ],
      },
    );
  } finally {
    source.database.close();
    target.database.close();
  }
});

test("restoreBackup_shouldRejectMalformedReadinessGraphs_onInvalidScopeRevisionAndIdempotency", async () => {
  const backup = await makeExportedReadinessBackup();
  const target = makeSUT();

  try {
    const cases = [
      {
        mutate: candidate => {
          candidate.acceptedReadinessCheckRevisions = [];
        },
        expectedReason: "readiness_revision_not_found",
      },
      {
        mutate: candidate => {
          addCrossProgramReadinessTargetBackupRecords(candidate);
          candidate.readinessCheckCandidates[0] = {
            ...candidate.readinessCheckCandidates[0],
            scope: { scopeKind: "topic", topicEntityId: "entity-cross-program" },
          };
        },
        expectedReason: "readiness_scope_program_mismatch",
      },
      {
        mutate: candidate => {
          candidate.readinessCheckAttempts.push({
            ...candidate.readinessCheckAttempts[0],
            id: "readiness-attempt-duplicate",
          });
        },
        expectedReason: "readiness_attempt_idempotency_conflict",
      },
    ];

    assert.deepEqual(
      cases.map(testCase => {
        const candidateBackup = structuredClone(backup);
        testCase.mutate(candidateBackup);
        return target.commands.restoreBackup(candidateBackup).reason;
      }),
      cases.map($0 => $0.expectedReason),
    );
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRestoreOpenAnswerEvaluatorRunsAndEvidence_onAcceptedBackup", async () => {
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
    seedStudentAttemptStorageRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedOpenAnswerEvaluatorRunAndEvidenceRecords(source.database, {
      identityId: "identity-1",
      programId: "program-1",
    });

    const restoreResult = target.commands.restoreBackup(source.commands.exportBackup().value.backup);
    const restoredBackup = target.commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        restoreStatus: restoreResult.status,
        runs: restoredBackup.openAnswerEvaluatorRuns.map(projectEvaluatorRunBackupRecord),
        evidence: restoredBackup.openAnswerEvaluatorEvidence.map(projectEvaluatorEvidenceBackupRecord),
      },
      {
        restoreStatus: "accepted",
        runs: [
          {
            id: "evaluator-run-existing",
            attemptId: "attempt-existing",
            programId: "program-1",
            studentIdentityId: "identity-1",
            checkRevisionId: "check-revision-existing",
            criterionRevisionIds: ["criterion-revision-existing"],
            evaluatorPathKind: "deterministic",
            evaluatorPolicyId: "policy-existing",
            status: "succeeded",
            requestedByIdentityId: "identity-1",
          },
        ],
        evidence: [
          {
            id: "evidence-existing",
            evaluatorRunId: "evaluator-run-existing",
            attemptId: "attempt-existing",
            evidenceKind: "criterion_match",
            visibility: "internal",
            redactedSummary: "Matched accepted criterion.",
          },
        ],
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

test("restoreBackup_shouldRejectOpenAnswerAttemptWithoutProgram_onBackup", async () => {
  const backup = await makeExportedStudentAttemptBackup();
  const target = makeSUT();

  try {
    backup.openAnswerAttempts[0] = {
      ...backup.openAnswerAttempts[0],
      programId: "program-missing",
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "program_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectOpenAnswerAttemptWithoutStudentIdentity_onBackup", async () => {
  const backup = await makeExportedStudentAttemptBackup();
  const target = makeSUT();

  try {
    backup.openAnswerAttempts[0] = {
      ...backup.openAnswerAttempts[0],
      studentIdentityId: "identity-missing",
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "identity_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectOpenAnswerAttemptWithoutAcceptedCheckRevision_onBackup", async () => {
  const backup = await makeExportedStudentAttemptBackup();
  const target = makeSUT();

  try {
    backup.openAnswerAttempts[0] = {
      ...backup.openAnswerAttempts[0],
      checkRevisionId: "check-revision-missing",
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "check_revision_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectOpenAnswerAttemptWithMissingCriterionRevision_onBackup", async () => {
  const backup = await makeExportedStudentAttemptBackup();
  const target = makeSUT();

  try {
    backup.openAnswerAttempts[0] = {
      ...backup.openAnswerAttempts[0],
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

test("restoreBackup_shouldRejectOpenAnswerEvaluationForNonEvaluatedAttempt_onBackup", async () => {
  const backup = await makeExportedStudentAttemptBackup();
  const target = makeSUT();

  try {
    backup.openAnswerEvaluations[0] = {
      ...backup.openAnswerEvaluations[0],
      attemptId: "attempt-failed",
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "attempt_status_mismatch",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectOpenAnswerEvaluationFailureForNonFailedAttempt_onBackup", async () => {
  const backup = await makeExportedStudentAttemptBackup();
  const target = makeSUT();

  try {
    backup.openAnswerEvaluationFailures[0] = {
      ...backup.openAnswerEvaluationFailures[0],
      attemptId: "attempt-existing",
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "attempt_status_mismatch",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectOpenAnswerEvaluatorRunWithoutAttempt_onBackup", async () => {
  const backup = await makeExportedStudentAttemptBackup();
  const target = makeSUT();

  try {
    seedOpenAnswerEvaluatorRunAndEvidenceBackupRecords(backup);
    backup.openAnswerEvaluatorRuns[0] = {
      ...backup.openAnswerEvaluatorRuns[0],
      attemptId: "attempt-missing",
    };
    backup.openAnswerEvaluatorEvidence = [];

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "attempt_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectOpenAnswerEvaluatorEvidenceWithoutRun_onBackup", async () => {
  const backup = await makeExportedStudentAttemptEvaluatorBackup();
  const target = makeSUT();

  try {
    backup.openAnswerEvaluatorRuns = [];

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "evaluator_run_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectOpenAnswerEvaluatorEvidenceForDifferentAttempt_onBackup", async () => {
  const backup = await makeExportedStudentAttemptEvaluatorBackup();
  const target = makeSUT();

  try {
    backup.openAnswerEvaluatorEvidence[0] = {
      ...backup.openAnswerEvaluatorEvidence[0],
      attemptId: "attempt-failed",
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "evaluator_evidence_attempt_mismatch",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectMultipleRunningOpenAnswerEvaluatorRuns_onBackup", async () => {
  const backup = await makeExportedStudentAttemptEvaluatorBackup();
  const target = makeSUT();

  try {
    backup.openAnswerAttempts[0] = {
      ...backup.openAnswerAttempts[0],
      status: "evaluating",
    };
    backup.openAnswerEvaluations = [];
    backup.openAnswerEvaluatorRuns = [
      {
        ...backup.openAnswerEvaluatorRuns[0],
        id: "evaluator-run-running-a",
        status: "running",
        completedAt: null,
      },
      {
        ...backup.openAnswerEvaluatorRuns[0],
        id: "evaluator-run-running-b",
        status: "running",
        completedAt: null,
      },
    ];
    backup.openAnswerEvaluatorEvidence = [];

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "evaluator_run_conflict",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectRunningOpenAnswerEvaluatorRunForNonEvaluatingAttempt_onBackup", async () => {
  const backup = await makeExportedStudentAttemptEvaluatorBackup();
  const target = makeSUT();

  try {
    backup.openAnswerEvaluatorRuns[0] = {
      ...backup.openAnswerEvaluatorRuns[0],
      status: "running",
      completedAt: null,
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "attempt_status_mismatch",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectSucceededOpenAnswerEvaluatorRunWithoutFinalEvaluation_onBackup", async () => {
  const backup = await makeExportedStudentAttemptEvaluatorBackup();
  const target = makeSUT();

  try {
    backup.openAnswerEvaluations = [];

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "evaluation_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectIncompleteCancelledOpenAnswerEvaluatorPriorFailureSnapshot_onBackup", async () => {
  const backup = await makeExportedStudentAttemptEvaluatorBackup();
  const target = makeSUT();

  try {
    backup.openAnswerEvaluatorRuns[0] = {
      ...backup.openAnswerEvaluatorRuns[0],
      status: "cancelled",
      completedAt: null,
      failedAt: "2026-05-27T10:14:55.000Z",
      failureReason: "cancelled by retry",
      priorFailureReason: "previous outage",
      priorFailedAt: null,
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "evaluation_failure_snapshot_mismatch",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectHumanReviewedOpenAnswerEvaluatorRunWithoutReviewerAttribution_onBackup", async () => {
  const backup = await makeExportedStudentAttemptEvaluatorBackup();
  const target = makeSUT();

  try {
    backup.openAnswerEvaluatorRuns[0] = {
      ...backup.openAnswerEvaluatorRuns[0],
      evaluatorPathKind: "human_reviewed",
      reviewerIdentityId: null,
      reviewerCapability: null,
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "validation_failed",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectOpenAnswerEvaluatorRunWithMissingAttributionIdentity_onBackup", async () => {
  const backup = await makeExportedStudentAttemptEvaluatorBackup();
  const target = makeSUT();

  try {
    backup.openAnswerEvaluatorRuns[0] = {
      ...backup.openAnswerEvaluatorRuns[0],
      requestedByIdentityId: "identity-missing",
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "identity_not_found",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldPreserveHistoricalTerminalOpenAnswerEvaluatorRunsAfterRetry_onBackup", async () => {
  const backup = await makeExportedStudentAttemptEvaluatorBackup();
  const target = makeSUT();

  try {
    backup.openAnswerEvaluatorRuns = [
      {
        ...backup.openAnswerEvaluatorRuns[0],
        id: "evaluator-run-failed-history",
        status: "failed",
        completedAt: null,
        failedAt: "2026-05-27T10:14:55.000Z",
        failureReason: "temporary evaluator outage",
      },
      {
        ...backup.openAnswerEvaluatorRuns[0],
        id: "evaluator-run-cancelled-history",
        status: "cancelled",
        completedAt: null,
        failedAt: "2026-05-27T10:14:59.000Z",
        failureReason: "cancelled by retry",
        priorFailureReason: "temporary evaluator outage",
        priorFailedAt: "2026-05-27T10:14:55.000Z",
      },
    ];
    backup.openAnswerEvaluatorEvidence = [];

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "accepted",
      value: { restored: true },
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectOpenAnswerEvaluatorEvidenceWithInvalidVisibility_onBackup", async () => {
  const backup = await makeExportedStudentAttemptEvaluatorBackup();
  const target = makeSUT();

  try {
    backup.openAnswerEvaluatorEvidence[0] = {
      ...backup.openAnswerEvaluatorEvidence[0],
      visibility: "public",
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "validation_failed",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectOpenAnswerEvaluatorEvidenceWithForbiddenSummaryDetails_onBackup", async () => {
  const backup = await makeExportedStudentAttemptEvaluatorBackup();
  const target = makeSUT();

  try {
    backup.openAnswerEvaluatorEvidence[0] = {
      ...backup.openAnswerEvaluatorEvidence[0],
      redactedSummary:
        "authorization header, raw model response, select * from table, /tmp/stack trace, postgres://database-url",
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "validation_failed",
    });
  } finally {
    target.database.close();
  }
});

test("backupRestore_shouldNotExposeRawOpenAnswerEvaluatorArtifacts", async () => {
  const backup = await makeExportedStudentAttemptEvaluatorBackup();
  const target = makeSUT();

  try {
    const restoreResult = target.commands.restoreBackup(backup);
    const restoredBackup = target.commands.exportBackup().value.backup;

    assert.deepEqual(
      {
        restoreStatus: restoreResult.status,
        redacted: containsForbiddenBackupDetail([
          backup.openAnswerEvaluatorRuns,
          backup.openAnswerEvaluatorEvidence,
          restoredBackup.openAnswerEvaluatorRuns,
          restoredBackup.openAnswerEvaluatorEvidence,
        ]),
      },
      {
        restoreStatus: "accepted",
        redacted: false,
      },
    );
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

test("restoreBackup_shouldRejectNavigationRelationshipRevisionWithWrongEndpointKind_onBackup", async () => {
  const backup = await makeExportedNavigationBackup();
  const target = makeSUT();

  try {
    backup.acceptedNavigationRelationshipRevisions[0] = {
      ...backup.acceptedNavigationRelationshipRevisions[0],
      toKind: "topic",
    };

    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(result, {
      status: "rejected",
      reason: "navigation_relationship_endpoint_kind_mismatch",
    });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectMalformedNavigationRelationshipGraphs_onBackup", async () => {
  const invalidBackups = [
    {
      mutate: value => {
        value.acceptedNavigationRelationships[0] = {
          ...value.acceptedNavigationRelationships[0],
          currentRevisionId: "missing-relationship-revision",
        };
      },
      expectedReason: "navigation_relationship_revision_not_found",
    },
    {
      mutate: value => {
        value.acceptedNavigationRelationships = [];
      },
      expectedReason: "navigation_relationship_not_found",
    },
    {
      mutate: value => {
        value.acceptedNavigationRelationships[0] = {
          ...value.acceptedNavigationRelationships[0],
          programId: "program-b",
        };
      },
      expectedReason: "navigation_relationship_program_mismatch",
    },
    {
      mutate: value => {
        value.corpusCandidates[0] = {
          ...value.corpusCandidates[0],
          candidateKind: "concept",
        };
        value.acceptedCorpusEntities[0] = {
          ...value.acceptedCorpusEntities[0],
          acceptedKind: "concept",
        };
        value.acceptedCorpusRevisions[0] = {
          ...value.acceptedCorpusRevisions[0],
          acceptedKind: "concept",
        };
        value.acceptedNavigationRelationships[0] = {
          ...value.acceptedNavigationRelationships[0],
          relationshipKind: "concept_prerequisite",
        };
        value.acceptedNavigationRelationshipRevisions[0] = {
          ...value.acceptedNavigationRelationshipRevisions[0],
          relationshipKind: "concept_prerequisite",
          fromKind: "concept",
        };
        value.acceptedNavigationRelationships.push({
          id: "relationship-2",
          programId: "program-1",
          relationshipKind: "concept_prerequisite",
          fromEntityId: "entity-2",
          toEntityId: "entity-1",
          currentRevisionId: "relationship-revision-2",
        });
        value.acceptedNavigationRelationshipRevisions.push({
          id: "relationship-revision-2",
          relationshipId: "relationship-2",
          programId: "program-1",
          relationshipKind: "concept_prerequisite",
          fromEntityId: "entity-2",
          fromRevisionId: "revision-2",
          fromKind: "concept",
          toEntityId: "entity-1",
          toRevisionId: "revision-1",
          toKind: "concept",
          label: "Reverse prerequisite",
          sourceIds: ["source-1"],
          acceptedFromCandidateId: "candidate-relationship",
          acceptedByIdentityId: "identity-1",
          acceptedAt: "2026-05-27T10:13:00.000Z",
        });
      },
      expectedReason: "navigation_prerequisite_cycle",
    },
  ];

  for (const invalidBackup of invalidBackups) {
    const backup = await makeExportedNavigationBackup();
    const target = makeSUT();

    try {
      invalidBackup.mutate(backup);

      const result = target.commands.restoreBackup(backup);

      assert.deepEqual(result, {
        status: "rejected",
        reason: invalidBackup.expectedReason,
      });
    } finally {
      target.database.close();
    }
  }
});

test("restoreBackup_shouldRejectMalformedLearnerEvidenceTargetLinks_onBackup", async () => {
  const invalidBackups = [
    {
      mutate: value => {
        value.learnerEvidenceTargetLinks[0] = {
          ...value.learnerEvidenceTargetLinks[0],
          targetKind: "program",
        };
      },
      expectedReason: "learner_state_target_kind_invalid",
    },
    {
      mutate: value => {
        value.learnerEvidenceTargetLinks[0] = {
          ...value.learnerEvidenceTargetLinks[0],
          targetId: "missing-target",
        };
      },
      expectedReason: "accepted_entity_not_found",
    },
    {
      mutate: value => {
        addCrossProgramLearnerStateTargetLinkBackupRecords(value);
        value.learnerEvidenceTargetLinks[0] = {
          ...value.learnerEvidenceTargetLinks[0],
          targetId: "entity-cross-program",
        };
      },
      expectedReason: "learner_state_target_program_mismatch",
    },
    {
      mutate: value => {
        value.learnerEvidenceTargetLinks[0] = {
          ...value.learnerEvidenceTargetLinks[0],
          evidenceOwnerEntityId: "missing-quick-check",
        };
      },
      expectedReason: "quick_check_entity_not_found",
    },
    {
      mutate: value => {
        addCrossProgramLearnerStateTargetLinkBackupRecords(value);
        value.learnerEvidenceTargetLinks[0] = {
          ...value.learnerEvidenceTargetLinks[0],
          evidenceOwnerEntityId: "quick-check-entity-cross-program",
        };
      },
      expectedReason: "learner_state_evidence_owner_program_mismatch",
    },
    {
      mutate: value => {
        value.learnerEvidenceTargetLinks.push({
          ...value.learnerEvidenceTargetLinks[1],
          id: "learner-target-link-duplicate",
        });
      },
      expectedReason: "learner_state_target_link_idempotency_conflict",
    },
    {
      mutate: value => {
        value.learnerEvidenceTargetLinks.push({
          ...value.learnerEvidenceTargetLinks[1],
          targetId: "entity-1",
        });
      },
      expectedReason: "learner_state_target_link_id_conflict",
    },
  ];

  for (const invalidBackup of invalidBackups) {
    const backup = await makeExportedLearnerEvidenceTargetLinkBackup();
    const target = makeSUT();

    try {
      invalidBackup.mutate(backup);

      const result = target.commands.restoreBackup(backup);

      assert.deepEqual(result, {
        status: "rejected",
        reason: invalidBackup.expectedReason,
      });
    } finally {
      target.database.close();
    }
  }
});

test("restoreBackup_shouldRejectMalformedQuickCheckGraphs_onBackup", async () => {
  const backup = await makeExportedQuickCheckBackup();
  const invalidBackups = [
    {
      mutate: value => {
        value.quickCheckCandidates[0] = {
          ...value.quickCheckCandidates[0],
          options: [
            { id: "quick-check-candidate-existing-option-a", text: "Duplicate text" },
            { id: "quick-check-candidate-existing-option-b", text: "Duplicate text" },
          ],
        };
      },
      expectedReason: "quick_check_option_collection_invalid",
    },
    {
      mutate: value => {
        value.quickCheckCandidates = [];
      },
      expectedReason: "quick_check_candidate_not_found",
    },
    {
      mutate: value => {
        value.acceptedQuickCheckRevisions[0] = {
          ...value.acceptedQuickCheckRevisions[0],
          answerKeyOptionId: "quick-check-revision-existing-option-missing",
        };
      },
      expectedReason: "quick_check_answer_key_option_mismatch",
    },
    {
      mutate: value => {
        value.quickCheckAttempts[0] = {
          ...value.quickCheckAttempts[0],
          selectedOptionId: "quick-check-revision-existing-option-b",
        };
      },
      expectedReason: "quick_check_attempt_matched_mismatch",
    },
    {
      mutate: value => {
        value.quickCheckAttempts.push({
          ...value.quickCheckAttempts[0],
          id: "quick-check-attempt-duplicate",
        });
      },
      expectedReason: "quick_check_attempt_idempotency_conflict",
    },
  ];

  const reasons = invalidBackups.map(({ mutate }) => {
    const target = makeSUT();
    const candidateBackup = structuredClone(backup);
    try {
      mutate(candidateBackup);
      return target.commands.restoreBackup(candidateBackup).reason;
    } finally {
      target.database.close();
    }
  });

  assert.deepEqual(
    reasons,
    invalidBackups.map($0 => $0.expectedReason),
  );
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

function seedMembershipInvitationRecords(database) {
  storage.createIdentity(database, {
    id: "identity-student",
    displayName: "Student",
    state: "active",
    createdAt: "2026-06-04T08:00:00.000Z",
  });
  storage.createProgramInvitationRecord(database, {
    id: "invitation-1",
    programId: "program-1",
    targetIdentityId: "identity-student",
    participationKind: "student",
    status: "accepted",
    invitedByIdentityId: "identity-1",
    createdAt: "2026-06-04T09:00:00.000Z",
    updatedAt: "2026-06-04T10:00:00.000Z",
    statusChangedByIdentityId: "identity-student",
    statusChangedAt: "2026-06-04T10:00:00.000Z",
  });
  storage.createProgramMembershipEventRecord(database, {
    id: "membership-event-2",
    eventType: "student_invitation_accepted",
    actorIdentityId: "identity-student",
    targetIdentityId: "identity-student",
    programId: "program-1",
    participationKind: "student",
    policyPath: "curator_invitation",
    resultingStatus: "active",
    invitationStatus: "accepted",
    occurredAt: "2026-06-04T10:00:00.000Z",
    outcome: "accepted",
  });
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

function seedNavigationRelationshipRecords(database, { identityId, programId }) {
  database
    .prepare(
      `insert into corpus_candidates (
         id, program_id, candidate_kind, title, body, source_ids_json, rationale, status,
         created_by_identity_id, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "candidate-2",
      programId,
      "concept",
      "Concept Candidate",
      "Concept Body",
      JSON.stringify(["source-1"]),
      "Concept Rationale",
      "accepted",
      identityId,
      "2026-05-27T10:07:00.000Z",
      "2026-05-27T10:08:00.000Z",
    );
  database
    .prepare(
      `insert into corpus_candidates (
         id, program_id, candidate_kind, title, body, source_ids_json, rationale, status,
         created_by_identity_id, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "candidate-relationship",
      programId,
      "relationship_update",
      "Relationship Candidate",
      "Relationship Body",
      JSON.stringify(["source-1"]),
      "Relationship Rationale",
      "accepted",
      identityId,
      "2026-05-27T10:09:00.000Z",
      "2026-05-27T10:10:00.000Z",
    );
  database
    .prepare(
      `insert into accepted_corpus_entities (
         id, program_id, accepted_kind, current_revision_id
       ) values (?, ?, ?, ?)`,
    )
    .run("entity-2", programId, "concept", "revision-2");
  database
    .prepare(
      `insert into accepted_corpus_revisions (
         id, entity_id, program_id, accepted_kind, title, body, accepted_from_candidate_id,
         source_ids_json, rationale, accepted_by_identity_id, accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "revision-2",
      "entity-2",
      programId,
      "concept",
      "Accepted Concept",
      "Accepted Concept Body",
      "candidate-2",
      JSON.stringify(["source-1"]),
      "Concept Rationale",
      identityId,
      "2026-05-27T10:11:00.000Z",
    );
  database
    .prepare(
      `insert into accepted_navigation_relationships (
         id, program_id, relationship_kind, from_entity_id, to_entity_id, current_revision_id
       ) values (?, ?, ?, ?, ?, ?)`,
    )
    .run("relationship-1", programId, "topic_includes_concept", "entity-1", "entity-2", "relationship-revision-1");
  database
    .prepare(
      `insert into accepted_navigation_relationship_revisions (
         id, relationship_id, program_id, relationship_kind, from_entity_id, from_revision_id, from_kind,
         to_entity_id, to_revision_id, to_kind, label, source_ids_json, accepted_from_candidate_id,
         accepted_by_identity_id, accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "relationship-revision-1",
      "relationship-1",
      programId,
      "topic_includes_concept",
      "entity-1",
      "revision-1",
      "topic",
      "entity-2",
      "revision-2",
      "concept",
      "Topic concept link",
      JSON.stringify(["source-1"]),
      "candidate-relationship",
      identityId,
      "2026-05-27T10:12:00.000Z",
    );
}

function seedQuickCheckStudentIdentityAndMembership(database, { programId }) {
  database
    .prepare(
      `insert into identities (id, display_name, state, created_at, disabled_at)
       values (?, ?, ?, ?, ?)`,
    )
    .run(
      "identity-student",
      "Student",
      "active",
      "2026-05-27T10:06:30.000Z",
      null,
    );
  database
    .prepare(
      `insert into program_memberships (
         id, program_id, identity_id, participation_kind, status, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "membership-student",
      programId,
      "identity-student",
      "student",
      "active",
      "2026-05-27T10:06:45.000Z",
      "2026-05-27T10:06:45.000Z",
    );
}

function seedQuickCheckStorageRecords(database, { identityId, programId }) {
  database
    .prepare(
      `insert into quick_check_candidates (
         id, program_id, check_kind, title, prompt, answer_key_option_id, source_ids_json,
         rationale, status, created_by_identity_id, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "quick-check-candidate-existing",
      programId,
      "single_select_quick_check",
      "Quick check",
      "Quick prompt",
      "quick-check-candidate-existing-option-a",
      JSON.stringify(["source-1"]),
      "Quick rationale",
      "accepted",
      identityId,
      "2026-05-27T10:07:00.000Z",
      "2026-05-27T10:08:00.000Z",
    );
  database
    .prepare(
      `insert into quick_check_candidate_options (candidate_id, id, option_order, text)
       values (?, ?, ?, ?)`,
    )
    .run("quick-check-candidate-existing", "quick-check-candidate-existing-option-a", 0, "Candidate option A");
  database
    .prepare(
      `insert into quick_check_candidate_options (candidate_id, id, option_order, text)
       values (?, ?, ?, ?)`,
    )
    .run("quick-check-candidate-existing", "quick-check-candidate-existing-option-b", 1, "Candidate option B");
  database
    .prepare(
      `insert into accepted_quick_check_entities (
         id, program_id, current_revision_id
       ) values (?, ?, ?)`,
    )
    .run("quick-check-entity-existing", programId, "quick-check-revision-existing");
  database
    .prepare(
      `insert into accepted_quick_check_revisions (
         id, entity_id, program_id, check_kind, title, prompt, answer_key_option_id,
         accepted_from_candidate_id, source_ids_json, rationale, accepted_by_identity_id, accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "quick-check-revision-existing",
      "quick-check-entity-existing",
      programId,
      "single_select_quick_check",
      "Accepted quick check",
      "Accepted quick prompt",
      "quick-check-revision-existing-option-a",
      "quick-check-candidate-existing",
      JSON.stringify(["source-1"]),
      "Accepted quick rationale",
      identityId,
      "2026-05-27T10:09:00.000Z",
    );
  database
    .prepare(
      `insert into accepted_quick_check_revision_options (revision_id, id, option_order, text)
       values (?, ?, ?, ?)`,
    )
    .run("quick-check-revision-existing", "quick-check-revision-existing-option-a", 0, "Revision option A");
  database
    .prepare(
      `insert into accepted_quick_check_revision_options (revision_id, id, option_order, text)
       values (?, ?, ?, ?)`,
    )
    .run("quick-check-revision-existing", "quick-check-revision-existing-option-b", 1, "Revision option B");
  database
    .prepare(
      `insert into quick_check_attempts (
         id, program_id, student_identity_id, check_revision_id, selected_option_id,
         matched, idempotency_key, submitted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "quick-check-attempt-existing",
      programId,
      "identity-student",
      "quick-check-revision-existing",
      "quick-check-revision-existing-option-a",
      1,
      "idempotency-quick-check-existing",
      "2026-05-27T10:10:00.000Z",
    );
}

function seedLearnerEvidenceTargetLinkRecords(database, { identityId, programId }) {
  database
    .prepare(
      `insert into learner_evidence_target_links (
         id,
         program_id,
         target_kind,
         target_id,
         evidence_owner_kind,
         evidence_owner_entity_id,
         status,
         created_by_identity_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "learner-target-link-deleted",
      programId,
      "topic",
      "entity-1",
      "accepted_quick_check",
      "quick-check-entity-existing",
      "deleted",
      identityId,
      "2026-06-03T10:00:00.000Z",
      "2026-06-03T10:01:00.000Z",
    );
  database
    .prepare(
      `insert into learner_evidence_target_links (
         id,
         program_id,
         target_kind,
         target_id,
         evidence_owner_kind,
         evidence_owner_entity_id,
         status,
         created_by_identity_id,
         created_at,
         updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "learner-target-link-active",
      programId,
      "topic",
      "entity-1",
      "accepted_quick_check",
      "quick-check-entity-existing",
      "active",
      identityId,
      "2026-06-03T10:02:00.000Z",
      "2026-06-03T10:02:00.000Z",
    );
}

function seedReadinessStorageRecords(database, { identityId, programId }) {
  storage.createReadinessCheckCandidateRecord?.(
    database,
    {
      id: "readiness-candidate-existing",
      programId,
      title: "Topic readiness",
      scope: { scopeKind: "topic", topicEntityId: "entity-1" },
      requirements: [
        {
          requirementId: "readiness-requirement-topic",
          targetKind: "topic",
          targetId: "entity-1",
          requiredLevel: "on_track",
        },
        {
          requirementId: "readiness-requirement-concept",
          targetKind: "concept",
          targetId: "entity-2",
          requiredLevel: "developing",
        },
      ],
      sourceIds: ["source-1"],
      rationale: "Readiness rationale",
      status: "accepted",
      createdByIdentityId: identityId,
      createdAt: "2026-06-03T11:00:00.000Z",
      updatedAt: "2026-06-03T11:00:00.000Z",
    },
  );
  storage.createAcceptedReadinessCheckEntityRecord?.(
    database,
    {
      id: "readiness-entity-existing",
      programId,
      currentRevisionId: "readiness-revision-existing",
    },
  );
  storage.createAcceptedReadinessCheckRevisionRecord?.(
    database,
    {
      id: "readiness-revision-existing",
      entityId: "readiness-entity-existing",
      programId,
      title: "Accepted topic readiness",
      scope: { scopeKind: "topic", topicEntityId: "entity-1" },
      requirements: [
        {
          requirementId: "readiness-requirement-topic",
          targetKind: "topic",
          targetId: "entity-1",
          requiredLevel: "on_track",
        },
        {
          requirementId: "readiness-requirement-concept",
          targetKind: "concept",
          targetId: "entity-2",
          requiredLevel: "developing",
        },
      ],
      sourceIds: ["source-1"],
      rationale: "Accepted readiness rationale",
      acceptedFromCandidateId: "readiness-candidate-existing",
      acceptedByIdentityId: identityId,
      acceptedAt: "2026-06-03T11:10:00.000Z",
    },
  );
  storage.createReadinessCheckAttemptRecord?.(
    database,
    {
      id: "readiness-attempt-existing",
      programId,
      studentIdentityId: "identity-student",
      readinessCheckRevisionId: "readiness-revision-existing",
      result: "ready",
      requirementResults: [
        {
          requirementId: "readiness-requirement-topic",
          targetKind: "topic",
          targetId: "entity-1",
          title: "Accepted",
          requiredLevel: "on_track",
          observedLevel: "on_track",
          evidenceCount: 2,
          result: "ready",
        },
        {
          requirementId: "readiness-requirement-concept",
          targetKind: "concept",
          targetId: "entity-2",
          title: "Accepted Concept",
          requiredLevel: "developing",
          observedLevel: "developing",
          evidenceCount: 1,
          result: "ready",
        },
      ],
      idempotencyKey: "idempotency-readiness-existing",
      submittedAt: "2026-06-03T11:20:00.000Z",
    },
  );
}

function addCrossProgramReadinessTargetBackupRecords(backup) {
  backup.programShells.push({
    id: "program-cross",
    title: "Cross Program",
    description: null,
    admissionPolicy: "self_join",
    createdByIdentityId: "identity-1",
    createdAt: "2026-06-03T09:00:00.000Z",
  });
  backup.programMemberships.push({
    id: "membership-cross",
    programId: "program-cross",
    identityId: "identity-1",
    participationKind: "program_curator",
    status: "active",
    createdAt: "2026-06-03T09:00:00.000Z",
    updatedAt: "2026-06-03T09:00:00.000Z",
  });
  backup.programSources.push({
    id: "source-cross",
    programId: "program-cross",
    sourceKind: "article",
    title: "Cross source",
    locator: "https://example.test/cross",
    citation: "Cross citation",
    recordedByIdentityId: "identity-1",
    recordedAt: "2026-06-03T09:01:00.000Z",
  });
  backup.corpusCandidates.push({
    id: "candidate-cross",
    programId: "program-cross",
    candidateKind: "topic",
    title: "Cross topic candidate",
    body: "Cross topic body",
    materialReferenceKind: null,
    locator: null,
    citation: null,
    relationshipDrafts: [],
    sourceIds: ["source-cross"],
    rationale: "Cross rationale",
    status: "accepted",
    createdByIdentityId: "identity-1",
    createdAt: "2026-06-03T09:02:00.000Z",
    updatedAt: "2026-06-03T09:02:00.000Z",
  });
  backup.acceptedCorpusEntities.push({
    id: "entity-cross-program",
    programId: "program-cross",
    acceptedKind: "topic",
    currentRevisionId: "revision-cross-program",
  });
  backup.acceptedCorpusRevisions.push({
    id: "revision-cross-program",
    entityId: "entity-cross-program",
    programId: "program-cross",
    acceptedKind: "topic",
    title: "Cross topic",
    body: "Cross topic body",
    materialReferenceKind: null,
    locator: null,
    citation: null,
    acceptedFromCandidateId: "candidate-cross",
    sourceIds: ["source-cross"],
    rationale: "Cross rationale",
    acceptedByIdentityId: "identity-1",
    acceptedAt: "2026-06-03T09:03:00.000Z",
  });
}

function addCrossProgramLearnerStateTargetLinkBackupRecords(backup) {
  backup.programShells.push({
    id: "program-cross",
    title: "Cross Program",
    description: null,
    admissionPolicy: "self_join",
    createdByIdentityId: "identity-1",
    createdAt: "2026-06-03T09:00:00.000Z",
  });
  backup.programMemberships.push({
    id: "membership-cross",
    programId: "program-cross",
    identityId: "identity-1",
    participationKind: "program_curator",
    status: "active",
    createdAt: "2026-06-03T09:00:00.000Z",
    updatedAt: "2026-06-03T09:00:00.000Z",
  });
  backup.programSources.push({
    id: "source-cross",
    programId: "program-cross",
    sourceKind: "article",
    title: "Cross source",
    locator: "https://example.test/cross",
    citation: "Cross citation",
    recordedByIdentityId: "identity-1",
    recordedAt: "2026-06-03T09:01:00.000Z",
  });
  backup.corpusCandidates.push({
    id: "candidate-cross",
    programId: "program-cross",
    candidateKind: "topic",
    title: "Cross topic candidate",
    body: "Cross topic body",
    materialReferenceKind: null,
    locator: null,
    citation: null,
    relationshipDrafts: [],
    sourceIds: ["source-cross"],
    rationale: "Cross rationale",
    status: "accepted",
    createdByIdentityId: "identity-1",
    createdAt: "2026-06-03T09:02:00.000Z",
    updatedAt: "2026-06-03T09:02:00.000Z",
  });
  backup.acceptedCorpusEntities.push({
    id: "entity-cross-program",
    programId: "program-cross",
    acceptedKind: "topic",
    currentRevisionId: "revision-cross-program",
  });
  backup.acceptedCorpusRevisions.push({
    id: "revision-cross-program",
    entityId: "entity-cross-program",
    programId: "program-cross",
    acceptedKind: "topic",
    title: "Cross topic",
    body: "Cross topic body",
    acceptedFromCandidateId: "candidate-cross",
    sourceIds: ["source-cross"],
    rationale: "Cross rationale",
    acceptedByIdentityId: "identity-1",
    acceptedAt: "2026-06-03T09:03:00.000Z",
  });
  backup.quickCheckCandidates.push({
    id: "quick-check-candidate-cross",
    programId: "program-cross",
    checkKind: "single_select_quick_check",
    title: "Cross quick check",
    prompt: "Cross prompt",
    options: [
      { id: "quick-check-candidate-cross-option-a", text: "Cross option A" },
      { id: "quick-check-candidate-cross-option-b", text: "Cross option B" },
    ],
    answerKeyOptionId: "quick-check-candidate-cross-option-a",
    sourceIds: ["source-cross"],
    rationale: "Cross quick rationale",
    status: "accepted",
    createdByIdentityId: "identity-1",
    createdAt: "2026-06-03T09:04:00.000Z",
    updatedAt: "2026-06-03T09:04:00.000Z",
  });
  backup.acceptedQuickCheckEntities.push({
    id: "quick-check-entity-cross-program",
    programId: "program-cross",
    currentRevisionId: "quick-check-revision-cross-program",
  });
  backup.acceptedQuickCheckRevisions.push({
    id: "quick-check-revision-cross-program",
    entityId: "quick-check-entity-cross-program",
    programId: "program-cross",
    checkKind: "single_select_quick_check",
    title: "Accepted cross quick check",
    prompt: "Accepted cross prompt",
    options: [
      { id: "quick-check-revision-cross-program-option-a", text: "Cross revision option A" },
      { id: "quick-check-revision-cross-program-option-b", text: "Cross revision option B" },
    ],
    answerKeyOptionId: "quick-check-revision-cross-program-option-a",
    acceptedFromCandidateId: "quick-check-candidate-cross",
    sourceIds: ["source-cross"],
    rationale: "Accepted cross quick rationale",
    acceptedByIdentityId: "identity-1",
    acceptedAt: "2026-06-03T09:05:00.000Z",
  });
}

function seedQuickCheckReplacementRevision(database, { identityId, programId }) {
  database
    .prepare(
      `insert into quick_check_candidates (
         id, program_id, check_kind, title, prompt, answer_key_option_id, source_ids_json,
         rationale, status, created_by_identity_id, created_at, updated_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "quick-check-candidate-replacement",
      programId,
      "single_select_quick_check",
      "Replacement quick check",
      "Replacement quick prompt",
      "quick-check-candidate-replacement-option-b",
      JSON.stringify(["source-1"]),
      "Replacement quick rationale",
      "accepted",
      identityId,
      "2026-05-27T10:11:00.000Z",
      "2026-05-27T10:12:00.000Z",
    );
  database
    .prepare(
      `insert into quick_check_candidate_options (candidate_id, id, option_order, text)
       values (?, ?, ?, ?)`,
    )
    .run("quick-check-candidate-replacement", "quick-check-candidate-replacement-option-a", 0, "Candidate replacement option A");
  database
    .prepare(
      `insert into quick_check_candidate_options (candidate_id, id, option_order, text)
       values (?, ?, ?, ?)`,
    )
    .run("quick-check-candidate-replacement", "quick-check-candidate-replacement-option-b", 1, "Candidate replacement option B");
  database
    .prepare(
      `insert into accepted_quick_check_revisions (
         id, entity_id, program_id, check_kind, title, prompt, answer_key_option_id,
         accepted_from_candidate_id, source_ids_json, rationale, accepted_by_identity_id, accepted_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "quick-check-revision-replacement",
      "quick-check-entity-existing",
      programId,
      "single_select_quick_check",
      "Replacement accepted quick check",
      "Replacement accepted quick prompt",
      "quick-check-revision-replacement-option-b",
      "quick-check-candidate-replacement",
      JSON.stringify(["source-1"]),
      "Replacement accepted quick rationale",
      identityId,
      "2026-05-27T10:13:00.000Z",
    );
  database
    .prepare(
      `insert into accepted_quick_check_revision_options (revision_id, id, option_order, text)
       values (?, ?, ?, ?)`,
    )
    .run("quick-check-revision-replacement", "quick-check-revision-replacement-option-a", 0, "Revision replacement option A");
  database
    .prepare(
      `insert into accepted_quick_check_revision_options (revision_id, id, option_order, text)
       values (?, ?, ?, ?)`,
    )
    .run("quick-check-revision-replacement", "quick-check-revision-replacement-option-b", 1, "Revision replacement option B");
  database
    .prepare(
      `update accepted_quick_check_entities
       set current_revision_id = ?
       where id = ?`,
    )
    .run("quick-check-revision-replacement", "quick-check-entity-existing");
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
      "attempt-failed",
      programId,
      identityId,
      "check-revision-existing",
      JSON.stringify(["criterion-revision-existing"]),
      "Failed answer",
      "idempotency-failed",
      "evaluation_failed",
      "2026-05-27T10:13:30.000Z",
      "2026-05-27T10:16:00.000Z",
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
    .run("attempt-failed", "temporary evaluator outage", "2026-05-27T10:16:00.000Z");
}

function seedOpenAnswerEvaluatorRunAndEvidenceRecords(database, { identityId, programId }) {
  database
    .prepare(
      `insert into open_answer_evaluator_runs (
         id,
         attempt_id,
         program_id,
         student_identity_id,
         check_revision_id,
         criterion_revision_ids_json,
         evaluator_path_kind,
         evaluator_policy_id,
         status,
         requested_by_identity_id,
         reviewer_identity_id,
         reviewer_capability,
         started_at,
         completed_at,
         failed_at,
         failure_reason,
         prior_failure_reason,
         prior_failed_at
       ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "evaluator-run-existing",
      "attempt-existing",
      programId,
      identityId,
      "check-revision-existing",
      JSON.stringify(["criterion-revision-existing"]),
      "deterministic",
      "policy-existing",
      "succeeded",
      identityId,
      null,
      null,
      "2026-05-27T10:14:30.000Z",
      "2026-05-27T10:15:00.000Z",
      null,
      null,
      null,
      null,
    );
  database
    .prepare(
      `insert into open_answer_evaluator_evidence (
         id, evaluator_run_id, attempt_id, evidence_kind, visibility, redacted_summary, recorded_at
       ) values (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "evidence-existing",
      "evaluator-run-existing",
      "attempt-existing",
      "criterion_match",
      "internal",
      "Matched accepted criterion.",
      "2026-05-27T10:14:45.000Z",
    );
}

function seedOpenAnswerEvaluatorRunAndEvidenceBackupRecords(backup) {
  backup.openAnswerEvaluatorRuns = [
    {
      id: "evaluator-run-existing",
      attemptId: "attempt-existing",
      programId: "program-1",
      studentIdentityId: "identity-1",
      checkRevisionId: "check-revision-existing",
      criterionRevisionIds: ["criterion-revision-existing"],
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-existing",
      status: "succeeded",
      requestedByIdentityId: "identity-1",
      reviewerIdentityId: null,
      reviewerCapability: null,
      startedAt: "2026-05-27T10:14:30.000Z",
      completedAt: "2026-05-27T10:15:00.000Z",
      failedAt: null,
      failureReason: null,
      priorFailureReason: null,
      priorFailedAt: null,
    },
  ];
  backup.openAnswerEvaluatorEvidence = [
    {
      id: "evidence-existing",
      evaluatorRunId: "evaluator-run-existing",
      attemptId: "attempt-existing",
      evidenceKind: "criterion_match",
      visibility: "internal",
      redactedSummary: "Matched accepted criterion.",
      recordedAt: "2026-05-27T10:14:45.000Z",
    },
  ];
}

function countStudentAttemptStorageRows(database) {
  return [
    "open_answer_evaluator_evidence",
    "open_answer_evaluator_runs",
    "open_answer_evaluation_failures",
    "open_answer_evaluations",
    "open_answer_attempts",
  ].reduce((count, tableName) => {
    const row = database.prepare(`select count(*) as count from ${tableName}`).get();
    return count + row.count;
  }, 0);
}

function projectAttemptBackupRecord(attempt) {
  return {
    id: attempt.id,
    programId: attempt.programId,
    studentIdentityId: attempt.studentIdentityId,
    checkRevisionId: attempt.checkRevisionId,
    criterionRevisionIds: attempt.criterionRevisionIds,
    idempotencyKey: attempt.idempotencyKey,
    status: attempt.status,
  };
}

function projectEvaluationBackupRecord(evaluation) {
  return {
    id: evaluation.id,
    attemptId: evaluation.attemptId,
    programId: evaluation.programId,
    studentIdentityId: evaluation.studentIdentityId,
    checkRevisionId: evaluation.checkRevisionId,
    criterionRevisionIds: evaluation.criterionRevisionIds,
    evaluatorKind: evaluation.evaluatorKind,
  };
}

function projectQuickCheckAttemptBackupRecord(attempt) {
  return {
    id: attempt.id,
    programId: attempt.programId,
    studentIdentityId: attempt.studentIdentityId,
    checkRevisionId: attempt.checkRevisionId,
    selectedOptionId: attempt.selectedOptionId,
    matched: attempt.matched,
    idempotencyKey: attempt.idempotencyKey,
  };
}

function projectReadinessAttemptBackupRecord(attempt) {
  return {
    id: attempt.id,
    programId: attempt.programId,
    studentIdentityId: attempt.studentIdentityId,
    readinessCheckRevisionId: attempt.readinessCheckRevisionId,
    result: attempt.result,
    requirementIds: attempt.requirementResults.map($0 => $0.requirementId),
    idempotencyKey: attempt.idempotencyKey,
  };
}

function projectQuickCheckAttemptSummary(attempt) {
  return {
    attemptId: attempt.attemptId,
    checkRevisionId: attempt.checkRevisionId,
    selectedOptionId: attempt.selectedOptionId,
    matched: attempt.matched,
  };
}

function projectEvaluatorRunBackupRecord(evaluatorRun) {
  return {
    id: evaluatorRun.id,
    attemptId: evaluatorRun.attemptId,
    programId: evaluatorRun.programId,
    studentIdentityId: evaluatorRun.studentIdentityId,
    checkRevisionId: evaluatorRun.checkRevisionId,
    criterionRevisionIds: evaluatorRun.criterionRevisionIds,
    evaluatorPathKind: evaluatorRun.evaluatorPathKind,
    evaluatorPolicyId: evaluatorRun.evaluatorPolicyId,
    status: evaluatorRun.status,
    requestedByIdentityId: evaluatorRun.requestedByIdentityId,
  };
}

function projectEvaluatorEvidenceBackupRecord(evidence) {
  return {
    id: evidence.id,
    evaluatorRunId: evidence.evaluatorRunId,
    attemptId: evidence.attemptId,
    evidenceKind: evidence.evidenceKind,
    visibility: evidence.visibility,
    redactedSummary: evidence.redactedSummary,
  };
}

function containsForbiddenBackupDetail(values) {
  const serialized = JSON.stringify(values).toLowerCase();
  return [
    "correct horse battery staple",
    "operator-secret",
    "session",
    "csrf",
    "cookie",
    "authorization",
    "diagnostic",
    "raw model",
    "raw prompt",
    "select ",
    "stack",
    "127.0.0.1",
    "/tmp",
    "postgres://",
  ].some($0 => serialized.includes($0));
}

function containsQuickCheckForbiddenStudentReadDetail(values) {
  const serialized = JSON.stringify(values).toLowerCase();
  return [
    "answerkey",
    "acceptedby",
    "acceptedfromcandidate",
    "candidateid",
    "correctoption",
    "createdby",
    "idempotency",
    "rationale",
  ].some($0 => serialized.includes($0));
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

async function makeExportedWithdrawnCorpusBackup() {
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
    storage.setAcceptedCorpusEntityLifecycleStatusRecord(source.database, {
      entityId: "entity-1",
      status: "withdrawn",
      updatedByIdentityId: "identity-1",
      updatedAt: "2026-05-27T10:05:00.000Z",
    });
    storage.setProgramSourceLifecycleStatusRecord(source.database, {
      sourceId: "source-1",
      status: "withdrawn",
      updatedByIdentityId: "identity-1",
      updatedAt: "2026-05-27T10:06:00.000Z",
    });

    return source.commands.exportBackup().value.backup;
  } finally {
    source.database.close();
  }
}

async function makeExportedNavigationBackup() {
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
    seedNavigationRelationshipRecords(source.database, { identityId: "identity-1", programId: "program-1" });

    return source.commands.exportBackup().value.backup;
  } finally {
    source.database.close();
  }
}

async function makeExportedQuickCheckBackup() {
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
    seedQuickCheckStudentIdentityAndMembership(source.database, { programId: "program-1" });
    seedCorpusRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedQuickCheckStorageRecords(source.database, { identityId: "identity-1", programId: "program-1" });

    return source.commands.exportBackup().value.backup;
  } finally {
    source.database.close();
  }
}

async function makeExportedLearnerEvidenceTargetLinkBackup() {
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
    seedQuickCheckStudentIdentityAndMembership(source.database, { programId: "program-1" });
    seedCorpusRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedQuickCheckStorageRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedLearnerEvidenceTargetLinkRecords(source.database, {
      identityId: "identity-1",
      programId: "program-1",
    });

    return source.commands.exportBackup().value.backup;
  } finally {
    source.database.close();
  }
}

async function makeExportedProgramInvitationBackup() {
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
    seedMembershipInvitationRecords(source.database);

    return source.commands.exportBackup().value.backup;
  } finally {
    source.database.close();
  }
}

async function makeExportedReadinessBackup() {
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
    seedQuickCheckStudentIdentityAndMembership(source.database, { programId: "program-1" });
    seedCorpusRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedNavigationRelationshipRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedReadinessStorageRecords(source.database, { identityId: "identity-1", programId: "program-1" });

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

async function makeExportedStudentAttemptBackup() {
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
    seedStudentAttemptStorageRecords(source.database, { identityId: "identity-1", programId: "program-1" });

    return source.commands.exportBackup().value.backup;
  } finally {
    source.database.close();
  }
}

async function makeExportedStudentAttemptEvaluatorBackup() {
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
    seedStudentAttemptStorageRecords(source.database, { identityId: "identity-1", programId: "program-1" });
    seedOpenAnswerEvaluatorRunAndEvidenceRecords(source.database, {
      identityId: "identity-1",
      programId: "program-1",
    });

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

function makeStudentWorkspaceCommands(database) {
  const programCommands = createProgramCommands({
    database,
    generateId: makeIdGenerator([]),
    now: () => new Date("2026-05-27T10:00:00.000Z"),
  });
  return createStudentWorkspaceCommands({
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

async function makeExportedContentBackup() {
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

    storage.createCorpusCandidateRecord(source.database, {
      id: "content-candidate-1",
      programId: "program-1",
      candidateKind: "material_reference",
      title: "Material",
      materialReferenceKind: "lecture",
      locator: "loc",
      sourceIds: ["source-1"],
      status: "accepted",
      createdByIdentityId: "identity-1",
      createdAt: "2026-05-27T10:06:00.000Z",
      updatedAt: "2026-05-27T10:06:00.000Z",
    });
    storage.createAcceptedCorpusEntityRecord(source.database, {
      id: "content-entity-1",
      programId: "program-1",
      acceptedKind: "material_reference",
      currentRevisionId: "content-revision-1",
    });
    storage.createAcceptedCorpusRevisionRecord(source.database, {
      id: "content-revision-1",
      entityId: "content-entity-1",
      programId: "program-1",
      acceptedKind: "material_reference",
      title: "Material",
      materialReferenceKind: "lecture",
      locator: "loc",
      acceptedFromCandidateId: "content-candidate-1",
      sourceIds: ["source-1"],
      acceptedByIdentityId: "identity-1",
      acceptedAt: "2026-05-27T10:07:00.000Z",
    });
    storage.setSourceContentRecord(source.database, {
      sourceId: "source-1",
      content: "# Source text",
      contentFormat: "markdown",
      recordedByIdentityId: "identity-1",
      recordedAt: "2026-05-27T10:08:00.000Z",
    });
    storage.setAcceptedMaterialContentRecord(source.database, {
      revisionId: "content-revision-1",
      content: "# Accepted text",
      contentFormat: "markdown",
      sourceContentProvenance: { sourceId: "source-1" },
    });

    return source.commands.exportBackup().value.backup;
  } finally {
    source.database.close();
  }
}

function makeExistingContentBackup(backup) {
  const existing = structuredClone(backup);
  existing.sourceContents[0] = {
    ...existing.sourceContents[0],
    content: "# Existing source text",
    byteSize: Buffer.byteLength("# Existing source text", "utf8"),
    recordedAt: "2026-05-27T11:08:00.000Z",
  };
  existing.acceptedMaterialContents[0] = {
    ...existing.acceptedMaterialContents[0],
    content: "# Existing accepted text",
    byteSize: Buffer.byteLength("# Existing accepted text", "utf8"),
    sourceContentProvenance: { sourceId: "source-1", range: { start: 0, end: 9 } },
  };
  return existing;
}

async function assertContentRestoreRejectionPreservesTarget({ mutateBackup, expectedReason }) {
  const backup = await makeExportedContentBackup();
  const target = makeSUT();

  try {
    const seedResult = target.commands.restoreBackup(makeExistingContentBackup(backup));
    mutateBackup(backup);
    const result = target.commands.restoreBackup(backup);

    assert.deepEqual(
      {
        seedStatus: seedResult.status,
        result,
        existingCredentialLogin: getLocalPasswordCredentialByLogin(target.database, "admin@example.test")?.login,
        sourceContent: storage.getSourceContentRecord(target.database, "source-1"),
        acceptedContent: storage.getAcceptedMaterialContentRecord(target.database, "content-revision-1"),
      },
      {
        seedStatus: "accepted",
        result: {
          status: "rejected",
          reason: expectedReason,
        },
        existingCredentialLogin: "admin@example.test",
        sourceContent: {
          sourceId: "source-1",
          content: "# Existing source text",
          contentFormat: "markdown",
          byteSize: Buffer.byteLength("# Existing source text", "utf8"),
          recordedByIdentityId: "identity-1",
          recordedAt: "2026-05-27T11:08:00.000Z",
        },
        acceptedContent: {
          revisionId: "content-revision-1",
          content: "# Existing accepted text",
          contentFormat: "markdown",
          byteSize: Buffer.byteLength("# Existing accepted text", "utf8"),
          sourceContentProvenance: { sourceId: "source-1", range: { start: 0, end: 9 } },
        },
      },
    );
  } finally {
    target.database.close();
  }
}

test("restoreBackup_shouldRoundTripMaterialContent_onContentBackup", async () => {
  const backup = await makeExportedContentBackup();
  const target = makeSUT();

  try {
    const result = target.commands.restoreBackup(backup);

    assert.equal(result.status, "accepted");
    assert.deepEqual(storage.getSourceContentRecord(target.database, "source-1"), {
      sourceId: "source-1",
      content: "# Source text",
      contentFormat: "markdown",
      byteSize: Buffer.byteLength("# Source text", "utf8"),
      recordedByIdentityId: "identity-1",
      recordedAt: "2026-05-27T10:08:00.000Z",
    });
    const accepted = storage.getAcceptedMaterialContentRecord(target.database, "content-revision-1");
    assert.equal(accepted.content, "# Accepted text");
    assert.deepEqual(accepted.sourceContentProvenance, { sourceId: "source-1" });
  } finally {
    target.database.close();
  }
});

test("restoreBackup_shouldRejectSourceContentWithMissingSource_onContentBackup", async () => {
  await assertContentRestoreRejectionPreservesTarget({
    mutateBackup: backup => {
      backup.sourceContents[0] = { ...backup.sourceContents[0], sourceId: "missing-source" };
    },
    expectedReason: "source_content_source_not_found",
  });
});

test("restoreBackup_shouldRejectMaterialContentWithMissingRevision_onContentBackup", async () => {
  await assertContentRestoreRejectionPreservesTarget({
    mutateBackup: backup => {
      backup.acceptedMaterialContents[0] = {
        ...backup.acceptedMaterialContents[0],
        revisionId: "missing-revision",
      };
    },
    expectedReason: "accepted_material_content_revision_not_found",
  });
});

test("restoreBackup_shouldRejectMaterialContentOnNonMaterialRevision_onContentBackup", async () => {
  await assertContentRestoreRejectionPreservesTarget({
    mutateBackup: backup => {
      // revision-1 is the seeded topic revision.
      backup.acceptedMaterialContents[0] = {
        ...backup.acceptedMaterialContents[0],
        revisionId: "revision-1",
      };
    },
    expectedReason: "accepted_material_content_revision_kind_mismatch",
  });
});

test("restoreBackup_shouldRejectContentWithInvalidFormat_onContentBackup", async () => {
  await assertContentRestoreRejectionPreservesTarget({
    mutateBackup: backup => {
      backup.sourceContents[0] = { ...backup.sourceContents[0], contentFormat: "html" };
    },
    expectedReason: "content_format_invalid",
  });
});

test("restoreBackup_shouldRejectContentWithByteSizeMismatch_onContentBackup", async () => {
  await assertContentRestoreRejectionPreservesTarget({
    mutateBackup: backup => {
      backup.sourceContents[0] = { ...backup.sourceContents[0], byteSize: 99999 };
    },
    expectedReason: "content_byte_size_mismatch",
  });
});

test("restoreBackup_shouldRejectOversizedContent_onContentBackup", async () => {
  await assertContentRestoreRejectionPreservesTarget({
    mutateBackup: backup => {
      const oversized = "a".repeat(storage.MAX_MATERIAL_CONTENT_BYTES + 1);
      backup.sourceContents[0] = {
        ...backup.sourceContents[0],
        content: oversized,
        byteSize: Buffer.byteLength(oversized, "utf8"),
      };
    },
    expectedReason: "content_too_large",
  });
});
