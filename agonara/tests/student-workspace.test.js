import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createCorpusCommands } from "../src/corpus.js";
import { createProgramCommands } from "../src/program.js";
import * as studentWorkspace from "../src/student-workspace.js";
import {
  createAcceptedAssessmentCriterionEntityRecord,
  createAcceptedAssessmentCriterionRevisionRecord,
  createAcceptedCorpusEntityRecord,
  createAcceptedCorpusRevisionRecord,
  createAcceptedNavigationRelationshipRecord,
  createAcceptedNavigationRelationshipRevisionRecord,
  createAcceptedOpenAnswerCheckEntityRecord,
  createAcceptedOpenAnswerCheckRevisionRecord,
  createAcceptedQuickCheckEntityRecord,
  createAcceptedQuickCheckRevisionRecord,
  createAcceptedReadinessCheckEntityRecord,
  createAcceptedReadinessCheckRevisionRecord,
  createAssessmentCriterionCandidateRecord,
  createCorpusCandidateRecord,
  createIdentity,
  createLocalPasswordCredential,
  createLearnerEvidenceTargetLinkRecord,
  createOpenAnswerCheckCandidateRecord,
  createOpenAnswerEvaluatorRunRecord,
  createProgramMembershipRecord,
  createProgramShellRecord,
  createProgramSourceRecord,
  createQuickCheckCandidateRecord,
  createReadinessCheckCandidateRecord,
  createSession,
  deleteLearnerEvidenceTargetLinkRecord,
  exportIdentityBackup,
  getIdentity,
  getOpenAnswerAttemptRecord,
  getOpenAnswerEvaluationFailureRecord,
  getOpenAnswerEvaluationRecord,
  getOpenAnswerEvaluatorJobRecord,
  getQuickCheckAttemptRecord,
  getSession,
  grantAdminAuthority,
  initializeIdentityStorage,
  listAdminAuthorities,
  listAcceptedAssessmentCriterionEntityRecords,
  listAcceptedAssessmentCriterionRevisionRecords,
  listAcceptedCorpusEntityRecords,
  listAcceptedCorpusRevisionRecords,
  listAcceptedNavigationRelationshipRecords,
  listAcceptedNavigationRelationshipRevisionRecords,
  listAcceptedOpenAnswerCheckEntityRecords,
  listAcceptedOpenAnswerCheckRevisionRecords,
  listAcceptedQuickCheckEntityRecords,
  listAcceptedQuickCheckRevisionRecords,
  listAcceptedReadinessCheckEntityRecords,
  listAcceptedReadinessCheckRevisionRecords,
  listAssessmentCriterionCandidateRecords,
  listCorpusCandidateRecords,
  listCorpusEventRecords,
  listLearnerEvidenceTargetLinkRecords,
  listLocalPasswordCredentials,
  listOpenAnswerEvaluationRecords,
  listOpenAnswerEvaluationFailureRecords,
  listOpenAnswerAttemptRecords,
  listOpenAnswerCheckCandidateRecords,
  listOpenAnswerEvaluatorEvidenceRecords,
  listOpenAnswerEvaluatorRunRecords,
  listProgramMembershipRecords,
  listProgramSourceRecords,
  listQuickCheckAttemptRecords,
  listQuickCheckCandidateRecords,
  listReadinessCheckAttemptRecords,
  openIdentityDatabase,
  restoreIdentityBackup,
  updateAcceptedAssessmentCriterionEntityCurrentRevision,
  updateAcceptedOpenAnswerCheckEntityCurrentRevision,
  updateAcceptedQuickCheckEntityCurrentRevision,
  updateOpenAnswerAttemptStatus,
  updateOpenAnswerEvaluatorJobLease,
  updateOpenAnswerEvaluatorRunStatus,
} from "../src/storage.js";

const { createStudentWorkspaceCommands } = studentWorkspace;

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

test("submitQuickCheckAttempt_shouldPersistSelectedOptionAndMatchedResult_onEffectiveStudent", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });

    const result = commands.submitQuickCheckAttempt?.({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "quick-submit-a",
    });

    assert.deepEqual(
      {
        result,
        persisted: getQuickCheckAttemptRecord(database, "attempt-1"),
      },
      {
        result: {
          status: "accepted",
          value: {
            quickCheckAttempt: makeQuickCheckAttemptSummary({
              attemptId: "attempt-1",
              matched: true,
              selectedOptionId: "quick-check-revision-a-option-a",
            }),
          },
        },
        persisted: {
          id: "attempt-1",
          programId: "program-a",
          studentIdentityId: "identity-student",
          checkRevisionId: "quick-check-revision-a",
          selectedOptionId: "quick-check-revision-a-option-a",
          matched: true,
          idempotencyKey: "quick-submit-a",
          submittedAt: "2026-06-02T10:00:00.000Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("submitQuickCheckAttempt_shouldRejectInvalidAuthorizationRevisionOptionAndIdempotency", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });
    seedStudentProgramWithAcceptedQuickCheck(database, {
      programId: "program-b",
      quickCheckCandidateId: "quick-check-candidate-b",
      quickCheckEntityId: "quick-check-entity-b",
      quickCheckRevisionId: "quick-check-revision-b",
      sourceId: "source-b",
      membershipId: "membership-student-b",
    });
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));

    assert.deepEqual(
      {
        inactive: commands.submitQuickCheckAttempt?.({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
          checkRevisionId: "quick-check-revision-missing",
          selectedOptionId: "quick-check-revision-a-option-a",
          idempotencyKey: "quick-submit-a",
        }),
        unknownProgram: commands.submitQuickCheckAttempt?.({
          actingIdentityId: "identity-student",
          programId: "program-missing",
          checkRevisionId: "quick-check-revision-missing",
          selectedOptionId: "quick-check-revision-a-option-a",
          idempotencyKey: "quick-submit-a",
        }),
        nonStudent: commands.submitQuickCheckAttempt?.({
          actingIdentityId: "identity-active-other",
          programId: "program-a",
          checkRevisionId: "quick-check-revision-missing",
          selectedOptionId: "quick-check-revision-a-option-a",
          idempotencyKey: "quick-submit-a",
        }),
        unknownRevision: commands.submitQuickCheckAttempt?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "quick-check-revision-missing",
          selectedOptionId: "quick-check-revision-a-option-a",
          idempotencyKey: "quick-submit-a",
        }),
        candidateId: commands.submitQuickCheckAttempt?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "quick-check-candidate-a",
          selectedOptionId: "quick-check-revision-a-option-a",
          idempotencyKey: "quick-submit-a",
        }),
        crossProgramRevision: commands.submitQuickCheckAttempt?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "quick-check-revision-b",
          selectedOptionId: "quick-check-revision-b-option-a",
          idempotencyKey: "quick-submit-a",
        }),
        invalidOption: commands.submitQuickCheckAttempt?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "quick-check-revision-a",
          selectedOptionId: "quick-check-revision-b-option-a",
          idempotencyKey: "quick-submit-a",
        }),
        blankOption: commands.submitQuickCheckAttempt?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "quick-check-revision-a",
          selectedOptionId: " ",
          idempotencyKey: "quick-submit-a",
        }),
        blankIdempotencyKey: commands.submitQuickCheckAttempt?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "quick-check-revision-a",
          selectedOptionId: "quick-check-revision-a-option-a",
          idempotencyKey: " ",
        }),
      },
      {
        inactive: { status: "rejected", reason: "identity_not_active" },
        unknownProgram: { status: "rejected", reason: "program_not_found" },
        nonStudent: { status: "rejected", reason: "participation_required" },
        unknownRevision: { status: "rejected", reason: "quick_check_revision_not_found" },
        candidateId: { status: "rejected", reason: "quick_check_revision_not_found" },
        crossProgramRevision: { status: "rejected", reason: "quick_check_revision_program_mismatch" },
        invalidOption: { status: "rejected", reason: "selected_option_not_found" },
        blankOption: { status: "rejected", reason: "validation_failed" },
        blankIdempotencyKey: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("resolveAcceptedQuickCheckRevisionForEvaluation_shouldReturnAnswerKeyOnlyForMatchingAcceptedRevision", () => {
  const { database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });
    seedStudentProgramWithAcceptedQuickCheck(database, {
      programId: "program-b",
      quickCheckCandidateId: "quick-check-candidate-b",
      quickCheckEntityId: "quick-check-entity-b",
      quickCheckRevisionId: "quick-check-revision-b",
      sourceId: "source-b",
      membershipId: "membership-student-b",
    });

    assert.deepEqual(
      {
        accepted: studentWorkspace.resolveAcceptedQuickCheckRevisionForEvaluation({
          database,
          programId: "program-a",
          revisionId: "quick-check-revision-a",
        }),
        unknown: studentWorkspace.resolveAcceptedQuickCheckRevisionForEvaluation({
          database,
          programId: "program-a",
          revisionId: "quick-check-revision-missing",
        }),
        candidateId: studentWorkspace.resolveAcceptedQuickCheckRevisionForEvaluation({
          database,
          programId: "program-a",
          revisionId: "quick-check-candidate-a",
        }),
        crossProgram: studentWorkspace.resolveAcceptedQuickCheckRevisionForEvaluation({
          database,
          programId: "program-a",
          revisionId: "quick-check-revision-b",
        }),
      },
      {
        accepted: {
          status: "accepted",
          value: {
            acceptedQuickCheck: {
              entityId: "quick-check-entity-a",
              revisionId: "quick-check-revision-a",
              programId: "program-a",
              checkKind: "single_select_quick_check",
              options: [
                { optionId: "quick-check-revision-a-option-a", text: "Accepted option A" },
                { optionId: "quick-check-revision-a-option-b", text: "Accepted option B" },
              ],
              answerKeyOptionId: "quick-check-revision-a-option-a",
            },
          },
        },
        unknown: { status: "rejected", reason: "quick_check_revision_not_found" },
        candidateId: { status: "rejected", reason: "quick_check_revision_not_found" },
        crossProgram: { status: "rejected", reason: "quick_check_revision_program_mismatch" },
      },
    );
  } finally {
    database.close();
  }
});

test("submitQuickCheckAttempt_shouldReturnOriginalAttempt_onEquivalentRetryAndRejectConflict", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "attempt-2"] });

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });

    const first = commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "quick-submit-a",
    });
    const retry = commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "quick-submit-a",
    });

    assert.deepEqual(
      {
        retry,
        conflict: commands.submitQuickCheckAttempt({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "quick-check-revision-a",
          selectedOptionId: "quick-check-revision-a-option-b",
          idempotencyKey: "quick-submit-a",
        }),
        attemptIds: listQuickCheckAttemptRecords(database).map($0 => $0.id),
      },
      {
        retry: first,
        conflict: { status: "rejected", reason: "idempotency_conflict" },
        attemptIds: ["attempt-1"],
      },
    );
  } finally {
    database.close();
  }
});

test("submitQuickCheckAttempt_shouldCreateCorrectiveAttemptsWithoutMutatingPriorAttempts", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "attempt-2"] });

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });

    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-b",
      idempotencyKey: "quick-submit-a",
    });
    const firstBeforeCorrection = getQuickCheckAttemptRecord(database, "attempt-1");
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "quick-submit-b",
    });

    assert.deepEqual(
      {
        firstAfterCorrection: getQuickCheckAttemptRecord(database, "attempt-1"),
        attempts: listQuickCheckAttemptRecords(database).map($0 => ({
          id: $0.id,
          selectedOptionId: $0.selectedOptionId,
          matched: $0.matched,
        })),
      },
      {
        firstAfterCorrection: firstBeforeCorrection,
        attempts: [
          {
            id: "attempt-1",
            selectedOptionId: "quick-check-revision-a-option-b",
            matched: false,
          },
          {
            id: "attempt-2",
            selectedOptionId: "quick-check-revision-a-option-a",
            matched: true,
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("submitQuickCheckAttempt_shouldPreserveHistoricalAttemptResults_onLaterAcceptedRevision", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "attempt-2"] });

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "quick-submit-a",
    });
    const firstBeforeReplacement = getQuickCheckAttemptRecord(database, "attempt-1");
    createAcceptedQuickCheckRevisionRecord(
      database,
      makeAcceptedQuickCheckRevision({
        id: "quick-check-revision-b",
        entityId: "quick-check-entity-a",
        programId: "program-a",
        answerKeyOptionId: "quick-check-revision-b-option-b",
      }),
    );
    updateAcceptedQuickCheckEntityCurrentRevision(database, {
      entityId: "quick-check-entity-a",
      currentRevisionId: "quick-check-revision-b",
    });
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-b",
      selectedOptionId: "quick-check-revision-b-option-a",
      idempotencyKey: "quick-submit-b",
    });

    assert.deepEqual(
      {
        firstAfterReplacement: getQuickCheckAttemptRecord(database, "attempt-1"),
        attempts: listQuickCheckAttemptRecords(database).map($0 => ({
          id: $0.id,
          checkRevisionId: $0.checkRevisionId,
          selectedOptionId: $0.selectedOptionId,
          matched: $0.matched,
        })),
      },
      {
        firstAfterReplacement: firstBeforeReplacement,
        attempts: [
          {
            id: "attempt-1",
            checkRevisionId: "quick-check-revision-a",
            selectedOptionId: "quick-check-revision-a-option-a",
            matched: true,
          },
          {
            id: "attempt-2",
            checkRevisionId: "quick-check-revision-b",
            selectedOptionId: "quick-check-revision-b-option-a",
            matched: false,
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("submitQuickCheckAttempt_shouldNotExposeAnswerKeyOrIdempotencyKey_onAcceptedOrRejectedResults", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });

    const acceptedResult = commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "sensitive-quick-idempotency-key",
    });
    const rejectedResult = commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-b",
      idempotencyKey: "sensitive-quick-idempotency-key",
    });

    assert.deepEqual(containsForbiddenDetail([acceptedResult, rejectedResult]), false);
  } finally {
    database.close();
  }
});

test("submitQuickCheckAttempt_shouldOnlyMutateQuickCheckAttempts_onSubmission", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });
    seedStudentProgramWithAcceptedCheck(database, {
      programId: "program-a",
      sourceId: "open-answer-source-a",
    });
    seedProtectedIdentityState(database);
    const csrfTokens = new Map([["session-protected", "csrf-token-protected"]]);
    const boundaryBefore = projectQuickCheckAttemptBoundaryState(database, csrfTokens);

    const result = commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "quick-submit-a",
    });

    assert.deepEqual(
      {
        result,
        boundaryAfter: projectQuickCheckAttemptBoundaryState(database, csrfTokens),
        attemptIds: listQuickCheckAttemptRecords(database).map($0 => $0.id),
      },
      {
        result: {
          status: "accepted",
          value: {
            quickCheckAttempt: makeQuickCheckAttemptSummary({
              attemptId: "attempt-1",
              matched: true,
              selectedOptionId: "quick-check-revision-a-option-a",
            }),
          },
        },
        boundaryAfter: boundaryBefore,
        attemptIds: ["attempt-1"],
      },
    );
  } finally {
    database.close();
  }
});

test("getQuickCheckAttempt_shouldReturnOwnerAttemptWithoutSensitiveDetails", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "sensitive-quick-idempotency-key",
    });

    const result = commands.getQuickCheckAttempt?.({
      actingIdentityId: "identity-student",
      programId: "program-a",
      attemptId: "attempt-1",
    });

    assert.deepEqual(
      {
        result,
        redacted: containsForbiddenDetail([result]),
      },
      {
        result: {
          status: "accepted",
          value: {
            quickCheckAttempt: makeQuickCheckAttemptSummary({
              attemptId: "attempt-1",
              selectedOptionId: "quick-check-revision-a-option-a",
              matched: true,
            }),
          },
        },
        redacted: false,
      },
    );
  } finally {
    database.close();
  }
});

test("getQuickCheckAttempt_shouldRejectInactiveUnknownProgramNonStudentUnknownAndNonOwnerAttempts", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "quick-submit-a",
    });
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
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
        inactive: commands.getQuickCheckAttempt?.({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
          attemptId: "attempt-1",
        }),
        unknownProgram: commands.getQuickCheckAttempt?.({
          actingIdentityId: "identity-student",
          programId: "program-missing",
          attemptId: "attempt-1",
        }),
        nonStudent: commands.getQuickCheckAttempt?.({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          attemptId: "attempt-1",
        }),
        admin: commands.getQuickCheckAttempt?.({
          actingIdentityId: "identity-admin",
          programId: "program-a",
          attemptId: "attempt-1",
        }),
        otherActiveIdentity: commands.getQuickCheckAttempt?.({
          actingIdentityId: "identity-active-other",
          programId: "program-a",
          attemptId: "attempt-1",
        }),
        unknownAttempt: commands.getQuickCheckAttempt?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          attemptId: "attempt-missing",
        }),
        nonOwner: commands.getQuickCheckAttempt?.({
          actingIdentityId: "identity-student-2",
          programId: "program-a",
          attemptId: "attempt-1",
        }),
      },
      {
        inactive: { status: "rejected", reason: "identity_not_active" },
        unknownProgram: { status: "rejected", reason: "program_not_found" },
        nonStudent: { status: "rejected", reason: "participation_required" },
        admin: { status: "rejected", reason: "participation_required" },
        otherActiveIdentity: { status: "rejected", reason: "participation_required" },
        unknownAttempt: { status: "rejected", reason: "attempt_not_found" },
        nonOwner: { status: "rejected", reason: "attempt_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("listQuickCheckAttempts_shouldReturnOnlyActingStudentAttemptsInProgram", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "attempt-2", "attempt-3"] });

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "quick-submit-a",
    });
    createIdentity(database, makeIdentity({ id: "identity-student-2" }));
    createProgramMembershipRecord(database, makeMembership({
      id: "membership-student-2-a",
      identityId: "identity-student-2",
      participationKind: "student",
      programId: "program-a",
    }));
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student-2",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-b",
      idempotencyKey: "quick-submit-b",
    });
    seedStudentProgramWithAcceptedQuickCheck(database, {
      programId: "program-b",
      quickCheckCandidateId: "quick-check-candidate-b",
      quickCheckEntityId: "quick-check-entity-b",
      quickCheckRevisionId: "quick-check-revision-b",
      sourceId: "quick-check-source-b",
      membershipId: "membership-student-b",
    });
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-b",
      checkRevisionId: "quick-check-revision-b",
      selectedOptionId: "quick-check-revision-b-option-a",
      idempotencyKey: "quick-submit-c",
    });

    assert.deepEqual(
      commands.listQuickCheckAttempts?.({
        actingIdentityId: "identity-student",
        programId: "program-a",
      }),
      {
        status: "accepted",
        value: {
          quickCheckAttempts: [
            makeQuickCheckAttemptSummary({
              attemptId: "attempt-1",
              selectedOptionId: "quick-check-revision-a-option-a",
              matched: true,
            }),
          ],
        },
      },
    );
  } finally {
    database.close();
  }
});

test("listQuickCheckAttempts_shouldApplyAcceptedRevisionFilterAfterOwnerScope", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "attempt-2", "attempt-3"] });

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "quick-submit-a",
    });
    seedStudentProgramWithAcceptedQuickCheck(database, {
      programId: "program-a",
      quickCheckCandidateId: "quick-check-candidate-b",
      quickCheckEntityId: "quick-check-entity-b",
      quickCheckRevisionId: "quick-check-revision-b",
      sourceId: "quick-check-source-b",
      membershipId: "membership-student-a-b",
    });
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-b",
      selectedOptionId: "quick-check-revision-b-option-b",
      idempotencyKey: "quick-submit-b",
    });
    createIdentity(database, makeIdentity({ id: "identity-student-2" }));
    createProgramMembershipRecord(database, makeMembership({
      id: "membership-student-2-a",
      identityId: "identity-student-2",
      participationKind: "student",
      programId: "program-a",
    }));
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student-2",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-b",
      selectedOptionId: "quick-check-revision-b-option-a",
      idempotencyKey: "quick-submit-c",
    });

    assert.deepEqual(
      commands.listQuickCheckAttempts?.({
        actingIdentityId: "identity-student",
        programId: "program-a",
        checkRevisionId: "quick-check-revision-b",
      }),
      {
        status: "accepted",
        value: {
          quickCheckAttempts: [
            makeQuickCheckAttemptSummary({
              attemptId: "attempt-2",
              checkRevisionId: "quick-check-revision-b",
              selectedOptionId: "quick-check-revision-b-option-b",
              matched: false,
            }),
          ],
        },
      },
    );
  } finally {
    database.close();
  }
});

test("listQuickCheckAttempts_shouldRejectInvalidRevisionFiltersAndNonStudentCalls", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });
    seedStudentProgramWithAcceptedQuickCheck(database, {
      programId: "program-b",
      quickCheckCandidateId: "quick-check-candidate-b",
      quickCheckEntityId: "quick-check-entity-b",
      quickCheckRevisionId: "quick-check-revision-b",
      sourceId: "quick-check-source-b",
      membershipId: "membership-student-b",
    });
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
    createProgramMembershipRecord(database, makeMembership({
      id: "membership-curator-a",
      identityId: "identity-curator",
      participationKind: "program_curator",
      programId: "program-a",
    }));

    assert.deepEqual(
      {
        inactive: commands.listQuickCheckAttempts?.({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
        }),
        unknownProgram: commands.listQuickCheckAttempts?.({
          actingIdentityId: "identity-student",
          programId: "program-missing",
        }),
        nonStudent: commands.listQuickCheckAttempts?.({
          actingIdentityId: "identity-curator",
          programId: "program-a",
        }),
        blankRevision: commands.listQuickCheckAttempts?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: " ",
        }),
        unknownRevision: commands.listQuickCheckAttempts?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "quick-check-revision-missing",
        }),
        candidateId: commands.listQuickCheckAttempts?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "quick-check-candidate-a",
        }),
        crossProgramRevision: commands.listQuickCheckAttempts?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          checkRevisionId: "quick-check-revision-b",
        }),
      },
      {
        inactive: { status: "rejected", reason: "identity_not_active" },
        unknownProgram: { status: "rejected", reason: "program_not_found" },
        nonStudent: { status: "rejected", reason: "participation_required" },
        blankRevision: { status: "rejected", reason: "validation_failed" },
        unknownRevision: { status: "rejected", reason: "quick_check_revision_not_found" },
        candidateId: { status: "rejected", reason: "quick_check_revision_not_found" },
        crossProgramRevision: { status: "rejected", reason: "quick_check_revision_program_mismatch" },
      },
    );
  } finally {
    database.close();
  }
});

test("quickCheckAttemptReadCommands_shouldNotExposeSensitiveOrOperationalDetails", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "sensitive-quick-idempotency-key",
    });

    const detail = commands.getQuickCheckAttempt?.({
      actingIdentityId: "identity-student",
      programId: "program-a",
      attemptId: "attempt-1",
    });
    const list = commands.listQuickCheckAttempts?.({
      actingIdentityId: "identity-student",
      programId: "program-a",
    });
    const rejected = commands.getQuickCheckAttempt?.({
      actingIdentityId: "identity-active-other",
      programId: "program-a",
      attemptId: "attempt-1",
    });

    assert.deepEqual(containsForbiddenDetail([detail, list, rejected]), false);
  } finally {
    database.close();
  }
});

test("containsForbiddenDetail_shouldDetectQuickCheckReadForbiddenDetails", () => {
  assert.deepEqual(
    containsForbiddenDetail([{
      answerKeyOptionId: "option-a",
      correctOptionId: "option-a",
      correctness: "per-option correctness metadata",
      isCorrect: true,
      rationale: "curator rationale",
      acceptedFromCandidateId: "quick-check-candidate-a",
      acceptedByIdentityId: "identity-curator",
      candidateId: "quick-check-candidate-a",
      createdByIdentityId: "identity-curator",
      idempotencyKey: "sensitive-quick-idempotency-key",
    }]),
    true,
  );
});

test("quickCheckFlows_shouldPreserveAdjacentDomainsAndAvoidOutOfScopeSurfaces", () => {
  const { commands, corpusCommands, database } = makeSUT({ ids: ["attempt-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, {
      programId: "program-a",
      sourceId: "open-answer-source-a",
    });
    createProgramMembershipRecord(database, makeMembership({
      id: "membership-curator-a",
      identityId: "identity-curator",
      participationKind: "program_curator",
      programId: "program-a",
    }));
    seedProtectedIdentityState(database);
    const csrfTokens = new Map([["session-protected", "csrf-token-protected"]]);
    const adjacentBefore = projectQuickCheckBoundaryIsolationState(database, csrfTokens);
    const deferredBefore = projectQuickCheckDeferredState(database);

    const candidate = corpusCommands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Boundary quick check",
      prompt: "Boundary prompt",
      options: ["Boundary A", "Boundary B"],
      answerKeyIndex: 0,
      rationale: "Curator-only boundary rationale",
    });
    const acceptedRevision = corpusCommands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "quick-check-candidate-command-a",
    });
    const acceptedQuickCheck = acceptedRevision.value.acceptedQuickCheck;
    const deliveries = corpusCommands.listQuickCheckDeliveries({
      actingIdentityId: "identity-student",
      programId: "program-a",
    });
    const delivery = corpusCommands.getQuickCheckDelivery({
      actingIdentityId: "identity-student",
      programId: "program-a",
      revisionId: acceptedQuickCheck.revisionId,
    });
    const submitted = commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: acceptedQuickCheck.revisionId,
      selectedOptionId: acceptedQuickCheck.options[0].optionId,
      idempotencyKey: "sensitive-quick-idempotency-key",
    });
    const read = commands.getQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      attemptId: "attempt-1",
    });
    const listed = commands.listQuickCheckAttempts({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: acceptedQuickCheck.revisionId,
    });
    const rejected = commands.getQuickCheckAttempt({
      actingIdentityId: "identity-active-other",
      programId: "program-a",
      attemptId: "attempt-1",
    });

    assert.deepEqual(
      {
        statuses: [
          candidate.status,
          acceptedRevision.status,
          deliveries.status,
          delivery.status,
          submitted.status,
          read.status,
          listed.status,
          rejected.status,
        ],
        adjacentAfter: projectQuickCheckBoundaryIsolationState(database, csrfTokens),
        deferredAfter: projectQuickCheckDeferredState(database),
        forbiddenStudentDetails: containsForbiddenDetail([deliveries, delivery, submitted, read, listed, rejected]),
        publicSurface: containsAnyQuickCheckPublicSurface({
          adminUiSource: readFileSync(new URL("../src/admin-ui.js", import.meta.url), "utf8"),
          cliSource: readFileSync(new URL("../src/cli.js", import.meta.url), "utf8"),
          serverSource: readFileSync(new URL("../src/server.js", import.meta.url), "utf8"),
        }),
        outOfScopeBehavior: containsAnyOutOfScopeStudentWorkspaceBehavior(
          [
            readFileSync(new URL("../src/corpus.js", import.meta.url), "utf8"),
            readFileSync(new URL("../src/student-workspace.js", import.meta.url), "utf8"),
          ].join("\n"),
        ),
        resolverSurface: containsInternalQuickCheckResolverSurface({
          commands,
          corpusCommands,
          adminUiSource: readFileSync(new URL("../src/admin-ui.js", import.meta.url), "utf8"),
          cliSource: readFileSync(new URL("../src/cli.js", import.meta.url), "utf8"),
          serverSource: readFileSync(new URL("../src/server.js", import.meta.url), "utf8"),
        }),
      },
      {
        statuses: [
          "accepted",
          "accepted",
          "accepted",
          "accepted",
          "accepted",
          "accepted",
          "accepted",
          "rejected",
        ],
        adjacentAfter: adjacentBefore,
        deferredAfter: deferredBefore,
        forbiddenStudentDetails: false,
        publicSurface: false,
        outOfScopeBehavior: false,
        resolverSurface: false,
      },
    );
  } finally {
    database.close();
  }
});

