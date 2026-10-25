import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapAdmin,
  createIdentitySession,
  createProgram,
  deleteJson,
  fetchJson,
  getJson,
  listenWithIdentityAndProgram,
  manyIds,
  postJson,
} from "./support/http-api.js";

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

test("programMembershipControlRoutes_shouldExerciseControlledInvitationAndRecoveryLifecycle", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({ ids: manyIds(120) });

  try {
    const admin = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, admin, {
      displayName: "Program Curator",
      login: "membership-curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, admin, {
      displayName: "Program Student",
      login: "membership-student@example.test",
    });
    const createdProgram = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const policy = await fetchJson(`${baseUrl}/programs/${programId}/admission-policy`, {
      body: JSON.stringify({ admissionPolicy: "invitation_only" }),
      headers: {
        cookie: curator.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": curator.csrfToken,
      },
      method: "PATCH",
    });
    const createdInvitation = await postJson(
      `${baseUrl}/programs/${programId}/invitations`,
      { participationKind: "student", targetIdentityId: student.identityId },
      { cookie: curator.cookie, csrfToken: curator.csrfToken },
    );
    const invitationId = createdInvitation.body.value?.invitation.invitationId;
    const curatorInvitations = await getJson(`${baseUrl}/programs/${programId}/invitations?status=pending`, {
      cookie: curator.cookie,
    });
    const studentInvitations = await getJson(`${baseUrl}/program-invitations/me?status=pending`, {
      cookie: student.cookie,
    });
    const accepted = await postJson(
      `${baseUrl}/program-invitations/${invitationId}/acceptance`,
      {},
      { cookie: student.cookie, csrfToken: student.csrfToken },
    );
    const participants = await getJson(`${baseUrl}/programs/${programId}/participants`, {
      cookie: curator.cookie,
    });
    const removed = await deleteJson(
      `${baseUrl}/programs/${programId}/participants/student/${student.identityId}`,
      { cookie: curator.cookie, csrfToken: curator.csrfToken },
    );
    const recovered = await postJson(
      `${baseUrl}/admin/program-memberships/recovery`,
      {
        participationKind: "student",
        programId,
        recoveryReason: "repair access",
        targetIdentityId: student.identityId,
      },
      { cookie: admin.cookie, csrfToken: admin.csrfToken },
    );
    const revoked = await postJson(
      `${baseUrl}/admin/program-memberships/revocation`,
      {
        participationKind: "student",
        programId,
        revocationReason: "invalid operational state",
        targetIdentityId: student.identityId,
      },
      { cookie: admin.cookie, csrfToken: admin.csrfToken },
    );

    assert.deepEqual(
      {
        accepted: {
          invitationStatus: accepted.body.value?.invitation.status,
          membershipStatus: accepted.body.value?.membership.status,
          statusCode: accepted.statusCode,
        },
        curatorInvitationIds: curatorInvitations.body.value?.invitations.map($0 => $0.invitationId),
        participantKinds: participants.body.value?.participants.map($0 => $0.participationKind),
        policy: policy.body.value?.program.admissionPolicy,
        recovered: recovered.body.value?.membership.status,
        removed: removed.body.value?.membership.status,
        revoked: revoked.body.value?.membership.status,
        studentInvitationIds: studentInvitations.body.value?.invitations.map($0 => $0.invitationId),
      },
      {
        accepted: { invitationStatus: "accepted", membershipStatus: "active", statusCode: 200 },
        curatorInvitationIds: [invitationId],
        participantKinds: ["program_curator", "student"],
        policy: "invitation_only",
        recovered: "active",
        removed: "removed",
        revoked: "removed",
        studentInvitationIds: [invitationId],
      },
    );
  } finally {
    await close();
  }
});

