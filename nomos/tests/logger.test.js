import assert from "node:assert/strict";
import test from "node:test";
import { createLogger } from "../src/logger.js";

function captureStdout(fn) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { chunks.push(chunk); return true; };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join("");
}

test("logger.info writes JSON line with level, msg, ts, and data", () => {
  const logger = createLogger();
  const output = captureStdout(() => logger.info("startup", { port: 8080 }));

  const entry = JSON.parse(output.trim());
  assert.equal(entry.level, "info");
  assert.equal(entry.msg, "startup");
  assert.equal(entry.port, 8080);
  assert.ok(entry.ts);
  // ts is ISO 8601
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(entry.ts));
});

test("logger.warn and logger.error set correct levels", () => {
  const logger = createLogger();

  const warnOut = captureStdout(() => logger.warn("slow"));
  assert.equal(JSON.parse(warnOut.trim()).level, "warn");

  const errorOut = captureStdout(() => logger.error("fail"));
  assert.equal(JSON.parse(errorOut.trim()).level, "error");
});

test("logger with no data argument does not throw", () => {
  const logger = createLogger();
  const output = captureStdout(() => logger.info("bare"));

  const entry = JSON.parse(output.trim());
  assert.equal(entry.level, "info");
  assert.equal(entry.msg, "bare");
});
