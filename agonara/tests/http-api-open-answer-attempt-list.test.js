import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/server.js";
import {
  bootstrapAdmin,
  close,
  createAcceptedOpenAnswerCheck,
  createIdentitySession,
  createProgram,
  createStudentAttemptApiScenario,
  hasAttemptDetailLeak,
  joinStudentProgram,
  listOpenAnswerAttempts,
  listen,
  listenWithIdentityProgramCorpusAndStudentWorkspace,
  makeIdGenerator,
  manyIds,
  openAnswerAttemptListProjection,
  submitOpenAnswerAttemptAndRead,
} from "./support/http-api.js";

test("openAnswerAttemptsList_shouldReturnOnlyOwnerAttemptsInRequestedProgram", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(140),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const attempt = await submitOpenAnswerAttemptAndRead(
      baseUrl,
      scenario.student,
      scenario.programId,
      scenario.acceptedCheck.revisionId,
      "Owned answer.",
      "attempt-key-1",
    );
    const otherStudent = await createIdentitySession(baseUrl, scenario.bootstrap, {
      displayName: "Other Student",
      login: "other-list-student@example.test",
    });
    await joinStudentProgram(baseUrl, otherStudent, scenario.programId);
    await submitOpenAnswerAttemptAndRead(
      baseUrl,
      otherStudent,
      scenario.programId,
      scenario.acceptedCheck.revisionId,
      "Other student answer.",
      "attempt-key-2",
    );
    const otherProgram = await createProgram(baseUrl, scenario.curator, { title: "Topology" });
    const otherProgramId = (await otherProgram.json()).value.program.programId;
    await joinStudentProgram(baseUrl, scenario.student, otherProgramId);
    const otherCheck = await createAcceptedOpenAnswerCheck(baseUrl, scenario.curator, otherProgramId, {
      checkTitle: "Topology check",
      criterionTitle: "Topology criterion",
    });
    await submitOpenAnswerAttemptAndRead(
      baseUrl,
      scenario.student,
      otherProgramId,
      otherCheck.revisionId,
      "Other program answer.",
      "attempt-key-3",
    );
    const listed = await listOpenAnswerAttempts(baseUrl, scenario.student, scenario.programId);

    assert.deepEqual(
      {
        statusCode: listed.statusCode,
        body: openAnswerAttemptListProjection(listed.body),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          attempts: [
            {
              attemptId: attempt.attemptId,
              programId: scenario.programId,
              studentIdentityId: scenario.student.identityId,
              checkRevisionId: scenario.acceptedCheck.revisionId,
              submittedAnswer: "Owned answer.",
              status: "submitted",
            },
          ],
          hasNextCursor: false,
        },
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsList_shouldRejectCallerWithoutStudentParticipation", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(90),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const ordinary = await createIdentitySession(baseUrl, scenario.bootstrap, {
      displayName: "Ordinary",
      login: "ordinary-list@example.test",
    });
    const listed = await listOpenAnswerAttempts(baseUrl, ordinary, scenario.programId);

    assert.deepEqual(listed, {
      statusCode: 403,
      body: { status: "rejected", reason: "participation_required" },
    });
  } finally {
    await close();
  }
});

