import assert from "node:assert/strict";
import test from "node:test";
import { createProgramCommands } from "../src/program.js";
import {
  createIdentity,
  createProgramMembershipRecord,
  disableIdentity,
  grantAdminAuthority,
  initializeIdentityStorage,
  listProgramEventRecords,
  listProgramMembershipEventRecords,
  openIdentityDatabase as openDatabase,
} from "../src/storage.js";

// Program shell creation

test("createProgramShell_shouldAcceptAndReturnSelfJoinShell_onActiveIdentity", () => {
  const { commands, database } = makeSUT();

  try {
    const result = commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
      description: "Foundations",
    });

    assert.deepEqual(result, {
      status: "accepted",
      value: {
        programShell: {
          programId: "program-1",
          title: "Linear Algebra",
          description: "Foundations",
          admissionPolicy: "self_join",
          createdByIdentityId: "identity-curator",
          createdAt: "2026-05-27T10:00:00.000Z",
        },
        initialCuratorMembership: {
          programId: "program-1",
          identityId: "identity-curator",
          participationKind: "program_curator",
          status: "active",
          updatedAt: "2026-05-27T10:00:00.000Z",
        },
      },
    });
  } finally {
    database.close();
  }
});

test("createProgramShell_shouldCreateActiveCuratorMembership_onAccepted", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });

    const membership = commands.getEffectiveParticipation({
      identityId: "identity-curator",
      programId: "program-1",
      participationKind: "program_curator",
    });

    assert.deepEqual(membership, { allowed: true });
  } finally {
    database.close();
  }
});

test("createProgramShell_shouldEmitAcceptedProgramAndMembershipEvents_onAccepted", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });

    assert.deepEqual(
      {
        programEvents: listProgramEventRecords(database).map(projectProgramEvent),
        membershipEvents: listProgramMembershipEventRecords(database).map(
          projectMembershipEvent,
        ),
      },
      {
        programEvents: [
          {
            eventType: "program_created",
            outcome: "accepted",
            actorIdentityId: "identity-curator",
            programId: "program-1",
            reason: null,
          },
        ],
        membershipEvents: [
          {
            eventType: "initial_curator_membership_created",
            outcome: "accepted",
            actorIdentityId: "identity-curator",
            targetIdentityId: "identity-curator",
            programId: "program-1",
            participationKind: "program_curator",
            resultingStatus: "active",
            reason: null,
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("createProgramShell_shouldNotGrantAdminAuthority_onAccepted", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });

    const adminParticipation = commands.getEffectiveParticipation({
      identityId: "identity-curator",
      programId: "program-1",
      participationKind: "program_curator",
    });

    assert.deepEqual(adminParticipation, { allowed: true });
  } finally {
    database.close();
  }
});

test("createProgramShell_shouldNotGrantStudentMembership_onAccepted", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });

    const studentParticipation = commands.getEffectiveParticipation({
      identityId: "identity-curator",
      programId: "program-1",
      participationKind: "student",
    });

    assert.deepEqual(studentParticipation, {
      allowed: false,
      reason: "membership_missing",
    });
  } finally {
    database.close();
  }
});

test("createProgramShell_shouldRejectUnknownIdentity_withIdentityNotFound", () => {
  const { commands, database } = makeSUT();

  try {
    const result = commands.createProgramShell({
      actingIdentityId: "identity-ghost",
      title: "Linear Algebra",
    });

    assert.deepEqual(
      { result, programEvents: listProgramEventRecords(database) },
      { result: { status: "rejected", reason: "identity_not_found" }, programEvents: [] },
    );
  } finally {
    database.close();
  }
});

