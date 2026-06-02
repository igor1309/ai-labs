import assert from "node:assert/strict";
import test from "node:test";
import { createProgramCommands } from "../src/program.js";
import { createStudentWorkspaceCommands } from "../src/student-workspace.js";
import {
  createAcceptedAssessmentCriterionEntityRecord,
  createAcceptedAssessmentCriterionRevisionRecord,
  createAcceptedOpenAnswerCheckEntityRecord,
  createAcceptedOpenAnswerCheckRevisionRecord,
  createAssessmentCriterionCandidateRecord,
  createIdentity,
  createOpenAnswerCheckCandidateRecord,
  createProgramMembershipRecord,
  createProgramShellRecord,
  createProgramSourceRecord,
  getOpenAnswerAttemptRecord,
  initializeIdentityStorage,
  listAcceptedAssessmentCriterionEntityRecords,
  listAcceptedAssessmentCriterionRevisionRecords,
  listAcceptedOpenAnswerCheckEntityRecords,
  listAcceptedOpenAnswerCheckRevisionRecords,
  listAssessmentCriterionCandidateRecords,
  listOpenAnswerAttemptRecords,
  listOpenAnswerCheckCandidateRecords,
  openIdentityDatabase,
  updateAcceptedAssessmentCriterionEntityCurrentRevision,
  updateAcceptedOpenAnswerCheckEntityCurrentRevision,
} from "../src/storage.js";

test("submitOpenAnswerAttempt_shouldAcceptEffectiveStudent_onAcceptedCheckRevision", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });

    const result = commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Explain the rank-nullity theorem.",
      idempotencyKey: "submit-a",
    });

    assert.deepEqual(result, {
      status: "accepted",
      value: {
        attempt: {
          attemptId: "attempt-1",
          programId: "program-a",
          studentIdentityId: "identity-student",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
          submittedAnswer: "Explain the rank-nullity theorem.",
          status: "submitted",
          submittedAt: "2026-06-02T10:00:00.000Z",
          updatedAt: "2026-06-02T10:00:00.000Z",
        },
      },
    });
  } finally {
    database.close();
  }
});

test("submitOpenAnswerAttempt_shouldRejectUnknownAndInactiveIdentities", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));

    assert.deepEqual(
      {
        unknown: commands.submitOpenAnswerAttempt({
          actingIdentityId: "identity-unknown",
          programId: "program-a",
          checkRevisionId: "check-revision-a",
          submittedAnswer: "Answer",
          idempotencyKey: "submit-a",
        }),
        inactive: commands.submitOpenAnswerAttempt({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
          checkRevisionId: "check-revision-a",
          submittedAnswer: "Answer",
          idempotencyKey: "submit-b",
        }),
      },
      {
        unknown: { status: "rejected", reason: "identity_not_active" },
        inactive: { status: "rejected", reason: "identity_not_active" },
      },
    );
  } finally {
    database.close();
  }
});

test("submitOpenAnswerAttempt_shouldRejectUnknownProgram", () => {
  const { commands, database } = makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));

    assert.deepEqual(
      commands.submitOpenAnswerAttempt({
        actingIdentityId: "identity-student",
        programId: "program-unknown",
        checkRevisionId: "check-revision-a",
        submittedAnswer: "Answer",
        idempotencyKey: "submit-a",
      }),
      { status: "rejected", reason: "program_not_found" },
    );
  } finally {
    database.close();
  }
});

test("submitOpenAnswerAttempt_shouldRejectCallerWithoutEffectiveStudentParticipation", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, {
      programId: "program-a",
      studentMembershipStatus: "left",
    });

    assert.deepEqual(
      commands.submitOpenAnswerAttempt({
        actingIdentityId: "identity-student",
        programId: "program-a",
        checkRevisionId: "check-revision-a",
        submittedAnswer: "Answer",
        idempotencyKey: "submit-a",
      }),
      { status: "rejected", reason: "participation_required" },
    );
  } finally {
    database.close();
  }
});

