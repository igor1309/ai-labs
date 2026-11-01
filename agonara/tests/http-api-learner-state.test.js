import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapAdmin,
  createAcceptedNavigationCandidate,
  createAcceptedQuickCheck,
  createIdentitySession,
  createProgram,
  deleteJson,
  getJson,
  joinStudentProgram,
  listenWithIdentityProgramCorpusAndStudentWorkspace,
  manyIds,
  postJson,
  submitQuickCheckAttempt,
} from "./support/http-api.js";

test("learnerStateTargetLinkRoutes_shouldRequireCuratorSessionAndCsrf", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(120),
  });

  try {
    const scenario = await createLearnerStateHttpScenario(baseUrl);
    const createBody = {
      evidenceOwnerEntityId: scenario.acceptedQuickCheck.entityId,
      evidenceOwnerKind: "accepted_quick_check",
      targetId: scenario.topic.entityId,
      targetKind: "topic",
    };
    const missingSessionList = await getJson(
      `${baseUrl}/programs/${scenario.programId}/learner-state-target-links`,
    );
    const missingCsrfCreate = await postJson(
      `${baseUrl}/programs/${scenario.programId}/learner-state-target-links`,
      createBody,
      { cookie: scenario.curator.cookie },
    );
    const studentCreate = await postJson(
      `${baseUrl}/programs/${scenario.programId}/learner-state-target-links`,
      createBody,
      { cookie: scenario.student.cookie, csrfToken: scenario.student.csrfToken },
    );
    const malformedCreate = await postJson(
      `${baseUrl}/programs/${scenario.programId}/learner-state-target-links`,
      { ...createBody, targetKind: "quick_check" },
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const unsupportedEvidenceOwnerKind = await postJson(
      `${baseUrl}/programs/${scenario.programId}/learner-state-target-links`,
      { ...createBody, evidenceOwnerKind: "accepted_navigation_entity" },
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const missingEvidenceOwner = await postJson(
      `${baseUrl}/programs/${scenario.programId}/learner-state-target-links`,
      { ...createBody, evidenceOwnerEntityId: "quick-check-missing" },
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const created = await postJson(
      `${baseUrl}/programs/${scenario.programId}/learner-state-target-links`,
      createBody,
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const duplicate = await postJson(
      `${baseUrl}/programs/${scenario.programId}/learner-state-target-links`,
      createBody,
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const listedBeforeDelete = await getJson(
      `${baseUrl}/programs/${scenario.programId}/learner-state-target-links`,
      { cookie: scenario.curator.cookie },
    );
    const linkId = created.body.value?.learnerStateTargetLink.linkId ?? "missing-link";
    const missingCsrfDelete = await deleteJson(`${baseUrl}/learner-state-target-links/${linkId}`, {
      cookie: scenario.curator.cookie,
    });
    const deleted = await deleteJson(`${baseUrl}/learner-state-target-links/${linkId}`, {
      cookie: scenario.curator.cookie,
      csrfToken: scenario.curator.csrfToken,
    });
    const listedAfterDelete = await getJson(
      `${baseUrl}/programs/${scenario.programId}/learner-state-target-links`,
      { cookie: scenario.curator.cookie },
    );

    assert.deepEqual(
      {
        created: learnerStateTargetLinkResponseProjection(created),
        deleted: learnerStateTargetLinkResponseProjection(deleted),
        duplicateLinkId: duplicate.body.value?.learnerStateTargetLink.linkId,
        listedAfterDelete: learnerStateTargetLinkListProjection(listedAfterDelete),
        listedBeforeDelete: learnerStateTargetLinkListProjection(listedBeforeDelete),
        malformedCreate: { body: malformedCreate.body, statusCode: malformedCreate.statusCode },
        missingEvidenceOwner: { body: missingEvidenceOwner.body, statusCode: missingEvidenceOwner.statusCode },
        missingCsrfCreate: { body: missingCsrfCreate.body, statusCode: missingCsrfCreate.statusCode },
        missingCsrfDelete: { body: missingCsrfDelete.body, statusCode: missingCsrfDelete.statusCode },
        missingSessionList: { body: missingSessionList.body, statusCode: missingSessionList.statusCode },
        studentCreate: { body: studentCreate.body, statusCode: studentCreate.statusCode },
        unsupportedEvidenceOwnerKind: {
          body: unsupportedEvidenceOwnerKind.body,
          statusCode: unsupportedEvidenceOwnerKind.statusCode,
        },
      },
      {
        created: {
          evidenceOwnerKind: "accepted_quick_check",
          status: "accepted",
          statusCode: 200,
          targetKind: "topic",
        },
        deleted: {
          evidenceOwnerKind: "accepted_quick_check",
          status: "accepted",
          statusCode: 200,
          targetKind: "topic",
        },
        duplicateLinkId: linkId,
        listedAfterDelete: { linkCount: 0, status: "accepted", statusCode: 200 },
        listedBeforeDelete: { linkCount: 1, status: "accepted", statusCode: 200 },
        malformedCreate: { body: { status: "rejected", reason: "learner_state_target_not_found" }, statusCode: 404 },
        missingEvidenceOwner: {
          body: { status: "rejected", reason: "learner_state_evidence_owner_not_found" },
          statusCode: 404,
        },
        missingCsrfCreate: { body: { status: "rejected", reason: "csrf_required" }, statusCode: 403 },
        missingCsrfDelete: { body: { status: "rejected", reason: "csrf_required" }, statusCode: 403 },
        missingSessionList: { body: { status: "rejected", reason: "session_not_found" }, statusCode: 401 },
        studentCreate: { body: { status: "rejected", reason: "admin_or_curator_required" }, statusCode: 403 },
        unsupportedEvidenceOwnerKind: {
          body: { status: "rejected", reason: "learner_state_evidence_owner_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("learnerStateRoutes_shouldReturnOwnerSummaryTargetDetailAndRedactProtectedFields", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(140),
  });

  try {
    const scenario = await createLearnerStateHttpScenario(baseUrl);
    await createLearnerStateTargetLink(baseUrl, scenario.curator, scenario.programId, {
      evidenceOwnerEntityId: scenario.acceptedQuickCheck.entityId,
      evidenceOwnerKind: "accepted_quick_check",
      targetId: scenario.topic.entityId,
      targetKind: "topic",
    });
    await submitQuickCheckAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedQuickCheck.revisionId,
        selectedOptionId: scenario.acceptedQuickCheck.answerKeyOptionId,
      },
      "learner-state-quick-key",
    );

    const summary = await getJson(`${baseUrl}/programs/${scenario.programId}/learner-state`, {
      cookie: scenario.student.cookie,
    });
    const detail = await getJson(
      `${baseUrl}/learner-state/targets/topic/${scenario.topic.entityId}`,
      { cookie: scenario.student.cookie },
    );
    const serialized = JSON.stringify([summary.body, detail.body]);

    assert.deepEqual(
      {
        detail: learnerStateTargetDetailProjection(detail),
        leaks: containsLearnerStateProtectedHttpDetail(serialized),
        summary: learnerStateProgramSummaryProjection(summary),
      },
      {
        detail: {
          evidenceKinds: ["quick_check_attempt"],
          evidenceSignals: ["positive"],
          level: "on_track",
          status: "accepted",
          statusCode: 200,
          targetKind: "topic",
        },
        leaks: false,
        summary: {
          level: "on_track",
          status: "accepted",
          statusCode: 200,
          topicLevels: ["on_track"],
          weakAreaCount: 0,
        },
      },
    );
  } finally {
    await close();
  }
});

test("learnerStateRoutes_shouldHideUnavailableTargetsAndRejectUnauthorizedReaders", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(120),
  });

  try {
    const scenario = await createLearnerStateHttpScenario(baseUrl);
    const curatorSummary = await getJson(`${baseUrl}/programs/${scenario.programId}/learner-state`, {
      cookie: scenario.curator.cookie,
    });
    const curatorDetail = await getJson(
      `${baseUrl}/learner-state/targets/topic/${scenario.topic.entityId}`,
      { cookie: scenario.curator.cookie },
    );
    const unsupportedTarget = await getJson(
      `${baseUrl}/learner-state/targets/definition/${scenario.topic.entityId}`,
      { cookie: scenario.student.cookie },
    );
    const missingTarget = await getJson(`${baseUrl}/learner-state/targets/topic/target-missing`, {
      cookie: scenario.student.cookie,
    });
    const missingSessionSummary = await getJson(`${baseUrl}/programs/${scenario.programId}/learner-state`);

    assert.deepEqual(
      {
        curatorDetail: { body: curatorDetail.body, statusCode: curatorDetail.statusCode },
        curatorSummary: { body: curatorSummary.body, statusCode: curatorSummary.statusCode },
        missingSessionSummary: { body: missingSessionSummary.body, statusCode: missingSessionSummary.statusCode },
        missingTarget: { body: missingTarget.body, statusCode: missingTarget.statusCode },
        unsupportedTarget: { body: unsupportedTarget.body, statusCode: unsupportedTarget.statusCode },
      },
      {
        curatorDetail: {
          body: { status: "rejected", reason: "learner_state_target_not_found" },
          statusCode: 404,
        },
        curatorSummary: { body: { status: "rejected", reason: "participation_required" }, statusCode: 403 },
        missingSessionSummary: { body: { status: "rejected", reason: "session_not_found" }, statusCode: 401 },
        missingTarget: {
          body: { status: "rejected", reason: "learner_state_target_not_found" },
          statusCode: 404,
        },
        unsupportedTarget: {
          body: { status: "rejected", reason: "learner_state_target_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

async function createLearnerStateHttpScenario(baseUrl) {
  const bootstrap = await bootstrapAdmin(baseUrl);
  const curator = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Curator",
    login: "learner-state-curator@example.test",
  });
  const student = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Student",
    login: "learner-state-student@example.test",
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

async function createLearnerStateTargetLink(baseUrl, session, programId, body) {
  return postJson(`${baseUrl}/programs/${programId}/learner-state-target-links`, body, {
    cookie: session.cookie,
    csrfToken: session.csrfToken,
  });
}

function learnerStateTargetLinkResponseProjection(response) {
  const link = response.body.value?.learnerStateTargetLink;
  return {
    status: response.body.status,
    statusCode: response.statusCode,
    targetKind: link?.targetKind,
    evidenceOwnerKind: link?.evidenceOwnerKind,
  };
}

function learnerStateTargetLinkListProjection(response) {
  return {
    status: response.body.status,
    statusCode: response.statusCode,
    linkCount: response.body.value?.learnerStateTargetLinks.length,
  };
}

function learnerStateProgramSummaryProjection(response) {
  const learnerState = response.body.value?.learnerState;
  return {
    status: response.body.status,
    statusCode: response.statusCode,
    level: learnerState?.level,
    topicLevels: learnerState?.topics.map($0 => $0.level),
    weakAreaCount: learnerState?.weakAreas.length,
  };
}

function learnerStateTargetDetailProjection(response) {
  const target = response.body.value?.learnerStateTarget;
  return {
    status: response.body.status,
    statusCode: response.statusCode,
    targetKind: target?.targetKind,
    level: target?.level,
    evidenceKinds: target?.evidence.map($0 => $0.sourceKind),
    evidenceSignals: target?.evidence.map($0 => $0.signal),
  };
}

function containsLearnerStateProtectedHttpDetail(serialized) {
  return [
    "answerKey",
    "answer_key",
    "acceptedFromCandidateId",
    "candidateId",
    "createdByIdentityId",
    "curator rationale",
    "idempotency",
    "learner-state-quick-key",
    "session-1",
    "csrf-token",
    "cookie",
    "authorization",
    "raw prompt",
    "raw model",
    "evaluator diagnostics",
    "select ",
    "stack",
    "postgres://",
    "/tmp/",
  ].some($0 => serialized.includes($0));
}
