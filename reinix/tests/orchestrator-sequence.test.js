import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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
        required: ["artifact", "verification"],
        type: "object",
        properties: {
          verification: {
            type: "object",
            required: ["ran"],
            properties: {
              ran: { type: "boolean" },
              command: { type: "string" },
              exitCode: { type: "integer" },
            },
          },
        },
      },
      provider: "anthropic",
      runner: "claude-code",
    },
  );
});

test("runWorkflow should pass provider model tier routing to the runner adapter", async () => {
  const calls = [];

  await runWorkflowWithCalls(calls, {
    captureFullInput: true,
    policyDecisions: [{ decision: "complete-ok" }],
  });

  assert.deepEqual(
    {
      model: calls[1].model,
      provider: calls[1].provider,
      reasoningEffort: calls[1].reasoningEffort,
      runner: calls[1].runner,
    },
    {
      model: "gpt-5.5",
      provider: "openai",
      reasoningEffort: "high",
      runner: "codex",
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
    producer: { artifact: "producer/result.json", verification: { ran: true } },
    task: "initial task",
  });
});

test("runWorkflow should build a reviewer prompt containing the task and producer context", async () => {
  const calls = [];

  await runWorkflowWithCalls(calls, {
    captureFullInput: true,
    policyDecisions: [{ decision: "complete-ok" }],
  });

  assert.equal(
    calls[1].agentId === "reviewer"
      && calls[1].prompt.includes("\"task\": \"initial task\"")
      && calls[1].prompt.includes("\"producer\""),
    true,
  );
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
    producer: { artifact: "producer/result.json", verification: { ran: true } },
    reviews: [{ verdict: "needs-fix", verification: { ran: true } }],
    task: "initial task",
    verdict: { verdict: "needs-fix", verification: { ran: true } },
  });
});

test("runWorkflow should fail when policy returns terminal artifact with remediate", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{
      decision: "remediate",
      terminalArtifact: { content: "# Terminal Decision\n" },
    }],
  });

  assert.deepEqual(
    {
      callRoles: calls.map(classifyCall),
      failureReason: result.failureReason,
      status: result.status,
    },
    {
      callRoles: ["producer", "reviewer"],
      failureReason: "terminalArtifact is only valid with terminal policy decisions",
      status: "failed",
    },
  );
});

test("runWorkflow should fail when terminal artifact content is invalid", async () => {
  const results = await Promise.all([
    runWorkflowWithCalls([], {
      policyDecisions: [{ decision: "complete-ok", terminalArtifact: {} }],
    }),
    runWorkflowWithCalls([], {
      policyDecisions: [{ decision: "complete-ok", terminalArtifact: { content: "" } }],
    }),
    runWorkflowWithCalls([], {
      policyDecisions: [{ decision: "complete-ok", terminalArtifact: { content: 42 } }],
    }),
  ]);

  assert.deepEqual(
    results.map((result) => ({
      failureReason: result.failureReason,
      status: result.status,
    })),
    [
      {
        failureReason: "terminalArtifact.content must be a non-empty string",
        status: "failed",
      },
      {
        failureReason: "terminalArtifact.content must be a non-empty string",
        status: "failed",
      },
      {
        failureReason: "terminalArtifact.content must be a non-empty string",
        status: "failed",
      },
    ],
  );
});

test("runWorkflow should pass all completed reviews to each remediator call", async () => {
  const calls = [];

  await runWorkflowWithCalls(calls, {
    policyDecisions: [
      { decision: "remediate" },
      { decision: "remediate" },
      { decision: "complete-ok" },
    ],
    reviewerOutputs: [
      { verdict: "first failure" },
      { verdict: "second failure" },
      { verdict: "accepted" },
    ],
  });

  assert.deepEqual(
    {
      firstRemediation: calls[2],
      secondRemediation: calls[5],
    },
    {
      firstRemediation: {
        producer: { artifact: "producer/result.json", verification: { ran: true } },
        reviews: [{ verdict: "first failure", verification: { ran: true } }],
        task: "initial task",
        verdict: { verdict: "first failure", verification: { ran: true } },
      },
      secondRemediation: {
        producer: { artifact: "producer/result.json", verification: { ran: true } },
        reviews: [
          { verdict: "first failure", verification: { ran: true } },
          { verdict: "second failure", verification: { ran: true } },
        ],
        task: "remediated task",
        verdict: { verdict: "second failure", verification: { ran: true } },
      },
    },
  );
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

test("runWorkflow should persist terminal artifact references on complete-ok", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{
      decision: "complete-ok",
      terminalArtifact: { content: "# Terminal Decision\n\nAccepted by policy.\n" },
    }],
  });

  const events = await readEvents(result.runDirectory);

  assert.deepEqual(
    {
      completionArtifact: events.at(-1).terminalArtifact,
      persistedContent: await readFileIfExists(join(result.runDirectory, "terminal-decision.md")),
      resultArtifact: result.terminalArtifact,
    },
    {
      completionArtifact: "terminal-decision.md",
      persistedContent: "# Terminal Decision\n\nAccepted by policy.\n",
      resultArtifact: "terminal-decision.md",
    },
  );
});