test("quickCheckExecutableAcceptance_shouldCoverFirstSliceEndToEnd", () => {
  const { commands, corpusCommands, database } = makeSUT({
    corpusIds: [
      "quick-check-candidate-acceptance-a",
      "quick-check-candidate-acceptance-a-option-a",
      "quick-check-candidate-acceptance-a-option-b",
      "quick-check-entity-acceptance-a",
      "quick-check-revision-acceptance-a",
      "quick-check-revision-acceptance-a-option-a",
      "quick-check-revision-acceptance-a-option-b",
      "quick-check-candidate-acceptance-b",
      "quick-check-candidate-acceptance-b-option-a",
      "quick-check-candidate-acceptance-b-option-b",
      "quick-check-revision-acceptance-b",
      "quick-check-revision-acceptance-b-option-a",
      "quick-check-revision-acceptance-b-option-b",
    ],
    ids: ["attempt-1", "attempt-2", "attempt-3"],
  });
  const restored = makeSUT({ ids: ["attempt-restored"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, {
      programId: "program-a",
      sourceId: "open-answer-source-a",
    });
    createProgramMembershipRecord(database, makeMembership({
      id: "membership-curator-a",
      identityId: "identity-curator",
      participationKind: "program_curator",
      programId: "program-a",
    }));
    seedProtectedIdentityState(database);
    const csrfTokens = new Map([["session-protected", "csrf-token-protected"]]);
    const adjacentBefore = projectQuickCheckBoundaryIsolationState(database, csrfTokens);
    const deferredBefore = projectQuickCheckDeferredState(database);

    const candidate = corpusCommands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Acceptance quick check",
      prompt: "Pick the invariant preserved by this slice.",
      options: ["Student evidence stays personal", "Answer keys are public"],
      answerKeyIndex: 0,
      sourceIds: ["open-answer-source-a"],
      rationale: "Curator-only acceptance rationale",
    });
    const accepted = corpusCommands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "quick-check-candidate-acceptance-a",
    });
    const acceptedQuickCheck = accepted.value.acceptedQuickCheck;
    const deliveries = corpusCommands.listQuickCheckDeliveries({
      actingIdentityId: "identity-student",
      programId: "program-a",
    });
    const delivery = corpusCommands.getQuickCheckDelivery({
      actingIdentityId: "identity-student",
      programId: "program-a",
      revisionId: acceptedQuickCheck.revisionId,
    });
    const matchingAttempt = commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: acceptedQuickCheck.revisionId,
      selectedOptionId: acceptedQuickCheck.options[0].optionId,
      idempotencyKey: "acceptance-matching",
    });
    const idempotentRetry = commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: acceptedQuickCheck.revisionId,
      selectedOptionId: acceptedQuickCheck.options[0].optionId,
      idempotencyKey: "acceptance-matching",
    });
    const correctiveAttempt = commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: acceptedQuickCheck.revisionId,
      selectedOptionId: acceptedQuickCheck.options[1].optionId,
      idempotencyKey: "acceptance-corrective",
    });
    const replacementCandidate = corpusCommands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Acceptance replacement quick check",
      prompt: "Pick the replacement invariant.",
      options: ["Historical attempts are rewritten", "Historical attempts stay linked"],
      answerKeyIndex: 1,
      sourceIds: ["open-answer-source-a"],
      rationale: "Curator-only replacement rationale",
    });
    const replacement = corpusCommands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "quick-check-candidate-acceptance-b",
      targetEntityId: acceptedQuickCheck.entityId,
    });
    const restoredBackup = exportIdentityBackup(database);
    restoreIdentityBackup(restored.database, restoredBackup);
    const restoredDelivery = restored.corpusCommands.getQuickCheckDelivery({
      actingIdentityId: "identity-student",
      programId: "program-a",
      revisionId: acceptedQuickCheck.revisionId,
    });
    const restoredRead = restored.commands.getQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      attemptId: "attempt-1",
    });
    const restoredRetry = restored.commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: acceptedQuickCheck.revisionId,
      selectedOptionId: acceptedQuickCheck.options[0].optionId,
      idempotencyKey: "acceptance-matching",
    });

    assert.deepEqual(
      {
        statuses: [
          candidate.status,
          accepted.status,
          deliveries.status,
          delivery.status,
          matchingAttempt.status,
          idempotentRetry.status,
          correctiveAttempt.status,
          replacementCandidate.status,
          replacement.status,
          restoredDelivery.status,
          restoredRead.status,
          restoredRetry.status,
        ],
        deliveryRevisionIds: deliveries.value.quickCheckDeliveries.map($0 => $0.revisionId),
        deliveryOptionIds: delivery.value.quickCheckDelivery.options.map($0 => $0.optionId),
        matchingAttempt: projectQuickCheckAttemptResult(matchingAttempt.value.quickCheckAttempt),
        idempotentRetry: projectQuickCheckAttemptResult(idempotentRetry.value.quickCheckAttempt),
        correctiveAttempt: projectQuickCheckAttemptResult(correctiveAttempt.value.quickCheckAttempt),
        replacementDeliveryRevisionIds: corpusCommands.listQuickCheckDeliveries({
          actingIdentityId: "identity-student",
          programId: "program-a",
        }).value.quickCheckDeliveries.map($0 => $0.revisionId),
        historicalAttempts: commands.listQuickCheckAttempts({
          actingIdentityId: "identity-student",
          programId: "program-a",
        }).value.quickCheckAttempts.map(projectQuickCheckAttemptResult),
        restoredRead: projectQuickCheckAttemptResult(restoredRead.value.quickCheckAttempt),
        restoredRetry: projectQuickCheckAttemptResult(restoredRetry.value.quickCheckAttempt),
        restoredAttemptRows: listQuickCheckAttemptRecords(restored.database).map($0 => $0.id),
        forbiddenStudentDetails: containsForbiddenDetail([
          deliveries,
          delivery,
          matchingAttempt,
          idempotentRetry,
          correctiveAttempt,
          restoredDelivery,
          restoredRead,
          restoredRetry,
        ]),
        adjacentAfter: projectQuickCheckBoundaryIsolationState(database, csrfTokens),
        deferredAfter: projectQuickCheckDeferredState(database),
        publicSurface: containsAnyQuickCheckPublicSurface({
          adminUiSource: readFileSync(new URL("../src/admin-ui.js", import.meta.url), "utf8"),
          cliSource: readFileSync(new URL("../src/cli.js", import.meta.url), "utf8"),
          serverSource: readFileSync(new URL("../src/server.js", import.meta.url), "utf8"),
        }),
        resolverSurface: containsInternalQuickCheckResolverSurface({
          commands,
          corpusCommands,
          adminUiSource: readFileSync(new URL("../src/admin-ui.js", import.meta.url), "utf8"),
          cliSource: readFileSync(new URL("../src/cli.js", import.meta.url), "utf8"),
          serverSource: readFileSync(new URL("../src/server.js", import.meta.url), "utf8"),
        }),
        outOfScopeBehavior: containsAnyOutOfScopeStudentWorkspaceBehavior(
          [
            readFileSync(new URL("../src/corpus.js", import.meta.url), "utf8"),
            readFileSync(new URL("../src/student-workspace.js", import.meta.url), "utf8"),
          ].join("\n"),
        ),
      },
      {
        statuses: [
          "accepted",
          "accepted",
          "accepted",
          "accepted",
          "accepted",
          "accepted",
          "accepted",
          "accepted",
          "accepted",
          "accepted",
          "accepted",
          "accepted",
        ],
        deliveryRevisionIds: ["quick-check-revision-acceptance-a"],
        deliveryOptionIds: [
          "quick-check-revision-acceptance-a-option-a",
          "quick-check-revision-acceptance-a-option-b",
        ],
        matchingAttempt: {
          attemptId: "attempt-1",
          checkRevisionId: "quick-check-revision-acceptance-a",
          selectedOptionId: "quick-check-revision-acceptance-a-option-a",
          matched: true,
        },
        idempotentRetry: {
          attemptId: "attempt-1",
          checkRevisionId: "quick-check-revision-acceptance-a",
          selectedOptionId: "quick-check-revision-acceptance-a-option-a",
          matched: true,
        },
        correctiveAttempt: {
          attemptId: "attempt-2",
          checkRevisionId: "quick-check-revision-acceptance-a",
          selectedOptionId: "quick-check-revision-acceptance-a-option-b",
          matched: false,
        },
        replacementDeliveryRevisionIds: ["quick-check-revision-acceptance-b"],
        historicalAttempts: [
          {
            attemptId: "attempt-1",
            checkRevisionId: "quick-check-revision-acceptance-a",
            selectedOptionId: "quick-check-revision-acceptance-a-option-a",
            matched: true,
          },
          {
            attemptId: "attempt-2",
            checkRevisionId: "quick-check-revision-acceptance-a",
            selectedOptionId: "quick-check-revision-acceptance-a-option-b",
            matched: false,
          },
        ],
        restoredRead: {
          attemptId: "attempt-1",
          checkRevisionId: "quick-check-revision-acceptance-a",
          selectedOptionId: "quick-check-revision-acceptance-a-option-a",
          matched: true,
        },
        restoredRetry: {
          attemptId: "attempt-1",
          checkRevisionId: "quick-check-revision-acceptance-a",
          selectedOptionId: "quick-check-revision-acceptance-a-option-a",
          matched: true,
        },
        restoredAttemptRows: ["attempt-1", "attempt-2"],
        forbiddenStudentDetails: false,
        adjacentAfter: adjacentBefore,
        deferredAfter: deferredBefore,
        publicSurface: false,
        resolverSurface: false,
        outOfScopeBehavior: false,
      },
    );
  } finally {
    database.close();
    restored.database.close();
  }
});

test("learnerStateSummary_shouldDeriveOwnerEvidenceWeakAreasAndTargetDetail", () => {
  const { commands, database } = makeSUT({
    ids: ["quick-negative", "quick-positive", "open-pending", "open-evaluated", "evaluation-1"],
    now: makeAdvancingClock("2026-06-02T10:00:00.000Z"),
  });

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });
    seedStudentProgramWithAcceptedCheck(database, {
      programId: "program-a",
      secondCriterionCandidateId: "criterion-candidate-b",
      secondCriterionEntityId: "criterion-entity-b",
      secondCriterionRevisionId: "criterion-revision-b",
    });
    seedLearnerStateNavigationGraph(database, { programId: "program-a" });
    createLearnerEvidenceTargetLinkRecord(database, {
      id: "target-link-material-quick",
      programId: "program-a",
      targetKind: "material_reference",
      targetId: "material-entity-a",
      evidenceOwnerKind: "accepted_quick_check",
      evidenceOwnerEntityId: "quick-check-entity-a",
      createdByIdentityId: "identity-curator",
      createdAt: "2026-06-02T09:35:00.000Z",
      updatedAt: "2026-06-02T09:35:00.000Z",
    });
    createLearnerEvidenceTargetLinkRecord(database, {
      id: "target-link-concept-criterion",
      programId: "program-a",
      targetKind: "concept",
      targetId: "concept-entity-a",
      evidenceOwnerKind: "accepted_assessment_criterion",
      evidenceOwnerEntityId: "criterion-entity-a",
      createdByIdentityId: "identity-curator",
      createdAt: "2026-06-02T09:36:00.000Z",
      updatedAt: "2026-06-02T09:36:00.000Z",
    });
    createLearnerEvidenceTargetLinkRecord(database, {
      id: "target-link-deleted-unused-concept",
      programId: "program-a",
      targetKind: "concept",
      targetId: "concept-entity-unused",
      evidenceOwnerKind: "accepted_quick_check",
      evidenceOwnerEntityId: "quick-check-entity-a",
      createdByIdentityId: "identity-curator",
      createdAt: "2026-06-02T09:37:00.000Z",
      updatedAt: "2026-06-02T09:37:00.000Z",
    });
    deleteLearnerEvidenceTargetLinkRecord(database, {
      id: "target-link-deleted-unused-concept",
      updatedAt: "2026-06-02T09:38:00.000Z",
    });

    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-b",
      idempotencyKey: "quick-negative-key",
    });
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "quick-positive-key",
    });
    commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Pending explanation",
      idempotencyKey: "open-pending-key",
    });
    const evaluatedAttempt = commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Evaluated explanation",
      idempotencyKey: "open-evaluated-key",
    }).value.attempt;
    commands.recordOpenAnswerEvaluation({
      attemptId: evaluatedAttempt.attemptId,
      evaluatorKind: "student_workspace",
      summaryFeedback: "The answer misses the central invariant.",
      criterionFeedback: [
        makeCriterionFeedback({
          criterionRevisionId: "criterion-revision-a",
          outcome: "missing",
          feedback: "Missing invariant.",
        }),
        makeCriterionFeedback({
          criterionRevisionId: "criterion-revision-b",
          outcome: "unclear",
          feedback: "Partially explains terminology.",
        }),
      ],
    });

    const summary = commands.getLearnerStateProgramSummary({
      actingIdentityId: "identity-student",
      programId: "program-a",
    });
    const materialDetail = commands.getLearnerStateTargetDetail({
      actingIdentityId: "identity-student",
      targetKind: "material_reference",
      targetId: "material-entity-a",
    });
    const topicDetail = commands.getLearnerStateTargetDetail({
      actingIdentityId: "identity-student",
      targetKind: "topic",
      targetId: "topic-entity-a",
    });

    assert.deepEqual(
      {
        summary: projectLearnerStateSummary(summary),
        materialDetail: projectLearnerStateTargetDetail(materialDetail),
        topicDetail: projectLearnerStateTargetDetail(topicDetail),
        forbiddenDetails: containsForbiddenDetail([summary, materialDetail, topicDetail]),
      },
      {
        summary: {
          status: "accepted",
          level: "needs_attention",
          totals: {
            targets: 8,
            onTrack: 2,
            developing: 1,
            needsAttention: 4,
            inProgress: 0,
            noEvidence: 1,
          },
          weakAreas: [
            ["open_answer_check", "check-entity-a", "needs_attention"],
            ["assessment_criterion", "criterion-entity-a", "needs_attention"],
            ["concept", "concept-entity-a", "needs_attention"],
            ["topic", "topic-entity-a", "needs_attention"],
          ],
          topics: [["topic-entity-a", "needs_attention", 1]],
          concepts: [
            ["concept-entity-unused", "no_evidence", 0],
            ["concept-entity-a", "needs_attention", 1],
          ],
          materialReferences: [["material-entity-a", "on_track", 2]],
          checks: [
            ["open_answer_check", "check-entity-a", "needs_attention", 2],
            ["quick_check", "quick-check-entity-a", "on_track", 2],
          ],
          criteria: [
            ["criterion-entity-a", "needs_attention", 1],
            ["criterion-entity-b", "developing", 1],
          ],
        },
        materialDetail: {
          status: "accepted",
          target: ["material_reference", "material-entity-a", "on_track", 2],
          evidenceSignals: ["positive", "negative"],
          evidenceKinds: ["quick_check_attempt", "quick_check_attempt"],
        },
        topicDetail: {
          status: "accepted",
          target: ["topic", "topic-entity-a", "needs_attention", 1],
          evidenceSignals: ["negative"],
          evidenceKinds: ["open_answer_criterion_feedback"],
        },
        forbiddenDetails: false,
      },
    );
  } finally {
    database.close();
  }
});

test("learnerStateTargetDetail_shouldMapPendingAttemptStatesAndEvaluatorEvidence", () => {
  const { commands, database } = makeSUT({
    ids: ["submitted-attempt", "evaluating-attempt", "evaluator-run-1", "evidence-1", "failed-attempt"],
    now: makeAdvancingClock("2026-06-02T10:20:00.000Z"),
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Submitted answer",
      idempotencyKey: "submitted-key",
    });
    commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Evaluating answer",
      idempotencyKey: "evaluating-key",
    });
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "evaluating-attempt",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });
    commands.recordOpenAnswerEvaluatorEvidence({
      evaluatorRunId: "evaluator-run-1",
      evidenceKind: "retrieval_trace",
      redactedSummary: "Relevant rubric sentence.",
    });
    commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Failed answer",
      idempotencyKey: "failed-key",
    });
    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "failed-attempt",
      reason: "temporary evaluator outage",
    });

    const detail = commands.getLearnerStateTargetDetail({
      actingIdentityId: "identity-student",
      targetKind: "open_answer_check",
      targetId: "check-entity-a",
    });

    assert.deepEqual(projectLearnerStateTargetDetail(detail), {
      status: "accepted",
      target: ["open_answer_check", "check-entity-a", "in_progress", 4],
      evidenceSignals: ["pending", "pending", "pending", "pending"],
      evidenceKinds: [
        "open_answer_attempt",
        "open_answer_evaluator_evidence",
        "open_answer_attempt",
        "open_answer_attempt",
      ],
    });
  } finally {
    database.close();
  }
});

test("learnerStateTargetDetail_shouldMapPartiallyMetCriterionToDeveloping", () => {
  const { commands, database } = makeSUT({
    ids: ["partial-attempt", "partial-evaluation"],
    now: makeAdvancingClock("2026-06-02T10:30:00.000Z"),
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    const attempt = commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Partially complete answer",
      idempotencyKey: "partial-key",
    }).value.attempt;
    commands.recordOpenAnswerEvaluation({
      attemptId: attempt.attemptId,
      evaluatorKind: "student_workspace",
      summaryFeedback: "The answer partially addresses the criterion.",
      criterionFeedback: [
        makeCriterionFeedback({
          outcome: "partially_met",
          feedback: "Names the idea but omits the consequence.",
        }),
      ],
    });

    const detail = commands.getLearnerStateTargetDetail({
      actingIdentityId: "identity-student",
      targetKind: "assessment_criterion",
      targetId: "criterion-entity-a",
    });

    assert.deepEqual(projectLearnerStateTargetDetail(detail), {
      status: "accepted",
      target: ["assessment_criterion", "criterion-entity-a", "developing", 1],
      evidenceSignals: ["partial"],
      evidenceKinds: ["open_answer_criterion_feedback"],
    });
  } finally {
    database.close();
  }
});

test("learnerStateReads_shouldRejectUnauthorizedActorsAndPreserveStorageState", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });
    seedLearnerStateNavigationGraph(database, { programId: "program-a" });
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
    createIdentityIfMissing(database, "identity-curator");
    createProgramMembershipRecord(database, makeMembership({
      id: "membership-curator-a",
      identityId: "identity-curator",
      participationKind: "program_curator",
      programId: "program-a",
    }));
    createProgramShellIfMissing(database, "program-b");
    createProgramMembershipRecord(database, makeMembership({
      id: "membership-other-program",
      identityId: "identity-active-other",
      participationKind: "student",
      programId: "program-b",
    }));
    const before = projectLearnerStateReadBoundary(database);

    const acceptedSummary = commands.getLearnerStateProgramSummary({
      actingIdentityId: "identity-student",
      programId: "program-a",
    });
    const acceptedDetail = commands.getLearnerStateTargetDetail({
      actingIdentityId: "identity-student",
      targetKind: "topic",
      targetId: "topic-entity-a",
    });

    assert.deepEqual(
      {
        accepted: [acceptedSummary.status, acceptedDetail.status],
        disabled: commands.getLearnerStateProgramSummary({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
        }),
        curator: commands.getLearnerStateProgramSummary({
          actingIdentityId: "identity-curator",
          programId: "program-a",
        }),
        outsideStudent: commands.getLearnerStateProgramSummary({
          actingIdentityId: "identity-active-other",
          programId: "program-a",
        }),
        unknownProgram: commands.getLearnerStateProgramSummary({
          actingIdentityId: "identity-student",
          programId: "program-missing",
        }),
        unsupportedTarget: commands.getLearnerStateTargetDetail({
          actingIdentityId: "identity-student",
          targetKind: "definition",
          targetId: "definition-entity-a",
        }),
        missingTarget: commands.getLearnerStateTargetDetail({
          actingIdentityId: "identity-student",
          targetKind: "topic",
          targetId: "target-missing",
        }),
        after: projectLearnerStateReadBoundary(database),
      },
      {
        accepted: ["accepted", "accepted"],
        disabled: { status: "rejected", reason: "identity_not_active" },
        curator: { status: "rejected", reason: "participation_required" },
        outsideStudent: { status: "rejected", reason: "participation_required" },
        unknownProgram: { status: "rejected", reason: "program_not_found" },
        unsupportedTarget: { status: "rejected", reason: "learner_state_target_not_found" },
        missingTarget: { status: "rejected", reason: "learner_state_target_not_found" },
        after: before,
      },
    );
  } finally {
    database.close();
  }
});

