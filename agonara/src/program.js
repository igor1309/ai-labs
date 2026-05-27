import { randomUUID } from "node:crypto";
import {
  createProgramEventRecord,
  createProgramMembershipEventRecord,
  createProgramMembershipRecord,
  createProgramShellRecord,
  getIdentity,
  getProgramMembershipRecord,
  getProgramShellRecord,
  hasActiveProgramCuratorMembership,
  isEffectiveAdmin,
  listProgramEventRecords,
  listProgramIdsWithActiveCuratorParticipation,
  listProgramMembershipEventRecords,
  listProgramMembershipRecordsByIdentity,
  listProgramShellRecords,
  updateProgramMembershipStatus,
} from "./storage.js";

const supportedParticipationKinds = new Set(["student", "program_curator"]);

export function createProgramCommands({
  database,
  generateId = randomUUID,
  now = () => new Date(),
} = {}) {
  return {
    createProgramShell: input => createProgramShell({ database, generateId, input, now }),
    getEffectiveParticipation: input => getEffectiveParticipation({ database, input }),
    getProgramShell: input => getProgramShell({ database, input }),
    joinSelfJoinProgram: input => joinSelfJoinProgram({ database, generateId, input, now }),
    leaveStudentProgram: input => leaveStudentProgram({ database, generateId, input, now }),
    listMyProgramMemberships: input => listMyProgramMemberships({ database, input }),
    listProgramEvents: input => listProgramEvents({ database, input }),
    listProgramMembershipEvents: input => listProgramMembershipEvents({ database, input }),
    listProgramShells: input => listProgramShells({ database, input }),
  };
}

function createProgramShell({ database, generateId, input, now }) {
  const actor = resolveActiveActor(database, input?.actingIdentityId);
  if (actor.status === "rejected") {
    if (actor.reason === "identity_disabled") {
      recordProgramEvent({
        database,
        generateId,
        now,
        actorIdentityId: input.actingIdentityId,
        outcome: "rejected",
        reason: actor.reason,
      });
    }
    return rejected(actor.reason);
  }

  if (!isValidTitle(input?.title) || !isValidDescription(input?.description)) {
    recordProgramEvent({
      database,
      generateId,
      now,
      actorIdentityId: actor.identity.id,
      outcome: "rejected",
      reason: "validation_failed",
    });
    return rejected("validation_failed");
  }

  const createdAt = now().toISOString();
  const programId = generateId();
  const membershipId = generateId();
  const programEventId = generateId();
  const membershipEventId = generateId();

  try {
    const { shell, membership } = database.transaction(() => {
      const shellRecord = createProgramShellRecord(database, {
        id: programId,
        title: input.title.trim(),
        description: normalizeDescription(input.description),
        admissionPolicy: "self_join",
        createdByIdentityId: actor.identity.id,
        createdAt,
      });
      const membershipRecord = createProgramMembershipRecord(database, {
        id: membershipId,
        programId,
        identityId: actor.identity.id,
        participationKind: "program_curator",
        status: "active",
        createdAt,
        updatedAt: createdAt,
      });
      createProgramEventRecord(database, {
        id: programEventId,
        eventType: "program_created",
        actorIdentityId: actor.identity.id,
        programId,
        occurredAt: createdAt,
        outcome: "accepted",
      });
      createProgramMembershipEventRecord(database, {
        id: membershipEventId,
        eventType: "initial_curator_membership_created",
        actorIdentityId: actor.identity.id,
        targetIdentityId: actor.identity.id,
        programId,
        participationKind: "program_curator",
        resultingStatus: "active",
        occurredAt: createdAt,
        outcome: "accepted",
      });
      return { shell: shellRecord, membership: membershipRecord };
    })();

    return accepted({
      programShell: summarizeProgramShell(shell),
      initialCuratorMembership: summarizeMembership(membership),
    });
  } catch {
    recordProgramEvent({
      database,
      generateId,
      now,
      actorIdentityId: actor.identity.id,
      outcome: "rejected",
      reason: "program_creation_incomplete",
    });
    return rejected("program_creation_incomplete");
  }
}

