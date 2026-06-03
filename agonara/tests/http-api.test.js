import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCorpusCommands } from "../src/corpus.js";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import { createServer, startServer } from "../src/server.js";
import { createStudentWorkspaceCommands } from "../src/student-workspace.js";
import {
  initializeIdentityStorage,
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
  openIdentityDatabase,
  updateProgramMembershipStatus,
} from "../src/storage.js";

test("identityBootstrap_shouldSetCookieAndHideSessionId_onAcceptedBootstrap", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/identity/bootstrap/admin`, {
      body: JSON.stringify({
        bootstrapSecret: "operator-secret",
        displayName: "Root Admin",
        login: "admin@example.test",
        password: "NON_SECRET_TEST_VALUE",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        hasSessionCookie: response.headers.get("set-cookie")?.includes("agonara_session="),
        hasSessionIdInBody: JSON.stringify(body).includes("session-1"),
        bodyStatus: body.status,
        identityId: body.value.identity.id,
        isAdmin: body.value.identity.isAdmin,
        hasCsrfToken: typeof body.value.csrfToken === "string",
      },
      {
        statusCode: 200,
        hasSessionCookie: true,
        hasSessionIdInBody: false,
        bodyStatus: "accepted",
        identityId: "identity-1",
        isAdmin: true,
        hasCsrfToken: true,
      },
    );
  } finally {
    await close();
  }
});

test("programsList_shouldRejectMissingSession_withSessionNotFound", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram();

  try {
    const response = await fetch(`${baseUrl}/programs`);

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

test("programsList_shouldRejectDisabledSessionIdentity_withIdentityDisabled", async () => {
  const { baseUrl, close, database } = await listenWithIdentityAndProgram();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    database
      .prepare("update identities set state = 'disabled', disabled_at = ? where id = ?")
      .run("2026-05-27T10:00:00.000Z", bootstrap.body.value.identity.id);
    const response = await fetch(`${baseUrl}/programs`, {
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

test("programsList_shouldReturnEmptyPrograms_onActiveSessionWithEmptyStore", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 200,
        body: { status: "accepted", value: { programs: [] } },
      },
    );
  } finally {
    await close();
  }
});

test("corpusSourcesList_shouldRejectMissingSession_withSessionNotFound", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus();

  try {
    const response = await fetch(`${baseUrl}/programs/program-1/sources`);

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

test("assessmentCriteriaList_shouldRejectMissingSession_withSessionNotFound", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus();

  try {
    const response = await fetch(`${baseUrl}/programs/program-1/assessment-criteria`);

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

test("openAnswerChecksList_shouldRejectDisabledSessionIdentity_withIdentityDisabled", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    database
      .prepare("update identities set state = 'disabled', disabled_at = ? where id = ?")
      .run("2026-05-27T10:00:00.000Z", bootstrap.body.value.identity.id);
    const response = await fetch(`${baseUrl}/programs/program-1/open-answer-checks`, {
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

test("quickCheckCandidateRoutes_shouldRejectMissingSession_withSessionNotFound", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus();

  try {
    const response = await fetch(`${baseUrl}/programs/program-1/quick-checks/candidates`, {
      body: JSON.stringify({
        answerKeyOptionIndex: 0,
        checkKind: "single_select_quick_check",
        options: ["Yes", "No"],
        prompt: "Does the invariant hold?",
        title: "Invariant check",
      }),
      headers: { "content-type": "application/json" },
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

test("quickCheckCandidateRoutes_shouldRejectMissingAndInvalidCsrf_beforeMutation", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      createQuickCheckCandidate: () => {
        throw new Error("quick check candidate command should not run before CSRF passes");
      },
    },
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const cases = [
      {},
      { "x-agonara-csrf": "wrong-token" },
    ];
    const results = [];
    for (const headers of cases) {
      const response = await fetch(`${baseUrl}/programs/program-1/quick-checks/candidates`, {
        body: JSON.stringify({
          answerKeyOptionIndex: 0,
          checkKind: "single_select_quick_check",
          options: ["Yes", "No"],
          prompt: "Does the invariant hold?",
          title: "Invariant check",
        }),
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
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
      [
        {
          statusCode: 403,
          body: { status: "rejected", reason: "csrf_required" },
        },
        {
          statusCode: 403,
          body: { status: "rejected", reason: "csrf_invalid" },
        },
      ],
    );
  } finally {
    await close();
  }
});

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

test("quickCheckCandidateRoutes_shouldRedactFaultResponsesAndLogs", async () => {
  const logEvents = [];
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      createQuickCheckCandidate: () => {
        throw new Error(
          "answer-key-secret session-1 csrf-token-1 idempotency-key cookie sql stack /tmp/db.sqlite postgres://db",
        );
      },
    },
    log: $0 => logEvents.push($0),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs/program-1/quick-checks/candidates`, {
      body: JSON.stringify({
        answerKeyOptionIndex: 0,
        checkKind: "single_select_quick_check",
        options: ["Yes", "No"],
        prompt: "Does the invariant hold?",
        title: "Invariant check",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
        "x-request-id": "quick-check-fault-log",
      },
      method: "POST",
    });
    const logEvent = logEvents.find($0 => $0.requestId === "quick-check-fault-log");

    assert.deepEqual(
      {
        statusCode: response.status,
        responseRequestId: response.headers.get("x-request-id"),
        body: await response.json(),
        log: {
          errorKind: logEvent?.errorKind,
          hasSensitiveDetail: hasSensitiveCompletionLogDetail(logEvent),
          operation: logEvent?.operation,
          outcome: logEvent?.outcome,
          requestId: logEvent?.requestId,
          severity: logEvent?.severity,
        },
      },
      {
        statusCode: 500,
        responseRequestId: "quick-check-fault-log",
        body: { status: "fault", reason: "internal_error" },
        log: {
          errorKind: "unexpected",
          hasSensitiveDetail: false,
          operation: "POST /programs/program-1/quick-checks/candidates",
          outcome: "fault",
          requestId: "quick-check-fault-log",
          severity: "error",
        },
      },
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

test("assessmentCriteriaList_shouldDelegateToCorpusCommands_onActiveSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listAcceptedAssessmentCriteria: ({ actingIdentityId, programId }) => ({
        status: "accepted",
        value: {
          acceptedAssessmentCriteria: [{ actingIdentityId, programId }],
        },
      }),
    },
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs/program-1/assessment-criteria`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            acceptedAssessmentCriteria: [{ actingIdentityId: "identity-1", programId: "program-1" }],
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("assessmentRoutes_shouldMapAssessmentRejections_toHttpStatuses", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listAcceptedAssessmentCriteria: ({ programId }) => ({ status: "rejected", reason: programId }),
    },
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const cases = [
      ["identity_not_active", 403],
      ["criterion_candidate_not_found", 404],
      ["criterion_entity_not_found", 404],
      ["criterion_revision_not_found", 404],
      ["check_candidate_not_found", 404],
      ["check_entity_not_found", 404],
      ["check_revision_not_found", 404],
      ["criterion_candidate_already_accepted", 409],
      ["criterion_candidate_already_rejected", 409],
      ["criterion_entity_program_mismatch", 409],
      ["check_candidate_already_accepted", 409],
      ["check_candidate_already_rejected", 409],
      ["check_entity_program_mismatch", 409],
    ];
    const responses = [];
    for (const [reason] of cases) {
      const response = await fetch(`${baseUrl}/programs/${reason}/assessment-criteria`, {
        headers: { cookie: bootstrap.cookie },
      });
      responses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      responses,
      cases.map(([reason, statusCode]) => ({
        body: { status: "rejected", reason },
        statusCode,
      })),
    );
  } finally {
    await close();
  }
});

test("assessmentCriterionCandidates_shouldCreateAndListDraftCandidate_onCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(30) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const createdSource = await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "textbook",
      title: "Linear Algebra Done Right",
    });
    const sourceId = (await createdSource.json()).value.programSource.sourceId;
    const createdCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain why a vector space is closed under addition.",
      sourceIds: [sourceId],
      title: "Vector-space closure",
    });
    const listedCandidates = await fetch(
      `${baseUrl}/programs/${programId}/assessment-criteria/candidates?status=draft`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        created: assessmentCriterionCandidateProjection(await createdCandidate.json()),
        createdStatusCode: createdCandidate.status,
        listed: assessmentCriterionCandidateListProjection(await listedCandidates.json()),
        listedStatusCode: listedCandidates.status,
      },
      {
        created: {
          body: "Explain why a vector space is closed under addition.",
          programId,
          sourceIds: [sourceId],
          status: "draft",
          title: "Vector-space closure",
        },
        createdStatusCode: 200,
        listed: ["Vector-space closure"],
        listedStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("assessmentCriterionAcceptance_shouldCreateAcceptedRevision_onCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(50) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const createdSource = await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "textbook",
      title: "Linear Algebra Done Right",
    });
    const sourceId = (await createdSource.json()).value.programSource.sourceId;
    const firstCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition.",
      sourceIds: [sourceId],
      title: "Vector-space closure",
    });
    const firstCandidateId = (await firstCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    const firstAccepted = await acceptAssessmentCriterionCandidate(baseUrl, bootstrap, firstCandidateId, {});

    assert.deepEqual(
      {
        body: acceptedAssessmentCriterionProjection(await firstAccepted.json()),
        statusCode: firstAccepted.status,
      },
      {
        body: {
          acceptedFromCandidateId: firstCandidateId,
          programId,
          sourceIds: [sourceId],
          title: "Vector-space closure",
        },
        statusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("assessmentCriterionRejection_shouldRejectDraftCandidate_onCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(30) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const candidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain rejected criterion.",
      title: "Rejected criterion",
    });
    const candidateId = (await candidate.json()).value.assessmentCriterionCandidate.candidateId;
    const rejected = await rejectAssessmentCriterionCandidate(baseUrl, bootstrap, candidateId);

    assert.deepEqual(
      {
        body: assessmentCriterionCandidateProjection(await rejected.json()),
        statusCode: rejected.status,
      },
      {
        body: {
          body: "Explain rejected criterion.",
          programId,
          sourceIds: [],
          status: "rejected",
          title: "Rejected criterion",
        },
        statusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckCandidates_shouldCreateAndListDraftCandidate_onCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(30) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const createdSource = await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "textbook",
      title: "Linear Algebra Done Right",
    });
    const sourceId = (await createdSource.json()).value.programSource.sourceId;
    const createdCandidate = await createQuickCheckCandidate(baseUrl, bootstrap, programId, {
      answerKeyOptionIndex: 1,
      checkKind: "single_select_quick_check",
      options: ["A set with addition only", "A set closed under addition and scalar multiplication"],
      prompt: "Which statement describes a vector space?",
      sourceIds: [sourceId],
      title: "Vector-space definition",
    });
    const listedCandidates = await fetch(
      `${baseUrl}/programs/${programId}/quick-checks/candidates?status=draft`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        created: quickCheckCandidateProjection(await createdCandidate.json()),
        createdStatusCode: createdCandidate.status,
        listed: quickCheckCandidateListProjection(await listedCandidates.json()),
        listedStatusCode: listedCandidates.status,
      },
      {
        created: {
          answerKeyText: "A set closed under addition and scalar multiplication",
          checkKind: "single_select_quick_check",
          optionTexts: ["A set with addition only", "A set closed under addition and scalar multiplication"],
          programId,
          prompt: "Which statement describes a vector space?",
          sourceIds: [sourceId],
          status: "draft",
          title: "Vector-space definition",
        },
        createdStatusCode: 200,
        listed: ["Vector-space definition"],
        listedStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckAcceptanceAndRejection_shouldExposeCuratorRevisionAndRejectedCandidate", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(50) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const firstCandidate = await createQuickCheckCandidate(baseUrl, bootstrap, programId, {
      answerKeyOptionIndex: 0,
      checkKind: "single_select_quick_check",
      options: ["Closure under addition", "Finite dimension"],
      prompt: "Which property is required for a vector space?",
      title: "Closure check",
    });
    const firstCandidateId = (await firstCandidate.json()).value.quickCheckCandidate.candidateId;
    const firstAccepted = await acceptQuickCheckCandidate(baseUrl, bootstrap, firstCandidateId, {});
    const acceptedQuickCheck = (await firstAccepted.json()).value.acceptedQuickCheck;
    const curationRevision = await fetch(
      `${baseUrl}/quick-checks/revisions/${acceptedQuickCheck.revisionId}/curation`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const rejectedCandidate = await createQuickCheckCandidate(baseUrl, bootstrap, programId, {
      answerKeyOptionIndex: 1,
      checkKind: "single_select_quick_check",
      options: ["No closure", "Closure under scalar multiplication"],
      prompt: "Which property is also required?",
      title: "Scalar closure check",
    });
    const rejectedCandidateId = (await rejectedCandidate.json()).value.quickCheckCandidate.candidateId;
    const rejected = await rejectQuickCheckCandidate(baseUrl, bootstrap, rejectedCandidateId);

    assert.deepEqual(
      {
        accepted: acceptedQuickCheckForCurationProjection({ status: "accepted", value: { acceptedQuickCheck } }),
        acceptedStatusCode: firstAccepted.status,
        curation: acceptedQuickCheckForCurationProjection(await curationRevision.json()),
        curationStatusCode: curationRevision.status,
        rejected: quickCheckCandidateProjection(await rejected.json()),
        rejectedStatusCode: rejected.status,
      },
      {
        accepted: {
          acceptedFromCandidateId: firstCandidateId,
          answerKeyText: "Closure under addition",
          optionTexts: ["Closure under addition", "Finite dimension"],
          programId,
          prompt: "Which property is required for a vector space?",
          title: "Closure check",
        },
        acceptedStatusCode: 200,
        curation: {
          acceptedFromCandidateId: firstCandidateId,
          answerKeyText: "Closure under addition",
          optionTexts: ["Closure under addition", "Finite dimension"],
          programId,
          prompt: "Which property is required for a vector space?",
          title: "Closure check",
        },
        curationStatusCode: 200,
        rejected: {
          answerKeyText: "Closure under scalar multiplication",
          checkKind: "single_select_quick_check",
          optionTexts: ["No closure", "Closure under scalar multiplication"],
          programId,
          prompt: "Which property is also required?",
          sourceIds: [],
          status: "rejected",
          title: "Scalar closure check",
        },
        rejectedStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckCuratorRoutes_shouldRejectInvalidBodiesAndUnauthorizedCallers", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(50) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "quick-check-curator@example.test",
    });
    const outsider = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Outsider",
      login: "quick-check-outsider@example.test",
    });
    const program = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    const route = `/programs/${programId}/quick-checks/candidates`;
    const candidate = await createQuickCheckCandidate(baseUrl, curator, programId, {
      answerKeyOptionIndex: 0,
      checkKind: "single_select_quick_check",
      options: ["Closed", "Open"],
      prompt: "Which property is required?",
      title: "Closure check",
    });
    const candidateId = (await candidate.json()).value.quickCheckCandidate.candidateId;
    const mutationRoutes = [
      route,
      `/quick-checks/candidates/${candidateId}/acceptance`,
      `/quick-checks/candidates/${candidateId}/rejection`,
    ];
    const missingSessionResponses = [];
    for (const mutationRoute of mutationRoutes) {
      const response = await fetch(`${baseUrl}${mutationRoute}`, {
        body: mutationRoute === route ? JSON.stringify({
          answerKeyOptionIndex: 0,
          checkKind: "single_select_quick_check",
          options: ["Closed", "Open"],
          prompt: "Which property is required?",
          title: "Closure check",
        }) : undefined,
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      missingSessionResponses.push({ body: await response.json(), statusCode: response.status });
    }
    const invalidBodies = [
      undefined,
      "not valid json{{{",
      JSON.stringify([]),
      JSON.stringify({}),
      JSON.stringify({
        answerKeyOptionIndex: 0,
        checkKind: "single_select_quick_check",
        extra: true,
        options: ["Closed", "Open"],
        prompt: "Which property is required?",
        title: "Closure check",
      }),
      JSON.stringify({
        answerKeyOptionIndex: 0,
        checkKind: "open_answer",
        options: ["Closed", "Open"],
        prompt: "Which property is required?",
        title: "Closure check",
      }),
      JSON.stringify({
        answerKeyOptionIndex: 0,
        checkKind: "single_select_quick_check",
        options: ["Closed"],
        prompt: "Which property is required?",
        title: "Closure check",
      }),
      JSON.stringify({
        answerKeyOptionIndex: 2,
        checkKind: "single_select_quick_check",
        options: ["Closed", "Open"],
        prompt: "Which property is required?",
        title: "Closure check",
      }),
      JSON.stringify({
        answerKeyOptionIndex: 0,
        checkKind: "single_select_quick_check",
        options: ["Closed", " closed "],
        prompt: "Which property is required?",
        title: "Closure check",
      }),
    ];
    const invalidResponses = [];
    for (const body of invalidBodies) {
      const response = await fetch(`${baseUrl}${route}`, {
        body,
        headers: {
          cookie: curator.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": curator.csrfToken,
        },
        method: "POST",
      });
      invalidResponses.push({ body: await response.json(), statusCode: response.status });
    }
    const unauthorizedResponses = [];
    for (const session of [bootstrap, outsider]) {
      const response = await fetch(`${baseUrl}${route}`, { headers: { cookie: session.cookie } });
      unauthorizedResponses.push({ body: await response.json(), statusCode: response.status });
    }
    const unknownProgram = await fetch(`${baseUrl}/programs/program-missing/quick-checks/candidates`, {
      headers: { cookie: curator.cookie },
    });

    assert.deepEqual(
      {
        invalidResponses,
        missingSessionResponses,
        unauthorizedResponses,
        unknownProgram: { body: await unknownProgram.json(), statusCode: unknownProgram.status },
      },
      {
        invalidResponses: invalidBodies.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
        missingSessionResponses: mutationRoutes.map(() => ({
          body: { status: "rejected", reason: "session_not_found" },
          statusCode: 401,
        })),
        unauthorizedResponses: [
          {
            body: { status: "rejected", reason: "admin_or_curator_required" },
            statusCode: 403,
          },
          {
            body: { status: "rejected", reason: "admin_or_curator_required" },
            statusCode: 403,
          },
        ],
        unknownProgram: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckDeliveries_shouldListAndReturnStudentSafeRevision_onEffectiveStudent", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(50) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "delivery-curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "delivery-student@example.test",
    });
    const program = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    await joinStudentProgram(baseUrl, student, programId);
    const acceptedQuickCheck = await createAcceptedQuickCheck(baseUrl, curator, programId, {
      answerKeyOptionIndex: 1,
      options: ["Only addition", "Addition and scalar multiplication"],
      prompt: "Which statement describes a vector space?",
      title: "Vector-space definition",
    });
    const list = await fetch(`${baseUrl}/programs/${programId}/quick-checks`, {
      headers: { cookie: student.cookie },
    });
    const detail = await fetch(`${baseUrl}/quick-checks/revisions/${acceptedQuickCheck.revisionId}`, {
      headers: { cookie: student.cookie },
    });
    const serializedStudentResponses = JSON.stringify([await list.clone().json(), await detail.clone().json()]);

    assert.deepEqual(
      {
        detail: quickCheckDeliveryProjection(await detail.json()),
        detailStatusCode: detail.status,
        hasStudentLeaks: containsQuickCheckStudentDeliveryLeaks(serializedStudentResponses),
        list: quickCheckDeliveryListProjection(await list.json()),
        listStatusCode: list.status,
      },
      {
        detail: {
          checkKind: "single_select_quick_check",
          optionTexts: ["Only addition", "Addition and scalar multiplication"],
          programId,
          prompt: "Which statement describes a vector space?",
          title: "Vector-space definition",
        },
        detailStatusCode: 200,
        hasStudentLeaks: false,
        list: ["Vector-space definition"],
        listStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckDeliveries_shouldRejectNonStudentsUnknownsAndCursorScopeMismatch", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(60) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "delivery-curator-denied@example.test",
    });
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "delivery-student-denied@example.test",
    });
    const program = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    await joinStudentProgram(baseUrl, student, programId);
    await createAcceptedQuickCheck(baseUrl, curator, programId, { title: "First check" });
    await createAcceptedQuickCheck(baseUrl, curator, programId, { title: "Second check" });
    const firstPage = await fetch(`${baseUrl}/programs/${programId}/quick-checks/candidates?limit=1`, {
      headers: { cookie: curator.cookie },
    });
    const firstPageBody = await firstPage.json();
    const cursorScopeMismatch = await fetch(
      `${baseUrl}/programs/${programId}/quick-checks?cursor=${firstPageBody.value.nextCursor}`,
      { headers: { cookie: student.cookie } },
    );
    const responses = [
      await getHttpResponse(baseUrl, `/programs/${programId}/quick-checks`, curator),
      await getHttpResponse(baseUrl, `/programs/program-missing/quick-checks`, student),
      await getHttpResponse(baseUrl, "/quick-checks/revisions/revision-missing", student),
      { body: await cursorScopeMismatch.json(), statusCode: cursorScopeMismatch.status },
    ];

    assert.deepEqual(
      responses,
      [
        {
          body: { status: "rejected", reason: "participation_required" },
          statusCode: 403,
        },
        {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
        {
          body: { status: "rejected", reason: "quick_check_revision_not_found" },
          statusCode: 404,
        },
        {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
      ],
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
    const nonOwner = await getHttpResponse(baseUrl, `/quick-check-attempts/${attemptId}`, otherStudent);
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
        nonOwner,
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
        nonOwner: {
          body: { status: "rejected", reason: "attempt_not_found" },
          statusCode: 404,
        },
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

test("acceptedAssessmentCriteria_shouldListCurrentAndReturnHistoricalRevision_onCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(50) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const firstCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition.",
      title: "Vector-space closure",
    });
    const firstCandidateId = (await firstCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    const firstAccepted = await acceptAssessmentCriterionCandidate(baseUrl, bootstrap, firstCandidateId, {});
    const firstAcceptedCriterion = (await firstAccepted.json()).value.acceptedAssessmentCriterion;
    const replacementCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition and scalar multiplication.",
      title: "Vector-space closure revised",
    });
    const replacementCandidateId = (await replacementCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    await acceptAssessmentCriterionCandidate(baseUrl, bootstrap, replacementCandidateId, {
      targetEntityId: firstAcceptedCriterion.entityId,
    });
    const listed = await fetch(`${baseUrl}/programs/${programId}/assessment-criteria`, {
      headers: { cookie: bootstrap.cookie },
    });
    const historical = await fetch(`${baseUrl}/assessment-criteria/revisions/${firstAcceptedCriterion.revisionId}`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        historical: acceptedAssessmentCriterionProjection(await historical.json()),
        historicalStatusCode: historical.status,
        listedTitles: (await listed.json()).value.acceptedAssessmentCriteria.map($0 => $0.title),
        listedStatusCode: listed.status,
      },
      {
        historical: {
          acceptedFromCandidateId: firstCandidateId,
          programId,
          sourceIds: [],
          title: "Vector-space closure",
        },
        historicalStatusCode: 200,
        listedTitles: ["Vector-space closure revised"],
        listedStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerCheckCandidates_shouldCreateAndListDraftCandidate_onAcceptedCriterion", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(60) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const criterionCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition.",
      title: "Vector-space closure",
    });
    const criterionCandidateId = (await criterionCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    const acceptedCriterion = await acceptAssessmentCriterionCandidate(
      baseUrl,
      bootstrap,
      criterionCandidateId,
      {},
    );
    const criterionEntityId = (await acceptedCriterion.json()).value.acceptedAssessmentCriterion.entityId;
    const createdCheck = await createOpenAnswerCheckCandidate(baseUrl, bootstrap, programId, {
      checkKind: "open_answer",
      criterionEntityIds: [criterionEntityId],
      prompt: "Why is closure under addition required?",
      title: "Closure check",
    });
    const listedChecks = await fetch(`${baseUrl}/programs/${programId}/open-answer-checks/candidates?status=draft`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        created: openAnswerCheckCandidateProjection(await createdCheck.json()),
        createdStatusCode: createdCheck.status,
        listed: openAnswerCheckCandidateListProjection(await listedChecks.json()),
        listedStatusCode: listedChecks.status,
      },
      {
        created: {
          checkKind: "open_answer",
          criterionEntityIds: [criterionEntityId],
          programId,
          prompt: "Why is closure under addition required?",
          status: "draft",
          title: "Closure check",
        },
        createdStatusCode: 200,
        listed: ["Closure check"],
        listedStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerCheckAcceptance_shouldSnapshotCriterionRevision_onCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(60) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const criterionCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition.",
      title: "Vector-space closure",
    });
    const criterionCandidateId = (await criterionCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    const acceptedCriterion = await acceptAssessmentCriterionCandidate(
      baseUrl,
      bootstrap,
      criterionCandidateId,
      {},
    );
    const acceptedCriterionBody = (await acceptedCriterion.json()).value.acceptedAssessmentCriterion;
    const checkCandidate = await createOpenAnswerCheckCandidate(baseUrl, bootstrap, programId, {
      checkKind: "open_answer",
      criterionEntityIds: [acceptedCriterionBody.entityId],
      prompt: "Why is closure under addition required?",
      title: "Closure check",
    });
    const checkCandidateId = (await checkCandidate.json()).value.openAnswerCheckCandidate.candidateId;
    const acceptedCheck = await acceptOpenAnswerCheckCandidate(baseUrl, bootstrap, checkCandidateId, {});

    assert.deepEqual(
      {
        body: acceptedOpenAnswerCheckProjection(await acceptedCheck.json()),
        statusCode: acceptedCheck.status,
      },
      {
        body: {
          acceptedFromCandidateId: checkCandidateId,
          criterionRevisionIds: [acceptedCriterionBody.revisionId],
          programId,
          title: "Closure check",
        },
        statusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("openAnswerCheckRejection_shouldRejectDraftCandidate_onCuratorSession", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(60) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const criterionCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition.",
      title: "Vector-space closure",
    });
    const criterionCandidateId = (await criterionCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    const acceptedCriterion = await acceptAssessmentCriterionCandidate(
      baseUrl,
      bootstrap,
      criterionCandidateId,
      {},
    );
    const criterionEntityId = (await acceptedCriterion.json()).value.acceptedAssessmentCriterion.entityId;
    const checkCandidate = await createOpenAnswerCheckCandidate(baseUrl, bootstrap, programId, {
      checkKind: "open_answer",
      criterionEntityIds: [criterionEntityId],
      prompt: "Why is closure under addition required?",
      title: "Rejected closure check",
    });
    const checkCandidateId = (await checkCandidate.json()).value.openAnswerCheckCandidate.candidateId;
    const rejectedCheck = await rejectOpenAnswerCheckCandidate(baseUrl, bootstrap, checkCandidateId);

    assert.deepEqual(
      {
        body: openAnswerCheckCandidateProjection(await rejectedCheck.json()),
        statusCode: rejectedCheck.status,
      },
      {
        body: {
          checkKind: "open_answer",
          criterionEntityIds: [criterionEntityId],
          programId,
          prompt: "Why is closure under addition required?",
          status: "rejected",
          title: "Rejected closure check",
        },
        statusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("acceptedOpenAnswerChecks_shouldListCurrentAndPreserveCriterionSnapshot_onCriterionRevision", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(80) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const criterionCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition.",
      title: "Vector-space closure",
    });
    const criterionCandidateId = (await criterionCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    const acceptedCriterion = await acceptAssessmentCriterionCandidate(
      baseUrl,
      bootstrap,
      criterionCandidateId,
      {},
    );
    const acceptedCriterionBody = (await acceptedCriterion.json()).value.acceptedAssessmentCriterion;
    const checkCandidate = await createOpenAnswerCheckCandidate(baseUrl, bootstrap, programId, {
      checkKind: "open_answer",
      criterionEntityIds: [acceptedCriterionBody.entityId],
      prompt: "Why is closure under addition required?",
      title: "Closure check",
    });
    const checkCandidateId = (await checkCandidate.json()).value.openAnswerCheckCandidate.candidateId;
    const acceptedCheck = await acceptOpenAnswerCheckCandidate(baseUrl, bootstrap, checkCandidateId, {});
    const acceptedCheckBody = (await acceptedCheck.json()).value.acceptedOpenAnswerCheck;
    const replacementCriterionCandidate = await createAssessmentCriterionCandidate(baseUrl, bootstrap, programId, {
      body: "Explain closure under addition and scalar multiplication.",
      title: "Vector-space closure revised",
    });
    const replacementCriterionCandidateId =
      (await replacementCriterionCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    await acceptAssessmentCriterionCandidate(baseUrl, bootstrap, replacementCriterionCandidateId, {
      targetEntityId: acceptedCriterionBody.entityId,
    });
    const listed = await fetch(`${baseUrl}/programs/${programId}/open-answer-checks`, {
      headers: { cookie: bootstrap.cookie },
    });
    const historical = await fetch(`${baseUrl}/open-answer-checks/revisions/${acceptedCheckBody.revisionId}`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        historical: acceptedOpenAnswerCheckProjection(await historical.json()),
        historicalStatusCode: historical.status,
        listed: acceptedOpenAnswerCheckListProjection(await listed.json()),
        listedStatusCode: listed.status,
      },
      {
        historical: {
          acceptedFromCandidateId: checkCandidateId,
          criterionRevisionIds: [acceptedCriterionBody.revisionId],
          programId,
          title: "Closure check",
        },
        historicalStatusCode: 200,
        listed: ["Closure check"],
        listedStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("assessmentAcceptance_shouldRejectBlankTargetEntityIds_withValidationFailed", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const cases = [
      "/assessment-criteria/candidates/candidate-1/acceptance",
      "/open-answer-checks/candidates/candidate-1/acceptance",
    ];
    const responses = [];
    for (const route of cases) {
      const response = await fetch(`${baseUrl}${route}`, {
        body: JSON.stringify({ targetEntityId: "   " }),
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      responses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      responses,
      cases.map(() => ({
        body: { status: "rejected", reason: "validation_failed" },
        statusCode: 400,
      })),
    );
  } finally {
    await close();
  }
});

test("assessmentLists_shouldRejectInvalidQueriesAndRouteMismatchedCursors", async () => {
  const acceptedAssessmentCriteria = Array.from({ length: 51 }, (_, index) => ({
    entityId: `criterion-${index + 1}`,
  }));
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listAcceptedAssessmentCriteria: () => ({
        status: "accepted",
        value: { acceptedAssessmentCriteria },
      }),
      listAcceptedOpenAnswerChecks: () => ({
        status: "accepted",
        value: { acceptedOpenAnswerChecks: [] },
      }),
      listAssessmentCriterionCandidates: () => ({
        status: "accepted",
        value: {
          assessmentCriterionCandidates: [
            { candidateId: "criterion-candidate-1" },
            { candidateId: "criterion-candidate-2" },
          ],
        },
      }),
      listOpenAnswerCheckCandidates: () => ({
        status: "accepted",
        value: { openAnswerCheckCandidates: [] },
      }),
    },
    ids: manyIds(20),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const invalidCases = [
      "/programs/program-1/assessment-criteria/candidates?status=queued",
      "/programs/program-1/assessment-criteria/candidates?limit=0",
      "/programs/program-1/assessment-criteria?limit=101",
      "/programs/program-1/open-answer-checks/candidates?limit=abc",
      "/programs/program-1/open-answer-checks?cursor=unknown",
    ];
    const invalidResponses = [];
    for (const route of invalidCases) {
      const response = await fetch(`${baseUrl}${route}`, {
        headers: { cookie: bootstrap.cookie },
      });
      invalidResponses.push({ body: await response.json(), statusCode: response.status });
    }
    const defaultPage = await fetch(`${baseUrl}/programs/program-1/assessment-criteria`, {
      headers: { cookie: bootstrap.cookie },
    });
    const defaultBody = await defaultPage.json();
    const candidatePage = await fetch(
      `${baseUrl}/programs/program-1/assessment-criteria/candidates?limit=1`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const candidateBody = await candidatePage.json();
    const routeMismatch = await fetch(
      `${baseUrl}/programs/program-1/open-answer-checks/candidates?cursor=${candidateBody.value.nextCursor}`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        defaultPage: {
          count: defaultBody.value.acceptedAssessmentCriteria.length,
          hasNextCursor: typeof defaultBody.value.nextCursor === "string",
          statusCode: defaultPage.status,
        },
        invalidResponses,
        routeMismatch: {
          body: await routeMismatch.json(),
          statusCode: routeMismatch.status,
        },
        cursorHasSecrets: [
          bootstrap.csrfToken,
          "operator-secret",
          "session",
          "select ",
          "/Users/",
        ].some($0 => candidateBody.value.nextCursor?.includes($0)),
      },
      {
        defaultPage: {
          count: 50,
          hasNextCursor: true,
          statusCode: 200,
        },
        invalidResponses: invalidCases.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
        routeMismatch: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
        cursorHasSecrets: false,
      },
    );
  } finally {
    await close();
  }
});

test("assessmentCandidateCreation_shouldRejectCsrfAndInvalidBodies", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(40) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const program = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    const criterionRoute = `/programs/${programId}/assessment-criteria/candidates`;
    const checkRoute = `/programs/${programId}/open-answer-checks/candidates`;
    const stateMutationCases = [
      [criterionRoute, JSON.stringify({ body: "Explain closure.", title: "Closure" })],
      [checkRoute, JSON.stringify({
        checkKind: "open_answer",
        criterionEntityIds: ["criterion-1"],
        prompt: "Why?",
        title: "Closure check",
      })],
      ["/assessment-criteria/candidates/candidate-missing/acceptance", undefined],
      ["/assessment-criteria/candidates/candidate-missing/rejection", undefined],
      ["/open-answer-checks/candidates/candidate-missing/acceptance", undefined],
      ["/open-answer-checks/candidates/candidate-missing/rejection", undefined],
    ];
    const csrfResponses = [];
    for (const [route, body] of stateMutationCases) {
      for (const csrfToken of [undefined, "wrong-token"]) {
        const response = await fetch(`${baseUrl}${route}`, {
          body,
          headers: {
            cookie: bootstrap.cookie,
            "content-type": "application/json",
            ...(csrfToken ? { "x-agonara-csrf": csrfToken } : {}),
          },
          method: "POST",
        });
        csrfResponses.push({ body: await response.json(), statusCode: response.status });
      }
    }
    const invalidCases = [
      [criterionRoute, undefined],
      [criterionRoute, "not valid json{{{"],
      [criterionRoute, JSON.stringify([])],
      [criterionRoute, JSON.stringify({})],
      [criterionRoute, JSON.stringify({ body: "Body", extra: true, title: "Title" })],
      [criterionRoute, JSON.stringify({ body: "   ", title: "Title" })],
      [criterionRoute, JSON.stringify({ body: "Body", title: "   " })],
      [criterionRoute, JSON.stringify({ body: "Body", rationale: 42, title: "Title" })],
      [criterionRoute, JSON.stringify({ body: "Body", sourceIds: "source-1", title: "Title" })],
      [criterionRoute, JSON.stringify({ body: "Body", sourceIds: [1], title: "Title" })],
      [checkRoute, undefined],
      [checkRoute, "not valid json{{{"],
      [checkRoute, JSON.stringify([])],
      [checkRoute, JSON.stringify({})],
      [checkRoute, JSON.stringify({ criterionEntityIds: ["criterion-1"], extra: true })],
      [checkRoute, JSON.stringify({
        checkKind: "multiple_choice",
        criterionEntityIds: ["criterion-1"],
        prompt: "Prompt",
        title: "Title",
      })],
      [checkRoute, JSON.stringify({
        checkKind: "open_answer",
        criterionEntityIds: [],
        prompt: "Prompt",
        title: "Title",
      })],
      [checkRoute, JSON.stringify({
        checkKind: "open_answer",
        criterionEntityIds: ["criterion-1"],
        title: "Title",
      })],
      [checkRoute, JSON.stringify({
        checkKind: "open_answer",
        criterionEntityIds: ["criterion-1"],
        prompt: "   ",
        title: "Title",
      })],
      [checkRoute, JSON.stringify({
        checkKind: "open_answer",
        criterionEntityIds: ["criterion-1"],
        prompt: "Prompt",
        rationale: 42,
        title: "Title",
      })],
      [checkRoute, JSON.stringify({
        checkKind: "open_answer",
        criterionEntityIds: "criterion-1",
        prompt: "Prompt",
        title: "Title",
      })],
      [checkRoute, JSON.stringify({
        checkKind: "open_answer",
        criterionEntityIds: [1],
        prompt: "Prompt",
        title: "Title",
      })],
    ];
    const invalidResponses = [];
    for (const [route, body] of invalidCases) {
      const response = await fetch(`${baseUrl}${route}`, {
        body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      invalidResponses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      {
        csrfResponses,
        invalidResponses,
      },
      {
        csrfResponses: stateMutationCases.flatMap(() => [
          {
            body: { status: "rejected", reason: "csrf_required" },
            statusCode: 403,
          },
          {
            body: { status: "rejected", reason: "csrf_invalid" },
            statusCode: 403,
          },
        ]),
        invalidResponses: invalidCases.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
      },
    );
  } finally {
    await close();
  }
});

test("assessmentAcceptanceAndRejection_shouldEnforceBodyContracts", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const acceptanceRoutes = [
      "/assessment-criteria/candidates/candidate-missing/acceptance",
      "/open-answer-checks/candidates/candidate-missing/acceptance",
    ];
    const rejectionRoutes = [
      "/assessment-criteria/candidates/candidate-missing/rejection",
      "/open-answer-checks/candidates/candidate-missing/rejection",
    ];
    const invalidCases = [
      ...acceptanceRoutes.flatMap(route => [
        [route, "not valid json{{{"],
        [route, JSON.stringify([])],
        [route, JSON.stringify({ note: "ignored" })],
        [route, JSON.stringify({ targetEntityId: 42 })],
      ]),
      ...rejectionRoutes.flatMap(route => [
        [route, "not valid json{{{"],
        [route, JSON.stringify([])],
        [route, JSON.stringify({ reason: "duplicate" })],
      ]),
    ];
    const invalidResponses = [];
    for (const [route, body] of invalidCases) {
      const response = await fetch(`${baseUrl}${route}`, {
        body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      invalidResponses.push({ body: await response.json(), statusCode: response.status });
    }
    const missingBodyResponses = [];
    for (const route of [...acceptanceRoutes, ...rejectionRoutes]) {
      const response = await fetch(`${baseUrl}${route}`, {
        headers: {
          cookie: bootstrap.cookie,
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      missingBodyResponses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      {
        invalidResponses,
        missingBodyResponses,
      },
      {
        invalidResponses: invalidCases.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
        missingBodyResponses: [
          {
            body: { status: "rejected", reason: "criterion_candidate_not_found" },
            statusCode: 404,
          },
          {
            body: { status: "rejected", reason: "check_candidate_not_found" },
            statusCode: 404,
          },
          {
            body: { status: "rejected", reason: "criterion_candidate_not_found" },
            statusCode: 404,
          },
          {
            body: { status: "rejected", reason: "check_candidate_not_found" },
            statusCode: 404,
          },
        ],
      },
    );
  } finally {
    await close();
  }
});

test("assessmentRoutes_shouldKeepAdminReadsSeparateFromCuratorWrites", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({ ids: manyIds(80) });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "curator@example.test",
    });
    const outsider = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Outsider",
      login: "outsider@example.test",
    });
    const program = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await program.json()).value.program.programId;
    const candidateRoutes = [
      `/programs/${programId}/assessment-criteria/candidates`,
      `/programs/${programId}/open-answer-checks/candidates`,
    ];
    const acceptedRoutes = [
      `/programs/${programId}/assessment-criteria`,
      `/programs/${programId}/open-answer-checks`,
    ];
    const responses = [];
    for (const route of candidateRoutes) {
      responses.push(await getHttpResponse(baseUrl, route, bootstrap));
    }
    for (const route of acceptedRoutes) {
      responses.push(await getHttpResponse(baseUrl, route, bootstrap));
    }
    for (const route of candidateRoutes) {
      responses.push(await getHttpResponse(baseUrl, route, curator));
    }
    for (const route of acceptedRoutes) {
      responses.push(await getHttpResponse(baseUrl, route, outsider));
    }
    responses.push(await getHttpResponse(baseUrl, "/programs/program-missing/assessment-criteria", bootstrap));
    responses.push(await getHttpResponse(
      baseUrl,
      "/programs/program-missing/open-answer-checks/candidates",
      bootstrap,
    ));

    assert.deepEqual(
      responses,
      [
        ...candidateRoutes.map(() => ({
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        })),
        {
          body: { status: "accepted", value: { acceptedAssessmentCriteria: [] } },
          statusCode: 200,
        },
        {
          body: { status: "accepted", value: { acceptedOpenAnswerChecks: [] } },
          statusCode: 200,
        },
        {
          body: { status: "accepted", value: { assessmentCriterionCandidates: [] } },
          statusCode: 200,
        },
        {
          body: { status: "accepted", value: { openAnswerCheckCandidates: [] } },
          statusCode: 200,
        },
        ...acceptedRoutes.map(() => ({
          body: { status: "rejected", reason: "participation_required" },
          statusCode: 403,
        })),
        {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
        {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      ],
    );
  } finally {
    await close();
  }
});

test("assessmentRoutes_shouldRedactFaultResponses", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listAcceptedOpenAnswerChecks: () => {
        throw new Error(
          "authorization='bearer token' csrf='csrf-secret' cookie='session-1' " +
          "password='NON_SECRET_TEST_VALUE' sql='select * from secrets' " +
          "path='/Users/operator/private' database='file:agonara.sqlite'",
        );
      },
    },
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs/program-1/open-answer-checks`, {
      headers: { cookie: bootstrap.cookie },
    });
    const text = await response.text();

    assert.deepEqual(
      {
        body: JSON.parse(text),
        redaction: {
          hasAuthorization: text.includes("authorization"),
          hasCookie: text.includes("cookie"),
          hasCsrf: text.includes("csrf"),
          hasDatabaseUrl: text.includes("file:"),
          hasFilesystemPath: text.includes("/Users/"),
          hasPassword: text.includes("password"),
          hasSession: text.includes("session-1"),
          hasSql: text.toLowerCase().includes("select "),
        },
        statusCode: response.status,
      },
      {
        body: { status: "fault", reason: "internal_error" },
        redaction: {
          hasAuthorization: false,
          hasCookie: false,
          hasCsrf: false,
          hasDatabaseUrl: false,
          hasFilesystemPath: false,
          hasPassword: false,
          hasSession: false,
          hasSql: false,
        },
        statusCode: 500,
      },
    );
  } finally {
    await close();
  }
});

