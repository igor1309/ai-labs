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
        return { exitStatus: 0, semanticResult: { verdict } };
      }
      return { exitStatus: 0, semanticResult: { artifact: "producer/result.json" } };
    },
    runStoreOptions: {
      homeDirectory: workspace.homeDirectory,
      randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
    },
  });

  const result = await composition.runWorkflow({
    homeDirectory: workspace.homeDirectory,
    task: "initial task",
    workingDirectory: workspace.workingDirectory,
  });

  assert.deepEqual(
    { agentKinds: agentInputs.map(classifyCall), status: result.status },
    { agentKinds: ["producer", "reviewer", "remediator", "producer", "reviewer"], status: "succeeded" },
  );
});

test("createRegentaraComposition should return failed result when config-based policy settings are missing", async () => {
  const workspace = await makeSettingsWorkspace();
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
      exampleWritten: await pathExists(examplePath),
      failureMentionsPolicy: result.failureReason?.includes("policy.yaml not found"),
      status: result.status,
    },
    {
      exampleWritten: true,
      failureMentionsPolicy: true,
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
