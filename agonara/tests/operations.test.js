import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createServer, readPackageVersion, startServer } from "../src/server.js";

test("operationsHealth_shouldReturnRequestId_onMissingRequestIdHeader", async () => {
  const server = createTestServer();
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/health`);
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        responseRequestId: response.headers.get("x-request-id"),
        bodyStatus: body.status,
        bodyRequestId: body.requestId,
      },
      {
        statusCode: 200,
        responseRequestId: body.requestId,
        bodyStatus: "ok",
        bodyRequestId: body.requestId,
      },
    );
  } finally {
    await close(server);
  }
});

test("operationsHealth_shouldReportConfiguredVersion", async () => {
  const server = createServer({ log: () => {}, version: "1.2.3" });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/health`);
    const body = await response.json();

    assert.equal(body.version, "1.2.3");
  } finally {
    await close(server);
  }
});

test("operationsHealth_shouldDefaultVersion_whenNotConfigured", async () => {
  const server = createTestServer();
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/health`);
    const body = await response.json();

    assert.equal(body.version, "0.0.0");
  } finally {
    await close(server);
  }
});

test("startServer_shouldSurfacePackageVersion_throughHealth", async () => {
  const server = startServer({
    bootstrapSecret: "operations-version-secret",
    databasePath: ":memory:",
    host: "127.0.0.1",
    port: 0,
    log: () => {},
  });

  try {
    await once(server, "listening");
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/operations/health`);
    const body = await response.json();

    assert.equal(body.version, readPackageVersion());
  } finally {
    await close(server);
  }
});

test("startServer_shouldNotRegisterEvaluatorTickRoute_whenNomosEnvIncomplete", async () => {
  const server = startServer({
    bootstrapSecret: "operations-version-secret",
    databasePath: ":memory:",
    host: "127.0.0.1",
    port: 0,
    log: () => {},
    openAnswerEvaluatorTriggerToken: "trigger-token-secret",
  });

  try {
    await once(server, "listening");
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/operations/open-answer-evaluator/tick`, {
      method: "POST",
      headers: { authorization: "Bearer trigger-token-secret" },
    });
    const body = await response.json();

    assert.deepEqual(
      { statusCode: response.status, body },
      { statusCode: 404, body: { status: "rejected", reason: "not_found" } },
    );
  } finally {
    await close(server);
  }
});

test("startServer_shouldRegisterEvaluatorTickRoute_whenNomosEnvComplete", async () => {
  const server = startServer({
    bootstrapSecret: "operations-version-secret",
    databasePath: ":memory:",
    host: "127.0.0.1",
    port: 0,
    log: () => {},
    nomosBaseUrl: "https://nomos.example.test",
    nomosModel: "model-a",
    nomosApiKey: "nomos-key-secret",
    openAnswerEvaluatorTriggerToken: "trigger-token-secret",
  });

  try {
    await once(server, "listening");
    const { port } = server.address();
    const tick = await fetch(`http://127.0.0.1:${port}/operations/open-answer-evaluator/tick`, {
      method: "POST",
      headers: { authorization: "Bearer trigger-token-secret" },
    });
    const tickBody = await tick.json();
    const health = await fetch(`http://127.0.0.1:${port}/operations/health`);
    const healthBody = await health.text();

    assert.deepEqual(
      {
        tickStatusCode: tick.status,
        tickSummary: {
          claimed: tickBody.value?.summary.claimed,
          mode: tickBody.value?.summary.mode,
          workerId: tickBody.value?.summary.workerId,
        },
        healthMentionsKey: healthBody.includes("nomos-key-secret"),
      },
      {
        tickStatusCode: 200,
        tickSummary: { mode: "claim_next", workerId: "open-answer-evaluator", claimed: false },
        healthMentionsKey: false,
      },
    );
  } finally {
    await close(server);
  }
});

test("operationsHealth_shouldPreserveRequestId_onValidRequestIdHeader", async () => {
  const server = createTestServer();
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/health`, {
      headers: { "x-request-id": "request_123" },
    });
    const body = await response.json();

    assert.deepEqual(
      {
        responseRequestId: response.headers.get("x-request-id"),
        bodyRequestId: body.requestId,
      },
      {
        responseRequestId: "request_123",
        bodyRequestId: "request_123",
      },
    );
  } finally {
    await close(server);
  }
});

test("operationsDiagnostics_shouldRejectUnauthenticatedRequest_onMissingSession", async () => {
  const server = createTestServer();
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/diagnostics`);
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        hasResponseRequestId: response.headers.get("x-request-id") !== null,
        body,
      },
      {
        statusCode: 401,
        hasResponseRequestId: true,
        body: {
          status: "rejected",
          reason: "session_not_found",
        },
      },
    );
  } finally {
    await close(server);
  }
});