function joinSelfJoinProgram({ database, generateId, input, now }) {
  const identityRecord = getIdentity(database, input?.actingIdentityId);
  if (!identityRecord) {
    return rejected("identity_not_found");
  }

  const program = getProgramShellRecord(database, input?.programId);

  if (identityRecord.state !== "active") {
    if (program) {
      recordMembershipEvent({
        database,
        generateId,
        now,
        eventType: "student_membership_joined",
        actorIdentityId: identityRecord.id,
        targetIdentityId: identityRecord.id,
        programId: program.id,
        participationKind: "student",
        outcome: "rejected",
        reason: "identity_disabled",
      });
    }
    return rejected("identity_disabled");
  }

  if (!program) {
    return rejected("program_not_found");
  }
  const actor = { identity: identityRecord };

  const existing = getProgramMembershipRecord(database, {
    programId: program.id,
    identityId: actor.identity.id,
    participationKind: "student",
  });

  if (existing && existing.status === "active") {
    return accepted({ programMembership: summarizeMembership(existing) });
  }

  if (existing && existing.status === "removed") {
    recordMembershipEvent({
      database,
      generateId,
      now,
      eventType: "student_membership_joined",
      actorIdentityId: actor.identity.id,
      targetIdentityId: actor.identity.id,
      programId: program.id,
      participationKind: "student",
      outcome: "rejected",
      reason: "membership_removed",
    });
    return rejected("membership_removed");
  }

  const occurredAt = now().toISOString();

  if (existing && existing.status === "left") {
    const reactivated = updateProgramMembershipStatus(database, {
      programId: program.id,
      identityId: actor.identity.id,
      participationKind: "student",
      status: "active",
      updatedAt: occurredAt,
    });
    createProgramMembershipEventRecord(database, {
      id: generateId(),
      eventType: "student_membership_rejoined",
      actorIdentityId: actor.identity.id,
      targetIdentityId: actor.identity.id,
      programId: program.id,
      participationKind: "student",
      resultingStatus: "active",
      occurredAt,
      outcome: "accepted",
    });
    return accepted({ programMembership: summarizeMembership(reactivated) });
  }

  const membership = createProgramMembershipRecord(database, {
    id: generateId(),
    programId: program.id,
    identityId: actor.identity.id,
    participationKind: "student",
    status: "active",
    createdAt: occurredAt,
    updatedAt: occurredAt,
  });
  createProgramMembershipEventRecord(database, {
    id: generateId(),
    eventType: "student_membership_joined",
    actorIdentityId: actor.identity.id,
    targetIdentityId: actor.identity.id,
    programId: program.id,
    participationKind: "student",
    resultingStatus: "active",
    occurredAt,
    outcome: "accepted",
  });
  return accepted({ programMembership: summarizeMembership(membership) });
}