test("openAnswerAttemptsList_shouldApplyStatusFiltersAndRejectUnsupportedStatus", async () => {
  const {
    baseUrl,
    close,
    studentWorkspaceCommands,
  } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(120),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    await submitOpenAnswerAttemptAndRead(
      baseUrl,
      scenario.student,
      scenario.programId,
      scenario.acceptedCheck.revisionId,
      "Submitted answer.",
      "attempt-key-1",
    );
    const evaluated = await submitOpenAnswerAttemptAndRead(
      baseUrl,
      scenario.student,
      scenario.programId,
      scenario.acceptedCheck.revisionId,
      "Evaluated answer.",
      "attempt-key-2",
    );
    studentWorkspaceCommands.recordOpenAnswerEvaluation({
      attemptId: evaluated.attemptId,
      criterionFeedback: scenario.acceptedCheck.criterionRevisionIds.map($0 => ({
        criterionRevisionId: $0,
        feedback: `Feedback for ${$0}.`,
        outcome: "met",
      })),
      evaluatorKind: "student_workspace",
      summaryFeedback: "The answer satisfies the accepted criteria.",
    });
    const evaluatedList = await listOpenAnswerAttempts(
      baseUrl,
      scenario.student,
      scenario.programId,
      "status=evaluated",
    );
    const invalid = await listOpenAnswerAttempts(
      baseUrl,
      scenario.student,
      scenario.programId,
      "status=unsupported",
    );

    assert.deepEqual(
      {
        evaluated: openAnswerAttemptListProjection(evaluatedList.body),
        evaluatedStatusCode: evaluatedList.statusCode,
        invalid,
      },
      {
        evaluated: {
          status: "accepted",
          attempts: [
            {
              attemptId: evaluated.attemptId,
              programId: scenario.programId,
              studentIdentityId: scenario.student.identityId,
              checkRevisionId: scenario.acceptedCheck.revisionId,
              submittedAnswer: "Evaluated answer.",
              status: "evaluated",
            },
          ],
          hasNextCursor: false,
        },
        evaluatedStatusCode: 200,
        invalid: {
          statusCode: 400,
          body: { status: "rejected", reason: "validation_failed" },
        },
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsList_shouldApplyCheckRevisionFilterAfterOwnerAndProgramScope", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(150),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const secondCheck = await createAcceptedOpenAnswerCheck(baseUrl, scenario.curator, scenario.programId, {
      checkTitle: "Second closure check",
      criterionTitle: "Second criterion",
    });
    const expected = await submitOpenAnswerAttemptAndRead(
      baseUrl,
      scenario.student,
      scenario.programId,
      secondCheck.revisionId,
      "Second check answer.",
      "attempt-key-1",
    );
    await submitOpenAnswerAttemptAndRead(
      baseUrl,
      scenario.student,
      scenario.programId,
      scenario.acceptedCheck.revisionId,
      "First check answer.",
      "attempt-key-2",
    );
    const otherStudent = await createIdentitySession(baseUrl, scenario.bootstrap, {
      displayName: "Other Student",
      login: "other-check-filter@example.test",
    });
    await joinStudentProgram(baseUrl, otherStudent, scenario.programId);
    await submitOpenAnswerAttemptAndRead(
      baseUrl,
      otherStudent,
      scenario.programId,
      secondCheck.revisionId,
      "Other student second check answer.",
      "attempt-key-3",
    );
    const listed = await listOpenAnswerAttempts(
      baseUrl,
      scenario.student,
      scenario.programId,
      `checkRevisionId=${secondCheck.revisionId}`,
    );

    assert.deepEqual(
      {
        statusCode: listed.statusCode,
        body: openAnswerAttemptListProjection(listed.body),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          attempts: [
            {
              attemptId: expected.attemptId,
              programId: scenario.programId,
              studentIdentityId: scenario.student.identityId,
              checkRevisionId: secondCheck.revisionId,
              submittedAnswer: "Second check answer.",
              status: "submitted",
            },
          ],
          hasNextCursor: false,
        },
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsList_shouldDefaultLimitToFifty", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(180),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    for (let index = 1; index <= 51; index += 1) {
      await submitOpenAnswerAttemptAndRead(
        baseUrl,
        scenario.student,
        scenario.programId,
        scenario.acceptedCheck.revisionId,
        `Answer ${index}.`,
        `attempt-key-${index}`,
      );
    }
    const listed = await listOpenAnswerAttempts(baseUrl, scenario.student, scenario.programId);

    assert.deepEqual(
      {
        statusCode: listed.statusCode,
        attemptCount: listed.body.value?.attempts?.length,
        hasNextCursor: typeof listed.body.value?.nextCursor === "string",
      },
      {
        statusCode: 200,
        attemptCount: 50,
        hasNextCursor: true,
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsList_shouldRejectInvalidLimits", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(90),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const cases = ["limit=0", "limit=101", "limit=-1", "limit=abc"];
    const results = [];
    for (const query of cases) {
      results.push(await listOpenAnswerAttempts(baseUrl, scenario.student, scenario.programId, query));
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

test("openAnswerAttemptsList_shouldReturnOpaqueCursorAndRejectCursorScopeMismatch", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(130),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    for (let index = 1; index <= 3; index += 1) {
      await submitOpenAnswerAttemptAndRead(
        baseUrl,
        scenario.student,
        scenario.programId,
        scenario.acceptedCheck.revisionId,
        `Cursor answer ${index}.`,
        `attempt-key-${index}`,
      );
    }
    const firstPage = await listOpenAnswerAttempts(
      baseUrl,
      scenario.student,
      scenario.programId,
      "limit=1",
    );
    const cursor = firstPage.body.value.nextCursor;
    const otherStudent = await createIdentitySession(baseUrl, scenario.bootstrap, {
      displayName: "Other Student",
      login: "cursor-other-student@example.test",
    });
    await joinStudentProgram(baseUrl, otherStudent, scenario.programId);
    const cases = [
      await listOpenAnswerAttempts(baseUrl, scenario.student, scenario.programId, `limit=1&cursor=${cursor}`),
      await listOpenAnswerAttempts(baseUrl, scenario.student, scenario.programId, "cursor=missing"),
      await listOpenAnswerAttempts(baseUrl, scenario.student, "program-unknown", `cursor=${cursor}`),
      await listOpenAnswerAttempts(baseUrl, scenario.student, scenario.programId, `status=submitted&cursor=${cursor}`),
      await listOpenAnswerAttempts(
        baseUrl,
        scenario.student,
        scenario.programId,
        `checkRevisionId=${scenario.acceptedCheck.revisionId}&cursor=${cursor}`,
      ),
      await listOpenAnswerAttempts(baseUrl, otherStudent, scenario.programId, `cursor=${cursor}`),
    ];

    assert.deepEqual(
      {
        firstPageStatusCode: firstPage.statusCode,
        firstPageAttemptCount: firstPage.body.value.attempts.length,
        cursorIsOpaque: cursorDoesNotExposeAttemptListState(cursor),
        cases: cases.map($0 => ({
          statusCode: $0.statusCode,
          body: openAnswerAttemptListCursorProjection($0.body),
        })),
      },
      {
        firstPageStatusCode: 200,
        firstPageAttemptCount: 1,
        cursorIsOpaque: true,
        cases: [
          {
            statusCode: 200,
            body: { status: "accepted", attemptCount: 1, hasNextCursor: true },
          },
          {
            statusCode: 400,
            body: { status: "rejected", reason: "validation_failed" },
          },
          {
            statusCode: 400,
            body: { status: "rejected", reason: "validation_failed" },
          },
          {
            statusCode: 400,
            body: { status: "rejected", reason: "validation_failed" },
          },
          {
            statusCode: 400,
            body: { status: "rejected", reason: "validation_failed" },
          },
          {
            statusCode: 400,
            body: { status: "rejected", reason: "validation_failed" },
          },
        ],
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerAttemptsList_shouldRejectCursorRouteKeyDelimiterCollisions", async () => {
  const generateToken = makeIdGenerator(["cursor-1", "cursor-2"]);
  const server = createServer({
    generateToken,
    identityCommands: {
      resolveSession: ({ sessionId }) => ({
        status: "accepted",
        value: {
          identity: {
            id: sessionId === "session-a" ? "id:a" : "id",
            state: "active",
          },
          session: { id: sessionId },
        },
      }),
    },
    log: () => {},
    studentWorkspaceCommands: {
      listOpenAnswerAttempts: ({ actingIdentityId, programId }) => ({
        status: "accepted",
        value: {
          attempts: [
            makeOpenAnswerAttemptSummary({
              attemptId: `${actingIdentityId}:${programId}:1`,
              programId,
              studentIdentityId: actingIdentityId,
            }),
            makeOpenAnswerAttemptSummary({
              attemptId: `${actingIdentityId}:${programId}:2`,
              programId,
              studentIdentityId: actingIdentityId,
            }),
          ],
        },
      }),
    },
  });
  const baseUrl = await listen(server);

  try {
    const first = await fetch(`${baseUrl}/programs/b/open-answer-attempts?limit=1`, {
      headers: { cookie: "agonara_session=session-a" },
    });
    const cursor = (await first.json()).value.nextCursor;
    const collision = await fetch(`${baseUrl}/programs/a:b/open-answer-attempts?cursor=${cursor}`, {
      headers: { cookie: "agonara_session=session-b" },
    });

    assert.deepEqual(
      {
        statusCode: collision.status,
        body: await collision.json(),
      },
      {
        statusCode: 400,
        body: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    await close(server);
  }
});

test("openAnswerAttemptsList_shouldRedactCursorsAndFaultResponses", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(100),
  });
  const faultHarness = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    studentWorkspaceCommandsOverride: {
      listOpenAnswerAttempts: () => {
        throw new Error(
          "session-1 csrf-token-1 attempt-key-secret cookie authorization raw prompt raw model evaluator diagnostics sql stack /tmp/db.sqlite postgres://db",
        );
      },
    },
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    for (let index = 1; index <= 2; index += 1) {
      await submitOpenAnswerAttemptAndRead(
        baseUrl,
        scenario.student,
        scenario.programId,
        scenario.acceptedCheck.revisionId,
        `Sensitive answer ${index}.`,
        `attempt-key-secret-${index}`,
      );
    }
    const listed = await listOpenAnswerAttempts(baseUrl, scenario.student, scenario.programId, "limit=1");
    const faultBootstrap = await bootstrapAdmin(faultHarness.baseUrl);
    const fault = await listOpenAnswerAttempts(faultHarness.baseUrl, faultBootstrap, "program-1");

    assert.deepEqual(
      {
        listedStatusCode: listed.statusCode,
        cursorHasLeaks: cursorExposesAny(listed.body.value.nextCursor, [
          "Sensitive answer",
          "attempt-key",
          "session",
          "csrf",
          "cookie",
          "authorization",
          "sql",
          "stack",
          "/tmp",
          "postgres://",
        ]),
        bodyHasSecretLeaks: JSON.stringify(listed.body).includes("attempt-key-secret"),
        fault,
        faultHasLeaks: hasAttemptDetailLeak(fault.body),
      },
      {
        listedStatusCode: 200,
        cursorHasLeaks: false,
        bodyHasSecretLeaks: false,
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

function openAnswerAttemptListCursorProjection(body) {
  if (body.status === "rejected") {
    return body;
  }
  return {
    status: body.status,
    attemptCount: body.value?.attempts?.length,
    hasNextCursor: typeof body.value?.nextCursor === "string",
  };
}

function cursorDoesNotExposeAttemptListState(cursor) {
  return typeof cursor === "string" &&
    !cursorExposesAny(cursor, [
      "Cursor answer",
      "attempt-key",
      "submitted",
      "program",
      "identity",
      "check",
      "session",
      "csrf",
      "cookie",
      "authorization",
      "sql",
      "stack",
    ]);
}

function cursorExposesAny(cursor, fragments) {
  return fragments.some($0 => cursor.includes($0));
}

function makeOpenAnswerAttemptSummary({
  attemptId,
  checkRevisionId = "check-revision-1",
  criterionRevisionIds = ["criterion-revision-1"],
  programId,
  status = "submitted",
  studentIdentityId,
  submittedAnswer = "Answer.",
}) {
  return {
    attemptId,
    checkRevisionId,
    criterionRevisionIds,
    programId,
    status,
    studentIdentityId,
    submittedAnswer,
    submittedAt: "2026-05-27T10:00:00.000Z",
    updatedAt: "2026-05-27T10:00:00.000Z",
  };
}
