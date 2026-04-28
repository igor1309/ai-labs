import { runWorkflow } from "./orchestrator.js";
import { executeProviderCli } from "./provider-cli-executor.js";

export function createRegentaraComposition(options = {}) {
  const reviewFixPolicy = options.reviewFixPolicy;
  const providerCliExecutor = options.executeProviderCli ?? executeProviderCli;

  return {
    reviewFixPolicy,
    runWorkflow: (input) => runWorkflow({
      ...input,
      reviewFixPolicy,
    }, {
      artifactExists: options.artifactExists,
      commandExists: options.commandExists,
      executeProviderCli: providerCliExecutor,
      runStoreOptions: options.runStoreOptions,
    }),
  };
}
