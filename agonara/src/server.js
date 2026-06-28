import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { adminBoardHtml } from "./admin-ui.js";
import { createCorpusCommands } from "./corpus.js";
import { createCuratorWorkspaceCommands } from "./curator-workspace.js";
import { matchRoute } from "./http-contract.js";
import { createIdentityCommands } from "./identity.js";
import { learnUiHtml } from "./learn-ui.js";
import {
  createNomosOpenAnswerEvaluatorProviderAdapter,
  createSingleFlightOpenAnswerEvaluatorWorkerTick,
  makeLlmOpenAnswerEvaluatorPolicy,
} from "./open-answer-evaluator-runtime.js";
import { createProgramCommands } from "./program.js";
import { initializeIdentityStorage, openIdentityDatabase } from "./storage.js";
import { createStudentWorkspaceCommands } from "./student-workspace.js";

export function createServer({
  generateToken = randomUUID,
  healthCheck = () => "ok",
  corpusCommands = null,
  curatorWorkspaceCommands = null,
  identityCommands = null,
  log = logToStdout,
  now = () => new Date(),
  openAnswerEvaluatorWorkerTick = null,
  operationsTriggerToken,
  programCommands = null,
  studentWorkspaceCommands = null,
  version = "0.0.0",
} = {}) {
  const csrfTokens = new Map();
  const eventCursors = new Map();
  const listCursors = new Map();
  const failedAuthAttempts = new Map();

  return http.createServer(async (request, response) => {
    const requestId = getRequestId(request);
    const pathname = getPathname(request);
    const operation = `${request.method} ${pathname}`;
    const routeMatch = matchRoute({ method: request.method, pathname });
    response.setHeader("x-request-id", requestId);
    response.once("finish", () => {
      logCompletion(log, now, {
        operation,
        requestId,
        ...(response.agonaraCompletionLog ?? completionLogForBody(response.statusCode, null)),
      });
    });

    try {
      if (hasHandlerKey(routeMatch, "ui.admin.")) {
        sendHtml(response, 200, adminBoardHtml);
        return;
      }

      if (hasHandlerKey(routeMatch, "ui.learn.")) {
        sendHtml(response, 200, learnUiHtml);
        return;
      }

      if (identityCommands && hasHandlerKey(routeMatch, "identity.")) {
        const handled = await handleIdentityApi({
          csrfTokens,
          failedAuthAttempts,
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

      if (identityCommands && programCommands && hasHandlerKey(routeMatch, "program.")) {
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

      if (identityCommands && corpusCommands && hasHandlerKey(routeMatch, "corpus.")) {
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

      if (identityCommands && curatorWorkspaceCommands && hasHandlerKey(routeMatch, "curatorWorkspace.")) {
        const handled = await handleCuratorWorkspaceApi({
          csrfTokens,
          curatorWorkspaceCommands,
          identityCommands,
          pathname,
          request,
          response,
        });
        if (handled) {
          return;
        }
      }

      if (identityCommands && studentWorkspaceCommands && hasHandlerKey(routeMatch, "studentWorkspace.")) {
        const handled = await handleStudentWorkspaceApi({
          csrfTokens,
          generateToken,
          identityCommands,
          listCursors,
          pathname,
          request,
          response,
          studentWorkspaceCommands,
        });
        if (handled) {
          return;
        }
      }

      if (
        hasHandlerKey(routeMatch, "operations.openAnswerEvaluatorTick.") &&
        openAnswerEvaluatorWorkerTick
      ) {
        const triggerAccess = getOperationsTriggerAccess({
          identityCommands,
          operationsTriggerToken,
          request,
        });
        if (triggerAccess.status === "rejected") {
          sendJson(response, httpStatusFor(triggerAccess.reason), triggerAccess);
          return;
        }

        const tickBody = await readOptionalEvaluatorTickBody(request);
        if (tickBody.status === "rejected") {
          sendJson(response, httpStatusFor(tickBody.reason), tickBody);
          return;
        }

        const result = await openAnswerEvaluatorWorkerTick(tickBody.value);
        sendJson(response, statusForResult(result), result);
        return;
      }

      if (hasHandlerKey(routeMatch, "operations.health.")) {
        const status = healthCheck();
        sendJson(response, 200, {
          status,
          version,
          checkedAt: now().toISOString(),
          requestId,
        });
        return;
      }

      if (hasHandlerKey(routeMatch, "operations.diagnostics.")) {
        if (identityCommands) {
          const sessionId = getSessionCookie(request);
          const diagnosticsAccess = identityCommands.listIdentities({ actingSessionId: sessionId });
          if (diagnosticsAccess.status === "accepted") {
            const generatedAt = now().toISOString();
            sendJson(response, 200, {
              status: "ok",
              generatedAt,
              requestId,
              checks: [{ name: "identity", status: "ok", observedAt: generatedAt }],
            });
            return;
          }

          sendJson(response, httpStatusFor(diagnosticsAccess.reason), {
            status: "rejected",
            reason: diagnosticsAccess.reason,
          });
          return;
        }

        sendJson(response, 401, { status: "rejected", reason: "session_not_found" });
        return;
      }

      sendJson(response, 404, { status: "rejected", reason: "not_found" });
    } catch {
      sendJson(response, 500, { status: "fault", reason: "internal_error" });
    }
  });
}

function getOperationsTriggerAccess({ identityCommands, operationsTriggerToken, request }) {
  if (isValidOperationsTriggerToken(request, operationsTriggerToken)) {
    return { status: "accepted" };
  }
  if (!identityCommands) {
    return { status: "rejected", reason: "session_not_found" };
  }

  const sessionId = getSessionCookie(request);
  return identityCommands.listIdentities({ actingSessionId: sessionId });
}

function isValidOperationsTriggerToken(request, operationsTriggerToken) {
  if (!operationsTriggerToken) {
    return false;
  }

  return request.headers.authorization === `Bearer ${operationsTriggerToken}`;
}

function hasHandlerKey(routeMatch, prefix) {
  return routeMatch.status === "matched" && routeMatch.contract.handlerKey.startsWith(prefix);
}

async function readOptionalEvaluatorTickBody(request) {
  const body = await readJsonBody(request);
  if (body.status === "rejected") {
    return body;
  }
  if (body.value.kind === "missing") {
    return accepted({});
  }
  if (body.value.kind !== "object") {
    return rejected("validation_failed");
  }

  const keys = Object.keys(body.value.body);
  if (keys.length === 0) {
    return accepted({});
  }
  if (
    keys.length === 1 &&
    keys[0] === "evaluatorJobId" &&
    typeof body.value.body.evaluatorJobId === "string" &&
    body.value.body.evaluatorJobId.trim() !== ""
  ) {
    return accepted({ evaluatorJobId: body.value.body.evaluatorJobId.trim() });
  }

  return rejected("validation_failed");
}

async function handleIdentityApi({
  csrfTokens,
  failedAuthAttempts,
  generateToken,
  identityCommands,
  listCursors,
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
    }, auditCompletionLog(identityCommands, result.value.session.id));
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
    sendJson(
      response,
      statusForResult(result),
      mapIdentityResult(result, identityCommands, csrf.sessionId),
      {},
      auditCompletionLog(identityCommands, csrf.sessionId),
    );
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
    sendJson(
      response,
      statusForResult(result),
      result,
      {},
      auditCompletionLog(identityCommands, csrf.sessionId),
    );
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
    sendJson(
      response,
      statusForResult(result),
      mapIdentityResult(result, identityCommands, csrf.sessionId),
      {},
      auditCompletionLog(identityCommands, csrf.sessionId),
    );
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
    sendJson(
      response,
      statusForResult(result),
      mapIdentityResult(result, identityCommands, csrf.sessionId),
      {},
      auditCompletionLog(identityCommands, csrf.sessionId),
    );
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
    const routeKey = "identity:audit-events";
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = identityCommands.listAuditEvents({ actingSessionId: getSessionCookie(request) });
    sendJson(
      response,
      statusForResult(result),
      mapAuditEventsResult({
        generateToken,
        listCursors,
        query: query.value,
        result,
        routeKey,
      }),
    );
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
    const session = requireMutationSession({
      csrfTokens,
      identityCommands,
      request,
      response,
    });
    if (!session) {
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

  if (request.method === "GET" && pathname === "/program-invitations/me") {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }
    const url = new URL(request.url ?? "/", "http://localhost");
    const result = programCommands.listMyProgramInvitations({
      actingIdentityId: session.value.identity.id,
      status: url.searchParams.get("status") ?? undefined,
    });
    sendJson(response, statusForResult(result), mapProgramInvitationsResult(result));
    return true;
  }

  const admissionPolicyMatch = pathname.match(/^\/programs\/([^/]+)\/admission-policy$/);
  if (request.method === "PATCH" && admissionPolicyMatch) {
    const session = requireMutationSession({
      csrfTokens,
      identityCommands,
      request,
      response,
    });
    if (!session) {
      return true;
    }
    const body = await readRouteBody(request, ["admissionPolicy"]);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }
    const result = programCommands.setProgramAdmissionPolicy({
      actingIdentityId: session.value.identity.id,
      admissionPolicy: body.value.admissionPolicy,
      programId: decodeURIComponent(admissionPolicyMatch[1]),
    });
    sendJson(response, statusForResult(result), mapProgramAdmissionPolicyResult(result));
    return true;
  }

  const invitationListMatch = pathname.match(/^\/programs\/([^/]+)\/invitations$/);
  if (invitationListMatch && (request.method === "GET" || request.method === "POST")) {
    if (request.method === "GET") {
      const session = resolveHttpSession({ identityCommands, request });
      if (session.status === "rejected") {
        sendJson(response, httpStatusFor(session.reason), session);
        return true;
      }
      const url = new URL(request.url ?? "/", "http://localhost");
      const result = programCommands.listProgramInvitations({
        actingIdentityId: session.value.identity.id,
        programId: decodeURIComponent(invitationListMatch[1]),
        status: url.searchParams.get("status") ?? undefined,
      });
      sendJson(response, statusForResult(result), mapProgramInvitationsResult(result));
      return true;
    }

    const session = requireMutationSession({
      csrfTokens,
      identityCommands,
      request,
      response,
    });
    if (!session) {
      return true;
    }
    const body = await readRouteBody(request, ["participationKind", "targetIdentityId"]);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }
    const result = programCommands.createProgramInvitation({
      actingIdentityId: session.value.identity.id,
      participationKind: body.value.participationKind,
      programId: decodeURIComponent(invitationListMatch[1]),
      targetIdentityId: body.value.targetIdentityId,
    });
    sendJson(response, statusForResult(result), mapProgramInvitationResult(result));
    return true;
  }

  const invitationActionMatch = pathname.match(
    /^\/program-invitations\/([^/]+)\/(acceptance|decline|revocation)$/,
  );
  if (request.method === "POST" && invitationActionMatch) {
    const session = requireMutationSession({
      csrfTokens,
      identityCommands,
      request,
      response,
    });
    if (!session) {
      return true;
    }
    const body = await readRejectionBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }
    const commands = {
      acceptance: programCommands.acceptProgramInvitation,
      decline: programCommands.declineProgramInvitation,
      revocation: programCommands.revokeProgramInvitation,
    };
    const result = commands[invitationActionMatch[2]]({
      actingIdentityId: session.value.identity.id,
      invitationId: decodeURIComponent(invitationActionMatch[1]),
    });
    const mapper = invitationActionMatch[2] === "acceptance"
      ? mapProgramInvitationAcceptanceResult
      : mapProgramInvitationResult;
    sendJson(response, statusForResult(result), mapper(result));
    return true;
  }

  const participantsMatch = pathname.match(/^\/programs\/([^/]+)\/participants$/);
  if (request.method === "GET" && participantsMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }
    const url = new URL(request.url ?? "/", "http://localhost");
    const result = programCommands.listProgramParticipants({
      actingIdentityId: session.value.identity.id,
      participationKind: url.searchParams.get("participationKind") ?? undefined,
      programId: decodeURIComponent(participantsMatch[1]),
      status: url.searchParams.get("status") ?? undefined,
    });
    sendJson(response, statusForResult(result), mapProgramParticipantsResult(result));
    return true;
  }

  const participantRemovalMatch = pathname.match(
    /^\/programs\/([^/]+)\/participants\/student\/([^/]+)$/,
  );
  if (request.method === "DELETE" && participantRemovalMatch) {
    const session = requireMutationSession({
      csrfTokens,
      identityCommands,
      request,
      response,
    });
    if (!session) {
      return true;
    }
    const result = programCommands.removeProgramParticipant({
      actingIdentityId: session.value.identity.id,
      participationKind: "student",
      programId: decodeURIComponent(participantRemovalMatch[1]),
      targetIdentityId: decodeURIComponent(participantRemovalMatch[2]),
    });
    sendJson(response, statusForResult(result), mapProgramMembershipResult(result));
    return true;
  }

  const curatorLeaveMatch = pathname.match(/^\/programs\/([^/]+)\/curator-membership$/);
  if (request.method === "DELETE" && curatorLeaveMatch) {
    const session = requireMutationSession({
      csrfTokens,
      identityCommands,
      request,
      response,
    });
    if (!session) {
      return true;
    }
    const result = programCommands.leaveCuratorProgram({
      actingIdentityId: session.value.identity.id,
      programId: decodeURIComponent(curatorLeaveMatch[1]),
    });
    sendJson(response, statusForResult(result), mapProgramMembershipResult(result));
    return true;
  }

  const exceptionalMembershipMatch = pathname.match(
    /^\/admin\/program-memberships\/(recovery|revocation)$/,
  );
  if (request.method === "POST" && exceptionalMembershipMatch) {
    const session = requireMutationSession({
      csrfTokens,
      identityCommands,
      request,
      response,
    });
    if (!session) {
      return true;
    }
    const reasonKey = exceptionalMembershipMatch[1] === "recovery"
      ? "recoveryReason"
      : "revocationReason";
    const body = await readRouteBody(request, [
      "participationKind",
      "programId",
      reasonKey,
      "targetIdentityId",
    ]);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }
    const command = exceptionalMembershipMatch[1] === "recovery"
      ? programCommands.recoverProgramMembership
      : programCommands.revokeProgramMembership;
    const result = command({
      actingIdentityId: session.value.identity.id,
      participationKind: body.value.participationKind,
      programId: body.value.programId,
      [reasonKey]: body.value[reasonKey],
      targetIdentityId: body.value.targetIdentityId,
    });
    sendJson(response, statusForResult(result), mapProgramMembershipResult(result));
    return true;
  }

  const studentMembershipMatch = pathname.match(/^\/programs\/([^/]+)\/student-membership$/);
  if ((request.method === "POST" || request.method === "DELETE") && studentMembershipMatch) {
    const session = requireMutationSession({
      csrfTokens,
      identityCommands,
      request,
      response,
    });
    if (!session) {
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

async function handleCuratorWorkspaceApi({
  csrfTokens,
  curatorWorkspaceCommands,
  identityCommands,
  pathname,
  request,
  response,
}) {
  const coverageGapsMatch = pathname.match(/^\/programs\/([^/]+)\/coverage-gaps$/);
  const llmSuggestionsMatch = pathname.match(/^\/programs\/([^/]+)\/llm-curation-suggestions$/);
  const llmSuggestionDetailMatch = pathname.match(/^\/llm-curation-suggestions\/([^/]+)$/);
  const llmSuggestionAcceptanceMatch = pathname.match(
    /^\/llm-curation-suggestions\/([^/]+)\/acceptance$/,
  );
  const llmSuggestionRejectionMatch = pathname.match(
    /^\/llm-curation-suggestions\/([^/]+)\/rejection$/,
  );

  if (request.method === "POST" && llmSuggestionsMatch) {
    const session = requireMutationSession({ csrfTokens, identityCommands, request, response });
    if (!session) {
      return true;
    }

    const body = await readRequiredJsonObject(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const generation = parseLlmSuggestionGenerationBody(body.value);
    if (generation.status === "rejected") {
      sendJson(response, 400, generation);
      return true;
    }

    const result = curatorWorkspaceCommands.generateLlmCurationSuggestions({
      actingIdentityId: session.value.identity.id,
      allowedSuggestionKinds: generation.value.allowedSuggestionKinds,
      contextEntityIds: generation.value.contextEntityIds,
      coverageGapIds: generation.value.coverageGapIds,
      curatorInstruction: generation.value.curatorInstruction,
      idempotencyKey: generation.value.idempotencyKey,
      maxSuggestions: generation.value.maxSuggestions,
      programId: decodeURIComponent(llmSuggestionsMatch[1]),
      suggestionPolicyId: generation.value.suggestionPolicyId,
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "GET" && llmSuggestionsMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const query = parseLlmSuggestionListQuery(request);
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = curatorWorkspaceCommands.listLlmCurationSuggestions({
      actingIdentityId: session.value.identity.id,
      cursor: query.value.cursor,
      limit: query.value.limit,
      programId: decodeURIComponent(llmSuggestionsMatch[1]),
      status: query.value.status,
      suggestionKind: query.value.suggestionKind,
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "GET" && llmSuggestionDetailMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = curatorWorkspaceCommands.getLlmCurationSuggestion({
      actingIdentityId: session.value.identity.id,
      suggestionId: decodeURIComponent(llmSuggestionDetailMatch[1]),
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "POST" && llmSuggestionAcceptanceMatch) {
    const session = requireMutationSession({ csrfTokens, identityCommands, request, response });
    if (!session) {
      return true;
    }

    const body = await readEmptyJsonObjectBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = curatorWorkspaceCommands.acceptLlmCurationSuggestion({
      actingIdentityId: session.value.identity.id,
      suggestionId: decodeURIComponent(llmSuggestionAcceptanceMatch[1]),
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "POST" && llmSuggestionRejectionMatch) {
    const session = requireMutationSession({ csrfTokens, identityCommands, request, response });
    if (!session) {
      return true;
    }

    const body = await readEmptyJsonObjectBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = curatorWorkspaceCommands.rejectLlmCurationSuggestion({
      actingIdentityId: session.value.identity.id,
      suggestionId: decodeURIComponent(llmSuggestionRejectionMatch[1]),
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "GET" && coverageGapsMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const filters = parseCoverageGapFilters(request);
    if (filters.status === "rejected") {
      sendJson(response, 400, filters);
      return true;
    }

    const result = curatorWorkspaceCommands.inspectCuratorCoverageGaps({
      actingIdentityId: session.value.identity.id,
      programId: decodeURIComponent(coverageGapsMatch[1]),
      gapKinds: filters.value.gapKinds,
      minimumSeverity: filters.value.minimumSeverity,
      scopeId: filters.value.scopeId,
      scopeKind: filters.value.scopeKind,
    });
    const mappedResult = mapCoverageGapReportResult(result);
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  return false;
}

async function handleStudentWorkspaceApi({
  csrfTokens,
  generateToken,
  identityCommands,
  listCursors,
  pathname,
  request,
  response,
  studentWorkspaceCommands,
}) {
  const attemptsMatch = pathname.match(/^\/programs\/([^/]+)\/open-answer-attempts$/);
  const attemptDetailMatch = pathname.match(/^\/open-answer-attempts\/([^/]+)$/);
  const quickCheckAttemptsMatch = pathname.match(/^\/programs\/([^/]+)\/quick-check-attempts$/);
  const quickCheckAttemptDetailMatch = pathname.match(/^\/quick-check-attempts\/([^/]+)$/);
  const readinessCheckDeliveriesMatch = pathname.match(/^\/programs\/([^/]+)\/readiness-checks$/);
  const readinessCheckAttemptsMatch = pathname.match(/^\/programs\/([^/]+)\/readiness-check-attempts$/);
  const readinessCheckAttemptDetailMatch = pathname.match(/^\/readiness-check-attempts\/([^/]+)$/);
  const learnerStateProgramMatch = pathname.match(/^\/programs\/([^/]+)\/learner-state$/);
  const learnerStateTargetMatch = pathname.match(/^\/learner-state\/targets\/([^/]+)\/([^/]+)$/);
  if (request.method === "GET" && learnerStateProgramMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = studentWorkspaceCommands.getLearnerStateProgramSummary({
      actingIdentityId: session.value.identity.id,
      programId: decodeURIComponent(learnerStateProgramMatch[1]),
    });
    sendJson(response, statusForResult(result), mapLearnerStateProgramResult(result));
    return true;
  }

  if (request.method === "GET" && learnerStateTargetMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = studentWorkspaceCommands.getLearnerStateTargetDetail({
      actingIdentityId: session.value.identity.id,
      targetKind: decodeURIComponent(learnerStateTargetMatch[1]),
      targetId: decodeURIComponent(learnerStateTargetMatch[2]),
    });
    sendJson(response, statusForResult(result), mapLearnerStateTargetResult(result));
    return true;
  }

  if (request.method === "GET" && quickCheckAttemptDetailMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = studentWorkspaceCommands.getQuickCheckAttempt({
      actingIdentityId: session.value.identity.id,
      attemptId: decodeURIComponent(quickCheckAttemptDetailMatch[1]),
    });
    const mappedResult = mapQuickCheckAttemptDetailResult(result);
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "GET" && readinessCheckAttemptDetailMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = studentWorkspaceCommands.getReadinessCheckAttempt({
      actingIdentityId: session.value.identity.id,
      attemptId: decodeURIComponent(readinessCheckAttemptDetailMatch[1]),
    });
    const mappedResult = mapReadinessCheckAttemptDetailResult(result);
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "GET" && readinessCheckDeliveriesMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(readinessCheckDeliveriesMatch[1]);
    const routeKey = `readiness-check-deliveries:${programId}`;
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = studentWorkspaceCommands.listReadinessCheckDeliveries({
      actingIdentityId: session.value.identity.id,
      programId,
    });
    const mappedResult = mapReadinessCheckDeliveryListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "GET" && readinessCheckAttemptsMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const filters = parseReadinessCheckAttemptListFilters(request);
    if (filters.status === "rejected") {
      sendJson(response, 400, filters);
      return true;
    }

    const programId = decodeURIComponent(readinessCheckAttemptsMatch[1]);
    const routeKey = JSON.stringify([
      "student-readiness-check-attempts",
      session.value.identity.id,
      programId,
      filters.value.readinessCheckRevisionId ?? "all",
    ]);
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = studentWorkspaceCommands.listReadinessCheckAttempts({
      actingIdentityId: session.value.identity.id,
      programId,
      readinessCheckRevisionId: filters.value.readinessCheckRevisionId,
    });
    const mappedResult = mapReadinessCheckAttemptListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "POST" && readinessCheckAttemptsMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const idempotencyKey = parseAttemptIdempotencyKey(request);
    if (idempotencyKey.status === "rejected") {
      sendJson(response, 400, idempotencyKey);
      return true;
    }

    const body = await readRequiredJsonObject(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const submission = parseSubmitReadinessCheckAttemptBody(body.value);
    if (submission.status === "rejected") {
      sendJson(response, 400, submission);
      return true;
    }

    const result = studentWorkspaceCommands.submitReadinessCheckAttempt({
      actingIdentityId: session.value.identity.id,
      idempotencyKey: idempotencyKey.value,
      programId: decodeURIComponent(readinessCheckAttemptsMatch[1]),
      readinessCheckRevisionId: submission.value.readinessCheckRevisionId,
    });
    sendJson(response, statusForResult(result), mapReadinessCheckAttemptResult(result));
    return true;
  }

  if (request.method === "GET" && quickCheckAttemptsMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const filters = parseQuickCheckAttemptListFilters(request);
    if (filters.status === "rejected") {
      sendJson(response, 400, filters);
      return true;
    }

    const programId = decodeURIComponent(quickCheckAttemptsMatch[1]);
    const routeKey = JSON.stringify([
      "student-quick-check-attempts",
      session.value.identity.id,
      programId,
      filters.value.checkRevisionId ?? "all",
    ]);
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = studentWorkspaceCommands.listQuickCheckAttempts({
      actingIdentityId: session.value.identity.id,
      checkRevisionId: filters.value.checkRevisionId,
      programId,
    });
    const mappedResult = mapQuickCheckAttemptListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "POST" && quickCheckAttemptsMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const idempotencyKey = parseAttemptIdempotencyKey(request);
    if (idempotencyKey.status === "rejected") {
      sendJson(response, 400, idempotencyKey);
      return true;
    }

    const body = await readRequiredJsonObject(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const submission = parseSubmitQuickCheckAttemptBody(body.value);
    if (submission.status === "rejected") {
      sendJson(response, 400, submission);
      return true;
    }

    const result = studentWorkspaceCommands.submitQuickCheckAttempt({
      actingIdentityId: session.value.identity.id,
      checkRevisionId: submission.value.checkRevisionId,
      idempotencyKey: idempotencyKey.value,
      programId: decodeURIComponent(quickCheckAttemptsMatch[1]),
      selectedOptionId: submission.value.selectedOptionId,
    });
    sendJson(response, statusForResult(result), mapQuickCheckAttemptResult(result));
    return true;
  }

  if (request.method === "GET" && attemptDetailMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = studentWorkspaceCommands.getOpenAnswerAttempt({
      actingIdentityId: session.value.identity.id,
      attemptId: decodeURIComponent(attemptDetailMatch[1]),
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "GET" && attemptsMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const filters = parseOpenAnswerAttemptListFilters(request);
    if (filters.status === "rejected") {
      sendJson(response, 400, filters);
      return true;
    }

    const programId = decodeURIComponent(attemptsMatch[1]);
    const routeKey = JSON.stringify([
      "student-open-answer-attempts",
      session.value.identity.id,
      programId,
      filters.value.status ?? "all",
      filters.value.checkRevisionId ?? "all",
    ]);
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = studentWorkspaceCommands.listOpenAnswerAttempts({
      actingIdentityId: session.value.identity.id,
      checkRevisionId: filters.value.checkRevisionId,
      programId,
      status: filters.value.status,
    });
    const mappedResult = mapOpenAnswerAttemptListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "POST" && attemptsMatch) {
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

    const idempotencyKey = parseAttemptIdempotencyKey(request);
    if (idempotencyKey.status === "rejected") {
      sendJson(response, 400, idempotencyKey);
      return true;
    }

    const body = await readRequiredJsonObject(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const submission = parseSubmitOpenAnswerAttemptBody(body.value);
    if (submission.status === "rejected") {
      sendJson(response, 400, submission);
      return true;
    }

    const result = studentWorkspaceCommands.submitOpenAnswerAttempt({
      actingIdentityId: session.value.identity.id,
      checkRevisionId: submission.value.checkRevisionId,
      idempotencyKey: idempotencyKey.value,
      programId: decodeURIComponent(attemptsMatch[1]),
      submittedAnswer: submission.value.submittedAnswer,
    });
    sendJson(response, statusForResult(result), result);
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
  const navigationCandidatesMatch = pathname.match(/^\/programs\/([^/]+)\/navigation-candidates$/);
  const programNavigationMatch = pathname.match(/^\/programs\/([^/]+)\/navigation$/);
  const acceptedCorpusMatch = pathname.match(/^\/programs\/([^/]+)\/accepted-corpus$/);
  const acceptedCorpusStatusMatch = pathname.match(/^\/corpus\/([^/]+)\/status$/);
  const corpusEventsMatch = pathname.match(/^\/programs\/([^/]+)\/corpus-events$/);
  const candidateAcceptanceMatch = pathname.match(/^\/corpus-candidates\/([^/]+)\/acceptance$/);
  const candidateRejectionMatch = pathname.match(/^\/corpus-candidates\/([^/]+)\/rejection$/);
  const navigationCandidateAcceptanceMatch = pathname.match(/^\/navigation-candidates\/([^/]+)\/acceptance$/);
  const navigationCandidateRejectionMatch = pathname.match(/^\/navigation-candidates\/([^/]+)\/rejection$/);
  const navigationEntityMatch = pathname.match(/^\/navigation\/entities\/([^/]+)$/);
  const navigationRevisionMatch = pathname.match(/^\/navigation\/revisions\/([^/]+)$/);
  const navigationRelationshipStatusMatch = pathname.match(/^\/navigation-relationships\/([^/]+)\/status$/);
  const sourceStatusMatch = pathname.match(/^\/sources\/([^/]+)\/status$/);
  const sourceRecordMatch = pathname.match(/^\/sources\/([^/]+)$/);
  const sourceContentMatch = pathname.match(/^\/sources\/([^/]+)\/content$/);
  const materialRevisionContentMatch = pathname.match(/^\/materials\/revisions\/([^/]+)\/content$/);
  const materialContentMatch = pathname.match(/^\/materials\/([^/]+)\/content$/);
  const acceptedCorpusRevisionMatch = pathname.match(/^\/accepted-corpus-revisions\/([^/]+)$/);
  const acceptedAssessmentCriteriaMatch = pathname.match(/^\/programs\/([^/]+)\/assessment-criteria$/);
  const assessmentCriterionCandidatesMatch = pathname.match(
    /^\/programs\/([^/]+)\/assessment-criteria\/candidates$/,
  );
  const assessmentCriterionAcceptanceMatch = pathname.match(
    /^\/assessment-criteria\/candidates\/([^/]+)\/acceptance$/,
  );
  const assessmentCriterionRejectionMatch = pathname.match(
    /^\/assessment-criteria\/candidates\/([^/]+)\/rejection$/,
  );
  const acceptedAssessmentCriterionRevisionMatch = pathname.match(
    /^\/assessment-criteria\/revisions\/([^/]+)$/,
  );
  const assessmentCriterionStatusMatch = pathname.match(/^\/assessment-criteria\/([^/]+)\/status$/);
  const acceptedOpenAnswerChecksMatch = pathname.match(/^\/programs\/([^/]+)\/open-answer-checks$/);
  const openAnswerCheckCandidatesMatch = pathname.match(
    /^\/programs\/([^/]+)\/open-answer-checks\/candidates$/,
  );
  const openAnswerCheckAcceptanceMatch = pathname.match(
    /^\/open-answer-checks\/candidates\/([^/]+)\/acceptance$/,
  );
  const openAnswerCheckRejectionMatch = pathname.match(
    /^\/open-answer-checks\/candidates\/([^/]+)\/rejection$/,
  );
  const acceptedOpenAnswerCheckRevisionMatch = pathname.match(
    /^\/open-answer-checks\/revisions\/([^/]+)$/,
  );
  const openAnswerCheckStatusMatch = pathname.match(/^\/open-answer-checks\/([^/]+)\/status$/);
  const quickCheckDeliveriesMatch = pathname.match(/^\/programs\/([^/]+)\/quick-checks$/);
  const quickCheckCurationListMatch = pathname.match(/^\/programs\/([^/]+)\/quick-checks\/curation$/);
  const quickCheckStatusMatch = pathname.match(/^\/quick-checks\/([^/]+)\/status$/);
  const quickCheckDeliveryRevisionMatch = pathname.match(/^\/quick-checks\/revisions\/([^/]+)$/);
  const quickCheckCandidatesMatch = pathname.match(
    /^\/programs\/([^/]+)\/quick-checks\/candidates$/,
  );
  const quickCheckAcceptanceMatch = pathname.match(
    /^\/quick-checks\/candidates\/([^/]+)\/acceptance$/,
  );
  const quickCheckRejectionMatch = pathname.match(
    /^\/quick-checks\/candidates\/([^/]+)\/rejection$/,
  );
  const acceptedQuickCheckCurationRevisionMatch = pathname.match(
    /^\/quick-checks\/revisions\/([^/]+)\/curation$/,
  );
  const readinessCheckCandidatesMatch = pathname.match(
    /^\/programs\/([^/]+)\/readiness-checks\/candidates$/,
  );
  const readinessCheckAcceptanceMatch = pathname.match(
    /^\/readiness-checks\/candidates\/([^/]+)\/acceptance$/,
  );
  const readinessCheckRejectionMatch = pathname.match(
    /^\/readiness-checks\/candidates\/([^/]+)\/rejection$/,
  );
  const acceptedReadinessCheckCurationRevisionMatch = pathname.match(
    /^\/readiness-checks\/revisions\/([^/]+)\/curation$/,
  );
  const readinessCheckStatusMatch = pathname.match(/^\/readiness-checks\/([^/]+)\/status$/);
  const readinessCheckCurationListMatch = pathname.match(
    /^\/programs\/([^/]+)\/readiness-checks\/curation$/,
  );
  const learnerStateTargetLinksMatch = pathname.match(/^\/programs\/([^/]+)\/learner-state-target-links$/);
  const learnerStateTargetLinkMatch = pathname.match(/^\/learner-state-target-links\/([^/]+)$/);
  if (request.method === "GET" && learnerStateTargetLinksMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = corpusCommands.listLearnerEvidenceTargetLinks({
      actingIdentityId: session.value.identity.id,
      programId: decodeURIComponent(learnerStateTargetLinksMatch[1]),
    });
    sendJson(response, statusForResult(result), mapLearnerStateTargetLinkListResult(result));
    return true;
  }

  if (request.method === "POST" && learnerStateTargetLinksMatch) {
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
    if (body.status === "rejected" || !isValidLearnerStateTargetLinkBody(body.value)) {
      sendJson(response, 400, rejected("validation_failed"));
      return true;
    }

    const result = corpusCommands.createLearnerEvidenceTargetLink({
      actingIdentityId: session.value.identity.id,
      evidenceOwnerEntityId: body.value.evidenceOwnerEntityId,
      evidenceOwnerKind: body.value.evidenceOwnerKind,
      programId: decodeURIComponent(learnerStateTargetLinksMatch[1]),
      targetId: body.value.targetId,
      targetKind: body.value.targetKind,
    });
    sendJson(response, statusForResult(result), mapLearnerStateTargetLinkResult(result));
    return true;
  }

  if (request.method === "DELETE" && learnerStateTargetLinkMatch) {
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

    const result = corpusCommands.deleteLearnerEvidenceTargetLink({
      actingIdentityId: session.value.identity.id,
      linkId: decodeURIComponent(learnerStateTargetLinkMatch[1]),
    });
    sendJson(response, statusForResult(result), mapLearnerStateTargetLinkResult(result));
    return true;
  }

  if (request.method === "GET" && quickCheckDeliveriesMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(quickCheckDeliveriesMatch[1]);
    const routeKey = `quick-check-deliveries:${programId}`;
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = corpusCommands.listQuickCheckDeliveries({
      actingIdentityId: session.value.identity.id,
      programId,
    });
    const mappedResult = mapQuickCheckDeliveryListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "GET" && quickCheckDeliveryRevisionMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = corpusCommands.getQuickCheckDelivery({
      actingIdentityId: session.value.identity.id,
      revisionId: decodeURIComponent(quickCheckDeliveryRevisionMatch[1]),
    });
    sendJson(response, statusForResult(result), mapQuickCheckDeliveryResult(result));
    return true;
  }

  if (request.method === "PUT" && quickCheckStatusMatch) {
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
    const result = corpusCommands.setAcceptedQuickCheckLifecycleStatus({
      actingIdentityId: session.value.identity.id,
      entityId: decodeURIComponent(quickCheckStatusMatch[1]),
      status: body.value.status,
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "GET" && quickCheckCandidatesMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(quickCheckCandidatesMatch[1]);
    const status = parseCorpusCandidateStatus(request);
    if (status.status === "rejected") {
      sendJson(response, 400, status);
      return true;
    }

    const routeKey = `quick-check-candidates:${programId}:${status.value ?? "all"}`;
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = corpusCommands.listQuickCheckCandidates({
      actingIdentityId: session.value.identity.id,
      programId,
      status: status.value ?? undefined,
    });
    const mappedResult = mapQuickCheckCandidateListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "GET" && readinessCheckCandidatesMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(readinessCheckCandidatesMatch[1]);
    const status = parseCorpusCandidateStatus(request);
    if (status.status === "rejected") {
      sendJson(response, 400, status);
      return true;
    }

    const routeKey = `readiness-check-candidates:${programId}:${status.value ?? "all"}`;
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = corpusCommands.listReadinessCheckCandidates({
      actingIdentityId: session.value.identity.id,
      programId,
      status: status.value ?? undefined,
    });
    const mappedResult = mapReadinessCheckCandidateListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "POST" && quickCheckCandidatesMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const body = await readRequiredJsonObject(request);
    if (body.status === "rejected" || !isValidQuickCheckCandidateBody(body.value)) {
      sendJson(response, 400, rejected("validation_failed"));
      return true;
    }

    const result = corpusCommands.createQuickCheckCandidate({
      actingIdentityId: session.value.identity.id,
      answerKeyIndex: body.value.answerKeyOptionIndex,
      checkKind: body.value.checkKind,
      options: body.value.options,
      programId: decodeURIComponent(quickCheckCandidatesMatch[1]),
      prompt: body.value.prompt,
      rationale: body.value.rationale,
      sourceIds: body.value.sourceIds,
      title: body.value.title,
    });
    sendJson(response, statusForResult(result), mapQuickCheckCandidateResult(result));
    return true;
  }

  if (request.method === "POST" && readinessCheckCandidatesMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const body = await readRequiredJsonObject(request);
    if (body.status === "rejected" || !isValidReadinessCheckCandidateBody(body.value)) {
      sendJson(response, 400, rejected("validation_failed"));
      return true;
    }

    const result = corpusCommands.createReadinessCheckCandidate({
      actingIdentityId: session.value.identity.id,
      programId: decodeURIComponent(readinessCheckCandidatesMatch[1]),
      rationale: body.value.rationale,
      requirements: body.value.requirements,
      scope: body.value.scope,
      sourceIds: body.value.sourceIds,
      title: body.value.title,
    });
    sendJson(response, statusForResult(result), mapReadinessCheckCandidateResult(result));
    return true;
  }

  if (request.method === "GET" && acceptedQuickCheckCurationRevisionMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = corpusCommands.getAcceptedQuickCheckRevisionForCuration({
      actingIdentityId: session.value.identity.id,
      revisionId: decodeURIComponent(acceptedQuickCheckCurationRevisionMatch[1]),
    });
    sendJson(response, statusForResult(result), mapAcceptedQuickCheckResult(result));
    return true;
  }

  if (request.method === "GET" && quickCheckCurationListMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = corpusCommands.listAcceptedQuickChecksForCuration({
      actingIdentityId: session.value.identity.id,
      programId: decodeURIComponent(quickCheckCurationListMatch[1]),
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "GET" && readinessCheckCurationListMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = corpusCommands.listAcceptedReadinessChecksForCuration({
      actingIdentityId: session.value.identity.id,
      programId: decodeURIComponent(readinessCheckCurationListMatch[1]),
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "GET" && acceptedReadinessCheckCurationRevisionMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = corpusCommands.getAcceptedReadinessCheckRevisionForCuration({
      actingIdentityId: session.value.identity.id,
      revisionId: decodeURIComponent(acceptedReadinessCheckCurationRevisionMatch[1]),
    });
    sendJson(response, statusForResult(result), mapAcceptedReadinessCheckResult(result));
    return true;
  }

  if (request.method === "PUT" && readinessCheckStatusMatch) {
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
    const result = corpusCommands.setAcceptedReadinessCheckLifecycleStatus({
      actingIdentityId: session.value.identity.id,
      entityId: decodeURIComponent(readinessCheckStatusMatch[1]),
      status: body.value.status,
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "POST" && quickCheckAcceptanceMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const body = await readAcceptanceBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = corpusCommands.acceptQuickCheckCandidate({
      actingIdentityId: session.value.identity.id,
      candidateId: decodeURIComponent(quickCheckAcceptanceMatch[1]),
      targetEntityId: body.value.targetEntityId,
    });
    sendJson(response, statusForResult(result), mapAcceptedQuickCheckResult(result));
    return true;
  }

  if (request.method === "POST" && readinessCheckAcceptanceMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const body = await readAcceptanceBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = corpusCommands.acceptReadinessCheckCandidate({
      actingIdentityId: session.value.identity.id,
      candidateId: decodeURIComponent(readinessCheckAcceptanceMatch[1]),
      targetEntityId: body.value.targetEntityId,
    });
    sendJson(response, statusForResult(result), mapAcceptedReadinessCheckResult(result));
    return true;
  }

  if (request.method === "POST" && quickCheckRejectionMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const body = await readRejectionBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = corpusCommands.rejectQuickCheckCandidate({
      actingIdentityId: session.value.identity.id,
      candidateId: decodeURIComponent(quickCheckRejectionMatch[1]),
    });
    sendJson(response, statusForResult(result), mapQuickCheckCandidateResult(result));
    return true;
  }

  if (request.method === "POST" && readinessCheckRejectionMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const body = await readRejectionBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = corpusCommands.rejectReadinessCheckCandidate({
      actingIdentityId: session.value.identity.id,
      candidateId: decodeURIComponent(readinessCheckRejectionMatch[1]),
    });
    sendJson(response, statusForResult(result), mapReadinessCheckCandidateResult(result));
    return true;
  }

  if (request.method === "GET" && assessmentCriterionCandidatesMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(assessmentCriterionCandidatesMatch[1]);
    const status = parseCorpusCandidateStatus(request);
    if (status.status === "rejected") {
      sendJson(response, 400, status);
      return true;
    }

    const routeKey = `assessment-criterion-candidates:${programId}:${status.value ?? "all"}`;
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = corpusCommands.listAssessmentCriterionCandidates({
      actingIdentityId: session.value.identity.id,
      programId,
      status: status.value ?? undefined,
    });
    const mappedResult = mapAssessmentCriterionCandidateListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "GET" && acceptedAssessmentCriteriaMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(acceptedAssessmentCriteriaMatch[1]);
    const routeKey = `accepted-assessment-criteria:${programId}`;
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = corpusCommands.listAcceptedAssessmentCriteria({
      actingIdentityId: session.value.identity.id,
      programId,
    });
    const mappedResult = mapAcceptedAssessmentCriteriaListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "GET" && acceptedAssessmentCriterionRevisionMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = corpusCommands.getAcceptedAssessmentCriterionRevision({
      actingIdentityId: session.value.identity.id,
      revisionId: decodeURIComponent(acceptedAssessmentCriterionRevisionMatch[1]),
    });
    sendJson(response, statusForResult(result), mapAcceptedAssessmentCriterionResult(result));
    return true;
  }

  if (request.method === "PUT" && assessmentCriterionStatusMatch) {
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
    const result = corpusCommands.setAcceptedAssessmentCriterionLifecycleStatus({
      actingIdentityId: session.value.identity.id,
      entityId: decodeURIComponent(assessmentCriterionStatusMatch[1]),
      status: body.value.status,
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "GET" && acceptedOpenAnswerChecksMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(acceptedOpenAnswerChecksMatch[1]);
    const routeKey = `accepted-open-answer-checks:${programId}`;
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = corpusCommands.listAcceptedOpenAnswerChecks({
      actingIdentityId: session.value.identity.id,
      programId,
    });
    const mappedResult = mapAcceptedOpenAnswerCheckListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "GET" && acceptedOpenAnswerCheckRevisionMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = corpusCommands.getAcceptedOpenAnswerCheckRevision({
      actingIdentityId: session.value.identity.id,
      revisionId: decodeURIComponent(acceptedOpenAnswerCheckRevisionMatch[1]),
    });
    sendJson(response, statusForResult(result), mapAcceptedOpenAnswerCheckResult(result));
    return true;
  }

  if (request.method === "PUT" && openAnswerCheckStatusMatch) {
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
    const result = corpusCommands.setAcceptedOpenAnswerCheckLifecycleStatus({
      actingIdentityId: session.value.identity.id,
      entityId: decodeURIComponent(openAnswerCheckStatusMatch[1]),
      status: body.value.status,
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "GET" && openAnswerCheckCandidatesMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(openAnswerCheckCandidatesMatch[1]);
    const status = parseCorpusCandidateStatus(request);
    if (status.status === "rejected") {
      sendJson(response, 400, status);
      return true;
    }

    const routeKey = `open-answer-check-candidates:${programId}:${status.value ?? "all"}`;
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = corpusCommands.listOpenAnswerCheckCandidates({
      actingIdentityId: session.value.identity.id,
      programId,
      status: status.value ?? undefined,
    });
    const mappedResult = mapOpenAnswerCheckCandidateListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

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

  if (request.method === "GET" && navigationCandidatesMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(navigationCandidatesMatch[1]);
    const status = parseCorpusCandidateStatus(request);
    if (status.status === "rejected") {
      sendJson(response, 400, status);
      return true;
    }

    const routeKey = `navigation-candidates:${programId}:${status.value ?? "all"}`;
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = corpusCommands.listNavigationCandidates({
      actingIdentityId: session.value.identity.id,
      programId,
      status: status.value ?? undefined,
    });
    const mappedResult = mapNavigationCandidateListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "POST" && navigationCandidatesMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const body = await readRequiredJsonObject(request);
    if (body.status === "rejected" || !isValidNavigationCandidateBody(body.value)) {
      sendJson(response, 400, rejected("validation_failed"));
      return true;
    }

    const result = corpusCommands.createNavigationCandidate({
      actingIdentityId: session.value.identity.id,
      body: body.value.body,
      candidateKind: body.value.candidateKind,
      citation: body.value.citation,
      locator: body.value.locator,
      materialReferenceKind: body.value.materialReferenceKind,
      programId: decodeURIComponent(navigationCandidatesMatch[1]),
      rationale: body.value.rationale,
      relationshipDrafts: body.value.relationshipDrafts,
      sourceIds: body.value.sourceIds,
      title: body.value.title,
    });
    sendJson(response, statusForResult(result), mapNavigationCandidateResult(result));
    return true;
  }

  if (request.method === "GET" && programNavigationMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = corpusCommands.listProgramNavigation({
      actingIdentityId: session.value.identity.id,
      programId: decodeURIComponent(programNavigationMatch[1]),
    });
    sendJson(response, statusForResult(result), mapProgramNavigationResult(result));
    return true;
  }

  if (request.method === "GET" && navigationEntityMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = corpusCommands.getNavigationEntity({
      actingIdentityId: session.value.identity.id,
      entityId: decodeURIComponent(navigationEntityMatch[1]),
    });
    sendJson(response, statusForResult(result), mapNavigationEntityResult(result));
    return true;
  }

  if (request.method === "GET" && navigationRevisionMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = corpusCommands.getNavigationRevision({
      actingIdentityId: session.value.identity.id,
      revisionId: decodeURIComponent(navigationRevisionMatch[1]),
    });
    sendJson(response, statusForResult(result), mapNavigationRevisionResult(result));
    return true;
  }

  if ((request.method === "PUT" || request.method === "DELETE") && sourceContentMatch) {
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
    const sourceId = decodeURIComponent(sourceContentMatch[1]);
    let result;
    if (request.method === "DELETE") {
      result = corpusCommands.deleteSourceContent({ actingIdentityId: session.value.identity.id, sourceId });
    } else {
      const body = await readRequiredJsonObject(request);
      if (body.status === "rejected") {
        sendJson(response, 400, body);
        return true;
      }
      result = corpusCommands.setSourceContent({
        actingIdentityId: session.value.identity.id,
        sourceId,
        content: body.value.content,
        contentFormat: body.value.contentFormat,
      });
    }
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "PUT" && sourceStatusMatch) {
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
    const result = corpusCommands.setProgramSourceLifecycleStatus({
      actingIdentityId: session.value.identity.id,
      sourceId: decodeURIComponent(sourceStatusMatch[1]),
      status: body.value.status,
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "DELETE" && sourceRecordMatch) {
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
    const result = corpusCommands.deleteProgramSource({
      actingIdentityId: session.value.identity.id,
      sourceId: decodeURIComponent(sourceRecordMatch[1]),
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "GET" && sourceContentMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }
    const result = corpusCommands.readSourceContent({
      actingIdentityId: session.value.identity.id,
      sourceId: decodeURIComponent(sourceContentMatch[1]),
      ...parseContentQuery(request),
    });
    sendJson(response, statusForResult(result), mapContentPageResult(result));
    return true;
  }

  if (request.method === "PUT" && materialRevisionContentMatch) {
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
    const result = corpusCommands.setAcceptedMaterialContent({
      actingIdentityId: session.value.identity.id,
      revisionId: decodeURIComponent(materialRevisionContentMatch[1]),
      content: body.value.content,
      contentFormat: body.value.contentFormat,
      sourceContentProvenance: body.value.sourceContentProvenance,
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "GET" && materialRevisionContentMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }
    const result = corpusCommands.readMaterialRevisionContent({
      actingIdentityId: session.value.identity.id,
      revisionId: decodeURIComponent(materialRevisionContentMatch[1]),
      ...parseContentQuery(request),
    });
    sendJson(response, statusForResult(result), mapContentPageResult(result));
    return true;
  }

  if (request.method === "GET" && materialContentMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }
    const result = corpusCommands.readMaterialContent({
      actingIdentityId: session.value.identity.id,
      entityId: decodeURIComponent(materialContentMatch[1]),
      ...parseContentQuery(request),
    });
    sendJson(response, statusForResult(result), mapContentPageResult(result));
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

  if (request.method === "GET" && corpusEventsMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(corpusEventsMatch[1]);
    const routeKey = `corpus-events:${programId}`;
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = corpusCommands.listCorpusEvents({
      actingIdentityId: session.value.identity.id,
      programId,
    });
    const mappedResult = mapCorpusEventListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "PUT" && navigationRelationshipStatusMatch) {
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
    const result = corpusCommands.setAcceptedNavigationRelationshipLifecycleStatus({
      actingIdentityId: session.value.identity.id,
      relationshipId: decodeURIComponent(navigationRelationshipStatusMatch[1]),
      status: body.value.status,
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "GET" && acceptedCorpusMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const programId = decodeURIComponent(acceptedCorpusMatch[1]);
    const acceptedKind = parseAcceptedKind(request);
    if (acceptedKind.status === "rejected") {
      sendJson(response, 400, acceptedKind);
      return true;
    }

    const routeKey = `accepted-corpus:${programId}:${acceptedKind.value ?? "all"}`;
    const query = parseListQuery({ listCursors, request, routeKey });
    if (query.status === "rejected") {
      sendJson(response, 400, query);
      return true;
    }

    const result = corpusCommands.listAcceptedCorpus({
      acceptedKind: acceptedKind.value ?? undefined,
      actingIdentityId: session.value.identity.id,
      programId,
    });
    const mappedResult = mapAcceptedCorpusListResult({
      generateToken,
      listCursors,
      query: query.value,
      result,
      routeKey,
    });
    sendJson(response, statusForResult(mappedResult), mappedResult);
    return true;
  }

  if (request.method === "PUT" && acceptedCorpusStatusMatch) {
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
    const result = corpusCommands.setAcceptedCorpusLifecycleStatus({
      actingIdentityId: session.value.identity.id,
      entityId: decodeURIComponent(acceptedCorpusStatusMatch[1]),
      status: body.value.status,
    });
    sendJson(response, statusForResult(result), result);
    return true;
  }

  if (request.method === "GET" && acceptedCorpusRevisionMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const result = corpusCommands.getAcceptedCorpusRevision({
      actingIdentityId: session.value.identity.id,
      revisionId: decodeURIComponent(acceptedCorpusRevisionMatch[1]),
    });
    sendJson(response, statusForResult(result), mapAcceptedCorpusResult(result));
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

  if (request.method === "POST" && assessmentCriterionCandidatesMatch) {
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
    if (body.status === "rejected" || !isValidAssessmentCriterionCandidateBody(body.value)) {
      sendJson(response, 400, rejected("validation_failed"));
      return true;
    }

    const result = corpusCommands.createAssessmentCriterionCandidate({
      actingIdentityId: session.value.identity.id,
      body: body.value.body,
      programId: decodeURIComponent(assessmentCriterionCandidatesMatch[1]),
      rationale: body.value.rationale,
      sourceIds: body.value.sourceIds,
      title: body.value.title,
    });
    sendJson(response, statusForResult(result), mapAssessmentCriterionCandidateResult(result));
    return true;
  }

  if (request.method === "POST" && openAnswerCheckCandidatesMatch) {
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
    if (body.status === "rejected" || !isValidOpenAnswerCheckCandidateBody(body.value)) {
      sendJson(response, 400, rejected("validation_failed"));
      return true;
    }

    const result = corpusCommands.createOpenAnswerCheckCandidate({
      actingIdentityId: session.value.identity.id,
      checkKind: body.value.checkKind,
      criterionEntityIds: body.value.criterionEntityIds,
      programId: decodeURIComponent(openAnswerCheckCandidatesMatch[1]),
      prompt: body.value.prompt,
      rationale: body.value.rationale,
      sourceIds: body.value.sourceIds,
      title: body.value.title,
    });
    sendJson(response, statusForResult(result), mapOpenAnswerCheckCandidateResult(result));
    return true;
  }

  if (request.method === "POST" && openAnswerCheckAcceptanceMatch) {
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

    const body = await readAcceptanceBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = corpusCommands.acceptOpenAnswerCheckCandidate({
      actingIdentityId: session.value.identity.id,
      candidateId: decodeURIComponent(openAnswerCheckAcceptanceMatch[1]),
      targetEntityId: body.value.targetEntityId,
    });
    sendJson(response, statusForResult(result), mapAcceptedOpenAnswerCheckResult(result));
    return true;
  }

  if (request.method === "POST" && openAnswerCheckRejectionMatch) {
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

    const body = await readRejectionBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = corpusCommands.rejectOpenAnswerCheckCandidate({
      actingIdentityId: session.value.identity.id,
      candidateId: decodeURIComponent(openAnswerCheckRejectionMatch[1]),
    });
    sendJson(response, statusForResult(result), mapOpenAnswerCheckCandidateResult(result));
    return true;
  }

  if (request.method === "POST" && assessmentCriterionAcceptanceMatch) {
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

    const body = await readAcceptanceBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = corpusCommands.acceptAssessmentCriterionCandidate({
      actingIdentityId: session.value.identity.id,
      candidateId: decodeURIComponent(assessmentCriterionAcceptanceMatch[1]),
      targetEntityId: body.value.targetEntityId,
    });
    sendJson(response, statusForResult(result), mapAcceptedAssessmentCriterionResult(result));
    return true;
  }

  if (request.method === "POST" && assessmentCriterionRejectionMatch) {
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

    const body = await readRejectionBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = corpusCommands.rejectAssessmentCriterionCandidate({
      actingIdentityId: session.value.identity.id,
      candidateId: decodeURIComponent(assessmentCriterionRejectionMatch[1]),
    });
    sendJson(response, statusForResult(result), mapAssessmentCriterionCandidateResult(result));
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

  if (request.method === "POST" && candidateAcceptanceMatch) {
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

    const body = await readAcceptanceBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = corpusCommands.acceptCorpusCandidate({
      actingIdentityId: session.value.identity.id,
      candidateId: decodeURIComponent(candidateAcceptanceMatch[1]),
      targetEntityId: body.value.targetEntityId,
    });
    sendJson(response, statusForResult(result), mapAcceptedCorpusResult(result));
    return true;
  }

  if (request.method === "POST" && navigationCandidateAcceptanceMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const body = await readAcceptanceBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = corpusCommands.acceptNavigationCandidate({
      actingIdentityId: session.value.identity.id,
      candidateId: decodeURIComponent(navigationCandidateAcceptanceMatch[1]),
      targetEntityId: body.value.targetEntityId,
    });
    sendJson(response, statusForResult(result), mapNavigationChangeResult(result));
    return true;
  }

  if (request.method === "POST" && candidateRejectionMatch) {
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

    const body = await readRejectionBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = corpusCommands.rejectCorpusCandidate({
      actingIdentityId: session.value.identity.id,
      candidateId: decodeURIComponent(candidateRejectionMatch[1]),
    });
    sendJson(response, statusForResult(result), mapCorpusCandidateResult(result));
    return true;
  }

  if (request.method === "POST" && navigationCandidateRejectionMatch) {
    const session = resolveHttpSession({ identityCommands, request });
    if (session.status === "rejected") {
      sendJson(response, httpStatusFor(session.reason), session);
      return true;
    }

    const csrf = requireCsrf(request, csrfTokens);
    if (csrf.status === "rejected") {
      sendJson(response, httpStatusFor(csrf.reason), csrf);
      return true;
    }

    const body = await readRejectionBody(request);
    if (body.status === "rejected") {
      sendJson(response, 400, body);
      return true;
    }

    const result = corpusCommands.rejectNavigationCandidate({
      actingIdentityId: session.value.identity.id,
      candidateId: decodeURIComponent(navigationCandidateRejectionMatch[1]),
    });
    sendJson(response, statusForResult(result), mapNavigationCandidateResult(result));
    return true;
  }

  return false;
}

export function readPackageVersion() {
  const packageJsonUrl = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
  return packageJson.version;
}

export function startServer({
  bootstrapSecret = process.env.AGONARA_BOOTSTRAP_SECRET,
  databasePath = process.env.AGONARA_DB_PATH ?? ":memory:",
  host = process.env.HOST ?? "0.0.0.0",
  log = logToStdout,
  nomosApiKey = process.env.AGONARA_NOMOS_API_KEY,
  nomosBaseUrl = process.env.AGONARA_NOMOS_BASE_URL,
  nomosModel = process.env.AGONARA_NOMOS_MODEL,
  openAnswerEvaluatorTriggerToken = process.env.AGONARA_OPEN_ANSWER_EVALUATOR_TRIGGER_TOKEN,
  port = process.env.PORT ?? "8080",
  version = readPackageVersion(),
} = {}) {
  if (!bootstrapSecret) {
    throw new Error("AGONARA_BOOTSTRAP_SECRET is required");
  }

  const database = openIdentityDatabase(databasePath);
  initializeIdentityStorage(database);
  const now = () => new Date();
  const programCommands = createProgramCommands({
    database,
  });
  const openAnswerEvaluatorRuntime = makeOpenAnswerEvaluatorRuntime({
    nomosApiKey,
    nomosBaseUrl,
    nomosModel,
  });
  const studentWorkspaceCommands = createStudentWorkspaceCommands({
    database,
    evaluatorPolicies: openAnswerEvaluatorRuntime.evaluatorPolicies,
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
    providerAdapters: openAnswerEvaluatorRuntime.providerAdapters,
  });
  const corpusCommands = createCorpusCommands({
    database,
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
  });
  const curatorWorkspaceCommands = createCuratorWorkspaceCommands({
    corpusCommands,
    database,
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
    llmSuggestionPolicies: [makeDefaultLlmSuggestionPolicy()],
    llmSuggestionProviderAdapters: [makeDefaultLlmSuggestionProviderAdapter()],
    now,
  });
  const server = createServer({
    corpusCommands,
    curatorWorkspaceCommands,
    identityCommands: createIdentityCommands({
      bootstrapSecret,
      database,
    }),
    programCommands,
    studentWorkspaceCommands,
    log,
    openAnswerEvaluatorWorkerTick: openAnswerEvaluatorRuntime.enabled
      ? createSingleFlightOpenAnswerEvaluatorWorkerTick({
          runOpenAnswerEvaluatorWorkerOnce: studentWorkspaceCommands.runOpenAnswerEvaluatorWorkerOnce,
          workerId: "open-answer-evaluator",
          leaseDurationSeconds: 300,
        })
      : null,
    operationsTriggerToken: openAnswerEvaluatorTriggerToken,
    version,
  });
  server.on("close", () => {
    database.close();
  });
  server.listen(Number(port), host);
  return server;
}

function makeOpenAnswerEvaluatorRuntime({ nomosApiKey, nomosBaseUrl, nomosModel }) {
  if (!nomosApiKey || !nomosBaseUrl || !nomosModel) {
    return { enabled: false, evaluatorPolicies: [], providerAdapters: [] };
  }

  const providerAdapterId = "nomos-open-answer-evaluator";
  const outputValidatorPolicyId = "nomos-open-answer-output-validator";
  return {
    enabled: true,
    evaluatorPolicies: [
      makeLlmOpenAnswerEvaluatorPolicy({
        evaluatorPolicyId: "nomos-open-answer-evaluator-policy",
        providerAdapterId,
        outputValidatorPolicyId,
        redactionPolicyId: "nomos-open-answer-redaction",
        retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
        budgetPolicy: { maxProviderCalls: 1, maxInputTokens: 4000, maxOutputTokens: 1000 },
      }),
    ],
    providerAdapters: [
      createNomosOpenAnswerEvaluatorProviderAdapter({
        providerAdapterId,
        baseUrl: nomosBaseUrl,
        model: nomosModel,
        apiKey: nomosApiKey,
        outputValidatorPolicyId,
      }),
    ],
  };
}

function makeDefaultLlmSuggestionPolicy() {
  return {
    suggestionPolicyId: "default-deterministic-policy",
    providerAdapterId: "default-deterministic-provider",
    outputValidatorPolicyId: "default-deterministic-validator",
    redactionPolicyId: "default-redaction",
    allowedSuggestionKinds: ["navigation_candidate"],
    promptInputPolicy: {
      includeAcceptedNavigationContext: true,
      includeAcceptedCheckContext: true,
      includeReadinessContext: true,
      includeCoverageGapContext: true,
      includeStudentWorkspaceState: false,
    },
    budgetPolicy: { maxProviderCalls: 1, maxInputTokens: 4000, maxOutputTokens: 800 },
    rawArtifactPolicy: "none",
  };
}

function makeDefaultLlmSuggestionProviderAdapter() {
  return {
    providerAdapterId: "default-deterministic-provider",
    suggest: () => ({
      suggestions: [
        {
          suggestionKind: "navigation_candidate",
          title: "Draft topic suggestion",
          summary: "Create one draft topic candidate for curator review.",
          rationale: "The redacted accepted program context leaves room for one curator-reviewed topic draft.",
          suggestedDraft: {
            candidateKind: "navigation_candidate",
            request: {
              candidateKind: "topic",
              title: "Draft topic suggestion",
              body: "Draft topic suggestion body",
              sourceIds: [],
              rationale: "Draft candidate rationale",
            },
          },
          supportingEvidence: [
            {
              sourceKind: "curator_instruction",
              sourceId: "curator-instruction",
              label: "Curator instruction",
            },
          ],
        },
      ],
      outputValidation: {
        validatorPolicyId: "default-deterministic-validator",
        passed: true,
      },
      providerUsage: { providerCalls: 1, inputTokens: 120, outputTokens: 80 },
    }),
  };
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

function sendJson(response, statusCode, body, headers = {}, completionLog = {}) {
  response.agonaraCompletionLog = {
    ...completionLogForBody(statusCode, body),
    ...completionLog,
  };
  response.writeHead(statusCode, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

function sendHtml(response, statusCode, body) {
  response.agonaraCompletionLog = completionLogForBody(statusCode, null);
  response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

function completionLogForBody(statusCode, body) {
  if (body?.status === "fault" || statusCode >= 500) {
    return {
      severity: "error",
      outcome: "fault",
      errorKind: "unexpected",
    };
  }
  if (body?.status === "rejected" || statusCode >= 400) {
    return {
      severity: "warning",
      outcome: "rejected",
      reason: body?.reason ?? "http_error",
    };
  }
  return {
    severity: "info",
    outcome: "accepted",
  };
}

function auditCompletionLog(identityCommands, actingSessionId) {
  const result = identityCommands.listAuditEvents({ actingSessionId });
  if (result.status === "rejected") {
    return {};
  }

  const auditEvent = result.value.auditEvents.at(-1);
  return auditEvent ? { auditEventId: auditEvent.id } : {};
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

function requireMutationSession({ csrfTokens, identityCommands, request, response }) {
  const session = resolveHttpSession({ identityCommands, request });
  if (session.status === "rejected") {
    sendJson(response, httpStatusFor(session.reason), session);
    return null;
  }
  const csrf = requireCsrf(request, csrfTokens);
  if (csrf.status === "rejected") {
    sendJson(response, httpStatusFor(csrf.reason), csrf);
    return null;
  }
  return session;
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

async function readRouteBody(request, allowedKeys) {
  const body = await readRequiredJsonObject(request);
  if (body.status === "rejected") {
    return body;
  }
  const keys = Object.keys(body.value);
  if (
    keys.length !== allowedKeys.length ||
    keys.some(key => !allowedKeys.includes(key)) ||
    allowedKeys.some(key => typeof body.value[key] !== "string" || !body.value[key].trim())
  ) {
    return rejected("validation_failed");
  }
  return body;
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

async function readAcceptanceBody(request) {
  const body = await readJsonBody(request);
  if (body.status === "rejected") {
    return body;
  }
  if (body.value.kind === "missing") {
    return accepted({});
  }
  if (body.value.kind !== "object") {
    return rejected("validation_failed");
  }
  if (Object.keys(body.value.body).some($0 => $0 !== "targetEntityId")) {
    return rejected("validation_failed");
  }
  if (
    body.value.body.targetEntityId !== undefined &&
    (
      typeof body.value.body.targetEntityId !== "string" ||
      !body.value.body.targetEntityId.trim()
    )
  ) {
    return rejected("validation_failed");
  }
  return accepted({ targetEntityId: body.value.body.targetEntityId });
}

async function readRejectionBody(request) {
  const body = await readJsonBody(request);
  if (body.status === "rejected") {
    return body;
  }
  if (body.value.kind === "missing") {
    return accepted({});
  }
  if (body.value.kind === "object" && Object.keys(body.value.body).length === 0) {
    return accepted({});
  }
  return rejected("validation_failed");
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

function mapAuditEventsResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.auditEvents,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    auditEvents: page.value.items.map(({ targetSessionId, ...auditEvent }) => auditEvent),
    nextCursor: page.value.nextCursor,
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

function mapProgramAdmissionPolicyResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ program: result.value.programShell });
}

function mapProgramInvitationResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ invitation: result.value.programInvitation });
}

function mapProgramInvitationsResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ invitations: result.value.programInvitations });
}

function mapProgramInvitationAcceptanceResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({
    invitation: result.value.programInvitation,
    membership: result.value.programMembership,
  });
}

function mapProgramParticipantsResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ participants: result.value.programParticipants });
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

function mapNavigationCandidateResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ navigationCandidate: result.value.navigationCandidate });
}

function mapNavigationChangeResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ navigationChange: result.value.navigationChange });
}

function mapProgramNavigationResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ navigation: result.value.navigation });
}

function mapNavigationEntityResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ navigationNode: result.value.navigationNode });
}

function mapNavigationRevisionResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ navigationRevision: result.value.navigationRevision });
}

function mapAssessmentCriterionCandidateResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ assessmentCriterionCandidate: result.value.assessmentCriterionCandidate });
}

function mapOpenAnswerCheckCandidateResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ openAnswerCheckCandidate: result.value.openAnswerCheckCandidate });
}

function mapQuickCheckCandidateResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ quickCheckCandidate: result.value.quickCheckCandidate });
}

function mapReadinessCheckCandidateResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ readinessCheckCandidate: result.value.readinessCheckCandidate });
}

function mapQuickCheckAttemptResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ quickCheckAttempt: result.value.quickCheckAttempt });
}

function mapReadinessCheckAttemptResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ readinessCheckAttempt: result.value.readinessCheckAttempt });
}

function mapQuickCheckAttemptDetailResult(result) {
  if (result.status === "rejected") {
    return result.reason === "participation_required"
      ? rejected("attempt_not_found")
      : result;
  }

  return accepted({ quickCheckAttempt: result.value.quickCheckAttempt });
}

function mapReadinessCheckAttemptDetailResult(result) {
  if (result.status === "rejected") {
    return result.reason === "participation_required"
      ? rejected("attempt_not_found")
      : result;
  }

  return accepted({ readinessCheckAttempt: result.value.readinessCheckAttempt });
}

function mapAcceptedQuickCheckResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ acceptedQuickCheck: result.value.acceptedQuickCheck });
}

function mapAcceptedReadinessCheckResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ acceptedReadinessCheck: result.value.acceptedReadinessCheck });
}

function mapQuickCheckDeliveryResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ quickCheckDelivery: result.value.quickCheckDelivery });
}

function mapAcceptedCorpusResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ acceptedCorpus: result.value.acceptedCorpus });
}

function mapAcceptedAssessmentCriterionResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ acceptedAssessmentCriterion: result.value.acceptedAssessmentCriterion });
}

function mapAcceptedOpenAnswerCheckResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ acceptedOpenAnswerCheck: result.value.acceptedOpenAnswerCheck });
}

function mapLearnerStateTargetLinkResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ learnerStateTargetLink: result.value.learnerEvidenceTargetLink });
}

function mapLearnerStateTargetLinkListResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ learnerStateTargetLinks: result.value.learnerEvidenceTargetLinks });
}

function mapLearnerStateProgramResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ learnerState: result.value.learnerState });
}

function mapLearnerStateTargetResult(result) {
  if (result.status === "rejected") {
    return result;
  }

  return accepted({ learnerStateTarget: result.value.learnerStateTarget });
}

function mapCoverageGapReportResult(result) {
  if (result.status === "rejected") {
    if (result.reason === "coverage_gap_scope_program_mismatch") {
      return rejected("coverage_gap_scope_not_found");
    }
    return result;
  }

  return accepted({ report: result.value.report });
}

function mapCorpusEventListResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.corpusEvents,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    corpusEvents: page.value.items,
    nextCursor: page.value.nextCursor,
  });
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
    policyPath: event.policyPath,
    resultingStatus: event.resultingStatus,
    invitationStatus: event.invitationStatus,
    occurredAt: event.occurredAt,
    outcome: event.outcome,
    reason: event.reason,
  };
}

function parseCoverageGapFilters(request) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const scopeKind = parseOptionalQueryText(url.searchParams.get("scopeKind"));
  if (scopeKind.status === "rejected") {
    return scopeKind;
  }
  const scopeId = parseOptionalQueryText(url.searchParams.get("scopeId"));
  if (scopeId.status === "rejected") {
    return scopeId;
  }
  const minimumSeverity = parseOptionalQueryText(url.searchParams.get("minimumSeverity"));
  if (minimumSeverity.status === "rejected") {
    return minimumSeverity;
  }
  const gapKinds = [];
  for (const gapKind of url.searchParams.getAll("gapKind")) {
    if (!gapKind.trim()) {
      return rejected("validation_failed");
    }
    gapKinds.push(gapKind);
  }

  return accepted({
    gapKinds,
    minimumSeverity: minimumSeverity.value,
    scopeId: scopeId.value,
    scopeKind: scopeKind.value,
  });
}