test("operationsHealth_shouldReplaceRequestId_onInvalidRequestIdHeader", async () => {
  const server = createTestServer();
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/health`, {
      headers: { "x-request-id": "bad request id" },
    });
    const body = await response.json();

    assert.deepEqual(
      {
        responseRequestId: response.headers.get("x-request-id"),
        bodyRequestId: body.requestId,
        reusedInvalidHeader: body.requestId === "bad request id",
      },
      {
        responseRequestId: body.requestId,
        bodyRequestId: body.requestId,
        reusedInvalidHeader: false,
      },
    );
  } finally {
    await close(server);
  }
});

test("operationsHealth_shouldEmitCompletionLog_onAcceptedRequest", async () => {
  const logEvents = [];
  const server = createServer({
    log: event => logEvents.push(event),
    now: () => new Date("2026-05-27T12:00:00.000Z"),
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/health`, {
      headers: { "x-request-id": "health-request" },
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        logEvents,
      },
      {
        statusCode: 200,
        logEvents: [
          {
            occurredAt: "2026-05-27T12:00:00.000Z",
            severity: "info",
            component: "operations",
            operation: "GET /operations/health",
            requestId: "health-request",
            outcome: "accepted",
          },
        ],
      },
    );
  } finally {
    await close(server);
  }
});

test("operationsDiagnostics_shouldEmitCompletionLog_onRejectedRequest", async () => {
  const logEvents = [];
  const server = createServer({
    log: event => logEvents.push(event),
    now: () => new Date("2026-05-27T12:01:00.000Z"),
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/diagnostics`, {
      headers: { "x-request-id": "diagnostics-request" },
    });

    assert.deepEqual(
      {
        statusCode: response.status,
        logEvents,
      },
      {
        statusCode: 401,
        logEvents: [
          {
            occurredAt: "2026-05-27T12:01:00.000Z",
            severity: "warning",
            component: "operations",
            operation: "GET /operations/diagnostics",
            requestId: "diagnostics-request",
            outcome: "rejected",
            reason: "session_not_found",
          },
        ],
      },
    );
  } finally {
    await close(server);
  }
});

test("operationsOpenAnswerEvaluatorTick_shouldRejectUnauthenticatedRequest_onMissingOperationsAccess", async () => {
  let tickCalls = 0;
  const server = createServer({
    log: () => {},
    openAnswerEvaluatorWorkerTick: () => {
      tickCalls += 1;
      return { status: "accepted", value: { summary: { claimed: false } } };
    },
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/open-answer-evaluator/tick`, {
      method: "POST",
    });
    const body = await response.json();

    assert.deepEqual(
      { statusCode: response.status, body, tickCalls },
      {
        statusCode: 401,
        body: { status: "rejected", reason: "session_not_found" },
        tickCalls: 0,
      },
    );
  } finally {
    await close(server);
  }
});

test("operationsOpenAnswerEvaluatorTick_shouldRunWorkerTick_onValidTriggerToken", async () => {
  const server = createServer({
    log: () => {},
    operationsTriggerToken: "trigger-token-secret",
    openAnswerEvaluatorWorkerTick: () => ({
      status: "accepted",
      value: { summary: { mode: "claim_next", workerId: "worker-a", claimed: false } },
    }),
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/open-answer-evaluator/tick`, {
      method: "POST",
      headers: { authorization: "Bearer trigger-token-secret" },
    });
    const body = await response.json();

    assert.deepEqual(
      { statusCode: response.status, body },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: { summary: { mode: "claim_next", workerId: "worker-a", claimed: false } },
        },
      },
    );
  } finally {
    await close(server);
  }
});

test("operationsOpenAnswerEvaluatorTick_shouldPassEvaluatorJobId_onValidTriggerTokenBody", async () => {
  const tickInputs = [];
  const server = createServer({
    log: () => {},
    operationsTriggerToken: "trigger-token-secret",
    openAnswerEvaluatorWorkerTick: input => {
      tickInputs.push(input);
      return {
        status: "accepted",
        value: {
          summary: {
            mode: input.evaluatorJobId ? "single_job" : "claim_next",
            evaluatorJobId: input.evaluatorJobId,
            workerId: "worker-a",
            claimed: true,
          },
        },
      };
    },
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/open-answer-evaluator/tick`, {
      method: "POST",
      headers: {
        authorization: "Bearer trigger-token-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ evaluatorJobId: "evaluator-run-a" }),
    });
    const body = await response.json();

    assert.deepEqual(
      { statusCode: response.status, body, tickInputs },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: {
            summary: {
              mode: "single_job",
              evaluatorJobId: "evaluator-run-a",
              workerId: "worker-a",
              claimed: true,
            },
          },
        },
        tickInputs: [{ evaluatorJobId: "evaluator-run-a" }],
      },
    );
  } finally {
    await close(server);
  }
});

