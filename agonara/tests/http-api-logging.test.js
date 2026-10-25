import assert from "node:assert/strict";
import test from "node:test";
import {
  createStudentAttemptApiScenario,
  hasSensitiveCompletionLogDetail,
  listenWithIdentityProgramCorpusAndStudentWorkspace,
  manyIds,
} from "./support/http-api.js";

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
