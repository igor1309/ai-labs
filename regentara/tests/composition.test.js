import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { createRegentaraComposition } from "../src/composition.js";
import {
  makeSettingsWorkspace,
  validAgentsYaml,
  validModelsYaml,
  writeLocalSettings,
} from "./helpers/settings.js";

test("createRegentaraComposition should use config-based policy settings when no ReviewFixPolicy is injected", async () => {
  const workspace = await makeSettingsWorkspace();
  const agentInputs = [];
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());
  await writeLocalSettings(workspace, "policy.yaml", "reviewPolicy:\n  maxRemediationAttempts: 1\n");
  const composition = createRegentaraComposition({
    artifactExists: async () => true,
    commandExists: async () => true,
    executeProviderCli: async (input) => {
      agentInputs.push(input.executionInput);
      if (input.executionInput.verdict) {
        return { exitStatus: 0, semanticResult: { task: "remediated task" } };
      }
      if (input.executionInput.producer) {
        const verdict = input.executionInput.task === "remediated task"
          ? "accepted"
          : "rejected";
        return {
          exitStatus: 0,
          semanticResult: {
            summary: "composition reviewer summary",
            verdict,
            verification: { ran: true },
          },
        };
      }
      return { exitStatus: 0, semanticResult: { artifact: "producer/result.json", verification: { ran: true } } };
    },
    runStoreOptions: {
      homeDirectory: workspace.homeDirectory,
      randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
    },
  });

  const result = await composition.runWorkflow({
    homeDirectory: workspace.homeDirectory,
    task: "initial task",
    taskFile: "tasks/initial.md",
    workingDirectory: workspace.workingDirectory,
  });

  assert.deepEqual(
    { agentKinds: agentInputs.map(classifyCall), status: result.status },
    { agentKinds: ["producer", "reviewer", "remediator", "producer", "reviewer"], status: "succeeded" },
  );
});

test("createRegentaraComposition should report selected policy settings path when debug is enabled", async () => {
  const workspace = await makeSettingsWorkspace();
  const rememberedSettings = [];
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());
  await writeLocalSettings(workspace, "policy.yaml", "reviewPolicy:\n  maxRemediationAttempts: 0\n");
  const policyPath = join(workspace.workingDirectory, ".regentara", "policy.yaml");
  const composition = createRegentaraComposition({
    artifactExists: async () => true,
    commandExists: async () => true,
    executeProviderCli: async (input) => {
      if (input.executionInput.producer) {
        return {
          exitStatus: 0,
          semanticResult: {
            summary: "composition reviewer summary",
            verdict: "accepted",
            verification: { ran: true },
          },
        };
      }

      return { exitStatus: 0, semanticResult: { artifact: "producer/result.json", verification: { ran: true } } };
    },
    runStoreOptions: {
      homeDirectory: workspace.homeDirectory,
      randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
    },
  });

  await composition.runWorkflow({
    debugReporter: {
      rememberSettings: (fields) => { rememberedSettings.push(fields); },
      report: () => {},
      reportSettings: () => {},
    },
    homeDirectory: workspace.homeDirectory,
    task: "initial task",
    taskFile: "tasks/initial.md",
    workingDirectory: workspace.workingDirectory,
  });

  assert.equal(rememberedSettings.some((fields) => fields.policy === policyPath), true);
});

test("createRegentaraComposition should return failed result when config-based policy settings are missing", async () => {
  const workspace = await makeSettingsWorkspace();
  const agentsExamplePath = join(workspace.homeDirectory, ".regentara", "agents.yaml.example");
  const modelsExamplePath = join(workspace.homeDirectory, ".regentara", "models.yaml.example");
  const examplePath = join(workspace.homeDirectory, ".regentara", "policy.yaml.example");
  const composition = createRegentaraComposition({
    commandExists: async () => true,
    runStoreOptions: {
      homeDirectory: workspace.homeDirectory,
    },
  });

  const result = await composition.runWorkflow({
    homeDirectory: workspace.homeDirectory,
    workingDirectory: workspace.workingDirectory,
  });

  assert.deepEqual(
    {
      agentsExampleWritten: await pathExists(agentsExamplePath),
      exampleWritten: await pathExists(examplePath),
      failureMentionsPolicy: result.failureReason?.includes("policy.yaml not found"),
      modelsExampleWritten: await pathExists(modelsExamplePath),
      status: result.status,
    },
    {
      agentsExampleWritten: true,
      exampleWritten: true,
      failureMentionsPolicy: true,
      modelsExampleWritten: true,
      status: "failed",
    },
  );
});

function classifyCall(call) {
  if (call.verdict) {
    return "remediator";
  }

  if (call.producer) {
    return "reviewer";
  }

  return "producer";
}

async function pathExists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}
