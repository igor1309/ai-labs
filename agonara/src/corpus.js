import { randomUUID } from "node:crypto";
import {
  MAX_MATERIAL_CONTENT_BYTES,
  StorageInvariantError,
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
  createCorpusEventRecord,
  createLearnerEvidenceTargetLinkRecord,
  createOpenAnswerCheckCandidateRecord,
  createProgramSourceRecord,
  createQuickCheckCandidateRecord,
  createReadinessCheckCandidateRecord,
  deleteAcceptedMaterialContentRecord,
  deleteLearnerEvidenceTargetLinkRecord,
  deleteProgramSourceRecord,
  deleteSourceContentRecord,
  getAcceptedAssessmentCriterionEntityRecord,
  getAcceptedAssessmentCriterionEntityLifecycleStatusRecord,
  getAcceptedAssessmentCriterionRevisionRecord,
  getAcceptedCorpusEntityRecord,
  getAcceptedCorpusEntityLifecycleStatusRecord,
  getAcceptedCorpusRevisionRecord,
  getAcceptedMaterialContentRecord,
  getAcceptedNavigationRelationshipLifecycleStatusRecord,
  getAcceptedNavigationRelationshipRevisionRecord,
  getAcceptedOpenAnswerCheckEntityRecord,
  getAcceptedOpenAnswerCheckEntityLifecycleStatusRecord,
  getAcceptedOpenAnswerCheckRevisionRecord,
  getAcceptedQuickCheckEntityRecord,
  getAcceptedQuickCheckEntityLifecycleStatusRecord,
  getAcceptedQuickCheckRevisionRecord,
  getAcceptedReadinessCheckEntityRecord,
  getAcceptedReadinessCheckEntityLifecycleStatusRecord,
  getAcceptedReadinessCheckRevisionRecord,
  getAssessmentCriterionCandidateRecord,
  getCorpusCandidateRecord,
  getIdentity,
  getLearnerEvidenceTargetLinkRecord,
  getOpenAnswerCheckCandidateRecord,
  getProgramShellRecord,
  getProgramSourceLifecycleStatusRecord,
  getProgramSourceRecord,
  getQuickCheckCandidateRecord,
  getReadinessCheckCandidateRecord,
  getSourceContentRecord,
  isEffectiveAdmin,
  listAcceptedAssessmentCriterionEntityRecords,
  listAcceptedCorpusEntityRecords,
  listAcceptedCorpusRevisionRecords,
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
  listReadinessCheckCandidateRecords,
  setAcceptedAssessmentCriterionEntityLifecycleStatusRecord,
  setAcceptedCorpusEntityLifecycleStatusRecord,
  setAcceptedMaterialContentRecord,
  setAcceptedNavigationRelationshipLifecycleStatusRecord,
  setAcceptedOpenAnswerCheckEntityLifecycleStatusRecord,
  setAcceptedQuickCheckEntityLifecycleStatusRecord,
  setAcceptedReadinessCheckEntityLifecycleStatusRecord,
  setProgramSourceLifecycleStatusRecord,
  setSourceContentRecord,
  updateAcceptedAssessmentCriterionEntityCurrentRevision,
  updateAcceptedCorpusEntityCurrentRevision,
  updateAcceptedOpenAnswerCheckEntityCurrentRevision,
  updateAcceptedQuickCheckEntityCurrentRevision,
  updateAcceptedReadinessCheckEntityCurrentRevision,
  updateAssessmentCriterionCandidateStatus,
  updateCorpusCandidateStatus,
  updateOpenAnswerCheckCandidateStatus,
  updateQuickCheckCandidateStatus,
  updateReadinessCheckCandidateStatus,
} from "./storage.js";

const supportedSourceKinds = new Set([
  "public_plan",
  "exam_requirement",
  "standard",
  "textbook",
  "article",
  "lecture",
  "course",
  "note",
  "research_result",
  "other",
]);
const supportedCandidateKinds = new Set(["topic", "concept"]);
const supportedNavigationCandidateKinds = new Set([
  "topic",
  "concept",
  "definition",
  "principle",
  "material_reference",
  "relationship_update",
]);
const supportedMaterialReferenceKinds = new Set([
  "article",
  "book",
  "course",
  "lecture",
  "note",
  "problem_set",
  "standard",
  "video",
  "other",
]);
const supportedNavigationRelationshipKinds = new Set([
  "topic_includes_concept",
  "topic_uses_material",
  "concept_uses_material",
  "concept_has_definition",
  "concept_has_principle",
  "concept_prerequisite",
  "concept_related",
  "concept_distinguishes_from",
]);
const supportedAssessmentCandidateStatuses = new Set(["draft", "accepted", "rejected"]);
const supportedCheckKinds = new Set(["open_answer"]);
const supportedQuickCheckKinds = new Set(["single_select_quick_check"]);
const supportedLearnerEvidenceTargetKinds = new Set(["topic", "concept", "material_reference"]);
const supportedLearnerEvidenceOwnerKinds = new Set([
  "accepted_assessment_criterion",
  "accepted_open_answer_check",
  "accepted_quick_check",
]);
const supportedReadinessRequirementTargetKinds = new Set([
  "assessment_criterion",
  "concept",
  "material_reference",
  "open_answer_check",
  "quick_check",
  "topic",
]);
const supportedReadinessRequiredLevels = new Set(["developing", "on_track"]);

export function createCorpusCommands({
  database,
  generateId = randomUUID,
  getEffectiveParticipation,
  now = () => new Date(),
} = {}) {
  return {
    acceptAssessmentCriterionCandidate: input =>
      acceptAssessmentCriterionCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    acceptOpenAnswerCheckCandidate: input =>
      acceptOpenAnswerCheckCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    acceptQuickCheckCandidate: input =>
      acceptQuickCheckCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    acceptReadinessCheckCandidate: input =>
      acceptReadinessCheckCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    acceptCorpusCandidate: input =>
      acceptCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    acceptNavigationCandidate: input =>
      acceptNavigationCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    createAssessmentCriterionCandidate: input =>
      createAssessmentCriterionCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    createOpenAnswerCheckCandidate: input =>
      createOpenAnswerCheckCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    createQuickCheckCandidate: input =>
      createQuickCheckCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    createReadinessCheckCandidate: input =>
      createReadinessCheckCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    createCorpusCandidate: input =>
      createCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    createLearnerEvidenceTargetLink: input =>
      createLearnerEvidenceTargetLink({ database, generateId, getEffectiveParticipation, input, now }),
    createNavigationCandidate: input =>
      createNavigationCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    getAcceptedAssessmentCriterionRevision: input =>
      getAcceptedAssessmentCriterionRevision({ database, getEffectiveParticipation, input }),
    getAcceptedOpenAnswerCheckRevision: input =>
      getAcceptedOpenAnswerCheckRevision({ database, getEffectiveParticipation, input }),
    getAcceptedQuickCheckRevisionForCuration: input =>
      getAcceptedQuickCheckRevisionForCuration({ database, getEffectiveParticipation, input }),
    listAcceptedQuickChecksForCuration: input =>
      listAcceptedQuickChecksForCuration({ database, getEffectiveParticipation, input }),
    listAcceptedReadinessChecksForCuration: input =>
      listAcceptedReadinessChecksForCuration({ database, getEffectiveParticipation, input }),
    getQuickCheckDelivery: input =>
      getQuickCheckDelivery({ database, getEffectiveParticipation, input }),
    getAcceptedReadinessCheckRevisionForCuration: input =>
      getAcceptedReadinessCheckRevisionForCuration({ database, getEffectiveParticipation, input }),
    deleteLearnerEvidenceTargetLink: input =>
      deleteLearnerEvidenceTargetLink({ database, getEffectiveParticipation, input, now }),
    getAcceptedCorpusRevision: input =>
      getAcceptedCorpusRevision({ database, getEffectiveParticipation, input }),
    getNavigationEntity: input =>
      getNavigationEntity({ database, getEffectiveParticipation, input }),
    getNavigationRevision: input =>
      getNavigationRevision({ database, getEffectiveParticipation, input }),
    listAcceptedAssessmentCriteria: input =>
      listAcceptedAssessmentCriteria({ database, getEffectiveParticipation, input }),
    listAcceptedOpenAnswerChecks: input =>
      listAcceptedOpenAnswerChecks({ database, getEffectiveParticipation, input }),
    listQuickCheckDeliveries: input =>
      listQuickCheckDeliveries({ database, getEffectiveParticipation, input }),
    listReadinessCheckCandidates: input =>
      listReadinessCheckCandidates({ database, getEffectiveParticipation, input }),
    listAcceptedCorpus: input =>
      listAcceptedCorpus({ database, getEffectiveParticipation, input }),
    listProgramNavigation: input =>
      listProgramNavigation({ database, getEffectiveParticipation, input }),
    listAssessmentCriterionCandidates: input =>
      listAssessmentCriterionCandidates({ database, getEffectiveParticipation, input }),
    listCorpusCandidates: input =>
      listCorpusCandidates({ database, getEffectiveParticipation, input }),
    listNavigationCandidates: input =>
      listNavigationCandidates({ database, getEffectiveParticipation, input }),
    listCorpusEvents: input =>
      listCorpusEvents({ database, getEffectiveParticipation, input }),
    listLearnerEvidenceTargetLinks: input =>
      listLearnerEvidenceTargetLinks({ database, getEffectiveParticipation, input }),
    listOpenAnswerCheckCandidates: input =>
      listOpenAnswerCheckCandidates({ database, getEffectiveParticipation, input }),
    listProgramSources: input =>
      listProgramSources({ database, getEffectiveParticipation, input }),
    listQuickCheckCandidates: input =>
      listQuickCheckCandidates({ database, getEffectiveParticipation, input }),
    recordProgramSource: input =>
      recordProgramSource({ database, generateId, getEffectiveParticipation, input, now }),
    deleteProgramSource: input =>
      deleteProgramSource({ database, getEffectiveParticipation, input }),
    setProgramSourceLifecycleStatus: input =>
      setProgramSourceLifecycleStatus({ database, getEffectiveParticipation, input, now }),
    setSourceContent: input =>
      setSourceContent({ database, getEffectiveParticipation, input, now }),
    deleteSourceContent: input =>
      deleteSourceContent({ database, getEffectiveParticipation, input }),
    readSourceContent: input =>
      readSourceContent({ database, getEffectiveParticipation, input }),
    setAcceptedMaterialContent: input =>
      setAcceptedMaterialContent({ database, getEffectiveParticipation, input }),
    deleteAcceptedMaterialContent: input =>
      deleteAcceptedMaterialContent({ database, getEffectiveParticipation, input, now }),
    readMaterialContent: input =>
      readMaterialContent({ database, getEffectiveParticipation, input }),
    readMaterialRevisionContent: input =>
      readMaterialRevisionContent({ database, getEffectiveParticipation, input }),
    setAcceptedAssessmentCriterionLifecycleStatus: input =>
      setAcceptedAssessmentCriterionLifecycleStatus({ database, getEffectiveParticipation, input, now }),
    setAcceptedCorpusLifecycleStatus: input =>
      setAcceptedCorpusLifecycleStatus({ database, getEffectiveParticipation, input, now }),
    setAcceptedNavigationRelationshipLifecycleStatus: input =>
      setAcceptedNavigationRelationshipLifecycleStatus({ database, getEffectiveParticipation, input, now }),
    setAcceptedOpenAnswerCheckLifecycleStatus: input =>
      setAcceptedOpenAnswerCheckLifecycleStatus({ database, getEffectiveParticipation, input, now }),
    setAcceptedQuickCheckLifecycleStatus: input =>
      setAcceptedQuickCheckLifecycleStatus({ database, getEffectiveParticipation, input, now }),
    setAcceptedReadinessCheckLifecycleStatus: input =>
      setAcceptedReadinessCheckLifecycleStatus({ database, getEffectiveParticipation, input, now }),
    rejectAssessmentCriterionCandidate: input =>
      rejectAssessmentCriterionCandidate({ database, getEffectiveParticipation, input, now }),
    rejectOpenAnswerCheckCandidate: input =>
      rejectOpenAnswerCheckCandidate({ database, getEffectiveParticipation, input, now }),
    rejectQuickCheckCandidate: input =>
      rejectQuickCheckCandidate({ database, getEffectiveParticipation, input, now }),
    rejectReadinessCheckCandidate: input =>
      rejectReadinessCheckCandidate({ database, getEffectiveParticipation, input, now }),
    rejectCorpusCandidate: input =>
      rejectCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }),
    rejectNavigationCandidate: input =>
      rejectNavigationCandidate({ database, generateId, getEffectiveParticipation, input, now }),
  };
}

function acceptAssessmentCriterionCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const candidate = getAssessmentCriterionCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("criterion_candidate_not_found");
  }

  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (candidate.status === "accepted") {
    return rejected("criterion_candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    return rejected("criterion_candidate_already_rejected");
  }

  const targetEntity = input?.targetEntityId
    ? getAcceptedAssessmentCriterionEntityRecord(database, input.targetEntityId)
    : null;
  if (input?.targetEntityId && !targetEntity) {
    return rejected("criterion_entity_not_found");
  }
  if (targetEntity && targetEntity.programId !== candidate.programId) {
    return rejected("criterion_entity_program_mismatch");
  }

  const entityId = input?.targetEntityId ?? generateId();
  const revisionId = generateId();
  const acceptedAt = now().toISOString();

  const revision = database.transaction(() => {
    if (!input?.targetEntityId) {
      createAcceptedAssessmentCriterionEntityRecord(database, {
        id: entityId,
        programId: candidate.programId,
        currentRevisionId: revisionId,
      });
    }

    const createdRevision = createAcceptedAssessmentCriterionRevisionRecord(database, {
      id: revisionId,
      entityId,
      programId: candidate.programId,
      title: candidate.title,
      body: candidate.body,
      acceptedFromCandidateId: candidate.id,
      sourceIds: candidate.sourceIds,
      rationale: candidate.rationale,
      acceptedByIdentityId: authorization.identity.id,
      acceptedAt,
    });
    if (input?.targetEntityId) {
      updateAcceptedAssessmentCriterionEntityCurrentRevision(database, {
        entityId,
        currentRevisionId: revisionId,
      });
    }
    updateAssessmentCriterionCandidateStatus(database, {
      candidateId: candidate.id,
      status: "accepted",
      updatedAt: acceptedAt,
    });
    return createdRevision;
  })();

  return accepted({ acceptedAssessmentCriterion: summarizeAcceptedAssessmentCriterion(revision) });
}

function acceptOpenAnswerCheckCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const candidate = getOpenAnswerCheckCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("check_candidate_not_found");
  }

  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (candidate.status === "accepted") {
    return rejected("check_candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    return rejected("check_candidate_already_rejected");
  }

  const targetEntity = input?.targetEntityId
    ? getAcceptedOpenAnswerCheckEntityRecord(database, input.targetEntityId)
    : null;
  if (input?.targetEntityId && !targetEntity) {
    return rejected("check_entity_not_found");
  }
  if (targetEntity && targetEntity.programId !== candidate.programId) {
    return rejected("check_entity_program_mismatch");
  }

  const entityId = input?.targetEntityId ?? generateId();
  const revisionId = generateId();
  const acceptedAt = now().toISOString();
  const criterionRevisionIds = candidate.criterionEntityIds.map(
    $0 => getAcceptedAssessmentCriterionEntityRecord(database, $0).currentRevisionId,
  );

  const revision = database.transaction(() => {
    if (!input?.targetEntityId) {
      createAcceptedOpenAnswerCheckEntityRecord(database, {
        id: entityId,
        programId: candidate.programId,
        currentRevisionId: revisionId,
      });
    }

    const createdRevision = createAcceptedOpenAnswerCheckRevisionRecord(database, {
      id: revisionId,
      entityId,
      programId: candidate.programId,
      checkKind: candidate.checkKind,
      title: candidate.title,
      prompt: candidate.prompt,
      acceptedFromCandidateId: candidate.id,
      sourceIds: candidate.sourceIds,
      criterionRevisionIds,
      rationale: candidate.rationale,
      acceptedByIdentityId: authorization.identity.id,
      acceptedAt,
    });
    if (input?.targetEntityId) {
      updateAcceptedOpenAnswerCheckEntityCurrentRevision(database, {
        entityId,
        currentRevisionId: revisionId,
      });
    }
    updateOpenAnswerCheckCandidateStatus(database, {
      candidateId: candidate.id,
      status: "accepted",
      updatedAt: acceptedAt,
    });
    return createdRevision;
  })();

  return accepted({ acceptedOpenAnswerCheck: summarizeAcceptedOpenAnswerCheck(revision) });
}

function acceptQuickCheckCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const candidate = getQuickCheckCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("quick_check_candidate_not_found");
  }

  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (candidate.status === "accepted") {
    return rejected("quick_check_candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    return rejected("quick_check_candidate_already_rejected");
  }

  const targetEntity = input?.targetEntityId
    ? getAcceptedQuickCheckEntityRecord(database, input.targetEntityId)
    : null;
  if (input?.targetEntityId && !targetEntity) {
    return rejected("quick_check_entity_not_found");
  }
  if (targetEntity && targetEntity.programId !== candidate.programId) {
    return rejected("quick_check_entity_program_mismatch");
  }

  const entityId = input?.targetEntityId ?? generateId();
  const revisionId = generateId();
  const acceptedOptions = candidate.options.map($0 => ({ id: generateId(), text: $0.text }));
  const candidateAnswerKeyIndex = candidate.options.findIndex($0 => $0.id === candidate.answerKeyOptionId);
  const acceptedAt = now().toISOString();

  const revision = database.transaction(() => {
    if (!input?.targetEntityId) {
      createAcceptedQuickCheckEntityRecord(database, {
        id: entityId,
        programId: candidate.programId,
        currentRevisionId: revisionId,
      });
    }

    const createdRevision = createAcceptedQuickCheckRevisionRecord(database, {
      id: revisionId,
      entityId,
      programId: candidate.programId,
      checkKind: candidate.checkKind,
      title: candidate.title,
      prompt: candidate.prompt,
      options: acceptedOptions,
      answerKeyOptionId: acceptedOptions[candidateAnswerKeyIndex].id,
      acceptedFromCandidateId: candidate.id,
      sourceIds: candidate.sourceIds,
      rationale: candidate.rationale,
      acceptedByIdentityId: authorization.identity.id,
      acceptedAt,
    });
    if (input?.targetEntityId) {
      updateAcceptedQuickCheckEntityCurrentRevision(database, {
        entityId,
        currentRevisionId: revisionId,
      });
    }
    updateQuickCheckCandidateStatus(database, {
      candidateId: candidate.id,
      status: "accepted",
      updatedAt: acceptedAt,
    });
    return createdRevision;
  })();

  return accepted({ acceptedQuickCheck: summarizeAcceptedQuickCheck(revision) });
}

function acceptReadinessCheckCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const candidate = getReadinessCheckCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("readiness_candidate_not_found");
  }

  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (candidate.status === "accepted") {
    return rejected("readiness_candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    return rejected("readiness_candidate_already_rejected");
  }

  const targetEntity = input?.targetEntityId
    ? getAcceptedReadinessCheckEntityRecord(database, input.targetEntityId)
    : null;
  if (input?.targetEntityId && !targetEntity) {
    return rejected("readiness_entity_not_found");
  }
  if (targetEntity && targetEntity.programId !== candidate.programId) {
    return rejected("readiness_entity_program_mismatch");
  }

  const entityId = input?.targetEntityId ?? generateId();
  const revisionId = generateId();
  const acceptedAt = now().toISOString();

  try {
    const revision = database.transaction(() => {
      updateReadinessCheckCandidateStatus(database, {
        candidateId: candidate.id,
        status: "accepted",
        updatedAt: acceptedAt,
      });
      if (!input?.targetEntityId) {
        createAcceptedReadinessCheckEntityRecord(database, {
          id: entityId,
          programId: candidate.programId,
          currentRevisionId: revisionId,
        });
      }

      const createdRevision = createAcceptedReadinessCheckRevisionRecord(database, {
        id: revisionId,
        entityId,
        programId: candidate.programId,
        title: candidate.title,
        scope: candidate.scope,
        requirements: candidate.requirements,
        acceptedFromCandidateId: candidate.id,
        sourceIds: candidate.sourceIds,
        rationale: candidate.rationale,
        acceptedByIdentityId: authorization.identity.id,
        acceptedAt,
      });
      if (input?.targetEntityId) {
        updateAcceptedReadinessCheckEntityCurrentRevision(database, {
          entityId,
          currentRevisionId: revisionId,
        });
      }
      return createdRevision;
    })();

    return accepted({ acceptedReadinessCheck: summarizeAcceptedReadinessCheck(revision) });
  } catch (error) {
    if (error instanceof StorageInvariantError) {
      return rejected(mapReadinessStorageRejection(error.reason));
    }
    throw error;
  }
}

function acceptCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const candidate = getCorpusCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("candidate_not_found");
  }
  if (candidate.status === "accepted") {
    recordRejectedCandidateEventIfResolved({
      database,
      eventType: "corpus_candidate_accepted",
      generateId,
      getEffectiveParticipation,
      input,
      candidate,
      now,
      reason: "candidate_already_accepted",
    });
    return rejected("candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    recordRejectedCandidateEventIfResolved({
      database,
      eventType: "corpus_candidate_accepted",
      generateId,
      getEffectiveParticipation,
      input,
      candidate,
      now,
      reason: "candidate_already_rejected",
    });
    return rejected("candidate_already_rejected");
  }

  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    if (authorization.identity && authorization.program) {
      recordCorpusEvent({
        database,
        generateId,
        now,
        eventType: "corpus_candidate_accepted",
        actorIdentityId: authorization.identity.id,
        programId: authorization.program.id,
        targetId: candidate.id,
        outcome: "rejected",
        reason: authorization.reason,
      });
    }
    return rejected(authorization.reason);
  }

  const entityId = input?.targetEntityId ?? generateId();
  const revisionId = generateId();
  const acceptedAt = now().toISOString();
  const targetEntity = input?.targetEntityId ? getAcceptedCorpusEntityRecord(database, input.targetEntityId) : null;

  if (input?.targetEntityId && !targetEntity) {
    recordRejectedCandidateEvent({
      database,
      eventType: "corpus_candidate_accepted",
      generateId,
      now,
      authorization,
      candidate,
      reason: "accepted_entity_not_found",
    });
    return rejected("accepted_entity_not_found");
  }
  if (targetEntity && targetEntity.programId !== candidate.programId) {
    recordRejectedCandidateEvent({
      database,
      eventType: "corpus_candidate_accepted",
      generateId,
      now,
      authorization,
      candidate,
      reason: "accepted_entity_program_mismatch",
    });
    return rejected("accepted_entity_program_mismatch");
  }
  if (targetEntity && targetEntity.acceptedKind !== candidate.candidateKind) {
    recordRejectedCandidateEvent({
      database,
      eventType: "corpus_candidate_accepted",
      generateId,
      now,
      authorization,
      candidate,
      reason: "accepted_kind_mismatch",
    });
    return rejected("accepted_kind_mismatch");
  }

  const revision = database.transaction(() => {
    if (!input?.targetEntityId) {
      createAcceptedCorpusEntityRecord(database, {
        id: entityId,
        programId: candidate.programId,
        acceptedKind: candidate.candidateKind,
        currentRevisionId: revisionId,
      });
    }

    const createdRevision = createAcceptedCorpusRevisionRecord(database, {
      id: revisionId,
      entityId,
      programId: candidate.programId,
      acceptedKind: candidate.candidateKind,
      title: candidate.title,
      body: candidate.body,
      acceptedFromCandidateId: candidate.id,
      sourceIds: candidate.sourceIds,
      rationale: candidate.rationale,
      acceptedByIdentityId: authorization.identity.id,
      acceptedAt,
    });
    if (input?.targetEntityId) {
      updateAcceptedCorpusEntityCurrentRevision(database, {
        entityId,
        currentRevisionId: revisionId,
      });
    }
    updateCorpusCandidateStatus(database, {
      candidateId: candidate.id,
      status: "accepted",
      updatedAt: acceptedAt,
    });
    return createdRevision;
  })();

  recordCorpusEvent({
    database,
    generateId,
    now,
    eventType: "corpus_candidate_accepted",
    actorIdentityId: authorization.identity.id,
    programId: authorization.program.id,
    targetId: candidate.id,
    outcome: "accepted",
  });

  return accepted({ acceptedCorpus: summarizeAcceptedCorpus(revision) });
}

function acceptNavigationCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const candidate = getCorpusCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("candidate_not_found");
  }
  if (candidate.status === "accepted") {
    return rejected("candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    return rejected("candidate_already_rejected");
  }

  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (!supportedNavigationCandidateKinds.has(candidate.candidateKind)) {
    return rejected("validation_failed");
  }
  if (candidate.candidateKind === "relationship_update" && input?.targetEntityId) {
    return rejected("validation_failed");
  }

  const targetEntity = input?.targetEntityId ? getAcceptedCorpusEntityRecord(database, input.targetEntityId) : null;
  if (input?.targetEntityId && !targetEntity) {
    return rejected("accepted_entity_not_found");
  }
  if (targetEntity && targetEntity.programId !== candidate.programId) {
    return rejected("accepted_entity_program_mismatch");
  }
  if (targetEntity && targetEntity.acceptedKind !== candidate.candidateKind) {
    return rejected("accepted_kind_mismatch");
  }

  const relationshipDrafts = candidate.relationshipDrafts ?? [];
  const draftValidation = validateNavigationRelationshipDrafts({
    database,
    programId: candidate.programId,
    candidateKind: candidate.candidateKind,
    relationshipDrafts,
  });
  if (draftValidation.status === "rejected") {
    return rejected(draftValidation.reason);
  }

  const acceptedAt = now().toISOString();
  try {
    const navigationChange = database.transaction(() => {
      const acceptedCorpus = createAcceptedNavigationCorpusForCandidate({
        database,
        generateId,
        authorization,
        candidate,
        targetEntity,
        acceptedAt,
      });
      updateCorpusCandidateStatus(database, {
        candidateId: candidate.id,
        status: "accepted",
        updatedAt: acceptedAt,
      });
      const acceptedRelationships = createAcceptedNavigationRelationshipsForDrafts({
        database,
        generateId,
        authorization,
        candidate,
        acceptedCorpus,
        relationshipDrafts,
        acceptedAt,
      });
      return {
        ...(acceptedCorpus ? { acceptedCorpus: summarizeAcceptedNavigationCorpus(acceptedCorpus) } : {}),
        acceptedRelationships: acceptedRelationships.map(summarizeAcceptedNavigationRelationship),
      };
    })();

    recordCorpusEvent({
      database,
      generateId,
      now,
      eventType: "corpus_candidate_accepted",
      actorIdentityId: authorization.identity.id,
      programId: authorization.program.id,
      targetId: candidate.id,
      outcome: "accepted",
    });

    return accepted({ navigationChange });
  } catch (error) {
    if (error instanceof StorageInvariantError) {
      return rejected(mapNavigationStorageRejection(error.reason));
    }
    throw error;
  }
}

