import assert from "node:assert/strict";
import test from "node:test";
import { createProgramCommands } from "../src/program.js";
import {
  createCorpusEventRecord,
  createIdentity,
  createLocalPasswordCredential,
  createProgramMembershipRecord,
  createProgramShellRecord,
  createSession,
  getAcceptedAssessmentCriterionRevisionRecord,
  getAcceptedCorpusRevisionRecord,
  getAcceptedNavigationRelationshipRevisionRecord,
  getAcceptedOpenAnswerCheckRevisionRecord,
  getAcceptedQuickCheckEntityRecord,
  getAcceptedQuickCheckRevisionRecord,
  getAssessmentCriterionCandidateRecord,
  getCorpusCandidateRecord,
  getOpenAnswerCheckCandidateRecord,
  getQuickCheckCandidateRecord,
  grantAdminAuthority,
  initializeIdentityStorage,
  listAcceptedAssessmentCriterionEntityRecords,
  listAcceptedCorpusEntityRecords,
  listAcceptedNavigationRelationshipRecords,
  listAcceptedOpenAnswerCheckEntityRecords,
  listAssessmentCriterionCandidateRecords,
  listCorpusCandidateRecords,
  listCorpusEventRecords,
  listOpenAnswerCheckCandidateRecords,
  listProgramSourceRecords,
  listQuickCheckCandidateRecords,
  openIdentityDatabase,
  updateQuickCheckCandidateStatus,
} from "../src/storage.js";

test("recordProgramSource_shouldRejectUnknownAndDisabledIdentities", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
    createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));

    assert.deepEqual(
      {
        unknown: commands?.recordProgramSource({
          actingIdentityId: "identity-unknown",
          programId: "program-a",
          sourceKind: "article",
          title: "Source",
        }),
        disabled: commands?.recordProgramSource({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
          sourceKind: "article",
          title: "Source",
        }),
      },
      {
        unknown: { status: "rejected", reason: "identity_not_found" },
        disabled: { status: "rejected", reason: "identity_disabled" },
      },
    );
  } finally {
    database.close();
  }
});

test("recordProgramSource_shouldRejectUnknownProgram", async () => {
  const { commands, database } = await makeSUT();

  try {
    assert.deepEqual(
      commands.recordProgramSource({
        actingIdentityId: "identity-curator",
        programId: "program-unknown",
        sourceKind: "article",
        title: "Source",
      }),
      { status: "rejected", reason: "program_not_found" },
    );
  } finally {
    database.close();
  }
});

test("recordProgramSource_shouldRejectInvalidSourceInput", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });

    assert.deepEqual(
      {
        sourceKind: captureResult(() =>
          commands.recordProgramSource({
            actingIdentityId: "identity-curator",
            programId: "program-a",
            sourceKind: "unsupported",
            title: "Source",
          }),
        ),
        title: captureResult(() =>
          commands.recordProgramSource({
            actingIdentityId: "identity-curator",
            programId: "program-a",
            sourceKind: "article",
            title: " ",
          }),
        ),
        locator: captureResult(() =>
          commands.recordProgramSource({
            actingIdentityId: "identity-curator",
            programId: "program-a",
            sourceKind: "article",
            title: "Source",
            locator: " ",
          }),
        ),
        citation: captureResult(() =>
          commands.recordProgramSource({
            actingIdentityId: "identity-curator",
            programId: "program-a",
            sourceKind: "article",
            title: "Source",
            citation: " ",
          }),
        ),
      },
      {
        sourceKind: { status: "rejected", reason: "validation_failed" },
        title: { status: "rejected", reason: "validation_failed" },
        locator: { status: "rejected", reason: "validation_failed" },
        citation: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("recordProgramSource_shouldRejectNonCurator", async () => {
  const { commands, database } = await makeSUT();

  try {
    createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));

    assert.deepEqual(
      commands.recordProgramSource({
        actingIdentityId: "identity-curator",
        programId: "program-a",
        sourceKind: "article",
        title: "Source",
      }),
      { status: "rejected", reason: "admin_or_curator_required" },
    );
  } finally {
    database.close();
  }
});

test("recordProgramSource_shouldCreateProgramScopedSourceAndEvents_onAcceptedAndRejected", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: " Program source ",
      locator: " https://example.test/source ",
      citation: " Citation ",
    });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "unsupported",
      title: "Rejected source",
    });

    assert.deepEqual(
      {
        sources: listProgramSourceRecords(database, { programId: "program-a" }).map($0 => ({
          id: $0.id,
          programId: $0.programId,
          sourceKind: $0.sourceKind,
          title: $0.title,
          locator: $0.locator,
          citation: $0.citation,
          recordedByIdentityId: $0.recordedByIdentityId,
        })),
        events: listCorpusEventRecords(database, { programId: "program-a" }).map($0 => ({
          eventType: $0.eventType,
          actorIdentityId: $0.actorIdentityId,
          programId: $0.programId,
          targetId: $0.targetId,
          outcome: $0.outcome,
          reason: $0.reason,
        })),
      },
      {
        sources: [
          {
            id: "source-1",
            programId: "program-a",
            sourceKind: "article",
            title: "Program source",
            locator: "https://example.test/source",
            citation: "Citation",
            recordedByIdentityId: "identity-curator",
          },
        ],
        events: [
          {
            eventType: "program_source_recorded",
            actorIdentityId: "identity-curator",
            programId: "program-a",
            targetId: "source-1",
            outcome: "accepted",
            reason: null,
          },
          {
            eventType: "program_source_recorded",
            actorIdentityId: "identity-curator",
            programId: "program-a",
            targetId: null,
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

test("listProgramSources_shouldReturnOnlySourcesForRequestedProgram", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program A source",
    });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      sourceKind: "note",
      title: "Program B source",
    });

    assert.deepEqual(
      commands.listProgramSources?.({
        actingIdentityId: "identity-curator",
        programId: "program-a",
      }),
      {
        status: "accepted",
        value: {
          programSources: [
            {
              sourceId: "source-1",
              programId: "program-a",
              sourceKind: "article",
              title: "Program A source",
              recordedByIdentityId: "identity-curator",
              recordedAt: "2026-05-28T11:00:00.000Z",
            },
          ],
        },
      },
    );
  } finally {
    database.close();
  }
});

test("createCorpusCandidate_shouldRejectNonCurator", async () => {
  const { commands, database } = await makeSUT();

  try {
    createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));

    assert.deepEqual(
      commands.createCorpusCandidate?.({
        actingIdentityId: "identity-curator",
        programId: "program-a",
        candidateKind: "topic",
        title: "Candidate",
      }),
      { status: "rejected", reason: "admin_or_curator_required" },
    );
  } finally {
    database.close();
  }
});

test("createCorpusCandidate_shouldCreateDraftCandidateAndEvent_onValidSource", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program source",
    });

    const result = commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: " Candidate ",
      body: " Body ",
      sourceIds: ["source-1"],
      rationale: " Rationale ",
    });

    assert.deepEqual(
      {
        result,
        candidates: listCorpusCandidateRecords(database, {
          programId: "program-a",
          status: "draft",
        }),
        events: listCorpusEventRecords(database, { programId: "program-a" }).map($0 => ({
          eventType: $0.eventType,
          targetId: $0.targetId,
          outcome: $0.outcome,
          reason: $0.reason,
        })),
      },
      {
        result: {
          status: "accepted",
          value: {
            corpusCandidate: {
              candidateId: "source-2",
              programId: "program-a",
              candidateKind: "topic",
              title: "Candidate",
              body: "Body",
              sourceIds: ["source-1"],
              rationale: "Rationale",
              status: "draft",
              createdByIdentityId: "identity-curator",
              createdAt: "2026-05-28T11:00:00.002Z",
              updatedAt: "2026-05-28T11:00:00.002Z",
            },
          },
        },
        candidates: [
          {
            id: "source-2",
            programId: "program-a",
            candidateKind: "topic",
            title: "Candidate",
            body: "Body",
            sourceIds: ["source-1"],
            rationale: "Rationale",
            status: "draft",
            createdByIdentityId: "identity-curator",
            createdAt: "2026-05-28T11:00:00.002Z",
            updatedAt: "2026-05-28T11:00:00.002Z",
          },
        ],
        events: [
          {
            eventType: "program_source_recorded",
            targetId: "source-1",
            outcome: "accepted",
            reason: null,
          },
          {
            eventType: "corpus_candidate_created",
            targetId: "source-2",
            outcome: "accepted",
            reason: null,
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("createCorpusCandidate_shouldRejectInvalidCandidateInputAndSources", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      sourceKind: "article",
      title: "Other source",
    });

    assert.deepEqual(
      {
        candidateKind: commands.createCorpusCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          candidateKind: "unsupported",
          title: "Candidate",
        }),
        title: commands.createCorpusCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          candidateKind: "topic",
          title: " ",
        }),
        body: commands.createCorpusCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          candidateKind: "topic",
          title: "Candidate",
          body: " ",
        }),
        rationale: commands.createCorpusCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          candidateKind: "topic",
          title: "Candidate",
          rationale: " ",
        }),
        missingSource: commands.createCorpusCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          candidateKind: "topic",
          title: "Candidate",
          sourceIds: ["source-missing"],
        }),
        crossProgramSource: commands.createCorpusCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          candidateKind: "topic",
          title: "Candidate",
          sourceIds: ["source-1"],
        }),
      },
      {
        candidateKind: { status: "rejected", reason: "validation_failed" },
        title: { status: "rejected", reason: "validation_failed" },
        body: { status: "rejected", reason: "validation_failed" },
        rationale: { status: "rejected", reason: "validation_failed" },
        missingSource: { status: "rejected", reason: "source_not_found" },
        crossProgramSource: { status: "rejected", reason: "source_program_mismatch" },
      },
    );
  } finally {
    database.close();
  }
});

test("listCorpusCandidates_shouldReturnOnlyProgramCandidatesMatchingStatus", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Program A draft",
    });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      candidateKind: "topic",
      title: "Program B draft",
    });

    assert.deepEqual(
      commands.listCorpusCandidates?.({
        actingIdentityId: "identity-curator",
        programId: "program-a",
        status: "draft",
      }),
      {
        status: "accepted",
        value: {
          corpusCandidates: [
            {
              candidateId: "source-1",
              programId: "program-a",
              candidateKind: "topic",
              title: "Program A draft",
              sourceIds: [],
              status: "draft",
              createdByIdentityId: "identity-curator",
              createdAt: "2026-05-28T11:00:00.000Z",
              updatedAt: "2026-05-28T11:00:00.000Z",
            },
          ],
        },
      },
    );
  } finally {
    database.close();
  }
});

test("rejectCorpusCandidate_shouldChangeDraftToRejectedAndEmitEvent", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Candidate",
    });

    const result = commands.rejectCorpusCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });

    assert.deepEqual(
      {
        result,
        rejected: commands.listCorpusCandidates({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          status: "rejected",
        }),
        draft: commands.listCorpusCandidates({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          status: "draft",
        }),
        events: listCorpusEventRecords(database, { programId: "program-a" }).map($0 => ({
          eventType: $0.eventType,
          targetId: $0.targetId,
          outcome: $0.outcome,
          reason: $0.reason,
        })),
      },
      {
        result: {
          status: "accepted",
          value: {
            corpusCandidate: {
              candidateId: "source-1",
              programId: "program-a",
              candidateKind: "topic",
              title: "Candidate",
              sourceIds: [],
              status: "rejected",
              createdByIdentityId: "identity-curator",
              createdAt: "2026-05-28T11:00:00.000Z",
              updatedAt: "2026-05-28T11:00:00.002Z",
            },
          },
        },
        rejected: {
          status: "accepted",
          value: {
            corpusCandidates: [
              {
                candidateId: "source-1",
                programId: "program-a",
                candidateKind: "topic",
                title: "Candidate",
                sourceIds: [],
                status: "rejected",
                createdByIdentityId: "identity-curator",
                createdAt: "2026-05-28T11:00:00.000Z",
                updatedAt: "2026-05-28T11:00:00.002Z",
              },
            ],
          },
        },
        draft: {
          status: "accepted",
          value: { corpusCandidates: [] },
        },
        events: [
          {
            eventType: "corpus_candidate_created",
            targetId: "source-1",
            outcome: "accepted",
            reason: null,
          },
          {
            eventType: "corpus_candidate_rejected",
            targetId: "source-1",
            outcome: "accepted",
            reason: null,
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("rejectCorpusCandidate_shouldRejectUnknownAndAlreadyRejectedCandidates", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Candidate",
    });
    commands.rejectCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });

    assert.deepEqual(
      {
        unknown: commands.rejectCorpusCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "candidate-missing",
        }),
        alreadyRejected: commands.rejectCorpusCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "source-1",
        }),
      },
      {
        unknown: { status: "rejected", reason: "candidate_not_found" },
        alreadyRejected: { status: "rejected", reason: "candidate_already_rejected" },
      },
    );
  } finally {
    database.close();
  }
});

test("acceptCorpusCandidate_shouldCreateAcceptedEntityRevisionAndMarkCandidateAccepted", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program source",
    });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Accepted candidate",
      body: "Accepted body",
      sourceIds: ["source-1"],
      rationale: "Accepted rationale",
    });

    const result = commands.acceptCorpusCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: "source-2",
    });

    assert.deepEqual(
      {
        result,
        candidateStatus: getCorpusCandidateRecord(database, "source-2")?.status,
        entity: listAcceptedCorpusEntityRecords(database, { programId: "program-a" }),
        revision: getAcceptedCorpusRevisionRecord(database, "corpus-event-3"),
        event: listCorpusEventRecords(database, { programId: "program-a" }).at(-1),
      },
      {
        result: {
          status: "accepted",
          value: {
            acceptedCorpus: {
              entityId: "source-3",
              revisionId: "corpus-event-3",
              programId: "program-a",
              acceptedKind: "topic",
              title: "Accepted candidate",
              body: "Accepted body",
              acceptedFromCandidateId: "source-2",
              sourceIds: ["source-1"],
              rationale: "Accepted rationale",
              acceptedByIdentityId: "identity-curator",
              acceptedAt: "2026-05-28T11:00:00.004Z",
            },
          },
        },
        candidateStatus: "accepted",
        entity: [
          {
            id: "source-3",
            programId: "program-a",
            acceptedKind: "topic",
            currentRevisionId: "corpus-event-3",
          },
        ],
        revision: {
          id: "corpus-event-3",
          entityId: "source-3",
          programId: "program-a",
          acceptedKind: "topic",
          title: "Accepted candidate",
          body: "Accepted body",
          acceptedFromCandidateId: "source-2",
          sourceIds: ["source-1"],
          rationale: "Accepted rationale",
          acceptedByIdentityId: "identity-curator",
          acceptedAt: "2026-05-28T11:00:00.004Z",
        },
        event: {
          id: "source-4",
          eventType: "corpus_candidate_accepted",
          actorIdentityId: "identity-curator",
          programId: "program-a",
          targetId: "source-2",
          occurredAt: "2026-05-28T11:00:00.005Z",
          outcome: "accepted",
          reason: null,
        },
      },
    );
  } finally {
    database.close();
  }
});

