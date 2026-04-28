import { failureResult } from "./errors.js";
import { runWorkflow } from "./orchestrator.js";
import { executeProviderCli } from "./provider-cli-executor.js";
import { createConfigBasedReviewFixPolicy } from "./review-policies/config-based-review-fix-policy.js";
import { bootstrapMissingSettings } from "./settings/example-bootstrap.js";
import { resolvePolicySettings } from "./settings/policy-settings.js";

export function createRegentaraComposition(options = {}) {
  const reviewFixPolicy = options.reviewFixPolicy;
  const providerCliExecutor = options.executeProviderCli ?? executeProviderCli;
  const bootstrapSettings = options.bootstrapMissingSettings ?? bootstrapMissingSettings;
  const resolvePolicy = options.resolvePolicySettings ?? resolvePolicySettings;

  return {
    reviewFixPolicy,
    runWorkflow: async (input = {}) => {
      const workingDirectory = input.workingDirectory ?? process.cwd();
      const homeDirectory = input.homeDirectory ?? options.runStoreOptions?.homeDirectory;
      const debugReporter = input.debugReporter;
      let resolvedReviewFixPolicy;
      try {
        if (!reviewFixPolicy) {
          await bootstrapSettings(workingDirectory, { homeDirectory });
        }
        if (reviewFixPolicy) {
          resolvedReviewFixPolicy = reviewFixPolicy;
        } else {
          const policySettings = await resolvePolicy(workingDirectory, { homeDirectory });
          debugReporter?.rememberSettings({ policy: policySettings.selectedPath });
          resolvedReviewFixPolicy = createConfigBasedReviewFixPolicy(policySettings);
        }
      } catch (error) {
        debugReporter?.report("failure", { reason: error.message });
        return failureResult(error);
      }

      return runWorkflow({
        ...input,
        reviewFixPolicy: resolvedReviewFixPolicy,
      }, {
        artifactExists: options.artifactExists,
        commandExists: options.commandExists,
        executeProviderCli: providerCliExecutor,
        runStoreOptions: options.runStoreOptions,
      });
    },
  };
}