test("learnerStateReads_shouldOmitWithdrawnForwardTargets_status", () => {
  const { commands, database } = makeSUT();

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    seedLearnerStateNavigationGraph(database, { programId: "program-a" });
    database
      .prepare("update accepted_corpus_entities set status = 'withdrawn' where id in (?, ?)")
      .run("concept-entity-unused", "material-entity-a");
    database
      .prepare("update accepted_quick_check_entities set status = 'withdrawn' where id = ?")
      .run("quick-check-entity-a");
    database
      .prepare("update accepted_open_answer_check_entities set status = 'withdrawn' where id = ?")
      .run("check-entity-a");
    database
      .prepare("update accepted_assessment_criterion_entities set status = 'withdrawn' where id = ?")
      .run("criterion-entity-a");

    const summary = projectLearnerStateSummary(commands.getLearnerStateProgramSummary({
      actingIdentityId: "identity-student",
      programId: "program-a",
    }));

    assert.deepEqual(
      {
        concepts: summary.concepts.map($0 => $0[0]),
        materialReferences: summary.materialReferences.map($0 => $0[0]),
        checks: summary.checks.map($0 => [$0[0], $0[1]]),
        criteria: summary.criteria.map($0 => $0[0]),
        withdrawnDetail: commands.getLearnerStateTargetDetail({
          actingIdentityId: "identity-student",
          targetKind: "material_reference",
          targetId: "material-entity-a",
        }),
      },
      {
        concepts: ["concept-entity-a"],
        materialReferences: [],
        checks: [],
        criteria: [],
        withdrawnDetail: { status: "rejected", reason: "learner_state_target_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("learnerStateReads_shouldNotRollUpEvidenceAcrossWithdrawnNavigationRelationships_status", () => {
  const { commands, database } = makeSUT({
    ids: ["open-evaluated", "evaluation-1"],
    now: makeAdvancingClock("2026-06-02T10:00:00.000Z"),
  });

  try {
    seedStudentProgramWithAcceptedQuickCheck(database, { programId: "program-a" });
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    seedLearnerStateNavigationGraph(database, { programId: "program-a" });
    database
      .prepare("update accepted_navigation_relationships set status = 'withdrawn' where id = ?")
      .run("relationship-topic-concept");
    createLearnerEvidenceTargetLinkRecord(database, {
      id: "target-link-concept-criterion",
      programId: "program-a",
      targetKind: "concept",
      targetId: "concept-entity-a",
      evidenceOwnerKind: "accepted_assessment_criterion",
      evidenceOwnerEntityId: "criterion-entity-a",
      createdByIdentityId: "identity-curator",
      createdAt: "2026-06-02T09:36:00.000Z",
      updatedAt: "2026-06-02T09:36:00.000Z",
    });
    const evaluatedAttempt = commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Evaluated explanation",
      idempotencyKey: "open-evaluated-key",
    }).value.attempt;
    commands.recordOpenAnswerEvaluation({
      attemptId: evaluatedAttempt.attemptId,
      evaluatorKind: "student_workspace",
      summaryFeedback: "The answer misses the central invariant.",
      criterionFeedback: [
        makeCriterionFeedback({
          criterionRevisionId: "criterion-revision-a",
          outcome: "missing",
          feedback: "Missing invariant.",
        }),
      ],
    });

    const summary = projectLearnerStateSummary(commands.getLearnerStateProgramSummary({
      actingIdentityId: "identity-student",
      programId: "program-a",
    }));

    assert.deepEqual(
      {
        topics: summary.topics,
        concepts: summary.concepts,
      },
      {
        topics: [["topic-entity-a", "no_evidence", 0]],
        concepts: [
          ["concept-entity-unused", "no_evidence", 0],
          ["concept-entity-a", "needs_attention", 1],
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("readinessAttempts_shouldDeriveResultSnapshotAndPreserveHistory_onExplicitSubmission", () => {
  const { commands, database } = makeSUT({
    ids: [
      "quick-negative",
      "open-partial",
      "partial-evaluation",
      "readiness-attempt-1",
      "quick-positive",
      "readiness-attempt-2",
    ],
    now: makeAdvancingClock("2026-06-02T11:00:00.000Z"),
  });

  try {
    seedReadinessStudentProgram(database, { programId: "program-a" });
    createLearnerEvidenceTargetLinkRecord(database, {
      id: "readiness-link-concept-criterion",
      programId: "program-a",
      targetKind: "concept",
      targetId: "concept-entity-a",
      evidenceOwnerKind: "accepted_assessment_criterion",
      evidenceOwnerEntityId: "criterion-entity-a",
      createdByIdentityId: "identity-curator",
      createdAt: "2026-06-02T10:45:00.000Z",
      updatedAt: "2026-06-02T10:45:00.000Z",
    });
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-b",
      idempotencyKey: "quick-negative-key",
    });
    const partialAttempt = commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Partial explanation",
      idempotencyKey: "open-partial-key",
    }).value.attempt;
    commands.recordOpenAnswerEvaluation({
      attemptId: partialAttempt.attemptId,
      evaluatorKind: "student_workspace",
      summaryFeedback: "The answer partially addresses the concept.",
      criterionFeedback: [
        makeCriterionFeedback({
          outcome: "partially_met",
          feedback: "Names the idea but misses the consequence.",
        }),
      ],
    });

    const deliveries = commands.listReadinessCheckDeliveries?.({
      actingIdentityId: "identity-student",
      programId: "program-a",
    });
    const firstAttempt = commands.submitReadinessCheckAttempt?.({
      actingIdentityId: "identity-student",
      programId: "program-a",
      readinessCheckRevisionId: "readiness-revision-a",
      idempotencyKey: "readiness-key-a",
    });
    const replay = commands.submitReadinessCheckAttempt?.({
      actingIdentityId: "identity-student",
      programId: "program-a",
      readinessCheckRevisionId: "readiness-revision-a",
      idempotencyKey: "readiness-key-a",
    });
    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "quick-positive-key",
    });
    const secondAttempt = commands.submitReadinessCheckAttempt?.({
      actingIdentityId: "identity-student",
      programId: "program-a",
      readinessCheckRevisionId: "readiness-revision-a",
      idempotencyKey: "readiness-key-b",
    });

    assert.deepEqual(
      {
        deliveries: projectReadinessDeliveries(deliveries),
        firstAttempt: projectReadinessAttempt(firstAttempt),
        replay: projectReadinessAttempt(replay),
        secondAttempt: projectReadinessAttempt(secondAttempt),
        historicalDetail: projectReadinessAttempt(commands.getReadinessCheckAttempt?.({
          actingIdentityId: "identity-student",
          attemptId: firstAttempt.value.readinessCheckAttempt.attemptId,
        })),
        storedAttempts: listReadinessCheckAttemptRecords(database).map($0 => $0.result),
        forbiddenDetails: containsForbiddenDetail([deliveries, firstAttempt, secondAttempt]),
      },
      {
        deliveries: {
          status: "accepted",
          readinessChecks: [
            {
              entityId: "readiness-entity-a",
              revisionId: "readiness-revision-a",
              title: "Topic readiness",
              scopeKind: "topic",
              requirementTargets: [
                ["quick_check", "quick-check-entity-a", "on_track"],
                ["concept", "concept-entity-a", "developing"],
              ],
            },
          ],
        },
        firstAttempt: {
          status: "accepted",
          result: "not_ready",
          requirementResults: [
            ["quick_check", "quick-check-entity-a", "needs_attention", "not_ready"],
            ["concept", "concept-entity-a", "developing", "ready"],
          ],
        },
        replay: {
          status: "accepted",
          result: "not_ready",
          requirementResults: [
            ["quick_check", "quick-check-entity-a", "needs_attention", "not_ready"],
            ["concept", "concept-entity-a", "developing", "ready"],
          ],
        },
        secondAttempt: {
          status: "accepted",
          result: "ready",
          requirementResults: [
            ["quick_check", "quick-check-entity-a", "on_track", "ready"],
            ["concept", "concept-entity-a", "developing", "ready"],
          ],
        },
        historicalDetail: {
          status: "accepted",
          result: "not_ready",
          requirementResults: [
            ["quick_check", "quick-check-entity-a", "needs_attention", "not_ready"],
            ["concept", "concept-entity-a", "developing", "ready"],
          ],
        },
        storedAttempts: ["not_ready", "ready"],
        forbiddenDetails: false,
      },
    );
  } finally {
    database.close();
  }
});

test("readinessAttempts_shouldSupportInProgressIdempotencyConflictOwnerOnlyReadsAndPrivateDenials", () => {
  const { commands, database } = makeSUT({
    ids: ["pending-open-attempt", "readiness-attempt-1", "pending-evaluation"],
    now: makeAdvancingClock("2026-06-02T11:30:00.000Z"),
  });

  try {
    seedReadinessStudentProgram(database, { includeConceptReadiness: true, programId: "program-a" });
    createLearnerEvidenceTargetLinkRecord(database, {
      id: "readiness-link-concept-criterion",
      programId: "program-a",
      targetKind: "concept",
      targetId: "concept-entity-a",
      evidenceOwnerKind: "accepted_open_answer_check",
      evidenceOwnerEntityId: "check-entity-a",
      createdByIdentityId: "identity-curator",
      createdAt: "2026-06-02T11:20:00.000Z",
      updatedAt: "2026-06-02T11:20:00.000Z",
    });
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
    createIdentityIfMissing(database, "identity-curator");
    createProgramMembershipRecord(database, makeMembership({
      id: "membership-curator-a",
      identityId: "identity-curator",
      participationKind: "program_curator",
      programId: "program-a",
    }));
    createProgramShellIfMissing(database, "program-b");
    createProgramMembershipRecord(database, makeMembership({
      id: "membership-other-program",
      identityId: "identity-active-other",
      participationKind: "student",
      programId: "program-b",
    }));
    commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Pending answer",
      idempotencyKey: "pending-open-key",
    });
    const acceptedAttempt = commands.submitReadinessCheckAttempt?.({
      actingIdentityId: "identity-student",
      programId: "program-a",
      readinessCheckRevisionId: "readiness-revision-concept",
      idempotencyKey: "readiness-key-a",
    });
    commands.recordOpenAnswerEvaluation({
      attemptId: "pending-open-attempt",
      evaluatorKind: "student_workspace",
      summaryFeedback: "The answer partially addresses the concept.",
      criterionFeedback: [
        makeCriterionFeedback({
          outcome: "partially_met",
          feedback: "Partial answer.",
        }),
      ],
    });

    assert.deepEqual(
      {
        acceptedAttempt: projectReadinessAttempt(acceptedAttempt),
        listOwner: projectReadinessAttemptList(commands.listReadinessCheckAttempts?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
        })),
        listRevision: projectReadinessAttemptList(commands.listReadinessCheckAttempts?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          readinessCheckRevisionId: "readiness-revision-concept",
        })),
        conflict: commands.submitReadinessCheckAttempt?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          readinessCheckRevisionId: "readiness-revision-concept",
          idempotencyKey: "readiness-key-a",
        }),
        disabled: commands.listReadinessCheckDeliveries?.({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
        }),
        curatorList: commands.listReadinessCheckAttempts?.({
          actingIdentityId: "identity-curator",
          programId: "program-a",
        }),
        outsideStudentList: commands.listReadinessCheckAttempts?.({
          actingIdentityId: "identity-active-other",
          programId: "program-a",
        }),
        unknownProgram: commands.listReadinessCheckDeliveries?.({
          actingIdentityId: "identity-student",
          programId: "program-missing",
        }),
        unknownRevision: commands.submitReadinessCheckAttempt?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          readinessCheckRevisionId: "readiness-revision-missing",
          idempotencyKey: "readiness-key-missing",
        }),
        otherStudentDetail: commands.getReadinessCheckAttempt?.({
          actingIdentityId: "identity-active-other",
          attemptId: acceptedAttempt.value.readinessCheckAttempt.attemptId,
        }),
        unknownAttempt: commands.getReadinessCheckAttempt?.({
          actingIdentityId: "identity-student",
          attemptId: "readiness-attempt-missing",
        }),
      },
      {
        acceptedAttempt: {
          status: "accepted",
          result: "in_progress",
          requirementResults: [
            ["concept", "concept-entity-a", "in_progress", "in_progress"],
          ],
        },
        listOwner: {
          status: "accepted",
          attempts: [["readiness-attempt-1", "in_progress"]],
        },
        listRevision: {
          status: "accepted",
          attempts: [["readiness-attempt-1", "in_progress"]],
        },
        conflict: { status: "rejected", reason: "idempotency_conflict" },
        disabled: { status: "rejected", reason: "identity_not_active" },
        curatorList: { status: "rejected", reason: "participation_required" },
        outsideStudentList: { status: "rejected", reason: "participation_required" },
        unknownProgram: { status: "rejected", reason: "program_not_found" },
        unknownRevision: { status: "rejected", reason: "readiness_revision_not_found" },
        otherStudentDetail: { status: "rejected", reason: "attempt_not_found" },
        unknownAttempt: { status: "rejected", reason: "attempt_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("getReadinessCheckAttempt_shouldRequireActiveStudentParticipation_onOwnerDetailRead", () => {
  const { commands, database } = makeSUT({
    ids: ["readiness-attempt-1"],
  });

  try {
    seedReadinessStudentProgram(database, { includeConceptReadiness: true, programId: "program-a" });
    const acceptedAttempt = commands.submitReadinessCheckAttempt?.({
      actingIdentityId: "identity-student",
      programId: "program-a",
      readinessCheckRevisionId: "readiness-revision-concept",
      idempotencyKey: "readiness-key-a",
    });

    database
      .prepare("update program_memberships set status = 'removed', updated_at = ? where id = ?")
      .run("2026-06-02T11:45:00.000Z", "membership-student-a");

    assert.deepEqual(
      commands.getReadinessCheckAttempt?.({
        actingIdentityId: "identity-student",
        attemptId: acceptedAttempt.value.readinessCheckAttempt.attemptId,
      }),
      { status: "rejected", reason: "participation_required" },
    );
  } finally {
    database.close();
  }
});

test("readinessReadsAndLearnerStateReads_shouldNotImplicitlyCreateAttemptsOrMutateAdjacentState", () => {
  const { commands, database } = makeSUT({ ids: ["quick-attempt", "open-attempt"] });

  try {
    seedReadinessStudentProgram(database, { programId: "program-a" });
    const before = projectReadinessBoundary(database);

    commands.submitQuickCheckAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "quick-check-revision-a",
      selectedOptionId: "quick-check-revision-a-option-a",
      idempotencyKey: "quick-key",
    });
    commands.submitOpenAnswerAttempt({
      actingIdentityId: "identity-student",
      programId: "program-a",
      checkRevisionId: "check-revision-a",
      submittedAnswer: "Open answer",
      idempotencyKey: "open-key",
    });
    commands.getLearnerStateProgramSummary({
      actingIdentityId: "identity-student",
      programId: "program-a",
    });
    commands.listReadinessCheckDeliveries?.({
      actingIdentityId: "identity-student",
      programId: "program-a",
    });

    assert.deepEqual(
      {
        beforeReadinessAttempts: before.readinessCheckAttempts,
        after: projectReadinessBoundary(database),
      },
      {
        beforeReadinessAttempts: [],
        after: {
          ...before,
          quickCheckAttemptCount: 1,
          openAnswerAttemptCount: 1,
        },
      },
    );
  } finally {
    database.close();
  }
});

test("containsAnyOutOfScopeStudentWorkspaceBehavior_shouldDetectDeferredQuickCheckStateSurfaces", () => {
  assert.deepEqual(
    [
      "mastery",
      "weak_area",
      "student_progress",
      "review_scheduling",
      "next_step",
      "topic_readiness",
      "period_readiness",
      "grading",
      "analytics",
      "reporting",
      "provider_sdk",
      "durable_queue",
      "human_review_queue",
    ].map(containsAnyOutOfScopeStudentWorkspaceBehavior),
    Array.from({ length: 13 }, () => true),
  );
});

test("quickCheckBoundarySurfaceDetectors_shouldDetectPublicAndResolverLeaks", () => {
  const { commands, corpusCommands, database } = makeSUT();

  try {
    assert.deepEqual(
      {
        publicSurfaces: [
          { serverSource: "POST /quick-check-worker/jobs" },
          { cliSource: "submitQuickCheckAttempt" },
          { adminUiSource: "quick_check_dashboard" },
        ].map(source =>
          containsAnyQuickCheckPublicSurface({
            adminUiSource: "",
            cliSource: "",
            serverSource: "",
            ...source,
          }),
        ),
        resolverSurfaces: [
          { serverSource: "resolveAcceptedQuickCheckRevisionForEvaluation" },
          { cliSource: "resolveAcceptedQuickCheckRevisionForEvaluation" },
          {
            commands: {
              ...commands,
              resolveAcceptedQuickCheckRevisionForEvaluation: () => undefined,
            },
          },
        ].map(surface =>
          containsInternalQuickCheckResolverSurface({
            adminUiSource: "",
            cliSource: "",
            commands,
            corpusCommands,
            serverSource: "",
            ...surface,
          }),
        ),
      },
      {
        publicSurfaces: [true, true, true],
        resolverSurfaces: [true, true, true],
      },
    );
  } finally {
    database.close();
  }
});

test("containsAnyOutOfScopeStudentWorkspaceBehavior_shouldDetectProviderQueueAndHumanReviewSurfaces", () => {
  assert.deepEqual(
    [
      "provider_sdk",
      "external_provider",
      "durable_queue",
      "queue_state",
      "human_review_queue",
      "reviewer_queue",
      "review_assignment",
    ].map(containsAnyOutOfScopeStudentWorkspaceBehavior),
    Array.from({ length: 7 }, () => true),
  );
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

test("scheduleOpenAnswerEvaluatorJob_shouldCreateWaitingJobAndMoveSubmittedAttemptToEvaluating", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluator-run-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);

    const result = commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: " policy-a ",
      retryPolicy: { maxAttempts: 3, backoffSeconds: [60, 300] },
      budgetPolicy: { maxProviderCalls: 2 },
    });

    assert.deepEqual(
      {
        result,
        run: listOpenAnswerEvaluatorRunRecords(database)[0],
        job: projectEvaluatorJob(getOpenAnswerEvaluatorJobRecord(database, "evaluator-run-1")),
      },
      {
        result: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluating" }),
            evaluatorJob: makeEvaluatorJobSummary(),
          },
        },
        run: makeEvaluatorRunRecord(),
        job: makeEvaluatorJobSummary(),
      },
    );
  } finally {
    database.close();
  }
});

test("scheduleOpenAnswerEvaluatorJob_shouldSnapshotAndClearPreviousFailure_onFailedAttempt", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluator-run-1"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-1",
      reason: "temporary evaluator outage",
    });

    const result = commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });

    assert.deepEqual(
      {
        result,
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
        run: listOpenAnswerEvaluatorRunRecords(database)[0],
      },
      {
        result: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluating" }),
            evaluatorJob: makeEvaluatorJobSummary({
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
              budgetPolicy: null,
            }),
          },
        },
        failure: null,
        run: makeEvaluatorRunRecord({
          priorFailureReason: "temporary evaluator outage",
          priorFailedAt: "2026-06-02T10:00:00.000Z",
        }),
      },
    );
  } finally {
    database.close();
  }
});

test("scheduleOpenAnswerEvaluatorJob_shouldRejectUnknownEvaluatingAndEvaluatedAttempts", () => {
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
        unknown: commands.scheduleOpenAnswerEvaluatorJob({
          attemptId: "attempt-unknown",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
        }),
        evaluating: commands.scheduleOpenAnswerEvaluatorJob({
          attemptId: "attempt-2",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
        }),
        evaluated: commands.scheduleOpenAnswerEvaluatorJob({
          attemptId: "attempt-3",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
        }),
        jobs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        unknown: { status: "rejected", reason: "attempt_not_found" },
        evaluating: { status: "rejected", reason: "attempt_already_evaluating" },
        evaluated: { status: "rejected", reason: "attempt_already_evaluated" },
        jobs: [],
      },
    );
  } finally {
    database.close();
  }
});

test("scheduleOpenAnswerEvaluatorJob_shouldRejectMalformedPolicyInputsWithoutMutation", () => {
  const { commands, database } = makeSUT({ ids: ["attempt-1", "evaluator-run-1", "evaluator-run-2"] });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-1",
      reason: "temporary evaluator outage",
    });

    assert.deepEqual(
      {
        path: commands.scheduleOpenAnswerEvaluatorJob({
          attemptId: "attempt-1",
          evaluatorPathKind: "unsupported",
          evaluatorPolicyId: "policy-a",
          retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
        }),
        evaluatorPolicy: commands.scheduleOpenAnswerEvaluatorJob({
          attemptId: "attempt-1",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: " ",
          retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
        }),
        retryPolicy: commands.scheduleOpenAnswerEvaluatorJob({
          attemptId: "attempt-1",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          retryPolicy: { maxAttempts: 3, backoffSeconds: [60] },
        }),
        budgetPolicy: commands.scheduleOpenAnswerEvaluatorJob({
          attemptId: "attempt-1",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
          budgetPolicy: { maxProviderCalls: -1 },
        }),
        attempt: getOpenAnswerAttemptRecord(database, "attempt-1"),
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
        attempts: listOpenAnswerAttemptRecords(database, { programId: "program-a" }).map($0 => $0.id),
        jobs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        path: { status: "rejected", reason: "validation_failed" },
        evaluatorPolicy: { status: "rejected", reason: "validation_failed" },
        retryPolicy: { status: "rejected", reason: "validation_failed" },
        budgetPolicy: { status: "rejected", reason: "validation_failed" },
        attempt: makeAttemptRecord({ attemptId: "attempt-1", status: "evaluation_failed" }),
        failure: {
          attemptId: "attempt-1",
          reason: "temporary evaluator outage",
          failedAt: "2026-06-02T10:00:00.000Z",
        },
        attempts: ["attempt-1"],
        jobs: [],
      },
    );
  } finally {
    database.close();
  }
});

test("scheduleOpenAnswerEvaluatorJob_shouldValidateRequesterAndReviewerAttribution", () => {
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
        accepted: commands.scheduleOpenAnswerEvaluatorJob({
          attemptId: "attempt-1",
          evaluatorPathKind: "human_reviewed",
          evaluatorPolicyId: "policy-a",
          reviewerIdentityId: "identity-active-other",
          reviewerCapability: " assessment-reviewer ",
          retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
        }),
        unknownRequester: commands.scheduleOpenAnswerEvaluatorJob({
          attemptId: "attempt-2",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          requestedByIdentityId: "identity-unknown",
          retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
        }),
        inactiveReviewer: commands.scheduleOpenAnswerEvaluatorJob({
          attemptId: "attempt-2",
          evaluatorPathKind: "human_reviewed",
          evaluatorPolicyId: "policy-a",
          reviewerIdentityId: "identity-disabled",
          reviewerCapability: "assessment-reviewer",
          retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
        }),
        nonHumanReviewer: commands.scheduleOpenAnswerEvaluatorJob({
          attemptId: "attempt-2",
          evaluatorPathKind: "deterministic",
          evaluatorPolicyId: "policy-a",
          reviewerIdentityId: "identity-active-other",
          retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
        }),
        attempt: getOpenAnswerAttemptRecord(database, "attempt-2"),
        runs: listOpenAnswerEvaluatorRunRecords(database),
      },
      {
        accepted: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluating" }),
            evaluatorJob: makeEvaluatorJobSummary({
              evaluatorPathKind: "human_reviewed",
              retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
              budgetPolicy: null,
            }),
          },
        },
        unknownRequester: { status: "rejected", reason: "identity_not_active" },
        inactiveReviewer: { status: "rejected", reason: "identity_not_active" },
        nonHumanReviewer: { status: "rejected", reason: "validation_failed" },
        attempt: {
          ...makeAttemptRecord({ attemptId: "attempt-2", status: "submitted" }),
          idempotencyKey: "submit-b",
        },
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

