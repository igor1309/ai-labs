import assert from "node:assert/strict";
import test from "node:test";

import { createRegentaraComposition } from "../src/composition.js";

test("createRegentaraComposition should require an injected ReviewFixPolicy", async () => {
  const composition = createRegentaraComposition({
    executeProviderCli: async () => ({ exitStatus: 0, jsonOutput: {} }),
  });

  const result = await composition.runWorkflow();

  assert.deepEqual(
    { failureReason: result.failureReason, status: result.status },
    { failureReason: "ReviewFixPolicy is required", status: "failed" },
  );
});
