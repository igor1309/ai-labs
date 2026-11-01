import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapAdmin,
  listenWithIdentityAndProgram,
} from "./support/http-api.js";

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
        leaksPassword: responseText.includes("NON_SECRET_TEST_VALUE"),
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
