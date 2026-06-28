import { randomUUID } from "node:crypto";
import {
  StorageInvariantError,
  clearOpenAnswerEvaluatorJobLease,
  createOpenAnswerAttemptRecord,
  createOpenAnswerEvaluationFailureRecord,
  createOpenAnswerEvaluationRecord,
  createOpenAnswerEvaluatorEvidenceRecord,
  createOpenAnswerEvaluatorRunRecord,
  createQuickCheckAttemptRecord,
  createReadinessCheckAttemptRecord,
  deleteOpenAnswerEvaluationFailureRecord,
  getAcceptedAssessmentCriterionEntityRecord,
  getAcceptedAssessmentCriterionRevisionRecord,
  getAcceptedCorpusEntityRecord,
  getAcceptedCorpusRevisionRecord,
  getAcceptedOpenAnswerCheckEntityRecord,
  getAcceptedOpenAnswerCheckRevisionRecord,
  getAcceptedQuickCheckEntityRecord,
  getAcceptedQuickCheckRevisionRecord,
  getAcceptedReadinessCheckRevisionRecord,
  getIdentity,
  getOpenAnswerAttemptRecord,
  getOpenAnswerEvaluationFailureRecord,
  getOpenAnswerEvaluationRecordByAttemptId,
  getOpenAnswerEvaluatorJobRecord,
  getOpenAnswerEvaluatorRunRecord,
  getProgramShellRecord,
  getQuickCheckAttemptRecord,
  getReadinessCheckAttemptRecord,
  listAcceptedAssessmentCriterionEntityRecords,
  listAcceptedCorpusEntityRecords,
  listAcceptedNavigationRelationshipRecords,
  listAcceptedOpenAnswerCheckEntityRecords,
  listAcceptedQuickCheckEntityRecords,
  listAcceptedReadinessCheckEntityRecords,
  listClaimableOpenAnswerEvaluatorJobRecords,
  listLearnerEvidenceTargetLinkRecords,
  listOpenAnswerAttemptRecords,
  listOpenAnswerEvaluatorEvidenceRecords,
  listOpenAnswerEvaluatorRunRecords,
  listQuickCheckAttemptRecords,
  listReadinessCheckAttemptRecords,
  updateOpenAnswerAttemptStatus,
  updateOpenAnswerEvaluatorJobLease,
  updateOpenAnswerEvaluatorJobRecovery,
  updateOpenAnswerEvaluatorRunStatus,
} from "./storage.js";

