import { failureResult, StartupValidationFailure } from "./errors.js";
import { validateProviderCliAvailability } from "./provider-cli-availability.js";
import { createRun as createStoredRun } from "./run-store.js";
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
  if (!reviewFixPolicy) {
    return failureResult(new StartupValidationFailure("ReviewFixPolicy is required"));
  }

  const workingDirectory = input.workingDirectory ?? process.cwd();
  const homeDirectory = input.homeDirectory ?? dependencies.homeDirectory;
  const resolveAgents = dependencies.resolveAgentSettings ?? resolveAgentSettings;
  const resolveRouting = dependencies.resolveModelRouting ?? resolveModelRouting;
  const validateCliAvailability =
    dependencies.validateProviderCliAvailability ?? validateProviderCliAvailability;
  const createRun = dependencies.createRun ?? createStoredRun;

  try {
    const agentSettings = await resolveAgents(workingDirectory, { homeDirectory });
    const modelRouting = await resolveRouting(workingDirectory, { homeDirectory });
    await validateCliAvailability(modelRouting, dependencies);
    const run = await createRun(dependencies.runStoreOptions ?? { homeDirectory });

    return {
      agentSettings,
      exitCode: 0,
      modelRouting,
      runDirectory: run.runDirectory,
      runId: run.runId,
      status: "succeeded",
    };
  } catch (error) {
    return failureResult(error);
  }
}
