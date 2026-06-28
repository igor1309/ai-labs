import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createCorpusCommands } from "../src/corpus.js";
import { createProgramCommands } from "../src/program.js";
import {
  createIdentity,
  initializeIdentityStorage,
  openIdentityDatabase,
} from "../src/storage.js";

test("corpusAcceptance_shouldBuildAcceptedProgramCorpusFromGroundedCandidate", () => {
  const { corpusCommands, database, programCommands } = makeSUT();

  try {
    const program = programCommands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Cell Biology",
      description: "Introductory cell biology",
    }).value.programShell;
    programCommands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: program.programId,
    });

    const source = corpusCommands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      sourceKind: "textbook",
      title: "Molecular Biology of the Cell",
      citation: "Chapter 1",
    }).value.programSource;
    const candidate = corpusCommands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      candidateKind: "topic",
      title: "Cell membranes",
      body: "Structure and transport across membranes",
      sourceIds: [source.sourceId],
      rationale: "Required foundation for later physiology topics",
    }).value.corpusCandidate;
    corpusCommands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: candidate.candidateId,
    });

    assert.deepEqual(
      {
        accepted: corpusCommands.listAcceptedCorpus({
          actingIdentityId: "identity-student",
          programId: program.programId,
        }),
        events: corpusCommands.listCorpusEvents({
          actingIdentityId: "identity-curator",
          programId: program.programId,
        }).value.corpusEvents.map($0 => $0.eventType),
      },
      {
        accepted: {
          status: "accepted",
          value: {
            acceptedCorpus: [
              {
                entityId: "entity-1",
                revisionId: "revision-1",
                programId: "program-1",
                acceptedKind: "topic",
                title: "Cell membranes",
                body: "Structure and transport across membranes",
                acceptedFromCandidateId: "candidate-1",
                sourceIds: ["source-1"],
                rationale: "Required foundation for later physiology topics",
                acceptedByIdentityId: "identity-curator",
                acceptedAt: "2026-05-28T12:00:00.006Z",
              },
            ],
          },
        },
        events: [
          "program_source_recorded",
          "corpus_candidate_created",
          "corpus_candidate_accepted",
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("lifecycleAcceptance_shouldWithdrawReactivateAndApplySourceDeletionTiers", () => {
  const { corpusCommands, database, programCommands } = makeSUT();

  try {
    const program = programCommands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Cell Biology",
    }).value.programShell;
    programCommands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: program.programId,
    });
    const referencedSource = corpusCommands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      sourceKind: "textbook",
      title: "Referenced source",
    }).value.programSource;
    const unreferencedSource = corpusCommands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      sourceKind: "article",
      title: "Stray source",
    }).value.programSource;
    const candidate = corpusCommands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      candidateKind: "topic",
      title: "Cell membranes",
      sourceIds: [referencedSource.sourceId],
    }).value.corpusCandidate;
    const accepted = corpusCommands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: candidate.candidateId,
    }).value.acceptedCorpus;

    const withdrawn = corpusCommands.setAcceptedCorpusLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: accepted.entityId,
      status: "withdrawn",
    });
    const hiddenFromStudent = corpusCommands.listAcceptedCorpus({
      actingIdentityId: "identity-student",
      programId: program.programId,
    }).value.acceptedCorpus;
    const historical = corpusCommands.getAcceptedCorpusRevision({
      actingIdentityId: "identity-student",
      revisionId: accepted.revisionId,
    });
    const reactivated = corpusCommands.setAcceptedCorpusLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: accepted.entityId,
      status: "active",
    });
    const blockedReferencedDelete = corpusCommands.deleteProgramSource({
      actingIdentityId: "identity-curator",
      sourceId: referencedSource.sourceId,
    });
    const withdrawnSource = corpusCommands.setProgramSourceLifecycleStatus({
      actingIdentityId: "identity-curator",
      sourceId: referencedSource.sourceId,
      status: "withdrawn",
    });
    const deletedUnreferencedSource = corpusCommands.deleteProgramSource({
      actingIdentityId: "identity-curator",
      sourceId: unreferencedSource.sourceId,
    });

    assert.deepEqual(
      {
        withdrawnStatus: withdrawn.value.entity.status,
        hiddenFromStudent,
        historicalSourceIds: historical.value.acceptedCorpus.sourceIds,
        reactivatedStatus: reactivated.value.entity.status,
        blockedReferencedDelete,
        withdrawnSourceStatus: withdrawnSource.value.source.status,
        deletedUnreferencedSourceId: deletedUnreferencedSource.value.source.id,
      },
      {
        withdrawnStatus: "withdrawn",
        hiddenFromStudent: [],
        historicalSourceIds: [referencedSource.sourceId],
        reactivatedStatus: "active",
        blockedReferencedDelete: { status: "rejected", reason: "source_hard_delete_blocked" },
        withdrawnSourceStatus: "withdrawn",
        deletedUnreferencedSourceId: unreferencedSource.sourceId,
      },
    );
  } finally {
    database.close();
  }
});

