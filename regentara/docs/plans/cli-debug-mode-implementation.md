---
date: 2026-04-28
model: gpt-5
description: "Implementation plan for Regentara CLI debug mode."
---

# CLI Debug Mode Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Regentara `--debug` mode that prints compact live progress lines to stderr without changing orchestration behavior, stdout semantics, `events.jsonl`, or run metadata.

**Architecture:** Introduce a small CLI-owned debug reporter that formats `regentara debug:` lines and is passed through composition into the Orchestrator. Composition reports policy settings resolution; the Orchestrator reports agent/model settings, run creation, agent lifecycle, policy decisions, failures, and completion from existing lifecycle points instead of tailing `events.jsonl`.

**Tech Stack:** Node.js ESM, `node:test`, existing Regentara CLI/composition/orchestrator modules, root `scripts/run_silent.sh` verification wrapper.

---

## Execution Lock

- Execution mode: auto-continue
- Human review between tasks: no
- Worktree mode: none
- Expected worktree: `/Users/igormalyarov/Developer/my-apps/ai-labs/ai-labs`
- Expected branch: `codex/agent-develop-review-loop-research`
- Push policy: no push
- Final archive behavior: move this plan to `regentara/docs/plans/implemented/` after implementation and final verification.
- Preflight check: [x] done before implementation edits

## Source Documents

- ADR: `regentara/docs/adr/adr-010-cli-debug-mode.md`
- Spec: `regentara/docs/specs/cli-debug-mode.md`
- Perspective, not implementation scope: `regentara/docs/debug-observability-perspective-vision.md`

## ADR Traceability Matrix

| ADR-010 invariant | Implementation task |
|---|---|
| `--debug` writes to stderr, not stdout. | Task 2 |
| `--debug` emits human-readable plain text lines, not JSONL. | Task 1 |
| `--debug` lines begin with `regentara debug:`. | Task 1 |
| `--debug` does not change orchestration behavior or routing decisions. | Tasks 2-4 |
| `--debug` does not change the `events.jsonl` schema. | Task 4 |
| `--debug` is not implemented by tailing/parsing/transforming `events.jsonl`. | Tasks 1, 3, 4 |
| `--debug` does not print full prompts, schemas, provider stdout/stderr, env, credentials, auth state, or provider secrets. | Tasks 1, 4 |
| `--debug` identifies selected settings paths when known. | Task 3 |
| `--debug` identifies run ID and run directory when created. | Task 4 |
| `--debug` identifies provider/model tier and concrete runner selection for each agent call. | Task 4 |
| `--debug` identifies startup failures before run creation without fabricating a run ID. | Task 3 |
| `--debug` encodes field values as single-line JSON scalar values. | Task 1 |

## File Structure

- Create: `regentara/src/debug-reporter.js`
  - Owns debug line formatting, JSON scalar encoding, unknown-field omission, disabled reporter behavior, and accumulated settings-path reporting.
- Create: `regentara/tests/debug-reporter.test.js`
  - Covers deterministic debug line formatting and sensitive multi-line value handling.
- Modify: `regentara/src/index.js`
  - Parses `--debug`, constructs the reporter with CLI stderr, passes it to composition, and keeps existing failure output behavior.
- Modify: `regentara/tests/cli.test.js`
  - Covers parsing, stderr-only debug output, no-debug silence, startup failure, and stdout preservation.
- Modify: `regentara/src/composition.js`
  - Reports policy settings path when known and startup policy resolution failures when they occur before run creation.
- Modify: `regentara/src/orchestrator.js`
  - Reports agent/model settings paths, run creation, agent lifecycle, policy decisions, runtime failures, and completion from existing lifecycle points.
- Modify: relevant existing tests under `regentara/tests/`
  - Extend current fake-driven tests where possible instead of duplicating large workflow setup.
- Modify: `regentara/docs/log.md`
  - Add a concise implementation log entry before closeout.

## Chunk 1: Debug Reporter Primitive

