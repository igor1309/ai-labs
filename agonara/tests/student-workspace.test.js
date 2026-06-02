import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  createOpenAnswerEvaluatorRunRecord,
  createProgramMembershipRecord,
  createProgramShellRecord,
  createProgramSourceRecord,
  getOpenAnswerAttemptRecord,
  getOpenAnswerEvaluationFailureRecord,
  getOpenAnswerEvaluationRecord,
  grantAdminAuthority,
  initializeIdentityStorage,
  listAcceptedAssessmentCriterionEntityRecords,
  listAcceptedAssessmentCriterionRevisionRecords,
  listAcceptedOpenAnswerCheckEntityRecords,
  listAcceptedOpenAnswerCheckRevisionRecords,
  listAssessmentCriterionCandidateRecords,
  listOpenAnswerAttemptRecords,
  listOpenAnswerCheckCandidateRecords,
  listOpenAnswerEvaluatorEvidenceRecords,
  listOpenAnswerEvaluatorRunRecords,
  openIdentityDatabase,
  updateAcceptedAssessmentCriterionEntityCurrentRevision,
  updateAcceptedOpenAnswerCheckEntityCurrentRevision,
  updateOpenAnswerAttemptStatus,
  updateOpenAnswerEvaluatorRunStatus,
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

test("markOpenAnswerAttemptEvaluating_shouldChangeSubmittedAndFailedAttemptsToEvaluating", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "attempt-2"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, {
      idempotencyKey: "submit-b",
      submittedAnswer: "Second answer",
    });
    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-2",
      reason: "temporary evaluator outage",
    });

    assert.deepEqual(
      {
        submitted: commands.markOpenAnswerAttemptEvaluating({ attemptId: "attempt-1" }),
        failed: commands.markOpenAnswerAttemptEvaluating({ attemptId: "attempt-2" }),
      },
      {
        submitted: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluating" }),
          },
        },
        failed: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-2",
              status: "evaluating",
              submittedAnswer: "Second answer",
            }),
          },
        },
      },
    );
  } finally {
    database.close();
  }
});

test("beginOpenAnswerEvaluatorRun_shouldRecordRunningRunAndMoveSubmittedAttemptToEvaluating", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluator-run-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);

    const result = commands.beginOpenAnswerEvaluatorRun?.({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: " policy-a ",
    });

    assert.deepEqual(
      {
        result,
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        result: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluating" }),
            evaluatorRun: makeEvaluatorRunSummary(),
          },
        },
        runs: [makeEvaluatorRunRecord()],
      },
    );
  } finally {
    database.close();
  }
});

test("beginOpenAnswerEvaluatorRun_shouldSnapshotAndClearPreviousFailure_onFailedAttempt", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluator-run-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-1",
      reason: "temporary evaluator outage",
    });

    const result = commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });

    assert.deepEqual(
      {
        result,
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        result: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluating" }),
            evaluatorRun: makeEvaluatorRunSummary(),
          },
        },
        failure: null,
        runs: [
          makeEvaluatorRunRecord({
            priorFailureReason: "temporary evaluator outage",
            priorFailedAt: "2026-06-02T10:00:00.000Z",
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("beginOpenAnswerEvaluatorRun_shouldRejectUnknownEvaluatingAndEvaluatedAttempts", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "attempt-3", "evaluation-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    submitAttempt(commands, { idempotencyKey: "submit-c" });
    commands.markOpenAnswerAttemptEvaluating({ attemptId: "attempt-2" });
    commands.recordOpenAnswerEvaluation({
      attemptId: "attempt-3",
      evaluatorKind: "student_workspace",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
    });

    assert.deepEqual(
      {
        unknown: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-unknown",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
        }),
        evaluating: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-2",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
        }),
        evaluated: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-3",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
        }),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        unknown: { status: "rejected", reason: "attempt_not_found" },
        evaluating: { status: "rejected", reason: "attempt_already_evaluating" },
        evaluated: { status: "rejected", reason: "attempt_already_evaluated" },
        runs: [],
      },
    );
  } finally {
    database.close();
  }
});

test("beginOpenAnswerEvaluatorRun_shouldRejectMalformedPathAndPolicyInput", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);

    assert.deepEqual(
      {
        path: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-1",
          evaluatorPathKind: "unsupported",
          evaluatorPolicyId: "policy-a",
        }),
        missingPolicy: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-1",
          evaluatorPathKind: "deterministic",
        }),
        emptyPolicy: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-1",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "",
        }),
        whitespacePolicy: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-1",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: " ",
        }),
        nonStringPolicy: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-1",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: 42,
        }),
        attempt: getOpenAnswerAttemptRecord(database, "attempt-1"),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        path: { status: "rejected", reason: "validation_failed" },
        missingPolicy: { status: "rejected", reason: "validation_failed" },
        emptyPolicy: { status: "rejected", reason: "validation_failed" },
        whitespacePolicy: { status: "rejected", reason: "validation_failed" },
        nonStringPolicy: { status: "rejected", reason: "validation_failed" },
        attempt: makeAttemptRecord({ attemptId: "attempt-1", status: "submitted" }),
        runs: [],
      },
    );
  } finally {
    database.close();
  }
});

test("beginOpenAnswerEvaluatorRun_shouldRecordOnlyActiveRequestedByIdentity", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "evaluator-run-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });

    assert.deepEqual(
      {
        accepted: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-1",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          requestedByIdentityId: "identity-active-other",
        }),
        unknown: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-2",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          requestedByIdentityId: "identity-unknown",
        }),
        inactive: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-2",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          requestedByIdentityId: "identity-disabled",
        }),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        accepted: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluating" }),
            evaluatorRun: makeEvaluatorRunSummary({
              requestedByIdentityId: "identity-active-other",
            }),
          },
        },
        unknown: { status: "rejected", reason: "identity_not_active" },
        inactive: { status: "rejected", reason: "identity_not_active" },
        runs: [
          makeEvaluatorRunRecord({
            requestedByIdentityId: "identity-active-other",
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("beginOpenAnswerEvaluatorRun_shouldRequireActiveReviewerAttribution_forHumanReviewedRun", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "evaluator-run-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });

    assert.deepEqual(
      {
        accepted: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-1",
          evaluatorPathKind: "human_reviewed",
          evaluatorPolicyId: "policy-a",
          reviewerIdentityId: "identity-active-other",
          reviewerCapability: " assessment-reviewer ",
        }),
        missingReviewer: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-2",
          evaluatorPathKind: "human_reviewed",
          evaluatorPolicyId: "policy-a",
          reviewerCapability: "assessment-reviewer",
        }),
        missingCapability: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-2",
          evaluatorPathKind: "human_reviewed",
          evaluatorPolicyId: "policy-a",
          reviewerIdentityId: "identity-active-other",
        }),
        whitespaceCapability: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-2",
          evaluatorPathKind: "human_reviewed",
          evaluatorPolicyId: "policy-a",
          reviewerIdentityId: "identity-active-other",
          reviewerCapability: " ",
        }),
        nonStringCapability: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-2",
          evaluatorPathKind: "human_reviewed",
          evaluatorPolicyId: "policy-a",
          reviewerIdentityId: "identity-active-other",
          reviewerCapability: 42,
        }),
        unknownReviewer: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-2",
          evaluatorPathKind: "human_reviewed",
          evaluatorPolicyId: "policy-a",
          reviewerIdentityId: "identity-unknown",
          reviewerCapability: "assessment-reviewer",
        }),
        inactiveReviewer: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-2",
          evaluatorPathKind: "human_reviewed",
          evaluatorPolicyId: "policy-a",
          reviewerIdentityId: "identity-disabled",
          reviewerCapability: "assessment-reviewer",
        }),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        accepted: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluating" }),
            evaluatorRun: makeEvaluatorRunSummary({
              evaluatorPathKind: "human_reviewed",
              reviewerIdentityId: "identity-active-other",
              reviewerCapability: "assessment-reviewer",
            }),
          },
        },
        missingReviewer: { status: "rejected", reason: "validation_failed" },
        missingCapability: { status: "rejected", reason: "validation_failed" },
        whitespaceCapability: { status: "rejected", reason: "validation_failed" },
        nonStringCapability: { status: "rejected", reason: "validation_failed" },
        unknownReviewer: { status: "rejected", reason: "identity_not_active" },
        inactiveReviewer: { status: "rejected", reason: "identity_not_active" },
        runs: [
          makeEvaluatorRunRecord({
            evaluatorPathKind: "human_reviewed",
            reviewerIdentityId: "identity-active-other",
            reviewerCapability: "assessment-reviewer",
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("beginOpenAnswerEvaluatorRun_shouldRejectReviewerAttribution_forNonHumanRun", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);

    assert.deepEqual(
      {
        reviewer: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-1",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          reviewerIdentityId: "identity-active-other",
        }),
        capability: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-1",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          reviewerCapability: "assessment-reviewer",
        }),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        reviewer: { status: "rejected", reason: "validation_failed" },
        capability: { status: "rejected", reason: "validation_failed" },
        runs: [],
      },
    );
  } finally {
    database.close();
  }
});

