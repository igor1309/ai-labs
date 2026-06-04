import { randomUUID } from "node:crypto";
import {
  createProgramEventRecord,
  createProgramInvitationRecord,
  createProgramMembershipEventRecord,
  createProgramMembershipRecord,
  createProgramShellRecord,
  getIdentity,
  getProgramInvitationRecord,
  getProgramMembershipRecord,
  getProgramShellRecord,
  hasActiveProgramCuratorMembership,
  isEffectiveAdmin,
  listActiveProgramCuratorIdentityIds,
  listProgramEventRecords,
  listProgramIdsWithActiveCuratorParticipation,
  listProgramInvitationRecords,
  listProgramMembershipEventRecords,
  listProgramMembershipRecords,
  listProgramMembershipRecordsByIdentity,
  listProgramShellRecords,
  updateProgramAdmissionPolicyRecord,
  updateProgramInvitationStatusRecord,
  updateProgramMembershipStatus,
} from "./storage.js";

const supportedParticipationKinds = new Set(["student", "program_curator"]);
const supportedAdmissionPolicies = new Set(["self_join", "invitation_only"]);
const supportedInvitationStatuses = new Set(["pending", "accepted", "declined", "revoked"]);
const supportedMembershipStatuses = new Set(["active", "left", "removed"]);

export function createProgramCommands({
  database,
  generateId = randomUUID,
  now = () => new Date(),
} = {}) {
  return {
    acceptProgramInvitation: input =>
      acceptProgramInvitation({ database, generateId, input, now }),
    createProgramInvitation: input =>
      createProgramInvitation({ database, generateId, input, now }),
    createProgramShell: input => createProgramShell({ database, generateId, input, now }),
    declineProgramInvitation: input =>
      declineProgramInvitation({ database, generateId, input, now }),
    getEffectiveParticipation: input => getEffectiveParticipation({ database, input }),
    getProgramShell: input => getProgramShell({ database, input }),
    joinSelfJoinProgram: input => joinSelfJoinProgram({ database, generateId, input, now }),
    leaveCuratorProgram: input => leaveCuratorProgram({ database, generateId, input, now }),
    leaveStudentProgram: input => leaveStudentProgram({ database, generateId, input, now }),
    listMyProgramInvitations: input => listMyProgramInvitations({ database, input }),
    listMyProgramMemberships: input => listMyProgramMemberships({ database, input }),
    listProgramEvents: input => listProgramEvents({ database, input }),
    listProgramInvitations: input => listProgramInvitations({ database, input }),
    listProgramMembershipEvents: input => listProgramMembershipEvents({ database, input }),
    listProgramParticipants: input => listProgramParticipants({ database, input }),
    listProgramShells: input => listProgramShells({ database, input }),
    recoverProgramMembership: input =>
      recoverProgramMembership({ database, generateId, input, now }),
    removeProgramParticipant: input =>
      removeProgramParticipant({ database, generateId, input, now }),
    revokeProgramInvitation: input =>
      revokeProgramInvitation({ database, generateId, input, now }),
    revokeProgramMembership: input =>
      revokeProgramMembership({ database, generateId, input, now }),
    setProgramAdmissionPolicy: input =>
      setProgramAdmissionPolicy({ database, generateId, input, now }),
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

function setProgramAdmissionPolicy({ database, generateId, input, now }) {
  const context = resolveCuratorCommand(database, input);
  if (context.status === "rejected") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "program_admission_policy_changed",
      participationKind: "program_curator",
      policyPath: "self_join",
      reason: context.reason,
      targetIdentityId: input?.actingIdentityId,
    });
  }
  if (!supportedAdmissionPolicies.has(input?.admissionPolicy)) {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "program_admission_policy_changed",
      participationKind: "program_curator",
      policyPath: "self_join",
      reason: "validation_failed",
      targetIdentityId: context.actor.identity.id,
    });
  }

  const occurredAt = now().toISOString();
  const programShell = database.transaction(() => {
    const updated = updateProgramAdmissionPolicyRecord(database, {
      programId: context.program.id,
      admissionPolicy: input.admissionPolicy,
    });
    createProgramMembershipEventRecord(database, {
      id: generateId(),
      eventType: "program_admission_policy_changed",
      actorIdentityId: context.actor.identity.id,
      targetIdentityId: context.actor.identity.id,
      programId: context.program.id,
      participationKind: "program_curator",
      policyPath: input.admissionPolicy === "self_join" ? "self_join" : "curator_invitation",
      occurredAt,
      outcome: "accepted",
    });
    return updated;
  })();
  return accepted({ programShell: summarizeProgramShell(programShell) });
}

