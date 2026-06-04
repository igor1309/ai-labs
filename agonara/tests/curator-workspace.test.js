import assert from "node:assert/strict";
import test from "node:test";
import { createCorpusCommands } from "../src/corpus.js";
import { createCuratorWorkspaceCommands } from "../src/curator-workspace.js";
import { createProgramCommands } from "../src/program.js";
import {
  createIdentity,
  createLocalPasswordCredential,
  createProgramMembershipRecord,
  createProgramShellRecord,
  createQuickCheckAttemptRecord,
  createSession,
  grantAdminAuthority,
  initializeIdentityStorage,
  listAcceptedAssessmentCriterionEntityRecords,
  listAcceptedCorpusEntityRecords,
  listAcceptedNavigationRelationshipRecords,
  listAcceptedOpenAnswerCheckEntityRecords,
  listAcceptedQuickCheckEntityRecords,
  listAcceptedReadinessCheckEntityRecords,
  listCorpusCandidateRecords,
  listCorpusEventRecords,
  listLearnerEvidenceTargetLinkRecords,
  listLlmCurationSuggestionGenerationRecords,
  listLlmCurationSuggestionRecords,
  listProgramMembershipRecords,
  listQuickCheckAttemptRecords,
  listQuickCheckCandidateRecords,
  listReadinessCheckAttemptRecords,
  listReadinessCheckCandidateRecords,
  openIdentityDatabase,
} from "../src/storage.js";

test("inspectCuratorCoverageGaps_shouldRejectUnauthorizedAndInvalidScopes", () => {
  const { commands, database } = makeSUT();

  try {
    const { topic } = seedCoverageCorpus(database, { programId: "program-a" });
    seedCuratorProgram(database, { programId: "program-b" });

    assert.deepEqual(
      {
        unknown: commands.inspectCuratorCoverageGaps({
          actingIdentityId: "identity-unknown",
          programId: "program-a",
        }),
        disabled: commands.inspectCuratorCoverageGaps({
          actingIdentityId: "identity-disabled",
          programId: "program-a",
        }),
        student: commands.inspectCuratorCoverageGaps({
          actingIdentityId: "identity-student",
          programId: "program-a",
        }),
        admin: commands.inspectCuratorCoverageGaps({
          actingIdentityId: "identity-admin",
          programId: "program-a",
        }),
        missingProgram: commands.inspectCuratorCoverageGaps({
          actingIdentityId: "identity-curator",
          programId: "program-missing",
        }),
        invalidScopeKind: commands.inspectCuratorCoverageGaps({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          scopeKind: "material",
        }),
        missingScopeId: commands.inspectCuratorCoverageGaps({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          scopeKind: "topic",
        }),
        programScopeId: commands.inspectCuratorCoverageGaps({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          scopeKind: "program",
          scopeId: topic.entityId,
        }),
        crossProgramScope: commands.inspectCuratorCoverageGaps({
          actingIdentityId: "identity-curator",
          programId: "program-b",
          scopeKind: "topic",
          scopeId: topic.entityId,
        }),
        invalidGapKind: commands.inspectCuratorCoverageGaps({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          gapKinds: ["unsupported_gap"],
        }),
        invalidSeverity: commands.inspectCuratorCoverageGaps({
          actingIdentityId: "identity-curator",
          programId: "program-a",
          minimumSeverity: "urgent",
        }),
      },
      {
        unknown: { status: "rejected", reason: "identity_not_active" },
        disabled: { status: "rejected", reason: "identity_not_active" },
        student: { status: "rejected", reason: "program_curator_required" },
        admin: { status: "rejected", reason: "program_curator_required" },
        missingProgram: { status: "rejected", reason: "program_not_found" },
        invalidScopeKind: { status: "rejected", reason: "validation_failed" },
        missingScopeId: { status: "rejected", reason: "validation_failed" },
        programScopeId: { status: "rejected", reason: "validation_failed" },
        crossProgramScope: { status: "rejected", reason: "coverage_gap_scope_program_mismatch" },
        invalidGapKind: { status: "rejected", reason: "validation_failed" },
        invalidSeverity: { status: "rejected", reason: "validation_failed" },
      },
    );
  } finally {
    database.close();
  }
});