test("beginOpenAnswerEvaluatorRun_shouldPreservePreviousFailure_onRejectedRetry", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-1",
      reason: "temporary evaluator outage",
    });

    assert.deepEqual(
      {
        result: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-1",
          evaluatorPathKind: "unsupported",
          evaluatorPolicyId: "policy-a",
        }),
        attempt: getOpenAnswerAttemptRecord(database, "attempt-1"),
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        result: { status: "rejected", reason: "validation_failed" },
        attempt: makeAttemptRecord({ attemptId: "attempt-1", status: "evaluation_failed" }),
        failure: {
          attemptId: "attempt-1",
          reason: "temporary evaluator outage",
          failedAt: "2026-06-02T10:00:00.000Z",
        },
        runs: [],
      },
    );
  } finally {
    database.close();
  }
});

test("beginOpenAnswerEvaluatorRun_shouldRejectExistingRunningRun", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluator-run-2"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    createOpenAnswerEvaluatorRunRecord(database, {
      id: "evaluator-run-1",
      attemptId: "attempt-1",
      programId: "program-a",
      studentIdentityId: "identity-student",
      checkRevisionId: "check-revision-a",
      criterionRevisionIds: ["criterion-revision-a"],
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      status: "running",
      startedAt: "2026-06-02T10:00:00.000Z",
    });

    assert.deepEqual(
      commands.beginOpenAnswerEvaluatorRun({
        attemptId: "attempt-1",
        evaluatorPathKind: "deterministic",
        evaluatorPolicyId: "policy-b",
      }),
      { status: "rejected", reason: "evaluator_run_conflict" },
    );
  } finally {
    database.close();
  }
});

test("beginOpenAnswerEvaluatorRun_shouldRevalidateAttemptStatus_insideTransaction", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluator-run-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    const transaction = database.transaction.bind(database);
    database.transaction = callback =>
      transaction(() => {
        updateOpenAnswerAttemptStatus(database, {
          attemptId: "attempt-1",
          status: "evaluating",
          updatedAt: "2026-06-02T10:01:00.000Z",
        });
        return callback();
      });

    assert.deepEqual(
      {
        result: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-1",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
        }),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        result: { status: "rejected", reason: "attempt_already_evaluating" },
        runs: [],
      },
    );
  } finally {
    database.close();
  }
});

test("beginOpenAnswerEvaluatorRun_shouldRevalidateRequestedByIdentity_insideTransaction", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluator-run-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    const transaction = database.transaction.bind(database);
    database.transaction = callback =>
      transaction(() => {
        database
          .prepare("update identities set state = 'disabled', disabled_at = ? where id = ?")
          .run("2026-06-02T10:01:00.000Z", "identity-active-other");
        return callback();
      });

    assert.deepEqual(
      {
        result: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-1",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          requestedByIdentityId: "identity-active-other",
        }),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        result: { status: "rejected", reason: "identity_not_active" },
        runs: [],
      },
    );
  } finally {
    database.close();
  }
});