function createAcceptedNavigationCorpusForCandidate({
  database,
  generateId,
  authorization,
  candidate,
  targetEntity,
  acceptedAt,
}) {
  if (candidate.candidateKind === "relationship_update") {
    return null;
  }

  const entityId = targetEntity?.id ?? generateId();
  const revisionId = generateId();
  if (!targetEntity) {
    createAcceptedCorpusEntityRecord(database, {
      id: entityId,
      programId: candidate.programId,
      acceptedKind: candidate.candidateKind,
      currentRevisionId: revisionId,
    });
  }

  const revision = createAcceptedCorpusRevisionRecord(database, {
    id: revisionId,
    entityId,
    programId: candidate.programId,
    acceptedKind: candidate.candidateKind,
    title: candidate.title,
    body: candidate.body,
    materialReferenceKind: candidate.materialReferenceKind ?? null,
    locator: candidate.locator ?? null,
    citation: candidate.citation ?? null,
    acceptedFromCandidateId: candidate.id,
    sourceIds: candidate.sourceIds,
    rationale: candidate.rationale,
    acceptedByIdentityId: authorization.identity.id,
    acceptedAt,
  });
  if (targetEntity) {
    updateAcceptedCorpusEntityCurrentRevision(database, {
      entityId,
      currentRevisionId: revisionId,
    });
  }

  return revision;
}

function createAcceptedNavigationRelationshipsForDrafts({
  database,
  generateId,
  authorization,
  candidate,
  acceptedCorpus,
  relationshipDrafts,
  acceptedAt,
}) {
  return relationshipDrafts.map(draft => {
    const resolvedDraft = resolveNavigationRelationshipDraft(database, {
      candidate,
      acceptedCorpus,
      draft,
    });
    const relationshipRevisionId = generateId();
    const relationshipId = generateId();
    createAcceptedNavigationRelationshipRecord(database, {
      id: relationshipId,
      programId: candidate.programId,
      relationshipKind: draft.relationshipKind,
      fromEntityId: resolvedDraft.fromEntity.id,
      toEntityId: resolvedDraft.toEntity.id,
      currentRevisionId: relationshipRevisionId,
    });
    return createAcceptedNavigationRelationshipRevisionRecord(database, {
      id: relationshipRevisionId,
      relationshipId,
      programId: candidate.programId,
      relationshipKind: draft.relationshipKind,
      fromEntityId: resolvedDraft.fromEntity.id,
      fromRevisionId: resolvedDraft.fromRevision.id,
      fromKind: resolvedDraft.fromEntity.acceptedKind,
      toEntityId: resolvedDraft.toEntity.id,
      toRevisionId: resolvedDraft.toRevision.id,
      toKind: resolvedDraft.toEntity.acceptedKind,
      label: draft.label?.trim() ?? null,
      sourceIds: draft.sourceIds ?? [],
      acceptedFromCandidateId: candidate.id,
      acceptedByIdentityId: authorization.identity.id,
      acceptedAt,
    });
  });
}