test("inspectCuratorCoverageGaps_shouldReportDeterministicAcceptedCorpusDiagnostics", () => {
  const { commands, database } = makeSUT();

  try {
    const {
      concept,
      linkedTopic,
      orphanCriterion,
      orphanOpenAnswer,
      orphanQuickCheck,
      readinessCheck,
      topic,
    } = seedCoverageCorpus(database, { programId: "program-a" });

    const programReport = commands.inspectCuratorCoverageGaps({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });
    const repeatedReport = commands.inspectCuratorCoverageGaps({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });
    const criticalReport = commands.inspectCuratorCoverageGaps({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      minimumSeverity: "critical",
    });
    const conceptReport = commands.inspectCuratorCoverageGaps({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      scopeKind: "concept",
      scopeId: concept.entityId,
      gapKinds: ["concept_without_checks", "concept_without_materials"],
    });
    const linkedTopicReport = commands.inspectCuratorCoverageGaps({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      scopeKind: "topic",
      scopeId: linkedTopic.entityId,
    });

    assert.deepEqual(
      {
        programMetadata: {
          status: programReport.status,
          programId: programReport.value?.report.programId,
          scopeKind: programReport.value?.report.scopeKind,
          generatedAt: programReport.value?.report.generatedAt,
        },
        gapProjection: projectGaps(programReport.value.report.gaps),
        repeatedStableProjection: projectStableReport(repeatedReport.value.report),
        criticalProjection: projectGaps(criticalReport.value.report.gaps),
        conceptProjection: projectGaps(conceptReport.value.report.gaps),
        linkedTopicProjection: projectGaps(linkedTopicReport.value.report.gaps),
      },
      {
        programMetadata: {
          status: "accepted",
          programId: "program-a",
          scopeKind: "program",
          generatedAt: "2026-06-04T12:00:00.000Z",
        },
        gapProjection: [
          ["critical", "topic_without_checks", "topic", topic.entityId, topic.title, 0],
          ["critical", "concept_without_checks", "concept", concept.entityId, concept.title, 0],
          [
            "critical",
            "readiness_requirement_without_evidence_path",
            "concept",
            concept.entityId,
            concept.title,
            0,
          ],
          ["warning", "topic_without_materials", "topic", topic.entityId, topic.title, 0],
          [
            "warning",
            "check_without_target_links",
            "assessment_criterion",
            orphanCriterion.entityId,
            orphanCriterion.title,
            0,
          ],
          [
            "warning",
            "check_without_target_links",
            "open_answer_check",
            orphanOpenAnswer.entityId,
            orphanOpenAnswer.title,
            0,
          ],
          ["warning", "check_without_target_links", "quick_check", orphanQuickCheck.entityId, orphanQuickCheck.title, 0],
          ["warning", "concept_without_materials", "concept", concept.entityId, concept.title, 0],
          ["info", "topic_without_concepts", "topic", topic.entityId, topic.title, 0],
        ],
        repeatedStableProjection: projectStableReport(programReport.value.report),
        criticalProjection: [
          ["critical", "topic_without_checks", "topic", topic.entityId, topic.title, 0],
          ["critical", "concept_without_checks", "concept", concept.entityId, concept.title, 0],
          [
            "critical",
            "readiness_requirement_without_evidence_path",
            "concept",
            concept.entityId,
            concept.title,
            0,
          ],
        ],
        conceptProjection: [
          ["critical", "concept_without_checks", "concept", concept.entityId, concept.title, 0],
          ["warning", "concept_without_materials", "concept", concept.entityId, concept.title, 0],
        ],
        linkedTopicProjection: [],
      },
    );

    assert.equal(
      programReport.value.report.gaps.some($0 =>
        $0.sourceIds.includes(readinessCheck.revisionId),
      ),
      true,
    );
  } finally {
    database.close();
  }
});

test("inspectCuratorCoverageGaps_shouldRedactProtectedDetailsAndPreserveAdjacentState", () => {
  const { commands, database } = makeSUT();

  try {
    const { linkedQuickCheck, linkedQuickCheckOptionId } = seedCoverageCorpus(database, {
      programId: "program-a",
    });
    createSession(database, {
      id: "session-secret",
      identityId: "identity-student",
      createdAt: "2026-06-04T11:00:00.000Z",
      expiresAt: "2026-06-04T13:00:00.000Z",
      revokedAt: null,
    });
    createQuickCheckAttemptRecord(database, {
      id: "quick-attempt-secret",
      programId: "program-a",
      studentIdentityId: "identity-student",
      checkRevisionId: linkedQuickCheck.revisionId,
      selectedOptionId: linkedQuickCheckOptionId,
      matched: true,
      idempotencyKey: "secret-idempotency-key",
      submittedAt: "2026-06-04T11:05:00.000Z",
    });
    const before = snapshotAdjacentState(database);

    const result = commands.inspectCuratorCoverageGaps({
      actingIdentityId: "identity-curator",
      programId: "program-a",
    });

    assert.deepEqual(
      {
        status: result.status,
        containsForbiddenDetail: containsCoverageForbiddenDetail(result.value.report),
        before,
        after: snapshotAdjacentState(database),
      },
      {
        status: "accepted",
        containsForbiddenDetail: false,
        before,
        after: before,
      },
    );
  } finally {
    database.close();
  }
});