test("beginOpenAnswerEvaluatorRun_shouldRevalidateReviewerIdentity_insideTransaction", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluator-run-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    const transaction = database.transaction.bind(database);
    database.transaction = callback =>
      transaction(() => {
        database
          .prepare("update identities set state = 'disabled', disabled_at = ? where id = ?")
          .run("2026-06-02T10:01:00.000Z", "identity-active-other");
        return callback();
      });

    assert.deepEqual(
      {
        result: commands.beginOpenAnswerEvaluatorRun({
          attemptId: "attempt-1",
          evaluatorPathKind: "human_reviewed",
          evaluatorPolicyId: "policy-a",
          reviewerIdentityId: "identity-active-other",
          reviewerCapability: "assessment-reviewer",
        }),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        result: { status: "rejected", reason: "identity_not_active" },
        runs: [],
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluatorEvidence_shouldRecordInternalMetadata_onRunningRun", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "evidence-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });

    const result = commands.recordOpenAnswerEvaluatorEvidence?.({
      evaluatorRunId: "evaluator-run-1",
      evidenceKind: " criterion_match ",
      redactedSummary: " Matched accepted criterion without raw evaluator output. ",
    });

    assert.deepEqual(
      {
        result,
        evidence: listOpenAnswerEvaluatorEvidenceRecords(database),
      },
      {
        result: {
          status: "accepted",
          value: {
            evidence: makeEvaluatorEvidenceSummary({
              redactedSummary: "Matched accepted criterion without raw evaluator output.",
            }),
          },
        },
        evidence: [
          makeEvaluatorEvidenceRecord({
            redactedSummary: "Matched accepted criterion without raw evaluator output.",
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluatorEvidence_shouldAcceptOmittedRedactedSummary", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "evidence-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });

    assert.deepEqual(
      {
        result: commands.recordOpenAnswerEvaluatorEvidence({
          evaluatorRunId: "evaluator-run-1",
          evidenceKind: "criterion_match",
        }),
        evidence: listOpenAnswerEvaluatorEvidenceRecords(database),
      },
      {
        result: {
          status: "accepted",
          value: {
            evidence: makeEvaluatorEvidenceSummary(),
          },
        },
        evidence: [makeEvaluatorEvidenceRecord()],
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluatorEvidence_shouldRejectMalformedEvidenceInput", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });

    assert.deepEqual(
      {
        missingKind: commands.recordOpenAnswerEvaluatorEvidence({
          evaluatorRunId: "evaluator-run-1",
        }),
        emptyKind: commands.recordOpenAnswerEvaluatorEvidence({
          evaluatorRunId: "evaluator-run-1",
          evidenceKind: "",
        }),
        whitespaceKind: commands.recordOpenAnswerEvaluatorEvidence({
          evaluatorRunId: "evaluator-run-1",
          evidenceKind: " ",
        }),
        nonStringKind: commands.recordOpenAnswerEvaluatorEvidence({
          evaluatorRunId: "evaluator-run-1",
          evidenceKind: 42,
        }),
        emptySummary: commands.recordOpenAnswerEvaluatorEvidence({
          evaluatorRunId: "evaluator-run-1",
          evidenceKind: "criterion_match",
          redactedSummary: "",
        }),
        whitespaceSummary: commands.recordOpenAnswerEvaluatorEvidence({
          evaluatorRunId: "evaluator-run-1",
          evidenceKind: "criterion_match",
          redactedSummary: " ",
        }),
        nonStringSummary: commands.recordOpenAnswerEvaluatorEvidence({
          evaluatorRunId: "evaluator-run-1",
          evidenceKind: "criterion_match",
          redactedSummary: 42,
        }),
        evidence: listOpenAnswerEvaluatorEvidenceRecords(database),
      },
      {
        missingKind: { status: "rejected", reason: "validation_failed" },
        emptyKind: { status: "rejected", reason: "validation_failed" },
        whitespaceKind: { status: "rejected", reason: "validation_failed" },
        nonStringKind: { status: "rejected", reason: "validation_failed" },
        emptySummary: { status: "rejected", reason: "validation_failed" },
        whitespaceSummary: { status: "rejected", reason: "validation_failed" },
        nonStringSummary: { status: "rejected", reason: "validation_failed" },
        evidence: [],
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluatorEvidence_shouldRejectUnknownAndTerminalRuns", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "attempt-3", "evaluator-run-1", "evaluator-run-2", "evaluator-run-3"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    submitAttempt(commands, { idempotencyKey: "submit-c" });
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-2",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-3",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });
    updateOpenAnswerEvaluatorRunStatus(database, {
      evaluatorRunId: "evaluator-run-1",
      status: "succeeded",
      completedAt: "2026-06-02T10:01:00.000Z",
    });
    updateOpenAnswerEvaluatorRunStatus(database, {
      evaluatorRunId: "evaluator-run-2",
      status: "failed",
      failedAt: "2026-06-02T10:01:00.000Z",
      failureReason: "temporary evaluator outage",
    });
    updateOpenAnswerEvaluatorRunStatus(database, {
      evaluatorRunId: "evaluator-run-3",
      status: "cancelled",
    });

    assert.deepEqual(
      {
        unknown: commands.recordOpenAnswerEvaluatorEvidence({
          evaluatorRunId: "evaluator-run-unknown",
          evidenceKind: "criterion_match",
        }),
        succeeded: commands.recordOpenAnswerEvaluatorEvidence({
          evaluatorRunId: "evaluator-run-1",
          evidenceKind: "criterion_match",
        }),
        failed: commands.recordOpenAnswerEvaluatorEvidence({
          evaluatorRunId: "evaluator-run-2",
          evidenceKind: "criterion_match",
        }),
        cancelled: commands.recordOpenAnswerEvaluatorEvidence({
          evaluatorRunId: "evaluator-run-3",
          evidenceKind: "criterion_match",
        }),
        evidence: listOpenAnswerEvaluatorEvidenceRecords(database),
      },
      {
        unknown: { status: "rejected", reason: "evaluator_run_not_found" },
        succeeded: { status: "rejected", reason: "evaluator_run_conflict" },
        failed: { status: "rejected", reason: "evaluator_run_conflict" },
        cancelled: { status: "rejected", reason: "evaluator_run_conflict" },
        evidence: [],
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluatorEvidence_shouldNotPersistOrReturnRawEvaluatorArtifacts", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "evidence-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });

    const result = commands.recordOpenAnswerEvaluatorEvidence({
      evaluatorRunId: "evaluator-run-1",
      evidenceKind: "criterion_match",
      redactedSummary: "Allowed bounded summary.",
      rawPrompt: "raw prompt with correct horse battery staple",
      rawModelResponse: "raw model response with operator-secret",
      modelMetadata: { endpoint: "127.0.0.1", authorization: "Bearer token" },
      hiddenPolicyInstructions: "hidden policy instructions",
      reviewerNotes: "reviewer notes",
      evaluatorDiagnostics: "select * from internal_table",
      stackTrace: "/tmp/stack trace",
      databaseUrl: "postgres://database-url",
    });

    assert.deepEqual(
      {
        result,
        evidence: listOpenAnswerEvaluatorEvidenceRecords(database),
        redacted: containsForbiddenDetail([result, listOpenAnswerEvaluatorEvidenceRecords(database)]),
      },
      {
        result: {
          status: "accepted",
          value: {
            evidence: makeEvaluatorEvidenceSummary({
              redactedSummary: "Allowed bounded summary.",
            }),
          },
        },
        evidence: [
          makeEvaluatorEvidenceRecord({
            redactedSummary: "Allowed bounded summary.",
          }),
        ],
        redacted: false,
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluatorEvidence_shouldRevalidateRunStatus_insideTransaction", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "evidence-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });
    const transaction = database.transaction.bind(database);
    database.transaction = callback =>
      transaction(() => {
        updateOpenAnswerEvaluatorRunStatus(database, {
          evaluatorRunId: "evaluator-run-1",
          status: "failed",
          failedAt: "2026-06-02T10:01:00.000Z",
          failureReason: "temporary evaluator outage",
        });
        return callback();
      });

    assert.deepEqual(
      {
        result: commands.recordOpenAnswerEvaluatorEvidence({
          evaluatorRunId: "evaluator-run-1",
          evidenceKind: "criterion_match",
        }),
        evidence: listOpenAnswerEvaluatorEvidenceRecords(database),
      },
      {
        result: { status: "rejected", reason: "evaluator_run_conflict" },
        evidence: [],
      },
    );
  } finally {
    database.close();
  }
});

test("completeOpenAnswerEvaluatorRun_shouldRecordEvaluationAndMarkRunSucceeded", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "evaluation-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });

    const result = commands.completeOpenAnswerEvaluatorRun?.({
      evaluatorRunId: "evaluator-run-1",
      summaryFeedback: " Good explanation. ",
      criterionFeedback: [makeCriterionFeedback({ feedback: " Criterion feedback. " })],
    });

    assert.deepEqual(
      {
        result,
        evaluation: getOpenAnswerEvaluationRecord(database, "evaluation-1"),
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        result: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluated" }),
            evaluatorRun: makeEvaluatorRunSummary({
              status: "succeeded",
              completedAt: "2026-06-02T10:00:00.000Z",
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback({ feedback: "Criterion feedback." })],
            }),
          },
        },
        evaluation: makeEvaluationRecord({
          evaluationId: "evaluation-1",
          attemptId: "attempt-1",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback({ feedback: "Criterion feedback." })],
        }),
        failure: null,
        runs: [
          makeEvaluatorRunRecord({
            status: "succeeded",
            completedAt: "2026-06-02T10:00:00.000Z",
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("failOpenAnswerEvaluatorRun_shouldRecordFailureAndMarkRunFailed", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });

    const result = commands.failOpenAnswerEvaluatorRun?.({
      evaluatorRunId: "evaluator-run-1",
      reason: " temporary evaluator outage ",
    });

    assert.deepEqual(
      {
        result,
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        result: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluation_failed" }),
            evaluatorRun: makeEvaluatorRunSummary({
              status: "failed",
              failedAt: "2026-06-02T10:00:00.000Z",
              failureReason: "temporary evaluator outage",
            }),
            evaluationFailure: makeEvaluationFailureSummary({
              reason: "temporary evaluator outage",
            }),
          },
        },
        failure: {
          attemptId: "attempt-1",
          reason: "temporary evaluator outage",
          failedAt: "2026-06-02T10:00:00.000Z",
        },
        runs: [
          makeEvaluatorRunRecord({
            status: "failed",
            failedAt: "2026-06-02T10:00:00.000Z",
            failureReason: "temporary evaluator outage",
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("cancelOpenAnswerEvaluatorRun_shouldRestoreSubmitted_whenNoPriorFailure", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });

    const result = commands.cancelOpenAnswerEvaluatorRun?.({
      evaluatorRunId: "evaluator-run-1",
      reason: " evaluator cancelled by requester ",
    });

    assert.deepEqual(
      {
        result,
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        result: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "submitted" }),
            evaluatorRun: makeEvaluatorRunSummary({
              status: "cancelled",
              failedAt: "2026-06-02T10:00:00.000Z",
              failureReason: "evaluator cancelled by requester",
            }),
          },
        },
        failure: null,
        runs: [
          makeEvaluatorRunRecord({
            status: "cancelled",
            failedAt: "2026-06-02T10:00:00.000Z",
            failureReason: "evaluator cancelled by requester",
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("cancelOpenAnswerEvaluatorRun_shouldRestorePreviousFailure_whenPriorFailureExisted", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-1",
      reason: "temporary evaluator outage",
    });
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });

    const result = commands.cancelOpenAnswerEvaluatorRun({
      evaluatorRunId: "evaluator-run-1",
      reason: "evaluator cancelled by requester",
    });

    assert.deepEqual(
      {
        result,
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        result: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluation_failed" }),
            evaluatorRun: makeEvaluatorRunSummary({
              status: "cancelled",
              failedAt: "2026-06-02T10:00:00.000Z",
              failureReason: "evaluator cancelled by requester",
            }),
          },
        },
        failure: {
          attemptId: "attempt-1",
          reason: "temporary evaluator outage",
          failedAt: "2026-06-02T10:00:00.000Z",
        },
        runs: [
          makeEvaluatorRunRecord({
            status: "cancelled",
            failedAt: "2026-06-02T10:00:00.000Z",
            failureReason: "evaluator cancelled by requester",
            priorFailureReason: "temporary evaluator outage",
            priorFailedAt: "2026-06-02T10:00:00.000Z",
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("evaluatorRunTerminalCommands_shouldRejectUnknownAndTerminalRuns", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "attempt-3", "evaluator-run-1", "evaluator-run-2", "evaluator-run-3"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    submitAttempt(commands, { idempotencyKey: "submit-c" });
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-2",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-3",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });
    updateOpenAnswerEvaluatorRunStatus(database, {
      evaluatorRunId: "evaluator-run-1",
      status: "succeeded",
      completedAt: "2026-06-02T10:01:00.000Z",
    });
    updateOpenAnswerEvaluatorRunStatus(database, {
      evaluatorRunId: "evaluator-run-2",
      status: "failed",
      failedAt: "2026-06-02T10:01:00.000Z",
      failureReason: "temporary evaluator outage",
    });
    updateOpenAnswerEvaluatorRunStatus(database, {
      evaluatorRunId: "evaluator-run-3",
      status: "cancelled",
      failedAt: "2026-06-02T10:01:00.000Z",
      failureReason: "evaluator cancelled by requester",
    });

    assert.deepEqual(
      {
        completeUnknown: commands.completeOpenAnswerEvaluatorRun({
          evaluatorRunId: "evaluator-run-unknown",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
        }),
        failUnknown: commands.failOpenAnswerEvaluatorRun({
          evaluatorRunId: "evaluator-run-unknown",
          reason: "temporary evaluator outage",
        }),
        cancelUnknown: commands.cancelOpenAnswerEvaluatorRun({
          evaluatorRunId: "evaluator-run-unknown",
          reason: "evaluator cancelled by requester",
        }),
        completeTerminal: commands.completeOpenAnswerEvaluatorRun({
          evaluatorRunId: "evaluator-run-1",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
        }),
        failTerminal: commands.failOpenAnswerEvaluatorRun({
          evaluatorRunId: "evaluator-run-2",
          reason: "temporary evaluator outage",
        }),
        cancelTerminal: commands.cancelOpenAnswerEvaluatorRun({
          evaluatorRunId: "evaluator-run-3",
          reason: "evaluator cancelled by requester",
        }),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        completeUnknown: { status: "rejected", reason: "evaluator_run_not_found" },
        failUnknown: { status: "rejected", reason: "evaluator_run_not_found" },
        cancelUnknown: { status: "rejected", reason: "evaluator_run_not_found" },
        completeTerminal: { status: "rejected", reason: "evaluator_run_conflict" },
        failTerminal: { status: "rejected", reason: "evaluator_run_conflict" },
        cancelTerminal: { status: "rejected", reason: "evaluator_run_conflict" },
        runs: [
          makeEvaluatorRunRecord({
            status: "succeeded",
            completedAt: "2026-06-02T10:01:00.000Z",
          }),
          makeEvaluatorRunRecord({
            evaluatorRunId: "evaluator-run-2",
            attemptId: "attempt-2",
            status: "failed",
            failedAt: "2026-06-02T10:01:00.000Z",
            failureReason: "temporary evaluator outage",
          }),
          makeEvaluatorRunRecord({
            evaluatorRunId: "evaluator-run-3",
            attemptId: "attempt-3",
            status: "cancelled",
            failedAt: "2026-06-02T10:01:00.000Z",
            failureReason: "evaluator cancelled by requester",
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("evaluatorRunTerminalCommands_shouldRejectMalformedInputWithoutMutation", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });

    assert.deepEqual(
      {
        complete: commands.completeOpenAnswerEvaluatorRun({
          evaluatorRunId: "evaluator-run-1",
          summaryFeedback: "",
          criterionFeedback: [makeCriterionFeedback()],
        }),
        fail: commands.failOpenAnswerEvaluatorRun({
          evaluatorRunId: "evaluator-run-1",
          reason: " ",
        }),
        cancel: commands.cancelOpenAnswerEvaluatorRun({
          evaluatorRunId: "evaluator-run-1",
          reason: 42,
        }),
        evaluation: getOpenAnswerEvaluationRecord(database, "evaluation-1"),
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        complete: { status: "rejected", reason: "validation_failed" },
        fail: { status: "rejected", reason: "validation_failed" },
        cancel: { status: "rejected", reason: "validation_failed" },
        evaluation: null,
        failure: null,
        runs: [makeEvaluatorRunRecord()],
      },
    );
  } finally {
    database.close();
  }
});

test("markOpenAnswerAttemptEvaluating_shouldRejectUnknownEvaluatingAndEvaluatedAttempts", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluation-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.markOpenAnswerAttemptEvaluating({ attemptId: "attempt-1" });

    const alreadyEvaluating = commands.markOpenAnswerAttemptEvaluating({ attemptId: "attempt-1" });
    commands.recordOpenAnswerEvaluation({
      attemptId: "attempt-1",
      evaluatorKind: "student_workspace",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
    });

    assert.deepEqual(
      {
        unknown: commands.markOpenAnswerAttemptEvaluating({ attemptId: "attempt-unknown" }),
        alreadyEvaluating,
        evaluated: commands.markOpenAnswerAttemptEvaluating({ attemptId: "attempt-1" }),
      },
      {
        unknown: { status: "rejected", reason: "attempt_not_found" },
        alreadyEvaluating: { status: "rejected", reason: "attempt_already_evaluating" },
        evaluated: { status: "rejected", reason: "attempt_already_evaluated" },
      },
    );
  } finally {
    database.close();
  }
});

test("markOpenAnswerAttemptEvaluating_shouldClearPreviousFailure_onFailedAttempt", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-1",
      reason: "temporary evaluator outage",
    });

    commands.markOpenAnswerAttemptEvaluating({ attemptId: "attempt-1" });

    assert.deepEqual(getOpenAnswerEvaluationFailureRecord(database, "attempt-1"), null);
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluation_shouldAcceptSubmittedEvaluatingAndFailedAttempts", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "attempt-3", "evaluation-1", "evaluation-2", "evaluation-3"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b", submittedAnswer: "Second answer" });
    submitAttempt(commands, { idempotencyKey: "submit-c", submittedAnswer: "Third answer" });
    commands.markOpenAnswerAttemptEvaluating({ attemptId: "attempt-2" });
    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-3",
      reason: "temporary evaluator outage",
    });

    assert.deepEqual(
      {
        submitted: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-1",
          evaluatorKind: "student_workspace",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
        }),
        evaluating: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-2",
          evaluatorKind: "student_workspace",
          summaryFeedback: "Good second explanation.",
          criterionFeedback: [makeCriterionFeedback({ feedback: "Second criterion feedback" })],
        }),
        failed: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-3",
          evaluatorKind: "student_workspace",
          summaryFeedback: "Good retry explanation.",
          criterionFeedback: [makeCriterionFeedback({ feedback: "Retry criterion feedback" })],
        }),
      },
      {
        submitted: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluated" }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        evaluating: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-2",
              status: "evaluated",
              submittedAnswer: "Second answer",
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-2",
              attemptId: "attempt-2",
              submittedAnswer: "Second answer",
              summaryFeedback: "Good second explanation.",
              criterionFeedback: [makeCriterionFeedback({ feedback: "Second criterion feedback" })],
            }),
          },
        },
        failed: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-3",
              status: "evaluated",
              submittedAnswer: "Third answer",
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-3",
              attemptId: "attempt-3",
              submittedAnswer: "Third answer",
              summaryFeedback: "Good retry explanation.",
              criterionFeedback: [makeCriterionFeedback({ feedback: "Retry criterion feedback" })],
            }),
          },
        },
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluation_shouldRejectUnknownAndAlreadyEvaluatedAttempts", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluation-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.recordOpenAnswerEvaluation({
      attemptId: "attempt-1",
      evaluatorKind: "student_workspace",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
    });

    assert.deepEqual(
      {
        unknown: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-unknown",
          evaluatorKind: "student_workspace",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
        }),
        evaluated: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-1",
          evaluatorKind: "student_workspace",
          summaryFeedback: "Another explanation.",
          criterionFeedback: [makeCriterionFeedback()],
        }),
      },
      {
        unknown: { status: "rejected", reason: "attempt_not_found" },
        evaluated: { status: "rejected", reason: "attempt_already_evaluated" },
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluation_shouldRejectMalformedEvaluationInput", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);

    assert.deepEqual(
      {
        evaluator: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-1",
          evaluatorKind: "llm_provider",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
        }),
        summary: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-1",
          evaluatorKind: "student_workspace",
          summaryFeedback: " ",
          criterionFeedback: [makeCriterionFeedback()],
        }),
        missing: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-1",
          evaluatorKind: "student_workspace",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [],
        }),
        duplicate: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-1",
          evaluatorKind: "student_workspace",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback(), makeCriterionFeedback()],
        }),
        unknown: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-1",
          evaluatorKind: "student_workspace",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback({ criterionRevisionId: "criterion-revision-unknown" })],
        }),
        outcome: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-1",
          evaluatorKind: "student_workspace",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback({ outcome: "excellent" })],
        }),
        feedback: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-1",
          evaluatorKind: "student_workspace",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback({ feedback: " " })],
        }),
      },
      {
        evaluator: { status: "rejected", reason: "validation_failed" },
        summary: { status: "rejected", reason: "validation_failed" },
        missing: { status: "rejected", reason: "validation_failed" },
        duplicate: { status: "rejected", reason: "validation_failed" },
        unknown: { status: "rejected", reason: "validation_failed" },
        outcome: { status: "rejected", reason: "validation_failed" },
        feedback: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluation_shouldRejectDuplicateMissingAndExtraFeedback_onMultiCriterionAttempt", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, {
      programId: "program-a",
      secondCriterionCandidateId: "criterion-candidate-b",
      secondCriterionEntityId: "criterion-entity-b",
      secondCriterionRevisionId: "criterion-revision-b",
    });
    submitAttempt(commands);

    assert.deepEqual(
      {
        missing: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-1",
          evaluatorKind: "student_workspace",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
        }),
        duplicate: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-1",
          evaluatorKind: "student_workspace",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [
            makeCriterionFeedback(),
            makeCriterionFeedback(),
          ],
        }),
        extra: commands.recordOpenAnswerEvaluation({
          attemptId: "attempt-1",
          evaluatorKind: "student_workspace",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [
            makeCriterionFeedback(),
            makeCriterionFeedback({ criterionRevisionId: "criterion-revision-extra" }),
          ],
        }),
      },
      {
        missing: { status: "rejected", reason: "validation_failed" },
        duplicate: { status: "rejected", reason: "validation_failed" },
        extra: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluation_shouldStoreEvaluationAndPreserveAttemptReferences", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluation-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);

    commands.recordOpenAnswerEvaluation({
      attemptId: "attempt-1",
      evaluatorKind: "student_workspace",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
    });

    assert.deepEqual(
      {
        attempt: projectAttemptPreservation(getOpenAnswerAttemptRecord(database, "attempt-1")),
        evaluation: getOpenAnswerEvaluationRecord(database, "evaluation-1"),
      },
      {
        attempt: {
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
          status: "evaluated",
          submittedAnswer: "Answer",
        },
        evaluation: {
          id: "evaluation-1",
          attemptId: "attempt-1",
          programId: "program-a",
          studentIdentityId: "identity-student",
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
          evaluatorKind: "student_workspace",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
          evaluatedAt: "2026-06-02T10:00:00.000Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluation_shouldClearPreviousFailure_onFailedAttempt", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluation-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-1",
      reason: "temporary evaluator outage",
    });

    commands.recordOpenAnswerEvaluation({
      attemptId: "attempt-1",
      evaluatorKind: "student_workspace",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
    });

    assert.deepEqual(getOpenAnswerEvaluationFailureRecord(database, "attempt-1"), null);
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluationFailure_shouldChangeSubmittedEvaluatingAndFailedAttemptsToFailed", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "attempt-2", "attempt-3"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b", submittedAnswer: "Second answer" });
    submitAttempt(commands, { idempotencyKey: "submit-c", submittedAnswer: "Third answer" });
    commands.markOpenAnswerAttemptEvaluating({ attemptId: "attempt-2" });
    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-3",
      reason: "previous evaluator outage",
    });

    assert.deepEqual(
      {
        submitted: commands.recordOpenAnswerEvaluationFailure({
          attemptId: "attempt-1",
          reason: "temporary evaluator outage",
        }),
        evaluating: commands.recordOpenAnswerEvaluationFailure({
          attemptId: "attempt-2",
          reason: "temporary evaluator outage",
        }),
        failed: commands.recordOpenAnswerEvaluationFailure({
          attemptId: "attempt-3",
          reason: "temporary evaluator outage",
        }),
      },
      {
        submitted: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluation_failed" }),
            evaluationFailure: makeEvaluationFailureSummary({ reason: "temporary evaluator outage" }),
          },
        },
        evaluating: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-2",
              status: "evaluation_failed",
              submittedAnswer: "Second answer",
            }),
            evaluationFailure: makeEvaluationFailureSummary({ reason: "temporary evaluator outage" }),
          },
        },
        failed: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-3",
              status: "evaluation_failed",
              submittedAnswer: "Third answer",
            }),
            evaluationFailure: makeEvaluationFailureSummary({ reason: "temporary evaluator outage" }),
          },
        },
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluationFailure_shouldRejectUnknownEvaluatedAndMalformedFailureCases", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluation-1", "attempt-2"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.recordOpenAnswerEvaluation({
      attemptId: "attempt-1",
      evaluatorKind: "student_workspace",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
    });
    submitAttempt(commands, {
      idempotencyKey: "submit-b",
      submittedAnswer: "Second answer",
    });

    assert.deepEqual(
      {
        unknown: commands.recordOpenAnswerEvaluationFailure({
          attemptId: "attempt-unknown",
          reason: "temporary evaluator outage",
        }),
        evaluated: commands.recordOpenAnswerEvaluationFailure({
          attemptId: "attempt-1",
          reason: "temporary evaluator outage",
        }),
        malformed: commands.recordOpenAnswerEvaluationFailure({
          attemptId: "attempt-2",
          reason: " ",
        }),
      },
      {
        unknown: { status: "rejected", reason: "attempt_not_found" },
        evaluated: { status: "rejected", reason: "attempt_already_evaluated" },
        malformed: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluationFailure_shouldStoreFailureAndPreserveAttemptReferences", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);

    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-1",
      reason: "temporary evaluator outage",
    });

    assert.deepEqual(
      {
        attempt: projectAttemptPreservation(getOpenAnswerAttemptRecord(database, "attempt-1")),
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
      },
      {
        attempt: {
          checkRevisionId: "check-revision-a",
          criterionRevisionIds: ["criterion-revision-a"],
          status: "evaluation_failed",
          submittedAnswer: "Answer",
        },
        failure: {
          attemptId: "attempt-1",
          reason: "temporary evaluator outage",
          failedAt: "2026-06-02T10:00:00.000Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("evaluationLifecycleCommands_shouldNotExposeSecretsOrEvaluationDiagnostics", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluation-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "sensitive-idempotency-key" });

    const evaluating = commands.markOpenAnswerAttemptEvaluating({ attemptId: "attempt-1" });
    const evaluated = commands.recordOpenAnswerEvaluation({
      attemptId: "attempt-1",
      evaluatorKind: "student_workspace",
      summaryFeedback: "  Good explanation.  ",
      criterionFeedback: [makeCriterionFeedback({ feedback: "  Criterion feedback  " })],
    });
    const alreadyEvaluatedFailure = commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-1",
      reason: "temporary evaluator outage",
    });

    assert.deepEqual(containsForbiddenDetail([evaluating, evaluated, alreadyEvaluatedFailure]), false);
  } finally {
    database.close();
  }
});

