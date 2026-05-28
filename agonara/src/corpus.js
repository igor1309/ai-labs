import { randomUUID } from "node:crypto";
import {
  StorageInvariantError,
  createAcceptedCorpusEntityRecord,
  createAcceptedCorpusRevisionRecord,
  createCorpusCandidateRecord,
  createCorpusEventRecord,
  createProgramSourceRecord,
  getAcceptedCorpusEntityRecord,
  getAcceptedCorpusRevisionRecord,
  getCorpusCandidateRecord,
  getIdentity,
  getProgramShellRecord,
  isEffectiveAdmin,
  listAcceptedCorpusEntityRecords,
  listCorpusCandidateRecords,
  listProgramSourceRecords,
  updateAcceptedCorpusEntityCurrentRevision,
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

export function createCorpusCommands({
  database,
  generateId = randomUUID,
  getEffectiveParticipation,
  now = () => new Date(),
} = {}) {
  return {
    acceptCorpusCandidate: input =>
      acceptCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    createCorpusCandidate: input =>
      createCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    getAcceptedCorpusRevision: input =>
      getAcceptedCorpusRevision({ database, getEffectiveParticipation, input }),
    listAcceptedCorpus: input =>
      listAcceptedCorpus({ database, getEffectiveParticipation, input }),
    listCorpusCandidates: input =>
      listCorpusCandidates({ database, getEffectiveParticipation, input }),
    listProgramSources: input =>
      listProgramSources({ database, getEffectiveParticipation, input }),
    recordProgramSource: input =>
      recordProgramSource({ database, generateId, getEffectiveParticipation, input, now }),
    rejectCorpusCandidate: input =>
      rejectCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }),
  };
}

function acceptCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const candidate = getCorpusCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("candidate_not_found");
  }
  if (candidate.status === "accepted") {
    return rejected("candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    return rejected("candidate_already_rejected");
  }

  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const entityId = input?.targetEntityId ?? generateId();
  const revisionId = generateId();
  const acceptedAt = now().toISOString();
  const targetEntity = input?.targetEntityId ? getAcceptedCorpusEntityRecord(database, input.targetEntityId) : null;

  if (input?.targetEntityId && !targetEntity) {
    return rejected("accepted_entity_not_found");
  }
  if (targetEntity && targetEntity.programId !== candidate.programId) {
    return rejected("accepted_entity_program_mismatch");
  }
  if (targetEntity && targetEntity.acceptedKind !== candidate.candidateKind) {
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
    return rejected(authorization.reason);
  }

  if (candidate.status === "accepted") {
    return rejected("candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
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

function resolveCuratorAuthorization({ database, getEffectiveParticipation, input }) {
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

function mapCandidateStorageRejection(reason) {
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

function isValidOptionalText(value) {
  return value === undefined || value === null || isNonEmptyText(value);
}

function accepted(value) {
  return { status: "accepted", value };
}

function rejected(reason) {
  return { status: "rejected", reason };
}
