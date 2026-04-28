import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { runWorkflow } from "../src/orchestrator.js";
import { executeProviderCli } from "../src/provider-cli-executor.js";
import { progressEventSummary, readEvents } from "./helpers/events.js";
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

test("runWorkflow should write both example files when neither settings file exists", async () => {
  const workspace = await makeSettingsWorkspace();
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
    { agentsExampleWritten: true, modelsExampleWritten: true },
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

test("runWorkflow should not validate CLI availability for unused routes", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    unused: { provider: "experimental", runner: "missing-runner", model: "x" },
  }));
  const checkedCommands = [];

  const result = await runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    workingDirectory: workspace.workingDirectory,
  }, {
    commandExists: async (command) => {
      checkedCommands.push(command);
      return command !== "missing-runner";
    },
    runStoreOptions: {
      homeDirectory: workspace.homeDirectory,
      randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
    },
  });

  assert.deepEqual(
    { status: result.status, missingRunnerChecked: checkedCommands.includes("missing-runner") },
    { status: "succeeded", missingRunnerChecked: false },
  );
});

test("runWorkflow should append completion progress event when validation-only execution succeeds", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    unused: { provider: "experimental", runner: "missing-runner", model: "x" },
  }));

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

  const events = await readEvents(result.runDirectory);

  assert.deepEqual(events.map(progressEventSummary), [
    { finalStatus: "succeeded", runId: result.runId, type: "completion" },
  ]);
});

test("runWorkflow should accept arbitrary runner settings and fail clearly when execution has no adapter", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    producer: {
      model: "custom",
      output: {
        schemaRef: "regentara://schemas/producer-output",
      },
      prompt: { ref: "regentara://prompts/producer" },
    },
  }));
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    custom: { provider: "experimental", runner: "custom-runner", model: "x" },
  }));

  const result = await runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    task: "initial task",
    workingDirectory: workspace.workingDirectory,
  }, {
    commandExists: async () => true,
    executeProviderCli,
    runStoreOptions: {
      homeDirectory: workspace.homeDirectory,
      randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
    },
  });

  assert.deepEqual(
    { failureReason: result.failureReason, status: result.status },
    { failureReason: "no provider structured result adapter for runner: custom-runner", status: "failed" },
  );
});

test("runWorkflow should not bootstrap example files when settings resolvers are injected", async () => {
  const workspace = await makeSettingsWorkspace();
  const agentsExample = join(workspace.homeDirectory, ".regentara", "agents.yaml.example");
  const modelsExample = join(workspace.homeDirectory, ".regentara", "models.yaml.example");

  await runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    workingDirectory: workspace.workingDirectory,
  }, {
    commandExists: async () => true,
    resolveAgentSettings: async () => { throw new Error("stub agents"); },
    resolveModelRouting: async () => { throw new Error("stub models"); },
  });

  assert.deepEqual(
    { agentsWritten: await pathExists(agentsExample), modelsWritten: await pathExists(modelsExample) },
    { agentsWritten: false, modelsWritten: false },
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