test("evaluationLifecycleCommands_shouldNotMutateAcceptedCorpusOrCuratorCandidates", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "attempt-2", "evaluation-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b", submittedAnswer: "Second answer" });
    const before = projectAcceptedAssessmentState(database);

    commands.markOpenAnswerAttemptEvaluating({ attemptId: "attempt-1" });
    commands.recordOpenAnswerEvaluation({
      attemptId: "attempt-1",
      evaluatorKind: "student_workspace",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
    });
    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-2",
      reason: "temporary evaluator outage",
    });

    assert.deepEqual(projectAcceptedAssessmentState(database), before);
  } finally {
    database.close();
  }
});

test("getOpenAnswerAttempt_shouldReturnOwnerAttemptDetailWithoutIdempotencyKey", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "sensitive-idempotency-key" });

    const result = commands.getOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      attemptId: "attempt-1",
    });

    assert.deepEqual(
      {
        result,
        redacted: containsForbiddenDetail(result),
      },
      {
        result: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "submitted" }),
          },
        },
        redacted: false,
      },
    );
  } finally {
    database.close();
  }
});

test("getOpenAnswerAttempt_shouldIncludeEvaluationDetailWhenPresent", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluation-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.recordOpenAnswerEvaluation({
      attemptId: "attempt-1",
      evaluatorKind: "student_workspace",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
    });

    assert.deepEqual(
      commands.getOpenAnswerAttempt({
        actingIdentityId: "identity-student",
        attemptId: "attempt-1",
      }),
      {
        status: "accepted",
        value: {
          attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluated" }),
          evaluation: makeEvaluationSummary({
            evaluationId: "evaluation-1",
            attemptId: "attempt-1",
            summaryFeedback: "Good explanation.",
            criterionFeedback: [makeCriterionFeedback()],
          }),
        },
      },
    );
  } finally {
    database.close();
  }
});