const supportedEvaluationOutcomes = new Set(["met", "partially_met", "missing", "unclear"]);
const supportedAttemptStatuses = new Set(["submitted", "evaluating", "evaluated", "evaluation_failed"]);
const supportedEvaluatorPathKinds = new Set([
  "student_workspace",
  "deterministic",
  "llm_assisted",
  "human_reviewed",
]);
const supportedEvaluatorWorkerModes = new Set(["single_job", "claim_next"]);
const supportedLearnerStateTargetKinds = new Set([
  "program",
  "topic",
  "concept",
  "material_reference",
  "quick_check",
  "open_answer_check",
  "assessment_criterion",
]);
const forbiddenResponseDetailPatterns = [
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

export function createStudentWorkspaceCommands({
  database,
  evaluatorPolicies = [],
  generateId = randomUUID,
  getEffectiveParticipation,
  now = () => new Date(),
  providerAdapters = [],
} = {}) {
  return {
    beginOpenAnswerEvaluatorRun: input =>
      beginOpenAnswerEvaluatorRun({ database, generateId, input, now }),
    cancelOpenAnswerEvaluatorRun: input =>
      cancelOpenAnswerEvaluatorRun({ database, input, now }),
    cancelOpenAnswerEvaluatorJob: input =>
      cancelOpenAnswerEvaluatorJob({ database, input, now }),
    claimOpenAnswerEvaluatorJob: input =>
      claimOpenAnswerEvaluatorJob({ database, generateId, input, now }),
    completeOpenAnswerEvaluatorJob: input =>
      completeOpenAnswerEvaluatorJob({ database, generateId, input, now }),
    completeOpenAnswerEvaluatorRun: input =>
      completeOpenAnswerEvaluatorRun({ database, generateId, input, now }),
    failOpenAnswerEvaluatorJob: input =>
      failOpenAnswerEvaluatorJob({ database, input, now }),
    failOpenAnswerEvaluatorRun: input =>
      failOpenAnswerEvaluatorRun({ database, input, now }),
    getOpenAnswerEvaluatorJob: input =>
      getOpenAnswerEvaluatorJob({ database, input }),
    getOpenAnswerAttempt: input =>
      getOpenAnswerAttempt({ database, input }),
    getOpenAnswerEvaluationStatus: input =>
      getOpenAnswerEvaluationStatus({ database, input }),
    getLearnerStateProgramSummary: input =>
      getLearnerStateProgramSummary({ database, getEffectiveParticipation, input, now }),
    getLearnerStateTargetDetail: input =>
      getLearnerStateTargetDetail({ database, getEffectiveParticipation, input, now }),
    getQuickCheckAttempt: input =>
      getQuickCheckAttempt({ database, getEffectiveParticipation, input }),
    getReadinessCheckAttempt: input =>
      getReadinessCheckAttempt({ database, getEffectiveParticipation, input }),
    listOpenAnswerAttempts: input =>
      listOpenAnswerAttempts({ database, getEffectiveParticipation, input }),
    listClaimableOpenAnswerEvaluatorJobs: input =>
      listClaimableOpenAnswerEvaluatorJobs({ database, input, now }),
    listOpenAnswerEvaluatorEvidence: input =>
      listOpenAnswerEvaluatorEvidence({ database, input }),
    listQuickCheckAttempts: input =>
      listQuickCheckAttempts({ database, getEffectiveParticipation, input }),
    listReadinessCheckAttempts: input =>
      listReadinessCheckAttempts({ database, getEffectiveParticipation, input }),
    listReadinessCheckDeliveries: input =>
      listReadinessCheckDeliveries({ database, getEffectiveParticipation, input }),
    markOpenAnswerAttemptEvaluating: input =>
      markOpenAnswerAttemptEvaluating({ database, input, now }),
    recordOpenAnswerEvaluation: input =>
      recordOpenAnswerEvaluation({ database, generateId, input, now }),
    recordOpenAnswerEvaluatorEvidence: input =>
      recordOpenAnswerEvaluatorEvidence({ database, generateId, input, now }),
    recordOpenAnswerEvaluatorJobEvidence: input =>
      recordOpenAnswerEvaluatorJobEvidence({ database, generateId, input, now }),
    recordOpenAnswerEvaluationFailure: input =>
      recordOpenAnswerEvaluationFailure({ database, input, now }),
    renewOpenAnswerEvaluatorJobLease: input =>
      renewOpenAnswerEvaluatorJobLease({ database, input, now }),
    runOpenAnswerEvaluatorWorkerOnce: input =>
      runOpenAnswerEvaluatorWorkerOnce({
        database,
        evaluatorPolicies,
        generateId,
        input,
        now,
        providerAdapters,
      }),
    scheduleOpenAnswerEvaluatorJob: input =>
      scheduleOpenAnswerEvaluatorJob({ database, generateId, input, now }),
    submitQuickCheckAttempt: input =>
      submitQuickCheckAttempt({ database, generateId, getEffectiveParticipation, input, now }),
    submitReadinessCheckAttempt: input =>
      submitReadinessCheckAttempt({ database, generateId, getEffectiveParticipation, input, now }),
    submitOpenAnswerAttempt: input =>
      submitOpenAnswerAttempt({ database, generateId, getEffectiveParticipation, input, now }),
    timeOutOpenAnswerEvaluatorJob: input =>
      timeOutOpenAnswerEvaluatorJob({ database, input, now }),
  };
}

function beginOpenAnswerEvaluatorRun({ database, generateId, input, now }) {
  const attempt = getOpenAnswerAttemptRecord(database, input?.attemptId);
  const attemptRejection = getBeginEvaluatorRunAttemptRejection(attempt);
  if (attemptRejection) {
    return attemptRejection;
  }
  if (
    !supportedEvaluatorPathKinds.has(input?.evaluatorPathKind) ||
    !isNonEmptyText(input?.evaluatorPolicyId)
  ) {
    return rejected("validation_failed");
  }
  const requestedByIdentityId = input?.requestedByIdentityId;
  const reviewerIdentityId = input?.reviewerIdentityId;
  let reviewerCapability = input?.reviewerCapability;
  if (input.evaluatorPathKind === "human_reviewed") {
    if (!isNonEmptyText(reviewerIdentityId) || !isNonEmptyText(reviewerCapability)) {
      return rejected("validation_failed");
    }
    reviewerCapability = reviewerCapability.trim();
  } else if (reviewerIdentityId !== undefined || reviewerCapability !== undefined) {
    return rejected("validation_failed");
  }

  const startedAt = now().toISOString();
  let transition;
  try {
    transition = database.transaction(() => {
      const currentAttempt = getOpenAnswerAttemptRecord(database, attempt.id);
      const currentAttemptRejection = getBeginEvaluatorRunAttemptRejection(currentAttempt);
      if (currentAttemptRejection) {
        return { rejection: currentAttemptRejection };
      }
      if (requestedByIdentityId !== undefined) {
        const requester = getIdentity(database, requestedByIdentityId);
        if (!requester || requester.state !== "active") {
          return { rejection: rejected("identity_not_active") };
        }
      }
      if (reviewerIdentityId !== undefined) {
        const reviewer = getIdentity(database, reviewerIdentityId);
        if (!reviewer || reviewer.state !== "active") {
          return { rejection: rejected("identity_not_active") };
        }
      }
      const previousFailure = getOpenAnswerEvaluationFailureRecord(database, currentAttempt.id);
      const run = createOpenAnswerEvaluatorRunRecord(database, {
        id: generateId(),
        attemptId: currentAttempt.id,
        programId: currentAttempt.programId,
        studentIdentityId: currentAttempt.studentIdentityId,
        checkRevisionId: currentAttempt.checkRevisionId,
        criterionRevisionIds: currentAttempt.criterionRevisionIds,
        evaluatorPathKind: input.evaluatorPathKind,
        evaluatorPolicyId: input.evaluatorPolicyId.trim(),
        requestedByIdentityId,
        reviewerIdentityId,
        reviewerCapability,
        status: "running",
        startedAt,
        priorFailureReason: previousFailure?.reason ?? null,
        priorFailedAt: previousFailure?.failedAt ?? null,
      });
      deleteOpenAnswerEvaluationFailureRecord(database, currentAttempt.id);
      const updatedAttempt = updateOpenAnswerAttemptStatus(database, {
        attemptId: currentAttempt.id,
        status: "evaluating",
        updatedAt: startedAt,
      });
      return { evaluatorRun: run, updated: updatedAttempt };
    })();
  } catch (error) {
    if (error instanceof StorageInvariantError && error.reason === "evaluator_run_conflict") {
      return rejected("evaluator_run_conflict");
    }
    throw error;
  }
  if (transition.rejection) {
    return transition.rejection;
  }

  return accepted({
    attempt: summarizeAttempt(transition.updated),
    evaluatorRun: summarizeEvaluatorRun(transition.evaluatorRun),
  });
}

function getBeginEvaluatorRunAttemptRejection(attempt) {
  if (!attempt) {
    return rejected("attempt_not_found");
  }
  if (attempt.status === "evaluating") {
    return rejected("attempt_already_evaluating");
  }
  if (attempt.status === "evaluated") {
    return rejected("attempt_already_evaluated");
  }
  return null;
}

function scheduleOpenAnswerEvaluatorJob({ database, generateId, input, now }) {
  const attempt = getOpenAnswerAttemptRecord(database, input?.attemptId);
  const attemptRejection = getBeginEvaluatorRunAttemptRejection(attempt);
  if (attemptRejection) {
    return attemptRejection;
  }
  if (
    !supportedEvaluatorPathKinds.has(input?.evaluatorPathKind) ||
    !isNonEmptyText(input?.evaluatorPolicyId)
  ) {
    return rejected("validation_failed");
  }
  const requestedByIdentityId = input?.requestedByIdentityId;
  const reviewerIdentityId = input?.reviewerIdentityId;
  let reviewerCapability = input?.reviewerCapability;
  if (input.evaluatorPathKind === "human_reviewed") {
    if (!isNonEmptyText(reviewerIdentityId) || !isNonEmptyText(reviewerCapability)) {
      return rejected("validation_failed");
    }
    reviewerCapability = reviewerCapability.trim();
  } else if (reviewerIdentityId !== undefined || reviewerCapability !== undefined) {
    return rejected("validation_failed");
  }

  const startedAt = now().toISOString();
  let transition;
  try {
    transition = database.transaction(() => {
      const currentAttempt = getOpenAnswerAttemptRecord(database, attempt.id);
      const currentAttemptRejection = getBeginEvaluatorRunAttemptRejection(currentAttempt);
      if (currentAttemptRejection) {
        return { rejection: currentAttemptRejection };
      }
      if (requestedByIdentityId !== undefined) {
        const requester = getIdentity(database, requestedByIdentityId);
        if (!requester || requester.state !== "active") {
          return { rejection: rejected("identity_not_active") };
        }
      }
      if (reviewerIdentityId !== undefined) {
        const reviewer = getIdentity(database, reviewerIdentityId);
        if (!reviewer || reviewer.state !== "active") {
          return { rejection: rejected("identity_not_active") };
        }
      }
      const evaluatorRunId = generateId();
      const previousFailure = getOpenAnswerEvaluationFailureRecord(database, currentAttempt.id);
      const run = createOpenAnswerEvaluatorRunRecord(database, {
        id: evaluatorRunId,
        attemptId: currentAttempt.id,
        programId: currentAttempt.programId,
        studentIdentityId: currentAttempt.studentIdentityId,
        checkRevisionId: currentAttempt.checkRevisionId,
        criterionRevisionIds: currentAttempt.criterionRevisionIds,
        evaluatorPathKind: input.evaluatorPathKind,
        evaluatorPolicyId: input.evaluatorPolicyId.trim(),
        requestedByIdentityId,
        reviewerIdentityId,
        reviewerCapability,
        status: "running",
        startedAt,
        priorFailureReason: previousFailure?.reason ?? null,
        priorFailedAt: previousFailure?.failedAt ?? null,
        jobStatus: "waiting",
        attemptNumber: 1,
        retryPolicy: input.retryPolicy,
        budgetPolicy: input.budgetPolicy ?? null,
        jobCreatedAt: startedAt,
        jobUpdatedAt: startedAt,
      });
      deleteOpenAnswerEvaluationFailureRecord(database, currentAttempt.id);
      const updatedAttempt = updateOpenAnswerAttemptStatus(database, {
        attemptId: currentAttempt.id,
        status: "evaluating",
        updatedAt: startedAt,
      });
      return {
        evaluatorJob: getOpenAnswerEvaluatorJobRecord(database, evaluatorRunId),
        evaluatorRun: run,
        updated: updatedAttempt,
      };
    })();
  } catch (error) {
    if (
      error instanceof StorageInvariantError &&
      ["evaluator_run_conflict", "validation_failed"].includes(error.reason)
    ) {
      return rejected(error.reason);
    }
    throw error;
  }
  if (transition.rejection) {
    return transition.rejection;
  }

  return accepted({
    attempt: summarizeAttempt(transition.updated),
    evaluatorJob: summarizeEvaluatorJob(transition.evaluatorJob),
  });
}

function claimOpenAnswerEvaluatorJob({ database, generateId, input, now }) {
  if (!isNonEmptyText(input?.workerId) || !isValidLeaseDurationSeconds(input?.leaseDurationSeconds)) {
    return rejected("validation_failed");
  }
  const evaluatorJob = getOpenAnswerEvaluatorJobRecord(database, input?.evaluatorJobId);
  const jobRejection = getClaimableEvaluatorJobRejection(evaluatorJob, now().toISOString());
  if (jobRejection) {
    return jobRejection;
  }

  const claimedAt = now().toISOString();
  const lease = {
    leaseId: generateId(),
    workerId: input.workerId.trim(),
    claimedAt,
    expiresAt: addSecondsIso(claimedAt, input.leaseDurationSeconds),
  };
  const transition = database.transaction(() => {
    const currentJob = getOpenAnswerEvaluatorJobRecord(database, evaluatorJob.evaluatorJobId);
    const currentJobRejection = getClaimableEvaluatorJobRejection(currentJob, claimedAt);
    if (currentJobRejection) {
      return { rejection: currentJobRejection };
    }
    return {
      evaluatorJob: updateOpenAnswerEvaluatorJobLease(database, {
        evaluatorJobId: currentJob.evaluatorJobId,
        leaseId: lease.leaseId,
        workerId: lease.workerId,
        claimedAt: lease.claimedAt,
        expiresAt: lease.expiresAt,
      }),
    };
  })();
  if (transition.rejection) {
    return transition.rejection;
  }

  return accepted({
    evaluatorJob: summarizeEvaluatorJob(transition.evaluatorJob),
    lease: summarizeEvaluatorLease(transition.evaluatorJob.lease),
  });
}

function runOpenAnswerEvaluatorWorkerOnce({
  database,
  evaluatorPolicies,
  generateId,
  input,
  now,
  providerAdapters,
}) {
  const validationRejection = getEvaluatorWorkerInputRejection(input);
  if (validationRejection) {
    return validationRejection;
  }

  const workerInput = {
    workerId: input.workerId.trim(),
    mode: input.mode,
    evaluatorJobId: input.evaluatorJobId?.trim(),
    leaseDurationSeconds: input.leaseDurationSeconds,
  };
  const claimable =
    workerInput.mode === "claim_next"
      ? listClaimableOpenAnswerEvaluatorJobs({ database, input: { limit: 1 }, now }).value.evaluatorJobs[0]
      : { evaluatorJobId: workerInput.evaluatorJobId };
  if (!claimable) {
    return accepted({
      summary: summarizeEvaluatorWorkerRun({
        mode: workerInput.mode,
        workerId: workerInput.workerId,
        claimed: false,
      }),
    });
  }

  const claim = claimOpenAnswerEvaluatorJob({
    database,
    generateId,
    input: {
      evaluatorJobId: claimable.evaluatorJobId,
      workerId: workerInput.workerId,
      leaseDurationSeconds: workerInput.leaseDurationSeconds,
    },
    now,
  });
  if (claim.status === "rejected") {
    return claim;
  }
  const policy = resolveOpenAnswerEvaluatorPolicy(evaluatorPolicies, claim.value.evaluatorJob);
  if (policy.status === "rejected") {
    return policy;
  }
  const adapter = resolveOpenAnswerEvaluatorProviderAdapter(providerAdapters, policy.value.policy);
  if (adapter.status === "rejected") {
    return adapter;
  }
  const attempt = getOpenAnswerAttemptRecord(database, claim.value.evaluatorJob.attemptId);
  if (!attempt) {
    return rejected("attempt_not_found");
  }
  let providerResult;
  try {
    providerResult = adapter.value.adapter.evaluate(
      buildOpenAnswerEvaluatorProviderRequest({
        attempt,
        database,
        evaluatorJob: claim.value.evaluatorJob,
        policy: policy.value.policy,
      }),
    );
  } catch {
    return failOpenAnswerEvaluatorWorkerRun({
      database,
      evaluatorJob: claim.value.evaluatorJob,
      failureReason: "provider_execution_failed",
      lease: claim.value.lease,
      mode: workerInput.mode,
      now,
      workerId: workerInput.workerId,
    });
  }
  if (isPromiseLike(providerResult)) {
    return providerResult
      .then($0 =>
        completeOpenAnswerEvaluatorWorkerRunFromProviderResult({
          claim,
          database,
          generateId,
          mode: workerInput.mode,
          now,
          policy: policy.value.policy,
          providerResult: $0,
          workerId: workerInput.workerId,
        }),
      )
      .catch(() =>
        failOpenAnswerEvaluatorWorkerRun({
          database,
          evaluatorJob: claim.value.evaluatorJob,
          failureReason: "provider_execution_failed",
          lease: claim.value.lease,
          mode: workerInput.mode,
          now,
          workerId: workerInput.workerId,
        }),
      );
  }

  return completeOpenAnswerEvaluatorWorkerRunFromProviderResult({
    claim,
    database,
    generateId,
    mode: workerInput.mode,
    now,
    policy: policy.value.policy,
    providerResult,
    workerId: workerInput.workerId,
  });
}

function completeOpenAnswerEvaluatorWorkerRunFromProviderResult({
  claim,
  database,
  generateId,
  mode,
  now,
  policy,
  providerResult,
  workerId,
}) {
  if (!isValidOpenAnswerEvaluatorProviderResult(providerResult)) {
    return failOpenAnswerEvaluatorWorkerRun({
      database,
      evaluatorJob: claim.value.evaluatorJob,
      failureReason: "provider_execution_failed",
      lease: claim.value.lease,
      mode,
      now,
      workerId,
    });
  }
  if (exceedsEvaluatorBudget(providerResult.providerUsage, claim.value.evaluatorJob.budgetPolicy)) {
    return failOpenAnswerEvaluatorWorkerRun({
      database,
      evaluatorJob: claim.value.evaluatorJob,
      failureReason: "provider_budget_exceeded",
      lease: claim.value.lease,
      mode,
      now,
      workerId,
    });
  }
  if (!isAcceptedOpenAnswerEvaluatorProviderResult(providerResult, claim.value.evaluatorJob, policy)) {
    return failOpenAnswerEvaluatorWorkerRun({
      database,
      evaluatorJob: claim.value.evaluatorJob,
      failureReason: "provider_output_rejected",
      lease: claim.value.lease,
      mode,
      now,
      workerId,
    });
  }
  if (providerResult.redactedEvidenceSummary !== undefined) {
    const evidence = recordOpenAnswerEvaluatorJobEvidence({
      database,
      generateId,
      input: {
        evaluatorJobId: claim.value.evaluatorJob.evaluatorJobId,
        leaseId: claim.value.lease.leaseId,
        workerId,
        evidenceKind: "criterion_match",
        redactedSummary: providerResult.redactedEvidenceSummary,
      },
      now,
    });
    if (evidence.status === "rejected") {
      return evidence;
    }
  }
  const completion = completeOpenAnswerEvaluatorJob({
    database,
    generateId,
    input: {
        evaluatorJobId: claim.value.evaluatorJob.evaluatorJobId,
        leaseId: claim.value.lease.leaseId,
        workerId,
        summaryFeedback: providerResult.summaryFeedback,
        criterionFeedback: providerResult.criterionFeedback,
        providerUsage: providerResult.providerUsage,
      outputValidation: providerResult.outputValidation,
    },
    now,
  });
  if (completion.status === "rejected") {
    return completion;
  }

  return accepted({
    summary: summarizeEvaluatorWorkerRun({
      mode,
      workerId,
      evaluatorJobId: claim.value.evaluatorJob.evaluatorJobId,
      claimed: true,
      completed: true,
    }),
    evaluatorJob: completion.value.evaluatorJob,
    evaluation: completion.value.evaluation,
  });
}

function isPromiseLike(value) {
  return value !== null && typeof value === "object" && typeof value.then === "function";
}

function isValidOpenAnswerEvaluatorProviderResult(providerResult) {
  return (
    providerResult !== null &&
    typeof providerResult === "object" &&
    !Array.isArray(providerResult) &&
    typeof providerResult.summaryFeedback === "string" &&
    Array.isArray(providerResult.criterionFeedback) &&
    isValidOptionalProviderUsage(providerResult.providerUsage)
  );
}

function isValidOptionalProviderUsage(providerUsage) {
  if (providerUsage === undefined) {
    return true;
  }
  if (providerUsage === null || typeof providerUsage !== "object" || Array.isArray(providerUsage)) {
    return false;
  }
  const supportedFields = new Set([
    "providerCalls",
    "inputTokens",
    "outputTokens",
    "estimatedCostMinorUnits",
  ]);
  return Object.entries(providerUsage).every(
    ([field, value]) => supportedFields.has(field) && Number.isInteger(value) && value >= 0,
  );
}

function isAcceptedOpenAnswerEvaluatorProviderResult(providerResult, evaluatorJob, policy) {
  return (
    isValidEvaluationInput(makeEvaluatorRunEvaluationInput(providerResult), evaluatorJob) &&
    providerResult.outputValidation?.validatorPolicyId === policy.outputValidatorPolicyId &&
    isPassedOutputValidation(providerResult.outputValidation) &&
    isSafeOpenAnswerEvaluatorProviderFeedback(providerResult)
  );
}

function isSafeOpenAnswerEvaluatorProviderFeedback(providerResult) {
  return (
    !containsForbiddenResponseDetail(providerResult.summaryFeedback) &&
    providerResult.criterionFeedback.every($0 => !containsForbiddenResponseDetail($0.feedback)) &&
    (providerResult.redactedEvidenceSummary === undefined ||
      (isNonEmptyText(providerResult.redactedEvidenceSummary) &&
        !containsForbiddenResponseDetail(providerResult.redactedEvidenceSummary)))
  );
}

function failOpenAnswerEvaluatorWorkerRun({
  database,
  evaluatorJob,
  failureReason,
  lease,
  mode,
  now,
  workerId,
}) {
  const failure = failOpenAnswerEvaluatorJob({
    database,
    input: {
      evaluatorJobId: evaluatorJob.evaluatorJobId,
      leaseId: lease.leaseId,
      workerId,
      reason: failureReason,
      retry: true,
    },
    now,
  });
  if (failure.status === "rejected") {
    return failure;
  }
  const retried = failure.value.evaluatorJob.status === "retry_waiting";
  return accepted({
    summary: summarizeEvaluatorWorkerRun({
      mode,
      workerId,
      evaluatorJobId: evaluatorJob.evaluatorJobId,
      claimed: true,
      retried,
      failed: !retried,
      failureReason,
    }),
    evaluatorJob: failure.value.evaluatorJob,
  });
}

function getEvaluatorWorkerInputRejection(input) {
  if (
    !isNonEmptyText(input?.workerId) ||
    !isValidLeaseDurationSeconds(input?.leaseDurationSeconds) ||
    !supportedEvaluatorWorkerModes.has(input?.mode)
  ) {
    return rejected("validation_failed");
  }
  if (input.mode === "single_job" && !isNonEmptyText(input?.evaluatorJobId)) {
    return rejected("validation_failed");
  }
  return null;
}

function resolveOpenAnswerEvaluatorPolicy(evaluatorPolicies, evaluatorJob) {
  const policy = evaluatorPolicies.find($0 => $0?.evaluatorPolicyId === evaluatorJob.evaluatorPolicyId);
  if (!policy) {
    return rejected("evaluator_policy_not_found");
  }
  if (!isValidOpenAnswerEvaluatorPolicy(policy, evaluatorJob)) {
    return rejected("validation_failed");
  }
  return accepted({ policy });
}

function isValidOpenAnswerEvaluatorPolicy(policy, evaluatorJob) {
  return (
    policy.evaluatorPathKind === evaluatorJob.evaluatorPathKind &&
    policy.rawArtifactPolicy === "none" &&
    isValidEvaluatorPromptInputPolicy(policy.promptInputPolicy) &&
    isNonEmptyText(policy.providerAdapterId) &&
    isNonEmptyText(policy.outputValidatorPolicyId) &&
    isNonEmptyText(policy.redactionPolicyId) &&
    isEquivalentEvaluatorRetryPolicy(policy.retryPolicy, evaluatorJob.retryPolicy)
  );
}

function isEquivalentEvaluatorRetryPolicy(policyRetryPolicy, jobRetryPolicy) {
  return (
    Number.isInteger(policyRetryPolicy?.maxAttempts) &&
    policyRetryPolicy.maxAttempts === jobRetryPolicy?.maxAttempts &&
    Array.isArray(policyRetryPolicy.backoffSeconds) &&
    Array.isArray(jobRetryPolicy?.backoffSeconds) &&
    policyRetryPolicy.backoffSeconds.length === jobRetryPolicy.backoffSeconds.length &&
    policyRetryPolicy.backoffSeconds.every((seconds, index) => seconds === jobRetryPolicy.backoffSeconds[index])
  );
}

function isValidEvaluatorPromptInputPolicy(promptInputPolicy) {
  return (
    promptInputPolicy?.includeSubmittedAnswer === true &&
    promptInputPolicy.includeAcceptedCheckRevision === true &&
    promptInputPolicy.includeAcceptedCriterionRevisions === true
  );
}

function resolveOpenAnswerEvaluatorProviderAdapter(providerAdapters, policy) {
  const adapter = providerAdapters.find($0 => $0?.providerAdapterId === policy.providerAdapterId);
  if (!adapter) {
    return rejected("provider_adapter_not_found");
  }
  if (adapter.evaluatorPathKind !== policy.evaluatorPathKind) {
    return rejected("validation_failed");
  }
  if (typeof adapter.evaluate !== "function") {
    return rejected("validation_failed");
  }
  return accepted({ adapter });
}

function buildOpenAnswerEvaluatorProviderRequest({ attempt, database, evaluatorJob, policy }) {
  return {
    evaluatorJobId: evaluatorJob.evaluatorJobId,
    attemptId: evaluatorJob.attemptId,
    programId: evaluatorJob.programId,
    studentIdentityId: evaluatorJob.studentIdentityId,
    checkRevisionId: evaluatorJob.checkRevisionId,
    criterionRevisionIds: [...evaluatorJob.criterionRevisionIds],
    submittedAnswer: attempt.submittedAnswer,
    acceptedCheckRevision: projectOpenAnswerCheckRevisionForProvider(
      getAcceptedOpenAnswerCheckRevisionRecord(database, evaluatorJob.checkRevisionId),
    ),
    acceptedCriterionRevisions: evaluatorJob.criterionRevisionIds.map($0 =>
      projectAssessmentCriterionRevisionForProvider(getAcceptedAssessmentCriterionRevisionRecord(database, $0)),
    ),
    evaluatorPolicyId: evaluatorJob.evaluatorPolicyId,
    outputValidatorPolicyId: policy.outputValidatorPolicyId,
  };
}

function projectOpenAnswerCheckRevisionForProvider(revision) {
  if (!revision) {
    return null;
  }
  return {
    revisionId: revision.id,
    title: revision.title,
    prompt: revision.prompt,
  };
}

function projectAssessmentCriterionRevisionForProvider(revision) {
  if (!revision) {
    return null;
  }
  return {
    revisionId: revision.id,
    title: revision.title,
    body: revision.body,
  };
}

function getClaimableEvaluatorJobRejection(evaluatorJob, at) {
  if (!evaluatorJob) {
    return rejected("evaluator_job_not_found");
  }
  if (evaluatorJob.jobStatus === "waiting") {
    return null;
  }
  if (evaluatorJob.jobStatus === "retry_waiting" && evaluatorJob.nextRetryAt <= at) {
    return null;
  }
  return rejected("evaluator_job_conflict");
}

function renewOpenAnswerEvaluatorJobLease({ database, input, now }) {
  if (
    !isNonEmptyText(input?.leaseId) ||
    !isNonEmptyText(input?.workerId) ||
    !isValidLeaseDurationSeconds(input?.leaseDurationSeconds)
  ) {
    return rejected("validation_failed");
  }
  const renewedAt = now().toISOString();
  const evaluatorJob = getOpenAnswerEvaluatorJobRecord(database, input?.evaluatorJobId);
  const leaseRejection = getRenewEvaluatorJobLeaseRejection(evaluatorJob, input, renewedAt);
  if (leaseRejection) {
    return leaseRejection;
  }

  const transition = database.transaction(() => {
    const currentJob = getOpenAnswerEvaluatorJobRecord(database, evaluatorJob.evaluatorJobId);
    const currentLeaseRejection = getRenewEvaluatorJobLeaseRejection(currentJob, input, renewedAt);
    if (currentLeaseRejection) {
      return { rejection: currentLeaseRejection };
    }
    return {
      evaluatorJob: updateOpenAnswerEvaluatorJobLease(database, {
        evaluatorJobId: currentJob.evaluatorJobId,
        leaseId: currentJob.lease.leaseId,
        workerId: currentJob.lease.workerId,
        claimedAt: currentJob.lease.claimedAt,
        expiresAt: addSecondsIso(renewedAt, input.leaseDurationSeconds),
        updatedAt: renewedAt,
      }),
    };
  })();
  if (transition.rejection) {
    return transition.rejection;
  }

  return accepted({
    evaluatorJob: summarizeEvaluatorJob(transition.evaluatorJob),
    lease: summarizeEvaluatorLease(transition.evaluatorJob.lease),
  });
}

function getRenewEvaluatorJobLeaseRejection(evaluatorJob, input, at) {
  if (!evaluatorJob) {
    return rejected("evaluator_job_not_found");
  }
  if (evaluatorJob.jobStatus !== "leased" || !evaluatorJob.lease) {
    return rejected("evaluator_job_not_claimed");
  }
  if (evaluatorJob.lease.leaseId !== input.leaseId || evaluatorJob.lease.workerId !== input.workerId) {
    return rejected("evaluator_job_lease_mismatch");
  }
  if (evaluatorJob.lease.expiresAt <= at) {
    return rejected("evaluator_job_lease_expired");
  }
  return null;
}

function getOpenAnswerEvaluatorJob({ database, input }) {
  const evaluatorJob = getOpenAnswerEvaluatorJobRecord(database, input?.evaluatorJobId);
  if (!evaluatorJob) {
    return rejected("evaluator_job_not_found");
  }

  return accepted({ evaluatorJob: summarizeEvaluatorJob(evaluatorJob) });
}

function listClaimableOpenAnswerEvaluatorJobs({ database, input, now }) {
  return accepted({
    evaluatorJobs: listClaimableOpenAnswerEvaluatorJobRecords(database, {
      now: now().toISOString(),
      limit: normalizeEvaluatorJobListLimit(input?.limit),
    }).map(summarizeEvaluatorJob),
  });
}

function normalizeEvaluatorJobListLimit(limit) {
  if (limit === undefined) {
    return 50;
  }
  if (!Number.isInteger(limit) || limit < 1) {
    return 50;
  }
  return Math.min(limit, 100);
}

function isValidLeaseDurationSeconds(value) {
  return Number.isInteger(value) && value > 0;
}

function addSecondsIso(iso, seconds) {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

function completeOpenAnswerEvaluatorJob({ database, generateId, input, now }) {
  if (!isNonEmptyText(input?.leaseId) || !isNonEmptyText(input?.workerId)) {
    return rejected("validation_failed");
  }
  const completedAt = now().toISOString();
  const evaluatorJob = getOpenAnswerEvaluatorJobRecord(database, input?.evaluatorJobId);
  const completedResult = getCompletedEvaluatorJobResult(database, evaluatorJob, input);
  if (completedResult) {
    return completedResult;
  }
  const leaseRejection = getLeasedEvidenceJobRejection(evaluatorJob, input, completedAt);
  if (leaseRejection) {
    return leaseRejection;
  }
  const inputRejection = getEvaluatorJobCompletionInputRejection(input, evaluatorJob);
  if (inputRejection) {
    return inputRejection;
  }

  const transition = database.transaction(() => {
    const currentJob = getOpenAnswerEvaluatorJobRecord(database, evaluatorJob.evaluatorJobId);
    const currentCompletedResult = getCompletedEvaluatorJobResult(database, currentJob, input);
    if (currentCompletedResult) {
      return { result: currentCompletedResult };
    }
    const currentLeaseRejection = getLeasedEvidenceJobRejection(currentJob, input, completedAt);
    if (currentLeaseRejection) {
      return { rejection: currentLeaseRejection };
    }
    const currentInputRejection = getEvaluatorJobCompletionInputRejection(input, currentJob);
    if (currentInputRejection) {
      return { rejection: currentInputRejection };
    }

    const updatedRun = updateOpenAnswerEvaluatorRunStatus(database, {
      evaluatorRunId: currentJob.evaluatorRunId,
      status: "succeeded",
      completedAt,
    });
    const updatedAttempt = updateOpenAnswerAttemptStatus(database, {
      attemptId: currentJob.attemptId,
      status: "evaluated",
      updatedAt: completedAt,
    });
    const evaluation = createOpenAnswerEvaluationRecord(database, {
      id: generateId(),
      attemptId: currentJob.attemptId,
      programId: currentJob.programId,
      studentIdentityId: currentJob.studentIdentityId,
      checkRevisionId: currentJob.checkRevisionId,
      criterionRevisionIds: currentJob.criterionRevisionIds,
      evaluatorKind: "student_workspace",
      summaryFeedback: input.summaryFeedback.trim(),
      criterionFeedback: normalizeCriterionFeedback(input.criterionFeedback),
      evaluatedAt: completedAt,
    });
    deleteOpenAnswerEvaluationFailureRecord(database, currentJob.attemptId);
    clearOpenAnswerEvaluatorJobLease(database, {
      evaluatorJobId: currentJob.evaluatorJobId,
      jobStatus: "succeeded",
      terminalCompletionSignature: makeEvaluatorJobCompletionSignature(input),
      updatedAt: completedAt,
    });
    return {
      evaluatorJob: getOpenAnswerEvaluatorJobRecord(database, currentJob.evaluatorJobId),
      evaluatorRun: updatedRun,
      evaluation,
      updated: updatedAttempt,
    };
  })();
  if (transition.result) {
    return transition.result;
  }
  if (transition.rejection) {
    return transition.rejection;
  }

  return accepted({
    attempt: summarizeAttempt(transition.updated),
    evaluatorJob: summarizeEvaluatorJob(transition.evaluatorJob),
    evaluation: summarizeEvaluation(transition.evaluation),
  });
}

function getCompletedEvaluatorJobResult(database, evaluatorJob, input) {
  if (!evaluatorJob) {
    return rejected("evaluator_job_not_found");
  }
  if (evaluatorJob.jobStatus !== "succeeded") {
    return null;
  }
  const evaluation = getOpenAnswerEvaluationRecordByAttemptId(database, evaluatorJob.attemptId);
  if (!evaluation) {
    return rejected("evaluator_job_conflict");
  }
  if (!isEquivalentCompletionInput(input, evaluatorJob, evaluation)) {
    return rejected("evaluator_job_conflict");
  }
  return accepted({
    attempt: summarizeAttempt(getOpenAnswerAttemptRecord(database, evaluatorJob.attemptId)),
    evaluatorJob: summarizeEvaluatorJob(evaluatorJob),
    evaluation: summarizeEvaluation(evaluation),
  });
}

function getEvaluatorJobCompletionInputRejection(input, evaluatorJob) {
  if (!isValidEvaluationInput(makeEvaluatorRunEvaluationInput(input), evaluatorJob)) {
    return rejected("validation_failed");
  }
  if (exceedsEvaluatorBudget(input?.providerUsage, evaluatorJob.budgetPolicy)) {
    return rejected("evaluator_budget_exceeded");
  }
  if (evaluatorJob.evaluatorPathKind === "llm_assisted" && !isPassedOutputValidation(input?.outputValidation)) {
    return rejected("evaluator_output_rejected");
  }
  return null;
}

function isEquivalentCompletionInput(input, evaluatorJob, evaluation) {
  return (
    isValidEvaluationInput(makeEvaluatorRunEvaluationInput(input), evaluatorJob) &&
    input.summaryFeedback.trim() === evaluation.summaryFeedback &&
    JSON.stringify(normalizeCriterionFeedback(input.criterionFeedback)) ===
      JSON.stringify(evaluation.criterionFeedback) &&
    JSON.stringify(makeEvaluatorJobCompletionSignature(input)) ===
      JSON.stringify(evaluatorJob.terminalCompletionSignature)
  );
}

function makeEvaluatorJobCompletionSignature(input) {
  return {
    leaseId: input.leaseId,
    workerId: input.workerId,
    providerUsage: normalizeProviderUsage(input.providerUsage),
    outputValidation: normalizeOutputValidation(input.outputValidation),
  };
}

function normalizeProviderUsage(providerUsage) {
  if (providerUsage === undefined) {
    return null;
  }
  return {
    ...(providerUsage.providerCalls !== undefined ? { providerCalls: providerUsage.providerCalls } : {}),
    ...(providerUsage.inputTokens !== undefined ? { inputTokens: providerUsage.inputTokens } : {}),
    ...(providerUsage.outputTokens !== undefined ? { outputTokens: providerUsage.outputTokens } : {}),
    ...(providerUsage.estimatedCostMinorUnits !== undefined
      ? { estimatedCostMinorUnits: providerUsage.estimatedCostMinorUnits }
      : {}),
  };
}

function normalizeOutputValidation(outputValidation) {
  if (outputValidation === undefined) {
    return null;
  }
  return {
    validatorPolicyId: outputValidation.validatorPolicyId,
    passed: outputValidation.passed,
  };
}

function exceedsEvaluatorBudget(providerUsage, budgetPolicy) {
  if (!budgetPolicy || !providerUsage) {
    return false;
  }
  return (
    exceedsBudgetField(providerUsage.providerCalls, budgetPolicy.maxProviderCalls) ||
    exceedsBudgetField(providerUsage.inputTokens, budgetPolicy.maxInputTokens) ||
    exceedsBudgetField(providerUsage.outputTokens, budgetPolicy.maxOutputTokens) ||
    exceedsBudgetField(providerUsage.estimatedCostMinorUnits, budgetPolicy.maxEstimatedCostMinorUnits)
  );
}

function exceedsBudgetField(value, limit) {
  return limit !== undefined && Number.isInteger(value) && value > limit;
}

function isPassedOutputValidation(outputValidation) {
  return isNonEmptyText(outputValidation?.validatorPolicyId) && outputValidation.passed === true;
}

function failOpenAnswerEvaluatorJob({ database, input, now }) {
  if (!isNonEmptyText(input?.reason) || typeof input?.retry !== "boolean") {
    return rejected("validation_failed");
  }
  const failedAt = now().toISOString();
  const evaluatorJob = getOpenAnswerEvaluatorJobRecord(database, input?.evaluatorJobId);
  const leaseRejection = getLeasedEvidenceJobRejection(evaluatorJob, input, failedAt);
  if (leaseRejection) {
    return leaseRejection;
  }

  const transition = database.transaction(() => {
    const currentJob = getOpenAnswerEvaluatorJobRecord(database, evaluatorJob.evaluatorJobId);
    const currentLeaseRejection = getLeasedEvidenceJobRejection(currentJob, input, failedAt);
    if (currentLeaseRejection) {
      return { rejection: currentLeaseRejection };
    }
    const currentRun = getOpenAnswerEvaluatorRunRecord(database, currentJob.evaluatorRunId);
    const reason = input.reason.trim();
    const retryRemaining = input.retry && currentJob.attemptNumber < currentJob.retryPolicy.maxAttempts;
    if (retryRemaining) {
      const nextAttemptNumber = currentJob.attemptNumber + 1;
      const backoffSeconds = currentJob.retryPolicy.backoffSeconds[currentJob.attemptNumber - 1] ?? 0;
      const updatedJob = updateOpenAnswerEvaluatorJobRecovery(database, {
        evaluatorJobId: currentJob.evaluatorJobId,
        runStatus: "failed",
        jobStatus: "retry_waiting",
        failedAt,
        failureReason: reason,
        attemptNumber: nextAttemptNumber,
        nextRetryAt: addSecondsIso(failedAt, backoffSeconds),
        jobFailureReason: reason,
      });
      return {
        evaluatorJob: updatedJob,
        updated: updateOpenAnswerAttemptStatus(database, {
          attemptId: currentJob.attemptId,
          status: "evaluating",
          updatedAt: failedAt,
        }),
      };
    }

    const updatedJob = updateOpenAnswerEvaluatorJobRecovery(database, {
      evaluatorJobId: currentJob.evaluatorJobId,
      runStatus: "failed",
      jobStatus: "failed",
      failedAt,
      failureReason: reason,
      attemptNumber: currentJob.attemptNumber,
      jobFailureReason: reason,
    });
    const updated = updateOpenAnswerAttemptStatus(database, {
      attemptId: currentJob.attemptId,
      status: "evaluation_failed",
      updatedAt: failedAt,
    });
    const failure = createOpenAnswerEvaluationFailureRecord(database, {
      attemptId: currentRun.attemptId,
      reason,
      failedAt,
    });
    return { evaluatorJob: updatedJob, evaluationFailure: failure, updated };
  })();
  if (transition.rejection) {
    return transition.rejection;
  }

  return accepted({
    attempt: summarizeAttempt(transition.updated),
    evaluatorJob: summarizeEvaluatorJob(transition.evaluatorJob),
    ...(transition.evaluationFailure
      ? { evaluationFailure: summarizeEvaluationFailure(transition.evaluationFailure) }
      : {}),
  });
}

function cancelOpenAnswerEvaluatorJob({ database, input, now }) {
  if (!isNonEmptyText(input?.reason)) {
    return rejected("validation_failed");
  }
  const cancelledAt = now().toISOString();
  const evaluatorJob = getOpenAnswerEvaluatorJobRecord(database, input?.evaluatorJobId);
  const jobRejection = getCancellableEvaluatorJobRejection(evaluatorJob);
  if (jobRejection) {
    return jobRejection;
  }

  const transition = database.transaction(() => {
    const currentJob = getOpenAnswerEvaluatorJobRecord(database, evaluatorJob.evaluatorJobId);
    const currentJobRejection = getCancellableEvaluatorJobRejection(currentJob);
    if (currentJobRejection) {
      return { rejection: currentJobRejection };
    }
    const currentRun = getOpenAnswerEvaluatorRunRecord(database, currentJob.evaluatorRunId);
    const reason = input.reason.trim();
    const updatedJob = updateOpenAnswerEvaluatorJobRecovery(database, {
      evaluatorJobId: currentJob.evaluatorJobId,
      runStatus: "cancelled",
      jobStatus: "cancelled",
      failedAt: cancelledAt,
      failureReason: reason,
      attemptNumber: currentJob.attemptNumber,
      cancellationReason: reason,
    });
    const restored = restoreAttemptAfterEvaluatorCancellation(database, currentRun, cancelledAt);
    return { evaluatorJob: updatedJob, updated: restored };
  })();
  if (transition.rejection) {
    return transition.rejection;
  }

  return accepted({
    attempt: summarizeAttempt(transition.updated),
    evaluatorJob: summarizeEvaluatorJob(transition.evaluatorJob),
  });
}

function getCancellableEvaluatorJobRejection(evaluatorJob) {
  if (!evaluatorJob) {
    return rejected("evaluator_job_not_found");
  }
  if (["succeeded", "failed", "cancelled", "timed_out"].includes(evaluatorJob.jobStatus)) {
    return rejected("evaluator_job_conflict");
  }
  return null;
}

function restoreAttemptAfterEvaluatorCancellation(database, evaluatorRun, cancelledAt) {
  const restoredStatus = evaluatorRun.priorFailureReason ? "evaluation_failed" : "submitted";
  const updated = updateOpenAnswerAttemptStatus(database, {
    attemptId: evaluatorRun.attemptId,
    status: restoredStatus,
    updatedAt: cancelledAt,
  });
  deleteOpenAnswerEvaluationFailureRecord(database, evaluatorRun.attemptId);
  if (evaluatorRun.priorFailureReason) {
    createOpenAnswerEvaluationFailureRecord(database, {
      attemptId: evaluatorRun.attemptId,
      reason: evaluatorRun.priorFailureReason,
      failedAt: evaluatorRun.priorFailedAt,
    });
  }
  return updated;
}

function timeOutOpenAnswerEvaluatorJob({ database, input, now }) {
  if (!isNonEmptyText(input?.reason)) {
    return rejected("validation_failed");
  }
  const timedOutAt = now().toISOString();
  const evaluatorJob = getOpenAnswerEvaluatorJobRecord(database, input?.evaluatorJobId);
  const timeoutRejection = getTimeoutEvaluatorJobRejection(evaluatorJob, timedOutAt);
  if (timeoutRejection) {
    return timeoutRejection;
  }

  const transition = database.transaction(() => {
    const currentJob = getOpenAnswerEvaluatorJobRecord(database, evaluatorJob.evaluatorJobId);
    const currentTimeoutRejection = getTimeoutEvaluatorJobRejection(currentJob, timedOutAt);
    if (currentTimeoutRejection) {
      return { rejection: currentTimeoutRejection };
    }
    const reason = input.reason.trim();
    const updatedJob = updateOpenAnswerEvaluatorJobRecovery(database, {
      evaluatorJobId: currentJob.evaluatorJobId,
      runStatus: "failed",
      jobStatus: "timed_out",
      failedAt: timedOutAt,
      failureReason: reason,
      attemptNumber: currentJob.attemptNumber,
      timeoutReason: reason,
    });
    const updated = updateOpenAnswerAttemptStatus(database, {
      attemptId: currentJob.attemptId,
      status: "evaluation_failed",
      updatedAt: timedOutAt,
    });
    const failure = createOpenAnswerEvaluationFailureRecord(database, {
      attemptId: currentJob.attemptId,
      reason,
      failedAt: timedOutAt,
    });
    return { evaluatorJob: updatedJob, evaluationFailure: failure, updated };
  })();
  if (transition.rejection) {
    return transition.rejection;
  }

  return accepted({
    attempt: summarizeAttempt(transition.updated),
    evaluatorJob: summarizeEvaluatorJob(transition.evaluatorJob),
    evaluationFailure: summarizeEvaluationFailure(transition.evaluationFailure),
  });
}

function getTimeoutEvaluatorJobRejection(evaluatorJob, at) {
  if (!evaluatorJob) {
    return rejected("evaluator_job_not_found");
  }
  if (["succeeded", "failed", "cancelled", "timed_out"].includes(evaluatorJob.jobStatus)) {
    return rejected("evaluator_job_conflict");
  }
  if (evaluatorJob.jobStatus !== "leased" || !evaluatorJob.lease) {
    return rejected("evaluator_job_not_claimed");
  }
  if (evaluatorJob.lease.expiresAt > at) {
    return rejected("evaluator_job_lease_active");
  }
  return null;
}

function recordOpenAnswerEvaluatorJobEvidence({ database, generateId, input, now }) {
  if (
    !isNonEmptyText(input?.leaseId) ||
    !isNonEmptyText(input?.workerId) ||
    !isValidEvaluatorEvidenceInput(input)
  ) {
    return rejected("validation_failed");
  }
  const recordedAt = now().toISOString();
  const evaluatorJob = getOpenAnswerEvaluatorJobRecord(database, input?.evaluatorJobId);
  const leaseRejection = getLeasedEvidenceJobRejection(evaluatorJob, input, recordedAt);
  if (leaseRejection) {
    return leaseRejection;
  }

  const transition = database.transaction(() => {
    const currentJob = getOpenAnswerEvaluatorJobRecord(database, evaluatorJob.evaluatorJobId);
    const currentLeaseRejection = getLeasedEvidenceJobRejection(currentJob, input, recordedAt);
    if (currentLeaseRejection) {
      return { rejection: currentLeaseRejection };
    }
    const evidence = createOpenAnswerEvaluatorEvidenceRecord(database, {
      id: generateId(),
      evaluatorRunId: currentJob.evaluatorRunId,
      attemptId: currentJob.attemptId,
      evidenceKind: input.evidenceKind.trim(),
      redactedSummary: input.redactedSummary?.trim() ?? null,
      recordedAt,
    });
    updateOpenAnswerEvaluatorJobLease(database, {
      evaluatorJobId: currentJob.evaluatorJobId,
      leaseId: currentJob.lease.leaseId,
      workerId: currentJob.lease.workerId,
      claimedAt: currentJob.lease.claimedAt,
      expiresAt: currentJob.lease.expiresAt,
      updatedAt: recordedAt,
    });
    return { evidence };
  })();
  if (transition.rejection) {
    return transition.rejection;
  }

  return accepted({ evidence: summarizeEvaluatorEvidence(transition.evidence) });
}

function getLeasedEvidenceJobRejection(evaluatorJob, input, at) {
  if (!evaluatorJob) {
    return rejected("evaluator_job_not_found");
  }
  if (["succeeded", "failed", "cancelled", "timed_out"].includes(evaluatorJob.jobStatus)) {
    return rejected("evaluator_job_conflict");
  }
  return getRenewEvaluatorJobLeaseRejection(evaluatorJob, input, at);
}

function recordOpenAnswerEvaluatorEvidence({ database, generateId, input, now }) {
  const evaluatorRun = getOpenAnswerEvaluatorRunRecord(database, input?.evaluatorRunId);
  const evaluatorRunRejection = getRunningEvaluatorRunRejection(evaluatorRun);
  if (evaluatorRunRejection) {
    return evaluatorRunRejection;
  }
  if (!isValidEvaluatorEvidenceInput(input)) {
    return rejected("validation_failed");
  }
  const recordedAt = now().toISOString();
  const transition = database.transaction(() => {
    const currentRun = getOpenAnswerEvaluatorRunRecord(database, evaluatorRun.id);
    const currentRunRejection = getRunningEvaluatorRunRejection(currentRun);
    if (currentRunRejection) {
      return { rejection: currentRunRejection };
    }
    const evidence = createOpenAnswerEvaluatorEvidenceRecord(database, {
      id: generateId(),
      evaluatorRunId: currentRun.id,
      attemptId: currentRun.attemptId,
      evidenceKind: input.evidenceKind.trim(),
      redactedSummary: input.redactedSummary?.trim() ?? null,
      recordedAt,
    });
    return { evidence };
  })();
  if (transition.rejection) {
    return transition.rejection;
  }

  return accepted({ evidence: summarizeEvaluatorEvidence(transition.evidence) });
}

function isValidEvaluatorEvidenceInput(input) {
  return (
    isNonEmptyText(input?.evidenceKind) &&
    (input?.redactedSummary === undefined ||
      (isNonEmptyText(input.redactedSummary) &&
        !containsForbiddenResponseDetail(input.redactedSummary)))
  );
}

function getRunningEvaluatorRunRejection(evaluatorRun) {
  if (!evaluatorRun) {
    return rejected("evaluator_run_not_found");
  }
  if (evaluatorRun.status !== "running") {
    return rejected("evaluator_run_conflict");
  }
  return null;
}

function completeOpenAnswerEvaluatorRun({ database, generateId, input, now }) {
  const evaluatorRun = getOpenAnswerEvaluatorRunRecord(database, input?.evaluatorRunId);
  const evaluatorRunRejection = getRunningEvaluatorRunRejection(evaluatorRun);
  if (evaluatorRunRejection) {
    return evaluatorRunRejection;
  }
  if (!isValidEvaluationInput(makeEvaluatorRunEvaluationInput(input), evaluatorRun)) {
    return rejected("validation_failed");
  }

  const completedAt = now().toISOString();
  const transition = database.transaction(() => {
    const currentRun = getOpenAnswerEvaluatorRunRecord(database, evaluatorRun.id);
    const currentRunRejection = getRunningEvaluatorRunRejection(currentRun);
    if (currentRunRejection) {
      return { rejection: currentRunRejection };
    }
    const updatedRun = updateOpenAnswerEvaluatorRunStatus(database, {
      evaluatorRunId: currentRun.id,
      status: "succeeded",
      completedAt,
    });
    const updatedAttempt = updateOpenAnswerAttemptStatus(database, {
      attemptId: currentRun.attemptId,
      status: "evaluated",
      updatedAt: completedAt,
    });
    const evaluation = createOpenAnswerEvaluationRecord(database, {
      id: generateId(),
      attemptId: currentRun.attemptId,
      programId: currentRun.programId,
      studentIdentityId: currentRun.studentIdentityId,
      checkRevisionId: currentRun.checkRevisionId,
      criterionRevisionIds: currentRun.criterionRevisionIds,
      evaluatorKind: "student_workspace",
      summaryFeedback: input.summaryFeedback.trim(),
      criterionFeedback: normalizeCriterionFeedback(input.criterionFeedback),
      evaluatedAt: completedAt,
    });
    deleteOpenAnswerEvaluationFailureRecord(database, currentRun.attemptId);
    return { evaluatorRun: updatedRun, evaluation, updated: updatedAttempt };
  })();
  if (transition.rejection) {
    return transition.rejection;
  }

  return accepted({
    attempt: summarizeAttempt(transition.updated),
    evaluatorRun: summarizeEvaluatorRun(transition.evaluatorRun),
    evaluation: summarizeEvaluation(transition.evaluation),
  });
}

function makeEvaluatorRunEvaluationInput(input) {
  return {
    evaluatorKind: "student_workspace",
    summaryFeedback: input?.summaryFeedback,
    criterionFeedback: input?.criterionFeedback,
  };
}

function failOpenAnswerEvaluatorRun({ database, input, now }) {
  const evaluatorRun = getOpenAnswerEvaluatorRunRecord(database, input?.evaluatorRunId);
  const evaluatorRunRejection = getRunningEvaluatorRunRejection(evaluatorRun);
  if (evaluatorRunRejection) {
    return evaluatorRunRejection;
  }
  if (!isNonEmptyText(input?.reason)) {
    return rejected("validation_failed");
  }

  const failedAt = now().toISOString();
  const transition = database.transaction(() => {
    const currentRun = getOpenAnswerEvaluatorRunRecord(database, evaluatorRun.id);
    const currentRunRejection = getRunningEvaluatorRunRejection(currentRun);
    if (currentRunRejection) {
      return { rejection: currentRunRejection };
    }
    const reason = input.reason.trim();
    const updatedRun = updateOpenAnswerEvaluatorRunStatus(database, {
      evaluatorRunId: currentRun.id,
      status: "failed",
      failedAt,
      failureReason: reason,
    });
    const updatedAttempt = updateOpenAnswerAttemptStatus(database, {
      attemptId: currentRun.attemptId,
      status: "evaluation_failed",
      updatedAt: failedAt,
    });
    const failure = createOpenAnswerEvaluationFailureRecord(database, {
      attemptId: currentRun.attemptId,
      reason,
      failedAt,
    });
    return { evaluatorRun: updatedRun, evaluationFailure: failure, updated: updatedAttempt };
  })();
  if (transition.rejection) {
    return transition.rejection;
  }

  return accepted({
    attempt: summarizeAttempt(transition.updated),
    evaluatorRun: summarizeEvaluatorRun(transition.evaluatorRun),
    evaluationFailure: summarizeEvaluationFailure(transition.evaluationFailure),
  });
}

function cancelOpenAnswerEvaluatorRun({ database, input, now }) {
  const evaluatorRun = getOpenAnswerEvaluatorRunRecord(database, input?.evaluatorRunId);
  const evaluatorRunRejection = getRunningEvaluatorRunRejection(evaluatorRun);
  if (evaluatorRunRejection) {
    return evaluatorRunRejection;
  }
  if (!isNonEmptyText(input?.reason)) {
    return rejected("validation_failed");
  }

  const cancelledAt = now().toISOString();
  const transition = database.transaction(() => {
    const currentRun = getOpenAnswerEvaluatorRunRecord(database, evaluatorRun.id);
    const currentRunRejection = getRunningEvaluatorRunRejection(currentRun);
    if (currentRunRejection) {
      return { rejection: currentRunRejection };
    }
    const updatedRun = updateOpenAnswerEvaluatorRunStatus(database, {
      evaluatorRunId: currentRun.id,
      status: "cancelled",
      failedAt: cancelledAt,
      failureReason: input.reason.trim(),
    });
    const restoredStatus = currentRun.priorFailureReason ? "evaluation_failed" : "submitted";
    const updatedAttempt = updateOpenAnswerAttemptStatus(database, {
      attemptId: currentRun.attemptId,
      status: restoredStatus,
      updatedAt: cancelledAt,
    });
    deleteOpenAnswerEvaluationFailureRecord(database, currentRun.attemptId);
    if (currentRun.priorFailureReason) {
      createOpenAnswerEvaluationFailureRecord(database, {
        attemptId: currentRun.attemptId,
        reason: currentRun.priorFailureReason,
        failedAt: currentRun.priorFailedAt,
      });
    }
    return { evaluatorRun: updatedRun, updated: updatedAttempt };
  })();
  if (transition.rejection) {
    return transition.rejection;
  }

  return accepted({
    attempt: summarizeAttempt(transition.updated),
    evaluatorRun: summarizeEvaluatorRun(transition.evaluatorRun),
  });
}

function getOpenAnswerAttempt({ database, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return rejected("identity_not_active");
  }

  const attempt = getOpenAnswerAttemptRecord(database, input?.attemptId);
  if (!attempt || attempt.studentIdentityId !== identity.id) {
    return rejected("attempt_not_found");
  }

  return accepted(summarizeAttemptDetail(database, attempt));
}

function getQuickCheckAttempt({ database, getEffectiveParticipation, input }) {
  const attempt = getQuickCheckAttemptRecord(database, input?.attemptId);
  if (!attempt) {
    return rejected("attempt_not_found");
  }

  const authorization = authorizeStudentProgram({
    database,
    getEffectiveParticipation,
    input: { ...input, programId: input?.programId ?? attempt.programId },
  });
  if (authorization.rejection) {
    return authorization.rejection;
  }

  const { identity, program } = authorization;
  if (!attempt || attempt.programId !== program.id || attempt.studentIdentityId !== identity.id) {
    return rejected("attempt_not_found");
  }

  return accepted({ quickCheckAttempt: summarizeQuickCheckAttempt(attempt) });
}

function getReadinessCheckAttempt({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return rejected("identity_not_active");
  }

  const attempt = getReadinessCheckAttemptRecord(database, input?.attemptId);
  if (!attempt || attempt.studentIdentityId !== identity.id) {
    return rejected("attempt_not_found");
  }

  const authorization = authorizeStudentProgram({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: attempt.programId },
  });
  if (authorization.rejection) {
    return authorization.rejection;
  }

  return accepted({ readinessCheckAttempt: summarizeReadinessCheckAttempt(attempt) });
}

function getOpenAnswerEvaluationStatus({ database, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return rejected("identity_not_active");
  }

  const attempt = getOpenAnswerAttemptRecord(database, input?.attemptId);
  if (!attempt || attempt.studentIdentityId !== identity.id) {
    return rejected("attempt_not_found");
  }

  return accepted(summarizeEvaluationStatus(database, attempt));
}

function listOpenAnswerEvaluatorEvidence({ database, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return rejected("identity_not_active");
  }

  const evaluatorRun = getOpenAnswerEvaluatorRunRecord(database, input?.evaluatorRunId);
  if (!evaluatorRun) {
    return rejected("evaluator_run_not_found");
  }
  if (evaluatorRun.studentIdentityId !== identity.id) {
    return rejected("attempt_not_found");
  }

  return accepted({
    evidence: listOpenAnswerEvaluatorEvidenceRecords(database, {
      evaluatorRunId: evaluatorRun.id,
    }).map(summarizeEvaluatorEvidence),
  });
}

function getLearnerStateProgramSummary({ database, getEffectiveParticipation, input, now }) {
  const authorization = authorizeStudentProgram({
    database,
    getEffectiveParticipation,
    input,
  });
  if (authorization.rejection) {
    return authorization.rejection;
  }

  const model = buildLearnerStateModel({
    database,
    programId: authorization.program.id,
    studentIdentityId: authorization.identity.id,
  });

  return accepted({
    learnerState: summarizeLearnerStateProgram({
      generatedAt: now().toISOString(),
      model,
      programId: authorization.program.id,
      studentIdentityId: authorization.identity.id,
    }),
  });
}

function getLearnerStateTargetDetail({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return rejected("identity_not_active");
  }

  const targetResolution = resolveLearnerStateTarget(database, {
    targetKind: input?.targetKind,
    targetId: input?.targetId,
  });
  if (targetResolution.status === "rejected") {
    return rejected(targetResolution.reason);
  }

  const participation = getEffectiveParticipation({
    identityId: identity.id,
    programId: targetResolution.target.programId,
    participationKind: "student",
  });
  if (!participation.allowed) {
    return rejected("learner_state_target_not_found");
  }

  const model = buildLearnerStateModel({
    database,
    programId: targetResolution.target.programId,
    studentIdentityId: identity.id,
  });
  const summary = model.summariesByKey.get(learnerStateTargetKey(input.targetKind, input.targetId));
  if (!summary) {
    return rejected("learner_state_target_not_found");
  }

  return accepted({
    learnerStateTarget: {
      ...summary,
      evidence: getLearnerStateTargetEvidence(model, summary).map(summarizeLearnerEvidence),
    },
  });
}

function listReadinessCheckDeliveries({ database, getEffectiveParticipation, input }) {
  const authorization = authorizeStudentProgram({
    database,
    getEffectiveParticipation,
    input,
  });
  if (authorization.rejection) {
    return authorization.rejection;
  }

  return accepted({
    readinessChecks: listAcceptedReadinessCheckEntityRecords(database, {
      programId: authorization.program.id,
      status: "active",
    })
      .map($0 => getAcceptedReadinessCheckRevisionRecord(database, $0.currentRevisionId))
      .filter($0 => $0 !== null)
      .map(summarizeReadinessCheckDelivery),
  });
}

function listOpenAnswerAttempts({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return rejected("identity_not_active");
  }

  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return rejected("program_not_found");
  }

  const participation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "student",
  });
  if (!participation.allowed) {
    return rejected("participation_required");
  }

  if (input?.status !== undefined && !supportedAttemptStatuses.has(input.status)) {
    return rejected("validation_failed");
  }
  if (input?.checkRevisionId !== undefined && !isNonEmptyText(input.checkRevisionId)) {
    return rejected("validation_failed");
  }

  return accepted({
    attempts: listOpenAnswerAttemptRecords(database, {
      programId: program.id,
      studentIdentityId: identity.id,
      status: input?.status ?? null,
      checkRevisionId: input?.checkRevisionId ?? null,
    }).map(summarizeAttempt),
  });
}