test("claimOpenAnswerEvaluatorJob_shouldLeaseWaitingJobAndPreserveAttemptState", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    const acceptedBefore = projectAcceptedAssessmentState(database);

    const result = commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: " worker-a ",
      leaseDurationSeconds: 300,
    });

    assert.deepEqual(
      {
        result,
        attempt: getOpenAnswerAttemptRecord(database, "attempt-1"),
        acceptedAfter: projectAcceptedAssessmentState(database),
        job: projectEvaluatorJob(getOpenAnswerEvaluatorJobRecord(database, "evaluator-run-1")),
      },
      {
        result: {
          status: "accepted",
          value: {
            evaluatorJob: makeEvaluatorJobSummary({
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
              budgetPolicy: null,
              status: "leased",
              lease: makeEvaluatorLease(),
              updatedAt: "2026-06-02T10:00:00.000Z",
            }),
            lease: makeEvaluatorLease(),
          },
        },
        attempt: makeAttemptRecord({ attemptId: "attempt-1", status: "evaluating" }),
        acceptedAfter: acceptedBefore,
        job: makeEvaluatorJobSummary({
          retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
          budgetPolicy: null,
          status: "leased",
          lease: makeEvaluatorLease(),
          updatedAt: "2026-06-02T10:00:00.000Z",
        }),
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRejectMalformedClaimInputs", () => {
  const { commands, database } = makeSUT();

  try {
    assert.deepEqual(
      {
        missingWorker: commands.runOpenAnswerEvaluatorWorkerOnce({
          mode: "claim_next",
          leaseDurationSeconds: 300,
        }),
        emptyWorker: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: " ",
          mode: "claim_next",
          leaseDurationSeconds: 300,
        }),
        leaseDuration: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "claim_next",
          leaseDurationSeconds: 0,
        }),
        mode: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "unsupported",
          leaseDurationSeconds: 300,
        }),
        singleJobId: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: " ",
          leaseDurationSeconds: 300,
        }),
      },
      {
        missingWorker: { status: "rejected", reason: "validation_failed" },
        emptyWorker: { status: "rejected", reason: "validation_failed" },
        leaseDuration: { status: "rejected", reason: "validation_failed" },
        mode: { status: "rejected", reason: "validation_failed" },
        singleJobId: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldClaimOnlyRequestedSingleJob", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "evaluator-run-1", "evaluator-run-2", "lease-1", "evaluation-1"],
    evaluatorPolicies: [makeEvaluatorPolicy()],
    providerAdapters: [makeProviderAdapter()],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-2",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });

    assert.deepEqual(
      {
        result: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: " worker-a ",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-2",
          leaseDurationSeconds: 300,
        }),
        jobs: [
          projectEvaluatorJob(getOpenAnswerEvaluatorJobRecord(database, "evaluator-run-1")),
          projectEvaluatorJob(getOpenAnswerEvaluatorJobRecord(database, "evaluator-run-2")),
        ],
      },
      {
        result: {
          status: "accepted",
          value: {
            summary: makeEvaluatorWorkerSummary({
              mode: "single_job",
              evaluatorJobId: "evaluator-run-2",
              claimed: true,
              completed: true,
            }),
            evaluatorJob: makeEvaluatorJobSummary({
              evaluatorJobId: "evaluator-run-2",
              evaluatorRunId: "evaluator-run-2",
              attemptId: "attempt-2",
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
              budgetPolicy: null,
              status: "succeeded",
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-2",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        jobs: [
          makeEvaluatorJobSummary({
            retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
            budgetPolicy: null,
          }),
          makeEvaluatorJobSummary({
            evaluatorJobId: "evaluator-run-2",
            evaluatorRunId: "evaluator-run-2",
            attemptId: "attempt-2",
            retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
            budgetPolicy: null,
            status: "succeeded",
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldClaimFirstClaimableJob", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "evaluator-run-1", "evaluator-run-2", "lease-1", "evaluation-1"],
    evaluatorPolicies: [makeEvaluatorPolicy()],
    providerAdapters: [makeProviderAdapter()],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-2",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });

    assert.deepEqual(
      commands.runOpenAnswerEvaluatorWorkerOnce({
        workerId: "worker-a",
        mode: "claim_next",
        leaseDurationSeconds: 300,
      }),
      {
        status: "accepted",
        value: {
          summary: makeEvaluatorWorkerSummary({
            mode: "claim_next",
            evaluatorJobId: "evaluator-run-1",
            claimed: true,
            completed: true,
          }),
          evaluatorJob: makeEvaluatorJobSummary({
            retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
            budgetPolicy: null,
            status: "succeeded",
          }),
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

test("runOpenAnswerEvaluatorWorkerOnce_shouldReturnNoOpSummary_whenNoJobIsClaimable", () => {
  const { commands, database } = makeSUT();

  try {
    assert.deepEqual(
      commands.runOpenAnswerEvaluatorWorkerOnce({
        workerId: "worker-a",
        mode: "claim_next",
        leaseDurationSeconds: 300,
      }),
      {
        status: "accepted",
        value: {
          summary: makeEvaluatorWorkerSummary({ mode: "claim_next" }),
        },
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRejectMissingEvaluatorPolicy_afterClaim", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });

    assert.deepEqual(
      commands.runOpenAnswerEvaluatorWorkerOnce({
        workerId: "worker-a",
        mode: "single_job",
        evaluatorJobId: "evaluator-run-1",
        leaseDurationSeconds: 300,
      }),
      { status: "rejected", reason: "evaluator_policy_not_found" },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRejectMalformedEvaluatorPolicies_afterClaim", () => {
  const { commands, database } = makeSUT({
    ids: [
      "attempt-1",
      "attempt-2",
      "attempt-3",
      "attempt-4",
      "evaluator-run-1",
      "evaluator-run-2",
      "evaluator-run-3",
      "evaluator-run-4",
      "lease-1",
      "lease-2",
      "lease-3",
      "lease-4",
    ],
    evaluatorPolicies: [
      makeEvaluatorPolicy({ evaluatorPolicyId: "policy-path", evaluatorPathKind: "llm_assisted" }),
      makeEvaluatorPolicy({ evaluatorPolicyId: "policy-raw", rawArtifactPolicy: "persist" }),
      makeEvaluatorPolicy({
        evaluatorPolicyId: "policy-prompt",
        promptInputPolicy: {
          includeSubmittedAnswer: true,
          includeAcceptedCheckRevision: true,
        },
      }),
      makeEvaluatorPolicy({
        evaluatorPolicyId: "policy-retry",
        retryPolicy: { maxAttempts: 3, backoffSeconds: [60, 300] },
      }),
    ],
    providerAdapters: [makeProviderAdapter()],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    for (let index = 1; index <= 4; index += 1) {
      submitAttempt(commands, { idempotencyKey: `submit-${index}` });
    }
    for (let index = 1; index <= 4; index += 1) {
      commands.scheduleOpenAnswerEvaluatorJob({
        attemptId: `attempt-${index}`,
        evaluatorPathKind: "deterministic",
        evaluatorPolicyId: ["policy-path", "policy-raw", "policy-prompt", "policy-retry"][index - 1],
        retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      });
    }

    assert.deepEqual(
      {
        path: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-1",
          leaseDurationSeconds: 300,
        }),
        raw: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-2",
          leaseDurationSeconds: 300,
        }),
        prompt: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-3",
          leaseDurationSeconds: 300,
        }),
        retry: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-4",
          leaseDurationSeconds: 300,
        }),
      },
      {
        path: { status: "rejected", reason: "validation_failed" },
        raw: { status: "rejected", reason: "validation_failed" },
        prompt: { status: "rejected", reason: "validation_failed" },
        retry: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRejectMalformedProviderPolicyIdentifiers_afterClaim", () => {
  const { commands, database } = makeSUT({
    ids: [
      "attempt-1",
      "attempt-2",
      "attempt-3",
      "evaluator-run-1",
      "evaluator-run-2",
      "evaluator-run-3",
      "lease-1",
      "lease-2",
      "lease-3",
    ],
    evaluatorPolicies: [
      makeEvaluatorPolicy({ evaluatorPolicyId: "policy-adapter", providerAdapterId: " " }),
      makeEvaluatorPolicy({ evaluatorPolicyId: "policy-validator", outputValidatorPolicyId: " " }),
      makeEvaluatorPolicy({ evaluatorPolicyId: "policy-redaction", redactionPolicyId: " " }),
    ],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    for (let index = 1; index <= 3; index += 1) {
      submitAttempt(commands, { idempotencyKey: `submit-${index}` });
    }
    for (let index = 1; index <= 3; index += 1) {
      commands.scheduleOpenAnswerEvaluatorJob({
        attemptId: `attempt-${index}`,
        evaluatorPathKind: "deterministic",
        evaluatorPolicyId: ["policy-adapter", "policy-validator", "policy-redaction"][index - 1],
        retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      });
    }

    assert.deepEqual(
      {
        providerAdapterId: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-1",
          leaseDurationSeconds: 300,
        }),
        outputValidatorPolicyId: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-2",
          leaseDurationSeconds: 300,
        }),
        redactionPolicyId: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-3",
          leaseDurationSeconds: 300,
        }),
      },
      {
        providerAdapterId: { status: "rejected", reason: "validation_failed" },
        outputValidatorPolicyId: { status: "rejected", reason: "validation_failed" },
        redactionPolicyId: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRejectMissingAndMismatchedProviderAdapters_afterClaim", () => {
  const { commands, database } = makeSUT({
    ids: [
      "attempt-1",
      "attempt-2",
      "attempt-3",
      "evaluator-run-1",
      "evaluator-run-2",
      "evaluator-run-3",
      "lease-1",
      "lease-2",
      "lease-3",
    ],
    evaluatorPolicies: [
      makeEvaluatorPolicy({ evaluatorPolicyId: "policy-missing", providerAdapterId: "adapter-missing" }),
      makeEvaluatorPolicy({ evaluatorPolicyId: "policy-mismatch", providerAdapterId: "adapter-mismatch" }),
      makeEvaluatorPolicy({ evaluatorPolicyId: "policy-malformed", providerAdapterId: "adapter-malformed" }),
    ],
    providerAdapters: [
      makeProviderAdapter({ providerAdapterId: "adapter-mismatch", evaluatorPathKind: "llm_assisted" }),
      { providerAdapterId: "adapter-malformed", evaluatorPathKind: "deterministic" },
    ],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    submitAttempt(commands, { idempotencyKey: "submit-c" });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-missing",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-2",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-mismatch",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-3",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-malformed",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });

    assert.deepEqual(
      {
        missing: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-1",
          leaseDurationSeconds: 300,
        }),
        mismatch: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-2",
          leaseDurationSeconds: 300,
        }),
        malformed: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-3",
          leaseDurationSeconds: 300,
        }),
      },
      {
        missing: { status: "rejected", reason: "provider_adapter_not_found" },
        mismatch: { status: "rejected", reason: "validation_failed" },
        malformed: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldPreserveAdjacentDomains_onPolicyAdapterFailure", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1"],
    evaluatorPolicies: [
      makeEvaluatorPolicy({ evaluatorPolicyId: "policy-missing", providerAdapterId: "adapter-missing" }),
    ],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    seedProtectedIdentityState(database);
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-missing",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    const acceptedBefore = projectAcceptedAssessmentState(database);
    const membershipBefore = listProgramMembershipRecords(database);
    const identityBefore = getIdentity(database, "identity-student");
    const sessionBefore = getSession(database, "session-protected");
    const credentialBefore = listLocalPasswordCredentials(database);
    const authorityBefore = listAdminAuthorities(database);
    const csrfTokens = new Map([["session-protected", "csrf-token-protected"]]);
    const csrfBefore = [...csrfTokens.entries()];
    const backupBefore = projectProtectedBackupState(exportIdentityBackup(database));

    assert.deepEqual(
      {
        result: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-1",
          leaseDurationSeconds: 300,
        }),
        acceptedAfter: projectAcceptedAssessmentState(database),
        membershipAfter: listProgramMembershipRecords(database),
        identityAfter: getIdentity(database, "identity-student"),
        sessionAfter: getSession(database, "session-protected"),
        credentialAfter: listLocalPasswordCredentials(database),
        authorityAfter: listAdminAuthorities(database),
        csrfAfter: [...csrfTokens.entries()],
        backupAfter: projectProtectedBackupState(exportIdentityBackup(database)),
        evaluations: listOpenAnswerEvaluationRecords(database),
      },
      {
        result: { status: "rejected", reason: "provider_adapter_not_found" },
        acceptedAfter: acceptedBefore,
        membershipAfter: membershipBefore,
        identityAfter: identityBefore,
        sessionAfter: sessionBefore,
        credentialAfter: credentialBefore,
        authorityAfter: authorityBefore,
        csrfAfter: csrfBefore,
        backupAfter: backupBefore,
        evaluations: [],
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldBuildRedactedProviderRequest_fromClaimedSnapshot", () => {
  const providerRequests = [];
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "evaluation-1"],
    evaluatorPolicies: [
      makeEvaluatorPolicy({
        hiddenInstructions:
          "session-1 csrf-token-1 cookie authorization raw prompt raw model select stack /tmp/db.sqlite postgres://db hidden policy instructions",
      }),
    ],
    providerAdapters: [
      makeProviderAdapter({
        providerCredential: "authorization bearer provider-secret",
        providerRequests,
      }),
    ],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, {
      submittedAnswer: "Student answer explaining the accepted theorem with no operational artifacts.",
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    createAcceptedAssessmentCriterionRevisionRecord(
      database,
      makeAcceptedAssessmentCriterionRevision({
        id: "criterion-revision-current",
        entityId: "criterion-entity-a",
        programId: "program-a",
        acceptedFromCandidateId: "criterion-candidate-a",
        sourceIds: ["source-a"],
      }),
    );
    updateAcceptedAssessmentCriterionEntityCurrentRevision(database, {
      entityId: "criterion-entity-a",
      currentRevisionId: "criterion-revision-current",
    });
    createAcceptedOpenAnswerCheckRevisionRecord(
      database,
      makeAcceptedOpenAnswerCheckRevision({
        id: "check-revision-current",
        entityId: "check-entity-a",
        programId: "program-a",
        acceptedFromCandidateId: "check-candidate-check-revision-a",
        criterionRevisionIds: ["criterion-revision-current"],
        sourceIds: ["source-a"],
      }),
    );
    updateAcceptedOpenAnswerCheckEntityCurrentRevision(database, {
      entityId: "check-entity-a",
      currentRevisionId: "check-revision-current",
    });
    createAssessmentCriterionCandidateRecord(
      database,
      makeAssessmentCriterionCandidate({
        id: "criterion-candidate-draft",
        programId: "program-a",
        rationale: "hidden policy instructions from mutable draft curator state",
        sourceIds: ["source-a"],
        status: "draft",
      }),
    );

    assert.deepEqual(
      {
        resultSummary: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-1",
          leaseDurationSeconds: 300,
        }).value.summary,
        providerRequests,
        leaksForbiddenDetails: containsForbiddenProviderRequestDetail(providerRequests),
        leaksCurrentRevision: JSON.stringify(providerRequests).includes("revision-current"),
        leaksDraftState: JSON.stringify(providerRequests).includes("hidden policy instructions"),
      },
      {
        resultSummary: makeEvaluatorWorkerSummary({
          mode: "single_job",
          evaluatorJobId: "evaluator-run-1",
          claimed: true,
          completed: true,
        }),
        providerRequests: [
          {
            evaluatorJobId: "evaluator-run-1",
            attemptId: "attempt-1",
            programId: "program-a",
            studentIdentityId: "identity-student",
            checkRevisionId: "check-revision-a",
            criterionRevisionIds: ["criterion-revision-a"],
            submittedAnswer: "Student answer explaining the accepted theorem with no operational artifacts.",
            acceptedCheckRevision: {
              revisionId: "check-revision-a",
              title: "Accepted check check-revision-a",
              prompt: "Accepted prompt check-revision-a",
            },
            acceptedCriterionRevisions: [
              {
                revisionId: "criterion-revision-a",
                title: "Accepted criterion criterion-revision-a",
                body: "Accepted criterion body criterion-revision-a",
              },
            ],
            evaluatorPolicyId: "policy-a",
            outputValidatorPolicyId: "validator-a",
          },
        ],
        leaksForbiddenDetails: false,
        leaksCurrentRevision: false,
        leaksDraftState: false,
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRetryProviderExecutionFailure_onThrownAdapter", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1"],
    evaluatorPolicies: [makeEvaluatorPolicy()],
    providerAdapters: [
      makeProviderAdapter({
        evaluate: () => {
          throw new Error("provider unavailable");
        },
      }),
    ],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });

    assert.deepEqual(
      {
        result: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-1",
          leaseDurationSeconds: 300,
        }),
        evaluations: listOpenAnswerEvaluationRecords(database),
      },
      {
        result: {
          status: "accepted",
          value: {
            summary: makeEvaluatorWorkerSummary({
              mode: "single_job",
              evaluatorJobId: "evaluator-run-1",
              claimed: true,
              retried: true,
              failureReason: "provider_execution_failed",
            }),
            evaluatorJob: makeEvaluatorJobSummary({
              status: "retry_waiting",
              attemptNumber: 2,
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
              budgetPolicy: null,
              nextRetryAt: "2026-06-02T10:01:00.000Z",
              failureReason: "provider_execution_failed",
            }),
          },
        },
        evaluations: [],
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRetryProviderExecutionFailure_onMalformedAdapterResult", () => {
  assert.deepEqual(
    [
      undefined,
      null,
      [],
      {},
      makeProviderResult({ providerUsage: { providerCalls: -1 } }),
      makeProviderResult({ providerUsage: { rawPrompt: 1 } }),
    ].map(providerResult =>
      runProviderOutputWorker({
        evaluate: () => providerResult,
      }),
    ),
    Array.from({ length: 6 }, () =>
      makeProviderWorkerFailureResult({
        failureReason: "provider_execution_failed",
      }),
    ),
  );
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRetryBudgetFailure_onExceededProviderUsage", () => {
  assert.deepEqual(
    runProviderOutputWorker({
      budgetPolicy: { maxProviderCalls: 1 },
      evaluate: () => makeProviderResult({ providerUsage: { providerCalls: 2 } }),
    }),
    makeProviderWorkerFailureResult({
      budgetPolicy: { maxProviderCalls: 1 },
      failureReason: "provider_budget_exceeded",
    }),
  );
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRetryProviderOutputRejection_onInvalidOrUnsafeOutput", () => {
  assert.deepEqual(
    [
      makeProviderResult({ outputValidation: null }),
      makeProviderResult({ outputValidation: "validator-a" }),
      makeProviderResult({ outputValidation: { validatorPolicyId: "validator-a", passed: false } }),
      makeProviderResult({ outputValidation: { validatorPolicyId: "validator-b", passed: true } }),
      makeProviderResult({ criterionFeedback: [] }),
      makeProviderResult({ criterionFeedback: [makeCriterionFeedback(), makeCriterionFeedback()] }),
      makeProviderResult({ criterionFeedback: [makeCriterionFeedback({ criterionRevisionId: "criterion-unknown" })] }),
      makeProviderResult({ summaryFeedback: " " }),
      makeProviderResult({ summaryFeedback: "raw prompt leaked" }),
      makeProviderResult({ criterionFeedback: [makeCriterionFeedback({ feedback: "stack trace leaked" })] }),
      makeProviderResult({ redactedEvidenceSummary: " " }),
      makeProviderResult({ redactedEvidenceSummary: "authorization leaked" }),
    ].map(providerResult =>
      runProviderOutputWorker({
        evaluate: () => providerResult,
      }),
    ),
    Array.from({ length: 12 }, () =>
      makeProviderWorkerFailureResult({
        failureReason: "provider_output_rejected",
      }),
    ),
  );
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRetryProviderOutputRejection_onInvalidLlmOutputValidation", () => {
  assert.deepEqual(
    runProviderOutputWorker({
      evaluatorPathKind: "llm_assisted",
      evaluate: () =>
        makeProviderResult({ outputValidation: { validatorPolicyId: "validator-b", passed: true } }),
    }),
    makeProviderWorkerFailureResult({
      evaluatorPathKind: "llm_assisted",
      failureReason: "provider_output_rejected",
    }),
  );
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRecordTerminalFailure_onExhaustedProviderRetry", () => {
  assert.deepEqual(
    runProviderOutputWorker({
      evaluate: () => {
        throw new Error("provider unavailable");
      },
      retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
    }),
    makeProviderWorkerFailureResult({
      failureReason: "provider_execution_failed",
      retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
      terminal: true,
    }),
  );
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRecordEvidenceAndCompleteEvaluation_onValidProviderOutput", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "evidence-1", "evaluation-1"],
    evaluatorPolicies: [makeEvaluatorPolicy()],
    providerAdapters: [
      makeProviderAdapter({
        evaluate: () =>
          makeProviderResult({
            summaryFeedback: " Good explanation. ",
            criterionFeedback: [makeCriterionFeedback({ feedback: " Criterion feedback " })],
            providerUsage: { providerCalls: 1 },
            redactedEvidenceSummary: " Matched accepted criterion. ",
          }),
      }),
    ],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      budgetPolicy: { maxProviderCalls: 2 },
    });

    assert.deepEqual(
      {
        result: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-1",
          leaseDurationSeconds: 300,
        }),
        evidence: listOpenAnswerEvaluatorEvidenceRecords(database),
        evaluations: listOpenAnswerEvaluationRecords(database),
      },
      {
        result: {
          status: "accepted",
          value: {
            summary: makeEvaluatorWorkerSummary({
              mode: "single_job",
              evaluatorJobId: "evaluator-run-1",
              claimed: true,
              completed: true,
            }),
            evaluatorJob: makeEvaluatorJobSummary({
              status: "succeeded",
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        evidence: [
          makeEvaluatorEvidenceRecord({
            redactedSummary: "Matched accepted criterion.",
          }),
        ],
        evaluations: [
          makeEvaluationRecord({
            evaluationId: "evaluation-1",
            attemptId: "attempt-1",
            summaryFeedback: "Good explanation.",
            criterionFeedback: [makeCriterionFeedback()],
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRecordEvidenceAndCompleteEvaluation_onAsyncProviderOutput", async () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "evaluation-1"],
    evaluatorPolicies: [makeEvaluatorPolicy({ evaluatorPathKind: "llm_assisted" })],
    providerAdapters: [
      makeProviderAdapter({
        evaluatorPathKind: "llm_assisted",
        evaluate: async () => makeProviderResult(),
      }),
    ],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "llm_assisted",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });

    const result = await commands.runOpenAnswerEvaluatorWorkerOnce({
      workerId: "worker-a",
      mode: "single_job",
      evaluatorJobId: "evaluator-run-1",
      leaseDurationSeconds: 300,
    });

    assert.deepEqual(
      {
        resultStatus: result.status,
        completed: result.value?.summary.completed,
        evaluationIds: listOpenAnswerEvaluationRecords(database).map($0 => $0.id),
      },
      {
        resultStatus: "accepted",
        completed: true,
        evaluationIds: ["evaluation-1"],
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRejectTerminalRerunWithoutDuplicateEvaluation_onSucceededJob", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "evaluation-1"],
    evaluatorPolicies: [makeEvaluatorPolicy()],
    providerAdapters: [makeProviderAdapter()],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });

    assert.deepEqual(
      {
        first: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-1",
          leaseDurationSeconds: 300,
        }),
        second: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-1",
          leaseDurationSeconds: 300,
        }),
        evidence: listOpenAnswerEvaluatorEvidenceRecords(database),
        evaluations: listOpenAnswerEvaluationRecords(database),
      },
      {
        first: {
          status: "accepted",
          value: {
            summary: makeEvaluatorWorkerSummary({
              mode: "single_job",
              evaluatorJobId: "evaluator-run-1",
              claimed: true,
              completed: true,
            }),
            evaluatorJob: makeEvaluatorJobSummary({
              status: "succeeded",
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
              budgetPolicy: null,
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        second: { status: "rejected", reason: "evaluator_job_conflict" },
        evidence: [],
        evaluations: [
          makeEvaluationRecord({
            evaluationId: "evaluation-1",
            attemptId: "attempt-1",
            summaryFeedback: "Good explanation.",
            criterionFeedback: [makeCriterionFeedback()],
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldPreserveLlmCompletionSignature_forEquivalentCompletionReplay", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "evaluation-1"],
    evaluatorPolicies: [makeEvaluatorPolicy({ evaluatorPathKind: "llm_assisted" })],
    providerAdapters: [
      makeProviderAdapter({
        evaluatorPathKind: "llm_assisted",
        evaluate: () => makeProviderResult({ providerUsage: { providerCalls: 1 } }),
      }),
    ],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "llm_assisted",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      budgetPolicy: { maxProviderCalls: 2 },
    });
    const completionInput = {
      evaluatorJobId: "evaluator-run-1",
      leaseId: "lease-1",
      workerId: "worker-a",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
      providerUsage: { providerCalls: 1 },
      outputValidation: { validatorPolicyId: "validator-a", passed: true },
    };

    assert.deepEqual(
      {
        worker: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-1",
          leaseDurationSeconds: 300,
        }),
        equivalentReplay: commands.completeOpenAnswerEvaluatorJob(completionInput),
        changedUsageReplay: commands.completeOpenAnswerEvaluatorJob({
          ...completionInput,
          providerUsage: { providerCalls: 2 },
        }),
        evaluations: listOpenAnswerEvaluationRecords(database),
      },
      {
        worker: {
          status: "accepted",
          value: {
            summary: makeEvaluatorWorkerSummary({
              mode: "single_job",
              evaluatorJobId: "evaluator-run-1",
              claimed: true,
              completed: true,
            }),
            evaluatorJob: makeEvaluatorJobSummary({
              evaluatorPathKind: "llm_assisted",
              status: "succeeded",
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        equivalentReplay: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluated" }),
            evaluatorJob: makeEvaluatorJobSummary({
              evaluatorPathKind: "llm_assisted",
              status: "succeeded",
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        changedUsageReplay: { status: "rejected", reason: "evaluator_job_conflict" },
        evaluations: [
          makeEvaluationRecord({
            evaluationId: "evaluation-1",
            attemptId: "attempt-1",
            summaryFeedback: "Good explanation.",
            criterionFeedback: [makeCriterionFeedback()],
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRejectConcurrentLeaseAndTerminalChanges_throughStudentWorkspaceCommands", () => {
  assert.deepEqual(
    [
      runWorkerAfterProviderMutation({
        mutate: ({ setNow }) => setNow("2026-06-02T10:05:00.000Z"),
        providerResult: makeProviderResult({ redactedEvidenceSummary: "Matched accepted criterion." }),
      }),
      runWorkerAfterProviderMutation({
        mutate: ({ setNow }) => setNow("2026-06-02T10:05:00.000Z"),
      }),
      runWorkerAfterProviderMutation({
        mutate: ({ database }) => {
          const evaluatorJob = getOpenAnswerEvaluatorJobRecord(database, "evaluator-run-1");
          updateOpenAnswerEvaluatorJobLease(database, {
            evaluatorJobId: "evaluator-run-1",
            leaseId: "lease-concurrent",
            workerId: "worker-concurrent",
            claimedAt: evaluatorJob.lease.claimedAt,
            expiresAt: evaluatorJob.lease.expiresAt,
            updatedAt: evaluatorJob.updatedAt,
          });
        },
      }),
      runWorkerAfterProviderMutation({
        mutate: ({ commands }) =>
          commands.cancelOpenAnswerEvaluatorJob({
            evaluatorJobId: "evaluator-run-1",
            reason: "cancelled concurrently",
          }),
      }),
      runWorkerAfterProviderMutation({
        mutate: ({ commands, setNow }) => {
          setNow("2026-06-02T10:05:00.000Z");
          commands.timeOutOpenAnswerEvaluatorJob({
            evaluatorJobId: "evaluator-run-1",
            reason: "timed out concurrently",
          });
        },
      }),
    ],
    [
      makeProviderWorkerRejectionResult("evaluator_job_lease_expired"),
      makeProviderWorkerRejectionResult("evaluator_job_lease_expired"),
      makeProviderWorkerRejectionResult("evaluator_job_lease_mismatch"),
      makeProviderWorkerRejectionResult("evaluator_job_conflict"),
      makeProviderWorkerRejectionResult("evaluator_job_conflict"),
    ],
  );
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldPreserveAdjacentDomainsAndExcludeOutOfScopeSurfaces_onSuccessfulAdapterExecution", () => {
  const providerCalls = [];
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "evidence-1", "evaluation-1"],
    evaluatorPolicies: [makeEvaluatorPolicy()],
    providerAdapters: [
      makeProviderAdapter({
        providerCredential: "authorization bearer provider-secret",
        evaluate: (...args) => {
          providerCalls.push(args);
          return makeProviderResult({ redactedEvidenceSummary: "Matched accepted criterion." });
        },
      }),
    ],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    seedProtectedIdentityState(database);
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    const csrfTokens = new Map([["session-protected", "csrf-token-protected"]]);
    const adjacentBefore = {
      corpus: projectAdjacentCorpusState(database),
      memberships: listProgramMembershipRecords(database),
      studentIdentity: getIdentity(database, "identity-student"),
      protectedIdentity: getIdentity(database, "identity-active-other"),
      protectedSession: getSession(database, "session-protected"),
      credentials: listLocalPasswordCredentials(database),
      authorities: listAdminAuthorities(database),
      csrfTokens: [...csrfTokens.entries()],
      backup: projectProtectedAdjacentBackupState(exportIdentityBackup(database)),
    };

    const result = commands.runOpenAnswerEvaluatorWorkerOnce({
      workerId: "worker-a",
      mode: "single_job",
      evaluatorJobId: "evaluator-run-1",
      leaseDurationSeconds: 300,
    });

    assert.deepEqual(
      {
        providerCalls,
        adjacentAfter: {
          corpus: projectAdjacentCorpusState(database),
          memberships: listProgramMembershipRecords(database),
          studentIdentity: getIdentity(database, "identity-student"),
          protectedIdentity: getIdentity(database, "identity-active-other"),
          protectedSession: getSession(database, "session-protected"),
          credentials: listLocalPasswordCredentials(database),
          authorities: listAdminAuthorities(database),
          csrfTokens: [...csrfTokens.entries()],
          backup: projectProtectedAdjacentBackupState(exportIdentityBackup(database)),
        },
        exposesForbiddenDetails: containsForbiddenDetail(result),
        exposesOutOfScopeSurfaces: containsAnyOutOfScopeEvaluatorWorkerSurface({
          adminUiSource: readFileSync(new URL("../src/admin-ui.js", import.meta.url), "utf8"),
          cliSource: readFileSync(new URL("../src/cli.js", import.meta.url), "utf8"),
          serverSource: readFileSync(new URL("../src/server.js", import.meta.url), "utf8"),
          workspaceSource: readFileSync(new URL("../src/student-workspace.js", import.meta.url), "utf8"),
        }),
      },
      {
        providerCalls: [
          [
            {
              evaluatorJobId: "evaluator-run-1",
              attemptId: "attempt-1",
              programId: "program-a",
              studentIdentityId: "identity-student",
              checkRevisionId: "check-revision-a",
              criterionRevisionIds: ["criterion-revision-a"],
              submittedAnswer: "Answer",
              acceptedCheckRevision: {
                revisionId: "check-revision-a",
                title: "Accepted check check-revision-a",
                prompt: "Accepted prompt check-revision-a",
              },
              acceptedCriterionRevisions: [
                {
                  revisionId: "criterion-revision-a",
                  title: "Accepted criterion criterion-revision-a",
                  body: "Accepted criterion body criterion-revision-a",
                },
              ],
              evaluatorPolicyId: "policy-a",
              outputValidatorPolicyId: "validator-a",
            },
          ],
        ],
        adjacentAfter: adjacentBefore,
        exposesForbiddenDetails: false,
        exposesOutOfScopeSurfaces: false,
      },
    );
  } finally {
    database.close();
  }
});

test("containsAnyOutOfScopeEvaluatorWorkerSurface_shouldDetectForbiddenSurface_onWorkerExpansion", () => {
  assert.deepEqual(
    [
      { cliSource: "providerAdapters" },
      { adminUiSource: "evaluatorPolicies" },
      { workspaceSource: "fetch(" },
      { workspaceSource: "provider_sdk" },
      { workspaceSource: "durable_queue" },
      { workspaceSource: "queue_state" },
      { workspaceSource: "human_review_queue" },
      { workspaceSource: "raw_artifact_store" },
      { workspaceSource: "raw_artifact_backup" },
      { workspaceSource: "raw_artifact_export" },
      { workspaceSource: "student_ui" },
      { workspaceSource: "reviewer_ui" },
      { workspaceSource: "mastery" },
      { workspaceSource: "next-step" },
      { workspaceSource: "analytics" },
      { workspaceSource: "deployment_target" },
      { workspaceSource: "infrastructure_port" },
      { workspaceSource: "worker_topology" },
    ].map(source =>
      containsAnyOutOfScopeEvaluatorWorkerSurface({
        adminUiSource: "",
        cliSource: "",
        serverSource: "",
        workspaceSource: "",
        ...source,
      }),
    ),
    Array.from({ length: 18 }, () => true),
  );
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldRejectUnclaimableJobsBeforeProviderAdapterCall", () => {
  const providerAdapter = {
    providerAdapterId: "adapter-a",
    evaluatorPathKind: "deterministic",
    evaluate: () => {
      throw new Error("provider adapter must not be called before claim success");
    },
  };
  const { commands, database } = makeSUT({
    ids: [
      "attempt-1",
      "attempt-2",
      "attempt-3",
      "evaluator-run-1",
      "evaluator-run-2",
      "evaluator-run-3",
      "lease-1",
      "lease-2",
      "lease-3",
    ],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    submitAttempt(commands, { idempotencyKey: "submit-c" });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-2",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-3",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-b",
      leaseDurationSeconds: 300,
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-2",
      workerId: "worker-b",
      leaseDurationSeconds: 300,
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-3",
      workerId: "worker-b",
      leaseDurationSeconds: 300,
    });
    commands.failOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-2",
      leaseId: "lease-2",
      workerId: "worker-b",
      reason: "provider execution failed",
      retry: false,
    });
    commands.failOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-3",
      leaseId: "lease-3",
      workerId: "worker-b",
      reason: "provider execution failed",
      retry: true,
    });

    assert.deepEqual(
      {
        unknown: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-unknown",
          leaseDurationSeconds: 300,
          providerAdapter,
        }),
        leased: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-1",
          leaseDurationSeconds: 300,
          providerAdapter,
        }),
        terminal: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-2",
          leaseDurationSeconds: 300,
          providerAdapter,
        }),
        retryWaiting: commands.runOpenAnswerEvaluatorWorkerOnce({
          workerId: "worker-a",
          mode: "single_job",
          evaluatorJobId: "evaluator-run-3",
          leaseDurationSeconds: 300,
          providerAdapter,
        }),
      },
      {
        unknown: { status: "rejected", reason: "evaluator_job_not_found" },
        leased: { status: "rejected", reason: "evaluator_job_conflict" },
        terminal: { status: "rejected", reason: "evaluator_job_conflict" },
        retryWaiting: { status: "rejected", reason: "evaluator_job_conflict" },
      },
    );
  } finally {
    database.close();
  }
});

test("runOpenAnswerEvaluatorWorkerOnce_shouldSkipNotYetDueRetryJob_onClaimNext", () => {
  const { commands, database } = makeSUT({
    ids: [
      "attempt-1",
      "attempt-2",
      "evaluator-run-1",
      "lease-1",
      "evaluator-run-2",
      "lease-2",
      "evaluation-1",
    ],
    evaluatorPolicies: [makeEvaluatorPolicy()],
    providerAdapters: [makeProviderAdapter()],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-b",
      leaseDurationSeconds: 300,
    });
    commands.failOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      leaseId: "lease-1",
      workerId: "worker-b",
      reason: "provider execution failed",
      retry: true,
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-2",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });

    assert.deepEqual(
      commands.runOpenAnswerEvaluatorWorkerOnce({
        workerId: "worker-a",
        mode: "claim_next",
        leaseDurationSeconds: 300,
      }),
      {
        status: "accepted",
        value: {
          summary: makeEvaluatorWorkerSummary({
            mode: "claim_next",
            evaluatorJobId: "evaluator-run-2",
            claimed: true,
            completed: true,
          }),
          evaluatorJob: makeEvaluatorJobSummary({
            evaluatorJobId: "evaluator-run-2",
            evaluatorRunId: "evaluator-run-2",
            attemptId: "attempt-2",
            retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
            budgetPolicy: null,
            status: "succeeded",
          }),
          evaluation: makeEvaluationSummary({
            evaluationId: "evaluation-1",
            attemptId: "attempt-2",
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

test("renewOpenAnswerEvaluatorJobLease_shouldExtendValidLeaseAndRejectLeaseConflicts", () => {
  let currentNow = new Date("2026-06-02T10:00:00.000Z");
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1"],
    now: () => currentNow,
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 300,
    });
    currentNow = new Date("2026-06-02T10:02:00.000Z");
    const acceptedBefore = projectAcceptedAssessmentState(database);

    const result = commands.renewOpenAnswerEvaluatorJobLease({
      evaluatorJobId: "evaluator-run-1",
      leaseId: "lease-1",
      workerId: "worker-a",
      leaseDurationSeconds: 600,
    });

    assert.deepEqual(
      {
        result,
        acceptedAfter: projectAcceptedAssessmentState(database),
        mismatch: commands.renewOpenAnswerEvaluatorJobLease({
          evaluatorJobId: "evaluator-run-1",
          leaseId: "lease-wrong",
          workerId: "worker-a",
          leaseDurationSeconds: 600,
        }),
      },
      {
        result: {
          status: "accepted",
          value: {
            evaluatorJob: makeEvaluatorJobSummary({
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
              budgetPolicy: null,
              status: "leased",
              lease: makeEvaluatorLease({ expiresAt: "2026-06-02T10:12:00.000Z" }),
              updatedAt: "2026-06-02T10:02:00.000Z",
            }),
            lease: makeEvaluatorLease({ expiresAt: "2026-06-02T10:12:00.000Z" }),
          },
        },
        acceptedAfter: acceptedBefore,
        mismatch: { status: "rejected", reason: "evaluator_job_lease_mismatch" },
      },
    );
  } finally {
    database.close();
  }
});

test("openAnswerEvaluatorJobReads_shouldReturnRedactedJobStateAndBoundedClaimableJobs", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "attempt-3", "evaluator-run-1", "evaluator-run-2", "evaluator-run-3"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    submitAttempt(commands, { idempotencyKey: "submit-c" });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-2",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-3",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });

    assert.deepEqual(
      {
        get: commands.getOpenAnswerEvaluatorJob({ evaluatorJobId: "evaluator-run-1" }),
        missing: commands.getOpenAnswerEvaluatorJob({ evaluatorJobId: "evaluator-run-unknown" }),
        claimable: commands.listClaimableOpenAnswerEvaluatorJobs({ limit: 2 }),
      },
      {
        get: {
          status: "accepted",
          value: {
            evaluatorJob: makeEvaluatorJobSummary({
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
              budgetPolicy: null,
            }),
          },
        },
        missing: { status: "rejected", reason: "evaluator_job_not_found" },
        claimable: {
          status: "accepted",
          value: {
            evaluatorJobs: [
              makeEvaluatorJobSummary({
                retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
                budgetPolicy: null,
              }),
              makeEvaluatorJobSummary({
                evaluatorJobId: "evaluator-run-2",
                evaluatorRunId: "evaluator-run-2",
                attemptId: "attempt-2",
                retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
                budgetPolicy: null,
              }),
            ],
          },
        },
      },
    );
  } finally {
    database.close();
  }
});

test("listClaimableOpenAnswerEvaluatorJobs_shouldApplyDefaultAndMaximumBounds", () => {
  const ids = Array.from({ length: 210 }, (_, index) =>
    index % 2 === 0 ? `attempt-${index / 2 + 1}` : `evaluator-run-${(index + 1) / 2}`,
  );
  const { commands, database } = makeSUT({ ids });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    for (let index = 1; index <= 105; index += 1) {
      submitAttempt(commands, { idempotencyKey: `submit-${index}` });
      commands.scheduleOpenAnswerEvaluatorJob({
        attemptId: `attempt-${index}`,
        evaluatorPathKind: "deterministic",
        evaluatorPolicyId: "policy-a",
        retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
      });
    }

    assert.deepEqual(
      {
        defaultCount: commands.listClaimableOpenAnswerEvaluatorJobs({}).value.evaluatorJobs.length,
        invalidCount: commands.listClaimableOpenAnswerEvaluatorJobs({ limit: -1 }).value.evaluatorJobs.length,
        cappedCount: commands.listClaimableOpenAnswerEvaluatorJobs({ limit: 500 }).value.evaluatorJobs.length,
      },
      {
        defaultCount: 50,
        invalidCount: 50,
        cappedCount: 100,
      },
    );
  } finally {
    database.close();
  }
});

test("claimOpenAnswerEvaluatorJob_shouldClaimDueRetryAndRejectEarlyLeasedTerminalAndMalformedCases", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "attempt-3", "attempt-4", "lease-1", "lease-2"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    for (const idempotencyKey of ["submit-a", "submit-b", "submit-c", "submit-d"]) {
      submitAttempt(commands, { idempotencyKey });
    }
    for (const input of [
      makeEvaluatorRunRecord({
        evaluatorRunId: "evaluator-run-due",
        attemptId: "attempt-1",
        status: "failed",
        priorFailureReason: null,
        priorFailedAt: null,
      }),
      makeEvaluatorRunRecord({
        evaluatorRunId: "evaluator-run-early",
        attemptId: "attempt-2",
        status: "failed",
        priorFailureReason: null,
        priorFailedAt: null,
      }),
      makeEvaluatorRunRecord({
        evaluatorRunId: "evaluator-run-terminal",
        attemptId: "attempt-3",
        status: "failed",
        priorFailureReason: null,
        priorFailedAt: null,
      }),
      makeEvaluatorRunRecord({
        evaluatorRunId: "evaluator-run-waiting",
        attemptId: "attempt-4",
      }),
    ]) {
      createOpenAnswerEvaluatorRunRecord(database, {
        ...input,
        id: input.id,
        jobStatus:
          input.id === "evaluator-run-terminal"
            ? "failed"
            : input.id === "evaluator-run-waiting"
              ? "waiting"
              : "retry_waiting",
        attemptNumber: input.id === "evaluator-run-waiting" ? 1 : 2,
        retryPolicy: { maxAttempts: 3, backoffSeconds: [60, 300] },
        nextRetryAt:
          input.id === "evaluator-run-due"
            ? "2026-06-02T09:59:00.000Z"
            : input.id === "evaluator-run-early"
              ? "2026-06-02T10:30:00.000Z"
              : null,
        jobCreatedAt: "2026-06-02T09:50:00.000Z",
        jobUpdatedAt: "2026-06-02T09:50:00.000Z",
      });
    }
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-waiting",
      workerId: "worker-a",
      leaseDurationSeconds: 300,
    });

    assert.deepEqual(
      {
        due: commands.claimOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-due",
          workerId: "worker-a",
          leaseDurationSeconds: 300,
        }),
        early: commands.claimOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-early",
          workerId: "worker-a",
          leaseDurationSeconds: 300,
        }),
        leased: commands.claimOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-waiting",
          workerId: "worker-a",
          leaseDurationSeconds: 300,
        }),
        terminal: commands.claimOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-terminal",
          workerId: "worker-a",
          leaseDurationSeconds: 300,
        }),
        unknown: commands.claimOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-unknown",
          workerId: "worker-a",
          leaseDurationSeconds: 300,
        }),
        malformedWorker: commands.claimOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-early",
          workerId: " ",
          leaseDurationSeconds: 300,
        }),
        malformedDuration: commands.claimOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-early",
          workerId: "worker-a",
          leaseDurationSeconds: 0,
        }),
      },
      {
        due: {
          status: "accepted",
          value: {
            evaluatorJob: makeEvaluatorJobSummary({
              evaluatorJobId: "evaluator-run-due",
              evaluatorRunId: "evaluator-run-due",
              attemptId: "attempt-1",
              status: "leased",
              attemptNumber: 2,
              retryPolicy: { maxAttempts: 3, backoffSeconds: [60, 300] },
              budgetPolicy: null,
              lease: makeEvaluatorLease({ leaseId: "lease-2" }),
              createdAt: "2026-06-02T09:50:00.000Z",
            }),
            lease: makeEvaluatorLease({ leaseId: "lease-2" }),
          },
        },
        early: { status: "rejected", reason: "evaluator_job_conflict" },
        leased: { status: "rejected", reason: "evaluator_job_conflict" },
        terminal: { status: "rejected", reason: "evaluator_job_conflict" },
        unknown: { status: "rejected", reason: "evaluator_job_not_found" },
        malformedWorker: { status: "rejected", reason: "validation_failed" },
        malformedDuration: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("renewOpenAnswerEvaluatorJobLease_shouldRejectUnknownUnclaimedExpiredAndMalformedCases", () => {
  let currentNow = new Date("2026-06-02T10:00:00.000Z");
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "evaluator-run-1", "evaluator-run-2", "lease-1"],
    now: () => currentNow,
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-2",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 60,
    });
    currentNow = new Date("2026-06-02T10:02:00.000Z");

    assert.deepEqual(
      {
        expired: commands.renewOpenAnswerEvaluatorJobLease({
          evaluatorJobId: "evaluator-run-1",
          leaseId: "lease-1",
          workerId: "worker-a",
          leaseDurationSeconds: 600,
        }),
        unclaimed: commands.renewOpenAnswerEvaluatorJobLease({
          evaluatorJobId: "evaluator-run-2",
          leaseId: "lease-1",
          workerId: "worker-a",
          leaseDurationSeconds: 600,
        }),
        unknown: commands.renewOpenAnswerEvaluatorJobLease({
          evaluatorJobId: "evaluator-run-unknown",
          leaseId: "lease-1",
          workerId: "worker-a",
          leaseDurationSeconds: 600,
        }),
        malformed: commands.renewOpenAnswerEvaluatorJobLease({
          evaluatorJobId: "evaluator-run-1",
          leaseId: "",
          workerId: "worker-a",
          leaseDurationSeconds: 600,
        }),
      },
      {
        expired: { status: "rejected", reason: "evaluator_job_lease_expired" },
        unclaimed: { status: "rejected", reason: "evaluator_job_not_claimed" },
        unknown: { status: "rejected", reason: "evaluator_job_not_found" },
        malformed: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluatorJobEvidence_shouldRecordInternalMetadata_onValidLease", () => {
  let currentNow = new Date("2026-06-02T10:00:00.000Z");
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "evidence-1"],
    now: () => currentNow,
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 300,
    });
    const acceptedBefore = projectAcceptedAssessmentState(database);
    currentNow = new Date("2026-06-02T10:02:00.000Z");

    const result = commands.recordOpenAnswerEvaluatorJobEvidence({
      evaluatorJobId: "evaluator-run-1",
      leaseId: "lease-1",
      workerId: "worker-a",
      evidenceKind: " criterion_match ",
      redactedSummary: " Matched accepted criterion. ",
    });

    assert.deepEqual(
      {
        result,
        evidence: listOpenAnswerEvaluatorEvidenceRecords(database, {
          evaluatorRunId: "evaluator-run-1",
        }),
        attempt: getOpenAnswerAttemptRecord(database, "attempt-1"),
        acceptedAfter: projectAcceptedAssessmentState(database),
        job: projectEvaluatorJob(getOpenAnswerEvaluatorJobRecord(database, "evaluator-run-1")),
      },
      {
        result: {
          status: "accepted",
          value: {
            evidence: makeEvaluatorEvidenceSummary({
              redactedSummary: "Matched accepted criterion.",
              recordedAt: "2026-06-02T10:02:00.000Z",
            }),
          },
        },
        evidence: [
          makeEvaluatorEvidenceRecord({
            redactedSummary: "Matched accepted criterion.",
            recordedAt: "2026-06-02T10:02:00.000Z",
          }),
        ],
        attempt: makeAttemptRecord({ attemptId: "attempt-1", status: "evaluating" }),
        acceptedAfter: acceptedBefore,
        job: makeEvaluatorJobSummary({
          retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
          budgetPolicy: null,
          status: "leased",
          lease: makeEvaluatorLease(),
          updatedAt: "2026-06-02T10:02:00.000Z",
        }),
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluatorJobEvidence_shouldRejectUnknownUnclaimedMismatchedExpiredAndTerminalJobs", () => {
  let currentNow = new Date("2026-06-02T10:00:00.000Z");
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "attempt-3", "evaluator-run-1", "evaluator-run-2", "lease-1"],
    now: () => currentNow,
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    submitAttempt(commands, { idempotencyKey: "submit-c" });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-2",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    createOpenAnswerEvaluatorRunRecord(database, {
      ...makeEvaluatorRunRecord({
        evaluatorRunId: "evaluator-run-terminal",
        attemptId: "attempt-3",
        status: "failed",
        priorFailureReason: null,
        priorFailedAt: null,
      }),
      id: "evaluator-run-terminal",
      jobStatus: "failed",
      attemptNumber: 1,
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 60,
    });
    currentNow = new Date("2026-06-02T10:02:00.000Z");

    assert.deepEqual(
      {
        unknown: commands.recordOpenAnswerEvaluatorJobEvidence({
          evaluatorJobId: "evaluator-run-unknown",
          leaseId: "lease-1",
          workerId: "worker-a",
          evidenceKind: "criterion_match",
        }),
        unclaimed: commands.recordOpenAnswerEvaluatorJobEvidence({
          evaluatorJobId: "evaluator-run-2",
          leaseId: "lease-1",
          workerId: "worker-a",
          evidenceKind: "criterion_match",
        }),
        mismatched: commands.recordOpenAnswerEvaluatorJobEvidence({
          evaluatorJobId: "evaluator-run-1",
          leaseId: "lease-wrong",
          workerId: "worker-a",
          evidenceKind: "criterion_match",
        }),
        expired: commands.recordOpenAnswerEvaluatorJobEvidence({
          evaluatorJobId: "evaluator-run-1",
          leaseId: "lease-1",
          workerId: "worker-a",
          evidenceKind: "criterion_match",
        }),
        terminal: commands.recordOpenAnswerEvaluatorJobEvidence({
          evaluatorJobId: "evaluator-run-terminal",
          leaseId: "lease-1",
          workerId: "worker-a",
          evidenceKind: "criterion_match",
        }),
        evidence: listOpenAnswerEvaluatorEvidenceRecords(database, {}),
      },
      {
        unknown: { status: "rejected", reason: "evaluator_job_not_found" },
        unclaimed: { status: "rejected", reason: "evaluator_job_not_claimed" },
        mismatched: { status: "rejected", reason: "evaluator_job_lease_mismatch" },
        expired: { status: "rejected", reason: "evaluator_job_lease_expired" },
        terminal: { status: "rejected", reason: "evaluator_job_conflict" },
        evidence: [],
      },
    );
  } finally {
    database.close();
  }
});