test("acceptCorpusCandidate_shouldReplaceCurrentRevisionAndKeepHistoricalRevision", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program source",
    });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "First accepted",
    });
    commands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-2",
    });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Second accepted",
    });
    commands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-4",
      targetEntityId: "source-3",
    });

    assert.deepEqual(
      {
        current: commands.listAcceptedCorpus?.({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          acceptedKind: "topic",
        }),
        historical: commands.getAcceptedCorpusRevision?.({
          actingIdentityId: "identity-curator",
          revisionId: "corpus-event-3",
        }),
      },
      {
        current: {
          status: "accepted",
          value: {
            acceptedCorpus: [
              {
                entityId: "source-3",
                revisionId: "corpus-event-5",
                programId: "program-a",
                acceptedKind: "topic",
                title: "Second accepted",
                acceptedFromCandidateId: "corpus-event-4",
                sourceIds: [],
                acceptedByIdentityId: "identity-curator",
                acceptedAt: "2026-05-28T11:00:00.008Z",
              },
            ],
          },
        },
        historical: {
          status: "accepted",
          value: {
            acceptedCorpus: {
              entityId: "source-3",
              revisionId: "corpus-event-3",
              programId: "program-a",
              acceptedKind: "topic",
              title: "First accepted",
              acceptedFromCandidateId: "source-2",
              sourceIds: [],
              acceptedByIdentityId: "identity-curator",
              acceptedAt: "2026-05-28T11:00:00.004Z",
            },
          },
        },
      },
    );
  } finally {
    database.close();
  }
});

test("acceptCorpusCandidate_shouldRejectInvalidCandidateStatesAndTargets", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Accepted",
    });
    commands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Rejected",
    });
    commands.rejectCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-3",
    });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      candidateKind: "topic",
      title: "Other program",
    });
    commands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-5",
    });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Target candidate",
    });

    assert.deepEqual(
      {
        unknown: commands.acceptCorpusCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "candidate-missing",
        }),
        alreadyAccepted: commands.acceptCorpusCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "source-1",
        }),
        alreadyRejected: commands.acceptCorpusCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "corpus-event-3",
        }),
        missingTarget: commands.acceptCorpusCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "corpus-event-7",
          targetEntityId: "entity-missing",
        }),
        targetProgramMismatch: commands.acceptCorpusCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "corpus-event-7",
          targetEntityId: "source-6",
        }),
      },
      {
        unknown: { status: "rejected", reason: "candidate_not_found" },
        alreadyAccepted: { status: "rejected", reason: "candidate_already_accepted" },
        alreadyRejected: { status: "rejected", reason: "candidate_already_rejected" },
        missingTarget: { status: "rejected", reason: "accepted_entity_not_found" },
        targetProgramMismatch: { status: "rejected", reason: "accepted_entity_program_mismatch" },
      },
    );
  } finally {
    database.close();
  }
});

test("listAcceptedCorpus_shouldAuthorizeStudentCuratorAndAdminOnly", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    createIdentity(database, makeIdentity({ id: "identity-admin" }));
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    grantAdminAuthority(database, {
      identityId: "identity-admin",
      grantedAt: "2026-05-28T10:01:00.000Z",
    });
    seedCuratorProgram(database, { programId: "program-a" });
    createProgramMembershipRecord(database, {
      id: "membership-student",
      programId: "program-a",
      identityId: "identity-student",
      participationKind: "student",
      status: "active",
      createdAt: "2026-05-28T10:47:00.000Z",
      updatedAt: "2026-05-28T10:47:00.000Z",
    });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Accepted",
    });
    commands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });

    assert.deepEqual(
      {
        student: commands.listAcceptedCorpus({
          actingIdentityId: "identity-student",
          programId: "program-a",
        }).status,
        curator: commands.listAcceptedCorpus({
          actingIdentityId: "identity-curator",
          programId: "program-a",
        }).status,
        admin: commands.listAcceptedCorpus({
          actingIdentityId: "identity-admin",
          programId: "program-a",
        }).status,
        other: commands.listAcceptedCorpus({
          actingIdentityId: "identity-other",
          programId: "program-a",
        }),
        missingRevision: commands.getAcceptedCorpusRevision({
          actingIdentityId: "identity-curator",
          revisionId: "revision-missing",
        }),
      },
      {
        student: "accepted",
        curator: "accepted",
        admin: "accepted",
        other: { status: "rejected", reason: "participation_required" },
        missingRevision: { status: "rejected", reason: "revision_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("createNavigationCandidate_shouldPersistDraftMaterialMetadataAndRelationshipDrafts_onValidInput", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program source",
    });

    const result = commands.createNavigationCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "material_reference",
      title: "Linked reading",
      body: "Read section 2.",
      materialReferenceKind: "article",
      locator: "https://example.test/reading",
      citation: "Example Reading",
      sourceIds: ["source-1"],
      relationshipDrafts: [
        {
          relationshipKind: "concept_uses_material",
          fromEntityId: "concept-1",
          toCandidateRef: "self",
          label: "reading",
          sourceIds: ["source-1"],
        },
      ],
      rationale: "Supports concept",
    });

    assert.deepEqual(
      {
        result,
        stored: getCorpusCandidateRecord(database, "source-2"),
      },
      {
        result: {
          status: "accepted",
          value: {
            navigationCandidate: {
              candidateId: "source-2",
              programId: "program-a",
              candidateKind: "material_reference",
              title: "Linked reading",
              body: "Read section 2.",
              materialReferenceKind: "article",
              locator: "https://example.test/reading",
              citation: "Example Reading",
              sourceIds: ["source-1"],
              relationshipDrafts: [
                {
                  relationshipKind: "concept_uses_material",
                  fromEntityId: "concept-1",
                  toCandidateRef: "self",
                  label: "reading",
                  sourceIds: ["source-1"],
                },
              ],
              rationale: "Supports concept",
              status: "draft",
              createdByIdentityId: "identity-curator",
              createdAt: "2026-05-28T11:00:00.002Z",
              updatedAt: "2026-05-28T11:00:00.002Z",
            },
          },
        },
        stored: {
          id: "source-2",
          programId: "program-a",
          candidateKind: "material_reference",
          title: "Linked reading",
          body: "Read section 2.",
          materialReferenceKind: "article",
          locator: "https://example.test/reading",
          citation: "Example Reading",
          sourceIds: ["source-1"],
          relationshipDrafts: [
            {
              relationshipKind: "concept_uses_material",
              fromEntityId: "concept-1",
              toCandidateRef: "self",
              label: "reading",
              sourceIds: ["source-1"],
            },
          ],
          rationale: "Supports concept",
          status: "draft",
          createdByIdentityId: "identity-curator",
          createdAt: "2026-05-28T11:00:00.002Z",
          updatedAt: "2026-05-28T11:00:00.002Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("createNavigationCandidate_shouldRejectInvalidNavigationInputAndUnauthorizedMutation", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program A source",
    });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      sourceKind: "article",
      title: "Program B source",
    });

    assert.deepEqual(
      {
        unauthorized: commands.createNavigationCandidate({
          actingIdentityId: "identity-other",
          programId: "program-a",
          candidateKind: "topic",
          title: "Topic",
        }),
        candidateKind: commands.createNavigationCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          candidateKind: "unsupported",
          title: "Topic",
        }),
        title: commands.createNavigationCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          candidateKind: "topic",
          title: " ",
        }),
        requiredBody: commands.createNavigationCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          candidateKind: "definition",
          title: "Definition",
          body: " ",
        }),
        materialReference: commands.createNavigationCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          candidateKind: "material_reference",
          title: "Material",
          materialReferenceKind: "article",
        }),
        relationshipUpdate: commands.createNavigationCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          candidateKind: "relationship_update",
          title: "Relationships",
        }),
        malformedRelationshipDraft: commands.createNavigationCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          candidateKind: "concept",
          title: "Concept",
          relationshipDrafts: [
            {
              relationshipKind: "topic_includes_concept",
              toCandidateRef: "self",
            },
          ],
        }),
        missingRelationshipSource: commands.createNavigationCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          candidateKind: "relationship_update",
          title: "Relationships",
          relationshipDrafts: [
            {
              relationshipKind: "concept_related",
              fromEntityId: "concept-a",
              toEntityId: "concept-b",
              sourceIds: ["source-missing"],
            },
          ],
        }),
        crossProgramRelationshipSource: commands.createNavigationCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          candidateKind: "relationship_update",
          title: "Relationships",
          relationshipDrafts: [
            {
              relationshipKind: "concept_related",
              fromEntityId: "concept-a",
              toEntityId: "concept-b",
              sourceIds: ["source-2"],
            },
          ],
        }),
      },
      {
        unauthorized: { status: "rejected", reason: "admin_or_curator_required" },
        candidateKind: { status: "rejected", reason: "validation_failed" },
        title: { status: "rejected", reason: "validation_failed" },
        requiredBody: { status: "rejected", reason: "validation_failed" },
        materialReference: { status: "rejected", reason: "validation_failed" },
        relationshipUpdate: { status: "rejected", reason: "validation_failed" },
        malformedRelationshipDraft: { status: "rejected", reason: "validation_failed" },
        missingRelationshipSource: { status: "rejected", reason: "source_not_found" },
        crossProgramRelationshipSource: { status: "rejected", reason: "source_program_mismatch" },
      },
    );
  } finally {
    database.close();
  }
});

test("acceptNavigationCandidate_shouldCreateAcceptedMaterialAndRelationship_onValidDraft", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program source",
    });
    const concept = commands.createNavigationCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "concept",
      title: "Concept A",
      sourceIds: ["source-1"],
    });
    commands.acceptNavigationCandidate({
      actingIdentityId: "identity-curator",
      candidateId: concept.value.navigationCandidate.candidateId,
    });
    const material = commands.createNavigationCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "material_reference",
      title: "Linked reading",
      materialReferenceKind: "article",
      locator: "https://example.test/reading",
      sourceIds: ["source-1"],
      relationshipDrafts: [
        {
          relationshipKind: "concept_uses_material",
          fromEntityId: "source-3",
          toCandidateRef: "self",
          label: "uses",
          sourceIds: ["source-1"],
        },
      ],
    });

    const result = commands.acceptNavigationCandidate({
      actingIdentityId: "identity-curator",
      candidateId: material.value.navigationCandidate.candidateId,
    });
    const acceptedRelationship = result.value.navigationChange.acceptedRelationships[0];

    assert.deepEqual(
      {
        result,
        relationship: listAcceptedNavigationRelationshipRecords(database, { programId: "program-a" }),
        relationshipRevision: getAcceptedNavigationRelationshipRevisionRecord(
          database,
          acceptedRelationship.relationshipRevisionId,
        ),
      },
      {
        result: {
          status: "accepted",
          value: {
            navigationChange: {
              acceptedCorpus: {
                entityId: "corpus-event-5",
                revisionId: "source-6",
                programId: "program-a",
                acceptedKind: "material_reference",
                title: "Linked reading",
                materialReferenceKind: "article",
                locator: "https://example.test/reading",
                sourceIds: ["source-1"],
                acceptedFromCandidateId: "corpus-event-4",
                acceptedByIdentityId: "identity-curator",
                acceptedAt: "2026-05-28T11:00:00.008Z",
              },
              acceptedRelationships: [
                {
                  relationshipId: "source-7",
                  relationshipRevisionId: "corpus-event-6",
                  programId: "program-a",
                  relationshipKind: "concept_uses_material",
                  fromEntityId: "source-3",
                  fromRevisionId: "corpus-event-3",
                  fromKind: "concept",
                  toEntityId: "corpus-event-5",
                  toRevisionId: "source-6",
                  toKind: "material_reference",
                  label: "uses",
                  sourceIds: ["source-1"],
                  acceptedFromCandidateId: "corpus-event-4",
                  acceptedByIdentityId: "identity-curator",
                  acceptedAt: "2026-05-28T11:00:00.008Z",
                },
              ],
            },
          },
        },
        relationship: [
          {
            id: "source-7",
            programId: "program-a",
            relationshipKind: "concept_uses_material",
            fromEntityId: "source-3",
            toEntityId: "corpus-event-5",
            currentRevisionId: "corpus-event-6",
          },
        ],
        relationshipRevision: {
          id: "corpus-event-6",
          relationshipId: "source-7",
          programId: "program-a",
          relationshipKind: "concept_uses_material",
          fromEntityId: "source-3",
          fromRevisionId: "corpus-event-3",
          fromKind: "concept",
          toEntityId: "corpus-event-5",
          toRevisionId: "source-6",
          toKind: "material_reference",
          label: "uses",
          sourceIds: ["source-1"],
          acceptedFromCandidateId: "corpus-event-4",
          acceptedByIdentityId: "identity-curator",
          acceptedAt: "2026-05-28T11:00:00.008Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("listProgramNavigation_shouldReturnStudentSafeGraphWithoutStudentStateMutation_onAcceptedNavigation", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedStudentMembership(database, {
      id: "membership-student",
      programId: "program-a",
      identityId: "identity-student",
    });
    const topic = acceptNavigationCandidate(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Topic A",
    });
    const concept = acceptNavigationCandidate(commands, {
      programId: "program-a",
      candidateKind: "concept",
      title: "Concept A",
      relationshipDrafts: [
        {
          relationshipKind: "topic_includes_concept",
          fromEntityId: topic.entityId,
          toCandidateRef: "self",
        },
      ],
    });
    acceptNavigationCandidate(commands, {
      programId: "program-a",
      candidateKind: "material_reference",
      title: "Material A",
      materialReferenceKind: "article",
      locator: "https://example.test/material",
      relationshipDrafts: [
        {
          relationshipKind: "concept_uses_material",
          fromEntityId: concept.entityId,
          toCandidateRef: "self",
        },
      ],
    });
    const before = snapshotNavigationReadBoundary(database);

    const result = commands.listProgramNavigation({
      actingIdentityId: "identity-student",
      programId: "program-a",
    });
    const detail = commands.getNavigationEntity({
      actingIdentityId: "identity-student",
      entityId: concept.entityId,
    });

    assert.deepEqual(
      {
        result,
        detail,
        leakedForbiddenDetails: containsNavigationForbiddenDetail([result, detail]),
        boundary: snapshotNavigationReadBoundary(database),
      },
      {
        result: {
          status: "accepted",
          value: {
            navigation: {
              programId: "program-a",
              topics: [
                {
                  entityId: topic.entityId,
                  revisionId: topic.revisionId,
                  acceptedKind: "topic",
                  title: "Topic A",
                },
              ],
              ungroupedConcepts: [],
              ungroupedMaterials: [],
            },
          },
        },
        detail: {
          status: "accepted",
          value: {
            navigationNode: {
              entityId: concept.entityId,
              revisionId: concept.revisionId,
              programId: "program-a",
              acceptedKind: "concept",
              title: "Concept A",
              relationships: {
                outgoing: [
                  {
                    relationshipId: "corpus-event-9",
                    relationshipRevisionId: "source-9",
                    relationshipKind: "concept_uses_material",
                    fromEntityId: concept.entityId,
                    fromRevisionId: concept.revisionId,
                    fromKind: "concept",
                    fromTitle: "Concept A",
                    toEntityId: "source-8",
                    toRevisionId: "corpus-event-8",
                    toKind: "material_reference",
                    toTitle: "Material A",
                  },
                ],
                incoming: [
                  {
                    relationshipId: "source-6",
                    relationshipRevisionId: "corpus-event-5",
                    relationshipKind: "topic_includes_concept",
                    fromEntityId: topic.entityId,
                    fromRevisionId: topic.revisionId,
                    fromKind: "topic",
                    fromTitle: "Topic A",
                    toEntityId: concept.entityId,
                    toRevisionId: concept.revisionId,
                    toKind: "concept",
                    toTitle: "Concept A",
                  },
                ],
              },
            },
          },
        },
        leakedForbiddenDetails: false,
        boundary: before,
      },
    );
  } finally {
    database.close();
  }
});