test("corpusRoutes_shouldMapCorpusRejections_toHttpStatuses", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listProgramSources: ({ programId }) => ({ status: "rejected", reason: programId }),
    },
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const cases = [
      ["participation_required", 403],
      ["candidate_not_found", 404],
      ["revision_not_found", 404],
      ["accepted_entity_not_found", 404],
      ["source_not_found", 409],
      ["source_program_mismatch", 409],
      ["candidate_already_accepted", 409],
      ["candidate_already_rejected", 409],
    ];
    const responses = [];
    for (const [reason] of cases) {
      const response = await fetch(`${baseUrl}/programs/${reason}/sources`, {
        headers: { cookie: bootstrap.cookie },
      });
      responses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      responses,
      cases.map(([reason, statusCode]) => ({
        body: { status: "rejected", reason },
        statusCode,
      })),
    );
  } finally {
    await close();
  }
});

test("corpusSourcesList_shouldRejectInvalidListQueries_withValidationFailed", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const cases = ["limit=0", "limit=101", "limit=abc", "cursor=unknown"];
    const responses = [];
    for (const query of cases) {
      const response = await fetch(`${baseUrl}/programs/program-1/sources?${query}`, {
        headers: { cookie: bootstrap.cookie },
      });
      responses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      responses,
      cases.map(() => ({
        body: { status: "rejected", reason: "validation_failed" },
        statusCode: 400,
      })),
    );
  } finally {
    await close();
  }
});