test("learnerEvidenceTargetLinkCuration_shouldCreateListAndSoftDeleteAcceptedCorpusMetadata", () => {
  const { corpusCommands, database, programCommands } = makeSUT();

  try {
    const program = programCommands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Cell Biology",
      description: "Introductory cell biology",
    }).value.programShell;
    const targetCandidate = corpusCommands.createNavigationCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      candidateKind: "topic",
      title: "Membrane transport",
    }).value.navigationCandidate;
    const acceptedTarget = corpusCommands.acceptNavigationCandidate({
      actingIdentityId: "identity-curator",
      candidateId: targetCandidate.candidateId,
    }).value.navigationChange.acceptedCorpus;
    const quickCheckCandidate = corpusCommands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      checkKind: "single_select_quick_check",
      title: "Membrane transport check",
      prompt: "Which property controls membrane transport?",
      options: ["Selective permeability", "Random sorting"],
      answerKeyIndex: 0,
    }).value.quickCheckCandidate;
    const acceptedQuickCheck = corpusCommands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: quickCheckCandidate.candidateId,
    }).value.acceptedQuickCheck;
    const created = corpusCommands.createLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      targetKind: "topic",
      targetId: acceptedTarget.entityId,
      evidenceOwnerKind: "accepted_quick_check",
      evidenceOwnerEntityId: acceptedQuickCheck.entityId,
    });
    const listedBeforeDelete = corpusCommands.listLearnerEvidenceTargetLinks({
      actingIdentityId: "identity-curator",
      programId: program.programId,
    });
    const deleted = corpusCommands.deleteLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      linkId: created.value.learnerEvidenceTargetLink.linkId,
    });
    const listedAfterDelete = corpusCommands.listLearnerEvidenceTargetLinks({
      actingIdentityId: "identity-curator",
      programId: program.programId,
    });

    assert.deepEqual(
      {
        created: learnerEvidenceTargetLinkAcceptanceProjection(created),
        listedBeforeDelete: listedBeforeDelete.value.learnerEvidenceTargetLinks.map(learnerEvidenceTargetLinkSummary),
        deletedStatus: deleted.value.learnerEvidenceTargetLink.status,
        listedAfterDelete,
      },
      {
        created: {
          status: "accepted",
          link: {
            programId: program.programId,
            targetKind: "topic",
            targetId: acceptedTarget.entityId,
            evidenceOwnerKind: "accepted_quick_check",
            evidenceOwnerEntityId: acceptedQuickCheck.entityId,
            status: "active",
          },
        },
        listedBeforeDelete: [
          {
            programId: program.programId,
            targetKind: "topic",
            targetId: acceptedTarget.entityId,
            evidenceOwnerKind: "accepted_quick_check",
            evidenceOwnerEntityId: acceptedQuickCheck.entityId,
            status: "active",
          },
        ],
        deletedStatus: "deleted",
        listedAfterDelete: {
          status: "accepted",
          value: {
            learnerEvidenceTargetLinks: [],
          },
        },
      },
    );
  } finally {
    database.close();
  }
});

