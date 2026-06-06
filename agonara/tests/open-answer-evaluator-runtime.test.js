import assert from "node:assert/strict";
import test from "node:test";
import {
  createNomosOpenAnswerEvaluatorProviderAdapter,
  createSingleFlightOpenAnswerEvaluatorWorkerTick,
  makeLlmOpenAnswerEvaluatorPolicy,
} from "../src/open-answer-evaluator-runtime.js";

test("makeLlmOpenAnswerEvaluatorPolicy_shouldReturnLlmPolicy_onValidInput", () => {
  const policy = makeLlmOpenAnswerEvaluatorPolicy({
    evaluatorPolicyId: "policy-a",
    providerAdapterId: "adapter-a",
    outputValidatorPolicyId: "validator-a",
    redactionPolicyId: "redaction-a",
    retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    budgetPolicy: { maxProviderCalls: 1 },
  });

  assert.deepEqual(policy, {
    evaluatorPolicyId: "policy-a",
    evaluatorPathKind: "llm_assisted",
    providerAdapterId: "adapter-a",
    outputValidatorPolicyId: "validator-a",
    redactionPolicyId: "redaction-a",
    retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    budgetPolicy: { maxProviderCalls: 1 },
    promptInputPolicy: {
      includeSubmittedAnswer: true,
      includeAcceptedCheckRevision: true,
      includeAcceptedCriterionRevisions: true,
    },
    rawArtifactPolicy: "none",
  });
});

test("evaluate_shouldCallNomosAndReturnValidatedFeedback_onWellFormedOutput", async () => {
  const requests = [];
  const adapter = createNomosOpenAnswerEvaluatorProviderAdapter({
    providerAdapterId: "adapter-a",
    baseUrl: "https://nomos.example.test",
    model: "model-a",
    apiKey: "nomos-key-secret",
    outputValidatorPolicyId: "validator-a",
    fetch: async (url, init) => {
      requests.push({ url, init });
      return makeNomosResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summaryFeedback: "The answer explains the invariant.",
                criterionFeedback: [
                  {
                    criterionRevisionId: "criterion-a",
                    outcome: "met",
                    feedback: "The accepted criterion is addressed.",
                  },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      });
    },
  });

  const result = await adapter.evaluate(makeProviderRequest());

  assert.deepEqual(
    {
      providerAdapterId: adapter.providerAdapterId,
      evaluatorPathKind: adapter.evaluatorPathKind,
      request: projectNomosRequest(requests[0]),
      result,
    },
    {
      providerAdapterId: "adapter-a",
      evaluatorPathKind: "llm_assisted",
      request: {
        url: "https://nomos.example.test/v1/chat/completions",
        authorization: "Bearer nomos-key-secret",
        model: "model-a",
        responseFormat: {
          criterionRevisionIdEnum: ["criterion-a"],
          strict: true,
          type: "json_schema",
        },
        systemContentMentionsArray: true,
        userPayload: {
          requiredCriterionRevisionIds: ["criterion-a"],
          submittedAnswer: "Student answer about the accepted invariant.",
          acceptedCheckRevision: {
            revisionId: "check-a",
            title: "Accepted check",
            prompt: "Explain the accepted invariant.",
          },
          acceptedCriterionRevisions: [
            {
              revisionId: "criterion-a",
              title: "Accepted criterion",
              body: "Names the invariant and explains why it holds.",
            },
          ],
        },
        mentionsSecret: false,
      },
      result: {
        summaryFeedback: "The answer explains the invariant.",
        criterionFeedback: [
          {
            criterionRevisionId: "criterion-a",
            outcome: "met",
            feedback: "The accepted criterion is addressed.",
          },
        ],
        providerUsage: {
          providerCalls: 1,
          inputTokens: 11,
          outputTokens: 7,
          estimatedCostMinorUnits: 0,
        },
        outputValidation: { validatorPolicyId: "validator-a", passed: true },
      },
    },
  );
});

test("evaluate_shouldReturnFailedOutputValidation_onUnsafeOrMismatchedModelOutput", async () => {
  const adapter = createNomosOpenAnswerEvaluatorProviderAdapter({
    providerAdapterId: "adapter-a",
    baseUrl: "https://nomos.example.test",
    model: "model-a",
    apiKey: "nomos-key-secret",
    outputValidatorPolicyId: "validator-a",
    fetch: async () =>
      makeNomosResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summaryFeedback: "authorization leaked",
                criterionFeedback: [
                  {
                    criterionRevisionId: "criterion-unknown",
                    outcome: "met",
                    feedback: "The criterion is addressed.",
                  },
                ],
              }),
            },
          },
        ],
      }),
  });

  const result = await adapter.evaluate(makeProviderRequest());

  assert.deepEqual(result.outputValidation, { validatorPolicyId: "validator-a", passed: false });
});

test("createNomosOpenAnswerEvaluatorProviderAdapter_shouldRejectConstruction_onMissingRequiredFields", () => {
  const defaults = {
    providerAdapterId: "adapter-a",
    baseUrl: "https://nomos.example.test",
    model: "model-a",
    apiKey: "nomos-key-secret",
    outputValidatorPolicyId: "validator-a",
    fetch: async () => makeNomosResponse({}),
  };

  const errors = [
    { providerAdapterId: "" },
    { baseUrl: "" },
    { model: "" },
    { apiKey: "" },
    { outputValidatorPolicyId: "" },
    { fetch: null },
  ].map(input => captureErrorMessage(() =>
    createNomosOpenAnswerEvaluatorProviderAdapter({ ...defaults, ...input }),
  ));

  assert.deepEqual(errors, [
    "providerAdapterId_required",
    "baseUrl_required",
    "model_required",
    "apiKey_required",
    "outputValidatorPolicyId_required",
    "fetch_required",
  ]);
});