test("submitOpenAnswerAttempt_shouldRejectProgramCuratorWithoutStudentParticipation", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    createProgramMembershipRecord(database, {
      id: "membership-curator-a",
      programId: "program-a",
      identityId: "identity-curator",
      participationKind: "program_curator",
      status: "active",
      createdAt: "2026-06-02T09:00:00.000Z",
      updatedAt: "2026-06-02T09:00:00.000Z",
    });

    assert.deepEqual(
      commands.submitOpenAnswerAttempt({
        actingIdentityId: "identity-curator",
        programId: "program-a",
        checkRevisionId: "check-revision-a",
        submittedAnswer: "Answer",
        idempotencyKey: "submit-a",
      }),
      { status: "rejected", reason: "participation_required" },
    );
  } finally {
    database.close();
  }
});

test("submitOpenAnswerAttempt_shouldRejectUnknownAcceptedCheckRevision", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });

    assert.deepEqual(
      commands.submitOpenAnswerAttempt({
        actingIdentityId: "identity-student",
        programId: "program-a",
        checkRevisionId: "check-revision-unknown",
        submittedAnswer: "Answer",
        idempotencyKey: "submit-a",
      }),
      { status: "rejected", reason: "check_revision_not_found" },
    );
  } finally {
    database.close();
  }
});

test("submitOpenAnswerAttempt_shouldRejectAcceptedCheckRevisionFromAnotherProgram", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    seedStudentProgramWithAcceptedCheck(database, {
      programId: "program-b",
      checkEntityId: "check-entity-b",
      checkRevisionId: "check-revision-b",
      criterionCandidateId: "criterion-candidate-b",
      criterionEntityId: "criterion-entity-b",
      criterionRevisionId: "criterion-revision-b",
      membershipId: "membership-student-b",
      sourceId: "source-b",
    });

    assert.deepEqual(
      commands.submitOpenAnswerAttempt({
        actingIdentityId: "identity-student",
        programId: "program-a",
        checkRevisionId: "check-revision-b",
        submittedAnswer: "Answer",
        idempotencyKey: "submit-a",
      }),
      { status: "rejected", reason: "check_revision_program_mismatch" },
    );
  } finally {
    database.close();
  }
});

test("submitOpenAnswerAttempt_shouldRejectInvalidAnswerAndIdempotencyKey", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });

    assert.deepEqual(
      {
        answer: commands.submitOpenAnswerAttempt({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "check-revision-a",
          submittedAnswer: " ",
          idempotencyKey: "submit-a",
        }),
        key: commands.submitOpenAnswerAttempt({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "check-revision-a",
          submittedAnswer: "Answer",
          idempotencyKey: " ",
        }),
      },
      {
        answer: { status: "rejected", reason: "validation_failed" },
        key: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("submitOpenAnswerAttempt_shouldTrimSubmittedAnswerBeforePersistence", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });

    commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "  Answer with surrounding whitespace  ",
      idempotencyKey: "submit-a",
    });

    assert.deepEqual(getOpenAnswerAttemptRecord(database, "attempt-1")?.submittedAnswer, "Answer with surrounding whitespace");
  } finally {
    database.close();
  }
});

test("submitOpenAnswerAttempt_shouldReturnOriginalAttempt_onEquivalentRetry", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });

    const first = commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "  Same answer  ",
      idempotencyKey: "submit-a",
    });
    const retry = commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Same answer",
      idempotencyKey: "submit-a",
    });

    assert.deepEqual(
      {
        retry,
        attemptIds: listOpenAnswerAttemptRecords(database).map($0 => $0.id),
      },
      {
        retry: first,
        attemptIds: ["attempt-1"],
      },
    );
  } finally {
    database.close();
  }
});

