import {
  createLlmCurationSuggestionGenerationRecord,
  createLlmCurationSuggestionRecord,
  getAcceptedAssessmentCriterionRevisionRecord,
  getAcceptedCorpusRevisionRecord,
  getAcceptedNavigationRelationshipRevisionRecord,
  getAcceptedOpenAnswerCheckRevisionRecord,
  getAcceptedQuickCheckRevisionRecord,
  getAcceptedReadinessCheckRevisionRecord,
  getIdentity,
  getLlmCurationSuggestionGenerationRecord,
  getLlmCurationSuggestionRecord,
  getProgramShellRecord,
  listAcceptedAssessmentCriterionEntityRecords,
  listAcceptedCorpusEntityRecords,
  listAcceptedNavigationRelationshipRecords,
  listAcceptedOpenAnswerCheckEntityRecords,
  listAcceptedQuickCheckEntityRecords,
  listAcceptedReadinessCheckEntityRecords,
  listLearnerEvidenceTargetLinkRecords,
  listLlmCurationSuggestionRecords,
  materializeLlmCurationSuggestionRecord,
  rejectLlmCurationSuggestionRecord,
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
const llmCurationSuggestionKinds = new Set([
  "navigation_candidate",
  "quick_check_candidate",
  "assessment_criterion_candidate",
  "open_answer_check_candidate",
  "readiness_check_candidate",
]);
const llmCurationSuggestionStatuses = new Set([
  "draft_suggestion",
  "materialized",
  "rejected",
]);
const forbiddenLlmSuggestionArtifactPatterns = [
  /\bauthorization\b/i,
  /\bcookie\b/i,
  /\bcsrf\b/i,
  /\bdatabase-url\b/i,
  /\bpostgres:\/\//i,
  /\bprovider diagnostics\b/i,
  /\braw\s+model\b/i,
  /\braw\s+prompt\b/i,
  /\bselect\s+\*/i,
  /\bsession\b/i,
  /\bstack\s+trace\b/i,
  /\/tmp\b/i,
];
const severityRank = new Map([
  ["critical", 3],
  ["warning", 2],
  ["info", 1],
]);

export function createCuratorWorkspaceCommands({
  corpusCommands = null,
  database,
  generateId = () => crypto.randomUUID(),
  getEffectiveParticipation,
  llmSuggestionPolicies = [],
  llmSuggestionProviderAdapters = [],
  now,
}) {
  return {
    acceptLlmCurationSuggestion: input =>
      acceptLlmCurationSuggestion({
        corpusCommands,
        database,
        getEffectiveParticipation,
        input,
        now,
      }),
    generateLlmCurationSuggestions: input =>
      generateLlmCurationSuggestions({
        database,
        generateId,
        getEffectiveParticipation,
        input,
        llmSuggestionPolicies,
        llmSuggestionProviderAdapters,
        now,
      }),
    getLlmCurationSuggestion: input =>
      getLlmCurationSuggestion({
        database,
        getEffectiveParticipation,
        input,
      }),
    inspectCuratorCoverageGaps: input =>
      inspectCuratorCoverageGaps({ database, getEffectiveParticipation, input, now }),
    listLlmCurationSuggestions: input =>
      listLlmCurationSuggestions({
        database,
        getEffectiveParticipation,
        input,
      }),
    rejectLlmCurationSuggestion: input =>
      rejectLlmCurationSuggestion({
        database,
        getEffectiveParticipation,
        input,
        now,
      }),
  };
}

function acceptLlmCurationSuggestion({
  corpusCommands,
  database,
  getEffectiveParticipation,
  input,
  now,
}) {
  const suggestion = getLlmCurationSuggestionRecord(database, input?.suggestionId);
  if (!suggestion) {
    return rejected("llm_curation_suggestion_not_found");
  }

  const authorization = authorizeProgramCurator({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: suggestion.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const terminalStatus = rejectTerminalLlmSuggestion(suggestion);
  if (terminalStatus.status === "rejected") {
    return terminalStatus;
  }
  if (!corpusCommands) {
    return rejected("suggestion_materialization_rejected");
  }

  try {
    return database.transaction(() => {
      const materializedCandidate = materializeSuggestedDraft({
        actingIdentityId: authorization.value.identity.id,
        corpusCommands,
        programId: suggestion.programId,
        suggestion,
      });
      if (materializedCandidate.status === "rejected") {
        return materializedCandidate;
      }

      const occurredAt = now().toISOString();
      const materializedSuggestion = materializeLlmCurationSuggestionRecord(database, {
        suggestionId: suggestion.id,
        candidateKind: materializedCandidate.value.candidateKind,
        candidateId: materializedCandidate.value.candidateId,
        materializedByIdentityId: authorization.value.identity.id,
        materializedAt: occurredAt,
        updatedAt: occurredAt,
      });

      return accepted({
        materializedCandidate: materializedCandidate.value,
        suggestion: summarizeLlmCurationSuggestion(materializedSuggestion),
      });
    })();
  } catch {
    return rejected("suggestion_materialization_rejected");
  }
}

function getLlmCurationSuggestion({ database, getEffectiveParticipation, input }) {
  const suggestion = getLlmCurationSuggestionRecord(database, input?.suggestionId);
  if (!suggestion) {
    return rejected("llm_curation_suggestion_not_found");
  }

  const authorization = authorizeProgramCurator({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: suggestion.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  return accepted({ suggestion: summarizeLlmCurationSuggestionDetail(suggestion) });
}

function listLlmCurationSuggestions({ database, getEffectiveParticipation, input }) {
  const authorization = authorizeProgramCurator({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const filters = validateLlmSuggestionReviewFilters(input);
  if (filters.status === "rejected") {
    return filters;
  }

  const suggestions = listLlmCurationSuggestionRecords(database, {
    programId: authorization.value.program.id,
    status: filters.value.status,
    suggestionKind: filters.value.suggestionKind,
  }).sort((left, right) => {
    const createdAtDifference = right.createdAt.localeCompare(left.createdAt);
    if (createdAtDifference !== 0) {
      return createdAtDifference;
    }
    return right.id.localeCompare(left.id);
  });
  const cursorIndex = filters.value.cursor
    ? suggestions.findIndex($0 => $0.id === filters.value.cursor)
    : -1;
  if (filters.value.cursor && cursorIndex === -1) {
    return rejected("validation_failed");
  }

  const startIndex = cursorIndex === -1 ? 0 : cursorIndex + 1;
  const page = suggestions.slice(startIndex, startIndex + filters.value.limit);
  const hasNextPage = suggestions.length > startIndex + page.length;

  return accepted({
    suggestions: page.map(summarizeLlmCurationSuggestion),
    ...(hasNextPage ? { nextCursor: page.at(-1).id } : {}),
  });
}

function rejectLlmCurationSuggestion({ database, getEffectiveParticipation, input, now }) {
  const suggestion = getLlmCurationSuggestionRecord(database, input?.suggestionId);
  if (!suggestion) {
    return rejected("llm_curation_suggestion_not_found");
  }

  const authorization = authorizeProgramCurator({
    database,
    getEffectiveParticipation,
    input: { actingIdentityId: input?.actingIdentityId, programId: suggestion.programId },
  });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const terminalStatus = rejectTerminalLlmSuggestion(suggestion);
  if (terminalStatus.status === "rejected") {
    return terminalStatus;
  }

  try {
    const occurredAt = now().toISOString();
    const rejectedSuggestion = rejectLlmCurationSuggestionRecord(database, {
      suggestionId: suggestion.id,
      rejectedByIdentityId: authorization.value.identity.id,
      rejectedAt: occurredAt,
      updatedAt: occurredAt,
    });

    return accepted({ suggestion: summarizeLlmCurationSuggestion(rejectedSuggestion) });
  } catch {
    return rejected("suggestion_rejection_failed");
  }
}

function generateLlmCurationSuggestions({
  database,
  generateId,
  getEffectiveParticipation,
  input,
  llmSuggestionPolicies,
  llmSuggestionProviderAdapters,
  now,
}) {
  const authorization = authorizeProgramCurator({ database, getEffectiveParticipation, input });
  if (authorization.status === "rejected") {
    return rejected(authorization.reason);
  }

  const request = validateLlmSuggestionGenerationRequest(input);
  if (request.status === "rejected") {
    return request;
  }

  const policy = llmSuggestionPolicies.find(
    $0 => $0.suggestionPolicyId === request.value.suggestionPolicyId,
  );
  if (!policy) {
    return rejected("suggestion_policy_not_found");
  }
  if (!isValidLlmSuggestionPolicy(policy)) {
    return rejected("validation_failed");
  }

  const allowedSuggestionKinds = request.value.allowedSuggestionKinds ?? policy.allowedSuggestionKinds;
  if (!isAllowedSuggestionKindSubset({ allowedSuggestionKinds, policy })) {
    return rejected("validation_failed");
  }

  const adapter = llmSuggestionProviderAdapters.find($0 => $0.providerAdapterId === policy.providerAdapterId);
  if (!adapter) {
    return rejected("provider_adapter_not_found");
  }

  const context = buildLlmSuggestionPromptContext({
    database,
    getEffectiveParticipation,
    input,
    now,
    policy,
    programId: authorization.value.program.id,
  });
  if (context.status === "rejected") {
    return context;
  }

  const requestFingerprint = fingerprintLlmSuggestionGenerationRequest({
    allowedSuggestionKinds,
    context: context.value,
    curatorInstruction: request.value.curatorInstruction,
    maxSuggestions: request.value.maxSuggestions,
    policy,
    programId: authorization.value.program.id,
  });
  const existingGeneration = getLlmCurationSuggestionGenerationRecord(database, {
    programId: authorization.value.program.id,
    idempotencyKey: request.value.idempotencyKey,
  });
  if (existingGeneration) {
    if (existingGeneration.requestFingerprint !== requestFingerprint) {
      return rejected("validation_failed");
    }
    return accepted({
      suggestions: existingGeneration.suggestionIds
        .map($0 => getLlmCurationSuggestionRecord(database, $0))
        .filter(Boolean)
        .map(summarizeLlmCurationSuggestion),
    });
  }

  let providerOutput;
  try {
    providerOutput = adapter.suggest({
      requestId: generateId(),
      programId: authorization.value.program.id,
      suggestionPolicyId: policy.suggestionPolicyId,
      outputValidatorPolicyId: policy.outputValidatorPolicyId,
      allowedSuggestionKinds,
      ...(request.value.curatorInstruction ? { curatorInstruction: request.value.curatorInstruction } : {}),
      context: context.value,
    });
  } catch {
    return rejected("provider_execution_failed");
  }

  if (!isWithinLlmSuggestionBudget({ policy, providerOutput })) {
    return rejected("provider_budget_exceeded");
  }
  if (!isValidLlmSuggestionProviderOutput({ allowedSuggestionKinds, maxSuggestions: request.value.maxSuggestions, policy, providerOutput })) {
    return rejected("provider_output_rejected");
  }

  const generatedAt = now().toISOString();
  let suggestionRecords;
  try {
    suggestionRecords = database.transaction(() => {
      const suggestionRecords = [];
      for (const providerSuggestion of providerOutput.suggestions) {
        const suggestionRecord = createLlmCurationSuggestionRecord(database, {
          id: generateId(),
          programId: authorization.value.program.id,
          suggestionKind: providerSuggestion.suggestionKind,
          title: providerSuggestion.title,
          summary: providerSuggestion.summary,
          rationale: providerSuggestion.rationale,
          suggestedDraft: providerSuggestion.suggestedDraft,
          supportingEvidence: providerSuggestion.supportingEvidence,
          origin: {
            suggestionPolicyId: policy.suggestionPolicyId,
            providerAdapterId: policy.providerAdapterId,
            outputValidatorPolicyId: policy.outputValidatorPolicyId,
            redactionPolicyId: policy.redactionPolicyId,
            sourceKinds: summarizeLlmSuggestionSourceKinds({ context: context.value, request: request.value }),
            sourceIds: summarizeLlmSuggestionSourceIds(context.value),
            coverageGapIds: context.value.coverageGaps.map($0 => $0.gapId),
            promptContextSummary: summarizeLlmSuggestionPromptContext(context.value),
            generatedByIdentityId: authorization.value.identity.id,
            generatedAt,
          },
          status: "draft_suggestion",
          createdByIdentityId: authorization.value.identity.id,
          createdAt: generatedAt,
          updatedAt: generatedAt,
        });
        suggestionRecords.push(suggestionRecord);
      }

      createLlmCurationSuggestionGenerationRecord(database, {
        id: generateId(),
        programId: authorization.value.program.id,
        idempotencyKey: request.value.idempotencyKey,
        requestFingerprint,
        suggestionIds: suggestionRecords.map($0 => $0.id),
        createdByIdentityId: authorization.value.identity.id,
        createdAt: generatedAt,
      });
      return suggestionRecords;
    })();
  } catch {
    return rejected("provider_output_rejected");
  }

  return accepted({
    suggestions: suggestionRecords.map(summarizeLlmCurationSuggestion),
  });
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

function validateLlmSuggestionReviewFilters(input) {
  const limit = input?.limit ?? 50;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (input?.cursor !== undefined && !isNonEmptyText(input.cursor)) ||
    (input?.status !== undefined && !llmCurationSuggestionStatuses.has(input.status)) ||
    (input?.suggestionKind !== undefined && !llmCurationSuggestionKinds.has(input.suggestionKind))
  ) {
    return rejected("validation_failed");
  }

  return accepted({
    cursor: input?.cursor,
    limit,
    status: input?.status ?? null,
    suggestionKind: input?.suggestionKind ?? null,
  });
}

function materializeSuggestedDraft({ actingIdentityId, corpusCommands, programId, suggestion }) {
  const request = {
    ...suggestion.suggestedDraft.request,
    actingIdentityId,
    programId,
  };
  const result = createSuggestedDraftCandidate({
    corpusCommands,
    request,
    suggestionKind: suggestion.suggestionKind,
  });
  if (result.status === "rejected") {
    return rejected("suggestion_materialization_rejected");
  }

  const candidateId = extractMaterializedCandidateId({
    result,
    suggestionKind: suggestion.suggestionKind,
  });
  if (!candidateId) {
    return rejected("suggestion_materialization_rejected");
  }

  return accepted({
    candidateId,
    candidateKind: suggestion.suggestionKind,
  });
}

function createSuggestedDraftCandidate({ corpusCommands, request, suggestionKind }) {
  switch (suggestionKind) {
    case "assessment_criterion_candidate":
      return corpusCommands.createAssessmentCriterionCandidate(request);
    case "navigation_candidate":
      return corpusCommands.createNavigationCandidate(request);
    case "open_answer_check_candidate":
      return corpusCommands.createOpenAnswerCheckCandidate(request);
    case "quick_check_candidate":
      return corpusCommands.createQuickCheckCandidate(request);
    case "readiness_check_candidate":
      return corpusCommands.createReadinessCheckCandidate(request);
    default:
      return rejected("validation_failed");
  }
}

function extractMaterializedCandidateId({ result, suggestionKind }) {
  switch (suggestionKind) {
    case "assessment_criterion_candidate":
      return result.value.assessmentCriterionCandidate.candidateId;
    case "navigation_candidate":
      return result.value.navigationCandidate.candidateId;
    case "open_answer_check_candidate":
      return result.value.openAnswerCheckCandidate.candidateId;
    case "quick_check_candidate":
      return result.value.quickCheckCandidate.candidateId;
    case "readiness_check_candidate":
      return result.value.readinessCheckCandidate.candidateId;
    default:
      return null;
  }
}

function rejectTerminalLlmSuggestion(suggestion) {
  if (suggestion.status === "materialized") {
    return rejected("llm_curation_suggestion_already_materialized");
  }
  if (suggestion.status === "rejected") {
    return rejected("llm_curation_suggestion_already_rejected");
  }
  return accepted({});
}

function validateLlmSuggestionGenerationRequest(input) {
  if (
    !isNonEmptyText(input?.programId) ||
    !isNonEmptyText(input?.suggestionPolicyId) ||
    !isNonEmptyText(input?.idempotencyKey) ||
    !Number.isInteger(input?.maxSuggestions) ||
    input.maxSuggestions < 1 ||
    input.maxSuggestions > 20
  ) {
    return rejected("validation_failed");
  }

  const curatorInstruction = input.curatorInstruction?.trim() ?? "";
  const coverageGapIds = input.coverageGapIds ?? [];
  const contextEntityIds = input.contextEntityIds ?? [];
  const allowedSuggestionKinds = input.allowedSuggestionKinds;
  if (
    (curatorInstruction.length === 0 && coverageGapIds.length === 0 && contextEntityIds.length === 0) ||
    !Array.isArray(coverageGapIds) ||
    coverageGapIds.some($0 => !isNonEmptyText($0)) ||
    !Array.isArray(contextEntityIds) ||
    contextEntityIds.some($0 => !isNonEmptyText($0)) ||
    (allowedSuggestionKinds !== undefined &&
      (!Array.isArray(allowedSuggestionKinds) ||
        allowedSuggestionKinds.length === 0 ||
        allowedSuggestionKinds.some($0 => !llmCurationSuggestionKinds.has($0))))
  ) {
    return rejected("validation_failed");
  }

  return accepted({
    allowedSuggestionKinds,
    contextEntityIds,
    coverageGapIds,
    curatorInstruction,
    idempotencyKey: input.idempotencyKey,
    maxSuggestions: input.maxSuggestions,
    suggestionPolicyId: input.suggestionPolicyId,
  });
}

function isValidLlmSuggestionPolicy(policy) {
  return (
    isNonEmptyText(policy?.suggestionPolicyId) &&
    isNonEmptyText(policy.providerAdapterId) &&
    isNonEmptyText(policy.outputValidatorPolicyId) &&
    isNonEmptyText(policy.redactionPolicyId) &&
    Array.isArray(policy.allowedSuggestionKinds) &&
    policy.allowedSuggestionKinds.length > 0 &&
    policy.allowedSuggestionKinds.every($0 => llmCurationSuggestionKinds.has($0)) &&
    policy.rawArtifactPolicy === "none" &&
    isValidLlmSuggestionPromptInputPolicy(policy.promptInputPolicy) &&
    isValidLlmSuggestionBudgetPolicy(policy.budgetPolicy ?? {})
  );
}

function isValidLlmSuggestionPromptInputPolicy(promptInputPolicy) {
  return (
    promptInputPolicy &&
    typeof promptInputPolicy === "object" &&
    typeof promptInputPolicy.includeAcceptedNavigationContext === "boolean" &&
    typeof promptInputPolicy.includeAcceptedCheckContext === "boolean" &&
    typeof promptInputPolicy.includeReadinessContext === "boolean" &&
    typeof promptInputPolicy.includeCoverageGapContext === "boolean" &&
    promptInputPolicy.includeStudentWorkspaceState === false
  );
}

function isValidLlmSuggestionBudgetPolicy(budgetPolicy) {
  return (
    budgetPolicy &&
    typeof budgetPolicy === "object" &&
    !Array.isArray(budgetPolicy) &&
    [
      budgetPolicy.maxProviderCalls,
      budgetPolicy.maxInputTokens,
      budgetPolicy.maxOutputTokens,
      budgetPolicy.maxEstimatedCostMinorUnits,
    ]
      .filter($0 => $0 !== undefined)
      .every($0 => Number.isInteger($0) && $0 >= 0)
  );
}

function isAllowedSuggestionKindSubset({ allowedSuggestionKinds, policy }) {
  const policyKinds = new Set(policy.allowedSuggestionKinds);
  return (
    Array.isArray(allowedSuggestionKinds) &&
    allowedSuggestionKinds.length > 0 &&
    allowedSuggestionKinds.every($0 => policyKinds.has($0))
  );
}

function buildLlmSuggestionPromptContext({
  database,
  getEffectiveParticipation,
  input,
  now,
  policy,
  programId,
}) {
  const model = buildCoverageModel(database, programId);
  const coverageGaps = resolveLlmSuggestionCoverageGaps({
    database,
    getEffectiveParticipation,
    input,
    now,
    programId,
  });
  if (coverageGaps.status === "rejected") {
    return coverageGaps;
  }

  const contextIds = new Set(input.contextEntityIds ?? []);
  if (!validateLlmSuggestionContextEntityIds({ contextIds, model })) {
    return rejected("validation_failed");
  }

  return accepted({
    acceptedNavigationEntities: policy.promptInputPolicy.includeAcceptedNavigationContext
      ? model.navigationEntities
        .filter($0 => contextIds.size === 0 || contextIds.has($0.id) || contextIds.has($0.revision.id))
        .map($0 => ({
          entityId: $0.id,
          acceptedKind: $0.acceptedKind,
          title: $0.revision.title,
          body: $0.revision.body ?? null,
          materialReferenceKind: $0.revision.materialReferenceKind ?? null,
          locator: $0.revision.locator ?? null,
        }))
      : [],
    acceptedChecks: policy.promptInputPolicy.includeAcceptedCheckContext
      ? [
          ...model.quickChecks.map($0 => ({
            entityId: $0.id,
            revisionId: $0.revision.id,
            checkKind: "quick_check",
            title: $0.revision.title,
          })),
          ...model.openAnswerChecks.map($0 => ({
            entityId: $0.id,
            revisionId: $0.revision.id,
            checkKind: "open_answer_check",
            title: $0.revision.title,
          })),
          ...model.criteria.map($0 => ({
            entityId: $0.id,
            revisionId: $0.revision.id,
            checkKind: "assessment_criterion",
            title: $0.revision.title,
          })),
        ].filter($0 => contextIds.size === 0 || contextIds.has($0.entityId) || contextIds.has($0.revisionId))
      : [],
    acceptedReadinessChecks: policy.promptInputPolicy.includeReadinessContext
      ? model.readinessChecks
        .filter($0 => contextIds.size === 0 || contextIds.has($0.id) || contextIds.has($0.revision.id))
        .map($0 => ({
          entityId: $0.id,
          revisionId: $0.revision.id,
          title: $0.revision.title,
          scope: $0.revision.scope,
          requirements: $0.revision.requirements,
        }))
      : [],
    coverageGaps: policy.promptInputPolicy.includeCoverageGapContext ? coverageGaps.value : [],
  });
}

function resolveLlmSuggestionCoverageGaps({ database, getEffectiveParticipation, input, now, programId }) {
  const requestedGapIds = input.coverageGapIds ?? [];
  if (requestedGapIds.length === 0) {
    return accepted([]);
  }

  const report = inspectCuratorCoverageGaps({
    database,
    getEffectiveParticipation,
    input: {
      actingIdentityId: input.actingIdentityId,
      programId,
    },
    now,
  });
  if (report.status === "rejected") {
    return report;
  }

  const gapsById = new Map(report.value.report.gaps.map($0 => [$0.gapId, $0]));
  const gaps = [];
  for (const gapId of requestedGapIds) {
    const gap = gapsById.get(gapId);
    if (!gap) {
      return rejected("coverage_gap_not_found");
    }
    gaps.push({
      gapId: gap.gapId,
      gapKind: gap.gapKind,
      severity: gap.severity,
      targetKind: gap.targetKind,
      targetId: gap.targetId,
      targetTitle: gap.targetTitle,
      title: gap.title,
      description: gap.description,
      sourceKind: gap.sourceKind,
      sourceIds: gap.sourceIds,
    });
  }

  return accepted(gaps);
}

function validateLlmSuggestionContextEntityIds({ contextIds, model }) {
  if (contextIds.size === 0) {
    return true;
  }

  const acceptedIds = new Set([
    ...model.navigationEntities.flatMap($0 => [$0.id, $0.revision.id]),
    ...model.quickChecks.flatMap($0 => [$0.id, $0.revision.id]),
    ...model.openAnswerChecks.flatMap($0 => [$0.id, $0.revision.id]),
    ...model.criteria.flatMap($0 => [$0.id, $0.revision.id]),
    ...model.readinessChecks.flatMap($0 => [$0.id, $0.revision.id]),
  ]);
  return [...contextIds].every($0 => acceptedIds.has($0));
}

function fingerprintLlmSuggestionGenerationRequest(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => [key, sortJson(entryValue)]),
  );
}

function isWithinLlmSuggestionBudget({ policy, providerOutput }) {
  const budget = policy.budgetPolicy ?? {};
  const usage = providerOutput?.providerUsage ?? {};
  return [
    ["maxProviderCalls", "providerCalls"],
    ["maxInputTokens", "inputTokens"],
    ["maxOutputTokens", "outputTokens"],
    ["maxEstimatedCostMinorUnits", "estimatedCostMinorUnits"],
  ].every(([budgetKey, usageKey]) => {
    if (budget[budgetKey] === undefined || usage[usageKey] === undefined) {
      return true;
    }
    return Number.isInteger(usage[usageKey]) && usage[usageKey] >= 0 && usage[usageKey] <= budget[budgetKey];
  });
}

function isValidLlmSuggestionProviderOutput({ allowedSuggestionKinds, maxSuggestions, policy, providerOutput }) {
  return (
    providerOutput &&
    providerOutput.outputValidation?.validatorPolicyId === policy.outputValidatorPolicyId &&
    providerOutput.outputValidation.passed === true &&
    Array.isArray(providerOutput.suggestions) &&
    providerOutput.suggestions.length > 0 &&
    providerOutput.suggestions.length <= maxSuggestions &&
    providerOutput.suggestions.every($0 =>
      isValidLlmSuggestionProviderSuggestion({
        allowedSuggestionKinds,
        suggestion: $0,
      }),
    )
  );
}

function isValidLlmSuggestionProviderSuggestion({ allowedSuggestionKinds, suggestion }) {
  return (
    suggestion &&
    allowedSuggestionKinds.includes(suggestion.suggestionKind) &&
    isNonEmptyText(suggestion.title) &&
    isNonEmptyText(suggestion.summary) &&
    isNonEmptyText(suggestion.rationale) &&
    Array.isArray(suggestion.supportingEvidence) &&
    suggestion.supportingEvidence.length > 0 &&
    suggestion.supportingEvidence.every(isValidLlmSuggestionSupportingEvidence) &&
    isValidLlmSuggestionDraft({ suggestionKind: suggestion.suggestionKind, suggestedDraft: suggestion.suggestedDraft }) &&
    !containsForbiddenLlmSuggestionArtifact(suggestion)
  );
}

function isValidLlmSuggestionSupportingEvidence(evidence) {
  return (
    evidence &&
    ["curator_instruction", "coverage_gap", "accepted_corpus_context"].includes(evidence.sourceKind) &&
    isNonEmptyText(evidence.sourceId) &&
    isNonEmptyText(evidence.label)
  );
}

function isValidLlmSuggestionDraft({ suggestionKind, suggestedDraft }) {
  if (
    !suggestedDraft ||
    suggestedDraft.candidateKind !== suggestionKind ||
    !suggestedDraft.request ||
    typeof suggestedDraft.request !== "object"
  ) {
    return false;
  }
  if (suggestionKind === "navigation_candidate") {
    return (
      ["topic", "concept", "definition", "principle", "material_reference", "relationship_update"].includes(
        suggestedDraft.request.candidateKind,
      ) &&
      isNonEmptyText(suggestedDraft.request.title)
    );
  }
  if (suggestionKind === "quick_check_candidate") {
    return (
      suggestedDraft.request.checkKind === "single_select_quick_check" &&
      isNonEmptyText(suggestedDraft.request.title) &&
      isNonEmptyText(suggestedDraft.request.prompt) &&
      Array.isArray(suggestedDraft.request.options) &&
      suggestedDraft.request.options.length >= 2 &&
      Number.isInteger(suggestedDraft.request.answerKeyIndex) &&
      suggestedDraft.request.answerKeyIndex >= 0 &&
      suggestedDraft.request.answerKeyIndex < suggestedDraft.request.options.length
    );
  }
  if (suggestionKind === "assessment_criterion_candidate") {
    return isNonEmptyText(suggestedDraft.request.title) && isNonEmptyText(suggestedDraft.request.body);
  }
  if (suggestionKind === "open_answer_check_candidate") {
    return (
      suggestedDraft.request.checkKind === "open_answer" &&
      isNonEmptyText(suggestedDraft.request.title) &&
      isNonEmptyText(suggestedDraft.request.prompt) &&
      Array.isArray(suggestedDraft.request.criterionEntityIds)
    );
  }
  if (suggestionKind === "readiness_check_candidate") {
    return (
      isNonEmptyText(suggestedDraft.request.title) &&
      Boolean(suggestedDraft.request.scope) &&
      Array.isArray(suggestedDraft.request.requirements) &&
      suggestedDraft.request.requirements.length > 0
    );
  }
  return false;
}

function containsForbiddenLlmSuggestionArtifact(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return forbiddenLlmSuggestionArtifactPatterns.some($0 => $0.test(value));
  }
  if (Array.isArray(value)) {
    return value.some(containsForbiddenLlmSuggestionArtifact);
  }
  if (typeof value !== "object") {
    return false;
  }
  return Object.entries(value).some(
    ([key, entryValue]) =>
      forbiddenLlmSuggestionArtifactPatterns.some($0 => $0.test(key)) ||
      containsForbiddenLlmSuggestionArtifact(entryValue),
  );
}

function summarizeLlmSuggestionSourceKinds({ context, request }) {
  return [
    ...(request.curatorInstruction ? ["curator_instruction"] : []),
    ...(context.coverageGaps.length > 0 ? ["coverage_gap"] : []),
    ...(context.acceptedNavigationEntities.length > 0 ||
    context.acceptedChecks.length > 0 ||
    context.acceptedReadinessChecks.length > 0
      ? ["accepted_corpus_context"]
      : []),
  ];
}

function summarizeLlmSuggestionSourceIds(context) {
  return [
    ...context.coverageGaps.map($0 => $0.gapId),
    ...context.acceptedNavigationEntities.map($0 => $0.entityId),
    ...context.acceptedChecks.map($0 => $0.entityId),
    ...context.acceptedReadinessChecks.map($0 => $0.entityId),
  ];
}

function summarizeLlmSuggestionPromptContext(context) {
  return [
    `${context.acceptedNavigationEntities.length} accepted navigation items`,
    `${context.acceptedChecks.length} accepted checks`,
    `${context.acceptedReadinessChecks.length} accepted readiness checks`,
    `${context.coverageGaps.length} coverage gaps`,
  ].join("; ");
}

function summarizeLlmCurationSuggestion(suggestion) {
  return {
    suggestionId: suggestion.id,
    programId: suggestion.programId,
    suggestionKind: suggestion.suggestionKind,
    title: suggestion.title,
    summary: suggestion.summary,
    status: suggestion.status,
    origin: suggestion.origin,
    ...(suggestion.materializedCandidateId
      ? {
          materializedCandidate: {
            candidateKind: suggestion.materializedCandidateKind,
            candidateId: suggestion.materializedCandidateId,
            materializedAt: suggestion.materializedAt,
            materializedByIdentityId: suggestion.materializedByIdentityId,
          },
        }
      : {}),
    ...(suggestion.rejectedAt
      ? {
          rejectedAt: suggestion.rejectedAt,
          rejectedByIdentityId: suggestion.rejectedByIdentityId,
        }
      : {}),
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
  };
}

function summarizeLlmCurationSuggestionDetail(suggestion) {
  return {
    ...summarizeLlmCurationSuggestion(suggestion),
    rationale: suggestion.rationale,
    suggestedDraft: suggestion.suggestedDraft,
    supportingEvidence: suggestion.supportingEvidence,
  };
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
  const navigationEntities = listAcceptedCorpusEntityRecords(database, { programId, status: "active" }).map(entity => {
    const revision = getAcceptedCorpusRevisionRecord(database, entity.currentRevisionId);
    return {
      ...entity,
      revision,
      title: revision.title,
    };
  });
  const activeNavigationEntityIds = new Set(navigationEntities.map($0 => $0.id));
  const relationships = listAcceptedNavigationRelationshipRecords(database, { programId, status: "active" })
    .filter(
      $0 =>
        activeNavigationEntityIds.has($0.fromEntityId) &&
        activeNavigationEntityIds.has($0.toEntityId),
    )
    .map(relationship => ({
      ...relationship,
      revision: getAcceptedNavigationRelationshipRevisionRecord(
        database,
        relationship.currentRevisionId,
      ),
    }));
  const quickChecks = listAcceptedQuickCheckEntityRecords(database, { programId, status: "active" }).map(entity => ({
    ...entity,
    revision: getAcceptedQuickCheckRevisionRecord(database, entity.currentRevisionId),
  }));
  const openAnswerChecks = listAcceptedOpenAnswerCheckEntityRecords(database, { programId, status: "active" }).map(
    entity => ({
      ...entity,
      revision: getAcceptedOpenAnswerCheckRevisionRecord(database, entity.currentRevisionId),
    }),
  );
  const criteria = listAcceptedAssessmentCriterionEntityRecords(database, { programId, status: "active" }).map(
    entity => ({
      ...entity,
      revision: getAcceptedAssessmentCriterionRevisionRecord(database, entity.currentRevisionId),
    }),
  );
  const readinessChecks = listAcceptedReadinessCheckEntityRecords(database, { programId, status: "active" }).map(
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
