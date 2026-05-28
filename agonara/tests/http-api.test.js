import assert from "node:assert/strict";
import test from "node:test";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import { createServer } from "../src/server.js";
import {
  initializeIdentityStorage,
  listProgramMembershipEventRecords,
  openIdentityDatabase,
  updateProgramMembershipStatus,
} from "../src/storage.js";

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

test("programMembershipsMe_shouldReturnOnlySessionIdentityMemberships", async () => {
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
    const response = await fetch(`${baseUrl}/program-memberships/me`, {
      headers: { cookie: bootstrap.cookie },
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
            memberships: [
              {
                identityId: "identity-1",
                participationKind: "program_curator",
                programId: "program-1",
                status: "active",
                updatedAt: "2026-05-27T10:00:00.000Z",
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

test("studentMembershipCreate_shouldJoinSelfJoinProgram_onFirstJoin", async () => {
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
      "student-membership-1",
      "student-event-1",
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
    const response = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
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
            membership: {
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
              status: "active",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("studentMembershipDelete_shouldLeaveActiveMembership", async () => {
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
      "student-membership-1",
      "student-event-1",
      "student-event-2",
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
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const response = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
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
            membership: {
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
              status: "left",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("studentMembershipCreate_shouldBeIdempotentForActiveMembership", async () => {
  const { baseUrl, close, database } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "student-event-1",
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
    const first = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const second = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });

    assert.deepEqual(
      {
        first: await first.json(),
        second: await second.json(),
        studentEvents: listProgramMembershipEventRecords(database)
          .filter($0 => $0.participationKind === "student")
          .map($0 => $0.eventType),
      },
      {
        first: {
          status: "accepted",
          value: {
            membership: {
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
              status: "active",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
        second: {
          status: "accepted",
          value: {
            membership: {
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
              status: "active",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
        studentEvents: ["student_membership_joined"],
      },
    );
  } finally {
    await close();
  }
});

test("studentMembershipCreate_shouldReactivateLeftMembership_onRejoin", async () => {
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
      "student-membership-1",
      "student-event-1",
      "student-event-2",
      "student-event-3",
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
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    const response = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });

    assert.deepEqual(await response.json(), {
      status: "accepted",
      value: {
        membership: {
          identityId: "identity-1",
          participationKind: "student",
          programId: "program-1",
          status: "active",
          updatedAt: "2026-05-27T10:00:00.000Z",
        },
      },
    });
  } finally {
    await close();
  }
});

test("studentMembershipRoutes_shouldMapConflictsAndUnknownPrograms", async () => {
  const { baseUrl, close, database } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "student-event-1",
      "student-event-2",
      "student-event-3",
      "student-event-4",
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
    const missingLeave = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    const leftLeave = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    updateProgramMembershipStatus(database, {
      identityId: "identity-1",
      participationKind: "student",
      programId: "program-1",
      status: "removed",
      updatedAt: "2026-05-27T10:00:00.000Z",
    });
    const removedJoin = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const unknownJoin = await fetch(`${baseUrl}/programs/program-ghost/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const unknownLeave = await fetch(`${baseUrl}/programs/program-ghost/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });

    assert.deepEqual(
      {
        leftLeave: { body: await leftLeave.json(), statusCode: leftLeave.status },
        missingLeave: { body: await missingLeave.json(), statusCode: missingLeave.status },
        removedJoin: { body: await removedJoin.json(), statusCode: removedJoin.status },
        unknownJoin: { body: await unknownJoin.json(), statusCode: unknownJoin.status },
        unknownLeave: { body: await unknownLeave.json(), statusCode: unknownLeave.status },
      },
      {
        leftLeave: {
          body: { status: "rejected", reason: "membership_left" },
          statusCode: 409,
        },
        missingLeave: {
          body: { status: "rejected", reason: "membership_missing" },
          statusCode: 409,
        },
        removedJoin: {
          body: { status: "rejected", reason: "membership_removed" },
          statusCode: 409,
        },
        unknownJoin: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
        unknownLeave: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("effectiveParticipation_shouldCheckSessionIdentity_whenIdentityIdIsAbsent", async () => {
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
      "student-membership-1",
      "student-event-1",
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
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const student = await fetch(`${baseUrl}/programs/program-1/participation/student`, {
      headers: { cookie: bootstrap.cookie },
    });
    const curator = await fetch(`${baseUrl}/programs/program-1/participation/program_curator`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        curator: { body: await curator.json(), statusCode: curator.status },
        student: { body: await student.json(), statusCode: student.status },
      },
      {
        curator: {
          body: {
            status: "accepted",
            value: {
              allowed: true,
              identityId: "identity-1",
              participationKind: "program_curator",
              programId: "program-1",
            },
          },
          statusCode: 200,
        },
        student: {
          body: {
            status: "accepted",
            value: {
              allowed: true,
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
            },
          },
          statusCode: 200,
        },
      },
    );
  } finally {
    await close();
  }
});

test("effectiveParticipation_shouldRequireAdminOrCurator_forOtherIdentity", async () => {
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
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "audit-4",
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
    const created = await fetch(`${baseUrl}/identity/identities`, {
      body: JSON.stringify({ displayName: "Second Identity" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondIdentityId = (await created.json()).value.id;
    await fetch(`${baseUrl}/identity/identities/${secondIdentityId}/local-password`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "correct horse battery staple",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondLogin = await fetch(`${baseUrl}/identity/sessions`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "correct horse battery staple",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const secondCookie = secondLogin.headers.get("set-cookie").split(";", 1)[0];

    const ordinary = await fetch(
      `${baseUrl}/programs/program-1/participation/student?identityId=identity-1`,
      { headers: { cookie: secondCookie } },
    );
    const admin = await fetch(
      `${baseUrl}/programs/program-1/participation/student?identityId=${secondIdentityId}`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const curator = await fetch(
      `${baseUrl}/programs/program-1/participation/student?identityId=${secondIdentityId}`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        admin: { body: await admin.json(), statusCode: admin.status },
        curator: { body: await curator.json(), statusCode: curator.status },
        ordinary: { body: await ordinary.json(), statusCode: ordinary.status },
      },
      {
        admin: {
          body: {
            status: "accepted",
            value: {
              allowed: false,
              identityId: "identity-2",
              participationKind: "student",
              programId: "program-1",
              reason: "membership_missing",
            },
          },
          statusCode: 200,
        },
        curator: {
          body: {
            status: "accepted",
            value: {
              allowed: false,
              identityId: "identity-2",
              participationKind: "student",
              programId: "program-1",
              reason: "membership_missing",
            },
          },
          statusCode: 200,
        },
        ordinary: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
      },
    );
  } finally {
    await close();
  }
});

test("effectiveParticipation_shouldAllowNonAdminCurator_forOtherIdentity", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "audit-4",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
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
    const secondIdentityId = (await created.json()).value.id;
    await fetch(`${baseUrl}/identity/identities/${secondIdentityId}/local-password`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "correct horse battery staple",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondLogin = await fetch(`${baseUrl}/identity/sessions`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "correct horse battery staple",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const secondLoginBody = await secondLogin.json();
    const secondCookie = secondLogin.headers.get("set-cookie").split(";", 1)[0];
    const createdProgram = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: secondCookie,
        "content-type": "application/json",
        "x-agonara-csrf": secondLoginBody.value.csrfToken,
      },
      method: "POST",
    });
    const programId = (await createdProgram.json()).value.program.programId;
    const adminProbe = await fetch(`${baseUrl}/identity/identities`, {
      headers: { cookie: secondCookie },
    });
    const participation = await fetch(
      `${baseUrl}/programs/${programId}/participation/student?identityId=identity-1`,
      { headers: { cookie: secondCookie } },
    );

    assert.deepEqual(
      {
        adminProbe: { body: await adminProbe.json(), statusCode: adminProbe.status },
        participation: { body: await participation.json(), statusCode: participation.status },
      },
      {
        adminProbe: {
          body: { status: "rejected", reason: "admin_required" },
          statusCode: 403,
        },
        participation: {
          body: {
            status: "accepted",
            value: {
              allowed: false,
              identityId: "identity-1",
              participationKind: "student",
              programId,
              reason: "membership_missing",
            },
          },
          statusCode: 200,
        },
      },
    );
  } finally {
    await close();
  }
});

test("effectiveParticipation_shouldHandleInvalidInputsAndRemainReadOnly", async () => {
  const { baseUrl, close, database } = await listenWithIdentityAndProgram({
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
    const eventCountBefore = listProgramMembershipEventRecords(database).length;
    const unknownIdentity = await fetch(
      `${baseUrl}/programs/program-1/participation/student?identityId=identity-ghost`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const unsupportedKind = await fetch(`${baseUrl}/programs/program-1/participation/mentor`, {
      headers: { cookie: bootstrap.cookie },
    });
    const unknownProgram = await fetch(`${baseUrl}/programs/program-ghost/participation/student`, {
      headers: { cookie: bootstrap.cookie },
    });
    const eventCountAfter = listProgramMembershipEventRecords(database).length;

    assert.deepEqual(
      {
        eventCountAfter,
        eventCountBefore,
        unknownIdentity: {
          body: await unknownIdentity.json(),
          statusCode: unknownIdentity.status,
        },
        unknownProgram: {
          body: await unknownProgram.json(),
          statusCode: unknownProgram.status,
        },
        unsupportedKind: {
          body: await unsupportedKind.json(),
          statusCode: unsupportedKind.status,
        },
      },
      {
        eventCountAfter: eventCountBefore,
        eventCountBefore,
        unknownIdentity: {
          body: {
            status: "accepted",
            value: {
              allowed: false,
              identityId: "identity-ghost",
              participationKind: "student",
              programId: "program-1",
              reason: "identity_not_active",
            },
          },
          statusCode: 200,
        },
        unknownProgram: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
        unsupportedKind: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
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
