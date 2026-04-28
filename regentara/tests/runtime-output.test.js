import assert from "node:assert/strict";
import test from "node:test";

import { RuntimeFailure } from "../src/errors.js";
import { runWorkflow } from "../src/orchestrator.js";
import { validateRuntimeOutput } from "../src/runtime-output.js";
import {
  makeSettingsWorkspace,
  validAgentsYaml,
  validModelsYaml,
  writeLocalSettings,
} from "./helpers/settings.js";

test("validateRuntimeOutput should fail immediately when agent runtime output is not valid JSON", () => {
  assert.throws(
    () => validateRuntimeOutput("producer", "{", { type: "object" }),
    RuntimeFailure,
  );
});

test("validateRuntimeOutput should fail immediately when agent runtime JSON does not satisfy the configured output schema", () => {
  assert.throws(
    () => validateRuntimeOutput("producer", "{}", {
      required: ["artifact"],
      type: "object",
    }),
    /schema validation: producer/,
  );
});

test("runWorkflow should not call the next workflow step after invalid agent output", async () => {
  const workspace = await makeSettingsWorkspace();
  const executedAgents = [];
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    producer: {
      model: "gpt",
      output: {
        schema: {
          required: ["artifact"],
          type: "object",
        },
      },
      prompt: { ref: "regentara://prompts/producer" },
    },
    reviewer: {
      model: "gpt",
      output: { schema: { type: "object" } },
      prompt: { ref: "regentara://prompts/reviewer" },
    },
  }));
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());

  await runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    task: "implement",
    taskFile: "tasks/implement.md",
    workingDirectory: workspace.workingDirectory,
  }, {
    commandExists: async () => true,
    executeProviderCli: async (input) => {
      executedAgents.push(input.executionInput);
      return { exitStatus: 0, semanticResult: {} };
    },
    runStoreOptions: {
      homeDirectory: workspace.homeDirectory,
      randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
    },
  });

  assert.deepEqual(executedAgents, [{ task: "implement" }]);
});
