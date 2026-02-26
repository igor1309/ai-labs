import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createChatCompletionsHandler } from "../src/chat-completions.js";

function stubLogger() {
  const entries = [];
  return {
    info(msg, data = {}) { entries.push({ level: "info", msg, ...data }); },
    warn(msg, data = {}) { entries.push({ level: "warn", msg, ...data }); },
    error(msg, data = {}) { entries.push({ level: "error", msg, ...data }); },
    entries,
  };
}

function createTestApp(runner) {
  const app = express();
  app.use(express.json());
  const logger = stubLogger();
  app.post("/v1/chat/completions", createChatCompletionsHandler({ runner, logger }));
  return { app, logger };
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

// --- request validation ---

test("missing model returns 400", async () => {
  const { app } = createTestApp({ execute() {} });
  const server = await listen(app);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.type, "invalid_request_error");
    assert.ok(body.error.message.includes("model"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("missing messages returns 400", async () => {
  const { app } = createTestApp({ execute() {} });
  const server = await listen(app);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.type, "invalid_request_error");
    assert.ok(body.error.message.includes("messages"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("non-array messages returns 400", async () => {
  const { app } = createTestApp({ execute() {} });
  const server = await listen(app);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4", messages: "not-an-array" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.type, "invalid_request_error");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// --- non-streaming ---

test("non-streaming returns JSON response from runner", async () => {
  const fixture = {
    id: "resp-1",
    object: "chat.completion",
    model: "test-model",
    choices: [{ index: 0, message: { role: "assistant", content: "hello" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
  };
  const runner = { async execute() { return fixture; } };
  const { app } = createTestApp(runner);
  const server = await listen(app);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
    const body = await res.json();
    assert.deepEqual(body, fixture);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("non-streaming runner error returns 502", async () => {
  const runner = { async execute() { throw new Error("vendor timeout"); } };
  const { app } = createTestApp(runner);
  const server = await listen(app);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hi" }] }),
    });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error.type, "upstream_error");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("non-streaming passes extra params to runner", async () => {
  let receivedRequest;
  const runner = {
    async execute(req) {
      receivedRequest = req;
      return { id: "r1", choices: [] };
    },
  };
  const { app } = createTestApp(runner);
  const server = await listen(app);

  try {
    const { port } = server.address();
    await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: "hi" }],
        temperature: 0.7,
        max_tokens: 100,
      }),
    });
    assert.equal(receivedRequest.model, "gpt-4");
    assert.deepEqual(receivedRequest.messages, [{ role: "user", content: "hi" }]);
    assert.equal(receivedRequest.temperature, 0.7);
    assert.equal(receivedRequest.max_tokens, 100);
    assert.equal(receivedRequest.stream, undefined);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// --- streaming ---

test("streaming returns text/event-stream content type", async () => {
  const runner = {
    async *executeStream() {
      yield { type: "end" };
    },
  };
  const { app } = createTestApp(runner);
  const server = await listen(app);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "test-model",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/event-stream");
    assert.equal(res.headers.get("cache-control"), "no-cache");
    await res.text(); // consume body
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("streaming SSE frames chunks correctly", async () => {
  const chunks = [
    { type: "chunk", data: { id: "c1", choices: [{ delta: { role: "assistant" } }] } },
    { type: "chunk", data: { id: "c1", choices: [{ delta: { content: "Hello" } }] } },
    { type: "end" },
  ];
  const runner = {
    async *executeStream() {
      for (const c of chunks) yield c;
    },
  };
  const { app } = createTestApp(runner);
  const server = await listen(app);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "test-model",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    });
    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.startsWith("data: "));
    assert.equal(lines.length, 3);
    assert.deepEqual(JSON.parse(lines[0].slice(6)), chunks[0].data);
    assert.deepEqual(JSON.parse(lines[1].slice(6)), chunks[1].data);
    assert.equal(lines[2], "data: [DONE]");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("streaming forwards error events", async () => {
  const runner = {
    async *executeStream() {
      yield { type: "chunk", data: { id: "c1", choices: [{ delta: { content: "partial" } }] } };
      yield { type: "error", data: { message: "provider error", code: "server_error" } };
    },
  };
  const { app } = createTestApp(runner);
  const server = await listen(app);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "test-model",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    });
    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.startsWith("data: "));
    assert.equal(lines.length, 2);
    const errLine = JSON.parse(lines[1].slice(6));
    assert.equal(errLine.error.message, "provider error");
    assert.equal(errLine.error.code, "server_error");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("streaming runner throw sends error then DONE", async () => {
  const runner = {
    async *executeStream() {
      yield { type: "chunk", data: { id: "c1", choices: [{ delta: { content: "ok" } }] } };
      throw new Error("stream exploded");
    },
  };
  const { app } = createTestApp(runner);
  const server = await listen(app);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "test-model",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    });
    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.startsWith("data: "));
    assert.equal(lines.length, 3);
    // first: chunk
    assert.deepEqual(JSON.parse(lines[0].slice(6)).choices[0].delta.content, "ok");
    // second: error
    const errLine = JSON.parse(lines[1].slice(6));
    assert.equal(errLine.error.type, "upstream_error");
    // third: DONE
    assert.equal(lines[2], "data: [DONE]");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("empty body returns 400", async () => {
  const { app } = createTestApp({ execute() {} });
  const server = await listen(app);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