test("corpusSourcesList_shouldRejectStaleCursor_withValidationFailed", async () => {
  let calls = 0;
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listProgramSources: () => {
        calls += 1;
        return {
          status: "accepted",
          value: {
            programSources: calls === 1
              ? [{ sourceId: "source-1" }, { sourceId: "source-2" }]
              : [],
          },
        };
      },
    },
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "cursor-1"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const firstPage = await fetch(`${baseUrl}/programs/program-1/sources?limit=1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const nextCursor = (await firstPage.json()).value.nextCursor;
    const staleCursor = await fetch(`${baseUrl}/programs/program-1/sources?cursor=${nextCursor}`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        statusCode: staleCursor.status,
        body: await staleCursor.json(),
      },
      {
        statusCode: 400,
        body: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    await close();
  }
});

test("corpusSourcesList_shouldDefaultLimitToFifty", async () => {
  const programSources = Array.from({ length: 51 }, (_, index) => ({
    sourceId: `source-${index + 1}`,
  }));
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listProgramSources: () => ({
        status: "accepted",
        value: { programSources },
      }),
    },
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "cursor-1"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs/program-1/sources`, {
      headers: { cookie: bootstrap.cookie },
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        sourceCount: body.value.programSources.length,
        firstSourceId: body.value.programSources[0].sourceId,
        lastSourceId: body.value.programSources.at(-1).sourceId,
        hasNextCursor: typeof body.value.nextCursor === "string",
      },
      {
        statusCode: 200,
        sourceCount: 50,
        firstSourceId: "source-1",
        lastSourceId: "source-50",
        hasNextCursor: true,
      },
    );
  } finally {
    await close();
  }
});

test("corpusSourcesList_shouldReturnOnlyRequestedProgramSources_forCurator", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "source-1",
      "corpus-event-1",
      "program-2",
      "membership-2",
      "program-event-2",
      "membership-event-2",
      "source-2",
      "corpus-event-2",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const programA = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programAId = (await programA.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programAId, {
      sourceKind: "textbook",
      title: "Program A source",
    });
    const programB = await createProgram(baseUrl, bootstrap, { title: "Discrete Math" });
    const programBId = (await programB.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programBId, {
      sourceKind: "article",
      title: "Program B source",
    });
    const response = await fetch(`${baseUrl}/programs/${programAId}/sources`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            programSources: [
              {
                programId: programAId,
                recordedAt: "2026-05-27T10:00:00.000Z",
                recordedByIdentityId: "identity-1",
                sourceId: "source-1",
                sourceKind: "textbook",
                title: "Program A source",
              },
            ],
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("corpusSourcesList_shouldRejectNonCuratorAndUnknownProgram", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "audit-4",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const ordinary = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Ordinary Identity",
      login: "ordinary@example.test",
    });
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const nonCurator = await fetch(`${baseUrl}/programs/${programId}/sources`, {
      headers: { cookie: ordinary.cookie },
    });
    const unknownProgram = await fetch(`${baseUrl}/programs/program-ghost/sources`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        nonCurator: { body: await nonCurator.json(), statusCode: nonCurator.status },
        unknownProgram: { body: await unknownProgram.json(), statusCode: unknownProgram.status },
      },
      {
        nonCurator: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
        unknownProgram: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("corpusSourcesCreate_shouldRejectMalformedMissingAndNonObjectBodies_withValidationFailed", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const cases = [
      undefined,
      "not valid json{{{",
      JSON.stringify([]),
    ];
    const responses = [];
    for (const body of cases) {
      const response = await fetch(`${baseUrl}/programs/program-1/sources`, {
        body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      responses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      responses,
      cases.map(() => ({
        body: { status: "rejected", reason: "validation_failed" },
        statusCode: 400,
      })),
    );
  } finally {
    await close();
  }
});

test("corpusSourcesCreate_shouldRejectCsrfBeforeDomainMutation", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const missing = await fetch(`${baseUrl}/programs/${programId}/sources`, {
      body: JSON.stringify({ sourceKind: "textbook", title: "Program source" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const invalid = await fetch(`${baseUrl}/programs/${programId}/sources`, {
      body: JSON.stringify({ sourceKind: "textbook", title: "Program source" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": "wrong-token",
      },
      method: "POST",
    });

    assert.deepEqual(
      {
        missing: { body: await missing.json(), statusCode: missing.status },
        invalid: { body: await invalid.json(), statusCode: invalid.status },
        corpusEvents: listCorpusEventRecords(database, { programId }).map($0 => $0.eventType),
      },
      {
        missing: {
          body: { status: "rejected", reason: "csrf_required" },
          statusCode: 403,
        },
        invalid: {
          body: { status: "rejected", reason: "csrf_invalid" },
          statusCode: 403,
        },
        corpusEvents: [],
      },
    );
  } finally {
    await close();
  }
});

test("corpusSourcesCreate_shouldReturnProgramSourceAndRecordEvent_onAccepted", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "source-1",
      "corpus-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const response = await createProgramSource(baseUrl, bootstrap, programId, {
      citation: " Chapter 1 ",
      locator: " https://example.test/source ",
      sourceKind: "textbook",
      title: " Program source ",
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
        corpusEvents: listCorpusEventRecords(database, { programId }).map($0 => ({
          eventType: $0.eventType,
          outcome: $0.outcome,
          targetId: $0.targetId,
        })),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            programSource: {
              citation: "Chapter 1",
              locator: "https://example.test/source",
              programId,
              recordedAt: "2026-05-27T10:00:00.000Z",
              recordedByIdentityId: "identity-1",
              sourceId: "source-1",
              sourceKind: "textbook",
              title: "Program source",
            },
          },
        },
        corpusEvents: [
          {
            eventType: "program_source_recorded",
            outcome: "accepted",
            targetId: "source-1",
          },
        ],
      },
    );
  } finally {
    await close();
  }
});

test("corpusSourcesCreate_shouldRejectInvalidSourceFields_withValidationFailed", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "corpus-event-1",
      "corpus-event-2",
      "corpus-event-3",
      "corpus-event-4",
      "corpus-event-5",
      "corpus-event-6",
      "corpus-event-7",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const cases = [
      { sourceKind: "unsupported", title: "Program source" },
      { sourceKind: "textbook" },
      { sourceKind: "textbook", title: "" },
      { sourceKind: "textbook", title: " " },
      { sourceKind: "textbook", title: 42 },
      { sourceKind: "textbook", title: "Program source", locator: " " },
      { sourceKind: "textbook", title: "Program source", citation: " " },
    ];
    const responses = [];
    for (const body of cases) {
      const response = await createProgramSource(baseUrl, bootstrap, programId, body);
      responses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      responses,
      cases.map(() => ({
        body: { status: "rejected", reason: "validation_failed" },
        statusCode: 400,
      })),
    );
  } finally {
    await close();
  }
});