test("runWorkflow should persist a one-round evidence index on complete-ok", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [
      {
        decision: "complete-ok",
        terminalArtifact: { content: "# Terminal Decision\n" },
      },
    ],
    reviewerOutputs: [{ verdict: "accepted", summary: "round one summary" }],
  });

  const content = await readFileIfExists(join(result.runDirectory, "evidence-index.json"));
  const evidenceIndex = content ? JSON.parse(content) : undefined;

  assert.deepEqual(evidenceIndex, {
    rounds: [
      {
        policyDecision: "complete-ok",
        policyDecisionReference: "policy-decision-01",
        producerArtifact: "producer/result.json",
        reviewNoteReference: "review-01.md",
        reviewRoundIndex: 1,
      },
    ],
    runId: result.runId,
    taskFile: "tasks/initial.md",
    terminal: {
      policyDecisionReference: "policy-decision-01",
      status: "succeeded",
      terminalArtifact: "terminal-decision.md",
    },
  });
});

test("runWorkflow should persist a multi-round evidence index on remediated complete-ok", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [
      { decision: "remediate" },
      {
        decision: "complete-ok",
        terminalArtifact: { content: "# Terminal Decision\n" },
      },
    ],
    reviewerOutputs: [
      { verdict: "needs-fix", summary: "round one summary" },
      { verdict: "accepted", summary: "round two summary" },
    ],
  });

  const content = await readFile(join(result.runDirectory, "evidence-index.json"), "utf8");
  const evidenceIndex = JSON.parse(content);

  assert.deepEqual(evidenceIndex, {
    rounds: [
      {
        policyDecision: "remediate",
        policyDecisionReference: "policy-decision-01",
        producerArtifact: "producer/result.json",
        reviewNoteReference: "review-01.md",
        reviewRoundIndex: 1,
      },
      {
        policyDecision: "complete-ok",
        policyDecisionReference: "policy-decision-02",
        producerArtifact: "producer/result.json",
        reviewNoteReference: "review-02.md",
        reviewRoundIndex: 2,
      },
    ],
    runId: result.runId,
    taskFile: "tasks/initial.md",
    terminal: {
      policyDecisionReference: "policy-decision-02",
      status: "succeeded",
      terminalArtifact: "terminal-decision.md",
    },
  });
});

test("runWorkflow should not persist terminal artifact when policy omits it", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{ decision: "complete-ok" }],
  });

  assert.deepEqual(
    {
      persistedContent: await readFileIfExists(join(result.runDirectory, "terminal-decision.md")),
      resultArtifact: result.terminalArtifact,
    },
    {
      persistedContent: undefined,
      resultArtifact: undefined,
    },
  );
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

test("runWorkflow should report successful run lifecycle debug events", async () => {
  const calls = [];
  const debugEvents = [];

  const result = await runWorkflowWithCalls(calls, {
    debugEvents,
    policyDecisions: [{ decision: "complete-ok" }],
    providerReferences: {
      runnerReference: "pid:123",
      sessionReference: "claude-session-123",
      stderrReference: "stderr-summary",
      stdoutReference: "stdout-summary",
    },
  });

  assert.deepEqual(debugEvents, [
    {
      event: "settings",
      fields: {},
    },
    {
      event: "run-created",
      fields: {
        runDirectory: result.runDirectory,
        runId: result.runId,
      },
    },
    {
      event: "agent-start",
      fields: {
        agent: "producer",
        route: "claude-code/anthropic/claude-sonnet-4-5/medium",
        taskFile: "tasks/initial.md",
      },
    },
    {
      event: "agent-end",
      fields: {
        agent: "producer",
        route: "claude-code/anthropic/claude-sonnet-4-5/medium",
        runnerReference: "pid:123",
        sessionReference: "claude-session-123",
      },
    },
    {
      event: "agent-start",
      fields: {
        agent: "reviewer",
        route: "codex/openai/gpt-5.5/high",
      },
    },
    {
      event: "agent-end",
      fields: {
        agent: "reviewer",
        reviewNoteReference: "review-01.md",
        route: "codex/openai/gpt-5.5/high",
        runnerReference: "pid:123",
        sessionReference: "claude-session-123",
      },
    },
    {
      event: "policy-decision",
      fields: { decision: "complete-ok", remediationsUsed: 0 },
    },
    {
      event: "completion",
      fields: { duration: "00:00", status: "succeeded" },
    },
  ]);
});

