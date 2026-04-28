import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { runWorkflow } from "../src/orchestrator.js";
import {
  makeSettingsWorkspace,
  validAgentsYaml,
  validModelsYaml,
  writeLocalSettings,
} from "./helpers/settings.js";

async function pathExists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

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

test("runWorkflow should fail before creating a run when agents.yaml references a route key not defined in models.yaml", async () => {
  const workspace = await makeSettingsWorkspace();
  let createRunCalled = false;
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    producer: {
      model: "missing-route",
      output: { schemaRef: "regentara://schemas/producer-output" },
      prompt: { ref: "regentara://prompts/producer" },
    },
  }));
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());

  const result = await runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    workingDirectory: workspace.workingDirectory,
  }, {
    commandExists: async () => true,
    createRun: async () => {
      createRunCalled = true;
    },
  });

  assert.deepEqual(
    { createRunCalled, failureReasonHasRouteKey: result.failureReason?.includes("missing-route"), status: result.status },
    { createRunCalled: false, failureReasonHasRouteKey: true, status: "failed" },
  );
});

test("runWorkflow should write only agents.yaml.example when agents.yaml is missing but models.yaml exists", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());
  const agentsExample = join(workspace.homeDirectory, ".regentara", "agents.yaml.example");
  const modelsExample = join(workspace.homeDirectory, ".regentara", "models.yaml.example");

  await runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    workingDirectory: workspace.workingDirectory,
  }, {
    commandExists: async () => true,
  });

  assert.deepEqual(
    { agentsExampleWritten: await pathExists(agentsExample), modelsExampleWritten: await pathExists(modelsExample) },
    { agentsExampleWritten: true, modelsExampleWritten: false },
  );
});

test("runWorkflow should write only models.yaml.example when models.yaml is missing but agents.yaml exists", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
  const agentsExample = join(workspace.homeDirectory, ".regentara", "agents.yaml.example");
  const modelsExample = join(workspace.homeDirectory, ".regentara", "models.yaml.example");

  await runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    workingDirectory: workspace.workingDirectory,
  }, {
    commandExists: async () => true,
  });

  assert.deepEqual(
    { agentsExampleWritten: await pathExists(agentsExample), modelsExampleWritten: await pathExists(modelsExample) },
    { agentsExampleWritten: false, modelsExampleWritten: true },
  );
});

test("runWorkflow startup failures should surface failureReason naming the offending file or rule", async () => {
  const scenarios = [
    {
      label: "missing agents.yaml",
      expected: /agents\.yaml not found/,
      setup: async (workspace) => {
        await writeLocalSettings(workspace, "models.yaml", validModelsYaml());
      },
      dependencies: { commandExists: async () => true },
    },
    {
      label: "missing models.yaml",
      expected: /models\.yaml not found/,
      setup: async (workspace) => {
        await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
      },
      dependencies: { commandExists: async () => true },
    },
    {
      label: "cross-ref undefined route key",
      expected: /agents\.yaml agent producer references undefined route key in models\.yaml: missing-route/,
      setup: async (workspace) => {
        await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
          producer: {
            model: "missing-route",
            output: { schemaRef: "regentara://schemas/producer-output" },
            prompt: { ref: "regentara://prompts/producer" },
          },
        }));
        await writeLocalSettings(workspace, "models.yaml", validModelsYaml());
      },
      dependencies: { commandExists: async () => true },
    },
    {
      label: "missing provider CLI",
      expected: /required provider CLI unavailable/,
      setup: async (workspace) => {
        await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
        await writeLocalSettings(workspace, "models.yaml", validModelsYaml());
      },
      dependencies: { commandExists: async () => false },
    },
  ];

  for (const scenario of scenarios) {
    const workspace = await makeSettingsWorkspace();
    await scenario.setup(workspace);

    const result = await runWorkflow({
      homeDirectory: workspace.homeDirectory,
      reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
      workingDirectory: workspace.workingDirectory,
    }, scenario.dependencies);

    assert.equal(result.status, "failed", scenario.label);
    assert.match(result.failureReason ?? "", scenario.expected, scenario.label);
  }
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