function listAcceptedAssessmentCriteria({ database, getEffectiveParticipation, input }) {
  const authorization = resolveAssessmentAcceptedReadAuthorization({
    database,
    getEffectiveParticipation,
    input,
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const entities = listAcceptedAssessmentCriterionEntityRecords(database, {
    programId: authorization.program.id,
    status: "active",
  });

  return accepted({
    acceptedAssessmentCriteria: entities.map($0 =>
      summarizeAcceptedAssessmentCriterion(getAcceptedAssessmentCriterionRevisionRecord(database, $0.currentRevisionId)),
    ),
  });
}

function listAcceptedOpenAnswerChecks({ database, getEffectiveParticipation, input }) {
  const authorization = resolveAssessmentAcceptedReadAuthorization({
    database,
    getEffectiveParticipation,
    input,
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const entities = listAcceptedOpenAnswerCheckEntityRecords(database, {
    programId: authorization.program.id,
    status: "active",
  });

  return accepted({
    acceptedOpenAnswerChecks: entities.map($0 =>
      summarizeAcceptedOpenAnswerCheck(getAcceptedOpenAnswerCheckRevisionRecord(database, $0.currentRevisionId)),
    ),
  });
}

function listQuickCheckDeliveries({ database, getEffectiveParticipation, input }) {
  const authorization = resolveQuickCheckDeliveryAuthorization({
    database,
    getEffectiveParticipation,
    input,
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const entities = listAcceptedQuickCheckEntityRecords(database, {
    programId: authorization.program.id,
    status: "active",
  });

  return accepted({
    quickCheckDeliveries: entities.map($0 =>
      summarizeQuickCheckDelivery(getAcceptedQuickCheckRevisionRecord(database, $0.currentRevisionId)),
    ),
  });
}

function setAcceptedCorpusLifecycleStatus({ database, getEffectiveParticipation, input, now }) {
  if (!new Set(["active", "withdrawn"]).has(input?.status)) {
    return rejected("validation_failed");
  }
  const entity = getAcceptedCorpusEntityRecord(database, input?.entityId);
  if (!entity) {
    return rejected("accepted_entity_not_found");
  }
  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: entity.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  if (
    input.status === "withdrawn" &&
    hasActiveCorpusEntityDependent(database, {
      acceptedKind: entity.acceptedKind,
      entityId: entity.id,
      programId: entity.programId,
    })
  ) {
    return rejected("entity_withdrawal_blocked");
  }

  const updated = setAcceptedCorpusEntityLifecycleStatusRecord(database, {
    entityId: entity.id,
    status: input.status,
    updatedByIdentityId: authorization.identity.id,
    updatedAt: now().toISOString(),
  });

  return accepted({
    entity: {
      id: updated.id,
      status: updated.status,
      updatedByIdentityId: updated.updatedByIdentityId,
      updatedAt: updated.updatedAt,
    },
  });
}

function setAcceptedNavigationRelationshipLifecycleStatus({ database, getEffectiveParticipation, input, now }) {
  if (!new Set(["active", "withdrawn"]).has(input?.status)) {
    return rejected("validation_failed");
  }
  const relationship = getAcceptedNavigationRelationshipLifecycleStatusRecord(database, input?.relationshipId);
  if (!relationship) {
    return rejected("accepted_entity_not_found");
  }
  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: relationship.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const updated = setAcceptedNavigationRelationshipLifecycleStatusRecord(database, {
    relationshipId: relationship.id,
    status: input.status,
    updatedByIdentityId: authorization.identity.id,
    updatedAt: now().toISOString(),
  });

  return accepted({
    entity: {
      id: updated.id,
      status: updated.status,
      updatedByIdentityId: updated.updatedByIdentityId,
      updatedAt: updated.updatedAt,
    },
  });
}

function setAcceptedAssessmentCriterionLifecycleStatus({ database, getEffectiveParticipation, input, now }) {
  if (!new Set(["active", "withdrawn"]).has(input?.status)) {
    return rejected("validation_failed");
  }
  const entity = getAcceptedAssessmentCriterionEntityLifecycleStatusRecord(database, input?.entityId);
  if (!entity) {
    return rejected("accepted_entity_not_found");
  }
  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: entity.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  if (
    input.status === "withdrawn" &&
    hasActiveAssessmentCriterionDependent(database, {
      entityId: entity.id,
      programId: entity.programId,
    })
  ) {
    return rejected("entity_withdrawal_blocked");
  }

  const updated = setAcceptedAssessmentCriterionEntityLifecycleStatusRecord(database, {
    entityId: entity.id,
    status: input.status,
    updatedByIdentityId: authorization.identity.id,
    updatedAt: now().toISOString(),
  });

  return accepted({
    entity: {
      id: updated.id,
      status: updated.status,
      updatedByIdentityId: updated.updatedByIdentityId,
      updatedAt: updated.updatedAt,
    },
  });
}

function setAcceptedQuickCheckLifecycleStatus({ database, getEffectiveParticipation, input, now }) {
  if (!new Set(["active", "withdrawn"]).has(input?.status)) {
    return rejected("validation_failed");
  }
  const entity = getAcceptedQuickCheckEntityLifecycleStatusRecord(database, input?.entityId);
  if (!entity) {
    return rejected("accepted_entity_not_found");
  }
  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: entity.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  if (
    input.status === "withdrawn" &&
    hasActiveLearnerEvidenceOwnerDependent(database, {
      evidenceOwnerKind: "accepted_quick_check",
      entityId: entity.id,
      programId: entity.programId,
    })
  ) {
    return rejected("entity_withdrawal_blocked");
  }

  const updated = setAcceptedQuickCheckEntityLifecycleStatusRecord(database, {
    entityId: entity.id,
    status: input.status,
    updatedByIdentityId: authorization.identity.id,
    updatedAt: now().toISOString(),
  });

  return accepted({
    entity: {
      id: updated.id,
      status: updated.status,
      updatedByIdentityId: updated.updatedByIdentityId,
      updatedAt: updated.updatedAt,
    },
  });
}

function setAcceptedOpenAnswerCheckLifecycleStatus({ database, getEffectiveParticipation, input, now }) {
  if (!new Set(["active", "withdrawn"]).has(input?.status)) {
    return rejected("validation_failed");
  }
  const entity = getAcceptedOpenAnswerCheckEntityLifecycleStatusRecord(database, input?.entityId);
  if (!entity) {
    return rejected("accepted_entity_not_found");
  }
  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: entity.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  if (
    input.status === "withdrawn" &&
    hasActiveLearnerEvidenceOwnerDependent(database, {
      evidenceOwnerKind: "accepted_open_answer_check",
      entityId: entity.id,
      programId: entity.programId,
    })
  ) {
    return rejected("entity_withdrawal_blocked");
  }

  const updated = setAcceptedOpenAnswerCheckEntityLifecycleStatusRecord(database, {
    entityId: entity.id,
    status: input.status,
    updatedByIdentityId: authorization.identity.id,
    updatedAt: now().toISOString(),
  });

  return accepted({
    entity: {
      id: updated.id,
      status: updated.status,
      updatedByIdentityId: updated.updatedByIdentityId,
      updatedAt: updated.updatedAt,
    },
  });
}

function setAcceptedReadinessCheckLifecycleStatus({ database, getEffectiveParticipation, input, now }) {
  if (!new Set(["active", "withdrawn"]).has(input?.status)) {
    return rejected("validation_failed");
  }
  const entity = getAcceptedReadinessCheckEntityLifecycleStatusRecord(database, input?.entityId);
  if (!entity) {
    return rejected("accepted_entity_not_found");
  }
  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: entity.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const updated = setAcceptedReadinessCheckEntityLifecycleStatusRecord(database, {
    entityId: entity.id,
    status: input.status,
    updatedByIdentityId: authorization.identity.id,
    updatedAt: now().toISOString(),
  });

  return accepted({
    entity: {
      id: updated.id,
      status: updated.status,
      updatedByIdentityId: updated.updatedByIdentityId,
      updatedAt: updated.updatedAt,
    },
  });
}

function hasActiveAssessmentCriterionDependent(database, { entityId, programId }) {
  return (
    hasActiveOpenAnswerCriterionDependent(database, { entityId, programId }) ||
    hasActiveLearnerEvidenceOwnerDependent(database, {
      evidenceOwnerKind: "accepted_assessment_criterion",
      entityId,
      programId,
    })
  );
}

function hasActiveOpenAnswerCriterionDependent(database, { entityId, programId }) {
  return listAcceptedOpenAnswerCheckEntityRecords(database, {
    programId,
    status: "active",
  }).some($0 => {
    const revision = getAcceptedOpenAnswerCheckRevisionRecord(database, $0.currentRevisionId);
    return revision?.criterionRevisionIds.some(
      $1 => getAcceptedAssessmentCriterionRevisionRecord(database, $1)?.entityId === entityId,
    );
  });
}

function hasActiveCorpusEntityDependent(database, { acceptedKind, entityId, programId }) {
  return (
    hasActiveReadinessRequirementDependent(database, {
      acceptedKind,
      entityId,
      programId,
    }) ||
    hasActiveNavigationRelationshipDependent(database, {
      entityId,
      programId,
    })
  );
}

function hasActiveReadinessRequirementDependent(database, { acceptedKind, entityId, programId }) {
  return listAcceptedReadinessCheckEntityRecords(database, {
    programId,
    status: "active",
  }).some($0 => {
    const revision = getAcceptedReadinessCheckRevisionRecord(database, $0.currentRevisionId);
    return revision?.requirements.some(
      $1 => $1.targetKind === acceptedKind && $1.targetId === entityId,
    );
  });
}

function hasActiveLearnerEvidenceOwnerDependent(database, { evidenceOwnerKind, entityId, programId }) {
  return listLearnerEvidenceTargetLinkRecords(database, { programId }).some(
    $0 => $0.evidenceOwnerKind === evidenceOwnerKind && $0.evidenceOwnerEntityId === entityId,
  );
}

function hasActiveNavigationRelationshipDependent(database, { entityId, programId }) {
  return listAcceptedNavigationRelationshipRecords(database, {
    programId,
    status: "active",
  }).some($0 => $0.fromEntityId === entityId || $0.toEntityId === entityId);
}

function listAcceptedCorpus({ database, getEffectiveParticipation, input }) {
  const authorization = resolveAcceptedPreviewAuthorization({
    database,
    input,
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const entities = listAcceptedCorpusEntityRecords(database, {
    programId: authorization.program.id,
    status: "active",
  }).filter($0 => input?.acceptedKind === undefined || $0.acceptedKind === input.acceptedKind);

  return accepted({
    acceptedCorpus: entities.map($0 =>
      summarizeAcceptedCorpus(getAcceptedCorpusRevisionRecord(database, $0.currentRevisionId)),
    ),
  });
}

function createLearnerEvidenceTargetLink({ database, generateId, getEffectiveParticipation, input, now }) {
  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input,
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const targetResolution = resolveLearnerEvidenceTarget(database, {
    programId: authorization.program.id,
    targetKind: input?.targetKind,
    targetId: input?.targetId,
  });
  if (targetResolution.status === "rejected") {
    return rejected(targetResolution.reason);
  }

  const evidenceOwnerResolution = resolveLearnerEvidenceOwner(database, {
    programId: authorization.program.id,
    evidenceOwnerKind: input?.evidenceOwnerKind,
    evidenceOwnerEntityId: input?.evidenceOwnerEntityId,
  });
  if (evidenceOwnerResolution.status === "rejected") {
    return rejected(evidenceOwnerResolution.reason);
  }

  const existingLink = listLearnerEvidenceTargetLinkRecords(database, {
    programId: authorization.program.id,
  }).find(
    $0 =>
      $0.targetKind === input.targetKind &&
      $0.targetId === input.targetId &&
      $0.evidenceOwnerKind === input.evidenceOwnerKind &&
      $0.evidenceOwnerEntityId === input.evidenceOwnerEntityId,
  );
  if (existingLink) {
    return accepted({ learnerEvidenceTargetLink: summarizeLearnerEvidenceTargetLink(existingLink) });
  }

  const timestamp = now().toISOString();
  const link = createLearnerEvidenceTargetLinkRecord(database, {
    id: generateId(),
    programId: authorization.program.id,
    targetKind: input.targetKind,
    targetId: input.targetId,
    evidenceOwnerKind: input.evidenceOwnerKind,
    evidenceOwnerEntityId: input.evidenceOwnerEntityId,
    createdByIdentityId: authorization.identity.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return accepted({ learnerEvidenceTargetLink: summarizeLearnerEvidenceTargetLink(link) });
}

function deleteLearnerEvidenceTargetLink({ database, getEffectiveParticipation, input, now }) {
  const link = getLearnerEvidenceTargetLinkRecord(database, input?.linkId);
  if (!link || link.status !== "active") {
    return rejected("learner_state_target_link_not_found");
  }

  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: link.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const deletedLink = deleteLearnerEvidenceTargetLinkRecord(database, {
    id: link.id,
    updatedAt: now().toISOString(),
  });

  return accepted({ learnerEvidenceTargetLink: summarizeLearnerEvidenceTargetLink(deletedLink) });
}

function listLearnerEvidenceTargetLinks({ database, getEffectiveParticipation, input }) {
  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input,
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({
    learnerEvidenceTargetLinks: listLearnerEvidenceTargetLinkRecords(database, {
      programId: authorization.program.id,
    }).map(summarizeLearnerEvidenceTargetLink),
  });
}

function listProgramNavigation({ database, getEffectiveParticipation, input }) {
  const authorization = resolveAcceptedPreviewAuthorization({
    database,
    input,
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const entities = listAcceptedCorpusEntityRecords(database, {
    programId: authorization.program.id,
    status: "active",
  });
  const activeEntityIds = new Set(entities.map($0 => $0.id));
  const currentRevisions = new Map(
    entities.map($0 => [$0.id, getAcceptedCorpusRevisionRecord(database, $0.currentRevisionId)]),
  );
  const currentRelationshipRevisions = listCurrentNavigationRelationshipRevisions(database, authorization.program.id, {
    activeEntityIds,
  });
  const groupedConceptIds = new Set(
    currentRelationshipRevisions
      .filter($0 => $0.relationshipKind === "topic_includes_concept")
      .map($0 => $0.toEntityId),
  );
  const groupedMaterialIds = new Set(
    currentRelationshipRevisions
      .filter($0 => $0.relationshipKind === "topic_uses_material" || $0.relationshipKind === "concept_uses_material")
      .map($0 => $0.toEntityId),
  );

  return accepted({
    navigation: {
      programId: authorization.program.id,
      topics: currentNavigationNodeSummaries(database, currentRevisions, $0 => $0.acceptedKind === "topic"),
      ungroupedConcepts: currentNavigationNodeSummaries(
        database,
        currentRevisions,
        $0 => $0.acceptedKind === "concept" && !groupedConceptIds.has($0.entityId),
      ),
      ungroupedMaterials: currentNavigationNodeSummaries(
        database,
        currentRevisions,
        $0 => $0.acceptedKind === "material_reference" && !groupedMaterialIds.has($0.entityId),
      ),
    },
  });
}

function getNavigationEntity({ database, getEffectiveParticipation, input }) {
  const entity = getAcceptedCorpusEntityLifecycleStatusRecord(database, input?.entityId);
  if (!entity || entity.status !== "active") {
    return rejected("navigation_entity_not_found");
  }
  const authorization = resolveAcceptedReadAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: entity.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const activeEntityIds = new Set(
    listAcceptedCorpusEntityRecords(database, {
      programId: entity.programId,
      status: "active",
    }).map($0 => $0.id),
  );
  const revision = getAcceptedCorpusRevisionRecord(database, entity.currentRevisionId);
  return accepted({
    navigationNode: summarizeStudentNavigationNode(
      database,
      revision,
      listCurrentNavigationRelationshipRevisions(database, entity.programId, { activeEntityIds }),
    ),
  });
}

function getNavigationRevision({ database, getEffectiveParticipation, input }) {
  const revision = getAcceptedCorpusRevisionRecord(database, input?.revisionId);
  if (!revision) {
    return rejected("navigation_revision_not_found");
  }
  const authorization = resolveAcceptedReadAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: revision.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const entity = getAcceptedCorpusEntityRecord(database, revision.entityId);
  return accepted({
    navigationRevision: summarizeStudentNavigationRevision(revision, {
      includeCurrentRevision: true,
      isCurrentRevision: entity?.currentRevisionId === revision.id,
      contentSignal: materialContentSignal(database, revision),
    }),
  });
}

function getAcceptedAssessmentCriterionRevision({ database, getEffectiveParticipation, input }) {
  const revision = getAcceptedAssessmentCriterionRevisionRecord(database, input?.revisionId);
  if (!revision) {
    return rejected("criterion_revision_not_found");
  }

  const authorization = resolveAssessmentAcceptedReadAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: revision.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({ acceptedAssessmentCriterion: summarizeAcceptedAssessmentCriterion(revision) });
}

function getAcceptedOpenAnswerCheckRevision({ database, getEffectiveParticipation, input }) {
  const revision = getAcceptedOpenAnswerCheckRevisionRecord(database, input?.revisionId);
  if (!revision) {
    return rejected("check_revision_not_found");
  }

  const authorization = resolveAssessmentAcceptedReadAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: revision.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({ acceptedOpenAnswerCheck: summarizeAcceptedOpenAnswerCheck(revision) });
}

function getAcceptedQuickCheckRevisionForCuration({ database, getEffectiveParticipation, input }) {
  const revision = getAcceptedQuickCheckRevisionRecord(database, input?.revisionId);
  if (!revision) {
    return rejected("quick_check_revision_not_found");
  }

  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: revision.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({ acceptedQuickCheck: summarizeAcceptedQuickCheck(revision) });
}

function listAcceptedQuickChecksForCuration({ database, getEffectiveParticipation, input }) {
  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input,
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const entities = listAcceptedQuickCheckEntityRecords(database, {
    programId: authorization.program.id,
    status: "active",
  });

  return accepted({
    acceptedQuickChecks: entities.map($0 =>
      summarizeAcceptedQuickCheck(getAcceptedQuickCheckRevisionRecord(database, $0.currentRevisionId)),
    ),
  });
}

function listAcceptedReadinessChecksForCuration({ database, getEffectiveParticipation, input }) {
  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input,
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const entities = listAcceptedReadinessCheckEntityRecords(database, {
    programId: authorization.program.id,
    status: "active",
  });

  return accepted({
    acceptedReadinessChecks: entities.map($0 =>
      summarizeAcceptedReadinessCheck(getAcceptedReadinessCheckRevisionRecord(database, $0.currentRevisionId)),
    ),
  });
}

function getAcceptedReadinessCheckRevisionForCuration({ database, getEffectiveParticipation, input }) {
  const revision = getAcceptedReadinessCheckRevisionRecord(database, input?.revisionId);
  if (!revision) {
    return rejected("readiness_revision_not_found");
  }

  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: revision.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({ acceptedReadinessCheck: summarizeAcceptedReadinessCheck(revision) });
}

function getQuickCheckDelivery({ database, getEffectiveParticipation, input }) {
  const revision = getAcceptedQuickCheckRevisionRecord(database, input?.revisionId);
  if (!revision) {
    return rejected("quick_check_revision_not_found");
  }

  const authorization = resolveQuickCheckDeliveryAuthorization({
    database,
    getEffectiveParticipation,
    input: { ...input, programId: input?.programId ?? revision.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (revision.programId !== authorization.program.id) {
    return rejected("quick_check_revision_program_mismatch");
  }

  return accepted({ quickCheckDelivery: summarizeQuickCheckDelivery(revision) });
}

function getAcceptedCorpusRevision({ database, getEffectiveParticipation, input }) {
  const revision = getAcceptedCorpusRevisionRecord(database, input?.revisionId);
  if (!revision) {
    return rejected("revision_not_found");
  }

  const authorization = resolveAcceptedReadAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: revision.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({ acceptedCorpus: summarizeAcceptedCorpus(revision) });
}

function createAssessmentCriterionCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const authorization = resolveAssessmentCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (
    !isNonEmptyText(input?.title) ||
    !isNonEmptyText(input?.body) ||
    !isValidOptionalText(input?.rationale) ||
    !isValidIdArray(input?.sourceIds)
  ) {
    return rejected("validation_failed");
  }

  const occurredAt = now().toISOString();
  try {
    const candidate = createAssessmentCriterionCandidateRecord(database, {
      id: generateId(),
      programId: authorization.program.id,
      title: input.title.trim(),
      body: input.body.trim(),
      sourceIds: input.sourceIds ?? [],
      rationale: input.rationale?.trim(),
      status: "draft",
      createdByIdentityId: authorization.identity.id,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });

    return accepted({ assessmentCriterionCandidate: summarizeAssessmentCriterionCandidate(candidate) });
  } catch (error) {
    if (error instanceof StorageInvariantError) {
      return rejected(mapAssessmentCriterionStorageRejection(error.reason));
    }
    throw error;
  }
}

function createOpenAnswerCheckCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const authorization = resolveAssessmentCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (
    !supportedCheckKinds.has(input?.checkKind) ||
    !isNonEmptyText(input?.title) ||
    !isNonEmptyText(input?.prompt) ||
    !isValidOptionalText(input?.rationale) ||
    !isValidIdArray(input?.sourceIds) ||
    !isNonEmptyIdArray(input?.criterionEntityIds)
  ) {
    return rejected("validation_failed");
  }

  const occurredAt = now().toISOString();
  try {
    const candidate = createOpenAnswerCheckCandidateRecord(database, {
      id: generateId(),
      programId: authorization.program.id,
      checkKind: input.checkKind,
      title: input.title.trim(),
      prompt: input.prompt.trim(),
      sourceIds: input.sourceIds ?? [],
      criterionEntityIds: input.criterionEntityIds,
      rationale: input.rationale?.trim(),
      status: "draft",
      createdByIdentityId: authorization.identity.id,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });

    return accepted({ openAnswerCheckCandidate: summarizeOpenAnswerCheckCandidate(candidate) });
  } catch (error) {
    if (error instanceof StorageInvariantError) {
      return rejected(mapAssessmentCriterionStorageRejection(error.reason));
    }
    throw error;
  }
}

function createQuickCheckCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const authorization = resolveAssessmentCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (
    !supportedQuickCheckKinds.has(input?.checkKind) ||
    !isNonEmptyText(input?.title) ||
    !isNonEmptyText(input?.prompt) ||
    !isValidOptionalText(input?.rationale) ||
    !isValidIdArray(input?.sourceIds) ||
    !isValidQuickCheckOptionTexts(input?.options) ||
    !Number.isInteger(input?.answerKeyIndex) ||
    input.answerKeyIndex < 0 ||
    input.answerKeyIndex >= input.options.length
  ) {
    return rejected("validation_failed");
  }

  const optionTexts = input.options.map($0 => $0.trim());
  const candidateId = generateId();
  const optionRecords = optionTexts.map($0 => ({ id: generateId(), text: $0 }));
  const occurredAt = now().toISOString();

  try {
    const candidate = createQuickCheckCandidateRecord(database, {
      id: candidateId,
      programId: authorization.program.id,
      checkKind: input.checkKind,
      title: input.title.trim(),
      prompt: input.prompt.trim(),
      options: optionRecords,
      answerKeyOptionId: optionRecords[input.answerKeyIndex].id,
      sourceIds: input.sourceIds ?? [],
      rationale: input.rationale?.trim(),
      status: "draft",
      createdByIdentityId: authorization.identity.id,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });

    return accepted({ quickCheckCandidate: summarizeQuickCheckCandidate(candidate) });
  } catch (error) {
    if (error instanceof StorageInvariantError) {
      return rejected(mapAssessmentCriterionStorageRejection(error.reason));
    }
    throw error;
  }
}

function createReadinessCheckCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const authorization = resolveCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const validation = validateReadinessCheckCandidateInput(input);
  if (validation.status === "rejected") {
    return rejected(validation.reason);
  }

  const candidateId = generateId();
  const occurredAt = now().toISOString();
  const requirements = input.requirements.map($0 => ({
    requirementId: generateId(),
    targetKind: $0.targetKind,
    targetId: $0.targetId,
    requiredLevel: $0.requiredLevel,
  }));

  try {
    const candidate = createReadinessCheckCandidateRecord(database, {
      id: candidateId,
      programId: authorization.program.id,
      title: input.title.trim(),
      scope: normalizeReadinessScope(input.scope),
      requirements,
      sourceIds: input.sourceIds ?? [],
      rationale: input.rationale?.trim(),
      status: "draft",
      createdByIdentityId: authorization.identity.id,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });

    return accepted({ readinessCheckCandidate: summarizeReadinessCheckCandidate(candidate) });
  } catch (error) {
    if (error instanceof StorageInvariantError) {
      return rejected(mapReadinessStorageRejection(error.reason));
    }
    throw error;
  }
}

function createCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const authorization = resolveCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    if (authorization.identity && authorization.program) {
      recordCorpusEvent({
        database,
        generateId,
        now,
        eventType: "corpus_candidate_created",
        actorIdentityId: authorization.identity.id,
        programId: authorization.program.id,
        outcome: "rejected",
        reason: authorization.reason,
      });
    }
    return rejected(authorization.reason);
  }

  if (
    !supportedCandidateKinds.has(input?.candidateKind) ||
    !isNonEmptyText(input?.title) ||
    !isValidOptionalText(input?.body) ||
    !isValidOptionalText(input?.rationale)
  ) {
    recordCorpusEvent({
      database,
      generateId,
      now,
      eventType: "corpus_candidate_created",
      actorIdentityId: authorization.identity.id,
      programId: authorization.program.id,
      outcome: "rejected",
      reason: "validation_failed",
    });
    return rejected("validation_failed");
  }

  const occurredAt = now().toISOString();
  try {
    const candidate = createCorpusCandidateRecord(database, {
      id: generateId(),
      programId: authorization.program.id,
      candidateKind: input.candidateKind,
      title: input.title.trim(),
      body: input.body?.trim(),
      sourceIds: input.sourceIds ?? [],
      rationale: input.rationale?.trim(),
      status: "draft",
      createdByIdentityId: authorization.identity.id,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });

    recordCorpusEvent({
      database,
      generateId,
      now,
      eventType: "corpus_candidate_created",
      actorIdentityId: authorization.identity.id,
      programId: authorization.program.id,
      targetId: candidate.id,
      outcome: "accepted",
    });

    return accepted({ corpusCandidate: summarizeCorpusCandidate(candidate) });
  } catch (error) {
    if (error instanceof StorageInvariantError) {
      const reason = mapCandidateStorageRejection(error.reason);
      recordCorpusEvent({
        database,
        generateId,
        now,
        eventType: "corpus_candidate_created",
        actorIdentityId: authorization.identity.id,
        programId: authorization.program.id,
        outcome: "rejected",
        reason,
      });
      return rejected(reason);
    }
    throw error;
  }
}

function createNavigationCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const authorization = resolveCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const validation = validateNavigationCandidateInput(input);
  if (validation.status === "rejected") {
    return rejected(validation.reason);
  }
  const draftValidation = validateNavigationRelationshipDrafts({
    database,
    programId: authorization.program.id,
    candidateKind: input.candidateKind,
    relationshipDrafts: input.relationshipDrafts ?? [],
  });
  if (draftValidation.status === "rejected") {
    return rejected(draftValidation.reason);
  }

  const occurredAt = now().toISOString();
  try {
    const candidate = createCorpusCandidateRecord(database, {
      id: generateId(),
      programId: authorization.program.id,
      candidateKind: input.candidateKind,
      title: input.title.trim(),
      body: input.body?.trim(),
      materialReferenceKind: input.materialReferenceKind ?? null,
      locator: input.locator?.trim() ?? null,
      citation: input.citation?.trim() ?? null,
      relationshipDrafts: summarizeNavigationRelationshipDrafts(input.relationshipDrafts ?? []),
      sourceIds: input.sourceIds ?? [],
      rationale: input.rationale?.trim(),
      status: "draft",
      createdByIdentityId: authorization.identity.id,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });

    recordCorpusEvent({
      database,
      generateId,
      now,
      eventType: "corpus_candidate_created",
      actorIdentityId: authorization.identity.id,
      programId: authorization.program.id,
      targetId: candidate.id,
      outcome: "accepted",
    });

    return accepted({ navigationCandidate: summarizeNavigationCandidate(candidate) });
  } catch (error) {
    if (error instanceof StorageInvariantError) {
      return rejected(mapCandidateStorageRejection(error.reason));
    }
    throw error;
  }
}

const supportedContentFormats = new Set(["markdown", "plain_text"]);

function validateWritableContent(input) {
  if (!isNonEmptyText(input?.content) || !supportedContentFormats.has(input?.contentFormat)) {
    return { ok: false, reason: "validation_failed" };
  }
  if (Buffer.byteLength(input.content, "utf8") > MAX_MATERIAL_CONTENT_BYTES) {
    return { ok: false, reason: "content_too_large" };
  }
  return { ok: true };
}

function resolveContentReadAuthorization({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity) {
    return { status: "rejected", reason: "identity_not_found" };
  }
  if (identity.state !== "active") {
    return { status: "rejected", reason: "identity_disabled" };
  }
  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return { status: "rejected", reason: "program_not_found" };
  }
  const studentParticipation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "student",
  });
  const curatorParticipation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "program_curator",
  });
  if (studentParticipation.allowed || curatorParticipation.allowed) {
    return { status: "accepted", identity, program };
  }
  return { status: "rejected", reason: "participation_required" };
}

function paginateContentRecord(record, input) {
  if (input?.limit === undefined) {
    return accepted({
      content: record.content,
      contentFormat: record.contentFormat,
      byteSize: record.byteSize,
    });
  }
  if (!Number.isInteger(input.limit) || input.limit <= 0) {
    return rejected("validation_failed");
  }
  let offset = 0;
  if (input.cursor !== undefined) {
    offset = Number(input.cursor);
    if (!Number.isInteger(offset) || offset < 0 || offset > record.content.length) {
      return rejected("validation_failed");
    }
  }
  const end = offset + input.limit;
  const chunk = record.content.slice(offset, end);
  const page = {
    content: chunk,
    contentFormat: record.contentFormat,
    byteSize: record.byteSize,
  };
  if (end < record.content.length) {
    page.nextCursor = String(end);
  }
  return accepted(page);
}

function summarizeSourceContent(record) {
  return {
    sourceId: record.sourceId,
    contentFormat: record.contentFormat,
    byteSize: record.byteSize,
    recordedByIdentityId: record.recordedByIdentityId,
    recordedAt: record.recordedAt,
  };
}

function setSourceContent({ database, getEffectiveParticipation, input, now }) {
  const source = getProgramSourceRecord(database, input?.sourceId);
  if (!source) {
    return rejected("source_not_found");
  }
  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: source.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  const validation = validateWritableContent(input);
  if (!validation.ok) {
    return rejected(validation.reason);
  }
  const record = setSourceContentRecord(database, {
    sourceId: source.id,
    content: input.content,
    contentFormat: input.contentFormat,
    recordedByIdentityId: authorization.identity.id,
    recordedAt: now().toISOString(),
  });
  return accepted({ sourceContent: summarizeSourceContent(record) });
}

function deleteSourceContent({ database, getEffectiveParticipation, input }) {
  const source = getProgramSourceRecord(database, input?.sourceId);
  if (!source) {
    return rejected("source_not_found");
  }
  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: source.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  deleteSourceContentRecord(database, source.id);
  return accepted({ sourceId: source.id });
}

function readSourceContent({ database, getEffectiveParticipation, input }) {
  const source = getProgramSourceRecord(database, input?.sourceId);
  if (!source) {
    return rejected("source_not_found");
  }
  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: source.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  const record = getSourceContentRecord(database, source.id);
  if (!record) {
    return rejected("content_not_found");
  }
  return paginateContentRecord(record, input);
}

function setAcceptedMaterialContent({ database, getEffectiveParticipation, input }) {
  const revision = getAcceptedCorpusRevisionRecord(database, input?.revisionId);
  if (!revision) {
    return rejected("accepted_revision_not_found");
  }
  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: revision.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  if (revision.acceptedKind !== "material_reference") {
    return rejected("validation_failed");
  }
  if (getAcceptedMaterialContentRecord(database, revision.id)) {
    return rejected("material_content_already_set");
  }
  const validation = validateWritableContent(input);
  if (!validation.ok) {
    return rejected(validation.reason);
  }
  const record = setAcceptedMaterialContentRecord(database, {
    revisionId: revision.id,
    content: input.content,
    contentFormat: input.contentFormat,
    sourceContentProvenance: input?.sourceContentProvenance ?? null,
  });
  return accepted({
    materialContent: {
      revisionId: record.revisionId,
      contentFormat: record.contentFormat,
      byteSize: record.byteSize,
    },
  });
}

function deleteAcceptedMaterialContent({ database, getEffectiveParticipation, input, now }) {
  const revision = getAcceptedCorpusRevisionRecord(database, input?.revisionId);
  if (!revision) {
    return rejected("accepted_revision_not_found");
  }
  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: revision.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  if (revision.acceptedKind !== "material_reference") {
    return rejected("validation_failed");
  }
  if (!getAcceptedMaterialContentRecord(database, revision.id)) {
    return rejected("content_not_found");
  }
  if (hasActiveMaterialEvidenceTarget(database, revision)) {
    if (
      hasActiveCorpusEntityDependent(database, {
        acceptedKind: revision.acceptedKind,
        entityId: revision.entityId,
        programId: revision.programId,
      })
    ) {
      return rejected("entity_withdrawal_blocked");
    }

    const updated = setAcceptedCorpusEntityLifecycleStatusRecord(database, {
      entityId: revision.entityId,
      status: "withdrawn",
      updatedByIdentityId: authorization.identity.id,
      updatedAt: now().toISOString(),
    });
    return accepted({
      materialContent: {
        revisionId: revision.id,
        deletionMode: "withdrawn",
        entityId: updated.id,
        status: updated.status,
        updatedByIdentityId: updated.updatedByIdentityId,
        updatedAt: updated.updatedAt,
      },
    });
  }

  deleteAcceptedMaterialContentRecord(database, revision.id);
  return accepted({
    materialContent: {
      revisionId: revision.id,
      deletionMode: "hard_deleted",
    },
  });
}

function readMaterialContent({ database, getEffectiveParticipation, input }) {
  const entity = getAcceptedCorpusEntityRecord(database, input?.entityId);
  if (!entity) {
    return rejected("navigation_entity_not_found");
  }
  const authorization = resolveContentReadAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: entity.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  const record = getAcceptedMaterialContentRecord(database, entity.currentRevisionId);
  if (!record) {
    return rejected("content_not_found");
  }
  return paginateContentRecord(record, input);
}

function readMaterialRevisionContent({ database, getEffectiveParticipation, input }) {
  const revision = getAcceptedCorpusRevisionRecord(database, input?.revisionId);
  if (!revision) {
    return rejected("navigation_revision_not_found");
  }
  const authorization = resolveContentReadAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: revision.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  const record = getAcceptedMaterialContentRecord(database, revision.id);
  if (!record) {
    return rejected("content_not_found");
  }
  return paginateContentRecord(record, input);
}

function recordProgramSource({ database, generateId, getEffectiveParticipation, input, now }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity) {
    return rejected("identity_not_found");
  }

  const program = getProgramShellRecord(database, input?.programId);

  if (identity.state !== "active") {
    if (program) {
      recordCorpusEvent({
        database,
        generateId,
        now,
        actorIdentityId: identity.id,
        programId: program.id,
        outcome: "rejected",
        reason: "identity_disabled",
      });
    }
    return rejected("identity_disabled");
  }

  if (!program) {
    return rejected("program_not_found");
  }

  const participation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "program_curator",
  });

  if (!participation.allowed) {
    recordCorpusEvent({
      database,
      generateId,
      now,
      actorIdentityId: identity.id,
      programId: program.id,
      outcome: "rejected",
      reason: "admin_or_curator_required",
    });
    return rejected("admin_or_curator_required");
  }

  if (
    !supportedSourceKinds.has(input?.sourceKind) ||
    !isNonEmptyText(input?.title) ||
    !isValidOptionalText(input?.locator) ||
    !isValidOptionalText(input?.citation)
  ) {
    recordCorpusEvent({
      database,
      generateId,
      now,
      actorIdentityId: identity.id,
      programId: program.id,
      outcome: "rejected",
      reason: "validation_failed",
    });
    return rejected("validation_failed");
  }

  const recordedAt = now().toISOString();
  const source = createProgramSourceRecord(database, {
    id: generateId(),
    programId: program.id,
    sourceKind: input.sourceKind,
    title: input.title.trim(),
    locator: input.locator?.trim(),
    citation: input.citation?.trim(),
    recordedByIdentityId: identity.id,
    recordedAt,
  });

  recordCorpusEvent({
    database,
    generateId,
    now,
    actorIdentityId: identity.id,
    programId: program.id,
    targetId: source.id,
    outcome: "accepted",
  });

  return accepted({ programSource: summarizeProgramSource(source) });
}