test("runWorkflow should report evidence artifact references in debug events", async () => {
  const calls = [];
  const debugEvents = [];

  await runWorkflowWithCalls(calls, {
    debugEvents,
    policyDecisions: [
      {
        decision: "complete-ok",
        terminalArtifact: { content: "# Terminal Decision\n" },
      },
    ],
    reviewerOutputs: [{ verdict: "accepted", summary: "round one summary" }],
  });

  const reviewerEnd = debugEvents.find((event) =>
    event.event === "agent-end" && event.fields.agent === "reviewer",
  );
  const completion = debugEvents.find((event) => event.event === "completion");

  assert.deepEqual(
    {
      reviewNoteReference: reviewerEnd.fields.reviewNoteReference,
      terminalArtifact: completion.fields.terminalArtifact,
    },
    {
      reviewNoteReference: "review-01.md",
      terminalArtifact: "terminal-decision.md",
    },
  );
});

test("runWorkflow should accumulate provider cost in debug output and final metadata", async () => {
  const calls = [];
  const debugEvents = [];

  const result = await runWorkflowWithCalls(calls, {
    debugEvents,
    policyDecisions: [{ decision: "complete-ok" }],
    providerReferences: {
      costUsd: 0.123456,
      durationMs: 61000,
    },
  });

  const metadata = await readRunMetadata(result.runDirectory);

  assert.deepEqual(
    {
      firstAgentEnd: debugEvents.find((event) => event.event === "agent-end").fields,
      completion: debugEvents.at(-1),
      metadataDuration: metadata.duration,
      totalCost: metadata.totalCost,
      totalCostUsd: metadata.totalCostUsd,
    },
    {
      firstAgentEnd: {
        agent: "producer",
        cost: "$0.1235",
        duration: "01:01",
        route: "claude-code/anthropic/claude-sonnet-4-5/medium",
      },
      completion: {
        event: "completion",
        fields: {
          duration: "00:00",
          status: "succeeded",
          totalCost: "$0.2469",
        },
      },
      metadataDuration: "00:00",
      totalCost: "$0.2469",
      totalCostUsd: 0.2469,
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
    failureReason: "review policy completed with failure",
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

test("runWorkflow should surface the policy reason on the completion event when policy completes with failure", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{
      decision: "complete-fail",
      reason: "reviewer reported verification did not run",
    }],
  });

  const events = await readEvents(result.runDirectory);

  assert.deepEqual(
    {
      completionEvent: events.map(progressEventSummary).at(-1),
      failureReason: result.failureReason,
    },
    {
      completionEvent: {
        failureReason: "reviewer reported verification did not run",
        finalStatus: "failed",
        runId: result.runId,
        type: "completion",
      },
      failureReason: "reviewer reported verification did not run",
    },
  );
});

test("runWorkflow should persist terminal artifact references on complete-fail", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{
      decision: "complete-fail",
      reason: "remediation budget exhausted",
      terminalArtifact: { content: "# Terminal Decision\n\nBudget exhausted.\n" },
    }],
  });

  const events = await readEvents(result.runDirectory);

  assert.deepEqual(
    {
      completionArtifact: events.at(-1).terminalArtifact,
      failureReason: result.failureReason,
      persistedContent: await readFileIfExists(join(result.runDirectory, "terminal-decision.md")),
      resultArtifact: result.terminalArtifact,
    },
    {
      completionArtifact: "terminal-decision.md",
      failureReason: "remediation budget exhausted",
      persistedContent: "# Terminal Decision\n\nBudget exhausted.\n",
      resultArtifact: "terminal-decision.md",
    },
  );
});