function createProgramInvitation({ database, generateId, input, now }) {
  const context = resolveCuratorCommand(database, input);
  if (context.status === "rejected") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_invitation_created",
      participationKind: input?.participationKind,
      policyPath: "curator_invitation",
      reason: context.reason,
    });
  }
  if (input?.participationKind !== "student") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_invitation_created",
      participationKind: input?.participationKind,
      policyPath: "curator_invitation",
      reason: "unsupported_participation_kind",
    });
  }

  const target = getIdentity(database, input?.targetIdentityId);
  if (!target) {
    return rejected("target_identity_not_found");
  }
  if (target.state !== "active") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_invitation_created",
      participationKind: "student",
      policyPath: "curator_invitation",
      reason: "target_identity_disabled",
    });
  }

  const existing = getProgramMembershipRecord(database, {
    programId: context.program.id,
    identityId: target.id,
    participationKind: "student",
  });
  if (existing?.status === "active") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_invitation_created",
      participationKind: "student",
      policyPath: "curator_invitation",
      reason: "membership_already_active",
    });
  }
  if (existing?.status === "removed") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_invitation_created",
      participationKind: "student",
      policyPath: "curator_invitation",
      reason: "membership_removed",
    });
  }

  const createdAt = now().toISOString();
  try {
    const invitation = database.transaction(() => {
      const created = createProgramInvitationRecord(database, {
        id: generateId(),
        programId: context.program.id,
        targetIdentityId: target.id,
        participationKind: "student",
        status: "pending",
        invitedByIdentityId: context.actor.identity.id,
        createdAt,
        updatedAt: createdAt,
      });
      createProgramMembershipEventRecord(database, {
        id: generateId(),
        eventType: "student_invitation_created",
        actorIdentityId: context.actor.identity.id,
        targetIdentityId: target.id,
        programId: context.program.id,
        participationKind: "student",
        policyPath: "curator_invitation",
        invitationStatus: "pending",
        occurredAt: createdAt,
        outcome: "accepted",
      });
      return created;
    })();
    return accepted({ programInvitation: summarizeInvitation(invitation) });
  } catch (error) {
    if (error?.reason === "invitation_conflict") {
      return rejectKnownMembershipMutation({
        database,
        generateId,
        now,
        input,
        eventType: "student_invitation_created",
        participationKind: "student",
        policyPath: "curator_invitation",
        reason: "invitation_conflict",
      });
    }
    throw error;
  }
}

function listProgramInvitations({ database, input }) {
  const context = resolveCuratorCommand(database, input);
  if (context.status === "rejected") {
    return rejected(context.reason);
  }
  if (!isValidOptionalValue(input?.status, supportedInvitationStatuses)) {
    return rejected("validation_failed");
  }

  return accepted({
    programInvitations: listProgramInvitationRecords(database, {
      programId: context.program.id,
      status: input?.status ?? null,
    }).map(summarizeInvitation),
  });
}

