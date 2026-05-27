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
