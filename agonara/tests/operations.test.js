import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/server.js";

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