function listMyProgramInvitations({ database, input }) {
  const actor = resolveActiveActor(database, input?.actingIdentityId);
  if (actor.status === "rejected") {
    return rejected(actor.reason);
  }
  if (!isValidOptionalValue(input?.status, supportedInvitationStatuses)) {
    return rejected("validation_failed");
  }

  return accepted({
    programInvitations: listProgramInvitationRecords(database, {
      targetIdentityId: actor.identity.id,
      status: input?.status ?? null,
    }).map(summarizeInvitation),
  });
}

function acceptProgramInvitation({ database, generateId, input, now }) {
  const context = resolveTargetInvitationCommand(database, input);
  if (context.status === "rejected") {
    return rejectKnownInvitationMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_invitation_accepted",
      reason: context.reason,
    });
  }

  const existing = getProgramMembershipRecord(database, {
    programId: context.invitation.programId,
    identityId: context.actor.identity.id,
    participationKind: "student",
  });
  if (existing?.status === "removed") {
    return rejectKnownInvitationMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_invitation_accepted",
      reason: "membership_removed",
    });
  }

  const occurredAt = now().toISOString();
  const result = database.transaction(() => {
    const invitation = updateProgramInvitationStatusRecord(database, {
      id: context.invitation.id,
      status: "accepted",
      statusChangedByIdentityId: context.actor.identity.id,
      statusChangedAt: occurredAt,
      updatedAt: occurredAt,
    });
    let membership = existing;
    if (!membership) {
      membership = createProgramMembershipRecord(database, {
        id: generateId(),
        programId: context.invitation.programId,
        identityId: context.actor.identity.id,
        participationKind: "student",
        status: "active",
        createdAt: occurredAt,
        updatedAt: occurredAt,
      });
    } else if (membership.status === "left") {
      membership = updateProgramMembershipStatus(database, {
        programId: context.invitation.programId,
        identityId: context.actor.identity.id,
        participationKind: "student",
        status: "active",
        updatedAt: occurredAt,
      });
    }
    createProgramMembershipEventRecord(database, {
      id: generateId(),
      eventType: "student_invitation_accepted",
      actorIdentityId: context.actor.identity.id,
      targetIdentityId: context.actor.identity.id,
      programId: context.invitation.programId,
      participationKind: "student",
      policyPath: "curator_invitation",
      resultingStatus: "active",
      invitationStatus: "accepted",
      occurredAt,
      outcome: "accepted",
    });
    if (!existing || existing.status === "left") {
      createProgramMembershipEventRecord(database, {
        id: generateId(),
        eventType: existing ? "student_membership_rejoined" : "student_membership_joined",
        actorIdentityId: context.actor.identity.id,
        targetIdentityId: context.actor.identity.id,
        programId: context.invitation.programId,
        participationKind: "student",
        policyPath: "curator_invitation",
        resultingStatus: "active",
        occurredAt,
        outcome: "accepted",
      });
    }
    return { invitation, membership };
  })();

  return accepted({
    programInvitation: summarizeInvitation(result.invitation),
    programMembership: summarizeMembership(result.membership),
  });
}

function declineProgramInvitation({ database, generateId, input, now }) {
  const context = resolveTargetInvitationCommand(database, input);
  if (context.status === "rejected") {
    return rejectKnownInvitationMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_invitation_declined",
      reason: context.reason,
    });
  }

  const invitation = transitionInvitation({
    database,
    generateId,
    now,
    context,
    eventType: "student_invitation_declined",
    status: "declined",
  });
  return accepted({ programInvitation: summarizeInvitation(invitation) });
}