function listQuickCheckAttempts({ database, getEffectiveParticipation, input }) {
  const authorization = authorizeStudentProgram({
    database,
    getEffectiveParticipation,
    input,
  });
  if (authorization.rejection) {
    return authorization.rejection;
  }

  const { identity, program } = authorization;
  let checkRevisionId = null;
  if (input?.checkRevisionId !== undefined) {
    if (!isNonEmptyText(input.checkRevisionId)) {
      return rejected("validation_failed");
    }
    const resolution = resolveAcceptedQuickCheckRevisionForEvaluation({
      database,
      programId: program.id,
      revisionId: input.checkRevisionId,
    });
    if (resolution.status === "rejected") {
      return rejected(resolution.reason);
    }
    checkRevisionId = resolution.value.acceptedQuickCheck.revisionId;
  }

  return accepted({
    quickCheckAttempts: listQuickCheckAttemptRecords(database, {
      programId: program.id,
      studentIdentityId: identity.id,
      checkRevisionId,
    }).map(summarizeQuickCheckAttempt),
  });
}

function listReadinessCheckAttempts({ database, getEffectiveParticipation, input }) {
  const authorization = authorizeStudentProgram({
    database,
    getEffectiveParticipation,
    input,
  });
  if (authorization.rejection) {
    return authorization.rejection;
  }

  const { identity, program } = authorization;
  let readinessCheckRevisionId = null;
  if (input?.readinessCheckRevisionId !== undefined) {
    if (!isNonEmptyText(input.readinessCheckRevisionId)) {
      return rejected("validation_failed");
    }
    const revision = getAcceptedReadinessCheckRevisionRecord(database, input.readinessCheckRevisionId);
    if (!revision) {
      return rejected("readiness_revision_not_found");
    }
    if (revision.programId !== program.id) {
      return rejected("readiness_revision_program_mismatch");
    }
    readinessCheckRevisionId = revision.id;
  }

  return accepted({
    readinessCheckAttempts: listReadinessCheckAttemptRecords(database, {
      programId: program.id,
      studentIdentityId: identity.id,
      readinessCheckRevisionId,
    }).map(summarizeReadinessCheckAttempt),
  });
}

