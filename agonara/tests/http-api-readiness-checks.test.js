import assert from "node:assert/strict";
import test from "node:test";
import { listReadinessCheckAttemptRecords } from "../src/storage.js";
import {
  bootstrapAdmin,
  createAcceptedNavigationCandidate,
  createAcceptedQuickCheck,
  createIdentitySession,
  createProgram,
  getHttpResponse,
  joinStudentProgram,
  listenWithIdentityProgramCorpusAndStudentWorkspace,
  manyIds,
  submitQuickCheckAttempt,
} from "./support/http-api.js";

test("listAcceptedReadinessChecksForCuration_shouldExposeCuratorListWithEntityAndRevision", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(180),
  });

  try {
    const scenario = await createReadinessHttpScenario(baseUrl);
    const created = await createReadinessCheckCandidate(baseUrl, scenario.curator, scenario.programId, {
      requirements: [{
        requiredLevel: "on_track",
        targetId: scenario.topic.entityId,
        targetKind: "topic",
      }],
      scope: { scopeKind: "topic", topicEntityId: scenario.topic.entityId },
      title: "Topic readiness",
    });
    const candidateId = (await created.json()).value.readinessCheckCandidate.candidateId;
    const accepted = await acceptReadinessCheckCandidate(baseUrl, scenario.curator, candidateId, {});
    const acceptedReadiness = (await accepted.json()).value.acceptedReadinessCheck;

    const listResponse = await fetch(`${baseUrl}/programs/${scenario.programId}/readiness-checks/curation`, {
      headers: { cookie: scenario.curator.cookie },
    });
    const listBody = await listResponse.json();
    const item = listBody.value?.acceptedReadinessChecks?.[0];

    assert.deepEqual(
      {
        statusCode: listResponse.status,
        entityId: item?.entityId,
        revisionId: item?.revisionId,
        programId: item?.programId,
        title: item?.title,
      },
      {
        statusCode: 200,
        entityId: acceptedReadiness.entityId,
        revisionId: acceptedReadiness.revisionId,
        programId: scenario.programId,
        title: "Topic readiness",
      },
    );
  } finally {
    await close();
  }
});

test("readinessCheckStatus_shouldRequireCsrfCuratorAndKeepHistoricalRevisionReadable", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(180),
  });

  try {
    const scenario = await createReadinessHttpScenario(baseUrl);
    const ordinary = await createIdentitySession(baseUrl, scenario.bootstrap, {
      displayName: "Ordinary Identity",
      login: "ordinary-readiness-status@example.test",
    });
    const readinessCheck = await createAcceptedReadinessCheck(
      baseUrl,
      scenario.curator,
      scenario.programId,
      scenario.topic.entityId,
      { title: "Withdrawn readiness" },
    );
    const missingCsrf = await fetch(`${baseUrl}/readiness-checks/${readinessCheck.entityId}/status`, {
      body: JSON.stringify({ status: "withdrawn" }),
      headers: {
        cookie: scenario.curator.cookie,
        "content-type": "application/json",
      },
      method: "PUT",
    });
    const nonCurator = await updateReadinessCheckStatus(baseUrl, ordinary, readinessCheck.entityId, {
      status: "withdrawn",
    });
    const invalid = await updateReadinessCheckStatus(baseUrl, scenario.curator, readinessCheck.entityId, {
      status: "retired",
    });
    const withdrawn = await updateReadinessCheckStatus(baseUrl, scenario.curator, readinessCheck.entityId, {
      status: "withdrawn",
    });
    const list = await fetch(`${baseUrl}/programs/${scenario.programId}/readiness-checks/curation`, {
      headers: { cookie: scenario.curator.cookie },
    });
    const detail = await fetch(`${baseUrl}/readiness-checks/revisions/${readinessCheck.revisionId}/curation`, {
      headers: { cookie: scenario.curator.cookie },
    });

    assert.deepEqual(
      {
        missingCsrf: { body: await missingCsrf.json(), statusCode: missingCsrf.status },
        nonCurator: { body: await nonCurator.json(), statusCode: nonCurator.status },
        invalid: { body: await invalid.json(), statusCode: invalid.status },
        withdrawn: { body: await withdrawn.json(), statusCode: withdrawn.status },
        list: readinessCurationListProjection(await list.json(), list.status),
        detail: readinessCurationProjection(await detail.json(), detail.status),
      },
      {
        missingCsrf: {
          body: { status: "rejected", reason: "csrf_required" },
          statusCode: 403,
        },
        nonCurator: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
        invalid: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
        withdrawn: {
          body: {
            status: "accepted",
            value: {
              entity: {
                id: readinessCheck.entityId,
                status: "withdrawn",
                updatedByIdentityId: scenario.curator.identityId,
                updatedAt: "2026-05-27T10:00:00.000Z",
              },
            },
          },
          statusCode: 200,
        },
        list: { statusCode: 200, titles: [] },
        detail: {
          requirementTargets: [["topic", scenario.topic.entityId, "on_track"]],
          statusCode: 200,
          title: "Withdrawn readiness",
        },
      },
    );
  } finally {
    await close();
  }
});

