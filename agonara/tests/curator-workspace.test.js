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

function makeSUT({
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
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
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