test("generateLlmCurationSuggestions_shouldRejectUnauthorizedAndInvalidProviderBoundaryInput", () => {
  const { commands, database } = makeSUT();

  try {
    seedCoverageCorpus(database, { programId: "program-a" });

    assert.deepEqual(
      {
        unknown: commands.generateLlmCurationSuggestions?.(makeLlmSuggestionRequest({
          actingIdentityId: "identity-unknown",
        })),
        student: commands.generateLlmCurationSuggestions?.(makeLlmSuggestionRequest({
          actingIdentityId: "identity-student",
        })),
        admin: commands.generateLlmCurationSuggestions?.(makeLlmSuggestionRequest({
          actingIdentityId: "identity-admin",
        })),
        missingProgram: commands.generateLlmCurationSuggestions?.(makeLlmSuggestionRequest({
          programId: "program-missing",
        })),
        invalidMax: commands.generateLlmCurationSuggestions?.(makeLlmSuggestionRequest({
          maxSuggestions: 0,
        })),
        emptyContext: commands.generateLlmCurationSuggestions?.(makeLlmSuggestionRequest({
          curatorInstruction: "",
          coverageGapIds: [],
          contextEntityIds: [],
        })),
        missingPolicy: commands.generateLlmCurationSuggestions?.(makeLlmSuggestionRequest({
          suggestionPolicyId: "policy-missing",
        })),
        staleCoverageGap: commands.generateLlmCurationSuggestions?.(makeLlmSuggestionRequest({
          coverageGapIds: ["coverage-gap-missing"],
          curatorInstruction: "",
        })),
      },
      {
        unknown: { status: "rejected", reason: "identity_not_active" },
        student: { status: "rejected", reason: "program_curator_required" },
        admin: { status: "rejected", reason: "program_curator_required" },
        missingProgram: { status: "rejected", reason: "program_not_found" },
        invalidMax: { status: "rejected", reason: "validation_failed" },
        emptyContext: { status: "rejected", reason: "validation_failed" },
        missingPolicy: { status: "rejected", reason: "suggestion_policy_not_found" },
        staleCoverageGap: { status: "rejected", reason: "coverage_gap_not_found" },
      },
    );
  } finally {
    database.close();
  }
});

test("generateLlmCurationSuggestions_shouldCreateRedactedDraftSuggestionsAndReplayIdempotently", () => {
  const providerRequests = [];
  const { commands, database } = makeSUT({
    generateId: makeIdGenerator("llm-id"),
    llmSuggestionProviderAdapters: [
      makeLlmSuggestionProviderAdapter({
        providerRequests,
        suggestions: [
          makeProviderSuggestion({
            title: "Add vector-space overview",
            summary: "Create a topic draft for vector spaces.",
          }),
        ],
      }),
    ],
  });

  try {
    seedCoverageCorpus(database, { programId: "program-a" });
    const gapId = commands.inspectCuratorCoverageGaps({
      actingIdentityId: "identity-curator",
      programId: "program-a",
      minimumSeverity: "critical",
    }).value.report.gaps[0].gapId;
    const before = snapshotAdjacentState(database);

    const created = commands.generateLlmCurationSuggestions?.(makeLlmSuggestionRequest({
      coverageGapIds: [gapId],
    }));
    const replayed = commands.generateLlmCurationSuggestions?.(makeLlmSuggestionRequest({
      coverageGapIds: [gapId],
    }));
    const storedSuggestions = listLlmCurationSuggestionRecords(database).map(projectStoredLlmSuggestion);
    const generations = listLlmCurationSuggestionGenerationRecords(database).map($0 => ({
      idempotencyKey: $0.idempotencyKey,
      requestFingerprint: $0.requestFingerprint,
      suggestionIds: $0.suggestionIds,
    }));

    assert.deepEqual(
      {
        providerCallCount: providerRequests.length,
        providerRequest: projectProviderRequest(providerRequests[0]),
        providerRequestLeaks: containsCoverageForbiddenDetail(providerRequests[0]),
        created: projectLlmSuggestionResult(created),
        replayed: projectLlmSuggestionResult(replayed),
        storedSuggestions,
        generations,
        adjacentBefore: before,
        adjacentAfter: snapshotAdjacentState(database),
      },
      {
        providerCallCount: 1,
        providerRequest: {
          allowedSuggestionKinds: ["navigation_candidate"],
          contextCounts: {
            acceptedChecks: 4,
            acceptedNavigationEntities: 5,
            acceptedReadinessChecks: 1,
            coverageGaps: 1,
          },
          outputValidatorPolicyId: "validator-a",
          programId: "program-a",
          suggestionPolicyId: "policy-a",
        },
        providerRequestLeaks: false,
        created: {
          status: "accepted",
          suggestions: [
            {
              suggestionId: "llm-id-2",
              status: "draft_suggestion",
              suggestionKind: "navigation_candidate",
              title: "Add vector-space overview",
            },
          ],
        },
        replayed: {
          status: "accepted",
          suggestions: [
            {
              suggestionId: "llm-id-2",
              status: "draft_suggestion",
              suggestionKind: "navigation_candidate",
              title: "Add vector-space overview",
            },
          ],
        },
        storedSuggestions: [
          {
            id: "llm-id-2",
            coverageGapIds: [gapId],
            generatedByIdentityId: "identity-curator",
            providerAdapterId: "provider-a",
            status: "draft_suggestion",
            suggestionKind: "navigation_candidate",
            title: "Add vector-space overview",
          },
        ],
        generations: [
          {
            idempotencyKey: "llm-suggestion-key",
            requestFingerprint: generations[0]?.requestFingerprint,
            suggestionIds: ["llm-id-2"],
          },
        ],
        adjacentBefore: before,
        adjacentAfter: before,
      },
    );
  } finally {
    database.close();
  }
});