test("corpusCandidatesList_shouldReturnOnlyRequestedProgramCandidates_forCurator", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "source-1",
      "corpus-event-1",
      "candidate-1",
      "corpus-event-2",
      "program-2",
      "membership-2",
      "program-event-2",
      "membership-event-2",
      "source-2",
      "corpus-event-3",
      "candidate-2",
      "corpus-event-4",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const programA = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programAId = (await programA.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programAId, {
      sourceKind: "textbook",
      title: "Program A source",
    });
    await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      sourceIds: ["source-1"],
      title: "Program A topic",
    });
    const programB = await createProgram(baseUrl, bootstrap, { title: "Discrete Math" });
    const programBId = (await programB.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programBId, {
      sourceKind: "article",
      title: "Program B source",
    });
    await createCorpusCandidate(baseUrl, bootstrap, programBId, {
      candidateKind: "concept",
      sourceIds: ["source-2"],
      title: "Program B concept",
    });
    const response = await fetch(`${baseUrl}/programs/${programAId}/corpus-candidates`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            corpusCandidates: [
              {
                candidateId: "candidate-1",
                candidateKind: "topic",
                createdAt: "2026-05-27T10:00:00.000Z",
                createdByIdentityId: "identity-1",
                programId: programAId,
                sourceIds: ["source-1"],
                status: "draft",
                title: "Program A topic",
                updatedAt: "2026-05-27T10:00:00.000Z",
              },
            ],
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidatesList_shouldApplyStatusFiltersAndRejectCursorAcrossFilters", async () => {
  const calls = [];
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listCorpusCandidates: ({ status }) => {
        calls.push(status ?? null);
        return {
          status: "accepted",
          value: {
            corpusCandidates: [
              {
                candidateId: `candidate-${status ?? "all"}-1`,
                status: status ?? "draft",
              },
              {
                candidateId: `candidate-${status ?? "all"}-2`,
                status: status ?? "draft",
              },
            ],
          },
        };
      },
    },
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "cursor-1"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const draft = await fetch(`${baseUrl}/programs/program-1/corpus-candidates?status=draft&limit=1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const draftBody = await draft.json();
    const accepted = await fetch(`${baseUrl}/programs/program-1/corpus-candidates?status=accepted`, {
      headers: { cookie: bootstrap.cookie },
    });
    const rejected = await fetch(`${baseUrl}/programs/program-1/corpus-candidates?status=rejected`, {
      headers: { cookie: bootstrap.cookie },
    });
    const crossFilterCursor = await fetch(
      `${baseUrl}/programs/program-1/corpus-candidates?status=accepted&cursor=${draftBody.value.nextCursor}`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        calls,
        draft: {
          candidateIds: draftBody.value.corpusCandidates.map($0 => $0.candidateId),
          hasNextCursor: typeof draftBody.value.nextCursor === "string",
          statusCode: draft.status,
        },
        accepted: { body: await accepted.json(), statusCode: accepted.status },
        rejected: { body: await rejected.json(), statusCode: rejected.status },
        crossFilterCursor: {
          body: await crossFilterCursor.json(),
          statusCode: crossFilterCursor.status,
        },
      },
      {
        calls: ["draft", "accepted", "rejected"],
        draft: {
          candidateIds: ["candidate-draft-1"],
          hasNextCursor: true,
          statusCode: 200,
        },
        accepted: {
          body: {
            status: "accepted",
            value: {
              corpusCandidates: [
                { candidateId: "candidate-accepted-1", status: "accepted" },
                { candidateId: "candidate-accepted-2", status: "accepted" },
              ],
            },
          },
          statusCode: 200,
        },
        rejected: {
          body: {
            status: "accepted",
            value: {
              corpusCandidates: [
                { candidateId: "candidate-rejected-1", status: "rejected" },
                { candidateId: "candidate-rejected-2", status: "rejected" },
              ],
            },
          },
          statusCode: 200,
        },
        crossFilterCursor: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidatesList_shouldDefaultLimitToFifty", async () => {
  const corpusCandidates = Array.from({ length: 51 }, (_, index) => ({
    candidateId: `candidate-${index + 1}`,
    status: "draft",
  }));
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listCorpusCandidates: () => ({
        status: "accepted",
        value: { corpusCandidates },
      }),
    },
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "cursor-1"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs/program-1/corpus-candidates`, {
      headers: { cookie: bootstrap.cookie },
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        candidateCount: body.value.corpusCandidates.length,
        firstCandidateId: body.value.corpusCandidates[0].candidateId,
        lastCandidateId: body.value.corpusCandidates.at(-1).candidateId,
        hasNextCursor: typeof body.value.nextCursor === "string",
      },
      {
        statusCode: 200,
        candidateCount: 50,
        firstCandidateId: "candidate-1",
        lastCandidateId: "candidate-50",
        hasNextCursor: true,
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidatesList_shouldRejectInvalidQueriesNonCuratorsAndUnknownPrograms", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "audit-4",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const ordinary = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Ordinary Identity",
      login: "ordinary@example.test",
    });
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const cases = ["status=queued", "limit=0", "limit=101", "limit=abc", "cursor=unknown"];
    const invalidQueries = [];
    for (const query of cases) {
      const response = await fetch(`${baseUrl}/programs/${programId}/corpus-candidates?${query}`, {
        headers: { cookie: bootstrap.cookie },
      });
      invalidQueries.push({ body: await response.json(), statusCode: response.status });
    }
    const nonCurator = await fetch(`${baseUrl}/programs/${programId}/corpus-candidates`, {
      headers: { cookie: ordinary.cookie },
    });
    const unknownProgram = await fetch(`${baseUrl}/programs/program-ghost/corpus-candidates`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        invalidQueries,
        nonCurator: { body: await nonCurator.json(), statusCode: nonCurator.status },
        unknownProgram: { body: await unknownProgram.json(), statusCode: unknownProgram.status },
      },
      {
        invalidQueries: cases.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
        nonCurator: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
        unknownProgram: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidatesCreate_shouldRejectCsrfBeforeDomainMutation", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "source-1",
      "corpus-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "textbook",
      title: "Program source",
    });
    const missing = await fetch(`${baseUrl}/programs/${programId}/corpus-candidates`, {
      body: JSON.stringify({
        candidateKind: "topic",
        sourceIds: ["source-1"],
        title: "Program topic",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const invalid = await fetch(`${baseUrl}/programs/${programId}/corpus-candidates`, {
      body: JSON.stringify({
        candidateKind: "topic",
        sourceIds: ["source-1"],
        title: "Program topic",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": "wrong-token",
      },
      method: "POST",
    });

    assert.deepEqual(
      {
        missing: { body: await missing.json(), statusCode: missing.status },
        invalid: { body: await invalid.json(), statusCode: invalid.status },
        corpusEvents: listCorpusEventRecords(database, { programId }).map($0 => $0.eventType),
      },
      {
        missing: {
          body: { status: "rejected", reason: "csrf_required" },
          statusCode: 403,
        },
        invalid: {
          body: { status: "rejected", reason: "csrf_invalid" },
          statusCode: 403,
        },
        corpusEvents: ["program_source_recorded"],
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidatesCreate_shouldReturnDraftCandidateAndRecordEventWithoutAcceptedCorpus", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "source-1",
      "corpus-event-1",
      "candidate-1",
      "corpus-event-2",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "textbook",
      title: "Program source",
    });
    const response = await createCorpusCandidate(baseUrl, bootstrap, programId, {
      body: " Visit vertices ",
      candidateKind: "topic",
      rationale: " From source ",
      sourceIds: ["source-1"],
      title: " Graph traversal ",
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
        acceptedCorpusEntities: listAcceptedCorpusEntityRecords(database, { programId }),
        corpusEvents: listCorpusEventRecords(database, { programId }).map($0 => ({
          eventType: $0.eventType,
          outcome: $0.outcome,
          targetId: $0.targetId,
        })),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            corpusCandidate: {
              body: "Visit vertices",
              candidateId: "candidate-1",
              candidateKind: "topic",
              createdAt: "2026-05-27T10:00:00.000Z",
              createdByIdentityId: "identity-1",
              programId,
              rationale: "From source",
              sourceIds: ["source-1"],
              status: "draft",
              title: "Graph traversal",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
        acceptedCorpusEntities: [],
        corpusEvents: [
          {
            eventType: "program_source_recorded",
            outcome: "accepted",
            targetId: "source-1",
          },
          {
            eventType: "corpus_candidate_created",
            outcome: "accepted",
            targetId: "candidate-1",
          },
        ],
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidatesCreate_shouldRejectInvalidBodiesAndFields_withValidationFailed", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "corpus-event-1",
      "corpus-event-2",
      "corpus-event-3",
      "corpus-event-4",
      "corpus-event-5",
      "corpus-event-6",
      "corpus-event-7",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const invalidBodies = [
      undefined,
      "not valid json{{{",
      JSON.stringify([]),
    ];
    const invalidFields = [
      { candidateKind: "unsupported", title: "Program topic" },
      { candidateKind: "topic" },
      { candidateKind: "topic", title: "" },
      { candidateKind: "topic", title: " " },
      { candidateKind: "topic", title: 42 },
      { body: " ", candidateKind: "topic", title: "Program topic" },
      { candidateKind: "topic", rationale: " ", title: "Program topic" },
      { candidateKind: "topic", sourceIds: "source-1", title: "Program topic" },
      { candidateKind: "topic", sourceIds: [42], title: "Program topic" },
    ];
    const responses = [];
    for (const body of invalidBodies) {
      const response = await fetch(`${baseUrl}/programs/${programId}/corpus-candidates`, {
        body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      responses.push({ body: await response.json(), statusCode: response.status });
    }
    for (const body of invalidFields) {
      const response = await createCorpusCandidate(baseUrl, bootstrap, programId, body);
      responses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      responses,
      [...invalidBodies, ...invalidFields].map(() => ({
        body: { status: "rejected", reason: "validation_failed" },
        statusCode: 400,
      })),
    );
  } finally {
    await close();
  }
});

test("corpusCandidatesCreate_shouldRejectUnknownAndCrossProgramSources", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "source-1",
      "corpus-event-1",
      "program-2",
      "membership-2",
      "program-event-2",
      "membership-event-2",
      "source-2",
      "corpus-event-2",
      "candidate-1",
      "corpus-event-3",
      "candidate-2",
      "corpus-event-4",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const programA = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programAId = (await programA.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programAId, {
      sourceKind: "textbook",
      title: "Program A source",
    });
    const programB = await createProgram(baseUrl, bootstrap, { title: "Discrete Math" });
    const programBId = (await programB.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programBId, {
      sourceKind: "article",
      title: "Program B source",
    });
    const unknownSource = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      sourceIds: ["source-ghost"],
      title: "Program topic",
    });
    const crossProgramSource = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      sourceIds: ["source-2"],
      title: "Program topic",
    });

    assert.deepEqual(
      {
        unknownSource: { body: await unknownSource.json(), statusCode: unknownSource.status },
        crossProgramSource: {
          body: await crossProgramSource.json(),
          statusCode: crossProgramSource.status,
        },
      },
      {
        unknownSource: {
          body: { status: "rejected", reason: "source_not_found" },
          statusCode: 409,
        },
        crossProgramSource: {
          body: { status: "rejected", reason: "source_program_mismatch" },
          statusCode: 409,
        },
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidateAcceptance_shouldCreateAcceptedCorpusAndEvent_onMissingBody", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "source-1",
      "corpus-event-1",
      "candidate-1",
      "corpus-event-2",
      "accepted-entity-1",
      "accepted-revision-1",
      "corpus-event-3",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "textbook",
      title: "Program source",
    });
    await createCorpusCandidate(baseUrl, bootstrap, programId, {
      body: "Graph body",
      candidateKind: "topic",
      rationale: "Source rationale",
      sourceIds: ["source-1"],
      title: "Graph traversal",
    });
    const response = await acceptCorpusCandidate(baseUrl, bootstrap, "candidate-1");

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
        candidateEvents: listCorpusEventRecords(database, { programId })
          .filter($0 => $0.eventType === "corpus_candidate_accepted")
          .map($0 => ({
            eventType: $0.eventType,
            outcome: $0.outcome,
            targetId: $0.targetId,
          })),
        entities: listAcceptedCorpusEntityRecords(database, { programId }),
        revisions: listAcceptedCorpusRevisionRecords(database).map($0 => $0.id),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            acceptedCorpus: {
              acceptedAt: "2026-05-27T10:00:00.000Z",
              acceptedByIdentityId: "identity-1",
              acceptedFromCandidateId: "candidate-1",
              acceptedKind: "topic",
              body: "Graph body",
              entityId: "accepted-entity-1",
              programId,
              rationale: "Source rationale",
              revisionId: "accepted-revision-1",
              sourceIds: ["source-1"],
              title: "Graph traversal",
            },
          },
        },
        candidateEvents: [
          {
            eventType: "corpus_candidate_accepted",
            outcome: "accepted",
            targetId: "candidate-1",
          },
        ],
        entities: [
          {
            acceptedKind: "topic",
            currentRevisionId: "accepted-revision-1",
            id: "accepted-entity-1",
            programId,
          },
        ],
        revisions: ["accepted-revision-1"],
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidateAcceptance_shouldReplaceCurrentRevision_onTargetEntity", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "candidate-1",
      "corpus-event-1",
      "accepted-entity-1",
      "accepted-revision-1",
      "corpus-event-2",
      "candidate-2",
      "corpus-event-3",
      "accepted-revision-2",
      "corpus-event-4",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "First accepted",
    });
    await acceptCorpusCandidate(baseUrl, bootstrap, "candidate-1", {});
    await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Second accepted",
    });
    const response = await acceptCorpusCandidate(baseUrl, bootstrap, "candidate-2", {
      targetEntityId: "accepted-entity-1",
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
        entity: listAcceptedCorpusEntityRecords(database, { programId }),
        revisions: listAcceptedCorpusRevisionRecords(database).map($0 => ({
          acceptedFromCandidateId: $0.acceptedFromCandidateId,
          id: $0.id,
          title: $0.title,
        })),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            acceptedCorpus: {
              acceptedAt: "2026-05-27T10:00:00.000Z",
              acceptedByIdentityId: "identity-1",
              acceptedFromCandidateId: "candidate-2",
              acceptedKind: "topic",
              entityId: "accepted-entity-1",
              programId,
              revisionId: "accepted-revision-2",
              sourceIds: [],
              title: "Second accepted",
            },
          },
        },
        entity: [
          {
            acceptedKind: "topic",
            currentRevisionId: "accepted-revision-2",
            id: "accepted-entity-1",
            programId,
          },
        ],
        revisions: [
          {
            acceptedFromCandidateId: "candidate-1",
            id: "accepted-revision-1",
            title: "First accepted",
          },
          {
            acceptedFromCandidateId: "candidate-2",
            id: "accepted-revision-2",
            title: "Second accepted",
          },
        ],
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidateAcceptance_shouldRejectCsrfAndInvalidBodies_beforeDomainMutation", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "candidate-1",
      "corpus-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Program topic",
    });
    const missingCsrf = await fetch(`${baseUrl}/corpus-candidates/candidate-1/acceptance`, {
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const invalidBodyCases = [
      "not valid json{{{",
      JSON.stringify([]),
      JSON.stringify({ note: "ignored" }),
      JSON.stringify({ targetEntityId: 42 }),
    ];
    const invalidBodyResponses = [];
    for (const body of invalidBodyCases) {
      const response = await fetch(`${baseUrl}/corpus-candidates/candidate-1/acceptance`, {
        body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      invalidBodyResponses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      {
        missingCsrf: { body: await missingCsrf.json(), statusCode: missingCsrf.status },
        invalidBodyResponses,
        acceptedEntities: listAcceptedCorpusEntityRecords(database, { programId }),
        acceptedEvents: listCorpusEventRecords(database, { programId })
          .filter($0 => $0.eventType === "corpus_candidate_accepted"),
      },
      {
        missingCsrf: {
          body: { status: "rejected", reason: "csrf_required" },
          statusCode: 403,
        },
        invalidBodyResponses: invalidBodyCases.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
        acceptedEntities: [],
        acceptedEvents: [],
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidateAcceptance_shouldMapStateTargetAndAuthorizationRejections", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "audit-4",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "candidate-1",
      "corpus-event-1",
      "accepted-entity-1",
      "accepted-revision-1",
      "corpus-event-2",
      "candidate-2",
      "corpus-event-3",
      "corpus-event-4",
      "program-2",
      "membership-2",
      "program-event-2",
      "membership-event-2",
      "candidate-3",
      "corpus-event-5",
      "accepted-entity-2",
      "accepted-revision-2",
      "corpus-event-6",
      "candidate-4",
      "corpus-event-7",
      "candidate-5",
      "corpus-event-8",
      "accepted-entity-3",
      "accepted-revision-3",
      "corpus-event-9",
      "candidate-6",
      "corpus-event-10",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const ordinary = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Ordinary Identity",
      login: "ordinary@example.test",
    });
    const programA = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programAId = (await programA.json()).value.program.programId;
    const alreadyAcceptedCandidate = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Already accepted",
    });
    const alreadyAcceptedCandidateId = (await alreadyAcceptedCandidate.json()).value.corpusCandidate.candidateId;
    await acceptCorpusCandidate(baseUrl, bootstrap, alreadyAcceptedCandidateId, {});
    const alreadyRejectedCandidate = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Already rejected",
    });
    const alreadyRejectedCandidateId = (await alreadyRejectedCandidate.json()).value.corpusCandidate.candidateId;
    await rejectCorpusCandidate(baseUrl, bootstrap, alreadyRejectedCandidateId);
    const programB = await createProgram(baseUrl, bootstrap, { title: "Discrete Math" });
    const programBId = (await programB.json()).value.program.programId;
    const crossProgramCandidate = await createCorpusCandidate(baseUrl, bootstrap, programBId, {
      candidateKind: "topic",
      title: "Other program accepted",
    });
    const crossProgramCandidateId = (await crossProgramCandidate.json()).value.corpusCandidate.candidateId;
    const crossProgramAccepted = await acceptCorpusCandidate(baseUrl, bootstrap, crossProgramCandidateId, {});
    const crossProgramEntityId = (await crossProgramAccepted.json()).value.acceptedCorpus.entityId;
    const targetCandidate = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Target candidate",
    });
    const targetCandidateId = (await targetCandidate.json()).value.corpusCandidate.candidateId;
    const conceptCandidate = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "concept",
      title: "Concept accepted",
    });
    const conceptCandidateId = (await conceptCandidate.json()).value.corpusCandidate.candidateId;
    const conceptAccepted = await acceptCorpusCandidate(baseUrl, bootstrap, conceptCandidateId, {});
    const conceptEntityId = (await conceptAccepted.json()).value.acceptedCorpus.entityId;
    const unauthorizedCandidate = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Unauthorized target",
    });
    const unauthorizedCandidateId = (await unauthorizedCandidate.json()).value.corpusCandidate.candidateId;
    const cases = [
      ["candidate-missing", bootstrap, {}, "candidate_not_found", 404],
      [alreadyAcceptedCandidateId, bootstrap, {}, "candidate_already_accepted", 409],
      [alreadyRejectedCandidateId, bootstrap, {}, "candidate_already_rejected", 409],
      [targetCandidateId, bootstrap, { targetEntityId: "entity-missing" }, "accepted_entity_not_found", 404],
      [targetCandidateId, bootstrap, { targetEntityId: crossProgramEntityId }, "accepted_entity_program_mismatch", 409],
      [targetCandidateId, bootstrap, { targetEntityId: conceptEntityId }, "accepted_kind_mismatch", 409],
      [unauthorizedCandidateId, ordinary, {}, "admin_or_curator_required", 403],
    ];
    const responses = [];
    for (const [candidateId, session, body, reason, statusCode] of cases) {
      const response = await acceptCorpusCandidate(baseUrl, session, candidateId, body);
      responses.push({ body: await response.json(), reason, statusCode: response.status, expectedStatus: statusCode });
    }

    assert.deepEqual(
      {
        responses,
        rejectedEvents: listCorpusEventRecords(database, { programId: programAId })
          .filter($0 => $0.eventType === "corpus_candidate_accepted" && $0.outcome === "rejected")
          .map($0 => ({
            reason: $0.reason,
            targetId: $0.targetId,
          }))
          .toSorted((left, right) => left.reason.localeCompare(right.reason)),
      },
      {
        responses: cases.map(([, , , reason, statusCode]) => ({
          body: { status: "rejected", reason },
          reason,
          statusCode,
          expectedStatus: statusCode,
        })),
        rejectedEvents: [
          {
            reason: "accepted_entity_not_found",
            targetId: targetCandidateId,
          },
          {
            reason: "accepted_entity_program_mismatch",
            targetId: targetCandidateId,
          },
          {
            reason: "accepted_kind_mismatch",
            targetId: targetCandidateId,
          },
          {
            reason: "admin_or_curator_required",
            targetId: unauthorizedCandidateId,
          },
          {
            reason: "candidate_already_accepted",
            targetId: alreadyAcceptedCandidateId,
          },
          {
            reason: "candidate_already_rejected",
            targetId: alreadyRejectedCandidateId,
          },
        ],
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidateRejection_shouldRejectDraftCandidateAndRecordEvent_onMissingBody", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "candidate-1",
      "corpus-event-1",
      "corpus-event-2",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Rejected topic",
    });
    const response = await rejectCorpusCandidate(baseUrl, bootstrap, "candidate-1");

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
        rejectionEvents: listCorpusEventRecords(database, { programId })
          .filter($0 => $0.eventType === "corpus_candidate_rejected")
          .map($0 => ({
            eventType: $0.eventType,
            outcome: $0.outcome,
            targetId: $0.targetId,
          })),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            corpusCandidate: {
              candidateId: "candidate-1",
              candidateKind: "topic",
              createdAt: "2026-05-27T10:00:00.000Z",
              createdByIdentityId: "identity-1",
              programId,
              sourceIds: [],
              status: "rejected",
              title: "Rejected topic",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
        rejectionEvents: [
          {
            eventType: "corpus_candidate_rejected",
            outcome: "accepted",
            targetId: "candidate-1",
          },
        ],
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidateRejection_shouldAcceptEmptyObjectAndRejectInvalidBodies", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "candidate-1",
      "corpus-event-1",
      "corpus-event-2",
      "candidate-2",
      "corpus-event-3",
      "candidate-3",
      "corpus-event-4",
      "candidate-4",
      "corpus-event-5",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Empty object rejection",
    });
    const emptyObject = await rejectCorpusCandidate(baseUrl, bootstrap, "candidate-1", {});
    const invalidBodies = [
      "not valid json{{{",
      JSON.stringify([]),
      JSON.stringify({ reason: "duplicate" }),
    ];
    const invalidBodyResponses = [];
    for (const [index, body] of invalidBodies.entries()) {
      await createCorpusCandidate(baseUrl, bootstrap, programId, {
        candidateKind: "topic",
        title: `Invalid body ${index}`,
      });
      const response = await fetch(`${baseUrl}/corpus-candidates/candidate-${index + 2}/rejection`, {
        body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      invalidBodyResponses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      {
        emptyObjectStatusCode: emptyObject.status,
        emptyObjectStatus: (await emptyObject.json()).status,
        invalidBodyResponses,
      },
      {
        emptyObjectStatusCode: 200,
        emptyObjectStatus: "accepted",
        invalidBodyResponses: invalidBodies.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
      },
    );
  } finally {
    await close();
  }
});

test("corpusCandidateRejection_shouldMapStateAndAuthorizationRejections", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "audit-4",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "candidate-1",
      "corpus-event-1",
      "accepted-entity-1",
      "accepted-revision-1",
      "corpus-event-2",
      "candidate-2",
      "corpus-event-3",
      "corpus-event-4",
      "candidate-3",
      "corpus-event-5",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const ordinary = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Ordinary Identity",
      login: "ordinary@example.test",
    });
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const alreadyAcceptedCandidate = await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Accepted topic",
    });
    const alreadyAcceptedCandidateId = (await alreadyAcceptedCandidate.json()).value.corpusCandidate.candidateId;
    await acceptCorpusCandidate(baseUrl, bootstrap, alreadyAcceptedCandidateId, {});
    const alreadyRejectedCandidate = await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Rejected topic",
    });
    const alreadyRejectedCandidateId = (await alreadyRejectedCandidate.json()).value.corpusCandidate.candidateId;
    await rejectCorpusCandidate(baseUrl, bootstrap, alreadyRejectedCandidateId);
    const unauthorizedCandidate = await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Unauthorized topic",
    });
    const unauthorizedCandidateId = (await unauthorizedCandidate.json()).value.corpusCandidate.candidateId;
    const cases = [
      ["candidate-missing", bootstrap, "candidate_not_found", 404],
      [alreadyAcceptedCandidateId, bootstrap, "candidate_already_accepted", 409],
      [alreadyRejectedCandidateId, bootstrap, "candidate_already_rejected", 409],
      [unauthorizedCandidateId, ordinary, "admin_or_curator_required", 403],
    ];
    const responses = [];
    for (const [candidateId, session, reason, statusCode] of cases) {
      const response = await rejectCorpusCandidate(baseUrl, session, candidateId);
      responses.push({ body: await response.json(), reason, statusCode: response.status, expectedStatus: statusCode });
    }

    assert.deepEqual(
      {
        responses,
        rejectedEvents: listCorpusEventRecords(database, { programId })
          .filter($0 => $0.eventType === "corpus_candidate_rejected" && $0.outcome === "rejected")
          .map($0 => ({
            reason: $0.reason,
            targetId: $0.targetId,
          }))
          .toSorted((left, right) => left.reason.localeCompare(right.reason)),
      },
      {
        responses: cases.map(([, , reason, statusCode]) => ({
          body: { status: "rejected", reason },
          reason,
          statusCode,
          expectedStatus: statusCode,
        })),
        rejectedEvents: [
          {
            reason: "admin_or_curator_required",
            targetId: unauthorizedCandidateId,
          },
          {
            reason: "candidate_already_accepted",
            targetId: alreadyAcceptedCandidateId,
          },
          {
            reason: "candidate_already_rejected",
            targetId: alreadyRejectedCandidateId,
          },
        ],
      },
    );
  } finally {
    await close();
  }
});