function revokeProgramInvitation({ database, generateId, input, now }) {
  const actor = resolveActiveActor(database, input?.actingIdentityId);
  if (actor.status === "rejected") {
    return rejectKnownInvitationMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_invitation_revoked",
      reason: actor.reason,
    });
  }
  const invitation = getProgramInvitationRecord(database, input?.invitationId);
  if (!invitation) {
    return rejected("invitation_not_found");
  }
  const program = getProgramShellRecord(database, invitation.programId);
  if (!hasActiveProgramCuratorMembership(database, {
    programId: invitation.programId,
    identityId: actor.identity.id,
  })) {
    return rejectKnownInvitationMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_invitation_revoked",
      reason: "participation_required",
    });
  }
  if (invitation.status !== "pending") {
    return rejectKnownInvitationMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_invitation_revoked",
      reason: "invitation_not_pending",
    });
  }

  const updated = transitionInvitation({
    database,
    generateId,
    now,
    context: { actor, invitation, program },
    eventType: "student_invitation_revoked",
    status: "revoked",
  });
  return accepted({ programInvitation: summarizeInvitation(updated) });
}

function listProgramParticipants({ database, input }) {
  const actor = resolveActiveActor(database, input?.actingIdentityId);
  if (actor.status === "rejected") {
    return rejected(actor.reason);
  }
  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return rejected("program_not_found");
  }
  if (
    !isEffectiveAdmin(database, actor.identity.id) &&
    !hasActiveProgramCuratorMembership(database, {
      programId: program.id,
      identityId: actor.identity.id,
    })
  ) {
    return rejected("admin_or_curator_required");
  }
  if (
    !isValidOptionalValue(input?.participationKind, supportedParticipationKinds) ||
    !isValidOptionalValue(input?.status, supportedMembershipStatuses)
  ) {
    return rejected("validation_failed");
  }

  const participants = listProgramMembershipRecords(database).filter(
    $0 =>
      $0.programId === program.id &&
      (input?.participationKind === undefined || $0.participationKind === input.participationKind) &&
      (input?.status === undefined || $0.status === input.status),
  );
  return accepted({ programParticipants: participants.map(summarizeMembership) });
}

function removeProgramParticipant({ database, generateId, input, now }) {
  const context = resolveCuratorCommand(database, input);
  if (context.status === "rejected") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_membership_removed",
      participationKind: "student",
      policyPath: "curator_removal",
      reason: context.reason,
    });
  }
  if (input?.participationKind !== "student") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_membership_removed",
      participationKind: input?.participationKind,
      policyPath: "curator_removal",
      reason: "unsupported_participation_kind",
    });
  }

  const membership = getProgramMembershipRecord(database, {
    programId: context.program.id,
    identityId: input?.targetIdentityId,
    participationKind: "student",
  });
  if (!membership) {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_membership_removed",
      participationKind: "student",
      policyPath: "curator_removal",
      reason: "membership_missing",
    });
  }
  if (membership.status === "removed") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "student_membership_removed",
      participationKind: "student",
      policyPath: "curator_removal",
      reason: "membership_removed",
    });
  }

  const occurredAt = now().toISOString();
  const updated = database.transaction(() => {
    const changed = updateProgramMembershipStatus(database, {
      programId: context.program.id,
      identityId: membership.identityId,
      participationKind: "student",
      status: "removed",
      updatedAt: occurredAt,
    });
    createProgramMembershipEventRecord(database, {
      id: generateId(),
      eventType: "student_membership_removed",
      actorIdentityId: context.actor.identity.id,
      targetIdentityId: membership.identityId,
      programId: context.program.id,
      participationKind: "student",
      policyPath: "curator_removal",
      resultingStatus: "removed",
      occurredAt,
      outcome: "accepted",
    });
    return changed;
  })();
  return accepted({ programMembership: summarizeMembership(updated) });
}