test("evaluate_shouldReject_onNomosFailure", async () => {
  const adapter = createNomosOpenAnswerEvaluatorProviderAdapter({
    providerAdapterId: "adapter-a",
    baseUrl: "https://nomos.example.test",
    model: "model-a",
    apiKey: "nomos-key-secret",
    outputValidatorPolicyId: "validator-a",
    fetch: async () => makeNomosResponse({ error: "provider-secret-detail" }, { ok: false, status: 502 }),
  });

  await assert.rejects(adapter.evaluate(makeProviderRequest()), { message: "nomos_request_failed" });
});

test("evaluate_shouldReject_onMalformedNomosOutput", async () => {
  const adapter = createNomosOpenAnswerEvaluatorProviderAdapter({
    providerAdapterId: "adapter-a",
    baseUrl: "https://nomos.example.test",
    model: "model-a",
    apiKey: "nomos-key-secret",
    outputValidatorPolicyId: "validator-a",
    fetch: async () =>
      makeNomosResponse({
        choices: [{ message: { content: "not-json" } }],
      }),
  });

  await assert.rejects(adapter.evaluate(makeProviderRequest()), { message: "nomos_output_malformed" });
});

test("runOpenAnswerEvaluatorWorkerTick_shouldRejectOverlappingInvocation_onInFlightRun", async () => {
  let resolveRun;
  let calls = 0;
  const runOpenAnswerEvaluatorWorkerTick = createSingleFlightOpenAnswerEvaluatorWorkerTick({
    runOpenAnswerEvaluatorWorkerOnce: input => {
      calls += 1;
      return new Promise(resolve => {
        resolveRun = () => resolve({ status: "accepted", value: { summary: { workerId: input.workerId } } });
      });
    },
    workerId: "worker-a",
    leaseDurationSeconds: 300,
  });

  const first = runOpenAnswerEvaluatorWorkerTick();
  const second = await runOpenAnswerEvaluatorWorkerTick();
  resolveRun();
  const firstResult = await first;

  assert.deepEqual(
    { calls, firstResult, second },
    {
      calls: 1,
      firstResult: { status: "accepted", value: { summary: { workerId: "worker-a" } } },
      second: { status: "rejected", reason: "worker_already_running" },
    },
  );
});

test("runOpenAnswerEvaluatorWorkerTick_shouldRunSingleJob_onEvaluatorJobId", () => {
  const calls = [];
  const runOpenAnswerEvaluatorWorkerTick = createSingleFlightOpenAnswerEvaluatorWorkerTick({
    runOpenAnswerEvaluatorWorkerOnce: input => {
      calls.push(input);
      return { status: "accepted", value: { summary: { mode: input.mode } } };
    },
    workerId: "worker-a",
    leaseDurationSeconds: 300,
  });

  const result = runOpenAnswerEvaluatorWorkerTick({ evaluatorJobId: "evaluator-run-a" });

  assert.deepEqual(
    { calls, result },
    {
      calls: [
        {
          evaluatorJobId: "evaluator-run-a",
          leaseDurationSeconds: 300,
          mode: "single_job",
          workerId: "worker-a",
        },
      ],
      result: { status: "accepted", value: { summary: { mode: "single_job" } } },
    },
  );
});

function makeProviderRequest({
  criterionRevisionIds = ["criterion-a"],
  submittedAnswer = "Student answer about the accepted invariant.",
} = {}) {
  return {
    evaluatorJobId: "job-a",
    attemptId: "attempt-a",
    programId: "program-a",
    studentIdentityId: "student-a",
    checkRevisionId: "check-a",
    criterionRevisionIds,
    submittedAnswer,
    acceptedCheckRevision: {
      revisionId: "check-a",
      title: "Accepted check",
      prompt: "Explain the accepted invariant.",
    },
    acceptedCriterionRevisions: [
      {
        revisionId: "criterion-a",
        title: "Accepted criterion",
        body: "Names the invariant and explains why it holds.",
      },
    ],
    evaluatorPolicyId: "policy-a",
    outputValidatorPolicyId: "validator-a",
  };
}

function makeNomosResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function projectNomosRequest(request) {
  const body = JSON.parse(request.init.body);
  const userMessage = body.messages.find($0 => $0.role === "user");
  return {
    url: request.url,
    authorization: request.init.headers.Authorization,
    model: body.model,
    responseFormat: {
      criterionRevisionIdEnum:
        body.response_format.json_schema.schema.properties.criterionFeedback.items.properties.criterionRevisionId.enum,
      strict: body.response_format.json_schema.strict,
      type: body.response_format.type,
    },
    systemContentMentionsArray: body.messages
      .find($0 => $0.role === "system")
      .content.includes("criterionFeedback must be an array"),
    userPayload: JSON.parse(userMessage.content),
    mentionsSecret: request.init.body.includes("nomos-key-secret"),
  };
}

function captureErrorMessage(run) {
  try {
    run();
  } catch (error) {
    return error.message;
  }
  return "no_error";
}
