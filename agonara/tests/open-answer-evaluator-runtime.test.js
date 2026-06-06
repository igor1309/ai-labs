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
  return {
    url: request.url,
    authorization: request.init.headers.Authorization,
    model: body.model,
    mentionsSecret: request.init.body.includes("nomos-key-secret"),
  };
}