test("getOpenAnswerAttempt_shouldIncludeEvaluationFailureDetailWhenPresent", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-1",
      reason: "temporary evaluator outage",
    });

    assert.deepEqual(
      commands.getOpenAnswerAttempt({
        actingIdentityId: "identity-student",
        attemptId: "attempt-1",
      }),
      {
        status: "accepted",
        value: {
          attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluation_failed" }),
          evaluationFailure: makeEvaluationFailureSummary({ reason: "temporary evaluator outage" }),
        },
      },
    );
  } finally {
    database.close();
  }
});

test("getOpenAnswerAttempt_shouldRejectUnknownAndInactiveIdentitiesAndUnknownAttempts", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));

    assert.deepEqual(
      {
        unknownAttempt: commands.getOpenAnswerAttempt({
          actingIdentityId: "identity-student",
          attemptId: "attempt-unknown",
        }),
        unknownIdentity: commands.getOpenAnswerAttempt({
          actingIdentityId: "identity-unknown",
          attemptId: "attempt-1",
        }),
        inactiveIdentity: commands.getOpenAnswerAttempt({
          actingIdentityId: "identity-disabled",
          attemptId: "attempt-1",
        }),
      },
      {
        unknownAttempt: { status: "rejected", reason: "attempt_not_found" },
        unknownIdentity: { status: "rejected", reason: "identity_not_active" },
        inactiveIdentity: { status: "rejected", reason: "identity_not_active" },
      },
    );
  } finally {
    database.close();
  }
});

