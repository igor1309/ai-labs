import assert from "node:assert/strict";
import test from "node:test";

import { runWorkflow } from "../src/orchestrator.js";
import { readRunMetadata } from "../src/run-store.js";
import { progressEventSummary, readEvents } from "./helpers/events.js";
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

test("runWorkflow should append watched progress events for a successful run", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{ decision: "complete-ok" }],
  });

  const events = await readEvents(result.runDirectory);

  assert.deepEqual(events.map(progressEventSummary), [
    { agentId: "producer", currentAgent: "producer", runId: result.runId, type: "agent-start" },
    { agentId: "producer", currentAgent: "producer", runId: result.runId, type: "agent-end" },
    { agentId: "reviewer", currentAgent: "reviewer", runId: result.runId, type: "agent-start" },
    { agentId: "reviewer", currentAgent: "reviewer", runId: result.runId, type: "agent-end" },
    { currentDecision: "complete-ok", runId: result.runId, type: "policy-decision" },
    { finalStatus: "succeeded", runId: result.runId, type: "completion" },
  ]);
});

test("runWorkflow should include the task file on producer start events", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{ decision: "complete-ok" }],
  });

  const producerStart = (await readEvents(result.runDirectory))
    .find((event) => event.type === "agent-start" && event.agentId === "producer");

  assert.equal(producerStart.taskFile, "tasks/initial.md");
});

test("runWorkflow should include provider run references on agent end events", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{ decision: "complete-ok" }],
    providerReferences: {
      runnerReference: "pid:123",
      sessionReference: "claude-session-123",
      stderrReference: "stderr-summary",
      stdoutReference: "stdout-summary",
    },
  });

  const producerEnd = (await readEvents(result.runDirectory))
    .find((event) => event.type === "agent-end" && event.agentId === "producer");

  assert.deepEqual(
    {
      model: producerEnd.model,
      provider: producerEnd.provider,
      runner: producerEnd.runner,
      runnerReference: producerEnd.runnerReference,
      sessionReference: producerEnd.sessionReference,
      stderrReference: producerEnd.stderrReference,
      stdoutReference: producerEnd.stdoutReference,
    },
    {
      model: "claude-sonnet-4-5",
      provider: "anthropic",
      runner: "claude-code",
      runnerReference: "pid:123",
      sessionReference: "claude-session-123",
      stderrReference: "stderr-summary",
      stdoutReference: "stdout-summary",
    },
  );
});

test("runWorkflow should mark metadata succeeded when the review policy completes successfully", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{ decision: "complete-ok" }],
  });

  const metadata = await readRunMetadata(result.runDirectory);

  assert.deepEqual(
    {
      exitCode: metadata.exitCode,
      hasEndTime: typeof metadata.endTime === "string",
      status: metadata.status,
    },
    {
      exitCode: 0,
      hasEndTime: true,
      status: "succeeded",
    },
  );
});

test("runWorkflow should record the task file in run metadata", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{ decision: "complete-ok" }],
  });

  const metadata = await readRunMetadata(result.runDirectory);

  assert.equal(metadata.taskFile, "tasks/initial.md");
});

test("runWorkflow should append failed completion progress event when policy completes with failure", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{ decision: "complete-fail" }],
  });

  const events = await readEvents(result.runDirectory);

  assert.deepEqual(events.map(progressEventSummary).at(-1), {
    finalStatus: "failed",
    runId: result.runId,
    type: "completion",
  });
});

test("runWorkflow should mark metadata failed when the review policy completes with failure", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{ decision: "complete-fail" }],
  });

  const metadata = await readRunMetadata(result.runDirectory);

  assert.deepEqual(
    {
      exitCode: metadata.exitCode,
      hasEndTime: typeof metadata.endTime === "string",
      status: metadata.status,
    },
    {
      exitCode: 1,
      hasEndTime: true,
      status: "failed",
    },
  );
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
    taskFile: "tasks/initial.md",
    workingDirectory: workspace.workingDirectory,
  }, {
    artifactExists: async () => true,
    commandExists: async () => true,
    executeProviderCli: async (input) => {
      calls.push(options.captureFullInput ? input : input.executionInput);
      if (input.executionInput.verdict) {
        return { exitStatus: 0, semanticResult: { task: "remediated task" }, ...options.providerReferences };
      }
      if (input.executionInput.producer) {
        return { exitStatus: 0, semanticResult: { verdict: "needs-fix" }, ...options.providerReferences };
      }
      return { exitStatus: 0, semanticResult: { artifact: "producer/result.json" }, ...options.providerReferences };
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
