import assert from "node:assert/strict";
import test from "node:test";
import {
  listAcceptedAssessmentCriterionEntityRecords,
  listAcceptedCorpusEntityRecords,
  listAcceptedOpenAnswerCheckEntityRecords,
  listAcceptedQuickCheckEntityRecords,
  listLlmCurationSuggestionRecords,
  listQuickCheckCandidateRecords,
} from "../src/storage.js";
import {
  bootstrapAdmin,
  createAcceptedNavigationCandidate,
  createAcceptedQuickCheck,
  createIdentitySession,
  createProgram,
  getJson,
  joinStudentProgram,
  listenWithIdentityProgramCorpusAndCuratorWorkspace,
  makeHttpLlmSuggestionPolicy,
  makeHttpLlmSuggestionProviderAdapter,
  makeHttpProviderSuggestion,
  manyIds,
  postJson,
} from "./support/http-api.js";

test("llmCurationSuggestionsHttp_shouldGenerateReviewAcceptRejectAndRedact_onProgramCuratorSession", async () => {
  const { baseUrl, close, database } = await listenWithIdentityProgramCorpusAndCuratorWorkspace({
    ids: manyIds(180),
    llmSuggestionPolicies: [
      makeHttpLlmSuggestionPolicy({
        allowedSuggestionKinds: ["navigation_candidate", "quick_check_candidate"],
      }),
    ],
    llmSuggestionProviderAdapters: [
      makeHttpLlmSuggestionProviderAdapter({
        suggestions: [
          makeHttpProviderSuggestion({
            suggestionKind: "navigation_candidate",
            title: "Draft LLM topic",
          }),
          makeHttpProviderSuggestion({
            suggestionKind: "quick_check_candidate",
            title: "Draft LLM quick check",
            suggestedDraft: {
              candidateKind: "quick_check_candidate",
              request: {
                answerKeyIndex: 0,
                checkKind: "single_select_quick_check",
                options: ["Closure under addition", "Only finite dimension"],
                prompt: "Which statement is required?",
                rationale: "Draft quick-check rationale",
                sourceIds: [],
                title: "Draft LLM quick check",
              },
            },
          }),
        ],
      }),
    ],
  });

  try {
    const scenario = await createLlmSuggestionHttpScenario(baseUrl);
    const acceptedCountsBefore = projectHttpAcceptedCorpusCounts(database);
    const generated = await postJson(
      `${baseUrl}/programs/${scenario.programId}/llm-curation-suggestions`,
      {
        allowedSuggestionKinds: ["navigation_candidate", "quick_check_candidate"],
        curatorInstruction: "Suggest one topic and one check.",
        idempotencyKey: "llm-http-key",
        maxSuggestions: 2,
        suggestionPolicyId: "policy-a",
      },
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const firstPage = await getJson(
      `${baseUrl}/programs/${scenario.programId}/llm-curation-suggestions?limit=1`,
      { cookie: scenario.curator.cookie },
    );
    const secondPage = await getJson(
      `${baseUrl}/programs/${scenario.programId}/llm-curation-suggestions?cursor=${firstPage.body.value?.nextCursor ?? "cursor-missing"}`,
      { cookie: scenario.curator.cookie },
    );
    const navigationSuggestionId = generated.body.value.suggestions[0].suggestionId;
    const quickCheckSuggestionId = generated.body.value.suggestions[1].suggestionId;
    const detail = await getJson(`${baseUrl}/llm-curation-suggestions/${navigationSuggestionId}`, {
      cookie: scenario.curator.cookie,
    });
    const accepted = await postJson(
      `${baseUrl}/llm-curation-suggestions/${navigationSuggestionId}/acceptance`,
      {},
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const rejected = await postJson(
      `${baseUrl}/llm-curation-suggestions/${quickCheckSuggestionId}/rejection`,
      {},
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const serialized = JSON.stringify([
      generated.body,
      firstPage.body,
      secondPage.body,
      detail.body,
      accepted.body,
      rejected.body,
    ]);

    assert.deepEqual(
      {
        accepted: llmAcceptedSuggestionProjection(accepted),
        acceptedCountsAfter: projectHttpAcceptedCorpusCounts(database),
        acceptedCountsBefore,
        detail: llmSuggestionDetailProjection(detail),
        firstPageHasCursor: typeof firstPage.body.value.nextCursor === "string",
        generated: llmSuggestionListProjection(generated),
        leaks: containsLlmSuggestionHttpLeaks(serialized),
        listedPageStatusCodes: [firstPage.statusCode, secondPage.statusCode],
        listedPageStatuses: [firstPage.body.status, secondPage.body.status],
        listedPageTitles: [
          ...llmSuggestionListProjection(firstPage).suggestions,
          ...llmSuggestionListProjection(secondPage).suggestions,
        ].map($0 => $0[2]).sort(),
        quickCheckDrafts: listQuickCheckCandidateRecords(database)
          .filter($0 => $0.status === "draft")
          .map($0 => $0.title),
        rejected: llmRejectedSuggestionProjection(rejected),
      },
      {
        accepted: {
          candidateKind: "navigation_candidate",
          status: "accepted",
          suggestionStatus: "materialized",
        },
        acceptedCountsAfter: acceptedCountsBefore,
        acceptedCountsBefore,
        detail: {
          containsForbiddenDetail: false,
          status: "accepted",
          statusCode: 200,
          suggestion: ["draft_suggestion", "navigation_candidate", "Draft LLM topic"],
        },
        firstPageHasCursor: true,
        generated: {
          nextCursor: undefined,
          status: "accepted",
          statusCode: 200,
          suggestions: [
            ["draft_suggestion", "navigation_candidate", "Draft LLM topic"],
            ["draft_suggestion", "quick_check_candidate", "Draft LLM quick check"],
          ],
        },
        leaks: false,
        listedPageStatusCodes: [200, 200],
        listedPageStatuses: ["accepted", "accepted"],
        listedPageTitles: ["Draft LLM quick check", "Draft LLM topic"],
        quickCheckDrafts: [],
        rejected: {
          status: "accepted",
          suggestionStatus: "rejected",
        },
      },
    );
  } finally {
    await close();
  }
});

test("llmCurationSuggestionsHttp_shouldEnforceSessionCsrfValidationProviderFailuresAndTerminalStates", async () => {
  const providerFailureHarness = await listenWithIdentityProgramCorpusAndCuratorWorkspace({
    ids: manyIds(40),
    llmSuggestionProviderAdapters: [
      makeHttpLlmSuggestionProviderAdapter({ throws: true }),
    ],
  });
  const missingProviderHarness = await listenWithIdentityProgramCorpusAndCuratorWorkspace({
    ids: manyIds(40),
    llmSuggestionPolicies: [makeHttpLlmSuggestionPolicy({ providerAdapterId: "provider-missing" })],
    llmSuggestionProviderAdapters: [],
  });
  const budgetFailureHarness = await listenWithIdentityProgramCorpusAndCuratorWorkspace({
    ids: manyIds(40),
    llmSuggestionProviderAdapters: [
      makeHttpLlmSuggestionProviderAdapter({
        providerUsage: { providerCalls: 2, inputTokens: 120, outputTokens: 80 },
      }),
    ],
  });
  const outputFailureHarness = await listenWithIdentityProgramCorpusAndCuratorWorkspace({
    ids: manyIds(40),
    llmSuggestionProviderAdapters: [
      makeHttpLlmSuggestionProviderAdapter({
        outputValidation: { validatorPolicyId: "validator-a", passed: false },
      }),
    ],
  });
  const { baseUrl, close, database } = await listenWithIdentityProgramCorpusAndCuratorWorkspace({
    ids: manyIds(160),
  });

  try {
    const scenario = await createLlmSuggestionHttpScenario(baseUrl);
    const missingSession = await getJson(`${baseUrl}/programs/${scenario.programId}/llm-curation-suggestions`);
    const studentList = await getJson(`${baseUrl}/programs/${scenario.programId}/llm-curation-suggestions`, {
      cookie: scenario.student.cookie,
    });
    const adminGenerate = await postJson(
      `${baseUrl}/programs/${scenario.programId}/llm-curation-suggestions`,
      makeHttpLlmSuggestionGenerationBody(),
      { cookie: scenario.bootstrap.cookie, csrfToken: scenario.bootstrap.csrfToken },
    );
    const missingCsrf = await fetch(`${baseUrl}/programs/${scenario.programId}/llm-curation-suggestions`, {
      body: JSON.stringify(makeHttpLlmSuggestionGenerationBody()),
      headers: {
        cookie: scenario.curator.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const invalidBody = await postJson(
      `${baseUrl}/programs/${scenario.programId}/llm-curation-suggestions`,
      { suggestionPolicyId: "" },
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const missingPolicy = await postJson(
      `${baseUrl}/programs/${scenario.programId}/llm-curation-suggestions`,
      { ...makeHttpLlmSuggestionGenerationBody(), suggestionPolicyId: "policy-missing" },
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const invalidList = await getJson(
      `${baseUrl}/programs/${scenario.programId}/llm-curation-suggestions?status=unsupported`,
      { cookie: scenario.curator.cookie },
    );
    const staleCoverageGap = await postJson(
      `${baseUrl}/programs/${scenario.programId}/llm-curation-suggestions`,
      {
        ...makeHttpLlmSuggestionGenerationBody(),
        coverageGapIds: ["coverage-gap-missing"],
        curatorInstruction: "",
        idempotencyKey: "llm-stale-gap-key",
      },
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const unsupportedContext = await postJson(
      `${baseUrl}/programs/${scenario.programId}/llm-curation-suggestions`,
      {
        ...makeHttpLlmSuggestionGenerationBody(),
        contextEntityIds: ["context-entity-missing"],
        curatorInstruction: "",
        idempotencyKey: "llm-context-key",
      },
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const created = await postJson(
      `${baseUrl}/programs/${scenario.programId}/llm-curation-suggestions`,
      makeHttpLlmSuggestionGenerationBody(),
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const suggestionId = created.body.value?.suggestions?.[0]?.suggestionId ?? "suggestion-missing";
    const studentDetail = await getJson(`${baseUrl}/llm-curation-suggestions/${suggestionId}`, {
      cookie: scenario.student.cookie,
    });
    const studentAcceptance = await postJson(
      `${baseUrl}/llm-curation-suggestions/${suggestionId}/acceptance`,
      {},
      { cookie: scenario.student.cookie, csrfToken: scenario.student.csrfToken },
    );
    const missingAcceptanceCsrf = await fetch(`${baseUrl}/llm-curation-suggestions/${suggestionId}/acceptance`, {
      body: JSON.stringify({}),
      headers: {
        cookie: scenario.curator.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const missingRejectionCsrf = await fetch(`${baseUrl}/llm-curation-suggestions/${suggestionId}/rejection`, {
      body: JSON.stringify({}),
      headers: {
        cookie: scenario.curator.cookie,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const rejected = await postJson(
      `${baseUrl}/llm-curation-suggestions/${suggestionId}/rejection`,
      {},
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const acceptRejected = await postJson(
      `${baseUrl}/llm-curation-suggestions/${suggestionId}/acceptance`,
      {},
      { cookie: scenario.curator.cookie, csrfToken: scenario.curator.csrfToken },
    );
    const failureSession = await bootstrapAdmin(providerFailureHarness.baseUrl);
    const failureProgram = await createProgram(providerFailureHarness.baseUrl, failureSession, {
      title: "Provider failures",
    });
    const failureProgramId = (await failureProgram.json()).value.program.programId;
    const missingProviderSession = await bootstrapAdmin(missingProviderHarness.baseUrl);
    const missingProviderProgram = await createProgram(missingProviderHarness.baseUrl, missingProviderSession, {
      title: "Missing provider",
    });
    const missingProviderProgramId = (await missingProviderProgram.json()).value.program.programId;
    const budgetFailureSession = await bootstrapAdmin(budgetFailureHarness.baseUrl);
    const budgetFailureProgram = await createProgram(budgetFailureHarness.baseUrl, budgetFailureSession, {
      title: "Budget failure",
    });
    const budgetFailureProgramId = (await budgetFailureProgram.json()).value.program.programId;
    const outputFailureSession = await bootstrapAdmin(outputFailureHarness.baseUrl);
    const outputFailureProgram = await createProgram(outputFailureHarness.baseUrl, outputFailureSession, {
      title: "Output failure",
    });
    const outputFailureProgramId = (await outputFailureProgram.json()).value.program.programId;
    const providerFailure = await postJson(
      `${providerFailureHarness.baseUrl}/programs/${failureProgramId}/llm-curation-suggestions`,
      makeHttpLlmSuggestionGenerationBody(),
      { cookie: failureSession.cookie, csrfToken: failureSession.csrfToken },
    );
    const missingProvider = await postJson(
      `${missingProviderHarness.baseUrl}/programs/${missingProviderProgramId}/llm-curation-suggestions`,
      makeHttpLlmSuggestionGenerationBody(),
      { cookie: missingProviderSession.cookie, csrfToken: missingProviderSession.csrfToken },
    );
    const budgetFailure = await postJson(
      `${budgetFailureHarness.baseUrl}/programs/${budgetFailureProgramId}/llm-curation-suggestions`,
      makeHttpLlmSuggestionGenerationBody(),
      { cookie: budgetFailureSession.cookie, csrfToken: budgetFailureSession.csrfToken },
    );
    const outputFailure = await postJson(
      `${outputFailureHarness.baseUrl}/programs/${outputFailureProgramId}/llm-curation-suggestions`,
      makeHttpLlmSuggestionGenerationBody(),
      { cookie: outputFailureSession.cookie, csrfToken: outputFailureSession.csrfToken },
    );
    const serializedFaults = JSON.stringify([
      budgetFailure.body,
      missingProvider.body,
      outputFailure.body,
      providerFailure.body,
    ]);

    assert.deepEqual(
      {
        acceptedCount: projectHttpAcceptedCorpusCounts(database),
        acceptRejected: { body: acceptRejected.body, statusCode: acceptRejected.statusCode },
        adminGenerate: { body: adminGenerate.body, statusCode: adminGenerate.statusCode },
        invalidBody: { body: invalidBody.body, statusCode: invalidBody.statusCode },
        invalidList: { body: invalidList.body, statusCode: invalidList.statusCode },
        budgetFailure: { body: budgetFailure.body, statusCode: budgetFailure.statusCode },
        missingAcceptanceCsrf: { body: await missingAcceptanceCsrf.json(), statusCode: missingAcceptanceCsrf.status },
        missingCsrf: { body: await missingCsrf.json(), statusCode: missingCsrf.status },
        missingPolicy: { body: missingPolicy.body, statusCode: missingPolicy.statusCode },
        missingProvider: { body: missingProvider.body, statusCode: missingProvider.statusCode },
        missingRejectionCsrf: { body: await missingRejectionCsrf.json(), statusCode: missingRejectionCsrf.status },
        missingSession: { body: missingSession.body, statusCode: missingSession.statusCode },
        outputFailure: { body: outputFailure.body, statusCode: outputFailure.statusCode },
        providerFailure: {
          body: providerFailure.body,
          hasLeaks: containsLlmSuggestionHttpLeaks(serializedFaults),
          statusCode: providerFailure.statusCode,
        },
        rejected: llmRejectedSuggestionProjection(rejected),
        staleCoverageGap: { body: staleCoverageGap.body, statusCode: staleCoverageGap.statusCode },
        studentAcceptance: { body: studentAcceptance.body, statusCode: studentAcceptance.statusCode },
        studentDetail: { body: studentDetail.body, statusCode: studentDetail.statusCode },
        studentList: { body: studentList.body, statusCode: studentList.statusCode },
        suggestionStatuses: listLlmCurationSuggestionRecords(database).map($0 => [$0.title, $0.status]),
        unsupportedContext: { body: unsupportedContext.body, statusCode: unsupportedContext.statusCode },
      },
      {
        acceptedCount: projectHttpAcceptedCorpusCounts(database),
        acceptRejected: {
          body: { status: "rejected", reason: "llm_curation_suggestion_already_rejected" },
          statusCode: 409,
        },
        adminGenerate: { body: { status: "rejected", reason: "program_curator_required" }, statusCode: 403 },
        budgetFailure: { body: { status: "rejected", reason: "provider_budget_exceeded" }, statusCode: 409 },
        invalidBody: { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
        invalidList: { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
        missingAcceptanceCsrf: { body: { status: "rejected", reason: "csrf_required" }, statusCode: 403 },
        missingCsrf: { body: { status: "rejected", reason: "csrf_required" }, statusCode: 403 },
        missingPolicy: { body: { status: "rejected", reason: "suggestion_policy_not_found" }, statusCode: 404 },
        missingProvider: { body: { status: "rejected", reason: "provider_adapter_not_found" }, statusCode: 404 },
        missingRejectionCsrf: { body: { status: "rejected", reason: "csrf_required" }, statusCode: 403 },
        missingSession: { body: { status: "rejected", reason: "session_not_found" }, statusCode: 401 },
        outputFailure: { body: { status: "rejected", reason: "provider_output_rejected" }, statusCode: 409 },
        providerFailure: {
          body: { status: "rejected", reason: "provider_execution_failed" },
          hasLeaks: false,
          statusCode: 409,
        },
        rejected: {
          status: "accepted",
          suggestionStatus: "rejected",
        },
        staleCoverageGap: { body: { status: "rejected", reason: "coverage_gap_not_found" }, statusCode: 404 },
        studentAcceptance: { body: { status: "rejected", reason: "program_curator_required" }, statusCode: 403 },
        studentDetail: { body: { status: "rejected", reason: "program_curator_required" }, statusCode: 403 },
        studentList: { body: { status: "rejected", reason: "program_curator_required" }, statusCode: 403 },
        suggestionStatuses: [["Add algebra topic", "rejected"]],
        unsupportedContext: { body: { status: "rejected", reason: "validation_failed" }, statusCode: 400 },
      },
    );
  } finally {
    await close();
    await budgetFailureHarness.close();
    await missingProviderHarness.close();
    await outputFailureHarness.close();
    await providerFailureHarness.close();
  }
});

async function createLlmSuggestionHttpScenario(baseUrl) {
  const bootstrap = await bootstrapAdmin(baseUrl);
  const curator = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "LLM Curator",
    login: "llm-curator@example.test",
  });
  const student = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "LLM Student",
    login: "llm-student@example.test",
  });
  const createdProgram = await createProgram(baseUrl, curator, { title: "Linear Algebra" });
  const programId = (await createdProgram.json()).value.program.programId;
  await joinStudentProgram(baseUrl, student, programId);
  const topic = await createAcceptedNavigationCandidate(baseUrl, curator, programId, {
    candidateKind: "topic",
    title: "Vector spaces",
  });
  const acceptedQuickCheck = await createAcceptedQuickCheck(baseUrl, curator, programId, {
    answerKeyOptionIndex: 0,
    options: ["Closed under addition", "Only finite dimension"],
    title: "Closure check",
  });

  return { acceptedQuickCheck, bootstrap, curator, programId, student, topic };
}

function makeHttpLlmSuggestionGenerationBody() {
  return {
    curatorInstruction: "Suggest one draft topic.",
    idempotencyKey: "llm-http-key",
    maxSuggestions: 1,
    suggestionPolicyId: "policy-a",
  };
}

function llmSuggestionListProjection(response) {
  return {
    nextCursor: response.body.value?.nextCursor,
    status: response.body.status,
    statusCode: response.statusCode,
    suggestions: response.body.value?.suggestions.map($0 => [
      $0.status,
      $0.suggestionKind,
      $0.title,
    ]) ?? [],
  };
}

function llmSuggestionDetailProjection(response) {
  const suggestion = response.body.value?.suggestion;
  return {
    containsForbiddenDetail: containsLlmSuggestionHttpLeaks(response.body),
    status: response.body.status,
    statusCode: response.statusCode,
    suggestion: suggestion
      ? [
          suggestion.status,
          suggestion.suggestionKind,
          suggestion.title,
        ]
      : null,
  };
}

function llmAcceptedSuggestionProjection(response) {
  return {
    candidateKind: response.body.value?.materializedCandidate.candidateKind,
    status: response.body.status,
    suggestionStatus: response.body.value?.suggestion.status,
  };
}

function llmRejectedSuggestionProjection(response) {
  return {
    status: response.body.status,
    suggestionStatus: response.body.value?.suggestion.status,
  };
}

function projectHttpAcceptedCorpusCounts(database) {
  return {
    acceptedAssessmentCriteria: listAcceptedAssessmentCriterionEntityRecords(database).length,
    acceptedCorpus: listAcceptedCorpusEntityRecords(database).length,
    acceptedOpenAnswerChecks: listAcceptedOpenAnswerCheckEntityRecords(database).length,
    acceptedQuickChecks: listAcceptedQuickCheckEntityRecords(database).length,
  };
}

function containsLlmSuggestionHttpLeaks(values) {
  const serialized = JSON.stringify(values).toLowerCase();
  return [
    "acceptedbyidentityid",
    "acceptedfromcandidateid",
    "answerkeyoptionid",
    "authorization",
    "cookie",
    "csrf",
    "database-url",
    "idempotency",
    "postgres://",
    "provider diagnostics",
    "raw model",
    "raw prompt",
    "secret",
    "select *",
    "session-",
    "stack",
    "submitted",
    "/tmp",
  ].some($0 => serialized.includes($0));
}
