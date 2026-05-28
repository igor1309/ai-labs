import { randomUUID } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { adminBoardHtml } from "./admin-ui.js";
import { createCorpusCommands } from "./corpus.js";
import { createIdentityCommands } from "./identity.js";
import { createProgramCommands } from "./program.js";
import { initializeIdentityStorage, openIdentityDatabase } from "./storage.js";

export function createServer({
  generateToken = randomUUID,
  healthCheck = () => "ok",
  corpusCommands = null,
  identityCommands = null,
  log = logToStdout,
  now = () => new Date(),
  programCommands = null,
} = {}) {
  const csrfTokens = new Map();
  const eventCursors = new Map();
  const listCursors = new Map();
  const failedAuthAttempts = new Map();

  return http.createServer(async (request, response) => {
    const requestId = getRequestId(request);
    const pathname = getPathname(request);
    response.setHeader("x-request-id", requestId);

    try {
      if (request.method === "GET" && pathname === "/admin") {
        sendHtml(response, 200, adminBoardHtml);
        return;
      }

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

      if (identityCommands && programCommands) {
        const handled = await handleProgramApi({
          csrfTokens,
          eventCursors,
          generateToken,
          identityCommands,
          pathname,
          programCommands,
          request,
          response,
        });
        if (handled) {
          return;
        }
      }

      if (identityCommands && corpusCommands) {
        const handled = await handleCorpusApi({
          corpusCommands,
          csrfTokens,
          generateToken,
          identityCommands,
          listCursors,
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

async function handleProgramApi({
  csrfTokens,
  eventCursors,
  generateToken,
  identityCommands,
  pathname,
  programCommands,
  request,
  response,
}) {
  if (request.method === "GET" && pathname === "/programs") {
    const session = identityCommands.resolveSession({ sessionId: getSessionCookie(request) });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = programCommands.listProgramShells({
      actingIdentityId: session.value.identity.id,
    });
    sendJson(response, statusForResult(result), mapProgramShellsResult(result));
    return true;
  }

  if (request.method === "POST" && pathname === "/programs") {
    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const session = identityCommands.resolveSession({ sessionId: csrf.sessionId });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const body = await readJson(request);
    const result = programCommands.createProgramShell({
      actingIdentityId: session.value.identity.id,
      description: body?.description,
      title: body?.title,
    });
    sendJson(response, statusForResult(result), mapProgramCreatedResult(result));
    return true;
  }

  if (request.method === "GET" && pathname === "/program-memberships/me") {
    const session = identityCommands.resolveSession({ sessionId: getSessionCookie(request) });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = programCommands.listMyProgramMemberships({
      actingIdentityId: session.value.identity.id,
    });
    sendJson(response, statusForResult(result), mapProgramMembershipsResult(result));
    return true;
  }

  const studentMembershipMatch = pathname.match(/^\/programs\/([^/]+)\/student-membership$/);
  if ((request.method === "POST" || request.method === "DELETE") && studentMembershipMatch) {
    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const session = identityCommands.resolveSession({ sessionId: csrf.sessionId });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const command = request.method === "POST"
      ? programCommands.joinSelfJoinProgram
      : programCommands.leaveStudentProgram;
    const result = command({
      actingIdentityId: session.value.identity.id,
      programId: decodeURIComponent(studentMembershipMatch[1]),
    });
    sendJson(response, statusForResult(result), mapProgramMembershipResult(result));
    return true;
  }

  const participationMatch = pathname.match(/^\/programs\/([^/]+)\/participation\/([^/]+)$/);
  if (request.method === "GET" && participationMatch) {
    const session = identityCommands.resolveSession({ sessionId: getSessionCookie(request) });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(participationMatch[1]);
    const program = programCommands.getProgramShell({
      actingIdentityId: session.value.identity.id,
      programId,
    });
    if (program.status === "rejected") {
      sendJson(response, httpStatusFor(program.reason), program);
      return true;
    }

    const participationKind = decodeURIComponent(participationMatch[2]);
    if (!isSupportedParticipationKind(participationKind)) {
      sendJson(response, 400, rejected("validation_failed"));
      return true;
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    const identityId = url.searchParams.get("identityId") ?? session.value.identity.id;
    if (identityId !== session.value.identity.id) {
      const access = identityCommands.getOperationalAccessState({
        actingSessionId: session.value.session.id,
        identityId: session.value.identity.id,
      });
      const curatorParticipation = programCommands.getEffectiveParticipation({
        identityId: session.value.identity.id,
        participationKind: "program_curator",
        programId,
      });
      const allowedInspector =
        (access.status === "accepted" && access.value.effectiveAdmin) ||
        curatorParticipation.allowed === true;
      if (!allowedInspector) {
        sendJson(response, 403, rejected("admin_or_curator_required"));
        return true;
      }
    }
    const result = programCommands.getEffectiveParticipation({
      identityId,
      participationKind,
      programId,
    });
    sendJson(response, 200, accepted({
      identityId,
      participationKind,
      programId,
      ...result,
    }));
    return true;
  }

  const eventMatch = pathname.match(/^\/programs\/([^/]+)\/(events|membership-events)$/);
  if (request.method === "GET" && eventMatch) {
    const session = identityCommands.resolveSession({ sessionId: getSessionCookie(request) });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(eventMatch[1]);
    const eventKind = eventMatch[2];
    const routeKey = `${eventKind}:${programId}`;
    const query = parseEventQuery({ eventCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const command = eventKind === "events"
      ? programCommands.listProgramEvents
      : programCommands.listProgramMembershipEvents;
    const result = command({
      actingIdentityId: session.value.identity.id,
      programId,
    });
    sendJson(
      response,
      statusForResult(result),
      mapProgramEventListResult({
        eventCursors,
        eventKind,
        generateToken,
        query: query.value,
        result,
        routeKey,
      }),
    );
    return true;
  }

  const programMatch = pathname.match(/^\/programs\/([^/]+)$/);
  if (request.method === "GET" && programMatch) {
    const session = identityCommands.resolveSession({ sessionId: getSessionCookie(request) });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = programCommands.getProgramShell({
      actingIdentityId: session.value.identity.id,
      programId: decodeURIComponent(programMatch[1]),
    });
    sendJson(response, statusForResult(result), mapProgramShellResult(result));
    return true;
  }

  return false;
}

async function handleCorpusApi({
  corpusCommands,
  csrfTokens,
  generateToken,
  identityCommands,
  listCursors,
  pathname,
  request,
  response,
}) {
  const sourcesMatch = pathname.match(/^\/programs\/([^/]+)\/sources$/);
  const candidatesMatch = pathname.match(/^\/programs\/([^/]+)\/corpus-candidates$/);
  if (request.method === "GET" && sourcesMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(sourcesMatch[1]);
    const routeKey = `corpus-sources:${programId}`;
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = corpusCommands.listProgramSources({
      actingIdentityId: session.value.identity.id,
      programId,
    });
    const mappedResult = mapCorpusSourceListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "GET" && candidatesMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(candidatesMatch[1]);
    const status = parseCorpusCandidateStatus(request);
    if (status.status === "rejected") {
      sendJson(response, 400, status);
      return true;
    }

    const routeKey = `corpus-candidates:${programId}:${status.value ?? "all"}`;
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = corpusCommands.listCorpusCandidates({
      actingIdentityId: session.value.identity.id,
      programId,
      status: status.value ?? undefined,
    });
    const mappedResult = mapCorpusCandidateListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "POST" && sourcesMatch) {
    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const session = identityCommands.resolveSession({ sessionId: csrf.sessionId });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const body = await readRequiredJsonObject(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = corpusCommands.recordProgramSource({
      actingIdentityId: session.value.identity.id,
      citation: body.value.citation,
      locator: body.value.locator,
      programId: decodeURIComponent(sourcesMatch[1]),
      sourceKind: body.value.sourceKind,
      title: body.value.title,
    });
    sendJson(response, statusForResult(result), mapProgramSourceResult(result));
    return true;
  }

  if (request.method === "POST" && candidatesMatch) {
    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const session = identityCommands.resolveSession({ sessionId: csrf.sessionId });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const body = await readRequiredJsonObject(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }
    if (!isValidCandidateSourceIds(body.value.sourceIds)) {
      sendJson(response, 400, rejected("validation_failed"));
      return true;
    }

    const result = corpusCommands.createCorpusCandidate({
      actingIdentityId: session.value.identity.id,
      body: body.value.body,
      candidateKind: body.value.candidateKind,
      programId: decodeURIComponent(candidatesMatch[1]),
      rationale: body.value.rationale,
      sourceIds: body.value.sourceIds,
      title: body.value.title,
    });
    sendJson(response, statusForResult(result), mapCorpusCandidateResult(result));
    return true;
  }

  return false;
}

export function startServer({
  bootstrapSecret = process.env.AGONARA_BOOTSTRAP_SECRET,
  databasePath = process.env.AGONARA_DB_PATH ?? ":memory:",
  host = process.env.HOST ?? "0.0.0.0",
  log = logToStdout,
  port = process.env.PORT ?? "8080",
} = {}) {
  if (!bootstrapSecret) {
    throw new Error("AGONARA_BOOTSTRAP_SECRET is required");
  }

  const database = openIdentityDatabase(databasePath);
  initializeIdentityStorage(database);
  const programCommands = createProgramCommands({
    database,
  });
  const server = createServer({
    corpusCommands: createCorpusCommands({
      database,
      getEffectiveParticipation: programCommands.getEffectiveParticipation,
    }),
    identityCommands: createIdentityCommands({
      bootstrapSecret,
      database,
    }),
    programCommands,
    log,
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

function sendHtml(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
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

function resolveHttpSession({ identityCommands, request }) {
  return identityCommands.resolveSession({ sessionId: getSessionCookie(request) });
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

async function readRequiredJsonObject(request) {
  const body = await readJsonBody(request);
  if (body.status === "rejected") {
    return body;
  }
  if (body.value.kind !== "object") {
    return rejected("validation_failed");
  }
  return accepted(body.value.body);
}

async function readJsonBody(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
  }

  if (!text) {
    return accepted({ kind: "missing" });
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return accepted({ kind: "malformed" });
  }

  if (body === null || Array.isArray(body) || typeof body !== "object") {
    return accepted({ kind: "non_object", body });
  }

  return accepted({ kind: "object", body });
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

function mapProgramShellsResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ programs: result.value.programShells });
}

function mapProgramShellResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted(result.value.programShell);
}

function mapProgramCreatedResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({
    initialCuratorMembership: result.value.initialCuratorMembership,
    program: result.value.programShell,
  });
}

function mapProgramMembershipsResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ memberships: result.value.programMemberships });
}

function mapProgramMembershipResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ membership: result.value.programMembership });
}

function mapProgramSourceResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ programSource: result.value.programSource });
}

function mapCorpusCandidateResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ corpusCandidate: result.value.corpusCandidate });
}