test("readinessHttpAcceptance_shouldCurateDeliverSubmitRetryReadListAndRedact", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(180),
  });

  try {
    const scenario = await createReadinessHttpScenario(baseUrl);
    const created = await createReadinessCheckCandidate(baseUrl, scenario.curator, scenario.programId, {
      rationale: "Curator-only rationale.",
      requirements: [{
        requiredLevel: "on_track",
        targetId: scenario.acceptedQuickCheck.entityId,
        targetKind: "quick_check",
      }],
      scope: { scopeKind: "topic", topicEntityId: scenario.topic.entityId },
      title: "Topic readiness",
    });
    const createdBody = await created.json();
    assert.equal(created.status, 200);
    const candidateId = createdBody.value.readinessCheckCandidate.candidateId;
    const listedCandidates = await fetch(`${baseUrl}/programs/${scenario.programId}/readiness-checks/candidates`, {
      headers: { cookie: scenario.curator.cookie },
    });
    const accepted = await acceptReadinessCheckCandidate(baseUrl, scenario.curator, candidateId, {});
    const acceptedBody = await accepted.json();
    const curation = await getHttpResponse(
      baseUrl,
      `/readiness-checks/revisions/${acceptedBody.value.acceptedReadinessCheck.revisionId}/curation`,
      scenario.curator,
    );
    const deliveries = await getHttpResponse(baseUrl, `/programs/${scenario.programId}/readiness-checks`, scenario.student);
    await submitQuickCheckAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedQuickCheck.revisionId,
        selectedOptionId: scenario.acceptedQuickCheck.answerKeyOptionId,
      },
      "readiness-quick-key",
    );
    const submitted = await submitReadinessCheckAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      { readinessCheckRevisionId: acceptedBody.value.acceptedReadinessCheck.revisionId },
      "readiness-attempt-key",
    );
    const submittedBody = await submitted.json();
    const retry = await submitReadinessCheckAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      { readinessCheckRevisionId: acceptedBody.value.acceptedReadinessCheck.revisionId },
      "readiness-attempt-key",
    );
    const attemptId = submittedBody.value.readinessCheckAttempt.attemptId;
    const detail = await getHttpResponse(baseUrl, `/readiness-check-attempts/${attemptId}`, scenario.student);
    const listedAttempts = await listReadinessCheckAttempts(
      baseUrl,
      scenario.student,
      scenario.programId,
      `readinessCheckRevisionId=${acceptedBody.value.acceptedReadinessCheck.revisionId}`,
    );
    const nonOwnerDetail = await getHttpResponse(baseUrl, `/readiness-check-attempts/${attemptId}`, scenario.otherStudent);
    const serializedStudentResponses = JSON.stringify([
      deliveries.body,
      submittedBody,
      await retry.clone().json(),
      detail.body,
      listedAttempts.body,
    ]);

    assert.deepEqual(
      {
        accepted: readinessCurationProjection(acceptedBody, accepted.status),
        attemptCount: listReadinessCheckAttemptRecords(database).length,
        curation: readinessCurationProjection(curation.body, curation.statusCode),
        deliveries: readinessDeliveryListProjection(deliveries.body, deliveries.statusCode),
        detail: readinessAttemptProjection(detail.body, detail.statusCode),
        hasStudentLeaks: containsReadinessStudentHttpLeaks(serializedStudentResponses),
        listedAttempts: readinessAttemptListProjection(listedAttempts.body, listedAttempts.statusCode),
        listedCandidates: readinessCandidateListProjection(await listedCandidates.json(), listedCandidates.status),
        nonOwnerDetail,
        retry: readinessAttemptProjection(await retry.json(), retry.status),
        submitted: readinessAttemptProjection(submittedBody, submitted.status),
      },
      {
        accepted: {
          requirementTargets: [["quick_check", scenario.acceptedQuickCheck.entityId, "on_track"]],
          statusCode: 200,
          title: "Topic readiness",
        },
        attemptCount: 1,
        curation: {
          requirementTargets: [["quick_check", scenario.acceptedQuickCheck.entityId, "on_track"]],
          statusCode: 200,
          title: "Topic readiness",
        },
        deliveries: {
          checks: [{
            requirementTargets: [["quick_check", scenario.acceptedQuickCheck.entityId, "on_track"]],
            title: "Topic readiness",
          }],
          statusCode: 200,
        },
        detail: {
          result: "ready",
          status: "accepted",
          statusCode: 200,
        },
        hasStudentLeaks: false,
        listedAttempts: {
          attempts: [[attemptId, "ready"]],
          status: "accepted",
          statusCode: 200,
        },
        listedCandidates: {
          statuses: ["draft"],
          statusCode: 200,
          titles: ["Topic readiness"],
        },
        nonOwnerDetail: {
          body: { status: "rejected", reason: "attempt_not_found" },
          statusCode: 404,
        },
        retry: {
          result: "ready",
          status: "accepted",
          statusCode: 200,
        },
        submitted: {
          result: "ready",
          status: "accepted",
          statusCode: 200,
        },
      },
    );
  } finally {
    await close();
  }
});