function leaveCuratorProgram({ database, generateId, input, now }) {
  const actor = resolveActiveActor(database, input?.actingIdentityId);
  if (actor.status === "rejected") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "curator_membership_left",
      participationKind: "program_curator",
      policyPath: "curator_leave",
      reason: actor.reason,
      targetIdentityId: input?.actingIdentityId,
    });
  }
  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return rejected("program_not_found");
  }
  const membership = getProgramMembershipRecord(database, {
    programId: program.id,
    identityId: actor.identity.id,
    participationKind: "program_curator",
  });
  if (!membership) {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "curator_membership_left",
      participationKind: "program_curator",
      policyPath: "curator_leave",
      reason: "membership_missing",
      targetIdentityId: actor.identity.id,
    });
  }
  if (membership.status === "left") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "curator_membership_left",
      participationKind: "program_curator",
      policyPath: "curator_leave",
      reason: "membership_left",
      targetIdentityId: actor.identity.id,
    });
  }
  if (membership.status === "removed") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "curator_membership_left",
      participationKind: "program_curator",
      policyPath: "curator_leave",
      reason: "membership_removed",
      targetIdentityId: actor.identity.id,
    });
  }
  if (countEffectiveProgramCurators(database, program.id) === 1) {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "curator_membership_left",
      participationKind: "program_curator",
      policyPath: "curator_leave",
      reason: "last_curator_required",
      targetIdentityId: actor.identity.id,
    });
  }

  const occurredAt = now().toISOString();
  const updated = database.transaction(() => {
    const changed = updateProgramMembershipStatus(database, {
      programId: program.id,
      identityId: actor.identity.id,
      participationKind: "program_curator",
      status: "left",
      updatedAt: occurredAt,
    });
    createProgramMembershipEventRecord(database, {
      id: generateId(),
      eventType: "curator_membership_left",
      actorIdentityId: actor.identity.id,
      targetIdentityId: actor.identity.id,
      programId: program.id,
      participationKind: "program_curator",
      policyPath: "curator_leave",
      resultingStatus: "left",
      occurredAt,
      outcome: "accepted",
    });
    return changed;
  })();
  return accepted({ programMembership: summarizeMembership(updated) });
}

function recoverProgramMembership({ database, generateId, input, now }) {
  const context = resolveAdminMembershipCommand(database, input, input?.recoveryReason);
  if (context.status === "rejected") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "membership_exceptionally_recovered",
      participationKind: input?.participationKind,
      policyPath: "admin_exceptional_recovery",
      reason: context.reason,
    });
  }

  const existing = getProgramMembershipRecord(database, {
    programId: context.program.id,
    identityId: context.target.id,
    participationKind: input.participationKind,
  });
  const occurredAt = now().toISOString();
  const membership = database.transaction(() => {
    const changed = existing
      ? updateProgramMembershipStatus(database, {
          programId: context.program.id,
          identityId: context.target.id,
          participationKind: input.participationKind,
          status: "active",
          updatedAt: occurredAt,
        })
      : createProgramMembershipRecord(database, {
          id: generateId(),
          programId: context.program.id,
          identityId: context.target.id,
          participationKind: input.participationKind,
          status: "active",
          createdAt: occurredAt,
          updatedAt: occurredAt,
        });
    createProgramMembershipEventRecord(database, {
      id: generateId(),
      eventType: "membership_exceptionally_recovered",
      actorIdentityId: context.actor.identity.id,
      targetIdentityId: context.target.id,
      programId: context.program.id,
      participationKind: input.participationKind,
      policyPath: "admin_exceptional_recovery",
      resultingStatus: "active",
      occurredAt,
      outcome: "accepted",
      reason: input.recoveryReason.trim(),
    });
    return changed;
  })();
  return accepted({ programMembership: summarizeMembership(membership) });
}