test("getOpenAnswerAttempt_shouldReturnAttemptNotFoundForNonOwners", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    createIdentity(database, makeIdentity({ id: "identity-student-2" }));
    createProgramMembershipRecord(database, makeMembership({
      id: "membership-student-2-a",
      identityId: "identity-student-2",
      participationKind: "student",
      programId: "program-a",
    }));
    createProgramMembershipRecord(database, makeMembership({
      id: "membership-curator-a",
      identityId: "identity-curator",
      participationKind: "program_curator",
      programId: "program-a",
    }));
    createIdentity(database, makeIdentity({ id: "identity-admin" }));
    grantAdminAuthority(database, {
      identityId: "identity-admin",
      grantedAt: "2026-06-02T09:00:00.000Z",
    });

    assert.deepEqual(
      {
        otherStudent: commands.getOpenAnswerAttempt({
          actingIdentityId: "identity-student-2",
          attemptId: "attempt-1",
        }),
        curator: commands.getOpenAnswerAttempt({
          actingIdentityId: "identity-curator",
          attemptId: "attempt-1",
        }),
        admin: commands.getOpenAnswerAttempt({
          actingIdentityId: "identity-admin",
          attemptId: "attempt-1",
        }),
        otherActiveIdentity: commands.getOpenAnswerAttempt({
          actingIdentityId: "identity-active-other",
          attemptId: "attempt-1",
        }),
      },
      {
        otherStudent: { status: "rejected", reason: "attempt_not_found" },
        curator: { status: "rejected", reason: "attempt_not_found" },
        admin: { status: "rejected", reason: "attempt_not_found" },
        otherActiveIdentity: { status: "rejected", reason: "attempt_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("listOpenAnswerAttempts_shouldReturnOnlyActingStudentAttemptsInProgram", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "attempt-2", "attempt-3"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    createIdentity(database, makeIdentity({ id: "identity-student-2" }));
    createProgramMembershipRecord(database, makeMembership({
      id: "membership-student-2-a",
      identityId: "identity-student-2",
      participationKind: "student",
      programId: "program-a",
    }));
    commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student-2",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Other student answer",
      idempotencyKey: "submit-b",
    });
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
    commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-b",
      checkRevisionId: "check-revision-b",
      submittedAnswer: "Other program answer",
      idempotencyKey: "submit-c",
    });

    assert.deepEqual(
      commands.listOpenAnswerAttempts({
        actingIdentityId: "identity-student",
        programId: "program-a",
      }),
      {
        status: "accepted",
        value: {
          attempts: [makeAttemptSummary({ attemptId: "attempt-1", status: "submitted" })],
        },
      },
    );
  } finally {
    database.close();
  }
});

test("listOpenAnswerAttempts_shouldApplyStatusAndCheckRevisionFiltersAfterOwnerScope", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "evaluation-1", "attempt-3"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b", submittedAnswer: "Second answer" });
    commands.recordOpenAnswerEvaluation({
      attemptId: "attempt-2",
      evaluatorKind: "student_workspace",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
    });
    seedStudentProgramWithAcceptedCheck(database, {
      programId: "program-a",
      checkEntityId: "check-entity-b",
      checkRevisionId: "check-revision-b",
      criterionCandidateId: "criterion-candidate-b",
      criterionEntityId: "criterion-entity-b",
      criterionRevisionId: "criterion-revision-b",
      membershipId: "membership-student-a-b",
      sourceId: "source-b",
    });
    submitAttempt(commands, {
      idempotencyKey: "submit-c",
      submittedAnswer: "Third answer",
      checkRevisionId: "check-revision-b",
    });

    assert.deepEqual(
      {
        evaluated: commands.listOpenAnswerAttempts({
          actingIdentityId: "identity-student",
          programId: "program-a",
          status: "evaluated",
        }),
        revision: commands.listOpenAnswerAttempts({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "check-revision-b",
        }),
      },
      {
        evaluated: {
          status: "accepted",
          value: {
            attempts: [makeAttemptSummary({
              attemptId: "attempt-2",
              status: "evaluated",
              submittedAnswer: "Second answer",
            })],
          },
        },
        revision: {
          status: "accepted",
          value: {
            attempts: [makeAttemptSummary({
              attemptId: "attempt-3",
              checkRevisionId: "check-revision-b",
              criterionRevisionIds: ["criterion-revision-b"],
              status: "submitted",
              submittedAnswer: "Third answer",
            })],
          },
        },
      },
    );
  } finally {
    database.close();
  }
});