test("generateLlmCurationSuggestions_shouldRejectMalformedPoliciesAndConflictingRetries", () => {
  const providerRequests = [];
  const malformedPolicy = makeLlmSuggestionPolicy({
    rawArtifactPolicy: "store_raw",
  });
  const malformedPolicySUT = makeSUT({
    llmSuggestionPolicies: [malformedPolicy],
  });
  const retrySUT = makeSUT({
    generateId: makeIdGenerator("retry-llm-id"),
    llmSuggestionProviderAdapters: [
      makeLlmSuggestionProviderAdapter({ providerRequests }),
    ],
  });

  try {
    seedCoverageCorpus(malformedPolicySUT.database, { programId: "program-a" });
    seedCoverageCorpus(retrySUT.database, { programId: "program-a" });
    const created = retrySUT.commands.generateLlmCurationSuggestions(makeLlmSuggestionRequest());
    const conflicting = retrySUT.commands.generateLlmCurationSuggestions(makeLlmSuggestionRequest({
      curatorInstruction: "Suggest a different safe draft topic.",
    }));

    assert.deepEqual(
      {
        malformedPolicy: malformedPolicySUT.commands.generateLlmCurationSuggestions(makeLlmSuggestionRequest()),
        created: projectLlmSuggestionResult(created),
        conflicting,
        providerCallCount: providerRequests.length,
        storedSuggestionCount: listLlmCurationSuggestionRecords(retrySUT.database).length,
      },
      {
        malformedPolicy: { status: "rejected", reason: "validation_failed" },
        created: {
          status: "accepted",
          suggestions: [
            {
              suggestionId: "retry-llm-id-2",
              status: "draft_suggestion",
              suggestionKind: "navigation_candidate",
              title: "Add algebra topic",
            },
          ],
        },
        conflicting: { status: "rejected", reason: "validation_failed" },
        providerCallCount: 1,
        storedSuggestionCount: 1,
      },
    );
  } finally {
    malformedPolicySUT.database.close();
    retrySUT.database.close();
  }
});

test("generateLlmCurationSuggestions_shouldRejectUnsafeProviderOutputWithoutMutation", () => {
  const cases = [
    {
      reason: "provider_adapter_not_found",
      adapters: [],
      input: makeLlmSuggestionRequest(),
    },
    {
      reason: "provider_execution_failed",
      adapters: [makeLlmSuggestionProviderAdapter({ throws: true })],
      input: makeLlmSuggestionRequest(),
    },
    {
      reason: "provider_budget_exceeded",
      adapters: [
        makeLlmSuggestionProviderAdapter({
          providerUsage: { providerCalls: 2 },
          suggestions: [makeProviderSuggestion()],
        }),
      ],
      input: makeLlmSuggestionRequest(),
    },
    {
      reason: "provider_output_rejected",
      adapters: [
        makeLlmSuggestionProviderAdapter({
          outputValidation: { validatorPolicyId: "validator-other", passed: true },
          suggestions: [makeProviderSuggestion()],
        }),
      ],
      input: makeLlmSuggestionRequest(),
    },
    {
      reason: "provider_output_rejected",
      adapters: [
        makeLlmSuggestionProviderAdapter({
          suggestions: [makeProviderSuggestion({ suggestionKind: "quick_check_candidate" })],
        }),
      ],
      input: makeLlmSuggestionRequest({ allowedSuggestionKinds: ["navigation_candidate"] }),
    },
    {
      reason: "provider_output_rejected",
      adapters: [
        makeLlmSuggestionProviderAdapter({
          suggestions: [makeProviderSuggestion({ title: "" })],
        }),
      ],
      input: makeLlmSuggestionRequest(),
    },
    {
      reason: "provider_output_rejected",
      adapters: [
        makeLlmSuggestionProviderAdapter({
          suggestions: [
            makeProviderSuggestion({ title: "Valid first suggestion" }),
            makeProviderSuggestion({ title: "raw prompt leaked in title" }),
          ],
        }),
      ],
      input: makeLlmSuggestionRequest({ maxSuggestions: 2 }),
    },
  ];

  assert.deepEqual(
    cases.map($0 => {
      const { commands, database } = makeSUT({ llmSuggestionProviderAdapters: $0.adapters });

      try {
        seedCoverageCorpus(database, { programId: "program-a" });
        const before = snapshotAdjacentState(database);
        const result = commands.generateLlmCurationSuggestions?.($0.input);
        return {
          noMutation: JSON.stringify(snapshotAdjacentState(database)) === JSON.stringify(before),
          reason: result?.reason,
          storedSuggestions: listLlmCurationSuggestionRecords(database).length,
        };
      } finally {
        database.close();
      }
    }),
    cases.map($0 => ({
      noMutation: true,
      reason: $0.reason,
      storedSuggestions: 0,
    })),
  );
});