test("programInvitationRoutes_shouldPreservePrivateTargetErrorsAndCuratorAuthorization", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({ ids: manyIds(100) });

  try {
    const admin = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, admin, {
      displayName: "Program Curator",
      login: "private-curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, admin, {
      displayName: "Program Student",
      login: "private-student@example.test",
    });
    const outsider = await createIdentitySession(baseUrl, admin, {
      displayName: "Outsider",
      login: "private-outsider@example.test",
    });
    const createdProgram = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const invitation = await postJson(
      `${baseUrl}/programs/${programId}/invitations`,
      { participationKind: "student", targetIdentityId: student.identityId },
      { cookie: curator.cookie, csrfToken: curator.csrfToken },
    );
    const invitationId = invitation.body.value.invitation.invitationId;
    const outsiderAccept = await postJson(
      `${baseUrl}/program-invitations/${invitationId}/acceptance`,
      {},
      { cookie: outsider.cookie, csrfToken: outsider.csrfToken },
    );
    const outsiderDecline = await postJson(
      `${baseUrl}/program-invitations/${invitationId}/decline`,
      {},
      { cookie: outsider.cookie, csrfToken: outsider.csrfToken },
    );
    const studentCreate = await postJson(
      `${baseUrl}/programs/${programId}/invitations`,
      { participationKind: "student", targetIdentityId: outsider.identityId },
      { cookie: student.cookie, csrfToken: student.csrfToken },
    );
    const adminCreate = await postJson(
      `${baseUrl}/programs/${programId}/invitations`,
      { participationKind: "student", targetIdentityId: outsider.identityId },
      { cookie: admin.cookie, csrfToken: admin.csrfToken },
    );
    const adminList = await getJson(`${baseUrl}/programs/${programId}/invitations`, {
      cookie: admin.cookie,
    });

    assert.deepEqual(
      {
        adminCreate,
        adminList,
        outsiderAccept,
        outsiderDecline,
        studentCreate,
      },
      {
        adminCreate: {
          body: { status: "rejected", reason: "participation_required" },
          statusCode: 403,
        },
        adminList: {
          body: { status: "rejected", reason: "participation_required" },
          statusCode: 403,
        },
        outsiderAccept: {
          body: { status: "rejected", reason: "invitation_not_found" },
          statusCode: 404,
        },
        outsiderDecline: {
          body: { status: "rejected", reason: "invitation_not_found" },
          statusCode: 404,
        },
        studentCreate: {
          body: { status: "rejected", reason: "participation_required" },
          statusCode: 403,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programMembershipRoutes_shouldMapInvitationTransitionsValidationAndLastCuratorConflict", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({ ids: manyIds(120) });

  try {
    const admin = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, admin, {
      displayName: "Program Curator",
      login: "transition-curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, admin, {
      displayName: "Program Student",
      login: "transition-student@example.test",
    });
    const createdProgram = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const firstInvitation = await postJson(
      `${baseUrl}/programs/${programId}/invitations`,
      { participationKind: "student", targetIdentityId: student.identityId },
      { cookie: curator.cookie, csrfToken: curator.csrfToken },
    );
    const declined = await postJson(
      `${baseUrl}/program-invitations/${firstInvitation.body.value.invitation.invitationId}/decline`,
      {},
      { cookie: student.cookie, csrfToken: student.csrfToken },
    );
    const secondInvitation = await postJson(
      `${baseUrl}/programs/${programId}/invitations`,
      { participationKind: "student", targetIdentityId: student.identityId },
      { cookie: curator.cookie, csrfToken: curator.csrfToken },
    );
    const revoked = await postJson(
      `${baseUrl}/program-invitations/${secondInvitation.body.value.invitation.invitationId}/revocation`,
      {},
      { cookie: curator.cookie, csrfToken: curator.csrfToken },
    );
    const lastCurator = await deleteJson(`${baseUrl}/programs/${programId}/curator-membership`, {
      cookie: curator.cookie,
      csrfToken: curator.csrfToken,
    });
    const malformedInvitation = await postJson(
      `${baseUrl}/programs/${programId}/invitations`,
      { targetIdentityId: student.identityId },
      { cookie: curator.cookie, csrfToken: curator.csrfToken },
    );
    const unexpectedActionBody = await postJson(
      `${baseUrl}/program-invitations/${secondInvitation.body.value.invitation.invitationId}/revocation`,
      { unexpected: true },
      { cookie: curator.cookie, csrfToken: curator.csrfToken },
    );
    const invalidFilter = await getJson(`${baseUrl}/programs/${programId}/participants?status=unknown`, {
      cookie: curator.cookie,
    });
    const blankRecoveryReason = await postJson(
      `${baseUrl}/admin/program-memberships/recovery`,
      {
        participationKind: "student",
        programId,
        recoveryReason: " ",
        targetIdentityId: student.identityId,
      },
      { cookie: admin.cookie, csrfToken: admin.csrfToken },
    );

    assert.deepEqual(
      {
        blankRecoveryReason,
        declined: declined.body.value?.invitation.status,
        invalidFilter,
        lastCurator,
        malformedInvitation,
        revoked: revoked.body.value?.invitation.status,
        unexpectedActionBody,
      },
      {
        blankRecoveryReason: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
        declined: "declined",
        invalidFilter: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
        lastCurator: {
          body: { status: "rejected", reason: "last_curator_required" },
          statusCode: 409,
        },
        malformedInvitation: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
        revoked: "revoked",
        unexpectedActionBody: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programMembershipExceptionalRoutes_shouldRequireAdminAndProtectLastCurator", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({ ids: manyIds(160) });

  try {
    const admin = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, admin, {
      displayName: "Program Curator",
      login: "exceptional-curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, admin, {
      displayName: "Program Student",
      login: "exceptional-student@example.test",
    });
    const createdProgram = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const curatorRecovery = await postJson(
      `${baseUrl}/admin/program-memberships/recovery`,
      {
        participationKind: "student",
        programId,
        recoveryReason: "curator should not recover access",
        targetIdentityId: student.identityId,
      },
      { cookie: curator.cookie, csrfToken: curator.csrfToken },
    );
    const recovered = await postJson(
      `${baseUrl}/admin/program-memberships/recovery`,
      {
        participationKind: "student",
        programId,
        recoveryReason: "repair access",
        targetIdentityId: student.identityId,
      },
      { cookie: admin.cookie, csrfToken: admin.csrfToken },
    );
    const lastCuratorRevocation = await postJson(
      `${baseUrl}/admin/program-memberships/revocation`,
      {
        participationKind: "program_curator",
        programId,
        revocationReason: "invalid operational state",
        targetIdentityId: curator.identityId,
      },
      { cookie: admin.cookie, csrfToken: admin.csrfToken },
    );
    const events = await getJson(`${baseUrl}/programs/${programId}/membership-events`, {
      cookie: admin.cookie,
    });
    const recoveryEvent = events.body.value.events.find(
      $0 => $0.eventType === "membership_exceptionally_recovered" && $0.outcome === "accepted",
    );

    assert.deepEqual(
      {
        curatorRecovery,
        lastCuratorRevocation,
        recoveredStatus: recovered.body.value?.membership.status,
        recoveryEvent: {
          actorIdentityId: recoveryEvent.actorIdentityId,
          policyPath: recoveryEvent.policyPath,
          reason: recoveryEvent.reason,
          resultingStatus: recoveryEvent.resultingStatus,
          targetIdentityId: recoveryEvent.targetIdentityId,
        },
      },
      {
        curatorRecovery: {
          body: { status: "rejected", reason: "admin_required" },
          statusCode: 403,
        },
        lastCuratorRevocation: {
          body: { status: "rejected", reason: "last_curator_required" },
          statusCode: 409,
        },
        recoveredStatus: "active",
        recoveryEvent: {
          actorIdentityId: admin.body.value.identity.id,
          policyPath: "admin_exceptional_recovery",
          reason: "repair access",
          resultingStatus: "active",
          targetIdentityId: student.identityId,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programMembershipReadRoutes_shouldAllowAdminAndRedactProtectedData", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({ ids: manyIds(140) });

  try {
    const admin = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, admin, {
      displayName: "Program Curator",
      login: "redaction-curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, admin, {
      displayName: "Program Student",
      login: "redaction-student@example.test",
    });
    const createdProgram = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await fetchJson(`${baseUrl}/programs/${programId}/admission-policy`, {
      body: JSON.stringify({ admissionPolicy: "invitation_only" }),
      headers: {
        cookie: curator.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": curator.csrfToken,
      },
      method: "PATCH",
    });
    await postJson(
      `${baseUrl}/programs/${programId}/invitations`,
      { participationKind: "student", targetIdentityId: student.identityId },
      { cookie: curator.cookie, csrfToken: curator.csrfToken },
    );
    const adminParticipants = await getJson(`${baseUrl}/programs/${programId}/participants`, {
      cookie: admin.cookie,
    });
    const curatorInvitations = await getJson(`${baseUrl}/programs/${programId}/invitations`, {
      cookie: curator.cookie,
    });
    const studentParticipants = await getJson(`${baseUrl}/programs/${programId}/participants`, {
      cookie: student.cookie,
    });
    const invitationOnlySelfJoin = await postJson(
      `${baseUrl}/programs/${programId}/student-membership`,
      {},
      { cookie: student.cookie, csrfToken: student.csrfToken },
    );
    const responseText = JSON.stringify([adminParticipants.body, curatorInvitations.body]);

    assert.deepEqual(
      {
        adminParticipantKeys: Object.keys(adminParticipants.body.value.participants[0]).sort(),
        curatorInvitationKeys: Object.keys(curatorInvitations.body.value.invitations[0]).sort(),
        invitationOnlySelfJoin,
        redaction: {
          hasBootstrapSecret: responseText.includes("operator-secret"),
          hasCookie: responseText.includes(admin.cookie),
          hasCsrf: responseText.includes(admin.csrfToken),
          hasPassword: responseText.includes("NON_SECRET_TEST_VALUE"),
          hasSql: responseText.toLowerCase().includes("select "),
          hasStack: responseText.includes("Error:"),
        },
        studentParticipants,
      },
      {
        adminParticipantKeys: [
          "identityId",
          "participationKind",
          "programId",
          "status",
          "updatedAt",
        ],
        curatorInvitationKeys: [
          "createdAt",
          "invitationId",
          "invitedByIdentityId",
          "participationKind",
          "programId",
          "status",
          "targetIdentityId",
          "updatedAt",
        ],
        invitationOnlySelfJoin: {
          body: { status: "rejected", reason: "policy_not_satisfied" },
          statusCode: 409,
        },
        redaction: {
          hasBootstrapSecret: false,
          hasCookie: false,
          hasCsrf: false,
          hasPassword: false,
          hasSql: false,
          hasStack: false,
        },
        studentParticipants: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programMembershipMutationRoutes_shouldResolveSessionBeforeCsrf", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram();

  try {
    const routes = [
      ["POST", "/programs"],
      ["PATCH", "/programs/program-1/admission-policy"],
      ["POST", "/programs/program-1/invitations"],
      ["POST", "/program-invitations/invitation-1/acceptance"],
      ["POST", "/program-invitations/invitation-1/decline"],
      ["POST", "/program-invitations/invitation-1/revocation"],
      ["DELETE", "/programs/program-1/participants/student/identity-1"],
      ["DELETE", "/programs/program-1/curator-membership"],
      ["POST", "/programs/program-1/student-membership"],
      ["DELETE", "/programs/program-1/student-membership"],
      ["POST", "/admin/program-memberships/recovery"],
      ["POST", "/admin/program-memberships/revocation"],
    ];
    const invalidSessionResponses = [];
    for (const [method, path] of routes) {
      const response = await fetchJson(`${baseUrl}${path}`, {
        headers: {
          cookie: "agonara_session=unknown-session",
          "content-type": "application/json",
        },
        method,
      });
      invalidSessionResponses.push(response);
    }
    const admin = await bootstrapAdmin(baseUrl);
    const missingCsrfResponses = [];
    for (const [method, path] of routes) {
      const response = await fetchJson(`${baseUrl}${path}`, {
        headers: {
          cookie: admin.cookie,
          "content-type": "application/json",
        },
        method,
      });
      missingCsrfResponses.push(response);
    }

    assert.deepEqual(
      { invalidSessionResponses, missingCsrfResponses },
      {
        invalidSessionResponses: routes.map(() => ({
          body: { status: "rejected", reason: "session_not_found" },
          statusCode: 401,
        })),
        missingCsrfResponses: routes.map(() => ({
          body: { status: "rejected", reason: "csrf_required" },
          statusCode: 403,
        })),
      },
    );
  } finally {
    await close();
  }
});
