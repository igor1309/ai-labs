import assert from "node:assert/strict";
import test from "node:test";

import { failureResult } from "../src/errors.js";

test("failureResult should use an unknown failure message when no error message exists", () => {
  assert.equal(failureResult().failureReason, "unknown failure");
});