function makeSUT({
  generateId = makeIdGenerator("llm-id"),
  llmSuggestionPolicies = [makeLlmSuggestionPolicy()],
  llmSuggestionProviderAdapters = [makeLlmSuggestionProviderAdapter()],
  now = () => new Date("2026-06-04T12:00:00.000Z"),
} = {}) {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  createIdentity(database, makeIdentity({ id: "identity-curator" }));
  createIdentity(database, makeIdentity({ id: "identity-student" }));
  createIdentity(database, makeIdentity({ id: "identity-admin" }));
  createIdentity(database, makeIdentity({ id: "identity-disabled", state: "disabled" }));
  createLocalPasswordCredential(database, {
    id: "credential-secret",
    identityId: "identity-student",
    login: "student@example.test",
    passwordHash: "secret-password-hash",
    createdAt: "2026-06-04T10:00:00.000Z",
  });
  grantAdminAuthority(database, {
    identityId: "identity-admin",
    grantedAt: "2026-06-04T10:00:00.000Z",
  });
  const programCommands = createProgramCommands({
    database,
    generateId: makeIdGenerator("program-id"),
    now,
  });
  const corpusCommands = createCorpusCommands({
    database,
    generateId: makeIdGenerator("corpus-id"),
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
    now,
  });
  const commands = createCuratorWorkspaceCommands({
    database,
    generateId,
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
    llmSuggestionPolicies,
    llmSuggestionProviderAdapters,
    now,
  });

  return { commands, corpusCommands, database };
}

function seedCoverageCorpus(database, { programId }) {
  const programCommands = createProgramCommands({
    database,
    generateId: makeIdGenerator(`${programId}-program-id`),
    now: () => new Date("2026-06-04T10:00:00.000Z"),
  });
  const corpusCommands = createCorpusCommands({
    database,
    generateId: makeIdGenerator(`${programId}-corpus-id`),
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
    now: () => new Date("2026-06-04T10:00:00.000Z"),
  });
  seedCuratorProgram(database, { programId });
  createProgramMembershipRecord(database, {
    id: `membership-student-${programId}`,
    programId,
    identityId: "identity-student",
    participationKind: "student",
    status: "active",
    createdAt: "2026-06-04T10:00:00.000Z",
    updatedAt: "2026-06-04T10:00:00.000Z",
  });

  const topic = createAcceptedNavigationTarget(corpusCommands, {
    programId,
    candidateKind: "topic",
    title: "Algebra foundations",
  });
  const concept = createAcceptedNavigationTarget(corpusCommands, {
    programId,
    candidateKind: "concept",
    title: "Vector spaces",
  });
  const linkedTopic = createAcceptedNavigationTarget(corpusCommands, {
    programId,
    candidateKind: "topic",
    title: "Calculus foundations",
  });
  const linkedConcept = createAcceptedNavigationTarget(corpusCommands, {
    programId,
    candidateKind: "concept",
    title: "Limits",
  });
  const linkedMaterial = createAcceptedNavigationTarget(corpusCommands, {
    programId,
    candidateKind: "material_reference",
    title: "Limits reading",
  });
  acceptRelationshipUpdate(corpusCommands, {
    programId,
    title: "Calculus concept coverage",
    relationshipDrafts: [
      {
        relationshipKind: "topic_includes_concept",
        fromEntityId: linkedTopic.entityId,
        toEntityId: linkedConcept.entityId,
      },
      {
        relationshipKind: "topic_uses_material",
        fromEntityId: linkedTopic.entityId,
        toEntityId: linkedMaterial.entityId,
      },
      {
        relationshipKind: "concept_uses_material",
        fromEntityId: linkedConcept.entityId,
        toEntityId: linkedMaterial.entityId,
      },
    ],
  });

  const linkedQuickCheck = createAcceptedQuickCheck(corpusCommands, {
    programId,
    title: "Linked limits check",
  });
  const orphanQuickCheck = createAcceptedQuickCheck(corpusCommands, {
    programId,
    title: "Unlinked vector check",
  });
  const orphanCriterion = createAcceptedAssessmentCriterion(corpusCommands, {
    programId,
    title: "Criterion coverage",
  });
  const orphanOpenAnswer = createAcceptedOpenAnswer(corpusCommands, {
    criterionEntityIds: [orphanCriterion.entityId],
    programId,
    title: "Open answer coverage",
  });
  corpusCommands.createLearnerEvidenceTargetLink({
    actingIdentityId: "identity-curator",
    programId,
    targetKind: "topic",
    targetId: linkedTopic.entityId,
    evidenceOwnerKind: "accepted_quick_check",
    evidenceOwnerEntityId: linkedQuickCheck.entityId,
  });
  corpusCommands.createLearnerEvidenceTargetLink({
    actingIdentityId: "identity-curator",
    programId,
    targetKind: "concept",
    targetId: linkedConcept.entityId,
    evidenceOwnerKind: "accepted_quick_check",
    evidenceOwnerEntityId: linkedQuickCheck.entityId,
  });

  const readinessCheck = createAcceptedReadinessCheck(corpusCommands, {
    programId,
    topicEntityId: topic.entityId,
    requirementTargetKind: "concept",
    requirementTargetId: concept.entityId,
  });

  return {
    concept,
    linkedQuickCheck,
    linkedQuickCheckOptionId: linkedQuickCheck.options[0].optionId,
    linkedTopic,
    orphanCriterion,
    orphanOpenAnswer,
    orphanQuickCheck,
    readinessCheck,
    topic,
  };
}

