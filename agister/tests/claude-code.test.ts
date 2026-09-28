import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  claudeArguments,
  claudeCodeAdapter,
  createStreamState,
  reconcileTurn,
  reduceStreamLine,
  type ProcessEvidence,
} from "../src/claude-code.js";
import type { RuntimeEvent, TurnRequest } from "../src/runtime.js";

const FAKE_CLAUDE = fileURLToPath(new URL("./fixtures/fake-claude.mjs", import.meta.url));
const SESSION = "5145d89d-470e-4b56-a78c-da035d5de49b";

function request(overrides: Partial<TurnRequest> = {}): TurnRequest {
  return {
    prompt: "hello",
    cwd: process.cwd(),
    sessionId: SESSION,
    policy: { tools: ["Read", "Grep"], allowedTools: ["Read", "Bash(git diff:*)"], restricted: true, timeoutMs: 10_000 },
    ...overrides,
  };
}

const evidence = (overrides: Partial<ProcessEvidence> = {}): ProcessEvidence => ({
  timedOut: false,
  aborted: false,
  schemaRequested: false,
  exit: { code: 0, signal: null },
  ...overrides,
});

test("builds headless arguments without a positional prompt", () => {
  const args = claudeArguments(request({ model: "sonnet", effort: "high", outputSchema: { type: "object" } }));
  assert.deepEqual(args.slice(0, 9), [
    "-p", "--output-format", "stream-json", "--verbose", "--session-id", SESSION, "--permission-mode", "dontAsk", "--tools=Read,Grep",
  ]);
  assert.ok(args.includes("--allowedTools=Read,Bash(git diff:*)"));
  assert.ok(args.includes("--restricted") && args.includes("--strict-mcp-config"));
  assert.deepEqual(args.slice(args.indexOf("--model"), args.indexOf("--model") + 2), ["--model", "sonnet"]);
  assert.deepEqual(args.slice(args.indexOf("--effort"), args.indexOf("--effort") + 2), ["--effort", "high"]);
  assert.equal(args[args.indexOf("--json-schema") + 1], '{"type":"object"}');
  assert.ok(!args.includes("hello"));
});

test("an empty tool list disables every tool", () => {
  const args = claudeArguments(request({ policy: { tools: [], allowedTools: [], restricted: false, timeoutMs: 1 } }));
  assert.ok(args.includes("--tools="));
  assert.ok(!args.some((arg) => arg.startsWith("--allowedTools")));
  assert.ok(!args.includes("--restricted"));
});