test("submitOpenAnswerAttempt_shouldScopeIdempotencyKeyToActingStudent", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    createIdentity(database, makeIdentity({ id: "identity-student-2" }));
    createProgramMembershipRecord(database, {
      id: "membership-student-2-a",
      programId: "program-a",
      identityId: "identity-student-2",
      participationKind: "student",
      status: "active",
      createdAt: "2026-06-02T09:00:00.000Z",
      updatedAt: "2026-06-02T09:00:00.000Z",
    });

    commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "First student answer",
      idempotencyKey: "shared-key",
    });
    const second = commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student-2",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Second student answer",
      idempotencyKey: "shared-key",
    });

    assert.deepEqual(
      {
        second,
        attempts: listOpenAnswerAttemptRecords(database).map($0 => ({
          id: $0.id,
          studentIdentityId: $0.studentIdentityId,
        })),
      },
      {
        second: {
          status: "accepted",
          value: {
            attempt: {
              attemptId: "attempt-2",
              programId: "program-a",
              studentIdentityId: "identity-student-2",
              checkRevisionId: "check-revision-a",
              criterionRevisionIds: ["criterion-revision-a"],
              submittedAnswer: "Second student answer",
              status: "submitted",
              submittedAt: "2026-06-02T10:00:00.000Z",
              updatedAt: "2026-06-02T10:00:00.000Z",
            },
          },
        },
        attempts: [
          { id: "attempt-1", studentIdentityId: "identity-student" },
          { id: "attempt-2", studentIdentityId: "identity-student-2" },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("submitOpenAnswerAttempt_shouldRejectConflictingIdempotencyKeyReuseWithoutChangingOriginalAttempt", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });

    commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Original answer",
      idempotencyKey: "submit-a",
    });

    assert.deepEqual(
      {
        conflict: commands.submitOpenAnswerAttempt({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "check-revision-a",
          submittedAnswer: "Different answer",
          idempotencyKey: "submit-a",
        }),
        attempts: listOpenAnswerAttemptRecords(database).map($0 => ({
          id: $0.id,
          submittedAnswer: $0.submittedAnswer,
        })),
      },
      {
        conflict: { status: "rejected", reason: "idempotency_conflict" },
        attempts: [{ id: "attempt-1", submittedAnswer: "Original answer" }],
      },
    );
  } finally {
    database.close();
  }
});

test("submitOpenAnswerAttempt_shouldNotExposeIdempotencyKey_onAcceptedOrRejectedResults", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });

    const acceptedResult = commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Answer",
      idempotencyKey: "sensitive-idempotency-key",
    });
    const rejectedResult = commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Different answer",
      idempotencyKey: "sensitive-idempotency-key",
    });

    assert.deepEqual(containsForbiddenDetail([acceptedResult, rejectedResult]), false);
  } finally {
    database.close();
  }
});

test("submitOpenAnswerAttempt_shouldPreserveSubmittedRevisionReferences_onLaterAcceptedRevisions", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });

    commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Answer",
      idempotencyKey: "submit-a",
    });
    createAcceptedAssessmentCriterionRevisionRecord(
      database,
      makeAcceptedAssessmentCriterionRevision({
        id: "criterion-revision-b",
        entityId: "criterion-entity-a",
        programId: "program-a",
        acceptedFromCandidateId: "criterion-candidate-a",
        sourceIds: ["source-a"],
      }),
    );
    updateAcceptedAssessmentCriterionEntityCurrentRevision(database, {
      entityId: "criterion-entity-a",
      currentRevisionId: "criterion-revision-b",
    });
    createAcceptedOpenAnswerCheckRevisionRecord(
      database,
      makeAcceptedOpenAnswerCheckRevision({
        id: "check-revision-b",
        entityId: "check-entity-a",
        programId: "program-a",
        criterionRevisionIds: ["criterion-revision-b"],
      }),
    );
    updateAcceptedOpenAnswerCheckEntityCurrentRevision(database, {
      entityId: "check-entity-a",
      currentRevisionId: "check-revision-b",
    });

    const attempt = getOpenAnswerAttemptRecord(database, "attempt-1");

    assert.deepEqual(
      {
        checkRevisionId: attempt.checkRevisionId,
        criterionRevisionIds: attempt.criterionRevisionIds,
      },
      {
        checkRevisionId: "check-revision-a",
        criterionRevisionIds: ["criterion-revision-a"],
      },
    );
  } finally {
    database.close();
  }
});