function createAcceptedNavigationTarget(commands, {
  programId,
  candidateKind,
  title,
}) {
  const candidate = commands.createNavigationCandidate({
    actingIdentityId: "identity-curator",
    programId,
    candidateKind,
    title,
    body: `${title} body`,
    ...(candidateKind === "material_reference"
      ? {
          materialReferenceKind: "article",
          locator: `https://example.test/${title.toLowerCase().replaceAll(" ", "-")}`,
        }
      : {}),
    rationale: "Curator-only rationale",
  });
  const accepted = commands.acceptNavigationCandidate({
    actingIdentityId: "identity-curator",
    candidateId: candidate.value.navigationCandidate.candidateId,
  });
  return accepted.value.navigationChange.acceptedCorpus;
}

function acceptRelationshipUpdate(commands, { programId, title, relationshipDrafts }) {
  const candidate = commands.createNavigationCandidate({
    actingIdentityId: "identity-curator",
    programId,
    candidateKind: "relationship_update",
    title,
    relationshipDrafts,
    rationale: "Curator-only relationship rationale",
  });
  return commands.acceptNavigationCandidate({
    actingIdentityId: "identity-curator",
    candidateId: candidate.value.navigationCandidate.candidateId,
  });
}

function createAcceptedQuickCheck(commands, { programId, title }) {
  const candidate = commands.createQuickCheckCandidate({
    actingIdentityId: "identity-curator",
    programId,
    checkKind: "single_select_quick_check",
    title,
    prompt: "Prompt with secret answer-key context",
    options: ["Correct option", "Incorrect option"],
    answerKeyIndex: 0,
    rationale: "Curator-only quick-check rationale",
  });
  const accepted = commands.acceptQuickCheckCandidate({
    actingIdentityId: "identity-curator",
    candidateId: candidate.value.quickCheckCandidate.candidateId,
  });
  return accepted.value.acceptedQuickCheck;
}

function createAcceptedAssessmentCriterion(commands, { programId, title }) {
  const candidate = commands.createAssessmentCriterionCandidate({
    actingIdentityId: "identity-curator",
    programId,
    title,
    body: `${title} body`,
    rationale: "Curator-only criterion rationale",
  });
  const accepted = commands.acceptAssessmentCriterionCandidate({
    actingIdentityId: "identity-curator",
    candidateId: candidate.value.assessmentCriterionCandidate.candidateId,
  });
  return accepted.value.acceptedAssessmentCriterion;
}

function createAcceptedOpenAnswer(commands, { criterionEntityIds, programId, title }) {
  const candidate = commands.createOpenAnswerCheckCandidate({
    actingIdentityId: "identity-curator",
    programId,
    checkKind: "open_answer",
    title,
    prompt: `${title} prompt`,
    criterionEntityIds,
    rationale: "Curator-only open-answer rationale",
  });
  const accepted = commands.acceptOpenAnswerCheckCandidate({
    actingIdentityId: "identity-curator",
    candidateId: candidate.value.openAnswerCheckCandidate.candidateId,
  });
  return accepted.value.acceptedOpenAnswerCheck;
}

