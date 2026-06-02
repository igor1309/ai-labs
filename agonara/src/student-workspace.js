import { randomUUID } from "node:crypto";
import {
  StorageInvariantError,
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
  getOpenAnswerEvaluatorRunRecord,
  getProgramShellRecord,
  listOpenAnswerAttemptRecords,
  updateOpenAnswerAttemptStatus,
} from "./storage.js";

const supportedEvaluationOutcomes = new Set(["met", "partially_met", "missing", "unclear"]);
const supportedAttemptStatuses = new Set(["submitted", "evaluating", "evaluated", "evaluation_failed"]);
const supportedEvaluatorPathKinds = new Set([
  "student_workspace",
  "deterministic",
  "llm_assisted",
  "human_reviewed",
]);

export function createStudentWorkspaceCommands({
  database,
  generateId = randomUUID,
  getEffectiveParticipation,
  now = () => new Date(),
} = {}) {
  return {
    beginOpenAnswerEvaluatorRun: input =>
      beginOpenAnswerEvaluatorRun({ database, generateId, input, now }),
    getOpenAnswerAttempt: input =>
      getOpenAnswerAttempt({ database, input }),
    listOpenAnswerAttempts: input =>
      listOpenAnswerAttempts({ database, getEffectiveParticipation, input }),
    markOpenAnswerAttemptEvaluating: input =>
      markOpenAnswerAttemptEvaluating({ database, input, now }),
    recordOpenAnswerEvaluation: input =>
      recordOpenAnswerEvaluation({ database, generateId, input, now }),
    recordOpenAnswerEvaluatorEvidence: input =>
      recordOpenAnswerEvaluatorEvidence({ database, generateId, input, now }),
    recordOpenAnswerEvaluationFailure: input =>
      recordOpenAnswerEvaluationFailure({ database, input, now }),
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

function recordOpenAnswerEvaluatorEvidence({ database, generateId, input, now }) {
  const evaluatorRun = getOpenAnswerEvaluatorRunRecord(database, input?.evaluatorRunId);
  const evaluatorRunRejection = getRunningEvaluatorRunRejection(evaluatorRun);
  if (evaluatorRunRejection) {
    return evaluatorRunRejection;
  }
  if (
    !isNonEmptyText(input?.evidenceKind) ||
    (input?.redactedSummary !== undefined && !isNonEmptyText(input.redactedSummary))
  ) {
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

function getRunningEvaluatorRunRejection(evaluatorRun) {
  if (!evaluatorRun) {
    return rejected("evaluator_run_not_found");
  }
  if (evaluatorRun.status !== "running") {
    return rejected("evaluator_run_conflict");
  }
  return null;
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

function accepted(value) {
  return { status: "accepted", value };
}

function rejected(reason) {
  return { status: "rejected", reason };
}
