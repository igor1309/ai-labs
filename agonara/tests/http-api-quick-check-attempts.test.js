import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapAdmin,
  createAcceptedQuickCheck,
  createIdentitySession,
  createProgram,
  getHttpResponse,
  joinStudentProgram,
  listenWithIdentityProgramCorpusAndStudentWorkspace,
  manyIds,
  submitQuickCheckAttempt,
} from "./support/http-api.js";

test("quickCheckAttemptRoutes_shouldRejectMissingMalformedIdempotencyHeader_beforeSubmission", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    studentWorkspaceCommandsOverride: {
      submitQuickCheckAttempt: () => {
        throw new Error("quick check attempt command should not run before idempotency passes");
      },
    },
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const cases = [
      {},
      { "x-agonara-idempotency-key": "   " },
    ];
    const results = [];
    for (const headers of cases) {
      const response = await fetch(`${baseUrl}/programs/program-1/quick-check-attempts`, {
        body: JSON.stringify({
          checkRevisionId: "quick-check-revision-1",
          selectedOptionId: "option-1",
        }),
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

test("quickCheckAttempts_shouldSubmitRetryReadAndListOwnerAttempt_onEffectiveStudent", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(80),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "quick-attempt-curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "quick-attempt-student@example.test",
    });
    const otherStudent = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Other Student",
      login: "quick-attempt-other@example.test",
    });
    const program = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    await joinStudentProgram(baseUrl, student, programId);
    await joinStudentProgram(baseUrl, otherStudent, programId);
    const acceptedQuickCheck = await createAcceptedQuickCheck(baseUrl, curator, programId, {
      answerKeyOptionIndex: 0,
      options: ["Closed under addition", "Has a basis"],
      prompt: "Which property is required?",
      title: "Closure check",
    });
    const submitted = await submitQuickCheckAttempt(
      baseUrl,
      student,
      programId,
      {
        checkRevisionId: acceptedQuickCheck.revisionId,
        selectedOptionId: acceptedQuickCheck.answerKeyOptionId,
      },
      "quick-attempt-key-1",
    );
    const submittedBody = await submitted.json();
    const attemptId = submittedBody.value.quickCheckAttempt.attemptId;
    const retry = await submitQuickCheckAttempt(
      baseUrl,
      student,
      programId,
      {
        checkRevisionId: acceptedQuickCheck.revisionId,
        selectedOptionId: acceptedQuickCheck.answerKeyOptionId,
      },
      "quick-attempt-key-1",
    );
    const conflict = await submitQuickCheckAttempt(
      baseUrl,
      student,
      programId,
      {
        checkRevisionId: acceptedQuickCheck.revisionId,
        selectedOptionId: acceptedQuickCheck.options.find($0 => $0.optionId !== acceptedQuickCheck.answerKeyOptionId)
          .optionId,
      },
      "quick-attempt-key-1",
    );
    const detail = await getHttpResponse(baseUrl, `/quick-check-attempts/${attemptId}`, student);
    const nonOwnerCallers = [otherStudent, curator, bootstrap];
    const nonOwners = [];
    for (const caller of nonOwnerCallers) {
      nonOwners.push(await getHttpResponse(baseUrl, `/quick-check-attempts/${attemptId}`, caller));
    }
    const listed = await listQuickCheckAttempts(
      baseUrl,
      student,
      programId,
      `checkRevisionId=${acceptedQuickCheck.revisionId}`,
    );
    const serializedStudentResponses = JSON.stringify([
      submittedBody,
      await retry.clone().json(),
      detail.body,
      listed.body,
    ]);

    assert.deepEqual(
      {
        conflict: { body: await conflict.json(), statusCode: conflict.status },
        detail: { body: quickCheckAttemptResponseProjection(detail.body), statusCode: detail.statusCode },
        hasStudentLeaks: containsQuickCheckAttemptLeaks(serializedStudentResponses),
        listed: { body: quickCheckAttemptListProjection(listed.body), statusCode: listed.statusCode },
        nonOwners,
        retry: quickCheckAttemptResponseProjection(await retry.json()),
        retryStatusCode: retry.status,
        submitted: quickCheckAttemptResponseProjection(submittedBody),
        submittedStatusCode: submitted.status,
      },
      {
        conflict: {
          body: { status: "rejected", reason: "idempotency_conflict" },
          statusCode: 409,
        },
        detail: {
          body: {
            attemptId,
            checkRevisionId: acceptedQuickCheck.revisionId,
            matched: true,
            programId,
            selectedOptionId: acceptedQuickCheck.answerKeyOptionId,
            status: "accepted",
            studentIdentityId: student.identityId,
          },
          statusCode: 200,
        },
        hasStudentLeaks: false,
        listed: {
          body: {
            attempts: [
              {
                attemptId,
                checkRevisionId: acceptedQuickCheck.revisionId,
                matched: true,
                programId,
                selectedOptionId: acceptedQuickCheck.answerKeyOptionId,
                studentIdentityId: student.identityId,
              },
            ],
            hasNextCursor: false,
            status: "accepted",
          },
          statusCode: 200,
        },
        nonOwners: nonOwnerCallers.map(() => ({
          body: { status: "rejected", reason: "attempt_not_found" },
          statusCode: 404,
        })),
        retry: {
          attemptId,
          checkRevisionId: acceptedQuickCheck.revisionId,
          matched: true,
          programId,
          selectedOptionId: acceptedQuickCheck.answerKeyOptionId,
          status: "accepted",
          studentIdentityId: student.identityId,
        },
        retryStatusCode: 200,
        submitted: {
          attemptId,
          checkRevisionId: acceptedQuickCheck.revisionId,
          matched: true,
          programId,
          selectedOptionId: acceptedQuickCheck.answerKeyOptionId,
          status: "accepted",
          studentIdentityId: student.identityId,
        },
        submittedStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckAttempts_shouldRejectInvalidReadsAndListQueries", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(80),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "quick-attempt-denied-curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "quick-attempt-denied-student@example.test",
    });
    const program = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    await joinStudentProgram(baseUrl, student, programId);
    const acceptedQuickCheck = await createAcceptedQuickCheck(baseUrl, curator, programId);
    const firstPage = await listQuickCheckAttempts(baseUrl, student, programId, "limit=1");
    const candidateCursor = await fetch(`${baseUrl}/programs/${programId}/quick-checks/candidates?limit=1`, {
      headers: { cookie: curator.cookie },
    });
    const candidateCursorBody = await candidateCursor.json();
    const responses = [
      await getHttpResponse(baseUrl, "/quick-check-attempts/attempt-missing", student),
      await listQuickCheckAttempts(baseUrl, curator, programId),
      await listQuickCheckAttempts(baseUrl, student, "program-missing"),
      await listQuickCheckAttempts(baseUrl, student, programId, "checkRevisionId= "),
      await listQuickCheckAttempts(baseUrl, student, programId, "checkRevisionId=revision-missing"),
      await listQuickCheckAttempts(
        baseUrl,
        student,
        programId,
        `cursor=${candidateCursorBody.value.nextCursor}`,
      ),
      await listQuickCheckAttempts(baseUrl, student, programId, "limit=0"),
    ];

    assert.deepEqual(
      {
        firstPage,
        responses,
      },
      {
        firstPage: {
          body: { status: "accepted", value: { quickCheckAttempts: [] } },
          statusCode: 200,
        },
        responses: [
          {
            body: { status: "rejected", reason: "attempt_not_found" },
            statusCode: 404,
          },
          {
            body: { status: "rejected", reason: "participation_required" },
            statusCode: 403,
          },
          {
            body: { status: "rejected", reason: "program_not_found" },
            statusCode: 404,
          },
          {
            body: { status: "rejected", reason: "validation_failed" },
            statusCode: 400,
          },
          {
            body: { status: "rejected", reason: "quick_check_revision_not_found" },
            statusCode: 404,
          },
          {
            body: { status: "rejected", reason: "validation_failed" },
            statusCode: 400,
          },
          {
            body: { status: "rejected", reason: "validation_failed" },
            statusCode: 400,
          },
        ],
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckHttpAcceptance_shouldKeepOutOfScopeRoutesAbsent", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(60),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "quick-absence-curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "quick-absence-student@example.test",
    });
    const program = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    await joinStudentProgram(baseUrl, student, programId);
    const acceptedQuickCheck = await createAcceptedQuickCheck(baseUrl, curator, programId);
    const submitted = await submitQuickCheckAttempt(
      baseUrl,
      student,
      programId,
      {
        checkRevisionId: acceptedQuickCheck.revisionId,
        selectedOptionId: acceptedQuickCheck.answerKeyOptionId,
      },
      "quick-absence-key",
    );
    const attemptId = (await submitted.json()).value.quickCheckAttempt.attemptId;
    const absentRoutes = [
      ["GET", "/quick-check-ui"],
      ["GET", `/programs/${programId}/quick-checks/randomized`],
      ["POST", `/programs/${programId}/quick-checks/multiple-select-attempts`],
      ["GET", `/programs/${programId}/quick-check-topic-attempts`],
      ["GET", `/programs/${programId}/quick-check-period-attempts`],
      ["GET", `/quick-check-mastery/${attemptId}`],
      ["GET", `/quick-check-weak-areas/${attemptId}`],
      ["GET", `/quick-check-progress/${attemptId}`],
      ["GET", `/quick-check-grading/${attemptId}`],
      ["GET", "/quick-check-provider/jobs"],
      ["GET", "/quick-check-worker/jobs"],
      ["GET", "/quick-check-queue/jobs"],
      ["GET", "/quick-check-human-review/jobs"],
    ];
    const responses = [];
    for (const [method, route] of absentRoutes) {
      const response = await fetch(`${baseUrl}${route}`, {
        body: method === "POST" ? JSON.stringify({}) : undefined,
        headers: {
          cookie: student.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": student.csrfToken,
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

    assert.deepEqual(
      responses,
      absentRoutes.map(([method, route]) => ({
        body: { status: "rejected", reason: "not_found" },
        method,
        route,
        statusCode: 404,
      })),
    );
  } finally {
    await close();
  }
});

async function listQuickCheckAttempts(baseUrl, session, programId, query = "") {
  const separator = query ? "?" : "";
  const response = await fetch(`${baseUrl}/programs/${programId}/quick-check-attempts${separator}${query}`, {
    headers: { cookie: session.cookie },
  });
  return { body: await response.json(), statusCode: response.status };
}

function quickCheckAttemptResponseProjection(body) {
  const attempt = body.value?.quickCheckAttempt;
  return {
    status: body.status,
    attemptId: attempt?.attemptId,
    programId: attempt?.programId,
    studentIdentityId: attempt?.studentIdentityId,
    checkRevisionId: attempt?.checkRevisionId,
    selectedOptionId: attempt?.selectedOptionId,
    matched: attempt?.matched,
  };
}

function quickCheckAttemptListProjection(body) {
  return {
    status: body.status,
    attempts: (body.value?.quickCheckAttempts ?? []).map($0 => ({
      attemptId: $0.attemptId,
      programId: $0.programId,
      studentIdentityId: $0.studentIdentityId,
      checkRevisionId: $0.checkRevisionId,
      selectedOptionId: $0.selectedOptionId,
      matched: $0.matched,
    })),
    hasNextCursor: typeof body.value?.nextCursor === "string",
  };
}

function containsQuickCheckAttemptLeaks(serialized) {
  return [
    "answerKey",
    "answer_key",
    "acceptedFromCandidateId",
    "candidateId",
    "correct",
    "idempotency",
    "quick-attempt-key",
  ].some($0 => serialized.includes($0));
}
