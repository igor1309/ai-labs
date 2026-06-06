#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createProgramCommands } from "../src/program.js";
import { openIdentityDatabase, initializeIdentityStorage } from "../src/storage.js";
import { createStudentWorkspaceCommands } from "../src/student-workspace.js";

const defaultEvaluatorPolicyId = "nomos-open-answer-evaluator-policy";

export async function runOpenAnswerEvaluatorSmoke({
  adminLogin,
  adminPassword,
  baseUrl,
  bootstrapSecret,
  databasePath,
  evaluatorPolicyId = defaultEvaluatorPolicyId,
  fetchImpl = globalThis.fetch,
  triggerToken,
  uniqueSuffix = randomUUID().slice(0, 8),
} = {}) {
  assertNonEmptyString(baseUrl, "baseUrl");
  assertNonEmptyString(adminLogin, "adminLogin");
  assertNonEmptyString(adminPassword, "adminPassword");
  assertNonEmptyString(databasePath, "databasePath");
  assertNonEmptyString(triggerToken, "triggerToken");

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const health = await getJson(fetchImpl, `${normalizedBaseUrl}/operations/health`);
  if (health.statusCode !== 200 || health.body.status !== "ok") {
    throw new Error("health_check_failed");
  }

  const admin = await loginOrBootstrapAdmin({
    adminLogin,
    adminPassword,
    baseUrl: normalizedBaseUrl,
    bootstrapSecret,
    fetchImpl,
  });
  const curator = await createIdentitySession(fetchImpl, normalizedBaseUrl, admin, {
    displayName: `Smoke Curator ${uniqueSuffix}`,
    login: `smoke-curator-${uniqueSuffix}@agonara.invalid`,
    password: `smoke-curator-${uniqueSuffix}-password`,
  });
  const student = await createIdentitySession(fetchImpl, normalizedBaseUrl, admin, {
    displayName: `Smoke Student ${uniqueSuffix}`,
    login: `smoke-student-${uniqueSuffix}@agonara.invalid`,
    password: `smoke-student-${uniqueSuffix}-password`,
  });
  const createdProgram = await postJson(fetchImpl, `${normalizedBaseUrl}/programs`, {
    title: `Evaluator smoke ${uniqueSuffix}`,
  }, curator);
  const programId = createdProgram.body.value.program.programId;
  await postJson(fetchImpl, `${normalizedBaseUrl}/programs/${programId}/student-membership`, null, student);
  const acceptedCheck = await createAcceptedOpenAnswerCheck({
    baseUrl: normalizedBaseUrl,
    fetchImpl,
    programId,
    session: curator,
    uniqueSuffix,
  });
  const submitted = await postJson(fetchImpl, `${normalizedBaseUrl}/programs/${programId}/open-answer-attempts`, {
    checkRevisionId: acceptedCheck.revisionId,
    submittedAnswer: "Closure matters because a vector-space operation must stay inside the same set.",
  }, student, {
    "x-agonara-idempotency-key": `smoke-attempt-${uniqueSuffix}`,
  });
  const attemptId = submitted.body.value.attempt.attemptId;
  const scheduled = scheduleEvaluatorJob({
    attemptId,
    databasePath,
    evaluatorPolicyId,
    requestedByIdentityId: curator.identityId,
  });
  assertAccepted(scheduled, "schedule_evaluator_job_failed");

  const evaluatorJobId = scheduled.value.evaluatorJob.evaluatorJobId;
  const tick = await postJson(fetchImpl, `${normalizedBaseUrl}/operations/open-answer-evaluator/tick`, {
    evaluatorJobId,
  }, {
    bearerToken: triggerToken,
  });
  if (
    tick.statusCode !== 200 ||
    tick.body.status !== "accepted" ||
    tick.body.value?.summary?.claimed !== true ||
    tick.body.value?.summary?.completed !== true
  ) {
    throw new Error(`evaluator_tick_failed:${JSON.stringify(projectRejectedBody(tick.body))}`);
  }

  const detail = await getJson(fetchImpl, `${normalizedBaseUrl}/open-answer-attempts/${attemptId}`, student);
  if (
    detail.statusCode !== 200 ||
    detail.body.status !== "accepted" ||
    detail.body.value?.attempt?.status !== "evaluated" ||
    detail.body.value?.evaluation?.summaryFeedback === undefined
  ) {
    throw new Error("evaluation_detail_failed");
  }

  return {
    attemptId,
    evaluatorJobId,
    evaluationId: detail.body.value.evaluation.evaluationId,
    healthVersion: health.body.version,
    programId,
    tickSummary: tick.body.value.summary,
  };
}

function scheduleEvaluatorJob({ attemptId, databasePath, evaluatorPolicyId, requestedByIdentityId }) {
  const database = openIdentityDatabase(databasePath);
  try {
    initializeIdentityStorage(database);
    const programCommands = createProgramCommands({ database });
    const studentWorkspaceCommands = createStudentWorkspaceCommands({
      database,
      getEffectiveParticipation: programCommands.getEffectiveParticipation,
    });
    return studentWorkspaceCommands.scheduleOpenAnswerEvaluatorJob({
      attemptId,
      evaluatorPathKind: "llm_assisted",
      evaluatorPolicyId,
      requestedByIdentityId,
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      budgetPolicy: { maxProviderCalls: 1, maxInputTokens: 4000, maxOutputTokens: 2000 },
    });
  } finally {
    database.close();
  }
}

