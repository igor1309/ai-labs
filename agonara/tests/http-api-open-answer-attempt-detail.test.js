import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapAdmin,
  createIdentitySession,
  createStudentAttemptApiScenario,
  getHttpResponse,
  hasAttemptDetailLeak,
  joinStudentProgram,
  listenWithIdentityProgramCorpusAndStudentWorkspace,
  manyIds,
  openAnswerAttemptEvaluationProjection,
  submitOpenAnswerAttempt,
} from "./support/http-api.js";

test("openAnswerAttemptsGet_shouldRejectDisabledSessionIdentity_withIdentityDisabled", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramCorpusAndStudentWorkspace();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    database
      .prepare("update identities set state = 'disabled', disabled_at = ? where id = ?")
      .run("2026-05-27T10:00:00.000Z", bootstrap.body.value.identity.id);
    const response = await fetch(`${baseUrl}/open-answer-attempts/attempt-1`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 403,
        body: { status: "rejected", reason: "identity_disabled" },
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsGet_shouldReturnOwningStudentAttemptDetail", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(90),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const submitted = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "Explain the invariant.",
      },
      "attempt-key-1",
    );
    const submittedAttempt = (await submitted.json()).value.attempt;
    const detail = await getHttpResponse(
      baseUrl,
      `/open-answer-attempts/${submittedAttempt.attemptId}`,
      scenario.student,
    );

    assert.deepEqual(
      {
        statusCode: detail.statusCode,
        body: openAnswerAttemptDetailProjection(detail.body),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          attemptId: submittedAttempt.attemptId,
          programId: scenario.programId,
          studentIdentityId: scenario.student.identityId,
          checkRevisionId: scenario.acceptedCheck.revisionId,
          criterionRevisionIds: scenario.acceptedCheck.criterionRevisionIds,
          submittedAnswer: "Explain the invariant.",
          attemptStatus: "submitted",
          submittedAt: "2026-05-27T10:00:00.000Z",
          updatedAt: "2026-05-27T10:00:00.000Z",
        },
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsGet_shouldIncludeEvaluationDetail_onEvaluatedAttempt", async () => {
  const {
    baseUrl,
    close,
    studentWorkspaceCommands,
  } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(90),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const submitted = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "Explain the invariant.",
      },
      "attempt-key-1",
    );
    const submittedAttempt = (await submitted.json()).value.attempt;
    studentWorkspaceCommands.recordOpenAnswerEvaluation({
      attemptId: submittedAttempt.attemptId,
      criterionFeedback: scenario.acceptedCheck.criterionRevisionIds.map($0 => ({
        criterionRevisionId: $0,
        feedback: `Feedback for ${$0}.`,
        outcome: "met",
      })),
      evaluatorKind: "student_workspace",
      summaryFeedback: "The answer satisfies the accepted criteria.",
    });
    const detail = await getHttpResponse(
      baseUrl,
      `/open-answer-attempts/${submittedAttempt.attemptId}`,
      scenario.student,
    );

    assert.deepEqual(
      {
        statusCode: detail.statusCode,
        body: openAnswerAttemptEvaluationProjection(detail.body),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          attemptStatus: "evaluated",
          hasEvaluationId: true,
          evaluatorKind: "student_workspace",
          summaryFeedback: "The answer satisfies the accepted criteria.",
          criterionFeedback: scenario.acceptedCheck.criterionRevisionIds.map($0 => ({
            criterionRevisionId: $0,
            feedback: `Feedback for ${$0}.`,
            outcome: "met",
          })),
          evaluatedAt: "2026-05-27T10:00:00.000Z",
        },
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsGet_shouldIncludeActiveFailureDetail_onEvaluationFailedAttempt", async () => {
  const {
    baseUrl,
    close,
    studentWorkspaceCommands,
  } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(90),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const submitted = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "Explain the invariant.",
      },
      "attempt-key-1",
    );
    const submittedAttempt = (await submitted.json()).value.attempt;
    studentWorkspaceCommands.recordOpenAnswerEvaluationFailure({
      attemptId: submittedAttempt.attemptId,
      reason: "Evaluator timeout.",
    });
    const detail = await getHttpResponse(
      baseUrl,
      `/open-answer-attempts/${submittedAttempt.attemptId}`,
      scenario.student,
    );

    assert.deepEqual(
      {
        statusCode: detail.statusCode,
        body: openAnswerAttemptFailureProjection(detail.body),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          attemptStatus: "evaluation_failed",
          reason: "Evaluator timeout.",
          failedAt: "2026-05-27T10:00:00.000Z",
        },
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsGet_shouldRejectUnknownAttempt_withAttemptNotFound", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(90),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const detail = await getHttpResponse(
      baseUrl,
      "/open-answer-attempts/attempt-unknown",
      scenario.student,
    );

    assert.deepEqual(detail, {
      statusCode: 404,
      body: { status: "rejected", reason: "attempt_not_found" },
    });
  } finally {
    await close();
  }
});