function mapProgramEventListResult({
  eventCursors,
  eventKind,
  generateToken,
  query,
  result,
  routeKey,
}) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateEvents({
    eventCursors,
    events: result.value.events,
    generateToken,
    limit: query.limit,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  const mapEvent = eventKind === "events" ? mapProgramEvent : mapProgramMembershipEvent;
  return accepted({
    events: page.value.events.map(mapEvent),
    nextCursor: page.value.nextCursor,
  });
}

function mapProgramEvent(event) {
  return {
    programEventId: event.id,
    eventType: event.eventType,
    actorIdentityId: event.actorIdentityId,
    programId: event.programId,
    occurredAt: event.occurredAt,
    outcome: event.outcome,
    reason: event.reason,
  };
}

function mapProgramMembershipEvent(event) {
  return {
    programMembershipEventId: event.id,
    eventType: event.eventType,
    actorIdentityId: event.actorIdentityId,
    targetIdentityId: event.targetIdentityId,
    programId: event.programId,
    participationKind: event.participationKind,
    resultingStatus: event.resultingStatus,
    occurredAt: event.occurredAt,
    outcome: event.outcome,
    reason: event.reason,
  };
}

function parseEventQuery({ eventCursors, request, routeKey }) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const limit = parseEventLimit(url.searchParams.get("limit"));
  if (limit.status === "rejected") {
    return limit;
  }

  const cursor = url.searchParams.get("cursor");
  if (cursor === null) {
    return accepted({ limit: limit.value, offset: 0 });
  }

  const cursorState = eventCursors.get(cursor);
  if (!cursorState || cursorState.routeKey !== routeKey) {
    return rejected("validation_failed");
  }

  return accepted({ limit: limit.value, offset: cursorState.offset });
}