async function loginOrBootstrapAdmin({ adminLogin, adminPassword, baseUrl, bootstrapSecret, fetchImpl }) {
  const login = await postJson(fetchImpl, `${baseUrl}/identity/sessions`, {
    login: adminLogin,
    password: adminPassword,
  }, null, {}, { allowRejected: true });
  if (login.statusCode === 200 && login.body.status === "accepted") {
    return sessionFromResponse(login);
  }
  assertNonEmptyString(bootstrapSecret, "bootstrapSecret");

  const bootstrap = await postJson(fetchImpl, `${baseUrl}/identity/bootstrap/admin`, {
    bootstrapSecret,
    displayName: "Agonara Smoke Admin",
    login: adminLogin,
    password: adminPassword,
  });
  if (bootstrap.statusCode === 200 && bootstrap.body.status === "accepted") {
    return sessionFromResponse(bootstrap);
  }

  throw new Error(`admin_access_failed:${JSON.stringify(projectRejectedBody(bootstrap.body))}`);
}

async function createIdentitySession(fetchImpl, baseUrl, admin, { displayName, login, password }) {
  const created = await postJson(fetchImpl, `${baseUrl}/identity/identities`, { displayName }, admin);
  const identityId = created.body.value.id;
  await postJson(fetchImpl, `${baseUrl}/identity/identities/${identityId}/local-password`, {
    login,
    password,
  }, admin);
  const session = await postJson(fetchImpl, `${baseUrl}/identity/sessions`, { login, password });
  return { ...sessionFromResponse(session), identityId };
}

async function createAcceptedOpenAnswerCheck({ baseUrl, fetchImpl, programId, session, uniqueSuffix }) {
  const criterionCandidate = await postJson(fetchImpl, `${baseUrl}/programs/${programId}/assessment-criteria/candidates`, {
    body: "Explain why the answer preserves closure inside the structure.",
    title: `Closure criterion ${uniqueSuffix}`,
  }, session);
  const criterionCandidateId = criterionCandidate.body.value.assessmentCriterionCandidate.candidateId;
  const acceptedCriterion = await postJson(
    fetchImpl,
    `${baseUrl}/assessment-criteria/candidates/${criterionCandidateId}/acceptance`,
    {},
    session,
  );
  const criterionEntityId = acceptedCriterion.body.value.acceptedAssessmentCriterion.entityId;
  const checkCandidate = await postJson(fetchImpl, `${baseUrl}/programs/${programId}/open-answer-checks/candidates`, {
    checkKind: "open_answer",
    criterionEntityIds: [criterionEntityId],
    prompt: "Why does closure matter for a vector space?",
    title: `Closure smoke check ${uniqueSuffix}`,
  }, session);
  const checkCandidateId = checkCandidate.body.value.openAnswerCheckCandidate.candidateId;
  const acceptedCheck = await postJson(
    fetchImpl,
    `${baseUrl}/open-answer-checks/candidates/${checkCandidateId}/acceptance`,
    {},
    session,
  );
  return acceptedCheck.body.value.acceptedOpenAnswerCheck;
}

async function getJson(fetchImpl, url, session = null) {
  return parseJsonResponse(await fetchImpl(url, {
    headers: sessionHeaders(session),
  }));
}

async function postJson(fetchImpl, url, body, session = null, extraHeaders = {}, options = {}) {
  const headers = {
    ...sessionHeaders(session),
    ...extraHeaders,
  };
  if (body !== null) {
    headers["content-type"] = "application/json";
  }
  return parseJsonResponse(await fetchImpl(url, {
    body: body === null ? undefined : JSON.stringify(body),
    headers,
    method: "POST",
  }), options);
}

function sessionHeaders(session) {
  if (!session) {
    return {};
  }
  if (session.bearerToken) {
    return { authorization: `Bearer ${session.bearerToken}` };
  }
  return {
    cookie: session.cookie,
    "x-agonara-csrf": session.csrfToken,
  };
}

async function parseJsonResponse(response, { allowRejected = false } = {}) {
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  const result = {
    body,
    headers: response.headers,
    statusCode: response.status,
  };
  if (!allowRejected && (response.status >= 400 || body?.status === "rejected" || body?.status === "fault")) {
    throw new Error(`http_request_failed:${response.status}:${JSON.stringify(projectRejectedBody(body))}`);
  }
  return result;
}

function sessionFromResponse(response) {
  return {
    body: response.body,
    cookie: response.headers.get("set-cookie").split(";", 1)[0],
    csrfToken: response.body.value.csrfToken,
    identityId: response.body.value.identity.id,
  };
}

function assertAccepted(result, errorName) {
  if (result.status !== "accepted") {
    throw new Error(`${errorName}:${JSON.stringify(projectRejectedBody(result))}`);
  }
}

function projectRejectedBody(body) {
  return {
    reason: body?.reason,
    status: body?.status,
  };
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name}_required`);
  }
}

function loadEnvFileIfPresent() {
  const envFile = process.env.AGONARA_SMOKE_ENV_FILE ?? ".env.staging";
  if (!existsSync(envFile)) {
    return;
  }
  for (const line of readFileSync(envFile, "utf8").split(/\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

async function main() {
  loadEnvFileIfPresent();
  const result = await runOpenAnswerEvaluatorSmoke({
    adminLogin: process.env.AGONARA_SMOKE_ADMIN_LOGIN,
    adminPassword: process.env.AGONARA_SMOKE_ADMIN_PASSWORD,
    baseUrl: process.env.AGONARA_SMOKE_BASE_URL ?? "https://staging.agonara.enoa.ai",
    bootstrapSecret: process.env.AGONARA_BOOTSTRAP_SECRET,
    databasePath: process.env.AGONARA_DB_PATH,
    triggerToken: process.env.AGONARA_OPEN_ANSWER_EVALUATOR_TRIGGER_TOKEN,
  });
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
