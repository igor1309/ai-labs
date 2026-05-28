import assert from "node:assert/strict";
import test from "node:test";
import { createIdentityCommands } from "../src/identity.js";
import {
  createIdentity,
  createSession,
  getLocalPasswordCredentialByLogin,
  initializeIdentityStorage,
  listAuditEvents,
  openIdentityDatabase,
} from "../src/storage.js";

test("bootstrapFirstAdmin_shouldAcceptAndCreateSession_onCleanInstance", async () => {
  const { commands, database } = makeSUT();

  try {
    const result = await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    assert.deepEqual(result, {
      status: "accepted",
      value: {
        identity: {
          id: "identity-1",
          displayName: "Root Admin",
          state: "active",
          createdAt: "2026-05-27T10:00:00.000Z",
          disabledAt: null,
        },
        session: {
          id: "session-1",
          identityId: "identity-1",
          createdAt: "2026-05-27T10:00:00.000Z",
          expiresAt: "2026-06-03T10:00:00.000Z",
          revokedAt: null,
        },
      },
    });
  } finally {
    database.close();
  }
});

test("bootstrapFirstAdmin_shouldStorePasswordHash_onAcceptedBootstrap", async () => {
  const { commands, database } = makeSUT();

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    const credential = getLocalPasswordCredentialByLogin(database, "admin@example.test");

    assert.deepEqual(
      {
        usesScrypt: credential.passwordHash.startsWith("scrypt$"),
        storesPlaintext: credential.passwordHash === "correct horse battery staple",
      },
      {
        usesScrypt: true,
        storesPlaintext: false,
      },
    );
  } finally {
    database.close();
  }
});

