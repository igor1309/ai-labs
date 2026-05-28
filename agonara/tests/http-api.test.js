import assert from "node:assert/strict";
import test from "node:test";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import { createServer } from "../src/server.js";
import { initializeIdentityStorage, openIdentityDatabase } from "../src/storage.js";

test("identityBootstrap_shouldSetCookieAndHideSessionId_onAcceptedBootstrap", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/identity/bootstrap/admin`, {
      body: JSON.stringify({
        bootstrapSecret: "operator-secret",
        displayName: "Root Admin",
        login: "admin@example.test",
        password: "correct horse battery staple",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        hasSessionCookie: response.headers.get("set-cookie")?.includes("agonara_session="),
        hasSessionIdInBody: JSON.stringify(body).includes("session-1"),
        bodyStatus: body.status,
        identityId: body.value.identity.id,
        isAdmin: body.value.identity.isAdmin,
        hasCsrfToken: typeof body.value.csrfToken === "string",
      },
      {
        statusCode: 200,
        hasSessionCookie: true,
        hasSessionIdInBody: false,
        bodyStatus: "accepted",
        identityId: "identity-1",
        isAdmin: true,
        hasCsrfToken: true,
      },
    );
  } finally {
    await close();
  }
});

test("programsList_shouldRejectMissingSession_withSessionNotFound", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram();

  try {
    const response = await fetch(`${baseUrl}/programs`);

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 401,
        body: { status: "rejected", reason: "session_not_found" },
      },
    );
  } finally {
    await close();
  }
});

test("programsList_shouldRejectDisabledSessionIdentity_withIdentityDisabled", async () => {
  const { baseUrl, close, database } = await listenWithIdentityAndProgram();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    database
      .prepare("update identities set state = 'disabled', disabled_at = ? where id = ?")
      .run("2026-05-27T10:00:00.000Z", bootstrap.body.value.identity.id);
    const response = await fetch(`${baseUrl}/programs`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 403,
        body: { status: "rejected", reason: "identity_disabled" },
      },
    );
  } finally {
    await close();
  }
});

test("programsList_shouldReturnEmptyPrograms_onActiveSessionWithEmptyStore", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 200,
        body: { status: "accepted", value: { programs: [] } },
      },
    );
  } finally {
    await close();
  }
});

test("programsCreate_shouldRejectMissingCsrf_beforeDomainMutation", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 403,
        body: { status: "rejected", reason: "csrf_required" },
      },
    );
  } finally {
    await close();
  }
});

test("programsCreate_shouldReturnProgramCreated_onAccepted", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ description: "Foundations", title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            initialCuratorMembership: {
              identityId: "identity-1",
              participationKind: "program_curator",
              programId: "program-1",
              status: "active",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
            program: {
              admissionPolicy: "self_join",
              createdAt: "2026-05-27T10:00:00.000Z",
              createdByIdentityId: "identity-1",
              description: "Foundations",
              programId: "program-1",
              title: "Linear Algebra",
            },
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("programsCreate_shouldRejectInvalidBodies_withValidationFailed", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const cases = [
      undefined,
      "not valid json{{{",
      JSON.stringify([]),
      JSON.stringify({ title: " " }),
      JSON.stringify({ description: 42, title: "Linear Algebra" }),
    ];
    const responses = [];
    for (const body of cases) {
      const response = await fetch(`${baseUrl}/programs`, {
        body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      responses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      responses,
      cases.map(() => ({
        body: { status: "rejected", reason: "validation_failed" },
        statusCode: 400,
      })),
    );
  } finally {
    await close();
  }
});

test("programsList_shouldReturnCreatedPrograms_onActiveSession", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ description: "Foundations", title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const response = await fetch(`${baseUrl}/programs`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(await response.json(), {
      status: "accepted",
      value: {
        programs: [
          {
            admissionPolicy: "self_join",
            createdAt: "2026-05-27T10:00:00.000Z",
            createdByIdentityId: "identity-1",
            description: "Foundations",
            programId: "program-1",
            title: "Linear Algebra",
          },
        ],
      },
    });
  } finally {
    await close();
  }
});

test("programsGet_shouldReturnKnownProgramAndRejectUnknownProgram", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const known = await fetch(`${baseUrl}/programs/program-1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const unknown = await fetch(`${baseUrl}/programs/program-ghost`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        known: { body: await known.json(), statusCode: known.status },
        unknown: { body: await unknown.json(), statusCode: unknown.status },
      },
      {
        known: {
          body: {
            status: "accepted",
            value: {
              admissionPolicy: "self_join",
              createdAt: "2026-05-27T10:00:00.000Z",
              createdByIdentityId: "identity-1",
              programId: "program-1",
              title: "Linear Algebra",
            },
          },
          statusCode: 200,
        },
        unknown: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programShellRoutes_shouldNotExposeSessionCsrfOrCredentialSecrets", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const create = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const list = await fetch(`${baseUrl}/programs`, {
      headers: { cookie: bootstrap.cookie },
    });
    const get = await fetch(`${baseUrl}/programs/program-1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const responseText = JSON.stringify({
      create: await create.json(),
      get: await get.json(),
      list: await list.json(),
    });

    assert.deepEqual(
      {
        leaksCsrf: responseText.includes(bootstrap.csrfToken),
        leaksPassword: responseText.includes("correct horse battery staple"),
        leaksPasswordHash: responseText.includes("scrypt$"),
        leaksSession: responseText.includes(bootstrap.cookie.replace("agonara_session=", "")),
      },
      {
        leaksCsrf: false,
        leaksPassword: false,
        leaksPasswordHash: false,
        leaksSession: false,
      },
    );
  } finally {
    await close();
  }
});

test("adminBoard_shouldServeShell_withoutSensitiveRuntimeValues", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.deepEqual(
      {
        statusCode: response.status,
        contentType: response.headers.get("content-type"),
        hasAppRoot: body.includes('id="admin-app"'),
        hasBootstrapSecret: body.includes("operator-secret"),
        hasSessionCookieName: body.includes("agonara_session"),
      },
      {
        statusCode: 200,
        contentType: "text/html; charset=utf-8",
        hasAppRoot: true,
        hasBootstrapSecret: false,
        hasSessionCookieName: false,
      },
    );
  } finally {
    await close();
  }
});

test("adminBoard_shouldExposeSessionControls_withoutSensitiveRuntimeValues", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.deepEqual(
      {
        hasBootstrapForm: body.includes('id="bootstrap-form"'),
        hasLoginForm: body.includes('id="login-form"'),
        hasSessionPanel: body.includes('id="session-panel"'),
        hasLogoutButton: body.includes('id="logout-button"'),
        hasPasswordValue: body.includes("correct horse battery staple"),
        hasBootstrapSecret: body.includes("operator-secret"),
        hasSessionCookieName: body.includes("agonara_session"),
      },
      {
        hasBootstrapForm: true,
        hasLoginForm: true,
        hasSessionPanel: true,
        hasLogoutButton: true,
        hasPasswordValue: false,
        hasBootstrapSecret: false,
        hasSessionCookieName: false,
      },
    );
  } finally {
    await close();
  }
});

test("adminBoard_shouldExposeIdentityOperationControls_withoutSensitiveRuntimeValues", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.deepEqual(
      {
        hasIdentityList: body.includes('id="identity-list"'),
        hasCreateIdentityForm: body.includes('id="create-identity-form"'),
        hasCredentialForm: body.includes('id="credential-form"'),
        hasAccessPanel: body.includes('id="operational-access-panel"'),
        hasDisableAction: body.includes('data-action="disable"'),
        hasGrantAdminAction: body.includes('data-action="grant-admin"'),
        hasRevokeAdminAction: body.includes('data-action="revoke-admin"'),
        hasPasswordValue: body.includes("correct horse battery staple"),
        hasBootstrapSecret: body.includes("operator-secret"),
        hasSessionCookieName: body.includes("agonara_session"),
      },
      {
        hasIdentityList: true,
        hasCreateIdentityForm: true,
        hasCredentialForm: true,
        hasAccessPanel: true,
        hasDisableAction: true,
        hasGrantAdminAction: true,
        hasRevokeAdminAction: true,
        hasPasswordValue: false,
        hasBootstrapSecret: false,
        hasSessionCookieName: false,
      },
    );
  } finally {
    await close();
  }
});

test("adminBoard_shouldExposeAuditEventInspection_withoutSensitiveRuntimeValues", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.deepEqual(
      {
        hasAuditPanel: body.includes('id="audit-events-panel"'),
        hasAuditList: body.includes('id="audit-event-list"'),
        hasRefreshAuditButton: body.includes('id="refresh-audit-events-button"'),
        hasTargetSessionHeader: body.includes("targetSessionId"),
        hasPasswordValue: body.includes("correct horse battery staple"),
        hasBootstrapSecret: body.includes("operator-secret"),
        hasSessionCookieName: body.includes("agonara_session"),
      },
      {
        hasAuditPanel: true,
        hasAuditList: true,
        hasRefreshAuditButton: true,
        hasTargetSessionHeader: false,
        hasPasswordValue: false,
        hasBootstrapSecret: false,
        hasSessionCookieName: false,
      },
    );
  } finally {
    await close();
  }
});

test("identityBootstrapStatus_shouldReflectAvailability_beforeAndAfterBootstrap", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const before = await fetch(`${baseUrl}/identity/bootstrap/status`);
    await bootstrapAdmin(baseUrl);
    const after = await fetch(`${baseUrl}/identity/bootstrap/status`);

    assert.deepEqual(
      {
        before: await before.json(),
        after: await after.json(),
      },
      {
        before: { status: "accepted", value: { available: true } },
        after: { status: "accepted", value: { available: false } },
      },
    );
  } finally {
    await close();
  }
});

test("identityBootstrap_shouldSetSecureCookie_onForwardedHttps", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/identity/bootstrap/admin`, {
      body: JSON.stringify({
        bootstrapSecret: "operator-secret",
        displayName: "Root Admin",
        login: "admin@example.test",
        password: "correct horse battery staple",
      }),
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
      },
      method: "POST",
    });

    assert.equal(response.headers.get("set-cookie")?.includes("Secure"), true);
  } finally {
    await close();
  }
});