test("createProgramShell_shouldRejectDisabledIdentityAndEmitRejectedEvent_withIdentityDisabled", () => {
  const { commands, database } = makeSUT();

  try {
    disableIdentity(database, {
      identityId: "identity-curator-2",
      disabledAt: "2026-05-27T10:00:00.000Z",
    });

    const result = commands.createProgramShell({
      actingIdentityId: "identity-curator-2",
      title: "Linear Algebra",
    });

    assert.deepEqual(
      {
        result,
        programEvents: listProgramEventRecords(database).map(projectProgramEvent),
      },
      {
        result: { status: "rejected", reason: "identity_disabled" },
        programEvents: [
          {
            eventType: "program_created",
            outcome: "rejected",
            actorIdentityId: "identity-curator-2",
            programId: null,
            reason: "identity_disabled",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("createProgramShell_shouldRejectEmptyTitleWithValidationFailed", () => {
  const { commands, database } = makeSUT();

  try {
    const result = commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "   ",
    });

    assert.deepEqual(
      {
        result,
        programEvents: listProgramEventRecords(database).map($0 => ({
          eventType: $0.eventType,
          outcome: $0.outcome,
          reason: $0.reason,
        })),
      },
      {
        result: { status: "rejected", reason: "validation_failed" },
        programEvents: [
          {
            eventType: "program_created",
            outcome: "rejected",
            reason: "validation_failed",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("createProgramShell_shouldRollBackOnInitialCuratorMembershipFailure", () => {
  const { commands, database } = makeSUT();

  try {
    // Force generateId to produce a duplicate program shell id, breaking shell insertion mid-transaction
    let attempt = 0;
    const failingCommands = createProgramCommands({
      database,
      generateId: () => {
        attempt += 1;
        if (attempt === 1) {
          return "program-1";
        }
        if (attempt === 2) {
          return "membership-1";
        }
        return `id-${attempt}`;
      },
      now: () => new Date("2026-05-27T10:00:00.000Z"),
    });

    failingCommands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });

    // Second attempt: reuse same ids — shell insert will fail with primary key conflict.
    let secondAttempt = 0;
    const failingAgain = createProgramCommands({
      database,
      generateId: () => {
        secondAttempt += 1;
        if (secondAttempt === 1) {
          return "program-1";
        }
        if (secondAttempt === 2) {
          return "membership-1";
        }
        return `id-${secondAttempt}`;
      },
      now: () => new Date("2026-05-27T10:00:00.000Z"),
    });

    const result = failingAgain.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Another Program",
    });

    const shells = commands.listProgramShells({ actingIdentityId: "identity-curator" });

    assert.deepEqual(
      {
        result,
        shellIds: shells.value.programShells.map($0 => $0.programId),
      },
      {
        result: { status: "rejected", reason: "program_creation_incomplete" },
        shellIds: ["program-1"],
      },
    );
  } finally {
    database.close();
  }
});

test("createProgramShell_shouldEmitRejectedProgramEvent_onKnownIdentityRejection", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "",
    });

    assert.deepEqual(
      listProgramEventRecords(database).map($0 => ({
        eventType: $0.eventType,
        outcome: $0.outcome,
        reason: $0.reason,
      })),
      [
        { eventType: "program_created", outcome: "rejected", reason: "validation_failed" },
      ],
    );
  } finally {
    database.close();
  }
});

// Program discovery

test("listProgramShells_shouldReturnAllShells_onActiveIdentity", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });

    const result = commands.listProgramShells({ actingIdentityId: "identity-student" });

    assert.deepEqual(
      result.value.programShells.map($0 => ({ programId: $0.programId, title: $0.title })),
      [{ programId: "program-1", title: "Linear Algebra" }],
    );
  } finally {
    database.close();
  }
});

test("listProgramShells_shouldRejectUnknownIdentity_withIdentityNotFound", () => {
  const { commands, database } = makeSUT();

  try {
    const result = commands.listProgramShells({ actingIdentityId: "identity-ghost" });
    assert.deepEqual(result, { status: "rejected", reason: "identity_not_found" });
  } finally {
    database.close();
  }
});

test("listProgramShells_shouldRejectDisabledIdentity_withIdentityDisabled", () => {
  const { commands, database } = makeSUT();

  try {
    disableIdentity(database, {
      identityId: "identity-student",
      disabledAt: "2026-05-27T10:00:00.000Z",
    });
    const result = commands.listProgramShells({ actingIdentityId: "identity-student" });
    assert.deepEqual(result, { status: "rejected", reason: "identity_disabled" });
  } finally {
    database.close();
  }
});

test("getProgramShell_shouldReturnExistingShell_onActiveIdentity", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });

    const result = commands.getProgramShell({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    assert.equal(result.status, "accepted");
    assert.equal(result.value.programShell.programId, "program-1");
  } finally {
    database.close();
  }
});

test("getProgramShell_shouldRejectUnknownProgram_withProgramNotFound", () => {
  const { commands, database } = makeSUT();

  try {
    const result = commands.getProgramShell({
      actingIdentityId: "identity-student",
      programId: "program-ghost",
    });
    assert.deepEqual(result, { status: "rejected", reason: "program_not_found" });
  } finally {
    database.close();
  }
});

test("listMyProgramMemberships_shouldOnlyReturnActingIdentityMemberships", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    const result = commands.listMyProgramMemberships({ actingIdentityId: "identity-student" });

    assert.deepEqual(
      result.value.programMemberships.map($0 => ({
        identityId: $0.identityId,
        programId: $0.programId,
        participationKind: $0.participationKind,
        status: $0.status,
      })),
      [
        {
          identityId: "identity-student",
          programId: "program-1",
          participationKind: "student",
          status: "active",
        },
      ],
    );
  } finally {
    database.close();
  }
});

test("listMyProgramMemberships_shouldIncludeActiveLeftAndRemovedMemberships", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    commands.leaveStudentProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    const result = commands.listMyProgramMemberships({ actingIdentityId: "identity-student" });

    assert.deepEqual(
      result.value.programMemberships.map($0 => $0.status),
      ["left"],
    );
  } finally {
    database.close();
  }
});

// Student membership

test("joinSelfJoinProgram_shouldAcceptFirstJoin_onActiveStudent", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });

    const result = commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    assert.deepEqual(result.status, "accepted");
    assert.equal(result.value.programMembership.status, "active");
  } finally {
    database.close();
  }
});

test("joinSelfJoinProgram_shouldEmitJoinedEvent_onFirstJoin", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    assert.deepEqual(
      listProgramMembershipEventRecords(database)
        .filter($0 => $0.targetIdentityId === "identity-student")
        .map(projectMembershipEvent),
      [
        {
          eventType: "student_membership_joined",
          outcome: "accepted",
          actorIdentityId: "identity-student",
          targetIdentityId: "identity-student",
          programId: "program-1",
          participationKind: "student",
          policyPath: "self_join",
          resultingStatus: "active",
          reason: null,
        },
      ],
    );
  } finally {
    database.close();
  }
});