test("openAnswerAttemptsGet_shouldRejectNonOwners_withAttemptNotFound", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(110),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const submitted = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "Explain the invariant.",
      },
      "attempt-key-1",
    );
    const attemptId = (await submitted.json()).value.attempt.attemptId;
    const otherStudent = await createIdentitySession(baseUrl, scenario.bootstrap, {
      displayName: "Other Student",
      login: "other-student@example.test",
    });
    await joinStudentProgram(baseUrl, otherStudent, scenario.programId);
    const ordinary = await createIdentitySession(baseUrl, scenario.bootstrap, {
      displayName: "Ordinary",
      login: "ordinary@example.test",
    });
    const callers = [otherStudent, scenario.curator, scenario.bootstrap, ordinary];
    const results = [];
    for (const caller of callers) {
      results.push(await getHttpResponse(baseUrl, `/open-answer-attempts/${attemptId}`, caller));
    }

    assert.deepEqual(
      results,
      callers.map(() => ({
        statusCode: 404,
        body: { status: "rejected", reason: "attempt_not_found" },
      })),
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsGet_shouldRedactDetailRejectionAndFaultResponses", async () => {
  const {
    baseUrl,
    close,
    studentWorkspaceCommands,
  } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(90),
  });
  const faultHarness = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    studentWorkspaceCommandsOverride: {
      getOpenAnswerAttempt: () => {
        throw new Error(
          "session-1 csrf-token-1 attempt-key-secret cookie authorization raw prompt raw model evaluator diagnostics sql stack /tmp/db.sqlite postgres://db",
        );
      },
    },
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const submitted = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "Explain the invariant.",
      },
      "attempt-key-secret",
    );
    const attemptId = (await submitted.json()).value.attempt.attemptId;
    studentWorkspaceCommands.recordOpenAnswerEvaluation({
      attemptId,
      criterionFeedback: scenario.acceptedCheck.criterionRevisionIds.map($0 => ({
        criterionRevisionId: $0,
        feedback: `Feedback for ${$0}.`,
        outcome: "met",
      })),
      evaluatorKind: "student_workspace",
      summaryFeedback: "The answer satisfies the accepted criteria.",
    });
    const failed = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "Second answer.",
      },
      "attempt-key-failure",
    );
    const failedAttemptId = (await failed.json()).value.attempt.attemptId;
    studentWorkspaceCommands.recordOpenAnswerEvaluationFailure({
      attemptId: failedAttemptId,
      reason: "Evaluator timeout.",
    });
    const accepted = await getHttpResponse(baseUrl, `/open-answer-attempts/${attemptId}`, scenario.student);
    const failedDetail = await getHttpResponse(
      baseUrl,
      `/open-answer-attempts/${failedAttemptId}`,
      scenario.student,
    );
    const rejected = await getHttpResponse(baseUrl, "/open-answer-attempts/attempt-key-secret", scenario.student);
    const faultBootstrap = await bootstrapAdmin(faultHarness.baseUrl);
    const fault = await getHttpResponse(faultHarness.baseUrl, "/open-answer-attempts/attempt-1", faultBootstrap);

    assert.deepEqual(
      {
        acceptedStatusCode: accepted.statusCode,
        acceptedHasLeaks: hasAttemptDetailLeak(accepted.body),
        failedStatusCode: failedDetail.statusCode,
        failedHasLeaks: hasAttemptDetailLeak(failedDetail.body),
        rejected,
        fault,
        faultHasLeaks: hasAttemptDetailLeak(fault.body),
      },
      {
        acceptedStatusCode: 200,
        acceptedHasLeaks: false,
        failedStatusCode: 200,
        failedHasLeaks: false,
        rejected: {
          statusCode: 404,
          body: { status: "rejected", reason: "attempt_not_found" },
        },
        fault: {
          statusCode: 500,
          body: { status: "fault", reason: "internal_error" },
        },
        faultHasLeaks: false,
      },
    );
  } finally {
    await close();
    await faultHarness.close();
  }
});

function openAnswerAttemptDetailProjection(body) {
  const attempt = body.value?.attempt;
  return {
    status: body.status,
    attemptId: attempt?.attemptId,
    programId: attempt?.programId,
    studentIdentityId: attempt?.studentIdentityId,
    checkRevisionId: attempt?.checkRevisionId,
    criterionRevisionIds: attempt?.criterionRevisionIds,
    submittedAnswer: attempt?.submittedAnswer,
    attemptStatus: attempt?.status,
    submittedAt: attempt?.submittedAt,
    updatedAt: attempt?.updatedAt,
  };
}

function openAnswerAttemptFailureProjection(body) {
  return {
    status: body.status,
    attemptStatus: body.value?.attempt?.status,
    reason: body.value?.evaluationFailure?.reason,
    failedAt: body.value?.evaluationFailure?.failedAt,
  };
}