test("acceptedCorpusList_shouldAuthorizeStudentCuratorAndAdminOnly", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(80),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "student@example.test",
    });
    const outsider = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Outsider",
      login: "outsider@example.test",
    });
    const createdProgram = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const candidate = await createCorpusCandidate(baseUrl, curator, programId, {
      candidateKind: "topic",
      title: "Accepted topic",
    });
    const candidateId = (await candidate.json()).value.corpusCandidate.candidateId;
    await acceptCorpusCandidate(baseUrl, curator, candidateId, {});
    await joinStudentProgram(baseUrl, student, programId);
    const studentResponse = await fetch(`${baseUrl}/programs/${programId}/accepted-corpus`, {
      headers: { cookie: student.cookie },
    });
    const curatorResponse = await fetch(`${baseUrl}/programs/${programId}/accepted-corpus`, {
      headers: { cookie: curator.cookie },
    });
    const adminResponse = await fetch(`${baseUrl}/programs/${programId}/accepted-corpus`, {
      headers: { cookie: bootstrap.cookie },
    });
    const outsiderResponse = await fetch(`${baseUrl}/programs/${programId}/accepted-corpus`, {
      headers: { cookie: outsider.cookie },
    });

    assert.deepEqual(
      {
        student: acceptedCorpusListProjection(await studentResponse.json(), studentResponse.status),
        curator: acceptedCorpusListProjection(await curatorResponse.json(), curatorResponse.status),
        admin: acceptedCorpusListProjection(await adminResponse.json(), adminResponse.status),
        outsider: { body: await outsiderResponse.json(), statusCode: outsiderResponse.status },
      },
      {
        student: { statusCode: 200, titles: ["Accepted topic"] },
        curator: { statusCode: 200, titles: ["Accepted topic"] },
        admin: { statusCode: 200, titles: ["Accepted topic"] },
        outsider: {
          body: { status: "rejected", reason: "participation_required" },
          statusCode: 403,
        },
      },
    );
  } finally {
    await close();
  }
});

test("acceptedCorpusList_shouldRejectDisabledSessionAndUnknownProgram", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(40),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    database
      .prepare("update identities set state = 'disabled', disabled_at = ? where id = ?")
      .run("2026-05-27T10:00:00.000Z", bootstrap.body.value.identity.id);
    const disabled = await fetch(`${baseUrl}/programs/${programId}/accepted-corpus`, {
      headers: { cookie: bootstrap.cookie },
    });
    database
      .prepare("update identities set state = 'active', disabled_at = null where id = ?")
      .run(bootstrap.body.value.identity.id);
    const unknownProgram = await fetch(`${baseUrl}/programs/program-ghost/accepted-corpus`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        disabled: { body: await disabled.json(), statusCode: disabled.status },
        unknownProgram: { body: await unknownProgram.json(), statusCode: unknownProgram.status },
      },
      {
        disabled: {
          body: { status: "rejected", reason: "identity_disabled" },
          statusCode: 403,
        },
        unknownProgram: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("acceptedCorpusList_shouldReturnCurrentScopedFilteredAndPaginatedAcceptedCorpusOnly", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(120),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const programA = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programAId = (await programA.json()).value.program.programId;
    const firstTopic = await createAcceptedCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Old topic",
    });
    await createAcceptedCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      targetEntityId: firstTopic.entityId,
      title: "Current topic",
    });
    await createAcceptedCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "concept",
      title: "Current concept",
    });
    await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Draft topic",
    });
    const rejectedCandidate = await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Rejected topic",
    });
    await rejectCorpusCandidate(
      baseUrl,
      bootstrap,
      (await rejectedCandidate.json()).value.corpusCandidate.candidateId,
    );
    const programB = await createProgram(baseUrl, bootstrap, { title: "Discrete Math" });
    const programBId = (await programB.json()).value.program.programId;
    await createAcceptedCandidate(baseUrl, bootstrap, programBId, {
      candidateKind: "topic",
      title: "Other program topic",
    });
    const all = await fetch(`${baseUrl}/programs/${programAId}/accepted-corpus?limit=1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const allBody = await all.json();
    const pageTwo = await fetch(
      `${baseUrl}/programs/${programAId}/accepted-corpus?cursor=${allBody.value?.nextCursor ?? "missing"}`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const topics = await fetch(`${baseUrl}/programs/${programAId}/accepted-corpus?acceptedKind=topic`, {
      headers: { cookie: bootstrap.cookie },
    });
    const concepts = await fetch(`${baseUrl}/programs/${programAId}/accepted-corpus?acceptedKind=concept`, {
      headers: { cookie: bootstrap.cookie },
    });
    const invalid = await fetch(`${baseUrl}/programs/${programAId}/accepted-corpus?acceptedKind=lesson`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        all: acceptedCorpusListProjection(allBody, all.status),
        pageTwo: acceptedCorpusListProjection(await pageTwo.json(), pageTwo.status),
        topics: acceptedCorpusListProjection(await topics.json(), topics.status),
        concepts: acceptedCorpusListProjection(await concepts.json(), concepts.status),
        invalid: { body: await invalid.json(), statusCode: invalid.status },
      },
      {
        all: { statusCode: 200, titles: ["Current topic"], hasNextCursor: true },
        pageTwo: { statusCode: 200, titles: ["Current concept"] },
        topics: { statusCode: 200, titles: ["Current topic"] },
        concepts: { statusCode: 200, titles: ["Current concept"] },
        invalid: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
      },
    );
  } finally {
    await close();
  }
});

test("acceptedCorpusList_shouldDefaultLimitAndRejectInvalidQueries", async () => {
  const acceptedCorpus = Array.from({ length: 51 }, (_, index) => ({
    entityId: `entity-${index + 1}`,
    title: `Accepted ${index + 1}`,
  }));
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listAcceptedCorpus: () => ({
        status: "accepted",
        value: { acceptedCorpus },
      }),
    },
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "cursor-1"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const defaultPage = await fetch(`${baseUrl}/programs/program-1/accepted-corpus`, {
      headers: { cookie: bootstrap.cookie },
    });
    const defaultBody = await defaultPage.json();
    const cases = ["limit=0", "limit=101", "limit=abc", "cursor=unknown"];
    const invalidQueries = [];
    for (const query of cases) {
      const response = await fetch(`${baseUrl}/programs/program-1/accepted-corpus?${query}`, {
        headers: { cookie: bootstrap.cookie },
      });
      invalidQueries.push({ body: await response.json(), statusCode: response.status });
    }
    const filteredPage = await fetch(`${baseUrl}/programs/program-1/accepted-corpus?acceptedKind=topic&limit=1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const filteredBody = await filteredPage.json();
    const crossFilterCursor = await fetch(
      `${baseUrl}/programs/program-1/accepted-corpus?acceptedKind=concept&cursor=${filteredBody.value.nextCursor}`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        defaultPage: {
          firstTitle: defaultBody.value?.acceptedCorpus?.[0]?.title,
          hasNextCursor: typeof defaultBody.value?.nextCursor === "string",
          lastTitle: defaultBody.value?.acceptedCorpus?.at(-1)?.title,
          statusCode: defaultPage.status,
          titleCount: defaultBody.value?.acceptedCorpus?.length ?? 0,
        },
        invalidQueries,
        crossFilterCursor: {
          body: await crossFilterCursor.json(),
          statusCode: crossFilterCursor.status,
        },
      },
      {
        defaultPage: {
          firstTitle: "Accepted 1",
          hasNextCursor: true,
          lastTitle: "Accepted 50",
          statusCode: 200,
          titleCount: 50,
        },
        invalidQueries: cases.map(() => ({
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        })),
        crossFilterCursor: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
      },
    );
  } finally {
    await close();
  }
});

test("acceptedCorpusRevisionGet_shouldReturnHistoricalRevisionForAuthorizedCallers", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(120),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const curator = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Curator",
      login: "curator@example.test",
    });
    const student = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Student",
      login: "student@example.test",
    });
    const createdProgram = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const firstTopic = await createAcceptedCandidate(baseUrl, curator, programId, {
      candidateKind: "topic",
      title: "Historical topic",
    });
    await createAcceptedCandidate(baseUrl, curator, programId, {
      candidateKind: "topic",
      targetEntityId: firstTopic.entityId,
      title: "Current topic",
    });
    await joinStudentProgram(baseUrl, student, programId);
    const studentResponse = await fetch(`${baseUrl}/accepted-corpus-revisions/${firstTopic.revisionId}`, {
      headers: { cookie: student.cookie },
    });
    const curatorResponse = await fetch(`${baseUrl}/accepted-corpus-revisions/${firstTopic.revisionId}`, {
      headers: { cookie: curator.cookie },
    });
    const adminResponse = await fetch(`${baseUrl}/accepted-corpus-revisions/${firstTopic.revisionId}`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        student: acceptedCorpusRevisionProjection(await studentResponse.json(), studentResponse.status),
        curator: acceptedCorpusRevisionProjection(await curatorResponse.json(), curatorResponse.status),
        admin: acceptedCorpusRevisionProjection(await adminResponse.json(), adminResponse.status),
      },
      {
        student: { statusCode: 200, title: "Historical topic", revisionId: firstTopic.revisionId },
        curator: { statusCode: 200, title: "Historical topic", revisionId: firstTopic.revisionId },
        admin: { statusCode: 200, title: "Historical topic", revisionId: firstTopic.revisionId },
      },
    );
  } finally {
    await close();
  }
});

test("acceptedCorpusRevisionGet_shouldRejectUnknownAndUnauthorizedCallers", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(80),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const outsider = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Outsider",
      login: "outsider@example.test",
    });
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const accepted = await createAcceptedCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Accepted topic",
    });
    const unknown = await fetch(`${baseUrl}/accepted-corpus-revisions/revision-ghost`, {
      headers: { cookie: bootstrap.cookie },
    });
    const unauthorized = await fetch(`${baseUrl}/accepted-corpus-revisions/${accepted.revisionId}`, {
      headers: { cookie: outsider.cookie },
    });

    assert.deepEqual(
      {
        unknown: { body: await unknown.json(), statusCode: unknown.status },
        unauthorized: { body: await unauthorized.json(), statusCode: unauthorized.status },
      },
      {
        unknown: {
          body: { status: "rejected", reason: "revision_not_found" },
          statusCode: 404,
        },
        unauthorized: {
          body: { status: "rejected", reason: "participation_required" },
          statusCode: 403,
        },
      },
    );
  } finally {
    await close();
  }
});

test("corpusEventsList_shouldRejectNonCuratorCallers", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(40),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const outsider = await createIdentitySession(baseUrl, bootstrap, {
      displayName: "Program Outsider",
      login: "outsider@example.test",
    });
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    const response = await fetch(`${baseUrl}/programs/${programId}/corpus-events`, {
      headers: { cookie: outsider.cookie },
    });

    assert.deepEqual(
      {
        body: await response.json(),
        statusCode: response.status,
      },
      {
        body: { status: "rejected", reason: "admin_or_curator_required" },
        statusCode: 403,
      },
    );
  } finally {
    await close();
  }
});

test("corpusEventsList_shouldAcceptCuratorAndRejectUnknownOrDisabledCallers", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(60),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programId, {
      sourceKind: "textbook",
      title: "Linear Algebra Done Right",
    });
    const curator = await fetch(`${baseUrl}/programs/${programId}/corpus-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const unknownProgram = await fetch(`${baseUrl}/programs/program-ghost/corpus-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    database
      .prepare("update identities set state = 'disabled', disabled_at = ? where id = ?")
      .run("2026-05-27T10:00:00.000Z", bootstrap.body.value.identity.id);
    const disabled = await fetch(`${baseUrl}/programs/${programId}/corpus-events`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        curator: corpusEventListProjection(await curator.json(), curator.status),
        disabled: { body: await disabled.json(), statusCode: disabled.status },
        unknownProgram: { body: await unknownProgram.json(), statusCode: unknownProgram.status },
      },
      {
        curator: { eventTypes: ["program_source_recorded"], statusCode: 200 },
        disabled: {
          body: { status: "rejected", reason: "identity_disabled" },
          statusCode: 403,
        },
        unknownProgram: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("corpusEventsList_shouldReturnOnlyScopedEventsWithCorpusShape", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(80),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const programA = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programAId = (await programA.json()).value.program.programId;
    const programB = await createProgram(baseUrl, bootstrap, { title: "Discrete Math" });
    const programBId = (await programB.json()).value.program.programId;
    await createProgramSource(baseUrl, bootstrap, programAId, {
      sourceKind: "textbook",
      title: "Linear Algebra Done Right",
    });
    await createCorpusCandidate(baseUrl, bootstrap, programAId, {
      candidateKind: "topic",
      title: "Vector spaces",
    });
    await createProgramSource(baseUrl, bootstrap, programBId, {
      sourceKind: "textbook",
      title: "Concrete Mathematics",
    });
    const response = await fetch(`${baseUrl}/programs/${programAId}/corpus-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        hasEventsKey: Object.hasOwn(body.value ?? {}, "events"),
        eventProgramIds: body.value?.corpusEvents?.map($0 => $0.programId),
        eventTypes: body.value?.corpusEvents?.map($0 => $0.eventType).toSorted(),
        hasCorpusEventIds: body.value?.corpusEvents?.every($0 => typeof $0.corpusEventId === "string"),
        hasProgramEventIds: body.value?.corpusEvents?.some($0 => Object.hasOwn($0, "programEventId")),
      },
      {
        statusCode: 200,
        hasEventsKey: false,
        eventProgramIds: [programAId, programAId],
        eventTypes: ["corpus_candidate_created", "program_source_recorded"],
        hasCorpusEventIds: true,
        hasProgramEventIds: false,
      },
    );
  } finally {
    await close();
  }
});

test("corpusEventsList_shouldDefaultLimitRejectInvalidQueriesAndRedactCursor", async () => {
  const corpusEvents = Array.from({ length: 51 }, (_, index) => ({
    actorIdentityId: "identity-1",
    corpusEventId: `corpus-event-${index + 1}`,
    eventType: "program_source_recorded",
    occurredAt: "2026-05-27T10:00:00.000Z",
    outcome: "accepted",
    programId: "program-1",
  }));
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listCorpusEvents: () => ({
        status: "accepted",
        value: { corpusEvents },
      }),
    },
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "cursor-1"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const defaultPage = await fetch(`${baseUrl}/programs/program-1/corpus-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const defaultText = await defaultPage.text();
    const defaultBody = JSON.parse(defaultText);
    const invalidQueries = [];
    for (const query of ["limit=0", "limit=101", "limit=abc", "cursor=unknown"]) {
      const response = await fetch(`${baseUrl}/programs/program-1/corpus-events?${query}`, {
        headers: { cookie: bootstrap.cookie },
      });
      invalidQueries.push({ body: await response.json(), statusCode: response.status });
    }
    const crossProgramCursor = await fetch(
      `${baseUrl}/programs/program-2/corpus-events?cursor=${defaultBody.value.nextCursor}`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        defaultPage: {
          firstEventId: defaultBody.value?.corpusEvents?.[0]?.corpusEventId,
          hasNextCursor: typeof defaultBody.value?.nextCursor === "string",
          lastEventId: defaultBody.value?.corpusEvents?.at(-1)?.corpusEventId,
          statusCode: defaultPage.status,
          eventCount: defaultBody.value?.corpusEvents?.length ?? 0,
        },
        invalidQueries,
        crossProgramCursor: {
          body: await crossProgramCursor.json(),
          statusCode: crossProgramCursor.status,
        },
        redaction: {
          hasAuthorization: defaultText.includes("authorization"),
          hasBootstrapSecret: defaultText.includes("operator-secret"),
          hasCookie: defaultText.includes("cookie"),
          hasCsrf: defaultText.includes(bootstrap.csrfToken),
          hasDatabaseUrl: defaultText.includes("file:"),
          hasFilesystemPath: defaultText.includes("/Users/"),
          hasPassword: defaultText.includes("NON_SECRET_TEST_VALUE"),
          hasSession: defaultText.includes("session-1"),
          hasSql: defaultText.toLowerCase().includes("select "),
          hasStack: defaultText.includes("Error:"),
          nextCursorHasSecrets: [
            bootstrap.csrfToken,
            "cookie",
            "file:",
            "operator-secret",
            "/Users/",
            "select ",
            "session-1",
          ].some(secret => defaultBody.value.nextCursor?.includes(secret)),
        },
      },
      {
        defaultPage: {
          firstEventId: "corpus-event-1",
          hasNextCursor: true,
          lastEventId: "corpus-event-50",
          statusCode: 200,
          eventCount: 50,
        },
        invalidQueries: [
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
        ],
        crossProgramCursor: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
        redaction: {
          hasAuthorization: false,
          hasBootstrapSecret: false,
          hasCookie: false,
          hasCsrf: false,
          hasDatabaseUrl: false,
          hasFilesystemPath: false,
          hasPassword: false,
          hasSession: false,
          hasSql: false,
          hasStack: false,
          nextCursorHasSecrets: false,
        },
      },
    );
  } finally {
    await close();
  }
});

test("corpusEventsList_shouldRedactFaultResponses", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    corpusCommandsOverride: {
      listCorpusEvents: () => {
        throw new Error(
          "select session_id from sessions where cookie='agonara_session=session-1' " +
            "authorization='bearer token' csrf='csrf-secret' " +
            "secret='operator-secret' password='NON_SECRET_TEST_VALUE' " +
            "database='file:/Users/igormalyarov/agonara.db'",
        );
      },
    },
    ids: ["identity-1", "credential-1", "session-1", "audit-1"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs/program-1/corpus-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const text = await response.text();

    assert.deepEqual(
      {
        statusCode: response.status,
        body: JSON.parse(text),
        redaction: {
          hasAuthorization: text.includes("authorization"),
          hasBootstrapSecret: text.includes("operator-secret"),
          hasCookie: text.includes("cookie"),
          hasCsrf: text.includes(bootstrap.csrfToken),
          hasDatabaseUrl: text.includes("file:"),
          hasFilesystemPath: text.includes("/Users/"),
          hasPassword: text.includes("NON_SECRET_TEST_VALUE"),
          hasSession: text.includes("session-1"),
          hasSql: text.toLowerCase().includes("select "),
          hasStack: text.includes("Error:"),
        },
      },
      {
        statusCode: 500,
        body: { status: "fault", reason: "internal_error" },
        redaction: {
          hasAuthorization: false,
          hasBootstrapSecret: false,
          hasCookie: false,
          hasCsrf: false,
          hasDatabaseUrl: false,
          hasFilesystemPath: false,
          hasPassword: false,
          hasSession: false,
          hasSql: false,
          hasStack: false,
        },
      },
    );
  } finally {
    await close();
  }
});