test("submitOpenAnswerAttempt_shouldNotMutateAcceptedCorpusOrCuratorCandidates", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    const before = projectAcceptedAssessmentState(database);

    commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Answer",
      idempotencyKey: "submit-a",
    });

    assert.deepEqual(projectAcceptedAssessmentState(database), before);
  } finally {
    database.close();
  }
});

function makeSUT({
  ids = ["attempt-1", "attempt-2", "attempt-3"],
  now = () => new Date("2026-06-02T10:00:00.000Z"),
} = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const programCommands = createProgramCommands({ database });
  const commands = createStudentWorkspaceCommands({
    database,
    generateId: makeIdGenerator(ids),
    getEffectiveParticipation: input => programCommands.getEffectiveParticipation(input),
    now,
  });
  return { commands, database };
}

function makeIdGenerator(ids) {
  const nextIds = [...ids];
  return () => nextIds.shift();
}

function seedStudentProgramWithAcceptedCheck(
  database,
  {
    programId,
    checkEntityId = "check-entity-a",
    checkRevisionId = "check-revision-a",
    criterionCandidateId = "criterion-candidate-a",
    criterionEntityId = "criterion-entity-a",
    criterionRevisionId = "criterion-revision-a",
    membershipId = "membership-student-a",
    sourceId = "source-a",
    studentMembershipStatus = "active",
  },
) {
  createIdentityIfMissing(database, "identity-curator");
  createIdentityIfMissing(database, "identity-student");
  createProgramShellRecord(database, makeProgramShell({ id: programId }));
  createProgramMembershipRecord(database, {
    id: membershipId,
    programId,
    identityId: "identity-student",
    participationKind: "student",
    status: studentMembershipStatus,
    createdAt: "2026-06-02T09:00:00.000Z",
    updatedAt: "2026-06-02T09:00:00.000Z",
  });
  createProgramSourceRecord(database, makeProgramSource({ id: sourceId, programId }));
  createAssessmentCriterionCandidateRecord(
    database,
    makeAssessmentCriterionCandidate({
      id: criterionCandidateId,
      programId,
      sourceIds: [sourceId],
      status: "accepted",
    }),
  );
  createAcceptedAssessmentCriterionEntityRecord(
    database,
    makeAcceptedAssessmentCriterionEntity({
      id: criterionEntityId,
      programId,
      currentRevisionId: criterionRevisionId,
    }),
  );
  createAcceptedAssessmentCriterionRevisionRecord(
    database,
    makeAcceptedAssessmentCriterionRevision({
      id: criterionRevisionId,
      entityId: criterionEntityId,
      programId,
      acceptedFromCandidateId: criterionCandidateId,
      sourceIds: [sourceId],
    }),
  );
  createOpenAnswerCheckCandidateRecord(
    database,
    makeOpenAnswerCheckCandidate({
      id: `check-candidate-${checkRevisionId}`,
      programId,
      sourceIds: [sourceId],
      criterionEntityIds: [criterionEntityId],
      status: "accepted",
    }),
  );
  createAcceptedOpenAnswerCheckEntityRecord(
    database,
    makeAcceptedOpenAnswerCheckEntity({
      id: checkEntityId,
      programId,
      currentRevisionId: checkRevisionId,
    }),
  );
  createAcceptedOpenAnswerCheckRevisionRecord(
    database,
    makeAcceptedOpenAnswerCheckRevision({
      id: checkRevisionId,
      entityId: checkEntityId,
      programId,
      acceptedFromCandidateId: `check-candidate-${checkRevisionId}`,
      sourceIds: [sourceId],
      criterionRevisionIds: [criterionRevisionId],
    }),
  );
}

function createIdentityIfMissing(database, id) {
  try {
    createIdentity(database, makeIdentity({ id }));
  } catch (error) {
    if (error.code !== "SQLITE_CONSTRAINT_PRIMARYKEY") {
      throw error;
    }
  }
}

function projectAcceptedAssessmentState(database) {
  return {
    acceptedCriterionEntities: listAcceptedAssessmentCriterionEntityRecords(database),
    acceptedCriterionRevisions: listAcceptedAssessmentCriterionRevisionRecords(database),
    acceptedOpenAnswerCheckEntities: listAcceptedOpenAnswerCheckEntityRecords(database),
    acceptedOpenAnswerCheckRevisions: listAcceptedOpenAnswerCheckRevisionRecords(database),
    criterionCandidates: listAssessmentCriterionCandidateRecords(database),
    checkCandidates: listOpenAnswerCheckCandidateRecords(database),
  };
}

