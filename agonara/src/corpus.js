import { randomUUID } from "node:crypto";
import {
  StorageInvariantError,
  createAcceptedAssessmentCriterionEntityRecord,
  createAcceptedAssessmentCriterionRevisionRecord,
  createAcceptedCorpusEntityRecord,
  createAcceptedCorpusRevisionRecord,
  createAssessmentCriterionCandidateRecord,
  createCorpusCandidateRecord,
  createCorpusEventRecord,
  createProgramSourceRecord,
  getAcceptedAssessmentCriterionEntityRecord,
  getAcceptedAssessmentCriterionRevisionRecord,
  getAcceptedCorpusEntityRecord,
  getAcceptedCorpusRevisionRecord,
  getAssessmentCriterionCandidateRecord,
  getCorpusCandidateRecord,
  getIdentity,
  getProgramShellRecord,
  isEffectiveAdmin,
  listAcceptedAssessmentCriterionEntityRecords,
  listAcceptedCorpusEntityRecords,
  listAssessmentCriterionCandidateRecords,
  listCorpusCandidateRecords,
  listCorpusEventRecords,
  listProgramSourceRecords,
  updateAcceptedAssessmentCriterionEntityCurrentRevision,
  updateAcceptedCorpusEntityCurrentRevision,
  updateAssessmentCriterionCandidateStatus,
  updateCorpusCandidateStatus,
} from "./storage.js";

const supportedSourceKinds = new Set([
  "public_plan",
  "exam_requirement",
  "standard",
  "textbook",
  "article",
  "lecture",
  "course",
  "note",
  "research_result",
  "other",
]);
const supportedCandidateKinds = new Set(["topic", "concept"]);
const supportedAssessmentCandidateStatuses = new Set(["draft", "accepted", "rejected"]);

export function createCorpusCommands({
  database,
  generateId = randomUUID,
  getEffectiveParticipation,
  now = () => new Date(),
} = {}) {
  return {
    acceptAssessmentCriterionCandidate: input =>
      acceptAssessmentCriterionCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    acceptCorpusCandidate: input =>
      acceptCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    createAssessmentCriterionCandidate: input =>
      createAssessmentCriterionCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    createCorpusCandidate: input =>
      createCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    getAcceptedAssessmentCriterionRevision: input =>
      getAcceptedAssessmentCriterionRevision({ database, getEffectiveParticipation, input }),
    getAcceptedCorpusRevision: input =>
      getAcceptedCorpusRevision({ database, getEffectiveParticipation, input }),
    listAcceptedAssessmentCriteria: input =>
      listAcceptedAssessmentCriteria({ database, getEffectiveParticipation, input }),
    listAcceptedCorpus: input =>
      listAcceptedCorpus({ database, getEffectiveParticipation, input }),
    listAssessmentCriterionCandidates: input =>
      listAssessmentCriterionCandidates({ database, getEffectiveParticipation, input }),
    listCorpusCandidates: input =>
      listCorpusCandidates({ database, getEffectiveParticipation, input }),
    listCorpusEvents: input =>
      listCorpusEvents({ database, getEffectiveParticipation, input }),
    listProgramSources: input =>
      listProgramSources({ database, getEffectiveParticipation, input }),
    recordProgramSource: input =>
      recordProgramSource({ database, generateId, getEffectiveParticipation, input, now }),
    rejectAssessmentCriterionCandidate: input =>
      rejectAssessmentCriterionCandidate({ database, getEffectiveParticipation, input, now }),
    rejectCorpusCandidate: input =>
      rejectCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }),
  };
}

function acceptAssessmentCriterionCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const candidate = getAssessmentCriterionCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("criterion_candidate_not_found");
  }
  if (candidate.status === "accepted") {
    return rejected("criterion_candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    return rejected("criterion_candidate_already_rejected");
  }

  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const targetEntity = input?.targetEntityId
    ? getAcceptedAssessmentCriterionEntityRecord(database, input.targetEntityId)
    : null;
  if (input?.targetEntityId && !targetEntity) {
    return rejected("criterion_entity_not_found");
  }
  if (targetEntity && targetEntity.programId !== candidate.programId) {
    return rejected("criterion_entity_program_mismatch");
  }

  const entityId = input?.targetEntityId ?? generateId();
  const revisionId = generateId();
  const acceptedAt = now().toISOString();

  const revision = database.transaction(() => {
    if (!input?.targetEntityId) {
      createAcceptedAssessmentCriterionEntityRecord(database, {
        id: entityId,
        programId: candidate.programId,
        currentRevisionId: revisionId,
      });
    }

    const createdRevision = createAcceptedAssessmentCriterionRevisionRecord(database, {
      id: revisionId,
      entityId,
      programId: candidate.programId,
      title: candidate.title,
      body: candidate.body,
      acceptedFromCandidateId: candidate.id,
      sourceIds: candidate.sourceIds,
      rationale: candidate.rationale,
      acceptedByIdentityId: authorization.identity.id,
      acceptedAt,
    });
    if (input?.targetEntityId) {
      updateAcceptedAssessmentCriterionEntityCurrentRevision(database, {
        entityId,
        currentRevisionId: revisionId,
      });
    }
    updateAssessmentCriterionCandidateStatus(database, {
      candidateId: candidate.id,
      status: "accepted",
      updatedAt: acceptedAt,
    });
    return createdRevision;
  })();

  return accepted({ acceptedAssessmentCriterion: summarizeAcceptedAssessmentCriterion(revision) });
}

function acceptCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const candidate = getCorpusCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("candidate_not_found");
  }
  if (candidate.status === "accepted") {
    recordRejectedCandidateEventIfResolved({
      database,
      eventType: "corpus_candidate_accepted",
      generateId,
      getEffectiveParticipation,
      input,
      candidate,
      now,
      reason: "candidate_already_accepted",
    });
    return rejected("candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    recordRejectedCandidateEventIfResolved({
      database,
      eventType: "corpus_candidate_accepted",
      generateId,
      getEffectiveParticipation,
      input,
      candidate,
      now,
      reason: "candidate_already_rejected",
    });
    return rejected("candidate_already_rejected");
  }

  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    if (authorization.identity && authorization.program) {
      recordCorpusEvent({
        database,
        generateId,
        now,
        eventType: "corpus_candidate_accepted",
        actorIdentityId: authorization.identity.id,
        programId: authorization.program.id,
        targetId: candidate.id,
        outcome: "rejected",
        reason: authorization.reason,
      });
    }
    return rejected(authorization.reason);
  }

  const entityId = input?.targetEntityId ?? generateId();
  const revisionId = generateId();
  const acceptedAt = now().toISOString();
  const targetEntity = input?.targetEntityId ? getAcceptedCorpusEntityRecord(database, input.targetEntityId) : null;

  if (input?.targetEntityId && !targetEntity) {
    recordRejectedCandidateEvent({
      database,
      eventType: "corpus_candidate_accepted",
      generateId,
      now,
      authorization,
      candidate,
      reason: "accepted_entity_not_found",
    });
    return rejected("accepted_entity_not_found");
  }
  if (targetEntity && targetEntity.programId !== candidate.programId) {
    recordRejectedCandidateEvent({
      database,
      eventType: "corpus_candidate_accepted",
      generateId,
      now,
      authorization,
      candidate,
      reason: "accepted_entity_program_mismatch",
    });
    return rejected("accepted_entity_program_mismatch");
  }
  if (targetEntity && targetEntity.acceptedKind !== candidate.candidateKind) {
    recordRejectedCandidateEvent({
      database,
      eventType: "corpus_candidate_accepted",
      generateId,
      now,
      authorization,
      candidate,
      reason: "accepted_kind_mismatch",
    });
    return rejected("accepted_kind_mismatch");
  }

  const revision = database.transaction(() => {
    if (!input?.targetEntityId) {
      createAcceptedCorpusEntityRecord(database, {
        id: entityId,
        programId: candidate.programId,
        acceptedKind: candidate.candidateKind,
        currentRevisionId: revisionId,
      });
    }

    const createdRevision = createAcceptedCorpusRevisionRecord(database, {
      id: revisionId,
      entityId,
      programId: candidate.programId,
      acceptedKind: candidate.candidateKind,
      title: candidate.title,
      body: candidate.body,
      acceptedFromCandidateId: candidate.id,
      sourceIds: candidate.sourceIds,
      rationale: candidate.rationale,
      acceptedByIdentityId: authorization.identity.id,
      acceptedAt,
    });
    if (input?.targetEntityId) {
      updateAcceptedCorpusEntityCurrentRevision(database, {
        entityId,
        currentRevisionId: revisionId,
      });
    }
    updateCorpusCandidateStatus(database, {
      candidateId: candidate.id,
      status: "accepted",
      updatedAt: acceptedAt,
    });
    return createdRevision;
  })();

  recordCorpusEvent({
    database,
    generateId,
    now,
    eventType: "corpus_candidate_accepted",
    actorIdentityId: authorization.identity.id,
    programId: authorization.program.id,
    targetId: candidate.id,
    outcome: "accepted",
  });

  return accepted({ acceptedCorpus: summarizeAcceptedCorpus(revision) });
}