test("runWorkflow should persist a failed evidence index with terminal policy decision reference", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{
      decision: "complete-fail",
      reason: "remediation budget exhausted",
      terminalArtifact: { content: "# Terminal Decision\n\nBudget exhausted.\n" },
    }],
  });

  const content = await readFile(join(result.runDirectory, "evidence-index.json"), "utf8");
  const evidenceIndex = JSON.parse(content);

  assert.deepEqual(evidenceIndex, {
    rounds: [
      {
        policyDecision: "complete-fail",
        policyDecisionReference: "policy-decision-01",
        producerArtifact: "producer/result.json",
        reviewNoteReference: "review-01.md",
        reviewRoundIndex: 1,
      },
    ],
    runId: result.runId,
    taskFile: "tasks/initial.md",
    terminal: {
      policyDecisionReference: "policy-decision-01",
      status: "failed",
      terminalArtifact: "terminal-decision.md",
    },
  });
});

test("runWorkflow should fail without calling reviewer when producer reports verification did not run", async () => {
  const calls = [];
  const policyDecisions = [];

  const result = await runWorkflowWithCalls(calls, {
    onPolicyDecision: (input) => {
      policyDecisions.push(input);
    },
    policyDecisions: [],
    producerOutputs: [
      { artifact: "producer/result.json", verification: { ran: false } },
    ],
  });

  const metadata = await readRunMetadata(result.runDirectory);

  assert.deepEqual(
    {
      callRoles: calls.map(classifyCall),
      exitCode: result.exitCode,
      policyCalls: policyDecisions.length,
      status: result.status,
      metadataExitCode: metadata.exitCode,
      metadataStatus: metadata.status,
    },
    {
      callRoles: ["producer"],
      exitCode: 1,
      policyCalls: 0,
      status: "failed",
      metadataExitCode: 1,
      metadataStatus: "failed",
    },
  );
});

test("runWorkflow should emit a failed completion event when producer reports verification did not run", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [],
    producerOutputs: [
      { artifact: "producer/result.json", verification: { ran: false } },
    ],
  });

  const events = await readEvents(result.runDirectory);

  assert.deepEqual(events.map(progressEventSummary).at(-1), {
    failureReason: "producer reported verification did not run",
    finalStatus: "failed",
    runId: result.runId,
    type: "completion",
  });
});

test("runWorkflow should persist review-01.md containing the reviewer summary on the first reviewer round", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{ decision: "complete-ok" }],
    reviewerOutputs: [{ verdict: "accepted", summary: "round one summary" }],
  });

  const persisted = await readFile(join(result.runDirectory, "review-01.md"), "utf8");
  assert.equal(persisted, "round one summary");
});

test("runWorkflow should include reviewNoteReference on the first reviewer agent-end event", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{ decision: "complete-ok" }],
    reviewerOutputs: [{ verdict: "accepted", summary: "round one summary" }],
  });

  const events = await readEvents(result.runDirectory);
  const reviewerEnd = events.find((event) => event.type === "agent-end" && event.agentId === "reviewer");
  assert.equal(reviewerEnd.reviewNoteReference, "review-01.md");
});

test("runWorkflow should include reviewRoundIndex on first-round reviewer and policy events", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [{ decision: "complete-ok" }],
    reviewerOutputs: [{ verdict: "accepted", summary: "round one summary" }],
  });

  const events = await readEvents(result.runDirectory);
  const relevantEvents = events
    .filter((event) =>
      (event.type === "agent-start" && event.agentId === "reviewer")
      || (event.type === "agent-end" && event.agentId === "reviewer")
      || event.type === "policy-decision"
      || event.type === "completion",
    )
    .map((event) => ({
      reviewRoundIndex: event.reviewRoundIndex,
      type: event.type,
    }));

  assert.deepEqual(relevantEvents, [
    { reviewRoundIndex: 1, type: "agent-start" },
    { reviewRoundIndex: 1, type: "agent-end" },
    { reviewRoundIndex: 1, type: "policy-decision" },
    { reviewRoundIndex: 1, type: "completion" },
  ]);
});

test("runWorkflow should persist review-01.md and review-02.md across two reviewer rounds", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [
      { decision: "remediate" },
      { decision: "complete-ok" },
    ],
    reviewerOutputs: [
      { verdict: "needs-fix", summary: "round one summary" },
      { verdict: "accepted", summary: "round two summary" },
    ],
  });

  const round1 = await readFile(join(result.runDirectory, "review-01.md"), "utf8");
  const round2 = await readFile(join(result.runDirectory, "review-02.md"), "utf8");
  assert.equal(round1, "round one summary");
  assert.equal(round2, "round two summary");
});