function parseOptionalQueryText(value) {
  if (value === null) {
    return accepted(undefined);
  }
  if (!value.trim()) {
    return rejected("validation_failed");
  }
  return accepted(value);
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

function parseAcceptedKind(request) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const acceptedKind = url.searchParams.get("acceptedKind");
  if (acceptedKind === null) {
    return accepted(null);
  }
  if (acceptedKind === "topic" || acceptedKind === "concept") {
    return accepted(acceptedKind);
  }
  return rejected("validation_failed");
}

function parseAttemptIdempotencyKey(request) {
  const header = request.headers["x-agonara-idempotency-key"];
  if (typeof header !== "string") {
    return rejected("validation_failed");
  }

  const idempotencyKey = header.trim();
  if (!idempotencyKey || idempotencyKey.length > 255) {
    return rejected("validation_failed");
  }

  return accepted(idempotencyKey);
}

function parseOpenAnswerAttemptListFilters(request) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const status = url.searchParams.get("status");
  if (
    status !== null &&
    status !== "submitted" &&
    status !== "evaluating" &&
    status !== "evaluated" &&
    status !== "evaluation_failed"
  ) {
    return rejected("validation_failed");
  }

  const checkRevisionId = url.searchParams.get("checkRevisionId");
  if (checkRevisionId !== null && !isNonEmptyRequestText(checkRevisionId)) {
    return rejected("validation_failed");
  }

  return accepted({
    checkRevisionId: checkRevisionId ?? undefined,
    status: status ?? undefined,
  });
}