function revokeProgramMembership({ database, generateId, input, now }) {
  const context = resolveAdminMembershipCommand(database, input, input?.revocationReason, {
    requireActiveTarget: false,
  });
  if (context.status === "rejected") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "membership_exceptionally_revoked",
      participationKind: input?.participationKind,
      policyPath: "admin_exceptional_revocation",
      reason: context.reason,
    });
  }

  const membership = getProgramMembershipRecord(database, {
    programId: context.program.id,
    identityId: context.target.id,
    participationKind: input.participationKind,
  });
  if (!membership) {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "membership_exceptionally_revoked",
      participationKind: input.participationKind,
      policyPath: "admin_exceptional_revocation",
      reason: "membership_missing",
    });
  }
  if (membership.status === "removed") {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "membership_exceptionally_revoked",
      participationKind: input.participationKind,
      policyPath: "admin_exceptional_revocation",
      reason: "membership_removed",
    });
  }
  if (
    input.participationKind === "program_curator" &&
    membership.status === "active" &&
    countEffectiveProgramCurators(database, context.program.id) === 1
  ) {
    return rejectKnownMembershipMutation({
      database,
      generateId,
      now,
      input,
      eventType: "membership_exceptionally_revoked",
      participationKind: input.participationKind,
      policyPath: "admin_exceptional_revocation",
      reason: "last_curator_required",
    });
  }

  const occurredAt = now().toISOString();
  const updated = database.transaction(() => {
    const changed = updateProgramMembershipStatus(database, {
      programId: context.program.id,
      identityId: context.target.id,
      participationKind: input.participationKind,
      status: "removed",
      updatedAt: occurredAt,
    });
    createProgramMembershipEventRecord(database, {
      id: generateId(),
      eventType: "membership_exceptionally_revoked",
      actorIdentityId: context.actor.identity.id,
      targetIdentityId: context.target.id,
      programId: context.program.id,
      participationKind: input.participationKind,
      policyPath: "admin_exceptional_revocation",
      resultingStatus: "removed",
      occurredAt,
      outcome: "accepted",
      reason: input.revocationReason.trim(),
    });
    return changed;
  })();
  return accepted({ programMembership: summarizeMembership(updated) });
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
        policyPath: "self_join",
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
      policyPath: "self_join",
      outcome: "rejected",
      reason: "membership_removed",
    });
    return rejected("membership_removed");
  }

  if (program.admissionPolicy !== "self_join") {
    recordMembershipEvent({
      database,
      generateId,
      now,
      eventType: "student_membership_joined",
      actorIdentityId: actor.identity.id,
      targetIdentityId: actor.identity.id,
      programId: program.id,
      participationKind: "student",
      policyPath: "self_join",
      outcome: "rejected",
      reason: "policy_not_satisfied",
    });
    return rejected("policy_not_satisfied");
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
      policyPath: "self_join",
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
    policyPath: "self_join",
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

function resolveCuratorCommand(database, input) {
  const actor = resolveActiveActor(database, input?.actingIdentityId);
  if (actor.status === "rejected") {
    return actor;
  }
  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return { status: "rejected", reason: "program_not_found" };
  }
  if (!hasActiveProgramCuratorMembership(database, {
    programId: program.id,
    identityId: actor.identity.id,
  })) {
    return { status: "rejected", reason: "participation_required" };
  }
  return { status: "active", actor, program };
}

function resolveTargetInvitationCommand(database, input) {
  const actor = resolveActiveActor(database, input?.actingIdentityId);
  if (actor.status === "rejected") {
    return actor;
  }
  const invitation = getProgramInvitationRecord(database, input?.invitationId);
  if (!invitation || invitation.targetIdentityId !== actor.identity.id) {
    return { status: "rejected", reason: "invitation_not_found" };
  }
  if (invitation.status !== "pending") {
    return { status: "rejected", reason: "invitation_not_pending" };
  }
  const program = getProgramShellRecord(database, invitation.programId);
  if (!program) {
    return { status: "rejected", reason: "invitation_not_found" };
  }
  return { status: "active", actor, invitation, program };
}

