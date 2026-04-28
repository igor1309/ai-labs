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
      task: "ship it",
    },
  );
});

test("parseArguments should parse task file without exposing a working directory option", () => {
  assert.deepEqual(
    parseArguments(["--task-file", "tasks/ship-it.md"]),
    {
      task: "",
      taskFile: "tasks/ship-it.md",
    },
  );
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
    { exitCode, workflowInput },
    { exitCode: 0, workflowInput: { task: "ship it", taskFile } },
  );
});

test("isMainModule should compare import url with the file URL for argv path", () => {
  assert.equal(isMainModule("file:///tmp/project%20space/regentara.js", "/tmp/project space/regentara.js"), true);
});