test("reduces the stream-json protocol into normalized events", () => {
  const state = createStreamState(SESSION);
  const lines = [
    { type: "system", subtype: "init", session_id: SESSION, model: "claude-haiku-4-5", permissionMode: "dontAsk", tools: ["Read"], cwd: "/w" },
    { type: "stream_event", event: { type: "message_start" }, session_id: SESSION },
    { type: "assistant", message: { content: [{ type: "thinking", thinking: "" }, { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/etc/hostname" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "vm", is_error: false }] } },
    { type: "assistant", message: { content: [{ type: "text", text: "The hostname is vm." }] } },
    { type: "rate_limit_event", rate_limit_info: { status: "allowed" } },
    { type: "result", subtype: "success", is_error: false, session_id: SESSION, num_turns: 2, total_cost_usd: 0.06, duration_ms: 4600, permission_denials: [], structured_output: { answer: "vm" } },
  ];
  const events = lines.flatMap((line) => reduceStreamLine(state, JSON.stringify(line)));

  assert.deepEqual(events.map((event) => event.kind), [
    "PROVIDER_SESSION_BOUND", "TOOL_REQUESTED", "TOOL_RESULT", "ASSISTANT_TEXT", "TURN_COMPLETED",
  ]);
  assert.equal(state.providerSessionId, SESSION);
  assert.equal(events[1]!.data!["name"], "Read");

  const result = reconcileTurn(state, evidence({ schemaRequested: true }));
  assert.equal(result.outcome, "completed");
  assert.deepEqual(result.structuredOutput, { answer: "vm" });
  assert.equal(result.text, "The hostname is vm.");
  assert.equal(result.costUsd, 0.06);
});

test("flags a provider session ID that differs from the requested one", () => {
  const state = createStreamState(SESSION);
  const events = reduceStreamLine(state, JSON.stringify({ type: "system", subtype: "init", session_id: "other" }));
  assert.deepEqual(events.map((event) => event.kind), ["PROVIDER_SESSION_BOUND", "SESSION_ID_MISMATCH"]);
  assert.equal(state.providerSessionId, "other");
});

test("tolerates garbage lines", () => {
  const state = createStreamState(SESSION);
  assert.deepEqual(reduceStreamLine(state, "{broken").map((event) => event.kind), ["STREAM_PARSE_ERROR"]);
  assert.deepEqual(reduceStreamLine(state, "null"), []);
  assert.deepEqual(reduceStreamLine(state, "   "), []);
});

test("outcome precedence: provider result first, then Agister's own evidence, then the exit", () => {
  const withResult = (result: Record<string, unknown>) => {
    const state = createStreamState(SESSION);
    reduceStreamLine(state, JSON.stringify({ type: "result", session_id: SESSION, ...result }));
    return state;
  };

  // A provider error stays a failure even though the process exits 0.
  const failed = reconcileTurn(withResult({ subtype: "error_max_turns", is_error: true, errors: ["too many"] }), evidence());
  assert.equal(failed.outcome, "failed");
  assert.equal(failed.reason, "provider_error_max_turns: too many");

  // success + is_error is still an error.
  assert.equal(reconcileTurn(withResult({ subtype: "success", is_error: true }), evidence()).outcome, "failed");

  // A requested schema without structured output is not a completed turn.
  const missing = reconcileTurn(withResult({ subtype: "success", is_error: false }), evidence({ schemaRequested: true }));
  assert.deepEqual([missing.outcome, missing.reason], ["failed", "missing_structured_output"]);

  // A result that arrived before a timeout still decides the turn.
  assert.equal(reconcileTurn(withResult({ subtype: "success", is_error: false }), evidence({ timedOut: true })).outcome, "completed");

  const empty = createStreamState(SESSION);
  assert.deepEqual(pickOutcome(reconcileTurn(empty, evidence({ timedOut: true, exit: { code: null, signal: "SIGTERM" } }))), ["interrupted", "timeout"]);
  assert.deepEqual(pickOutcome(reconcileTurn(empty, evidence({ aborted: true }))), ["interrupted", "aborted"]);
  assert.deepEqual(pickOutcome(reconcileTurn(empty, evidence({ exit: { code: 3, signal: null } }))), ["failed", "exit_code_3"]);
  assert.deepEqual(pickOutcome(reconcileTurn(empty, evidence({ exit: { code: null, signal: "SIGKILL" } }))), ["lost", "killed_by_SIGKILL"]);
  assert.deepEqual(pickOutcome(reconcileTurn(empty, evidence())), ["lost", "exited_without_result"]);
  assert.deepEqual(pickOutcome(reconcileTurn(empty, { ...evidence(), exit: undefined as never, spawnError: "ENOENT" })), ["failed", "spawn_failed: ENOENT"]);
});

function pickOutcome(result: { outcome: string; reason?: string }): [string, string | undefined] {
  return [result.outcome, result.reason];
}

async function runFake(prompt: string, overrides: Partial<TurnRequest> = {}, command = FAKE_CLAUDE) {
  const events: RuntimeEvent[] = [];
  const raw: string[] = [];
  const adapter = claudeCodeAdapter({ command, killGraceMs: 200 });
  const result = await adapter.runTurn(request({ prompt, ...overrides }), {
    event: (event) => events.push(event),
    raw: (line) => raw.push(line),
  });
  return { result, events, raw };
}

test("adapter: supervises a real subprocess to a completed turn", async () => {
  const { result, events, raw } = await runFake("SCENARIO:approve", { outputSchema: { type: "object" } });
  assert.equal(result.outcome, "completed");
  assert.equal(result.providerSessionId, SESSION);
  assert.deepEqual((result.structuredOutput as { verdict: string }).verdict, "approve");
  assert.equal(result.permissionDenials?.length, 1);
  assert.equal(events[0]!.kind, "PROCESS_STARTED");
  assert.equal(events.at(-1)!.kind, "PROCESS_EXITED");
  assert.ok(events.some((event) => event.kind === "STREAM_PARSE_ERROR"));
  assert.ok(raw.length >= 6);
});

test("adapter: provider error result with exit 0 is failed", async () => {
  const { result } = await runFake("SCENARIO:error_result");
  assert.equal(result.outcome, "failed");
  assert.match(result.reason!, /provider_error_during_execution: tool crashed/);
});

test("adapter: non-zero exit without a result is failed and keeps stderr", async () => {
  const { result } = await runFake("SCENARIO:exit_nonzero");
  assert.deepEqual([result.outcome, result.reason], ["failed", "exit_code_3"]);
  assert.match(result.stderrTail!, /provider exploded/);
});

test("adapter: clean exit without a result is lost", async () => {
  const { result } = await runFake("SCENARIO:no_result");
  assert.deepEqual([result.outcome, result.reason], ["lost", "exited_without_result"]);
});

test("adapter: timeout terminates the process group and reports interrupted", async () => {
  const started = Date.now();
  const { result, events } = await runFake("SCENARIO:hang", {
    policy: { tools: [], allowedTools: [], restricted: false, timeoutMs: 300 },
  });
  assert.deepEqual([result.outcome, result.reason], ["interrupted", "timeout"]);
  assert.ok(events.some((event) => event.kind === "TIMEOUT"));
  assert.ok(Date.now() - started < 5_000);
});

test("adapter: abort signal interrupts the turn", async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 200);
  const { result } = await runFake("SCENARIO:hang", { signal: controller.signal });
  assert.deepEqual([result.outcome, result.reason], ["interrupted", "aborted"]);
});

test("adapter: a missing runtime binary is a failed turn, not a crash", async () => {
  const { result, events } = await runFake("x", {}, "/nonexistent/claude");
  assert.equal(result.outcome, "failed");
  assert.match(result.reason!, /^spawn_failed: /);
  assert.ok(events.some((event) => event.kind === "SPAWN_FAILED"));
});
