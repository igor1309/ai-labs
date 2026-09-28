import assert from "node:assert/strict";
import { test } from "node:test";

import { withLogging } from "../src/logged-runtime.js";
import { jsonlLogger, withLogContext, type LogFields } from "../src/logging.js";
import type { RuntimeAdapter, RuntimeEvent, TurnResult } from "../src/runtime.js";

function recorder(minLevel: "debug" | "info" = "debug") {
  const lines: LogFields[] = [];
  const logger = jsonlLogger((line) => lines.push(JSON.parse(line)), { minLevel, now: () => new Date(0) });
  return { lines, logger };
}

function stubAdapter(behaviour: (emit: (event: RuntimeEvent) => void) => Promise<TurnResult>): RuntimeAdapter {
  return {
    runtime: "stub",
    capabilities: { presetSessionId: true, toolSurface: false },
    runTurn: (_request, observer) => behaviour((event) => observer.event(event)),
    resumeHint: (id) => `stub resume ${id}`,
  };
}

const request = { prompt: "secret prompt text", cwd: "/w", policy: { workspace: "read-only" as const, isolateConfig: true, timeoutMs: 5 } };

test("decorator is transparent: same identity, capabilities, events and result", async () => {
  const { logger } = recorder();
  const inner = stubAdapter(async (emit) => {
    emit({ source: "protocol", kind: "TOOL_REQUESTED" });
    return { outcome: "completed", providerSessionId: "p1" };
  });
  const logged = withLogging(inner, logger);
  assert.equal(logged.runtime, "stub");
  assert.equal(logged.capabilities, inner.capabilities);
  assert.equal(logged.resumeHint("x"), "stub resume x");

  const seen: string[] = [];
  const raw: string[] = [];
  const result = await logged.runTurn(request, { event: (event) => seen.push(event.kind), raw: (line) => raw.push(line) });
  assert.deepEqual(result, { outcome: "completed", providerSessionId: "p1" });
  assert.deepEqual(seen, ["TOOL_REQUESTED"]);
});

test("logs start, events and finish, correlated by the ambient log context", async () => {
  const { lines, logger } = recorder();
  let tick = 100;
  const logged = withLogging(
    stubAdapter(async (emit) => {
      emit({ source: "protocol", kind: "PROVIDER_ERROR", data: { message: "Reconnecting" } });
      emit({ source: "protocol", kind: "TOOL_REQUESTED" });
      emit({ source: "protocol", kind: "TOOL_REQUESTED" });
      return { outcome: "failed", reason: "exit_code_1" };
    }),
    logger,
    () => (tick += 250),
  );

  await withLogContext({ runId: "run-1" }, () => logged.runTurn(request, { event: () => {} }));

  assert.deepEqual(lines.map((line) => [line["level"], line["message"]]), [
    ["info", "turn.started"],
    ["warn", "turn.event"],
    ["debug", "turn.event"],
    ["debug", "turn.event"],
    ["warn", "turn.finished"],
  ]);
  assert.ok(lines.every((line) => line["runId"] === "run-1" && line["runtime"] === "stub"));
  assert.equal(lines[0]!["promptChars"], request.prompt.length);
  assert.ok(!JSON.stringify(lines).includes("secret prompt text"), "prompts are not logged");
  assert.deepEqual(lines[1]!["data"], { message: "Reconnecting" });
  assert.deepEqual(lines[4]!["events"], { PROVIDER_ERROR: 1, TOOL_REQUESTED: 2 });
  assert.equal(lines[4]!["wallMs"], 250);
});

test("a crashing adapter is logged and the error is rethrown unchanged", async () => {
  const { lines, logger } = recorder("info");
  const boom = new Error("boom");
  const logged = withLogging(stubAdapter(async () => { throw boom; }), logger);
  await assert.rejects(logged.runTurn(request, { event: () => {} }), (error) => error === boom);
  assert.deepEqual(lines.map((line) => line["message"]), ["turn.started", "turn.crashed"]);
  assert.match(String(lines[1]!["error"]), /boom/);
});

test("log level threshold and a failing sink never break the caller", () => {
  const { lines, logger } = recorder("info");
  logger.log("debug", "hidden");
  logger.log("error", "shown");
  assert.deepEqual(lines.map((line) => line["message"]), ["shown"]);

  const broken = jsonlLogger(() => { throw new Error("disk full"); });
  assert.doesNotThrow(() => broken.log("error", "x"));
});

test("nested log contexts merge", async () => {
  const { lines, logger } = recorder();
  await withLogContext({ runId: "r" }, () => withLogContext({ step: "s" }, async () => logger.log("info", "m")));
  assert.equal(lines[0]!["runId"], "r");
  assert.equal(lines[0]!["step"], "s");
});