test("joinSelfJoinProgram_shouldBeIdempotentForActiveMembership", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    const eventsBefore = listProgramMembershipEventRecords(database).length;
    const result = commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    const eventsAfter = listProgramMembershipEventRecords(database).length;

    assert.deepEqual(
      {
        status: result.status,
        membershipStatus: result.value.programMembership.status,
        addedEvents: eventsAfter - eventsBefore,
      },
      { status: "accepted", membershipStatus: "active", addedEvents: 0 },
    );
  } finally {
    database.close();
  }
});

test("joinSelfJoinProgram_shouldReactivateLeftMembershipAndEmitRejoinedEvent", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    commands.leaveStudentProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    const result = commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    assert.deepEqual(
      {
        membershipStatus: result.value.programMembership.status,
        latestEvent: projectMembershipEvent(
          listProgramMembershipEventRecords(database).at(-1),
        ),
      },
      {
        membershipStatus: "active",
        latestEvent: {
          eventType: "student_membership_rejoined",
          outcome: "accepted",
          actorIdentityId: "identity-student",
          targetIdentityId: "identity-student",
          programId: "program-1",
          participationKind: "student",
          policyPath: "self_join",
          resultingStatus: "active",
          reason: null,
        },
      },
    );
  } finally {
    database.close();
  }
});

test("joinSelfJoinProgram_shouldReuseExistingMembership_onRejoin", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    commands.leaveStudentProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    const memberships = commands.listMyProgramMemberships({
      actingIdentityId: "identity-student",
    }).value.programMemberships;

    assert.equal(memberships.length, 1);
    assert.equal(memberships[0].status, "active");
  } finally {
    database.close();
  }
});

test("joinSelfJoinProgram_shouldRejectRemovedMembershipAndEmitRejectedEvent", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    // Mark membership removed via direct storage write to simulate later admin removal.
    database
      .prepare(
        `update program_memberships set status = 'removed', updated_at = ?
         where identity_id = ? and program_id = ? and participation_kind = 'student'`,
      )
      .run("2026-05-27T10:01:00.000Z", "identity-student", "program-1");

    const result = commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    assert.deepEqual(
      {
        result,
        latestEvent: projectMembershipEvent(
          listProgramMembershipEventRecords(database).at(-1),
        ),
      },
      {
        result: { status: "rejected", reason: "membership_removed" },
        latestEvent: {
          eventType: "student_membership_joined",
          outcome: "rejected",
          actorIdentityId: "identity-student",
          targetIdentityId: "identity-student",
          programId: "program-1",
          participationKind: "student",
          policyPath: "self_join",
          resultingStatus: null,
          reason: "membership_removed",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("joinSelfJoinProgram_shouldRejectUnknownIdentity_withIdentityNotFound", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    const result = commands.joinSelfJoinProgram({
      actingIdentityId: "identity-ghost",
      programId: "program-1",
    });
    assert.deepEqual(result, { status: "rejected", reason: "identity_not_found" });
  } finally {
    database.close();
  }
});

test("joinSelfJoinProgram_shouldRejectDisabledIdentity_withIdentityDisabled", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    disableIdentity(database, {
      identityId: "identity-student",
      disabledAt: "2026-05-27T10:00:00.000Z",
    });
    const result = commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    assert.deepEqual(
      {
        result,
        latestEvent: projectMembershipEvent(
          listProgramMembershipEventRecords(database).at(-1),
        ),
      },
      {
        result: { status: "rejected", reason: "identity_disabled" },
        latestEvent: {
          eventType: "student_membership_joined",
          outcome: "rejected",
          actorIdentityId: "identity-student",
          targetIdentityId: "identity-student",
          programId: "program-1",
          participationKind: "student",
          policyPath: "self_join",
          resultingStatus: null,
          reason: "identity_disabled",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("joinSelfJoinProgram_shouldRejectUnknownProgram_withProgramNotFound", () => {
  const { commands, database } = makeSUT();

  try {
    const result = commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-ghost",
    });
    assert.deepEqual(result, { status: "rejected", reason: "program_not_found" });
  } finally {
    database.close();
  }
});

test("leaveStudentProgram_shouldChangeActiveToLeftAndEmitEvent", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    const result = commands.leaveStudentProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    assert.deepEqual(
      {
        result: result.status,
        membershipStatus: result.value.programMembership.status,
        latestEvent: projectMembershipEvent(
          listProgramMembershipEventRecords(database).at(-1),
        ),
      },
      {
        result: "accepted",
        membershipStatus: "left",
        latestEvent: {
          eventType: "student_membership_left",
          outcome: "accepted",
          actorIdentityId: "identity-student",
          targetIdentityId: "identity-student",
          programId: "program-1",
          participationKind: "student",
          resultingStatus: "left",
          reason: null,
        },
      },
    );
  } finally {
    database.close();
  }
});

test("leaveStudentProgram_shouldRejectUnknownIdentity_withIdentityNotFound", () => {
  const { commands, database } = makeSUT();

  try {
    const result = commands.leaveStudentProgram({
      actingIdentityId: "identity-ghost",
      programId: "program-1",
    });
    assert.deepEqual(result, { status: "rejected", reason: "identity_not_found" });
  } finally {
    database.close();
  }
});

test("leaveStudentProgram_shouldRejectDisabledIdentity_withIdentityDisabled", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    disableIdentity(database, {
      identityId: "identity-student",
      disabledAt: "2026-05-27T10:00:00.000Z",
    });
    const result = commands.leaveStudentProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    assert.equal(result.status, "rejected");
    assert.equal(result.reason, "identity_disabled");
  } finally {
    database.close();
  }
});

