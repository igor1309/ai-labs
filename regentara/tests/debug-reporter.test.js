import assert from "node:assert/strict";
import test from "node:test";

import {
  createDebugReporter,
  formatDebugLine,
} from "../src/debug-reporter.js";

test("formatDebugLine should write event labels and JSON scalar fields", () => {
  assert.equal(
    formatDebugLine("agent-start", {
      agent: "reviewer",
      model: "gpt-5.5",
      reasoningEffort: "high",
    }),
    "regentara debug: agent-start agent=\"reviewer\" model=\"gpt-5.5\" reasoningEffort=\"high\"\n",
  );
});

test("formatDebugLine should omit undefined fields", () => {
  assert.equal(
    formatDebugLine("completion", {
      runId: undefined,
      status: "succeeded",
    }),
    "regentara debug: completion status=\"succeeded\"\n",
  );
});

test("formatDebugLine should reject non-scalar field values", () => {
  assert.throws(
    () => formatDebugLine("settings", { agents: { path: "agents.yaml" } }),
    /debug field agents must be a scalar/,
  );
});

test("formatDebugLine should encode newline values onto one output line", () => {
  assert.equal(
    formatDebugLine("failure", { reason: "line one\nline two" }),
    "regentara debug: failure reason=\"line one\\nline two\"\n",
  );
});

test("createDebugReporter should write formatted lines when enabled", () => {
  let stderr = "";
  const reporter = createDebugReporter({
    enabled: true,
    stderr: { write: (chunk) => { stderr += chunk; } },
  });

  reporter.report("completion", { status: "succeeded" });

  assert.equal(stderr, "regentara debug: completion status=\"succeeded\"\n");
});

test("createDebugReporter should do nothing when disabled", () => {
  let stderr = "";
  const reporter = createDebugReporter({
    enabled: false,
    stderr: { write: (chunk) => { stderr += chunk; } },
  });

  reporter.report("completion", { status: "succeeded" });

  assert.equal(stderr, "");
});

test("createDebugReporter should accumulate settings paths before reporting", () => {
  let stderr = "";
  const reporter = createDebugReporter({
    enabled: true,
    stderr: { write: (chunk) => { stderr += chunk; } },
  });

  reporter.rememberSettings({ policy: "/home/.regentara/policy.yaml" });
  reporter.rememberSettings({
    agents: "/work/.regentara/agents.yaml",
    models: "/work/.regentara/models.yaml",
  });
  reporter.reportSettings();

  assert.equal(
    stderr,
    "regentara debug: settings agents=\"/work/.regentara/agents.yaml\" models=\"/work/.regentara/models.yaml\" policy=\"/home/.regentara/policy.yaml\"\n",
  );
});