function markOpenAnswerAttemptEvaluating({ database, input, now }) {
  const attempt = getOpenAnswerAttemptRecord(database, input?.attemptId);
  if (!attempt) {
    return rejected("attempt_not_found");
  }
  if (attempt.status === "evaluating") {
    return rejected("attempt_already_evaluating");
  }
  if (attempt.status === "evaluated") {
    return rejected("attempt_already_evaluated");
  }

  const updatedAt = now().toISOString();
  const updated = database.transaction(() => {
    const updatedAttempt = updateOpenAnswerAttemptStatus(database, {
      attemptId: attempt.id,
      status: "evaluating",
      updatedAt,
    });
    deleteOpenAnswerEvaluationFailureRecord(database, attempt.id);
    return updatedAttempt;
  })();

  return accepted({ attempt: summarizeAttempt(updated) });
}

function recordOpenAnswerEvaluation({ database, generateId, input, now }) {
  const attempt = getOpenAnswerAttemptRecord(database, input?.attemptId);
  if (!attempt) {
    return rejected("attempt_not_found");
  }
  if (attempt.status === "evaluated") {
    return rejected("attempt_already_evaluated");
  }
  if (!isValidEvaluationInput(input, attempt)) {
    return rejected("validation_failed");
  }

  const evaluatedAt = now().toISOString();
  const { updated, evaluation } = database.transaction(() => {
    const updatedAttempt = updateOpenAnswerAttemptStatus(database, {
      attemptId: attempt.id,
      status: "evaluated",
      updatedAt: evaluatedAt,
    });
    const evaluationRecord = createOpenAnswerEvaluationRecord(database, {
      id: generateId(),
      attemptId: attempt.id,
      programId: attempt.programId,
      studentIdentityId: attempt.studentIdentityId,
      checkRevisionId: attempt.checkRevisionId,
      criterionRevisionIds: attempt.criterionRevisionIds,
      evaluatorKind: input.evaluatorKind,
      summaryFeedback: input.summaryFeedback.trim(),
      criterionFeedback: normalizeCriterionFeedback(input.criterionFeedback),
      evaluatedAt,
    });
    deleteOpenAnswerEvaluationFailureRecord(database, attempt.id);
    return { updated: updatedAttempt, evaluation: evaluationRecord };
  })();

  return accepted({
    attempt: summarizeAttempt(updated),
    evaluation: summarizeEvaluation(evaluation),
  });
}

