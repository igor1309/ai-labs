import assert from "node:assert/strict";
import test from "node:test";
import { createProgramCommands } from "../src/program.js";
import {
  createCorpusEventRecord,
  createIdentity,
  createLocalPasswordCredential,
  createProgramMembershipRecord,
  MAX_MATERIAL_CONTENT_BYTES,
  createAcceptedCorpusEntityRecord,
  createAcceptedCorpusRevisionRecord,
  createCorpusCandidateRecord,
  createProgramShellRecord,
  createProgramSourceRecord,
  createSession,
  getAcceptedMaterialContentRecord,
  getSourceContentRecord,
  setAcceptedMaterialContentRecord,
  setSourceContentRecord,
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
  listAcceptedQuickCheckEntityRecords,
  listAcceptedReadinessCheckEntityRecords,
  listAssessmentCriterionCandidateRecords,
  listCorpusCandidateRecords,
  listCorpusEventRecords,
  listLearnerEvidenceTargetLinkRecords,
  listOpenAnswerCheckCandidateRecords,
  listProgramSourceRecords,
  listQuickCheckCandidateRecords,
  listReadinessCheckAttemptRecords,
  listReadinessCheckCandidateRecords,
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

test("setProgramSourceLifecycleStatus_shouldWithdrawAndReactivateSource_withoutLosingCorpusProvenance_status", async () => {
  const { commands, database } = await makeSUT({
    now: makeAdvancingClock("2026-06-28T12:00:00.000Z"),
  });

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const source = commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Referenced source",
    }).value.programSource;
    const candidate = commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Topic from source",
      body: "Topic body",
      sourceIds: [source.sourceId],
    }).value.corpusCandidate;
    const acceptedCorpus = commands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: candidate.candidateId,
    }).value.acceptedCorpus;

    const withdrawn = commands.setProgramSourceLifecycleStatus({
      actingIdentityId: "identity-curator",
      sourceId: source.sourceId,
      status: "withdrawn",
    });
    const activeSourceIdsAfterWithdraw = commands
      .listProgramSources({
        actingIdentityId: "identity-curator",
        programId: "program-a",
      })
      .value.programSources.map($0 => $0.sourceId);
    const provenanceAfterWithdraw = commands.getAcceptedCorpusRevision({
      actingIdentityId: "identity-curator",
      revisionId: acceptedCorpus.revisionId,
    }).value.acceptedCorpus.sourceIds;
    const reactivated = commands.setProgramSourceLifecycleStatus({
      actingIdentityId: "identity-curator",
      sourceId: source.sourceId,
      status: "active",
    });

    assert.deepEqual(
      {
        withdrawn,
        activeSourceIdsAfterWithdraw,
        provenanceAfterWithdraw,
        reactivated,
        activeSourceIdsAfterReactivate: commands
          .listProgramSources({
            actingIdentityId: "identity-curator",
            programId: "program-a",
          })
          .value.programSources.map($0 => $0.sourceId),
      },
      {
        withdrawn: {
          status: "accepted",
          value: {
            source: {
              id: source.sourceId,
              status: "withdrawn",
              updatedByIdentityId: "identity-curator",
              updatedAt: "2026-06-28T12:00:00.006Z",
            },
          },
        },
        activeSourceIdsAfterWithdraw: [],
        provenanceAfterWithdraw: [source.sourceId],
        reactivated: {
          status: "accepted",
          value: {
            source: {
              id: source.sourceId,
              status: "active",
              updatedByIdentityId: "identity-curator",
              updatedAt: "2026-06-28T12:00:00.007Z",
            },
          },
        },
        activeSourceIdsAfterReactivate: [source.sourceId],
      },
    );
  } finally {
    database.close();
  }
});

test("deleteProgramSource_shouldHardDeleteUnreferencedAndBlockReferencedWithdrawnCorpusSource", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const unreferenced = commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Unreferenced source",
    }).value.programSource;
    commands.setSourceContent({
      actingIdentityId: "identity-curator",
      sourceId: unreferenced.sourceId,
      content: "Unreferenced raw source body",
      contentFormat: "markdown",
    });
    const referenced = commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Referenced source",
    }).value.programSource;
    const candidate = commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Referenced topic",
      body: "Referenced body",
      sourceIds: [referenced.sourceId],
    }).value.corpusCandidate;
    const acceptedCorpus = commands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: candidate.candidateId,
    }).value.acceptedCorpus;
    commands.setAcceptedCorpusLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: acceptedCorpus.entityId,
      status: "withdrawn",
    });

    const deletedUnreferenced = commands.deleteProgramSource({
      actingIdentityId: "identity-curator",
      sourceId: unreferenced.sourceId,
    });
    const blockedReferenced = commands.deleteProgramSource({
      actingIdentityId: "identity-curator",
      sourceId: referenced.sourceId,
    });

    assert.deepEqual(
      {
        deletedUnreferenced,
        blockedReferenced,
        rawSourceContent: getSourceContentRecord(database, unreferenced.sourceId),
        storedSources: listProgramSourceRecords(database, { programId: "program-a" }).map($0 => $0.id),
        referencedProvenance: commands.getAcceptedCorpusRevision({
          actingIdentityId: "identity-curator",
          revisionId: acceptedCorpus.revisionId,
        }).value.acceptedCorpus.sourceIds,
      },
      {
        deletedUnreferenced: {
          status: "accepted",
          value: {
            source: {
              id: unreferenced.sourceId,
            },
          },
        },
        blockedReferenced: {
          status: "rejected",
          reason: "source_hard_delete_blocked",
        },
        rawSourceContent: null,
        storedSources: [referenced.sourceId],
        referencedProvenance: [referenced.sourceId],
      },
    );
  } finally {
    database.close();
  }
});

test("deleteProgramSource_shouldLeaveMaterialContentRevisionAndLearnerEvidence_onUnreferencedSource", async () => {
  const { commands, database } = await makeMaterialContentSUT();

  try {
    const quickCheck = createAcceptedQuickCheckOwner(commands, { programId: "program-a" });
    commands.createLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      targetKind: "material_reference",
      targetId: "entity-a",
      evidenceOwnerKind: "accepted_quick_check",
      evidenceOwnerEntityId: quickCheck.entityId,
    });
    setAcceptedMaterialContentRecord(database, {
      revisionId: "revision-a",
      content: "# Accepted material body",
      contentFormat: "markdown",
    });
    const source = commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Unreferenced source",
    }).value.programSource;
    commands.setSourceContent({
      actingIdentityId: "identity-curator",
      sourceId: source.sourceId,
      content: "Raw intake body",
      contentFormat: "markdown",
    });

    const before = {
      acceptedMaterialContent: getAcceptedMaterialContentRecord(database, "revision-a"),
      acceptedRevision: getAcceptedCorpusRevisionRecord(database, "revision-a"),
      learnerEvidenceTargetLinks: listLearnerEvidenceTargetLinkRecords(database, {
        programId: "program-a",
        includeDeleted: true,
      }),
      materialContent: commands.readMaterialRevisionContent({
        actingIdentityId: "identity-student",
        revisionId: "revision-a",
      }).value.content,
    };
    const deleted = commands.deleteProgramSource({
      actingIdentityId: "identity-curator",
      sourceId: source.sourceId,
    });

    assert.deepEqual(
      {
        deleted,
        rawSourceContent: getSourceContentRecord(database, source.sourceId),
        sourceIds: listProgramSourceRecords(database, { programId: "program-a" }).map($0 => $0.id),
        acceptedMaterialContent: getAcceptedMaterialContentRecord(database, "revision-a"),
        acceptedRevision: getAcceptedCorpusRevisionRecord(database, "revision-a"),
        learnerEvidenceTargetLinks: listLearnerEvidenceTargetLinkRecords(database, {
          programId: "program-a",
          includeDeleted: true,
        }),
        materialContent: commands.readMaterialRevisionContent({
          actingIdentityId: "identity-student",
          revisionId: "revision-a",
        }).value.content,
      },
      {
        deleted: {
          status: "accepted",
          value: {
            source: {
              id: source.sourceId,
            },
          },
        },
        rawSourceContent: null,
        sourceIds: ["source-a"],
        ...before,
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

test("listAcceptedCorpus_shouldAllowSignedInPreviewWithoutMembership", async () => {
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
        }).status,
        missingRevision: commands.getAcceptedCorpusRevision({
          actingIdentityId: "identity-curator",
          revisionId: "revision-missing",
        }),
      },
      {
        student: "accepted",
        curator: "accepted",
        admin: "accepted",
        other: "accepted",
        missingRevision: { status: "rejected", reason: "revision_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("setAcceptedCorpusLifecycleStatus_shouldWithdrawAndReactivateEntity_withoutLosingHistoricalRevision_status", async () => {
  const { commands, database } = await makeSUT({
    now: makeAdvancingClock("2026-06-28T10:00:00.000Z"),
  });

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Program source",
    });
    const candidate = commands.createCorpusCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Withdrawable topic",
      body: "Topic body",
      sourceIds: ["source-1"],
    });
    const accepted = commands.acceptCorpusCandidate({
      actingIdentityId: "identity-curator",
      candidateId: candidate.value.corpusCandidate.candidateId,
    }).value.acceptedCorpus;

    const withdrawn = commands.setAcceptedCorpusLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: accepted.entityId,
      status: "withdrawn",
    });
    const activeListAfterWithdraw = commands.listAcceptedCorpus({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });
    const historicalReadAfterWithdraw = commands.getAcceptedCorpusRevision({
      actingIdentityId: "identity-curator",
      revisionId: accepted.revisionId,
    });
    const reactivated = commands.setAcceptedCorpusLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: accepted.entityId,
      status: "active",
    });

    assert.deepEqual(
      {
        withdrawn,
        activeListAfterWithdraw: activeListAfterWithdraw.value.acceptedCorpus.map($0 => $0.entityId),
        historicalReadAfterWithdraw: historicalReadAfterWithdraw.value.acceptedCorpus,
        reactivated,
        activeListAfterReactivate: commands
          .listAcceptedCorpus({
            actingIdentityId: "identity-curator",
            programId: "program-a",
          })
          .value.acceptedCorpus.map($0 => $0.entityId),
        storedEntity: listAcceptedCorpusEntityRecords(database, { programId: "program-a" }).map($0 => ({
          id: $0.id,
          currentRevisionId: $0.currentRevisionId,
        })),
      },
      {
        withdrawn: {
          status: "accepted",
          value: {
            entity: {
              id: accepted.entityId,
              status: "withdrawn",
              updatedByIdentityId: "identity-curator",
              updatedAt: "2026-06-28T10:00:00.006Z",
            },
          },
        },
        activeListAfterWithdraw: [],
        historicalReadAfterWithdraw: accepted,
        reactivated: {
          status: "accepted",
          value: {
            entity: {
              id: accepted.entityId,
              status: "active",
              updatedByIdentityId: "identity-curator",
              updatedAt: "2026-06-28T10:00:00.007Z",
            },
          },
        },
        activeListAfterReactivate: [accepted.entityId],
        storedEntity: [
          {
            id: accepted.entityId,
            currentRevisionId: accepted.revisionId,
          },
        ],
      },
    );
  } finally {
    database.close();
  }
});