function parseQuickCheckAttemptListFilters(request) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const checkRevisionId = url.searchParams.get("checkRevisionId");
  if (checkRevisionId !== null && !isNonEmptyRequestText(checkRevisionId)) {
    return rejected("validation_failed");
  }

  return accepted({ checkRevisionId: checkRevisionId ?? undefined });
}

function parseReadinessCheckAttemptListFilters(request) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const readinessCheckRevisionId = url.searchParams.get("readinessCheckRevisionId");
  if (readinessCheckRevisionId !== null && !isNonEmptyRequestText(readinessCheckRevisionId)) {
    return rejected("validation_failed");
  }

  return accepted({ readinessCheckRevisionId: readinessCheckRevisionId ?? undefined });
}

function parseLlmSuggestionListQuery(request) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const status = url.searchParams.get("status");
  const suggestionKind = url.searchParams.get("suggestionKind");
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor");
  if (
    (status !== null && !["draft_suggestion", "materialized", "rejected"].includes(status)) ||
    (suggestionKind !== null &&
      ![
        "assessment_criterion_candidate",
        "navigation_candidate",
        "open_answer_check_candidate",
        "quick_check_candidate",
        "readiness_check_candidate",
      ].includes(suggestionKind)) ||
    (cursor !== null && !isNonEmptyRequestText(cursor))
  ) {
    return rejected("validation_failed");
  }

  const parsedLimit = limit === null ? undefined : Number(limit);
  if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50)) {
    return rejected("validation_failed");
  }

  return accepted({
    cursor: cursor ?? undefined,
    limit: parsedLimit,
    status: status ?? undefined,
    suggestionKind: suggestionKind ?? undefined,
  });
}

