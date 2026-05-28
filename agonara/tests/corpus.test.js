import assert from "node:assert/strict";
import test from "node:test";
import { createProgramCommands } from "../src/program.js";
import {
  createCorpusEventRecord,
  createIdentity,
  createProgramMembershipRecord,
  createProgramShellRecord,
  getAcceptedAssessmentCriterionRevisionRecord,
  getAcceptedCorpusRevisionRecord,
  getAssessmentCriterionCandidateRecord,
  getCorpusCandidateRecord,
  grantAdminAuthority,
  initializeIdentityStorage,
  listAcceptedAssessmentCriterionEntityRecords,
  listAcceptedCorpusEntityRecords,
  listAssessmentCriterionCandidateRecords,
  listCorpusCandidateRecords,
  listCorpusEventRecords,
  listProgramSourceRecords,
  openIdentityDatabase,
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