### Task 1: Add deterministic debug line formatter

**Files:**
- Create: `regentara/src/debug-reporter.js`
- Create: `regentara/tests/debug-reporter.test.js`

- [x] **Step 1: Write failing formatter tests**

Add tests for:

```js
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
```

- [x] **Step 2: Run RED**

Run: `./scripts/run_silent.sh "debug-reporter-red" node --test regentara/tests/debug-reporter.test.js`

Expected: FAIL because `regentara/src/debug-reporter.js` does not exist.

- [x] **Step 3: Implement minimal reporter**

Create `regentara/src/debug-reporter.js`:

```js
export function createDebugReporter(options = {}) {
  const enabled = options.enabled === true;
  const stderr = options.stderr;
  const settings = {};

  return {
    rememberSettings: (fields = {}) => {
      Object.assign(settings, compact(fields));
    },
    report: (event, fields = {}) => {
      if (!enabled) return;
      stderr.write(formatDebugLine(event, fields));
    },
    reportSettings: () => {
      if (!enabled || Object.keys(settings).length === 0) return;
      stderr.write(formatDebugLine("settings", settings));
    },
  };
}

export function formatDebugLine(event, fields = {}) {
  const fieldText = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${encodeScalar(key, value)}`);
  return [
    "regentara debug:",
    event,
    ...fieldText,
  ].join(" ") + "\n";
}

function encodeScalar(key, value) {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  throw new TypeError(`debug field ${key} must be a scalar`);
}