function recordOpenAnswerEvaluationFailure({ database, input, now }) {
  const attempt = getOpenAnswerAttemptRecord(database, input?.attemptId);
  if (!attempt) {
    return rejected("attempt_not_found");
  }
  if (!isNonEmptyText(input?.reason)) {
    return rejected("validation_failed");
  }
  if (attempt.status === "evaluated") {
    return rejected("attempt_already_evaluated");
  }

  const failedAt = now().toISOString();
  const { updated, failure } = database.transaction(() => {
    const updatedAttempt = updateOpenAnswerAttemptStatus(database, {
      attemptId: attempt.id,
      status: "evaluation_failed",
      updatedAt: failedAt,
    });
    const failureRecord = createOpenAnswerEvaluationFailureRecord(database, {
      attemptId: attempt.id,
      reason: input.reason.trim(),
      failedAt,
    });
    return { updated: updatedAttempt, failure: failureRecord };
  })();

  return accepted({
    attempt: summarizeAttempt(updated),
    evaluationFailure: summarizeEvaluationFailure(failure),
  });
}

function submitQuickCheckAttempt({ database, generateId, getEffectiveParticipation, input, now }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return rejected("identity_not_active");
  }

  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return rejected("program_not_found");
  }

  const participation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "student",
  });
  if (!participation.allowed) {
    return rejected("participation_required");
  }

  const resolution = resolveAcceptedQuickCheckRevisionForEvaluation({
    database,
    programId: program.id,
    revisionId: input?.checkRevisionId,
  });
  if (resolution.status === "rejected") {
    return rejected(resolution.reason);
  }

  if (!isNonEmptyText(input?.selectedOptionId) || !isNonEmptyText(input?.idempotencyKey)) {
    return rejected("validation_failed");
  }

  const revision = resolution.value.acceptedQuickCheck;
  const selectedOptionId = input.selectedOptionId.trim();
  const selectedOption = revision.options.find($0 => $0.optionId === selectedOptionId);
  if (!selectedOption) {
    return rejected("selected_option_not_found");
  }
  const existing = findIdempotentQuickCheckAttempt(database, {
    programId: program.id,
    studentIdentityId: identity.id,
    checkRevisionId: revision.revisionId,
    idempotencyKey: input.idempotencyKey,
  });
  const matched = selectedOptionId === revision.answerKeyOptionId;
  if (existing) {
    if (existing.selectedOptionId === selectedOptionId && existing.matched === matched) {
      return accepted({ quickCheckAttempt: summarizeQuickCheckAttempt(existing) });
    }
    return rejected("idempotency_conflict");
  }

  try {
    const attempt = createQuickCheckAttemptRecord(database, {
      id: generateId(),
      programId: program.id,
      studentIdentityId: identity.id,
      checkRevisionId: revision.revisionId,
      selectedOptionId,
      matched,
      idempotencyKey: input.idempotencyKey,
      submittedAt: now().toISOString(),
    });

    return accepted({ quickCheckAttempt: summarizeQuickCheckAttempt(attempt) });
  } catch (error) {
    if (error instanceof StorageInvariantError) {
      return rejected(mapQuickCheckAttemptStorageRejection(error.reason));
    }
    throw error;
  }
}