function containsForbiddenDetail(values) {
  const serialized = JSON.stringify(values).toLowerCase();
  return [
    "sensitive-idempotency-key",
    "passwordhash",
    "correct horse battery staple",
    "operator-secret",
    "session",
    "csrf",
    "cookie",
    "authorization",
    "select ",
    "stack",
    "127.0.0.1",
  ].some($0 => serialized.includes($0));
}

function makeIdentity({ id, state = "active" }) {
  return {
    id,
    displayName: `Display ${id}`,
    state,
    createdAt: "2026-06-02T08:00:00.000Z",
    disabledAt: state === "disabled" ? "2026-06-02T08:30:00.000Z" : null,
  };
}

function makeProgramShell({ id }) {
  return {
    id,
    title: `Program ${id}`,
    admissionPolicy: "self_join",
    createdByIdentityId: "identity-curator",
    createdAt: "2026-06-02T08:45:00.000Z",
  };
}

function makeProgramSource({ id, programId }) {
  return {
    id,
    programId,
    sourceKind: "article",
    title: `Source ${id}`,
    locator: null,
    citation: null,
    recordedByIdentityId: "identity-curator",
    recordedAt: "2026-06-02T08:50:00.000Z",
  };
}

function makeAssessmentCriterionCandidate({ id, programId, sourceIds, status }) {
  return {
    id,
    programId,
    title: `Criterion ${id}`,
    body: `Criterion body ${id}`,
    sourceIds,
    rationale: `Criterion rationale ${id}`,
    status,
    createdByIdentityId: "identity-curator",
    createdAt: "2026-06-02T08:55:00.000Z",
    updatedAt: "2026-06-02T08:55:00.000Z",
  };
}

function makeAcceptedAssessmentCriterionEntity({ id, programId, currentRevisionId }) {
  return {
    id,
    programId,
    currentRevisionId,
  };
}

function makeAcceptedAssessmentCriterionRevision({
  id,
  entityId,
  programId,
  acceptedFromCandidateId,
  sourceIds,
}) {
  return {
    id,
    entityId,
    programId,
    title: `Accepted criterion ${id}`,
    body: `Accepted criterion body ${id}`,
    acceptedFromCandidateId,
    sourceIds,
    rationale: `Accepted criterion rationale ${id}`,
    acceptedByIdentityId: "identity-curator",
    acceptedAt: "2026-06-02T09:00:00.000Z",
  };
}

function makeOpenAnswerCheckCandidate({
  id,
  programId,
  sourceIds,
  criterionEntityIds,
  status,
}) {
  return {
    id,
    programId,
    checkKind: "open_answer",
    title: `Check ${id}`,
    prompt: `Prompt ${id}`,
    sourceIds,
    criterionEntityIds,
    rationale: `Check rationale ${id}`,
    status,
    createdByIdentityId: "identity-curator",
    createdAt: "2026-06-02T09:05:00.000Z",
    updatedAt: "2026-06-02T09:05:00.000Z",
  };
}

function makeAcceptedOpenAnswerCheckEntity({ id, programId, currentRevisionId }) {
  return {
    id,
    programId,
    currentRevisionId,
  };
}

function makeAcceptedOpenAnswerCheckRevision({
  id,
  entityId,
  programId,
  acceptedFromCandidateId = "check-candidate-check-revision-a",
  sourceIds,
  criterionRevisionIds,
}) {
  return {
    id,
    entityId,
    programId,
    checkKind: "open_answer",
    title: `Accepted check ${id}`,
    prompt: `Accepted prompt ${id}`,
    acceptedFromCandidateId,
    sourceIds,
    criterionRevisionIds,
    rationale: `Accepted check rationale ${id}`,
    acceptedByIdentityId: "identity-curator",
    acceptedAt: "2026-06-02T09:10:00.000Z",
  };
}
