import { randomUUID } from "node:crypto";
import {
  StorageInvariantError,
  createOpenAnswerAttemptRecord,
  getAcceptedOpenAnswerCheckRevisionRecord,
  getIdentity,
  getProgramShellRecord,
  listOpenAnswerAttemptRecords,
} from "./storage.js";

export function createStudentWorkspaceCommands({
  database,
  generateId = randomUUID,
  getEffectiveParticipation,
  now = () => new Date(),
} = {}) {
  return {
    submitOpenAnswerAttempt: input =>
      submitOpenAnswerAttempt({ database, generateId, getEffectiveParticipation, input, now }),
  };
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

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function accepted(value) {
  return { status: "accepted", value };
}

function rejected(reason) {
  return { status: "rejected", reason };
}
