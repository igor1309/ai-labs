import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

test("backendSkeleton_shouldExposeServerEntrypoint_onStepOne", () => {
  const serverEntrypoint = new URL("../src/server.js", import.meta.url);

  assert.equal(existsSync(serverEntrypoint), true);
});