test("setAcceptedCorpusLifecycleStatus_shouldAcceptSameStatusAndRefreshAttribution_status", async () => {
  const { commands, database } = await makeSUT({
    now: makeAdvancingClock("2026-06-28T10:30:00.000Z"),
  });

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const accepted = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Stable topic",
    });

    const activeNoOp = commands.setAcceptedCorpusLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: accepted.entityId,
      status: "active",
    }).value.entity;
    const withdrawn = commands.setAcceptedCorpusLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: accepted.entityId,
      status: "withdrawn",
    }).value.entity;
    const withdrawnNoOp = commands.setAcceptedCorpusLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: accepted.entityId,
      status: "withdrawn",
    }).value.entity;
    const stored = listAcceptedCorpusEntityRecords(database, { programId: "program-a" })[0];

    assert.deepEqual(
      {
        activeNoOp: { actor: activeNoOp.updatedByIdentityId, status: activeNoOp.status },
        withdrawn: { actor: withdrawn.updatedByIdentityId, status: withdrawn.status },
        withdrawnNoOp: { actor: withdrawnNoOp.updatedByIdentityId, status: withdrawnNoOp.status },
        timestampsAdvance:
          activeNoOp.updatedAt < withdrawn.updatedAt && withdrawn.updatedAt < withdrawnNoOp.updatedAt,
        currentRevisionId: stored.currentRevisionId,
      },
      {
        activeNoOp: { actor: "identity-curator", status: "active" },
        withdrawn: { actor: "identity-curator", status: "withdrawn" },
        withdrawnNoOp: { actor: "identity-curator", status: "withdrawn" },
        timestampsAdvance: true,
        currentRevisionId: accepted.revisionId,
      },
    );
  } finally {
    database.close();
  }
});

test("setAcceptedCorpusLifecycleStatus_shouldRejectWithdrawal_onActiveNavigationRelationship_status", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const topic = acceptNavigationCandidate(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Topic",
    });
    const concept = acceptNavigationCandidate(commands, {
      programId: "program-a",
      candidateKind: "concept",
      title: "Concept",
      relationshipDrafts: [
        {
          relationshipKind: "topic_includes_concept",
          fromEntityId: topic.entityId,
          toCandidateRef: "self",
        },
      ],
    });

    const result = commands.setAcceptedCorpusLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: concept.entityId,
      status: "withdrawn",
    });

    assert.deepEqual(
      {
        result,
        activeCorpusIds: commands
          .listAcceptedCorpus({
            actingIdentityId: "identity-curator",
            programId: "program-a",
          })
          .value.acceptedCorpus.map($0 => $0.entityId),
        relationshipIds: listAcceptedNavigationRelationshipRecords(database, { programId: "program-a" }).map($0 => $0.id),
      },
      {
        result: {
          status: "rejected",
          reason: "entity_withdrawal_blocked",
        },
        activeCorpusIds: [concept.entityId, topic.entityId],
        relationshipIds: ["source-6"],
      },
    );
  } finally {
    database.close();
  }
});

test("setAcceptedCorpusLifecycleStatus_shouldRejectWithdrawal_onActiveReadinessRequirement_status", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const topic = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Readiness topic",
    });
    const concept = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "concept",
      title: "Readiness concept",
    });
    const readinessCandidate = commands.createReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Topic readiness",
      scope: { scopeKind: "topic", topicEntityId: topic.entityId },
      requirements: [
        {
          targetKind: "concept",
          targetId: concept.entityId,
          requiredLevel: "developing",
        },
      ],
    }).value.readinessCheckCandidate;
    const readiness = commands.acceptReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: readinessCandidate.candidateId,
    }).value.acceptedReadinessCheck;

    const result = commands.setAcceptedCorpusLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: concept.entityId,
      status: "withdrawn",
    });

    assert.deepEqual(
      {
        result,
        activeCorpusIds: commands
          .listAcceptedCorpus({
            actingIdentityId: "identity-curator",
            programId: "program-a",
          })
          .value.acceptedCorpus.map($0 => $0.entityId),
        readinessEntities: listAcceptedReadinessCheckEntityRecords(database, {
          programId: "program-a",
          status: "active",
        }).map($0 => [$0.id, $0.currentRevisionId]),
      },
      {
        result: {
          status: "rejected",
          reason: "entity_withdrawal_blocked",
        },
        activeCorpusIds: [concept.entityId, topic.entityId],
        readinessEntities: [[readiness.entityId, readiness.revisionId]],
      },
    );
  } finally {
    database.close();
  }
});

test("lifecycleWithdrawal_shouldAllowWithdrawnDependentsAndUnconditionalReactivation_status", async () => {
  const { commands, database } = await makeSUT({ ids: generatedIds("inactive-dependents", 180) });

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const navigationTopic = acceptNavigationCandidate(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Navigation topic",
    });
    const navigationConcept = acceptNavigationCandidate(commands, {
      programId: "program-a",
      candidateKind: "concept",
      relationshipDrafts: [
        {
          relationshipKind: "topic_includes_concept",
          fromEntityId: navigationTopic.entityId,
          toCandidateRef: "self",
        },
      ],
      title: "Navigation concept",
    });
    const relationship = listAcceptedNavigationRelationshipRecords(database, {
      programId: "program-a",
    })[0];
    const withdrawnRelationship = commands.setAcceptedNavigationRelationshipLifecycleStatus({
      actingIdentityId: "identity-curator",
      relationshipId: relationship.id,
      status: "withdrawn",
    });
    const withdrawnNavigationConcept = commands.setAcceptedCorpusLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: navigationConcept.entityId,
      status: "withdrawn",
    });

    const readinessTopic = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Readiness topic",
    });
    const readinessConcept = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "concept",
      title: "Readiness concept",
    });
    const readinessCandidate = commands.createReadinessCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Readiness dependent",
      scope: { scopeKind: "topic", topicEntityId: readinessTopic.entityId },
      requirements: [
        {
          targetKind: "concept",
          targetId: readinessConcept.entityId,
          requiredLevel: "developing",
        },
      ],
    }).value.readinessCheckCandidate;
    const readiness = commands.acceptReadinessCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: readinessCandidate.candidateId,
    }).value.acceptedReadinessCheck;
    const withdrawnReadiness = commands.setAcceptedReadinessCheckLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: readiness.entityId,
      status: "withdrawn",
    });
    const withdrawnReadinessConcept = commands.setAcceptedCorpusLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: readinessConcept.entityId,
      status: "withdrawn",
    });

    const criterion = createAcceptedAssessmentCriterionOwner(commands, { programId: "program-a" });
    const openAnswer = createAcceptedOpenAnswerOwner(commands, {
      programId: "program-a",
      criterionEntityIds: [criterion.entityId],
    });
    const withdrawnOpenAnswer = commands.setAcceptedOpenAnswerCheckLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: openAnswer.entityId,
      status: "withdrawn",
    });
    const withdrawnCriterion = commands.setAcceptedAssessmentCriterionLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: criterion.entityId,
      status: "withdrawn",
    });
    const activeOpenAnswer = commands.setAcceptedOpenAnswerCheckLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: openAnswer.entityId,
      status: "active",
    });
    const activeCriterion = commands.setAcceptedAssessmentCriterionLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: criterion.entityId,
      status: "active",
    });

    assert.deepEqual(
      {
        relationship: withdrawnRelationship.value.entity.status,
        navigationTarget: withdrawnNavigationConcept.value.entity.status,
        readiness: withdrawnReadiness.value.entity.status,
        readinessTarget: withdrawnReadinessConcept.value.entity.status,
        openAnswerSequence: [
          withdrawnOpenAnswer.value.entity.status,
          activeOpenAnswer.value.entity.status,
        ],
        criterionSequence: [
          withdrawnCriterion.value.entity.status,
          activeCriterion.value.entity.status,
        ],
      },
      {
        relationship: "withdrawn",
        navigationTarget: "withdrawn",
        readiness: "withdrawn",
        readinessTarget: "withdrawn",
        openAnswerSequence: ["withdrawn", "active"],
        criterionSequence: ["withdrawn", "active"],
      },
    );
  } finally {
    database.close();
  }
});

test("acceptedAssessmentLifecycle_shouldWithdrawReactivateAndPreserveCurrentRevisions_status", async () => {
  const { commands, database } = await makeSUT({ ids: generatedIds("assessment-cycles", 120) });

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const quickCheck = createAcceptedQuickCheckOwner(commands, { programId: "program-a" });
    const criterion = createAcceptedAssessmentCriterionOwner(commands, { programId: "program-a" });
    const openAnswer = createAcceptedOpenAnswerOwner(commands, {
      programId: "program-a",
      criterionEntityIds: [criterion.entityId],
    });

    const quickStatuses = [
      commands.setAcceptedQuickCheckLifecycleStatus({
        actingIdentityId: "identity-curator",
        entityId: quickCheck.entityId,
        status: "withdrawn",
      }).value.entity.status,
      commands.setAcceptedQuickCheckLifecycleStatus({
        actingIdentityId: "identity-curator",
        entityId: quickCheck.entityId,
        status: "active",
      }).value.entity.status,
    ];
    const withdrawnOpenAnswer = commands.setAcceptedOpenAnswerCheckLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: openAnswer.entityId,
      status: "withdrawn",
    });
    const criterionStatuses = [
      commands.setAcceptedAssessmentCriterionLifecycleStatus({
        actingIdentityId: "identity-curator",
        entityId: criterion.entityId,
        status: "withdrawn",
      }).value.entity.status,
      commands.setAcceptedAssessmentCriterionLifecycleStatus({
        actingIdentityId: "identity-curator",
        entityId: criterion.entityId,
        status: "active",
      }).value.entity.status,
    ];
    const activeOpenAnswer = commands.setAcceptedOpenAnswerCheckLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: openAnswer.entityId,
      status: "active",
    });

    assert.deepEqual(
      {
        quickStatuses,
        openAnswerStatuses: [
          withdrawnOpenAnswer.value.entity.status,
          activeOpenAnswer.value.entity.status,
        ],
        criterionStatuses,
        currentRevisions: {
          quickCheck: listAcceptedQuickCheckEntityRecords(database, { programId: "program-a" })[0]
            .currentRevisionId,
          openAnswer: listAcceptedOpenAnswerCheckEntityRecords(database, { programId: "program-a" })[0]
            .currentRevisionId,
          criterion: listAcceptedAssessmentCriterionEntityRecords(database, { programId: "program-a" })[0]
            .currentRevisionId,
        },
      },
      {
        quickStatuses: ["withdrawn", "active"],
        openAnswerStatuses: ["withdrawn", "active"],
        criterionStatuses: ["withdrawn", "active"],
        currentRevisions: {
          quickCheck: quickCheck.revisionId,
          openAnswer: openAnswer.revisionId,
          criterion: criterion.revisionId,
        },
      },
    );
  } finally {
    database.close();
  }
});

test("setAcceptedQuickCheckLifecycleStatus_shouldRejectWithdrawal_onActiveLearnerEvidenceTargetLink_status", async () => {
  const { commands, database } = await makeSUT({ ids: generatedIds("quick-lifecycle", 80) });

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const target = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Evidence target",
    });
    const quickCheck = createAcceptedQuickCheckOwner(commands, { programId: "program-a" });
    const link = commands.createLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      targetKind: "topic",
      targetId: target.entityId,
      evidenceOwnerKind: "accepted_quick_check",
      evidenceOwnerEntityId: quickCheck.entityId,
    }).value.learnerEvidenceTargetLink;

    const blockedResult = commands.setAcceptedQuickCheckLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: quickCheck.entityId,
      status: "withdrawn",
    });
    const activeQuickChecksAfterBlock = listAcceptedQuickCheckEntityRecords(database, {
      programId: "program-a",
      status: "active",
    }).map($0 => [$0.id, $0.currentRevisionId]);
    const activeLinksAfterBlock = listLearnerEvidenceTargetLinkRecords(database, {
      programId: "program-a",
    }).map($0 => [$0.id, $0.evidenceOwnerKind, $0.evidenceOwnerEntityId, $0.status]);
    const deletedLink = commands.deleteLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      linkId: link.linkId,
    });
    const withdrawnResult = commands.setAcceptedQuickCheckLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: quickCheck.entityId,
      status: "withdrawn",
    });

    assert.deepEqual(
      {
        blockedResult,
        activeQuickChecksAfterBlock,
        activeLinksAfterBlock,
        deletedLinkStatus: deletedLink.status,
        withdrawnResult: {
          status: withdrawnResult.status,
          entity: withdrawnResult.value.entity,
        },
        activeQuickChecksAfterDelete: listAcceptedQuickCheckEntityRecords(database, {
          programId: "program-a",
          status: "active",
        }).map($0 => [$0.id, $0.currentRevisionId]),
        storedLinks: listLearnerEvidenceTargetLinkRecords(database, {
          programId: "program-a",
          includeDeleted: true,
        }).map($0 => [$0.id, $0.evidenceOwnerKind, $0.evidenceOwnerEntityId, $0.status]),
      },
      {
        blockedResult: {
          status: "rejected",
          reason: "entity_withdrawal_blocked",
        },
        activeQuickChecksAfterBlock: [[quickCheck.entityId, quickCheck.revisionId]],
        activeLinksAfterBlock: [[link.linkId, "accepted_quick_check", quickCheck.entityId, "active"]],
        deletedLinkStatus: "accepted",
        withdrawnResult: {
          status: "accepted",
          entity: {
            id: quickCheck.entityId,
            status: "withdrawn",
            updatedByIdentityId: "identity-curator",
            updatedAt: "2026-05-28T11:00:00.008Z",
          },
        },
        activeQuickChecksAfterDelete: [],
        storedLinks: [[link.linkId, "accepted_quick_check", quickCheck.entityId, "deleted"]],
      },
    );
  } finally {
    database.close();
  }
});