function setProgramSourceLifecycleStatus({ database, getEffectiveParticipation, input, now }) {
  if (!new Set(["active", "withdrawn"]).has(input?.status)) {
    return rejected("validation_failed");
  }
  const source = getProgramSourceLifecycleStatusRecord(database, input?.sourceId);
  if (!source) {
    return rejected("source_not_found");
  }
  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: source.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const updated = setProgramSourceLifecycleStatusRecord(database, {
    sourceId: source.id,
    status: input.status,
    updatedByIdentityId: authorization.identity.id,
    updatedAt: now().toISOString(),
  });

  return accepted({
    source: {
      id: updated.id,
      status: updated.status,
      updatedByIdentityId: updated.updatedByIdentityId,
      updatedAt: updated.updatedAt,
    },
  });
}

function deleteProgramSource({ database, getEffectiveParticipation, input }) {
  const source = getProgramSourceLifecycleStatusRecord(database, input?.sourceId);
  if (!source) {
    return rejected("source_not_found");
  }
  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: source.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  if (isProgramSourceReferencedByAcceptedCorpus(database, source.id)) {
    return rejected("source_hard_delete_blocked");
  }

  deleteSourceContentRecord(database, source.id);
  deleteProgramSourceRecord(database, source.id);

  return accepted({
    source: {
      id: source.id,
    },
  });
}

