import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { codexAdapter, codexArguments, codexPrompt, createCodexStreamState, reconcileCodexTurn, reduceCodexLine } from "../src/codex.js";
import type { ProcessEvidence } from "../src/process-supervisor.js";
import type { RuntimeEvent, TurnRequest } from "../src/runtime.js";

const FAKE_CODEX = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
const THREAD = "01a0e850-b808-71c2-8401-53ba16d8ae18";

function request(overrides: Partial<TurnRequest> = {}): TurnRequest {
  return {
    prompt: "hello",
    cwd: process.cwd(),
    policy: { workspace: "read-only", isolateConfig: true, timeoutMs: 10_000 },
    ...overrides,
  };
}

const cleanExit: ProcessEvidence = { timedOut: false, aborted: false, exit: { code: 0, signal: null } };

test("builds exec arguments: JSONL, OS sandbox from workspace policy, prompt on stdin", () => {
  const args = codexArguments(request({ model: "gpt-5.5", effort: "high" }), "/tmp/schema.json");
  assert.deepEqual(args, [
    "exec", "--json", "--skip-git-repo-check",
    "--sandbox", "read-only",
    "--config", 'approval_policy="never"',
    "--ignore-user-config", "--ignore-rules",
    "--model", "gpt-5.5",
    "--config", 'model_reasoning_effort="high"',
    "--output-schema", "/tmp/schema.json",
    "-",
  ]);
  const write = codexArguments(request({ policy: { workspace: "workspace-write", isolateConfig: false, timeoutMs: 1 } }));
  assert.deepEqual(write, ["exec", "--json", "--skip-git-repo-check", "--sandbox", "workspace-write", "--config", 'approval_policy="never"', "-"]);
});

test("rejects what Codex cannot honour instead of ignoring it", () => {
  assert.throws(() => codexArguments(request({ sessionId: "x" })), /cannot preset a session ID/);
  assert.throws(
    () => codexArguments(request({ policy: { workspace: "read-only", isolateConfig: true, timeoutMs: 1, tools: { expose: [], allow: [] } } })),
    /takes no tool surface/,
  );
});

test("process instructions are prepended to the prompt", () => {
  assert.equal(codexPrompt(request()), "hello");
  assert.equal(codexPrompt(request({ appendSystemPrompt: "Be strict." })), "<instructions>\nBe strict.\n</instructions>\n\nhello");
});

test("reduces JSONL thread events; error events are not terminal", () => {
  const state = createCodexStreamState();
  const lines = [
    { type: "thread.started", thread_id: THREAD },
    { type: "turn.started" },
    { type: "error", message: "Reconnecting... 2/5" },
    { type: "item.completed", item: { id: "item_0", type: "error", message: "Falling back to HTTPS" } },
    { type: "item.started", item: { id: "item_1", type: "command_execution", command: "ls", status: "in_progress" } },
    { type: "item.completed", item: { id: "item_1", type: "command_execution", command: "ls", exit_code: 2, status: "failed" } },
    { type: "item.completed", item: { id: "item_2", type: "reasoning", text: "…" } },
    { type: "item.completed", item: { id: "item_3", type: "agent_message", text: '{"answer":"vm"}' } },
  ];
  const events = lines.flatMap((line) => reduceCodexLine(state, JSON.stringify(line)));
  assert.deepEqual(events.map((event) => event.kind), [
    "PROVIDER_SESSION_BOUND", "TURN_STARTED", "PROVIDER_ERROR", "PROVIDER_ERROR", "TOOL_REQUESTED", "TOOL_RESULT", "ASSISTANT_TEXT",
  ]);
  assert.equal(events[5]!.data!["isError"], true);
  assert.equal(state.terminal, undefined);

  // Errors so far are evidence, not an outcome; a clean exit without a terminal event is lost.
  assert.deepEqual(pick(reconcileCodexTurn(state, cleanExit, true)), ["lost", "exited_without_result: Reconnecting... 2/5"]);

  reduceCodexLine(state, JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 2 } }));
  const result = reconcileCodexTurn(state, cleanExit, true);
  assert.equal(result.outcome, "completed");
  assert.equal(result.providerSessionId, THREAD);
  assert.deepEqual(result.structuredOutput, { answer: "vm" });
  assert.deepEqual(result.usage, { input_tokens: 10, output_tokens: 2 });
});