function parseEventLimit(rawLimit) {
  if (rawLimit === null) {
    return accepted(50);
  }
  if (!/^[1-9]\d*$/.test(rawLimit)) {
    return rejected("validation_failed");
  }

  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return rejected("validation_failed");
  }

  return accepted(limit);
}

function paginateEvents({ eventCursors, events, generateToken, limit, offset, routeKey }) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > events.length) {
    return rejected("validation_failed");
  }

  const nextOffset = offset + limit;
  const nextCursor = nextOffset < events.length ? generateToken() : undefined;
  if (nextCursor) {
    eventCursors.set(nextCursor, { offset: nextOffset, routeKey });
  }

  return accepted({
    events: events.slice(offset, nextOffset),
    nextCursor,
  });
}

function parseListQuery({ listCursors, request, routeKey }) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const limit = parseListLimit(url.searchParams.get("limit"));
  if (limit.status === "rejected") {
    return limit;
  }

  const cursor = url.searchParams.get("cursor");
  if (cursor === null) {
    return accepted({ limit: limit.value, offset: 0 });
  }

  const cursorState = listCursors.get(cursor);
  if (!cursorState || cursorState.routeKey !== routeKey) {
    return rejected("validation_failed");
  }

  return accepted({ limit: limit.value, offset: cursorState.offset });
}