test("recordOpenAnswerEvaluatorJobEvidence_shouldApplyEvidenceValidationAndRedactionRules", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "evidence-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 300,
    });

    assert.deepEqual(
      {
        missingKind: commands.recordOpenAnswerEvaluatorJobEvidence({
          evaluatorJobId: "evaluator-run-1",
          leaseId: "lease-1",
          workerId: "worker-a",
        }),
        unsafeSummary: commands.recordOpenAnswerEvaluatorJobEvidence({
          evaluatorJobId: "evaluator-run-1",
          leaseId: "lease-1",
          workerId: "worker-a",
          evidenceKind: "criterion_match",
          redactedSummary: "raw prompt leaked",
        }),
        rawArtifacts: commands.recordOpenAnswerEvaluatorJobEvidence({
          evaluatorJobId: "evaluator-run-1",
          leaseId: "lease-1",
          workerId: "worker-a",
          evidenceKind: "criterion_match",
          redactedSummary: "Matched accepted criterion.",
          rawModelResponse: "select * from hidden_table",
        }),
        evidence: listOpenAnswerEvaluatorEvidenceRecords(database, {}),
      },
      {
        missingKind: { status: "rejected", reason: "validation_failed" },
        unsafeSummary: { status: "rejected", reason: "validation_failed" },
        rawArtifacts: {
          status: "accepted",
          value: {
            evidence: makeEvaluatorEvidenceSummary({
              redactedSummary: "Matched accepted criterion.",
            }),
          },
        },
        evidence: [
          makeEvaluatorEvidenceRecord({
            redactedSummary: "Matched accepted criterion.",
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("completeOpenAnswerEvaluatorJob_shouldRecordFinalFeedbackAndMarkJobRunAndAttemptSucceeded_onValidLease", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "evaluation-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      budgetPolicy: { maxProviderCalls: 2 },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 300,
    });
    const acceptedBefore = projectAcceptedAssessmentState(database);

    const result = commands.completeOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      leaseId: "lease-1",
      workerId: "worker-a",
      summaryFeedback: " Good explanation. ",
      criterionFeedback: [makeCriterionFeedback({ feedback: " Criterion feedback " })],
      providerUsage: { providerCalls: 1 },
    });

    assert.deepEqual(
      {
        result,
        attempt: getOpenAnswerAttemptRecord(database, "attempt-1"),
        evaluation: getOpenAnswerEvaluationRecord(database, "evaluation-1"),
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
        job: projectEvaluatorJob(getOpenAnswerEvaluatorJobRecord(database, "evaluator-run-1")),
        run: listOpenAnswerEvaluatorRunRecords(database)[0],
        acceptedAfter: projectAcceptedAssessmentState(database),
      },
      {
        result: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluated" }),
            evaluatorJob: makeEvaluatorJobSummary({
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
              budgetPolicy: { maxProviderCalls: 2 },
              status: "succeeded",
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        attempt: makeAttemptRecord({ attemptId: "attempt-1", status: "evaluated" }),
        evaluation: makeEvaluationRecord({
          evaluationId: "evaluation-1",
          attemptId: "attempt-1",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
        }),
        failure: null,
        job: makeEvaluatorJobSummary({
          retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
          budgetPolicy: { maxProviderCalls: 2 },
          status: "succeeded",
        }),
        run: makeEvaluatorRunRecord({ status: "succeeded", completedAt: "2026-06-02T10:00:00.000Z" }),
        acceptedAfter: acceptedBefore,
      },
    );
  } finally {
    database.close();
  }
});

test("completeOpenAnswerEvaluatorJob_shouldBeIdempotentForEquivalentRepeatedCompletion", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "evaluation-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 300,
    });
    const input = {
      evaluatorJobId: "evaluator-run-1",
      leaseId: "lease-1",
      workerId: "worker-a",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
    };
    const first = commands.completeOpenAnswerEvaluatorJob(input);
    const second = commands.completeOpenAnswerEvaluatorJob(input);

    assert.deepEqual(
      {
        first,
        second,
        evaluations: listOpenAnswerEvaluationRecords(database),
      },
      {
        first: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluated" }),
            evaluatorJob: makeEvaluatorJobSummary({
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
              budgetPolicy: null,
              status: "succeeded",
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        second: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluated" }),
            evaluatorJob: makeEvaluatorJobSummary({
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
              budgetPolicy: null,
              status: "succeeded",
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        evaluations: [
          makeEvaluationRecord({
            evaluationId: "evaluation-1",
            attemptId: "attempt-1",
            summaryFeedback: "Good explanation.",
            criterionFeedback: [makeCriterionFeedback()],
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("completeOpenAnswerEvaluatorJob_shouldRejectRepeatedCompletion_onChangedCompletionSignature", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "evaluation-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "llm_assisted",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      budgetPolicy: { maxProviderCalls: 3 },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 300,
    });
    const input = {
      evaluatorJobId: "evaluator-run-1",
      leaseId: "lease-1",
      workerId: "worker-a",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
      providerUsage: { providerCalls: 1 },
      outputValidation: { validatorPolicyId: "validator-a", passed: true },
    };
    commands.completeOpenAnswerEvaluatorJob(input);

    assert.deepEqual(
      {
        changedWorker: commands.completeOpenAnswerEvaluatorJob({ ...input, workerId: "worker-b" }),
        changedLease: commands.completeOpenAnswerEvaluatorJob({ ...input, leaseId: "lease-2" }),
        changedProviderUsage: commands.completeOpenAnswerEvaluatorJob({
          ...input,
          providerUsage: { providerCalls: 2 },
        }),
        changedOutputValidation: commands.completeOpenAnswerEvaluatorJob({
          ...input,
          outputValidation: { validatorPolicyId: "validator-b", passed: true },
        }),
        evaluations: listOpenAnswerEvaluationRecords(database),
      },
      {
        changedWorker: { status: "rejected", reason: "evaluator_job_conflict" },
        changedLease: { status: "rejected", reason: "evaluator_job_conflict" },
        changedProviderUsage: { status: "rejected", reason: "evaluator_job_conflict" },
        changedOutputValidation: { status: "rejected", reason: "evaluator_job_conflict" },
        evaluations: [
          makeEvaluationRecord({
            evaluationId: "evaluation-1",
            attemptId: "attempt-1",
            summaryFeedback: "Good explanation.",
            criterionFeedback: [makeCriterionFeedback()],
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("completeOpenAnswerEvaluatorJob_shouldRejectBudgetExceededAndInvalidLlmOutputValidation", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "evaluator-run-1", "evaluator-run-2", "lease-1", "lease-2"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      budgetPolicy: { maxProviderCalls: 1 },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-2",
      evaluatorPathKind: "llm_assisted",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 300,
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-2",
      workerId: "worker-b",
      leaseDurationSeconds: 300,
    });

    assert.deepEqual(
      {
        budget: commands.completeOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-1",
          leaseId: "lease-1",
          workerId: "worker-a",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
          providerUsage: { providerCalls: 2 },
        }),
        outputValidation: commands.completeOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-2",
          leaseId: "lease-2",
          workerId: "worker-b",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
          outputValidation: { validatorPolicyId: "validator-a", passed: false },
        }),
        evaluations: listOpenAnswerEvaluationRecords(database),
      },
      {
        budget: { status: "rejected", reason: "evaluator_budget_exceeded" },
        outputValidation: { status: "rejected", reason: "evaluator_output_rejected" },
        evaluations: [],
      },
    );
  } finally {
    database.close();
  }
});

test("completeOpenAnswerEvaluatorJob_shouldRejectMalformedFeedbackAndLeaseConflicts", () => {
  let currentNow = new Date("2026-06-02T10:00:00.000Z");
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "evaluator-run-1", "evaluator-run-2", "lease-1"],
    now: () => currentNow,
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-2",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 60,
    });
    const malformedFeedback = commands.completeOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      leaseId: "lease-1",
      workerId: "worker-a",
      summaryFeedback: " ",
      criterionFeedback: [makeCriterionFeedback()],
    });
    currentNow = new Date("2026-06-02T10:02:00.000Z");

    assert.deepEqual(
      {
        malformedFeedback,
        expired: commands.completeOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-1",
          leaseId: "lease-1",
          workerId: "worker-a",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
        }),
        unclaimed: commands.completeOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-2",
          leaseId: "lease-1",
          workerId: "worker-a",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
        }),
        unknown: commands.completeOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-unknown",
          leaseId: "lease-1",
          workerId: "worker-a",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
        }),
      },
      {
        malformedFeedback: { status: "rejected", reason: "validation_failed" },
        expired: { status: "rejected", reason: "evaluator_job_lease_expired" },
        unclaimed: { status: "rejected", reason: "evaluator_job_not_claimed" },
        unknown: { status: "rejected", reason: "evaluator_job_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("failOpenAnswerEvaluatorJob_shouldScheduleRetryAndMakeDueRetryClaimable_onRequestedRetryRemaining", () => {
  let currentNow = new Date("2026-06-02T10:00:00.000Z");
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "lease-2"],
    now: () => currentNow,
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 3, backoffSeconds: [60, 300] },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 300,
    });

    const failed = commands.failOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      leaseId: "lease-1",
      workerId: "worker-a",
      reason: " provider outage ",
      retry: true,
    });
    const earlyClaim = commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-b",
      leaseDurationSeconds: 300,
    });
    currentNow = new Date("2026-06-02T10:01:00.000Z");

    assert.deepEqual(
      {
        failed,
        earlyClaim,
        dueClaim: commands.claimOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-1",
          workerId: "worker-b",
          leaseDurationSeconds: 300,
        }),
        attempt: getOpenAnswerAttemptRecord(database, "attempt-1"),
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
        run: listOpenAnswerEvaluatorRunRecords(database)[0],
      },
      {
        failed: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluating" }),
            evaluatorJob: makeEvaluatorJobSummary({
              status: "retry_waiting",
              attemptNumber: 2,
              retryPolicy: { maxAttempts: 3, backoffSeconds: [60, 300] },
              budgetPolicy: null,
              nextRetryAt: "2026-06-02T10:01:00.000Z",
              failureReason: "provider outage",
            }),
          },
        },
        earlyClaim: { status: "rejected", reason: "evaluator_job_conflict" },
        dueClaim: {
          status: "accepted",
          value: {
            evaluatorJob: makeEvaluatorJobSummary({
              status: "leased",
              attemptNumber: 2,
              retryPolicy: { maxAttempts: 3, backoffSeconds: [60, 300] },
              budgetPolicy: null,
              lease: makeEvaluatorLease({
                leaseId: "lease-2",
                workerId: "worker-b",
                claimedAt: "2026-06-02T10:01:00.000Z",
                expiresAt: "2026-06-02T10:06:00.000Z",
              }),
              updatedAt: "2026-06-02T10:01:00.000Z",
            }),
            lease: makeEvaluatorLease({
              leaseId: "lease-2",
              workerId: "worker-b",
              claimedAt: "2026-06-02T10:01:00.000Z",
              expiresAt: "2026-06-02T10:06:00.000Z",
            }),
          },
        },
        attempt: makeAttemptRecord({ attemptId: "attempt-1", status: "evaluating" }),
        failure: null,
        run: makeEvaluatorRunRecord({
          status: "failed",
          failedAt: "2026-06-02T10:00:00.000Z",
          failureReason: "provider outage",
        }),
      },
    );
  } finally {
    database.close();
  }
});

