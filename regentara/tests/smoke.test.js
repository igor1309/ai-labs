import assert from "node:assert/strict";
import test from "node:test";

import { runWorkflow } from "../src/orchestrator.js";

test("package should export runWorkflow", () => {
  assert.equal(typeof runWorkflow, "function");
});
