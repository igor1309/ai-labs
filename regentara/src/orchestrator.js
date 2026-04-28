import { artifactExists as artifactExistsInRun } from "./artifact-store.js";
import { failureResult, RuntimeFailure, StartupValidationFailure } from "./errors.js";
import { validateProviderCliAvailability } from "./provider-cli-availability.js";
import { buildAgentPrompt } from "./prompts.js";
import {
  appendRunEvent,
  createRun as createStoredRun,
  updateRunMetadata as updateStoredRunMetadata,
} from "./run-store.js";
import { validateRuntimeOutput } from "./runtime-output.js";
import { resolveAgentSettings } from "./settings/agent-settings.js";
import { bootstrapMissingSettings } from "./settings/example-bootstrap.js";
import { resolveModelRouting } from "./settings/model-routing.js";

export async function runWorkflow(input = {}, dependencies = {}) {
  const reviewFixPolicy = input.reviewFixPolicy ?? dependencies.reviewFixPolicy;
  const debugReporter = input.debugReporter ?? dependencies.debugReporter;
  if (!reviewFixPolicy || typeof reviewFixPolicy.decide !== "function") {
    const error = new StartupValidationFailure("ReviewFixPolicy is required");
    debugReporter?.report("failure", { reason: error.message });
    return failureResult(error);
  }

  if (input.interrupted) {
    const error = new StartupValidationFailure("workflow interrupted before start");
    debugReporter?.report("failure", { reason: error.message });
    return failureResult(error);
  }

  const workingDirectory = input.workingDirectory ?? process.cwd();
  const homeDirectory = input.homeDirectory ?? dependencies.homeDirectory;
  const resolveAgents = dependencies.resolveAgentSettings ?? resolveAgentSettings;
  const resolveRouting = dependencies.resolveModelRouting ?? resolveModelRouting;
  const validateCliAvailability =
    dependencies.validateProviderCliAvailability ?? validateProviderCliAvailability;
  const createRun = dependencies.createRun ?? createStoredRun;
  const executeProviderCli = dependencies.executeProviderCli;
  const recordRunEvent = dependencies.recordRunEvent ?? appendRunEvent;
  const updateRunMetadata = dependencies.updateRunMetadata ?? updateStoredRunMetadata;
  const resolversOverridden =
    Boolean(dependencies.resolveAgentSettings) || Boolean(dependencies.resolveModelRouting);
  const runBootstrap = dependencies.bootstrapMissingSettings
    ?? (resolversOverridden ? null : bootstrapMissingSettings);
  let run;
  const runMetrics = createRunMetrics();
  let settingsReported = false;

  try {
    if (runBootstrap) {
      await runBootstrap(workingDirectory, { homeDirectory });
    }
    const agentSettings = await resolveAgents(workingDirectory, { homeDirectory });
    debugReporter?.rememberSettings({
      agents: agentSettings.selectedPath,
    });
    const modelRouting = await resolveRouting(workingDirectory, { homeDirectory });
    debugReporter?.rememberSettings({
      models: modelRouting.selectedPath,
    });
    debugReporter?.reportSettings();
    settingsReported = true;
    assertRouteReferencesResolve(agentSettings, modelRouting);
    const referencedRunners = Object.values(agentSettings.agents)
      .map((agent) => resolveAgentRoute(agent, modelRouting).runner);
    await validateCliAvailability(referencedRunners, dependencies);
    if (executeProviderCli && !isNonBlankString(input.taskFile)) {
      throw new StartupValidationFailure("task file is required for provider execution");
    }
    run = await createRun({
      ...(dependencies.runStoreOptions ?? { homeDirectory }),
      ...(input.taskFile ? { taskFile: input.taskFile } : {}),
    });
    debugReporter?.report("run-created", {
      runDirectory: run.runDirectory,
      runId: run.runId,
    });
    const emitEvent = (event) => recordRunEvent(run.runDirectory, {
      ...event,
      runId: run.runId,
      timestamp: new Date().toISOString(),
    });
    const artifactExists =
      dependencies.artifactExists ?? ((relativePath) => artifactExistsInRun(run.runDirectory, relativePath));

    if (dependencies.interruptAfterRunCreated) {
      throw new RuntimeFailure("workflow interrupted after start");
    }

    if (!executeProviderCli) {
      await emitEvent({
        finalStatus: "succeeded",
        type: "completion",
      });
      debugReporter?.report("completion", completionDebugFields("succeeded", run, runMetrics));
      await finalizeRun(updateRunMetadata, run, "succeeded", 0, runMetrics);
      return {
        agentSettings,
        exitCode: 0,
        modelRouting,
        runDirectory: run.runDirectory,
        runId: run.runId,
        status: "succeeded",
      };
    }

    let currentTask = input.task;
    let policySession;
    const reviewHistory = [];

    while (true) {
      const producerResult = await executeAgent({
        agentId: "producer",
        agentSettings,
        emitEvent,
        executeProviderCli,
        artifactExists,
        debugReporter,
        recordProviderMetrics: (providerResult) => addProviderMetrics(runMetrics, providerResult),
        input: {
          task: currentTask,
        },
        modelRouting,
        taskFile: input.taskFile,
      });
      const reviewerResult = await executeAgent({
        agentId: "reviewer",
        agentSettings,
        emitEvent,
        executeProviderCli,
        artifactExists,
        debugReporter,
        recordProviderMetrics: (providerResult) => addProviderMetrics(runMetrics, providerResult),
        input: {
          producer: producerResult,
          task: currentTask,
        },
        modelRouting,
      });
      reviewHistory.push(reviewerResult);
      const policyResult = await reviewFixPolicy.decide({
        session: policySession,
        verdict: reviewerResult,
      });
      await emitEvent({
        currentDecision: policyResult.decision,
        type: "policy-decision",
      });
      debugReporter?.report("policy-decision", definedObject({
        decision: policyResult.decision,
        remediationBudget: policyResult.maxRemediationAttempts,
        remediationsUsed: policyResult.session?.remediationAttempts
          ?? policySession?.remediationAttempts
          ?? 0,
      }));

      policySession = policyResult.session;

      if (policyResult.decision === "complete-ok") {
        await emitEvent({
          finalStatus: "succeeded",
          type: "completion",
        });
        debugReporter?.report("completion", completionDebugFields("succeeded", run, runMetrics));
        await finalizeRun(updateRunMetadata, run, "succeeded", 0, runMetrics);
        return {
          exitCode: 0,
          runDirectory: run.runDirectory,
          runId: run.runId,
          status: "succeeded",
        };
      }

      if (policyResult.decision === "complete-fail") {
        await emitEvent({
          finalStatus: "failed",
          type: "completion",
        });
        debugReporter?.report("completion", completionDebugFields("failed", run, runMetrics));
        await finalizeRun(updateRunMetadata, run, "failed", 1, runMetrics);
        return {
          exitCode: 1,
          failureReason: "review policy completed with failure",
          runDirectory: run.runDirectory,
          runId: run.runId,
          status: "failed",
        };
      }

      if (policyResult.decision !== "remediate") {
        throw new RuntimeFailure(`unsupported review policy decision: ${policyResult.decision}`);
      }

      const remediatorResult = await executeAgent({
        agentId: "remediator",
        agentSettings,
        emitEvent,
        executeProviderCli,
        artifactExists,
        debugReporter,
        recordProviderMetrics: (providerResult) => addProviderMetrics(runMetrics, providerResult),
        input: {
          producer: producerResult,
          reviews: [...reviewHistory],
          task: currentTask,
          verdict: reviewerResult,
        },
        modelRouting,
      });
      currentTask = remediatorResult.task;
    }
  } catch (error) {
    if (!run || error instanceof StartupValidationFailure) {
      if (!settingsReported) {
        debugReporter?.reportSettings();
      }
      debugReporter?.report("failure", { reason: error.message });
    }

    if (run && !(error instanceof StartupValidationFailure)) {
      addProviderMetrics(runMetrics, error);
      debugReporter?.report("failure", definedObject({
        cost: formatCost(error.costUsd),
        providerError: error.providerError,
        providerStatus: error.providerStatus,
        reason: error.message,
        route: error.route,
        status: "failed",
      }));
      await recordRunEvent(run.runDirectory, {
        currentAgent: error.currentAgent,
        failureReason: error.message,
        finalStatus: "failed",
        ...definedObject({
          model: error.model,
          provider: error.provider,
          runner: error.runner,
          runnerReference: error.runnerReference,
          sessionReference: error.sessionReference,
          stderrReference: error.stderrReference,
          stdoutReference: error.stdoutReference,
          costUsd: error.costUsd,
          providerError: error.providerError,
          providerStatus: error.providerStatus,
        }),
        runId: run.runId,
        timestamp: new Date().toISOString(),
        type: "runtime-failure",
      });
      await finalizeRun(updateRunMetadata, run, "failed", 1, runMetrics);
    }

    return failureResult(error, run
      ? {
        runDirectory: run.runDirectory,
        runId: run.runId,
      }
      : {});
  }
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function finalizeRun(updateRunMetadata, run, status, exitCode, runMetrics) {
  const endTime = new Date().toISOString();
  await updateRunMetadata(run.runDirectory, {
    duration: formatDurationBetween(run.startedAt, endTime),
    endTime,
    exitCode,
    status,
    ...runCostMetadata(runMetrics),
  });
}

function createRunMetrics() {
  return {
    totalCostUsd: 0,
    hasCost: false,
  };
}

function addProviderMetrics(runMetrics, providerResult = {}) {
  if (typeof providerResult.costUsd === "number" && Number.isFinite(providerResult.costUsd)) {
    runMetrics.totalCostUsd += providerResult.costUsd;
    runMetrics.hasCost = true;
  }
}

function runCostMetadata(runMetrics) {
  if (!runMetrics.hasCost) {
    return {};
  }

  const totalCostUsd = roundCost(runMetrics.totalCostUsd);
  return {
    totalCost: formatCost(totalCostUsd),
    totalCostUsd,
  };
}

function completionDebugFields(status, run, runMetrics) {
  return definedObject({
    duration: formatDurationBetween(run.startedAt, new Date().toISOString()),
    status,
    totalCost: runMetrics.hasCost ? formatCost(runMetrics.totalCostUsd) : undefined,
  });
}

function formatRoute(route, tier) {
  return `${route.runner}/${route.provider}/${route.model}/${tier}`;
}

function formatCost(costUsd) {
  if (typeof costUsd !== "number" || !Number.isFinite(costUsd)) {
    return undefined;
  }

  return `$${roundCost(costUsd).toFixed(4)}`;
}

function roundCost(costUsd) {
  return Math.round(costUsd * 10000) / 10000;
}

function formatDurationBetween(startIso, endIso) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return undefined;
  }

  return formatDurationSeconds(Math.round((end - start) / 1000));
}