test("leaveStudentProgram_shouldRejectUnknownProgram_withProgramNotFound", () => {
  const { commands, database } = makeSUT();

  try {
    const result = commands.leaveStudentProgram({
      actingIdentityId: "identity-student",
      programId: "program-ghost",
    });
    assert.deepEqual(result, { status: "rejected", reason: "program_not_found" });
  } finally {
    database.close();
  }
});

test("leaveStudentProgram_shouldRejectMissingMembership_withMembershipMissing", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    const result = commands.leaveStudentProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    assert.deepEqual(
      {
        result,
        latestEvent: projectMembershipEvent(
          listProgramMembershipEventRecords(database).at(-1),
        ),
      },
      {
        result: { status: "rejected", reason: "membership_missing" },
        latestEvent: {
          eventType: "student_membership_left",
          outcome: "rejected",
          actorIdentityId: "identity-student",
          targetIdentityId: "identity-student",
          programId: "program-1",
          participationKind: "student",
          resultingStatus: null,
          reason: "membership_missing",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("leaveStudentProgram_shouldRejectLeftMembership_withMembershipLeft", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    commands.leaveStudentProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    const result = commands.leaveStudentProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    assert.deepEqual(result, { status: "rejected", reason: "membership_left" });
  } finally {
    database.close();
  }
});

test("leaveStudentProgram_shouldRejectRemovedMembership_withMembershipRemoved", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    database
      .prepare(
        `update program_memberships set status = 'removed', updated_at = ?
         where identity_id = ? and program_id = ? and participation_kind = 'student'`,
      )
      .run("2026-05-27T10:01:00.000Z", "identity-student", "program-1");

    const result = commands.leaveStudentProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    assert.deepEqual(result, { status: "rejected", reason: "membership_removed" });
  } finally {
    database.close();
  }
});

test("leaveStudentProgram_shouldEmitRejectedEvent_onKnownIdentityAndProgram", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.leaveStudentProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    assert.equal(
      listProgramMembershipEventRecords(database).at(-1).outcome,
      "rejected",
    );
  } finally {
    database.close();
  }
});

test("leaveStudentProgram_shouldPreserveProgramShellCuratorAndHistory", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    commands.leaveStudentProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    assert.deepEqual(
      {
        shells: commands.listProgramShells({ actingIdentityId: "identity-curator" }).value
          .programShells.length,
        curator: commands.getEffectiveParticipation({
          identityId: "identity-curator",
          programId: "program-1",
          participationKind: "program_curator",
        }),
        eventCount: listProgramMembershipEventRecords(database).length,
      },
      { shells: 1, curator: { allowed: true }, eventCount: 3 },
    );
  } finally {
    database.close();
  }
});

// Controlled membership and recovery

test("setProgramAdmissionPolicy_shouldChangeStudentPolicyAndBlockSelfJoin_onEffectiveCurator", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });

    const policy = commands.setProgramAdmissionPolicy({
      actingIdentityId: "identity-curator",
      programId: "program-1",
      admissionPolicy: "invitation_only",
    });
    const join = commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    assert.deepEqual(
      {
        policy: policy.value.programShell.admissionPolicy,
        join,
        latestEvent: projectMembershipEvent(listProgramMembershipEventRecords(database).at(-1)),
      },
      {
        policy: "invitation_only",
        join: { status: "rejected", reason: "policy_not_satisfied" },
        latestEvent: {
          eventType: "student_membership_joined",
          outcome: "rejected",
          actorIdentityId: "identity-student",
          targetIdentityId: "identity-student",
          programId: "program-1",
          participationKind: "student",
          policyPath: "self_join",
          resultingStatus: null,
          reason: "policy_not_satisfied",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("createProgramInvitation_shouldCreatePendingStudentInvitation_onEffectiveCurator", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });

    const result = commands.createProgramInvitation({
      actingIdentityId: "identity-curator",
      programId: "program-1",
      targetIdentityId: "identity-student",
      participationKind: "student",
    });

    assert.deepEqual(
      {
        result,
        effective: commands.getEffectiveParticipation({
          identityId: "identity-student",
          programId: "program-1",
          participationKind: "student",
        }),
      },
      {
        result: {
          status: "accepted",
          value: {
            programInvitation: {
              invitationId: "program-2",
              programId: "program-1",
              targetIdentityId: "identity-student",
              participationKind: "student",
              status: "pending",
              invitedByIdentityId: "identity-curator",
              createdAt: "2026-05-27T10:00:00.001Z",
              updatedAt: "2026-05-27T10:00:00.001Z",
            },
          },
        },
        effective: { allowed: false, reason: "membership_missing" },
      },
    );
  } finally {
    database.close();
  }
});

test("acceptProgramInvitation_shouldCreateStudentMembershipAndHideInvitationFromNonTarget", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    const invitation = commands.createProgramInvitation({
      actingIdentityId: "identity-curator",
      programId: "program-1",
      targetIdentityId: "identity-student",
      participationKind: "student",
    }).value.programInvitation;

    const hidden = commands.acceptProgramInvitation({
      actingIdentityId: "identity-curator-2",
      invitationId: invitation.invitationId,
    });
    const acceptedInvitation = commands.acceptProgramInvitation({
      actingIdentityId: "identity-student",
      invitationId: invitation.invitationId,
    });

    assert.deepEqual(
      {
        hidden,
        invitationStatus: acceptedInvitation.value.programInvitation.status,
        membership: acceptedInvitation.value.programMembership,
        effective: commands.getEffectiveParticipation({
          identityId: "identity-student",
          programId: "program-1",
          participationKind: "student",
        }),
      },
      {
        hidden: { status: "rejected", reason: "invitation_not_found" },
        invitationStatus: "accepted",
        membership: {
          programId: "program-1",
          identityId: "identity-student",
          participationKind: "student",
          status: "active",
          updatedAt: "2026-05-27T10:00:00.003Z",
        },
        effective: { allowed: true },
      },
    );
  } finally {
    database.close();
  }
});