function submitReadinessCheckAttempt({ database, generateId, getEffectiveParticipation, input, now }) {
  const authorization = authorizeStudentProgram({
    database,
    getEffectiveParticipation,
    input,
  });
  if (authorization.rejection) {
    return authorization.rejection;
  }

  if (!isNonEmptyText(input?.readinessCheckRevisionId) || !isNonEmptyText(input?.idempotencyKey)) {
    return rejected("validation_failed");
  }

  const revision = getAcceptedReadinessCheckRevisionRecord(database, input.readinessCheckRevisionId);
  if (!revision) {
    return rejected("readiness_revision_not_found");
  }
  if (revision.programId !== authorization.program.id) {
    return rejected("readiness_revision_program_mismatch");
  }

  const model = buildLearnerStateModel({
    database,
    programId: authorization.program.id,
    studentIdentityId: authorization.identity.id,
  });
  const requirementResults = revision.requirements.map($0 => makeReadinessRequirementResult(model, $0));
  const result = deriveReadinessAttemptResult(requirementResults);
  const existing = findIdempotentReadinessCheckAttempt(database, {
    programId: authorization.program.id,
    readinessCheckRevisionId: revision.id,
    studentIdentityId: authorization.identity.id,
    idempotencyKey: input.idempotencyKey,
  });
  if (existing) {
    if (
      existing.result === result
      && JSON.stringify(existing.requirementResults) === JSON.stringify(requirementResults)
    ) {
      return accepted({ readinessCheckAttempt: summarizeReadinessCheckAttempt(existing) });
    }
    return rejected("idempotency_conflict");
  }

  try {
    const attempt = createReadinessCheckAttemptRecord(database, {
      id: generateId(),
      programId: authorization.program.id,
      studentIdentityId: authorization.identity.id,
      readinessCheckRevisionId: revision.id,
      result,
      requirementResults,
      idempotencyKey: input.idempotencyKey,
      submittedAt: now().toISOString(),
    });

    return accepted({ readinessCheckAttempt: summarizeReadinessCheckAttempt(attempt) });
  } catch (error) {
    if (error instanceof StorageInvariantError) {
      return rejected(mapReadinessAttemptStorageRejection(error.reason));
    }
    throw error;
  }
}

function submitOpenAnswerAttempt({ database, generateId, getEffectiveParticipation, input, now }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return rejected("identity_not_active");
  }

  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return rejected("program_not_found");
  }

  const participation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "student",
  });
  if (!participation.allowed) {
    return rejected("participation_required");
  }

  const checkRevision = getAcceptedOpenAnswerCheckRevisionRecord(database, input?.checkRevisionId);
  if (!checkRevision) {
    return rejected("check_revision_not_found");
  }
  if (checkRevision.programId !== program.id) {
    return rejected("check_revision_program_mismatch");
  }

  if (!isNonEmptyText(input?.submittedAnswer) || !isNonEmptyText(input?.idempotencyKey)) {
    return rejected("validation_failed");
  }

  const submittedAnswer = input.submittedAnswer.trim();
  const existing = findIdempotentAttempt(database, {
    programId: program.id,
    studentIdentityId: identity.id,
    checkRevisionId: checkRevision.id,
    idempotencyKey: input.idempotencyKey,
  });

  if (existing) {
    if (existing.submittedAnswer === submittedAnswer) {
      return accepted({ attempt: summarizeAttempt(existing) });
    }
    return rejected("idempotency_conflict");
  }

  const submittedAt = now().toISOString();

  try {
    const attempt = createOpenAnswerAttemptRecord(database, {
      id: generateId(),
      programId: program.id,
      studentIdentityId: identity.id,
      checkRevisionId: checkRevision.id,
      criterionRevisionIds: checkRevision.criterionRevisionIds,
      submittedAnswer,
      idempotencyKey: input.idempotencyKey,
      status: "submitted",
      submittedAt,
      updatedAt: submittedAt,
    });

    return accepted({ attempt: summarizeAttempt(attempt) });
  } catch (error) {
    if (error instanceof StorageInvariantError && error.reason === "attempt_idempotency_conflict") {
      return rejected("idempotency_conflict");
    }
    throw error;
  }
}

function findIdempotentAttempt(database, { programId, studentIdentityId, checkRevisionId, idempotencyKey }) {
  return (
    listOpenAnswerAttemptRecords(database, {
      programId,
      studentIdentityId,
      checkRevisionId,
    }).find($0 => $0.idempotencyKey === idempotencyKey) ?? null
  );
}

function findIdempotentQuickCheckAttempt(
  database,
  { programId, studentIdentityId, checkRevisionId, idempotencyKey },
) {
  return (
    listQuickCheckAttemptRecords(database, {
      programId,
      studentIdentityId,
      checkRevisionId,
    }).find($0 => $0.idempotencyKey === idempotencyKey) ?? null
  );
}

function findIdempotentReadinessCheckAttempt(
  database,
  { programId, studentIdentityId, readinessCheckRevisionId, idempotencyKey },
) {
  return (
    listReadinessCheckAttemptRecords(database, {
      programId,
      studentIdentityId,
      readinessCheckRevisionId,
    }).find($0 => $0.idempotencyKey === idempotencyKey) ?? null
  );
}

export function resolveAcceptedQuickCheckRevisionForEvaluation({ database, programId, revisionId }) {
  const revision = getAcceptedQuickCheckRevisionRecord(database, revisionId);
  if (!revision) {
    return rejected("quick_check_revision_not_found");
  }
  if (revision.programId !== programId) {
    return rejected("quick_check_revision_program_mismatch");
  }

  return accepted({
    acceptedQuickCheck: {
      entityId: revision.entityId,
      revisionId: revision.id,
      programId: revision.programId,
      checkKind: revision.checkKind,
      options: revision.options.map($0 => ({ optionId: $0.id, text: $0.text })),
      answerKeyOptionId: revision.answerKeyOptionId,
    },
  });
}

function buildLearnerStateModel({ database, programId, studentIdentityId }) {
  const targetDefinitions = getLearnerStateTargetDefinitions(database, programId);
  const directEvidenceByTarget = new Map(targetDefinitions.map($0 => [$0.key, []]));
  const evidenceByOwner = new Map();

  for (const evidence of getQuickCheckLearnerEvidence(database, { programId, studentIdentityId })) {
    addLearnerEvidence(directEvidenceByTarget, evidence);
    addLearnerEvidenceOwner(evidenceByOwner, "accepted_quick_check", evidence.ownerEntityId, evidence);
  }
  for (const evidence of getOpenAnswerLearnerEvidence(database, { programId, studentIdentityId })) {
    addLearnerEvidence(directEvidenceByTarget, evidence);
    if (evidence.ownerKind && evidence.ownerEntityId) {
      addLearnerEvidenceOwner(evidenceByOwner, evidence.ownerKind, evidence.ownerEntityId, evidence);
    }
  }

  for (const link of listLearnerEvidenceTargetLinkRecords(database, { programId })) {
    const targetKey = learnerStateTargetKey(link.targetKind, link.targetId);
    const linkedEvidence = evidenceByOwner.get(learnerEvidenceOwnerKey(
      link.evidenceOwnerKind,
      link.evidenceOwnerEntityId,
    )) ?? [];
    for (const evidence of linkedEvidence) {
      addLearnerEvidence(directEvidenceByTarget, {
        ...evidence,
        targetKind: link.targetKind,
        targetId: link.targetId,
        targetKey,
      });
    }
  }

  const relationshipRecords = listAcceptedNavigationRelationshipRecords(database, { programId, status: "active" });
  const targetKindByEntityId = new Map(targetDefinitions.map($0 => [$0.targetId, $0.targetKind]));
  const directEvidenceResolver = targetKey => directEvidenceByTarget.get(targetKey) ?? [];
  const rolledEvidenceResolver = target => {
    const directEvidence = directEvidenceResolver(target.key);
    if (target.targetKind === "topic") {
      return [
        ...directEvidence,
        ...relationshipRecords
          .filter($0 => $0.relationshipKind === "topic_includes_concept" && $0.fromEntityId === target.targetId)
          .flatMap($0 => directEvidenceResolver(learnerStateTargetKey("concept", $0.toEntityId))),
      ];
    }
    if (target.targetKind === "concept") {
      return [
        ...directEvidence,
        ...relationshipRecords
          .filter(
            $0 =>
              $0.fromEntityId === target.targetId &&
              ["concept_has_definition", "concept_has_principle", "concept_uses_material"].includes(
                $0.relationshipKind,
              ),
          )
          .flatMap($0 =>
            directEvidenceResolver(learnerStateTargetKey(targetKindByEntityId.get($0.toEntityId), $0.toEntityId)),
          ),
      ];
    }
    return directEvidence;
  };

  const evidenceByTarget = new Map();
  const summarizeTarget = target => {
    const evidence = rolledEvidenceResolver(target);
    evidenceByTarget.set(target.key, evidence);
    return summarizeLearnerStateTarget(target, evidence);
  };
  const topicSummaries = targetDefinitions
    .filter($0 => $0.targetKind === "topic")
    .map(summarizeTarget);
  const conceptSummaries = targetDefinitions
    .filter($0 => $0.targetKind === "concept")
    .map(summarizeTarget);
  const materialReferenceSummaries = targetDefinitions
    .filter($0 => $0.targetKind === "material_reference")
    .map(summarizeTarget);
  const checkSummaries = targetDefinitions
    .filter($0 => $0.targetKind === "open_answer_check" || $0.targetKind === "quick_check")
    .map(summarizeTarget);
  const criterionSummaries = targetDefinitions
    .filter($0 => $0.targetKind === "assessment_criterion")
    .map(summarizeTarget);
  const allSummaries = [
    ...topicSummaries,
    ...conceptSummaries,
    ...materialReferenceSummaries,
    ...checkSummaries,
    ...criterionSummaries,
  ];

  return {
    allSummaries,
    criteria: criterionSummaries,
    checks: checkSummaries,
    concepts: conceptSummaries,
    directEvidenceByTarget,
    evidenceByTarget,
    materialReferences: materialReferenceSummaries,
    programId,
    summariesByKey: new Map(allSummaries.map($0 => [$0.key, $0])),
    topics: topicSummaries,
  };
}