function formatDurationMs(durationMs) {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
    return undefined;
  }

  return formatDurationSeconds(Math.round(durationMs / 1000));
}

function formatDurationSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function assertRouteReferencesResolve(agentSettings, modelRouting) {
  for (const [agentId, agent] of Object.entries(agentSettings.agents)) {
    resolveAgentRoute(agent, modelRouting, agentId);
  }
}

function resolveAgentRoute(agent, modelRouting, agentId = "agent") {
  const provider = modelRouting.providers[agent.provider];
  const model = provider?.models[agent.model];

  if (!provider || !model) {
    throw new StartupValidationFailure(
      `agents.yaml agent ${agentId} references undefined provider/model in models.yaml: ${agent.provider}/${agent.model}`,
    );
  }

  return {
    model: model.model,
    provider: agent.provider,
    reasoningEffort: model.reasoningEffort,
    runner: provider.runner,
  };
}

async function executeAgent({
  agentId,
  agentSettings,
  artifactExists,
  debugReporter,
  emitEvent,
  executeProviderCli,
  input,
  modelRouting,
  recordProviderMetrics,
  taskFile,
}) {
  const agent = agentSettings.agents[agentId];
  const route = resolveAgentRoute(agent, modelRouting, agentId);
  const routeLabel = formatRoute(route, agent.model);
  debugReporter?.report("agent-start", definedObject({
    agent: agentId,
    route: routeLabel,
    taskFile: agentId === "producer" ? taskFile : undefined,
  }));
  await emitEvent?.({
    agentId,
    currentAgent: agentId,
    model: route.model,
    provider: route.provider,
    runner: route.runner,
    ...(agentId === "producer" ? { taskFile } : {}),
    type: "agent-start",
  });
  try {
    const providerResult = await executeProviderCli({
      agentId,
      executionInput: input,
      model: route.model,
      outputSchema: agent.outputSchema,
      prompt: await buildAgentPrompt(agentId, agent, input),
      provider: route.provider,
      reasoningEffort: route.reasoningEffort,
      runner: route.runner,
    });

    if (!Object.prototype.hasOwnProperty.call(providerResult, "semanticResult")) {
      throw new RuntimeFailure(`provider semantic result missing: ${agentId}`);
    }

    const output = validateRuntimeOutput(agentId, providerResult.semanticResult, agent.outputSchema);

    if (output.artifact && artifactExists && !(await artifactExists(output.artifact))) {
      throw new RuntimeFailure(`expected artifact missing: ${output.artifact}`);
    }

    await emitEvent?.({
      agentId,
      currentAgent: agentId,
      model: route.model,
      provider: route.provider,
      runner: route.runner,
      ...definedObject({
        runnerReference: providerResult.runnerReference,
        sessionReference: providerResult.sessionReference,
        stderrReference: providerResult.stderrReference,
        stdoutReference: providerResult.stdoutReference,
        costUsd: providerResult.costUsd,
        durationMs: providerResult.durationMs,
        providerError: providerResult.providerError,
        providerStatus: providerResult.providerStatus,
      }),
      type: "agent-end",
    });
    recordProviderMetrics?.(providerResult);
    debugReporter?.report("agent-end", definedObject({
      agent: agentId,
      cost: formatCost(providerResult.costUsd),
      duration: formatDurationMs(providerResult.durationMs),
      providerError: providerResult.providerError,
      providerStatus: providerResult.providerStatus,
      route: routeLabel,
      runnerReference: providerResult.runnerReference,
      sessionReference: providerResult.sessionReference,
    }));

    return output;
  } catch (error) {
    if (error && typeof error === "object") {
      error.currentAgent ??= agentId;
      error.model ??= route.model;
      error.provider ??= route.provider;
      error.providerError ??= error.cause?.providerError;
      error.providerStatus ??= error.cause?.providerStatus;
      error.runner ??= route.runner;
      error.runnerReference ??= error.cause?.runnerReference;
      error.route ??= routeLabel;
      error.sessionReference ??= error.cause?.sessionReference;
      error.stderrReference ??= error.cause?.stderrReference ?? summarizeFailureOutput(error.cause?.stderr);
      error.stdoutReference ??= error.cause?.stdoutReference ?? summarizeFailureOutput(error.cause?.stdout);
      error.costUsd ??= error.cause?.costUsd;
      error.durationMs ??= error.cause?.durationMs;
    }

    throw error;
  }
}

function summarizeFailureOutput(output) {
  if (!output) {
    return undefined;
  }

  return output.slice(0, 4096);
}

function definedObject(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}