function parseListLimit(rawLimit) {
  return parseEventLimit(rawLimit);
}

function parseCorpusCandidateStatus(request) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const status = url.searchParams.get("status");
  if (status === null) {
    return accepted(null);
  }
  if (status === "draft" || status === "accepted" || status === "rejected") {
    return accepted(status);
  }
  return rejected("validation_failed");
}

function isValidCandidateSourceIds(sourceIds) {
  return sourceIds === undefined ||
    (Array.isArray(sourceIds) && sourceIds.every($0 => typeof $0 === "string"));
}

function paginateList({ generateToken, items, limit, listCursors, offset, routeKey }) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > items.length) {
    return rejected("validation_failed");
  }

  const nextOffset = offset + limit;
  const nextCursor = nextOffset < items.length ? generateToken() : undefined;
  if (nextCursor) {
    listCursors.set(nextCursor, { offset: nextOffset, routeKey });
  }

  return accepted({
    items: items.slice(offset, nextOffset),
    nextCursor,
  });
}

function mapCorpusSourceListResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.programSources,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    programSources: page.value.items,
    nextCursor: page.value.nextCursor,
  });
}

function mapCorpusCandidateListResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.corpusCandidates,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    corpusCandidates: page.value.items,
    nextCursor: page.value.nextCursor,
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
    case "unsupported_participation_kind":
      return 400;
    case "invalid_bootstrap_secret":
    case "invalid_credentials":
    case "session_expired":
    case "session_not_found":
    case "session_revoked":
      return 401;
    case "admin_required":
    case "admin_or_curator_required":
    case "csrf_invalid":
    case "csrf_required":
    case "identity_disabled":
    case "participation_required":
      return 403;
    case "identity_not_found":
    case "accepted_entity_not_found":
    case "candidate_not_found":
    case "program_not_found":
    case "revision_not_found":
      return 404;
    case "accepted_entity_program_mismatch":
    case "accepted_kind_mismatch":
    case "bootstrap_already_completed":
    case "candidate_already_accepted":
    case "candidate_already_rejected":
    case "identity_already_has_credential":
    case "last_admin_removal":
    case "login_already_bound":
    case "membership_left":
    case "membership_missing":
    case "membership_removed":
    case "program_creation_incomplete":
    case "source_not_found":
    case "source_program_mismatch":
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

function isSupportedParticipationKind(participationKind) {
  return participationKind === "student" || participationKind === "program_curator";
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