function resolveAdminMembershipCommand(database, input, reason, { requireActiveTarget = true } = {}) {
  const actor = resolveActiveActor(database, input?.actingIdentityId);
  if (actor.status === "rejected") {
    return actor;
  }
  if (!isEffectiveAdmin(database, actor.identity.id)) {
    return { status: "rejected", reason: "admin_required" };
  }
  if (!isNonEmptyString(reason)) {
    return { status: "rejected", reason: "validation_failed" };
  }
  if (!supportedParticipationKinds.has(input?.participationKind)) {
    return { status: "rejected", reason: "unsupported_participation_kind" };
  }
  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return { status: "rejected", reason: "program_not_found" };
  }
  const target = getIdentity(database, input?.targetIdentityId);
  if (!target) {
    return { status: "rejected", reason: "target_identity_not_found" };
  }
  if (requireActiveTarget && target.state !== "active") {
    return { status: "rejected", reason: "target_identity_disabled" };
  }
  return { status: "active", actor, program, target };
}

function rejectKnownInvitationMutation({ database, generateId, now, input, eventType, reason }) {
  const invitation = getProgramInvitationRecord(database, input?.invitationId);
  return rejectKnownMembershipMutation({
    database,
    generateId,
    now,
    input,
    eventType,
    invitationStatus: invitation?.status,
    participationKind: invitation?.participationKind,
    policyPath: "curator_invitation",
    programId: invitation?.programId,
    reason,
    targetIdentityId: invitation?.targetIdentityId,
  });
}

function rejectKnownMembershipMutation({
  database,
  generateId,
  now,
  input,
  eventType,
  invitationStatus = null,
  participationKind,
  policyPath,
  programId = input?.programId,
  reason,
  targetIdentityId = input?.targetIdentityId,
}) {
  const actor = getIdentity(database, input?.actingIdentityId);
  const program = getProgramShellRecord(database, programId);
  const target = getIdentity(database, targetIdentityId);
  if (actor && program && target && supportedParticipationKinds.has(participationKind)) {
    recordMembershipEvent({
      database,
      generateId,
      now,
      eventType,
      actorIdentityId: actor.id,
      targetIdentityId: target.id,
      programId: program.id,
      participationKind,
      policyPath,
      invitationStatus,
      outcome: "rejected",
      reason,
    });
  }
  return rejected(reason);
}

function transitionInvitation({ database, generateId, now, context, eventType, status }) {
  const occurredAt = now().toISOString();
  return database.transaction(() => {
    const invitation = updateProgramInvitationStatusRecord(database, {
      id: context.invitation.id,
      status,
      statusChangedByIdentityId: context.actor.identity.id,
      statusChangedAt: occurredAt,
      updatedAt: occurredAt,
    });
    createProgramMembershipEventRecord(database, {
      id: generateId(),
      eventType,
      actorIdentityId: context.actor.identity.id,
      targetIdentityId: context.invitation.targetIdentityId,
      programId: context.invitation.programId,
      participationKind: "student",
      policyPath: "curator_invitation",
      invitationStatus: status,
      occurredAt,
      outcome: "accepted",
    });
    return invitation;
  })();
}

function countEffectiveProgramCurators(database, programId) {
  return listActiveProgramCuratorIdentityIds(database, programId).filter(
    identityId => getIdentity(database, identityId)?.state === "active",
  ).length;
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
  policyPath = null,
  outcome,
  reason = null,
  resultingStatus = null,
  invitationStatus = null,
}) {
  createProgramMembershipEventRecord(database, {
    id: generateId(),
    eventType,
    actorIdentityId,
    targetIdentityId,
    programId,
    participationKind,
    policyPath,
    resultingStatus,
    invitationStatus,
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

function summarizeInvitation(invitation) {
  return {
    invitationId: invitation.id,
    programId: invitation.programId,
    targetIdentityId: invitation.targetIdentityId,
    participationKind: invitation.participationKind,
    status: invitation.status,
    invitedByIdentityId: invitation.invitedByIdentityId,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
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
    policyPath: event.policyPath ?? undefined,
    resultingStatus: event.resultingStatus ?? undefined,
    invitationStatus: event.invitationStatus ?? undefined,
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

function isValidOptionalValue(value, supportedValues) {
  return value === undefined || value === null || supportedValues.has(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
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