test("listOpenAnswerAttempts_shouldRejectInactiveUnknownProgramNonStudentAndUnsupportedStatus", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
    createProgramMembershipRecord(database, makeMembership({
      id: "membership-curator-a",
      identityId: "identity-curator",
      participationKind: "program_curator",
      programId: "program-a",
    }));

    assert.deepEqual(
      {
        inactive: commands.listOpenAnswerAttempts({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
        }),
        unknownProgram: commands.listOpenAnswerAttempts({
          actingIdentityId: "identity-student",
          programId: "program-unknown",
        }),
        nonStudent: commands.listOpenAnswerAttempts({
          actingIdentityId: "identity-curator",
          programId: "program-a",
        }),
        status: commands.listOpenAnswerAttempts({
          actingIdentityId: "identity-student",
          programId: "program-a",
          status: "archived",
        }),
        checkRevisionId: commands.listOpenAnswerAttempts({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "",
        }),
      },
      {
        inactive: { status: "rejected", reason: "identity_not_active" },
        unknownProgram: { status: "rejected", reason: "program_not_found" },
        nonStudent: { status: "rejected", reason: "participation_required" },
        status: { status: "rejected", reason: "validation_failed" },
        checkRevisionId: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("readCommands_shouldNotExposeSecretsOrDiagnostics", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluation-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "sensitive-idempotency-key" });
    commands.recordOpenAnswerEvaluation({
      attemptId: "attempt-1",
      evaluatorKind: "student_workspace",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
    });

    const detail = commands.getOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      attemptId: "attempt-1",
    });
    const list = commands.listOpenAnswerAttempts({
      actingIdentityId: "identity-student",
      programId: "program-a",
    });
    const rejected = commands.getOpenAnswerAttempt({
      actingIdentityId: "identity-active-other",
      attemptId: "attempt-1",
    });

    assert.deepEqual(containsForbiddenDetail([detail, list, rejected]), false);
  } finally {
    database.close();
  }
});

test("studentWorkspaceFirstSlice_shouldNotExposeOutOfScopeSurfaces", () => {
  const { commands, database } = makeSUT();

  try {
    assert.deepEqual(Object.keys(commands).sort(), [
      "beginOpenAnswerEvaluatorRun",
      "cancelOpenAnswerEvaluatorRun",
      "completeOpenAnswerEvaluatorRun",
      "failOpenAnswerEvaluatorRun",
      "getOpenAnswerAttempt",
      "listOpenAnswerAttempts",
      "markOpenAnswerAttemptEvaluating",
      "recordOpenAnswerEvaluation",
      "recordOpenAnswerEvaluationFailure",
      "recordOpenAnswerEvaluatorEvidence",
      "submitOpenAnswerAttempt",
    ]);
    assert.deepEqual(
      containsAnyStudentWorkspaceAdapterSurface([
        readFileSync(new URL("../src/admin-ui.js", import.meta.url), "utf8"),
        readFileSync(new URL("../src/cli.js", import.meta.url), "utf8"),
      ]),
      false,
    );
    assert.deepEqual(
      containsAnyOutOfScopeStudentWorkspaceHttpMutation(
        readFileSync(new URL("../src/server.js", import.meta.url), "utf8"),
      ),
      false,
    );
    assert.deepEqual(
      containsAnyOutOfScopeStudentWorkspaceBehavior(
        readFileSync(new URL("../src/student-workspace.js", import.meta.url), "utf8"),
      ),
      false,
    );
  } finally {
    database.close();
  }
});

test("studentWorkspaceOpenAnswerExecutableAcceptance_shouldCoverFirstSliceFlow", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "evaluation-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });

    const submitted = commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Initial answer",
      idempotencyKey: "sensitive-idempotency-key",
    });
    const retried = commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Initial answer",
      idempotencyKey: "sensitive-idempotency-key",
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
    const failedAttempt = commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-b",
      submittedAnswer: "Second answer",
      idempotencyKey: "submit-b",
    });
    const evaluated = commands.recordOpenAnswerEvaluation({
      attemptId: "attempt-1",
      evaluatorKind: "student_workspace",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
    });
    const failure = commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-2",
      reason: "temporary evaluator outage",
    });
    const ownerDetail = commands.getOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      attemptId: "attempt-1",
    });
    const ownerHistory = commands.listOpenAnswerAttempts({
      actingIdentityId: "identity-student",
      programId: "program-a",
    });
    const nonOwnerDetail = commands.getOpenAnswerAttempt({
      actingIdentityId: "identity-active-other",
      attemptId: "attempt-1",
    });

    assert.deepEqual(
      {
        submitted,
        retried,
        failedAttempt,
        evaluated,
        failure,
        ownerDetail,
        ownerHistory,
        nonOwnerDetail,
        redacted: containsForbiddenDetail([
          submitted,
          retried,
          failedAttempt,
          evaluated,
          failure,
          ownerDetail,
          ownerHistory,
          nonOwnerDetail,
        ]),
        commandSurface: Object.keys(commands).sort(),
      },
      {
        submitted: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-1",
              status: "submitted",
              submittedAnswer: "Initial answer",
            }),
          },
        },
        retried: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-1",
              status: "submitted",
              submittedAnswer: "Initial answer",
            }),
          },
        },
        failedAttempt: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-2",
              checkRevisionId: "check-revision-b",
              criterionRevisionIds: ["criterion-revision-b"],
              status: "submitted",
              submittedAnswer: "Second answer",
            }),
          },
        },
        evaluated: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-1",
              status: "evaluated",
              submittedAnswer: "Initial answer",
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        failure: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-2",
              checkRevisionId: "check-revision-b",
              criterionRevisionIds: ["criterion-revision-b"],
              status: "evaluation_failed",
              submittedAnswer: "Second answer",
            }),
            evaluationFailure: makeEvaluationFailureSummary({ reason: "temporary evaluator outage" }),
          },
        },
        ownerDetail: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-1",
              status: "evaluated",
              submittedAnswer: "Initial answer",
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        ownerHistory: {
          status: "accepted",
          value: {
            attempts: [
              makeAttemptSummary({
                attemptId: "attempt-1",
                status: "evaluated",
                submittedAnswer: "Initial answer",
              }),
              makeAttemptSummary({
                attemptId: "attempt-2",
                checkRevisionId: "check-revision-b",
                criterionRevisionIds: ["criterion-revision-b"],
                status: "evaluation_failed",
                submittedAnswer: "Second answer",
              }),
            ],
          },
        },
        nonOwnerDetail: { status: "rejected", reason: "attempt_not_found" },
        redacted: false,
        commandSurface: [
          "beginOpenAnswerEvaluatorRun",
          "cancelOpenAnswerEvaluatorRun",
          "completeOpenAnswerEvaluatorRun",
          "failOpenAnswerEvaluatorRun",
          "getOpenAnswerAttempt",
          "listOpenAnswerAttempts",
          "markOpenAnswerAttemptEvaluating",
          "recordOpenAnswerEvaluation",
          "recordOpenAnswerEvaluationFailure",
          "recordOpenAnswerEvaluatorEvidence",
          "submitOpenAnswerAttempt",
        ],
      },
    );
  } finally {
    database.close();
  }
});

function submitAttempt(
  commands,
  {
    idempotencyKey = "submit-a",
    submittedAnswer = "Answer",
    checkRevisionId = "check-revision-a",
  } = {},
) {
  return commands.submitOpenAnswerAttempt({
    actingIdentityId: "identity-student",
    programId: "program-a",
    checkRevisionId,
    submittedAnswer,
    idempotencyKey,
  });
}

function makeAttemptSummary({
  attemptId,
  status,
  checkRevisionId = "check-revision-a",
  criterionRevisionIds = ["criterion-revision-a"],
  submittedAnswer = "Answer",
}) {
  return {
    attemptId,
    programId: "program-a",
    studentIdentityId: "identity-student",
    checkRevisionId,
    criterionRevisionIds,
    submittedAnswer,
    status,
    submittedAt: "2026-06-02T10:00:00.000Z",
    updatedAt: "2026-06-02T10:00:00.000Z",
  };
}