test("listProgramNavigation_shouldAuthorizeStudentCuratorAndAdminOnly_onAcceptedNavigation", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    createIdentity(database, makeIdentity({ id: "identity-admin" }));
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    grantAdminAuthority(database, {
      identityId: "identity-admin",
      grantedAt: "2026-05-28T10:01:00.000Z",
    });
    seedCuratorProgram(database, { programId: "program-a" });
    seedStudentMembership(database, {
      id: "membership-student",
      programId: "program-a",
      identityId: "identity-student",
    });
    const topic = acceptNavigationCandidate(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Topic A",
    });
    commands.createNavigationCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Topic A replacement",
    });
    commands.acceptNavigationCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-3",
      targetEntityId: topic.entityId,
    });

    assert.deepEqual(
      {
        student: commands.listProgramNavigation({
          actingIdentityId: "identity-student",
          programId: "program-a",
        }).status,
        curator: commands.getNavigationEntity({
          actingIdentityId: "identity-curator",
          entityId: topic.entityId,
        }).status,
        admin: commands.getNavigationRevision({
          actingIdentityId: "identity-admin",
          revisionId: topic.revisionId,
        }),
        other: commands.listProgramNavigation({
          actingIdentityId: "identity-other",
          programId: "program-a",
        }),
        missingEntity: commands.getNavigationEntity({
          actingIdentityId: "identity-curator",
          entityId: "entity-missing",
        }),
        missingRevision: commands.getNavigationRevision({
          actingIdentityId: "identity-curator",
          revisionId: "revision-missing",
        }),
      },
      {
        student: "accepted",
        curator: "accepted",
        admin: {
          status: "accepted",
          value: {
            navigationRevision: {
              entityId: topic.entityId,
              revisionId: topic.revisionId,
              programId: "program-a",
              acceptedKind: "topic",
              title: "Topic A",
              isCurrentRevision: false,
            },
          },
        },
        other: { status: "rejected", reason: "participation_required" },
        missingEntity: { status: "rejected", reason: "navigation_entity_not_found" },
        missingRevision: { status: "rejected", reason: "navigation_revision_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("acceptNavigationCandidate_shouldRejectInvalidRelationshipDraftAtomically_onWrongEndpointKind", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const topic = acceptNavigationCandidate(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Topic A",
    });
    const candidate = commands.createNavigationCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "material_reference",
      title: "Material A",
      materialReferenceKind: "article",
      locator: "https://example.test/material",
      relationshipDrafts: [
        {
          relationshipKind: "concept_uses_material",
          fromEntityId: topic.entityId,
          toCandidateRef: "self",
        },
      ],
    });

    const result = commands.acceptNavigationCandidate({
      actingIdentityId: "identity-curator",
      candidateId: candidate.value.navigationCandidate.candidateId,
    });

    assert.deepEqual(
      {
        result,
        candidateStatus: getCorpusCandidateRecord(database, candidate.value.navigationCandidate.candidateId).status,
        acceptedEntityCount: listAcceptedCorpusEntityRecords(database, { programId: "program-a" }).length,
        acceptedRelationshipCount: listAcceptedNavigationRelationshipRecords(database, { programId: "program-a" }).length,
        eventCount: listCorpusEventRecords(database, { programId: "program-a" }).length,
      },
      {
        result: { status: "rejected", reason: "navigation_relationship_endpoint_kind_mismatch" },
        candidateStatus: "draft",
        acceptedEntityCount: 1,
        acceptedRelationshipCount: 0,
        eventCount: 3,
      },
    );
  } finally {
    database.close();
  }
});

test("createAssessmentCriterionCandidate_shouldCreateDraftCandidateForCurator", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program source",
    });

    const result = commands.createAssessmentCriterionCandidate?.({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: " Criterion title ",
      body: " Criterion body ",
      sourceIds: ["source-1"],
      rationale: " Criterion rationale ",
    });

    assert.deepEqual(
      {
        result,
        candidates: listAssessmentCriterionCandidateRecords(database, {
          programId: "program-a",
          status: "draft",
        }),
      },
      {
        result: {
          status: "accepted",
          value: {
            assessmentCriterionCandidate: {
              candidateId: "source-2",
              programId: "program-a",
              title: "Criterion title",
              body: "Criterion body",
              sourceIds: ["source-1"],
              rationale: "Criterion rationale",
              status: "draft",
              createdByIdentityId: "identity-curator",
              createdAt: "2026-05-28T11:00:00.002Z",
              updatedAt: "2026-05-28T11:00:00.002Z",
            },
          },
        },
        candidates: [
          {
            id: "source-2",
            programId: "program-a",
            title: "Criterion title",
            body: "Criterion body",
            sourceIds: ["source-1"],
            rationale: "Criterion rationale",
            status: "draft",
            createdByIdentityId: "identity-curator",
            createdAt: "2026-05-28T11:00:00.002Z",
            updatedAt: "2026-05-28T11:00:00.002Z",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("createAssessmentCriterionCandidate_shouldRejectInactiveProgramAuthorizationAndInvalidInput", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      sourceKind: "article",
      title: "Other source",
    });

    assert.deepEqual(
      {
        inactive: commands.createAssessmentCriterionCandidate({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
          title: "Criterion",
          body: "Body",
        }),
        unknownProgram: commands.createAssessmentCriterionCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-missing",
          title: "Criterion",
          body: "Body",
        }),
        nonCurator: commands.createAssessmentCriterionCandidate({
          actingIdentityId: "identity-other",
          programId: "program-a",
          title: "Criterion",
          body: "Body",
        }),
        title: commands.createAssessmentCriterionCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          title: " ",
          body: "Body",
        }),
        body: commands.createAssessmentCriterionCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          title: "Criterion",
          body: " ",
        }),
        rationale: commands.createAssessmentCriterionCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          title: "Criterion",
          body: "Body",
          rationale: " ",
        }),
        nullSourceIds: commands.createAssessmentCriterionCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          title: "Criterion",
          body: "Body",
          sourceIds: null,
        }),
        missingSource: commands.createAssessmentCriterionCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          title: "Criterion",
          body: "Body",
          sourceIds: ["source-missing"],
        }),
        crossProgramSource: commands.createAssessmentCriterionCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          title: "Criterion",
          body: "Body",
          sourceIds: ["source-1"],
        }),
      },
      {
        inactive: { status: "rejected", reason: "identity_not_active" },
        unknownProgram: { status: "rejected", reason: "program_not_found" },
        nonCurator: { status: "rejected", reason: "admin_or_curator_required" },
        title: { status: "rejected", reason: "validation_failed" },
        body: { status: "rejected", reason: "validation_failed" },
        rationale: { status: "rejected", reason: "validation_failed" },
        nullSourceIds: { status: "rejected", reason: "validation_failed" },
        missingSource: { status: "rejected", reason: "source_not_found" },
        crossProgramSource: { status: "rejected", reason: "source_program_mismatch" },
      },
    );
  } finally {
    database.close();
  }
});

test("listAssessmentCriterionCandidates_shouldReturnProgramCandidatesMatchingSupportedStatusForCurator", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    commands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Program A draft",
      body: "Program A body",
    });
    commands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      title: "Program B draft",
      body: "Program B body",
    });

    assert.deepEqual(
      {
        draft: commands.listAssessmentCriterionCandidates?.({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          status: "draft",
        }),
        unsupported: commands.listAssessmentCriterionCandidates?.({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          status: "archived",
        }),
        nonCurator: commands.listAssessmentCriterionCandidates?.({
          actingIdentityId: "identity-other",
          programId: "program-a",
          status: "draft",
        }),
      },
      {
        draft: {
          status: "accepted",
          value: {
            assessmentCriterionCandidates: [
              {
                candidateId: "source-1",
                programId: "program-a",
                title: "Program A draft",
                body: "Program A body",
                sourceIds: [],
                status: "draft",
                createdByIdentityId: "identity-curator",
                createdAt: "2026-05-28T11:00:00.000Z",
                updatedAt: "2026-05-28T11:00:00.000Z",
              },
            ],
          },
        },
        unsupported: { status: "rejected", reason: "validation_failed" },
        nonCurator: { status: "rejected", reason: "admin_or_curator_required" },
      },
    );
  } finally {
    database.close();
  }
});

test("acceptAssessmentCriterionCandidate_shouldCreateAcceptedEntityRevisionAndMarkCandidateAccepted", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program source",
    });
    commands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Accepted criterion",
      body: "Accepted body",
      sourceIds: ["source-1"],
      rationale: "Accepted rationale",
    });

    const result = commands.acceptAssessmentCriterionCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: "source-2",
    });

    assert.deepEqual(
      {
        result,
        candidateStatus: getAssessmentCriterionCandidateRecord(database, "source-2")?.status,
        entity: listAcceptedAssessmentCriterionEntityRecords(database, { programId: "program-a" }),
        revision: getAcceptedAssessmentCriterionRevisionRecord(database, "source-3"),
      },
      {
        result: {
          status: "accepted",
          value: {
            acceptedAssessmentCriterion: {
              entityId: "corpus-event-2",
              revisionId: "source-3",
              programId: "program-a",
              title: "Accepted criterion",
              body: "Accepted body",
              acceptedFromCandidateId: "source-2",
              sourceIds: ["source-1"],
              rationale: "Accepted rationale",
              acceptedByIdentityId: "identity-curator",
              acceptedAt: "2026-05-28T11:00:00.003Z",
            },
          },
        },
        candidateStatus: "accepted",
        entity: [
          {
            id: "corpus-event-2",
            programId: "program-a",
            currentRevisionId: "source-3",
          },
        ],
        revision: {
          id: "source-3",
          entityId: "corpus-event-2",
          programId: "program-a",
          title: "Accepted criterion",
          body: "Accepted body",
          acceptedFromCandidateId: "source-2",
          sourceIds: ["source-1"],
          rationale: "Accepted rationale",
          acceptedByIdentityId: "identity-curator",
          acceptedAt: "2026-05-28T11:00:00.003Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("acceptAssessmentCriterionCandidate_shouldReplaceCurrentRevisionAndKeepHistoricalRevision", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "First criterion",
      body: "First body",
    });
    commands.acceptAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });
    commands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Second criterion",
      body: "Second body",
    });
    commands.acceptAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-2",
      targetEntityId: "corpus-event-1",
    });

    assert.deepEqual(
      {
        current: commands.listAcceptedAssessmentCriteria?.({
          actingIdentityId: "identity-curator",
          programId: "program-a",
        }),
        historical: commands.getAcceptedAssessmentCriterionRevision?.({
          actingIdentityId: "identity-curator",
          revisionId: "source-2",
        }),
      },
      {
        current: {
          status: "accepted",
          value: {
            acceptedAssessmentCriteria: [
              {
                entityId: "corpus-event-1",
                revisionId: "source-3",
                programId: "program-a",
                title: "Second criterion",
                body: "Second body",
                acceptedFromCandidateId: "corpus-event-2",
                sourceIds: [],
                acceptedByIdentityId: "identity-curator",
                acceptedAt: "2026-05-28T11:00:00.003Z",
              },
            ],
          },
        },
        historical: {
          status: "accepted",
          value: {
            acceptedAssessmentCriterion: {
              entityId: "corpus-event-1",
              revisionId: "source-2",
              programId: "program-a",
              title: "First criterion",
              body: "First body",
              acceptedFromCandidateId: "source-1",
              sourceIds: [],
              acceptedByIdentityId: "identity-curator",
              acceptedAt: "2026-05-28T11:00:00.001Z",
            },
          },
        },
      },
    );
  } finally {
    database.close();
  }
});

test("acceptAssessmentCriterionCandidate_shouldRejectInvalidCandidateStatesAndTargets", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    commands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Accepted criterion",
      body: "Accepted body",
    });
    commands.acceptAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });
    commands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Rejected criterion",
      body: "Rejected body",
    });
    commands.rejectAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-2",
    });
    commands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      title: "Other criterion",
      body: "Other body",
    });
    commands.acceptAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-3",
    });
    commands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Target criterion",
      body: "Target body",
    });

    assert.deepEqual(
      {
        unknown: commands.acceptAssessmentCriterionCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "candidate-missing",
        }),
        alreadyAccepted: commands.acceptAssessmentCriterionCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "source-1",
        }),
        rejectAlreadyAccepted: commands.rejectAssessmentCriterionCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "source-1",
        }),
        unauthorizedAccepted: commands.acceptAssessmentCriterionCandidate({
          actingIdentityId: "identity-other",
          candidateId: "source-1",
        }),
        alreadyRejected: commands.acceptAssessmentCriterionCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "corpus-event-2",
        }),
        missingTarget: commands.acceptAssessmentCriterionCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "corpus-event-4",
          targetEntityId: "entity-missing",
        }),
        targetProgramMismatch: commands.acceptAssessmentCriterionCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "corpus-event-4",
          targetEntityId: "corpus-event-3",
        }),
      },
      {
        unknown: { status: "rejected", reason: "criterion_candidate_not_found" },
        alreadyAccepted: { status: "rejected", reason: "criterion_candidate_already_accepted" },
        rejectAlreadyAccepted: {
          status: "rejected",
          reason: "criterion_candidate_already_accepted",
        },
        unauthorizedAccepted: { status: "rejected", reason: "admin_or_curator_required" },
        alreadyRejected: { status: "rejected", reason: "criterion_candidate_already_rejected" },
        missingTarget: { status: "rejected", reason: "criterion_entity_not_found" },
        targetProgramMismatch: { status: "rejected", reason: "criterion_entity_program_mismatch" },
      },
    );
  } finally {
    database.close();
  }
});

