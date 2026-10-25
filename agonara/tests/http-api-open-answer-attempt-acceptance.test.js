import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { listOpenAnswerAttemptRecords } from "../src/storage.js";
import {
  acceptedOpenAnswerCheckProjection,
  createIdentitySession,
  createStudentAttemptApiScenario,
  getHttpResponse,
  joinStudentProgram,
  listOpenAnswerAttempts,
  listenWithIdentityProgramCorpusAndStudentWorkspace,
  manyIds,
  openAnswerAttemptEvaluationProjection,
  openAnswerAttemptListProjection,
  openAnswerAttemptResponseProjection,
  submitOpenAnswerAttempt,
  submitOpenAnswerAttemptAndRead,
} from "./support/http-api.js";

test("studentWorkspaceOpenAnswerAttemptHttpAcceptance_shouldCoverSt12St13AndInt05", async () => {
  const {
    baseUrl,
    close,
    database,
    studentWorkspaceCommands,
  } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(130),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const otherStudent = await createIdentitySession(baseUrl, scenario.bootstrap, {
      displayName: "Other Student",
      login: "other-student@example.test",
    });
    await joinStudentProgram(baseUrl, otherStudent, scenario.programId);
    const acceptedCheck = await getHttpResponse(
      baseUrl,
      `/open-answer-checks/revisions/${scenario.acceptedCheck.revisionId}`,
      scenario.student,
    );
    const submitted = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "  Closure is preserved by the vector-space operations.  ",
      },
      "attempt-key-acceptance",
    );
    const submittedBody = await submitted.json();
    const attemptCountAfterSubmission = listOpenAnswerAttemptRecords(database).length;
    const retry = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "  Closure is preserved by the vector-space operations.  ",
      },
      "attempt-key-acceptance",
    );
    const retryBody = await retry.json();
    const attemptCountAfterRetry = listOpenAnswerAttemptRecords(database).length;
    await submitOpenAnswerAttemptAndRead(
      baseUrl,
      otherStudent,
      scenario.programId,
      scenario.acceptedCheck.revisionId,
      "Other student's private answer.",
      "attempt-key-other-student",
    );
    studentWorkspaceCommands.recordOpenAnswerEvaluation({
      attemptId: submittedBody.value.attempt.attemptId,
      criterionFeedback: scenario.acceptedCheck.criterionRevisionIds.map($0 => ({
        criterionRevisionId: $0,
        feedback: `Feedback for ${$0}.`,
        outcome: "met",
      })),
      evaluatorKind: "student_workspace",
      summaryFeedback: "The answer is tied to the accepted criteria.",
    });
    const detail = await getHttpResponse(
      baseUrl,
      `/open-answer-attempts/${submittedBody.value.attempt.attemptId}`,
      scenario.student,
    );
    const listed = await listOpenAnswerAttempts(baseUrl, scenario.student, scenario.programId);
    const nonOwnerDetail = await getHttpResponse(
      baseUrl,
      `/open-answer-attempts/${submittedBody.value.attempt.attemptId}`,
      otherStudent,
    );

    assert.deepEqual(
      {
        acceptedCheckStatusCode: acceptedCheck.statusCode,
        acceptedCheck: acceptedOpenAnswerCheckProjection(acceptedCheck.body),
        submittedStatusCode: submitted.status,
        submitted: openAnswerAttemptResponseProjection(submittedBody),
        retryStatusCode: retry.status,
        retryAttemptId: retryBody.value.attempt.attemptId,
        originalAttemptId: submittedBody.value.attempt.attemptId,
        attemptCountAfterSubmission,
        attemptCountAfterRetry,
        detailStatusCode: detail.statusCode,
        detailEvaluation: openAnswerAttemptEvaluationProjection(detail.body),
        listedStatusCode: listed.statusCode,
        listed: openAnswerAttemptListProjection(listed.body),
        nonOwnerDetail,
      },
      {
        acceptedCheckStatusCode: 200,
        acceptedCheck: {
          acceptedFromCandidateId: scenario.acceptedCheck.acceptedFromCandidateId,
          criterionRevisionIds: scenario.acceptedCheck.criterionRevisionIds,
          programId: scenario.programId,
          title: "Closure check",
        },
        submittedStatusCode: 200,
        submitted: {
          status: "accepted",
          hasAttemptId: true,
          programId: scenario.programId,
          studentIdentityId: scenario.student.identityId,
          checkRevisionId: scenario.acceptedCheck.revisionId,
          criterionRevisionIds: scenario.acceptedCheck.criterionRevisionIds,
          submittedAnswer: "Closure is preserved by the vector-space operations.",
          attemptStatus: "submitted",
          submittedAt: "2026-05-27T10:00:00.000Z",
          updatedAt: "2026-05-27T10:00:00.000Z",
        },
        retryStatusCode: 200,
        retryAttemptId: submittedBody.value.attempt.attemptId,
        originalAttemptId: submittedBody.value.attempt.attemptId,
        attemptCountAfterSubmission: 1,
        attemptCountAfterRetry: 1,
        detailStatusCode: 200,
        detailEvaluation: {
          status: "accepted",
          attemptStatus: "evaluated",
          hasEvaluationId: true,
          evaluatorKind: "student_workspace",
          summaryFeedback: "The answer is tied to the accepted criteria.",
          criterionFeedback: scenario.acceptedCheck.criterionRevisionIds.map($0 => ({
            criterionRevisionId: $0,
            feedback: `Feedback for ${$0}.`,
            outcome: "met",
          })),
          evaluatedAt: "2026-05-27T10:00:00.000Z",
        },
        listedStatusCode: 200,
        listed: {
          status: "accepted",
          attempts: [{
            attemptId: submittedBody.value.attempt.attemptId,
            programId: scenario.programId,
            studentIdentityId: scenario.student.identityId,
            checkRevisionId: scenario.acceptedCheck.revisionId,
            submittedAnswer: "Closure is preserved by the vector-space operations.",
            status: "evaluated",
          }],
          hasNextCursor: false,
        },
        nonOwnerDetail: {
          statusCode: 404,
          body: { status: "rejected", reason: "attempt_not_found" },
        },
      },
    );
  } finally {
    await close();
  }
});

