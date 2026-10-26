import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  runCli,
  installPackage,
  runPackagedCli,
  startHttp,
  bootstrapHttp,
  createHttpIdentitySession,
  postJson,
  deleteJson,
  deleteSession,
  getJson,
  fetchJson,
  jsonHeaders,
  closeIfListening,
  makeWorkspace,
  removeWorkspace,
} from "./support/executable-acceptance.js";

test("acceptance_shouldBootstrapThroughCliAndUseHttpSession_onCleanInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const bootstrap = runCli(
      ["identity", "bootstrap-admin", "--display-name", "Root Admin", "--login", "admin@example.test", "--stdin-json", "--json"],
      {
        dbPath,
        input: JSON.stringify({
          bootstrapSecret: "operator-secret",
          password: "correct horse battery staple",
        }),
      },
    );
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const login = await postJson(`${baseUrl}/identity/sessions`, {
        login: "admin@example.test",
        password: "correct horse battery staple",
      });
      const session = await getJson(`${baseUrl}/identity/session`, { cookie: login.cookie });
      const logout = await deleteSession(baseUrl, {
        cookie: login.cookie,
        csrfToken: session.body.value.csrfToken,
      });
      const afterLogout = await getJson(`${baseUrl}/identity/session`, { cookie: login.cookie });
      const responseText = JSON.stringify({
        bootstrap: bootstrap.stdout,
        login: login.body,
        session: session.body,
        logout: logout.body,
      });
      const loginSessionId = login.cookie?.replace("agonara_session=", "");

      assert.deepEqual(
        {
          bootstrapStatus: bootstrap.status,
          bootstrapBodyStatus: bootstrap.body.status,
          loginStatus: login.statusCode,
          sessionStatus: session.statusCode,
          logoutStatus: logout.statusCode,
          afterLogoutBody: afterLogout.body,
          leaksSecret: responseText.includes("operator-secret"),
          leaksPassword: responseText.includes("correct horse battery staple"),
          leaksPasswordHash: responseText.includes("scrypt$"),
          leaksSessionId: loginSessionId ? responseText.includes(loginSessionId) : true,
        },
        {
          bootstrapStatus: 0,
          bootstrapBodyStatus: "accepted",
          loginStatus: 200,
          sessionStatus: 200,
          logoutStatus: 200,
          afterLogoutBody: { status: "rejected", reason: "session_revoked" },
          leaksSecret: false,
          leaksPassword: false,
          leaksPasswordHash: false,
          leaksSessionId: false,
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});

test("acceptance_shouldExposeCliThroughPackageBin_onInstalledPackage", () => {
  const workspace = makeWorkspace();

  try {
    installPackage(workspace);
    const packagedBootstrapStatus = runPackagedCli(workspace, ["identity", "bootstrap-status", "--json"], {
      dbPath: join(workspace, "agonara.sqlite"),
    });

    assert.deepEqual(
      {
        status: packagedBootstrapStatus.status,
        body: packagedBootstrapStatus.body,
        stderr: packagedBootstrapStatus.stderr,
      },
      {
        status: 0,
        body: { status: "accepted", value: { available: true } },
        stderr: "",
      },
    );
  } finally {
    removeWorkspace(workspace);
  }
});

test("acceptance_shouldRejectSecondCliBootstrap_onHttpBootstrappedInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const bootstrap = await bootstrapHttp(baseUrl);
      await close();
      const cliBootstrap = runCli(
        [
          "identity",
          "bootstrap-admin",
          "--display-name",
          "Second Admin",
          "--login",
          "second@example.test",
          "--stdin-json",
          "--json",
        ],
        {
          dbPath,
          input: JSON.stringify({
            bootstrapSecret: "operator-secret",
            password: "another correct horse",
          }),
        },
      );

      assert.deepEqual(
        {
          httpBootstrapStatus: bootstrap.statusCode,
          cliStatus: cliBootstrap.status,
          cliBody: cliBootstrap.body,
          cliStderr: cliBootstrap.stderr,
        },
        {
          httpBootstrapStatus: 200,
          cliStatus: 2,
          cliBody: { status: "rejected", reason: "bootstrap_already_completed" },
          cliStderr: "",
        },
      );
    } finally {
      await closeIfListening(close);
    }
  } finally {
    removeWorkspace(workspace);
  }
});