test("operationsOpenAnswerEvaluatorTick_shouldRejectMalformedBody_onValidTriggerToken", async () => {
  let tickCalls = 0;
  const server = createServer({
    log: () => {},
    operationsTriggerToken: "trigger-token-secret",
    openAnswerEvaluatorWorkerTick: () => {
      tickCalls += 1;
      return { status: "accepted", value: { summary: { claimed: false } } };
    },
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/open-answer-evaluator/tick`, {
      method: "POST",
      headers: {
        authorization: "Bearer trigger-token-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ evaluatorJobId: "" }),
    });
    const body = await response.json();

    assert.deepEqual(
      { statusCode: response.status, body, tickCalls },
      { statusCode: 400, body: { status: "rejected", reason: "validation_failed" }, tickCalls: 0 },
    );
  } finally {
    await close(server);
  }
});

test("operationsOpenAnswerEvaluatorTick_shouldRunWorkerTick_onOperationsAccessSession", async () => {
  const tickCalls = [];
  const identityAccessCalls = [];
  const server = createServer({
    identityCommands: {
      listIdentities: input => {
        identityAccessCalls.push(input);
        return input.actingSessionId === "session-operations"
          ? { status: "accepted", value: { identities: [] } }
          : { status: "rejected", reason: "session_not_found" };
      },
    },
    log: () => {},
    openAnswerEvaluatorWorkerTick: () => {
      tickCalls.push("tick");
      return {
        status: "accepted",
        value: { summary: { mode: "claim_next", workerId: "worker-a", claimed: false } },
      };
    },
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/open-answer-evaluator/tick`, {
      method: "POST",
      headers: { cookie: "agonara_session=session-operations" },
    });
    const body = await response.json();

    assert.deepEqual(
      { statusCode: response.status, body, identityAccessCalls, tickCalls },
      {
        statusCode: 200,
        body: {
          status: "accepted",
          value: { summary: { mode: "claim_next", workerId: "worker-a", claimed: false } },
        },
        identityAccessCalls: [{ actingSessionId: "session-operations" }],
        tickCalls: ["tick"],
      },
    );
  } finally {
    await close(server);
  }
});

test("operationsOpenAnswerEvaluatorTick_shouldReturnConflict_onOverlappingWorkerTick", async () => {
  const server = createServer({
    log: () => {},
    operationsTriggerToken: "trigger-token-secret",
    openAnswerEvaluatorWorkerTick: () => ({ status: "rejected", reason: "worker_already_running" }),
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/open-answer-evaluator/tick`, {
      method: "POST",
      headers: { authorization: "Bearer trigger-token-secret" },
    });
    const body = await response.json();

    assert.deepEqual(
      { statusCode: response.status, body },
      { statusCode: 409, body: { status: "rejected", reason: "worker_already_running" } },
    );
  } finally {
    await close(server);
  }
});

test("operationsHealth_shouldReturnRedactedFault_onUnexpectedError", async () => {
  const logEvents = [];
  const server = createServer({
    healthCheck: () => {
      throw new Error("database password leaked");
    },
    log: event => logEvents.push(event),
    now: () => new Date("2026-05-27T12:02:00.000Z"),
  });
  const baseUrl = await listen(server);

  try {
    const response = await fetch(`${baseUrl}/operations/health`, {
      headers: { "x-request-id": "fault-request" },
    });
    const body = await response.json();

    assert.deepEqual(
      {
        statusCode: response.status,
        responseRequestId: response.headers.get("x-request-id"),
        body,
        logEvents,
      },
      {
        statusCode: 500,
        responseRequestId: "fault-request",
        body: { status: "fault", reason: "internal_error" },
        logEvents: [
          {
            occurredAt: "2026-05-27T12:02:00.000Z",
            severity: "error",
            component: "operations",
            operation: "GET /operations/health",
            requestId: "fault-request",
            outcome: "fault",
            errorKind: "unexpected",
          },
        ],
      },
    );
  } finally {
    await close(server);
  }
});

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

function createTestServer() {
  return createServer({ log: () => {} });
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