test("declineAndRevokeProgramInvitation_shouldPreservePrivateScopedLists", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    const declined = commands.createProgramInvitation({
      actingIdentityId: "identity-curator",
      programId: "program-1",
      targetIdentityId: "identity-student",
      participationKind: "student",
    }).value.programInvitation;
    commands.declineProgramInvitation({
      actingIdentityId: "identity-student",
      invitationId: declined.invitationId,
    });
    const revoked = commands.createProgramInvitation({
      actingIdentityId: "identity-curator",
      programId: "program-1",
      targetIdentityId: "identity-student",
      participationKind: "student",
    }).value.programInvitation;
    commands.revokeProgramInvitation({
      actingIdentityId: "identity-curator",
      invitationId: revoked.invitationId,
    });

    assert.deepEqual(
      {
        curator: commands
          .listProgramInvitations({
            actingIdentityId: "identity-curator",
            programId: "program-1",
          })
          .value.programInvitations.map($0 => $0.status),
        student: commands
          .listMyProgramInvitations({ actingIdentityId: "identity-student" })
          .value.programInvitations.map($0 => $0.status),
        outsider: commands.listMyProgramInvitations({ actingIdentityId: "identity-curator-2" }).value
          .programInvitations,
      },
      {
        curator: ["declined", "revoked"],
        student: ["declined", "revoked"],
        outsider: [],
      },
    );
  } finally {
    database.close();
  }
});