function listAcceptedAssessmentCriteria({ database, getEffectiveParticipation, input }) {
  const authorization = resolveAssessmentAcceptedReadAuthorization({
    database,
    getEffectiveParticipation,
    input,
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const entities = listAcceptedAssessmentCriterionEntityRecords(database, {
    programId: authorization.program.id,
  });

  return accepted({
    acceptedAssessmentCriteria: entities.map($0 =>
      summarizeAcceptedAssessmentCriterion(getAcceptedAssessmentCriterionRevisionRecord(database, $0.currentRevisionId)),
    ),
  });
}

function listAcceptedCorpus({ database, getEffectiveParticipation, input }) {
  const authorization = resolveAcceptedReadAuthorization({
    database,
    getEffectiveParticipation,
    input,
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const entities = listAcceptedCorpusEntityRecords(database, {
    programId: authorization.program.id,
  }).filter($0 => input?.acceptedKind === undefined || $0.acceptedKind === input.acceptedKind);

  return accepted({
    acceptedCorpus: entities.map($0 =>
      summarizeAcceptedCorpus(getAcceptedCorpusRevisionRecord(database, $0.currentRevisionId)),
    ),
  });
}

function getAcceptedAssessmentCriterionRevision({ database, getEffectiveParticipation, input }) {
  const revision = getAcceptedAssessmentCriterionRevisionRecord(database, input?.revisionId);
  if (!revision) {
    return rejected("criterion_revision_not_found");
  }

  const authorization = resolveAssessmentAcceptedReadAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: revision.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({ acceptedAssessmentCriterion: summarizeAcceptedAssessmentCriterion(revision) });
}

function getAcceptedCorpusRevision({ database, getEffectiveParticipation, input }) {
  const revision = getAcceptedCorpusRevisionRecord(database, input?.revisionId);
  if (!revision) {
    return rejected("revision_not_found");
  }

  const authorization = resolveAcceptedReadAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: revision.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({ acceptedCorpus: summarizeAcceptedCorpus(revision) });
}

function createAssessmentCriterionCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const authorization = resolveAssessmentCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (
    !isNonEmptyText(input?.title) ||
    !isNonEmptyText(input?.body) ||
    !isValidOptionalText(input?.rationale) ||
    !isValidIdArray(input?.sourceIds)
  ) {
    return rejected("validation_failed");
  }

  const occurredAt = now().toISOString();
  try {
    const candidate = createAssessmentCriterionCandidateRecord(database, {
      id: generateId(),
      programId: authorization.program.id,
      title: input.title.trim(),
      body: input.body.trim(),
      sourceIds: input.sourceIds ?? [],
      rationale: input.rationale?.trim(),
      status: "draft",
      createdByIdentityId: authorization.identity.id,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });

    return accepted({ assessmentCriterionCandidate: summarizeAssessmentCriterionCandidate(candidate) });
  } catch (error) {
    if (error instanceof StorageInvariantError) {
      return rejected(mapAssessmentCriterionStorageRejection(error.reason));
    }
    throw error;
  }
}

function createCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const authorization = resolveCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    if (authorization.identity && authorization.program) {
      recordCorpusEvent({
        database,
        generateId,
        now,
        eventType: "corpus_candidate_created",
        actorIdentityId: authorization.identity.id,
        programId: authorization.program.id,
        outcome: "rejected",
        reason: authorization.reason,
      });
    }
    return rejected(authorization.reason);
  }

  if (
    !supportedCandidateKinds.has(input?.candidateKind) ||
    !isNonEmptyText(input?.title) ||
    !isValidOptionalText(input?.body) ||
    !isValidOptionalText(input?.rationale)
  ) {
    recordCorpusEvent({
      database,
      generateId,
      now,
      eventType: "corpus_candidate_created",
      actorIdentityId: authorization.identity.id,
      programId: authorization.program.id,
      outcome: "rejected",
      reason: "validation_failed",
    });
    return rejected("validation_failed");
  }

  const occurredAt = now().toISOString();
  try {
    const candidate = createCorpusCandidateRecord(database, {
      id: generateId(),
      programId: authorization.program.id,
      candidateKind: input.candidateKind,
      title: input.title.trim(),
      body: input.body?.trim(),
      sourceIds: input.sourceIds ?? [],
      rationale: input.rationale?.trim(),
      status: "draft",
      createdByIdentityId: authorization.identity.id,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });

    recordCorpusEvent({
      database,
      generateId,
      now,
      eventType: "corpus_candidate_created",
      actorIdentityId: authorization.identity.id,
      programId: authorization.program.id,
      targetId: candidate.id,
      outcome: "accepted",
    });

    return accepted({ corpusCandidate: summarizeCorpusCandidate(candidate) });
  } catch (error) {
    if (error instanceof StorageInvariantError) {
      const reason = mapCandidateStorageRejection(error.reason);
      recordCorpusEvent({
        database,
        generateId,
        now,
        eventType: "corpus_candidate_created",
        actorIdentityId: authorization.identity.id,
        programId: authorization.program.id,
        outcome: "rejected",
        reason,
      });
      return rejected(reason);
    }
    throw error;
  }
}

function recordProgramSource({ database, generateId, getEffectiveParticipation, input, now }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity) {
    return rejected("identity_not_found");
  }

  const program = getProgramShellRecord(database, input?.programId);

  if (identity.state !== "active") {
    if (program) {
      recordCorpusEvent({
        database,
        generateId,
        now,
        actorIdentityId: identity.id,
        programId: program.id,
        outcome: "rejected",
        reason: "identity_disabled",
      });
    }
    return rejected("identity_disabled");
  }

  if (!program) {
    return rejected("program_not_found");
  }

  const participation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "program_curator",
  });

  if (!participation.allowed) {
    recordCorpusEvent({
      database,
      generateId,
      now,
      actorIdentityId: identity.id,
      programId: program.id,
      outcome: "rejected",
      reason: "admin_or_curator_required",
    });
    return rejected("admin_or_curator_required");
  }

  if (
    !supportedSourceKinds.has(input?.sourceKind) ||
    !isNonEmptyText(input?.title) ||
    !isValidOptionalText(input?.locator) ||
    !isValidOptionalText(input?.citation)
  ) {
    recordCorpusEvent({
      database,
      generateId,
      now,
      actorIdentityId: identity.id,
      programId: program.id,
      outcome: "rejected",
      reason: "validation_failed",
    });
    return rejected("validation_failed");
  }

  const recordedAt = now().toISOString();
  const source = createProgramSourceRecord(database, {
    id: generateId(),
    programId: program.id,
    sourceKind: input.sourceKind,
    title: input.title.trim(),
    locator: input.locator?.trim(),
    citation: input.citation?.trim(),
    recordedByIdentityId: identity.id,
    recordedAt,
  });

  recordCorpusEvent({
    database,
    generateId,
    now,
    actorIdentityId: identity.id,
    programId: program.id,
    targetId: source.id,
    outcome: "accepted",
  });

  return accepted({ programSource: summarizeProgramSource(source) });
}

