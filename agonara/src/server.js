import { randomUUID } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

export function createServer({ healthCheck = () => "ok", log = logToStdout, now = () => new Date() } = {}) {
  return http.createServer((request, response) => {
    const requestId = getRequestId(request);
    const pathname = getPathname(request);
    response.setHeader("x-request-id", requestId);

    try {
      if (request.method === "GET" && pathname === "/operations/health") {
        const status = healthCheck();
        logCompletion(log, now, {
          severity: "info",
          operation: "GET /operations/health",
          requestId,
          outcome: "accepted",
        });
        sendJson(response, 200, {
          status,
          checkedAt: now().toISOString(),
          requestId,
        });
        return;
      }

      if (request.method === "GET" && pathname === "/operations/diagnostics") {
        logCompletion(log, now, {
          severity: "warning",
          operation: "GET /operations/diagnostics",
          requestId,
          outcome: "rejected",
          reason: "session_not_found",
        });
        sendJson(response, 401, { status: "rejected", reason: "session_not_found" });
        return;
      }

      sendJson(response, 404, { status: "rejected", reason: "not_found" });
    } catch {
      logCompletion(log, now, {
        severity: "error",
        operation: `${request.method} ${pathname}`,
        requestId,
        outcome: "fault",
        errorKind: "unexpected",
      });
      sendJson(response, 500, { status: "fault", reason: "internal_error" });
    }
  });
}

export function startServer({ host = process.env.HOST ?? "0.0.0.0", port = process.env.PORT ?? "8080" } = {}) {
  const server = createServer();
  server.listen(Number(port), host);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}

function getPathname(request) {
  return new URL(request.url ?? "/", "http://localhost").pathname;
}

function getRequestId(request) {
  const requestId = request.headers["x-request-id"];
  if (typeof requestId === "string" && isValidRequestId(requestId)) {
    return requestId;
  }
  return randomUUID();
}

function isValidRequestId(requestId) {
  return requestId.length >= 1 && requestId.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(requestId);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function logCompletion(log, now, event) {
  log({
    occurredAt: now().toISOString(),
    component: "operations",
    ...event,
  });
}

function logToStdout(event) {
  console.log(JSON.stringify(event));
}