test("studentWorkspaceOpenAnswerAttemptHttpAcceptance_shouldKeepOutOfScopeRoutesAbsent", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(100),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const submittedAttempt = await submitOpenAnswerAttemptAndRead(
      baseUrl,
      scenario.student,
      scenario.programId,
      scenario.acceptedCheck.revisionId,
      "Bounded HTTP route surface answer.",
      "attempt-key-route-absence",
    );
    const absentRoutes = [
      ["POST", `/open-answer-attempts/${submittedAttempt.attemptId}/evaluating`],
      ["POST", `/open-answer-attempts/${submittedAttempt.attemptId}/evaluation`],
      ["POST", `/open-answer-attempts/${submittedAttempt.attemptId}/evaluation-failure`],
      ["GET", `/student-workspace/open-answer-attempts/${submittedAttempt.attemptId}`],
      ["GET", `/curator/open-answer-attempts/${submittedAttempt.attemptId}`],
      ["GET", `/admin/open-answer-attempts/${submittedAttempt.attemptId}`],
      ["GET", `/llm/open-answer-attempts/${submittedAttempt.attemptId}`],
      ["GET", `/human-review/open-answer-attempts/${submittedAttempt.attemptId}`],
      ["GET", `/mastery/open-answer-attempts/${submittedAttempt.attemptId}`],
      ["GET", `/weak-areas/open-answer-attempts/${submittedAttempt.attemptId}`],
      ["GET", `/progress/open-answer-attempts/${submittedAttempt.attemptId}`],
      ["GET", `/topic-attempts/${submittedAttempt.attemptId}`],
      ["GET", `/period-attempts/${submittedAttempt.attemptId}`],
      ["GET", `/grading/open-answer-attempts/${submittedAttempt.attemptId}`],
    ];
    const responses = [];
    for (const [method, route] of absentRoutes) {
      const response = await fetch(`${baseUrl}${route}`, {
        body: method === "POST" ? JSON.stringify({}) : undefined,
        headers: {
          cookie: scenario.student.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": scenario.student.csrfToken,
        },
        method,
      });
      responses.push({
        body: await response.json(),
        method,
        route,
        statusCode: response.status,
      });
    }
    const serverSource = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");

    assert.deepEqual(
      {
        responses,
        serverUsesEvaluationMutationCommands: containsAnyStudentWorkspaceEvaluationMutationCommand(serverSource),
      },
      {
        responses: absentRoutes.map(([method, route]) => ({
          body: { status: "rejected", reason: "not_found" },
          method,
          route,
          statusCode: 404,
        })),
        serverUsesEvaluationMutationCommands: false,
      },
    );
  } finally {
    await close();
  }
});

function containsAnyStudentWorkspaceEvaluationMutationCommand(source) {
  return [
    "markOpenAnswerAttemptEvaluating",
    "recordOpenAnswerEvaluation",
    "recordOpenAnswerEvaluationFailure",
  ].some($0 => source.includes($0));
}
