import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { isMainModule, main, parseArguments } from "../src/index.js";

test("parseArguments should parse task without exposing a working directory option", () => {
  assert.deepEqual(
    parseArguments(["--task", "ship it"]),
    {
      debug: false,
      task: "ship it",
    },
  );
});

test("parseArguments should parse task file without exposing a working directory option", () => {
  assert.deepEqual(
    parseArguments(["--task-file", "tasks/ship-it.md"]),
    {
      debug: false,
      task: "",
      taskFile: "tasks/ship-it.md",
    },
  );
});

test("parseArguments should enable debug when debug flag is present", () => {
  assert.deepEqual(
    parseArguments(["--debug", "--task-file", "tasks/ship-it.md"]),
    {
      debug: true,
      task: "",
      taskFile: "tasks/ship-it.md",
    },
  );
});

test("parseArguments should disable debug when debug flag is absent", () => {
  assert.equal(parseArguments(["--task", "ship it"]).debug, false);
});

test("main should print concise startup validation failure output and return non-zero exit code", async () => {
  let stderr = "";
  const exitCode = await main({
    argv: ["--task", "ship it"],
    composition: {
      runWorkflow: async () => ({
        exitCode: 1,
        failureReason: "agents.yaml not found",
        status: "failed",
      }),
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });

  assert.deepEqual(
    { exitCode, stderr },
    { exitCode: 1, stderr: "agents.yaml not found\n" },
  );
});

test("main should pass a debug reporter to composition when debug is enabled", async () => {
  let workflowInput;
  let stderr = "";
  const exitCode = await main({
    argv: ["--debug", "--task", "ship it"],
    composition: {
      runWorkflow: async (input) => {
        workflowInput = input;
        input.debugReporter.report("completion", { status: "succeeded" });
        return { exitCode: 0, status: "succeeded" };
      },
    },
    stderr: { write: (chunk) => { stderr += chunk; } },
    stdout: { write: () => { throw new Error("stdout should not receive debug output"); } },
  });

  assert.deepEqual(
    {
      debugReporterPresent: Boolean(workflowInput.debugReporter),
      exitCode,
      stderr,
    },
    {
      debugReporterPresent: true,
      exitCode: 0,
      stderr: "regentara debug: completion status=\"succeeded\"\n",
    },
  );
});

test("main should pass a disabled debug reporter when debug is absent", async () => {
  let stderr = "";
  await main({
    argv: ["--task", "ship it"],
    composition: {
      runWorkflow: async (input) => {
        input.debugReporter.report("completion", { status: "succeeded" });
        return { exitCode: 0, status: "succeeded" };
      },
    },
    stderr: { write: (chunk) => { stderr += chunk; } },
  });

  assert.equal(stderr, "");
});

test("main should return zero for successful composition using injected fakes", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "regentara-cli-test-"));
  const taskFile = join(temporaryDirectory, "task.md");
  await writeFile(taskFile, "ship it");
  let workflowInput;
  const exitCode = await main({
    argv: ["--task-file", taskFile],
    composition: {
      runWorkflow: async (input) => {
        workflowInput = input;
        return {
          exitCode: input.task === "ship it" ? 0 : 1,
          status: "succeeded",
        };
      },
    },
    stderr: {
      write: () => {},
    },
  });

  assert.deepEqual(
    {
      debugReporterPresent: Boolean(workflowInput.debugReporter),
      exitCode,
      task: workflowInput.task,
      taskFile: workflowInput.taskFile,
    },
    {
      debugReporterPresent: true,
      exitCode: 0,
      task: "ship it",
      taskFile,
    },
  );
});

test("isMainModule should compare import url with the file URL for argv path", () => {
  assert.equal(isMainModule("file:///tmp/project%20space/regentara.js", "/tmp/project space/regentara.js"), true);
});