test("bootstrapFirstAdmin_shouldRejectWrongSecretAndAudit_onMismatchedSecret", async () => {
  const { commands, database } = makeSUT();

  try {
    const result = await commands.bootstrapFirstAdmin({
      bootstrapSecret: "wrong-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    assert.deepEqual(
      {
        result,
        auditEvents: listAuditEvents(database).map($0 => ({
          eventType: $0.eventType,
          outcome: $0.outcome,
          reason: $0.reason,
        })),
      },
      {
        result: { status: "rejected", reason: "invalid_bootstrap_secret" },
        auditEvents: [
          {
            eventType: "bootstrap_first_admin",
            outcome: "rejected",
            reason: "invalid_bootstrap_secret",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("bootstrapFirstAdmin_shouldRejectCompletedBootstrap_onExistingAdmin", async () => {
  const { commands, database } = makeSUT();

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    assert.deepEqual(
      await commands.bootstrapFirstAdmin({
        bootstrapSecret: "operator-secret",
        displayName: "Second Admin",
        login: "second@example.test",
        password: "another correct horse",
      }),
      { status: "rejected", reason: "bootstrap_already_completed" },
    );
  } finally {
    database.close();
  }
});

test("login_shouldAcceptValidCredential_onActiveIdentity", async () => {
  const { commands, database } = makeSUT();

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    const result = await commands.login({
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    assert.deepEqual(result.value.session, {
      id: "session-2",
      identityId: "identity-1",
      createdAt: "2026-05-27T10:00:00.000Z",
      expiresAt: "2026-06-03T10:00:00.000Z",
      revokedAt: null,
    });
  } finally {
    database.close();
  }
});

test("login_shouldRejectInvalidCredentials_onWrongPassword", async () => {
  const { commands, database } = makeSUT();

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    assert.deepEqual(
      await commands.login({
        login: "admin@example.test",
        password: "wrong horse battery staple",
      }),
      { status: "rejected", reason: "invalid_credentials" },
    );
  } finally {
    database.close();
  }
});

test("login_shouldRejectInvalidCredentials_onDisabledIdentity", async () => {
  const { commands, database } = makeSUT();

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });
    database
      .prepare("update identities set state = 'disabled', disabled_at = ? where id = ?")
      .run("2026-05-27T11:00:00.000Z", "identity-1");

    assert.deepEqual(
      await commands.login({
        login: "admin@example.test",
        password: "correct horse battery staple",
      }),
      { status: "rejected", reason: "invalid_credentials" },
    );
  } finally {
    database.close();
  }
});

test("resolveSession_shouldRejectExpiredSession_onPastExpiry", () => {
  const { commands, database } = makeSUT({ now: () => new Date("2026-06-03T10:00:01.000Z") });

  try {
    createIdentity(database, makeIdentity("identity-1"));
    createSession(database, {
      id: "session-1",
      identityId: "identity-1",
      createdAt: "2026-05-27T10:00:00.000Z",
      expiresAt: "2026-06-03T10:00:00.000Z",
    });

    assert.deepEqual(commands.resolveSession({ sessionId: "session-1" }), {
      status: "rejected",
      reason: "session_expired",
    });
  } finally {
    database.close();
  }
});

test("resolveSession_shouldRejectDisabledIdentity_onDisabledIdentity", () => {
  const { commands, database } = makeSUT();

  try {
    createIdentity(database, {
      ...makeIdentity("identity-1"),
      state: "disabled",
      disabledAt: "2026-05-27T11:00:00.000Z",
    });
    createSession(database, {
      id: "session-1",
      identityId: "identity-1",
      createdAt: "2026-05-27T10:00:00.000Z",
      expiresAt: "2026-06-03T10:00:00.000Z",
    });

    assert.deepEqual(commands.resolveSession({ sessionId: "session-1" }), {
      status: "rejected",
      reason: "identity_disabled",
    });
  } finally {
    database.close();
  }
});

test("logout_shouldRevokeSession_onActiveSession", async () => {
  const { commands, database } = makeSUT();

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    const logoutResult = commands.logout({ sessionId: "session-1" });
    const resolveResult = commands.resolveSession({ sessionId: "session-1" });

    assert.deepEqual(
      { logoutResult, resolveResult },
      {
        logoutResult: {
          status: "accepted",
          value: { loggedOut: true },
        },
        resolveResult: {
          status: "rejected",
          reason: "session_revoked",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("createIdentity_shouldAcceptAndAudit_onAdminSession", async () => {
  const { commands, database } = makeSUT({
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "identity-2", "audit-2"],
  });

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    const result = commands.createIdentity({
      actingSessionId: "session-1",
      displayName: "Second Identity",
    });

    assert.deepEqual(
      {
        result,
        auditEvents: listAuditEvents(database).map($0 => ({
          eventType: $0.eventType,
          actorIdentityId: $0.actorIdentityId,
          targetIdentityId: $0.targetIdentityId,
          outcome: $0.outcome,
          reason: $0.reason,
        })),
      },
      {
        result: {
          status: "accepted",
          value: {
            id: "identity-2",
            displayName: "Second Identity",
            state: "active",
            createdAt: "2026-05-27T10:00:00.000Z",
            disabledAt: null,
          },
        },
        auditEvents: [
          {
            eventType: "bootstrap_first_admin",
            actorIdentityId: null,
            targetIdentityId: "identity-1",
            outcome: "accepted",
            reason: null,
          },
          {
            eventType: "identity_created",
            actorIdentityId: "identity-1",
            targetIdentityId: "identity-2",
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

test("createIdentity_shouldRejectAdminRequired_onNonAdminSession", () => {
  const { commands, database } = makeSUT();

  try {
    createIdentity(database, makeIdentity("identity-1"));
    createSession(database, {
      id: "session-1",
      identityId: "identity-1",
      createdAt: "2026-05-27T10:00:00.000Z",
      expiresAt: "2026-06-03T10:00:00.000Z",
    });

    assert.deepEqual(commands.createIdentity({ actingSessionId: "session-1", displayName: "Blocked" }), {
      status: "rejected",
      reason: "admin_required",
    });
  } finally {
    database.close();
  }
});

test("bindLocalPasswordCredential_shouldRejectDuplicateLoginAndAudit_onExistingLogin", async () => {
  const { commands, database } = makeSUT({
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "credential-2", "audit-2"],
  });

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });
    createIdentity(database, makeIdentity("identity-2"));

    const result = await commands.bindLocalPasswordCredential({
      actingSessionId: "session-1",
      identityId: "identity-2",
      login: "admin@example.test",
      password: "another correct horse",
    });

    assert.deepEqual(
      {
        result,
        auditEvents: listAuditEvents(database).map($0 => ({
          eventType: $0.eventType,
          actorIdentityId: $0.actorIdentityId,
          targetIdentityId: $0.targetIdentityId,
          outcome: $0.outcome,
          reason: $0.reason,
        })),
      },
      {
        result: { status: "rejected", reason: "login_already_bound" },
        auditEvents: [
          {
            eventType: "bootstrap_first_admin",
            actorIdentityId: null,
            targetIdentityId: "identity-1",
            outcome: "accepted",
            reason: null,
          },
          {
            eventType: "local_password_credential_bound",
            actorIdentityId: "identity-1",
            targetIdentityId: "identity-2",
            outcome: "rejected",
            reason: "login_already_bound",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("disableIdentity_shouldInvalidateSessions_onTargetIdentity", async () => {
  const { commands, database } = makeSUT({
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "audit-2"],
  });

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });
    createIdentity(database, makeIdentity("identity-2"));
    createSession(database, {
      id: "session-2",
      identityId: "identity-2",
      createdAt: "2026-05-27T10:00:00.000Z",
      expiresAt: "2026-06-03T10:00:00.000Z",
    });

    const disableResult = commands.disableIdentity({
      actingSessionId: "session-1",
      identityId: "identity-2",
    });
    const resolveResult = commands.resolveSession({ sessionId: "session-2" });

    assert.deepEqual(
      { disableResult, resolveResult },
      {
        disableResult: {
          status: "accepted",
          value: {
            id: "identity-2",
            displayName: "Display identity-2",
            state: "disabled",
            createdAt: "2026-05-27T10:00:00.000Z",
            disabledAt: "2026-05-27T10:00:00.000Z",
          },
        },
        resolveResult: { status: "rejected", reason: "session_revoked" },
      },
    );
  } finally {
    database.close();
  }
});

test("revokeAdmin_shouldRejectLastAdminRemovalAndAudit_onOnlyAdmin", async () => {
  const { commands, database } = makeSUT({
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "audit-2"],
  });

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    const result = commands.revokeAdmin({
      actingSessionId: "session-1",
      identityId: "identity-1",
    });

    assert.deepEqual(
      {
        result,
        auditEvents: listAuditEvents(database).map($0 => ({
          eventType: $0.eventType,
          actorIdentityId: $0.actorIdentityId,
          targetIdentityId: $0.targetIdentityId,
          outcome: $0.outcome,
          reason: $0.reason,
        })),
      },
      {
        result: { status: "rejected", reason: "last_admin_removal" },
        auditEvents: [
          {
            eventType: "bootstrap_first_admin",
            actorIdentityId: null,
            targetIdentityId: "identity-1",
            outcome: "accepted",
            reason: null,
          },
          {
            eventType: "admin_revoked",
            actorIdentityId: "identity-1",
            targetIdentityId: "identity-1",
            outcome: "rejected",
            reason: "last_admin_removal",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("grantAdmin_shouldExposeOperationalAccess_onAdminSession", async () => {
  const { commands, database } = makeSUT({
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "audit-2"],
  });

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });
    createIdentity(database, makeIdentity("identity-2"));

    const grantResult = commands.grantAdmin({
      actingSessionId: "session-1",
      identityId: "identity-2",
    });
    const accessResult = commands.getOperationalAccessState({
      actingSessionId: "session-1",
      identityId: "identity-2",
    });

    assert.deepEqual(
      { grantResult, accessResult },
      {
        grantResult: {
          status: "accepted",
          value: {
            id: "identity-2",
            displayName: "Display identity-2",
            state: "active",
            createdAt: "2026-05-27T10:00:00.000Z",
            disabledAt: null,
          },
        },
        accessResult: {
          status: "accepted",
          value: {
            effectiveAdmin: true,
            identity: {
              id: "identity-2",
              displayName: "Display identity-2",
              state: "active",
              isAdmin: true,
            },
          },
        },
      },
    );
  } finally {
    database.close();
  }
});

test("grantAdmin_shouldRejectDisabledIdentity_onDisabledTarget", async () => {
  const { commands, database } = makeSUT({
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "audit-2"],
  });

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });
    createIdentity(database, {
      ...makeIdentity("identity-2"),
      state: "disabled",
      disabledAt: "2026-05-27T11:00:00.000Z",
    });

    assert.deepEqual(commands.grantAdmin({ actingSessionId: "session-1", identityId: "identity-2" }), {
      status: "rejected",
      reason: "identity_disabled",
    });
  } finally {
    database.close();
  }
});

test("revokeAdmin_shouldAccept_onAnotherEffectiveAdmin", async () => {
  const { commands, database } = makeSUT({
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "audit-2", "audit-3"],
  });

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });
    createIdentity(database, makeIdentity("identity-2"));
    commands.grantAdmin({
      actingSessionId: "session-1",
      identityId: "identity-2",
    });

    assert.deepEqual(commands.revokeAdmin({ actingSessionId: "session-1", identityId: "identity-1" }), {
      status: "accepted",
      value: {
        id: "identity-1",
        displayName: "Root Admin",
        state: "active",
        createdAt: "2026-05-27T10:00:00.000Z",
        disabledAt: null,
      },
    });
  } finally {
    database.close();
  }
});

test("listIdentities_shouldReturnAdminSummaries_onAdminSession", async () => {
  const { commands, database } = makeSUT({
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "audit-2"],
  });

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });
    createIdentity(database, makeIdentity("identity-2"));

    assert.deepEqual(commands.listIdentities({ actingSessionId: "session-1" }), {
      status: "accepted",
      value: {
        identities: [
          {
            id: "identity-1",
            displayName: "Root Admin",
            state: "active",
            isAdmin: true,
          },
          {
            id: "identity-2",
            displayName: "Display identity-2",
            state: "active",
            isAdmin: false,
          },
        ],
      },
    });
  } finally {
    database.close();
  }
});

test("listAuditEvents_shouldReturnEvents_onAdminSession", async () => {
  const { commands, database } = makeSUT();

  try {
    await commands.bootstrapFirstAdmin({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    });

    assert.deepEqual(commands.listAuditEvents({ actingSessionId: "session-1" }).value.auditEvents.map($0 => $0.eventType), [
      "bootstrap_first_admin",
    ]);
  } finally {
    database.close();
  }
});

function makeSUT({
  ids = [
    "identity-1",
    "credential-1",
    "session-1",
    "audit-1",
    "session-2",
    "audit-2",
    "identity-2",
    "credential-2",
  ],
  now = () => new Date("2026-05-27T10:00:00.000Z"),
} = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const commands = createIdentityCommands({
    bootstrapSecret: "operator-secret",
    database,
    generateId: makeIdGenerator(ids),
    now,
  });
  return { commands, database };
}

function makeIdGenerator(ids) {
  const nextIds = [...ids];
  return () => nextIds.shift();
}

function makeIdentity(id) {
  return {
    id,
    displayName: `Display ${id}`,
    createdAt: "2026-05-27T10:00:00.000Z",
  };
}