test("corpusEventsList_shouldExposeOnlyDomainReasonsAndKeepOutOfScopeRoutesUnavailable", async () => {
  const { baseUrl, close } = await listenWithIdentityProgramAndCorpus({
    ids: manyIds(100),
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const createdProgram = await createProgram(baseUrl, bootstrap, { title: "Linear Algebra" });
    const programId = (await createdProgram.json()).value.program.programId;
    await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      sourceIds: ["source-missing"],
      title: "Rejected source candidate",
    });
    const candidate = await createCorpusCandidate(baseUrl, bootstrap, programId, {
      candidateKind: "topic",
      title: "Accepted topic",
    });
    const candidateId = (await candidate.json()).value.corpusCandidate.candidateId;
    await acceptCorpusCandidate(baseUrl, bootstrap, candidateId, { targetEntityId: "entity-missing" });
    await acceptCorpusCandidate(baseUrl, bootstrap, candidateId, {});
    await acceptCorpusCandidate(baseUrl, bootstrap, candidateId, {});
    const response = await fetch(`${baseUrl}/programs/${programId}/corpus-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const body = await response.json();
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
      const outOfScopeResponse = await fetch(`${baseUrl}${route}`, {
        headers: { cookie: bootstrap.cookie },
      });
      outOfScopeRoutes.push(outOfScopeResponse.status);
    }
    const allowedDomainReasons = new Set([
      "accepted_entity_not_found",
      "candidate_already_accepted",
      "source_not_found",
    ]);
    const forbiddenTransportReasons = new Set([
      "csrf_required",
      "csrf_invalid",
      "session_not_found",
      "session_expired",
      "session_revoked",
      "identity_disabled",
      "validation_failed",
      "internal_error",
    ]);
    const eventReasons = body.value?.corpusEvents
      ?.map($0 => $0.reason)
      .filter($0 => $0 !== undefined);

    assert.deepEqual(
      {
        statusCode: response.status,
        eventReasons: eventReasons?.toSorted(),
        allReasonsAreDomainReasons: eventReasons?.every($0 => allowedDomainReasons.has($0)),
        hasForbiddenTransportReasons: eventReasons?.some($0 => forbiddenTransportReasons.has($0)),
        outOfScopeRoutes,
      },
      {
        statusCode: 200,
        eventReasons: [
          "accepted_entity_not_found",
          "candidate_already_accepted",
          "source_not_found",
        ],
        allReasonsAreDomainReasons: true,
        hasForbiddenTransportReasons: false,
        outOfScopeRoutes: [404, 404, 404, 404, 404, 404, 404, 404],
      },
    );
  } finally {
    await close();
  }
});

test("programsCreate_shouldRejectMissingCsrf_beforeDomainMutation", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 403,
        body: { status: "rejected", reason: "csrf_required" },
      },
    );
  } finally {
    await close();
  }
});

test("programsCreate_shouldReturnProgramCreated_onAccepted", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ description: "Foundations", title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            initialCuratorMembership: {
              identityId: "identity-1",
              participationKind: "program_curator",
              programId: "program-1",
              status: "active",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
            program: {
              admissionPolicy: "self_join",
              createdAt: "2026-05-27T10:00:00.000Z",
              createdByIdentityId: "identity-1",
              description: "Foundations",
              programId: "program-1",
              title: "Linear Algebra",
            },
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("programsCreate_shouldRejectInvalidBodies_withValidationFailed", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const cases = [
      undefined,
      "not valid json{{{",
      JSON.stringify([]),
      JSON.stringify({ title: " " }),
      JSON.stringify({ description: 42, title: "Linear Algebra" }),
    ];
    const responses = [];
    for (const body of cases) {
      const response = await fetch(`${baseUrl}/programs`, {
        body,
        headers: {
          cookie: bootstrap.cookie,
          "content-type": "application/json",
          "x-agonara-csrf": bootstrap.csrfToken,
        },
        method: "POST",
      });
      responses.push({ body: await response.json(), statusCode: response.status });
    }

    assert.deepEqual(
      responses,
      cases.map(() => ({
        body: { status: "rejected", reason: "validation_failed" },
        statusCode: 400,
      })),
    );
  } finally {
    await close();
  }
});

test("programsList_shouldReturnCreatedPrograms_onActiveSession", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ description: "Foundations", title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const response = await fetch(`${baseUrl}/programs`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(await response.json(), {
      status: "accepted",
      value: {
        programs: [
          {
            admissionPolicy: "self_join",
            createdAt: "2026-05-27T10:00:00.000Z",
            createdByIdentityId: "identity-1",
            description: "Foundations",
            programId: "program-1",
            title: "Linear Algebra",
          },
        ],
      },
    });
  } finally {
    await close();
  }
});

test("programsGet_shouldReturnKnownProgramAndRejectUnknownProgram", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const known = await fetch(`${baseUrl}/programs/program-1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const unknown = await fetch(`${baseUrl}/programs/program-ghost`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        known: { body: await known.json(), statusCode: known.status },
        unknown: { body: await unknown.json(), statusCode: unknown.status },
      },
      {
        known: {
          body: {
            status: "accepted",
            value: {
              admissionPolicy: "self_join",
              createdAt: "2026-05-27T10:00:00.000Z",
              createdByIdentityId: "identity-1",
              programId: "program-1",
              title: "Linear Algebra",
            },
          },
          statusCode: 200,
        },
        unknown: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programShellRoutes_shouldNotExposeSessionCsrfOrCredentialSecrets", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const create = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const list = await fetch(`${baseUrl}/programs`, {
      headers: { cookie: bootstrap.cookie },
    });
    const get = await fetch(`${baseUrl}/programs/program-1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const responseText = JSON.stringify({
      create: await create.json(),
      get: await get.json(),
      list: await list.json(),
    });

    assert.deepEqual(
      {
        leaksCsrf: responseText.includes(bootstrap.csrfToken),
        leaksPassword: responseText.includes("NON_SECRET_TEST_VALUE"),
        leaksPasswordHash: responseText.includes("scrypt$"),
        leaksSession: responseText.includes(bootstrap.cookie.replace("agonara_session=", "")),
      },
      {
        leaksCsrf: false,
        leaksPassword: false,
        leaksPasswordHash: false,
        leaksSession: false,
      },
    );
  } finally {
    await close();
  }
});

test("programMembershipsMe_shouldReturnOnlySessionIdentityMemberships", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const response = await fetch(`${baseUrl}/program-memberships/me`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            memberships: [
              {
                identityId: "identity-1",
                participationKind: "program_curator",
                programId: "program-1",
                status: "active",
                updatedAt: "2026-05-27T10:00:00.000Z",
              },
            ],
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("studentMembershipCreate_shouldJoinSelfJoinProgram_onFirstJoin", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "student-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const response = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            membership: {
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
              status: "active",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("studentMembershipDelete_shouldLeaveActiveMembership", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "student-event-1",
      "student-event-2",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const response = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            membership: {
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
              status: "left",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("studentMembershipCreate_shouldBeIdempotentForActiveMembership", async () => {
  const { baseUrl, close, database } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "student-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const first = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const second = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });

    assert.deepEqual(
      {
        first: await first.json(),
        second: await second.json(),
        studentEvents: listProgramMembershipEventRecords(database)
          .filter($0 => $0.participationKind === "student")
          .map($0 => $0.eventType),
      },
      {
        first: {
          status: "accepted",
          value: {
            membership: {
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
              status: "active",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
        second: {
          status: "accepted",
          value: {
            membership: {
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
              status: "active",
              updatedAt: "2026-05-27T10:00:00.000Z",
            },
          },
        },
        studentEvents: ["student_membership_joined"],
      },
    );
  } finally {
    await close();
  }
});

test("studentMembershipCreate_shouldReactivateLeftMembership_onRejoin", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "student-event-1",
      "student-event-2",
      "student-event-3",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    const response = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });

    assert.deepEqual(await response.json(), {
      status: "accepted",
      value: {
        membership: {
          identityId: "identity-1",
          participationKind: "student",
          programId: "program-1",
          status: "active",
          updatedAt: "2026-05-27T10:00:00.000Z",
        },
      },
    });
  } finally {
    await close();
  }
});

test("studentMembershipRoutes_shouldMapConflictsAndUnknownPrograms", async () => {
  const { baseUrl, close, database } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "student-event-1",
      "student-event-2",
      "student-event-3",
      "student-event-4",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const missingLeave = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    const leftLeave = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    updateProgramMembershipStatus(database, {
      identityId: "identity-1",
      participationKind: "student",
      programId: "program-1",
      status: "removed",
      updatedAt: "2026-05-27T10:00:00.000Z",
    });
    const removedJoin = await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const unknownJoin = await fetch(`${baseUrl}/programs/program-ghost/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const unknownLeave = await fetch(`${baseUrl}/programs/program-ghost/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });

    assert.deepEqual(
      {
        leftLeave: { body: await leftLeave.json(), statusCode: leftLeave.status },
        missingLeave: { body: await missingLeave.json(), statusCode: missingLeave.status },
        removedJoin: { body: await removedJoin.json(), statusCode: removedJoin.status },
        unknownJoin: { body: await unknownJoin.json(), statusCode: unknownJoin.status },
        unknownLeave: { body: await unknownLeave.json(), statusCode: unknownLeave.status },
      },
      {
        leftLeave: {
          body: { status: "rejected", reason: "membership_left" },
          statusCode: 409,
        },
        missingLeave: {
          body: { status: "rejected", reason: "membership_missing" },
          statusCode: 409,
        },
        removedJoin: {
          body: { status: "rejected", reason: "membership_removed" },
          statusCode: 409,
        },
        unknownJoin: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
        unknownLeave: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("effectiveParticipation_shouldCheckSessionIdentity_whenIdentityIdIsAbsent", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "student-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const student = await fetch(`${baseUrl}/programs/program-1/participation/student`, {
      headers: { cookie: bootstrap.cookie },
    });
    const curator = await fetch(`${baseUrl}/programs/program-1/participation/program_curator`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        curator: { body: await curator.json(), statusCode: curator.status },
        student: { body: await student.json(), statusCode: student.status },
      },
      {
        curator: {
          body: {
            status: "accepted",
            value: {
              allowed: true,
              identityId: "identity-1",
              participationKind: "program_curator",
              programId: "program-1",
            },
          },
          statusCode: 200,
        },
        student: {
          body: {
            status: "accepted",
            value: {
              allowed: true,
              identityId: "identity-1",
              participationKind: "student",
              programId: "program-1",
            },
          },
          statusCode: 200,
        },
      },
    );
  } finally {
    await close();
  }
});

test("effectiveParticipation_shouldRequireAdminOrCurator_forOtherIdentity", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "audit-4",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const created = await fetch(`${baseUrl}/identity/identities`, {
      body: JSON.stringify({ displayName: "Second Identity" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondIdentityId = (await created.json()).value.id;
    await fetch(`${baseUrl}/identity/identities/${secondIdentityId}/local-password`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "NON_SECRET_TEST_VALUE",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondLogin = await fetch(`${baseUrl}/identity/sessions`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "NON_SECRET_TEST_VALUE",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const secondCookie = secondLogin.headers.get("set-cookie").split(";", 1)[0];

    const ordinary = await fetch(
      `${baseUrl}/programs/program-1/participation/student?identityId=identity-1`,
      { headers: { cookie: secondCookie } },
    );
    const admin = await fetch(
      `${baseUrl}/programs/program-1/participation/student?identityId=${secondIdentityId}`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const curator = await fetch(
      `${baseUrl}/programs/program-1/participation/student?identityId=${secondIdentityId}`,
      { headers: { cookie: bootstrap.cookie } },
    );

    assert.deepEqual(
      {
        admin: { body: await admin.json(), statusCode: admin.status },
        curator: { body: await curator.json(), statusCode: curator.status },
        ordinary: { body: await ordinary.json(), statusCode: ordinary.status },
      },
      {
        admin: {
          body: {
            status: "accepted",
            value: {
              allowed: false,
              identityId: "identity-2",
              participationKind: "student",
              programId: "program-1",
              reason: "membership_missing",
            },
          },
          statusCode: 200,
        },
        curator: {
          body: {
            status: "accepted",
            value: {
              allowed: false,
              identityId: "identity-2",
              participationKind: "student",
              programId: "program-1",
              reason: "membership_missing",
            },
          },
          statusCode: 200,
        },
        ordinary: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
      },
    );
  } finally {
    await close();
  }
});

test("effectiveParticipation_shouldAllowNonAdminCurator_forOtherIdentity", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "audit-4",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const created = await fetch(`${baseUrl}/identity/identities`, {
      body: JSON.stringify({ displayName: "Second Identity" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondIdentityId = (await created.json()).value.id;
    await fetch(`${baseUrl}/identity/identities/${secondIdentityId}/local-password`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "NON_SECRET_TEST_VALUE",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondLogin = await fetch(`${baseUrl}/identity/sessions`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "NON_SECRET_TEST_VALUE",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const secondLoginBody = await secondLogin.json();
    const secondCookie = secondLogin.headers.get("set-cookie").split(";", 1)[0];
    const createdProgram = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: secondCookie,
        "content-type": "application/json",
        "x-agonara-csrf": secondLoginBody.value.csrfToken,
      },
      method: "POST",
    });
    const programId = (await createdProgram.json()).value.program.programId;
    const adminProbe = await fetch(`${baseUrl}/identity/identities`, {
      headers: { cookie: secondCookie },
    });
    const participation = await fetch(
      `${baseUrl}/programs/${programId}/participation/student?identityId=identity-1`,
      { headers: { cookie: secondCookie } },
    );

    assert.deepEqual(
      {
        adminProbe: { body: await adminProbe.json(), statusCode: adminProbe.status },
        participation: { body: await participation.json(), statusCode: participation.status },
      },
      {
        adminProbe: {
          body: { status: "rejected", reason: "admin_required" },
          statusCode: 403,
        },
        participation: {
          body: {
            status: "accepted",
            value: {
              allowed: false,
              identityId: "identity-1",
              participationKind: "student",
              programId,
              reason: "membership_missing",
            },
          },
          statusCode: 200,
        },
      },
    );
  } finally {
    await close();
  }
});

test("effectiveParticipation_shouldHandleInvalidInputsAndRemainReadOnly", async () => {
  const { baseUrl, close, database } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const eventCountBefore = listProgramMembershipEventRecords(database).length;
    const unknownIdentity = await fetch(
      `${baseUrl}/programs/program-1/participation/student?identityId=identity-ghost`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const unsupportedKind = await fetch(`${baseUrl}/programs/program-1/participation/mentor`, {
      headers: { cookie: bootstrap.cookie },
    });
    const unknownProgram = await fetch(`${baseUrl}/programs/program-ghost/participation/student`, {
      headers: { cookie: bootstrap.cookie },
    });
    const eventCountAfter = listProgramMembershipEventRecords(database).length;

    assert.deepEqual(
      {
        eventCountAfter,
        eventCountBefore,
        unknownIdentity: {
          body: await unknownIdentity.json(),
          statusCode: unknownIdentity.status,
        },
        unknownProgram: {
          body: await unknownProgram.json(),
          statusCode: unknownProgram.status,
        },
        unsupportedKind: {
          body: await unsupportedKind.json(),
          statusCode: unsupportedKind.status,
        },
      },
      {
        eventCountAfter: eventCountBefore,
        eventCountBefore,
        unknownIdentity: {
          body: {
            status: "accepted",
            value: {
              allowed: false,
              identityId: "identity-ghost",
              participationKind: "student",
              programId: "program-1",
              reason: "identity_not_active",
            },
          },
          statusCode: 200,
        },
        unknownProgram: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
        unsupportedKind: {
          body: { status: "rejected", reason: "validation_failed" },
          statusCode: 400,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programEventRoutes_shouldRejectOrdinaryCallers", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "audit-4",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const created = await fetch(`${baseUrl}/identity/identities`, {
      body: JSON.stringify({ displayName: "Second Identity" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondIdentityId = (await created.json()).value.id;
    await fetch(`${baseUrl}/identity/identities/${secondIdentityId}/local-password`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "NON_SECRET_TEST_VALUE",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondLogin = await fetch(`${baseUrl}/identity/sessions`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "NON_SECRET_TEST_VALUE",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const secondCookie = secondLogin.headers.get("set-cookie").split(";", 1)[0];
    const programEvents = await fetch(`${baseUrl}/programs/program-1/events`, {
      headers: { cookie: secondCookie },
    });
    const membershipEvents = await fetch(`${baseUrl}/programs/program-1/membership-events`, {
      headers: { cookie: secondCookie },
    });

    assert.deepEqual(
      {
        membershipEvents: {
          body: await membershipEvents.json(),
          statusCode: membershipEvents.status,
        },
        programEvents: { body: await programEvents.json(), statusCode: programEvents.status },
      },
      {
        membershipEvents: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
        programEvents: {
          body: { status: "rejected", reason: "admin_or_curator_required" },
          statusCode: 403,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programEventRoutes_shouldAcceptAdminAndNonAdminCurator_forKnownPrograms", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "identity-2",
      "audit-2",
      "credential-2",
      "audit-3",
      "session-2",
      "program-2",
      "membership-2",
      "program-event-2",
      "membership-event-2",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const created = await fetch(`${baseUrl}/identity/identities`, {
      body: JSON.stringify({ displayName: "Second Identity" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondIdentityId = (await created.json()).value.id;
    await fetch(`${baseUrl}/identity/identities/${secondIdentityId}/local-password`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "NON_SECRET_TEST_VALUE",
      }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const secondLogin = await fetch(`${baseUrl}/identity/sessions`, {
      body: JSON.stringify({
        login: "second@example.test",
        password: "NON_SECRET_TEST_VALUE",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const secondLoginBody = await secondLogin.json();
    const secondCookie = secondLogin.headers.get("set-cookie").split(";", 1)[0];
    const secondProgram = await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Calculus" }),
      headers: {
        cookie: secondCookie,
        "content-type": "application/json",
        "x-agonara-csrf": secondLoginBody.value.csrfToken,
      },
      method: "POST",
    });
    const secondProgramId = (await secondProgram.json()).value.program.programId;
    const adminEvents = await fetch(`${baseUrl}/programs/program-1/events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const curatorEvents = await fetch(`${baseUrl}/programs/${secondProgramId}/membership-events`, {
      headers: { cookie: secondCookie },
    });
    const unknownProgram = await fetch(`${baseUrl}/programs/program-ghost/events`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        adminEvents: { body: await adminEvents.json(), statusCode: adminEvents.status },
        curatorEvents: { body: await curatorEvents.json(), statusCode: curatorEvents.status },
        unknownProgram: { body: await unknownProgram.json(), statusCode: unknownProgram.status },
      },
      {
        adminEvents: {
          body: {
            status: "accepted",
            value: {
              events: [
                {
                  actorIdentityId: "identity-1",
                  eventType: "program_created",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  programEventId: "program-event-1",
                  programId: "program-1",
                },
              ],
            },
          },
          statusCode: 200,
        },
        curatorEvents: {
          body: {
            status: "accepted",
            value: {
              events: [
                {
                  actorIdentityId: "identity-2",
                  eventType: "initial_curator_membership_created",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  participationKind: "program_curator",
                  programId: secondProgramId,
                  programMembershipEventId: "membership-event-2",
                  resultingStatus: "active",
                  targetIdentityId: "identity-2",
                },
              ],
            },
          },
          statusCode: 200,
        },
        unknownProgram: {
          body: { status: "rejected", reason: "program_not_found" },
          statusCode: 404,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programEventRoutes_shouldPaginateScopedEvents", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "membership-event-2",
      "membership-event-3",
      "membership-event-4",
      "program-2",
      "membership-2",
      "program-event-2",
      "membership-event-5",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Calculus" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const firstPage = await fetch(`${baseUrl}/programs/program-1/membership-events?limit=2`, {
      headers: { cookie: bootstrap.cookie },
    });
    const firstPageBody = await firstPage.json();
    const secondPage = await fetch(
      `${baseUrl}/programs/program-1/membership-events?limit=2&cursor=${firstPageBody.value.nextCursor}`,
      { headers: { cookie: bootstrap.cookie } },
    );
    const programEvents = await fetch(`${baseUrl}/programs/program-1/events`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        firstPage: {
          eventProgramIds: firstPageBody.value.events.map($0 => $0.programId),
          eventTypes: firstPageBody.value.events.map($0 => $0.eventType),
          hasNextCursor: typeof firstPageBody.value.nextCursor === "string",
          statusCode: firstPage.status,
        },
        programEvents: { body: await programEvents.json(), statusCode: programEvents.status },
        secondPage: { body: await secondPage.json(), statusCode: secondPage.status },
      },
      {
        firstPage: {
          eventProgramIds: ["program-1", "program-1"],
          eventTypes: ["initial_curator_membership_created", "student_membership_joined"],
          hasNextCursor: true,
          statusCode: 200,
        },
        programEvents: {
          body: {
            status: "accepted",
            value: {
              events: [
                {
                  actorIdentityId: "identity-1",
                  eventType: "program_created",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  programEventId: "program-event-1",
                  programId: "program-1",
                },
              ],
            },
          },
          statusCode: 200,
        },
        secondPage: {
          body: {
            status: "accepted",
            value: {
              events: [
                {
                  actorIdentityId: "identity-1",
                  eventType: "student_membership_left",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  participationKind: "student",
                  programId: "program-1",
                  programMembershipEventId: "membership-event-3",
                  resultingStatus: "left",
                  targetIdentityId: "identity-1",
                },
                {
                  actorIdentityId: "identity-1",
                  eventType: "student_membership_rejoined",
                  occurredAt: "2026-05-27T10:00:00.000Z",
                  outcome: "accepted",
                  participationKind: "student",
                  programId: "program-1",
                  programMembershipEventId: "membership-event-4",
                  resultingStatus: "active",
                  targetIdentityId: "identity-1",
                },
              ],
            },
          },
          statusCode: 200,
        },
      },
    );
  } finally {
    await close();
  }
});