function listProgramSources({ database, getEffectiveParticipation, input }) {
  const authorization = resolveCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({
    programSources: listProgramSourceRecords(database, {
      programId: authorization.program.id,
      status: "active",
    }).map(summarizeProgramSource),
  });
}

function listAssessmentCriterionCandidates({ database, getEffectiveParticipation, input }) {
  const authorization = resolveAssessmentCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  if (input?.status !== undefined && !supportedAssessmentCandidateStatuses.has(input.status)) {
    return rejected("validation_failed");
  }

  return accepted({
    assessmentCriterionCandidates: listAssessmentCriterionCandidateRecords(database, {
      programId: authorization.program.id,
      status: input?.status ?? null,
    }).map(summarizeAssessmentCriterionCandidate),
  });
}

function listOpenAnswerCheckCandidates({ database, getEffectiveParticipation, input }) {
  const authorization = resolveAssessmentCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  if (input?.status !== undefined && !supportedAssessmentCandidateStatuses.has(input.status)) {
    return rejected("validation_failed");
  }

  return accepted({
    openAnswerCheckCandidates: listOpenAnswerCheckCandidateRecords(database, {
      programId: authorization.program.id,
      status: input?.status ?? null,
    }).map(summarizeOpenAnswerCheckCandidate),
  });
}

function listQuickCheckCandidates({ database, getEffectiveParticipation, input }) {
  const authorization = resolveAssessmentCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  if (input?.status !== undefined && !supportedAssessmentCandidateStatuses.has(input.status)) {
    return rejected("validation_failed");
  }

  return accepted({
    quickCheckCandidates: listQuickCheckCandidateRecords(database, {
      programId: authorization.program.id,
      status: input?.status ?? null,
    }).map(summarizeQuickCheckCandidate),
  });
}

function listReadinessCheckCandidates({ database, getEffectiveParticipation, input }) {
  const authorization = resolveCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  if (input?.status !== undefined && !supportedAssessmentCandidateStatuses.has(input.status)) {
    return rejected("validation_failed");
  }

  return accepted({
    readinessCheckCandidates: listReadinessCheckCandidateRecords(database, {
      programId: authorization.program.id,
      status: input?.status ?? null,
    }).map(summarizeReadinessCheckCandidate),
  });
}

function listCorpusCandidates({ database, getEffectiveParticipation, input }) {
  const authorization = resolveCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({
    corpusCandidates: listCorpusCandidateRecords(database, {
      programId: authorization.program.id,
      status: input?.status ?? null,
    }).map(summarizeCorpusCandidate),
  });
}

function listNavigationCandidates({ database, getEffectiveParticipation, input }) {
  const authorization = resolveCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }
  if (input?.status !== undefined && !supportedAssessmentCandidateStatuses.has(input.status)) {
    return rejected("validation_failed");
  }

  return accepted({
    navigationCandidates: listCorpusCandidateRecords(database, {
      programId: authorization.program.id,
      status: input?.status ?? null,
    })
      .filter($0 => supportedNavigationCandidateKinds.has($0.candidateKind))
      .map(summarizeNavigationCandidate),
  });
}

function listCorpusEvents({ database, getEffectiveParticipation, input }) {
  const authorization = resolveCuratorAuthorization({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({
    corpusEvents: listCorpusEventRecords(database, {
      programId: authorization.program.id,
    }).map(summarizeCorpusEvent),
  });
}

function rejectAssessmentCriterionCandidate({ database, getEffectiveParticipation, input, now }) {
  const candidate = getAssessmentCriterionCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("criterion_candidate_not_found");
  }

  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (candidate.status === "accepted") {
    return rejected("criterion_candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    return rejected("criterion_candidate_already_rejected");
  }

  const updated = updateAssessmentCriterionCandidateStatus(database, {
    candidateId: candidate.id,
    status: "rejected",
    updatedAt: now().toISOString(),
  });

  return accepted({ assessmentCriterionCandidate: summarizeAssessmentCriterionCandidate(updated) });
}

function rejectOpenAnswerCheckCandidate({ database, getEffectiveParticipation, input, now }) {
  const candidate = getOpenAnswerCheckCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("check_candidate_not_found");
  }

  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (candidate.status === "accepted") {
    return rejected("check_candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    return rejected("check_candidate_already_rejected");
  }

  const updated = updateOpenAnswerCheckCandidateStatus(database, {
    candidateId: candidate.id,
    status: "rejected",
    updatedAt: now().toISOString(),
  });

  return accepted({ openAnswerCheckCandidate: summarizeOpenAnswerCheckCandidate(updated) });
}

function rejectQuickCheckCandidate({ database, getEffectiveParticipation, input, now }) {
  const candidate = getQuickCheckCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("quick_check_candidate_not_found");
  }

  const authorization = resolveAssessmentCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (candidate.status === "accepted") {
    return rejected("quick_check_candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    return rejected("quick_check_candidate_already_rejected");
  }

  const updated = updateQuickCheckCandidateStatus(database, {
    candidateId: candidate.id,
    status: "rejected",
    updatedAt: now().toISOString(),
  });

  return accepted({ quickCheckCandidate: summarizeQuickCheckCandidate(updated) });
}

function rejectReadinessCheckCandidate({ database, getEffectiveParticipation, input, now }) {
  const candidate = getReadinessCheckCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("readiness_candidate_not_found");
  }

  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (candidate.status === "accepted") {
    return rejected("readiness_candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    return rejected("readiness_candidate_already_rejected");
  }

  const updated = updateReadinessCheckCandidateStatus(database, {
    candidateId: candidate.id,
    status: "rejected",
    updatedAt: now().toISOString(),
  });

  return accepted({ readinessCheckCandidate: summarizeReadinessCheckCandidate(updated) });
}

function rejectCorpusCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const candidate = getCorpusCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("candidate_not_found");
  }

  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    if (authorization.identity && authorization.program) {
      recordCorpusEvent({
        database,
        generateId,
        now,
        eventType: "corpus_candidate_rejected",
        actorIdentityId: authorization.identity.id,
        programId: authorization.program.id,
        targetId: candidate.id,
        outcome: "rejected",
        reason: authorization.reason,
      });
    }
    return rejected(authorization.reason);
  }

  if (candidate.status === "accepted") {
    recordRejectedCandidateEvent({
      database,
      eventType: "corpus_candidate_rejected",
      generateId,
      now,
      authorization,
      candidate,
      reason: "candidate_already_accepted",
    });
    return rejected("candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    recordRejectedCandidateEvent({
      database,
      eventType: "corpus_candidate_rejected",
      generateId,
      now,
      authorization,
      candidate,
      reason: "candidate_already_rejected",
    });
    return rejected("candidate_already_rejected");
  }

  const updated = updateCorpusCandidateStatus(database, {
    candidateId: candidate.id,
    status: "rejected",
    updatedAt: now().toISOString(),
  });
  recordCorpusEvent({
    database,
    generateId,
    now,
    eventType: "corpus_candidate_rejected",
    actorIdentityId: authorization.identity.id,
    programId: authorization.program.id,
    targetId: updated.id,
    outcome: "accepted",
  });

  return accepted({ corpusCandidate: summarizeCorpusCandidate(updated) });
}

function rejectNavigationCandidate({ database, generateId, getEffectiveParticipation, input, now }) {
  const candidate = getCorpusCandidateRecord(database, input?.candidateId);
  if (!candidate) {
    return rejected("candidate_not_found");
  }
  if (!supportedNavigationCandidateKinds.has(candidate.candidateKind)) {
    return rejected("validation_failed");
  }

  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  if (candidate.status === "accepted") {
    return rejected("candidate_already_accepted");
  }
  if (candidate.status === "rejected") {
    return rejected("candidate_already_rejected");
  }

  const updated = updateCorpusCandidateStatus(database, {
    candidateId: candidate.id,
    status: "rejected",
    updatedAt: now().toISOString(),
  });
  recordCorpusEvent({
    database,
    generateId,
    now,
    eventType: "corpus_candidate_rejected",
    actorIdentityId: authorization.identity.id,
    programId: authorization.program.id,
    targetId: updated.id,
    outcome: "accepted",
  });

  return accepted({ navigationCandidate: summarizeNavigationCandidate(updated) });
}

function resolveAssessmentCuratorAuthorization({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return { status: "rejected", reason: "identity_not_active" };
  }
  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return { status: "rejected", reason: "program_not_found" };
  }

  const participation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "program_curator",
  });
  if (!participation.allowed) {
    return { status: "rejected", reason: "admin_or_curator_required" };
  }

  return { status: "accepted", identity, program };
}

function resolveLearnerEvidenceTarget(database, { programId, targetKind, targetId }) {
  if (
    !supportedLearnerEvidenceTargetKinds.has(targetKind) ||
    !isNonEmptyText(targetId)
  ) {
    return { status: "rejected", reason: "learner_state_target_not_found" };
  }

  const entity = getAcceptedCorpusEntityRecord(database, targetId);
  if (!entity) {
    return { status: "rejected", reason: "learner_state_target_not_found" };
  }
  if (entity.programId !== programId) {
    return { status: "rejected", reason: "learner_state_target_program_mismatch" };
  }
  if (entity.acceptedKind !== targetKind) {
    return { status: "rejected", reason: "learner_state_target_not_found" };
  }

  const revision = getAcceptedCorpusRevisionRecord(database, entity.currentRevisionId);
  if (!revision || revision.programId !== programId || revision.acceptedKind !== targetKind) {
    return { status: "rejected", reason: "learner_state_target_not_found" };
  }

  return { status: "accepted", entity, revision };
}

function resolveLearnerEvidenceOwner(
  database,
  { programId, evidenceOwnerKind, evidenceOwnerEntityId },
) {
  if (
    !supportedLearnerEvidenceOwnerKinds.has(evidenceOwnerKind) ||
    !isNonEmptyText(evidenceOwnerEntityId)
  ) {
    return { status: "rejected", reason: "learner_state_evidence_owner_not_found" };
  }

  if (evidenceOwnerKind === "accepted_quick_check") {
    return resolveLearnerEvidenceQuickCheckOwner(database, { programId, evidenceOwnerEntityId });
  }
  if (evidenceOwnerKind === "accepted_open_answer_check") {
    return resolveLearnerEvidenceOpenAnswerCheckOwner(database, { programId, evidenceOwnerEntityId });
  }

  return resolveLearnerEvidenceAssessmentCriterionOwner(database, { programId, evidenceOwnerEntityId });
}

function resolveLearnerEvidenceQuickCheckOwner(database, { programId, evidenceOwnerEntityId }) {
  const entity = getAcceptedQuickCheckEntityRecord(database, evidenceOwnerEntityId);
  if (!entity) {
    return { status: "rejected", reason: "learner_state_evidence_owner_not_found" };
  }
  if (entity.programId !== programId) {
    return { status: "rejected", reason: "learner_state_evidence_owner_program_mismatch" };
  }

  const revision = getAcceptedQuickCheckRevisionRecord(database, entity.currentRevisionId);
  if (!revision || revision.programId !== programId) {
    return { status: "rejected", reason: "learner_state_evidence_owner_not_found" };
  }

  return { status: "accepted", entity, revision };
}

function resolveLearnerEvidenceOpenAnswerCheckOwner(database, { programId, evidenceOwnerEntityId }) {
  const entity = getAcceptedOpenAnswerCheckEntityRecord(database, evidenceOwnerEntityId);
  if (!entity) {
    return { status: "rejected", reason: "learner_state_evidence_owner_not_found" };
  }
  if (entity.programId !== programId) {
    return { status: "rejected", reason: "learner_state_evidence_owner_program_mismatch" };
  }

  const revision = getAcceptedOpenAnswerCheckRevisionRecord(database, entity.currentRevisionId);
  if (!revision || revision.programId !== programId) {
    return { status: "rejected", reason: "learner_state_evidence_owner_not_found" };
  }

  return { status: "accepted", entity, revision };
}

function resolveLearnerEvidenceAssessmentCriterionOwner(database, { programId, evidenceOwnerEntityId }) {
  const entity = getAcceptedAssessmentCriterionEntityRecord(database, evidenceOwnerEntityId);
  if (!entity) {
    return { status: "rejected", reason: "learner_state_evidence_owner_not_found" };
  }
  if (entity.programId !== programId) {
    return { status: "rejected", reason: "learner_state_evidence_owner_program_mismatch" };
  }

  const revision = getAcceptedAssessmentCriterionRevisionRecord(database, entity.currentRevisionId);
  if (!revision || revision.programId !== programId) {
    return { status: "rejected", reason: "learner_state_evidence_owner_not_found" };
  }

  return { status: "accepted", entity, revision };
}

