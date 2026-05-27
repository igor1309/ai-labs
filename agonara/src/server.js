import { randomUUID } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { createIdentityCommands } from "./identity.js";
import { initializeIdentityStorage, openIdentityDatabase } from "./storage.js";

export function createServer({
  generateToken = randomUUID,
  healthCheck = () => "ok",
  identityCommands = null,
  log = logToStdout,
  now = () => new Date(),
} = {}) {
  const csrfTokens = new Map();
  const failedAuthAttempts = new Map();

  return http.createServer(async (request, response) => {
    const requestId = getRequestId(request);
    const pathname = getPathname(request);
    response.setHeader("x-request-id", requestId);

    try {
      if (identityCommands) {
        const handled = await handleIdentityApi({
          csrfTokens,
          failedAuthAttempts,
          generateToken,
          identityCommands,
          pathname,
          request,
          response,
        });
        if (handled) {
          return;
        }
      }

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
        if (identityCommands) {
          const sessionId = getSessionCookie(request);
          const diagnosticsAccess = identityCommands.listIdentities({ actingSessionId: sessionId });
          if (diagnosticsAccess.status === "accepted") {
            logCompletion(log, now, {
              severity: "info",
              operation: "GET /operations/diagnostics",
              requestId,
              outcome: "accepted",
            });
            sendJson(response, 200, {
              status: "accepted",
              value: {
                checkedAt: now().toISOString(),
                components: [{ component: "identity", status: "ok" }],
              },
            });
            return;
          }

          logCompletion(log, now, {
            severity: "warning",
            operation: "GET /operations/diagnostics",
            requestId,
            outcome: "rejected",
            reason: diagnosticsAccess.reason,
          });
          sendJson(response, httpStatusFor(diagnosticsAccess.reason), {
            status: "rejected",
            reason: diagnosticsAccess.reason,
          });
          return;
        }

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

async function handleIdentityApi({
  csrfTokens,
  failedAuthAttempts,
  generateToken,
  identityCommands,
  pathname,
  request,
  response,
}) {
  if (request.method === "POST" && pathname === "/identity/bootstrap/admin") {
    if (isRateLimited(failedAuthAttempts, "bootstrap")) {
      sendJson(response, 429, rejected("rate_limited"));
      return true;
    }

    const body = await readJson(request);
    const result = await identityCommands.bootstrapFirstAdmin(body);
    if (result.status === "rejected") {
      trackAuthFailure(failedAuthAttempts, "bootstrap", result.reason);
      sendJson(response, httpStatusFor(result.reason), result);
      return true;
    }

    resetAuthFailure(failedAuthAttempts, "bootstrap");
    const csrfToken = createCsrfToken(csrfTokens, generateToken, result.value.session.id);
    sendJson(response, 200, accepted(sessionSummary(result.value, csrfToken, identityCommands)), {
      "set-cookie": sessionCookie(result.value.session.id, request),
    });
    return true;
  }

  if (request.method === "GET" && pathname === "/identity/bootstrap/status") {
    sendJson(response, 200, identityCommands.getBootstrapStatus());
    return true;
  }

  if (request.method === "POST" && pathname === "/identity/sessions") {
    const body = await readJson(request);
    const rateLimitKey = `login:${body?.login ?? ""}`;
    if (isRateLimited(failedAuthAttempts, rateLimitKey)) {
      sendJson(response, 429, rejected("rate_limited"));
      return true;
    }

    const result = await identityCommands.login(body);
    if (result.status === "rejected") {
      trackAuthFailure(failedAuthAttempts, rateLimitKey, result.reason);
      sendJson(response, httpStatusFor(result.reason), result);
      return true;
    }

    resetAuthFailure(failedAuthAttempts, rateLimitKey);
    const csrfToken = createCsrfToken(csrfTokens, generateToken, result.value.session.id);
    sendJson(response, 200, accepted(sessionSummary(result.value, csrfToken, identityCommands)), {
      "set-cookie": sessionCookie(result.value.session.id, request),
    });
    return true;
  }

  if (request.method === "GET" && pathname === "/identity/session") {
    const result = identityCommands.resolveSession({ sessionId: getSessionCookie(request) });
    if (result.status === "rejected") {
      sendJson(response, httpStatusFor(result.reason), result);
      return true;
    }

    const csrfToken = createCsrfToken(csrfTokens, generateToken, result.value.session.id);
    sendJson(response, 200, accepted(sessionSummary(result.value, csrfToken, identityCommands)));
    return true;
  }

  if (request.method === "DELETE" && pathname === "/identity/session") {
    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const result = identityCommands.logout({ sessionId: csrf.sessionId });
    if (result.status === "accepted") {
      csrfTokens.delete(csrf.sessionId);
      sendJson(response, 200, result, { "set-cookie": clearSessionCookie() });
      return true;
    }

    sendJson(response, httpStatusFor(result.reason), result);
    return true;
  }

  if (request.method === "GET" && pathname === "/identity/identities") {
    const result = identityCommands.listIdentities({ actingSessionId: getSessionCookie(request) });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "POST" && pathname === "/identity/identities") {
    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const body = await readJson(request);
    const result = identityCommands.createIdentity({
      actingSessionId: csrf.sessionId,
      displayName: body?.displayName,
    });
    sendJson(response, statusForResult(result), mapIdentityResult(result, identityCommands, csrf.sessionId));
    return true;
  }

  const localPasswordMatch = pathname.match(/^\/identity\/identities\/([^/]+)\/local-password$/);
  if (request.method === "POST" && localPasswordMatch) {
    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const body = await readJson(request);
    const result = await identityCommands.bindLocalPasswordCredential({
      actingSessionId: csrf.sessionId,
      identityId: localPasswordMatch[1],
      login: body?.login,
      password: body?.password,
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  const disableMatch = pathname.match(/^\/identity\/identities\/([^/]+)\/disable$/);
  if (request.method === "POST" && disableMatch) {
    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const result = identityCommands.disableIdentity({
      actingSessionId: csrf.sessionId,
      identityId: disableMatch[1],
    });
    sendJson(response, statusForResult(result), mapIdentityResult(result, identityCommands, csrf.sessionId));
    return true;
  }

  const adminMatch = pathname.match(/^\/identity\/identities\/([^/]+)\/admin$/);
  if ((request.method === "POST" || request.method === "DELETE") && adminMatch) {
    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const command = request.method === "POST" ? identityCommands.grantAdmin : identityCommands.revokeAdmin;
    const result = command({
      actingSessionId: csrf.sessionId,
      identityId: adminMatch[1],
    });
    sendJson(response, statusForResult(result), mapIdentityResult(result, identityCommands, csrf.sessionId));
    return true;
  }

  const accessMatch = pathname.match(/^\/identity\/identities\/([^/]+)\/operational-access$/);
  if (request.method === "GET" && accessMatch) {
    const result = identityCommands.getOperationalAccessState({
      actingSessionId: getSessionCookie(request),
      identityId: accessMatch[1],
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "GET" && pathname === "/identity/audit-events") {
    const result = identityCommands.listAuditEvents({ actingSessionId: getSessionCookie(request) });
    sendJson(response, statusForResult(result), mapAuditEventsResult(result));
    return true;
  }

  return false;
}

export function startServer({
  bootstrapSecret = process.env.AGONARA_BOOTSTRAP_SECRET,
  databasePath = process.env.AGONARA_DB_PATH ?? ":memory:",
  host = process.env.HOST ?? "0.0.0.0",
  port = process.env.PORT ?? "8080",
} = {}) {
  if (!bootstrapSecret) {
    throw new Error("AGONARA_BOOTSTRAP_SECRET is required");
  }

  const database = openIdentityDatabase(databasePath);
  initializeIdentityStorage(database);
  const server = createServer({
    identityCommands: createIdentityCommands({
      bootstrapSecret,
      database,
    }),
  });
  server.on("close", () => {
    database.close();
  });
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

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, { "content-type": "application/json", ...headers });
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

function accepted(value) {
  return { status: "accepted", value };
}

function rejected(reason) {
  return { status: "rejected", reason };
}

async function readJson(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
  }

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function sessionSummary({ identity, session }, csrfToken, identityCommands) {
  const access = identityCommands.getOperationalAccessState({
    actingSessionId: session.id,
    identityId: identity.id,
  });

  return {
    csrfToken,
    expiresAt: session.expiresAt,
    identity: access.status === "accepted" ? access.value.identity : identitySummary(identity),
  };
}

function identitySummary(identity) {
  return {
    id: identity.id,
    displayName: identity.displayName,
    state: identity.state,
    isAdmin: identity.isAdmin ?? false,
  };
}

function mapIdentityResult(result, identityCommands, actingSessionId) {
  if (result.status === "rejected") {
    return result;
  }

  const access = identityCommands.getOperationalAccessState({
    actingSessionId,
    identityId: result.value.id,
  });
  return accepted({
    ...identitySummary(result.value),
    isAdmin: access.status === "accepted" ? access.value.effectiveAdmin : false,
  });
}

function mapAuditEventsResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({
    auditEvents: result.value.auditEvents.map(({ targetSessionId, ...auditEvent }) => auditEvent),
  });
}

function createCsrfToken(csrfTokens, generateToken, sessionId) {
  const csrfToken = generateToken();
  csrfTokens.set(sessionId, csrfToken);
  return csrfToken;
}

function requireCsrf(request, csrfTokens) {
  const sessionId = getSessionCookie(request);
  if (!sessionId) {
    return rejected("session_not_found");
  }

  const csrfToken = request.headers["x-agonara-csrf"];
  if (!csrfToken) {
    return rejected("csrf_required");
  }

  if (csrfTokens.get(sessionId) !== csrfToken) {
    return rejected("csrf_invalid");
  }

  return { status: "accepted", sessionId };
}

function getSessionCookie(request) {
  const cookie = request.headers.cookie;
  if (!cookie) {
    return null;
  }

  const match = cookie.match(/(?:^|;\s*)agonara_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function sessionCookie(sessionId, request) {
  const secure = isSecureRequest(request) ? "; Secure" : "";
  return `agonara_session=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/${secure}`;
}

function clearSessionCookie() {
  return "agonara_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}

function isSecureRequest(request) {
  return request.headers["x-forwarded-proto"] === "https" || request.socket.encrypted === true;
}

function statusForResult(result) {
  return result.status === "accepted" ? 200 : httpStatusFor(result.reason);
}

function httpStatusFor(reason) {
  switch (reason) {
    case "validation_failed":
      return 400;
    case "invalid_bootstrap_secret":
    case "invalid_credentials":
    case "session_expired":
    case "session_not_found":
    case "session_revoked":
      return 401;
    case "admin_required":
    case "csrf_invalid":
    case "csrf_required":
    case "identity_disabled":
      return 403;
    case "identity_not_found":
      return 404;
    case "bootstrap_already_completed":
    case "identity_already_has_credential":
    case "last_admin_removal":
    case "login_already_bound":
      return 409;
    case "rate_limited":
      return 429;
    default:
      return 500;
  }
}

function isRateLimited(failedAuthAttempts, key) {
  return (failedAuthAttempts.get(key) ?? 0) >= 5;
}

function trackAuthFailure(failedAuthAttempts, key, reason) {
  if (reason !== "invalid_credentials" && reason !== "invalid_bootstrap_secret") {
    return;
  }

  failedAuthAttempts.set(key, (failedAuthAttempts.get(key) ?? 0) + 1);
}

function resetAuthFailure(failedAuthAttempts, key) {
  failedAuthAttempts.delete(key);
}