test("readinessHttpRoutes_shouldEnforceSessionCsrfIdempotencyValidationAndStatusMapping", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(130),
  });
  const conflictHarness = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(20),
    studentWorkspaceCommandsOverride: {
      submitReadinessCheckAttempt: () => ({ status: "rejected", reason: "idempotency_conflict" }),
    },
  });
  const faultHarness = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(20),
    studentWorkspaceCommandsOverride: {
      submitReadinessCheckAttempt: () => {
        throw new Error(
          "session-1 csrf-token-1 readiness-conflict-key cookie authorization raw prompt raw model provider diagnostics sql stack /tmp/db.sqlite postgres://db",
        );
      },
    },
  });

  try {
    const scenario = await createReadinessHttpScenario(baseUrl);
    const missingSessionDelivery = await fetch(`${baseUrl}/programs/${scenario.programId}/readiness-checks`);
    const invalidCandidate = await createReadinessCheckCandidate(baseUrl, scenario.curator, scenario.programId, {
      requirements: [],
      scope: { scopeKind: "topic", topicEntityId: scenario.topic.entityId },
      title: "Invalid readiness",
    });
    const missingCsrfCandidate = await fetch(`${baseUrl}/programs/${scenario.programId}/readiness-checks/candidates`, {
      body: JSON.stringify({
        requirements: [{
          requiredLevel: "on_track",
          targetId: scenario.acceptedQuickCheck.entityId,
          targetKind: "quick_check",
        }],
        scope: { scopeKind: "topic", topicEntityId: scenario.topic.entityId },
        title: "Missing csrf readiness",
      }),
      headers: {
        cookie: scenario.curator.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const studentCandidate = await createReadinessCheckCandidate(baseUrl, scenario.student, scenario.programId, {
      requirements: [{
        requiredLevel: "on_track",
        targetId: scenario.acceptedQuickCheck.entityId,
        targetKind: "quick_check",
      }],
      scope: { scopeKind: "topic", topicEntityId: scenario.topic.entityId },
      title: "Student readiness",
    });
    const validCandidate = await createReadinessCheckCandidate(baseUrl, scenario.curator, scenario.programId, {
      requirements: [{
        requiredLevel: "on_track",
        targetId: scenario.acceptedQuickCheck.entityId,
        targetKind: "quick_check",
      }],
      scope: { scopeKind: "topic", topicEntityId: scenario.topic.entityId },
      title: "Accepted readiness",
    });
    assert.equal(validCandidate.status, 200);
    const candidateId = (await validCandidate.json()).value.readinessCheckCandidate.candidateId;
    const missingAcceptCsrf = await fetch(`${baseUrl}/readiness-checks/candidates/${candidateId}/acceptance`, {
      body: JSON.stringify({}),
      headers: {
        cookie: scenario.curator.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const rejected = await rejectReadinessCheckCandidate(baseUrl, scenario.curator, candidateId, {});
    const acceptRejected = await acceptReadinessCheckCandidate(baseUrl, scenario.curator, candidateId, {});
    const noIdempotency = await fetch(`${baseUrl}/programs/${scenario.programId}/readiness-check-attempts`, {
      body: JSON.stringify({ readinessCheckRevisionId: "readiness-revision-missing" }),
      headers: {
        cookie: scenario.student.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": scenario.student.csrfToken,
      },
      method: "POST",
    });
    const invalidAttemptBody = await submitReadinessCheckAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      { readinessCheckRevisionId: "" },
      "invalid-readiness-attempt-key",
    );
    const conflictSession = await bootstrapAdmin(conflictHarness.baseUrl);
    const idempotencyConflict = await submitReadinessCheckAttempt(
      conflictHarness.baseUrl,
      conflictSession,
      "program-1",
      { readinessCheckRevisionId: "readiness-revision-1" },
      "readiness-conflict-key",
    );
    const faultSession = await bootstrapAdmin(faultHarness.baseUrl);
    const fault = await submitReadinessCheckAttempt(
      faultHarness.baseUrl,
      faultSession,
      "program-1",
      { readinessCheckRevisionId: "readiness-revision-1" },
      "readiness-fault-key",
    );
    const faultBody = await fault.json();

    assert.deepEqual(
      {
        acceptRejected: { body: await acceptRejected.json(), statusCode: acceptRejected.status },
        fault: {
          body: faultBody,
          hasLeaks: containsReadinessFaultLeaks(JSON.stringify(faultBody)),
          statusCode: fault.status,
        },
        idempotencyConflict: {
          body: await idempotencyConflict.json(),
          statusCode: idempotencyConflict.status,
        },
        invalidAttemptBody: { body: await invalidAttemptBody.json(), statusCode: invalidAttemptBody.status },
        invalidCandidate: { body: await invalidCandidate.json(), statusCode: invalidCandidate.status },
        missingAcceptCsrf: { body: await missingAcceptCsrf.json(), statusCode: missingAcceptCsrf.status },
        missingCsrfCandidate: { body: await missingCsrfCandidate.json(), statusCode: missingCsrfCandidate.status },
        missingSessionDelivery: {
          body: await missingSessionDelivery.json(),
          statusCode: missingSessionDelivery.status,
        },
        noIdempotency: { body: await noIdempotency.json(), statusCode: noIdempotency.status },
        rejected: { status: (await rejected.json()).value.readinessCheckCandidate.status, statusCode: rejected.status },
        studentCandidate: { body: await studentCandidate.json(), statusCode: studentCandidate.status },
      },
      {
        acceptRejected: {
          body: { status: "rejected", reason: "readiness_candidate_already_rejected" },
          statusCode: 409,
        },
        fault: {
          body: { status: "fault", reason: "internal_error" },
          hasLeaks: false,
          statusCode: 500,
        },
        idempotencyConflict: {
          body: { status: "rejected", reason: "idempotency_conflict" },
          statusCode: 409,
        },
        invalidAttemptBody: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
        invalidCandidate: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
        missingAcceptCsrf: {
          body: { status: "rejected", reason: "csrf_required" },
          statusCode: 403,
        },
        missingCsrfCandidate: {
          body: { status: "rejected", reason: "csrf_required" },
          statusCode: 403,
        },
        missingSessionDelivery: {
          body: { status: "rejected", reason: "session_not_found" },
          statusCode: 401,
        },
        noIdempotency: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
        rejected: { status: "rejected", statusCode: 200 },
        studentCandidate: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
      },
    );
  } finally {
    await close();
    await conflictHarness.close();
    await faultHarness.close();
  }
});

async function updateReadinessCheckStatus(baseUrl, session, entityId, body) {
  return fetch(`${baseUrl}/readiness-checks/${entityId}/status`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "PUT",
  });
}

async function createReadinessCheckCandidate(baseUrl, session, programId, body) {
  return fetch(`${baseUrl}/programs/${programId}/readiness-checks/candidates`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function acceptReadinessCheckCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/readiness-checks/candidates/${candidateId}/acceptance`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function rejectReadinessCheckCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/readiness-checks/candidates/${candidateId}/rejection`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function createAcceptedReadinessCheck(
  baseUrl,
  session,
  programId,
  topicEntityId,
  { title = "Topic readiness" } = {},
) {
  const created = await createReadinessCheckCandidate(baseUrl, session, programId, {
    requirements: [{
      requiredLevel: "on_track",
      targetId: topicEntityId,
      targetKind: "topic",
    }],
    scope: { scopeKind: "topic", topicEntityId },
    title,
  });
  const candidateId = (await created.json()).value.readinessCheckCandidate.candidateId;
  const accepted = await acceptReadinessCheckCandidate(baseUrl, session, candidateId, {});
  return (await accepted.json()).value.acceptedReadinessCheck;
}

async function createReadinessHttpScenario(baseUrl) {
  const bootstrap = await bootstrapAdmin(baseUrl);
  const curator = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Curator",
    login: "readiness-curator@example.test",
  });
  const student = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Student",
    login: "readiness-student@example.test",
  });
  const otherStudent = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Other Student",
    login: "readiness-other-student@example.test",
  });
  const createdProgram = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
  const programId = (await createdProgram.json()).value.program.programId;
  await joinStudentProgram(baseUrl, student, programId);
  await joinStudentProgram(baseUrl, otherStudent, programId);
  const topic = await createAcceptedNavigationCandidate(baseUrl, curator, programId, {
    candidateKind: "topic",
    title: "Vector spaces",
  });
  const acceptedQuickCheck = await createAcceptedQuickCheck(baseUrl, curator, programId, {
    answerKeyOptionIndex: 0,
    options: ["Closed under addition", "Only finite dimension"],
    title: "Closure check",
  });

  return { acceptedQuickCheck, bootstrap, curator, otherStudent, programId, student, topic };
}

