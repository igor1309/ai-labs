import { artifactExists as artifactExistsInRun } from "./artifact-store.js";
import { failureResult, RuntimeFailure, StartupValidationFailure } from "./errors.js";
import { validateProviderCliAvailability } from "./provider-cli-availability.js";
import { createRun as createStoredRun } from "./run-store.js";
import { updateRunMetadata as updateStoredRunMetadata } from "./run-store.js";
import { validateRuntimeOutput } from "./runtime-output.js";
import { resolveAgentSettings } from "./settings/agent-settings.js";
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
  const updateRunMetadata = dependencies.updateRunMetadata ?? updateStoredRunMetadata;
  let run;

  try {
    const agentSettings = await resolveAgents(workingDirectory, { homeDirectory });
    const modelRouting = await resolveRouting(workingDirectory, { homeDirectory });
    await validateCliAvailability(modelRouting, dependencies);
    run = await createRun(dependencies.runStoreOptions ?? { homeDirectory });
    const artifactExists =
      dependencies.artifactExists ?? ((relativePath) => artifactExistsInRun(run.runDirectory, relativePath));

    if (dependencies.interruptAfterRunCreated) {
      throw new RuntimeFailure("workflow interrupted after start");
    }

    if (!executeProviderCli) {
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
        executeProviderCli,
        artifactExists,
        input: {
          task: currentTask,
        },
        modelRouting,
        workingDirectory,
      });
      const reviewerResult = await executeAgent({
        agentId: "reviewer",
        agentSettings,
        executeProviderCli,
        artifactExists,
        input: {
          producer: producerResult,
          task: currentTask,
        },
        modelRouting,
        workingDirectory,
      });
      const policyResult = await reviewFixPolicy.decide({
        session: policySession,
        verdict: reviewerResult,
      });

      policySession = policyResult.session;

      if (policyResult.decision === "complete-ok") {
        return {
          exitCode: 0,
          runDirectory: run.runDirectory,
          runId: run.runId,
          status: "succeeded",
        };
      }

      if (policyResult.decision === "complete-fail") {
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
        executeProviderCli,
        artifactExists,
        input: {
          producer: producerResult,
          task: currentTask,
          verdict: reviewerResult,
        },
        modelRouting,
        workingDirectory,
      });
      currentTask = remediatorResult.task;
    }
  } catch (error) {
    if (run && !(error instanceof StartupValidationFailure)) {
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

async function executeAgent({
  agentId,
  agentSettings,
  artifactExists,
  executeProviderCli,
  input,
  modelRouting,
  workingDirectory,
}) {
  const agent = agentSettings.agents[agentId];
  const route = modelRouting.routes[agent.model];
  const providerResult = await executeProviderCli({
    executionInput: input,
    model: route.model,
    runner: route.runner,
    workingDirectory,
  });

  const output = validateRuntimeOutput(
    agentId,
    providerResult.jsonOutput ?? providerResult.rawStdout,
    agent.outputSchema,
  );

  if (output.artifact && artifactExists && !(await artifactExists(output.artifact))) {
    throw new RuntimeFailure(`expected artifact missing: ${output.artifact}`);
  }

  return output;
}