test("listProgramNavigation_shouldOmitWithdrawnCurrentEntityAndKeepRevisionReadable_status", async () => {
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
      title: "Withdrawn topic",
    });

    const withdrawal = commands.setAcceptedCorpusLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: topic.entityId,
      status: "withdrawn",
    });

    assert.deepEqual(
      {
        withdrawalStatus: withdrawal.status,
        listing: commands.listProgramNavigation({
          actingIdentityId: "identity-student",
          programId: "program-a",
        }).value.navigation,
        detail: commands.getNavigationEntity({
          actingIdentityId: "identity-student",
          entityId: topic.entityId,
        }),
        historicalRevision: commands.getNavigationRevision({
          actingIdentityId: "identity-student",
          revisionId: topic.revisionId,
        }),
      },
      {
        withdrawalStatus: "accepted",
        listing: {
          programId: "program-a",
          topics: [],
          ungroupedConcepts: [],
          ungroupedMaterials: [],
        },
        detail: { status: "rejected", reason: "navigation_entity_not_found" },
        historicalRevision: {
          status: "accepted",
          value: {
            navigationRevision: {
              entityId: topic.entityId,
              revisionId: topic.revisionId,
              programId: "program-a",
              acceptedKind: "topic",
              title: "Withdrawn topic",
              isCurrentRevision: true,
            },
          },
        },
      },
    );
  } finally {
    database.close();
  }
});

test("setAcceptedNavigationRelationshipLifecycleStatus_shouldWithdrawAndReactivateRelationship_withoutLosingRevision_status", async () => {
  const { commands, database } = await makeSUT();

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const topic = acceptNavigationCandidate(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Grouped topic",
    });
    const concept = acceptNavigationCandidate(commands, {
      programId: "program-a",
      candidateKind: "concept",
      title: "Grouped concept",
      relationshipDrafts: [
        {
          relationshipKind: "topic_includes_concept",
          fromEntityId: topic.entityId,
          toCandidateRef: "self",
        },
      ],
    });
    const relationship = listAcceptedNavigationRelationshipRecords(database, { programId: "program-a" })[0];
    const relationshipRevision = getAcceptedNavigationRelationshipRevisionRecord(database, relationship.currentRevisionId);

    const withdrawn = commands.setAcceptedNavigationRelationshipLifecycleStatus({
      actingIdentityId: "identity-curator",
      relationshipId: relationship.id,
      status: "withdrawn",
    });
    const navigationAfterWithdraw = commands.listProgramNavigation({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    }).value.navigation;
    const reactivated = commands.setAcceptedNavigationRelationshipLifecycleStatus({
      actingIdentityId: "identity-curator",
      relationshipId: relationship.id,
      status: "active",
    });

    assert.deepEqual(
      {
        withdrawn,
        navigationAfterWithdraw: {
          topics: navigationAfterWithdraw.topics.map($0 => $0.entityId),
          ungroupedConcepts: navigationAfterWithdraw.ungroupedConcepts.map($0 => $0.entityId),
        },
        relationshipRevision,
        reactivated,
        navigationAfterReactivate: commands
          .listProgramNavigation({
            actingIdentityId: "identity-curator",
            programId: "program-a",
          })
          .value.navigation.ungroupedConcepts.map($0 => $0.entityId),
      },
      {
        withdrawn: {
          status: "accepted",
          value: {
            entity: {
              id: relationship.id,
              status: "withdrawn",
              updatedByIdentityId: "identity-curator",
              updatedAt: "2026-05-28T11:00:00.008Z",
            },
          },
        },
        navigationAfterWithdraw: {
          topics: [topic.entityId],
          ungroupedConcepts: [concept.entityId],
        },
        relationshipRevision: {
          id: relationship.currentRevisionId,
          relationshipId: relationship.id,
          programId: "program-a",
          relationshipKind: "topic_includes_concept",
          fromEntityId: topic.entityId,
          fromRevisionId: topic.revisionId,
          fromKind: "topic",
          toEntityId: concept.entityId,
          toRevisionId: concept.revisionId,
          toKind: "concept",
          label: null,
          sourceIds: [],
          acceptedFromCandidateId: "corpus-event-3",
          acceptedByIdentityId: "identity-curator",
          acceptedAt: "2026-05-28T11:00:00.006Z",
        },
        reactivated: {
          status: "accepted",
          value: {
            entity: {
              id: relationship.id,
              status: "active",
              updatedByIdentityId: "identity-curator",
              updatedAt: "2026-05-28T11:00:00.009Z",
            },
          },
        },
        navigationAfterReactivate: [],
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

test("listProgramNavigation_shouldAllowSignedInPreviewWithoutMembership_onAcceptedNavigation", async () => {
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
        }).status,
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
        other: "accepted",
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

test("setAcceptedAssessmentCriterionLifecycleStatus_shouldRejectWithdrawal_onActiveOpenAnswerCheck_status", async () => {
  const { commands, database } = await makeSUT({ ids: generatedIds("criterion-lifecycle", 80) });

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const criterion = createAcceptedAssessmentCriterionOwner(commands, { programId: "program-a" });
    const openAnswer = createAcceptedOpenAnswerOwner(commands, {
      programId: "program-a",
      criterionEntityIds: [criterion.entityId],
    });

    const result = commands.setAcceptedAssessmentCriterionLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: criterion.entityId,
      status: "withdrawn",
    });

    assert.deepEqual(
      {
        result,
        activeCriteria: listAcceptedAssessmentCriterionEntityRecords(database, {
          programId: "program-a",
          status: "active",
        }).map($0 => [$0.id, $0.currentRevisionId]),
        activeOpenAnswerChecks: listAcceptedOpenAnswerCheckEntityRecords(database, {
          programId: "program-a",
          status: "active",
        }).map($0 => [$0.id, $0.currentRevisionId]),
      },
      {
        result: {
          status: "rejected",
          reason: "entity_withdrawal_blocked",
        },
        activeCriteria: [[criterion.entityId, criterion.revisionId]],
        activeOpenAnswerChecks: [[openAnswer.entityId, openAnswer.revisionId]],
      },
    );
  } finally {
    database.close();
  }
});

test("setAcceptedAssessmentCriterionLifecycleStatus_shouldRejectWithdrawal_onActiveLearnerEvidenceTargetLink_status", async () => {
  const { commands, database } = await makeSUT({ ids: generatedIds("criterion-link-lifecycle", 80) });

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const target = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Criterion evidence target",
    });
    const criterion = createAcceptedAssessmentCriterionOwner(commands, { programId: "program-a" });
    const link = commands.createLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      targetKind: "topic",
      targetId: target.entityId,
      evidenceOwnerKind: "accepted_assessment_criterion",
      evidenceOwnerEntityId: criterion.entityId,
    }).value.learnerEvidenceTargetLink;

    const blockedResult = commands.setAcceptedAssessmentCriterionLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: criterion.entityId,
      status: "withdrawn",
    });
    const activeCriteriaAfterBlock = listAcceptedAssessmentCriterionEntityRecords(database, {
      programId: "program-a",
      status: "active",
    }).map($0 => [$0.id, $0.currentRevisionId]);
    const activeLinksAfterBlock = listLearnerEvidenceTargetLinkRecords(database, {
      programId: "program-a",
    }).map($0 => [$0.id, $0.evidenceOwnerKind, $0.evidenceOwnerEntityId, $0.status]);
    const deletedLink = commands.deleteLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      linkId: link.linkId,
    });
    const withdrawnResult = commands.setAcceptedAssessmentCriterionLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: criterion.entityId,
      status: "withdrawn",
    });

    assert.deepEqual(
      {
        blockedResult,
        activeCriteriaAfterBlock,
        activeLinksAfterBlock,
        deletedLinkStatus: deletedLink.status,
        withdrawnResult: {
          status: withdrawnResult.status,
          entity: withdrawnResult.value.entity,
        },
        activeCriteriaAfterDelete: listAcceptedAssessmentCriterionEntityRecords(database, {
          programId: "program-a",
          status: "active",
        }).map($0 => [$0.id, $0.currentRevisionId]),
        storedLinks: listLearnerEvidenceTargetLinkRecords(database, {
          programId: "program-a",
          includeDeleted: true,
        }).map($0 => [$0.id, $0.evidenceOwnerKind, $0.evidenceOwnerEntityId, $0.status]),
      },
      {
        blockedResult: {
          status: "rejected",
          reason: "entity_withdrawal_blocked",
        },
        activeCriteriaAfterBlock: [[criterion.entityId, criterion.revisionId]],
        activeLinksAfterBlock: [[link.linkId, "accepted_assessment_criterion", criterion.entityId, "active"]],
        deletedLinkStatus: "accepted",
        withdrawnResult: {
          status: "accepted",
          entity: {
            id: criterion.entityId,
            status: "withdrawn",
            updatedByIdentityId: "identity-curator",
            updatedAt: "2026-05-28T11:00:00.008Z",
          },
        },
        activeCriteriaAfterDelete: [],
        storedLinks: [[link.linkId, "accepted_assessment_criterion", criterion.entityId, "deleted"]],
      },
    );
  } finally {
    database.close();
  }
});