test("rejectAssessmentCriterionCandidate_shouldChangeDraftToRejectedWithoutAcceptedCriterion", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Rejected criterion",
      body: "Rejected body",
    });

    const result = commands.rejectAssessmentCriterionCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });
    const alreadyRejectedResult = commands.rejectAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });

    assert.deepEqual(
      {
        result,
        unknown: commands.rejectAssessmentCriterionCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "criterion-candidate-missing",
        }),
        alreadyRejectedResult,
        rejected: commands.listAssessmentCriterionCandidates({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          status: "rejected",
        }),
        acceptedEntities: listAcceptedAssessmentCriterionEntityRecords(database, { programId: "program-a" }),
      },
      {
        result: {
          status: "accepted",
          value: {
            assessmentCriterionCandidate: {
              candidateId: "source-1",
              programId: "program-a",
              title: "Rejected criterion",
              body: "Rejected body",
              sourceIds: [],
              status: "rejected",
              createdByIdentityId: "identity-curator",
              createdAt: "2026-05-28T11:00:00.000Z",
              updatedAt: "2026-05-28T11:00:00.001Z",
            },
          },
        },
        unknown: { status: "rejected", reason: "criterion_candidate_not_found" },
        alreadyRejectedResult: {
          status: "rejected",
          reason: "criterion_candidate_already_rejected",
        },
        rejected: {
          status: "accepted",
          value: {
            assessmentCriterionCandidates: [
              {
                candidateId: "source-1",
                programId: "program-a",
                title: "Rejected criterion",
                body: "Rejected body",
                sourceIds: [],
                status: "rejected",
                createdByIdentityId: "identity-curator",
                createdAt: "2026-05-28T11:00:00.000Z",
                updatedAt: "2026-05-28T11:00:00.001Z",
              },
            ],
          },
        },
        acceptedEntities: [],
      },
    );
  } finally {
    database.close();
  }
});

test("listAcceptedAssessmentCriteria_shouldAuthorizeStudentCuratorAndAdminOnly", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    createIdentity(database, makeIdentity({ id: "identity-admin" }));
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    grantAdminAuthority(database, {
      identityId: "identity-admin",
      grantedAt: "2026-05-28T10:01:00.000Z",
    });
    seedCuratorProgram(database, { programId: "program-a" });
    createProgramMembershipRecord(database, {
      id: "membership-student",
      programId: "program-a",
      identityId: "identity-student",
      participationKind: "student",
      status: "active",
      createdAt: "2026-05-28T10:47:00.000Z",
      updatedAt: "2026-05-28T10:47:00.000Z",
    });
    commands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Accepted criterion",
      body: "Accepted body",
    });
    commands.acceptAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });

    assert.deepEqual(
      {
        student: commands.listAcceptedAssessmentCriteria({
          actingIdentityId: "identity-student",
          programId: "program-a",
        }).status,
        curator: commands.listAcceptedAssessmentCriteria({
          actingIdentityId: "identity-curator",
          programId: "program-a",
        }).status,
        admin: commands.listAcceptedAssessmentCriteria({
          actingIdentityId: "identity-admin",
          programId: "program-a",
        }).status,
        other: commands.listAcceptedAssessmentCriteria({
          actingIdentityId: "identity-other",
          programId: "program-a",
        }),
        adminCreate: commands.createAssessmentCriterionCandidate({
          actingIdentityId: "identity-admin",
          programId: "program-a",
          title: "Admin criterion",
          body: "Admin body",
        }),
        missingRevision: commands.getAcceptedAssessmentCriterionRevision({
          actingIdentityId: "identity-curator",
          revisionId: "revision-missing",
        }),
      },
      {
        student: "accepted",
        curator: "accepted",
        admin: "accepted",
        other: { status: "rejected", reason: "participation_required" },
        adminCreate: { status: "rejected", reason: "admin_or_curator_required" },
        missingRevision: { status: "rejected", reason: "criterion_revision_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("assessmentCriterionResponses_shouldUseRedactedShapes", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Accepted criterion",
      body: "Accepted body",
    });
    commands.acceptAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });
    const candidateResult = commands.listAssessmentCriterionCandidates({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });
    const acceptedResult = commands.listAcceptedAssessmentCriteria({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });
    const rejectionResult = commands.acceptAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });

    assert.deepEqual(
      containsForbiddenDetail([candidateResult, acceptedResult, rejectionResult]),
      false,
    );
  } finally {
    database.close();
  }
});

test("createOpenAnswerCheckCandidate_shouldCreateDraftCandidateForCurator", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program source",
    });
    seedAcceptedAssessmentCriterion(commands, {
      programId: "program-a",
      title: "Criterion",
      body: "Criterion body",
    });

    const result = commands.createOpenAnswerCheckCandidate?.({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "open_answer",
      title: " Check title ",
      prompt: " Check prompt ",
      sourceIds: ["source-1"],
      criterionEntityIds: ["corpus-event-2"],
      rationale: " Check rationale ",
    });

    assert.deepEqual(
      {
        result,
        candidates: listOpenAnswerCheckCandidateRecords(database, {
          programId: "program-a",
          status: "draft",
        }),
      },
      {
        result: {
          status: "accepted",
          value: {
            openAnswerCheckCandidate: {
              candidateId: "corpus-event-3",
              programId: "program-a",
              checkKind: "open_answer",
              title: "Check title",
              prompt: "Check prompt",
              sourceIds: ["source-1"],
              criterionEntityIds: ["corpus-event-2"],
              rationale: "Check rationale",
              status: "draft",
              createdByIdentityId: "identity-curator",
              createdAt: "2026-05-28T11:00:00.004Z",
              updatedAt: "2026-05-28T11:00:00.004Z",
            },
          },
        },
        candidates: [
          {
            id: "corpus-event-3",
            programId: "program-a",
            checkKind: "open_answer",
            title: "Check title",
            prompt: "Check prompt",
            sourceIds: ["source-1"],
            criterionEntityIds: ["corpus-event-2"],
            rationale: "Check rationale",
            status: "draft",
            createdByIdentityId: "identity-curator",
            createdAt: "2026-05-28T11:00:00.004Z",
            updatedAt: "2026-05-28T11:00:00.004Z",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("createOpenAnswerCheckCandidate_shouldRejectInvalidAuthorizationInputSourcesAndCriteria", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      sourceKind: "article",
      title: "Other source",
    });
    seedAcceptedAssessmentCriterion(commands, {
      programId: "program-a",
      title: "Criterion",
      body: "Criterion body",
    });
    seedAcceptedAssessmentCriterion(commands, {
      programId: "program-b",
      title: "Other criterion",
      body: "Other criterion body",
    });

    assert.deepEqual(
      {
        inactive: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Check",
          prompt: "Prompt",
          criterionEntityIds: ["corpus-event-2"],
        }),
        unknownProgram: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-missing",
          checkKind: "open_answer",
          title: "Check",
          prompt: "Prompt",
          criterionEntityIds: ["corpus-event-2"],
        }),
        nonCurator: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-other",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Check",
          prompt: "Prompt",
          criterionEntityIds: ["corpus-event-2"],
        }),
        checkKind: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "multiple_choice",
          title: "Check",
          prompt: "Prompt",
          criterionEntityIds: ["corpus-event-2"],
        }),
        title: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "open_answer",
          title: " ",
          prompt: "Prompt",
          criterionEntityIds: ["corpus-event-2"],
        }),
        prompt: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Check",
          prompt: " ",
          criterionEntityIds: ["corpus-event-2"],
        }),
        rationale: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Check",
          prompt: "Prompt",
          criterionEntityIds: ["corpus-event-2"],
          rationale: " ",
        }),
        nullSourceIds: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Check",
          prompt: "Prompt",
          sourceIds: null,
          criterionEntityIds: ["corpus-event-2"],
        }),
        nonStringSourceIds: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Check",
          prompt: "Prompt",
          sourceIds: [null],
          criterionEntityIds: ["corpus-event-2"],
        }),
        emptyCriteria: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Check",
          prompt: "Prompt",
          criterionEntityIds: [],
        }),
        nonStringCriteria: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Check",
          prompt: "Prompt",
          criterionEntityIds: [null],
        }),
        missingCriteria: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Check",
          prompt: "Prompt",
        }),
        missingSource: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Check",
          prompt: "Prompt",
          sourceIds: ["source-missing"],
          criterionEntityIds: ["corpus-event-2"],
        }),
        crossProgramSource: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Check",
          prompt: "Prompt",
          sourceIds: ["source-1"],
          criterionEntityIds: ["corpus-event-2"],
        }),
        missingCriterion: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Check",
          prompt: "Prompt",
          criterionEntityIds: ["criterion-missing"],
        }),
        crossProgramCriterion: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Check",
          prompt: "Prompt",
          criterionEntityIds: ["source-4"],
        }),
      },
      {
        inactive: { status: "rejected", reason: "identity_not_active" },
        unknownProgram: { status: "rejected", reason: "program_not_found" },
        nonCurator: { status: "rejected", reason: "admin_or_curator_required" },
        checkKind: { status: "rejected", reason: "validation_failed" },
        title: { status: "rejected", reason: "validation_failed" },
        prompt: { status: "rejected", reason: "validation_failed" },
        rationale: { status: "rejected", reason: "validation_failed" },
        nullSourceIds: { status: "rejected", reason: "validation_failed" },
        nonStringSourceIds: { status: "rejected", reason: "validation_failed" },
        emptyCriteria: { status: "rejected", reason: "validation_failed" },
        nonStringCriteria: { status: "rejected", reason: "validation_failed" },
        missingCriteria: { status: "rejected", reason: "validation_failed" },
        missingSource: { status: "rejected", reason: "source_not_found" },
        crossProgramSource: { status: "rejected", reason: "source_program_mismatch" },
        missingCriterion: { status: "rejected", reason: "criterion_entity_not_found" },
        crossProgramCriterion: {
          status: "rejected",
          reason: "criterion_entity_program_mismatch",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("listOpenAnswerCheckCandidates_shouldReturnProgramCandidatesMatchingSupportedStatusForCurator", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    seedAcceptedAssessmentCriterion(commands, {
      programId: "program-a",
      title: "Program A criterion",
      body: "Program A criterion body",
    });
    seedAcceptedAssessmentCriterion(commands, {
      programId: "program-b",
      title: "Program B criterion",
      body: "Program B criterion body",
    });
    commands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "open_answer",
      title: "Program A check",
      prompt: "Program A prompt",
      criterionEntityIds: ["corpus-event-1"],
    });
    commands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      checkKind: "open_answer",
      title: "Program B check",
      prompt: "Program B prompt",
      criterionEntityIds: ["source-3"],
    });

    assert.deepEqual(
      {
        draft: commands.listOpenAnswerCheckCandidates?.({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          status: "draft",
        }),
        unsupported: commands.listOpenAnswerCheckCandidates?.({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          status: "archived",
        }),
        nonCurator: commands.listOpenAnswerCheckCandidates?.({
          actingIdentityId: "identity-other",
          programId: "program-a",
          status: "draft",
        }),
      },
      {
        draft: {
          status: "accepted",
          value: {
            openAnswerCheckCandidates: [
              {
                candidateId: "source-4",
                programId: "program-a",
                checkKind: "open_answer",
                title: "Program A check",
                prompt: "Program A prompt",
                sourceIds: [],
                criterionEntityIds: ["corpus-event-1"],
                status: "draft",
                createdByIdentityId: "identity-curator",
                createdAt: "2026-05-28T11:00:00.004Z",
                updatedAt: "2026-05-28T11:00:00.004Z",
              },
            ],
          },
        },
        unsupported: { status: "rejected", reason: "validation_failed" },
        nonCurator: { status: "rejected", reason: "admin_or_curator_required" },
      },
    );
  } finally {
    database.close();
  }
});

test("acceptOpenAnswerCheckCandidate_shouldCreateAcceptedRevisionAndSnapshotCurrentCriterionRevision", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program source",
    });
    seedAcceptedAssessmentCriterion(commands, {
      programId: "program-a",
      title: "Criterion",
      body: "Criterion body",
      sourceIds: ["source-1"],
    });
    commands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "open_answer",
      title: "Accepted check",
      prompt: "Accepted prompt",
      sourceIds: ["source-1"],
      criterionEntityIds: ["corpus-event-2"],
      rationale: "Accepted rationale",
    });

    const result = commands.acceptOpenAnswerCheckCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-3",
    });

    assert.deepEqual(
      {
        result,
        candidateStatus: getOpenAnswerCheckCandidateRecord(database, "corpus-event-3")?.status,
        entity: listAcceptedOpenAnswerCheckEntityRecords(database, { programId: "program-a" }),
        revision: getAcceptedOpenAnswerCheckRevisionRecord(database, "corpus-event-4"),
      },
      {
        result: {
          status: "accepted",
          value: {
            acceptedOpenAnswerCheck: {
              entityId: "source-4",
              revisionId: "corpus-event-4",
              programId: "program-a",
              checkKind: "open_answer",
              title: "Accepted check",
              prompt: "Accepted prompt",
              acceptedFromCandidateId: "corpus-event-3",
              sourceIds: ["source-1"],
              criterionRevisionIds: ["source-3"],
              rationale: "Accepted rationale",
              acceptedByIdentityId: "identity-curator",
              acceptedAt: "2026-05-28T11:00:00.005Z",
            },
          },
        },
        candidateStatus: "accepted",
        entity: [
          {
            id: "source-4",
            programId: "program-a",
            currentRevisionId: "corpus-event-4",
          },
        ],
        revision: {
          id: "corpus-event-4",
          entityId: "source-4",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Accepted check",
          prompt: "Accepted prompt",
          acceptedFromCandidateId: "corpus-event-3",
          sourceIds: ["source-1"],
          criterionRevisionIds: ["source-3"],
          rationale: "Accepted rationale",
          acceptedByIdentityId: "identity-curator",
          acceptedAt: "2026-05-28T11:00:00.005Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("acceptOpenAnswerCheckCandidate_shouldKeepCriterionSnapshotAndHistoricalCheckRevision", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    seedAcceptedAssessmentCriterion(commands, {
      programId: "program-a",
      title: "First criterion",
      body: "First criterion body",
    });
    commands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "open_answer",
      title: "First check",
      prompt: "First prompt",
      criterionEntityIds: ["corpus-event-1"],
    });
    commands.acceptOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-2",
    });
    commands.createAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Second criterion",
      body: "Second criterion body",
    });
    commands.acceptAssessmentCriterionCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-4",
      targetEntityId: "corpus-event-1",
    });
    commands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "open_answer",
      title: "Second check",
      prompt: "Second prompt",
      criterionEntityIds: ["corpus-event-1"],
    });
    commands.acceptOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-5",
      targetEntityId: "source-3",
    });

    assert.deepEqual(
      {
        current: commands.listAcceptedOpenAnswerChecks?.({
          actingIdentityId: "identity-curator",
          programId: "program-a",
        }),
        historical: commands.getAcceptedOpenAnswerCheckRevision?.({
          actingIdentityId: "identity-curator",
          revisionId: "corpus-event-3",
        }),
      },
      {
        current: {
          status: "accepted",
          value: {
            acceptedOpenAnswerChecks: [
              {
                entityId: "source-3",
                revisionId: "corpus-event-5",
                programId: "program-a",
                checkKind: "open_answer",
                title: "Second check",
                prompt: "Second prompt",
                acceptedFromCandidateId: "source-5",
                sourceIds: [],
                criterionRevisionIds: ["corpus-event-4"],
                acceptedByIdentityId: "identity-curator",
                acceptedAt: "2026-05-28T11:00:00.007Z",
              },
            ],
          },
        },
        historical: {
          status: "accepted",
          value: {
            acceptedOpenAnswerCheck: {
              entityId: "source-3",
              revisionId: "corpus-event-3",
              programId: "program-a",
              checkKind: "open_answer",
              title: "First check",
              prompt: "First prompt",
              acceptedFromCandidateId: "corpus-event-2",
              sourceIds: [],
              criterionRevisionIds: ["source-2"],
              acceptedByIdentityId: "identity-curator",
              acceptedAt: "2026-05-28T11:00:00.003Z",
            },
          },
        },
      },
    );
  } finally {
    database.close();
  }
});

