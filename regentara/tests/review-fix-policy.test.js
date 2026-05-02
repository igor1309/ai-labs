import assert from "node:assert/strict";
import test from "node:test";

import { runWorkflow } from "../src/orchestrator.js";
import {
  makeSettingsWorkspace,
  validAgentsYaml,
  validModelsYaml,
  writeLocalSettings,
} from "./helpers/settings.js";

test("runWorkflow should fail before starting a run when no ReviewFixPolicy is injected", async () => {
  const result = await runWorkflow();

  assert.deepEqual(
    { failureReason: result.failureReason, status: result.status },
    { failureReason: "ReviewFixPolicy is required", status: "failed" },
  );
});

test("runWorkflow should call ReviewFixPolicy decide exactly once after each completed review", async () => {
  const policyInputs = [];

  await runWorkflowWithPolicy({
    decide: async (input) => {
      policyInputs.push(input);
      return { decision: "complete-ok" };
    },
  });

  assert.equal(policyInputs.length, 1);
});

test("runWorkflow should succeed when the policy returns complete ok", async () => {
  const result = await runWorkflowWithPolicy({
    decide: async () => ({ decision: "complete-ok" }),
  });

  assert.equal(result.status, "succeeded");
});

test("runWorkflow should fail without calling Remediator when the policy returns complete fail", async () => {
  const agentInputs = [];
  const result = await runWorkflowWithPolicy({
    decide: async () => ({ decision: "complete-fail" }),
  }, agentInputs);

  assert.deepEqual(
    { agentKinds: agentInputs.map(classifyCall), status: result.status },
    { agentKinds: ["producer", "reviewer"], status: "failed" },
  );
});

test("runWorkflow should call Remediator and continue with the remediated task when the policy returns remediate", async () => {
  const agentInputs = [];
  const result = await runWorkflowWithPolicy({
    decisions: [
      { decision: "remediate" },
      { decision: "complete-ok" },
    ],
  }, agentInputs);

  assert.deepEqual(
    { agentKinds: agentInputs.map(classifyCall), status: result.status },
    { agentKinds: ["producer", "reviewer", "remediator", "producer", "reviewer"], status: "succeeded" },
  );
});

test("runWorkflow should forward returned policy session unchanged into the next decision", async () => {
  const sessions = [];
  const session = { opaque: true };

  await runWorkflowWithPolicy({
    decide: async (input) => {
      sessions.push(input.session);
      return sessions.length === 1
        ? { decision: "remediate", session }
        : { decision: "complete-ok" };
    },
  });

  assert.deepEqual(sessions, [undefined, session]);
});

test("runWorkflow should not branch on verdict severity without consulting ReviewFixPolicy", async () => {
  const policyInputs = [];
  const result = await runWorkflowWithPolicy({
    decide: async (input) => {
      policyInputs.push(input);
      return { decision: "complete-ok" };
    },
    reviewerOutput: {
      findingCategory: "critical",
      severity: "blocker",
      verdict: "needs-fix",
    },
  });

  assert.deepEqual(
    { policyCalls: policyInputs.length, status: result.status },
    { policyCalls: 1, status: "succeeded" },
  );
});

async function runWorkflowWithPolicy(policy, agentInputs = []) {
  const workspace = await makeSettingsWorkspace();
  const decisions = [...(policy.decisions ?? [])];
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    remediator: {
      model: "high",
      output: {
        schema: {
          required: ["task"],
          type: "object",
        },
      },
      prompt: { ref: "regentara://prompts/remediator" },
      provider: "anthropic",
    },
  }));
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());

  return runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: {
      decide: policy.decide ?? (async () => decisions.shift()),
    },
    task: "initial task",
    taskFile: "tasks/initial.md",
    workingDirectory: workspace.workingDirectory,
  }, {
    artifactExists: async () => true,
    commandExists: async () => true,
    executeProviderCli: async (input) => {
      agentInputs.push(input.executionInput);
      if (input.executionInput.verdict) {
        return { exitStatus: 0, semanticResult: { task: "remediated task" } };
      }
      if (input.executionInput.producer) {
        const reviewerOutput = policy.reviewerOutput ?? { verdict: "needs-fix" };
        return {
          exitStatus: 0,
          semanticResult: {
            summary: "default reviewer summary",
            verification: { ran: true },
            ...reviewerOutput,
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
