import assert from "node:assert/strict";
import test from "node:test";
import {
  listAcceptedAssessmentCriterionEntityRecords,
  listAcceptedAssessmentCriterionRevisionRecords,
  listAcceptedCorpusEntityRecords,
  listAcceptedCorpusRevisionRecords,
  listAcceptedOpenAnswerCheckEntityRecords,
  listAcceptedOpenAnswerCheckRevisionRecords,
  listAssessmentCriterionCandidateRecords,
  listCorpusEventRecords,
  listOpenAnswerAttemptRecords,
  listOpenAnswerCheckCandidateRecords,
  listProgramMembershipEventRecords,
  listProgramMembershipRecords,
  listProgramSourceRecords,
} from "../src/storage.js";
import {
  bootstrapAdmin,
  createAcceptedOpenAnswerCheck,
  createProgram,
  createStudentAttemptApiScenario,
  listenWithIdentityProgramCorpusAndStudentWorkspace,
  manyIds,
  openAnswerAttemptResponseProjection,
  submitOpenAnswerAttempt,
} from "./support/http-api.js";

test("openAnswerAttemptsCreate_shouldRejectMissingSession_withSessionNotFound", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace();

  try {
    const response = await fetch(`${baseUrl}/programs/program-1/open-answer-attempts`, {
      body: JSON.stringify({
        checkRevisionId: "check-revision-1",
        submittedAnswer: "Explain the invariant.",
      }),
      headers: {
        "content-type": "application/json",
        "x-agonara-idempotency-key": "attempt-key-1",
      },
      method: "POST",
    });

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

test("openAnswerAttemptsCreate_shouldRejectMissingAndInvalidCsrf_beforeSubmission", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const requestBody = JSON.stringify({
      checkRevisionId: "check-revision-1",
      submittedAnswer: "Explain the invariant.",
    });
    const missingCsrf = await fetch(`${baseUrl}/programs/program-1/open-answer-attempts`, {
      body: requestBody,
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-idempotency-key": "attempt-key-1",
      },
      method: "POST",
    });
    const invalidCsrf = await fetch(`${baseUrl}/programs/program-1/open-answer-attempts`, {
      body: requestBody,
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": "wrong-token",
        "x-agonara-idempotency-key": "attempt-key-1",
      },
      method: "POST",
    });

    assert.deepEqual(
      {
        missingCsrf: {
          statusCode: missingCsrf.status,
          body: await missingCsrf.json(),
        },
        invalidCsrf: {
          statusCode: invalidCsrf.status,
          body: await invalidCsrf.json(),
        },
      },
      {
        missingCsrf: {
          statusCode: 403,
          body: { status: "rejected", reason: "csrf_required" },
        },
        invalidCsrf: {
          statusCode: 403,
          body: { status: "rejected", reason: "csrf_invalid" },
        },
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsCreate_shouldRejectMalformedIdempotencyHeader_withValidationFailed", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const body = JSON.stringify({
      checkRevisionId: "check-revision-1",
      submittedAnswer: "Explain the invariant.",
    });
    const cases = [
      {},
      { "x-agonara-idempotency-key": "" },
      { "x-agonara-idempotency-key": "   " },
      { "x-agonara-idempotency-key": "a".repeat(256) },
    ];
    const results = [];
    for (const headers of cases) {
      const response = await fetch(`${baseUrl}/programs/program-1/open-answer-attempts`, {
        body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
          ...headers,
        },
        method: "POST",
      });
      results.push({
        statusCode: response.status,
        body: await response.json(),
      });
    }

    assert.deepEqual(
      results,
      cases.map(() => ({
        statusCode: 400,
        body: { status: "rejected", reason: "validation_failed" },
      })),
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsCreate_shouldRejectInvalidJsonBodies_beforeSubmission", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    studentWorkspaceCommandsOverride: {
      submitOpenAnswerAttempt: () => {
        throw new Error("submission command should not be called for invalid JSON bodies");
      },
    },
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const cases = [
      {},
      { body: "{" },
      { body: "[]" },
    ];
    const results = [];
    for (const item of cases) {
      const response = await fetch(`${baseUrl}/programs/program-1/open-answer-attempts`, {
        body: item.body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
          "x-agonara-idempotency-key": "attempt-key-1",
        },
        method: "POST",
      });
      results.push({
        statusCode: response.status,
        body: await response.json(),
      });
    }

    assert.deepEqual(
      results,
      cases.map(() => ({
        statusCode: 400,
        body: { status: "rejected", reason: "validation_failed" },
      })),
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptRoutes_shouldMapStudentWorkspaceRejections_toHttpStatuses", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    studentWorkspaceCommandsOverride: {
      submitOpenAnswerAttempt: ({ programId }) => ({ status: "rejected", reason: programId }),
    },
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const cases = [
      ["identity_not_active", 403],
      ["attempt_not_found", 404],
      ["check_revision_not_found", 404],
      ["check_revision_program_mismatch", 409],
      ["idempotency_conflict", 409],
    ];
    const results = [];
    for (const [reason] of cases) {
      const response = await fetch(`${baseUrl}/programs/${reason}/open-answer-attempts`, {
        body: JSON.stringify({
          checkRevisionId: "check-revision-1",
          submittedAnswer: "Explain the invariant.",
        }),
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
          "x-agonara-idempotency-key": "attempt-key-1",
        },
        method: "POST",
      });
      results.push({
        statusCode: response.status,
        body: await response.json(),
      });
    }

    assert.deepEqual(
      results,
      cases.map(([reason, statusCode]) => ({
        statusCode,
        body: { status: "rejected", reason },
      })),
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptRoutes_shouldRedactFaultResponses", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    studentWorkspaceCommandsOverride: {
      submitOpenAnswerAttempt: () => {
        throw new Error(
          "session-1 csrf-token-1 attempt-key-secret cookie authorization sql stack /tmp/db.sqlite",
        );
      },
    },
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs/program-1/open-answer-attempts`, {
      body: JSON.stringify({
        checkRevisionId: "check-revision-1",
        submittedAnswer: "Explain the invariant.",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
        "x-agonara-idempotency-key": "attempt-key-secret",
      },
      method: "POST",
    });
    const body = await response.json();
    const serialized = JSON.stringify(body);

    assert.deepEqual(
      {
        statusCode: response.status,
        body,
        hasLeaks: [
          "session-1",
          "csrf-token-1",
          "attempt-key-secret",
          "cookie",
          "authorization",
          "sql",
          "stack",
          "/tmp/db.sqlite",
        ].some($0 => serialized.includes($0)),
      },
      {
        statusCode: 500,
        body: { status: "fault", reason: "internal_error" },
        hasLeaks: false,
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsCreate_shouldReturnSubmittedAttempt_onEffectiveStudent", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(80),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const response = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "  Explain the invariant.  ",
      },
      "attempt-key-1",
    );
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        body: openAnswerAttemptResponseProjection(body),
        hasIdempotencyLeak: JSON.stringify(body).includes("attempt-key-1") ||
          JSON.stringify(body).includes("idempotency"),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          hasAttemptId: true,
          programId: scenario.programId,
          studentIdentityId: scenario.student.identityId,
          checkRevisionId: scenario.acceptedCheck.revisionId,
          criterionRevisionIds: scenario.acceptedCheck.criterionRevisionIds,
          submittedAnswer: "Explain the invariant.",
          attemptStatus: "submitted",
          submittedAt: "2026-05-27T10:00:00.000Z",
          updatedAt: "2026-05-27T10:00:00.000Z",
        },
        hasIdempotencyLeak: false,
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsCreate_shouldRejectInvalidSubmissionBodies_beforeSubmission", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(80),
    studentWorkspaceCommandsOverride: {
      submitOpenAnswerAttempt: () => {
        throw new Error("submission command should not be called for invalid submission bodies");
      },
    },
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const cases = [
      { submittedAnswer: "Answer" },
      { checkRevisionId: scenario.acceptedCheck.revisionId },
      { checkRevisionId: "", submittedAnswer: "Answer" },
      { checkRevisionId: "   ", submittedAnswer: "Answer" },
      { checkRevisionId: 42, submittedAnswer: "Answer" },
      { checkRevisionId: scenario.acceptedCheck.revisionId, submittedAnswer: "" },
      { checkRevisionId: scenario.acceptedCheck.revisionId, submittedAnswer: "   " },
      { checkRevisionId: scenario.acceptedCheck.revisionId, submittedAnswer: 42 },
      { checkRevisionId: scenario.acceptedCheck.revisionId, submittedAnswer: "Answer", extra: true },
    ];
    const results = [];
    for (const body of cases) {
      const response = await submitOpenAnswerAttempt(
        baseUrl,
        scenario.student,
        scenario.programId,
        body,
        "attempt-key-1",
      );
      results.push({
        statusCode: response.status,
        body: await response.json(),
      });
    }

    assert.deepEqual(
      results,
      cases.map(() => ({
        statusCode: 400,
        body: { status: "rejected", reason: "validation_failed" },
      })),
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsCreate_shouldMapDomainRejections_withSpecStatuses", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(140),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const otherProgram = await createProgram(baseUrl, scenario.bootstrap, { title: "Topology" });
    const otherProgramId = (await otherProgram.json()).value.program.programId;
    const otherAcceptedCheck = await createAcceptedOpenAnswerCheck(baseUrl, scenario.bootstrap, otherProgramId, {
      checkTitle: "Topology check",
      criterionTitle: "Topology criterion",
    });
    const cases = [
      {
        programId: "program-unknown",
        checkRevisionId: scenario.acceptedCheck.revisionId,
        reason: "program_not_found",
        statusCode: 404,
      },
      {
        programId: otherProgramId,
        checkRevisionId: otherAcceptedCheck.revisionId,
        reason: "participation_required",
        statusCode: 403,
      },
      {
        programId: scenario.programId,
        checkRevisionId: "check-revision-unknown",
        reason: "check_revision_not_found",
        statusCode: 404,
      },
      {
        programId: scenario.programId,
        checkRevisionId: otherAcceptedCheck.revisionId,
        reason: "check_revision_program_mismatch",
        statusCode: 409,
      },
    ];
    const results = [];
    for (const item of cases) {
      const response = await submitOpenAnswerAttempt(
        baseUrl,
        scenario.student,
        item.programId,
        {
          checkRevisionId: item.checkRevisionId,
          submittedAnswer: "Explain the invariant.",
        },
        "attempt-key-1",
      );
      results.push({
        statusCode: response.status,
        body: await response.json(),
      });
    }

    assert.deepEqual(
      results,
      cases.map($0 => ({
        statusCode: $0.statusCode,
        body: { status: "rejected", reason: $0.reason },
      })),
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsCreate_shouldReturnOriginalAttempt_onEquivalentRetry", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(80),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const first = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "Explain the invariant.",
      },
      "attempt-key-1",
    );
    const retried = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "Explain the invariant.",
      },
      "attempt-key-1",
    );
    const firstBody = await first.json();
    const retriedBody = await retried.json();

    assert.deepEqual(
      {
        firstStatusCode: first.status,
        retriedStatusCode: retried.status,
        sameAttemptId:
          firstBody.value?.attempt?.attemptId === retriedBody.value?.attempt?.attemptId,
        attemptCount: listOpenAnswerAttemptRecords(database).length,
      },
      {
        firstStatusCode: 200,
        retriedStatusCode: 200,
        sameAttemptId: true,
        attemptCount: 1,
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsCreate_shouldRejectConflictingIdempotencyReuse_withoutChangingAttempt", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(80),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "Original answer.",
      },
      "attempt-key-1",
    );
    const conflict = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "Changed answer.",
      },
      "attempt-key-1",
    );

    assert.deepEqual(
      {
        statusCode: conflict.status,
        body: await conflict.json(),
        attempts: listOpenAnswerAttemptRecords(database).map($0 => $0.submittedAnswer),
      },
      {
        statusCode: 409,
        body: { status: "rejected", reason: "idempotency_conflict" },
        attempts: ["Original answer."],
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsCreate_shouldLeaveAdjacentStateUnchanged_onAcceptedSubmission", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(80),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const before = adjacentAttemptSubmissionState(database);
    const response = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "Explain the invariant.",
      },
      "attempt-key-1",
    );
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        bodyStatus: body.status,
        hasAttemptId: typeof body.value?.attempt?.attemptId === "string",
        attemptCount: listOpenAnswerAttemptRecords(database).length,
        adjacentState: adjacentAttemptSubmissionState(database),
      },
      {
        statusCode: 200,
        bodyStatus: "accepted",
        hasAttemptId: true,
        attemptCount: 1,
        adjacentState: before,
      },
    );
  } finally {
    await close();
  }
});

function adjacentAttemptSubmissionState(database) {
  return {
    programSources: listProgramSourceRecords(database).map($0 => ({
      id: $0.id,
      programId: $0.programId,
      title: $0.title,
    })),
    assessmentCriterionCandidates: listAssessmentCriterionCandidateRecords(database).map($0 => ({
      id: $0.id,
      programId: $0.programId,
      status: $0.status,
    })),
    acceptedAssessmentCriterionEntities: listAcceptedAssessmentCriterionEntityRecords(database).map($0 => ({
      id: $0.id,
      programId: $0.programId,
      currentRevisionId: $0.currentRevisionId,
    })),
    acceptedAssessmentCriterionRevisions: listAcceptedAssessmentCriterionRevisionRecords(database).map($0 => ({
      id: $0.id,
      entityId: $0.entityId,
      programId: $0.programId,
    })),
    openAnswerCheckCandidates: listOpenAnswerCheckCandidateRecords(database).map($0 => ({
      id: $0.id,
      programId: $0.programId,
      status: $0.status,
    })),
    acceptedOpenAnswerCheckEntities: listAcceptedOpenAnswerCheckEntityRecords(database).map($0 => ({
      id: $0.id,
      programId: $0.programId,
      currentRevisionId: $0.currentRevisionId,
    })),
    acceptedOpenAnswerCheckRevisions: listAcceptedOpenAnswerCheckRevisionRecords(database).map($0 => ({
      id: $0.id,
      entityId: $0.entityId,
      programId: $0.programId,
      criterionRevisionIds: $0.criterionRevisionIds,
    })),
    acceptedCorpusEntities: listAcceptedCorpusEntityRecords(database).map($0 => ({
      id: $0.id,
      programId: $0.programId,
      currentRevisionId: $0.currentRevisionId,
    })),
    acceptedCorpusRevisions: listAcceptedCorpusRevisionRecords(database).map($0 => ({
      id: $0.id,
      entityId: $0.entityId,
      programId: $0.programId,
    })),
    corpusEvents: listCorpusEventRecords(database).map($0 => ({
      eventType: $0.eventType,
      outcome: $0.outcome,
      targetId: $0.targetId,
    })),
    programMemberships: listProgramMembershipRecords(database).map($0 => ({
      id: $0.id,
      identityId: $0.identityId,
      participationKind: $0.participationKind,
      status: $0.status,
    })),
    programMembershipEvents: listProgramMembershipEventRecords(database).map($0 => ({
      eventType: $0.eventType,
      identityId: $0.identityId,
      participationKind: $0.participationKind,
    })),
    sessions: database
      .prepare("select id, identity_id as identityId, revoked_at as revokedAt from sessions order by id")
      .all(),
  };
}
