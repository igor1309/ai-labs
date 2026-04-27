import { ReviewFixPolicy, runWorkflow } from "./orchestrator.js";

export function createRegentaraComposition() {
  return {
    reviewFixPolicy: new ReviewFixPolicy(),
    runWorkflow,
  };
}
