import { createCorpusCommands } from "../../src/corpus.js";
import { createCuratorWorkspaceCommands } from "../../src/curator-workspace.js";
import { createIdentityCommands } from "../../src/identity.js";
import { createProgramCommands } from "../../src/program.js";
import { createServer } from "../../src/server.js";
import { createStudentWorkspaceCommands } from "../../src/student-workspace.js";
import {
  initializeIdentityStorage,
  openIdentityDatabase,
} from "../../src/storage.js";

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

async function updateAcceptedCorpusStatus(baseUrl, session, entityId, body) {
  return fetch(`${baseUrl}/corpus/${entityId}/status`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "PUT",
  });
}

async function updateQuickCheckStatus(baseUrl, session, entityId, body) {
  return fetch(`${baseUrl}/quick-checks/${entityId}/status`, {
    body: JSON.stringify(body),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "PUT",
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

async function createNavigationCandidate(baseUrl, session, programId, body) {
  return fetch(`${baseUrl}/programs/${programId}/navigation-candidates`, {
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

async function getJson(url, { cookie = null } = {}) {
  return fetchJson(url, {
    headers: cookie ? { cookie } : {},
  });
}

async function postJson(url, body, { cookie = null, csrfToken = null } = {}) {
  return fetchJson(url, {
    body: JSON.stringify(body),
    headers: {
      ...(cookie ? { cookie } : {}),
      "content-type": "application/json",
      ...(csrfToken ? { "x-agonara-csrf": csrfToken } : {}),
    },
    method: "POST",
  });
}

async function deleteJson(url, { cookie = null, csrfToken = null } = {}) {
  return fetchJson(url, {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(csrfToken ? { "x-agonara-csrf": csrfToken } : {}),
    },
    method: "DELETE",
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  return {
    body: await response.json(),
    statusCode: response.status,
  };
}

async function createAcceptedNavigationCandidate(baseUrl, session, programId, body) {
  const { targetEntityId, ...candidateBody } = body;
  const candidate = await createNavigationCandidate(baseUrl, session, programId, candidateBody);
  const candidateId = (await candidate.json()).value.navigationCandidate.candidateId;
  const acceptedResponse = await acceptNavigationCandidate(
    baseUrl,
    session,
    candidateId,
    targetEntityId === undefined ? {} : { targetEntityId },
  );
  return (await acceptedResponse.json()).value.navigationChange.acceptedCorpus;
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

async function acceptNavigationCandidate(baseUrl, session, candidateId, body) {
  return fetch(`${baseUrl}/navigation-candidates/${candidateId}/acceptance`, {
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

function makeHttpLlmSuggestionPolicy({
  allowedSuggestionKinds = ["navigation_candidate"],
  budgetPolicy = { maxProviderCalls: 1, maxInputTokens: 4000, maxOutputTokens: 800 },
  outputValidatorPolicyId = "validator-a",
  providerAdapterId = "provider-a",
  rawArtifactPolicy = "none",
  redactionPolicyId = "redaction-a",
  suggestionPolicyId = "policy-a",
} = {}) {
  return {
    suggestionPolicyId,
    providerAdapterId,
    outputValidatorPolicyId,
    redactionPolicyId,
    allowedSuggestionKinds,
    promptInputPolicy: {
      includeAcceptedNavigationContext: true,
      includeAcceptedCheckContext: true,
      includeReadinessContext: true,
      includeCoverageGapContext: true,
      includeStudentWorkspaceState: false,
    },
    budgetPolicy,
    rawArtifactPolicy,
  };
}

function makeHttpLlmSuggestionProviderAdapter({
  outputValidation = { validatorPolicyId: "validator-a", passed: true },
  providerAdapterId = "provider-a",
  providerUsage = { providerCalls: 1, inputTokens: 120, outputTokens: 80 },
  suggestions = [makeHttpProviderSuggestion()],
  throws = false,
} = {}) {
  return {
    providerAdapterId,
    suggest: () => {
      if (throws) {
        throw new Error(
          "authorization cookie csrf raw prompt raw model provider diagnostics select * stack /tmp/db.sqlite postgres://db",
        );
      }
      return {
        suggestions,
        outputValidation,
        providerUsage,
      };
    },
  };
}

function makeHttpProviderSuggestion({
  suggestionKind = "navigation_candidate",
  title = "Add algebra topic",
  summary = "Create a topic draft for algebra.",
  suggestedDraft = {
    candidateKind: suggestionKind,
    request: {
      body: `${title} body`,
      candidateKind: "topic",
      rationale: "Draft candidate rationale",
      sourceIds: [],
      title,
    },
  },
} = {}) {
  return {
    suggestionKind,
    title,
    summary,
    rationale: "The accepted program has a missing topic evidence path.",
    suggestedDraft,
    supportingEvidence: [
      {
        label: "Curator instruction",
        sourceId: "curator-instruction",
        sourceKind: "curator_instruction",
      },
    ],
  };
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

async function listenWithIdentityProgramCorpusAndCuratorWorkspace({
  ids = defaultIds(),
  llmSuggestionPolicies = [makeHttpLlmSuggestionPolicy()],
  llmSuggestionProviderAdapters = [makeHttpLlmSuggestionProviderAdapter()],
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
  const corpusCommands = createCorpusCommands({
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
    corpusCommands,
    curatorWorkspaceCommands: createCuratorWorkspaceCommands({
      corpusCommands,
      database,
      getEffectiveParticipation: programCommands.getEffectiveParticipation,
      llmSuggestionPolicies,
      llmSuggestionProviderAdapters,
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

function navigationSummaryProjection(body, statusCode) {
  return {
    statusCode,
    topics: body.value?.navigation?.topics.map($0 => $0.title) ?? [],
    ungroupedConcepts: body.value?.navigation?.ungroupedConcepts.map($0 => $0.title) ?? [],
    ungroupedMaterials: body.value?.navigation?.ungroupedMaterials.map($0 => $0.title) ?? [],
  };
}

function navigationNodeProjection(body, statusCode) {
  return {
    incomingKinds: body.value?.navigationNode?.relationships.incoming.map($0 => $0.relationshipKind) ?? [],
    outgoingKinds: body.value?.navigationNode?.relationships.outgoing.map($0 => $0.relationshipKind) ?? [],
    statusCode,
    title: body.value?.navigationNode?.title,
  };
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

export {
  acceptAssessmentCriterionCandidate,
  acceptCorpusCandidate,
  acceptNavigationCandidate,
  acceptOpenAnswerCheckCandidate,
  acceptQuickCheckCandidate,
  acceptedOpenAnswerCheckProjection,
  bootstrapAdmin,
  close,
  createAcceptedNavigationCandidate,
  createAcceptedOpenAnswerCheck,
  createAcceptedQuickCheck,
  createAssessmentCriterionCandidate,
  createCorpusCandidate,
  createIdentitySession,
  createNavigationCandidate,
  createOpenAnswerCheckCandidate,
  createProgram,
  createProgramSource,
  createQuickCheckCandidate,
  createStudentAttemptApiScenario,
  defaultIds,
  deleteJson,
  fetchJson,
  getHttpResponse,
  getJson,
  hasAttemptDetailLeak,
  hasSensitiveCompletionLogDetail,
  joinStudentProgram,
  listOpenAnswerAttempts,
  listen,
  listenWithIdentity,
  listenWithIdentityAndProgram,
  listenWithIdentityProgramAndCorpus,
  listenWithIdentityProgramCorpusAndCuratorWorkspace,
  listenWithIdentityProgramCorpusAndStudentWorkspace,
  makeHttpLlmSuggestionPolicy,
  makeHttpLlmSuggestionProviderAdapter,
  makeHttpProviderSuggestion,
  makeIdGenerator,
  manyIds,
  navigationNodeProjection,
  navigationSummaryProjection,
  openAnswerAttemptEvaluationProjection,
  openAnswerAttemptListProjection,
  openAnswerAttemptResponseProjection,
  postJson,
  rejectCorpusCandidate,
  submitOpenAnswerAttempt,
  submitOpenAnswerAttemptAndRead,
  submitQuickCheckAttempt,
  updateAcceptedCorpusStatus,
  updateQuickCheckStatus,
};