async function submitReadinessCheckAttempt(baseUrl, session, programId, body, idempotencyKey) {
  return fetch(`${baseUrl}/programs/${programId}/readiness-check-attempts`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
      "x-agonara-idempotency-key": idempotencyKey,
    },
    method: "POST",
  });
}

async function listReadinessCheckAttempts(baseUrl, session, programId, query = "") {
  const separator = query ? "?" : "";
  const response = await fetch(`${baseUrl}/programs/${programId}/readiness-check-attempts${separator}${query}`, {
    headers: { cookie: session.cookie },
  });
  return { body: await response.json(), statusCode: response.status };
}

function readinessCandidateListProjection(body, statusCode) {
  return {
    statusCode,
    statuses: body.value?.readinessCheckCandidates?.map($0 => $0.status) ?? [],
    titles: body.value?.readinessCheckCandidates?.map($0 => $0.title) ?? [],
  };
}

function readinessCurationProjection(body, statusCode) {
  const readinessCheck = body.value?.acceptedReadinessCheck;
  return {
    requirementTargets: readinessCheck?.requirements?.map($0 => [
      $0.targetKind,
      $0.targetId,
      $0.requiredLevel,
    ]),
    statusCode,
    title: readinessCheck?.title,
  };
}

function readinessCurationListProjection(body, statusCode) {
  return {
    statusCode,
    titles: body.value?.acceptedReadinessChecks?.map($0 => $0.title) ?? [],
  };
}