function listProgramSources({ database, getEffectiveParticipation, input }) {
  const authorization = resolveCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({
    programSources: listProgramSourceRecords(database, {
      programId: authorization.program.id,
    }).map(summarizeProgramSource),
  });
}

function listAssessmentCriterionCandidates({ database, getEffectiveParticipation, input }) {
  const authorization = resolveAssessmentCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  if (input?.status !== undefined && !supportedAssessmentCandidateStatuses.has(input.status)) {
    return rejected("validation_failed");
  }

  return accepted({
    assessmentCriterionCandidates: listAssessmentCriterionCandidateRecords(database, {
      programId: authorization.program.id,
      status: input?.status ?? null,
    }).map(summarizeAssessmentCriterionCandidate),
  });
}

function listCorpusCandidates({ database, getEffectiveParticipation, input }) {
  const authorization = resolveCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({
    corpusCandidates: listCorpusCandidateRecords(database, {
      programId: authorization.program.id,
      status: input?.status ?? null,
    }).map(summarizeCorpusCandidate),
  });
}

function listCorpusEvents({ database, getEffectiveParticipation, input }) {
  const authorization = resolveCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({
    corpusEvents: listCorpusEventRecords(database, {
      programId: authorization.program.id,
    }).map(summarizeCorpusEvent),
  });
}

function rejectAssessmentCriterionCandidate({ database, getEffectiveParticipation, input, now }) {
  const candidate = getAssessmentCriterionCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("criterion_candidate_not_found");
  }

  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (candidate.status === "accepted") {
    return rejected("criterion_candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    return rejected("criterion_candidate_already_rejected");
  }

  const updated = updateAssessmentCriterionCandidateStatus(database, {
    candidateId: candidate.id,
    status: "rejected",
    updatedAt: now().toISOString(),
  });

  return accepted({ assessmentCriterionCandidate: summarizeAssessmentCriterionCandidate(updated) });
}

function rejectCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const candidate = getCorpusCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("candidate_not_found");
  }

  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    if (authorization.identity && authorization.program) {
      recordCorpusEvent({
        database,
        generateId,
        now,
        eventType: "corpus_candidate_rejected",
        actorIdentityId: authorization.identity.id,
        programId: authorization.program.id,
        targetId: candidate.id,
        outcome: "rejected",
        reason: authorization.reason,
      });
    }
    return rejected(authorization.reason);
  }

  if (candidate.status === "accepted") {
    recordRejectedCandidateEvent({
      database,
      eventType: "corpus_candidate_rejected",
      generateId,
      now,
      authorization,
      candidate,
      reason: "candidate_already_accepted",
    });
    return rejected("candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    recordRejectedCandidateEvent({
      database,
      eventType: "corpus_candidate_rejected",
      generateId,
      now,
      authorization,
      candidate,
      reason: "candidate_already_rejected",
    });
    return rejected("candidate_already_rejected");
  }

  const updated = updateCorpusCandidateStatus(database, {
    candidateId: candidate.id,
    status: "rejected",
    updatedAt: now().toISOString(),
  });
  recordCorpusEvent({
    database,
    generateId,
    now,
    eventType: "corpus_candidate_rejected",
    actorIdentityId: authorization.identity.id,
    programId: authorization.program.id,
    targetId: updated.id,
    outcome: "accepted",
  });

  return accepted({ corpusCandidate: summarizeCorpusCandidate(updated) });
}

function resolveAssessmentCuratorAuthorization({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return { status: "rejected", reason: "identity_not_active" };
  }
  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return { status: "rejected", reason: "program_not_found" };
  }

  const participation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "program_curator",
  });
  if (!participation.allowed) {
    return { status: "rejected", reason: "admin_or_curator_required" };
  }

  return { status: "accepted", identity, program };
}

function resolveAssessmentAcceptedReadAuthorization({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return { status: "rejected", reason: "identity_not_active" };
  }

  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return { status: "rejected", reason: "program_not_found" };
  }

  if (isEffectiveAdmin(database, identity.id)) {
    return { status: "accepted", identity, program };
  }

  const studentParticipation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "student",
  });
  const curatorParticipation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "program_curator",
  });

  if (studentParticipation.allowed || curatorParticipation.allowed) {
    return { status: "accepted", identity, program };
  }

  return { status: "rejected", reason: "participation_required" };
}

function resolveCuratorAuthorization({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity) {
    return { status: "rejected", reason: "identity_not_found" };
  }
  const program = getProgramShellRecord(database, input?.programId);

  if (identity.state !== "active") {
    return { status: "rejected", reason: "identity_disabled", identity, program };
  }

  if (!program) {
    return { status: "rejected", reason: "program_not_found" };
  }

  const participation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "program_curator",
  });
  if (!participation.allowed) {
    return { status: "rejected", reason: "admin_or_curator_required", identity, program };
  }

  return { status: "accepted", identity, program };
}

function resolveAcceptedReadAuthorization({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity) {
    return { status: "rejected", reason: "identity_not_found" };
  }
  if (identity.state !== "active") {
    return { status: "rejected", reason: "identity_disabled" };
  }

  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return { status: "rejected", reason: "program_not_found" };
  }

  if (isEffectiveAdmin(database, identity.id)) {
    return { status: "accepted", identity, program };
  }

  const studentParticipation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "student",
  });
  const curatorParticipation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "program_curator",
  });

  if (studentParticipation.allowed || curatorParticipation.allowed) {
    return { status: "accepted", identity, program };
  }

  return { status: "rejected", reason: "participation_required" };
}

function recordCorpusEvent({
  database,
  generateId,
  now,
  eventType = "program_source_recorded",
  actorIdentityId,
  programId,
  targetId = null,
  outcome,
  reason = null,
}) {
  createCorpusEventRecord(database, {
    id: generateId(),
    eventType,
    actorIdentityId,
    programId,
    targetId,
    occurredAt: now().toISOString(),
    outcome,
    reason,
  });
}

function recordRejectedCandidateEventIfResolved({
  database,
  eventType,
  generateId,
  getEffectiveParticipation,
  input,
  candidate,
  now,
  reason,
}) {
  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  recordRejectedCandidateEvent({
    database,
    eventType,
    generateId,
    now,
    authorization,
    candidate,
    reason,
  });
}