test("acceptOpenAnswerCheckCandidate_shouldRejectInvalidCandidateStatesAndTargets", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    seedAcceptedAssessmentCriterion(commands, {
      programId: "program-a",
      title: "Program A criterion",
      body: "Program A criterion body",
    });
    seedAcceptedAssessmentCriterion(commands, {
      programId: "program-b",
      title: "Program B criterion",
      body: "Program B criterion body",
    });
    commands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "open_answer",
      title: "Accepted check",
      prompt: "Accepted prompt",
      criterionEntityIds: ["corpus-event-1"],
    });
    commands.acceptOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-4",
    });
    commands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "open_answer",
      title: "Rejected check",
      prompt: "Rejected prompt",
      criterionEntityIds: ["corpus-event-1"],
    });
    commands.rejectOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-5",
    });
    commands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      checkKind: "open_answer",
      title: "Other check",
      prompt: "Other prompt",
      criterionEntityIds: ["source-3"],
    });
    commands.acceptOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-6",
    });
    commands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "open_answer",
      title: "Target check",
      prompt: "Target prompt",
      criterionEntityIds: ["corpus-event-1"],
    });

    assert.deepEqual(
      {
        unknown: commands.acceptOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "check-candidate-missing",
        }),
        alreadyAccepted: commands.acceptOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "source-4",
        }),
        rejectAlreadyAccepted: commands.rejectOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "source-4",
        }),
        unauthorizedAccepted: commands.acceptOpenAnswerCheckCandidate({
          actingIdentityId: "identity-other",
          candidateId: "source-4",
        }),
        alreadyRejected: commands.acceptOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "corpus-event-5",
        }),
        missingTarget: commands.acceptOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "corpus-event-7",
          targetEntityId: "check-entity-missing",
        }),
        targetProgramMismatch: commands.acceptOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "corpus-event-7",
          targetEntityId: "corpus-event-6",
        }),
      },
      {
        unknown: { status: "rejected", reason: "check_candidate_not_found" },
        alreadyAccepted: { status: "rejected", reason: "check_candidate_already_accepted" },
        rejectAlreadyAccepted: {
          status: "rejected",
          reason: "check_candidate_already_accepted",
        },
        unauthorizedAccepted: { status: "rejected", reason: "admin_or_curator_required" },
        alreadyRejected: { status: "rejected", reason: "check_candidate_already_rejected" },
        missingTarget: { status: "rejected", reason: "check_entity_not_found" },
        targetProgramMismatch: { status: "rejected", reason: "check_entity_program_mismatch" },
      },
    );
  } finally {
    database.close();
  }
});

test("rejectOpenAnswerCheckCandidate_shouldChangeDraftToRejectedWithoutAcceptedCheck", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    seedAcceptedAssessmentCriterion(commands, {
      programId: "program-a",
      title: "Criterion",
      body: "Criterion body",
    });
    commands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "open_answer",
      title: "Rejected check",
      prompt: "Rejected prompt",
      criterionEntityIds: ["corpus-event-1"],
    });

    const result = commands.rejectOpenAnswerCheckCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-2",
    });
    const alreadyRejectedResult = commands.rejectOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-2",
    });

    assert.deepEqual(
      {
        result,
        unknown: commands.rejectOpenAnswerCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "check-candidate-missing",
        }),
        alreadyRejectedResult,
        rejected: commands.listOpenAnswerCheckCandidates({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          status: "rejected",
        }),
        acceptedEntities: listAcceptedOpenAnswerCheckEntityRecords(database, { programId: "program-a" }),
      },
      {
        result: {
          status: "accepted",
          value: {
            openAnswerCheckCandidate: {
              candidateId: "corpus-event-2",
              programId: "program-a",
              checkKind: "open_answer",
              title: "Rejected check",
              prompt: "Rejected prompt",
              sourceIds: [],
              criterionEntityIds: ["corpus-event-1"],
              status: "rejected",
              createdByIdentityId: "identity-curator",
              createdAt: "2026-05-28T11:00:00.002Z",
              updatedAt: "2026-05-28T11:00:00.003Z",
            },
          },
        },
        unknown: { status: "rejected", reason: "check_candidate_not_found" },
        alreadyRejectedResult: {
          status: "rejected",
          reason: "check_candidate_already_rejected",
        },
        rejected: {
          status: "accepted",
          value: {
            openAnswerCheckCandidates: [
              {
                candidateId: "corpus-event-2",
                programId: "program-a",
                checkKind: "open_answer",
                title: "Rejected check",
                prompt: "Rejected prompt",
                sourceIds: [],
                criterionEntityIds: ["corpus-event-1"],
                status: "rejected",
                createdByIdentityId: "identity-curator",
                createdAt: "2026-05-28T11:00:00.002Z",
                updatedAt: "2026-05-28T11:00:00.003Z",
              },
            ],
          },
        },
        acceptedEntities: [],
      },
    );
  } finally {
    database.close();
  }
});

test("listAcceptedOpenAnswerChecks_shouldAuthorizeStudentCuratorAndAdminOnly", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    createIdentity(database, makeIdentity({ id: "identity-admin" }));
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    grantAdminAuthority(database, {
      identityId: "identity-admin",
      grantedAt: "2026-05-28T10:01:00.000Z",
    });
    seedCuratorProgram(database, { programId: "program-a" });
    createProgramMembershipRecord(database, {
      id: "membership-student",
      programId: "program-a",
      identityId: "identity-student",
      participationKind: "student",
      status: "active",
      createdAt: "2026-05-28T10:47:00.000Z",
      updatedAt: "2026-05-28T10:47:00.000Z",
    });
    seedAcceptedAssessmentCriterion(commands, {
      programId: "program-a",
      title: "Criterion",
      body: "Criterion body",
    });
    commands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "open_answer",
      title: "Accepted check",
      prompt: "Accepted prompt",
      criterionEntityIds: ["corpus-event-1"],
    });
    commands.acceptOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-2",
    });
    commands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "open_answer",
      title: "Admin blocked check",
      prompt: "Admin blocked prompt",
      criterionEntityIds: ["corpus-event-1"],
    });

    assert.deepEqual(
      {
        student: commands.listAcceptedOpenAnswerChecks({
          actingIdentityId: "identity-student",
          programId: "program-a",
        }).status,
        curator: commands.listAcceptedOpenAnswerChecks({
          actingIdentityId: "identity-curator",
          programId: "program-a",
        }).status,
        admin: commands.listAcceptedOpenAnswerChecks({
          actingIdentityId: "identity-admin",
          programId: "program-a",
        }).status,
        other: commands.listAcceptedOpenAnswerChecks({
          actingIdentityId: "identity-other",
          programId: "program-a",
        }),
        adminCreate: commands.createOpenAnswerCheckCandidate({
          actingIdentityId: "identity-admin",
          programId: "program-a",
          checkKind: "open_answer",
          title: "Admin check",
          prompt: "Admin prompt",
          criterionEntityIds: ["corpus-event-1"],
        }),
        adminAccept: commands.acceptOpenAnswerCheckCandidate({
          actingIdentityId: "identity-admin",
          candidateId: "source-4",
        }),
        adminReject: commands.rejectOpenAnswerCheckCandidate({
          actingIdentityId: "identity-admin",
          candidateId: "source-4",
        }),
        missingRevision: commands.getAcceptedOpenAnswerCheckRevision({
          actingIdentityId: "identity-curator",
          revisionId: "check-revision-missing",
        }),
      },
      {
        student: "accepted",
        curator: "accepted",
        admin: "accepted",
        other: { status: "rejected", reason: "participation_required" },
        adminCreate: { status: "rejected", reason: "admin_or_curator_required" },
        adminAccept: { status: "rejected", reason: "admin_or_curator_required" },
        adminReject: { status: "rejected", reason: "admin_or_curator_required" },
        missingRevision: { status: "rejected", reason: "check_revision_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("openAnswerCheckResponses_shouldUseRedactedShapes", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    seedAcceptedAssessmentCriterion(commands, {
      programId: "program-a",
      title: "Criterion",
      body: "Criterion body",
    });
    commands.createOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "open_answer",
      title: "Accepted check",
      prompt: "Accepted prompt",
      criterionEntityIds: ["corpus-event-1"],
    });
    commands.acceptOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-4",
    });
    const candidateResult = commands.listOpenAnswerCheckCandidates({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });
    const acceptedResult = commands.listAcceptedOpenAnswerChecks({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });
    const rejectionResult = commands.acceptOpenAnswerCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-2",
    });

    assert.deepEqual(
      containsForbiddenDetail([candidateResult, acceptedResult, rejectionResult]),
      false,
    );
  } finally {
    database.close();
  }
});

test("createQuickCheckCandidate_shouldCreateDraftCandidateForCuratorWithOpaqueOptions", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program source",
    });

    const result = commands.createQuickCheckCandidate?.({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: " Quick title ",
      prompt: " Quick prompt ",
      options: [" First option ", " Second option "],
      answerKeyIndex: 1,
      sourceIds: ["source-1"],
      rationale: " Quick rationale ",
    });

    assert.deepEqual(
      {
        result,
        candidates: listQuickCheckCandidateRecords(database, {
          programId: "program-a",
          status: "draft",
        }),
      },
      {
        result: {
          status: "accepted",
          value: {
            quickCheckCandidate: {
              candidateId: "source-2",
              programId: "program-a",
              checkKind: "single_select_quick_check",
              title: "Quick title",
              prompt: "Quick prompt",
              options: [
                { optionId: "corpus-event-2", text: "First option" },
                { optionId: "source-3", text: "Second option" },
              ],
              answerKeyOptionId: "source-3",
              sourceIds: ["source-1"],
              rationale: "Quick rationale",
              status: "draft",
              createdByIdentityId: "identity-curator",
              createdAt: "2026-05-28T11:00:00.002Z",
              updatedAt: "2026-05-28T11:00:00.002Z",
            },
          },
        },
        candidates: [
          {
            id: "source-2",
            programId: "program-a",
            checkKind: "single_select_quick_check",
            title: "Quick title",
            prompt: "Quick prompt",
            options: [
              { id: "corpus-event-2", text: "First option" },
              { id: "source-3", text: "Second option" },
            ],
            answerKeyOptionId: "source-3",
            sourceIds: ["source-1"],
            rationale: "Quick rationale",
            status: "draft",
            createdByIdentityId: "identity-curator",
            createdAt: "2026-05-28T11:00:00.002Z",
            updatedAt: "2026-05-28T11:00:00.002Z",
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("createQuickCheckCandidate_shouldRejectInvalidAuthorizationInputSourcesAndOptions", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      sourceKind: "article",
      title: "Other source",
    });
    createIdentity(database, makeIdentity({ id: "identity-admin" }));
    grantAdminAuthority(database, {
      identityId: "identity-admin",
      grantedAt: "2026-05-28T10:01:00.000Z",
    });

    assert.deepEqual(
      {
        inactive: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Quick",
          prompt: "Prompt",
          options: ["A", "B"],
          answerKeyIndex: 0,
        }),
        unknownProgram: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-missing",
          checkKind: "single_select_quick_check",
          title: "Quick",
          prompt: "Prompt",
          options: ["A", "B"],
          answerKeyIndex: 0,
        }),
        nonCurator: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-other",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Quick",
          prompt: "Prompt",
          options: ["A", "B"],
          answerKeyIndex: 0,
        }),
        adminWithoutCurator: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-admin",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Quick",
          prompt: "Prompt",
          options: ["A", "B"],
          answerKeyIndex: 0,
        }),
        checkKind: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "multiple_choice",
          title: "Quick",
          prompt: "Prompt",
          options: ["A", "B"],
          answerKeyIndex: 0,
        }),
        title: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: " ",
          prompt: "Prompt",
          options: ["A", "B"],
          answerKeyIndex: 0,
        }),
        prompt: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Quick",
          prompt: " ",
          options: ["A", "B"],
          answerKeyIndex: 0,
        }),
        rationale: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Quick",
          prompt: "Prompt",
          options: ["A", "B"],
          answerKeyIndex: 0,
          rationale: " ",
        }),
        missingOptions: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Quick",
          prompt: "Prompt",
          answerKeyIndex: 0,
        }),
        blankOption: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Quick",
          prompt: "Prompt",
          options: ["A", " "],
          answerKeyIndex: 0,
        }),
        duplicateTrimmedOption: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Quick",
          prompt: "Prompt",
          options: [" Same ", "same"],
          answerKeyIndex: 0,
        }),
        answerKeyIndex: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Quick",
          prompt: "Prompt",
          options: ["A", "B"],
          answerKeyIndex: 2,
        }),
        nullSourceIds: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Quick",
          prompt: "Prompt",
          options: ["A", "B"],
          answerKeyIndex: 0,
          sourceIds: null,
        }),
        missingSource: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Quick",
          prompt: "Prompt",
          options: ["A", "B"],
          answerKeyIndex: 0,
          sourceIds: ["source-missing"],
        }),
        crossProgramSource: commands.createQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Quick",
          prompt: "Prompt",
          options: ["A", "B"],
          answerKeyIndex: 0,
          sourceIds: ["source-1"],
        }),
      },
      {
        inactive: { status: "rejected", reason: "identity_not_active" },
        unknownProgram: { status: "rejected", reason: "program_not_found" },
        nonCurator: { status: "rejected", reason: "admin_or_curator_required" },
        adminWithoutCurator: { status: "rejected", reason: "admin_or_curator_required" },
        checkKind: { status: "rejected", reason: "validation_failed" },
        title: { status: "rejected", reason: "validation_failed" },
        prompt: { status: "rejected", reason: "validation_failed" },
        rationale: { status: "rejected", reason: "validation_failed" },
        missingOptions: { status: "rejected", reason: "validation_failed" },
        blankOption: { status: "rejected", reason: "validation_failed" },
        duplicateTrimmedOption: { status: "rejected", reason: "validation_failed" },
        answerKeyIndex: { status: "rejected", reason: "validation_failed" },
        nullSourceIds: { status: "rejected", reason: "validation_failed" },
        missingSource: { status: "rejected", reason: "source_not_found" },
        crossProgramSource: { status: "rejected", reason: "source_program_mismatch" },
      },
    );
  } finally {
    database.close();
  }
});