test("identitySessions_shouldSetCookieAndHideSessionId_onAcceptedLogin", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/identity/sessions`, {
      body: JSON.stringify({
        login: "admin@example.test",
        password: "correct horse battery staple",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        hasSessionCookie: response.headers.get("set-cookie")?.includes("agonara_session="),
        hasSessionIdInBody: JSON.stringify(body).includes("session-2"),
        bodyStatus: body.status,
        isAdmin: body.value.identity.isAdmin,
        hasCsrfToken: typeof body.value.csrfToken === "string",
      },
      {
        statusCode: 200,
        hasSessionCookie: true,
        hasSessionIdInBody: false,
        bodyStatus: "accepted",
        isAdmin: true,
        hasCsrfToken: true,
      },
    );
  } finally {
    await close();
  }
});

test("identitySessionDelete_shouldRequireCsrf_onActiveSession", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/identity/session`, {
      headers: { cookie: bootstrap.cookie },
      method: "DELETE",
    });

    assert.deepEqual(await response.json(), {
      status: "rejected",
      reason: "csrf_required",
    });
  } finally {
    await close();
  }
});

test("identitySessionDelete_shouldRevokeSession_onMatchingCsrf", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const logout = await fetch(`${baseUrl}/identity/session`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    const session = await fetch(`${baseUrl}/identity/session`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        logout: await logout.json(),
        session: await session.json(),
      },
      {
        logout: { status: "accepted", value: { loggedOut: true } },
        session: { status: "rejected", reason: "session_revoked" },
      },
    );
  } finally {
    await close();
  }
});