function recordRejectedCandidateEvent({
  database,
  eventType,
  generateId,
  now,
  authorization,
  candidate,
  reason,
}) {
  if (!authorization.identity || !authorization.program) {
    return;
  }

  recordCorpusEvent({
    database,
    generateId,
    now,
    eventType,
    actorIdentityId: authorization.identity.id,
    programId: authorization.program.id,
    targetId: candidate.id,
    outcome: "rejected",
    reason,
  });
}

function summarizeAssessmentCriterionCandidate(candidate) {
  const summary = {
    candidateId: candidate.id,
    programId: candidate.programId,
    title: candidate.title,
    body: candidate.body,
    sourceIds: candidate.sourceIds,
    status: candidate.status,
    createdByIdentityId: candidate.createdByIdentityId,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };

  if (candidate.rationale !== null) {
    summary.rationale = candidate.rationale;
  }

  return summary;
}

function summarizeProgramSource(source) {
  const summary = {
    sourceId: source.id,
    programId: source.programId,
    sourceKind: source.sourceKind,
    title: source.title,
    recordedByIdentityId: source.recordedByIdentityId,
    recordedAt: source.recordedAt,
  };

  if (source.locator !== null) {
    summary.locator = source.locator;
  }
  if (source.citation !== null) {
    summary.citation = source.citation;
  }

  return summary;
}

function summarizeCorpusCandidate(candidate) {
  const summary = {
    candidateId: candidate.id,
    programId: candidate.programId,
    candidateKind: candidate.candidateKind,
    title: candidate.title,
    sourceIds: candidate.sourceIds,
    status: candidate.status,
    createdByIdentityId: candidate.createdByIdentityId,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };

  if (candidate.body !== null) {
    summary.body = candidate.body;
  }
  if (candidate.rationale !== null) {
    summary.rationale = candidate.rationale;
  }

  return summary;
}

function summarizeAcceptedAssessmentCriterion(revision) {
  const summary = {
    entityId: revision.entityId,
    revisionId: revision.id,
    programId: revision.programId,
    title: revision.title,
    body: revision.body,
    acceptedFromCandidateId: revision.acceptedFromCandidateId,
    sourceIds: revision.sourceIds,
    acceptedByIdentityId: revision.acceptedByIdentityId,
    acceptedAt: revision.acceptedAt,
  };

  if (revision.rationale !== null) {
    summary.rationale = revision.rationale;
  }

  return summary;
}

function summarizeAcceptedCorpus(revision) {
  const summary = {
    entityId: revision.entityId,
    revisionId: revision.id,
    programId: revision.programId,
    acceptedKind: revision.acceptedKind,
    title: revision.title,
    acceptedFromCandidateId: revision.acceptedFromCandidateId,
    sourceIds: revision.sourceIds,
    acceptedByIdentityId: revision.acceptedByIdentityId,
    acceptedAt: revision.acceptedAt,
  };

  if (revision.body !== null) {
    summary.body = revision.body;
  }
  if (revision.rationale !== null) {
    summary.rationale = revision.rationale;
  }

  return summary;
}

function summarizeCorpusEvent(event) {
  const summary = {
    corpusEventId: event.id,
    eventType: event.eventType,
    actorIdentityId: event.actorIdentityId,
    occurredAt: event.occurredAt,
    outcome: event.outcome,
  };

  if (event.programId !== null) {
    summary.programId = event.programId;
  }
  if (event.targetId !== null) {
    summary.targetId = event.targetId;
  }
  if (event.reason !== null) {
    summary.reason = event.reason;
  }

  return summary;
}

function mapCandidateStorageRejection(reason) {
  if (reason === "program_source_not_found") {
    return "source_not_found";
  }
  if (reason === "program_source_mismatch") {
    return "source_program_mismatch";
  }
  return reason;
}

function mapAssessmentCriterionStorageRejection(reason) {
  if (reason === "program_source_not_found") {
    return "source_not_found";
  }
  if (reason === "program_source_mismatch") {
    return "source_program_mismatch";
  }
  return reason;
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidIdArray(value) {
  return value === undefined || value === null || Array.isArray(value);
}

function isValidOptionalText(value) {
  return value === undefined || value === null || isNonEmptyText(value);
}

function accepted(value) {
  return { status: "accepted", value };
}

function rejected(reason) {
  return { status: "rejected", reason };
}
