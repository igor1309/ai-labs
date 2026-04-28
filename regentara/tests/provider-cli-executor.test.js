import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";

import { RuntimeFailure } from "../src/errors.js";
import { executeProviderCli } from "../src/provider-cli-executor.js";

test("executeProviderCli should invoke Claude Code structured output from the Regentara invocation working directory", async () => {
  const calls = [];

  await executeProviderCli(makeInput({
    runner: "claude-code",
  }), {
    spawnProvider: async (call) => {
      calls.push(call);
      return makeExecutionResult({
        stdout: JSON.stringify({
          structured_output: { artifact: "producer/result.json" },
        }),
      });
    },
  });

  assert.deepEqual(
    {
      command: calls[0].command,
      cwd: calls[0].cwd,
      hasToolsFlag: calls[0].args.includes("--tools"),
    },
    {
      command: "claude",
      cwd: process.cwd(),
      hasToolsFlag: false,
    },
  );
});

test("executeProviderCli should capture Claude Code structured output and session diagnostics", async () => {
  const result = await executeProviderCli(makeInput({
    runner: "claude-code",
  }), {
    spawnProvider: async () => makeExecutionResult({
      runnerReference: "runner-123",
      stderr: "warning",
      stdout: JSON.stringify({
        session_id: "session-123",
        structured_output: { artifact: "producer/result.json" },
      }),
    }),
  });

  assert.deepEqual(result, {
    exitStatus: 0,
    rawStdout: "{\"session_id\":\"session-123\",\"structured_output\":{\"artifact\":\"producer/result.json\"}}",
    runnerReference: "runner-123",
    semanticResult: { artifact: "producer/result.json" },
    sessionReference: "session-123",
    stderrReference: "warning",
    stdoutReference: "{\"session_id\":\"session-123\",\"structured_output\":{\"artifact\":\"producer/result.json\"}}",
  });
});

test("executeProviderCli should read Codex semantic output from the output-last-message file", async () => {
  const calls = [];
  const result = await executeProviderCli(makeInput(), {
    spawnProvider: async (call) => {
      calls.push(call);
      const outputPath = calls[0].args.at(calls[0].args.indexOf("--output-last-message") + 1);
      await writeFile(outputPath, JSON.stringify({ artifact: "producer/result.json" }));
      return makeExecutionResult({
        stderr: "codex warning",
        stdout: "diagnostic stdout",
      });
    },
  });

  assert.deepEqual(
    {
      args: calls[0].args,
      command: calls[0].command,
      rawStdout: result.rawStdout,
      semanticResult: result.semanticResult,
      stderrReference: result.stderrReference,
    },
    {
      args: [
        "exec",
        "--model",
        "gpt-5.5",
        "--output-schema",
        calls[0].args.at(calls[0].args.indexOf("--output-schema") + 1),
        "--output-last-message",
        calls[0].args.at(calls[0].args.indexOf("--output-last-message") + 1),
        "Use structured output.",
      ],
      command: "codex",
      rawStdout: "diagnostic stdout",
      semanticResult: { artifact: "producer/result.json" },
      stderrReference: "codex warning",
    },
  );
});

test("executeProviderCli should capture Codex session diagnostics", async () => {
  const result = await executeProviderCli(makeInput(), {
    spawnProvider: async (call) => {
      const outputPath = call.args.at(call.args.indexOf("--output-last-message") + 1);
      await writeFile(outputPath, JSON.stringify({ artifact: "producer/result.json" }));
      return makeExecutionResult({
        stderr: "session id: 019dd441-dfd4-7892-9988-8b23d3e42798\n",
      });
    },
  });

  assert.equal(result.sessionReference, "019dd441-dfd4-7892-9988-8b23d3e42798");
});

test("executeProviderCli should fail when a Codex output-last-message file is missing", async () => {
  await assert.rejects(
    () => executeProviderCli(makeInput(), {
      spawnProvider: async () => makeExecutionResult(),
    }),
    /provider semantic result missing for runner: codex/,
  );
});