test("readinessCheckCuration_shouldAcceptReplaceAndRejectAcceptedCorpusMetadata", () => {
  const { corpusCommands, database, programCommands } = makeSUT();

  try {
    const program = programCommands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Cell Biology",
      description: "Introductory cell biology",
    }).value.programShell;
    const topic = corpusCommands.acceptNavigationCandidate({
      actingIdentityId: "identity-curator",
      candidateId: corpusCommands.createNavigationCandidate({
        actingIdentityId: "identity-curator",
        programId: program.programId,
        candidateKind: "topic",
        title: "Membrane transport",
      }).value.navigationCandidate.candidateId,
    }).value.navigationChange.acceptedCorpus;
    const concept = corpusCommands.acceptNavigationCandidate({
      actingIdentityId: "identity-curator",
      candidateId: corpusCommands.createNavigationCandidate({
        actingIdentityId: "identity-curator",
        programId: program.programId,
        candidateKind: "concept",
        title: "Selective permeability",
      }).value.navigationCandidate.candidateId,
    }).value.navigationChange.acceptedCorpus;
    const candidate = corpusCommands.createReadinessCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      title: "Membrane readiness",
      scope: { scopeKind: "topic", topicEntityId: topic.entityId },
      requirements: [
        {
          targetKind: "topic",
          targetId: topic.entityId,
          requiredLevel: "on_track",
        },
        {
          targetKind: "concept",
          targetId: concept.entityId,
          requiredLevel: "developing",
        },
      ],
    }).value.readinessCheckCandidate;
    const accepted = corpusCommands.acceptReadinessCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: candidate.candidateId,
    }).value.acceptedReadinessCheck;
    const replacementCandidate = corpusCommands.createReadinessCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      title: "Period readiness",
      scope: { scopeKind: "period", title: "Period 1", topicEntityIds: [topic.entityId] },
      requirements: [
        {
          targetKind: "topic",
          targetId: topic.entityId,
          requiredLevel: "developing",
        },
      ],
    }).value.readinessCheckCandidate;
    const replacement = corpusCommands.acceptReadinessCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: replacementCandidate.candidateId,
      targetEntityId: accepted.entityId,
    }).value.acceptedReadinessCheck;
    const rejectedCandidate = corpusCommands.createReadinessCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      title: "Rejected readiness",
      scope: { scopeKind: "topic", topicEntityId: topic.entityId },
      requirements: [
        {
          targetKind: "topic",
          targetId: topic.entityId,
          requiredLevel: "developing",
        },
      ],
    }).value.readinessCheckCandidate;
    const rejected = corpusCommands.rejectReadinessCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: rejectedCandidate.candidateId,
    });

    assert.deepEqual(
      {
        accepted: readinessCheckAcceptanceSummary(accepted),
        curationRead: readinessCheckAcceptanceSummary(corpusCommands.getAcceptedReadinessCheckRevisionForCuration({
          actingIdentityId: "identity-curator",
          revisionId: accepted.revisionId,
        }).value.acceptedReadinessCheck),
        replacement: readinessCheckAcceptanceSummary(replacement),
        listedAcceptedStatuses: corpusCommands.listReadinessCheckCandidates({
          actingIdentityId: "identity-curator",
          programId: program.programId,
        }).value.readinessCheckCandidates.map($0 => [$0.title, $0.status]),
        rejectedStatus: rejected.value.readinessCheckCandidate.status,
      },
      {
        accepted: {
          entityId: accepted.entityId,
          programId: program.programId,
          title: "Membrane readiness",
          scopeKind: "topic",
          requirementTargets: [
            ["topic", topic.entityId, "on_track"],
            ["concept", concept.entityId, "developing"],
          ],
        },
        curationRead: {
          entityId: accepted.entityId,
          programId: program.programId,
          title: "Membrane readiness",
          scopeKind: "topic",
          requirementTargets: [
            ["topic", topic.entityId, "on_track"],
            ["concept", concept.entityId, "developing"],
          ],
        },
        replacement: {
          entityId: accepted.entityId,
          programId: program.programId,
          title: "Period readiness",
          scopeKind: "period",
          requirementTargets: [["topic", topic.entityId, "developing"]],
        },
        listedAcceptedStatuses: [
          ["Membrane readiness", "accepted"],
          ["Period readiness", "accepted"],
          ["Rejected readiness", "rejected"],
        ],
        rejectedStatus: "rejected",
      },
    );
  } finally {
    database.close();
  }
});