function compact(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}
```

- [x] **Step 4: Run GREEN**

Run: `./scripts/run_silent.sh "debug-reporter-green" node --test regentara/tests/debug-reporter.test.js`

Expected: PASS.

- [x] **Step 5: Commit**

Run: `git add regentara/src/debug-reporter.js regentara/tests/debug-reporter.test.js && git commit -m "add regentara debug reporter"`

## Chunk 2: CLI Flag and Stderr Boundary

### Task 2: Parse `--debug` and pass reporter into composition

**Files:**
- Modify: `regentara/src/index.js`
- Modify: `regentara/tests/cli.test.js`

- [x] **Step 1: Write failing CLI parse and boundary tests**

Add tests to `regentara/tests/cli.test.js`:

```js
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
```

- [x] **Step 2: Run RED**

Run: `./scripts/run_silent.sh "cli-debug-red" node --test regentara/tests/cli.test.js`

Expected: FAIL because `debug` is not parsed and no reporter is passed.

- [x] **Step 3: Implement CLI changes**

Modify `regentara/src/index.js`:

- import `createDebugReporter`.
- add `stdout = options.stdout ?? process.stdout` only if needed by tests; do not write debug to it.
- initialize parsed arguments with `debug: false`.
- handle `--debug`.
- create reporter:

```js
const debugReporter = createDebugReporter({
  enabled: parsedArguments.debug,
  stderr,
});
```

- pass `debugReporter` into `composition.runWorkflow`.

- [x] **Step 4: Run GREEN**

Run: `./scripts/run_silent.sh "cli-debug-green" node --test regentara/tests/cli.test.js regentara/tests/debug-reporter.test.js`

Expected: PASS.

- [x] **Step 5: Commit**

Run: `git add regentara/src/index.js regentara/tests/cli.test.js && git commit -m "wire regentara debug flag"`

## Chunk 3: Startup and Settings Debug Output

### Task 3: Report settings paths and startup failures before run creation

**Files:**
- Modify: `regentara/src/composition.js`
- Modify: `regentara/src/orchestrator.js`
- Modify: `regentara/tests/cli.test.js`
- Modify: `regentara/tests/startup-validation.test.js`

- [x] **Step 1: Write failing startup debug tests**

Add/adjust tests so:

- `main` with `--debug` and fake successful composition emits `settings` when fake composition reports it.
- production composition reports `policy` selected path when `resolvePolicySettings` succeeds.
- `runWorkflow` reports `agents` and `models` selected paths after settings resolution.
- startup failure before run creation emits `failure reason="..."` and does not emit `run-created`.

Use injected fakes where possible. For `runWorkflow`, pass a `debugReporter` object that stores calls:

```js
const debugEvents = [];
const debugReporter = {
  report: (event, fields) => {
    debugEvents.push({ event, fields });
  },
};
```

- [x] **Step 2: Run RED**

Run: `./scripts/run_silent.sh "startup-debug-red" node --test regentara/tests/cli.test.js regentara/tests/startup-validation.test.js`

Expected: FAIL because composition/orchestrator do not call the reporter.

- [x] **Step 3: Report policy settings in composition**

In `regentara/src/composition.js`:

- read `input.debugReporter`.
- after `resolvePolicy(...)`, report:

```js
input.debugReporter?.rememberSettings({ policy: policySettings.selectedPath });
```

- on policy bootstrap/resolution catch, report:

```js
input.debugReporter?.report("failure", { reason: error.message });
```

Then return the same `failureResult(error)` as today.

- [x] **Step 4: Report agent/model settings in orchestrator**

In `regentara/src/orchestrator.js`:

- read `const debugReporter = input.debugReporter ?? dependencies.debugReporter;`.
- after resolving agent settings and model routing, remember agent/model paths and report the accumulated settings line:

```js
debugReporter?.rememberSettings({
  agents: agentSettings.selectedPath,
  models: modelRouting.selectedPath,
});
debugReporter?.reportSettings();
```

- in the top-level catch, when no run exists or a startup error occurs, report known settings and failure:

```js
debugReporter?.reportSettings();
debugReporter?.report("failure", { reason: error.message });
```

Do not report a fabricated `runId` or `runDirectory`.

- [x] **Step 5: Run GREEN**

Run: `./scripts/run_silent.sh "startup-debug-green" node --test regentara/tests/cli.test.js regentara/tests/startup-validation.test.js`

Expected: PASS.

- [x] **Step 6: Commit**

Run: `git add regentara/src/composition.js regentara/src/orchestrator.js regentara/tests/cli.test.js regentara/tests/startup-validation.test.js && git commit -m "report regentara debug startup"`

## Chunk 4: Run Lifecycle Debug Output

### Task 4: Report run creation, agents, policy, runtime failures, and completion

**Files:**
- Modify: `regentara/src/orchestrator.js`
- Modify: `regentara/tests/orchestrator-sequence.test.js`
- Modify: `regentara/tests/failure-policy.test.js`

- [ ] **Step 1: Write failing lifecycle debug tests**

Add focused tests for:

- `run-created` includes `runId` and `runDirectory`.
- `agent-start` includes `agent`, `provider`, `tier`, `model`, `runner`, and `reasoningEffort` when available.
- Producer `agent-start` includes `taskFile`.
- `agent-end` includes `sessionReference` and `runnerReference` when available.
- `policy-decision` includes `decision`.
- runtime failure after run creation emits `failure status="failed" reason="..."`.
- successful completion emits `completion status="succeeded"`.
- debug mode does not change existing `events.jsonl` content assertions.
- debug output objects do not include `prompt`, `outputSchema`, `stdoutReference`, or `stderrReference` full values.

- [ ] **Step 2: Run RED**

Run: `./scripts/run_silent.sh "lifecycle-debug-red" node --test regentara/tests/orchestrator-sequence.test.js regentara/tests/failure-policy.test.js`

Expected: FAIL because lifecycle reporting is not implemented.

- [ ] **Step 3: Add run-created and agent-start reporting**

In `runWorkflow`, after `createRun`, report:

```js
debugReporter?.report("run-created", {
  runDirectory: run.runDirectory,
  runId: run.runId,
});
```

In `executeAgent`, include the configured tier from `agent.model`:

```js
debugReporter?.report("agent-start", {
  agent: agentId,
  model: route.model,
  provider: route.provider,
  reasoningEffort: route.reasoningEffort,
  runner: route.runner,
  taskFile: agentId === "producer" ? taskFile : undefined,
  tier: agent.model,
});
```

Pass `debugReporter` into `executeAgent`.

- [ ] **Step 4: Add agent-end, policy, failure, and completion reporting**

In `executeAgent`, after provider result validation and before return, report only references:

```js
debugReporter?.report("agent-end", {
  agent: agentId,
  model: route.model,
  provider: route.provider,
  runner: route.runner,
  runnerReference: providerResult.runnerReference,
  sessionReference: providerResult.sessionReference,
  tier: agent.model,
});
```

After policy decision:

```js
debugReporter?.report("policy-decision", { decision: policyResult.decision });
```

Before successful return:

```js
debugReporter?.report("completion", { status: "succeeded" });
```

Before controlled policy failure return:

```js
debugReporter?.report("completion", { status: "failed" });
```

In runtime catch with a run:

```js
debugReporter?.report("failure", {
  reason: error.message,
  status: "failed",
});
```

Avoid adding full prompt/schema/stdout/stderr to debug fields.

- [ ] **Step 5: Run GREEN**

Run: `./scripts/run_silent.sh "lifecycle-debug-green" node --test regentara/tests/orchestrator-sequence.test.js regentara/tests/failure-policy.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add regentara/src/orchestrator.js regentara/tests/orchestrator-sequence.test.js regentara/tests/failure-policy.test.js && git commit -m "report regentara debug lifecycle"`

## Chunk 5: Final Verification and Closeout

### Task 5: Verify full scope, update docs, archive plan

**Files:**
- Modify: `regentara/README.md` if user-facing CLI docs need a short `--debug` mention.
- Modify: `regentara/docs/log.md`
- Move: `regentara/docs/plans/cli-debug-mode-implementation.md` to `regentara/docs/plans/implemented/cli-debug-mode-implementation.md`

- [ ] **Step 1: Run Regentara targeted tests**

Run: `./scripts/run_silent.sh "regentara-tests" node --test regentara/tests/*.test.js`

Expected: PASS.

- [ ] **Step 2: Run full repo tests**

Run: `./scripts/run_silent.sh "tests" npm test`

Expected: PASS.

- [ ] **Step 3: Run build/typecheck**

Run: `./scripts/run_silent.sh "build" npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Run a fake-provider debug smoke if practical**

If the local demo supports passing `--debug`, run the closest equivalent. If not, use the CLI tests as the executable smoke and note that the local demo does not expose the flag yet.

- [ ] **Step 5: Update log and README**

Add a concise entry to `regentara/docs/log.md` describing the debug mode implementation.

If README coverage is missing, add a short CLI example:

```bash
node regentara/src/index.js --debug --task-file tasks/example.md
```

Do not document trace mode or watch as implemented.

- [ ] **Step 6: Archive this plan**

Move this file:

```text
regentara/docs/plans/cli-debug-mode-implementation.md
```

to:

```text
regentara/docs/plans/implemented/cli-debug-mode-implementation.md
```

- [ ] **Step 7: Final verification after docs/archive**

Run: `git diff --check`

Expected: PASS.

Run: `./scripts/run_silent.sh "tests" npm test`

Expected: PASS.

Run: `./scripts/run_silent.sh "build" npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 8: Final commit**

Run: `git add regentara/README.md regentara/docs/log.md regentara/docs/plans/implemented/cli-debug-mode-implementation.md && git commit -m "document regentara debug mode"`

If README was not changed, omit it from `git add`.

## Handoff Notes

- Do not implement trace mode.
- Do not implement `regentara watch`.
- Do not print full prompts, schemas, stdout, stderr, environment variables, credentials, auth state, or secrets.
- Do not parse `events.jsonl` to produce debug output.
- Keep `events.jsonl` and run metadata schemas unchanged.
- Keep commits small and in the task order above.
