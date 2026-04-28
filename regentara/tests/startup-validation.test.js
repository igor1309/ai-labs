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

test("runWorkflow should fail before creating a run when provider execution has no task file", async () => {
  const workspace = await makeSettingsWorkspace();
  let createRunCalled = false;
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());

  const result = await runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    task: "initial task",
    workingDirectory: workspace.workingDirectory,
  }, {
    commandExists: async () => true,
    createRun: async () => {
      createRunCalled = true;
    },
    executeProviderCli: async () => ({ exitStatus: 0, semanticResult: { artifact: "" } }),
  });

  assert.deepEqual(
    { createRunCalled, failureReason: result.failureReason, status: result.status },
    { createRunCalled: false, failureReason: "task file is required for provider execution", status: "failed" },
  );
});

test("runWorkflow should report selected agent and model settings before run creation", async () => {
  const workspace = await makeSettingsWorkspace();
  const rememberedSettings = [];
  let reportSettingsCalled = false;
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());

  await runWorkflow({
    debugReporter: {
      rememberSettings: (fields) => { rememberedSettings.push(fields); },
      report: () => {},
      reportSettings: () => { reportSettingsCalled = true; },
    },
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

  assert.deepEqual(
    {
      rememberedSettings,
      reportSettingsCalled,
    },
    {
      rememberedSettings: [{
        agents: join(workspace.workingDirectory, ".regentara", "agents.yaml"),
      }, {
        models: join(workspace.workingDirectory, ".regentara", "models.yaml"),
      }],
      reportSettingsCalled: true,
    },
  );
});

test("runWorkflow should report known agent settings when model settings resolution fails", async () => {
  const workspace = await makeSettingsWorkspace();
  const rememberedSettings = {};
  const settingsReports = [];
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());

  await runWorkflow({
    debugReporter: {
      rememberSettings: (fields) => {
        Object.assign(rememberedSettings, fields);
      },
      report: () => {},
      reportSettings: () => {
        settingsReports.push({ ...rememberedSettings });
      },
    },
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    workingDirectory: workspace.workingDirectory,
  }, {
    commandExists: async () => true,
  });

  assert.deepEqual(settingsReports, [{
    agents: join(workspace.workingDirectory, ".regentara", "agents.yaml"),
  }]);
});

test("runWorkflow should report startup failure without run context when validation fails before run creation", async () => {
  const workspace = await makeSettingsWorkspace();
  const debugEvents = [];
  let createRunCalled = false;
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());

  await runWorkflow({
    debugReporter: {
      rememberSettings: () => {},
      report: (event, fields) => {
        debugEvents.push({ event, fields });
      },
      reportSettings: () => {},
    },
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    task: "initial task",
    workingDirectory: workspace.workingDirectory,
  }, {
    commandExists: async () => true,
    createRun: async () => {
      createRunCalled = true;
    },
    executeProviderCli: async () => ({ exitStatus: 0, semanticResult: { artifact: "" } }),
  });

  assert.deepEqual(
    {
      createRunCalled,
      debugEvents,
    },
    {
      createRunCalled: false,
      debugEvents: [{
        event: "failure",
        fields: { reason: "task file is required for provider execution" },
      }],
    },
  );
});

test("runWorkflow should fail before creating a run when provider execution has a blank task file", async () => {
  const workspace = await makeSettingsWorkspace();
  let createRunCalled = false;
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());

  const result = await runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    task: "initial task",
    taskFile: " ",
    workingDirectory: workspace.workingDirectory,
  }, {
    commandExists: async () => true,
    createRun: async () => {
      createRunCalled = true;
    },
    executeProviderCli: async () => ({ exitStatus: 0, semanticResult: { artifact: "" } }),
  });

  assert.deepEqual(
    { createRunCalled, failureReason: result.failureReason, status: result.status },
    { createRunCalled: false, failureReason: "task file is required for provider execution", status: "failed" },
  );
});

test("runWorkflow should fail before creating a run when agents.yaml references a model tier not defined in models.yaml", async () => {
  const workspace = await makeSettingsWorkspace();
  let createRunCalled = false;
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    producer: {
      model: "missing-tier",
      output: { schemaRef: "regentara://schemas/producer-output" },
      prompt: { ref: "regentara://prompts/producer" },
      provider: "anthropic",
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
    {
      createRunCalled,
      failureReason: result.failureReason,
      status: result.status,
    },
    {
      createRunCalled: false,
      failureReason: "agents.yaml agent producer references undefined provider/model in models.yaml: anthropic/missing-tier",
      status: "failed",
    },
  );
});

test("runWorkflow should fail before creating a run when agents.yaml references a provider not defined in models.yaml", async () => {
  const workspace = await makeSettingsWorkspace();
  let createRunCalled = false;
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    producer: {
      model: "medium",
      output: { schemaRef: "regentara://schemas/producer-output" },
      prompt: { ref: "regentara://prompts/producer" },
      provider: "missing-provider",
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
    {
      createRunCalled,
      failureReason: result.failureReason,
      status: result.status,
    },
    {
      createRunCalled: false,
      failureReason: "agents.yaml agent producer references undefined provider/model in models.yaml: missing-provider/medium",
      status: "failed",
    },
  );
});

test("runWorkflow should fail before creating a run when agents.yaml references a missing provider model tier", async () => {
  const workspace = await makeSettingsWorkspace();
  let createRunCalled = false;
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    reviewer: {
      model: "critical",
      output: { schemaRef: "regentara://schemas/reviewer-output" },
      prompt: { ref: "regentara://prompts/reviewer" },
      provider: "openai",
    },
  }));
  await writeLocalSettings(workspace, "models.yaml", `
providers:
  anthropic:
    runner: claude-code
    models:
      medium:
        model: claude-sonnet-4-5
  openai:
    runner: codex
    models:
      high:
        model: gpt-5.5
`);

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
    {
      createRunCalled,
      failureReason: result.failureReason,
      status: result.status,
    },
    {
      createRunCalled: false,
      failureReason: "agents.yaml agent reviewer references undefined provider/model in models.yaml: openai/critical",
      status: "failed",
    },
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
      label: "cross-ref undefined provider",
      expected: /agents\.yaml agent producer references undefined provider\/model in models\.yaml: missing-provider\/medium/,
      setup: async (workspace) => {
        await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
          producer: {
            model: "medium",
            output: { schemaRef: "regentara://schemas/producer-output" },
            prompt: { ref: "regentara://prompts/producer" },
            provider: "missing-provider",
          },
        }));
        await writeLocalSettings(workspace, "models.yaml", validModelsYaml());
      },
      dependencies: { commandExists: async () => true },
    },
    {
      label: "cross-ref undefined provider model tier",
      expected: /agents\.yaml agent producer references undefined provider\/model in models\.yaml: anthropic\/missing-tier/,
      setup: async (workspace) => {
        await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
          producer: {
            model: "missing-tier",
            output: { schemaRef: "regentara://schemas/producer-output" },
            prompt: { ref: "regentara://prompts/producer" },
            provider: "anthropic",
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

test("runWorkflow should not validate CLI availability for unused providers", async () => {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    unused: {
      models: {
        medium: {
          model: "x",
        },
      },
      runner: "missing-runner",
    },
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
    unused: {
      models: {
        medium: {
          model: "x",
        },
      },
      runner: "missing-runner",
    },
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
      provider: "experimental",
    },
  }));
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml({
    experimental: {
      models: {
        custom: {
          model: "x",
        },
      },
      runner: "custom-runner",
    },
  }));

  const result = await runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    task: "initial task",
    taskFile: "tasks/initial.md",
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
