import assert from "node:assert/strict";
import test from "node:test";

import { runWorkflow } from "../src/orchestrator.js";
import {
  makeSettingsWorkspace,
  validAgentsYaml,
  validModelsYaml,
  writeLocalSettings,
} from "./helpers/settings.js";

test("runWorkflow should fail before creating a run when a required provider CLI is unavailable", async () => {
  const workspace = await makeSettingsWorkspace();
  let createRunCalled = false;
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());

  const result = await runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    workingDirectory: workspace.workingDirectory,
  }, {
    commandExists: async () => false,
    createRun: async () => {
      createRunCalled = true;
    },
  });

  assert.deepEqual(
    { createRunCalled, status: result.status },
    { createRunCalled: false, status: "failed" },
  );
});

test("runWorkflow should create a run after startup validation passes", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());

  const result = await runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    workingDirectory: workspace.workingDirectory,
  }, {
    commandExists: async () => true,
    runStoreOptions: {
      homeDirectory: workspace.homeDirectory,
      randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
    },
  });

  assert.match(result.runId, /^[0-9]{8}T[0-9]{6}Z-[a-z0-9]{8}$/);
});
