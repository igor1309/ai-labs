import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { createAuthoredArtifact } from "../src/artifact-store.js";
import { RuntimeFailure } from "../src/errors.js";
import { runWorkflow } from "../src/orchestrator.js";
import { createRun } from "../src/run-store.js";
import { progressEventSummary, readEvents } from "./helpers/events.js";
import {
  makeSettingsWorkspace,
  validAgentsYaml,
  validModelsYaml,
  writeLocalSettings,
} from "./helpers/settings.js";

test("runWorkflow should preserve already-created artifacts when a runtime failure occurs", async () => {
  const workspace = await makeWorkflowWorkspace();
  let runDirectory;

  await runWorkflowWithWorkspace(workspace, {
    executeProviderCli: async () => {
      await createAuthoredArtifact(runDirectory, "producer/result.json", "{}");
      throw new Error("provider failed");
    },
    onRunCreated: (run) => {
      runDirectory = run.runDirectory;
    },
  });

  await assert.doesNotReject(() => access(join(runDirectory, "producer", "result.json")));
});

test("runWorkflow should not fabricate an expected artifact when it is missing", async () => {
  const workspace = await makeWorkflowWorkspace();
  let runDirectory;

  await runWorkflowWithWorkspace(workspace, {
    artifactExists: async () => false,
    executeProviderCli: async () => ({ exitStatus: 0, semanticResult: { artifact: "producer/missing.json" } }),
    onRunCreated: (run) => {
      runDirectory = run.runDirectory;
    },
  });

  await assert.rejects(
    () => access(join(runDirectory, "producer", "missing.json")),
    /ENOENT/,
  );
});

test("runWorkflow should fail immediately when an expected artifact is missing", async () => {
  const workspace = await makeWorkflowWorkspace();

  const result = await runWorkflowWithWorkspace(workspace, {
    artifactExists: async () => false,
    executeProviderCli: async () => ({ exitStatus: 0, semanticResult: { artifact: "producer/missing.json" } }),
  });

  assert.deepEqual(
    { failureReason: result.failureReason, status: result.status },
    { failureReason: "expected artifact missing: producer/missing.json", status: "failed" },
  );
});

test("runWorkflow should fail immediately when default artifact lookup cannot find an expected artifact", async () => {
  const workspace = await makeWorkflowWorkspace();

  const result = await runWorkflowWithWorkspace(workspace, {
    executeProviderCli: async () => ({ exitStatus: 0, semanticResult: { artifact: "producer/missing.json" } }),
  });

  assert.deepEqual(
    { failureReason: result.failureReason, status: result.status },
    { failureReason: "expected artifact missing: producer/missing.json", status: "failed" },
  );
});

test("runWorkflow should fail immediately when provider returns only diagnostic stdout", async () => {
  const workspace = await makeWorkflowWorkspace();

  const result = await runWorkflowWithWorkspace(workspace, {
    executeProviderCli: async () => ({
      exitStatus: 0,
      rawStdout: "{\"artifact\":\"producer/result.json\"}",
      stdoutReference: "{\"artifact\":\"producer/result.json\"}",
    }),
  });

  assert.deepEqual(
    { failureReason: result.failureReason, status: result.status },
    { failureReason: "provider semantic result missing: producer", status: "failed" },
  );
});

test("runWorkflow should stop after the first runtime failure", async () => {
  const workspace = await makeWorkflowWorkspace();
  let callCount = 0;

  await runWorkflowWithWorkspace(workspace, {
    executeProviderCli: async () => {
      callCount += 1;
      throw new Error("provider failed");
    },
  });

  assert.equal(callCount, 1);
});

test("runWorkflow should append a runtime failure progress event when provider execution fails", async () => {
  const workspace = await makeWorkflowWorkspace();
  let runDirectory;
  let runId;

  await runWorkflowWithWorkspace(workspace, {
    executeProviderCli: async () => {
      throw new Error("provider failed");
    },
    onRunCreated: (run) => {
      runDirectory = run.runDirectory;
      runId = run.runId;
    },
  });

  const events = await readEvents(runDirectory);

  assert.deepEqual(events.map(progressEventSummary), [
    { agentId: "producer", currentAgent: "producer", runId, type: "agent-start" },
    { currentAgent: "producer", failureReason: "provider failed", finalStatus: "failed", runId, type: "runtime-failure" },
  ]);
});

test("runWorkflow should append provider diagnostics when provider execution fails", async () => {
  const workspace = await makeWorkflowWorkspace();
  let runDirectory;

  await runWorkflowWithWorkspace(workspace, {
    executeProviderCli: async () => {
      throw new RuntimeFailure("provider CLI exited non-zero: 1", {
        cause: {
          stderr: "codex stderr",
          stdout: "codex stdout",
        },
      });
    },
    onRunCreated: (run) => {
      runDirectory = run.runDirectory;
    },
  });

  const failureEvent = (await readEvents(runDirectory))
    .find((event) => event.type === "runtime-failure");

  assert.deepEqual(
    {
      model: failureEvent.model,
      provider: failureEvent.provider,
      runner: failureEvent.runner,
      stderrReference: failureEvent.stderrReference,
      stdoutReference: failureEvent.stdoutReference,
    },
    {
      model: "claude-sonnet-4-5",
      provider: "anthropic",
      runner: "claude-code",
      stderrReference: "codex stderr",
      stdoutReference: "codex stdout",
    },
  );
});

