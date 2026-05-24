import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAuthoredArtifact } from "../src/artifact-store.js";
import { createRun } from "../src/run-store.js";
import { makeSettingsWorkspace } from "./helpers/settings.js";

test("createAuthoredArtifact should reject authored artifact overwrite attempts", async () => {
  const workspace = await makeSettingsWorkspace();
  const run = await createRun({
    homeDirectory: workspace.homeDirectory,
    randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
  });
  await createAuthoredArtifact(run.runDirectory, "producer/result.json", "{}");

  await assert.rejects(
    () => createAuthoredArtifact(run.runDirectory, "producer/result.json", "{}"),
    /authored artifact already exists/,
  );
});

test("createAuthoredArtifact should write new authored artifact content once", async () => {
  const workspace = await makeSettingsWorkspace();
  const run = await createRun({
    homeDirectory: workspace.homeDirectory,
    randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
  });

  const artifact = await createAuthoredArtifact(run.runDirectory, "producer/result.json", "{}");

  assert.equal(await readFile(artifact.path, "utf8"), "{}");
});