test("identitySessions_shouldRateLimit_onRepeatedInvalidCredentials", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    await bootstrapAdmin(baseUrl);
    let response;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      response = await fetch(`${baseUrl}/identity/sessions`, {
        body: JSON.stringify({
          login: "admin@example.test",
          password: "wrong horse battery staple",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    }

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 429,
        body: { status: "rejected", reason: "rate_limited" },
      },
    );
  } finally {
    await close();
  }
});

test("identityAdminEndpoints_shouldCreateIdentityAndListAudit_onAdminSession", async () => {
  const { baseUrl, close } = await listenWithIdentity({
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "identity-2", "audit-2"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const created = await fetch(`${baseUrl}/identity/identities`, {
      body: JSON.stringify({ displayName: "Second Identity" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const audit = await fetch(`${baseUrl}/identity/audit-events`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        created: await created.json(),
        auditBody: await audit.json(),
      },
      {
        created: {
          status: "accepted",
          value: {
            id: "identity-2",
            displayName: "Second Identity",
            state: "active",
            isAdmin: false,
          },
        },
        auditBody: {
          status: "accepted",
          value: {
            auditEvents: [
              {
                id: "audit-1",
                eventType: "bootstrap_first_admin",
                actorIdentityId: null,
                targetIdentityId: "identity-1",
                targetCredentialId: null,
                occurredAt: "2026-05-27T10:00:00.000Z",
                outcome: "accepted",
                reason: null,
              },
              {
                id: "audit-2",
                eventType: "identity_created",
                actorIdentityId: "identity-1",
                targetIdentityId: "identity-2",
                targetCredentialId: null,
                occurredAt: "2026-05-27T10:00:00.000Z",
                outcome: "accepted",
                reason: null,
              },
            ],
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("operationsDiagnostics_shouldAcceptAdminSession_onActiveAdmin", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/operations/diagnostics`, {
      headers: { cookie: bootstrap.cookie },
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        bodyStatus: body.status,
        component: body.value.components[0].component,
      },
      {
        statusCode: 200,
        bodyStatus: "accepted",
        component: "identity",
      },
    );
  } finally {
    await close();
  }
});

async function bootstrapAdmin(baseUrl) {
  const response = await fetch(`${baseUrl}/identity/bootstrap/admin`, {
    body: JSON.stringify({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "correct horse battery staple",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = await response.json();
  return {
    body,
    cookie: response.headers.get("set-cookie").split(";", 1)[0],
    csrfToken: body.value.csrfToken,
  };
}

async function listenWithIdentity({ ids = defaultIds() } = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const server = createServer({
    identityCommands: createIdentityCommands({
      bootstrapSecret: "operator-secret",
      database,
      generateId: makeIdGenerator(ids),
      now: () => new Date("2026-05-27T10:00:00.000Z"),
    }),
    log: () => {},
  });
  const baseUrl = await listen(server);
  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
  };
}

async function listenWithIdentityAndProgram({ ids = defaultIds() } = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const now = () => new Date("2026-05-27T10:00:00.000Z");
  const generateId = makeIdGenerator(ids);
  const server = createServer({
    identityCommands: createIdentityCommands({
      bootstrapSecret: "operator-secret",
      database,
      generateId,
      now,
    }),
    programCommands: createProgramCommands({
      database,
      generateId,
      now,
    }),
    log: () => {},
  });
  const baseUrl = await listen(server);
  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
    database,
  };
}

function defaultIds() {
  return [
    "identity-1",
    "credential-1",
    "session-1",
    "audit-1",
    "session-2",
    "audit-2",
    "identity-2",
    "credential-2",
  ];
}

function makeIdGenerator(ids) {
  const nextIds = [...ids];
  return () => nextIds.shift();
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
