import { ReviewFixPolicy, runWorkflow } from "./orchestrator.js";
import { executeProviderCli } from "./provider-cli-executor.js";

export function createRegentaraComposition(options = {}) {
  const reviewFixPolicy = options.reviewFixPolicy ?? new ReviewFixPolicy();
  const providerCliExecutor = options.executeProviderCli ?? executeProviderCli;

  return {
    reviewFixPolicy,
    runWorkflow: (input) => runWorkflow({
      ...input,
      reviewFixPolicy,
    }, {
      executeProviderCli: providerCliExecutor,
    }),
  };
}