function createAcceptedReadinessCheck(
  commands,
  { programId, topicEntityId, requirementTargetKind, requirementTargetId },
) {
  const candidate = commands.createReadinessCheckCandidate({
    actingIdentityId: "identity-curator",
    programId,
    title: "Readiness with missing evidence path",
    scope: {
      scopeKind: "topic",
      topicEntityId,
    },
    requirements: [
      {
        targetKind: requirementTargetKind,
        targetId: requirementTargetId,
        requiredLevel: "on_track",
      },
    ],
    rationale: "Curator-only readiness rationale",
  });
  const accepted = commands.acceptReadinessCheckCandidate({
    actingIdentityId: "identity-curator",
    candidateId: candidate.value.readinessCheckCandidate.candidateId,
  });
  return accepted.value.acceptedReadinessCheck;
}

function seedCuratorProgram(database, { programId }) {
  createProgramShellRecord(database, {
    id: programId,
    title: `Program ${programId}`,
    admissionPolicy: "self_join",
    createdByIdentityId: "identity-curator",
    createdAt: "2026-06-04T10:00:00.000Z",
  });
  createProgramMembershipRecord(database, {
    id: `membership-curator-${programId}`,
    programId,
    identityId: "identity-curator",
    participationKind: "program_curator",
    status: "active",
    createdAt: "2026-06-04T10:00:00.000Z",
    updatedAt: "2026-06-04T10:00:00.000Z",
  });
}

function makeLlmSuggestionRequest({
  actingIdentityId = "identity-curator",
  allowedSuggestionKinds = ["navigation_candidate"],
  contextEntityIds,
  coverageGapIds = [],
  curatorInstruction = "Suggest one safe draft topic.",
  idempotencyKey = "llm-suggestion-key",
  maxSuggestions = 1,
  programId = "program-a",
  suggestionPolicyId = "policy-a",
} = {}) {
  return {
    actingIdentityId,
    allowedSuggestionKinds,
    contextEntityIds,
    coverageGapIds,
    curatorInstruction,
    idempotencyKey,
    maxSuggestions,
    programId,
    suggestionPolicyId,
  };
}

function makeLlmSuggestionPolicy({
  allowedSuggestionKinds = ["navigation_candidate"],
  budgetPolicy = { maxProviderCalls: 1, maxInputTokens: 4000, maxOutputTokens: 800 },
  outputValidatorPolicyId = "validator-a",
  providerAdapterId = "provider-a",
  rawArtifactPolicy = "none",
  redactionPolicyId = "redaction-a",
  suggestionPolicyId = "policy-a",
} = {}) {
  return {
    suggestionPolicyId,
    providerAdapterId,
    outputValidatorPolicyId,
    redactionPolicyId,
    allowedSuggestionKinds,
    promptInputPolicy: {
      includeAcceptedNavigationContext: true,
      includeAcceptedCheckContext: true,
      includeReadinessContext: true,
      includeCoverageGapContext: true,
      includeStudentWorkspaceState: false,
    },
    budgetPolicy,
    rawArtifactPolicy,
  };
}

function makeLlmSuggestionProviderAdapter({
  outputValidation = { validatorPolicyId: "validator-a", passed: true },
  providerAdapterId = "provider-a",
  providerRequests = [],
  providerUsage = { providerCalls: 1, inputTokens: 120, outputTokens: 80 },
  suggestions = [makeProviderSuggestion()],
  throws = false,
} = {}) {
  return {
    providerAdapterId,
    suggest: request => {
      providerRequests.push(request);
      if (throws) {
        throw new Error("provider failed");
      }
      return {
        suggestions,
        outputValidation,
        providerUsage,
      };
    },
  };
}

function makeProviderSuggestion({
  suggestionKind = "navigation_candidate",
  title = "Add algebra topic",
  summary = "Create a topic draft for algebra.",
} = {}) {
  return {
    suggestionKind,
    title,
    summary,
    rationale: "The accepted program has a missing topic evidence path.",
    suggestedDraft: {
      candidateKind: suggestionKind,
      request: {
        candidateKind: "topic",
        title,
        body: `${title} body`,
        sourceIds: [],
        rationale: "Draft candidate rationale",
      },
    },
    supportingEvidence: [
      {
        sourceKind: "curator_instruction",
        sourceId: "curator-instruction",
        label: "Curator instruction",
      },
    ],
  };
}