test("corpusAcceptance_shouldReplaceCurrentRevisionAndKeepHistoricalRevision", () => {
  const { corpusCommands, database, programCommands } = makeSUT();

  try {
    const program = programCommands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Logic",
    }).value.programShell;
    const source = corpusCommands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      sourceKind: "article",
      title: "Logic syllabus",
    }).value.programSource;
    const firstCandidate = corpusCommands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      candidateKind: "concept",
      title: "Deduction",
      sourceIds: [source.sourceId],
    }).value.corpusCandidate;
    const firstAcceptance = corpusCommands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: firstCandidate.candidateId,
    }).value.acceptedCorpus;
    const secondCandidate = corpusCommands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      candidateKind: "concept",
      title: "Formal deduction",
      sourceIds: [source.sourceId],
    }).value.corpusCandidate;
    corpusCommands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: secondCandidate.candidateId,
      targetEntityId: firstAcceptance.entityId,
    });

    assert.deepEqual(
      {
        current: corpusCommands.listAcceptedCorpus({
          actingIdentityId: "identity-curator",
          programId: program.programId,
        }).value.acceptedCorpus.map($0 => $0.title),
        historical: corpusCommands.getAcceptedCorpusRevision({
          actingIdentityId: "identity-curator",
          revisionId: firstAcceptance.revisionId,
        }).value.acceptedCorpus.title,
      },
      {
        current: ["Formal deduction"],
        historical: "Deduction",
      },
    );
  } finally {
    database.close();
  }
});

test("corpusAcceptance_shouldKeepDraftRejectedAndOutOfScopeSurfacesSeparate", () => {
  const { corpusCommands, database, programCommands } = makeSUT();

  try {
    const program = programCommands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Algorithms",
    }).value.programShell;
    const acceptedCandidate = corpusCommands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      candidateKind: "topic",
      title: "Graph traversal",
    }).value.corpusCandidate;
    corpusCommands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      candidateKind: "topic",
      title: "Draft-only sorting",
    });
    const rejectedCandidate = corpusCommands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      candidateKind: "topic",
      title: "Rejected recursion",
    }).value.corpusCandidate;
    corpusCommands.rejectCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: rejectedCandidate.candidateId,
    });
    corpusCommands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: acceptedCandidate.candidateId,
    });

    assert.deepEqual(
      {
        acceptedTitles: corpusCommands.listAcceptedCorpus({
          actingIdentityId: "identity-curator",
          programId: program.programId,
        }).value.acceptedCorpus.map($0 => $0.title),
        outOfScopeTables: listOutOfScopeTables(database),
        outOfScopeSurfaces: listOutOfScopeSurfaces(),
      },
      {
        acceptedTitles: ["Graph traversal"],
        outOfScopeTables: [],
        outOfScopeSurfaces: [],
      },
    );
  } finally {
    database.close();
  }
});

