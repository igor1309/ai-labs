import { artifactExists as artifactExistsInRun } from "./artifact-store.js";
import { failureResult, RuntimeFailure, StartupValidationFailure } from "./errors.js";
import { validateProviderCliAvailability } from "./provider-cli-availability.js";
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
  if (!reviewFixPolicy || typeof reviewFixPolicy.decide !== "function") {
    return failureResult(new StartupValidationFailure("ReviewFixPolicy is required"));
  }

  if (input.interrupted) {
    return failureResult(new StartupValidationFailure("workflow interrupted before start"));
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

  try {
    if (runBootstrap) {
      await runBootstrap(workingDirectory, { homeDirectory });
    }
    const agentSettings = await resolveAgents(workingDirectory, { homeDirectory });
    const modelRouting = await resolveRouting(workingDirectory, { homeDirectory });
    assertRouteReferencesResolve(agentSettings, modelRouting);
    const referencedRunners = Object.values(agentSettings.agents)
      .map((agent) => modelRouting.routes[agent.model].runner);
    await validateCliAvailability(referencedRunners, dependencies);
    if (executeProviderCli && !isNonBlankString(input.taskFile)) {
      throw new StartupValidationFailure("task file is required for provider execution");
    }
    run = await createRun({
      ...(dependencies.runStoreOptions ?? { homeDirectory }),
      ...(input.taskFile ? { taskFile: input.taskFile } : {}),
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
      await finalizeRun(updateRunMetadata, run.runDirectory, "succeeded", 0);
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

    while (true) {
      const producerResult = await executeAgent({
        agentId: "producer",
        agentSettings,
        emitEvent,
        executeProviderCli,
        artifactExists,
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
        input: {
          producer: producerResult,
          task: currentTask,
        },
        modelRouting,
      });
      const policyResult = await reviewFixPolicy.decide({
        session: policySession,
        verdict: reviewerResult,
      });
      await emitEvent({
        currentDecision: policyResult.decision,
        type: "policy-decision",
      });

      policySession = policyResult.session;

      if (policyResult.decision === "complete-ok") {
        await emitEvent({
          finalStatus: "succeeded",
          type: "completion",
        });
        await finalizeRun(updateRunMetadata, run.runDirectory, "succeeded", 0);
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
        await finalizeRun(updateRunMetadata, run.runDirectory, "failed", 1);
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
        input: {
          producer: producerResult,
          task: currentTask,
          verdict: reviewerResult,
        },
        modelRouting,
      });
      currentTask = remediatorResult.task;
    }
  } catch (error) {
    if (run && !(error instanceof StartupValidationFailure)) {
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
        }),
        runId: run.runId,
        timestamp: new Date().toISOString(),
        type: "runtime-failure",
      });
      await updateRunMetadata(run.runDirectory, {
        endTime: new Date().toISOString(),
        exitCode: 1,
        status: "failed",
      });
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

async function finalizeRun(updateRunMetadata, runDirectory, status, exitCode) {
  await updateRunMetadata(runDirectory, {
    endTime: new Date().toISOString(),
    exitCode,
    status,
  });
}

function assertRouteReferencesResolve(agentSettings, modelRouting) {
  for (const [agentId, agent] of Object.entries(agentSettings.agents)) {
    if (!Object.prototype.hasOwnProperty.call(modelRouting.routes, agent.model)) {
      throw new StartupValidationFailure(
        `agents.yaml agent ${agentId} references undefined route key in models.yaml: ${agent.model}`,
      );
    }
  }
}

async function executeAgent({
  agentId,
  agentSettings,
  artifactExists,
  emitEvent,
  executeProviderCli,
  input,
  modelRouting,
  taskFile,
}) {
  const agent = agentSettings.agents[agentId];
  const route = modelRouting.routes[agent.model];
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
      prompt: buildAgentPrompt(agentId, agent, input),
      provider: route.provider,
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
      }),
      type: "agent-end",
    });

    return output;
  } catch (error) {
    if (error && typeof error === "object") {
      error.currentAgent ??= agentId;
      error.model ??= route.model;
      error.provider ??= route.provider;
      error.runner ??= route.runner;
      error.runnerReference ??= error.cause?.runnerReference;
      error.sessionReference ??= error.cause?.sessionReference;
      error.stderrReference ??= error.cause?.stderrReference ?? summarizeFailureOutput(error.cause?.stderr);
      error.stdoutReference ??= error.cause?.stdoutReference ?? summarizeFailureOutput(error.cause?.stdout);
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

function buildAgentPrompt(agentId, agent, input) {
  return [
    `Regentara agent: ${agentId}`,
    `Prompt reference: ${agent.prompt.ref}`,
    "Task context JSON:",
    JSON.stringify(input, null, 2),
    "Final semantic result JSON Schema:",
    JSON.stringify(agent.outputSchema, null, 2),
    "Return the final semantic result through the runner native structured-output mode.",
  ].join("\n\n");
}
