const forbiddenOperationalDetailPatterns = [
  /\bsession\b/i,
  /\bcsrf\b/i,
  /\bcookie\b/i,
  /\bauthorization\b/i,
  /\braw\s+model\b/i,
  /\braw\s+prompt\b/i,
  /\bselect\s+\*/i,
  /\bstack\s+trace\b/i,
  /\/tmp\b/i,
  /\bpostgres:\/\//i,
  /\bdatabase-url\b/i,
];

const supportedEvaluationOutcomes = new Set(["met", "partially_met", "missing", "unclear"]);

export function createNomosOpenAnswerEvaluatorProviderAdapter({
  providerAdapterId,
  baseUrl,
  model,
  apiKey,
  outputValidatorPolicyId,
  fetch: fetchImpl = globalThis.fetch,
}) {
  assertNonEmptyString(providerAdapterId, "providerAdapterId");
  assertNonEmptyString(baseUrl, "baseUrl");
  assertNonEmptyString(model, "model");
  assertNonEmptyString(apiKey, "apiKey");
  assertNonEmptyString(outputValidatorPolicyId, "outputValidatorPolicyId");
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch_required");
  }

  return {
    providerAdapterId: providerAdapterId.trim(),
    evaluatorPathKind: "llm_assisted",
    evaluate: async request => {
      const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: [
                "Return only the JSON object requested by the response schema.",
                "criterionFeedback must be an array with exactly one item for each required criterion revision id.",
                "Use exact criterionRevisionId values from requiredCriterionRevisionIds.",
                "Allowed outcomes are met, partially_met, missing, and unclear.",
                "Do not include operational details.",
              ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify({
                requiredCriterionRevisionIds: request.criterionRevisionIds,
                submittedAnswer: request.submittedAnswer,
                acceptedCheckRevision:
                  request.acceptedCheckRevision ?? { revisionId: request.checkRevisionId },
                acceptedCriterionRevisions:
                  request.acceptedCriterionRevisions ??
                  request.criterionRevisionIds.map($0 => ({ revisionId: $0 })),
              }),
            },
          ],
          response_format: openAnswerEvaluationResponseFormat(request.criterionRevisionIds),
        }),
      });
      if (!response?.ok) {
        throw new Error("nomos_request_failed");
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("nomos_output_malformed");
      }

      const outputValidation = validateProviderOutput({
        criterionFeedback: parsed.criterionFeedback,
        criterionRevisionIds: request.criterionRevisionIds,
        outputValidatorPolicyId,
        summaryFeedback: parsed.summaryFeedback,
      });
      return {
        summaryFeedback: typeof parsed.summaryFeedback === "string" ? parsed.summaryFeedback : "",
        criterionFeedback: Array.isArray(parsed.criterionFeedback) ? parsed.criterionFeedback : [],
        providerUsage: {
          providerCalls: 1,
          inputTokens: integerOrZero(payload?.usage?.prompt_tokens),
          outputTokens: integerOrZero(payload?.usage?.completion_tokens),
          estimatedCostMinorUnits: 0,
        },
        outputValidation,
      };
    },
  };
}

function openAnswerEvaluationResponseFormat(criterionRevisionIds) {
  return {
    type: "json_schema",
    json_schema: {
      name: "open_answer_evaluation",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["summaryFeedback", "criterionFeedback"],
        properties: {
          summaryFeedback: { type: "string" },
          criterionFeedback: {
            type: "array",
            minItems: criterionRevisionIds.length,
            maxItems: criterionRevisionIds.length,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["criterionRevisionId", "outcome", "feedback"],
              properties: {
                criterionRevisionId: { type: "string", enum: criterionRevisionIds },
                outcome: {
                  type: "string",
                  enum: [...supportedEvaluationOutcomes],
                },
                feedback: { type: "string" },
              },
            },
          },
        },
      },
    },
  };
}

export function createSingleFlightOpenAnswerEvaluatorWorkerTick({
  runOpenAnswerEvaluatorWorkerOnce,
  workerId,
  leaseDurationSeconds,
}) {
  let inFlight = false;
  return ({ evaluatorJobId } = {}) => {
    if (inFlight) {
      return { status: "rejected", reason: "worker_already_running" };
    }

    inFlight = true;
    let result;
    try {
      result = runOpenAnswerEvaluatorWorkerOnce({
        workerId,
        mode: evaluatorJobId ? "single_job" : "claim_next",
        ...(evaluatorJobId ? { evaluatorJobId } : {}),
        leaseDurationSeconds,
      });
    } catch (error) {
      inFlight = false;
      throw error;
    }

    if (isPromiseLike(result)) {
      return result.finally(() => {
        inFlight = false;
      });
    }

    inFlight = false;
    return result;
  };
}

export function makeLlmOpenAnswerEvaluatorPolicy({
  evaluatorPolicyId,
  providerAdapterId,
  outputValidatorPolicyId,
  redactionPolicyId,
  retryPolicy,
  budgetPolicy,
}) {
  return {
    evaluatorPolicyId,
    evaluatorPathKind: "llm_assisted",
    providerAdapterId,
    outputValidatorPolicyId,
    redactionPolicyId,
    retryPolicy,
    ...(budgetPolicy ? { budgetPolicy } : {}),
    promptInputPolicy: {
      includeSubmittedAnswer: true,
      includeAcceptedCheckRevision: true,
      includeAcceptedCriterionRevisions: true,
    },
    rawArtifactPolicy: "none",
  };
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name}_required`);
  }
}

function validateProviderOutput({
  criterionFeedback,
  criterionRevisionIds,
  outputValidatorPolicyId,
  summaryFeedback,
}) {
  return {
    validatorPolicyId: outputValidatorPolicyId,
    passed:
      isSafeNonEmptyText(summaryFeedback) &&
      isValidCriterionFeedback(criterionFeedback, criterionRevisionIds),
  };
}

function isValidCriterionFeedback(criterionFeedback, criterionRevisionIds) {
  if (!Array.isArray(criterionFeedback) || criterionFeedback.length !== criterionRevisionIds.length) {
    return false;
  }
  const expected = new Set(criterionRevisionIds);
  const actual = new Set();
  for (const item of criterionFeedback) {
    if (
      !expected.has(item?.criterionRevisionId) ||
      actual.has(item.criterionRevisionId) ||
      !supportedEvaluationOutcomes.has(item?.outcome) ||
      !isSafeNonEmptyText(item?.feedback)
    ) {
      return false;
    }
    actual.add(item.criterionRevisionId);
  }
  return actual.size === expected.size;
}

function isSafeNonEmptyText(value) {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    forbiddenOperationalDetailPatterns.every($0 => !$0.test(value))
  );
}

function integerOrZero(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function isPromiseLike(value) {
  return value !== null && typeof value === "object" && typeof value.then === "function";
}