test("runWorkflow should reference review-NN.md on each reviewer agent-end event in order", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [
      { decision: "remediate" },
      { decision: "complete-ok" },
    ],
    reviewerOutputs: [
      { verdict: "needs-fix", summary: "round one summary" },
      { verdict: "accepted", summary: "round two summary" },
    ],
  });

  const events = await readEvents(result.runDirectory);
  const reviewerEnds = events.filter((event) => event.type === "agent-end" && event.agentId === "reviewer");
  assert.deepEqual(
    reviewerEnds.map((event) => event.reviewNoteReference),
    ["review-01.md", "review-02.md"],
  );
});

test("runWorkflow should include reviewRoundIndex across remediated reviewer and policy events", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [
      { decision: "remediate" },
      { decision: "complete-ok" },
    ],
    reviewerOutputs: [
      { verdict: "needs-fix", summary: "round one summary" },
      { verdict: "accepted", summary: "round two summary" },
    ],
  });

  const events = await readEvents(result.runDirectory);
  const relevantEvents = events
    .filter((event) =>
      (event.type === "agent-end" && event.agentId === "reviewer")
      || event.type === "policy-decision"
      || event.type === "completion",
    )
    .map((event) => ({
      reviewRoundIndex: event.reviewRoundIndex,
      type: event.type,
    }));

  assert.deepEqual(relevantEvents, [
    { reviewRoundIndex: 1, type: "agent-end" },
    { reviewRoundIndex: 1, type: "policy-decision" },
    { reviewRoundIndex: 2, type: "agent-end" },
    { reviewRoundIndex: 2, type: "policy-decision" },
    { reviewRoundIndex: 2, type: "completion" },
  ]);
});

test("runWorkflow should not include reviewNoteReference on producer or remediator agent-end events", async () => {
  const calls = [];

  const result = await runWorkflowWithCalls(calls, {
    policyDecisions: [
      { decision: "remediate" },
      { decision: "complete-ok" },
    ],
    reviewerOutputs: [
      { verdict: "needs-fix", summary: "round one summary" },
      { verdict: "accepted", summary: "round two summary" },
    ],
  });

  const events = await readEvents(result.runDirectory);
  const nonReviewerEnds = events.filter(
    (event) => event.type === "agent-end" && event.agentId !== "reviewer",
  );
  assert.ok(nonReviewerEnds.length > 0);
  for (const event of nonReviewerEnds) {
    assert.equal(Object.prototype.hasOwnProperty.call(event, "reviewNoteReference"), false);
  }
});

test("runWorkflow should not pass reviewer summary into ReviewFixPolicy.decide input", async () => {
  const policyInputs = [];

  await runWorkflowWithCalls([], {
    onPolicyDecision: (input) => policyInputs.push(input),
    policyDecisions: [{ decision: "complete-ok" }],
    reviewerOutputs: [{ verdict: "accepted", summary: "should not leak" }],
  });

  assert.equal(policyInputs.length, 1);
  assert.equal(
    Object.prototype.hasOwnProperty.call(policyInputs[0].verdict ?? {}, "summary"),
    false,
  );
});

async function runWorkflowWithCalls(calls, options = {}) {
  const workspace = await makeSettingsWorkspace();
  const policyDecisions = [...options.policyDecisions];
  const reviewerOutputs = [...(options.reviewerOutputs ?? [])];
  const producerOutputs = [...(options.producerOutputs ?? [])];
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml({
    remediator: {
      model: "high",
      output: {
        schema: {
          required: ["task"],
          type: "object",
        },
      },
      prompt: { ref: "reinix://prompts/remediator" },
      provider: "anthropic",
    },
  }));
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());

  return runWorkflow({
    ...(options.debugEvents ? {
      debugReporter: {
        rememberSettings: () => {},
        report: (event, fields) => {
          options.debugEvents.push({ event, fields });
        },
        reportSettings: () => {
          options.debugEvents.push({ event: "settings", fields: {} });
        },
      },
    } : {}),
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
        const reviewerOutput = reviewerOutputs.shift() ?? { verdict: "needs-fix" };
        return {
          exitStatus: 0,
          semanticResult: {
            summary: "default reviewer summary",
            verification: { ran: true },
            ...reviewerOutput,
          },
          ...options.providerReferences,
        };
      }
      const producerOutput = producerOutputs.shift()
        ?? { artifact: "producer/result.json", verification: { ran: true } };
      return {
        exitStatus: 0,
        semanticResult: producerOutput,
        ...options.providerReferences,
      };
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

async function readFileIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}
