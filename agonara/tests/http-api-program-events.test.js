import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapAdmin,
  listenWithIdentityAndProgram,
} from "./support/http-api.js";

test("programEventRoutes_shouldRejectOrdinaryCallers", async () => {
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
        password: "NON_SECRET_TEST_VALUE",
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
        password: "NON_SECRET_TEST_VALUE",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const secondCookie = secondLogin.headers.get("set-cookie").split(";", 1)[0];
    const programEvents = await fetch(`${baseUrl}/programs/program-1/events`, {
      headers: { cookie: secondCookie },
    });
    const membershipEvents = await fetch(`${baseUrl}/programs/program-1/membership-events`, {
      headers: { cookie: secondCookie },
    });

    assert.deepEqual(
      {
        membershipEvents: {
          body: await membershipEvents.json(),
          statusCode: membershipEvents.status,
        },
        programEvents: { body: await programEvents.json(), statusCode: programEvents.status },
      },
      {
        membershipEvents: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
        programEvents: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programEventRoutes_shouldAcceptAdminAndNonAdminCurator_forKnownPrograms", async () => {
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
      "program-2",
      "membership-2",
      "program-event-2",
      "membership-event-2",
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
        password: "NON_SECRET_TEST_VALUE",
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
        password: "NON_SECRET_TEST_VALUE",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const secondLoginBody = await secondLogin.json();
    const secondCookie = secondLogin.headers.get("set-cookie").split(";", 1)[0];
    const secondProgram = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Calculus" }),
      headers: {
        cookie: secondCookie,
        "content-type": "application/json",
        "x-agonara-csrf": secondLoginBody.value.csrfToken,
      },
      method: "POST",
    });
    const secondProgramId = (await secondProgram.json()).value.program.programId;
    const adminEvents = await fetch(`${baseUrl}/programs/program-1/events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const curatorEvents = await fetch(`${baseUrl}/programs/${secondProgramId}/membership-events`, {
      headers: { cookie: secondCookie },
    });
    const unknownProgram = await fetch(`${baseUrl}/programs/program-ghost/events`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        adminEvents: { body: await adminEvents.json(), statusCode: adminEvents.status },
        curatorEvents: { body: await curatorEvents.json(), statusCode: curatorEvents.status },
        unknownProgram: { body: await unknownProgram.json(), statusCode: unknownProgram.status },
      },
      {
        adminEvents: {
          body: {
            status: "accepted",
            value: {
              events: [
                {
                  actorIdentityId: "identity-1",
                  eventType: "program_created",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  programEventId: "program-event-1",
                  programId: "program-1",
                },
              ],
            },
          },
          statusCode: 200,
        },
        curatorEvents: {
          body: {
            status: "accepted",
            value: {
              events: [
                {
                  actorIdentityId: "identity-2",
                  eventType: "initial_curator_membership_created",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  participationKind: "program_curator",
                  programId: secondProgramId,
                  programMembershipEventId: "membership-event-2",
                  resultingStatus: "active",
                  targetIdentityId: "identity-2",
                },
              ],
            },
          },
          statusCode: 200,
        },
        unknownProgram: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programEventRoutes_shouldPaginateScopedEvents", async () => {
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
      "membership-event-2",
      "membership-event-3",
      "membership-event-4",
      "program-2",
      "membership-2",
      "program-event-2",
      "membership-event-5",
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
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Calculus" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const firstPage = await fetch(`${baseUrl}/programs/program-1/membership-events?limit=2`, {
      headers: { cookie: bootstrap.cookie },
    });
    const firstPageBody = await firstPage.json();
    const secondPage = await fetch(
      `${baseUrl}/programs/program-1/membership-events?limit=2&cursor=${firstPageBody.value.nextCursor}`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const programEvents = await fetch(`${baseUrl}/programs/program-1/events`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        firstPage: {
          eventProgramIds: firstPageBody.value.events.map($0 => $0.programId),
          eventTypes: firstPageBody.value.events.map($0 => $0.eventType),
          hasNextCursor: typeof firstPageBody.value.nextCursor === "string",
          statusCode: firstPage.status,
        },
        programEvents: { body: await programEvents.json(), statusCode: programEvents.status },
        secondPage: { body: await secondPage.json(), statusCode: secondPage.status },
      },
      {
        firstPage: {
          eventProgramIds: ["program-1", "program-1"],
          eventTypes: ["initial_curator_membership_created", "student_membership_joined"],
          hasNextCursor: true,
          statusCode: 200,
        },
        programEvents: {
          body: {
            status: "accepted",
            value: {
              events: [
                {
                  actorIdentityId: "identity-1",
                  eventType: "program_created",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  programEventId: "program-event-1",
                  programId: "program-1",
                },
              ],
            },
          },
          statusCode: 200,
        },
        secondPage: {
          body: {
            status: "accepted",
            value: {
              events: [
                {
                  actorIdentityId: "identity-1",
                  eventType: "student_membership_left",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  participationKind: "student",
                  programId: "program-1",
                  programMembershipEventId: "membership-event-3",
                  resultingStatus: "left",
                  targetIdentityId: "identity-1",
                },
                {
                  actorIdentityId: "identity-1",
                  eventType: "student_membership_rejoined",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  participationKind: "student",
                  policyPath: "self_join",
                  programId: "program-1",
                  programMembershipEventId: "membership-event-4",
                  resultingStatus: "active",
                  targetIdentityId: "identity-1",
                },
              ],
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

test("programEventRoutes_shouldRejectInvalidQueriesAndRedactResponses", async () => {
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
      "membership-event-2",
      "membership-event-3",
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
    const validResponse = await fetch(`${baseUrl}/programs/program-1/membership-events?limit=1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const validText = await validResponse.text();
    const validBody = JSON.parse(validText);
    const invalidRequests = [];
    for (const query of ["limit=0", "limit=101", "limit=two", "cursor=not-a-cursor"]) {
      const response = await fetch(`${baseUrl}/programs/program-1/membership-events?${query}`, {
        headers: { cookie: bootstrap.cookie },
      });
      invalidRequests.push({ body: await response.json(), statusCode: response.status });
    }
    const unscopedProgramEvents = await fetch(`${baseUrl}/program-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const unscopedMembershipEvents = await fetch(`${baseUrl}/program-membership-events`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        invalidRequests,
        redaction: {
          hasAuthorization: validText.includes("authorization"),
          hasBootstrapSecret: validText.includes("operator-secret"),
          hasCookie: validText.includes("cookie"),
          hasCsrf: validText.includes(bootstrap.csrfToken),
          hasPassword: validText.includes("NON_SECRET_TEST_VALUE"),
          hasSession: validText.includes("session-1"),
          hasSql: validText.toLowerCase().includes("select "),
          hasStack: validText.includes("Error:"),
          nextCursorHasSecrets: [
            bootstrap.csrfToken,
            "cookie",
            "operator-secret",
            "select ",
            "session-1",
          ].some(secret => validBody.value.nextCursor?.includes(secret)),
        },
        unscopedMembershipEvents: unscopedMembershipEvents.status,
        unscopedProgramEvents: unscopedProgramEvents.status,
        validStatusCode: validResponse.status,
      },
      {
        invalidRequests: [
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
        ],
        redaction: {
          hasAuthorization: false,
          hasBootstrapSecret: false,
          hasCookie: false,
          hasCsrf: false,
          hasPassword: false,
          hasSession: false,
          hasSql: false,
          hasStack: false,
          nextCursorHasSecrets: false,
        },
        unscopedMembershipEvents: 404,
        unscopedProgramEvents: 404,
        validStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});