function readinessDeliveryListProjection(body, statusCode) {
  return {
    checks: body.value?.readinessChecks?.map($0 => ({
      requirementTargets: $0.requirements.map(requirement => [
        requirement.targetKind,
        requirement.targetId,
        requirement.requiredLevel,
      ]),
      title: $0.title,
    })) ?? [],
    statusCode,
  };
}

function readinessAttemptProjection(body, statusCode) {
  const attempt = body.value?.readinessCheckAttempt;
  return {
    result: attempt?.result,
    status: body.status,
    statusCode,
  };
}

function readinessAttemptListProjection(body, statusCode) {
  return {
    attempts: body.value?.readinessCheckAttempts?.map($0 => [$0.attemptId, $0.result]) ?? [],
    status: body.status,
    statusCode,
  };
}

function containsReadinessStudentHttpLeaks(serialized) {
  return [
    "acceptedByIdentityId",
    "acceptedFromCandidateId",
    "answerKey",
    "candidateId",
    "correct",
    "csrf",
    "Curator-only rationale",
    "idempotency",
    "readiness-attempt-key",
    "readiness-quick-key",
    "rationale",
    "session-",
    "sourceIds",
  ].some($0 => serialized.includes($0));
}

function containsReadinessFaultLeaks(serialized) {
  return [
    "authorization",
    "cookie",
    "csrf-token-1",
    "postgres://db",
    "provider diagnostics",
    "raw model",
    "raw prompt",
    "readiness-fault-key",
    "select ",
    "session-1",
    "sql",
    "stack",
    "/tmp/db.sqlite",
  ].some($0 => serialized.includes($0));
}