test("assessmentAcceptance_shouldCompleteCriterionToOpenAnswerCheckLifecycle", () => {
  const { corpusCommands, database, programCommands } = makeSUT();

  try {
    const program = programCommands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Algorithms",
    }).value.programShell;
    programCommands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: program.programId,
    });
    const source = corpusCommands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      sourceKind: "article",
      title: "Graph traversal source",
    }).value.programSource;
    const firstCriterionCandidate = corpusCommands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      title: "Explain traversal",
      body: "Answer identifies graph traversal order and visited tracking.",
      sourceIds: [source.sourceId],
    }).value.assessmentCriterionCandidate;
    const firstCriterion = corpusCommands.acceptAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: firstCriterionCandidate.candidateId,
    }).value.acceptedAssessmentCriterion;
    const checkCandidate = corpusCommands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      checkKind: "open_answer",
      title: "Graph traversal explanation",
      prompt: "Explain how breadth-first traversal avoids revisiting nodes.",
      sourceIds: [source.sourceId],
      criterionEntityIds: [firstCriterion.entityId],
    }).value.openAnswerCheckCandidate;
    const acceptedCheck = corpusCommands.acceptOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: checkCandidate.candidateId,
    }).value.acceptedOpenAnswerCheck;
    const revisedCriterionCandidate = corpusCommands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      title: "Explain traversal with queue",
      body: "Answer identifies queue order, visited tracking, and termination.",
      sourceIds: [source.sourceId],
    }).value.assessmentCriterionCandidate;
    const revisedCriterion = corpusCommands.acceptAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: revisedCriterionCandidate.candidateId,
      targetEntityId: firstCriterion.entityId,
    }).value.acceptedAssessmentCriterion;
    const rejectedCriterionCandidate = corpusCommands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      title: "Rejected criterion",
      body: "Rejected criterion body",
    }).value.assessmentCriterionCandidate;
    const rejectedCriterionResult = corpusCommands.rejectAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: rejectedCriterionCandidate.candidateId,
    });
    const rejectedCheckCandidate = corpusCommands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      checkKind: "open_answer",
      title: "Rejected check",
      prompt: "Rejected prompt",
      criterionEntityIds: [firstCriterion.entityId],
    }).value.openAnswerCheckCandidate;
    const rejectedCheckResult = corpusCommands.rejectOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: rejectedCheckCandidate.candidateId,
    });
    const studentChecksResult = corpusCommands.listAcceptedOpenAnswerChecks({
      actingIdentityId: "identity-student",
      programId: program.programId,
    });
    const historicalCriterionResult = corpusCommands.getAcceptedAssessmentCriterionRevision({
      actingIdentityId: "identity-student",
      revisionId: firstCriterion.revisionId,
    });
    const historicalCheckResult = corpusCommands.getAcceptedOpenAnswerCheckRevision({
      actingIdentityId: "identity-student",
      revisionId: acceptedCheck.revisionId,
    });
    const currentCriteriaResult = corpusCommands.listAcceptedAssessmentCriteria({
      actingIdentityId: "identity-student",
      programId: program.programId,
    });

    assert.deepEqual(
      {
        currentCriterionRevisionIds: currentCriteriaResult.value.acceptedAssessmentCriteria.map(
          $0 => $0.revisionId,
        ),
        currentCriterionTitles: currentCriteriaResult.value.acceptedAssessmentCriteria.map($0 => $0.title),
        studentCheckCriterionRevisionIds: studentChecksResult.value.acceptedOpenAnswerChecks.flatMap(
          $0 => $0.criterionRevisionIds,
        ),
        historicalCriterionTitle: historicalCriterionResult.value.acceptedAssessmentCriterion.title,
        historicalCheckCriterionRevisionIds: historicalCheckResult.value.acceptedOpenAnswerCheck.criterionRevisionIds,
        rejectedStatuses: [
          rejectedCriterionResult.value.assessmentCriterionCandidate.status,
          rejectedCheckResult.value.openAnswerCheckCandidate.status,
        ],
        leaksForbiddenDetails: containsForbiddenDetail([
          studentChecksResult,
          historicalCriterionResult,
          historicalCheckResult,
          currentCriteriaResult,
          rejectedCriterionResult,
          rejectedCheckResult,
        ]),
        outOfScopeTables: listOutOfScopeTables(database),
        outOfScopeSurfaces: listOutOfScopeSurfaces(),
      },
      {
        currentCriterionRevisionIds: [revisedCriterion.revisionId],
        currentCriterionTitles: ["Explain traversal with queue"],
        studentCheckCriterionRevisionIds: [firstCriterion.revisionId],
        historicalCriterionTitle: "Explain traversal",
        historicalCheckCriterionRevisionIds: [firstCriterion.revisionId],
        rejectedStatuses: ["rejected", "rejected"],
        leaksForbiddenDetails: false,
        outOfScopeTables: [],
        outOfScopeSurfaces: [],
      },
    );
  } finally {
    database.close();
  }
});