test("listQuickCheckCandidates_shouldReturnProgramCandidatesMatchingSupportedStatusForCurator", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    createProgramMembershipRecord(database, {
      id: "membership-student",
      programId: "program-a",
      identityId: "identity-student",
      participationKind: "student",
      status: "active",
      createdAt: "2026-05-28T10:47:00.000Z",
      updatedAt: "2026-05-28T10:47:00.000Z",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Program A quick check",
      prompt: "Program A prompt",
      options: ["A", "B"],
      answerKeyIndex: 0,
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      checkKind: "single_select_quick_check",
      title: "Program B quick check",
      prompt: "Program B prompt",
      options: ["C", "D"],
      answerKeyIndex: 1,
    });

    assert.deepEqual(
      {
        draft: commands.listQuickCheckCandidates?.({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          status: "draft",
        }),
        unsupported: commands.listQuickCheckCandidates?.({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          status: "archived",
        }),
        student: commands.listQuickCheckCandidates?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          status: "draft",
        }),
      },
      {
        draft: {
          status: "accepted",
          value: {
            quickCheckCandidates: [
              {
                candidateId: "source-1",
                programId: "program-a",
                checkKind: "single_select_quick_check",
                title: "Program A quick check",
                prompt: "Program A prompt",
                options: [
                  { optionId: "corpus-event-1", text: "A" },
                  { optionId: "source-2", text: "B" },
                ],
                answerKeyOptionId: "corpus-event-1",
                sourceIds: [],
                status: "draft",
                createdByIdentityId: "identity-curator",
                createdAt: "2026-05-28T11:00:00.000Z",
                updatedAt: "2026-05-28T11:00:00.000Z",
              },
            ],
          },
        },
        unsupported: { status: "rejected", reason: "validation_failed" },
        student: { status: "rejected", reason: "admin_or_curator_required" },
      },
    );
  } finally {
    database.close();
  }
});

test("rejectQuickCheckCandidate_shouldChangeDraftToRejectedWithoutAcceptedQuickCheck", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Rejected quick check",
      prompt: "Rejected prompt",
      options: ["A", "B"],
      answerKeyIndex: 0,
    });

    const result = commands.rejectQuickCheckCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });
    const acceptedQuickCheckEntityCount = database
      .prepare("select count(*) as count from accepted_quick_check_entities where program_id = ?")
      .get("program-a").count;

    assert.deepEqual(
      {
        result,
        rejected: commands.listQuickCheckCandidates({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          status: "rejected",
        }),
        acceptedQuickCheckEntityCount,
      },
      {
        result: {
          status: "accepted",
          value: {
            quickCheckCandidate: {
              candidateId: "source-1",
              programId: "program-a",
              checkKind: "single_select_quick_check",
              title: "Rejected quick check",
              prompt: "Rejected prompt",
              options: [
                { optionId: "corpus-event-1", text: "A" },
                { optionId: "source-2", text: "B" },
              ],
              answerKeyOptionId: "corpus-event-1",
              sourceIds: [],
              status: "rejected",
              createdByIdentityId: "identity-curator",
              createdAt: "2026-05-28T11:00:00.000Z",
              updatedAt: "2026-05-28T11:00:00.001Z",
            },
          },
        },
        rejected: {
          status: "accepted",
          value: {
            quickCheckCandidates: [
              {
                candidateId: "source-1",
                programId: "program-a",
                checkKind: "single_select_quick_check",
                title: "Rejected quick check",
                prompt: "Rejected prompt",
                options: [
                  { optionId: "corpus-event-1", text: "A" },
                  { optionId: "source-2", text: "B" },
                ],
                answerKeyOptionId: "corpus-event-1",
                sourceIds: [],
                status: "rejected",
                createdByIdentityId: "identity-curator",
                createdAt: "2026-05-28T11:00:00.000Z",
                updatedAt: "2026-05-28T11:00:00.001Z",
              },
            ],
          },
        },
        acceptedQuickCheckEntityCount: 0,
      },
    );
  } finally {
    database.close();
  }
});

test("rejectQuickCheckCandidate_shouldRejectUnknownAcceptedAndAlreadyRejectedCandidates", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Accepted quick check",
      prompt: "Accepted prompt",
      options: ["A", "B"],
      answerKeyIndex: 0,
    });
    updateQuickCheckCandidateStatus(database, {
      candidateId: "source-1",
      status: "accepted",
      updatedAt: "2026-05-28T11:00:00.001Z",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Rejected quick check",
      prompt: "Rejected prompt",
      options: ["C", "D"],
      answerKeyIndex: 1,
    });
    commands.rejectQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-2",
    });

    assert.deepEqual(
      {
        unknown: commands.rejectQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "quick-check-candidate-missing",
        }),
        alreadyAccepted: commands.rejectQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "source-1",
        }),
        alreadyRejected: commands.rejectQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "corpus-event-2",
        }),
        acceptedCandidate: getQuickCheckCandidateRecord(database, "source-1")?.status,
      },
      {
        unknown: { status: "rejected", reason: "quick_check_candidate_not_found" },
        alreadyAccepted: { status: "rejected", reason: "quick_check_candidate_already_accepted" },
        alreadyRejected: { status: "rejected", reason: "quick_check_candidate_already_rejected" },
        acceptedCandidate: "accepted",
      },
    );
  } finally {
    database.close();
  }
});

test("quickCheckCandidateResponses_shouldUseCuratorBoundedShapes", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    seedCuratorProgram(database, { programId: "program-a" });
    createProgramMembershipRecord(database, {
      id: "membership-student",
      programId: "program-a",
      identityId: "identity-student",
      participationKind: "student",
      status: "active",
      createdAt: "2026-05-28T10:47:00.000Z",
      updatedAt: "2026-05-28T10:47:00.000Z",
    });
    const candidateResult = commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Quick",
      prompt: "Prompt",
      options: ["A", "B"],
      answerKeyIndex: 0,
    });
    const listResult = commands.listQuickCheckCandidates({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });
    const studentListResult = commands.listQuickCheckCandidates({
      actingIdentityId: "identity-student",
      programId: "program-a",
    });
    const rejectionResult = commands.rejectQuickCheckCandidate({
      actingIdentityId: "identity-student",
      candidateId: candidateResult.value.quickCheckCandidate.candidateId,
    });

    assert.deepEqual(
      {
        studentListResult,
        rejectionResult,
        leaksForbiddenDetails: containsForbiddenDetail([candidateResult, listResult, studentListResult, rejectionResult]),
      },
      {
        studentListResult: { status: "rejected", reason: "admin_or_curator_required" },
        rejectionResult: { status: "rejected", reason: "admin_or_curator_required" },
        leaksForbiddenDetails: false,
      },
    );
  } finally {
    database.close();
  }
});

test("acceptQuickCheckCandidate_shouldCreateAcceptedEntityRevisionAndMarkCandidateAccepted", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program source",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Accepted quick check",
      prompt: "Accepted prompt",
      options: ["Option A", "Option B"],
      answerKeyIndex: 1,
      sourceIds: ["source-1"],
      rationale: "Accepted rationale",
    });

    const result = commands.acceptQuickCheckCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: "source-2",
    });

    assert.deepEqual(
      {
        result,
        candidateStatus: getQuickCheckCandidateRecord(database, "source-2")?.status,
        entity: getAcceptedQuickCheckEntityRecord(database, "corpus-event-3"),
        revision: getAcceptedQuickCheckRevisionRecord(database, "source-4"),
      },
      {
        result: {
          status: "accepted",
          value: {
            acceptedQuickCheck: {
              entityId: "corpus-event-3",
              revisionId: "source-4",
              programId: "program-a",
              checkKind: "single_select_quick_check",
              title: "Accepted quick check",
              prompt: "Accepted prompt",
              options: [
                { optionId: "corpus-event-4", text: "Option A" },
                { optionId: "source-5", text: "Option B" },
              ],
              answerKeyOptionId: "source-5",
              acceptedFromCandidateId: "source-2",
              sourceIds: ["source-1"],
              rationale: "Accepted rationale",
              acceptedByIdentityId: "identity-curator",
              acceptedAt: "2026-05-28T11:00:00.003Z",
            },
          },
        },
        candidateStatus: "accepted",
        entity: {
          id: "corpus-event-3",
          programId: "program-a",
          currentRevisionId: "source-4",
        },
        revision: {
          id: "source-4",
          entityId: "corpus-event-3",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "Accepted quick check",
          prompt: "Accepted prompt",
          options: [
            { id: "corpus-event-4", text: "Option A" },
            { id: "source-5", text: "Option B" },
          ],
          answerKeyOptionId: "source-5",
          acceptedFromCandidateId: "source-2",
          sourceIds: ["source-1"],
          rationale: "Accepted rationale",
          acceptedByIdentityId: "identity-curator",
          acceptedAt: "2026-05-28T11:00:00.003Z",
        },
      },
    );
  } finally {
    database.close();
  }
});

test("acceptQuickCheckCandidate_shouldNotMutateAdjacentDomains", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    createProgramMembershipRecord(database, {
      id: "membership-student",
      programId: "program-a",
      identityId: "identity-student",
      participationKind: "student",
      status: "active",
      createdAt: "2026-05-28T10:47:00.000Z",
      updatedAt: "2026-05-28T10:47:00.000Z",
    });
    createLocalPasswordCredential(database, {
      id: "credential-curator",
      identityId: "identity-curator",
      login: "curator@example.test",
      passwordHash: "hashed-curator-password",
      createdAt: "2026-05-28T10:48:00.000Z",
    });
    createSession(database, {
      id: "session-curator",
      identityId: "identity-curator",
      createdAt: "2026-05-28T10:49:00.000Z",
      expiresAt: "2026-05-29T10:49:00.000Z",
    });
    grantAdminAuthority(database, {
      identityId: "identity-curator",
      grantedAt: "2026-05-28T10:50:00.000Z",
    });
    const csrfTokens = new Map([["session-curator", "csrf-token-curator"]]);
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Accepted quick check",
      prompt: "Accepted prompt",
      options: ["Option A", "Option B"],
      answerKeyIndex: 1,
    });
    const before = {
      csrfTokens: [...csrfTokens.entries()],
      database: snapshotAdjacentDomains(database),
    };

    const result = commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });

    assert.deepEqual(
      {
        resultStatus: result.status,
        before,
        after: {
          csrfTokens: [...csrfTokens.entries()],
          database: snapshotAdjacentDomains(database),
        },
      },
      {
        resultStatus: "accepted",
        before,
        after: before,
      },
    );
  } finally {
    database.close();
  }
});

test("acceptQuickCheckCandidate_shouldReplaceCurrentRevisionAndKeepHistoricalRevision", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "First quick check",
      prompt: "First prompt",
      options: ["First A", "First B"],
      answerKeyIndex: 0,
    });
    commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Second quick check",
      prompt: "Second prompt",
      options: ["Second A", "Second B"],
      answerKeyIndex: 1,
    });

    const replacement = commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-4",
      targetEntityId: "corpus-event-2",
    });

    assert.deepEqual(
      {
        replacement,
        currentEntity: getAcceptedQuickCheckEntityRecord(database, "corpus-event-2"),
        historical: getAcceptedQuickCheckRevisionRecord(database, "source-3"),
        currentCurationRead: commands.getAcceptedQuickCheckRevisionForCuration({
          actingIdentityId: "identity-curator",
          revisionId: "source-6",
        }),
        historicalCurationRead: commands.getAcceptedQuickCheckRevisionForCuration({
          actingIdentityId: "identity-curator",
          revisionId: "source-3",
        }),
      },
      {
        replacement: {
          status: "accepted",
          value: {
            acceptedQuickCheck: {
              entityId: "corpus-event-2",
              revisionId: "source-6",
              programId: "program-a",
              checkKind: "single_select_quick_check",
              title: "Second quick check",
              prompt: "Second prompt",
              options: [
                { optionId: "corpus-event-6", text: "Second A" },
                { optionId: "source-7", text: "Second B" },
              ],
              answerKeyOptionId: "source-7",
              acceptedFromCandidateId: "corpus-event-4",
              sourceIds: [],
              acceptedByIdentityId: "identity-curator",
              acceptedAt: "2026-05-28T11:00:00.003Z",
            },
          },
        },
        currentEntity: {
          id: "corpus-event-2",
          programId: "program-a",
          currentRevisionId: "source-6",
        },
        historical: {
          id: "source-3",
          entityId: "corpus-event-2",
          programId: "program-a",
          checkKind: "single_select_quick_check",
          title: "First quick check",
          prompt: "First prompt",
          options: [
            { id: "corpus-event-3", text: "First A" },
            { id: "source-4", text: "First B" },
          ],
          answerKeyOptionId: "corpus-event-3",
          acceptedFromCandidateId: "source-1",
          sourceIds: [],
          rationale: null,
          acceptedByIdentityId: "identity-curator",
          acceptedAt: "2026-05-28T11:00:00.001Z",
        },
        currentCurationRead: {
          status: "accepted",
          value: {
            acceptedQuickCheck: {
              entityId: "corpus-event-2",
              revisionId: "source-6",
              programId: "program-a",
              checkKind: "single_select_quick_check",
              title: "Second quick check",
              prompt: "Second prompt",
              options: [
                { optionId: "corpus-event-6", text: "Second A" },
                { optionId: "source-7", text: "Second B" },
              ],
              answerKeyOptionId: "source-7",
              acceptedFromCandidateId: "corpus-event-4",
              sourceIds: [],
              acceptedByIdentityId: "identity-curator",
              acceptedAt: "2026-05-28T11:00:00.003Z",
            },
          },
        },
        historicalCurationRead: {
          status: "accepted",
          value: {
            acceptedQuickCheck: {
              entityId: "corpus-event-2",
              revisionId: "source-3",
              programId: "program-a",
              checkKind: "single_select_quick_check",
              title: "First quick check",
              prompt: "First prompt",
              options: [
                { optionId: "corpus-event-3", text: "First A" },
                { optionId: "source-4", text: "First B" },
              ],
              answerKeyOptionId: "corpus-event-3",
              acceptedFromCandidateId: "source-1",
              sourceIds: [],
              acceptedByIdentityId: "identity-curator",
              acceptedAt: "2026-05-28T11:00:00.001Z",
            },
          },
        },
      },
    );
  } finally {
    database.close();
  }
});