test("programEventRoutes_shouldRejectInvalidQueriesAndRedactResponses", async () => {
  const { baseUrl, close } = await listenWithIdentityAndProgram({
    ids: [
      "identity-1",
      "credential-1",
      "session-1",
      "audit-1",
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "student-membership-1",
      "membership-event-2",
      "membership-event-3",
    ],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    await fetch(`${baseUrl}/programs`, {
      body: JSON.stringify({ title: "Linear Algebra" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    await fetch(`${baseUrl}/programs/program-1/student-membership`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const validResponse = await fetch(`${baseUrl}/programs/program-1/membership-events?limit=1`, {
      headers: { cookie: bootstrap.cookie },
    });
    const validText = await validResponse.text();
    const validBody = JSON.parse(validText);
    const invalidRequests = [];
    for (const query of ["limit=0", "limit=101", "limit=two", "cursor=not-a-cursor"]) {
      const response = await fetch(`${baseUrl}/programs/program-1/membership-events?${query}`, {
        headers: { cookie: bootstrap.cookie },
      });
      invalidRequests.push({ body: await response.json(), statusCode: response.status });
    }
    const unscopedProgramEvents = await fetch(`${baseUrl}/program-events`, {
      headers: { cookie: bootstrap.cookie },
    });
    const unscopedMembershipEvents = await fetch(`${baseUrl}/program-membership-events`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        invalidRequests,
        redaction: {
          hasAuthorization: validText.includes("authorization"),
          hasBootstrapSecret: validText.includes("operator-secret"),
          hasCookie: validText.includes("cookie"),
          hasCsrf: validText.includes(bootstrap.csrfToken),
          hasPassword: validText.includes("NON_SECRET_TEST_VALUE"),
          hasSession: validText.includes("session-1"),
          hasSql: validText.toLowerCase().includes("select "),
          hasStack: validText.includes("Error:"),
          nextCursorHasSecrets: [
            bootstrap.csrfToken,
            "cookie",
            "operator-secret",
            "select ",
            "session-1",
          ].some(secret => validBody.value.nextCursor?.includes(secret)),
        },
        unscopedMembershipEvents: unscopedMembershipEvents.status,
        unscopedProgramEvents: unscopedProgramEvents.status,
        validStatusCode: validResponse.status,
      },
      {
        invalidRequests: [
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
          { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
        ],
        redaction: {
          hasAuthorization: false,
          hasBootstrapSecret: false,
          hasCookie: false,
          hasCsrf: false,
          hasPassword: false,
          hasSession: false,
          hasSql: false,
          hasStack: false,
          nextCursorHasSecrets: false,
        },
        unscopedMembershipEvents: 404,
        unscopedProgramEvents: 404,
        validStatusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("adminBoard_shouldServeShell_withoutSensitiveRuntimeValues", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.deepEqual(
      {
        statusCode: response.status,
        contentType: response.headers.get("content-type"),
        hasAppRoot: body.includes('id="admin-app"'),
        hasBootstrapSecret: body.includes("operator-secret"),
        hasSessionCookieName: body.includes("agonara_session"),
      },
      {
        statusCode: 200,
        contentType: "text/html; charset=utf-8",
        hasAppRoot: true,
        hasBootstrapSecret: false,
        hasSessionCookieName: false,
      },
    );
  } finally {
    await close();
  }
});

test("adminBoard_shouldExposeSessionControls_withoutSensitiveRuntimeValues", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.deepEqual(
      {
        hasBootstrapForm: body.includes('id="bootstrap-form"'),
        hasLoginForm: body.includes('id="login-form"'),
        hasSessionPanel: body.includes('id="session-panel"'),
        hasLogoutButton: body.includes('id="logout-button"'),
        hasPasswordValue: body.includes("NON_SECRET_TEST_VALUE"),
        hasBootstrapSecret: body.includes("operator-secret"),
        hasSessionCookieName: body.includes("agonara_session"),
      },
      {
        hasBootstrapForm: true,
        hasLoginForm: true,
        hasSessionPanel: true,
        hasLogoutButton: true,
        hasPasswordValue: false,
        hasBootstrapSecret: false,
        hasSessionCookieName: false,
      },
    );
  } finally {
    await close();
  }
});

test("adminBoard_shouldExposeIdentityOperationControls_withoutSensitiveRuntimeValues", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.deepEqual(
      {
        hasIdentityList: body.includes('id="identity-list"'),
        hasCreateIdentityForm: body.includes('id="create-identity-form"'),
        hasCredentialForm: body.includes('id="credential-form"'),
        hasAccessPanel: body.includes('id="operational-access-panel"'),
        hasDisableAction: body.includes('data-action="disable"'),
        hasGrantAdminAction: body.includes('data-action="grant-admin"'),
        hasRevokeAdminAction: body.includes('data-action="revoke-admin"'),
        hasPasswordValue: body.includes("NON_SECRET_TEST_VALUE"),
        hasBootstrapSecret: body.includes("operator-secret"),
        hasSessionCookieName: body.includes("agonara_session"),
      },
      {
        hasIdentityList: true,
        hasCreateIdentityForm: true,
        hasCredentialForm: true,
        hasAccessPanel: true,
        hasDisableAction: true,
        hasGrantAdminAction: true,
        hasRevokeAdminAction: true,
        hasPasswordValue: false,
        hasBootstrapSecret: false,
        hasSessionCookieName: false,
      },
    );
  } finally {
    await close();
  }
});

test("adminBoard_shouldExposeAuditEventInspection_withoutSensitiveRuntimeValues", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/admin`);
    const body = await response.text();

    assert.deepEqual(
      {
        hasAuditPanel: body.includes('id="audit-events-panel"'),
        hasAuditList: body.includes('id="audit-event-list"'),
        hasRefreshAuditButton: body.includes('id="refresh-audit-events-button"'),
        hasTargetSessionHeader: body.includes("targetSessionId"),
        hasPasswordValue: body.includes("NON_SECRET_TEST_VALUE"),
        hasBootstrapSecret: body.includes("operator-secret"),
        hasSessionCookieName: body.includes("agonara_session"),
      },
      {
        hasAuditPanel: true,
        hasAuditList: true,
        hasRefreshAuditButton: true,
        hasTargetSessionHeader: false,
        hasPasswordValue: false,
        hasBootstrapSecret: false,
        hasSessionCookieName: false,
      },
    );
  } finally {
    await close();
  }
});

test("identityBootstrapStatus_shouldReflectAvailability_beforeAndAfterBootstrap", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const before = await fetch(`${baseUrl}/identity/bootstrap/status`);
    await bootstrapAdmin(baseUrl);
    const after = await fetch(`${baseUrl}/identity/bootstrap/status`);

    assert.deepEqual(
      {
        before: await before.json(),
        after: await after.json(),
      },
      {
        before: { status: "accepted", value: { available: true } },
        after: { status: "accepted", value: { available: false } },
      },
    );
  } finally {
    await close();
  }
});

test("identityBootstrap_shouldSetSecureCookie_onForwardedHttps", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/identity/bootstrap/admin`, {
      body: JSON.stringify({
        bootstrapSecret: "operator-secret",
        displayName: "Root Admin",
        login: "admin@example.test",
        password: "NON_SECRET_TEST_VALUE",
      }),
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
      },
      method: "POST",
    });

    assert.equal(response.headers.get("set-cookie")?.includes("Secure"), true);
  } finally {
    await close();
  }
});

test("identitySessions_shouldSetCookieAndHideSessionId_onAcceptedLogin", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/identity/sessions`, {
      body: JSON.stringify({
        login: "admin@example.test",
        password: "NON_SECRET_TEST_VALUE",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        hasSessionCookie: response.headers.get("set-cookie")?.includes("agonara_session="),
        hasSessionIdInBody: JSON.stringify(body).includes("session-2"),
        bodyStatus: body.status,
        isAdmin: body.value.identity.isAdmin,
        hasCsrfToken: typeof body.value.csrfToken === "string",
      },
      {
        statusCode: 200,
        hasSessionCookie: true,
        hasSessionIdInBody: false,
        bodyStatus: "accepted",
        isAdmin: true,
        hasCsrfToken: true,
      },
    );
  } finally {
    await close();
  }
});

test("identitySessionDelete_shouldRequireCsrf_onActiveSession", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/identity/session`, {
      headers: { cookie: bootstrap.cookie },
      method: "DELETE",
    });

    assert.deepEqual(await response.json(), {
      status: "rejected",
      reason: "csrf_required",
    });
  } finally {
    await close();
  }
});

test("identitySessionDelete_shouldRevokeSession_onMatchingCsrf", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const logout = await fetch(`${baseUrl}/identity/session`, {
      headers: {
        cookie: bootstrap.cookie,
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "DELETE",
    });
    const session = await fetch(`${baseUrl}/identity/session`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        logout: await logout.json(),
        session: await session.json(),
      },
      {
        logout: { status: "accepted", value: { loggedOut: true } },
        session: { status: "rejected", reason: "session_revoked" },
      },
    );
  } finally {
    await close();
  }
});

test("identitySessions_shouldRateLimit_onRepeatedInvalidCredentials", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    await bootstrapAdmin(baseUrl);
    let response;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      response = await fetch(`${baseUrl}/identity/sessions`, {
        body: JSON.stringify({
          login: "admin@example.test",
          password: "NON_SECRET_REJECTED_VALUE",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    }

    assert.deepEqual(
      {
        statusCode: response.status,
        body: await response.json(),
      },
      {
        statusCode: 429,
        body: { status: "rejected", reason: "rate_limited" },
      },
    );
  } finally {
    await close();
  }
});

test("identityAdminEndpoints_shouldCreateIdentityAndListAudit_onAdminSession", async () => {
  const { baseUrl, close } = await listenWithIdentity({
    ids: ["identity-1", "credential-1", "session-1", "audit-1", "identity-2", "audit-2"],
  });

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const created = await fetch(`${baseUrl}/identity/identities`, {
      body: JSON.stringify({ displayName: "Second Identity" }),
      headers: {
        cookie: bootstrap.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": bootstrap.csrfToken,
      },
      method: "POST",
    });
    const audit = await fetch(`${baseUrl}/identity/audit-events`, {
      headers: { cookie: bootstrap.cookie },
    });

    assert.deepEqual(
      {
        created: await created.json(),
        auditBody: await audit.json(),
      },
      {
        created: {
          status: "accepted",
          value: {
            id: "identity-2",
            displayName: "Second Identity",
            state: "active",
            isAdmin: false,
          },
        },
        auditBody: {
          status: "accepted",
          value: {
            auditEvents: [
              {
                id: "audit-1",
                eventType: "bootstrap_first_admin",
                actorIdentityId: null,
                targetIdentityId: "identity-1",
                targetCredentialId: null,
                occurredAt: "2026-05-27T10:00:00.000Z",
                outcome: "accepted",
                reason: null,
              },
              {
                id: "audit-2",
                eventType: "identity_created",
                actorIdentityId: "identity-1",
                targetIdentityId: "identity-2",
                targetCredentialId: null,
                occurredAt: "2026-05-27T10:00:00.000Z",
                outcome: "accepted",
                reason: null,
              },
            ],
          },
        },
      },
    );
  } finally {
    await close();
  }
});

test("startServer_shouldExposeStudentWorkspaceOpenAnswerRoutes_onProductionComposition", async () => {
  const databaseDirectory = mkdtempSync(join(tmpdir(), "agonara-production-composition-"));
  const databasePath = join(databaseDirectory, "agonara.sqlite");
  const server = startServer({
    bootstrapSecret: "operator-secret",
    databasePath,
    host: "127.0.0.1",
    log: () => {},
    port: "0",
  });
  const baseUrl = await baseUrlForStartedServer(server);

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const submission = await submitOpenAnswerAttempt(
      baseUrl,
      scenario.student,
      scenario.programId,
      {
        checkRevisionId: scenario.acceptedCheck.revisionId,
        submittedAnswer: "Production composition answer.",
      },
      "production-composition-key",
    );
    const submissionBody = await submission.json();
    const attemptId = submissionBody.value?.attempt?.attemptId;
    const detail = await fetch(`${baseUrl}/open-answer-attempts/${attemptId}`, {
      headers: { cookie: scenario.student.cookie },
    });
    const list = await fetch(`${baseUrl}/programs/${scenario.programId}/open-answer-attempts`, {
      headers: { cookie: scenario.student.cookie },
    });

    assert.deepEqual(
      {
        detailStatusCode: detail.status,
        listStatusCode: list.status,
        listedAttemptIds: (await list.json()).value?.attempts.map($0 => $0.attemptId),
        submissionStatus: submissionBody.status,
        submissionStatusCode: submission.status,
      },
      {
        detailStatusCode: 200,
        listStatusCode: 200,
        listedAttemptIds: [attemptId],
        submissionStatus: "accepted",
        submissionStatusCode: 200,
      },
    );
  } finally {
    await close(server);
    rmSync(databaseDirectory, { force: true, recursive: true });
  }
});

test("operationsDiagnostics_shouldAcceptAdminSession_onActiveAdmin", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const bootstrap = await bootstrapAdmin(baseUrl);
    const response = await fetch(`${baseUrl}/operations/diagnostics`, {
      headers: { cookie: bootstrap.cookie },
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        bodyStatus: body.status,
        checkName: body.checks[0].name,
        checkStatus: body.checks[0].status,
        hasGeneratedAt: typeof body.generatedAt === "string",
        observedAt: body.checks[0].observedAt,
        requestId: body.requestId,
        responseRequestId: response.headers.get("x-request-id"),
      },
      {
        statusCode: 200,
        bodyStatus: "ok",
        checkName: "identity",
        checkStatus: "ok",
        hasGeneratedAt: true,
        observedAt: body.generatedAt,
        requestId: response.headers.get("x-request-id"),
        responseRequestId: body.requestId,
      },
    );
  } finally {
    await close();
  }
});

test("httpApiRoutes_shouldEmitCompletionLogs_onAcceptedRequests", async () => {
  const logEvents = [];
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(60),
    log: $0 => logEvents.push($0),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const requests = [
      {
        expectedOperation: "GET /identity/session",
        fetch: () => fetch(`${baseUrl}/identity/session`, {
          headers: {
            cookie: scenario.student.cookie,
            "x-request-id": "identity-log",
          },
        }),
        requestId: "identity-log",
      },
      {
        expectedOperation: "GET /programs",
        fetch: () => fetch(`${baseUrl}/programs`, {
          headers: {
            cookie: scenario.student.cookie,
            "x-request-id": "program-log",
          },
        }),
        requestId: "program-log",
      },
      {
        expectedOperation: `GET /programs/${scenario.programId}/open-answer-checks`,
        fetch: () => fetch(`${baseUrl}/programs/${scenario.programId}/open-answer-checks`, {
          headers: {
            cookie: scenario.student.cookie,
            "x-request-id": "corpus-log",
          },
        }),
        requestId: "corpus-log",
      },
      {
        expectedOperation: `GET /programs/${scenario.programId}/open-answer-attempts`,
        fetch: () => fetch(`${baseUrl}/programs/${scenario.programId}/open-answer-attempts`, {
          headers: {
            cookie: scenario.student.cookie,
            "x-request-id": "student-workspace-log",
          },
        }),
        requestId: "student-workspace-log",
      },
    ];
    for (const request of requests) {
      await request.fetch();
    }

    assert.deepEqual(
      projectCompletionLogs(logEvents, requests),
      requests.map($0 => ({
        hasSensitiveDetail: false,
        operation: $0.expectedOperation,
        outcome: "accepted",
        requestId: $0.requestId,
        severity: "info",
      })),
    );
  } finally {
    await close();
  }
});

test("httpApiRoutes_shouldEmitCompletionLogs_onRejectedRequests", async () => {
  const logEvents = [];
  const { baseUrl, close } = await listenWithIdentityProgramCorpusAndStudentWorkspace({
    ids: manyIds(60),
    log: $0 => logEvents.push($0),
  });

  try {
    const scenario = await createStudentAttemptApiScenario(baseUrl);
    const requests = [
      {
        expectedOperation: "POST /identity/sessions",
        fetch: () => fetch(`${baseUrl}/identity/sessions`, {
          body: JSON.stringify({
            login: "student@example.test",
            password: "NON_SECRET_INVALID_VALUE",
          }),
          headers: {
            "content-type": "application/json",
            "x-request-id": "identity-rejected-log",
          },
          method: "POST",
        }),
        reason: "invalid_credentials",
        requestId: "identity-rejected-log",
      },
      {
        expectedOperation: "GET /programs",
        fetch: () => fetch(`${baseUrl}/programs`, {
          headers: { "x-request-id": "program-rejected-log" },
        }),
        reason: "session_not_found",
        requestId: "program-rejected-log",
      },
      {
        expectedOperation: "/programs/program-missing/open-answer-checks",
        fetch: () => fetch(`${baseUrl}/programs/program-missing/open-answer-checks`, {
          headers: {
            cookie: scenario.student.cookie,
            "x-request-id": "corpus-rejected-log",
          },
        }),
        reason: "program_not_found",
        requestId: "corpus-rejected-log",
      },
      {
        expectedOperation: `/programs/${scenario.programId}/open-answer-attempts`,
        fetch: () => fetch(`${baseUrl}/programs/${scenario.programId}/open-answer-attempts?limit=abc`, {
          headers: {
            cookie: scenario.student.cookie,
            "x-request-id": "student-workspace-rejected-log",
          },
        }),
        reason: "validation_failed",
        requestId: "student-workspace-rejected-log",
      },
    ];
    for (const request of requests) {
      await request.fetch();
    }

    assert.deepEqual(
      projectCompletionLogs(logEvents, requests),
      requests.map($0 => ({
        hasSensitiveDetail: false,
        operation: $0.expectedOperation.startsWith("GET ") || $0.expectedOperation.startsWith("POST ")
          ? $0.expectedOperation
          : `GET ${$0.expectedOperation}`,
        outcome: "rejected",
        reason: $0.reason,
        requestId: $0.requestId,
        severity: "warning",
      })),
    );
  } finally {
    await close();
  }
});