test("assessmentAcceptance_shouldKeepDraftRejectedStudentWorkspaceAndOutOfScopeSurfacesSeparate", () => {
  const { corpusCommands, database, programCommands } = makeSUT();

  try {
    const program = programCommands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Algorithms",
    }).value.programShell;
    programCommands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: program.programId,
    });
    const acceptedCriterionCandidateResult = corpusCommands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      title: "Accepted rubric",
      body: "Accepted rubric body",
    });
    const acceptedCriterionCandidate = acceptedCriterionCandidateResult.value.assessmentCriterionCandidate;
    const acceptedCriterionResult = corpusCommands.acceptAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: acceptedCriterionCandidate.candidateId,
    });
    const acceptedCriterion = acceptedCriterionResult.value.acceptedAssessmentCriterion;
    const draftCriterionCandidateResult = corpusCommands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      title: "Draft-only rubric",
      body: "Draft-only rubric body",
    });
    const rejectedCriterionCandidateResult = corpusCommands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      title: "Rejected rubric",
      body: "Rejected rubric body",
    });
    const rejectedCriterionCandidate = rejectedCriterionCandidateResult.value.assessmentCriterionCandidate;
    const rejectedCriterionResult = corpusCommands.rejectAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: rejectedCriterionCandidate.candidateId,
    });
    const acceptedCheckCandidateResult = corpusCommands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      checkKind: "open_answer",
      title: "Accepted open answer",
      prompt: "Explain graph traversal",
      criterionEntityIds: [acceptedCriterion.entityId],
    });
    const acceptedCheckCandidate = acceptedCheckCandidateResult.value.openAnswerCheckCandidate;
    const acceptedCheckResult = corpusCommands.acceptOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: acceptedCheckCandidate.candidateId,
    });
    const acceptedCheck = acceptedCheckResult.value.acceptedOpenAnswerCheck;
    const draftCheckCandidateResult = corpusCommands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      checkKind: "open_answer",
      title: "Draft-only open answer",
      prompt: "Explain sorting",
      criterionEntityIds: [acceptedCriterion.entityId],
    });
    const rejectedCheckCandidateResult = corpusCommands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      checkKind: "open_answer",
      title: "Rejected open answer",
      prompt: "Explain recursion",
      criterionEntityIds: [acceptedCriterion.entityId],
    });
    const rejectedCheckCandidate = rejectedCheckCandidateResult.value.openAnswerCheckCandidate;
    const rejectedCheckResult = corpusCommands.rejectOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: rejectedCheckCandidate.candidateId,
    });
    const acceptedCriteriaResult = corpusCommands.listAcceptedAssessmentCriteria({
      actingIdentityId: "identity-student",
      programId: program.programId,
    });
    const acceptedChecksResult = corpusCommands.listAcceptedOpenAnswerChecks({
      actingIdentityId: "identity-student",
      programId: program.programId,
    });
    const historicalCriterionResult = corpusCommands.getAcceptedAssessmentCriterionRevision({
      actingIdentityId: "identity-student",
      revisionId: acceptedCriterion.revisionId,
    });
    const historicalCheckResult = corpusCommands.getAcceptedOpenAnswerCheckRevision({
      actingIdentityId: "identity-student",
      revisionId: acceptedCheck.revisionId,
    });
    const criterionCandidatesResult = corpusCommands.listAssessmentCriterionCandidates({
      actingIdentityId: "identity-curator",
      programId: program.programId,
    });
    const checkCandidatesResult = corpusCommands.listOpenAnswerCheckCandidates({
      actingIdentityId: "identity-curator",
      programId: program.programId,
    });
    const duplicateCriterionAcceptanceResult = corpusCommands.acceptAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: acceptedCriterionCandidate.candidateId,
    });
    const duplicateCheckAcceptanceResult = corpusCommands.acceptOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: acceptedCheckCandidate.candidateId,
    });

    assert.deepEqual(
      {
        acceptedCriterionTitles: acceptedCriteriaResult.value.acceptedAssessmentCriteria.map($0 => $0.title),
        acceptedCheckTitles: acceptedChecksResult.value.acceptedOpenAnswerChecks.map($0 => $0.title),
        historicalCriterionTitle: historicalCriterionResult.value.acceptedAssessmentCriterion.title,
        historicalCheckCriterionRevisionIds: historicalCheckResult.value.acceptedOpenAnswerCheck.criterionRevisionIds,
        leaksForbiddenDetails: containsForbiddenDetail([
          acceptedCriterionCandidateResult,
          acceptedCriterionResult,
          draftCriterionCandidateResult,
          rejectedCriterionCandidateResult,
          rejectedCriterionResult,
          acceptedCriteriaResult,
          historicalCriterionResult,
          criterionCandidatesResult,
          duplicateCriterionAcceptanceResult,
          acceptedCheckCandidateResult,
          acceptedCheckResult,
          draftCheckCandidateResult,
          rejectedCheckCandidateResult,
          rejectedCheckResult,
          acceptedChecksResult,
          historicalCheckResult,
          checkCandidatesResult,
          duplicateCheckAcceptanceResult,
        ]),
        outOfScopeTables: listOutOfScopeTables(database),
        outOfScopeSurfaces: listOutOfScopeSurfaces(),
      },
      {
        acceptedCriterionTitles: ["Accepted rubric"],
        acceptedCheckTitles: ["Accepted open answer"],
        historicalCriterionTitle: "Accepted rubric",
        historicalCheckCriterionRevisionIds: [acceptedCriterion.revisionId],
        leaksForbiddenDetails: false,
        outOfScopeTables: [],
        outOfScopeSurfaces: [],
      },
    );
  } finally {
    database.close();
  }
});

