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

test("runWorkflow should pass runner adapter input without a workspace field", async () => {
  const calls = [];

  await runWorkflowWithCalls(calls, {
    captureFullInput: true,
    policyDecisions: [{ decision: "complete-ok" }],
  });

  assert.deepEqual(
    {
      agentId: calls[0].agentId,
      executionInput: calls[0].executionInput,
      hasWorkingDirectory: Object.prototype.hasOwnProperty.call(calls[0], "workingDirectory"),
      model: calls[0].model,
      outputSchema: calls[0].outputSchema,
      provider: calls[0].provider,
      runner: calls[0].runner,
    },
    {
      agentId: "producer",
      executionInput: { task: "initial task" },
      hasWorkingDirectory: false,
      model: "claude-sonnet-4-5",
      outputSchema: {
        required: ["artifact"],
        type: "object",
      },
      provider: "anthropic",
      runner: "claude-code",
    },
  );
});

test("runWorkflow should build a role prompt with task context and output schema", async () => {
  const calls = [];

  await runWorkflowWithCalls(calls, {
    captureFullInput: true,
    policyDecisions: [{ decision: "complete-ok" }],
  });

  assert.equal(
    calls[0].prompt.includes("\"task\": \"initial task\"")
      && calls[0].prompt.includes("\"required\": [")
      && calls[0].prompt.includes("producer"),
    true,
  );
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
      calls.push(options.captureFullInput ? input : input.executionInput);
      if (input.executionInput.verdict) {
        return { exitStatus: 0, semanticResult: { task: "remediated task" } };
      }
      if (input.executionInput.producer) {
        return { exitStatus: 0, semanticResult: { verdict: "needs-fix" } };
      }
      return { exitStatus: 0, semanticResult: { artifact: "producer/result.json" } };
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