test("executeProviderCli should fail when Codex semantic output is malformed JSON", async () => {
  await assert.rejects(
    () => executeProviderCli(makeInput(), {
      spawnProvider: async (call) => {
        const outputPath = call.args.at(call.args.indexOf("--output-last-message") + 1);
        await writeFile(outputPath, "not json");
        return makeExecutionResult();
      },
    }),
    /provider semantic result is not valid JSON for runner: codex/,
  );
});

test("executeProviderCli should fail when provider semantic output fails the configured schema", async () => {
  await assert.rejects(
    () => executeProviderCli(makeInput(), {
      spawnProvider: async (call) => {
        const outputPath = call.args.at(call.args.indexOf("--output-last-message") + 1);
        await writeFile(outputPath, JSON.stringify({ wrong: "field" }));
        return makeExecutionResult();
      },
    }),
    /agent runtime output failed schema validation: producer/,
  );
});

test("executeProviderCli should fail clearly when no provider structured result adapter exists", async () => {
  await assert.rejects(
    () => executeProviderCli(makeInput({
      runner: "custom-runner",
    })),
    /no provider structured result adapter for runner: custom-runner/,
  );
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
      const outputPath = call.args.at(call.args.indexOf("--output-last-message") + 1);
      await writeFile(outputPath, JSON.stringify({ artifact: "producer/result.json" }));
      return makeExecutionResult();
    },
  });

  assert.equal("timeout" in calls[0], false);
});

test("executeProviderCli should pass the selected model to the provider boundary input", async () => {
  const calls = [];

  await executeProviderCli(makeInput(), {
    spawnProvider: async (call) => {
      calls.push(call);
      const outputPath = call.args.at(call.args.indexOf("--output-last-message") + 1);
      await writeFile(outputPath, JSON.stringify({ artifact: "producer/result.json" }));
      return makeExecutionResult();
    },
  });

  assert.equal(calls[0].model, "gpt-5.5");
});

test("executeProviderCli should pass the selected model to Claude Code arguments", async () => {
  const calls = [];

  await executeProviderCli(makeInput({
    model: "claude-sonnet-4-5",
    runner: "claude-code",
  }), {
    spawnProvider: async (call) => {
      calls.push(call);
      return makeExecutionResult({
        stdout: JSON.stringify({
          structured_output: { artifact: "producer/result.json" },
        }),
      });
    },
  });

  assert.deepEqual(
    calls[0].args.slice(0, 4),
    ["-p", "--model", "claude-sonnet-4-5", "--output-format"],
  );
});

test("executeProviderCli should pass the selected model to Codex arguments", async () => {
  const calls = [];

  await executeProviderCli(makeInput(), {
    spawnProvider: async (call) => {
      calls.push(call);
      const outputPath = call.args.at(call.args.indexOf("--output-last-message") + 1);
      await writeFile(outputPath, JSON.stringify({ artifact: "producer/result.json" }));
      return makeExecutionResult();
    },
  });

  assert.deepEqual(
    calls[0].args.slice(0, 3),
    ["exec", "--model", "gpt-5.5"],
  );
});

test("executeProviderCli should pass reasoning effort to Codex arguments", async () => {
  const calls = [];

  await executeProviderCli(makeInput({
    reasoningEffort: "medium",
  }), {
    spawnProvider: async (call) => {
      calls.push(call);
      const outputPath = call.args.at(call.args.indexOf("--output-last-message") + 1);
      await writeFile(outputPath, JSON.stringify({ artifact: "producer/result.json" }));
      return makeExecutionResult();
    },
  });

  assert.deepEqual(
    calls[0].args.slice(3, 6),
    ["--config", "model_reasoning_effort=\"medium\"", "--output-schema"],
  );
});

function makeInput(overrides = {}) {
  return {
    agentId: "producer",
    executionInput: {
      task: "write tests",
    },
    model: "gpt-5.5",
    outputSchema: {
      required: ["artifact"],
      type: "object",
    },
    prompt: "Use structured output.",
    provider: "openai",
    runner: "codex",
    ...overrides,
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