function parseLlmSuggestionGenerationBody(body) {
  if (
    !hasOnlyKeys(body, [
      "allowedSuggestionKinds",
      "contextEntityIds",
      "coverageGapIds",
      "curatorInstruction",
      "idempotencyKey",
      "maxSuggestions",
      "suggestionPolicyId",
    ]) ||
    !isNonEmptyRequestText(body.suggestionPolicyId) ||
    !isNonEmptyRequestText(body.idempotencyKey) ||
    !Number.isInteger(body.maxSuggestions)
  ) {
    return rejected("validation_failed");
  }

  if (
    (body.curatorInstruction !== undefined && typeof body.curatorInstruction !== "string") ||
    (body.coverageGapIds !== undefined && !isValidRequestTextArray(body.coverageGapIds)) ||
    (body.contextEntityIds !== undefined && !isValidRequestTextArray(body.contextEntityIds)) ||
    (body.allowedSuggestionKinds !== undefined && !isValidRequestTextArray(body.allowedSuggestionKinds))
  ) {
    return rejected("validation_failed");
  }

  return accepted({
    allowedSuggestionKinds: body.allowedSuggestionKinds,
    contextEntityIds: body.contextEntityIds,
    coverageGapIds: body.coverageGapIds,
    curatorInstruction: body.curatorInstruction,
    idempotencyKey: body.idempotencyKey,
    maxSuggestions: body.maxSuggestions,
    suggestionPolicyId: body.suggestionPolicyId,
  });
}