function makeAttemptRecord(input) {
  const { attemptId: id, ...summary } = makeAttemptSummary(input);
  return {
    id,
    ...summary,
    idempotencyKey: "submit-a",
  };
}

function makeEvaluationSummary({
  evaluationId,
  attemptId,
  summaryFeedback,
  criterionFeedback,
}) {
  return {
    evaluationId,
    attemptId,
    programId: "program-a",
    studentIdentityId: "identity-student",
    checkRevisionId: "check-revision-a",
    criterionRevisionIds: ["criterion-revision-a"],
    evaluatorKind: "student_workspace",
    summaryFeedback,
    criterionFeedback,
    evaluatedAt: "2026-06-02T10:00:00.000Z",
  };
}

function makeEvaluationRecord(input) {
  const { evaluationId: id, ...summary } = makeEvaluationSummary(input);
  return {
    id,
    ...summary,
  };
}

function makeEvaluatorRunSummary({
  evaluatorRunId = "evaluator-run-1",
  attemptId = "attempt-1",
  evaluatorPathKind = "deterministic",
  evaluatorPolicyId = "policy-a",
  requestedByIdentityId,
  reviewerIdentityId,
  reviewerCapability,
  status = "running",
  completedAt,
  failedAt,
  failureReason,
} = {}) {
  return {
    evaluatorRunId,
    attemptId,
    programId: "program-a",
    studentIdentityId: "identity-student",
    checkRevisionId: "check-revision-a",
    criterionRevisionIds: ["criterion-revision-a"],
    evaluatorPathKind,
    evaluatorPolicyId,
    status,
    ...(requestedByIdentityId ? { requestedByIdentityId } : {}),
    ...(reviewerIdentityId ? { reviewerIdentityId } : {}),
    ...(reviewerCapability ? { reviewerCapability } : {}),
    startedAt: "2026-06-02T10:00:00.000Z",
    ...(completedAt ? { completedAt } : {}),
    ...(failedAt ? { failedAt } : {}),
    ...(failureReason ? { failureReason } : {}),
  };
}

function makeEvaluatorRunRecord(input) {
  const { evaluatorRunId: id, ...summary } = makeEvaluatorRunSummary(input);
  return {
    id,
    ...summary,
    requestedByIdentityId: input?.requestedByIdentityId ?? null,
    reviewerIdentityId: input?.reviewerIdentityId ?? null,
    reviewerCapability: input?.reviewerCapability ?? null,
    completedAt: input?.completedAt ?? null,
    failedAt: input?.failedAt ?? null,
    failureReason: input?.failureReason ?? null,
    priorFailureReason: input?.priorFailureReason ?? null,
    priorFailedAt: input?.priorFailedAt ?? null,
  };
}

function makeEvaluatorEvidenceSummary({
  evidenceId = "evidence-1",
  evidenceKind = "criterion_match",
  redactedSummary,
} = {}) {
  return {
    evidenceId,
    evaluatorRunId: "evaluator-run-1",
    attemptId: "attempt-1",
    evidenceKind,
    visibility: "internal",
    ...(redactedSummary ? { redactedSummary } : {}),
    recordedAt: "2026-06-02T10:00:00.000Z",
  };
}

function makeEvaluatorEvidenceRecord(input) {
  const { evidenceId: id, ...summary } = makeEvaluatorEvidenceSummary(input);
  return {
    id,
    ...summary,
    redactedSummary: input?.redactedSummary ?? null,
  };
}

function makeCriterionFeedback({
  criterionRevisionId = "criterion-revision-a",
  outcome = "met",
  feedback = "Criterion feedback",
} = {}) {
  return {
    criterionRevisionId,
    outcome,
    feedback,
  };
}

function makeEvaluationFailureSummary({ reason }) {
  return {
    reason,
    failedAt: "2026-06-02T10:00:00.000Z",
  };
}

function projectAttemptPreservation(attempt) {
  return {
    checkRevisionId: attempt.checkRevisionId,
    criterionRevisionIds: attempt.criterionRevisionIds,
    status: attempt.status,
    submittedAnswer: attempt.submittedAnswer,
  };
}

function makeMembership({ id, identityId, participationKind, programId, status = "active" }) {
  return {
    id,
    programId,
    identityId,
    participationKind,
    status,
    createdAt: "2026-06-02T09:00:00.000Z",
    updatedAt: "2026-06-02T09:00:00.000Z",
  };
}

function makeSUT({
  ids = ["attempt-1", "attempt-2", "attempt-3"],
  now = () => new Date("2026-06-02T10:00:00.000Z"),
} = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const programCommands = createProgramCommands({ database });
  createIdentity(database, makeIdentity({ id: "identity-active-other" }));
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
    secondCriterionCandidateId = null,
    secondCriterionEntityId = null,
    secondCriterionRevisionId = null,
    sourceId = "source-a",
    studentMembershipStatus = "active",
  },
) {
  createIdentityIfMissing(database, "identity-curator");
  createIdentityIfMissing(database, "identity-student");
  createProgramShellIfMissing(database, programId);
  createProgramMembershipIfMissing(database, {
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
  if (secondCriterionCandidateId && secondCriterionEntityId && secondCriterionRevisionId) {
    createAssessmentCriterionCandidateRecord(
      database,
      makeAssessmentCriterionCandidate({
        id: secondCriterionCandidateId,
        programId,
        sourceIds: [sourceId],
        status: "accepted",
      }),
    );
    createAcceptedAssessmentCriterionEntityRecord(
      database,
      makeAcceptedAssessmentCriterionEntity({
        id: secondCriterionEntityId,
        programId,
        currentRevisionId: secondCriterionRevisionId,
      }),
    );
    createAcceptedAssessmentCriterionRevisionRecord(
      database,
      makeAcceptedAssessmentCriterionRevision({
        id: secondCriterionRevisionId,
        entityId: secondCriterionEntityId,
        programId,
        acceptedFromCandidateId: secondCriterionCandidateId,
        sourceIds: [sourceId],
      }),
    );
  }
  createOpenAnswerCheckCandidateRecord(
    database,
    makeOpenAnswerCheckCandidate({
      id: `check-candidate-${checkRevisionId}`,
      programId,
      sourceIds: [sourceId],
      criterionEntityIds: [criterionEntityId, secondCriterionEntityId].filter(Boolean),
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
      criterionRevisionIds: [criterionRevisionId, secondCriterionRevisionId].filter(Boolean),
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

function createProgramShellIfMissing(database, id) {
  try {
    createProgramShellRecord(database, makeProgramShell({ id }));
  } catch (error) {
    if (error.code !== "SQLITE_CONSTRAINT_PRIMARYKEY") {
      throw error;
    }
  }
}

function createProgramMembershipIfMissing(database, membership) {
  try {
    createProgramMembershipRecord(database, membership);
  } catch (error) {
    if (error.code !== "SQLITE_CONSTRAINT_UNIQUE") {
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
    "diagnostic",
    "raw model",
    "raw prompt",
    "select ",
    "stack",
    "127.0.0.1",
  ].some($0 => serialized.includes($0));
}

function containsAnyStudentWorkspaceAdapterSurface(sources) {
  return sources.some(source => [
    "createStudentWorkspaceCommands",
    "getOpenAnswerAttempt",
    "listOpenAnswerAttempts",
    "/student-workspace",
    "student-workspace",
  ].some($0 => source.includes($0)));
}

function containsAnyOutOfScopeStudentWorkspaceHttpMutation(source) {
  return [
    "markOpenAnswerAttemptEvaluating",
    "recordOpenAnswerEvaluation",
    "recordOpenAnswerEvaluationFailure",
  ].some($0 => source.includes($0));
}

function containsAnyOutOfScopeStudentWorkspaceBehavior(source) {
  const normalized = source.toLowerCase();
  return [
    "provider",
    "raw_prompt",
    "raw_model",
    "mastery",
    "weak_area",
    "progress",
    "quick_check",
    "topic_attempt",
    "period_attempt",
    "grading",
  ].some($0 => normalized.includes($0));
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