test("failOpenAnswerEvaluatorJob_shouldRecordFinalFailure_onNoRetryOrExhaustedRetry", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "evaluator-run-1", "evaluator-run-2", "lease-1", "lease-2"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-2",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 300,
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-2",
      workerId: "worker-b",
      leaseDurationSeconds: 300,
    });

    assert.deepEqual(
      {
        noRetry: commands.failOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-1",
          leaseId: "lease-1",
          workerId: "worker-a",
          reason: "provider outage",
          retry: false,
        }),
        exhausted: commands.failOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-2",
          leaseId: "lease-2",
          workerId: "worker-b",
          reason: "model unavailable",
          retry: true,
        }),
        failures: [
          getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
          getOpenAnswerEvaluationFailureRecord(database, "attempt-2"),
        ],
        jobs: [
          projectEvaluatorJob(getOpenAnswerEvaluatorJobRecord(database, "evaluator-run-1")),
          projectEvaluatorJob(getOpenAnswerEvaluatorJobRecord(database, "evaluator-run-2")),
        ],
      },
      {
        noRetry: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluation_failed" }),
            evaluatorJob: makeEvaluatorJobSummary({
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
              budgetPolicy: null,
              status: "failed",
              failureReason: "provider outage",
            }),
            evaluationFailure: makeEvaluationFailureSummary({ reason: "provider outage" }),
          },
        },
        exhausted: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-2", status: "evaluation_failed" }),
            evaluatorJob: makeEvaluatorJobSummary({
              evaluatorJobId: "evaluator-run-2",
              evaluatorRunId: "evaluator-run-2",
              attemptId: "attempt-2",
              retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
              budgetPolicy: null,
              status: "failed",
              failureReason: "model unavailable",
            }),
            evaluationFailure: makeEvaluationFailureSummary({
              attemptId: "attempt-2",
              reason: "model unavailable",
            }),
          },
        },
        failures: [
          { attemptId: "attempt-1", reason: "provider outage", failedAt: "2026-06-02T10:00:00.000Z" },
          { attemptId: "attempt-2", reason: "model unavailable", failedAt: "2026-06-02T10:00:00.000Z" },
        ],
        jobs: [
          makeEvaluatorJobSummary({
            retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
            budgetPolicy: null,
            status: "failed",
            failureReason: "provider outage",
          }),
          makeEvaluatorJobSummary({
            evaluatorJobId: "evaluator-run-2",
            evaluatorRunId: "evaluator-run-2",
            attemptId: "attempt-2",
            retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
            budgetPolicy: null,
            status: "failed",
            failureReason: "model unavailable",
          }),
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("cancelOpenAnswerEvaluatorJob_shouldRestoreAttemptAndBlockLaterWorkerOperations", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "attempt-3", "evaluator-run-1", "evaluator-run-2", "evaluator-run-3", "lease-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    submitAttempt(commands, { idempotencyKey: "submit-c" });
    commands.recordOpenAnswerEvaluationFailure({
      attemptId: "attempt-2",
      reason: "previous failure",
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-2",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
    });
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-3",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-3",
      workerId: "worker-a",
      leaseDurationSeconds: 300,
    });

    assert.deepEqual(
      {
        waiting: commands.cancelOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-1",
          reason: "request withdrawn",
        }),
        priorFailure: commands.cancelOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-2",
          reason: "request withdrawn",
        }),
        leased: commands.cancelOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-3",
          reason: "request withdrawn",
        }),
        staleFailure: commands.failOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-3",
          leaseId: "lease-1",
          workerId: "worker-a",
          reason: "provider outage",
          retry: false,
        }),
        staleCompletion: commands.completeOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-3",
          leaseId: "lease-1",
          workerId: "worker-a",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback({ criterionRevisionId: "criterion-revision-a" })],
        }),
        staleRenewal: commands.renewOpenAnswerEvaluatorJobLease({
          evaluatorJobId: "evaluator-run-3",
          leaseId: "lease-1",
          workerId: "worker-a",
          leaseDurationSeconds: 300,
        }),
        attempts: listOpenAnswerAttemptRecords(database, { programId: "program-a" }),
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-2"),
      },
      {
        waiting: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "submitted" }),
            evaluatorJob: makeEvaluatorJobSummary({
              status: "cancelled",
              retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
              budgetPolicy: null,
              cancellationReason: "request withdrawn",
            }),
          },
        },
        priorFailure: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-2", status: "evaluation_failed" }),
            evaluatorJob: makeEvaluatorJobSummary({
              evaluatorJobId: "evaluator-run-2",
              evaluatorRunId: "evaluator-run-2",
              attemptId: "attempt-2",
              status: "cancelled",
              retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
              budgetPolicy: null,
              cancellationReason: "request withdrawn",
            }),
          },
        },
        leased: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-3", status: "submitted" }),
            evaluatorJob: makeEvaluatorJobSummary({
              evaluatorJobId: "evaluator-run-3",
              evaluatorRunId: "evaluator-run-3",
              attemptId: "attempt-3",
              status: "cancelled",
              retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
              budgetPolicy: null,
              cancellationReason: "request withdrawn",
            }),
          },
        },
        staleFailure: { status: "rejected", reason: "evaluator_job_conflict" },
        staleCompletion: { status: "rejected", reason: "evaluator_job_conflict" },
        staleRenewal: { status: "rejected", reason: "evaluator_job_not_claimed" },
        attempts: [
          makeAttemptRecord({ attemptId: "attempt-1", status: "submitted" }),
          {
            ...makeAttemptRecord({ attemptId: "attempt-2", status: "evaluation_failed" }),
            idempotencyKey: "submit-b",
          },
          {
            ...makeAttemptRecord({ attemptId: "attempt-3", status: "submitted" }),
            idempotencyKey: "submit-c",
          },
        ],
        failure: {
          attemptId: "attempt-2",
          reason: "previous failure",
          failedAt: "2026-06-02T10:00:00.000Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("cancelOpenAnswerEvaluatorJob_shouldCancelRetryWaitingJobAndRestoreSubmittedAttempt", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 300,
    });
    commands.failOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      leaseId: "lease-1",
      workerId: "worker-a",
      reason: "provider outage",
      retry: true,
    });

    assert.deepEqual(
      {
        cancelled: commands.cancelOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-1",
          reason: "request withdrawn",
        }),
        job: projectEvaluatorJob(getOpenAnswerEvaluatorJobRecord(database, "evaluator-run-1")),
        attempt: getOpenAnswerAttemptRecord(database, "attempt-1"),
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
      },
      {
        cancelled: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "submitted" }),
            evaluatorJob: makeEvaluatorJobSummary({
              status: "cancelled",
              attemptNumber: 2,
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
              budgetPolicy: null,
              cancellationReason: "request withdrawn",
            }),
          },
        },
        job: makeEvaluatorJobSummary({
          status: "cancelled",
          attemptNumber: 2,
          retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
          budgetPolicy: null,
          cancellationReason: "request withdrawn",
        }),
        attempt: makeAttemptRecord({ attemptId: "attempt-1", status: "submitted" }),
        failure: null,
      },
    );
  } finally {
    database.close();
  }
});

test("timeOutOpenAnswerEvaluatorJob_shouldFailExpiredLeaseAndRejectUnexpiredTerminalAndStaleWorkerCalls", () => {
  let currentNow = new Date("2026-06-02T10:00:00.000Z");
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "attempt-3", "evaluator-run-1", "evaluator-run-2", "evaluator-run-3", "lease-1", "lease-2"],
    now: () => currentNow,
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "submit-a" });
    submitAttempt(commands, { idempotencyKey: "submit-b" });
    submitAttempt(commands, { idempotencyKey: "submit-c" });
    for (const attemptId of ["attempt-1", "attempt-2", "attempt-3"]) {
      commands.scheduleOpenAnswerEvaluatorJob({
        attemptId,
        evaluatorPathKind: "deterministic",
        evaluatorPolicyId: "policy-a",
        retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
      });
    }
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 60,
    });
    commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-2",
      workerId: "worker-b",
      leaseDurationSeconds: 300,
    });
    commands.cancelOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-3",
      reason: "request withdrawn",
    });
    const unexpired = commands.timeOutOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-2",
      reason: "lease timeout",
    });
    currentNow = new Date("2026-06-02T10:02:00.000Z");

    assert.deepEqual(
      {
        unexpired,
        expired: commands.timeOutOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-1",
          reason: " lease timeout ",
        }),
        terminal: commands.timeOutOpenAnswerEvaluatorJob({
          evaluatorJobId: "evaluator-run-3",
          reason: "lease timeout",
        }),
        staleEvidence: commands.recordOpenAnswerEvaluatorJobEvidence({
          evaluatorJobId: "evaluator-run-1",
          leaseId: "lease-1",
          workerId: "worker-a",
          evidenceKind: "criterion_match",
        }),
        attempt: getOpenAnswerAttemptRecord(database, "attempt-1"),
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
        job: projectEvaluatorJob(getOpenAnswerEvaluatorJobRecord(database, "evaluator-run-1")),
      },
      {
        unexpired: { status: "rejected", reason: "evaluator_job_lease_active" },
        expired: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-1",
              status: "evaluation_failed",
              updatedAt: "2026-06-02T10:02:00.000Z",
            }),
            evaluatorJob: makeEvaluatorJobSummary({
              status: "timed_out",
              retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
              budgetPolicy: null,
              timeoutReason: "lease timeout",
              updatedAt: "2026-06-02T10:02:00.000Z",
            }),
            evaluationFailure: makeEvaluationFailureSummary({
              reason: "lease timeout",
              failedAt: "2026-06-02T10:02:00.000Z",
            }),
          },
        },
        terminal: { status: "rejected", reason: "evaluator_job_conflict" },
        staleEvidence: { status: "rejected", reason: "evaluator_job_conflict" },
        attempt: makeAttemptRecord({
          attemptId: "attempt-1",
          status: "evaluation_failed",
          updatedAt: "2026-06-02T10:02:00.000Z",
        }),
        failure: {
          attemptId: "attempt-1",
          reason: "lease timeout",
          failedAt: "2026-06-02T10:02:00.000Z",
        },
        job: makeEvaluatorJobSummary({
          status: "timed_out",
          retryPolicy: { maxAttempts: 1, backoffSeconds: [] },
          budgetPolicy: null,
          timeoutReason: "lease timeout",
          updatedAt: "2026-06-02T10:02:00.000Z",
        }),
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

test("recordOpenAnswerEvaluatorEvidence_shouldRejectForbiddenRedactedSummaryDetails", () => {
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
          redactedSummary:
            "authorization header, raw model response, select * from table, /tmp/stack trace, postgres://database-url",
        }),
        evidence: listOpenAnswerEvaluatorEvidenceRecords(database),
      },
      {
        result: { status: "rejected", reason: "validation_failed" },
        evidence: [],
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

test("getOpenAnswerEvaluationStatus_shouldReturnOwnerStatusWithActiveRunEvidence", () => {
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
    commands.recordOpenAnswerEvaluatorEvidence({
      evaluatorRunId: "evaluator-run-1",
      evidenceKind: "criterion_match",
      redactedSummary: "Matched accepted criterion.",
    });

    const result = commands.getOpenAnswerEvaluationStatus?.({
      actingIdentityId: "identity-student",
      attemptId: "attempt-1",
    });

    assert.deepEqual(result, {
      status: "accepted",
      value: {
        attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluating" }),
        evaluatorRun: makeEvaluatorRunSummary(),
        evidence: [
          makeEvaluatorEvidenceSummary({ redactedSummary: "Matched accepted criterion." }),
        ],
      },
    });
  } finally {
    database.close();
  }
});

test("listOpenAnswerEvaluatorEvidence_shouldReturnOwnerEvidenceMetadata", () => {
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
    commands.recordOpenAnswerEvaluatorEvidence({
      evaluatorRunId: "evaluator-run-1",
      evidenceKind: "criterion_match",
      redactedSummary: "Matched accepted criterion.",
    });

    const result = commands.listOpenAnswerEvaluatorEvidence?.({
      actingIdentityId: "identity-student",
      evaluatorRunId: "evaluator-run-1",
    });

    assert.deepEqual(result, {
      status: "accepted",
      value: {
        evidence: [
          makeEvaluatorEvidenceSummary({ redactedSummary: "Matched accepted criterion." }),
        ],
      },
    });
  } finally {
    database.close();
  }
});

test("getOpenAnswerEvaluationStatus_shouldOmitTerminalRunsAndReturnFinalEvaluation", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "evidence-1", "evaluation-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });
    commands.recordOpenAnswerEvaluatorEvidence({
      evaluatorRunId: "evaluator-run-1",
      evidenceKind: "criterion_match",
      redactedSummary: "Matched accepted criterion.",
    });
    commands.completeOpenAnswerEvaluatorRun({
      evaluatorRunId: "evaluator-run-1",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
    });

    const result = commands.getOpenAnswerEvaluationStatus({
      actingIdentityId: "identity-student",
      attemptId: "attempt-1",
    });

    assert.deepEqual(result, {
      status: "accepted",
      value: {
        attempt: makeAttemptSummary({ attemptId: "attempt-1", status: "evaluated" }),
        evidence: [],
        evaluation: makeEvaluationSummary({
          evaluationId: "evaluation-1",
          attemptId: "attempt-1",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
        }),
      },
    });
  } finally {
    database.close();
  }
});

test("getOpenAnswerEvaluationStatus_shouldReturnActiveFailure", () => {
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
    commands.failOpenAnswerEvaluatorRun({
      evaluatorRunId: "evaluator-run-1",
      reason: "temporary evaluator outage",
    });

    const result = commands.getOpenAnswerEvaluationStatus({
      actingIdentityId: "identity-student",
      attemptId: "attempt-1",
    });

    assert.deepEqual(result, {
      status: "accepted",
      value: {
        attempt: makeAttemptSummary({
          attemptId: "attempt-1",
          status: "evaluation_failed",
        }),
        evidence: [],
        evaluationFailure: makeEvaluationFailureSummary({ reason: "temporary evaluator outage" }),
      },
    });
  } finally {
    database.close();
  }
});

test("evaluationStatusAndEvidenceReads_shouldRejectInactiveUnknownAndMissingTargets", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
    submitAttempt(commands);
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });

    assert.deepEqual(
      {
        statusUnknownIdentity: commands.getOpenAnswerEvaluationStatus({
          actingIdentityId: "identity-unknown",
          attemptId: "attempt-1",
        }),
        statusInactiveIdentity: commands.getOpenAnswerEvaluationStatus({
          actingIdentityId: "identity-disabled",
          attemptId: "attempt-1",
        }),
        statusUnknownAttempt: commands.getOpenAnswerEvaluationStatus({
          actingIdentityId: "identity-student",
          attemptId: "attempt-unknown",
        }),
        evidenceUnknownIdentity: commands.listOpenAnswerEvaluatorEvidence({
          actingIdentityId: "identity-unknown",
          evaluatorRunId: "evaluator-run-1",
        }),
        evidenceInactiveIdentity: commands.listOpenAnswerEvaluatorEvidence({
          actingIdentityId: "identity-disabled",
          evaluatorRunId: "evaluator-run-1",
        }),
        evidenceUnknownRun: commands.listOpenAnswerEvaluatorEvidence({
          actingIdentityId: "identity-student",
          evaluatorRunId: "evaluator-run-unknown",
        }),
      },
      {
        statusUnknownIdentity: { status: "rejected", reason: "identity_not_active" },
        statusInactiveIdentity: { status: "rejected", reason: "identity_not_active" },
        statusUnknownAttempt: { status: "rejected", reason: "attempt_not_found" },
        evidenceUnknownIdentity: { status: "rejected", reason: "identity_not_active" },
        evidenceInactiveIdentity: { status: "rejected", reason: "identity_not_active" },
        evidenceUnknownRun: { status: "rejected", reason: "evaluator_run_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("evaluationStatusAndEvidenceReads_shouldHideAttemptsFromNonOwners", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
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
    submitAttempt(commands);
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });

    assert.deepEqual(
      {
        statusOtherStudent: commands.getOpenAnswerEvaluationStatus({
          actingIdentityId: "identity-active-other",
          attemptId: "attempt-1",
        }),
        statusCurator: commands.getOpenAnswerEvaluationStatus({
          actingIdentityId: "identity-curator",
          attemptId: "attempt-1",
        }),
        statusAdmin: commands.getOpenAnswerEvaluationStatus({
          actingIdentityId: "identity-admin",
          attemptId: "attempt-1",
        }),
        evidenceOtherStudent: commands.listOpenAnswerEvaluatorEvidence({
          actingIdentityId: "identity-active-other",
          evaluatorRunId: "evaluator-run-1",
        }),
        evidenceCurator: commands.listOpenAnswerEvaluatorEvidence({
          actingIdentityId: "identity-curator",
          evaluatorRunId: "evaluator-run-1",
        }),
        evidenceAdmin: commands.listOpenAnswerEvaluatorEvidence({
          actingIdentityId: "identity-admin",
          evaluatorRunId: "evaluator-run-1",
        }),
      },
      {
        statusOtherStudent: { status: "rejected", reason: "attempt_not_found" },
        statusCurator: { status: "rejected", reason: "attempt_not_found" },
        statusAdmin: { status: "rejected", reason: "attempt_not_found" },
        evidenceOtherStudent: { status: "rejected", reason: "attempt_not_found" },
        evidenceCurator: { status: "rejected", reason: "attempt_not_found" },
        evidenceAdmin: { status: "rejected", reason: "attempt_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("evaluationStatusAndEvidenceReads_shouldNotExposeSecretsOrDiagnostics", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "evidence-1"],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands, { idempotencyKey: "sensitive-idempotency-key" });
    commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });
    commands.recordOpenAnswerEvaluatorEvidence({
      evaluatorRunId: "evaluator-run-1",
      evidenceKind: "criterion_match",
      redactedSummary: "Allowed bounded summary.",
      rawPrompt: "raw prompt with correct horse battery staple",
      rawModelResponse: "raw model response with operator-secret",
      modelMetadata: { endpoint: "127.0.0.1", authorization: "Bearer token" },
      evaluatorDiagnostics: "select * from internal_table",
      stackTrace: "/tmp/stack trace",
      databaseUrl: "postgres://database-url",
    });

    const status = commands.getOpenAnswerEvaluationStatus({
      actingIdentityId: "identity-student",
      attemptId: "attempt-1",
    });
    const evidence = commands.listOpenAnswerEvaluatorEvidence({
      actingIdentityId: "identity-student",
      evaluatorRunId: "evaluator-run-1",
    });
    const rejected = commands.listOpenAnswerEvaluatorEvidence({
      actingIdentityId: "identity-active-other",
      evaluatorRunId: "evaluator-run-1",
    });

    assert.deepEqual(containsForbiddenDetail([status, evidence, rejected]), false);
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

test("evaluatorRunTerminalCommands_shouldRevalidateRunStatus_insideTransaction", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "attempt-2", "attempt-3", "evaluator-run-1", "evaluator-run-2", "evaluator-run-3", "evaluation-1"],
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
    const transaction = database.transaction.bind(database);
    database.transaction = callback =>
      transaction(() => {
        updateOpenAnswerEvaluatorRunStatus(database, {
          evaluatorRunId: "evaluator-run-1",
          status: "failed",
          failedAt: "2026-06-02T10:01:00.000Z",
          failureReason: "temporary evaluator outage",
        });
        updateOpenAnswerEvaluatorRunStatus(database, {
          evaluatorRunId: "evaluator-run-2",
          status: "succeeded",
          completedAt: "2026-06-02T10:01:00.000Z",
        });
        updateOpenAnswerEvaluatorRunStatus(database, {
          evaluatorRunId: "evaluator-run-3",
          status: "cancelled",
          failedAt: "2026-06-02T10:01:00.000Z",
          failureReason: "evaluator cancelled by requester",
        });
        return callback();
      });

    assert.deepEqual(
      {
        complete: commands.completeOpenAnswerEvaluatorRun({
          evaluatorRunId: "evaluator-run-1",
          summaryFeedback: "Good explanation.",
          criterionFeedback: [makeCriterionFeedback()],
        }),
        fail: commands.failOpenAnswerEvaluatorRun({
          evaluatorRunId: "evaluator-run-2",
          reason: "temporary evaluator outage",
        }),
        cancel: commands.cancelOpenAnswerEvaluatorRun({
          evaluatorRunId: "evaluator-run-3",
          reason: "evaluator cancelled by requester",
        }),
        evaluation: getOpenAnswerEvaluationRecord(database, "evaluation-1"),
        failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-2"),
      },
      {
        complete: { status: "rejected", reason: "evaluator_run_conflict" },
        fail: { status: "rejected", reason: "evaluator_run_conflict" },
        cancel: { status: "rejected", reason: "evaluator_run_conflict" },
        evaluation: null,
        failure: null,
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
      "cancelOpenAnswerEvaluatorJob",
      "cancelOpenAnswerEvaluatorRun",
      "claimOpenAnswerEvaluatorJob",
      "completeOpenAnswerEvaluatorJob",
      "completeOpenAnswerEvaluatorRun",
      "failOpenAnswerEvaluatorJob",
      "failOpenAnswerEvaluatorRun",
      "getLearnerStateProgramSummary",
      "getLearnerStateTargetDetail",
      "getOpenAnswerAttempt",
      "getOpenAnswerEvaluationStatus",
      "getOpenAnswerEvaluatorJob",
      "getQuickCheckAttempt",
      "getReadinessCheckAttempt",
      "listClaimableOpenAnswerEvaluatorJobs",
      "listOpenAnswerAttempts",
      "listOpenAnswerEvaluatorEvidence",
      "listQuickCheckAttempts",
      "listReadinessCheckAttempts",
      "listReadinessCheckDeliveries",
      "markOpenAnswerAttemptEvaluating",
      "recordOpenAnswerEvaluation",
      "recordOpenAnswerEvaluationFailure",
      "recordOpenAnswerEvaluatorEvidence",
      "recordOpenAnswerEvaluatorJobEvidence",
      "renewOpenAnswerEvaluatorJobLease",
      "runOpenAnswerEvaluatorWorkerOnce",
      "scheduleOpenAnswerEvaluatorJob",
      "submitOpenAnswerAttempt",
      "submitQuickCheckAttempt",
      "submitReadinessCheckAttempt",
      "timeOutOpenAnswerEvaluatorJob",
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

test("studentWorkspaceEvaluationStatusEvidenceExecutableAcceptance_shouldCoverDomainFlow", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "evidence-1", "evaluation-1"],
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
    const started = commands.beginOpenAnswerEvaluatorRun({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
    });
    const evidence = commands.recordOpenAnswerEvaluatorEvidence({
      evaluatorRunId: "evaluator-run-1",
      evidenceKind: "criterion_match",
      redactedSummary: "Matched accepted criterion.",
    });
    const activeStatus = commands.getOpenAnswerEvaluationStatus({
      actingIdentityId: "identity-student",
      attemptId: "attempt-1",
    });
    const completed = commands.completeOpenAnswerEvaluatorRun({
      evaluatorRunId: "evaluator-run-1",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
    });
    const finalStatus = commands.getOpenAnswerEvaluationStatus({
      actingIdentityId: "identity-student",
      attemptId: "attempt-1",
    });
    const ownerEvidence = commands.listOpenAnswerEvaluatorEvidence({
      actingIdentityId: "identity-student",
      evaluatorRunId: "evaluator-run-1",
    });
    const nonOwnerStatus = commands.getOpenAnswerEvaluationStatus({
      actingIdentityId: "identity-active-other",
      attemptId: "attempt-1",
    });
    const nonOwnerEvidence = commands.listOpenAnswerEvaluatorEvidence({
      actingIdentityId: "identity-active-other",
      evaluatorRunId: "evaluator-run-1",
    });

    assert.deepEqual(
      {
        submitted,
        started,
        evidence,
        activeStatus,
        completed,
        finalStatus,
        ownerEvidence,
        nonOwnerStatus,
        nonOwnerEvidence,
        redacted: containsForbiddenDetail([
          submitted,
          started,
          evidence,
          activeStatus,
          completed,
          finalStatus,
          ownerEvidence,
          nonOwnerStatus,
          nonOwnerEvidence,
        ]),
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
        started: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-1",
              status: "evaluating",
              submittedAnswer: "Initial answer",
            }),
            evaluatorRun: makeEvaluatorRunSummary(),
          },
        },
        evidence: {
          status: "accepted",
          value: {
            evidence: makeEvaluatorEvidenceSummary({
              redactedSummary: "Matched accepted criterion.",
            }),
          },
        },
        activeStatus: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-1",
              status: "evaluating",
              submittedAnswer: "Initial answer",
            }),
            evaluatorRun: makeEvaluatorRunSummary(),
            evidence: [
              makeEvaluatorEvidenceSummary({ redactedSummary: "Matched accepted criterion." }),
            ],
          },
        },
        completed: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-1",
              status: "evaluated",
              submittedAnswer: "Initial answer",
            }),
            evaluatorRun: makeEvaluatorRunSummary({
              status: "succeeded",
              completedAt: "2026-06-02T10:00:00.000Z",
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        finalStatus: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-1",
              status: "evaluated",
              submittedAnswer: "Initial answer",
            }),
            evidence: [],
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        ownerEvidence: {
          status: "accepted",
          value: {
            evidence: [
              makeEvaluatorEvidenceSummary({ redactedSummary: "Matched accepted criterion." }),
            ],
          },
        },
        nonOwnerStatus: { status: "rejected", reason: "attempt_not_found" },
        nonOwnerEvidence: { status: "rejected", reason: "attempt_not_found" },
        redacted: false,
      },
    );
  } finally {
    database.close();
  }
});

