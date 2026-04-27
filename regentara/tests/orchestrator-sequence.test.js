import assert from "node:assert/strict";
import test from "node:test";

import { runWorkflow } from "../src/orchestrator.js";
import {
  makeSettingsWorkspace,
  validAgentsYaml,
  validModelsYaml,
  writeLocalSettings,
} from "./helpers/settings.js";

test("runWorkflow should call producer first with the input valid task", async () => {
  const calls = [];

  await runWorkflowWithCalls(calls, {
    policyDecisions: [{ decision: "complete-ok" }],
  });

  assert.deepEqual(calls[0], {
    task: "initial task",
  });
});

test("runWorkflow should call reviewer with current task and Producer work after producer succeeds", async () => {
  const calls = [];

  await runWorkflowWithCalls(calls, {
    policyDecisions: [{ decision: "complete-ok" }],
  });

  assert.deepEqual(calls[1], {
    producer: { artifact: "producer/result.json" },
    task: "initial task",
  });
});

test("runWorkflow should call no subsequent agent before the policy decision after a completed review", async () => {
  const calls = [];
  const policyCallCounts = [];

  await runWorkflowWithCalls(calls, {
    onPolicyDecision: () => {
      policyCallCounts.push(calls.length);
    },
    policyDecisions: [{ decision: "complete-ok" }],
  });

  assert.deepEqual(policyCallCounts, [2]);
});

test("runWorkflow should call remediator with task work and verdict when policy returns remediate", async () => {
  const calls = [];

  await runWorkflowWithCalls(calls, {
    policyDecisions: [
      { decision: "remediate" },
      { decision: "complete-ok" },
    ],
  });

  assert.deepEqual(calls[2], {
    producer: { artifact: "producer/result.json" },
    task: "initial task",
    verdict: { verdict: "needs-fix" },
  });
});

test("runWorkflow should call producer with the remediated valid task after remediator succeeds", async () => {
  const calls = [];

  await runWorkflowWithCalls(calls, {
    policyDecisions: [
      { decision: "remediate" },
      { decision: "complete-ok" },
    ],
  });

  assert.deepEqual(calls[3], {
    task: "remediated task",
  });
});

test("runWorkflow should keep producer reviewer and remediator as peer calls", async () => {
  const calls = [];

  await runWorkflowWithCalls(calls, {
    policyDecisions: [
      { decision: "remediate" },
      { decision: "complete-ok" },
    ],
  });

  assert.deepEqual(calls.map(classifyCall), ["producer", "reviewer", "remediator", "producer", "reviewer"]);
});

async function runWorkflowWithCalls(calls, options = {}) {
  const workspace = await makeSettingsWorkspace();
  const policyDecisions = [...options.policyDecisions];
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    remediator: {
      model: "gpt",
      output: {
        schema: {
          required: ["task"],
          type: "object",
        },
      },
      prompt: { ref: "regentara://prompts/remediator" },
    },
  }));
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());

  return runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: {
      decide: async (input) => {
        options.onPolicyDecision?.(input);
        return policyDecisions.shift();
      },
    },
    task: "initial task",
    workingDirectory: workspace.workingDirectory,
  }, {
    artifactExists: async () => true,
    commandExists: async () => true,
    executeProviderCli: async (input) => {
      calls.push(input.executionInput);
      if (input.executionInput.verdict) {
        return { exitStatus: 0, jsonOutput: { task: "remediated task" } };
      }
      if (input.executionInput.producer) {
        return { exitStatus: 0, jsonOutput: { verdict: "needs-fix" } };
      }
      return { exitStatus: 0, jsonOutput: { artifact: "producer/result.json" } };
    },
    runStoreOptions: {
      homeDirectory: workspace.homeDirectory,
      randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
    },
  });
}

function classifyCall(call) {
  if (call.verdict) {
    return "remediator";
  }

  if (call.producer) {
    return "reviewer";
  }

  return "producer";
}
