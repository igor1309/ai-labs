import assert from "node:assert/strict";
import test from "node:test";
import { listProgramMembershipEventRecords } from "../src/storage.js";
import {
  bootstrapAdmin,
  listenWithIdentityAndProgram,
} from "./support/http-api.js";

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