function snapshotAdjacentState(database) {
  return {
    acceptedAssessmentCriterionEntities: listAcceptedAssessmentCriterionEntityRecords(database).length,
    acceptedCorpusEntities: listAcceptedCorpusEntityRecords(database).length,
    acceptedNavigationRelationships: listAcceptedNavigationRelationshipRecords(database).length,
    acceptedOpenAnswerCheckEntities: listAcceptedOpenAnswerCheckEntityRecords(database).length,
    acceptedQuickCheckEntities: listAcceptedQuickCheckEntityRecords(database).length,
    acceptedReadinessCheckEntities: listAcceptedReadinessCheckEntityRecords(database).length,
    corpusCandidates: listCorpusCandidateRecords(database).map($0 => [$0.id, $0.status]),
    corpusEvents: listCorpusEventRecords(database).length,
    learnerEvidenceTargetLinks: listLearnerEvidenceTargetLinkRecords(database, {
      includeDeleted: true,
    }).map($0 => [$0.id, $0.status]),
    memberships: listProgramMembershipRecords(database).map($0 => [
      $0.programId,
      $0.identityId,
      $0.participationKind,
      $0.status,
    ]),
    quickCheckAttempts: listQuickCheckAttemptRecords(database).map($0 => [
      $0.id,
      $0.idempotencyKey,
    ]),
    quickCheckCandidates: listQuickCheckCandidateRecords(database).map($0 => [$0.id, $0.status]),
    readinessAttempts: listReadinessCheckAttemptRecords(database).length,
    readinessCandidates: listReadinessCheckCandidateRecords(database).map($0 => [$0.id, $0.status]),
    sessionCount: countRows(database, "sessions"),
  };
}

function projectProviderRequest(request) {
  if (!request) {
    return null;
  }
  return {
    allowedSuggestionKinds: request.allowedSuggestionKinds,
    contextCounts: {
      acceptedChecks: request.context.acceptedChecks.length,
      acceptedNavigationEntities: request.context.acceptedNavigationEntities.length,
      acceptedReadinessChecks: request.context.acceptedReadinessChecks.length,
      coverageGaps: request.context.coverageGaps.length,
    },
    outputValidatorPolicyId: request.outputValidatorPolicyId,
    programId: request.programId,
    suggestionPolicyId: request.suggestionPolicyId,
  };
}

function projectLlmSuggestionResult(result) {
  return {
    status: result?.status,
    suggestions: result?.value?.suggestions.map($0 => ({
      suggestionId: $0.suggestionId,
      status: $0.status,
      suggestionKind: $0.suggestionKind,
      title: $0.title,
    })),
  };
}

function projectStoredLlmSuggestion(suggestion) {
  return {
    id: suggestion.id,
    coverageGapIds: suggestion.origin.coverageGapIds,
    generatedByIdentityId: suggestion.origin.generatedByIdentityId,
    providerAdapterId: suggestion.origin.providerAdapterId,
    status: suggestion.status,
    suggestionKind: suggestion.suggestionKind,
    title: suggestion.title,
  };
}

function projectGaps(gaps) {
  return gaps.map($0 => [
    $0.severity,
    $0.gapKind,
    $0.targetKind,
    $0.targetId,
    $0.targetTitle,
    $0.acceptedEvidencePathCount,
  ]);
}

function projectStableReport(report) {
  return {
    programId: report.programId,
    scopeKind: report.scopeKind,
    scopeId: report.scopeId,
    gaps: report.gaps.map($0 => ({
      acceptedEvidencePathCount: $0.acceptedEvidencePathCount,
      description: $0.description,
      gapId: $0.gapId,
      gapKind: $0.gapKind,
      programId: $0.programId,
      severity: $0.severity,
      sourceIds: $0.sourceIds,
      sourceKind: $0.sourceKind,
      status: $0.status,
      targetId: $0.targetId,
      targetKind: $0.targetKind,
      targetTitle: $0.targetTitle,
      title: $0.title,
    })),
  };
}

function containsCoverageForbiddenDetail(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  return [
    "acceptedbyidentityid",
    "acceptedfromcandidateid",
    "answerkey",
    "authorization",
    "candidateid",
    "cookie",
    "correct option",
    "csrf",
    "curator-only",
    "database-url",
    "feedback",
    "idempotency",
    "incorrect option",
    "passwordhash",
    "postgres://",
    "provider",
    "rationale",
    "raw model",
    "raw prompt",
    "secret",
    "select ",
    "session",
    "stack",
    "submitted",
    "/tmp",
  ].some($0 => serialized.includes($0));
}

function countRows(database, tableName) {
  return database.prepare(`select count(*) as count from ${tableName}`).get().count;
}

function makeIdentity({ id, state = "active" }) {
  return {
    id,
    displayName: `Display ${id}`,
    state,
    createdAt: "2026-06-04T10:00:00.000Z",
    disabledAt: state === "disabled" ? "2026-06-04T10:30:00.000Z" : null,
  };
}

function makeIdGenerator(prefix) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}
