import {
  getAcceptedAssessmentCriterionRevisionRecord,
  getAcceptedCorpusRevisionRecord,
  getAcceptedNavigationRelationshipRevisionRecord,
  getAcceptedOpenAnswerCheckRevisionRecord,
  getAcceptedQuickCheckRevisionRecord,
  getAcceptedReadinessCheckRevisionRecord,
  getIdentity,
  getProgramShellRecord,
  listAcceptedAssessmentCriterionEntityRecords,
  listAcceptedCorpusEntityRecords,
  listAcceptedNavigationRelationshipRecords,
  listAcceptedOpenAnswerCheckEntityRecords,
  listAcceptedQuickCheckEntityRecords,
  listAcceptedReadinessCheckEntityRecords,
  listLearnerEvidenceTargetLinkRecords,
} from "./storage.js";

const coverageGapKinds = new Set([
  "topic_without_concepts",
  "topic_without_materials",
  "concept_without_materials",
  "topic_without_checks",
  "concept_without_checks",
  "check_without_target_links",
  "readiness_requirement_without_evidence_path",
]);

const coverageGapScopeKinds = new Set(["program", "topic", "concept"]);
const coverageGapSeverities = new Set(["info", "warning", "critical"]);
const severityRank = new Map([
  ["critical", 3],
  ["warning", 2],
  ["info", 1],
]);

export function createCuratorWorkspaceCommands({ database, getEffectiveParticipation, now }) {
  return {
    inspectCuratorCoverageGaps: input =>
      inspectCuratorCoverageGaps({ database, getEffectiveParticipation, input, now }),
  };
}