test("setAcceptedOpenAnswerCheckLifecycleStatus_shouldRejectWithdrawal_onActiveLearnerEvidenceTargetLink_status", async () => {
  const { commands, database } = await makeSUT({ ids: generatedIds("open-answer-lifecycle", 80) });

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const target = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Open answer evidence target",
    });
    const criterion = createAcceptedAssessmentCriterionOwner(commands, { programId: "program-a" });
    const openAnswer = createAcceptedOpenAnswerOwner(commands, {
      programId: "program-a",
      criterionEntityIds: [criterion.entityId],
    });
    const link = commands.createLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      targetKind: "topic",
      targetId: target.entityId,
      evidenceOwnerKind: "accepted_open_answer_check",
      evidenceOwnerEntityId: openAnswer.entityId,
    }).value.learnerEvidenceTargetLink;

    const blockedResult = commands.setAcceptedOpenAnswerCheckLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: openAnswer.entityId,
      status: "withdrawn",
    });
    const activeOpenAnswerChecksAfterBlock = listAcceptedOpenAnswerCheckEntityRecords(database, {
      programId: "program-a",
      status: "active",
    }).map($0 => [$0.id, $0.currentRevisionId]);
    const activeLinksAfterBlock = listLearnerEvidenceTargetLinkRecords(database, {
      programId: "program-a",
    }).map($0 => [$0.id, $0.evidenceOwnerKind, $0.evidenceOwnerEntityId, $0.status]);
    const deletedLink = commands.deleteLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      linkId: link.linkId,
    });
    const withdrawnResult = commands.setAcceptedOpenAnswerCheckLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: openAnswer.entityId,
      status: "withdrawn",
    });

    assert.deepEqual(
      {
        blockedResult,
        activeOpenAnswerChecksAfterBlock,
        activeLinksAfterBlock,
        deletedLinkStatus: deletedLink.status,
        withdrawnResult: {
          status: withdrawnResult.status,
          entity: withdrawnResult.value.entity,
        },
        activeOpenAnswerChecksAfterDelete: listAcceptedOpenAnswerCheckEntityRecords(database, {
          programId: "program-a",
          status: "active",
        }).map($0 => [$0.id, $0.currentRevisionId]),
        storedLinks: listLearnerEvidenceTargetLinkRecords(database, {
          programId: "program-a",
          includeDeleted: true,
        }).map($0 => [$0.id, $0.evidenceOwnerKind, $0.evidenceOwnerEntityId, $0.status]),
      },
      {
        blockedResult: {
          status: "rejected",
          reason: "entity_withdrawal_blocked",
        },
        activeOpenAnswerChecksAfterBlock: [[openAnswer.entityId, openAnswer.revisionId]],
        activeLinksAfterBlock: [[link.linkId, "accepted_open_answer_check", openAnswer.entityId, "active"]],
        deletedLinkStatus: "accepted",
        withdrawnResult: {
          status: "accepted",
          entity: {
            id: openAnswer.entityId,
            status: "withdrawn",
            updatedByIdentityId: "identity-curator",
            updatedAt: "2026-05-28T11:00:00.010Z",
          },
        },
        activeOpenAnswerChecksAfterDelete: [],
        storedLinks: [[link.linkId, "accepted_open_answer_check", openAnswer.entityId, "deleted"]],
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

test("listAcceptedQuickChecksForCuration_shouldEnumerateAcceptedQuickChecksWithAnswerKeyForCuratorOnly", async () => {
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
        curator: commands.listAcceptedQuickChecksForCuration?.({
          actingIdentityId: "identity-curator",
          programId: "program-a",
        }),
        student: commands.listAcceptedQuickChecksForCuration?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
        }),
        adminWithoutCurator: commands.listAcceptedQuickChecksForCuration?.({
          actingIdentityId: "identity-admin",
          programId: "program-a",
        }),
        inactive: commands.listAcceptedQuickChecksForCuration?.({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
        }),
        unknownProgram: commands.listAcceptedQuickChecksForCuration?.({
          actingIdentityId: "identity-curator",
          programId: "program-missing",
        }),
      },
      {
        curator: {
          status: "accepted",
          value: {
            acceptedQuickChecks: [
              {
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
            ],
          },
        },
        student: { status: "rejected", reason: "admin_or_curator_required" },
        adminWithoutCurator: { status: "rejected", reason: "admin_or_curator_required" },
        inactive: { status: "rejected", reason: "identity_not_active" },
        unknownProgram: { status: "rejected", reason: "program_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("listAcceptedReadinessChecksForCuration_shouldEnumerateAcceptedReadinessChecksForCuratorOnly", async () => {
  const { commands, database } = await makeSUT({ ids: generatedIds("readiness-curation-list", 120) });

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
    const topic = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Readiness topic",
    });
    const created = commands.createReadinessCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Topic readiness",
      scope: { scopeKind: "topic", topicEntityId: topic.entityId },
      requirements: [
        { targetKind: "topic", targetId: topic.entityId, requiredLevel: "on_track" },
      ],
    });
    const acceptedReadiness = commands.acceptReadinessCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: created.value.readinessCheckCandidate.candidateId,
    }).value.acceptedReadinessCheck;

    const curator = commands.listAcceptedReadinessChecksForCuration?.({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });

    assert.deepEqual(
      {
        curatorStatus: curator?.status,
        items: curator?.value?.acceptedReadinessChecks?.map($0 => ({
          entityId: $0.entityId,
          revisionId: $0.revisionId,
          programId: $0.programId,
          title: $0.title,
        })),
        student: commands.listAcceptedReadinessChecksForCuration?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
        }),
        adminWithoutCurator: commands.listAcceptedReadinessChecksForCuration?.({
          actingIdentityId: "identity-admin",
          programId: "program-a",
        }),
        inactive: commands.listAcceptedReadinessChecksForCuration?.({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
        }),
        unknownProgram: commands.listAcceptedReadinessChecksForCuration?.({
          actingIdentityId: "identity-curator",
          programId: "program-missing",
        }),
      },
      {
        curatorStatus: "accepted",
        items: [
          {
            entityId: acceptedReadiness.entityId,
            revisionId: acceptedReadiness.revisionId,
            programId: "program-a",
            title: "Topic readiness",
          },
        ],
        student: { status: "rejected", reason: "admin_or_curator_required" },
        adminWithoutCurator: { status: "rejected", reason: "admin_or_curator_required" },
        inactive: { status: "rejected", reason: "identity_not_active" },
        unknownProgram: { status: "rejected", reason: "program_not_found" },
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

test("learnerEvidenceTargetLinks_shouldExposeCurationCommands", async () => {
  const { commands, database } = await makeSUT();

  try {
    assert.deepEqual(
      {
        create: typeof commands.createLearnerEvidenceTargetLink,
        delete: typeof commands.deleteLearnerEvidenceTargetLink,
        list: typeof commands.listLearnerEvidenceTargetLinks,
      },
      {
        create: "function",
        delete: "function",
        list: "function",
      },
    );
  } finally {
    database.close();
  }
});

test("learnerEvidenceTargetLinks_shouldCreateListAndSoftDeleteActiveLinksForProgramCurator", async () => {
  const { commands, database } = await makeSUT({ ids: generatedIds("learner-link", 80) });

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const target = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Cell membranes",
    });
    const quickCheck = createAcceptedQuickCheckOwner(commands, { programId: "program-a" });
    const beforeStudentWorkspace = snapshotLearnerEvidenceStudentWorkspace(database);

    const created = commands.createLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      targetKind: "topic",
      targetId: target.entityId,
      evidenceOwnerKind: "accepted_quick_check",
      evidenceOwnerEntityId: quickCheck.entityId,
    });
    const duplicate = commands.createLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      targetKind: "topic",
      targetId: target.entityId,
      evidenceOwnerKind: "accepted_quick_check",
      evidenceOwnerEntityId: quickCheck.entityId,
    });
    const listedBeforeDelete = commands.listLearnerEvidenceTargetLinks({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });
    const deleted = commands.deleteLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      linkId: created.value.learnerEvidenceTargetLink.linkId,
    });
    const listedAfterDelete = commands.listLearnerEvidenceTargetLinks({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });
    const createdLink = created.value.learnerEvidenceTargetLink;

    assert.deepEqual(
      {
        created: {
          status: created.status,
          link: learnerEvidenceTargetLinkProjection(createdLink),
          hasStableGeneratedFields: isNonEmptyTestText(createdLink.linkId) &&
            isNonEmptyTestText(createdLink.createdAt) &&
            createdLink.createdAt === createdLink.updatedAt,
        },
        duplicateMatchesCreated: duplicate.value.learnerEvidenceTargetLink,
        listedBeforeDelete,
        deleted: {
          status: deleted.status,
          link: {
            ...deleted.value.learnerEvidenceTargetLink,
            updatedAt: "redacted-updated-at",
          },
        },
        listedAfterDelete,
        storedLinks: listLearnerEvidenceTargetLinkRecords(database, {
          programId: "program-a",
          includeDeleted: true,
        }).map($0 => ({
          id: isNonEmptyTestText($0.id),
          status: $0.status,
          targetKind: $0.targetKind,
          targetId: $0.targetId,
          evidenceOwnerKind: $0.evidenceOwnerKind,
          evidenceOwnerEntityId: $0.evidenceOwnerEntityId,
        })),
        studentWorkspaceBefore: beforeStudentWorkspace,
        studentWorkspaceAfter: snapshotLearnerEvidenceStudentWorkspace(database),
      },
      {
        created: {
          status: "accepted",
          link: {
            programId: "program-a",
            targetKind: "topic",
            targetId: target.entityId,
            evidenceOwnerKind: "accepted_quick_check",
            evidenceOwnerEntityId: quickCheck.entityId,
            status: "active",
            createdByIdentityId: "identity-curator",
          },
          hasStableGeneratedFields: true,
        },
        duplicateMatchesCreated: createdLink,
        listedBeforeDelete: {
          status: "accepted",
          value: {
            learnerEvidenceTargetLinks: [createdLink],
          },
        },
        deleted: {
          status: "accepted",
          link: {
            ...createdLink,
            status: "deleted",
            updatedAt: "redacted-updated-at",
          },
        },
        listedAfterDelete: {
          status: "accepted",
          value: {
            learnerEvidenceTargetLinks: [],
          },
        },
        storedLinks: [
          {
            id: true,
            status: "deleted",
            targetKind: "topic",
            targetId: target.entityId,
            evidenceOwnerKind: "accepted_quick_check",
            evidenceOwnerEntityId: quickCheck.entityId,
          },
        ],
        studentWorkspaceBefore: beforeStudentWorkspace,
        studentWorkspaceAfter: beforeStudentWorkspace,
      },
    );
  } finally {
    database.close();
  }
});

