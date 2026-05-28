import { randomUUID } from "node:crypto";
import {
  createCorpusEventRecord,
  createProgramSourceRecord,
  getIdentity,
  getProgramShellRecord,
  listProgramSourceRecords,
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

export function createCorpusCommands({
  database,
  generateId = randomUUID,
  getEffectiveParticipation,
  now = () => new Date(),
} = {}) {
  return {
    listProgramSources: input =>
      listProgramSources({ database, getEffectiveParticipation, input }),
    recordProgramSource: input =>
      recordProgramSource({ database, generateId, getEffectiveParticipation, input, now }),
  };
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

function recordCorpusEvent({
  database,
  generateId,
  now,
  actorIdentityId,
  programId,
  targetId = null,
  outcome,
  reason = null,
}) {
  createCorpusEventRecord(database, {
    id: generateId(),
    eventType: "program_source_recorded",
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