test("materialContent_shouldCaptureCopyAndServeRoleGatedContentWithSignal", () => {
  const { corpusCommands, database, programCommands } = makeSUT();

  try {
    const program = programCommands.createProgramShell({
      actingIdentityId: "identity-curator",
      title: "Cell Biology",
      description: "Introductory cell biology",
    }).value.programShell;
    programCommands.joinSelfJoinProgram({
      actingIdentityId: "identity-student",
      programId: program.programId,
    });
    const source = corpusCommands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      sourceKind: "lecture",
      title: "Lecture",
    }).value.programSource;
    const candidate = corpusCommands.createNavigationCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      candidateKind: "material_reference",
      title: "Membranes",
      materialReferenceKind: "lecture",
      locator: "loc",
      sourceIds: [source.sourceId],
    }).value.navigationCandidate;
    corpusCommands.acceptNavigationCandidate({
      actingIdentityId: "identity-curator",
      candidateId: candidate.candidateId,
    });
    const material = corpusCommands
      .listAcceptedCorpus({ actingIdentityId: "identity-curator", programId: program.programId })
      .value.acceptedCorpus.find($0 => $0.acceptedKind === "material_reference");

    corpusCommands.setSourceContent({
      actingIdentityId: "identity-curator",
      sourceId: source.sourceId,
      content: "# raw",
      contentFormat: "markdown",
    });
    corpusCommands.setAcceptedMaterialContent({
      actingIdentityId: "identity-curator",
      revisionId: material.revisionId,
      content: "# accepted",
      contentFormat: "markdown",
      sourceContentProvenance: { sourceId: source.sourceId },
    });

    assert.deepEqual(
      {
        studentRead: corpusCommands.readMaterialContent({
          actingIdentityId: "identity-student",
          entityId: material.entityId,
        }),
        studentSourceRead: corpusCommands.readSourceContent({
          actingIdentityId: "identity-student",
          sourceId: source.sourceId,
        }),
        curatorSourceRead: corpusCommands.readSourceContent({
          actingIdentityId: "identity-curator",
          sourceId: source.sourceId,
        }).value.content,
        hasContent: corpusCommands.getNavigationEntity({
          actingIdentityId: "identity-student",
          entityId: material.entityId,
        }).value.navigationNode.hasContent,
      },
      {
        studentRead: {
          status: "accepted",
          value: {
            content: "# accepted",
            contentFormat: "markdown",
            byteSize: Buffer.byteLength("# accepted", "utf8"),
          },
        },
        studentSourceRead: { status: "rejected", reason: "admin_or_curator_required" },
        curatorSourceRead: "# raw",
        hasContent: true,
      },
    );
  } finally {
    database.close();
  }
});

function makeSUT() {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  createIdentity(database, makeIdentity("identity-curator"));
  createIdentity(database, makeIdentity("identity-student"));

  const now = makeAdvancingClock("2026-05-28T12:00:00.000Z");
  const programCommands = createProgramCommands({
    database,
    generateId: makeIdGenerator([
      "program-1",
      "membership-curator-1",
      "program-event-1",
      "membership-event-1",
      "membership-student-1",
      "membership-event-2",
    ]),
    now,
  });
  const corpusCommands = createCorpusCommands({
    database,
    generateId: makeIdGenerator([
      "source-1",
      "corpus-event-1",
      "candidate-1",
      "corpus-event-2",
      "entity-1",
      "revision-1",
      "corpus-event-3",
      "candidate-2",
      "corpus-event-4",
      "revision-2",
      "corpus-event-5",
      "candidate-3",
      "corpus-event-6",
      "candidate-4",
      "corpus-event-7",
      "corpus-event-8",
      "entity-3",
      "revision-3",
      "corpus-event-9",
      "candidate-5",
      "corpus-event-10",
      "candidate-6",
      "corpus-event-11",
      "entity-4",
      "revision-4",
      "corpus-event-12",
      "candidate-7",
      "corpus-event-13",
      "entity-5",
      "revision-5",
      "corpus-event-14",
      "candidate-8",
      "corpus-event-15",
      "entity-6",
      "revision-6",
      "corpus-event-16",
      "candidate-9",
      "corpus-event-17",
      "entity-7",
      "revision-7",
      "candidate-10",
      "revision-8",
      "candidate-11",
      "corpus-event-18",
    ]),
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
    now,
  });

  return { corpusCommands, database, programCommands };
}