async function readEmptyJsonObjectBody(request) {
  const body = await readRequiredJsonObject(request);
  if (body.status === "rejected") {
    return body;
  }
  if (Object.keys(body.value).length !== 0) {
    return rejected("validation_failed");
  }
  return accepted({});
}

function parseSubmitOpenAnswerAttemptBody(body) {
  if (
    Object.keys(body).length !== 2 ||
    !hasOnlyKeys(body, ["checkRevisionId", "submittedAnswer"]) ||
    !isNonEmptyRequestText(body.checkRevisionId) ||
    !isNonEmptyRequestText(body.submittedAnswer)
  ) {
    return rejected("validation_failed");
  }

  return accepted({
    checkRevisionId: body.checkRevisionId,
    submittedAnswer: body.submittedAnswer,
  });
}

function parseSubmitQuickCheckAttemptBody(body) {
  if (
    Object.keys(body).length !== 2 ||
    !hasOnlyKeys(body, ["checkRevisionId", "selectedOptionId"]) ||
    !isNonEmptyRequestText(body.checkRevisionId) ||
    !isNonEmptyRequestText(body.selectedOptionId)
  ) {
    return rejected("validation_failed");
  }

  return accepted({
    checkRevisionId: body.checkRevisionId,
    selectedOptionId: body.selectedOptionId,
  });
}

function parseSubmitReadinessCheckAttemptBody(body) {
  if (
    Object.keys(body).length !== 1 ||
    !hasOnlyKeys(body, ["readinessCheckRevisionId"]) ||
    !isNonEmptyRequestText(body.readinessCheckRevisionId)
  ) {
    return rejected("validation_failed");
  }

  return accepted({ readinessCheckRevisionId: body.readinessCheckRevisionId });
}

function isNonEmptyRequestText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidCandidateSourceIds(sourceIds) {
  return sourceIds === undefined ||
    (Array.isArray(sourceIds) && sourceIds.every($0 => typeof $0 === "string"));
}

function isValidNavigationCandidateBody(body) {
  return hasOnlyKeys(body, [
    "body",
    "candidateKind",
    "citation",
    "locator",
    "materialReferenceKind",
    "rationale",
    "relationshipDrafts",
    "sourceIds",
    "title",
  ]) &&
    isValidCandidateSourceIds(body.sourceIds) &&
    isValidNavigationRelationshipDrafts(body.relationshipDrafts);
}

function isValidNavigationRelationshipDrafts(relationshipDrafts) {
  return relationshipDrafts === undefined ||
    (
      Array.isArray(relationshipDrafts) &&
      relationshipDrafts.every($0 =>
        typeof $0 === "object" &&
        $0 !== null &&
        !Array.isArray($0) &&
        hasOnlyKeys($0, [
          "fromCandidateRef",
          "fromEntityId",
          "label",
          "rationale",
          "relationshipKind",
          "sourceIds",
          "toCandidateRef",
          "toEntityId",
        ]) &&
        ($0.fromCandidateRef === undefined || $0.fromCandidateRef === "self") &&
        ($0.toCandidateRef === undefined || $0.toCandidateRef === "self") &&
        ($0.relationshipKind === undefined || typeof $0.relationshipKind === "string") &&
        ($0.fromEntityId === undefined || typeof $0.fromEntityId === "string") &&
        ($0.toEntityId === undefined || typeof $0.toEntityId === "string") &&
        ($0.label === undefined || typeof $0.label === "string") &&
        ($0.rationale === undefined || typeof $0.rationale === "string") &&
        isValidCandidateSourceIds($0.sourceIds),
      )
    );
}

