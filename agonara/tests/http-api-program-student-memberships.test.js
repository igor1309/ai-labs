import assert from "node:assert/strict";
import test from "node:test";
import {
  listProgramMembershipEventRecords,
  updateProgramMembershipStatus,
} from "../src/storage.js";
import {
  bootstrapAdmin,
  listenWithIdentityAndProgram,
} from "./support/http-api.js";

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