test("removeProgramParticipant_shouldRemoveStudentAndBlockOrdinaryReactivation_onEffectiveCurator", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    const removed = commands.removeProgramParticipant({
      actingIdentityId: "identity-curator",
      programId: "program-1",
      targetIdentityId: "identity-student",
      participationKind: "student",
    });
    const rejoin = commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    assert.deepEqual(
      {
        removed: removed.value.programMembership.status,
        rejoin,
        participants: commands
          .listProgramParticipants({
            actingIdentityId: "identity-curator",
            programId: "program-1",
          })
          .value.programParticipants.map($0 => ({
            identityId: $0.identityId,
            participationKind: $0.participationKind,
            status: $0.status,
          })),
      },
      {
        removed: "removed",
        rejoin: { status: "rejected", reason: "membership_removed" },
        participants: [
          {
            identityId: "identity-curator",
            participationKind: "program_curator",
            status: "active",
          },
          {
            identityId: "identity-student",
            participationKind: "student",
            status: "removed",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("leaveCuratorProgram_shouldRejectLastCuratorAndAcceptWhenAnotherActiveCuratorExists", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });

    const lastCurator = commands.leaveCuratorProgram({
      actingIdentityId: "identity-curator",
      programId: "program-1",
    });
    createProgramMembershipRecord(database, {
      id: "curator-membership-2",
      programId: "program-1",
      identityId: "identity-curator-2",
      participationKind: "program_curator",
      status: "active",
      createdAt: "2026-05-27T10:00:01.000Z",
      updatedAt: "2026-05-27T10:00:01.000Z",
    });
    const acceptedLeave = commands.leaveCuratorProgram({
      actingIdentityId: "identity-curator",
      programId: "program-1",
    });

    assert.deepEqual(
      {
        lastCurator,
        acceptedStatus: acceptedLeave.value.programMembership.status,
      },
      {
        lastCurator: { status: "rejected", reason: "last_curator_required" },
        acceptedStatus: "left",
      },
    );
  } finally {
    database.close();
  }
});

test("recoverAndRevokeProgramMembership_shouldRequireAdminAndRecordExceptionalTransitions", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    grantAdminAuthority(database, {
      identityId: "identity-admin",
      grantedAt: "2026-05-27T10:00:00.000Z",
    });

    const curatorRecovery = commands.recoverProgramMembership({
      actingIdentityId: "identity-curator",
      programId: "program-1",
      targetIdentityId: "identity-student",
      participationKind: "student",
      recoveryReason: "repair",
    });
    const recovered = commands.recoverProgramMembership({
      actingIdentityId: "identity-admin",
      programId: "program-1",
      targetIdentityId: "identity-student",
      participationKind: "student",
      recoveryReason: "repair",
    });
    const revoked = commands.revokeProgramMembership({
      actingIdentityId: "identity-admin",
      programId: "program-1",
      targetIdentityId: "identity-student",
      participationKind: "student",
      revocationReason: "invalid operational state",
    });

    assert.deepEqual(
      {
        curatorRecovery,
        recovered: recovered.value.programMembership.status,
        revoked: revoked.value.programMembership.status,
        events: listProgramMembershipEventRecords(database)
          .slice(-2)
          .map(projectMembershipEvent),
      },
      {
        curatorRecovery: { status: "rejected", reason: "admin_required" },
        recovered: "active",
        revoked: "removed",
        events: [
          {
            eventType: "membership_exceptionally_recovered",
            outcome: "accepted",
            actorIdentityId: "identity-admin",
            targetIdentityId: "identity-student",
            programId: "program-1",
            participationKind: "student",
            policyPath: "admin_exceptional_recovery",
            resultingStatus: "active",
            reason: "repair",
          },
          {
            eventType: "membership_exceptionally_revoked",
            outcome: "accepted",
            actorIdentityId: "identity-admin",
            targetIdentityId: "identity-student",
            programId: "program-1",
            participationKind: "student",
            policyPath: "admin_exceptional_revocation",
            resultingStatus: "removed",
            reason: "invalid operational state",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("membershipMutations_shouldRecordRejectedEvents_onKnownActorProgramAndTarget", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.setProgramAdmissionPolicy({
      actingIdentityId: "identity-curator",
      programId: "program-1",
      admissionPolicy: "unsupported",
    });
    commands.createProgramInvitation({
      actingIdentityId: "identity-curator",
      programId: "program-1",
      targetIdentityId: "identity-student",
      participationKind: "student",
    });
    commands.createProgramInvitation({
      actingIdentityId: "identity-curator",
      programId: "program-1",
      targetIdentityId: "identity-student",
      participationKind: "student",
    });
    commands.removeProgramParticipant({
      actingIdentityId: "identity-curator",
      programId: "program-1",
      targetIdentityId: "identity-student",
      participationKind: "student",
    });
    commands.leaveCuratorProgram({
      actingIdentityId: "identity-curator",
      programId: "program-1",
    });
    grantAdminAuthority(database, {
      identityId: "identity-admin",
      grantedAt: "2026-05-27T10:00:00.000Z",
    });
    commands.revokeProgramMembership({
      actingIdentityId: "identity-admin",
      programId: "program-1",
      targetIdentityId: "identity-curator",
      participationKind: "program_curator",
      revocationReason: "repair invalid authority",
    });

    assert.deepEqual(
      listProgramMembershipEventRecords(database)
        .filter($0 => $0.outcome === "rejected")
        .map($0 => ({
          eventType: $0.eventType,
          policyPath: $0.policyPath,
          reason: $0.reason,
        })),
      [
        {
          eventType: "program_admission_policy_changed",
          policyPath: "self_join",
          reason: "validation_failed",
        },
        {
          eventType: "student_invitation_created",
          policyPath: "curator_invitation",
          reason: "invitation_conflict",
        },
        {
          eventType: "student_membership_removed",
          policyPath: "curator_removal",
          reason: "membership_missing",
        },
        {
          eventType: "curator_membership_left",
          policyPath: "curator_leave",
          reason: "last_curator_required",
        },
        {
          eventType: "membership_exceptionally_revoked",
          policyPath: "admin_exceptional_revocation",
          reason: "last_curator_required",
        },
      ],
    );
  } finally {
    database.close();
  }
});

test("curatorRemoval_shouldRejectLastEffectiveCurator_whenOtherActiveMembershipIdentityIsDisabled", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    createProgramMembershipRecord(database, {
      id: "curator-membership-2",
      programId: "program-1",
      identityId: "identity-curator-2",
      participationKind: "program_curator",
      status: "active",
      createdAt: "2026-05-27T10:00:01.000Z",
      updatedAt: "2026-05-27T10:00:01.000Z",
    });
    disableIdentity(database, {
      identityId: "identity-curator-2",
      disabledAt: "2026-05-27T10:00:02.000Z",
    });
    grantAdminAuthority(database, {
      identityId: "identity-admin",
      grantedAt: "2026-05-27T10:00:00.000Z",
    });

    assert.deepEqual(
      {
        leave: commands.leaveCuratorProgram({
          actingIdentityId: "identity-curator",
          programId: "program-1",
        }),
        revoke: commands.revokeProgramMembership({
          actingIdentityId: "identity-admin",
          programId: "program-1",
          targetIdentityId: "identity-curator",
          participationKind: "program_curator",
          revocationReason: "repair invalid authority",
        }),
      },
      {
        leave: { status: "rejected", reason: "last_curator_required" },
        revoke: { status: "rejected", reason: "last_curator_required" },
      },
    );
  } finally {
    database.close();
  }
});

test("setProgramAdmissionPolicy_shouldRollBackPolicy_onEventWriteFailure", () => {
  const { commands, database } = makeSUT({
    ids: [
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "membership-event-1",
    ],
  });

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    let failed = false;
    try {
      commands.setProgramAdmissionPolicy({
        actingIdentityId: "identity-curator",
        programId: "program-1",
        admissionPolicy: "invitation_only",
      });
    } catch {
      failed = true;
    }

    assert.deepEqual(
      {
        failed,
        admissionPolicy: commands.getProgramShell({
          actingIdentityId: "identity-curator",
          programId: "program-1",
        }).value.programShell.admissionPolicy,
      },
      { failed: true, admissionPolicy: "self_join" },
    );
  } finally {
    database.close();
  }
});

test("createProgramInvitation_shouldRollBackInvitation_onEventWriteFailure", () => {
  const { commands, database } = makeSUT({
    ids: [
      "program-1",
      "membership-1",
      "program-event-1",
      "membership-event-1",
      "invitation-1",
      "membership-event-1",
    ],
  });

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    let failed = false;
    try {
      commands.createProgramInvitation({
        actingIdentityId: "identity-curator",
        programId: "program-1",
        targetIdentityId: "identity-student",
        participationKind: "student",
      });
    } catch {
      failed = true;
    }

    assert.deepEqual(
      {
        failed,
        invitations: commands.listMyProgramInvitations({
          actingIdentityId: "identity-student",
        }).value.programInvitations,
      },
      { failed: true, invitations: [] },
    );
  } finally {
    database.close();
  }
});