function leaveStudentProgram({ database, generateId, input, now }) {
  const identityRecord = getIdentity(database, input?.actingIdentityId);
  if (!identityRecord) {
    return rejected("identity_not_found");
  }

  const program = getProgramShellRecord(database, input?.programId);

  if (identityRecord.state !== "active") {
    if (program) {
      recordMembershipEvent({
        database,
        generateId,
        now,
        eventType: "student_membership_left",
        actorIdentityId: identityRecord.id,
        targetIdentityId: identityRecord.id,
        programId: program.id,
        participationKind: "student",
        outcome: "rejected",
        reason: "identity_disabled",
      });
    }
    return rejected("identity_disabled");
  }

  if (!program) {
    return rejected("program_not_found");
  }
  const actor = { identity: identityRecord };

  const existing = getProgramMembershipRecord(database, {
    programId: program.id,
    identityId: actor.identity.id,
    participationKind: "student",
  });

  const rejectLeave = reason => {
    recordMembershipEvent({
      database,
      generateId,
      now,
      eventType: "student_membership_left",
      actorIdentityId: actor.identity.id,
      targetIdentityId: actor.identity.id,
      programId: program.id,
      participationKind: "student",
      outcome: "rejected",
      reason,
    });
    return rejected(reason);
  };

  if (!existing) {
    return rejectLeave("membership_missing");
  }
  if (existing.status === "left") {
    return rejectLeave("membership_left");
  }
  if (existing.status === "removed") {
    return rejectLeave("membership_removed");
  }

  const occurredAt = now().toISOString();
  const updated = updateProgramMembershipStatus(database, {
    programId: program.id,
    identityId: actor.identity.id,
    participationKind: "student",
    status: "left",
    updatedAt: occurredAt,
  });
  createProgramMembershipEventRecord(database, {
    id: generateId(),
    eventType: "student_membership_left",
    actorIdentityId: actor.identity.id,
    targetIdentityId: actor.identity.id,
    programId: program.id,
    participationKind: "student",
    resultingStatus: "left",
    occurredAt,
    outcome: "accepted",
  });
  return accepted({ programMembership: summarizeMembership(updated) });
}

function listProgramShells({ database, input }) {
  const actor = resolveActiveActor(database, input?.actingIdentityId);
  if (actor.status === "rejected") {
    return rejected(actor.reason);
  }

  return accepted({
    programShells: listProgramShellRecords(database).map(summarizeProgramShell),
  });
}

function getProgramShell({ database, input }) {
  const actor = resolveActiveActor(database, input?.actingIdentityId);
  if (actor.status === "rejected") {
    return rejected(actor.reason);
  }

  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return rejected("program_not_found");
  }

  return accepted({ programShell: summarizeProgramShell(program) });
}

function listMyProgramMemberships({ database, input }) {
  const actor = resolveActiveActor(database, input?.actingIdentityId);
  if (actor.status === "rejected") {
    return rejected(actor.reason);
  }

  return accepted({
    programMemberships: listProgramMembershipRecordsByIdentity(database, actor.identity.id).map(
      summarizeMembership,
    ),
  });
}

function getEffectiveParticipation({ database, input }) {
  if (!supportedParticipationKinds.has(input?.participationKind)) {
    return effective(false, "unsupported_participation_kind");
  }

  const identity = getIdentity(database, input?.identityId);
  if (!identity || identity.state !== "active") {
    return effective(false, "identity_not_active");
  }

  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return effective(false, "program_not_accepting_participation");
  }

  const membership = getProgramMembershipRecord(database, {
    programId: program.id,
    identityId: identity.id,
    participationKind: input.participationKind,
  });

  if (!membership) {
    return effective(false, "membership_missing");
  }
  if (membership.status === "left") {
    return effective(false, "membership_left");
  }
  if (membership.status === "removed") {
    return effective(false, "membership_removed");
  }

  return effective(true);
}

function listProgramEvents({ database, input }) {
  return listEventsAuthorized({
    database,
    input,
    list: ({ programId }) =>
      listProgramEventRecords(database, { programId }).map(summarizeProgramEvent),
    filterByPrograms: (events, allowedIds) => events.filter($0 => allowedIds.has($0.programId)),
  });
}

function listProgramMembershipEvents({ database, input }) {
  return listEventsAuthorized({
    database,
    input,
    list: ({ programId }) =>
      listProgramMembershipEventRecords(database, { programId }).map(summarizeMembershipEvent),
    filterByPrograms: (events, allowedIds) => events.filter($0 => allowedIds.has($0.programId)),
  });
}