function getLearnerStateTargetDefinitions(database, programId) {
  const corpusTargets = listAcceptedCorpusEntityRecords(database, { programId, status: "active" })
    .map(entity => {
      const revision = getAcceptedCorpusRevisionRecord(database, entity.currentRevisionId);
      if (!revision || !["topic", "concept", "material_reference"].includes(entity.acceptedKind)) {
        return null;
      }
      return makeLearnerStateTargetDefinition({
        programId,
        targetKind: entity.acceptedKind,
        targetId: entity.id,
        title: revision.title,
      });
    })
    .filter(Boolean);
  const quickChecks = listAcceptedQuickCheckEntityRecords(database, { programId, status: "active" }).map(entity => {
    const revision = getAcceptedQuickCheckRevisionRecord(database, entity.currentRevisionId);
    return makeLearnerStateTargetDefinition({
      programId,
      targetKind: "quick_check",
      targetId: entity.id,
      title: revision?.title ?? entity.id,
    });
  });
  const openAnswerChecks = listAcceptedOpenAnswerCheckEntityRecords(database, { programId, status: "active" }).map(entity => {
    const revision = getAcceptedOpenAnswerCheckRevisionRecord(database, entity.currentRevisionId);
    return makeLearnerStateTargetDefinition({
      programId,
      targetKind: "open_answer_check",
      targetId: entity.id,
      title: revision?.title ?? entity.id,
    });
  });
  const criteria = listAcceptedAssessmentCriterionEntityRecords(database, { programId, status: "active" }).map(entity => {
    const revision = getAcceptedAssessmentCriterionRevisionRecord(database, entity.currentRevisionId);
    return makeLearnerStateTargetDefinition({
      programId,
      targetKind: "assessment_criterion",
      targetId: entity.id,
      title: revision?.title ?? entity.id,
    });
  });
  return [...corpusTargets, ...quickChecks, ...openAnswerChecks, ...criteria].sort(
    (left, right) =>
      left.targetKind.localeCompare(right.targetKind) ||
      left.title.localeCompare(right.title) ||
      left.targetId.localeCompare(right.targetId),
  );
}

function getQuickCheckLearnerEvidence(database, { programId, studentIdentityId }) {
  return listQuickCheckAttemptRecords(database, { programId, studentIdentityId }).flatMap(attempt => {
    const revision = getAcceptedQuickCheckRevisionRecord(database, attempt.checkRevisionId);
    if (!revision) {
      return [];
    }
    const selectedOption = revision.options.find($0 => $0.id === attempt.selectedOptionId);
    return [{
      evidenceId: attempt.id,
      ownerEntityId: revision.entityId,
      programId,
      sourceKey: revision.id,
      sourceKind: "quick_check_attempt",
      signal: attempt.matched ? "positive" : "negative",
      studentIdentityId,
      occurredAt: attempt.submittedAt,
      attemptId: attempt.id,
      checkRevisionId: revision.id,
      targetKind: "quick_check",
      targetId: revision.entityId,
      targetKey: learnerStateTargetKey("quick_check", revision.entityId),
      title: revision.title,
      summary: selectedOption ? `Selected ${selectedOption.text}.` : "Submitted quick check attempt.",
    }];
  });
}

function getOpenAnswerLearnerEvidence(database, { programId, studentIdentityId }) {
  return listOpenAnswerAttemptRecords(database, { programId, studentIdentityId }).flatMap(attempt => {
    const revision = getAcceptedOpenAnswerCheckRevisionRecord(database, attempt.checkRevisionId);
    if (!revision) {
      return [];
    }
    const evaluatorEvidence = getOpenAnswerEvaluatorLearnerEvidence(database, { attempt, revision });
    const evaluation = getOpenAnswerEvaluationRecordByAttemptId(database, attempt.id);
    if (!evaluation) {
      return [
        makeOpenAnswerCheckLearnerEvidence({
          attempt,
          occurredAt: attempt.updatedAt,
          revision,
          signal: "pending",
          sourceKind: "open_answer_attempt",
          summary: `Submitted answer: ${attempt.submittedAnswer}`,
        }),
        ...evaluatorEvidence,
      ];
    }

    const criterionEvidence = evaluation.criterionFeedback.flatMap(feedback => {
      const criterionRevision = getAcceptedAssessmentCriterionRevisionRecord(database, feedback.criterionRevisionId);
      if (!criterionRevision) {
        return [];
      }
      return [{
        evidenceId: `${evaluation.id}:${feedback.criterionRevisionId}`,
        ownerKind: "accepted_assessment_criterion",
        ownerEntityId: criterionRevision.entityId,
        programId,
        sourceKey: feedback.criterionRevisionId,
        sourceKind: "open_answer_criterion_feedback",
        signal: mapCriterionOutcomeToLearnerSignal(feedback.outcome),
        studentIdentityId,
        occurredAt: evaluation.evaluatedAt,
        attemptId: attempt.id,
        checkRevisionId: revision.id,
        criterionRevisionId: feedback.criterionRevisionId,
        targetKind: "assessment_criterion",
        targetId: criterionRevision.entityId,
        targetKey: learnerStateTargetKey("assessment_criterion", criterionRevision.entityId),
        title: criterionRevision.title,
        summary: feedback.feedback,
      }];
    });
    return [
      makeOpenAnswerCheckLearnerEvidence({
        attempt,
        occurredAt: evaluation.evaluatedAt,
        revision,
        signal: deriveOpenAnswerCheckSignal(criterionEvidence),
        sourceKind: "open_answer_attempt",
        summary: evaluation.summaryFeedback,
      }),
      ...criterionEvidence,
      ...evaluatorEvidence,
    ];
  });
}

function getOpenAnswerEvaluatorLearnerEvidence(database, { attempt, revision }) {
  return listOpenAnswerEvaluatorRunRecords(database, { attemptId: attempt.id }).flatMap(run =>
    listOpenAnswerEvaluatorEvidenceRecords(database, { evaluatorRunId: run.id }).map(evidence => ({
      evidenceId: evidence.id,
      ownerKind: "accepted_open_answer_check",
      ownerEntityId: revision.entityId,
      programId: attempt.programId,
      sourceKey: `open-answer-evaluator-evidence:${evidence.id}`,
      sourceKind: "open_answer_evaluator_evidence",
      signal: "pending",
      studentIdentityId: attempt.studentIdentityId,
      occurredAt: evidence.recordedAt,
      attemptId: attempt.id,
      checkRevisionId: revision.id,
      targetKind: "open_answer_check",
      targetId: revision.entityId,
      targetKey: learnerStateTargetKey("open_answer_check", revision.entityId),
      title: revision.title,
      summary: evidence.redactedSummary ?? evidence.evidenceKind,
    })),
  );
}

function makeOpenAnswerCheckLearnerEvidence({ attempt, occurredAt, revision, signal, sourceKind, summary }) {
  return {
    evidenceId: attempt.id,
    ownerKind: "accepted_open_answer_check",
    ownerEntityId: revision.entityId,
    programId: attempt.programId,
    sourceKey: revision.id,
    sourceKind,
    signal,
    studentIdentityId: attempt.studentIdentityId,
    occurredAt,
    attemptId: attempt.id,
    checkRevisionId: revision.id,
    targetKind: "open_answer_check",
    targetId: revision.entityId,
    targetKey: learnerStateTargetKey("open_answer_check", revision.entityId),
    title: revision.title,
    summary,
  };
}

function mapCriterionOutcomeToLearnerSignal(outcome) {
  if (outcome === "met") {
    return "positive";
  }
  if (outcome === "missing") {
    return "negative";
  }
  return "partial";
}

function deriveOpenAnswerCheckSignal(criterionEvidence) {
  const signals = criterionEvidence.map($0 => $0.signal);
  if (signals.includes("negative")) {
    return "negative";
  }
  if (signals.includes("partial")) {
    return "partial";
  }
  return signals.length > 0 ? "positive" : "pending";
}

function summarizeLearnerStateProgram({ generatedAt, model, programId, studentIdentityId }) {
  const totals = summarizeLearnerStateTotals(model.allSummaries);
  return {
    programId,
    studentIdentityId,
    generatedAt,
    level: deriveProgramLearnerStateLevel(model.allSummaries),
    totals,
    weakAreas: model.allSummaries
      .filter($0 => $0.level === "needs_attention")
      .sort(compareLearnerStateWeakAreas)
      .map(omitLearnerStateInternalFields),
    topics: model.topics.map(omitLearnerStateInternalFields),
    concepts: model.concepts.map(omitLearnerStateInternalFields),
    materialReferences: model.materialReferences.map(omitLearnerStateInternalFields),
    checks: model.checks.map(omitLearnerStateInternalFields),
    criteria: model.criteria.map(omitLearnerStateInternalFields),
  };
}

function summarizeLearnerStateTarget(target, evidence) {
  const latestEvidence = getLatestLearnerEvidencePerSource(evidence);
  const latestEvidenceAt = evidence.map($0 => $0.occurredAt).sort().at(-1);
  return {
    ...target,
    level: deriveLearnerStateLevel(latestEvidence),
    evidenceCount: evidence.length,
    ...(latestEvidenceAt ? { latestEvidenceAt } : {}),
    positiveEvidenceCount: evidence.filter($0 => $0.signal === "positive").length,
    partialEvidenceCount: evidence.filter($0 => $0.signal === "partial").length,
    negativeEvidenceCount: evidence.filter($0 => $0.signal === "negative").length,
    pendingEvidenceCount: evidence.filter($0 => $0.signal === "pending").length,
  };
}

function getLatestLearnerEvidencePerSource(evidence) {
  const latestBySource = new Map();
  for (const item of evidence) {
    const previous = latestBySource.get(item.sourceKey);
    if (!previous || item.occurredAt > previous.occurredAt) {
      latestBySource.set(item.sourceKey, item);
    }
  }
  return [...latestBySource.values()];
}

function deriveLearnerStateLevel(latestEvidence) {
  if (latestEvidence.length === 0) {
    return "no_evidence";
  }
  const signals = latestEvidence.map($0 => $0.signal);
  if (signals.includes("negative")) {
    return "needs_attention";
  }
  if (signals.includes("partial")) {
    return "developing";
  }
  if (signals.includes("pending")) {
    return "in_progress";
  }
  return "on_track";
}

function summarizeLearnerStateTotals(summaries) {
  return {
    targets: summaries.length,
    onTrack: summaries.filter($0 => $0.level === "on_track").length,
    developing: summaries.filter($0 => $0.level === "developing").length,
    needsAttention: summaries.filter($0 => $0.level === "needs_attention").length,
    inProgress: summaries.filter($0 => $0.level === "in_progress").length,
    noEvidence: summaries.filter($0 => $0.level === "no_evidence").length,
  };
}

function deriveProgramLearnerStateLevel(summaries) {
  const levels = summaries.map($0 => $0.level);
  if (levels.includes("needs_attention")) {
    return "needs_attention";
  }
  if (levels.includes("developing")) {
    return "developing";
  }
  if (levels.includes("in_progress")) {
    return "in_progress";
  }
  if (levels.includes("on_track")) {
    return "on_track";
  }
  return "no_evidence";
}

function compareLearnerStateWeakAreas(left, right) {
  const latestComparison = (right.latestEvidenceAt ?? "").localeCompare(left.latestEvidenceAt ?? "");
  if (latestComparison !== 0) {
    return latestComparison;
  }
  return left.title.localeCompare(right.title) || left.targetId.localeCompare(right.targetId);
}

function getLearnerStateTargetEvidence(model, summary) {
  return (model.evidenceByTarget.get(summary.key) ?? [])
    .slice()
    .sort(
      (left, right) =>
        right.occurredAt.localeCompare(left.occurredAt) ||
        left.evidenceId.localeCompare(right.evidenceId),
    );
}

function makeReadinessRequirementResult(model, requirement) {
  const observedLevel = model.summariesByKey.get(
    learnerStateTargetKey(requirement.targetKind, requirement.targetId),
  )?.level ?? "no_evidence";
  return {
    requirementId: requirement.requirementId,
    targetKind: requirement.targetKind,
    targetId: requirement.targetId,
    requiredLevel: requirement.requiredLevel,
    observedLevel,
    result: deriveReadinessRequirementResult({
      observedLevel,
      requiredLevel: requirement.requiredLevel,
    }),
  };
}

function deriveReadinessRequirementResult(requirementResult) {
  if (requirementResult.observedLevel === "in_progress") {
    return "in_progress";
  }
  if (requirementResult.requiredLevel === "developing") {
    return ["developing", "on_track"].includes(requirementResult.observedLevel) ? "ready" : "not_ready";
  }
  return requirementResult.observedLevel === "on_track" ? "ready" : "not_ready";
}

function deriveReadinessAttemptResult(requirementResults) {
  if (requirementResults.some($0 => $0.result === "not_ready")) {
    return "not_ready";
  }
  if (requirementResults.some($0 => $0.result === "in_progress")) {
    return "in_progress";
  }
  return "ready";
}