test("acceptance_shouldExerciseAdminAndCsrfFlows_onHttpInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const bootstrap = await bootstrapHttp(baseUrl);
      const missingCsrf = await postJson(
        `${baseUrl}/identity/identities`,
        { displayName: "Second Identity" },
        { cookie: bootstrap.cookie },
      );
      const created = await postJson(
        `${baseUrl}/identity/identities`,
        { displayName: "Second Identity" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const secondIdentityId = created.body.value.id;
      const credential = await postJson(
        `${baseUrl}/identity/identities/${secondIdentityId}/local-password`,
        {
          login: "student@example.test",
          password: "correct horse battery staple",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const secondLogin = await postJson(`${baseUrl}/identity/sessions`, {
        login: "student@example.test",
        password: "correct horse battery staple",
      });
      const nonAdminList = await getJson(`${baseUrl}/identity/identities`, { cookie: secondLogin.cookie });
      const grantAdmin = await postJson(
        `${baseUrl}/identity/identities/${secondIdentityId}/admin`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const secondAdminList = await getJson(`${baseUrl}/identity/identities`, { cookie: secondLogin.cookie });
      const revokeSecondAdmin = await deleteJson(
        `${baseUrl}/identity/identities/${secondIdentityId}/admin`,
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const revokeLastAdmin = await deleteJson(
        `${baseUrl}/identity/identities/${bootstrap.body.value.identity.id}/admin`,
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const audit = await getJson(`${baseUrl}/identity/audit-events`, { cookie: bootstrap.cookie });
      const diagnostics = await getJson(`${baseUrl}/operations/diagnostics`, { cookie: bootstrap.cookie });
      const auditText = JSON.stringify(audit.body);

      assert.deepEqual(
        {
          missingCsrf: missingCsrf.body,
          createdStatus: created.statusCode,
          credentialBody: credential.body,
          nonAdminList: nonAdminList.body,
          grantAdminIsAdmin: grantAdmin.body.value.isAdmin,
          secondAdminListStatus: secondAdminList.statusCode,
          revokeSecondAdminIsAdmin: revokeSecondAdmin.body.value.isAdmin,
          revokeLastAdmin: revokeLastAdmin.body,
          auditStatus: audit.statusCode,
          auditContainsTargetSessionId: auditText.includes("targetSessionId"),
          diagnosticsStatus: diagnostics.statusCode,
        },
        {
          missingCsrf: { status: "rejected", reason: "csrf_required" },
          createdStatus: 200,
          credentialBody: { status: "accepted", value: { credentialBound: true } },
          nonAdminList: { status: "rejected", reason: "admin_required" },
          grantAdminIsAdmin: true,
          secondAdminListStatus: 200,
          revokeSecondAdminIsAdmin: false,
          revokeLastAdmin: { status: "rejected", reason: "last_admin_removal" },
          auditStatus: 200,
          auditContainsTargetSessionId: false,
          diagnosticsStatus: 200,
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});

test("acceptance_shouldExerciseProgramMembershipApi_onHttpInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const bootstrap = await bootstrapHttp(baseUrl);
      const missingCreateCsrf = await postJson(
        `${baseUrl}/programs`,
        { title: "Linear Algebra" },
        { cookie: bootstrap.cookie },
      );
      const created = await postJson(
        `${baseUrl}/programs`,
        { description: "Foundations", title: "Linear Algebra" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const programId = created.body.value.program.programId;
      const programs = await getJson(`${baseUrl}/programs`, { cookie: bootstrap.cookie });
      const invalidJoinCsrf = await postJson(
        `${baseUrl}/programs/${programId}/student-membership`,
        {},
        { cookie: bootstrap.cookie, csrfToken: "invalid-csrf-token" },
      );
      const joined = await postJson(
        `${baseUrl}/programs/${programId}/student-membership`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const memberships = await getJson(`${baseUrl}/program-memberships/me`, {
        cookie: bootstrap.cookie,
      });
      const missingLeaveCsrf = await deleteJson(
        `${baseUrl}/programs/${programId}/student-membership`,
        { cookie: bootstrap.cookie },
      );
      const left = await deleteJson(`${baseUrl}/programs/${programId}/student-membership`, {
        cookie: bootstrap.cookie,
        csrfToken: bootstrap.body.value.csrfToken,
      });
      const rejoined = await postJson(
        `${baseUrl}/programs/${programId}/student-membership`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const studentParticipation = await getJson(
        `${baseUrl}/programs/${programId}/participation/student`,
        { cookie: bootstrap.cookie },
      );
      const curatorParticipation = await getJson(
        `${baseUrl}/programs/${programId}/participation/program_curator`,
        { cookie: bootstrap.cookie },
      );
      const programEvents = await getJson(`${baseUrl}/programs/${programId}/events`, {
        cookie: bootstrap.cookie,
      });
      const membershipEvents = await getJson(
        `${baseUrl}/programs/${programId}/membership-events`,
        { cookie: bootstrap.cookie },
      );
      const unscopedEvents = await getJson(`${baseUrl}/program-events`, {
        cookie: bootstrap.cookie,
      });

      assert.deepEqual(
        {
          created: {
            initialCuratorKind:
              created.body.value.initialCuratorMembership.participationKind,
            initialCuratorStatus: created.body.value.initialCuratorMembership.status,
            programIdType: typeof programId,
            statusCode: created.statusCode,
          },
          curatorParticipation: curatorParticipation.body.value.allowed,
          invalidJoinCsrf: invalidJoinCsrf.body,
          joined: {
            kind: joined.body.value.membership.participationKind,
            status: joined.body.value.membership.status,
            statusCode: joined.statusCode,
          },
          left: {
            status: left.body.value.membership.status,
            statusCode: left.statusCode,
          },
          memberships: memberships.body.value.memberships.map($0 => ({
            kind: $0.participationKind,
            status: $0.status,
          })),
          membershipEventTypes: membershipEvents.body.value.events.map($0 => $0.eventType),
          missingCreateCsrf: missingCreateCsrf.body,
          missingLeaveCsrf: missingLeaveCsrf.body,
          programEventTypes: programEvents.body.value.events.map($0 => $0.eventType),
          programs: programs.body.value.programs.map($0 => $0.programId),
          rejoined: {
            status: rejoined.body.value.membership.status,
            statusCode: rejoined.statusCode,
          },
          studentParticipation: studentParticipation.body.value.allowed,
          unscopedEvents: unscopedEvents.statusCode,
        },
        {
          created: {
            initialCuratorKind: "program_curator",
            initialCuratorStatus: "active",
            programIdType: "string",
            statusCode: 200,
          },
          curatorParticipation: true,
          invalidJoinCsrf: { status: "rejected", reason: "csrf_invalid" },
          joined: { kind: "student", status: "active", statusCode: 200 },
          left: { status: "left", statusCode: 200 },
          memberships: [
            { kind: "program_curator", status: "active" },
            { kind: "student", status: "active" },
          ],
          membershipEventTypes: [
            "initial_curator_membership_created",
            "student_membership_joined",
            "student_membership_left",
            "student_membership_rejoined",
          ],
          missingCreateCsrf: { status: "rejected", reason: "csrf_required" },
          missingLeaveCsrf: { status: "rejected", reason: "csrf_required" },
          programEventTypes: ["program_created"],
          programs: [programId],
          rejoined: { status: "active", statusCode: 200 },
          studentParticipation: true,
          unscopedEvents: 404,
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});

test("acceptance_shouldExerciseControlledProgramMembershipLifecycle_onHttpInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const admin = await bootstrapHttp(baseUrl);
      const student = await createHttpIdentitySession(baseUrl, admin, {
        displayName: "Program Student",
        login: "membership-student@example.test",
      });
      const created = await postJson(
        `${baseUrl}/programs`,
        { title: "Linear Algebra" },
        { cookie: admin.cookie, csrfToken: admin.body.value.csrfToken },
      );
      const programId = created.body.value.program.programId;
      const policy = await fetchJson(`${baseUrl}/programs/${programId}/admission-policy`, {
        body: JSON.stringify({ admissionPolicy: "invitation_only" }),
        headers: jsonHeaders({ cookie: admin.cookie, csrfToken: admin.body.value.csrfToken }),
        method: "PATCH",
      });
      const invited = await postJson(
        `${baseUrl}/programs/${programId}/invitations`,
        { participationKind: "student", targetIdentityId: student.body.value.identity.id },
        { cookie: admin.cookie, csrfToken: admin.body.value.csrfToken },
      );
      const invitationId = invited.body.value.invitation.invitationId;
      const accepted = await postJson(
        `${baseUrl}/program-invitations/${invitationId}/acceptance`,
        {},
        { cookie: student.cookie, csrfToken: student.body.value.csrfToken },
      );
      const removed = await deleteJson(
        `${baseUrl}/programs/${programId}/participants/student/${student.body.value.identity.id}`,
        { cookie: admin.cookie, csrfToken: admin.body.value.csrfToken },
      );
      const recovered = await postJson(
        `${baseUrl}/admin/program-memberships/recovery`,
        {
          participationKind: "student",
          programId,
          recoveryReason: "repair access",
          targetIdentityId: student.body.value.identity.id,
        },
        { cookie: admin.cookie, csrfToken: admin.body.value.csrfToken },
      );
      const revoked = await postJson(
        `${baseUrl}/admin/program-memberships/revocation`,
        {
          participationKind: "student",
          programId,
          revocationReason: "invalid operational state",
          targetIdentityId: student.body.value.identity.id,
        },
        { cookie: admin.cookie, csrfToken: admin.body.value.csrfToken },
      );
      const events = await getJson(`${baseUrl}/programs/${programId}/membership-events`, {
        cookie: admin.cookie,
      });

      assert.deepEqual(
        {
          accepted: accepted.body.value.membership.status,
          eventTypes: events.body.value.events.map($0 => $0.eventType).sort(),
          policy: policy.body.value.program.admissionPolicy,
          recovered: recovered.body.value.membership.status,
          removed: removed.body.value.membership.status,
          revoked: revoked.body.value.membership.status,
        },
        {
          accepted: "active",
          eventTypes: [
            "initial_curator_membership_created",
            "membership_exceptionally_recovered",
            "membership_exceptionally_revoked",
            "program_admission_policy_changed",
            "student_invitation_created",
            "student_invitation_accepted",
            "student_membership_joined",
            "student_membership_removed",
          ].sort(),
          policy: "invitation_only",
          recovered: "active",
          removed: "removed",
          revoked: "removed",
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});
