import assert from "node:assert/strict";
import test from "node:test";
import { createIdentityCommands } from "../src/identity.js";
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