function projectCompletionLogs(logEvents, requests) {
  const requestIds = new Set(requests.map($0 => $0.requestId));
  return logEvents
    .filter($0 => requestIds.has($0.requestId))
    .map($0 => ({
      hasSensitiveDetail: hasSensitiveCompletionLogDetail($0),
      operation: $0.operation,
      outcome: $0.outcome,
      ...($0.reason === undefined ? {} : { reason: $0.reason }),
      requestId: $0.requestId,
      severity: $0.severity,
    }));
}

function hasSensitiveCompletionLogDetail(event) {
  const serialized = JSON.stringify(event);
  return [
    "agonara_session",
    "NON_SECRET_TEST_VALUE",
    "raw model",
    "raw prompt",
    "stack",
    "NON_SECRET_INVALID_VALUE",
    "x-agonara-csrf",
    "x-agonara-idempotency-key",
  ].some($0 => serialized.includes($0));
}

async function bootstrapAdmin(baseUrl) {
  const response = await fetch(`${baseUrl}/identity/bootstrap/admin`, {
    body: JSON.stringify({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "NON_SECRET_TEST_VALUE",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = await response.json();
  return {
    body,
    cookie: response.headers.get("set-cookie").split(";", 1)[0],
    csrfToken: body.value.csrfToken,
  };
}

async function createIdentitySession(baseUrl, bootstrap, { displayName, login }) {
  const created = await fetch(`${baseUrl}/identity/identities`, {
    body: JSON.stringify({ displayName }),
    headers: {
      cookie: bootstrap.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": bootstrap.csrfToken,
    },
    method: "POST",
  });
  const identityId = (await created.json()).value.id;
  await fetch(`${baseUrl}/identity/identities/${identityId}/local-password`, {
    body: JSON.stringify({
      login,
      password: "NON_SECRET_TEST_VALUE",
    }),
    headers: {
      cookie: bootstrap.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": bootstrap.csrfToken,
    },
    method: "POST",
  });
  const loginResponse = await fetch(`${baseUrl}/identity/sessions`, {
    body: JSON.stringify({
      login,
      password: "NON_SECRET_TEST_VALUE",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = await loginResponse.json();
  return {
    body,
    cookie: loginResponse.headers.get("set-cookie").split(";", 1)[0],
    csrfToken: body.value.csrfToken,
    identityId,
  };
}

async function createProgram(baseUrl, session, body) {
  return fetch(`${baseUrl}/programs`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function createProgramSource(baseUrl, session, programId, body) {
  return fetch(`${baseUrl}/programs/${programId}/sources`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function createCorpusCandidate(baseUrl, session, programId, body) {
  return fetch(`${baseUrl}/programs/${programId}/corpus-candidates`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function createAssessmentCriterionCandidate(baseUrl, session, programId, body) {
  return fetch(`${baseUrl}/programs/${programId}/assessment-criteria/candidates`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function acceptAssessmentCriterionCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/assessment-criteria/candidates/${candidateId}/acceptance`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function rejectAssessmentCriterionCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/assessment-criteria/candidates/${candidateId}/rejection`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function createOpenAnswerCheckCandidate(baseUrl, session, programId, body) {
  return fetch(`${baseUrl}/programs/${programId}/open-answer-checks/candidates`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function acceptOpenAnswerCheckCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/open-answer-checks/candidates/${candidateId}/acceptance`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function rejectOpenAnswerCheckCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/open-answer-checks/candidates/${candidateId}/rejection`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function createQuickCheckCandidate(baseUrl, session, programId, body) {
  return fetch(`${baseUrl}/programs/${programId}/quick-checks/candidates`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function acceptQuickCheckCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/quick-checks/candidates/${candidateId}/acceptance`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function rejectQuickCheckCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/quick-checks/candidates/${candidateId}/rejection`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function createAcceptedCandidate(baseUrl, session, programId, body) {
  const { targetEntityId, ...candidateBody } = body;
  const candidate = await createCorpusCandidate(baseUrl, session, programId, candidateBody);
  const candidateId = (await candidate.json()).value.corpusCandidate.candidateId;
  const acceptedResponse = await acceptCorpusCandidate(
    baseUrl,
    session,
    candidateId,
    targetEntityId === undefined ? {} : { targetEntityId },
  );
  return (await acceptedResponse.json()).value.acceptedCorpus;
}

async function acceptCorpusCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/corpus-candidates/${candidateId}/acceptance`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function rejectCorpusCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/corpus-candidates/${candidateId}/rejection`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function getHttpResponse(baseUrl, route, session) {
  const response = await fetch(`${baseUrl}${route}`, {
    headers: { cookie: session.cookie },
  });
  return { body: await response.json(), statusCode: response.status };
}

async function joinStudentProgram(baseUrl, session, programId) {
  return fetch(`${baseUrl}/programs/${programId}/student-membership`, {
    headers: {
      cookie: session.cookie,
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

async function createStudentAttemptApiScenario(baseUrl) {
  const bootstrap = await bootstrapAdmin(baseUrl);
  const curator = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Curator",
    login: "curator@example.test",
  });
  const student = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Student",
    login: "student@example.test",
  });
  const createdProgram = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
  const programId = (await createdProgram.json()).value.program.programId;
  await joinStudentProgram(baseUrl, student, programId);
  const acceptedCheck = await createAcceptedOpenAnswerCheck(baseUrl, curator, programId, {
    checkTitle: "Closure check",
    criterionTitles: ["Vector-space closure", "Scalar distribution"],
  });

  return { acceptedCheck, bootstrap, curator, programId, student };
}

async function createAcceptedOpenAnswerCheck(
  baseUrl,
  session,
  programId,
  { checkTitle = "Closure check", criterionTitle = null, criterionTitles = null } = {},
) {
  const titles = criterionTitles ?? [criterionTitle ?? "Vector-space closure"];
  const criterionEntityIds = [];
  for (const title of titles) {
    const criterionCandidate = await createAssessmentCriterionCandidate(baseUrl, session, programId, {
      body: `Explain ${title}.`,
      title,
    });
    const criterionCandidateId = (await criterionCandidate.json()).value.assessmentCriterionCandidate.candidateId;
    const acceptedCriterion = await acceptAssessmentCriterionCandidate(
      baseUrl,
      session,
      criterionCandidateId,
      {},
    );
    criterionEntityIds.push((await acceptedCriterion.json()).value.acceptedAssessmentCriterion.entityId);
  }

  const checkCandidate = await createOpenAnswerCheckCandidate(baseUrl, session, programId, {
    checkKind: "open_answer",
    criterionEntityIds,
    prompt: `Why does ${checkTitle} matter?`,
    title: checkTitle,
  });
  const checkCandidateId = (await checkCandidate.json()).value.openAnswerCheckCandidate.candidateId;
  const acceptedCheck = await acceptOpenAnswerCheckCandidate(baseUrl, session, checkCandidateId, {});
  return (await acceptedCheck.json()).value.acceptedOpenAnswerCheck;
}

async function createAcceptedQuickCheck(
  baseUrl,
  session,
  programId,
  {
    answerKeyOptionIndex = 0,
    options = ["Closed under addition", "Only finite dimension"],
    prompt = "Which property is required for a vector space?",
    title = "Closure check",
  } = {},
) {
  const candidate = await createQuickCheckCandidate(baseUrl, session, programId, {
    answerKeyOptionIndex,
    checkKind: "single_select_quick_check",
    options,
    prompt,
    title,
  });
  const candidateId = (await candidate.json()).value.quickCheckCandidate.candidateId;
  const acceptedQuickCheck = await acceptQuickCheckCandidate(baseUrl, session, candidateId, {});
  return (await acceptedQuickCheck.json()).value.acceptedQuickCheck;
}

async function submitOpenAnswerAttempt(baseUrl, session, programId, body, idempotencyKey) {
  return fetch(`${baseUrl}/programs/${programId}/open-answer-attempts`, {
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

async function submitQuickCheckAttempt(baseUrl, session, programId, body, idempotencyKey) {
  return fetch(`${baseUrl}/programs/${programId}/quick-check-attempts`, {
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

async function submitOpenAnswerAttemptAndRead(
  baseUrl,
  session,
  programId,
  checkRevisionId,
  submittedAnswer,
  idempotencyKey,
) {
  const response = await submitOpenAnswerAttempt(
    baseUrl,
    session,
    programId,
    { checkRevisionId, submittedAnswer },
    idempotencyKey,
  );
  return (await response.json()).value.attempt;
}

async function listOpenAnswerAttempts(baseUrl, session, programId, query = "") {
  const separator = query ? "?" : "";
  const response = await fetch(`${baseUrl}/programs/${programId}/open-answer-attempts${separator}${query}`, {
    headers: { cookie: session.cookie },
  });
  return { body: await response.json(), statusCode: response.status };
}

async function listQuickCheckAttempts(baseUrl, session, programId, query = "") {
  const separator = query ? "?" : "";
  const response = await fetch(`${baseUrl}/programs/${programId}/quick-check-attempts${separator}${query}`, {
    headers: { cookie: session.cookie },
  });
  return { body: await response.json(), statusCode: response.status };
}

function openAnswerAttemptResponseProjection(body) {
  const attempt = body.value?.attempt;
  return {
    status: body.status,
    hasAttemptId: typeof attempt?.attemptId === "string",
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

function openAnswerAttemptListProjection(body) {
  return {
    status: body.status,
    attempts: (body.value?.attempts ?? []).map($0 => ({
      attemptId: $0.attemptId,
      programId: $0.programId,
      studentIdentityId: $0.studentIdentityId,
      checkRevisionId: $0.checkRevisionId,
      submittedAnswer: $0.submittedAnswer,
      status: $0.status,
    })),
    hasNextCursor: typeof body.value?.nextCursor === "string",
  };
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

function openAnswerAttemptEvaluationProjection(body) {
  const evaluation = body.value?.evaluation;
  return {
    status: body.status,
    attemptStatus: body.value?.attempt?.status,
    hasEvaluationId: typeof evaluation?.evaluationId === "string",
    evaluatorKind: evaluation?.evaluatorKind,
    summaryFeedback: evaluation?.summaryFeedback,
    criterionFeedback: evaluation?.criterionFeedback,
    evaluatedAt: evaluation?.evaluatedAt,
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

function hasAttemptDetailLeak(body) {
  const serialized = JSON.stringify(body);
  return [
    "attempt-key-secret",
    "idempotency",
    "session-1",
    "csrf-token-1",
    "cookie",
    "authorization",
    "raw prompt",
    "raw model",
    "evaluator diagnostics",
    "sql",
    "stack",
    "/tmp/db.sqlite",
    "postgres://db",
  ].some($0 => serialized.includes($0));
}

function containsAnyStudentWorkspaceEvaluationMutationCommand(source) {
  return [
    "markOpenAnswerAttemptEvaluating",
    "recordOpenAnswerEvaluation",
    "recordOpenAnswerEvaluationFailure",
  ].some($0 => source.includes($0));
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

async function listenWithIdentity({ ids = defaultIds(), log = () => {} } = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const server = createServer({
    identityCommands: createIdentityCommands({
      bootstrapSecret: "operator-secret",
      database,
      generateId: makeIdGenerator(ids),
      now: () => new Date("2026-05-27T10:00:00.000Z"),
    }),
    log,
  });
  const baseUrl = await listen(server);
  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
  };
}

async function listenWithIdentityAndProgram({ ids = defaultIds(), log = () => {} } = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const now = () => new Date("2026-05-27T10:00:00.000Z");
  const generateId = makeIdGenerator(ids);
  const server = createServer({
    identityCommands: createIdentityCommands({
      bootstrapSecret: "operator-secret",
      database,
      generateId,
      now,
    }),
    programCommands: createProgramCommands({
      database,
      generateId,
      now,
    }),
    log,
  });
  const baseUrl = await listen(server);
  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
    database,
  };
}

async function listenWithIdentityProgramAndCorpus({
  corpusCommandsOverride = null,
  ids = defaultIds(),
  log = () => {},
} = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const now = () => new Date("2026-05-27T10:00:00.000Z");
  const generateId = makeIdGenerator(ids);
  const programCommands = createProgramCommands({
    database,
    generateId,
    now,
  });
  const server = createServer({
    identityCommands: createIdentityCommands({
      bootstrapSecret: "operator-secret",
      database,
      generateId,
      now,
    }),
    programCommands,
    corpusCommands: corpusCommandsOverride ?? createCorpusCommands({
      database,
      generateId,
      getEffectiveParticipation: programCommands.getEffectiveParticipation,
      now,
    }),
    log,
  });
  const baseUrl = await listen(server);
  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
    database,
  };
}

async function listenWithIdentityProgramCorpusAndStudentWorkspace({
  ids = defaultIds(),
  log = () => {},
  studentWorkspaceCommandsOverride = null,
} = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const now = () => new Date("2026-05-27T10:00:00.000Z");
  const generateId = makeIdGenerator(ids);
  const programCommands = createProgramCommands({
    database,
    generateId,
    now,
  });
  const studentWorkspaceCommands = studentWorkspaceCommandsOverride ?? createStudentWorkspaceCommands({
    database,
    generateId,
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
    now,
  });
  const server = createServer({
    identityCommands: createIdentityCommands({
      bootstrapSecret: "operator-secret",
      database,
      generateId,
      now,
    }),
    programCommands,
    corpusCommands: createCorpusCommands({
      database,
      generateId,
      getEffectiveParticipation: programCommands.getEffectiveParticipation,
      now,
    }),
    studentWorkspaceCommands,
    log,
  });
  const baseUrl = await listen(server);
  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
    database,
    studentWorkspaceCommands,
  };
}

function defaultIds() {
  return [
    "identity-1",
    "credential-1",
    "session-1",
    "audit-1",
    "session-2",
    "audit-2",
    "identity-2",
    "credential-2",
  ];
}

function manyIds(count) {
  return Array.from({ length: count }, (_, index) => `id-${index + 1}`);
}

function acceptedCorpusListProjection(body, statusCode) {
  return {
    statusCode,
    titles: body.value?.acceptedCorpus?.map($0 => $0.title) ?? [],
    ...(body.value?.nextCursor ? { hasNextCursor: typeof body.value.nextCursor === "string" } : {}),
  };
}

function assessmentCriterionCandidateProjection(body) {
  const candidate = body.value?.assessmentCriterionCandidate;
  return {
    body: candidate?.body,
    programId: candidate?.programId,
    sourceIds: candidate?.sourceIds,
    status: candidate?.status,
    title: candidate?.title,
  };
}

function assessmentCriterionCandidateListProjection(body) {
  return body.value?.assessmentCriterionCandidates?.map($0 => $0.title) ?? [];
}

function acceptedAssessmentCriterionProjection(body) {
  const criterion = body.value?.acceptedAssessmentCriterion;
  return {
    acceptedFromCandidateId: criterion?.acceptedFromCandidateId,
    programId: criterion?.programId,
    sourceIds: criterion?.sourceIds,
    title: criterion?.title,
  };
}

function openAnswerCheckCandidateProjection(body) {
  const candidate = body.value?.openAnswerCheckCandidate;
  return {
    checkKind: candidate?.checkKind,
    criterionEntityIds: candidate?.criterionEntityIds,
    programId: candidate?.programId,
    prompt: candidate?.prompt,
    status: candidate?.status,
    title: candidate?.title,
  };
}

function openAnswerCheckCandidateListProjection(body) {
  return body.value?.openAnswerCheckCandidates?.map($0 => $0.title) ?? [];
}

function quickCheckCandidateProjection(body) {
  const candidate = body.value?.quickCheckCandidate;
  const answerKeyOption = candidate?.options?.find($0 => $0.optionId === candidate.answerKeyOptionId);
  return {
    answerKeyText: answerKeyOption?.text,
    checkKind: candidate?.checkKind,
    optionTexts: candidate?.options?.map($0 => $0.text),
    programId: candidate?.programId,
    prompt: candidate?.prompt,
    sourceIds: candidate?.sourceIds,
    status: candidate?.status,
    title: candidate?.title,
  };
}

function quickCheckCandidateListProjection(body) {
  return body.value?.quickCheckCandidates?.map($0 => $0.title) ?? [];
}

function acceptedOpenAnswerCheckProjection(body) {
  const check = body.value?.acceptedOpenAnswerCheck;
  return {
    acceptedFromCandidateId: check?.acceptedFromCandidateId,
    criterionRevisionIds: check?.criterionRevisionIds,
    programId: check?.programId,
    title: check?.title,
  };
}

function acceptedQuickCheckForCurationProjection(body) {
  const quickCheck = body.value?.acceptedQuickCheck;
  const answerKeyOption = quickCheck?.options?.find($0 => $0.optionId === quickCheck.answerKeyOptionId);
  return {
    acceptedFromCandidateId: quickCheck?.acceptedFromCandidateId,
    answerKeyText: answerKeyOption?.text,
    optionTexts: quickCheck?.options?.map($0 => $0.text),
    programId: quickCheck?.programId,
    prompt: quickCheck?.prompt,
    title: quickCheck?.title,
  };
}

function quickCheckDeliveryProjection(body) {
  const delivery = body.value?.quickCheckDelivery;
  return {
    checkKind: delivery?.checkKind,
    optionTexts: delivery?.options?.map($0 => $0.text),
    programId: delivery?.programId,
    prompt: delivery?.prompt,
    title: delivery?.title,
  };
}

function quickCheckDeliveryListProjection(body) {
  return body.value?.quickCheckDeliveries?.map($0 => $0.title) ?? [];
}

function containsQuickCheckStudentDeliveryLeaks(serialized) {
  return [
    "answerKey",
    "answer_key",
    "acceptedFromCandidateId",
    "candidateId",
    "acceptedByIdentityId",
    "acceptedAt",
    "rationale",
    "correct",
    "idempotency",
  ].some($0 => serialized.includes($0));
}

function acceptedOpenAnswerCheckListProjection(body) {
  return body.value?.acceptedOpenAnswerChecks?.map($0 => $0.title) ?? [];
}

function acceptedCorpusRevisionProjection(body, statusCode) {
  return {
    statusCode,
    revisionId: body.value?.acceptedCorpus?.revisionId,
    title: body.value?.acceptedCorpus?.title,
  };
}

function corpusEventListProjection(body, statusCode) {
  return {
    statusCode,
    eventTypes: body.value?.corpusEvents?.map($0 => $0.eventType) ?? [],
    ...(body.value?.nextCursor ? { hasNextCursor: typeof body.value.nextCursor === "string" } : {}),
  };
}

function makeIdGenerator(ids) {
  const nextIds = [...ids];
  return () => nextIds.shift();
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function baseUrlForStartedServer(server) {
  return new Promise((resolve, reject) => {
    const resolveAddress = () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    };
    server.once("error", reject);
    if (server.listening) {
      server.off("error", reject);
      resolveAddress();
      return;
    }
    server.once("listening", () => {
      server.off("error", reject);
      resolveAddress();
    });
  });
}

function close(server) {
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
