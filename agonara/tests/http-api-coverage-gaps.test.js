import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapAdmin,
  createAcceptedNavigationCandidate,
  createAcceptedQuickCheck,
  createIdentitySession,
  createProgram,
  getJson,
  joinStudentProgram,
  listenWithIdentityProgramCorpusAndCuratorWorkspace,
  manyIds,
} from "./support/http-api.js";

test("coverageGapsHttp_shouldReturnFilteredRedactedReport_onProgramCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndCuratorWorkspace({
    ids: manyIds(120),
  });

  try {
    const scenario = await createCoverageGapsHttpScenario(baseUrl);
    const programReport = await getJson(
      `${baseUrl}/programs/${scenario.programId}/coverage-gaps?minimumSeverity=warning&gapKind=topic_without_checks&gapKind=check_without_target_links`,
      { cookie: scenario.curator.cookie },
    );
    const topicReport = await getJson(
      `${baseUrl}/programs/${scenario.programId}/coverage-gaps?scopeKind=topic&scopeId=${scenario.topic.entityId}&minimumSeverity=critical`,
      { cookie: scenario.curator.cookie },
    );
    const serialized = JSON.stringify([programReport.body, topicReport.body]);

    assert.deepEqual(
      {
        leaks: containsCoverageGapProtectedHttpDetail(serialized),
        programReport: coverageGapReportProjection(programReport),
        topicReport: coverageGapReportProjection(topicReport),
      },
      {
        leaks: false,
        programReport: {
          gaps: [
            ["critical", "topic_without_checks", "topic", "Vector spaces", "draft_guidance"],
            ["warning", "check_without_target_links", "quick_check", "Closure check", "draft_guidance"],
          ],
          scopeId: undefined,
          scopeKind: "program",
          status: "accepted",
          statusCode: 200,
        },
        topicReport: {
          gaps: [["critical", "topic_without_checks", "topic", "Vector spaces", "draft_guidance"]],
          scopeId: scenario.topic.entityId,
          scopeKind: "topic",
          status: "accepted",
          statusCode: 200,
        },
      },
    );
  } finally {
    await close();
  }
});

test("coverageGapsHttp_shouldEnforceSessionCuratorValidationAndPrivateErrors", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndCuratorWorkspace({
    ids: manyIds(120),
  });

  try {
    const scenario = await createCoverageGapsHttpScenario(baseUrl);
    const missingSession = await getJson(`${baseUrl}/programs/${scenario.programId}/coverage-gaps`);
    const studentRead = await getJson(`${baseUrl}/programs/${scenario.programId}/coverage-gaps`, {
      cookie: scenario.student.cookie,
    });
    const adminOnlyRead = await getJson(`${baseUrl}/programs/${scenario.programId}/coverage-gaps`, {
      cookie: scenario.bootstrap.cookie,
    });
    const invalidGapKind = await getJson(
      `${baseUrl}/programs/${scenario.programId}/coverage-gaps?gapKind=unsupported_gap`,
      { cookie: scenario.curator.cookie },
    );
    const programScopeId = await getJson(
      `${baseUrl}/programs/${scenario.programId}/coverage-gaps?scopeKind=program&scopeId=${scenario.topic.entityId}`,
      { cookie: scenario.curator.cookie },
    );
    const otherProgram = await createProgram(baseUrl, scenario.curator, { title: "Real Analysis" });
    const otherProgramId = (await otherProgram.json()).value.program.programId;
    const crossProgramScope = await getJson(
      `${baseUrl}/programs/${otherProgramId}/coverage-gaps?scopeKind=topic&scopeId=${scenario.topic.entityId}`,
      { cookie: scenario.curator.cookie },
    );
    const missingScope = await getJson(
      `${baseUrl}/programs/${scenario.programId}/coverage-gaps?scopeKind=topic&scopeId=topic-missing`,
      { cookie: scenario.curator.cookie },
    );

    assert.deepEqual(
      {
        adminOnlyRead: { body: adminOnlyRead.body, statusCode: adminOnlyRead.statusCode },
        crossProgramScope: { body: crossProgramScope.body, statusCode: crossProgramScope.statusCode },
        invalidGapKind: { body: invalidGapKind.body, statusCode: invalidGapKind.statusCode },
        missingScope: { body: missingScope.body, statusCode: missingScope.statusCode },
        missingSession: { body: missingSession.body, statusCode: missingSession.statusCode },
        programScopeId: { body: programScopeId.body, statusCode: programScopeId.statusCode },
        studentRead: { body: studentRead.body, statusCode: studentRead.statusCode },
      },
      {
        adminOnlyRead: { body: { status: "rejected", reason: "program_curator_required" }, statusCode: 403 },
        crossProgramScope: {
          body: { status: "rejected", reason: "coverage_gap_scope_not_found" },
          statusCode: 404,
        },
        invalidGapKind: { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
        missingScope: { body: { status: "rejected", reason: "coverage_gap_scope_not_found" }, statusCode: 404 },
        missingSession: { body: { status: "rejected", reason: "session_not_found" }, statusCode: 401 },
        programScopeId: { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
        studentRead: { body: { status: "rejected", reason: "program_curator_required" }, statusCode: 403 },
      },
    );
  } finally {
    await close();
  }
});

async function createCoverageGapsHttpScenario(baseUrl) {
  const bootstrap = await bootstrapAdmin(baseUrl);
  const curator = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Coverage Curator",
    login: "coverage-curator@example.test",
  });
  const student = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Coverage Student",
    login: "coverage-student@example.test",
  });
  const createdProgram = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
  const programId = (await createdProgram.json()).value.program.programId;
  await joinStudentProgram(baseUrl, student, programId);
  const topic = await createAcceptedNavigationCandidate(baseUrl, curator, programId, {
    candidateKind: "topic",
    title: "Vector spaces",
  });
  const acceptedQuickCheck = await createAcceptedQuickCheck(baseUrl, curator, programId, {
    answerKeyOptionIndex: 0,
    options: ["Closed under addition", "Only finite dimension"],
    title: "Closure check",
  });

  return { acceptedQuickCheck, bootstrap, curator, programId, student, topic };
}

function coverageGapReportProjection(response) {
  const report = response.body.value?.report;
  return {
    gaps: report?.gaps.map($0 => [$0.severity, $0.gapKind, $0.targetKind, $0.targetTitle, $0.status]) ?? [],
    scopeId: report?.scopeId,
    scopeKind: report?.scopeKind,
    status: response.body.status,
    statusCode: response.statusCode,
  };
}

function containsCoverageGapProtectedHttpDetail(values) {
  const serialized = JSON.stringify(values).toLowerCase();
  return [
    "answerkey",
    "acceptedfromcandidateid",
    "acceptedbyidentityid",
    "candidateid",
    "createdbyidentityid",
    "rationale",
    "idempotency",
    "selectedoptionid",
    "submittedanswer",
    "feedback",
    "coverage-curator@example.test",
    "session",
    "csrf",
    "cookie",
    "authorization",
    "raw prompt",
    "raw model",
    "provider",
    "select ",
    "stack",
    "/tmp",
    "postgres://",
    "database-url",
  ].some($0 => serialized.includes($0));
}