test("learnerEvidenceTargetLinks_shouldRequireActiveProgramCuratorForCreateListAndDelete", async () => {
  const { commands, database } = await makeSUT({ ids: generatedIds("learner-auth", 80) });

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    createIdentity(database, makeIdentity({ id: "identity-admin" }));
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
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
    const target = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Authorization topic",
    });
    const quickCheck = createAcceptedQuickCheckOwner(commands, { programId: "program-a" });
    const validInput = {
      programId: "program-a",
      targetKind: "topic",
      targetId: target.entityId,
      evidenceOwnerKind: "accepted_quick_check",
      evidenceOwnerEntityId: quickCheck.entityId,
    };
    const link = commands.createLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      ...validInput,
    }).value.learnerEvidenceTargetLink;

    assert.deepEqual(
      {
        createStudent: commands.createLearnerEvidenceTargetLink({
          actingIdentityId: "identity-student",
          ...validInput,
        }),
        createAdmin: commands.createLearnerEvidenceTargetLink({
          actingIdentityId: "identity-admin",
          ...validInput,
        }),
        createDisabled: commands.createLearnerEvidenceTargetLink({
          actingIdentityId: "identity-disabled",
          ...validInput,
        }),
        createMissingProgram: commands.createLearnerEvidenceTargetLink({
          actingIdentityId: "identity-curator",
          ...validInput,
          programId: "program-missing",
        }),
        listStudent: commands.listLearnerEvidenceTargetLinks({
          actingIdentityId: "identity-student",
          programId: "program-a",
        }),
        listAdmin: commands.listLearnerEvidenceTargetLinks({
          actingIdentityId: "identity-admin",
          programId: "program-a",
        }),
        deleteAdmin: commands.deleteLearnerEvidenceTargetLink({
          actingIdentityId: "identity-admin",
          linkId: link.linkId,
        }),
        deleteMissing: commands.deleteLearnerEvidenceTargetLink({
          actingIdentityId: "identity-curator",
          linkId: "learner-target-link-missing",
        }),
      },
      {
        createStudent: { status: "rejected", reason: "admin_or_curator_required" },
        createAdmin: { status: "rejected", reason: "admin_or_curator_required" },
        createDisabled: { status: "rejected", reason: "identity_not_active" },
        createMissingProgram: { status: "rejected", reason: "program_not_found" },
        listStudent: { status: "rejected", reason: "admin_or_curator_required" },
        listAdmin: { status: "rejected", reason: "admin_or_curator_required" },
        deleteAdmin: { status: "rejected", reason: "admin_or_curator_required" },
        deleteMissing: { status: "rejected", reason: "learner_state_target_link_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("learnerEvidenceTargetLinks_shouldRejectInvalidTargetsAndEvidenceOwners", async () => {
  const { commands, database } = await makeSUT({ ids: generatedIds("learner-validation", 160) });

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    const target = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Valid topic",
    });
    const conceptTarget = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "concept",
      title: "Valid concept",
    });
    const materialTarget = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "material_reference",
      title: "Valid material",
    });
    const nonNavigationTarget = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "definition",
      title: "Definition",
      body: "Definition body",
    });
    const crossProgramTarget = createAcceptedNavigationTarget(commands, {
      programId: "program-b",
      candidateKind: "topic",
      title: "Other topic",
    });
    const draftTarget = commands.createNavigationCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Draft topic",
    }).value.navigationCandidate;
    const rejectedTarget = commands.createNavigationCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Rejected topic",
    }).value.navigationCandidate;
    commands.rejectNavigationCandidate({
      actingIdentityId: "identity-curator",
      candidateId: rejectedTarget.candidateId,
    });
    const quickCheck = createAcceptedQuickCheckOwner(commands, { programId: "program-a" });
    const crossProgramQuickCheck = createAcceptedQuickCheckOwner(commands, { programId: "program-b" });
    const draftQuickCheck = commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Draft quick check",
      prompt: "Draft prompt",
      options: ["A", "B"],
      answerKeyIndex: 0,
    }).value.quickCheckCandidate;
    const rejectedQuickCheck = commands.createQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      checkKind: "single_select_quick_check",
      title: "Rejected quick check",
      prompt: "Rejected prompt",
      options: ["A", "B"],
      answerKeyIndex: 0,
    }).value.quickCheckCandidate;
    commands.rejectQuickCheckCandidate({
      actingIdentityId: "identity-curator",
      candidateId: rejectedQuickCheck.candidateId,
    });
    const acceptedCriterion = createAcceptedAssessmentCriterionOwner(commands, {
      programId: "program-a",
    });
    const openAnswerCheck = createAcceptedOpenAnswerOwner(commands, {
      programId: "program-a",
      criterionEntityIds: [acceptedCriterion.entityId],
    });

    const baseInput = {
      actingIdentityId: "identity-curator",
      programId: "program-a",
      targetKind: "topic",
      targetId: target.entityId,
      evidenceOwnerKind: "accepted_quick_check",
      evidenceOwnerEntityId: quickCheck.entityId,
    };

    assert.deepEqual(
      {
        unsupportedTargetKind: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          targetKind: "definition",
          targetId: nonNavigationTarget.entityId,
        }),
        nonNavigationTarget: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          targetId: nonNavigationTarget.entityId,
        }),
        missingTarget: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          targetId: "target-missing",
        }),
        draftTarget: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          targetId: draftTarget.candidateId,
        }),
        rejectedTarget: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          targetId: rejectedTarget.candidateId,
        }),
        crossProgramTarget: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          targetId: crossProgramTarget.entityId,
        }),
        unsupportedEvidenceOwnerKind: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          evidenceOwnerKind: "quick_check_candidate",
        }),
        missingEvidenceOwner: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          evidenceOwnerEntityId: "evidence-owner-missing",
        }),
        draftEvidenceOwner: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          evidenceOwnerEntityId: draftQuickCheck.candidateId,
        }),
        rejectedEvidenceOwner: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          evidenceOwnerEntityId: rejectedQuickCheck.candidateId,
        }),
        crossProgramEvidenceOwner: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          evidenceOwnerEntityId: crossProgramQuickCheck.entityId,
        }),
        acceptedOpenAnswerOwner: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          evidenceOwnerKind: "accepted_open_answer_check",
          evidenceOwnerEntityId: openAnswerCheck.entityId,
        }).status,
        acceptedCriterionOwner: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          evidenceOwnerKind: "accepted_assessment_criterion",
          evidenceOwnerEntityId: acceptedCriterion.entityId,
        }).status,
        acceptedConceptTarget: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          targetKind: "concept",
          targetId: conceptTarget.entityId,
        }).status,
        acceptedMaterialTarget: commands.createLearnerEvidenceTargetLink({
          ...baseInput,
          targetKind: "material_reference",
          targetId: materialTarget.entityId,
        }).status,
      },
      {
        unsupportedTargetKind: { status: "rejected", reason: "learner_state_target_not_found" },
        nonNavigationTarget: { status: "rejected", reason: "learner_state_target_not_found" },
        missingTarget: { status: "rejected", reason: "learner_state_target_not_found" },
        draftTarget: { status: "rejected", reason: "learner_state_target_not_found" },
        rejectedTarget: { status: "rejected", reason: "learner_state_target_not_found" },
        crossProgramTarget: { status: "rejected", reason: "learner_state_target_program_mismatch" },
        unsupportedEvidenceOwnerKind: {
          status: "rejected",
          reason: "learner_state_evidence_owner_not_found",
        },
        missingEvidenceOwner: { status: "rejected", reason: "learner_state_evidence_owner_not_found" },
        draftEvidenceOwner: { status: "rejected", reason: "learner_state_evidence_owner_not_found" },
        rejectedEvidenceOwner: { status: "rejected", reason: "learner_state_evidence_owner_not_found" },
        crossProgramEvidenceOwner: {
          status: "rejected",
          reason: "learner_state_evidence_owner_program_mismatch",
        },
        acceptedOpenAnswerOwner: "accepted",
        acceptedCriterionOwner: "accepted",
        acceptedConceptTarget: "accepted",
        acceptedMaterialTarget: "accepted",
      },
    );
  } finally {
    database.close();
  }
});

test("readinessCheckCuration_shouldCreateListAcceptReplaceAndRejectCandidatesForProgramCurator", async () => {
  const { commands, database } = await makeSUT({ ids: generatedIds("readiness-curation", 120) });

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const source = commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      sourceKind: "article",
      title: "Readiness source",
    }).value.programSource;
    const topic = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Readiness topic",
    });
    const concept = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "concept",
      title: "Readiness concept",
    });
    const beforeStudentWorkspace = snapshotReadinessStudentWorkspace(database);
    const created = commands.createReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: " Topic readiness ",
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
      sourceIds: [source.sourceId],
      rationale: " Curator rationale ",
    });
    const acceptedReadiness = commands.acceptReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: created.value.readinessCheckCandidate.candidateId,
    });
    const replacement = commands.createReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: " Period readiness ",
      scope: {
        scopeKind: "period",
        title: "Period 1",
        topicEntityIds: [topic.entityId],
      },
      requirements: [
        {
          targetKind: "topic",
          targetId: topic.entityId,
          requiredLevel: "developing",
        },
      ],
    });
    const replacementAcceptance = commands.acceptReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: replacement.value.readinessCheckCandidate.candidateId,
      targetEntityId: acceptedReadiness.value.acceptedReadinessCheck.entityId,
    });
    const rejected = commands.createReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Rejected readiness",
      scope: { scopeKind: "topic", topicEntityId: topic.entityId },
      requirements: [
        {
          targetKind: "topic",
          targetId: topic.entityId,
          requiredLevel: "developing",
        },
      ],
    });
    const rejection = commands.rejectReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: rejected.value.readinessCheckCandidate.candidateId,
    });

    assert.deepEqual(
      {
        created: readinessCheckCandidateProjection(created.value.readinessCheckCandidate),
        draftList: commands.listReadinessCheckCandidates?.({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          status: "draft",
        }).value.readinessCheckCandidates.map(readinessCheckCandidateProjection),
        accepted: readinessCurationProjection(acceptedReadiness.value.acceptedReadinessCheck),
        curationRead: readinessCurationProjection(commands.getAcceptedReadinessCheckRevisionForCuration?.({
          actingIdentityId: "identity-curator",
          revisionId: acceptedReadiness.value.acceptedReadinessCheck.revisionId,
        }).value.acceptedReadinessCheck),
        replacement: readinessCurationProjection(replacementAcceptance.value.acceptedReadinessCheck),
        rejectedStatus: rejection.value.readinessCheckCandidate.status,
        candidateStatuses: listReadinessCheckCandidateRecords(database, { programId: "program-a" })
          .map($0 => [$0.title, $0.status]),
        currentRevisionId: listAcceptedReadinessCheckEntityRecords(database, {
          programId: "program-a",
        })[0].currentRevisionId,
        studentWorkspaceBefore: beforeStudentWorkspace,
        studentWorkspaceAfter: snapshotReadinessStudentWorkspace(database),
      },
      {
        created: {
          programId: "program-a",
          title: "Topic readiness",
          scopeKind: "topic",
          requirementTargets: [
            ["topic", topic.entityId, "on_track"],
            ["concept", concept.entityId, "developing"],
          ],
          sourceIds: [source.sourceId],
          rationale: "Curator rationale",
          status: "draft",
          createdByIdentityId: "identity-curator",
        },
        draftList: [],
        accepted: {
          entityId: acceptedReadiness.value.acceptedReadinessCheck.entityId,
          programId: "program-a",
          title: "Topic readiness",
          scopeKind: "topic",
          requirementTargets: [
            ["topic", topic.entityId, "on_track"],
            ["concept", concept.entityId, "developing"],
          ],
          sourceIds: [source.sourceId],
          rationale: "Curator rationale",
          acceptedFromCandidateId: created.value.readinessCheckCandidate.candidateId,
          acceptedByIdentityId: "identity-curator",
        },
        curationRead: {
          entityId: acceptedReadiness.value.acceptedReadinessCheck.entityId,
          programId: "program-a",
          title: "Topic readiness",
          scopeKind: "topic",
          requirementTargets: [
            ["topic", topic.entityId, "on_track"],
            ["concept", concept.entityId, "developing"],
          ],
          sourceIds: [source.sourceId],
          rationale: "Curator rationale",
          acceptedFromCandidateId: created.value.readinessCheckCandidate.candidateId,
          acceptedByIdentityId: "identity-curator",
        },
        replacement: {
          entityId: acceptedReadiness.value.acceptedReadinessCheck.entityId,
          programId: "program-a",
          title: "Period readiness",
          scopeKind: "period",
          requirementTargets: [["topic", topic.entityId, "developing"]],
          sourceIds: [],
          acceptedFromCandidateId: replacement.value.readinessCheckCandidate.candidateId,
          acceptedByIdentityId: "identity-curator",
        },
        rejectedStatus: "rejected",
        candidateStatuses: [
          ["Topic readiness", "accepted"],
          ["Period readiness", "accepted"],
          ["Rejected readiness", "rejected"],
        ],
        currentRevisionId: replacementAcceptance.value.acceptedReadinessCheck.revisionId,
        studentWorkspaceBefore: beforeStudentWorkspace,
        studentWorkspaceAfter: beforeStudentWorkspace,
      },
    );
  } finally {
    database.close();
  }
});

