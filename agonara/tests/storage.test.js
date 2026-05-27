import assert from "node:assert/strict";
import test from "node:test";
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