test("acceptQuickCheckCandidate_shouldRejectInvalidCandidateStatesAndTargets", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Accepted quick check",
      prompt: "Accepted prompt",
      options: ["A", "B"],
      answerKeyIndex: 0,
    });
    commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Rejected quick check",
      prompt: "Rejected prompt",
      options: ["C", "D"],
      answerKeyIndex: 1,
    });
    commands.rejectQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-4",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      checkKind: "single_select_quick_check",
      title: "Other quick check",
      prompt: "Other prompt",
      options: ["E", "F"],
      answerKeyIndex: 0,
    });
    commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-6",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Target quick check",
      prompt: "Target prompt",
      options: ["G", "H"],
      answerKeyIndex: 0,
    });

    assert.deepEqual(
      {
        unknown: commands.acceptQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "quick-check-candidate-missing",
        }),
        alreadyAccepted: commands.acceptQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "source-1",
        }),
        rejectAlreadyAccepted: commands.rejectQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "source-1",
        }),
        unauthorizedAccepted: commands.acceptQuickCheckCandidate({
          actingIdentityId: "identity-other",
          candidateId: "source-1",
        }),
        alreadyRejected: commands.acceptQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "corpus-event-4",
        }),
        missingTarget: commands.acceptQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "corpus-event-9",
          targetEntityId: "quick-check-entity-missing",
        }),
        targetProgramMismatch: commands.acceptQuickCheckCandidate({
          actingIdentityId: "identity-curator",
          candidateId: "corpus-event-9",
          targetEntityId: "corpus-event-7",
        }),
      },
      {
        unknown: { status: "rejected", reason: "quick_check_candidate_not_found" },
        alreadyAccepted: { status: "rejected", reason: "quick_check_candidate_already_accepted" },
        rejectAlreadyAccepted: {
          status: "rejected",
          reason: "quick_check_candidate_already_accepted",
        },
        unauthorizedAccepted: { status: "rejected", reason: "admin_or_curator_required" },
        alreadyRejected: { status: "rejected", reason: "quick_check_candidate_already_rejected" },
        missingTarget: { status: "rejected", reason: "quick_check_entity_not_found" },
        targetProgramMismatch: { status: "rejected", reason: "quick_check_entity_program_mismatch" },
      },
    );
  } finally {
    database.close();
  }
});

test("getAcceptedQuickCheckRevisionForCuration_shouldReturnHistoricalAnswerKeyOnlyForCurator", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    createIdentity(database, makeIdentity({ id: "identity-admin" }));
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
    grantAdminAuthority(database, {
      identityId: "identity-admin",
      grantedAt: "2026-05-28T10:01:00.000Z",
    });
    seedCuratorProgram(database, { programId: "program-a" });
    createProgramMembershipRecord(database, {
      id: "membership-student",
      programId: "program-a",
      identityId: "identity-student",
      participationKind: "student",
      status: "active",
      createdAt: "2026-05-28T10:47:00.000Z",
      updatedAt: "2026-05-28T10:47:00.000Z",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Curation quick check",
      prompt: "Curation prompt",
      options: ["A", "B"],
      answerKeyIndex: 1,
    });
    commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });

    assert.deepEqual(
      {
        curator: commands.getAcceptedQuickCheckRevisionForCuration?.({
          actingIdentityId: "identity-curator",
          revisionId: "source-3",
        }),
        student: commands.getAcceptedQuickCheckRevisionForCuration?.({
          actingIdentityId: "identity-student",
          revisionId: "source-3",
        }),
        adminWithoutCurator: commands.getAcceptedQuickCheckRevisionForCuration?.({
          actingIdentityId: "identity-admin",
          revisionId: "source-3",
        }),
        inactive: commands.getAcceptedQuickCheckRevisionForCuration?.({
          actingIdentityId: "identity-disabled",
          revisionId: "source-3",
        }),
        unknown: commands.getAcceptedQuickCheckRevisionForCuration?.({
          actingIdentityId: "identity-curator",
          revisionId: "quick-check-revision-missing",
        }),
      },
      {
        curator: {
          status: "accepted",
          value: {
            acceptedQuickCheck: {
              entityId: "corpus-event-2",
              revisionId: "source-3",
              programId: "program-a",
              checkKind: "single_select_quick_check",
              title: "Curation quick check",
              prompt: "Curation prompt",
              options: [
                { optionId: "corpus-event-3", text: "A" },
                { optionId: "source-4", text: "B" },
              ],
              answerKeyOptionId: "source-4",
              acceptedFromCandidateId: "source-1",
              sourceIds: [],
              acceptedByIdentityId: "identity-curator",
              acceptedAt: "2026-05-28T11:00:00.001Z",
            },
          },
        },
        student: { status: "rejected", reason: "admin_or_curator_required" },
        adminWithoutCurator: { status: "rejected", reason: "admin_or_curator_required" },
        inactive: { status: "rejected", reason: "identity_not_active" },
        unknown: { status: "rejected", reason: "quick_check_revision_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("listQuickCheckDeliveries_shouldReturnOnlyCurrentStudentSafeRevisionsForStudentProgram", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    seedStudentMembership(database, {
      id: "membership-student-a",
      programId: "program-a",
      identityId: "identity-student",
    });
    seedStudentMembership(database, {
      id: "membership-student-b",
      programId: "program-b",
      identityId: "identity-student",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "First quick check",
      prompt: "First prompt",
      options: ["First A", "First B"],
      answerKeyIndex: 0,
      rationale: "Curator-only first rationale",
    });
    commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Second quick check",
      prompt: "Second prompt",
      options: ["Second A", "Second B"],
      answerKeyIndex: 1,
      rationale: "Curator-only second rationale",
    });
    commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-4",
      targetEntityId: "corpus-event-2",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      checkKind: "single_select_quick_check",
      title: "Other quick check",
      prompt: "Other prompt",
      options: ["Other A", "Other B"],
      answerKeyIndex: 0,
    });
    commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-7",
    });

    assert.deepEqual(
      commands.listQuickCheckDeliveries?.({
        actingIdentityId: "identity-student",
        programId: "program-a",
      }),
      {
        status: "accepted",
        value: {
          quickCheckDeliveries: [
            {
              entityId: "corpus-event-2",
              revisionId: "source-6",
              programId: "program-a",
              checkKind: "single_select_quick_check",
              title: "Second quick check",
              prompt: "Second prompt",
              options: [
                { optionId: "corpus-event-6", text: "Second A" },
                { optionId: "source-7", text: "Second B" },
              ],
            },
          ],
        },
      },
    );
  } finally {
    database.close();
  }
});

test("getQuickCheckDelivery_shouldReturnCurrentAndHistoricalStudentSafeRevisions", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedStudentMembership(database, {
      id: "membership-student",
      programId: "program-a",
      identityId: "identity-student",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "First quick check",
      prompt: "First prompt",
      options: ["First A", "First B"],
      answerKeyIndex: 0,
      rationale: "Curator-only first rationale",
    });
    commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Second quick check",
      prompt: "Second prompt",
      options: ["Second A", "Second B"],
      answerKeyIndex: 1,
      rationale: "Curator-only second rationale",
    });
    commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-4",
      targetEntityId: "corpus-event-2",
    });

    assert.deepEqual(
      {
        current: commands.getQuickCheckDelivery?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          revisionId: "source-6",
        }),
        historical: commands.getQuickCheckDelivery?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          revisionId: "source-3",
        }),
      },
      {
        current: {
          status: "accepted",
          value: {
            quickCheckDelivery: {
              entityId: "corpus-event-2",
              revisionId: "source-6",
              programId: "program-a",
              checkKind: "single_select_quick_check",
              title: "Second quick check",
              prompt: "Second prompt",
              options: [
                { optionId: "corpus-event-6", text: "Second A" },
                { optionId: "source-7", text: "Second B" },
              ],
            },
          },
        },
        historical: {
          status: "accepted",
          value: {
            quickCheckDelivery: {
              entityId: "corpus-event-2",
              revisionId: "source-3",
              programId: "program-a",
              checkKind: "single_select_quick_check",
              title: "First quick check",
              prompt: "First prompt",
              options: [
                { optionId: "corpus-event-3", text: "First A" },
                { optionId: "source-4", text: "First B" },
              ],
            },
          },
        },
      },
    );
  } finally {
    database.close();
  }
});

test("quickCheckDeliveryReads_shouldRejectInvalidStudentAuthorizationAndRevisionScope", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    createIdentity(database, makeIdentity({ id: "identity-admin" }));
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
    grantAdminAuthority(database, {
      identityId: "identity-admin",
      grantedAt: "2026-05-28T10:01:00.000Z",
    });
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    seedStudentMembership(database, {
      id: "membership-student",
      programId: "program-a",
      identityId: "identity-student",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Program A quick check",
      prompt: "Program A prompt",
      options: ["A", "B"],
      answerKeyIndex: 0,
    });
    commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      checkKind: "single_select_quick_check",
      title: "Program B quick check",
      prompt: "Program B prompt",
      options: ["C", "D"],
      answerKeyIndex: 1,
    });
    commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-4",
    });

    assert.deepEqual(
      {
        inactiveList: commands.listQuickCheckDeliveries?.({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
        }),
        unknownProgramList: commands.listQuickCheckDeliveries?.({
          actingIdentityId: "identity-student",
          programId: "program-missing",
        }),
        nonStudentList: commands.listQuickCheckDeliveries?.({
          actingIdentityId: "identity-other",
          programId: "program-a",
        }),
        adminWithoutStudentList: commands.listQuickCheckDeliveries?.({
          actingIdentityId: "identity-admin",
          programId: "program-a",
        }),
        unknownRevision: commands.getQuickCheckDelivery?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          revisionId: "quick-check-revision-missing",
        }),
        crossProgramRevision: commands.getQuickCheckDelivery?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
          revisionId: "corpus-event-6",
        }),
      },
      {
        inactiveList: { status: "rejected", reason: "identity_not_active" },
        unknownProgramList: { status: "rejected", reason: "program_not_found" },
        nonStudentList: { status: "rejected", reason: "participation_required" },
        adminWithoutStudentList: { status: "rejected", reason: "participation_required" },
        unknownRevision: { status: "rejected", reason: "quick_check_revision_not_found" },
        crossProgramRevision: { status: "rejected", reason: "quick_check_revision_program_mismatch" },
      },
    );
  } finally {
    database.close();
  }
});

test("quickCheckDeliveryReads_shouldUseStudentSafeRedactedShapes", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedStudentMembership(database, {
      id: "membership-student",
      programId: "program-a",
      identityId: "identity-student",
    });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program source",
    });
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Delivery quick check",
      prompt: "Delivery prompt",
      options: ["A", "B"],
      answerKeyIndex: 1,
      sourceIds: ["source-1"],
      rationale: "Curator-only rationale",
    });
    commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-2",
    });

    const listResult = commands.listQuickCheckDeliveries({
      actingIdentityId: "identity-student",
      programId: "program-a",
    });
    const readResult = commands.getQuickCheckDelivery({
      actingIdentityId: "identity-student",
      programId: "program-a",
      revisionId: "source-4",
    });
    const rejectionResult = commands.getQuickCheckDelivery({
      actingIdentityId: "identity-student",
      programId: "program-a",
      revisionId: "quick-check-revision-missing",
    });

    assert.deepEqual(
      containsQuickCheckDeliveryForbiddenDetail([listResult, readResult, rejectionResult]),
      false,
    );
  } finally {
    database.close();
  }
});

test("quickCheckDeliveryReads_shouldNotMutateCorpusOrAdjacentDomains", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    seedCuratorProgram(database, { programId: "program-a" });
    seedStudentMembership(database, {
      id: "membership-student",
      programId: "program-a",
      identityId: "identity-student",
    });
    createLocalPasswordCredential(database, {
      id: "credential-student",
      identityId: "identity-student",
      login: "student@example.test",
      passwordHash: "hashed-student-password",
      createdAt: "2026-05-28T10:48:00.000Z",
    });
    createSession(database, {
      id: "session-student",
      identityId: "identity-student",
      createdAt: "2026-05-28T10:49:00.000Z",
      expiresAt: "2026-05-29T10:49:00.000Z",
    });
    grantAdminAuthority(database, {
      identityId: "identity-curator",
      grantedAt: "2026-05-28T10:50:00.000Z",
    });
    const csrfTokens = new Map([["session-student", "csrf-token-student"]]);
    commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Delivery quick check",
      prompt: "Delivery prompt",
      options: ["A", "B"],
      answerKeyIndex: 1,
    });
    commands.acceptQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });
    const before = {
      csrfTokens: [...csrfTokens.entries()],
      database: snapshotQuickCheckDeliveryReadDomains(database),
    };

    const listResult = commands.listQuickCheckDeliveries({
      actingIdentityId: "identity-student",
      programId: "program-a",
    });
    const readResult = commands.getQuickCheckDelivery({
      actingIdentityId: "identity-student",
      programId: "program-a",
      revisionId: "source-3",
    });

    assert.deepEqual(
      {
        resultStatuses: [listResult.status, readResult.status],
        before,
        after: {
          csrfTokens: [...csrfTokens.entries()],
          database: snapshotQuickCheckDeliveryReadDomains(database),
        },
      },
      {
        resultStatuses: ["accepted", "accepted"],
        before,
        after: before,
      },
    );
  } finally {
    database.close();
  }
});