test("setAcceptedReadinessCheckLifecycleStatus_shouldWithdrawAndReactivateEntity_withoutLosingHistoricalRevision_status", async () => {
  const { commands, database } = await makeSUT({ ids: generatedIds("readiness-lifecycle", 120) });

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    const topic = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Readiness lifecycle topic",
    });
    const readinessCandidate = commands.createReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Lifecycle readiness",
      scope: { scopeKind: "topic", topicEntityId: topic.entityId },
      requirements: [
        {
          targetKind: "topic",
          targetId: topic.entityId,
          requiredLevel: "developing",
        },
      ],
    }).value.readinessCheckCandidate;
    const readiness = commands.acceptReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: readinessCandidate.candidateId,
    }).value.acceptedReadinessCheck;

    const withdrawn = commands.setAcceptedReadinessCheckLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: readiness.entityId,
      status: "withdrawn",
    });
    const listAfterWithdraw = commands.listAcceptedReadinessChecksForCuration?.({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    }).value.acceptedReadinessChecks.map($0 => $0.entityId);
    const historicalRead = commands.getAcceptedReadinessCheckRevisionForCuration?.({
      actingIdentityId: "identity-curator",
      revisionId: readiness.revisionId,
    }).value.acceptedReadinessCheck;
    const reactivated = commands.setAcceptedReadinessCheckLifecycleStatus({
      actingIdentityId: "identity-curator",
      entityId: readiness.entityId,
      status: "active",
    });

    assert.deepEqual(
      {
        withdrawn,
        listAfterWithdraw,
        historicalRead,
        reactivated,
        listAfterReactivate: commands
          .listAcceptedReadinessChecksForCuration?.({
            actingIdentityId: "identity-curator",
            programId: "program-a",
          })
          .value.acceptedReadinessChecks.map($0 => $0.entityId),
        storedEntity: listAcceptedReadinessCheckEntityRecords(database, {
          programId: "program-a",
        }).map($0 => [$0.id, $0.currentRevisionId]),
      },
      {
        withdrawn: {
          status: "accepted",
          value: {
            entity: {
              id: readiness.entityId,
              status: "withdrawn",
              updatedByIdentityId: "identity-curator",
              updatedAt: "2026-05-28T11:00:00.006Z",
            },
          },
        },
        listAfterWithdraw: [],
        historicalRead: readiness,
        reactivated: {
          status: "accepted",
          value: {
            entity: {
              id: readiness.entityId,
              status: "active",
              updatedByIdentityId: "identity-curator",
              updatedAt: "2026-05-28T11:00:00.007Z",
            },
          },
        },
        listAfterReactivate: [readiness.entityId],
        storedEntity: [[readiness.entityId, readiness.revisionId]],
      },
    );
  } finally {
    database.close();
  }
});

test("readinessCheckCuration_shouldRequireActiveProgramCuratorForCommands", async () => {
  const { commands, database } = await makeSUT({ ids: generatedIds("readiness-auth", 80) });

  try {
    createIdentity(database, makeIdentity({ id: "identity-student" }));
    createIdentity(database, makeIdentity({ id: "identity-admin" }));
    createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
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
    const topic = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Authorization topic",
    });
    const validInput = {
      programId: "program-a",
      title: "Readiness",
      scope: { scopeKind: "topic", topicEntityId: topic.entityId },
      requirements: [
        {
          targetKind: "topic",
          targetId: topic.entityId,
          requiredLevel: "developing",
        },
      ],
    };
    const candidate = commands.createReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      ...validInput,
    }).value.readinessCheckCandidate;
    const acceptedRevision = commands.acceptReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: candidate.candidateId,
    }).value.acceptedReadinessCheck;

    assert.deepEqual(
      {
        createStudent: commands.createReadinessCheckCandidate?.({
          actingIdentityId: "identity-student",
          ...validInput,
        }),
        createAdmin: commands.createReadinessCheckCandidate?.({
          actingIdentityId: "identity-admin",
          ...validInput,
        }),
        createDisabled: commands.createReadinessCheckCandidate?.({
          actingIdentityId: "identity-disabled",
          ...validInput,
        }),
        createMissingProgram: commands.createReadinessCheckCandidate?.({
          actingIdentityId: "identity-curator",
          ...validInput,
          programId: "program-missing",
        }),
        listStudent: commands.listReadinessCheckCandidates?.({
          actingIdentityId: "identity-student",
          programId: "program-a",
        }),
        acceptStudent: commands.acceptReadinessCheckCandidate?.({
          actingIdentityId: "identity-student",
          candidateId: candidate.candidateId,
        }),
        rejectAdmin: commands.rejectReadinessCheckCandidate?.({
          actingIdentityId: "identity-admin",
          candidateId: candidate.candidateId,
        }),
        readAdmin: commands.getAcceptedReadinessCheckRevisionForCuration?.({
          actingIdentityId: "identity-admin",
          revisionId: "readiness-revision-missing",
        }),
        readExistingAdmin: commands.getAcceptedReadinessCheckRevisionForCuration?.({
          actingIdentityId: "identity-admin",
          revisionId: acceptedRevision.revisionId,
        }),
      },
      {
        createStudent: { status: "rejected", reason: "admin_or_curator_required" },
        createAdmin: { status: "rejected", reason: "admin_or_curator_required" },
        createDisabled: { status: "rejected", reason: "identity_disabled" },
        createMissingProgram: { status: "rejected", reason: "program_not_found" },
        listStudent: { status: "rejected", reason: "admin_or_curator_required" },
        acceptStudent: { status: "rejected", reason: "admin_or_curator_required" },
        rejectAdmin: { status: "rejected", reason: "admin_or_curator_required" },
        readAdmin: { status: "rejected", reason: "readiness_revision_not_found" },
        readExistingAdmin: { status: "rejected", reason: "admin_or_curator_required" },
      },
    );
  } finally {
    database.close();
  }
});