function resolveAssessmentAcceptedReadAuthorization({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return { status: "rejected", reason: "identity_not_active" };
  }

  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return { status: "rejected", reason: "program_not_found" };
  }

  if (isEffectiveAdmin(database, identity.id)) {
    return { status: "accepted", identity, program };
  }

  const studentParticipation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "student",
  });
  const curatorParticipation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "program_curator",
  });

  if (studentParticipation.allowed || curatorParticipation.allowed) {
    return { status: "accepted", identity, program };
  }

  return { status: "rejected", reason: "participation_required" };
}

function resolveQuickCheckDeliveryAuthorization({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return { status: "rejected", reason: "identity_not_active" };
  }

  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return { status: "rejected", reason: "program_not_found" };
  }

  const studentParticipation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "student",
  });
  if (studentParticipation.allowed) {
    return { status: "accepted", identity, program };
  }

  return { status: "rejected", reason: "participation_required" };
}

function resolveCuratorAuthorization({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity) {
    return { status: "rejected", reason: "identity_not_found" };
  }
  const program = getProgramShellRecord(database, input?.programId);

  if (identity.state !== "active") {
    return { status: "rejected", reason: "identity_disabled", identity, program };
  }

  if (!program) {
    return { status: "rejected", reason: "program_not_found" };
  }

  const participation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "program_curator",
  });
  if (!participation.allowed) {
    return { status: "rejected", reason: "admin_or_curator_required", identity, program };
  }

  return { status: "accepted", identity, program };
}

function resolveAcceptedPreviewAuthorization({ database, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity) {
    return { status: "rejected", reason: "identity_not_found" };
  }
  if (identity.state !== "active") {
    return { status: "rejected", reason: "identity_disabled" };
  }

  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return { status: "rejected", reason: "program_not_found" };
  }

  return { status: "accepted", identity, program };
}

function resolveAcceptedReadAuthorization({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity) {
    return { status: "rejected", reason: "identity_not_found" };
  }
  if (identity.state !== "active") {
    return { status: "rejected", reason: "identity_disabled" };
  }

  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return { status: "rejected", reason: "program_not_found" };
  }

  if (isEffectiveAdmin(database, identity.id)) {
    return { status: "accepted", identity, program };
  }

  const studentParticipation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "student",
  });
  const curatorParticipation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "program_curator",
  });

  if (studentParticipation.allowed || curatorParticipation.allowed) {
    return { status: "accepted", identity, program };
  }

  return { status: "rejected", reason: "participation_required" };
}

function recordCorpusEvent({
  database,
  generateId,
  now,
  eventType = "program_source_recorded",
  actorIdentityId,
  programId,
  targetId = null,
  outcome,
  reason = null,
}) {
  createCorpusEventRecord(database, {
    id: generateId(),
    eventType,
    actorIdentityId,
    programId,
    targetId,
    occurredAt: now().toISOString(),
    outcome,
    reason,
  });
}

function recordRejectedCandidateEventIfResolved({
  database,
  eventType,
  generateId,
  getEffectiveParticipation,
  input,
  candidate,
  now,
  reason,
}) {
  const authorization = resolveCuratorAuthorization({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: candidate.programId },
  });
  recordRejectedCandidateEvent({
    database,
    eventType,
    generateId,
    now,
    authorization,
    candidate,
    reason,
  });
}

function recordRejectedCandidateEvent({
  database,
  eventType,
  generateId,
  now,
  authorization,
  candidate,
  reason,
}) {
  if (!authorization.identity || !authorization.program) {
    return;
  }

  recordCorpusEvent({
    database,
    generateId,
    now,
    eventType,
    actorIdentityId: authorization.identity.id,
    programId: authorization.program.id,
    targetId: candidate.id,
    outcome: "rejected",
    reason,
  });
}

function summarizeAssessmentCriterionCandidate(candidate) {
  const summary = {
    candidateId: candidate.id,
    programId: candidate.programId,
    title: candidate.title,
    body: candidate.body,
    sourceIds: candidate.sourceIds,
    status: candidate.status,
    createdByIdentityId: candidate.createdByIdentityId,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };

  if (candidate.rationale !== null) {
    summary.rationale = candidate.rationale;
  }

  return summary;
}

function summarizeProgramSource(source) {
  const summary = {
    sourceId: source.id,
    programId: source.programId,
    sourceKind: source.sourceKind,
    title: source.title,
    recordedByIdentityId: source.recordedByIdentityId,
    recordedAt: source.recordedAt,
  };

  if (source.locator !== null) {
    summary.locator = source.locator;
  }
  if (source.citation !== null) {
    summary.citation = source.citation;
  }

  return summary;
}

function summarizeOpenAnswerCheckCandidate(candidate) {
  const summary = {
    candidateId: candidate.id,
    programId: candidate.programId,
    checkKind: candidate.checkKind,
    title: candidate.title,
    prompt: candidate.prompt,
    sourceIds: candidate.sourceIds,
    criterionEntityIds: candidate.criterionEntityIds,
    status: candidate.status,
    createdByIdentityId: candidate.createdByIdentityId,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };

  if (candidate.rationale !== null) {
    summary.rationale = candidate.rationale;
  }

  return summary;
}

function summarizeQuickCheckCandidate(candidate) {
  const summary = {
    candidateId: candidate.id,
    programId: candidate.programId,
    checkKind: candidate.checkKind,
    title: candidate.title,
    prompt: candidate.prompt,
    options: candidate.options.map($0 => ({ optionId: $0.id, text: $0.text })),
    answerKeyOptionId: candidate.answerKeyOptionId,
    sourceIds: candidate.sourceIds,
    status: candidate.status,
    createdByIdentityId: candidate.createdByIdentityId,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };

  if (candidate.rationale !== null) {
    summary.rationale = candidate.rationale;
  }

  return summary;
}

function summarizeReadinessCheckCandidate(candidate) {
  const summary = {
    candidateId: candidate.id,
    programId: candidate.programId,
    title: candidate.title,
    scope: candidate.scope,
    requirements: candidate.requirements,
    sourceIds: candidate.sourceIds,
    status: candidate.status,
    createdByIdentityId: candidate.createdByIdentityId,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };

  if (candidate.rationale !== null) {
    summary.rationale = candidate.rationale;
  }

  return summary;
}

function summarizeCorpusCandidate(candidate) {
  const summary = {
    candidateId: candidate.id,
    programId: candidate.programId,
    candidateKind: candidate.candidateKind,
    title: candidate.title,
    sourceIds: candidate.sourceIds,
    status: candidate.status,
    createdByIdentityId: candidate.createdByIdentityId,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };

  if (candidate.body !== null) {
    summary.body = candidate.body;
  }
  if (candidate.rationale !== null) {
    summary.rationale = candidate.rationale;
  }

  return summary;
}

function summarizeAcceptedAssessmentCriterion(revision) {
  const summary = {
    entityId: revision.entityId,
    revisionId: revision.id,
    programId: revision.programId,
    title: revision.title,
    body: revision.body,
    acceptedFromCandidateId: revision.acceptedFromCandidateId,
    sourceIds: revision.sourceIds,
    acceptedByIdentityId: revision.acceptedByIdentityId,
    acceptedAt: revision.acceptedAt,
  };

  if (revision.rationale !== null) {
    summary.rationale = revision.rationale;
  }

  return summary;
}

function summarizeAcceptedOpenAnswerCheck(revision) {
  const summary = {
    entityId: revision.entityId,
    revisionId: revision.id,
    programId: revision.programId,
    checkKind: revision.checkKind,
    title: revision.title,
    prompt: revision.prompt,
    acceptedFromCandidateId: revision.acceptedFromCandidateId,
    sourceIds: revision.sourceIds,
    criterionRevisionIds: revision.criterionRevisionIds,
    acceptedByIdentityId: revision.acceptedByIdentityId,
    acceptedAt: revision.acceptedAt,
  };

  if (revision.rationale !== null) {
    summary.rationale = revision.rationale;
  }

  return summary;
}

function summarizeAcceptedQuickCheck(revision) {
  const summary = {
    entityId: revision.entityId,
    revisionId: revision.id,
    programId: revision.programId,
    checkKind: revision.checkKind,
    title: revision.title,
    prompt: revision.prompt,
    options: revision.options.map($0 => ({ optionId: $0.id, text: $0.text })),
    answerKeyOptionId: revision.answerKeyOptionId,
    acceptedFromCandidateId: revision.acceptedFromCandidateId,
    sourceIds: revision.sourceIds,
    acceptedByIdentityId: revision.acceptedByIdentityId,
    acceptedAt: revision.acceptedAt,
  };

  if (revision.rationale !== null) {
    summary.rationale = revision.rationale;
  }

  return summary;
}

function summarizeAcceptedReadinessCheck(revision) {
  const summary = {
    entityId: revision.entityId,
    revisionId: revision.id,
    programId: revision.programId,
    title: revision.title,
    scope: revision.scope,
    requirements: revision.requirements,
    acceptedFromCandidateId: revision.acceptedFromCandidateId,
    sourceIds: revision.sourceIds,
    acceptedByIdentityId: revision.acceptedByIdentityId,
    acceptedAt: revision.acceptedAt,
  };

  if (revision.rationale !== null) {
    summary.rationale = revision.rationale;
  }

  return summary;
}

function summarizeQuickCheckDelivery(revision) {
  return {
    entityId: revision.entityId,
    revisionId: revision.id,
    programId: revision.programId,
    checkKind: revision.checkKind,
    title: revision.title,
    prompt: revision.prompt,
    options: revision.options.map($0 => ({ optionId: $0.id, text: $0.text })),
  };
}

function summarizeAcceptedCorpus(revision) {
  const summary = {
    entityId: revision.entityId,
    revisionId: revision.id,
    programId: revision.programId,
    acceptedKind: revision.acceptedKind,
    title: revision.title,
    acceptedFromCandidateId: revision.acceptedFromCandidateId,
    sourceIds: revision.sourceIds,
    acceptedByIdentityId: revision.acceptedByIdentityId,
    acceptedAt: revision.acceptedAt,
  };

  if (revision.body !== null) {
    summary.body = revision.body;
  }
  if (revision.rationale !== null) {
    summary.rationale = revision.rationale;
  }
  if (revision.materialReferenceKind !== undefined) {
    summary.materialReferenceKind = revision.materialReferenceKind;
  }
  if (revision.locator !== undefined) {
    summary.locator = revision.locator;
  }
  if (revision.citation !== undefined) {
    summary.citation = revision.citation;
  }

  return summary;
}