test("outcome: turn.failed wins over exit 0; bad structured output fails the turn", () => {
  const failed = createCodexStreamState();
  reduceCodexLine(failed, JSON.stringify({ type: "turn.failed", error: { message: "boom" } }));
  assert.deepEqual(pick(reconcileCodexTurn(failed, cleanExit, false)), ["failed", "provider_turn_failed: boom"]);

  const prose = createCodexStreamState();
  reduceCodexLine(prose, JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "not json" } }));
  reduceCodexLine(prose, JSON.stringify({ type: "turn.completed" }));
  assert.deepEqual(pick(reconcileCodexTurn(prose, cleanExit, true)), ["failed", "structured_output_not_json"]);
  assert.deepEqual(pick(reconcileCodexTurn(prose, cleanExit, false)), ["completed", undefined]);

  const silent = createCodexStreamState();
  reduceCodexLine(silent, JSON.stringify({ type: "turn.completed" }));
  assert.deepEqual(pick(reconcileCodexTurn(silent, cleanExit, true)), ["failed", "missing_structured_output"]);
});

function pick(result: { outcome: string; reason?: string }): [string, string | undefined] {
  return [result.outcome, result.reason];
}

async function runFake(prompt: string, overrides: Partial<TurnRequest> = {}) {
  const events: RuntimeEvent[] = [];
  const result = await codexAdapter({ command: FAKE_CODEX, killGraceMs: 200 }).runTurn(request({ prompt, ...overrides }), {
    event: (event) => events.push(event),
  });
  return { result, events };
}

test("adapter: completed turn with schema file written and cleaned up", async () => {
  let schemaPath: string | undefined;
  const events: RuntimeEvent[] = [];
  const result = await codexAdapter({ command: FAKE_CODEX }).runTurn(
    request({ prompt: "SCENARIO:request_changes", outputSchema: { type: "object" }, appendSystemPrompt: "Review." }),
    {
      event: (event) => events.push(event),
      raw: (line) => {
        const message = JSON.parse(line);
        if (message.type === "thread.started") {
          schemaPath = message.argv[message.argv.indexOf("--output-schema") + 1];
          assert.deepEqual(message.schema, { type: "object" });
          assert.match(message.prompt, /^<instructions>\nReview\.\n<\/instructions>/);
        }
      },
    },
  );
  assert.equal(result.outcome, "completed");
  assert.equal(result.providerSessionId, THREAD);
  assert.equal((result.structuredOutput as { verdict: string }).verdict, "request_changes");
  assert.ok(schemaPath && !existsSync(schemaPath));
  assert.equal(events.filter((event) => event.kind === "PROVIDER_ERROR").length, 2);
});

test("adapter: provider error followed by non-zero exit is failed with the last error", async () => {
  const { result } = await runFake("SCENARIO:exit_nonzero");
  assert.deepEqual(pick(result), ["failed", "exit_code_1: unexpected status 401 Unauthorized"]);
  assert.match(result.stderrTail!, /unauthorized/);
});

test("adapter: turn.failed, lost, timeout", async () => {
  assert.deepEqual(pick((await runFake("SCENARIO:turn_failed")).result), ["failed", "provider_turn_failed: context window exceeded"]);
  assert.deepEqual(pick((await runFake("SCENARIO:no_result")).result), ["lost", "exited_without_result"]);
  const hung = await runFake("SCENARIO:hang", { policy: { workspace: "read-only", isolateConfig: false, timeoutMs: 300 } });
  assert.deepEqual(pick(hung.result), ["interrupted", "timeout"]);
});

test("adapter: invalid policy fails without spawning", async () => {
  const { result, events } = await runFake("x", { sessionId: "preset" });
  assert.deepEqual(pick(result), ["failed", "invalid_policy: Codex cannot preset a session ID"]);
  assert.equal(events.length, 0);
});