test("studentWorkspaceEvaluatorOrchestrationExecutableAcceptance_shouldCoverFullJobFlow", () => {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "evidence-1", "evaluation-1"],
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
    const scheduled = commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      budgetPolicy: { maxProviderCalls: 2 },
    });
    const claimed = commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-a",
      leaseDurationSeconds: 300,
    });
    const evidence = commands.recordOpenAnswerEvaluatorJobEvidence({
      evaluatorJobId: "evaluator-run-1",
      leaseId: "lease-1",
      workerId: "worker-a",
      evidenceKind: "criterion_match",
      redactedSummary: "Matched accepted criterion.",
    });
    const renewed = commands.renewOpenAnswerEvaluatorJobLease({
      evaluatorJobId: "evaluator-run-1",
      leaseId: "lease-1",
      workerId: "worker-a",
      leaseDurationSeconds: 600,
    });
    const completionInput = {
      evaluatorJobId: "evaluator-run-1",
      leaseId: "lease-1",
      workerId: "worker-a",
      summaryFeedback: "Good explanation.",
      criterionFeedback: [makeCriterionFeedback()],
      providerUsage: { providerCalls: 1 },
    };
    const completed = commands.completeOpenAnswerEvaluatorJob(completionInput);
    const repeated = commands.completeOpenAnswerEvaluatorJob(completionInput);
    const terminalClaim = commands.claimOpenAnswerEvaluatorJob({
      evaluatorJobId: "evaluator-run-1",
      workerId: "worker-b",
      leaseDurationSeconds: 300,
    });
    const terminalEvidence = commands.recordOpenAnswerEvaluatorJobEvidence({
      evaluatorJobId: "evaluator-run-1",
      leaseId: "lease-1",
      workerId: "worker-a",
      evidenceKind: "criterion_match",
    });

    assert.deepEqual(
      {
        submitted,
        scheduled,
        claimed,
        evidence,
        renewed,
        completed,
        repeated,
        terminalClaim,
        terminalEvidence,
        evaluations: listOpenAnswerEvaluationRecords(database),
        redacted: containsForbiddenDetail([
          submitted,
          scheduled,
          claimed,
          evidence,
          renewed,
          completed,
          repeated,
          terminalClaim,
          terminalEvidence,
        ]),
        httpMutationExposed: containsAnyOutOfScopeStudentWorkspaceHttpMutation(
          readFileSync(new URL("../src/server.js", import.meta.url), "utf8"),
        ),
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
        scheduled: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-1",
              status: "evaluating",
              submittedAnswer: "Initial answer",
            }),
            evaluatorJob: makeEvaluatorJobSummary({
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
            }),
          },
        },
        claimed: {
          status: "accepted",
          value: {
            evaluatorJob: makeEvaluatorJobSummary({
              status: "leased",
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
              lease: makeEvaluatorLease(),
            }),
            lease: makeEvaluatorLease(),
          },
        },
        evidence: {
          status: "accepted",
          value: {
            evidence: makeEvaluatorEvidenceSummary({
              redactedSummary: "Matched accepted criterion.",
            }),
          },
        },
        renewed: {
          status: "accepted",
          value: {
            evaluatorJob: makeEvaluatorJobSummary({
              status: "leased",
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
              lease: makeEvaluatorLease({ expiresAt: "2026-06-02T10:10:00.000Z" }),
            }),
            lease: makeEvaluatorLease({ expiresAt: "2026-06-02T10:10:00.000Z" }),
          },
        },
        completed: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-1",
              status: "evaluated",
              submittedAnswer: "Initial answer",
            }),
            evaluatorJob: makeEvaluatorJobSummary({
              status: "succeeded",
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        repeated: {
          status: "accepted",
          value: {
            attempt: makeAttemptSummary({
              attemptId: "attempt-1",
              status: "evaluated",
              submittedAnswer: "Initial answer",
            }),
            evaluatorJob: makeEvaluatorJobSummary({
              status: "succeeded",
              retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
            }),
            evaluation: makeEvaluationSummary({
              evaluationId: "evaluation-1",
              attemptId: "attempt-1",
              summaryFeedback: "Good explanation.",
              criterionFeedback: [makeCriterionFeedback()],
            }),
          },
        },
        terminalClaim: { status: "rejected", reason: "evaluator_job_conflict" },
        terminalEvidence: { status: "rejected", reason: "evaluator_job_conflict" },
        evaluations: [
          makeEvaluationRecord({
            evaluationId: "evaluation-1",
            attemptId: "attempt-1",
            summaryFeedback: "Good explanation.",
            criterionFeedback: [makeCriterionFeedback()],
          }),
        ],
        redacted: false,
        httpMutationExposed: false,
      },
    );
  } finally {
    database.close();
  }
});

test("studentWorkspaceEvaluatorWorkerExecutableAcceptance_shouldCoverFullWorkerFlow", () => {
  const providerRequests = [];
  const restoredDatabase = openIdentityDatabase();
  initializeIdentityStorage(restoredDatabase);
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "evidence-1", "evaluation-1"],
    evaluatorPolicies: [makeEvaluatorPolicy()],
    providerAdapters: [
      makeProviderAdapter({
        providerCredential: "authorization bearer provider-secret",
        providerRequests,
        evaluate: providerRequest => {
          providerRequests.push(providerRequest);
          return makeProviderResult({
            providerUsage: { providerCalls: 1 },
            redactedEvidenceSummary: "Matched accepted criterion.",
          });
        },
      }),
    ],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    createProgramMembershipRecord(
      database,
      makeMembership({
        id: "membership-curator-a",
        programId: "program-a",
        identityId: "identity-curator",
        participationKind: "program_curator",
      }),
    );
    seedProtectedIdentityState(database);
    const submitted = submitAttempt(commands, { submittedAnswer: "Initial answer" });
    const scheduled = commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
      budgetPolicy: { maxProviderCalls: 2 },
    });
    const worker = commands.runOpenAnswerEvaluatorWorkerOnce({
      workerId: "worker-a",
      mode: "single_job",
      evaluatorJobId: "evaluator-run-1",
      leaseDurationSeconds: 300,
    });
    const repeated = commands.runOpenAnswerEvaluatorWorkerOnce({
      workerId: "worker-a",
      mode: "single_job",
      evaluatorJobId: "evaluator-run-1",
      leaseDurationSeconds: 300,
    });
    const backup = exportIdentityBackup(database);
    restoreIdentityBackup(restoredDatabase, backup);
    const evidence = listOpenAnswerEvaluatorEvidenceRecords(database);
    const evaluations = listOpenAnswerEvaluationRecords(database);

    assert.deepEqual(
      {
        providerRequests,
        submitted: submitted.status,
        scheduled: scheduled.status,
        worker: worker.value.summary,
        repeated,
        evidence,
        evaluations,
        backupContainsForbiddenEvaluatorArtifact: containsForbiddenEvaluatorArtifactDetail(backup),
        restoredEvidence: listOpenAnswerEvaluatorEvidenceRecords(restoredDatabase),
        restoredEvaluations: listOpenAnswerEvaluationRecords(restoredDatabase),
        redacted: containsForbiddenDetail([worker, repeated, evidence, evaluations]),
        exposesOutOfScopeSurfaces: containsAnyOutOfScopeEvaluatorWorkerSurface({
          adminUiSource: readFileSync(new URL("../src/admin-ui.js", import.meta.url), "utf8"),
          cliSource: readFileSync(new URL("../src/cli.js", import.meta.url), "utf8"),
          serverSource: readFileSync(new URL("../src/server.js", import.meta.url), "utf8"),
          workspaceSource: readFileSync(new URL("../src/student-workspace.js", import.meta.url), "utf8"),
        }),
      },
      {
        providerRequests: [
          {
            evaluatorJobId: "evaluator-run-1",
            attemptId: "attempt-1",
            programId: "program-a",
            studentIdentityId: "identity-student",
            checkRevisionId: "check-revision-a",
            criterionRevisionIds: ["criterion-revision-a"],
            submittedAnswer: "Initial answer",
            acceptedCheckRevision: {
              revisionId: "check-revision-a",
              title: "Accepted check check-revision-a",
              prompt: "Accepted prompt check-revision-a",
            },
            acceptedCriterionRevisions: [
              {
                revisionId: "criterion-revision-a",
                title: "Accepted criterion criterion-revision-a",
                body: "Accepted criterion body criterion-revision-a",
              },
            ],
            evaluatorPolicyId: "policy-a",
            outputValidatorPolicyId: "validator-a",
          },
        ],
        submitted: "accepted",
        scheduled: "accepted",
        worker: makeEvaluatorWorkerSummary({
          mode: "single_job",
          evaluatorJobId: "evaluator-run-1",
          claimed: true,
          completed: true,
        }),
        repeated: { status: "rejected", reason: "evaluator_job_conflict" },
        evidence: [
          makeEvaluatorEvidenceRecord({
            redactedSummary: "Matched accepted criterion.",
          }),
        ],
        evaluations: [
          makeEvaluationRecord({
            evaluationId: "evaluation-1",
            attemptId: "attempt-1",
            summaryFeedback: "Good explanation.",
            criterionFeedback: [makeCriterionFeedback()],
          }),
        ],
        backupContainsForbiddenEvaluatorArtifact: false,
        restoredEvidence: [
          makeEvaluatorEvidenceRecord({
            redactedSummary: "Matched accepted criterion.",
          }),
        ],
        restoredEvaluations: [
          makeEvaluationRecord({
            evaluationId: "evaluation-1",
            attemptId: "attempt-1",
            summaryFeedback: "Good explanation.",
            criterionFeedback: [makeCriterionFeedback()],
          }),
        ],
        redacted: false,
        exposesOutOfScopeSurfaces: false,
      },
    );
  } finally {
    database.close();
    restoredDatabase.close();
  }
});

test("containsForbiddenEvaluatorArtifactDetail_shouldDetectForbiddenDetail_onBackupArtifact", () => {
  assert.deepEqual(
    [
      "authorization bearer provider-secret",
      "cookie header",
      "csrf token",
      "database-url",
      "diagnostic payload",
      "filesystem path",
      "hidden policy instructions",
      "postgres://database",
      "raw model response",
      "raw prompt",
      "reviewer note",
      "select * from attempts",
      "session identifier",
      "stack trace",
      "/tmp/provider-output",
    ].map(detail => containsForbiddenEvaluatorArtifactDetail({ detail })),
    Array.from({ length: 15 }, () => true),
  );
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
          "cancelOpenAnswerEvaluatorJob",
          "cancelOpenAnswerEvaluatorRun",
          "claimOpenAnswerEvaluatorJob",
          "completeOpenAnswerEvaluatorJob",
          "completeOpenAnswerEvaluatorRun",
          "failOpenAnswerEvaluatorJob",
          "failOpenAnswerEvaluatorRun",
          "getLearnerStateProgramSummary",
          "getLearnerStateTargetDetail",
          "getOpenAnswerAttempt",
          "getOpenAnswerEvaluationStatus",
          "getOpenAnswerEvaluatorJob",
          "getQuickCheckAttempt",
          "getReadinessCheckAttempt",
          "listClaimableOpenAnswerEvaluatorJobs",
          "listOpenAnswerAttempts",
          "listOpenAnswerEvaluatorEvidence",
          "listQuickCheckAttempts",
          "listReadinessCheckAttempts",
          "listReadinessCheckDeliveries",
          "markOpenAnswerAttemptEvaluating",
          "recordOpenAnswerEvaluation",
          "recordOpenAnswerEvaluationFailure",
          "recordOpenAnswerEvaluatorEvidence",
          "recordOpenAnswerEvaluatorJobEvidence",
          "renewOpenAnswerEvaluatorJobLease",
          "runOpenAnswerEvaluatorWorkerOnce",
          "scheduleOpenAnswerEvaluatorJob",
          "submitOpenAnswerAttempt",
          "submitQuickCheckAttempt",
          "submitReadinessCheckAttempt",
          "timeOutOpenAnswerEvaluatorJob",
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
  updatedAt = "2026-06-02T10:00:00.000Z",
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
    updatedAt,
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

function makeQuickCheckCandidate({
  id,
  programId,
  sourceIds = [],
  status = "accepted",
  options = [
    { id: `${id}-option-a`, text: "Candidate option A" },
    { id: `${id}-option-b`, text: "Candidate option B" },
  ],
  answerKeyOptionId = `${id}-option-a`,
}) {
  return {
    id,
    programId,
    checkKind: "single_select_quick_check",
    title: `Quick check ${id}`,
    prompt: `Quick prompt ${id}`,
    options,
    answerKeyOptionId,
    sourceIds,
    rationale: `Quick rationale ${id}`,
    status,
    createdByIdentityId: "identity-curator",
    createdAt: "2026-06-02T09:10:00.000Z",
    updatedAt: "2026-06-02T09:10:00.000Z",
  };
}

function makeAcceptedQuickCheckEntity({ id, programId, currentRevisionId }) {
  return {
    id,
    programId,
    currentRevisionId,
  };
}

function makeAcceptedQuickCheckRevision({
  id,
  entityId,
  programId,
  acceptedFromCandidateId = "quick-check-candidate-a",
  sourceIds = ["quick-check-source-a"],
  options = [
    { id: `${id}-option-a`, text: "Accepted option A" },
    { id: `${id}-option-b`, text: "Accepted option B" },
  ],
  answerKeyOptionId = `${id}-option-a`,
}) {
  return {
    id,
    entityId,
    programId,
    checkKind: "single_select_quick_check",
    title: `Accepted quick check ${id}`,
    prompt: `Accepted quick prompt ${id}`,
    options,
    answerKeyOptionId,
    acceptedFromCandidateId,
    sourceIds,
    rationale: `Accepted quick rationale ${id}`,
    acceptedByIdentityId: "identity-curator",
    acceptedAt: "2026-06-02T09:20:00.000Z",
  };
}

function makeQuickCheckAttemptSummary({
  attemptId,
  checkRevisionId = "quick-check-revision-a",
  selectedOptionId,
  matched,
}) {
  return {
    attemptId,
    programId: "program-a",
    studentIdentityId: "identity-student",
    checkRevisionId,
    selectedOptionId,
    matched,
    submittedAt: "2026-06-02T10:00:00.000Z",
  };
}

function projectQuickCheckAttemptResult(attempt) {
  return {
    attemptId: attempt.attemptId,
    checkRevisionId: attempt.checkRevisionId,
    selectedOptionId: attempt.selectedOptionId,
    matched: attempt.matched,
  };
}

function projectLearnerStateSummary(result) {
  const learnerState = result.value?.learnerState;
  return {
    status: result.status,
    level: learnerState?.level,
    totals: learnerState?.totals,
    weakAreas: learnerState?.weakAreas.map(projectLearnerStateTargetTuple),
    topics: learnerState?.topics.map(projectLearnerStateNavigationTargetTuple),
    concepts: learnerState?.concepts.map(projectLearnerStateNavigationTargetTuple),
    materialReferences: learnerState?.materialReferences.map(projectLearnerStateNavigationTargetTuple),
    checks: learnerState?.checks.map($0 => [$0.targetKind, $0.targetId, $0.level, $0.evidenceCount]),
    criteria: learnerState?.criteria.map(projectLearnerStateNavigationTargetTuple),
  };
}

function projectLearnerStateTargetDetail(result) {
  const target = result.value?.learnerStateTarget;
  return {
    status: result.status,
    target: target
      ? [target.targetKind, target.targetId, target.level, target.evidenceCount]
      : null,
    evidenceSignals: target?.evidence.map($0 => $0.signal),
    evidenceKinds: target?.evidence.map($0 => $0.sourceKind),
  };
}

function projectReadinessDeliveries(result) {
  return {
    status: result?.status,
    readinessChecks: result?.value?.readinessChecks.map($0 => ({
      entityId: $0.entityId,
      revisionId: $0.revisionId,
      title: $0.title,
      scopeKind: $0.scope.scopeKind,
      requirementTargets: $0.requirements.map(requirement => [
        requirement.targetKind,
        requirement.targetId,
        requirement.requiredLevel,
      ]),
    })),
  };
}

function projectReadinessAttempt(result) {
  return {
    status: result?.status,
    result: result?.value?.readinessCheckAttempt?.result,
    requirementResults: result?.value?.readinessCheckAttempt?.requirementResults.map($0 => [
      $0.targetKind,
      $0.targetId,
      $0.observedLevel,
      $0.result,
    ]),
  };
}

function projectReadinessAttemptList(result) {
  return {
    status: result?.status,
    attempts: result?.value?.readinessCheckAttempts.map($0 => [$0.attemptId, $0.result]),
  };
}

function projectLearnerStateTargetTuple(target) {
  return [target.targetKind, target.targetId, target.level];
}

function projectLearnerStateNavigationTargetTuple(target) {
  return [target.targetId, target.level, target.evidenceCount];
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

function makeEvaluatorJobSummary({
  evaluatorJobId = "evaluator-run-1",
  evaluatorRunId = "evaluator-run-1",
  attemptId = "attempt-1",
  evaluatorPathKind = "deterministic",
  evaluatorPolicyId = "policy-a",
  status = "waiting",
  attemptNumber = 1,
  retryPolicy = { maxAttempts: 3, backoffSeconds: [60, 300] },
  budgetPolicy = { maxProviderCalls: 2 },
  lease,
  nextRetryAt,
  cancellationReason,
  timeoutReason,
  failureReason,
  createdAt = "2026-06-02T10:00:00.000Z",
  updatedAt = "2026-06-02T10:00:00.000Z",
} = {}) {
  return {
    evaluatorJobId,
    evaluatorRunId,
    attemptId,
    programId: "program-a",
    studentIdentityId: "identity-student",
    checkRevisionId: "check-revision-a",
    criterionRevisionIds: ["criterion-revision-a"],
    evaluatorPathKind,
    evaluatorPolicyId,
    status,
    attemptNumber,
    retryPolicy,
    ...(budgetPolicy ? { budgetPolicy } : {}),
    ...(lease ? { lease } : {}),
    ...(nextRetryAt ? { nextRetryAt } : {}),
    ...(cancellationReason ? { cancellationReason } : {}),
    ...(timeoutReason ? { timeoutReason } : {}),
    ...(failureReason ? { failureReason } : {}),
    createdAt,
    updatedAt,
  };
}

function makeEvaluatorLease({
  leaseId = "lease-1",
  workerId = "worker-a",
  claimedAt = "2026-06-02T10:00:00.000Z",
  expiresAt = "2026-06-02T10:05:00.000Z",
} = {}) {
  return {
    leaseId,
    workerId,
    claimedAt,
    expiresAt,
  };
}

function makeEvaluatorWorkerSummary({
  mode,
  workerId = "worker-a",
  evaluatorJobId,
  claimed = false,
  completed = false,
  retried = false,
  failed = false,
  rejectionReason,
  failureReason,
}) {
  return {
    mode,
    workerId,
    ...(evaluatorJobId ? { evaluatorJobId } : {}),
    claimed,
    completed,
    retried,
    failed,
    ...(rejectionReason ? { rejectionReason } : {}),
    ...(failureReason ? { failureReason } : {}),
  };
}

function makeEvaluatorPolicy({
  evaluatorPolicyId = "policy-a",
  evaluatorPathKind = "deterministic",
  providerAdapterId = "adapter-a",
  outputValidatorPolicyId = "validator-a",
  promptInputPolicy = {
    includeSubmittedAnswer: true,
    includeAcceptedCheckRevision: true,
    includeAcceptedCriterionRevisions: true,
  },
  redactionPolicyId = "redaction-a",
  retryPolicy = { maxAttempts: 2, backoffSeconds: [60] },
  budgetPolicy,
  hiddenInstructions,
  rawArtifactPolicy = "none",
} = {}) {
  return {
    evaluatorPolicyId,
    evaluatorPathKind,
    providerAdapterId,
    outputValidatorPolicyId,
    promptInputPolicy,
    redactionPolicyId,
    retryPolicy,
    ...(budgetPolicy ? { budgetPolicy } : {}),
    ...(hiddenInstructions ? { hiddenInstructions } : {}),
    rawArtifactPolicy,
  };
}

function makeProviderAdapter({
  providerAdapterId = "adapter-a",
  evaluatorPathKind = "deterministic",
  evaluate,
  providerCredential,
  providerRequests,
} = {}) {
  return {
    providerAdapterId,
    evaluatorPathKind,
    ...(providerCredential ? { providerCredential } : {}),
    evaluate: evaluate ?? (providerRequest => {
      providerRequests?.push(providerRequest);
      return makeProviderResult();
    }),
  };
}

function makeProviderResult({
  summaryFeedback = "Good explanation.",
  criterionFeedback = [makeCriterionFeedback()],
  providerUsage,
  outputValidation = { validatorPolicyId: "validator-a", passed: true },
  redactedEvidenceSummary,
} = {}) {
  return {
    summaryFeedback,
    criterionFeedback,
    ...(providerUsage ? { providerUsage } : {}),
    outputValidation,
    ...(redactedEvidenceSummary !== undefined ? { redactedEvidenceSummary } : {}),
  };
}

function runProviderOutputWorker({
  budgetPolicy,
  evaluatorPathKind = "deterministic",
  evaluate,
  retryPolicy = { maxAttempts: 2, backoffSeconds: [60] },
}) {
  const { commands, database } = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1"],
    evaluatorPolicies: [makeEvaluatorPolicy({ evaluatorPathKind, retryPolicy })],
    providerAdapters: [makeProviderAdapter({ evaluate, evaluatorPathKind })],
  });

  try {
    seedStudentProgramWithAcceptedCheck(database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind,
      evaluatorPolicyId: "policy-a",
      retryPolicy,
      ...(budgetPolicy ? { budgetPolicy } : {}),
    });
    return {
      result: commands.runOpenAnswerEvaluatorWorkerOnce({
        workerId: "worker-a",
        mode: "single_job",
        evaluatorJobId: "evaluator-run-1",
        leaseDurationSeconds: 300,
      }),
      evaluations: listOpenAnswerEvaluationRecords(database),
      failure: getOpenAnswerEvaluationFailureRecord(database, "attempt-1"),
    };
  } finally {
    database.close();
  }
}

function makeProviderWorkerFailureResult({
  budgetPolicy,
  evaluatorPathKind = "deterministic",
  failureReason,
  retryPolicy = { maxAttempts: 2, backoffSeconds: [60] },
  terminal = false,
}) {
  return {
    result: {
      status: "accepted",
      value: {
        summary: makeEvaluatorWorkerSummary({
          mode: "single_job",
          evaluatorJobId: "evaluator-run-1",
          claimed: true,
          retried: !terminal,
          failed: terminal,
          failureReason,
        }),
        evaluatorJob: makeEvaluatorJobSummary({
          evaluatorPathKind,
          status: terminal ? "failed" : "retry_waiting",
          attemptNumber: terminal ? 1 : 2,
          retryPolicy,
          budgetPolicy: budgetPolicy ?? null,
          ...(terminal ? {} : { nextRetryAt: "2026-06-02T10:01:00.000Z" }),
          failureReason,
        }),
      },
    },
    evaluations: [],
    failure: terminal
      ? {
          attemptId: "attempt-1",
          reason: failureReason,
          failedAt: "2026-06-02T10:00:00.000Z",
        }
      : null,
  };
}

function runWorkerAfterProviderMutation({ mutate, providerResult = makeProviderResult() }) {
  let commands;
  let currentNow = new Date("2026-06-02T10:00:00.000Z");
  const sut = makeSUT({
    ids: ["attempt-1", "evaluator-run-1", "lease-1", "evaluation-1"],
    evaluatorPolicies: [makeEvaluatorPolicy()],
    now: () => currentNow,
    providerAdapters: [
      makeProviderAdapter({
        evaluate: () => {
          mutate({
            commands,
            database: sut.database,
            setNow: iso => {
              currentNow = new Date(iso);
            },
          });
          return providerResult;
        },
      }),
    ],
  });
  commands = sut.commands;

  try {
    seedStudentProgramWithAcceptedCheck(sut.database, { programId: "program-a" });
    submitAttempt(commands);
    commands.scheduleOpenAnswerEvaluatorJob({
      attemptId: "attempt-1",
      evaluatorPathKind: "deterministic",
      evaluatorPolicyId: "policy-a",
      retryPolicy: { maxAttempts: 2, backoffSeconds: [60] },
    });
    return {
      result: commands.runOpenAnswerEvaluatorWorkerOnce({
        workerId: "worker-a",
        mode: "single_job",
        evaluatorJobId: "evaluator-run-1",
        leaseDurationSeconds: 300,
      }),
      evidence: listOpenAnswerEvaluatorEvidenceRecords(sut.database),
      evaluations: listOpenAnswerEvaluationRecords(sut.database),
    };
  } finally {
    sut.database.close();
  }
}

