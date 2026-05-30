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
    const acceptedCriterionCandidate = corpusCommands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      title: "Accepted rubric",
      body: "Accepted rubric body",
    }).value.assessmentCriterionCandidate;
    const acceptedCriterion = corpusCommands.acceptAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: acceptedCriterionCandidate.candidateId,
    }).value.acceptedAssessmentCriterion;
    corpusCommands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      title: "Draft-only rubric",
      body: "Draft-only rubric body",
    });
    const rejectedCriterionCandidate = corpusCommands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      title: "Rejected rubric",
      body: "Rejected rubric body",
    }).value.assessmentCriterionCandidate;
    corpusCommands.rejectAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: rejectedCriterionCandidate.candidateId,
    });
    const acceptedCheckCandidate = corpusCommands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      checkKind: "open_answer",
      title: "Accepted open answer",
      prompt: "Explain graph traversal",
      criterionEntityIds: [acceptedCriterion.entityId],
    }).value.openAnswerCheckCandidate;
    const acceptedCheck = corpusCommands.acceptOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: acceptedCheckCandidate.candidateId,
    }).value.acceptedOpenAnswerCheck;
    corpusCommands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      checkKind: "open_answer",
      title: "Draft-only open answer",
      prompt: "Explain sorting",
      criterionEntityIds: [acceptedCriterion.entityId],
    });
    const rejectedCheckCandidate = corpusCommands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: program.programId,
      checkKind: "open_answer",
      title: "Rejected open answer",
      prompt: "Explain recursion",
      criterionEntityIds: [acceptedCriterion.entityId],
    }).value.openAnswerCheckCandidate;
    corpusCommands.rejectOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: rejectedCheckCandidate.candidateId,
    });

    assert.deepEqual(
      {
        acceptedCriterionTitles: corpusCommands.listAcceptedAssessmentCriteria({
          actingIdentityId: "identity-student",
          programId: program.programId,
        }).value.acceptedAssessmentCriteria.map($0 => $0.title),
        acceptedCheckTitles: corpusCommands.listAcceptedOpenAnswerChecks({
          actingIdentityId: "identity-student",
          programId: program.programId,
        }).value.acceptedOpenAnswerChecks.map($0 => $0.title),
        historicalCriterionTitle: corpusCommands.getAcceptedAssessmentCriterionRevision({
          actingIdentityId: "identity-student",
          revisionId: acceptedCriterion.revisionId,
        }).value.acceptedAssessmentCriterion.title,
        historicalCheckCriterionRevisionIds: corpusCommands.getAcceptedOpenAnswerCheckRevision({
          actingIdentityId: "identity-student",
          revisionId: acceptedCheck.revisionId,
        }).value.acceptedOpenAnswerCheck.criterionRevisionIds,
        outOfScopeTables: listOutOfScopeTables(database),
        outOfScopeSurfaces: listOutOfScopeSurfaces(),
      },
      {
        acceptedCriterionTitles: ["Accepted rubric"],
        acceptedCheckTitles: ["Accepted open answer"],
        historicalCriterionTitle: "Accepted rubric",
        historicalCheckCriterionRevisionIds: [acceptedCriterion.revisionId],
        outOfScopeTables: [],
        outOfScopeSurfaces: [],
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
    "open_answer_attempts",
    "open_answer_feedback",
    "llm_runs",
    "llm_suggestions",
    "material_files",
    "materials",
    "student_answers",
    "student_attempts",
    "student_feedback",
    "student_mastery",
    "student_progress",
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
    /\/corpus-events\/llm\b/,
    /\/corpus-events\/student-workspace\b/,
    /\bassessmentFeedback\b/,
    /\bevaluateOpenAnswer\b/,
    /\bhumanReview\b/,
    /\bllmRuns\b/,
    /\bscoreOpenAnswer\b/,
    /\bstudentAttempts\b/,
    /\bsubmitOpenAnswer\b/,
  ];
  return checkedFiles.flatMap(file => {
    const content = readFileSync(join(projectRoot, file), "utf8");
    return forbiddenPatterns
      .filter($0 => $0.test(content))
      .map($0 => `${file}:${$0.source}`);
  });
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