test("runWorkflow should not retry a failed step", async () => {
  const workspace = await makeWorkflowWorkspace();
  let producerCalls = 0;

  await runWorkflowWithWorkspace(workspace, {
    executeProviderCli: async () => {
      producerCalls += 1;
      throw new Error("provider failed");
    },
  });

  assert.equal(producerCalls, 1);
});

test("runWorkflow should not continue to later workflow steps after a failed step", async () => {
  const workspace = await makeWorkflowWorkspace();
  const calls = [];

  await runWorkflowWithWorkspace(workspace, {
    executeProviderCli: async (input) => {
      calls.push(input.executionInput);
      throw new Error("provider failed");
    },
  });

  assert.deepEqual(calls, [{ task: "initial task" }]);
});

test("runWorkflow should exit non-zero and create no run when interrupted before workflow execution starts", async () => {
  const workspace = await makeWorkflowWorkspace();
  let createRunCalled = false;

  const result = await runWorkflow({
    homeDirectory: workspace.homeDirectory,
    interrupted: true,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    task: "initial task",
    workingDirectory: workspace.workingDirectory,
  }, {
    createRun: async () => {
      createRunCalled = true;
    },
  });

  assert.deepEqual(
    { createRunCalled, exitCode: result.exitCode, status: result.status },
    { createRunCalled: false, exitCode: 1, status: "failed" },
  );
});

test("runWorkflow should mark the run failed when interrupted after workflow execution starts", async () => {
  const workspace = await makeWorkflowWorkspace();
  let runDirectory;

  await runWorkflowWithWorkspace(workspace, {
    interruptAfterRunCreated: true,
    onRunCreated: (run) => {
      runDirectory = run.runDirectory;
    },
  });

  const metadata = JSON.parse(await readFile(join(runDirectory, "metadata.json"), "utf8"));

  assert.equal(metadata.status, "failed");
});

test("runWorkflow should mark the run failed when review policy returns an unsupported decision", async () => {
  const workspace = await makeWorkflowWorkspace();
  let runDirectory;

  await runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "unknown" }) },
    task: "initial task",
    taskFile: "tasks/initial.md",
    workingDirectory: workspace.workingDirectory,
  }, {
    artifactExists: async () => true,
    commandExists: async () => true,
    createRun: async (runOptions) => {
      const run = await createRun(runOptions);
      runDirectory = run.runDirectory;
      return run;
    },
    executeProviderCli: async (input) => {
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

  const metadata = JSON.parse(await readFile(join(runDirectory, "metadata.json"), "utf8"));

  assert.equal(metadata.status, "failed");
});

test("runWorkflow should include run context when a runtime failure occurs after run creation", async () => {
  const workspace = await makeWorkflowWorkspace();

  const result = await runWorkflowWithWorkspace(workspace, {
    executeProviderCli: async () => {
      throw new Error("provider failed");
    },
  });

  assert.deepEqual(
    {
      hasRunDirectory: typeof result.runDirectory === "string",
      hasRunId: typeof result.runId === "string",
      status: result.status,
    },
    {
      hasRunDirectory: true,
      hasRunId: true,
      status: "failed",
    },
  );
});

async function makeWorkflowWorkspace() {
  const workspace = await makeSettingsWorkspace();
  await writeLocalSettings(workspace, "agents.yaml", validAgentsYaml());
  await writeLocalSettings(workspace, "models.yaml", validModelsYaml());

  return workspace;
}

async function runWorkflowWithWorkspace(workspace, options = {}) {
  return runWorkflow({
    homeDirectory: workspace.homeDirectory,
    reviewFixPolicy: { decide: async () => ({ decision: "complete-ok" }) },
    task: "initial task",
    taskFile: "tasks/initial.md",
    workingDirectory: workspace.workingDirectory,
  }, {
    artifactExists: options.artifactExists,
    commandExists: async () => true,
    executeProviderCli: options.executeProviderCli ?? (async () => ({ exitStatus: 0, semanticResult: {} })),
    interruptAfterRunCreated: options.interruptAfterRunCreated,
    runStoreOptions: {
      homeDirectory: workspace.homeDirectory,
      randomBytes: () => Buffer.from([0, 1, 2, 3, 4]),
    },
    createRun: async (runOptions) => {
      const run = await createRun(runOptions);
      options.onRunCreated?.(run);
      return run;
    },
  });
}
