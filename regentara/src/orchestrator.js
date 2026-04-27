import { failureResult, StartupValidationFailure } from "./errors.js";
import { validateProviderCliAvailability } from "./provider-cli-availability.js";
import { createRun as createStoredRun } from "./run-store.js";
import { validateRuntimeOutput } from "./runtime-output.js";
import { resolveAgentSettings } from "./settings/agent-settings.js";
import { resolveModelRouting } from "./settings/model-routing.js";

export class ReviewFixPolicy {
  async decide() {
    return {
      decision: "complete-fail",
      session: undefined,
    };
  }
}

export async function runWorkflow(input = {}, dependencies = {}) {
  const reviewFixPolicy = input.reviewFixPolicy ?? dependencies.reviewFixPolicy;
  if (!reviewFixPolicy || typeof reviewFixPolicy.decide !== "function") {
    return failureResult(new StartupValidationFailure("ReviewFixPolicy is required"));
  }

  const workingDirectory = input.workingDirectory ?? process.cwd();
  const homeDirectory = input.homeDirectory ?? dependencies.homeDirectory;
  const resolveAgents = dependencies.resolveAgentSettings ?? resolveAgentSettings;
  const resolveRouting = dependencies.resolveModelRouting ?? resolveModelRouting;
  const validateCliAvailability =
    dependencies.validateProviderCliAvailability ?? validateProviderCliAvailability;
  const createRun = dependencies.createRun ?? createStoredRun;
  const executeProviderCli = dependencies.executeProviderCli;

  try {
    const agentSettings = await resolveAgents(workingDirectory, { homeDirectory });
    const modelRouting = await resolveRouting(workingDirectory, { homeDirectory });
    await validateCliAvailability(modelRouting, dependencies);
    const run = await createRun(dependencies.runStoreOptions ?? { homeDirectory });

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
        throw new StartupValidationFailure(`unsupported review policy decision: ${policyResult.decision}`);
      }

      const remediatorResult = await executeAgent({
        agentId: "remediator",
        agentSettings,
        executeProviderCli,
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
    return failureResult(error);
  }
}

async function executeAgent({
  agentId,
  agentSettings,
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

  return validateRuntimeOutput(
    agentId,
    providerResult.jsonOutput ?? providerResult.stdoutReference,
    agent.outputSchema,
  );
}
