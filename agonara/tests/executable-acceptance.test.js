import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startServer } from "../src/server.js";

const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const packagedCliPath = fileURLToPath(
  new URL(`../../node_modules/.bin/agonara${process.platform === "win32" ? ".cmd" : ""}`, import.meta.url),
);

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

test("acceptance_shouldExposeCliThroughWorkspaceBin_onInstalledWorkspace", () => {
  const workspace = makeWorkspace();

  try {
    const packagedBootstrapStatus = runPackagedCli(["identity", "bootstrap-status", "--json"], {
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

test("acceptance_shouldExerciseCorpusApi_onHttpInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const bootstrap = await bootstrapHttp(baseUrl);
      const student = await createHttpIdentitySession(baseUrl, bootstrap, {
        displayName: "Program Student",
        login: "student@example.test",
      });
      const missingProgramCsrf = await postJson(
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
      const missingSourceCsrf = await postJson(
        `${baseUrl}/programs/${programId}/sources`,
        { sourceKind: "textbook", title: "Linear Algebra Done Right" },
        { cookie: bootstrap.cookie },
      );
      const source = await postJson(
        `${baseUrl}/programs/${programId}/sources`,
        {
          citation: "Chapter 1",
          sourceKind: "textbook",
          title: "Linear Algebra Done Right",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const sourceId = source.body.value.programSource.sourceId;
      const missingCandidateCsrf = await postJson(
        `${baseUrl}/programs/${programId}/corpus-candidates`,
        {
          candidateKind: "topic",
          sourceIds: [sourceId],
          title: "Vector spaces",
        },
        { cookie: bootstrap.cookie },
      );
      const candidate = await postJson(
        `${baseUrl}/programs/${programId}/corpus-candidates`,
        {
          body: "A vector space is a set with compatible addition and scalar multiplication.",
          candidateKind: "topic",
          rationale: "Core foundation for the program.",
          sourceIds: [sourceId],
          title: "Vector spaces",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const candidateId = candidate.body.value.corpusCandidate.candidateId;
      const missingAcceptCsrf = await postJson(
        `${baseUrl}/corpus-candidates/${candidateId}/acceptance`,
        {},
        { cookie: bootstrap.cookie },
      );
      const firstAccepted = await postJson(
        `${baseUrl}/corpus-candidates/${candidateId}/acceptance`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const entityId = firstAccepted.body.value.acceptedCorpus.entityId;
      const historicalRevisionId = firstAccepted.body.value.acceptedCorpus.revisionId;
      const replacementCandidate = await postJson(
        `${baseUrl}/programs/${programId}/corpus-candidates`,
        {
          candidateKind: "topic",
          sourceIds: [sourceId],
          title: "Finite-dimensional vector spaces",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const replacementCandidateId = replacementCandidate.body.value.corpusCandidate.candidateId;
      const replaced = await postJson(
        `${baseUrl}/corpus-candidates/${replacementCandidateId}/acceptance`,
        { targetEntityId: entityId },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const draft = await postJson(
        `${baseUrl}/programs/${programId}/corpus-candidates`,
        {
          candidateKind: "topic",
          sourceIds: [sourceId],
          title: "Draft-only eigenvalues",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const rejectedDraft = await postJson(
        `${baseUrl}/programs/${programId}/corpus-candidates`,
        {
          candidateKind: "topic",
          sourceIds: [sourceId],
          title: "Rejected determinants",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const rejectedDraftId = rejectedDraft.body.value.corpusCandidate.candidateId;
      const missingRejectCsrf = await postJson(
        `${baseUrl}/corpus-candidates/${rejectedDraftId}/rejection`,
        {},
        { cookie: bootstrap.cookie },
      );
      const rejected = await postJson(
        `${baseUrl}/corpus-candidates/${rejectedDraftId}/rejection`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const studentJoin = await postJson(
        `${baseUrl}/programs/${programId}/student-membership`,
        {},
        { cookie: student.cookie, csrfToken: student.body.value.csrfToken },
      );
      const acceptedCorpus = await getJson(`${baseUrl}/programs/${programId}/accepted-corpus`, {
        cookie: student.cookie,
      });
      const historicalRevision = await getJson(`${baseUrl}/accepted-corpus-revisions/${historicalRevisionId}`, {
        cookie: student.cookie,
      });
      const corpusEvents = await getJson(`${baseUrl}/programs/${programId}/corpus-events`, {
        cookie: bootstrap.cookie,
      });
      const outOfScopeRoutes = [];
      for (const route of [
        "/corpus-events",
        `/programs/${programId}/corpus-events/ui`,
        `/programs/${programId}/corpus-events/ingestion`,
        `/programs/${programId}/corpus-events/llm`,
        `/programs/${programId}/corpus-events/student-workspace`,
        "/corpus-materials",
        "/corpus-cli",
        "/assessments",
      ]) {
        outOfScopeRoutes.push((await getJson(`${baseUrl}${route}`, { cookie: bootstrap.cookie })).statusCode);
      }

      assert.deepEqual(
        {
          acceptedCorpus: acceptedCorpus.body.value.acceptedCorpus.map($0 => ({
            acceptedFromCandidateId: $0.acceptedFromCandidateId,
            sourceIds: $0.sourceIds,
            title: $0.title,
          })),
          corpusEventTypes: corpusEvents.body.value.corpusEvents.map($0 => $0.eventType),
          currentRevisionIsNew: replaced.body.value.acceptedCorpus.revisionId !== historicalRevisionId,
          draftStatus: draft.body.value.corpusCandidate.status,
          historicalTitle: historicalRevision.body.value.acceptedCorpus.title,
          httpStatusCodes: {
            acceptedCorpus: acceptedCorpus.statusCode,
            candidate: candidate.statusCode,
            corpusEvents: corpusEvents.statusCode,
            created: created.statusCode,
            draft: draft.statusCode,
            firstAccepted: firstAccepted.statusCode,
            historicalRevision: historicalRevision.statusCode,
            missingAcceptCsrf: missingAcceptCsrf.statusCode,
            missingCandidateCsrf: missingCandidateCsrf.statusCode,
            missingProgramCsrf: missingProgramCsrf.statusCode,
            missingRejectCsrf: missingRejectCsrf.statusCode,
            missingSourceCsrf: missingSourceCsrf.statusCode,
            rejected: rejected.statusCode,
            rejectedDraft: rejectedDraft.statusCode,
            replaced: replaced.statusCode,
            replacementCandidate: replacementCandidate.statusCode,
            source: source.statusCode,
            studentJoin: studentJoin.statusCode,
          },
          missingAcceptCsrf: missingAcceptCsrf.body,
          missingCandidateCsrf: missingCandidateCsrf.body,
          missingProgramCsrf: missingProgramCsrf.body,
          missingRejectCsrf: missingRejectCsrf.body,
          missingSourceCsrf: missingSourceCsrf.body,
          outOfScopeRoutes,
          rejectedStatus: rejected.body.value.corpusCandidate.status,
        },
        {
          acceptedCorpus: [
            {
              acceptedFromCandidateId: replacementCandidateId,
              sourceIds: [sourceId],
              title: "Finite-dimensional vector spaces",
            },
          ],
          corpusEventTypes: [
            "program_source_recorded",
            "corpus_candidate_created",
            "corpus_candidate_accepted",
            "corpus_candidate_created",
            "corpus_candidate_accepted",
            "corpus_candidate_created",
            "corpus_candidate_created",
            "corpus_candidate_rejected",
          ],
          currentRevisionIsNew: true,
          draftStatus: "draft",
          historicalTitle: "Vector spaces",
          httpStatusCodes: {
            acceptedCorpus: 200,
            candidate: 200,
            corpusEvents: 200,
            created: 200,
            draft: 200,
            firstAccepted: 200,
            historicalRevision: 200,
            missingAcceptCsrf: 403,
            missingCandidateCsrf: 403,
            missingProgramCsrf: 403,
            missingRejectCsrf: 403,
            missingSourceCsrf: 403,
            rejected: 200,
            rejectedDraft: 200,
            replaced: 200,
            replacementCandidate: 200,
            source: 200,
            studentJoin: 200,
          },
          missingAcceptCsrf: { status: "rejected", reason: "csrf_required" },
          missingCandidateCsrf: { status: "rejected", reason: "csrf_required" },
          missingProgramCsrf: { status: "rejected", reason: "csrf_required" },
          missingRejectCsrf: { status: "rejected", reason: "csrf_required" },
          missingSourceCsrf: { status: "rejected", reason: "csrf_required" },
          outOfScopeRoutes: [404, 404, 404, 404, 404, 404, 404, 404],
          rejectedStatus: "rejected",
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});

test("acceptance_shouldExerciseAssessmentCorpusApi_onHttpInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      const bootstrap = await bootstrapHttp(baseUrl);
      const student = await createHttpIdentitySession(baseUrl, bootstrap, {
        displayName: "Program Student",
        login: "student@example.test",
      });
      const created = await postJson(
        `${baseUrl}/programs`,
        { title: "Linear Algebra" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const programId = created.body.value.program.programId;
      const source = await postJson(
        `${baseUrl}/programs/${programId}/sources`,
        { sourceKind: "textbook", title: "Linear Algebra Done Right" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const sourceId = source.body.value.programSource.sourceId;
      const missingCriterionCsrf = await postJson(
        `${baseUrl}/programs/${programId}/assessment-criteria/candidates`,
        { body: "Explain closure.", title: "Closure" },
        { cookie: bootstrap.cookie },
      );
      const criterionCandidate = await postJson(
        `${baseUrl}/programs/${programId}/assessment-criteria/candidates`,
        { body: "Explain closure.", sourceIds: [sourceId], title: "Closure" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const criterionCandidateId = criterionCandidate.body.value.assessmentCriterionCandidate.candidateId;
      const criterion = await postJson(
        `${baseUrl}/assessment-criteria/candidates/${criterionCandidateId}/acceptance`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const criterionEntityId = criterion.body.value.acceptedAssessmentCriterion.entityId;
      const historicalCriterionRevisionId = criterion.body.value.acceptedAssessmentCriterion.revisionId;
      const checkCandidate = await postJson(
        `${baseUrl}/programs/${programId}/open-answer-checks/candidates`,
        {
          checkKind: "open_answer",
          criterionEntityIds: [criterionEntityId],
          prompt: "Why is closure required?",
          sourceIds: [sourceId],
          title: "Closure check",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const checkCandidateId = checkCandidate.body.value.openAnswerCheckCandidate.candidateId;
      const check = await postJson(
        `${baseUrl}/open-answer-checks/candidates/${checkCandidateId}/acceptance`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const historicalCheckRevisionId = check.body.value.acceptedOpenAnswerCheck.revisionId;
      const revisedCriterionCandidate = await postJson(
        `${baseUrl}/programs/${programId}/assessment-criteria/candidates`,
        { body: "Explain closure under both operations.", sourceIds: [sourceId], title: "Closure revised" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      await postJson(
        `${baseUrl}/assessment-criteria/candidates/${revisedCriterionCandidate.body.value.assessmentCriterionCandidate.candidateId}/acceptance`,
        { targetEntityId: criterionEntityId },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const rejectedCriterionCandidate = await postJson(
        `${baseUrl}/programs/${programId}/assessment-criteria/candidates`,
        { body: "Rejected criterion.", title: "Rejected criterion" },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const rejectedCriterion = await postJson(
        `${baseUrl}/assessment-criteria/candidates/${rejectedCriterionCandidate.body.value.assessmentCriterionCandidate.candidateId}/rejection`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const rejectedCheckCandidate = await postJson(
        `${baseUrl}/programs/${programId}/open-answer-checks/candidates`,
        {
          checkKind: "open_answer",
          criterionEntityIds: [criterionEntityId],
          prompt: "Rejected prompt.",
          title: "Rejected check",
        },
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      const rejectedCheck = await postJson(
        `${baseUrl}/open-answer-checks/candidates/${rejectedCheckCandidate.body.value.openAnswerCheckCandidate.candidateId}/rejection`,
        {},
        { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
      );
      await postJson(
        `${baseUrl}/programs/${programId}/student-membership`,
        {},
        { cookie: student.cookie, csrfToken: student.body.value.csrfToken },
      );
      const acceptedCriteria = await getJson(`${baseUrl}/programs/${programId}/assessment-criteria`, {
        cookie: student.cookie,
      });
      const acceptedChecks = await getJson(`${baseUrl}/programs/${programId}/open-answer-checks`, {
        cookie: student.cookie,
      });
      const historicalCriterion = await getJson(
        `${baseUrl}/assessment-criteria/revisions/${historicalCriterionRevisionId}`,
        { cookie: student.cookie },
      );
      const historicalCheck = await getJson(`${baseUrl}/open-answer-checks/revisions/${historicalCheckRevisionId}`, {
        cookie: student.cookie,
      });
      const outOfScopeRoutes = [];
      for (const route of ["/assessments", "/student-workspace", "/assessment-feedback", "/assessment-cli"]) {
        outOfScopeRoutes.push((await getJson(`${baseUrl}${route}`, { cookie: student.cookie })).statusCode);
      }

      assert.deepEqual(
        {
          acceptedCriterionTitles: acceptedCriteria.body.value.acceptedAssessmentCriteria.map($0 => $0.title),
          acceptedCheckTitles: acceptedChecks.body.value.acceptedOpenAnswerChecks.map($0 => $0.title),
          historicalCriterionTitle: historicalCriterion.body.value.acceptedAssessmentCriterion.title,
          historicalCheckCriterionRevisionIds:
            historicalCheck.body.value.acceptedOpenAnswerCheck.criterionRevisionIds,
          httpStatusCodes: {
            acceptedChecks: acceptedChecks.statusCode,
            acceptedCriteria: acceptedCriteria.statusCode,
            historicalCheck: historicalCheck.statusCode,
            historicalCriterion: historicalCriterion.statusCode,
            missingCriterionCsrf: missingCriterionCsrf.statusCode,
          },
          missingCriterionCsrf: missingCriterionCsrf.body,
          outOfScopeRoutes,
          rejectedCheckStatus: rejectedCheck.body.value.openAnswerCheckCandidate.status,
          rejectedCriterionStatus: rejectedCriterion.body.value.assessmentCriterionCandidate.status,
        },
        {
          acceptedCriterionTitles: ["Closure revised"],
          acceptedCheckTitles: ["Closure check"],
          historicalCriterionTitle: "Closure",
          historicalCheckCriterionRevisionIds: [historicalCriterionRevisionId],
          httpStatusCodes: {
            acceptedChecks: 200,
            acceptedCriteria: 200,
            historicalCheck: 200,
            historicalCriterion: 200,
            missingCriterionCsrf: 403,
          },
          missingCriterionCsrf: { status: "rejected", reason: "csrf_required" },
          outOfScopeRoutes: [404, 404, 404, 404],
          rejectedCheckStatus: "rejected",
          rejectedCriterionStatus: "rejected",
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});

test("acceptance_shouldRateLimitLoginAndCorrelateHealthRequest_onHttpInstance", async () => {
  const workspace = makeWorkspace();

  try {
    const dbPath = join(workspace, "agonara.sqlite");
    const { baseUrl, close } = await startHttp(dbPath);

    try {
      await bootstrapHttp(baseUrl);
      let login;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        login = await postJson(`${baseUrl}/identity/sessions`, {
          login: "admin@example.test",
          password: "wrong horse battery staple",
        });
      }
      const health = await fetch(`${baseUrl}/operations/health`, {
        headers: { "x-request-id": "acceptance-request" },
      });
      const healthBody = await health.json();

      assert.deepEqual(
        {
          loginStatus: login.statusCode,
          loginBody: login.body,
          healthStatus: health.status,
          healthHeader: health.headers.get("x-request-id"),
          healthBodyRequestId: healthBody.requestId,
        },
        {
          loginStatus: 429,
          loginBody: { status: "rejected", reason: "rate_limited" },
          healthStatus: 200,
          healthHeader: "acceptance-request",
          healthBodyRequestId: "acceptance-request",
        },
      );
    } finally {
      await close();
    }
  } finally {
    removeWorkspace(workspace);
  }
});

function runCli(args, { dbPath, input }) {
  return runCommand(process.execPath, [cliPath, ...args], { dbPath, input });
}

function runPackagedCli(args, { dbPath, input = "" }) {
  return runCommand(packagedCliPath, args, { dbPath, input });
}

function runCommand(command, args, { dbPath, input }) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      AGONARA_BOOTSTRAP_SECRET: "operator-secret",
      AGONARA_DB_PATH: dbPath,
    },
    input,
  });
  if (result.error) {
    throw result.error;
  }

  return {
    body: result.stdout ? JSON.parse(result.stdout) : null,
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

async function startHttp(dbPath) {
  const server = startServer({
    bootstrapSecret: "operator-secret",
    databasePath: dbPath,
    host: "127.0.0.1",
    log: () => {},
    port: "0",
  });
  await waitForListening(server);
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

async function bootstrapHttp(baseUrl) {
  return await postJson(`${baseUrl}/identity/bootstrap/admin`, {
    bootstrapSecret: "operator-secret",
    displayName: "Root Admin",
    login: "admin@example.test",
    password: "correct horse battery staple",
  });
}

async function createHttpIdentitySession(baseUrl, bootstrap, { displayName, login }) {
  const created = await postJson(
    `${baseUrl}/identity/identities`,
    { displayName },
    { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
  );
  const identityId = created.body.value.id;
  await postJson(
    `${baseUrl}/identity/identities/${identityId}/local-password`,
    {
      login,
      password: "correct horse battery staple",
    },
    { cookie: bootstrap.cookie, csrfToken: bootstrap.body.value.csrfToken },
  );

  return await postJson(`${baseUrl}/identity/sessions`, {
    login,
    password: "correct horse battery staple",
  });
}

async function postJson(url, body, { cookie = null, csrfToken = null } = {}) {
  return await fetchJson(url, {
    body: JSON.stringify(body),
    headers: jsonHeaders({ cookie, csrfToken }),
    method: "POST",
  });
}

async function deleteJson(url, { cookie, csrfToken }) {
  return await fetchJson(url, {
    headers: jsonHeaders({ cookie, csrfToken }),
    method: "DELETE",
  });
}

async function deleteSession(baseUrl, { cookie, csrfToken }) {
  return await deleteJson(`${baseUrl}/identity/session`, { cookie, csrfToken });
}

async function getJson(url, { cookie = null } = {}) {
  return await fetchJson(url, {
    headers: cookie ? { cookie } : {},
  });
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  return {
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";", 1)[0] ?? null,
    statusCode: response.status,
  };
}

function jsonHeaders({ cookie, csrfToken }) {
  return {
    ...(cookie ? { cookie } : {}),
    "content-type": "application/json",
    ...(csrfToken ? { "x-agonara-csrf": csrfToken } : {}),
  };
}

function waitForListening(server) {
  if (server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server) {
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

async function closeIfListening(close) {
  try {
    await close();
  } catch (error) {
    if (error.code !== "ERR_SERVER_NOT_RUNNING") {
      throw error;
    }
  }
}

function makeWorkspace() {
  return mkdtempSync(join(tmpdir(), "agonara-acceptance-"));
}

function removeWorkspace(workspace) {
  rmSync(workspace, { force: true, recursive: true });
}