function summarizeLearnerEvidence(evidence) {
  return {
    evidenceId: evidence.evidenceId,
    sourceKind: evidence.sourceKind,
    signal: evidence.signal,
    programId: evidence.programId,
    studentIdentityId: evidence.studentIdentityId,
    occurredAt: evidence.occurredAt,
    ...(evidence.attemptId ? { attemptId: evidence.attemptId } : {}),
    ...(evidence.checkRevisionId ? { checkRevisionId: evidence.checkRevisionId } : {}),
    ...(evidence.criterionRevisionId ? { criterionRevisionId: evidence.criterionRevisionId } : {}),
    targetKind: evidence.targetKind,
    targetId: evidence.targetId,
    title: evidence.title,
    summary: evidence.summary,
  };
}

function omitLearnerStateInternalFields(summary) {
  const { key, ...publicSummary } = summary;
  return publicSummary;
}

function addLearnerEvidence(evidenceByTarget, evidence) {
  if (!evidenceByTarget.has(evidence.targetKey)) {
    evidenceByTarget.set(evidence.targetKey, []);
  }
  evidenceByTarget.get(evidence.targetKey).push(evidence);
}

function addLearnerEvidenceOwner(evidenceByOwner, ownerKind, ownerEntityId, evidence) {
  const key = learnerEvidenceOwnerKey(ownerKind, ownerEntityId);
  if (!evidenceByOwner.has(key)) {
    evidenceByOwner.set(key, []);
  }
  evidenceByOwner.get(key).push(evidence);
}

function makeLearnerStateTargetDefinition({ programId, targetKind, targetId, title }) {
  return {
    key: learnerStateTargetKey(targetKind, targetId),
    targetKind,
    targetId,
    programId,
    title,
  };
}

function resolveLearnerStateTarget(database, { targetKind, targetId }) {
  if (!supportedLearnerStateTargetKinds.has(targetKind) || !isNonEmptyText(targetId)) {
    return { status: "rejected", reason: "learner_state_target_not_found" };
  }
  if (targetKind === "program") {
    const program = getProgramShellRecord(database, targetId);
    return program
      ? { status: "accepted", target: { programId: program.id, targetKind, targetId } }
      : { status: "rejected", reason: "learner_state_target_not_found" };
  }
  if (["topic", "concept", "material_reference"].includes(targetKind)) {
    const entity = getAcceptedCorpusEntityRecord(database, targetId);
    return entity && entity.acceptedKind === targetKind
      ? { status: "accepted", target: { programId: entity.programId, targetKind, targetId } }
      : { status: "rejected", reason: "learner_state_target_not_found" };
  }
  const entity = getLearnerStateAcceptedEvidenceOwnerEntity(database, { targetKind, targetId });
  return entity
    ? { status: "accepted", target: { programId: entity.programId, targetKind, targetId } }
    : { status: "rejected", reason: "learner_state_target_not_found" };
}

function getLearnerStateAcceptedEvidenceOwnerEntity(database, { targetKind, targetId }) {
  if (targetKind === "quick_check") {
    return getAcceptedQuickCheckEntityRecord(database, targetId);
  }
  if (targetKind === "open_answer_check") {
    return getAcceptedOpenAnswerCheckEntityRecord(database, targetId);
  }
  if (targetKind === "assessment_criterion") {
    return getAcceptedAssessmentCriterionEntityRecord(database, targetId);
  }
  return null;
}

function learnerStateTargetKey(targetKind, targetId) {
  return `${targetKind}:${targetId}`;
}

function learnerEvidenceOwnerKey(ownerKind, ownerEntityId) {
  return `${ownerKind}:${ownerEntityId}`;
}

function summarizeAttempt(attempt) {
  return {
    attemptId: attempt.id,
    programId: attempt.programId,
    studentIdentityId: attempt.studentIdentityId,
    checkRevisionId: attempt.checkRevisionId,
    criterionRevisionIds: attempt.criterionRevisionIds,
    submittedAnswer: attempt.submittedAnswer,
    status: attempt.status,
    submittedAt: attempt.submittedAt,
    updatedAt: attempt.updatedAt,
  };
}

function summarizeQuickCheckAttempt(attempt) {
  return {
    attemptId: attempt.id,
    programId: attempt.programId,
    studentIdentityId: attempt.studentIdentityId,
    checkRevisionId: attempt.checkRevisionId,
    selectedOptionId: attempt.selectedOptionId,
    matched: attempt.matched,
    submittedAt: attempt.submittedAt,
  };
}

function summarizeReadinessCheckDelivery(revision) {
  return {
    entityId: revision.entityId,
    revisionId: revision.id,
    programId: revision.programId,
    title: revision.title,
    scope: revision.scope,
    requirements: revision.requirements.map($0 => ({
      requirementId: $0.requirementId,
      targetKind: $0.targetKind,
      targetId: $0.targetId,
      requiredLevel: $0.requiredLevel,
    })),
  };
}

function summarizeReadinessCheckAttempt(attempt) {
  return {
    attemptId: attempt.id,
    programId: attempt.programId,
    studentIdentityId: attempt.studentIdentityId,
    readinessCheckRevisionId: attempt.readinessCheckRevisionId,
    result: attempt.result,
    requirementResults: attempt.requirementResults,
    submittedAt: attempt.submittedAt,
  };
}

function summarizeEvaluation(evaluation) {
  return {
    evaluationId: evaluation.id,
    attemptId: evaluation.attemptId,
    programId: evaluation.programId,
    studentIdentityId: evaluation.studentIdentityId,
    checkRevisionId: evaluation.checkRevisionId,
    criterionRevisionIds: evaluation.criterionRevisionIds,
    evaluatorKind: evaluation.evaluatorKind,
    summaryFeedback: evaluation.summaryFeedback,
    criterionFeedback: evaluation.criterionFeedback,
    evaluatedAt: evaluation.evaluatedAt,
  };
}

function summarizeEvaluatorRun(evaluatorRun) {
  return {
    evaluatorRunId: evaluatorRun.id,
    attemptId: evaluatorRun.attemptId,
    programId: evaluatorRun.programId,
    studentIdentityId: evaluatorRun.studentIdentityId,
    checkRevisionId: evaluatorRun.checkRevisionId,
    criterionRevisionIds: evaluatorRun.criterionRevisionIds,
    evaluatorPathKind: evaluatorRun.evaluatorPathKind,
    evaluatorPolicyId: evaluatorRun.evaluatorPolicyId,
    status: evaluatorRun.status,
    ...(evaluatorRun.requestedByIdentityId
      ? { requestedByIdentityId: evaluatorRun.requestedByIdentityId }
      : {}),
    ...(evaluatorRun.reviewerIdentityId
      ? { reviewerIdentityId: evaluatorRun.reviewerIdentityId }
      : {}),
    ...(evaluatorRun.reviewerCapability
      ? { reviewerCapability: evaluatorRun.reviewerCapability }
      : {}),
    startedAt: evaluatorRun.startedAt,
    ...(evaluatorRun.completedAt ? { completedAt: evaluatorRun.completedAt } : {}),
    ...(evaluatorRun.failedAt ? { failedAt: evaluatorRun.failedAt } : {}),
    ...(evaluatorRun.failureReason ? { failureReason: evaluatorRun.failureReason } : {}),
  };
}

function summarizeEvaluatorJob(evaluatorJob) {
  return {
    evaluatorJobId: evaluatorJob.evaluatorJobId,
    evaluatorRunId: evaluatorJob.evaluatorRunId,
    attemptId: evaluatorJob.attemptId,
    programId: evaluatorJob.programId,
    studentIdentityId: evaluatorJob.studentIdentityId,
    checkRevisionId: evaluatorJob.checkRevisionId,
    criterionRevisionIds: evaluatorJob.criterionRevisionIds,
    evaluatorPathKind: evaluatorJob.evaluatorPathKind,
    evaluatorPolicyId: evaluatorJob.evaluatorPolicyId,
    status: evaluatorJob.jobStatus,
    attemptNumber: evaluatorJob.attemptNumber,
    retryPolicy: evaluatorJob.retryPolicy,
    ...(evaluatorJob.budgetPolicy ? { budgetPolicy: evaluatorJob.budgetPolicy } : {}),
    ...(evaluatorJob.lease ? { lease: evaluatorJob.lease } : {}),
    ...(evaluatorJob.nextRetryAt ? { nextRetryAt: evaluatorJob.nextRetryAt } : {}),
    ...(evaluatorJob.cancellationReason
      ? { cancellationReason: evaluatorJob.cancellationReason }
      : {}),
    ...(evaluatorJob.timeoutReason ? { timeoutReason: evaluatorJob.timeoutReason } : {}),
    ...(evaluatorJob.jobFailureReason ? { failureReason: evaluatorJob.jobFailureReason } : {}),
    createdAt: evaluatorJob.createdAt,
    updatedAt: evaluatorJob.updatedAt,
  };
}

function summarizeEvaluatorWorkerRun({
  mode,
  workerId,
  evaluatorJobId,
  claimed,
  completed = false,
  retried = false,
  failed = false,
  rejectionReason,
  failureReason,
}) {
  return {
    mode,
    workerId,
    ...(evaluatorJobId ? { evaluatorJobId } : {}),
    claimed,
    completed,
    retried,
    failed,
    ...(rejectionReason ? { rejectionReason } : {}),
    ...(failureReason ? { failureReason } : {}),
  };
}

function summarizeEvaluatorLease(lease) {
  return {
    leaseId: lease.leaseId,
    workerId: lease.workerId,
    claimedAt: lease.claimedAt,
    expiresAt: lease.expiresAt,
  };
}

function summarizeEvaluatorEvidence(evidence) {
  return {
    evidenceId: evidence.id,
    evaluatorRunId: evidence.evaluatorRunId,
    attemptId: evidence.attemptId,
    evidenceKind: evidence.evidenceKind,
    visibility: evidence.visibility,
    ...(evidence.redactedSummary ? { redactedSummary: evidence.redactedSummary } : {}),
    recordedAt: evidence.recordedAt,
  };
}

function summarizeEvaluationFailure(failure) {
  return {
    reason: failure.reason,
    failedAt: failure.failedAt,
  };
}

function summarizeAttemptDetail(database, attempt) {
  const detail = { attempt: summarizeAttempt(attempt) };
  const evaluation = getOpenAnswerEvaluationRecordByAttemptId(database, attempt.id);
  if (evaluation) {
    detail.evaluation = summarizeEvaluation(evaluation);
  }
  const failure = getOpenAnswerEvaluationFailureRecord(database, attempt.id);
  if (failure) {
    detail.evaluationFailure = summarizeEvaluationFailure(failure);
  }
  return detail;
}

function summarizeEvaluationStatus(database, attempt) {
  const detail = {
    attempt: summarizeAttempt(attempt),
    evidence: [],
  };
  const evaluatorRun = listOpenAnswerEvaluatorRunRecords(database, {
    attemptId: attempt.id,
    status: "running",
  })[0];
  if (evaluatorRun) {
    detail.evaluatorRun = summarizeEvaluatorRun(evaluatorRun);
    detail.evidence = listOpenAnswerEvaluatorEvidenceRecords(database, {
      evaluatorRunId: evaluatorRun.id,
    }).map(summarizeEvaluatorEvidence);
  }
  const evaluation = getOpenAnswerEvaluationRecordByAttemptId(database, attempt.id);
  if (evaluation) {
    detail.evaluation = summarizeEvaluation(evaluation);
  }
  const failure = getOpenAnswerEvaluationFailureRecord(database, attempt.id);
  if (failure) {
    detail.evaluationFailure = summarizeEvaluationFailure(failure);
  }
  return detail;
}

function mapQuickCheckAttemptStorageRejection(reason) {
  if (reason === "quick_check_attempt_idempotency_conflict") {
    return "idempotency_conflict";
  }
  if (reason === "quick_check_selected_option_mismatch") {
    return "selected_option_not_found";
  }
  if (reason === "quick_check_revision_not_found") {
    return "quick_check_revision_not_found";
  }
  if (reason === "quick_check_revision_program_mismatch") {
    return "quick_check_revision_program_mismatch";
  }
  return "validation_failed";
}

function mapReadinessAttemptStorageRejection(reason) {
  if (reason === "readiness_attempt_idempotency_conflict") {
    return "idempotency_conflict";
  }
  if (reason === "readiness_revision_not_found") {
    return "readiness_revision_not_found";
  }
  if (reason === "readiness_revision_program_mismatch") {
    return "readiness_revision_program_mismatch";
  }
  return "validation_failed";
}

function isValidEvaluationInput(input, attempt) {
  return (
    input?.evaluatorKind === "student_workspace" &&
    isNonEmptyText(input?.summaryFeedback) &&
    isValidCriterionFeedback(input?.criterionFeedback, attempt.criterionRevisionIds)
  );
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
      !isNonEmptyText(item?.feedback)
    ) {
      return false;
    }
    actual.add(item.criterionRevisionId);
  }

  return actual.size === expected.size;
}

function authorizeStudentProgram({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return { rejection: rejected("identity_not_active") };
  }

  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return { rejection: rejected("program_not_found") };
  }

  const participation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "student",
  });
  if (!participation.allowed) {
    return { rejection: rejected("participation_required") };
  }

  return { identity, program };
}

function normalizeCriterionFeedback(criterionFeedback) {
  return criterionFeedback.map($0 => ({
    criterionRevisionId: $0.criterionRevisionId,
    outcome: $0.outcome,
    feedback: $0.feedback.trim(),
  }));
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function containsForbiddenResponseDetail(value) {
  return forbiddenResponseDetailPatterns.some($0 => $0.test(value));
}

function accepted(value) {
  return { status: "accepted", value };
}

function rejected(reason) {
  return { status: "rejected", reason };
}