function inspectCuratorCoverageGaps({ database, getEffectiveParticipation, input, now }) {
  const authorization = authorizeProgramCurator({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const filters = validateCoverageFilters(input);
  if (filters.status === "rejected") {
    return filters;
  }

  const scope = resolveCoverageScope({
    database,
    programId: authorization.value.program.id,
    scopeKind: filters.value.scopeKind,
    scopeId: filters.value.scopeId,
  });
  if (scope.status === "rejected") {
    return scope;
  }

  const generatedAt = now().toISOString();
  const model = buildCoverageModel(database, authorization.value.program.id);
  const gaps = applyCoverageFilters(
    buildCoverageGaps({
      generatedAt,
      model,
      programId: authorization.value.program.id,
      scope: scope.value,
    }),
    filters.value,
  );

  return accepted({
    report: {
      programId: authorization.value.program.id,
      scopeKind: filters.value.scopeKind,
      ...(filters.value.scopeId !== undefined ? { scopeId: filters.value.scopeId } : {}),
      generatedAt,
      gaps,
    },
  });
}

function authorizeProgramCurator({ database, getEffectiveParticipation, input }) {
  const identity = getIdentity(database, input?.actingIdentityId);
  if (!identity || identity.state !== "active") {
    return rejected("identity_not_active");
  }

  const program = getProgramShellRecord(database, input?.programId);
  if (!program) {
    return rejected("program_not_found");
  }

  const participation = getEffectiveParticipation({
    identityId: identity.id,
    programId: program.id,
    participationKind: "program_curator",
  });
  if (!participation.allowed) {
    return rejected("program_curator_required");
  }

  return accepted({ identity, program });
}

function validateCoverageFilters(input) {
  if (!isNonEmptyText(input?.programId)) {
    return rejected("validation_failed");
  }

  const scopeKind = input.scopeKind ?? "program";
  if (!coverageGapScopeKinds.has(scopeKind)) {
    return rejected("validation_failed");
  }

  const scopeId = input.scopeId;
  if (scopeKind === "program" && scopeId !== undefined) {
    return rejected("validation_failed");
  }
  if (scopeKind !== "program" && !isNonEmptyText(scopeId)) {
    return rejected("validation_failed");
  }

  const gapKinds = input.gapKinds ?? [];
  if (!Array.isArray(gapKinds) || gapKinds.some($0 => !coverageGapKinds.has($0))) {
    return rejected("validation_failed");
  }

  const minimumSeverity = input.minimumSeverity;
  if (minimumSeverity !== undefined && !coverageGapSeverities.has(minimumSeverity)) {
    return rejected("validation_failed");
  }

  return accepted({
    gapKinds,
    minimumSeverity,
    scopeId,
    scopeKind,
  });
}

function resolveCoverageScope({ database, programId, scopeKind, scopeId }) {
  if (scopeKind === "program") {
    return accepted({ scopeKind });
  }

  const entity = listAcceptedCorpusEntityRecords(database, { programId: null }).find(
    $0 => $0.id === scopeId,
  );
  if (!entity) {
    return rejected("coverage_gap_scope_not_found");
  }
  if (entity.programId !== programId) {
    return rejected("coverage_gap_scope_program_mismatch");
  }
  if (entity.acceptedKind !== scopeKind) {
    return rejected("coverage_gap_scope_not_found");
  }

  return accepted({ entityId: entity.id, scopeKind });
}

function buildCoverageModel(database, programId) {
  const navigationEntities = listAcceptedCorpusEntityRecords(database, { programId }).map(entity => {
    const revision = getAcceptedCorpusRevisionRecord(database, entity.currentRevisionId);
    return {
      ...entity,
      revision,
      title: revision.title,
    };
  });
  const relationships = listAcceptedNavigationRelationshipRecords(database, { programId }).map(
    relationship => ({
      ...relationship,
      revision: getAcceptedNavigationRelationshipRevisionRecord(
        database,
        relationship.currentRevisionId,
      ),
    }),
  );
  const quickChecks = listAcceptedQuickCheckEntityRecords(database, { programId }).map(entity => ({
    ...entity,
    revision: getAcceptedQuickCheckRevisionRecord(database, entity.currentRevisionId),
  }));
  const openAnswerChecks = listAcceptedOpenAnswerCheckEntityRecords(database, { programId }).map(
    entity => ({
      ...entity,
      revision: getAcceptedOpenAnswerCheckRevisionRecord(database, entity.currentRevisionId),
    }),
  );
  const criteria = listAcceptedAssessmentCriterionEntityRecords(database, { programId }).map(
    entity => ({
      ...entity,
      revision: getAcceptedAssessmentCriterionRevisionRecord(database, entity.currentRevisionId),
    }),
  );
  const readinessChecks = listAcceptedReadinessCheckEntityRecords(database, { programId }).map(
    entity => ({
      ...entity,
      revision: getAcceptedReadinessCheckRevisionRecord(database, entity.currentRevisionId),
    }),
  );
  const targetLinks = listLearnerEvidenceTargetLinkRecords(database, { programId });

  return {
    criteria,
    navigationEntities,
    openAnswerChecks,
    quickChecks,
    readinessChecks,
    relationships,
    targetLinks,
  };
}

function buildCoverageGaps({ generatedAt, model, programId, scope }) {
  const gaps = [];
  const entitiesById = new Map(model.navigationEntities.map($0 => [$0.id, $0]));
  const topics = model.navigationEntities.filter($0 => $0.acceptedKind === "topic");
  const concepts = model.navigationEntities.filter($0 => $0.acceptedKind === "concept");

  for (const topic of topics) {
    if (!isInScope({ scope, targetKind: "topic", targetId: topic.id })) {
      continue;
    }
    addGapIf(
      gaps,
      !hasRelationship(model.relationships, {
        fromEntityId: topic.id,
        relationshipKind: "topic_includes_concept",
      }),
      makeGap({
        detectedAt: generatedAt,
        gapKind: "topic_without_concepts",
        programId,
        severity: "info",
        sourceIds: [topic.revision.id],
        sourceKind: "accepted_navigation",
        target: topic,
        targetKind: "topic",
      }),
    );
    addGapIf(
      gaps,
      !hasRelationship(model.relationships, {
        fromEntityId: topic.id,
        relationshipKind: "topic_uses_material",
      }),
      makeGap({
        detectedAt: generatedAt,
        gapKind: "topic_without_materials",
        programId,
        severity: "warning",
        sourceIds: [topic.revision.id],
        sourceKind: "accepted_navigation",
        target: topic,
        targetKind: "topic",
      }),
    );
    addGapIf(
      gaps,
      acceptedEvidencePathCount(model.targetLinks, {
        targetKind: "topic",
        targetId: topic.id,
      }) === 0,
      makeGap({
        detectedAt: generatedAt,
        gapKind: "topic_without_checks",
        programId,
        severity: "critical",
        sourceIds: [topic.revision.id],
        sourceKind: "learner_evidence_target_link",
        target: topic,
        targetKind: "topic",
      }),
    );
  }

  for (const concept of concepts) {
    if (!isInScope({ scope, targetKind: "concept", targetId: concept.id })) {
      continue;
    }
    addGapIf(
      gaps,
      !hasRelationship(model.relationships, {
        fromEntityId: concept.id,
        relationshipKind: "concept_uses_material",
      }),
      makeGap({
        detectedAt: generatedAt,
        gapKind: "concept_without_materials",
        programId,
        severity: "warning",
        sourceIds: [concept.revision.id],
        sourceKind: "accepted_navigation",
        target: concept,
        targetKind: "concept",
      }),
    );
    addGapIf(
      gaps,
      acceptedEvidencePathCount(model.targetLinks, {
        targetKind: "concept",
        targetId: concept.id,
      }) === 0,
      makeGap({
        detectedAt: generatedAt,
        gapKind: "concept_without_checks",
        programId,
        severity: "critical",
        sourceIds: [concept.revision.id],
        sourceKind: "learner_evidence_target_link",
        target: concept,
        targetKind: "concept",
      }),
    );
  }

  for (const check of [
    ...model.quickChecks.map($0 => ({ ...$0, ownerKind: "accepted_quick_check", targetKind: "quick_check" })),
    ...model.openAnswerChecks.map($0 => ({ ...$0, ownerKind: "accepted_open_answer_check", targetKind: "open_answer_check" })),
    ...model.criteria.map($0 => ({ ...$0, ownerKind: "accepted_assessment_criterion", targetKind: "assessment_criterion" })),
  ]) {
    if (scope.scopeKind !== "program") {
      continue;
    }
    addGapIf(
      gaps,
      model.targetLinks.filter(
        $0 => $0.evidenceOwnerKind === check.ownerKind && $0.evidenceOwnerEntityId === check.id,
      ).length === 0,
      makeGap({
        detectedAt: generatedAt,
        gapKind: "check_without_target_links",
        programId,
        severity: "warning",
        sourceIds: [check.revision.id],
        sourceKind: "accepted_check",
        target: { id: check.id, title: check.revision.title },
        targetKind: check.targetKind,
      }),
    );
  }

  for (const readinessCheck of model.readinessChecks) {
    for (const requirement of readinessCheck.revision.requirements) {
      const target = resolveRequirementTarget({
        entitiesById,
        model,
        requirement,
      });
      if (!target || !isInScope({ scope, targetKind: target.targetKind, targetId: target.id })) {
        continue;
      }
      addGapIf(
        gaps,
        acceptedEvidencePathCount(model.targetLinks, {
          targetKind: target.targetKind,
          targetId: target.id,
        }) === 0,
        makeGap({
          detectedAt: generatedAt,
          gapKind: "readiness_requirement_without_evidence_path",
          programId,
          severity: "critical",
          sourceIds: [readinessCheck.revision.id],
          sourceKind: "accepted_readiness_check",
          target,
          targetKind: target.targetKind,
        }),
      );
    }
  }

  return sortCoverageGaps(gaps);
}

function resolveRequirementTarget({ entitiesById, model, requirement }) {
  if (["topic", "concept", "material_reference"].includes(requirement.targetKind)) {
    const target = entitiesById.get(requirement.targetId);
    return target
      ? {
          id: target.id,
          targetKind: target.acceptedKind,
          title: target.title,
        }
      : null;
  }

  if (requirement.targetKind === "quick_check") {
    const target = model.quickChecks.find($0 => $0.id === requirement.targetId);
    return target
      ? { id: target.id, targetKind: "quick_check", title: target.revision.title }
      : null;
  }

  if (requirement.targetKind === "open_answer_check") {
    const target = model.openAnswerChecks.find($0 => $0.id === requirement.targetId);
    return target
      ? { id: target.id, targetKind: "open_answer_check", title: target.revision.title }
      : null;
  }

  if (requirement.targetKind === "assessment_criterion") {
    const target = model.criteria.find($0 => $0.id === requirement.targetId);
    return target
      ? { id: target.id, targetKind: "assessment_criterion", title: target.revision.title }
      : null;
  }

  return null;
}

function applyCoverageFilters(gaps, filters) {
  return gaps.filter(gap => {
    if (filters.gapKinds.length > 0 && !filters.gapKinds.includes(gap.gapKind)) {
      return false;
    }
    if (
      filters.minimumSeverity !== undefined &&
      severityRank.get(gap.severity) < severityRank.get(filters.minimumSeverity)
    ) {
      return false;
    }
    return true;
  });
}

function hasRelationship(relationships, { fromEntityId, relationshipKind }) {
  return relationships.some(
    $0 => $0.fromEntityId === fromEntityId && $0.relationshipKind === relationshipKind,
  );
}

function acceptedEvidencePathCount(targetLinks, { targetKind, targetId }) {
  return targetLinks.filter($0 => $0.targetKind === targetKind && $0.targetId === targetId).length;
}

function isInScope({ scope, targetKind, targetId }) {
  return scope.scopeKind === "program" || (scope.scopeKind === targetKind && scope.entityId === targetId);
}

function addGapIf(gaps, condition, gap) {
  if (condition) {
    gaps.push(gap);
  }
}

function makeGap({
  detectedAt,
  gapKind,
  programId,
  severity,
  sourceIds,
  sourceKind,
  target,
  targetKind,
}) {
  const sortedSourceIds = [...sourceIds].sort();
  return {
    gapId: [programId, gapKind, targetKind, target.id ?? "", ...sortedSourceIds].join(":"),
    programId,
    gapKind,
    severity,
    status: "draft_guidance",
    targetKind,
    targetId: target.id,
    targetTitle: target.title,
    title: titleForGap(gapKind, target.title),
    description: descriptionForGap(gapKind, target.title),
    sourceKind,
    sourceIds: sortedSourceIds,
    acceptedEvidencePathCount: 0,
    detectedAt,
  };
}

function titleForGap(gapKind, targetTitle) {
  return `${targetTitle}: ${gapKind}`;
}

function descriptionForGap(gapKind, targetTitle) {
  return `${targetTitle} has ${gapKind.replaceAll("_", " ")}.`;
}

function sortCoverageGaps(gaps) {
  return [...gaps].sort((left, right) => {
    const severityDifference = severityRank.get(right.severity) - severityRank.get(left.severity);
    if (severityDifference !== 0) {
      return severityDifference;
    }
    const titleDifference = left.targetTitle.localeCompare(right.targetTitle);
    if (titleDifference !== 0) {
      return titleDifference;
    }
    const leftTargetId = left.targetId ?? "\uffff";
    const rightTargetId = right.targetId ?? "\uffff";
    const targetDifference = leftTargetId.localeCompare(rightTargetId);
    if (targetDifference !== 0) {
      return targetDifference;
    }
    return left.gapKind.localeCompare(right.gapKind);
  });
}

function accepted(value) {
  return { status: "accepted", value };
}

function rejected(reason) {
  return { status: "rejected", reason };
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}
