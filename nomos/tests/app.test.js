import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";

function stubLogger() {
  return { info() {}, warn() {}, error() {} };
}

function stubDb() {
  return { close() {}, prepare() { return { get() {} }; } };
}

function authenticatedDb() {
  return {
    close() {},
    prepare() {
      return {
        get() {
          return { id: 1, name: "test", scope: "live", active: 1 };
        },
      };
    },
  };
}

test("app starts and stops cleanly", async () => {
  const app = createApp({ logger: stubLogger(), db: stubDb() });
  const server = app.listen(0);

  const { port } = server.address();
  assert.ok(port > 0, "server should bind to a port");

  await new Promise((resolve) => server.close(resolve));
});

test("createApp returns an express app with listen method", () => {
  const app = createApp({ logger: stubLogger(), db: stubDb() });
  assert.equal(typeof app.listen, "function");
});

test("oversized JSON body returns Nomos body limit error", async () => {
  const app = createApp({
    logger: stubLogger(),
    db: authenticatedDb(),
    liveRunner: { execute() {} },
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "test-model",
        messages: [{ role: "user", content: "x".repeat(110 * 1024) }],
      }),
    });
    const body = await res.json();

    assert.equal(res.status, 413);
    assert.deepEqual(body, {
      error: "Nomos rejected request body before routing: request body exceeds JSON limit (current limit: 100kb).",
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("configured JSON body limit allows larger chat completion requests", async () => {
  const app = createApp({
    logger: stubLogger(),
    db: authenticatedDb(),
    jsonBodyLimit: "256kb",
    liveRunner: {
      async execute() {
        return {
          id: "resp-1",
          object: "chat.completion",
          choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        };
      },
    },
  });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "test-model",
        messages: [{ role: "user", content: "x".repeat(110 * 1024) }],
      }),
    });

    assert.equal(res.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
