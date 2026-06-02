import { randomUUID } from "node:crypto";
import {
  StorageInvariantError,
  clearOpenAnswerEvaluatorJobLease,
  createOpenAnswerAttemptRecord,
  createOpenAnswerEvaluationFailureRecord,
  createOpenAnswerEvaluationRecord,
  createOpenAnswerEvaluatorEvidenceRecord,
  createOpenAnswerEvaluatorRunRecord,
  deleteOpenAnswerEvaluationFailureRecord,
  getAcceptedOpenAnswerCheckRevisionRecord,
  getIdentity,
  getOpenAnswerAttemptRecord,
  getOpenAnswerEvaluationFailureRecord,
  getOpenAnswerEvaluationRecordByAttemptId,
  getOpenAnswerEvaluatorJobRecord,
  getOpenAnswerEvaluatorRunRecord,
  getProgramShellRecord,
  listClaimableOpenAnswerEvaluatorJobRecords,
  listOpenAnswerAttemptRecords,
  listOpenAnswerEvaluatorEvidenceRecords,
  listOpenAnswerEvaluatorRunRecords,
  updateOpenAnswerAttemptStatus,
  updateOpenAnswerEvaluatorJobLease,
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
  generateId = randomUUID,
  getEffectiveParticipation,
  now = () => new Date(),
} = {}) {
  return {
    beginOpenAnswerEvaluatorRun: input =>
      beginOpenAnswerEvaluatorRun({ database, generateId, input, now }),
    cancelOpenAnswerEvaluatorRun: input =>
      cancelOpenAnswerEvaluatorRun({ database, input, now }),
    claimOpenAnswerEvaluatorJob: input =>
      claimOpenAnswerEvaluatorJob({ database, generateId, input, now }),
    completeOpenAnswerEvaluatorJob: input =>
      completeOpenAnswerEvaluatorJob({ database, generateId, input, now }),
    completeOpenAnswerEvaluatorRun: input =>
      completeOpenAnswerEvaluatorRun({ database, generateId, input, now }),
    failOpenAnswerEvaluatorRun: input =>
      failOpenAnswerEvaluatorRun({ database, input, now }),
    getOpenAnswerEvaluatorJob: input =>
      getOpenAnswerEvaluatorJob({ database, input }),
    getOpenAnswerAttempt: input =>
      getOpenAnswerAttempt({ database, input }),
    getOpenAnswerEvaluationStatus: input =>
      getOpenAnswerEvaluationStatus({ database, input }),
    listOpenAnswerAttempts: input =>
      listOpenAnswerAttempts({ database, getEffectiveParticipation, input }),
    listClaimableOpenAnswerEvaluatorJobs: input =>
      listClaimableOpenAnswerEvaluatorJobs({ database, input, now }),
    listOpenAnswerEvaluatorEvidence: input =>
      listOpenAnswerEvaluatorEvidence({ database, input }),
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
    scheduleOpenAnswerEvaluatorJob: input =>
      scheduleOpenAnswerEvaluatorJob({ database, generateId, input, now }),
    submitOpenAnswerAttempt: input =>
      submitOpenAnswerAttempt({ database, generateId, getEffectiveParticipation, input, now }),
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
  const completedRejection = getCompletedEvaluatorJobRejection(database, evaluatorJob, input);
  if (completedRejection) {
    return completedRejection;
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
    const currentCompletedRejection = getCompletedEvaluatorJobRejection(database, currentJob, input);
    if (currentCompletedRejection) {
      return { rejection: currentCompletedRejection };
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
      updatedAt: completedAt,
    });
    return {
      evaluatorJob: getOpenAnswerEvaluatorJobRecord(database, currentJob.evaluatorJobId),
      evaluatorRun: updatedRun,
      evaluation,
      updated: updatedAttempt,
    };
  })();
  if (transition.rejection) {
    return transition.rejection;
  }

  return accepted({
    attempt: summarizeAttempt(transition.updated),
    evaluatorJob: summarizeEvaluatorJob(transition.evaluatorJob),
    evaluation: summarizeEvaluation(transition.evaluation),
  });
}

function getCompletedEvaluatorJobRejection(database, evaluatorJob, input) {
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
      JSON.stringify(evaluation.criterionFeedback)
  );
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
