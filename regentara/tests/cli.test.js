import assert from "node:assert/strict";
import test from "node:test";

import { isMainModule, main, parseArguments } from "../src/index.js";

test("parseArguments should parse MVP task and working directory inputs", () => {
  assert.deepEqual(
    parseArguments(["--task", "ship it", "--working-directory", "/tmp/project"]),
    {
      task: "ship it",
      workingDirectory: "/tmp/project",
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
  const exitCode = await main({
    argv: ["--task", "ship it", "--working-directory", "/tmp/project"],
    composition: {
      runWorkflow: async (input) => ({
        exitCode: input.task === "ship it" ? 0 : 1,
        status: "succeeded",
      }),
    },
    stderr: {
      write: () => {},
    },
  });

  assert.equal(exitCode, 0);
});

test("isMainModule should compare import url with the file URL for argv path", () => {
  assert.equal(isMainModule("file:///tmp/project%20space/regentara.js", "/tmp/project space/regentara.js"), true);
});