function isValidAssessmentCriterionCandidateBody(body) {
  return hasOnlyKeys(body, ["body", "rationale", "sourceIds", "title"]) &&
    isValidCandidateSourceIds(body.sourceIds);
}

function isValidOpenAnswerCheckCandidateBody(body) {
  return hasOnlyKeys(body, [
    "checkKind",
    "criterionEntityIds",
    "prompt",
    "rationale",
    "sourceIds",
    "title",
  ]) &&
    isValidCandidateSourceIds(body.sourceIds) &&
    Array.isArray(body.criterionEntityIds) &&
    body.criterionEntityIds.length > 0 &&
    body.criterionEntityIds.every($0 => typeof $0 === "string");
}

function isValidQuickCheckCandidateBody(body) {
  return hasOnlyKeys(body, [
    "answerKeyOptionIndex",
    "checkKind",
    "options",
    "prompt",
    "rationale",
    "sourceIds",
    "title",
  ]) &&
    body.checkKind === "single_select_quick_check" &&
    isNonEmptyRequestText(body.title) &&
    isNonEmptyRequestText(body.prompt) &&
    (body.rationale === undefined || typeof body.rationale === "string") &&
    isValidCandidateSourceIds(body.sourceIds) &&
    Array.isArray(body.options) &&
    body.options.length >= 2 &&
    body.options.every(isNonEmptyRequestText) &&
    Number.isInteger(body.answerKeyOptionIndex) &&
    body.answerKeyOptionIndex >= 0 &&
    body.answerKeyOptionIndex < body.options.length;
}

function isValidReadinessCheckCandidateBody(body) {
  return hasOnlyKeys(body, [
    "rationale",
    "requirements",
    "scope",
    "sourceIds",
    "title",
  ]) &&
    isNonEmptyRequestText(body.title) &&
    (body.rationale === undefined || typeof body.rationale === "string") &&
    isValidCandidateSourceIds(body.sourceIds) &&
    isValidReadinessScopeBody(body.scope) &&
    Array.isArray(body.requirements) &&
    body.requirements.length > 0 &&
    body.requirements.every(isValidReadinessRequirementBody);
}

function isValidReadinessScopeBody(scope) {
  if (scope?.scopeKind === "topic") {
    return hasOnlyKeys(scope, ["scopeKind", "topicEntityId"]) &&
      isNonEmptyRequestText(scope.topicEntityId);
  }
  if (scope?.scopeKind === "period") {
    return hasOnlyKeys(scope, ["scopeKind", "title", "topicEntityIds"]) &&
      isNonEmptyRequestText(scope.title) &&
      Array.isArray(scope.topicEntityIds) &&
      scope.topicEntityIds.length > 0 &&
      scope.topicEntityIds.every(isNonEmptyRequestText);
  }
  return false;
}

function isValidReadinessRequirementBody(requirement) {
  return requirement !== null &&
    typeof requirement === "object" &&
    !Array.isArray(requirement) &&
    hasOnlyKeys(requirement, ["requiredLevel", "targetId", "targetKind"]) &&
    isNonEmptyRequestText(requirement.targetKind) &&
    isNonEmptyRequestText(requirement.targetId) &&
    isNonEmptyRequestText(requirement.requiredLevel);
}

function isValidLearnerStateTargetLinkBody(body) {
  return hasOnlyKeys(body, [
    "evidenceOwnerEntityId",
    "evidenceOwnerKind",
    "targetId",
    "targetKind",
  ]) &&
    isNonEmptyRequestText(body.evidenceOwnerEntityId) &&
    isNonEmptyRequestText(body.evidenceOwnerKind) &&
    isNonEmptyRequestText(body.targetId) &&
    isNonEmptyRequestText(body.targetKind);
}

function hasOnlyKeys(body, allowedKeys) {
  return Object.keys(body).every($0 => allowedKeys.includes($0));
}

function isValidRequestTextArray(value) {
  return Array.isArray(value) && value.every(isNonEmptyRequestText);
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

function mapNavigationCandidateListResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.navigationCandidates,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    navigationCandidates: page.value.items,
    nextCursor: page.value.nextCursor,
  });
}

function mapAssessmentCriterionCandidateListResult({
  generateToken,
  listCursors,
  query,
  result,
  routeKey,
}) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.assessmentCriterionCandidates,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    assessmentCriterionCandidates: page.value.items,
    nextCursor: page.value.nextCursor,
  });
}

function mapOpenAnswerCheckCandidateListResult({
  generateToken,
  listCursors,
  query,
  result,
  routeKey,
}) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.openAnswerCheckCandidates,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    openAnswerCheckCandidates: page.value.items,
    nextCursor: page.value.nextCursor,
  });
}

function mapQuickCheckCandidateListResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.quickCheckCandidates,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    quickCheckCandidates: page.value.items,
    nextCursor: page.value.nextCursor,
  });
}

function mapReadinessCheckCandidateListResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.readinessCheckCandidates,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    readinessCheckCandidates: page.value.items,
    nextCursor: page.value.nextCursor,
  });
}

function mapQuickCheckDeliveryListResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.quickCheckDeliveries,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    quickCheckDeliveries: page.value.items,
    nextCursor: page.value.nextCursor,
  });
}

function mapReadinessCheckDeliveryListResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.readinessChecks,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    readinessChecks: page.value.items,
    nextCursor: page.value.nextCursor,
  });
}

function mapAcceptedCorpusListResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.acceptedCorpus,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    acceptedCorpus: page.value.items,
    nextCursor: page.value.nextCursor,
  });
}

function mapAcceptedAssessmentCriteriaListResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.acceptedAssessmentCriteria,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    acceptedAssessmentCriteria: page.value.items,
    nextCursor: page.value.nextCursor,
  });
}

function mapAcceptedOpenAnswerCheckListResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.acceptedOpenAnswerChecks,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    acceptedOpenAnswerChecks: page.value.items,
    nextCursor: page.value.nextCursor,
  });
}

function mapOpenAnswerAttemptListResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.attempts,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    attempts: page.value.items,
    nextCursor: page.value.nextCursor,
  });
}

function mapQuickCheckAttemptListResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.quickCheckAttempts,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    quickCheckAttempts: page.value.items,
    nextCursor: page.value.nextCursor,
  });
}

function mapReadinessCheckAttemptListResult({ generateToken, listCursors, query, result, routeKey }) {
  if (result.status === "rejected") {
    return result;
  }

  const page = paginateList({
    generateToken,
    items: result.value.readinessCheckAttempts,
    limit: query.limit,
    listCursors,
    offset: query.offset,
    routeKey,
  });
  if (page.status === "rejected") {
    return page;
  }

  return accepted({
    readinessCheckAttempts: page.value.items,
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

function parseContentQuery(request) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const limitRaw = url.searchParams.get("limit");
  return {
    limit: limitRaw === null ? undefined : Number(limitRaw),
    cursor: url.searchParams.get("cursor") ?? undefined,
  };
}

function mapContentPageResult(result) {
  if (result.status === "rejected") {
    return result;
  }
  const { content, contentFormat, byteSize, nextCursor } = result.value;
  const page = { content, contentFormat, byteSize };
  if (nextCursor !== undefined) {
    page.nextCursor = nextCursor;
  }
  return accepted(page);
}

function httpStatusFor(reason) {
  switch (reason) {
    case "validation_failed":
    case "unsupported_participation_kind":
    case "content_too_large":
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
    case "identity_not_active":
    case "participation_required":
    case "program_curator_required":
      return 403;
    case "identity_not_found":
    case "accepted_entity_not_found":
    case "attempt_not_found":
    case "candidate_not_found":
    case "check_candidate_not_found":
    case "check_entity_not_found":
    case "check_revision_not_found":
    case "criterion_candidate_not_found":
    case "criterion_entity_not_found":
    case "criterion_revision_not_found":
    case "navigation_entity_not_found":
    case "navigation_revision_not_found":
    case "content_not_found":
    case "accepted_revision_not_found":
    case "invitation_not_found":
    case "not_found":
    case "program_not_found":
    case "quick_check_candidate_not_found":
    case "quick_check_entity_not_found":
    case "quick_check_revision_not_found":
    case "learner_state_evidence_owner_not_found":
    case "learner_state_target_link_not_found":
    case "learner_state_target_not_found":
    case "coverage_gap_not_found":
    case "coverage_gap_scope_not_found":
    case "llm_curation_suggestion_not_found":
    case "provider_adapter_not_found":
    case "suggestion_policy_not_found":
    case "readiness_candidate_not_found":
    case "readiness_entity_not_found":
    case "readiness_requirement_target_not_found":
    case "readiness_revision_not_found":
    case "readiness_scope_not_found":
    case "revision_not_found":
    case "selected_option_not_found":
    case "target_identity_not_found":
      return 404;
    case "accepted_entity_program_mismatch":
    case "accepted_kind_mismatch":
    case "bootstrap_already_completed":
    case "material_content_already_set":
    case "candidate_already_accepted":
    case "candidate_already_rejected":
    case "check_candidate_already_accepted":
    case "check_candidate_already_rejected":
    case "check_entity_program_mismatch":
    case "check_revision_program_mismatch":
    case "criterion_candidate_already_accepted":
    case "criterion_candidate_already_rejected":
    case "criterion_entity_program_mismatch":
    case "entity_withdrawal_blocked":
    case "coverage_gap_scope_program_mismatch":
    case "idempotency_conflict":
    case "identity_already_has_credential":
    case "invitation_conflict":
    case "invitation_not_pending":
    case "learner_state_evidence_owner_program_mismatch":
    case "learner_state_target_program_mismatch":
    case "last_admin_removal":
    case "last_curator_required":
    case "login_already_bound":
    case "membership_already_active":
    case "membership_left":
    case "membership_missing":
    case "membership_removed":
    case "navigation_prerequisite_cycle":
    case "navigation_relationship_endpoint_kind_mismatch":
    case "navigation_relationship_program_mismatch":
    case "navigation_relationship_self_reference":
    case "program_creation_incomplete":
    case "quick_check_candidate_already_accepted":
    case "quick_check_candidate_already_rejected":
    case "quick_check_entity_program_mismatch":
    case "quick_check_revision_program_mismatch":
    case "readiness_candidate_already_accepted":
    case "readiness_candidate_already_rejected":
    case "readiness_entity_program_mismatch":
    case "readiness_requirement_id_conflict":
    case "readiness_requirement_program_mismatch":
    case "readiness_revision_program_mismatch":
    case "readiness_scope_program_mismatch":
    case "source_not_found":
    case "source_program_mismatch":
    case "source_hard_delete_blocked":
    case "policy_not_satisfied":
    case "llm_curation_suggestion_already_materialized":
    case "llm_curation_suggestion_already_rejected":
    case "provider_budget_exceeded":
    case "provider_execution_failed":
    case "provider_output_rejected":
    case "suggestion_materialization_rejected":
    case "suggestion_rejection_failed":
    case "target_identity_disabled":
    case "worker_already_running":
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