test("listCorpusEvents_shouldRejectNonCurator", async () => {
  const { commands, database } = await makeSUT();

  try {
    createProgramShellRecord(database, makeProgramShell({ id: "program-a" }));

    assert.deepEqual(
      commands.listCorpusEvents?.({
        actingIdentityId: "identity-curator",
        programId: "program-a",
      }),
      { status: "rejected", reason: "admin_or_curator_required" },
    );
  } finally {
    database.close();
  }
});

test("acceptAndRejectCorpusCandidate_shouldEmitRejectedEvents_onResolvedUnauthorizedActor", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    seedCuratorProgram(database, { programId: "program-a" });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Accept target",
    });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Reject target",
    });

    commands.acceptCorpusCandidate({
      actingIdentityId: "identity-other",
      candidateId: "source-1",
    });
    commands.rejectCorpusCandidate({
      actingIdentityId: "identity-other",
      candidateId: "source-2",
    });

    assert.deepEqual(
      listCorpusEventRecords(database, { programId: "program-a" }).slice(-2).map($0 => ({
        eventType: $0.eventType,
        targetId: $0.targetId,
        outcome: $0.outcome,
        reason: $0.reason,
      })),
      [
        {
          eventType: "corpus_candidate_accepted",
          targetId: "source-1",
          outcome: "rejected",
          reason: "admin_or_curator_required",
        },
        {
          eventType: "corpus_candidate_rejected",
          targetId: "source-2",
          outcome: "rejected",
          reason: "admin_or_curator_required",
        },
      ],
    );
  } finally {
    database.close();
  }
});

test("acceptAndRejectCorpusCandidate_shouldEmitRejectedEvents_onResolvedStateFailures", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Accepted target",
    });
    commands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });

    commands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });
    commands.rejectCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });

    assert.deepEqual(
      listCorpusEventRecords(database, { programId: "program-a" }).slice(-2).map($0 => ({
        eventType: $0.eventType,
        targetId: $0.targetId,
        outcome: $0.outcome,
        reason: $0.reason,
      })),
      [
        {
          eventType: "corpus_candidate_accepted",
          targetId: "source-1",
          outcome: "rejected",
          reason: "candidate_already_accepted",
        },
        {
          eventType: "corpus_candidate_rejected",
          targetId: "source-1",
          outcome: "rejected",
          reason: "candidate_already_accepted",
        },
      ],
    );
  } finally {
    database.close();
  }
});

test("acceptCorpusCandidate_shouldEmitRejectedEvents_onResolvedTargetFailures", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      candidateKind: "topic",
      title: "Other accepted",
    });
    commands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "source-1",
    });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Target candidate",
    });

    commands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-3",
      targetEntityId: "entity-missing",
    });
    commands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-3",
      targetEntityId: "source-2",
    });

    assert.deepEqual(
      listCorpusEventRecords(database, { programId: "program-a" }).slice(-2).map($0 => ({
        eventType: $0.eventType,
        targetId: $0.targetId,
        outcome: $0.outcome,
        reason: $0.reason,
      })),
      [
        {
          eventType: "corpus_candidate_accepted",
          targetId: "corpus-event-3",
          outcome: "rejected",
          reason: "accepted_entity_not_found",
        },
        {
          eventType: "corpus_candidate_accepted",
          targetId: "corpus-event-3",
          outcome: "rejected",
          reason: "accepted_entity_program_mismatch",
        },
      ],
    );
  } finally {
    database.close();
  }
});

test("listCorpusEvents_shouldReturnOnlyProgramEventsWithRedactedShape", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program A source",
      locator: "https://example.test/source",
      citation: "Citation",
    });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "unsupported",
      title: "Rejected source",
    });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      sourceKind: "note",
      title: "Program B source",
    });

    const result = commands.listCorpusEvents({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });
    const sourceResult = commands.listProgramSources({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });
    commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Candidate",
    });
    commands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: "corpus-event-3",
    });
    const candidateResult = commands.listCorpusCandidates({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });
    const acceptedCorpusResult = commands.listAcceptedCorpus({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });

    assert.deepEqual(
      {
        result,
        leaksForbiddenDetails: containsForbiddenDetail([
          result,
          sourceResult,
          candidateResult,
          acceptedCorpusResult,
        ]),
      },
      {
        result: {
          status: "accepted",
          value: {
            corpusEvents: [
              {
                corpusEventId: "corpus-event-1",
                eventType: "program_source_recorded",
                actorIdentityId: "identity-curator",
                programId: "program-a",
                targetId: "source-1",
                occurredAt: "2026-05-28T11:00:00.001Z",
                outcome: "accepted",
              },
              {
                corpusEventId: "source-2",
                eventType: "program_source_recorded",
                actorIdentityId: "identity-curator",
                programId: "program-a",
                occurredAt: "2026-05-28T11:00:00.002Z",
                outcome: "rejected",
                reason: "validation_failed",
              },
            ],
          },
        },
        leaksForbiddenDetails: false,
      },
    );
  } finally {
    database.close();
  }
});

test("listCorpusEvents_shouldRejectActorWithOnlyPriorCorpusEvent", async () => {
  const { commands, database } = await makeSUT();

  try {
    createIdentity(database, makeIdentity({ id: "identity-other" }));
    seedCuratorProgram(database, { programId: "program-a" });
    createCorpusEventRecord(database, {
      id: "event-other",
      eventType: "program_source_recorded",
      actorIdentityId: "identity-other",
      programId: "program-a",
      occurredAt: "2026-05-28T11:30:00.000Z",
      outcome: "accepted",
    });

    assert.deepEqual(
      commands.listCorpusEvents({
        actingIdentityId: "identity-other",
        programId: "program-a",
      }),
      { status: "rejected", reason: "admin_or_curator_required" },
    );
  } finally {
    database.close();
  }
});

async function makeSUT({
  ids = sequentialIds(),
  now = makeAdvancingClock("2026-05-28T11:00:00.000Z"),
} = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  createIdentity(database, makeIdentity({ id: "identity-curator" }));
  const programCommands = createProgramCommands({
    database,
    generateId: makeIdGenerator([...ids]),
    now,
  });
  const corpus = await import("../src/corpus.js").catch(() => ({}));
  const commands = corpus.createCorpusCommands?.({
    database,
    generateId: makeIdGenerator([...ids]),
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
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
    "source-1",
    "corpus-event-1",
    "source-2",
    "corpus-event-2",
    "source-3",
    "corpus-event-3",
    "source-4",
    "corpus-event-4",
    "source-5",
    "corpus-event-5",
    "source-6",
    "corpus-event-6",
    "source-7",
    "corpus-event-7",
    "source-8",
    "corpus-event-8",
    "source-9",
    "corpus-event-9",
    "source-10",
    "corpus-event-10",
    "source-11",
    "corpus-event-11",
    "source-12",
    "corpus-event-12",
  ];
}

function makeIdGenerator(ids) {
  const nextIds = [...ids];
  return () => nextIds.shift();
}

function captureResult(run) {
  try {
    return run();
  } catch (error) {
    return { thrown: error.code ?? error.message };
  }
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

function containsQuickCheckDeliveryForbiddenDetail(values) {
  const serialized = JSON.stringify(values).toLowerCase();
  return [
    "answerkey",
    "correct",
    "acceptedfromcandidateid",
    "sourceids",
    "rationale",
    "acceptedbyidentityid",
    "acceptedat",
    "idempotency",
    "passwordhash",
    "hashed-student-password",
    "session",
    "csrf",
    "cookie",
    "authorization",
    "select ",
    "stack",
    "/tmp",
    "postgres://",
    "database-url",
  ].some($0 => serialized.includes($0));
}

function containsNavigationForbiddenDetail(values) {
  const serialized = JSON.stringify(values).toLowerCase();
  return [
    "sourceids",
    "acceptedfromcandidateid",
    "acceptedbyidentityid",
    "acceptedat",
    "rationale",
    "candidateid",
    "createdbyidentityid",
    "relationshipdrafts",
    "draft",
    "rejected",
    "session",
    "csrf",
    "cookie",
    "authorization",
    "select ",
    "stack",
    "/tmp",
    "postgres://",
    "database-url",
  ].some($0 => serialized.includes($0));
}

function snapshotNavigationReadBoundary(database) {
  return {
    corpusEventCount: countRows(database, "corpus_events"),
    openAnswerAttemptCount: countRows(database, "open_answer_attempts"),
    openAnswerEvaluationCount: countRows(database, "open_answer_evaluations"),
    quickCheckAttemptCount: countRows(database, "quick_check_attempts"),
    sessionCount: countRows(database, "sessions"),
  };
}

function acceptNavigationCandidate(
  commands,
  {
    programId,
    candidateKind,
    title,
    body,
    materialReferenceKind,
    locator,
    citation,
    relationshipDrafts = [],
  },
) {
  const candidate = commands.createNavigationCandidate({
    actingIdentityId: "identity-curator",
    programId,
    candidateKind,
    title,
    body,
    materialReferenceKind,
    locator,
    citation,
    relationshipDrafts,
  });
  const acceptedCandidate = commands.acceptNavigationCandidate({
    actingIdentityId: "identity-curator",
    candidateId: candidate.value.navigationCandidate.candidateId,
  });
  return acceptedCandidate.value.navigationChange.acceptedCorpus;
}

function snapshotAdjacentDomains(database) {
  return {
    acceptedAssessmentCriterionEntityCount: countRows(database, "accepted_assessment_criterion_entities"),
    acceptedAssessmentCriterionRevisionCount: countRows(database, "accepted_assessment_criterion_revisions"),
    acceptedCorpusEntityCount: countRows(database, "accepted_corpus_entities"),
    acceptedCorpusRevisionCount: countRows(database, "accepted_corpus_revisions"),
    acceptedOpenAnswerCheckEntityCount: countRows(database, "accepted_open_answer_check_entities"),
    acceptedOpenAnswerCheckRevisionCount: countRows(database, "accepted_open_answer_check_revisions"),
    adminAuthorities: database
      .prepare(
        `select identity_id as identityId, granted_at as grantedAt, revoked_at as revokedAt
         from admin_authorities
         order by identity_id`,
      )
      .all(),
    assessmentCriterionCandidateCount: countRows(database, "assessment_criterion_candidates"),
    corpusCandidateCount: countRows(database, "corpus_candidates"),
    identities: database
      .prepare(
        `select id, display_name as displayName, state, created_at as createdAt, disabled_at as disabledAt
         from identities
         order by id`,
      )
      .all(),
    localPasswordCredentials: database
      .prepare(
        `select id, identity_id as identityId, login, password_hash as passwordHash, created_at as createdAt
         from local_password_credentials
         order by id`,
      )
      .all(),
    openAnswerAttemptCount: countRows(database, "open_answer_attempts"),
    openAnswerCheckCandidateCount: countRows(database, "open_answer_check_candidates"),
    programMemberships: database
      .prepare(
        `select id, program_id as programId, identity_id as identityId,
                participation_kind as participationKind, status, created_at as createdAt, updated_at as updatedAt
         from program_memberships
         order by id`,
      )
      .all(),
    programSourceCount: countRows(database, "program_sources"),
    sessions: database
      .prepare(
        `select id, identity_id as identityId, created_at as createdAt, expires_at as expiresAt,
                revoked_at as revokedAt
         from sessions
         order by id`,
      )
      .all(),
  };
}

function countRows(database, tableName) {
  return database.prepare(`select count(*) as count from ${tableName}`).get().count;
}

function snapshotQuickCheckDeliveryReadDomains(database) {
  return {
    ...snapshotAdjacentDomains(database),
    acceptedQuickCheckEntities: database
      .prepare(
        `select id, program_id as programId, current_revision_id as currentRevisionId
         from accepted_quick_check_entities
         order by id`,
      )
      .all(),
    acceptedQuickCheckRevisions: database
      .prepare(
        `select id, entity_id as entityId, program_id as programId, check_kind as checkKind,
                title, prompt, answer_key_option_id as answerKeyOptionId,
                accepted_from_candidate_id as acceptedFromCandidateId,
                source_ids_json as sourceIdsJson, rationale,
                accepted_by_identity_id as acceptedByIdentityId, accepted_at as acceptedAt
         from accepted_quick_check_revisions
         order by id`,
      )
      .all(),
    acceptedQuickCheckRevisionOptions: database
      .prepare(
        `select id, revision_id as revisionId, option_order as optionOrder, text
         from accepted_quick_check_revision_options
         order by revision_id, option_order, id`,
      )
      .all(),
    quickCheckAttemptCount: countRows(database, "quick_check_attempts"),
    quickCheckCandidateOptions: database
      .prepare(
        `select id, candidate_id as candidateId, option_order as optionOrder, text
         from quick_check_candidate_options
         order by candidate_id, option_order, id`,
      )
      .all(),
    quickCheckCandidates: database
      .prepare(
        `select id, program_id as programId, check_kind as checkKind, title, prompt,
                answer_key_option_id as answerKeyOptionId, source_ids_json as sourceIdsJson,
                rationale, status, created_by_identity_id as createdByIdentityId,
                created_at as createdAt, updated_at as updatedAt
         from quick_check_candidates
         order by id`,
      )
      .all(),
  };
}

function seedAcceptedAssessmentCriterion(
  commands,
  { programId, title, body, sourceIds = [] },
) {
  const candidate = commands.createAssessmentCriterionCandidate({
    actingIdentityId: "identity-curator",
    programId,
    title,
    body,
    sourceIds,
  });
  commands.acceptAssessmentCriterionCandidate({
    actingIdentityId: "identity-curator",
    candidateId: candidate.value.assessmentCriterionCandidate.candidateId,
  });
}

function makeIdentity({ id, state = "active" }) {
  return {
    id,
    displayName: `Display ${id}`,
    state,
    createdAt: "2026-05-28T10:00:00.000Z",
    disabledAt: state === "disabled" ? "2026-05-28T10:30:00.000Z" : null,
  };
}

function makeProgramShell({ id }) {
  return {
    id,
    title: `Program ${id}`,
    admissionPolicy: "self_join",
    createdByIdentityId: "identity-curator",
    createdAt: "2026-05-28T10:45:00.000Z",
  };
}

function seedCuratorProgram(database, { programId }) {
  createProgramShellRecord(database, makeProgramShell({ id: programId }));
  createProgramMembershipRecord(database, {
    id: `membership-${programId}`,
    programId,
    identityId: "identity-curator",
    participationKind: "program_curator",
    status: "active",
    createdAt: "2026-05-28T10:46:00.000Z",
    updatedAt: "2026-05-28T10:46:00.000Z",
  });
}

function seedStudentMembership(database, { id, programId, identityId }) {
  createProgramMembershipRecord(database, {
    id,
    programId,
    identityId,
    participationKind: "student",
    status: "active",
    createdAt: "2026-05-28T10:47:00.000Z",
    updatedAt: "2026-05-28T10:47:00.000Z",
  });
}