function summarizeLearnerEvidenceTargetLink(link) {
  return {
    linkId: link.id,
    programId: link.programId,
    targetKind: link.targetKind,
    targetId: link.targetId,
    evidenceOwnerKind: link.evidenceOwnerKind,
    evidenceOwnerEntityId: link.evidenceOwnerEntityId,
    status: link.status,
    createdByIdentityId: link.createdByIdentityId,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

function summarizeNavigationCandidate(candidate) {
  const summary = {
    candidateId: candidate.id,
    programId: candidate.programId,
    candidateKind: candidate.candidateKind,
    title: candidate.title,
    sourceIds: candidate.sourceIds,
    relationshipDrafts: candidate.relationshipDrafts ?? [],
    status: candidate.status,
    createdByIdentityId: candidate.createdByIdentityId,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };

  if (candidate.body !== null) {
    summary.body = candidate.body;
  }
  if (candidate.materialReferenceKind !== undefined) {
    summary.materialReferenceKind = candidate.materialReferenceKind;
  }
  if (candidate.locator !== undefined) {
    summary.locator = candidate.locator;
  }
  if (candidate.citation !== undefined) {
    summary.citation = candidate.citation;
  }
  if (candidate.rationale !== null) {
    summary.rationale = candidate.rationale;
  }

  return summary;
}

function summarizeAcceptedNavigationCorpus(revision) {
  const summary = {
    entityId: revision.entityId,
    revisionId: revision.id,
    programId: revision.programId,
    acceptedKind: revision.acceptedKind,
    title: revision.title,
    sourceIds: revision.sourceIds,
    acceptedFromCandidateId: revision.acceptedFromCandidateId,
    acceptedByIdentityId: revision.acceptedByIdentityId,
    acceptedAt: revision.acceptedAt,
  };

  if (revision.body !== null) {
    summary.body = revision.body;
  }
  if (revision.materialReferenceKind !== undefined) {
    summary.materialReferenceKind = revision.materialReferenceKind;
  }
  if (revision.locator !== undefined) {
    summary.locator = revision.locator;
  }
  if (revision.citation !== undefined) {
    summary.citation = revision.citation;
  }

  return summary;
}

function summarizeAcceptedNavigationRelationship(revision) {
  const summary = {
    relationshipId: revision.relationshipId,
    relationshipRevisionId: revision.id,
    programId: revision.programId,
    relationshipKind: revision.relationshipKind,
    fromEntityId: revision.fromEntityId,
    fromRevisionId: revision.fromRevisionId,
    fromKind: revision.fromKind,
    toEntityId: revision.toEntityId,
    toRevisionId: revision.toRevisionId,
    toKind: revision.toKind,
    sourceIds: revision.sourceIds,
    acceptedFromCandidateId: revision.acceptedFromCandidateId,
    acceptedByIdentityId: revision.acceptedByIdentityId,
    acceptedAt: revision.acceptedAt,
  };

  if (revision.label !== null) {
    summary.label = revision.label;
  }

  return summary;
}

function materialContentSignal(database, revision) {
  if (revision.acceptedKind !== "material_reference") {
    return {};
  }
  const record = getAcceptedMaterialContentRecord(database, revision.id);
  if (!record) {
    return { hasContent: false };
  }
  return { hasContent: true, contentBytes: record.byteSize, contentFormat: record.contentFormat };
}

function summarizeStudentNavigationNode(database, revision, currentRelationshipRevisions) {
  return {
    ...summarizeStudentNavigationRevision(revision, {
      contentSignal: materialContentSignal(database, revision),
    }),
    relationships: {
      outgoing: currentRelationshipRevisions
        .filter($0 => $0.fromEntityId === revision.entityId)
        .map($0 => summarizeStudentNavigationRelationship(database, $0)),
      incoming: currentRelationshipRevisions
        .filter($0 => $0.toEntityId === revision.entityId)
        .map($0 => summarizeStudentNavigationRelationship(database, $0)),
    },
  };
}

function summarizeStudentNavigationRevision(
  revision,
  { includeCurrentRevision = false, isCurrentRevision = false, contentSignal = {} } = {},
) {
  const summary = {
    entityId: revision.entityId,
    revisionId: revision.id,
    programId: revision.programId,
    acceptedKind: revision.acceptedKind,
    title: revision.title,
  };

  if (revision.body !== null) {
    summary.body = revision.body;
  }
  if (revision.materialReferenceKind !== undefined) {
    summary.materialReferenceKind = revision.materialReferenceKind;
  }
  if (revision.locator !== undefined) {
    summary.locator = revision.locator;
  }
  if (revision.citation !== undefined) {
    summary.citation = revision.citation;
  }
  if (contentSignal.hasContent !== undefined) {
    summary.hasContent = contentSignal.hasContent;
    if (contentSignal.contentBytes !== undefined) {
      summary.contentBytes = contentSignal.contentBytes;
    }
    if (contentSignal.contentFormat !== undefined) {
      summary.contentFormat = contentSignal.contentFormat;
    }
  }
  if (includeCurrentRevision) {
    summary.isCurrentRevision = isCurrentRevision;
  }

  return summary;
}

function summarizeStudentNavigationRelationship(database, revision) {
  const fromRevision = getAcceptedCorpusRevisionRecord(database, revision.fromRevisionId);
  const toRevision = getAcceptedCorpusRevisionRecord(database, revision.toRevisionId);
  const summary = {
    relationshipId: revision.relationshipId,
    relationshipRevisionId: revision.id,
    relationshipKind: revision.relationshipKind,
    fromEntityId: revision.fromEntityId,
    fromRevisionId: revision.fromRevisionId,
    fromKind: revision.fromKind,
    fromTitle: fromRevision.title,
    toEntityId: revision.toEntityId,
    toRevisionId: revision.toRevisionId,
    toKind: revision.toKind,
    toTitle: toRevision.title,
  };

  if (revision.label !== null) {
    summary.label = revision.label;
  }

  return summary;
}

function currentNavigationNodeSummaries(database, currentRevisions, matches) {
  return [...currentRevisions.values()]
    .filter(matches)
    .map($0 => ({
      entityId: $0.entityId,
      revisionId: $0.id,
      acceptedKind: $0.acceptedKind,
      title: $0.title,
      ...materialContentSignal(database, $0),
    }));
}

function listCurrentNavigationRelationshipRevisions(database, programId, { activeEntityIds = null } = {}) {
  return listAcceptedNavigationRelationshipRecords(database, { programId, status: "active" })
    .map($0 => getAcceptedNavigationRelationshipRevisionRecord(database, $0.currentRevisionId))
    .filter($0 => $0 !== null)
    .filter(
      $0 => activeEntityIds === null || (activeEntityIds.has($0.fromEntityId) && activeEntityIds.has($0.toEntityId)),
    );
}

function resolveNavigationRelationshipDraft(database, { candidate, acceptedCorpus, draft }) {
  const fromEndpoint = resolveNavigationRelationshipEndpoint(database, {
    acceptedCorpus,
    entityId: draft.fromEntityId,
    candidateRef: draft.fromCandidateRef,
  });
  const toEndpoint = resolveNavigationRelationshipEndpoint(database, {
    acceptedCorpus,
    entityId: draft.toEntityId,
    candidateRef: draft.toCandidateRef,
  });

  return {
    fromEntity: fromEndpoint.entity,
    fromRevision: fromEndpoint.revision,
    toEntity: toEndpoint.entity,
    toRevision: toEndpoint.revision,
  };
}

function resolveNavigationRelationshipEndpoint(database, { acceptedCorpus, entityId, candidateRef }) {
  if (candidateRef === "self") {
    if (!acceptedCorpus) {
      throw new StorageInvariantError("accepted_entity_not_found");
    }
    return {
      entity: getAcceptedCorpusEntityRecord(database, acceptedCorpus.entityId),
      revision: acceptedCorpus,
    };
  }

  const entity = getAcceptedCorpusEntityRecord(database, entityId);
  if (!entity) {
    throw new StorageInvariantError("accepted_entity_not_found");
  }
  return {
    entity,
    revision: getAcceptedCorpusRevisionRecord(database, entity.currentRevisionId),
  };
}

function validateReadinessCheckCandidateInput(input) {
  if (
    !isNonEmptyText(input?.title) ||
    !isValidOptionalText(input?.rationale) ||
    !isValidIdArray(input?.sourceIds) ||
    !isValidReadinessScopeInput(input?.scope) ||
    !Array.isArray(input?.requirements) ||
    input.requirements.length === 0
  ) {
    return rejected("validation_failed");
  }

  const requirementTargets = new Set();
  for (const requirement of input.requirements) {
    if (!supportedReadinessRequirementTargetKinds.has(requirement?.targetKind)) {
      return rejected("readiness_requirement_target_not_found");
    }
    if (!isNonEmptyText(requirement?.targetId) || !supportedReadinessRequiredLevels.has(requirement?.requiredLevel)) {
      return rejected("validation_failed");
    }
    const targetScope = `${requirement.targetKind}\u0000${requirement.targetId}`;
    if (requirementTargets.has(targetScope)) {
      return rejected("readiness_requirement_id_conflict");
    }
    requirementTargets.add(targetScope);
  }

  return accepted({});
}

function isValidReadinessScopeInput(scope) {
  if (scope?.scopeKind === "topic") {
    return isNonEmptyText(scope.topicEntityId);
  }
  if (scope?.scopeKind === "period") {
    return (
      isNonEmptyText(scope.title) &&
      Array.isArray(scope.topicEntityIds) &&
      scope.topicEntityIds.length > 0 &&
      scope.topicEntityIds.every(isNonEmptyText) &&
      new Set(scope.topicEntityIds).size === scope.topicEntityIds.length
    );
  }
  return false;
}

function normalizeReadinessScope(scope) {
  if (scope.scopeKind === "period") {
    return {
      scopeKind: "period",
      title: scope.title.trim(),
      topicEntityIds: scope.topicEntityIds,
    };
  }
  return scope;
}

function validateNavigationCandidateInput(input) {
  if (
    !supportedNavigationCandidateKinds.has(input?.candidateKind) ||
    !isNonEmptyText(input?.title) ||
    !isValidOptionalText(input?.body) ||
    !isValidOptionalText(input?.locator) ||
    !isValidOptionalText(input?.citation) ||
    !isValidOptionalText(input?.rationale) ||
    !isValidIdArray(input?.sourceIds)
  ) {
    return rejected("validation_failed");
  }

  if (
    (input.candidateKind === "definition" || input.candidateKind === "principle") &&
    !isNonEmptyText(input.body)
  ) {
    return rejected("validation_failed");
  }

  if (input.candidateKind === "material_reference") {
    if (
      !supportedMaterialReferenceKinds.has(input.materialReferenceKind) ||
      (!isNonEmptyText(input.body) && !isNonEmptyText(input.locator) && !isNonEmptyText(input.citation))
    ) {
      return rejected("validation_failed");
    }
  } else if (
    input.materialReferenceKind !== undefined ||
    input.locator !== undefined ||
    input.citation !== undefined
  ) {
    return rejected("validation_failed");
  }

  if (
    input.candidateKind === "relationship_update" &&
    (!Array.isArray(input.relationshipDrafts) || input.relationshipDrafts.length === 0)
  ) {
    return rejected("validation_failed");
  }

  return accepted({});
}

function validateNavigationRelationshipDrafts({ database, programId, candidateKind, relationshipDrafts }) {
  if (!Array.isArray(relationshipDrafts)) {
    return rejected("validation_failed");
  }

  for (const draft of relationshipDrafts) {
    if (
      !supportedNavigationRelationshipKinds.has(draft?.relationshipKind) ||
      !isValidOptionalText(draft?.label) ||
      !isValidOptionalText(draft?.rationale) ||
      !isValidIdArray(draft?.sourceIds) ||
      !isValidEndpointSelector({
        entityId: draft?.fromEntityId,
        candidateRef: draft?.fromCandidateRef,
      }) ||
      !isValidEndpointSelector({
        entityId: draft?.toEntityId,
        candidateRef: draft?.toCandidateRef,
      })
    ) {
      return rejected("validation_failed");
    }

    const selfReferenceCount = [draft.fromCandidateRef, draft.toCandidateRef].filter($0 => $0 === "self").length;
    if (
      (candidateKind === "relationship_update" && selfReferenceCount > 0) ||
      (candidateKind !== "relationship_update" && selfReferenceCount !== 1)
    ) {
      return rejected("validation_failed");
    }

    const sourceValidation = validateProgramSourceIds(database, {
      programId,
      sourceIds: draft.sourceIds ?? [],
    });
    if (sourceValidation.status === "rejected") {
      return sourceValidation;
    }
  }

  return accepted({});
}

function isValidEndpointSelector({ entityId, candidateRef }) {
  if (candidateRef !== undefined && candidateRef !== "self") {
    return false;
  }
  const selectorCount = [isNonEmptyText(entityId), candidateRef === "self"].filter(Boolean).length;
  return selectorCount === 1;
}

function validateProgramSourceIds(database, { programId, sourceIds }) {
  const sourcesById = new Map(listProgramSourceRecords(database, { programId: null }).map($0 => [$0.id, $0]));
  for (const sourceId of sourceIds) {
    const source = sourcesById.get(sourceId);
    if (!source) {
      return rejected("source_not_found");
    }
    if (source.programId !== programId) {
      return rejected("source_program_mismatch");
    }
  }
  return accepted({});
}

function isProgramSourceReferencedByAcceptedCorpus(database, sourceId) {
  return listAcceptedCorpusRevisionRecords(database).some($0 => $0.sourceIds.includes(sourceId));
}

function hasActiveMaterialEvidenceTarget(database, revision) {
  return listLearnerEvidenceTargetLinkRecords(database, { programId: revision.programId }).some(
    $0 => $0.targetKind === "material_reference" && $0.targetId === revision.entityId,
  );
}

function summarizeNavigationRelationshipDrafts(relationshipDrafts) {
  return relationshipDrafts.map(draft => {
    const summary = { relationshipKind: draft.relationshipKind };
    if (draft.fromEntityId !== undefined) {
      summary.fromEntityId = draft.fromEntityId.trim();
    }
    if (draft.fromCandidateRef !== undefined) {
      summary.fromCandidateRef = draft.fromCandidateRef;
    }
    if (draft.toEntityId !== undefined) {
      summary.toEntityId = draft.toEntityId.trim();
    }
    if (draft.toCandidateRef !== undefined) {
      summary.toCandidateRef = draft.toCandidateRef;
    }
    if (draft.label !== undefined) {
      summary.label = draft.label.trim();
    }
    if (draft.rationale !== undefined) {
      summary.rationale = draft.rationale.trim();
    }
    if (draft.sourceIds !== undefined) {
      summary.sourceIds = draft.sourceIds;
    }
    return summary;
  });
}

function summarizeCorpusEvent(event) {
  const summary = {
    corpusEventId: event.id,
    eventType: event.eventType,
    actorIdentityId: event.actorIdentityId,
    occurredAt: event.occurredAt,
    outcome: event.outcome,
  };

  if (event.programId !== null) {
    summary.programId = event.programId;
  }
  if (event.targetId !== null) {
    summary.targetId = event.targetId;
  }
  if (event.reason !== null) {
    summary.reason = event.reason;
  }

  return summary;
}

function mapCandidateStorageRejection(reason) {
  if (reason === "program_source_not_found") {
    return "source_not_found";
  }
  if (reason === "program_source_mismatch") {
    return "source_program_mismatch";
  }
  return reason;
}

function mapAssessmentCriterionStorageRejection(reason) {
  if (reason === "program_source_not_found") {
    return "source_not_found";
  }
  if (reason === "program_source_mismatch") {
    return "source_program_mismatch";
  }
  return reason;
}

function mapReadinessStorageRejection(reason) {
  if (reason === "program_source_not_found") {
    return "source_not_found";
  }
  if (reason === "program_source_mismatch") {
    return "source_program_mismatch";
  }
  return reason;
}

function mapNavigationStorageRejection(reason) {
  if (reason === "program_source_not_found") {
    return "source_not_found";
  }
  if (reason === "program_source_mismatch") {
    return "source_program_mismatch";
  }
  return reason;
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidIdArray(value) {
  return value === undefined || (Array.isArray(value) && value.every(isNonEmptyText));
}

function isNonEmptyIdArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyText);
}

function isValidQuickCheckOptionTexts(value) {
  if (!Array.isArray(value) || value.length < 2 || !value.every(isNonEmptyText)) {
    return false;
  }

  const trimmedOptionTexts = value.map($0 => $0.trim().toLowerCase());
  return new Set(trimmedOptionTexts).size === trimmedOptionTexts.length;
}

function isValidOptionalText(value) {
  return value === undefined || value === null || isNonEmptyText(value);
}

function accepted(value) {
  return { status: "accepted", value };
}

function rejected(reason) {
  return { status: "rejected", reason };
}