function listOutOfScopeTables(database) {
  const forbiddenNames = new Set([
    "assessment_criteria",
    "assessment_results",
    "answer_feedback",
    "evaluation_results",
    "human_reviews",
    "open_answer_feedback",
    "llm_runs",
    "llm_suggestions",
    "material_files",
    "materials",
    "student_answers",
    "student_attempts",
    "student_feedback",
    "student_learning_history",
    "student_mastery",
    "student_progress",
    "student_reviews",
    "student_weak_areas",
    "student_workspace",
  ]);
  return database
    .prepare("select name from sqlite_master where type = 'table' order by name")
    .all()
    .map($0 => $0.name)
    .filter($0 => forbiddenNames.has($0));
}

function listOutOfScopeSurfaces() {
  const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const checkedFiles = ["src/admin-ui.js", "src/cli.js", "src/server.js"];
  const forbiddenPatterns = [
    /\/assessments\b/,
    /\/feedback\b/,
    /\/corpus-events\/llm\b/,
    /\/corpus-events\/student-workspace\b/,
    /\/human-review\b/,
    /\/learning-history\b/,
    /\/mastery\b/,
    /\/student-answers\b/,
    /\/student-attempts\b/,
    /\/student-feedback\b/,
    /\/student-progress\b/,
    /\/weak-areas\b/,
    /\bassessmentFeedback\b/,
    /\bassessmentResults\b/,
    /\bevaluateOpenAnswer\b/,
    /\bhumanReview\b/,
    /\blearningHistory\b/,
    /\bllmRuns\b/,
    /\bopenAnswerAttempts\b/,
    /\bopenAnswerFeedback\b/,
    /\bscoreOpenAnswer\b/,
    /\bstudentAnswers\b/,
    /\bstudentAttempts\b/,
    /\bstudentFeedback\b/,
    /\bstudentMastery\b/,
    /\bstudentProgress\b/,
    /\bstudentWeakAreas\b/,
    /\bsubmitOpenAnswer\b/,
    /\bweakAreas\b/,
  ];
  return checkedFiles.flatMap(file => {
    const content = readFileSync(join(projectRoot, file), "utf8");
    return forbiddenPatterns
      .filter($0 => $0.test(content))
      .map($0 => `${file}:${$0.source}`);
  });
}

function learnerEvidenceTargetLinkAcceptanceProjection(result) {
  return {
    status: result.status,
    link: learnerEvidenceTargetLinkSummary(result.value.learnerEvidenceTargetLink),
  };
}

function learnerEvidenceTargetLinkSummary(link) {
  return {
    programId: link.programId,
    targetKind: link.targetKind,
    targetId: link.targetId,
    evidenceOwnerKind: link.evidenceOwnerKind,
    evidenceOwnerEntityId: link.evidenceOwnerEntityId,
    status: link.status,
  };
}

function readinessCheckAcceptanceSummary(readinessCheck) {
  return {
    entityId: readinessCheck.entityId,
    programId: readinessCheck.programId,
    title: readinessCheck.title,
    scopeKind: readinessCheck.scope.scopeKind,
    requirementTargets: readinessCheck.requirements.map($0 => [
      $0.targetKind,
      $0.targetId,
      $0.requiredLevel,
    ]),
  };
}

function containsForbiddenDetail(values) {
  const serialized = JSON.stringify(values).toLowerCase();
  return [
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

function makeIdentity(id) {
  return {
    id,
    displayName: `Display ${id}`,
    state: "active",
    createdAt: "2026-05-28T10:00:00.000Z",
  };
}

function makeAdvancingClock(startIso) {
  let tick = 0;
  const start = new Date(startIso).getTime();
  return () => new Date(start + tick++);
}

function makeIdGenerator(ids) {
  const nextIds = [...ids];
  return () => nextIds.shift();
}