function makeProviderWorkerRejectionResult(reason) {
  return {
    result: { status: "rejected", reason },
    evidence: [],
    evaluations: [],
  };
}

function projectEvaluatorJob(job) {
  return job
    ? {
        evaluatorJobId: job.evaluatorJobId,
        evaluatorRunId: job.evaluatorRunId,
        attemptId: job.attemptId,
        programId: job.programId,
        studentIdentityId: job.studentIdentityId,
        checkRevisionId: job.checkRevisionId,
        criterionRevisionIds: job.criterionRevisionIds,
        evaluatorPathKind: job.evaluatorPathKind,
        evaluatorPolicyId: job.evaluatorPolicyId,
        status: job.jobStatus,
        attemptNumber: job.attemptNumber,
        retryPolicy: job.retryPolicy,
        ...(job.budgetPolicy ? { budgetPolicy: job.budgetPolicy } : {}),
        ...(job.lease ? { lease: job.lease } : {}),
        ...(job.nextRetryAt ? { nextRetryAt: job.nextRetryAt } : {}),
        ...(job.cancellationReason ? { cancellationReason: job.cancellationReason } : {}),
        ...(job.timeoutReason ? { timeoutReason: job.timeoutReason } : {}),
        ...(job.jobFailureReason ? { failureReason: job.jobFailureReason } : {}),
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      }
    : null;
}

function makeEvaluatorEvidenceSummary({
  evidenceId = "evidence-1",
  evidenceKind = "criterion_match",
  redactedSummary,
  recordedAt = "2026-06-02T10:00:00.000Z",
} = {}) {
  return {
    evidenceId,
    evaluatorRunId: "evaluator-run-1",
    attemptId: "attempt-1",
    evidenceKind,
    visibility: "internal",
    ...(redactedSummary ? { redactedSummary } : {}),
    recordedAt,
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

function makeEvaluationFailureSummary({ reason, failedAt = "2026-06-02T10:00:00.000Z" }) {
  return {
    reason,
    failedAt,
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
  corpusIds = [
    "quick-check-candidate-command-a",
    "quick-check-candidate-command-a-option-a",
    "quick-check-candidate-command-a-option-b",
    "quick-check-entity-command-a",
    "quick-check-revision-command-a",
    "quick-check-revision-command-a-option-a",
    "quick-check-revision-command-a-option-b",
  ],
  ids = ["attempt-1", "attempt-2", "attempt-3"],
  evaluatorPolicies,
  now = () => new Date("2026-06-02T10:00:00.000Z"),
  providerAdapters,
} = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const programCommands = createProgramCommands({ database });
  const corpusCommands = createCorpusCommands({
    database,
    generateId: makeIdGenerator(corpusIds),
    getEffectiveParticipation: input => programCommands.getEffectiveParticipation(input),
    now,
  });
  createIdentity(database, makeIdentity({ id: "identity-active-other" }));
  const commands = createStudentWorkspaceCommands({
    database,
    evaluatorPolicies,
    generateId: makeIdGenerator(ids),
    getEffectiveParticipation: input => programCommands.getEffectiveParticipation(input),
    now,
    providerAdapters,
  });
  return { commands, corpusCommands, database };
}

function makeIdGenerator(ids) {
  const nextIds = [...ids];
  return () => nextIds.shift();
}

function makeAdvancingClock(startIso) {
  let tick = 0;
  const start = new Date(startIso).getTime();
  return () => new Date(start + tick++);
}

function seedLearnerStateNavigationGraph(database, { programId }) {
  createAcceptedNavigationTarget(database, {
    programId,
    entityId: "topic-entity-a",
    revisionId: "topic-revision-a",
    acceptedKind: "topic",
    title: "Topic target",
  });
  createAcceptedNavigationTarget(database, {
    programId,
    entityId: "concept-entity-a",
    revisionId: "concept-revision-a",
    acceptedKind: "concept",
    title: "Concept target",
  });
  createAcceptedNavigationTarget(database, {
    programId,
    entityId: "concept-entity-unused",
    revisionId: "concept-revision-unused",
    acceptedKind: "concept",
    title: "Accepted quick check quick-check-revision-a",
    sourceIds: ["quick-check-source-a"],
  });
  createAcceptedNavigationTarget(database, {
    programId,
    entityId: "material-entity-a",
    revisionId: "material-revision-a",
    acceptedKind: "material_reference",
    title: "Material target",
  });
  createCorpusCandidateRecord(database, {
    id: "relationship-candidate-topic-concept",
    programId,
    candidateKind: "relationship_update",
    title: "Topic concept relationship",
    body: null,
    materialReferenceKind: null,
    locator: null,
    citation: null,
    relationshipDrafts: [],
    sourceIds: [],
    rationale: null,
    status: "accepted",
    createdByIdentityId: "identity-curator",
    createdAt: "2026-06-02T09:32:00.000Z",
    updatedAt: "2026-06-02T09:32:00.000Z",
  });
  createAcceptedNavigationRelationshipRecord(database, {
    id: "relationship-topic-concept",
    programId,
    relationshipKind: "topic_includes_concept",
    fromEntityId: "topic-entity-a",
    toEntityId: "concept-entity-a",
    currentRevisionId: "relationship-topic-concept-revision",
  });
  createAcceptedNavigationRelationshipRevisionRecord(database, {
    id: "relationship-topic-concept-revision",
    relationshipId: "relationship-topic-concept",
    programId,
    relationshipKind: "topic_includes_concept",
    fromEntityId: "topic-entity-a",
    fromRevisionId: "topic-revision-a",
    fromKind: "topic",
    toEntityId: "concept-entity-a",
    toRevisionId: "concept-revision-a",
    toKind: "concept",
    label: "includes",
    sourceIds: [],
    acceptedFromCandidateId: "relationship-candidate-topic-concept",
    acceptedByIdentityId: "identity-curator",
    acceptedAt: "2026-06-02T09:33:00.000Z",
  });
}

function seedReadinessStudentProgram(database, { includeConceptReadiness = false, programId }) {
  seedStudentProgramWithAcceptedQuickCheck(database, { programId });
  seedStudentProgramWithAcceptedCheck(database, { programId });
  seedLearnerStateNavigationGraph(database, { programId });
  createReadinessCheckCandidateRecord(database, {
    id: "readiness-candidate-a",
    programId,
    title: "Topic readiness",
    scope: { scopeKind: "topic", topicEntityId: "topic-entity-a" },
    requirements: [
      {
        requirementId: "readiness-requirement-quick",
        targetKind: "quick_check",
        targetId: "quick-check-entity-a",
        requiredLevel: "on_track",
      },
      {
        requirementId: "readiness-requirement-concept",
        targetKind: "concept",
        targetId: "concept-entity-a",
        requiredLevel: "developing",
      },
    ],
    sourceIds: [],
    rationale: null,
    status: "accepted",
    createdByIdentityId: "identity-curator",
    createdAt: "2026-06-02T10:40:00.000Z",
    updatedAt: "2026-06-02T10:40:00.000Z",
  });
  createAcceptedReadinessCheckEntityRecord(database, {
    id: "readiness-entity-a",
    programId,
    currentRevisionId: "readiness-revision-a",
  });
  createAcceptedReadinessCheckRevisionRecord(database, {
    id: "readiness-revision-a",
    entityId: "readiness-entity-a",
    programId,
    title: "Topic readiness",
    scope: { scopeKind: "topic", topicEntityId: "topic-entity-a" },
    requirements: [
      {
        requirementId: "readiness-requirement-quick",
        targetKind: "quick_check",
        targetId: "quick-check-entity-a",
        requiredLevel: "on_track",
      },
      {
        requirementId: "readiness-requirement-concept",
        targetKind: "concept",
        targetId: "concept-entity-a",
        requiredLevel: "developing",
      },
    ],
    acceptedFromCandidateId: "readiness-candidate-a",
    sourceIds: [],
    rationale: null,
    acceptedByIdentityId: "identity-curator",
    acceptedAt: "2026-06-02T10:41:00.000Z",
  });
  if (includeConceptReadiness) {
    createReadinessCheckCandidateRecord(database, {
      id: "readiness-candidate-concept",
      programId,
      title: "Concept readiness",
      scope: { scopeKind: "topic", topicEntityId: "topic-entity-a" },
      requirements: [
        {
          requirementId: "readiness-requirement-concept-only",
          targetKind: "concept",
          targetId: "concept-entity-a",
          requiredLevel: "developing",
        },
      ],
      sourceIds: [],
      rationale: null,
      status: "accepted",
      createdByIdentityId: "identity-curator",
      createdAt: "2026-06-02T10:42:00.000Z",
      updatedAt: "2026-06-02T10:42:00.000Z",
    });
    createAcceptedReadinessCheckEntityRecord(database, {
      id: "readiness-entity-concept",
      programId,
      currentRevisionId: "readiness-revision-concept",
    });
    createAcceptedReadinessCheckRevisionRecord(database, {
      id: "readiness-revision-concept",
      entityId: "readiness-entity-concept",
      programId,
      title: "Concept readiness",
      scope: { scopeKind: "topic", topicEntityId: "topic-entity-a" },
      requirements: [
        {
          requirementId: "readiness-requirement-concept-only",
          targetKind: "concept",
          targetId: "concept-entity-a",
          requiredLevel: "developing",
        },
      ],
      acceptedFromCandidateId: "readiness-candidate-concept",
      sourceIds: [],
      rationale: null,
      acceptedByIdentityId: "identity-curator",
      acceptedAt: "2026-06-02T10:43:00.000Z",
    });
  }
}

function createAcceptedNavigationTarget(
  database,
  {
    programId,
    entityId,
    revisionId,
    acceptedKind,
    title,
    sourceIds = [],
  },
) {
  const candidateId = `candidate-${entityId}`;
  createCorpusCandidateRecord(database, {
    id: candidateId,
    programId,
    candidateKind: acceptedKind,
    title,
    body: acceptedKind === "material_reference" ? null : `${title} body`,
    materialReferenceKind: acceptedKind === "material_reference" ? "article" : null,
    locator: acceptedKind === "material_reference" ? `https://example.test/${entityId}` : null,
    citation: null,
    relationshipDrafts: [],
    sourceIds,
    rationale: null,
    status: "accepted",
    createdByIdentityId: "identity-curator",
    createdAt: "2026-06-02T09:30:00.000Z",
    updatedAt: "2026-06-02T09:30:00.000Z",
  });
  createAcceptedCorpusEntityRecord(database, {
    id: entityId,
    programId,
    acceptedKind,
    currentRevisionId: revisionId,
  });
  createAcceptedCorpusRevisionRecord(database, {
    id: revisionId,
    entityId,
    programId,
    acceptedKind,
    title,
    body: acceptedKind === "material_reference" ? null : `${title} body`,
    materialReferenceKind: acceptedKind === "material_reference" ? "article" : null,
    locator: acceptedKind === "material_reference" ? `https://example.test/${entityId}` : null,
    citation: null,
    acceptedFromCandidateId: candidateId,
    sourceIds,
    rationale: null,
    acceptedByIdentityId: "identity-curator",
    acceptedAt: "2026-06-02T09:31:00.000Z",
  });
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

function seedStudentProgramWithAcceptedQuickCheck(
  database,
  {
    programId,
    membershipId = "membership-student-a",
    quickCheckCandidateId = "quick-check-candidate-a",
    quickCheckEntityId = "quick-check-entity-a",
    quickCheckRevisionId = "quick-check-revision-a",
    sourceId = "quick-check-source-a",
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
  createQuickCheckCandidateRecord(
    database,
    makeQuickCheckCandidate({
      id: quickCheckCandidateId,
      programId,
      sourceIds: [sourceId],
      status: "accepted",
    }),
  );
  createAcceptedQuickCheckEntityRecord(
    database,
    makeAcceptedQuickCheckEntity({
      id: quickCheckEntityId,
      programId,
      currentRevisionId: quickCheckRevisionId,
    }),
  );
  createAcceptedQuickCheckRevisionRecord(
    database,
    makeAcceptedQuickCheckRevision({
      id: quickCheckRevisionId,
      entityId: quickCheckEntityId,
      programId,
      acceptedFromCandidateId: quickCheckCandidateId,
      sourceIds: [sourceId],
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

function seedProtectedIdentityState(database) {
  createLocalPasswordCredential(database, {
    id: "credential-protected",
    identityId: "identity-active-other",
    login: "protected@example.test",
    passwordHash: "hash-protected",
    createdAt: "2026-06-02T09:05:00.000Z",
  });
  grantAdminAuthority(database, {
    identityId: "identity-active-other",
    grantedAt: "2026-06-02T09:06:00.000Z",
  });
  createSession(database, {
    id: "session-protected",
    identityId: "identity-active-other",
    createdAt: "2026-06-02T09:07:00.000Z",
    expiresAt: "2026-06-03T09:07:00.000Z",
  });
}

function projectAcceptedAssessmentState(database) {
  return {
    acceptedCorpusEntities: listAcceptedCorpusEntityRecords(database),
    acceptedCorpusRevisions: listAcceptedCorpusRevisionRecords(database),
    acceptedCriterionEntities: listAcceptedAssessmentCriterionEntityRecords(database),
    acceptedCriterionRevisions: listAcceptedAssessmentCriterionRevisionRecords(database),
    acceptedOpenAnswerCheckEntities: listAcceptedOpenAnswerCheckEntityRecords(database),
    acceptedOpenAnswerCheckRevisions: listAcceptedOpenAnswerCheckRevisionRecords(database),
    criterionCandidates: listAssessmentCriterionCandidateRecords(database),
    checkCandidates: listOpenAnswerCheckCandidateRecords(database),
  };
}

function projectAdjacentCorpusState(database) {
  return {
    ...projectAcceptedAssessmentState(database),
    sources: listProgramSourceRecords(database),
    corpusCandidates: listCorpusCandidateRecords(database),
  };
}

function projectQuickCheckAttemptBoundaryState(database, csrfTokens) {
  return {
    corpus: projectAdjacentCorpusState(database),
    acceptedQuickCheckEntities: listAcceptedQuickCheckEntityRecords(database),
    acceptedQuickCheckRevisions: listAcceptedQuickCheckRevisionRecords(database),
    quickCheckCandidates: listQuickCheckCandidateRecords(database),
    openAnswerAttempts: listOpenAnswerAttemptRecords(database),
    memberships: listProgramMembershipRecords(database),
    studentIdentity: getIdentity(database, "identity-student"),
    protectedIdentity: getIdentity(database, "identity-active-other"),
    protectedSession: getSession(database, "session-protected"),
    credentials: listLocalPasswordCredentials(database),
    authorities: listAdminAuthorities(database),
    csrfTokens: [...csrfTokens.entries()],
  };
}

function projectQuickCheckBoundaryIsolationState(database, csrfTokens) {
  return {
    corpus: projectAdjacentCorpusState(database),
    openAnswerAttempts: listOpenAnswerAttemptRecords(database),
    openAnswerEvaluations: listOpenAnswerEvaluationRecords(database),
    openAnswerEvaluatorEvidence: listOpenAnswerEvaluatorEvidenceRecords(database),
    openAnswerEvaluatorRuns: listOpenAnswerEvaluatorRunRecords(database),
    memberships: listProgramMembershipRecords(database),
    studentIdentity: getIdentity(database, "identity-student"),
    protectedIdentity: getIdentity(database, "identity-active-other"),
    protectedSession: getSession(database, "session-protected"),
    credentials: listLocalPasswordCredentials(database),
    authorities: listAdminAuthorities(database),
    csrfTokens: [...csrfTokens.entries()],
  };
}

function projectLearnerStateReadBoundary(database) {
  return {
    corpus: projectAdjacentCorpusState(database),
    acceptedNavigationRelationships: listAcceptedNavigationRelationshipRecords(database),
    acceptedNavigationRelationshipRevisions: listAcceptedNavigationRelationshipRevisionRecords(database),
    learnerEvidenceTargetLinks: listLearnerEvidenceTargetLinkRecords(database, { includeDeleted: true }),
    acceptedQuickCheckEntities: listAcceptedQuickCheckEntityRecords(database),
    acceptedQuickCheckRevisions: listAcceptedQuickCheckRevisionRecords(database),
    quickCheckAttempts: listQuickCheckAttemptRecords(database),
    openAnswerAttempts: listOpenAnswerAttemptRecords(database),
    openAnswerEvaluations: listOpenAnswerEvaluationRecords(database),
    openAnswerEvaluationFailures: listOpenAnswerEvaluationFailureRecords(database),
    openAnswerEvaluatorEvidence: listOpenAnswerEvaluatorEvidenceRecords(database),
    openAnswerEvaluatorRuns: listOpenAnswerEvaluatorRunRecords(database),
    corpusEvents: listCorpusEventRecords(database),
    memberships: listProgramMembershipRecords(database),
  };
}

function projectReadinessBoundary(database) {
  return {
    acceptedReadinessCheckEntities: listAcceptedReadinessCheckEntityRecords(database),
    acceptedReadinessCheckRevisions: listAcceptedReadinessCheckRevisionRecords(database),
    readinessCheckAttempts: listReadinessCheckAttemptRecords(database),
    corpus: projectAdjacentCorpusState(database),
    acceptedNavigationRelationships: listAcceptedNavigationRelationshipRecords(database),
    acceptedNavigationRelationshipRevisions: listAcceptedNavigationRelationshipRevisionRecords(database),
    learnerEvidenceTargetLinks: listLearnerEvidenceTargetLinkRecords(database, { includeDeleted: true }),
    quickCheckAttemptCount: listQuickCheckAttemptRecords(database).length,
    openAnswerAttemptCount: listOpenAnswerAttemptRecords(database).length,
    openAnswerEvaluationCount: listOpenAnswerEvaluationRecords(database).length,
    openAnswerEvaluationFailureCount: listOpenAnswerEvaluationFailureRecords(database).length,
    openAnswerEvaluatorEvidenceCount: listOpenAnswerEvaluatorEvidenceRecords(database).length,
    openAnswerEvaluatorRunCount: listOpenAnswerEvaluatorRunRecords(database).length,
    corpusEvents: listCorpusEventRecords(database),
    memberships: listProgramMembershipRecords(database),
  };
}

function projectQuickCheckDeferredState(database) {
  const backup = exportIdentityBackup(database);
  return {
    openAnswerAttempts: backup.openAnswerAttempts,
    openAnswerEvaluations: backup.openAnswerEvaluations,
    openAnswerEvaluationFailures: backup.openAnswerEvaluationFailures,
    openAnswerEvaluatorRuns: backup.openAnswerEvaluatorRuns,
    openAnswerEvaluatorEvidence: backup.openAnswerEvaluatorEvidence,
  };
}

function projectProtectedBackupState(backup) {
  return {
    identities: backup.identities,
    localPasswordCredentials: backup.localPasswordCredentials,
    adminAuthorities: backup.adminAuthorities,
    programMemberships: backup.programMemberships,
    acceptedCorpusEntities: backup.acceptedCorpusEntities,
    acceptedCorpusRevisions: backup.acceptedCorpusRevisions,
    acceptedAssessmentCriterionEntities: backup.acceptedAssessmentCriterionEntities,
    acceptedAssessmentCriterionRevisions: backup.acceptedAssessmentCriterionRevisions,
    acceptedOpenAnswerCheckEntities: backup.acceptedOpenAnswerCheckEntities,
    acceptedOpenAnswerCheckRevisions: backup.acceptedOpenAnswerCheckRevisions,
    openAnswerEvaluations: backup.openAnswerEvaluations,
  };
}

function projectProtectedAdjacentBackupState(backup) {
  return {
    identities: backup.identities,
    localPasswordCredentials: backup.localPasswordCredentials,
    adminAuthorities: backup.adminAuthorities,
    programShells: backup.programShells,
    programMemberships: backup.programMemberships,
    programSources: backup.programSources,
    corpusCandidates: backup.corpusCandidates,
    acceptedCorpusEntities: backup.acceptedCorpusEntities,
    acceptedCorpusRevisions: backup.acceptedCorpusRevisions,
    assessmentCriterionCandidates: backup.assessmentCriterionCandidates,
    acceptedAssessmentCriterionEntities: backup.acceptedAssessmentCriterionEntities,
    acceptedAssessmentCriterionRevisions: backup.acceptedAssessmentCriterionRevisions,
    openAnswerCheckCandidates: backup.openAnswerCheckCandidates,
    acceptedOpenAnswerCheckEntities: backup.acceptedOpenAnswerCheckEntities,
    acceptedOpenAnswerCheckRevisions: backup.acceptedOpenAnswerCheckRevisions,
  };
}

function containsForbiddenProviderRequestDetail(providerRequests) {
  const serialized = JSON.stringify(providerRequests).toLowerCase();
  return [
    "authorization",
    "cookie",
    "csrf",
    "database-url",
    "hidden policy instructions",
    "postgres://",
    "provider-secret",
    "raw model",
    "raw prompt",
    "select ",
    "session",
    "stack",
    "/tmp",
  ].some($0 => serialized.includes($0));
}

function containsForbiddenEvaluatorArtifactDetail(values) {
  const serialized = JSON.stringify(values).toLowerCase();
  return [
    "authorization",
    "cookie",
    "csrf",
    "database-url",
    "diagnostic",
    "filesystem",
    "hidden policy",
    "postgres://",
    "provider-secret",
    "raw model",
    "raw prompt",
    "reviewer note",
    "select ",
    "session",
    "stack",
    "/tmp",
  ].some($0 => serialized.includes($0));
}

function containsForbiddenDetail(values) {
  const serialized = JSON.stringify(values).toLowerCase();
  return [
    "answerkey",
    "acceptedby",
    "acceptedfromcandidate",
    "candidateid",
    "correctness",
    "correctoption",
    "createdby",
    "idempotencykey",
    "iscorrect",
    "rationale",
    "sensitive-idempotency-key",
    "sensitive-quick-idempotency-key",
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
    "getQuickCheckAttempt",
    "listOpenAnswerAttempts",
    "listQuickCheckAttempts",
    "/student-workspace",
    "student-workspace",
  ].some($0 => source.includes($0)));
}

function containsAnyOutOfScopeStudentWorkspaceHttpMutation(source) {
  return [
    "getOpenAnswerEvaluationStatus",
    "cancelOpenAnswerEvaluatorJob",
    "claimOpenAnswerEvaluatorJob",
    "completeOpenAnswerEvaluatorJob",
    "failOpenAnswerEvaluatorJob",
    "listOpenAnswerEvaluatorEvidence",
    "markOpenAnswerAttemptEvaluating",
    "recordOpenAnswerEvaluation",
    "recordOpenAnswerEvaluationFailure",
    "recordOpenAnswerEvaluatorJobEvidence",
    "renewOpenAnswerEvaluatorJobLease",
    "scheduleOpenAnswerEvaluatorJob",
    "timeOutOpenAnswerEvaluatorJob",
  ].some($0 => source.includes($0));
}

function containsAnyOutOfScopeStudentWorkspaceBehavior(source) {
  const normalized = source.toLowerCase();
  return [
    "raw_prompt",
    "raw_model",
    "mastery",
    "weak_area",
    "student_progress",
    "review_scheduling",
    "next_step",
    "topic_readiness",
    "period_readiness",
    "topic_attempt",
    "period_attempt",
    "grading",
    "analytics",
    "reporting",
    "provider_sdk",
    "external_provider",
    "durable_queue",
    "queue_state",
    "human_review_queue",
    "reviewer_queue",
    "review_assignment",
  ].some($0 => normalized.includes($0));
}

function containsAnyQuickCheckPublicSurface({ adminUiSource, cliSource, serverSource }) {
  const normalizedPublicSources = [adminUiSource, cliSource].join("\n").toLowerCase();
  const normalizedServerSource = serverSource.toLowerCase();
  return [
    "quickcheck",
    "quick-check",
    "quick_check",
    "quick check",
    "getquickcheck",
    "listquickcheck",
    "submitquickcheck",
    "createquickcheck",
    "acceptquickcheck",
  ].some($0 => normalizedPublicSources.includes($0)) ||
    [
      "/quick-check-worker",
      "/quick-check-provider",
      "/quick-check-human-review",
      "/quick-check-randomization",
      "/quick-check-multiple-select",
      "/quick-check-topic",
      "/quick-check-period",
      "/quick-check-mastery",
      "/quick-check-weak-area",
      "/quick-check-progress",
      "/quick-check-grading",
      "/quick-check-analytics",
      "/quick-check-reporting",
    ].some($0 => normalizedServerSource.includes($0));
}

function containsInternalQuickCheckResolverSurface({
  adminUiSource,
  cliSource,
  commands,
  corpusCommands,
  serverSource,
}) {
  const commandNames = [...Object.keys(commands), ...Object.keys(corpusCommands)].join("\n");
  const publicSources = [adminUiSource, cliSource, serverSource, commandNames].join("\n");
  return publicSources.includes("resolveAcceptedQuickCheckRevisionForEvaluation");
}

function containsAnyOutOfScopeEvaluatorWorkerSurface({
  adminUiSource,
  cliSource,
  workspaceSource,
}) {
  const publicSources = [adminUiSource, cliSource].join("\n");
  const normalizedWorkspace = workspaceSource.toLowerCase();
  return (
    ["runOpenAnswerEvaluatorWorkerOnce", "providerAdapters", "evaluatorPolicies"].some($0 =>
      publicSources.includes($0),
    ) ||
    [
      "fetch(",
      "axios",
      "provider_sdk",
      "external_provider",
      "openai",
      "anthropic",
      "bullmq",
      "rabbitmq",
      "kafka",
      "redis",
      "durable_queue",
      "queue_state",
      "broker",
      "scheduler",
      "worker_threads",
      "child_process",
      "human_review_queue",
      "reviewer_queue",
      "review_assignment",
      "raw_artifact_store",
      "raw_artifact_backup",
      "raw_artifact_export",
      "raw_prompt_record",
      "raw_model_response",
      "raw_request_payload",
      "raw_response_payload",
      "provider_diagnostic",
      "student_ui",
      "admin_ui",
      "curator_ui",
      "reviewer_ui",
      "mastery",
      "weak_area",
      "student_progress",
      "next_step",
      "next-step",
      "nextstep",
      "grading",
      "analytics",
      "reporting",
      "deployment_target",
      "infrastructure_port",
      "worker_topology",
      "http://",
      "https://",
      "process.env",
      "listen(",
    ].some($0 => normalizedWorkspace.includes($0))
  );
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