function listEventsAuthorized({ database, input, list, filterByPrograms }) {
  const actor = resolveActiveActor(database, input?.actingIdentityId);
  if (actor.status === "rejected") {
    return rejected(actor.reason);
  }

  const isAdmin = isEffectiveAdmin(database, actor.identity.id);

  if (input?.programId !== undefined && input?.programId !== null) {
    const program = getProgramShellRecord(database, input.programId);
    if (!program) {
      return rejected("program_not_found");
    }
    const hasCurator = hasActiveProgramCuratorMembership(database, {
      programId: program.id,
      identityId: actor.identity.id,
    });
    if (!isAdmin && !hasCurator) {
      return rejected("admin_or_curator_required");
    }
    return accepted({ events: list({ programId: program.id }) });
  }

  if (isAdmin) {
    return accepted({ events: list({ programId: null }) });
  }

  const allowed = new Set(
    listProgramIdsWithActiveCuratorParticipation(database, actor.identity.id),
  );
  const events = filterByPrograms(list({ programId: null }), allowed);
  return accepted({ events });
}

function resolveActiveActor(database, actingIdentityId) {
  const identity = getIdentity(database, actingIdentityId);
  if (!identity) {
    return { status: "rejected", reason: "identity_not_found" };
  }
  if (identity.state !== "active") {
    return { status: "rejected", reason: "identity_disabled" };
  }
  return { status: "active", identity };
}

function recordProgramEvent({ database, generateId, now, actorIdentityId, outcome, reason }) {
  createProgramEventRecord(database, {
    id: generateId(),
    eventType: "program_created",
    actorIdentityId,
    programId: null,
    occurredAt: now().toISOString(),
    outcome,
    reason,
  });
}

function recordMembershipEvent({
  database,
  generateId,
  now,
  eventType,
  actorIdentityId,
  targetIdentityId,
  programId,
  participationKind,
  outcome,
  reason = null,
  resultingStatus = null,
}) {
  createProgramMembershipEventRecord(database, {
    id: generateId(),
    eventType,
    actorIdentityId,
    targetIdentityId,
    programId,
    participationKind,
    resultingStatus,
    occurredAt: now().toISOString(),
    outcome,
    reason,
  });
}

function summarizeProgramShell(shell) {
  return {
    programId: shell.id,
    title: shell.title,
    description: shell.description ?? undefined,
    admissionPolicy: shell.admissionPolicy,
    createdByIdentityId: shell.createdByIdentityId,
    createdAt: shell.createdAt,
  };
}

function summarizeMembership(membership) {
  return {
    programId: membership.programId,
    identityId: membership.identityId,
    participationKind: membership.participationKind,
    status: membership.status,
    updatedAt: membership.updatedAt,
  };
}

function summarizeProgramEvent(event) {
  return {
    id: event.id,
    eventType: event.eventType,
    actorIdentityId: event.actorIdentityId,
    programId: event.programId ?? undefined,
    occurredAt: event.occurredAt,
    outcome: event.outcome,
    reason: event.reason ?? undefined,
  };
}

function summarizeMembershipEvent(event) {
  return {
    id: event.id,
    eventType: event.eventType,
    actorIdentityId: event.actorIdentityId,
    targetIdentityId: event.targetIdentityId,
    programId: event.programId,
    participationKind: event.participationKind,
    resultingStatus: event.resultingStatus ?? undefined,
    occurredAt: event.occurredAt,
    outcome: event.outcome,
    reason: event.reason ?? undefined,
  };
}

function isValidTitle(title) {
  return typeof title === "string" && title.trim().length > 0;
}

function isValidDescription(description) {
  if (description === undefined || description === null) {
    return true;
  }
  return typeof description === "string";
}

function normalizeDescription(description) {
  if (description === undefined || description === null) {
    return null;
  }
  const trimmed = description.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function accepted(value) {
  return { status: "accepted", value };
}

function rejected(reason) {
  return { status: "rejected", reason };
}

function effective(allowed, reason) {
  if (allowed) {
    return { allowed: true };
  }
  return { allowed: false, reason };
}