test("readinessCheckCuration_shouldRejectInvalidScopesRequirementsAndTransitions", async () => {
  const { commands, database } = await makeSUT({ ids: generatedIds("readiness-validation", 180) });

  try {
    seedCuratorProgram(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });
    const topic = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "topic",
      title: "Valid topic",
    });
    const concept = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "concept",
      title: "Valid concept",
    });
    const material = createAcceptedNavigationTarget(commands, {
      programId: "program-a",
      candidateKind: "material_reference",
      title: "Valid material",
    });
    const crossProgramTopic = createAcceptedNavigationTarget(commands, {
      programId: "program-b",
      candidateKind: "topic",
      title: "Other topic",
    });
    const crossProgramSource = commands.recordProgramSource({
      actingIdentityId: "identity-curator",
      programId: "program-b",
      sourceKind: "article",
      title: "Other readiness source",
    }).value.programSource;
    const draftTopic = commands.createNavigationCandidate({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      candidateKind: "topic",
      title: "Draft topic",
    }).value.navigationCandidate;
    const quickCheck = createAcceptedQuickCheckOwner(commands, { programId: "program-a" });
    const criterion = createAcceptedAssessmentCriterionOwner(commands, { programId: "program-a" });
    const openAnswer = createAcceptedOpenAnswerOwner(commands, {
      programId: "program-a",
      criterionEntityIds: [criterion.entityId],
    });
    const crossProgramQuickCheck = createAcceptedQuickCheckOwner(commands, { programId: "program-b" });
    const crossProgramReadiness = commands.acceptReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: commands.createReadinessCheckCandidate?.({
        actingIdentityId: "identity-curator",
        programId: "program-b",
        title: "Other readiness",
        scope: { scopeKind: "topic", topicEntityId: crossProgramTopic.entityId },
        requirements: [
          {
            targetKind: "topic",
            targetId: crossProgramTopic.entityId,
            requiredLevel: "developing",
          },
        ],
      }).value.readinessCheckCandidate.candidateId,
    }).value.acceptedReadinessCheck;
    const acceptedCandidate = commands.createReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Accepted readiness",
      scope: { scopeKind: "topic", topicEntityId: topic.entityId },
      requirements: [
        {
          targetKind: "topic",
          targetId: topic.entityId,
          requiredLevel: "developing",
        },
      ],
    }).value.readinessCheckCandidate;
    commands.acceptReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: acceptedCandidate.candidateId,
    });
    const rejectedCandidate = commands.createReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      programId: "program-a",
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
    commands.rejectReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      candidateId: rejectedCandidate.candidateId,
    });
    const replacementTargetCandidate = commands.createReadinessCheckCandidate?.({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Replacement target readiness",
      scope: { scopeKind: "topic", topicEntityId: topic.entityId },
      requirements: [
        {
          targetKind: "topic",
          targetId: topic.entityId,
          requiredLevel: "developing",
        },
      ],
    }).value.readinessCheckCandidate;
    const validBase = {
      actingIdentityId: "identity-curator",
      programId: "program-a",
      title: "Readiness",
      scope: { scopeKind: "topic", topicEntityId: topic.entityId },
      requirements: [
        {
          targetKind: "topic",
          targetId: topic.entityId,
          requiredLevel: "developing",
        },
      ],
    };

    assert.deepEqual(
      {
        blankTitle: commands.createReadinessCheckCandidate?.({
          ...validBase,
          title: " ",
        }),
        missingScope: commands.createReadinessCheckCandidate?.({
          ...validBase,
          scope: { scopeKind: "topic", topicEntityId: "topic-missing" },
        }),
        crossProgramScope: commands.createReadinessCheckCandidate?.({
          ...validBase,
          scope: { scopeKind: "topic", topicEntityId: crossProgramTopic.entityId },
        }),
        draftScope: commands.createReadinessCheckCandidate?.({
          ...validBase,
          scope: { scopeKind: "topic", topicEntityId: draftTopic.candidateId },
        }),
        emptyPeriodTitle: commands.createReadinessCheckCandidate?.({
          ...validBase,
          scope: { scopeKind: "period", title: " ", topicEntityIds: [topic.entityId] },
        }),
        emptyPeriodTopics: commands.createReadinessCheckCandidate?.({
          ...validBase,
          scope: { scopeKind: "period", title: "Period", topicEntityIds: [] },
        }),
        emptyRequirements: commands.createReadinessCheckCandidate?.({
          ...validBase,
          requirements: [],
        }),
        missingSource: commands.createReadinessCheckCandidate?.({
          ...validBase,
          sourceIds: ["source-missing"],
        }),
        crossProgramSource: commands.createReadinessCheckCandidate?.({
          ...validBase,
          sourceIds: [crossProgramSource.sourceId],
        }),
        duplicateRequirements: commands.createReadinessCheckCandidate?.({
          ...validBase,
          requirements: [
            {
              targetKind: "topic",
              targetId: topic.entityId,
              requiredLevel: "developing",
            },
            {
              targetKind: "topic",
              targetId: topic.entityId,
              requiredLevel: "on_track",
            },
          ],
        }),
        unsupportedRequirementTarget: commands.createReadinessCheckCandidate?.({
          ...validBase,
          requirements: [
            {
              targetKind: "definition",
              targetId: topic.entityId,
              requiredLevel: "developing",
            },
          ],
        }),
        crossProgramRequirement: commands.createReadinessCheckCandidate?.({
          ...validBase,
          requirements: [
            {
              targetKind: "quick_check",
              targetId: crossProgramQuickCheck.entityId,
              requiredLevel: "developing",
            },
          ],
        }),
        validEvidenceOwners: commands.createReadinessCheckCandidate?.({
          ...validBase,
          requirements: [
            {
              targetKind: "concept",
              targetId: concept.entityId,
              requiredLevel: "developing",
            },
            {
              targetKind: "material_reference",
              targetId: material.entityId,
              requiredLevel: "developing",
            },
            {
              targetKind: "quick_check",
              targetId: quickCheck.entityId,
              requiredLevel: "on_track",
            },
            {
              targetKind: "open_answer_check",
              targetId: openAnswer.entityId,
              requiredLevel: "developing",
            },
            {
              targetKind: "assessment_criterion",
              targetId: criterion.entityId,
              requiredLevel: "developing",
            },
          ],
        }).status,
        acceptMissing: commands.acceptReadinessCheckCandidate?.({
          actingIdentityId: "identity-curator",
          candidateId: "readiness-missing",
        }),
        acceptAlreadyAccepted: commands.acceptReadinessCheckCandidate?.({
          actingIdentityId: "identity-curator",
          candidateId: acceptedCandidate.candidateId,
        }),
        acceptMissingReplacementTarget: commands.acceptReadinessCheckCandidate?.({
          actingIdentityId: "identity-curator",
          candidateId: replacementTargetCandidate.candidateId,
          targetEntityId: "readiness-entity-missing",
        }),
        acceptCrossProgramReplacementTarget: commands.acceptReadinessCheckCandidate?.({
          actingIdentityId: "identity-curator",
          candidateId: replacementTargetCandidate.candidateId,
          targetEntityId: crossProgramReadiness.entityId,
        }),
        rejectAlreadyRejected: commands.rejectReadinessCheckCandidate?.({
          actingIdentityId: "identity-curator",
          candidateId: rejectedCandidate.candidateId,
        }),
      },
      {
        blankTitle: { status: "rejected", reason: "validation_failed" },
        missingScope: { status: "rejected", reason: "readiness_scope_not_found" },
        crossProgramScope: { status: "rejected", reason: "readiness_scope_program_mismatch" },
        draftScope: { status: "rejected", reason: "readiness_scope_not_found" },
        emptyPeriodTitle: { status: "rejected", reason: "validation_failed" },
        emptyPeriodTopics: { status: "rejected", reason: "validation_failed" },
        emptyRequirements: { status: "rejected", reason: "validation_failed" },
        missingSource: { status: "rejected", reason: "source_not_found" },
        crossProgramSource: { status: "rejected", reason: "source_program_mismatch" },
        duplicateRequirements: { status: "rejected", reason: "readiness_requirement_id_conflict" },
        unsupportedRequirementTarget: { status: "rejected", reason: "readiness_requirement_target_not_found" },
        crossProgramRequirement: {
          status: "rejected",
          reason: "readiness_requirement_program_mismatch",
        },
        validEvidenceOwners: "accepted",
        acceptMissing: { status: "rejected", reason: "readiness_candidate_not_found" },
        acceptAlreadyAccepted: { status: "rejected", reason: "readiness_candidate_already_accepted" },
        acceptMissingReplacementTarget: { status: "rejected", reason: "readiness_entity_not_found" },
        acceptCrossProgramReplacementTarget: {
          status: "rejected",
          reason: "readiness_entity_program_mismatch",
        },
        rejectAlreadyRejected: { status: "rejected", reason: "readiness_candidate_already_rejected" },
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

function generatedIds(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);
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

function isNonEmptyTestText(value) {
  return typeof value === "string" && value.length > 0;
}

function learnerEvidenceTargetLinkProjection(link) {
  return {
    programId: link.programId,
    targetKind: link.targetKind,
    targetId: link.targetId,
    evidenceOwnerKind: link.evidenceOwnerKind,
    evidenceOwnerEntityId: link.evidenceOwnerEntityId,
    status: link.status,
    createdByIdentityId: link.createdByIdentityId,
  };
}

function readinessCheckCandidateProjection(candidate) {
  return {
    programId: candidate.programId,
    title: candidate.title,
    scopeKind: candidate.scope.scopeKind,
    requirementTargets: candidate.requirements.map($0 => [
      $0.targetKind,
      $0.targetId,
      $0.requiredLevel,
    ]),
    sourceIds: candidate.sourceIds,
    ...(candidate.rationale !== undefined ? { rationale: candidate.rationale } : {}),
    status: candidate.status,
    createdByIdentityId: candidate.createdByIdentityId,
  };
}

function readinessCurationProjection(readinessCheck) {
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
    sourceIds: readinessCheck.sourceIds,
    ...(readinessCheck.rationale !== undefined ? { rationale: readinessCheck.rationale } : {}),
    acceptedFromCandidateId: readinessCheck.acceptedFromCandidateId,
    acceptedByIdentityId: readinessCheck.acceptedByIdentityId,
  };
}

function snapshotReadinessStudentWorkspace(database) {
  return {
    openAnswerAttemptCount: countRows(database, "open_answer_attempts"),
    openAnswerEvaluationCount: countRows(database, "open_answer_evaluations"),
    openAnswerEvaluatorRunCount: countRows(database, "open_answer_evaluator_runs"),
    quickCheckAttemptCount: countRows(database, "quick_check_attempts"),
    readinessCheckAttemptCount: listReadinessCheckAttemptRecords(database).length,
    sessionCount: countRows(database, "sessions"),
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

function createAcceptedNavigationTarget(
  commands,
  {
    programId,
    candidateKind,
    title,
    body = `${title} body`,
  },
) {
  const candidate = commands.createNavigationCandidate({
    actingIdentityId: "identity-curator",
    programId,
    candidateKind,
    title,
    body,
    ...(candidateKind === "material_reference"
      ? {
          materialReferenceKind: "article",
          locator: `https://example.test/${title.toLowerCase().replaceAll(" ", "-")}`,
        }
      : {}),
  });
  const acceptedCandidate = commands.acceptNavigationCandidate({
    actingIdentityId: "identity-curator",
    candidateId: candidate.value.navigationCandidate.candidateId,
  });
  return acceptedCandidate.value.navigationChange.acceptedCorpus;
}

function createAcceptedQuickCheckOwner(commands, { programId }) {
  const candidate = commands.createQuickCheckCandidate({
    actingIdentityId: "identity-curator",
    programId,
    checkKind: "single_select_quick_check",
    title: `Quick check ${programId}`,
    prompt: `Prompt ${programId}`,
    options: ["A", "B"],
    answerKeyIndex: 0,
  });
  const acceptedCandidate = commands.acceptQuickCheckCandidate({
    actingIdentityId: "identity-curator",
    candidateId: candidate.value.quickCheckCandidate.candidateId,
  });
  return acceptedCandidate.value.acceptedQuickCheck;
}

function createAcceptedAssessmentCriterionOwner(commands, { programId }) {
  const candidate = commands.createAssessmentCriterionCandidate({
    actingIdentityId: "identity-curator",
    programId,
    title: `Criterion ${programId}`,
    body: `Criterion body ${programId}`,
  });
  const acceptedCandidate = commands.acceptAssessmentCriterionCandidate({
    actingIdentityId: "identity-curator",
    candidateId: candidate.value.assessmentCriterionCandidate.candidateId,
  });
  return acceptedCandidate.value.acceptedAssessmentCriterion;
}

function createAcceptedOpenAnswerOwner(commands, { programId, criterionEntityIds }) {
  const candidate = commands.createOpenAnswerCheckCandidate({
    actingIdentityId: "identity-curator",
    programId,
    checkKind: "open_answer",
    title: `Open answer ${programId}`,
    prompt: `Open answer prompt ${programId}`,
    criterionEntityIds,
  });
  const acceptedCandidate = commands.acceptOpenAnswerCheckCandidate({
    actingIdentityId: "identity-curator",
    candidateId: candidate.value.openAnswerCheckCandidate.candidateId,
  });
  return acceptedCandidate.value.acceptedOpenAnswerCheck;
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

function snapshotLearnerEvidenceStudentWorkspace(database) {
  return {
    openAnswerAttemptCount: countRows(database, "open_answer_attempts"),
    openAnswerEvaluationCount: countRows(database, "open_answer_evaluations"),
    openAnswerEvaluationFailureCount: countRows(database, "open_answer_evaluation_failures"),
    openAnswerEvaluatorEvidenceCount: countRows(database, "open_answer_evaluator_evidence"),
    openAnswerEvaluatorRunCount: countRows(database, "open_answer_evaluator_runs"),
    quickCheckAttemptCount: countRows(database, "quick_check_attempts"),
    sessionCount: countRows(database, "sessions"),
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

async function makeMaterialContentSUT() {
  const sut = await makeSUT();
  const { database } = sut;
  seedCuratorProgram(database, { programId: "program-a" });
  createIdentity(database, makeIdentity({ id: "identity-student" }));
  seedStudentMembership(database, {
    id: "membership-student",
    programId: "program-a",
    identityId: "identity-student",
  });
  createIdentity(database, makeIdentity({ id: "identity-outsider" }));
  createProgramSourceRecord(database, {
    id: "source-a",
    programId: "program-a",
    sourceKind: "lecture",
    title: "Source",
    recordedByIdentityId: "identity-curator",
    recordedAt: "2026-05-28T10:48:00.000Z",
  });
  for (const [candidateId, entityId, revisionId, kind] of [
    ["candidate-a", "entity-a", "revision-a", "material_reference"],
    ["topic-candidate-a", "topic-entity-a", "topic-revision-a", "topic"],
  ]) {
    createCorpusCandidateRecord(database, {
      id: candidateId,
      programId: "program-a",
      candidateKind: kind,
      title: "Material",
      materialReferenceKind: kind === "material_reference" ? "lecture" : null,
      locator: kind === "material_reference" ? "loc" : null,
      sourceIds: ["source-a"],
      status: "accepted",
      createdByIdentityId: "identity-curator",
      createdAt: "2026-05-28T10:48:00.000Z",
      updatedAt: "2026-05-28T10:48:00.000Z",
    });
    createAcceptedCorpusEntityRecord(database, {
      id: entityId,
      programId: "program-a",
      acceptedKind: kind,
      currentRevisionId: revisionId,
    });
    createAcceptedCorpusRevisionRecord(database, {
      id: revisionId,
      entityId,
      programId: "program-a",
      acceptedKind: kind,
      title: "Material",
      materialReferenceKind: kind === "material_reference" ? "lecture" : null,
      locator: kind === "material_reference" ? "loc" : null,
      acceptedFromCandidateId: candidateId,
      sourceIds: ["source-a"],
      acceptedByIdentityId: "identity-curator",
      acceptedAt: "2026-05-28T10:49:00.000Z",
    });
  }
  return sut;
}

test("setSourceContent_shouldStoreAndRedactedSummarize_onCuratorContent", async () => {
  const { commands, database } = await makeMaterialContentSUT();

  try {
    const result = commands.setSourceContent({
      actingIdentityId: "identity-curator",
      sourceId: "source-a",
      content: "# Source body",
      contentFormat: "markdown",
    });

    assert.equal(result.status, "accepted");
    assert.equal(result.value.sourceContent.content, undefined);
    assert.equal(result.value.sourceContent.byteSize, Buffer.byteLength("# Source body", "utf8"));
    assert.equal(getSourceContentRecord(database, "source-a").content, "# Source body");
  } finally {
    database.close();
  }
});

test("setSourceContent_shouldRejectNonCuratorAndInvalidContent_onSourceContent", async () => {
  const { commands, database } = await makeMaterialContentSUT();

  try {
    assert.deepEqual(
      commands.setSourceContent({
        actingIdentityId: "identity-student",
        sourceId: "source-a",
        content: "x",
        contentFormat: "markdown",
      }),
      { status: "rejected", reason: "admin_or_curator_required" },
    );
    assert.deepEqual(
      commands.setSourceContent({
        actingIdentityId: "identity-curator",
        sourceId: "source-a",
        content: "x",
        contentFormat: "html",
      }),
      { status: "rejected", reason: "validation_failed" },
    );
    assert.deepEqual(
      commands.setSourceContent({
        actingIdentityId: "identity-curator",
        sourceId: "source-a",
        content: "a".repeat(MAX_MATERIAL_CONTENT_BYTES + 1),
        contentFormat: "markdown",
      }),
      { status: "rejected", reason: "content_too_large" },
    );
    assert.deepEqual(commands.setSourceContent({ actingIdentityId: "identity-curator", sourceId: "missing", content: "x", contentFormat: "markdown" }), {
      status: "rejected",
      reason: "source_not_found",
    });
  } finally {
    database.close();
  }
});

test("readSourceContent_shouldBeCuratorOnlyAndReportMissing_onSourceContent", async () => {
  const { commands, database } = await makeMaterialContentSUT();

  try {
    assert.deepEqual(commands.readSourceContent({ actingIdentityId: "identity-curator", sourceId: "source-a" }), {
      status: "rejected",
      reason: "content_not_found",
    });
    commands.setSourceContent({ actingIdentityId: "identity-curator", sourceId: "source-a", content: "body", contentFormat: "markdown" });
    assert.equal(commands.readSourceContent({ actingIdentityId: "identity-curator", sourceId: "source-a" }).value.content, "body");
    assert.deepEqual(commands.readSourceContent({ actingIdentityId: "identity-student", sourceId: "source-a" }), {
      status: "rejected",
      reason: "admin_or_curator_required",
    });
  } finally {
    database.close();
  }
});

test("deleteSourceContent_shouldRemoveCuratorContent_onSourceContent", async () => {
  const { commands, database } = await makeMaterialContentSUT();

  try {
    commands.setSourceContent({ actingIdentityId: "identity-curator", sourceId: "source-a", content: "body", contentFormat: "markdown" });
    assert.deepEqual(commands.deleteSourceContent({ actingIdentityId: "identity-curator", sourceId: "source-a" }), {
      status: "accepted",
      value: { sourceId: "source-a" },
    });
    assert.equal(getSourceContentRecord(database, "source-a"), null);
  } finally {
    database.close();
  }
});

test("setAcceptedMaterialContent_shouldRejectNonMaterialAndDuplicate_onMaterialContent", async () => {
  const { commands, database } = await makeMaterialContentSUT();

  try {
    assert.deepEqual(
      commands.setAcceptedMaterialContent({ actingIdentityId: "identity-curator", revisionId: "topic-revision-a", content: "x", contentFormat: "markdown" }),
      { status: "rejected", reason: "validation_failed" },
    );

    const first = commands.setAcceptedMaterialContent({
      actingIdentityId: "identity-curator",
      revisionId: "revision-a",
      content: "# Accepted",
      contentFormat: "markdown",
      sourceContentProvenance: { sourceId: "source-a" },
    });
    assert.equal(first.status, "accepted");
    assert.deepEqual(getAcceptedMaterialContentRecord(database, "revision-a").sourceContentProvenance, { sourceId: "source-a" });

    assert.deepEqual(
      commands.setAcceptedMaterialContent({ actingIdentityId: "identity-curator", revisionId: "revision-a", content: "# Other", contentFormat: "markdown" }),
      { status: "rejected", reason: "material_content_already_set" },
    );
  } finally {
    database.close();
  }
});

test("deleteAcceptedMaterialContent_shouldHardDeleteUnevidencedAndWithdrawEvidencedMaterial", async () => {
  const unevidenced = await makeMaterialContentSUT();
  const evidenced = await makeMaterialContentSUT();
  const blocked = await makeMaterialContentSUT();

  try {
    setAcceptedMaterialContentRecord(unevidenced.database, {
      revisionId: "revision-a",
      content: "# Unevidenced body",
      contentFormat: "markdown",
    });
    setAcceptedMaterialContentRecord(evidenced.database, {
      revisionId: "revision-a",
      content: "# Evidenced body",
      contentFormat: "markdown",
    });
    const quickCheck = createAcceptedQuickCheckOwner(evidenced.commands, { programId: "program-a" });
    evidenced.commands.createLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      targetKind: "material_reference",
      targetId: "entity-a",
      evidenceOwnerKind: "accepted_quick_check",
      evidenceOwnerEntityId: quickCheck.entityId,
    });
    setAcceptedMaterialContentRecord(blocked.database, {
      revisionId: "revision-a",
      content: "# Blocked body",
      contentFormat: "markdown",
    });
    const blockedQuickCheck = createAcceptedQuickCheckOwner(blocked.commands, { programId: "program-a" });
    blocked.commands.createLearnerEvidenceTargetLink({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      targetKind: "material_reference",
      targetId: "entity-a",
      evidenceOwnerKind: "accepted_quick_check",
      evidenceOwnerEntityId: blockedQuickCheck.entityId,
    });
    acceptNavigationCandidate(blocked.commands, {
      programId: "program-a",
      candidateKind: "relationship_update",
      title: "Topic uses material",
      body: "Topic uses material",
      relationshipDrafts: [
        {
          relationshipKind: "topic_uses_material",
          fromEntityId: "topic-entity-a",
          toEntityId: "entity-a",
        },
      ],
    });

    const hardDeleted = unevidenced.commands.deleteAcceptedMaterialContent({
      actingIdentityId: "identity-curator",
      revisionId: "revision-a",
    });
    const withdrawn = evidenced.commands.deleteAcceptedMaterialContent({
      actingIdentityId: "identity-curator",
      revisionId: "revision-a",
    });
    const blockedDelete = blocked.commands.deleteAcceptedMaterialContent({
      actingIdentityId: "identity-curator",
      revisionId: "revision-a",
    });

    assert.deepEqual(
      {
        hardDeleted,
        unevidencedContent: getAcceptedMaterialContentRecord(unevidenced.database, "revision-a"),
        withdrawn,
        evidencedRead: evidenced.commands.readMaterialRevisionContent({
          actingIdentityId: "identity-student",
          revisionId: "revision-a",
        }),
        withdrawnEntityIds: listAcceptedCorpusEntityRecords(evidenced.database, {
          programId: "program-a",
          status: "withdrawn",
        }).map($0 => $0.id),
        blockedDelete,
        blockedRead: blocked.commands.readMaterialRevisionContent({
          actingIdentityId: "identity-student",
          revisionId: "revision-a",
        }),
        blockedActiveEntityIds: listAcceptedCorpusEntityRecords(blocked.database, {
          programId: "program-a",
          status: "active",
        }).map($0 => $0.id),
      },
      {
        hardDeleted: {
          status: "accepted",
          value: {
            materialContent: {
              revisionId: "revision-a",
              deletionMode: "hard_deleted",
            },
          },
        },
        unevidencedContent: null,
        withdrawn: {
          status: "accepted",
          value: {
            materialContent: {
              revisionId: "revision-a",
              deletionMode: "withdrawn",
              entityId: "entity-a",
              status: "withdrawn",
              updatedByIdentityId: "identity-curator",
              updatedAt: "2026-05-28T11:00:00.003Z",
            },
          },
        },
        evidencedRead: {
          status: "accepted",
          value: {
            content: "# Evidenced body",
            contentFormat: "markdown",
            byteSize: 16,
          },
        },
        withdrawnEntityIds: ["entity-a"],
        blockedDelete: {
          status: "rejected",
          reason: "entity_withdrawal_blocked",
        },
        blockedRead: {
          status: "accepted",
          value: {
            content: "# Blocked body",
            contentFormat: "markdown",
            byteSize: 14,
          },
        },
        blockedActiveEntityIds: ["entity-a", "topic-entity-a"],
      },
    );
  } finally {
    unevidenced.database.close();
    evidenced.database.close();
    blocked.database.close();
  }
});

test("readMaterialContent_shouldServeStudentAndCuratorButNotOutsider_onMaterialContent", async () => {
  const { commands, database } = await makeMaterialContentSUT();

  try {
    setAcceptedMaterialContentRecord(database, { revisionId: "revision-a", content: "# Accepted body", contentFormat: "markdown" });

    assert.equal(commands.readMaterialContent({ actingIdentityId: "identity-student", entityId: "entity-a" }).value.content, "# Accepted body");
    assert.equal(commands.readMaterialContent({ actingIdentityId: "identity-curator", entityId: "entity-a" }).value.content, "# Accepted body");
    assert.deepEqual(commands.readMaterialContent({ actingIdentityId: "identity-outsider", entityId: "entity-a" }), {
      status: "rejected",
      reason: "participation_required",
    });
    assert.equal(
      commands.readMaterialRevisionContent({ actingIdentityId: "identity-student", revisionId: "revision-a" }).value.content,
      "# Accepted body",
    );
  } finally {
    database.close();
  }
});

test("readMaterialContent_shouldPaginateByCharacterCursor_onMaterialContent", async () => {
  const { commands, database } = await makeMaterialContentSUT();

  try {
    setAcceptedMaterialContentRecord(database, { revisionId: "revision-a", content: "abcdef", contentFormat: "markdown" });

    const firstPage = commands.readMaterialContent({ actingIdentityId: "identity-student", entityId: "entity-a", limit: 4 });
    assert.deepEqual(firstPage, {
      status: "accepted",
      value: { content: "abcd", contentFormat: "markdown", byteSize: 6, nextCursor: "4" },
    });

    const secondPage = commands.readMaterialContent({ actingIdentityId: "identity-student", entityId: "entity-a", limit: 4, cursor: "4" });
    assert.deepEqual(secondPage, {
      status: "accepted",
      value: { content: "ef", contentFormat: "markdown", byteSize: 6 },
    });

    assert.deepEqual(
      commands.readMaterialContent({ actingIdentityId: "identity-student", entityId: "entity-a", limit: 4, cursor: "99" }),
      { status: "rejected", reason: "validation_failed" },
    );
  } finally {
    database.close();
  }
});

test("getNavigationEntity_shouldCarryHasContentSignalForMaterialsOnly_onMaterialContent", async () => {
  const { commands, database } = await makeMaterialContentSUT();

  try {
    const before = commands.getNavigationEntity({ actingIdentityId: "identity-student", entityId: "entity-a" });
    assert.equal(before.value.navigationNode.hasContent, false);
    assert.equal(before.value.navigationNode.contentBytes, undefined);

    setAcceptedMaterialContentRecord(database, { revisionId: "revision-a", content: "# Body", contentFormat: "markdown" });
    const after = commands.getNavigationEntity({ actingIdentityId: "identity-student", entityId: "entity-a" });
    assert.equal(after.value.navigationNode.hasContent, true);
    assert.equal(after.value.navigationNode.contentBytes, Buffer.byteLength("# Body", "utf8"));
    assert.equal(after.value.navigationNode.contentFormat, "markdown");
    assert.equal(after.value.navigationNode.content, undefined);

    const topic = commands.getNavigationEntity({ actingIdentityId: "identity-student", entityId: "topic-entity-a" });
    assert.equal("hasContent" in topic.value.navigationNode, false);
  } finally {
    database.close();
  }
});

test("listProgramNavigation_shouldCarryHasContentSignalForUngroupedMaterials_onMaterialContent", async () => {
  const { commands, database } = await makeMaterialContentSUT();

  try {
    setAcceptedMaterialContentRecord(database, { revisionId: "revision-a", content: "# Body", contentFormat: "markdown" });

    assert.deepEqual(
      commands.listProgramNavigation({ actingIdentityId: "identity-student", programId: "program-a" }).value.navigation.ungroupedMaterials,
      [
        {
          entityId: "entity-a",
          revisionId: "revision-a",
          acceptedKind: "material_reference",
          title: "Material",
          hasContent: true,
          contentBytes: Buffer.byteLength("# Body", "utf8"),
          contentFormat: "markdown",
        },
      ],
    );
  } finally {
    database.close();
  }
});

test("readMaterialContent_shouldNotMutateProgramOrStudentState_onMaterialContent", async () => {
  const { commands, database } = await makeMaterialContentSUT();

  try {
    setAcceptedMaterialContentRecord(database, { revisionId: "revision-a", content: "body", contentFormat: "markdown" });
    commands.setSourceContent({ actingIdentityId: "identity-curator", sourceId: "source-a", content: "src", contentFormat: "markdown" });
    const before = snapshotMaterialContentReadBoundary(database);

    commands.readMaterialContent({ actingIdentityId: "identity-student", entityId: "entity-a" });
    commands.readMaterialRevisionContent({ actingIdentityId: "identity-student", revisionId: "revision-a" });
    commands.readSourceContent({ actingIdentityId: "identity-curator", sourceId: "source-a" });

    assert.deepEqual(snapshotMaterialContentReadBoundary(database), before);
  } finally {
    database.close();
  }
});

function snapshotMaterialContentReadBoundary(database) {
  return {
    corpusEventCount: listCorpusEventRecords(database, { programId: "program-a" }).length,
    learnerEvidenceTargetLinkCount: countRows(database, "learner_evidence_target_links"),
    openAnswerAttemptCount: countRows(database, "open_answer_attempts"),
    openAnswerEvaluationCount: countRows(database, "open_answer_evaluations"),
    openAnswerEvaluationFailureCount: countRows(database, "open_answer_evaluation_failures"),
    openAnswerEvaluatorEvidenceCount: countRows(database, "open_answer_evaluator_evidence"),
    openAnswerEvaluatorRunCount: countRows(database, "open_answer_evaluator_runs"),
    quickCheckAttemptCount: countRows(database, "quick_check_attempts"),
    readinessCheckAttemptCount: countRows(database, "readiness_check_attempts"),
    sessionCount: countRows(database, "sessions"),
  };
}