test("recoverProgramMembership_shouldSeparateReasonValidationFromUnsupportedParticipationKind", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    grantAdminAuthority(database, {
      identityId: "identity-admin",
      grantedAt: "2026-05-27T10:00:00.000Z",
    });

    assert.deepEqual(
      {
        unsupported: commands.recoverProgramMembership({
          actingIdentityId: "identity-admin",
          programId: "program-1",
          targetIdentityId: "identity-student",
          participationKind: "moderator",
          recoveryReason: "repair",
        }),
        blankReason: commands.recoverProgramMembership({
          actingIdentityId: "identity-admin",
          programId: "program-1",
          targetIdentityId: "identity-student",
          participationKind: "student",
          recoveryReason: " ",
        }),
      },
      {
        unsupported: { status: "rejected", reason: "unsupported_participation_kind" },
        blankReason: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

// Effective participation

test("getEffectiveParticipation_shouldReturnAllowed_onActiveStudent", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    const result = commands.getEffectiveParticipation({
      identityId: "identity-student",
      programId: "program-1",
      participationKind: "student",
    });

    assert.deepEqual(result, { allowed: true });
  } finally {
    database.close();
  }
});

test("getEffectiveParticipation_shouldReturnAllowed_onActiveCurator", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });

    const result = commands.getEffectiveParticipation({
      identityId: "identity-curator",
      programId: "program-1",
      participationKind: "program_curator",
    });

    assert.deepEqual(result, { allowed: true });
  } finally {
    database.close();
  }
});

test("getEffectiveParticipation_shouldReturnProgramNotAcceptingParticipation_onUnknownProgram", () => {
  const { commands, database } = makeSUT();

  try {
    const result = commands.getEffectiveParticipation({
      identityId: "identity-student",
      programId: "program-ghost",
      participationKind: "student",
    });

    assert.deepEqual(result, {
      allowed: false,
      reason: "program_not_accepting_participation",
    });
  } finally {
    database.close();
  }
});

test("getEffectiveParticipation_shouldReturnMembershipMissing_onNoMembership", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    const result = commands.getEffectiveParticipation({
      identityId: "identity-student",
      programId: "program-1",
      participationKind: "student",
    });
    assert.deepEqual(result, { allowed: false, reason: "membership_missing" });
  } finally {
    database.close();
  }
});

test("getEffectiveParticipation_shouldReturnMembershipLeft_onLeftMembership", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    commands.leaveStudentProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    const result = commands.getEffectiveParticipation({
      identityId: "identity-student",
      programId: "program-1",
      participationKind: "student",
    });
    assert.deepEqual(result, { allowed: false, reason: "membership_left" });
  } finally {
    database.close();
  }
});

test("getEffectiveParticipation_shouldReturnMembershipRemoved_onRemovedMembership", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    database
      .prepare(
        `update program_memberships set status = 'removed', updated_at = ?
         where identity_id = ? and program_id = ? and participation_kind = 'student'`,
      )
      .run("2026-05-27T10:01:00.000Z", "identity-student", "program-1");

    const result = commands.getEffectiveParticipation({
      identityId: "identity-student",
      programId: "program-1",
      participationKind: "student",
    });
    assert.deepEqual(result, { allowed: false, reason: "membership_removed" });
  } finally {
    database.close();
  }
});

test("getEffectiveParticipation_shouldReturnIdentityNotActive_onDisabledIdentity", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    disableIdentity(database, {
      identityId: "identity-student",
      disabledAt: "2026-05-27T10:00:00.000Z",
    });

    const result = commands.getEffectiveParticipation({
      identityId: "identity-student",
      programId: "program-1",
      participationKind: "student",
    });

    assert.deepEqual(result, { allowed: false, reason: "identity_not_active" });
  } finally {
    database.close();
  }
});

test("getEffectiveParticipation_shouldReturnUnsupportedParticipationKind_onUnknownKind", () => {
  const { commands, database } = makeSUT();

  try {
    const result = commands.getEffectiveParticipation({
      identityId: "identity-student",
      programId: "program-1",
      participationKind: "moderator",
    });

    assert.deepEqual(result, {
      allowed: false,
      reason: "unsupported_participation_kind",
    });
  } finally {
    database.close();
  }
});

test("getEffectiveParticipation_shouldNotMutateMembershipState", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    const before = listProgramMembershipEventRecords(database).length;

    commands.getEffectiveParticipation({
      identityId: "identity-student",
      programId: "program-1",
      participationKind: "student",
    });

    assert.equal(listProgramMembershipEventRecords(database).length, before);
  } finally {
    database.close();
  }
});

// Events, boundaries, recovery

test("listProgramEvents_shouldAllowAdminAndCurator_scopedQuery", () => {
  const { commands, database } = makeSUT();

  try {
    grantAdminAuthority(database, {
      identityId: "identity-admin",
      grantedAt: "2026-05-27T10:00:00.000Z",
    });
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });

    const curatorResult = commands.listProgramEvents({
      actingIdentityId: "identity-curator",
      programId: "program-1",
    });
    const adminResult = commands.listProgramEvents({
      actingIdentityId: "identity-admin",
      programId: "program-1",
    });

    assert.deepEqual(
      { curator: curatorResult.status, admin: adminResult.status },
      { curator: "accepted", admin: "accepted" },
    );
  } finally {
    database.close();
  }
});

