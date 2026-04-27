import assert from "node:assert/strict";
import test from "node:test";

import { RuntimeFailure } from "../src/errors.js";
import { executeProviderCli } from "../src/provider-cli-executor.js";

test("executeProviderCli should invoke provider CLI from the Regentara invocation working directory", async () => {
  const calls = [];

  await executeProviderCli(makeInput(), {
    spawnProvider: async (call) => {
      calls.push(call);
      return makeExecutionResult();
    },
  });

  assert.equal(calls[0].cwd, "/tmp/regentara-work");
});

test("executeProviderCli should capture exit status output references runner references provider session references and parsed JSON output", async () => {
  const result = await executeProviderCli(makeInput(), {
    spawnProvider: async () => makeExecutionResult({
      runnerReference: "runner-123",
      sessionReference: "session-123",
      stderr: "warning",
      stdout: "{\"artifact\":\"producer/result.json\"}",
    }),
  });

  assert.deepEqual(result, {
    exitStatus: 0,
    jsonOutput: { artifact: "producer/result.json" },
    runnerReference: "runner-123",
    sessionReference: "session-123",
    stderrReference: "warning",
    stdoutReference: "{\"artifact\":\"producer/result.json\"}",
  });
});

test("executeProviderCli should treat non-zero exit status as runtime failure", async () => {
  await assert.rejects(
    () => executeProviderCli(makeInput(), {
      spawnProvider: async () => makeExecutionResult({ exitStatus: 2 }),
    }),
    RuntimeFailure,
  );
});

test("executeProviderCli should not infer success from partial files or logs when subprocess exits non-zero", async () => {
  await assert.rejects(
    () => executeProviderCli(makeInput(), {
      spawnProvider: async () => makeExecutionResult({
        exitStatus: 1,
        stdout: "{\"artifact\":\"producer/result.json\"}",
      }),
    }),
    /provider CLI exited non-zero: 1/,
  );
});

test("executeProviderCli should not impose an automatic subprocess timeout", async () => {
  const calls = [];

  await executeProviderCli(makeInput(), {
    spawnProvider: async (call) => {
      calls.push(call);
      return makeExecutionResult();
    },
  });

  assert.equal("timeout" in calls[0], false);
});

test("executeProviderCli should pass the selected runner and model to the provider boundary", async () => {
  const calls = [];

  await executeProviderCli(makeInput(), {
    spawnProvider: async (call) => {
      calls.push(call);
      return makeExecutionResult();
    },
  });

  assert.deepEqual(
    { args: calls[0].args, command: calls[0].command },
    { args: ["--model", "gpt-5.1-codex"], command: "codex" },
  );
});

function makeInput() {
  return {
    executionInput: {
      task: "write tests",
    },
    model: "gpt-5.1-codex",
    runner: "codex",
    workingDirectory: "/tmp/regentara-work",
  };
}

function makeExecutionResult(overrides = {}) {
  return {
    exitStatus: 0,
    stderr: "",
    stdout: "{}",
    ...overrides,
  };
}
