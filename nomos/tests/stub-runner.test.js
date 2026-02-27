import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { createStubRunner } from "../src/stub-runner.js";

const fixturesDir = join(import.meta.dirname, "fixtures");

// --- execute (non-streaming) ---

test("execute returns fixture response for model", async () => {
  const runner = createStubRunner({ fixturesDir });
  const response = await runner.execute({ model: "test-model" });

  assert.equal(response.id, "stub-1");
  assert.equal(response.model, "test-model");
  assert.equal(response.choices.length, 1);
  assert.equal(response.choices[0].message.content, "Hello from stub");
  assert.equal(response.choices[0].finish_reason, "stop");
});

test("execute returns usage data from fixture", async () => {
  const runner = createStubRunner({ fixturesDir });
  const response = await runner.execute({ model: "test-model" });

  assert.deepEqual(response.usage, {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
  });
});

test("execute rejects for missing fixture", async () => {
  const runner = createStubRunner({ fixturesDir });

  await assert.rejects(
    () => runner.execute({ model: "nonexistent" }),
    (err) => err.code === "ENOENT"
  );
});

// --- executeStream (streaming) ---

test("executeStream yields events in fixture order", async () => {
  const runner = createStubRunner({ fixturesDir });
  const events = [];

  for await (const event of runner.executeStream({ model: "test-model" })) {
    events.push(event);
  }

  assert.equal(events.length, 6);
  assert.equal(events[0].type, "chunk");
  assert.equal(events[1].type, "chunk");
  assert.equal(events[2].type, "chunk");
  assert.equal(events[3].type, "chunk");
  assert.equal(events[4].type, "chunk");
  assert.equal(events[5].type, "end");
});

test("executeStream chunk data matches fixture content", async () => {
  const runner = createStubRunner({ fixturesDir });
  const events = [];

  for await (const event of runner.executeStream({ model: "test-model" })) {
    events.push(event);
  }

  // First chunk: role
  assert.equal(events[0].data.choices[0].delta.role, "assistant");
  // Content chunks
  assert.equal(events[1].data.choices[0].delta.content, "Hello");
  assert.equal(events[2].data.choices[0].delta.content, " from");
  assert.equal(events[3].data.choices[0].delta.content, " stub");
  // Final chunk: finish_reason
  assert.equal(events[4].data.choices[0].finish_reason, "stop");
});

test("executeStream terminates with end event", async () => {
  const runner = createStubRunner({ fixturesDir });
  let lastEvent;

  for await (const event of runner.executeStream({ model: "test-model" })) {
    lastEvent = event;
  }

  assert.equal(lastEvent.type, "end");
  assert.equal(lastEvent.data, undefined);
});

test("executeStream yields error event from error fixture", async () => {
  const runner = createStubRunner({ fixturesDir });
  const events = [];

  for await (const event of runner.executeStream({ model: "error-model" })) {
    events.push(event);
  }

  assert.equal(events.length, 2);
  assert.equal(events[0].type, "chunk");
  assert.equal(events[0].data.choices[0].delta.content, "partial");
  assert.equal(events[1].type, "error");
  assert.equal(events[1].data.message, "provider error");
  assert.equal(events[1].data.code, "server_error");
});

test("executeStream rejects for missing fixture", async () => {
  const runner = createStubRunner({ fixturesDir });

  await assert.rejects(async () => {
    // eslint-disable-next-line no-unused-vars
    for await (const _ of runner.executeStream({ model: "nonexistent" })) {
      // consume
    }
  }, (err) => err.code === "ENOENT");
});

// --- fixture loading ---

test("createStubRunner throws when fixturesDir is missing", () => {
  assert.throws(() => createStubRunner({}), { message: "fixturesDir is required" });
  assert.throws(() => createStubRunner(), { message: "fixturesDir is required" });
});

test("createStubRunner returns runner with execute methods", () => {
  const runner = createStubRunner({ fixturesDir });
  assert.equal(typeof runner.execute, "function");
  assert.equal(typeof runner.executeStream, "function");
});