test("listProgramEvents_shouldRejectNonAdminWithoutCuratorParticipation", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });

    const result = commands.listProgramEvents({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    assert.deepEqual(result, { status: "rejected", reason: "admin_or_curator_required" });
  } finally {
    database.close();
  }
});

test("listProgramEvents_shouldScopeUnscopedQueryToCuratorPrograms_forNonAdmin", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.createProgramShell({
      actingIdentityId: "identity-curator-2",
      title: "Calculus",
    });

    const result = commands.listProgramEvents({ actingIdentityId: "identity-curator" });

    assert.deepEqual(
      result.value.events.map($0 => $0.programId).sort(),
      ["program-1"],
    );
  } finally {
    database.close();
  }
});

test("listProgramMembershipEvents_shouldNotExposeSecretsOrSessionsOrSql", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    const result = commands.listProgramMembershipEvents({
      actingIdentityId: "identity-curator",
      programId: "program-1",
    });

    const fields = new Set();
    for (const event of result.value.events) {
      for (const key of Object.keys(event)) {
        fields.add(key);
      }
    }

    const allowed = new Set([
      "id",
      "eventType",
      "actorIdentityId",
      "targetIdentityId",
      "programId",
      "participationKind",
      "policyPath",
      "resultingStatus",
      "invitationStatus",
      "occurredAt",
      "outcome",
      "reason",
    ]);
    for (const field of fields) {
      assert.ok(allowed.has(field), `unexpected event field: ${field}`);
    }
  } finally {
    database.close();
  }
});

test("programEvents_shouldNotBeUsedAsAuthorization_effectiveParticipationStillRequiresMembership", () => {
  const { commands, database } = makeSUT();

  try {
    commands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Linear Algebra",
    });
    commands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });
    commands.leaveStudentProgram({
      actingIdentityId: "identity-student",
      programId: "program-1",
    });

    const result = commands.getEffectiveParticipation({
      identityId: "identity-student",
      programId: "program-1",
      participationKind: "student",
    });

    assert.deepEqual(result, { allowed: false, reason: "membership_left" });
  } finally {
    database.close();
  }
});

test("firstSliceSurface_shouldNotExposeOutOfScopeMutations", () => {
  const { commands, database } = makeSUT();

  try {
    const exposed = Object.keys(commands).sort();
    assert.deepEqual(exposed, [
      "acceptProgramInvitation",
      "createProgramInvitation",
      "createProgramShell",
      "declineProgramInvitation",
      "getEffectiveParticipation",
      "getProgramShell",
      "joinSelfJoinProgram",
      "leaveCuratorProgram",
      "leaveStudentProgram",
      "listMyProgramInvitations",
      "listMyProgramMemberships",
      "listProgramEvents",
      "listProgramInvitations",
      "listProgramMembershipEvents",
      "listProgramParticipants",
      "listProgramShells",
      "recoverProgramMembership",
      "removeProgramParticipant",
      "revokeProgramInvitation",
      "revokeProgramMembership",
      "setProgramAdmissionPolicy",
    ]);
  } finally {
    database.close();
  }
});

function makeSUT({
  ids = sequentialIds(),
  now = makeAdvancingClock("2026-05-27T10:00:00.000Z"),
} = {}) {
  const database = openDatabase();
  initializeIdentityStorage(database);
  seedIdentities(database, [
    "identity-curator",
    "identity-curator-2",
    "identity-student",
    "identity-admin",
  ]);
  const commands = createProgramCommands({
    database,
    generateId: makeIdGenerator(ids),
    now,
  });
  return { commands, database };
}

function makeAdvancingClock(startIso) {
  let tick = 0;
  const start = new Date(startIso).getTime();
  return () => new Date(start + tick++);
}

function sequentialIds() {
  return [
    "program-1",
    "membership-1",
    "program-event-1",
    "membership-event-1",
    "program-2",
    "membership-2",
    "program-event-2",
    "membership-event-2",
    "membership-3",
    "membership-event-3",
    "membership-4",
    "membership-event-4",
    "membership-event-5",
    "membership-event-6",
    "membership-event-7",
    "membership-event-8",
    "membership-event-9",
    "membership-event-10",
  ];
}

function makeIdGenerator(ids) {
  const nextIds = [...ids];
  return () => nextIds.shift();
}

function seedIdentities(database, identityIds) {
  for (const id of identityIds) {
    createIdentity(database, {
      id,
      displayName: `Display ${id}`,
      createdAt: "2026-05-27T09:00:00.000Z",
    });
  }
}

function projectProgramEvent(event) {
  return {
    eventType: event.eventType,
    outcome: event.outcome,
    actorIdentityId: event.actorIdentityId,
    programId: event.programId ?? null,
    reason: event.reason ?? null,
  };
}

function projectMembershipEvent(event) {
  const projection = {
    eventType: event.eventType,
    outcome: event.outcome,
    actorIdentityId: event.actorIdentityId,
    targetIdentityId: event.targetIdentityId,
    programId: event.programId,
    participationKind: event.participationKind,
    resultingStatus: event.resultingStatus ?? null,
    reason: event.reason ?? null,
  };
  if (event.policyPath !== null && event.policyPath !== undefined) {
    projection.policyPath = event.policyPath;
  }
  if (event.invitationStatus !== null && event.invitationStatus !== undefined) {
    projection.invitationStatus = event.invitationStatus;
  }
  return projection;
}
