import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createLiveRunner } from "../src/live-runner.js";

function fakeVendor(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, () => resolve(server));
  });
}

// --- execute (non-streaming) ---

test("execute sends POST to vendor and returns JSON response", async () => {
  let receivedBody;
  const server = await fakeVendor((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "r1", choices: [{ message: { content: "hi" } }] }));
    });
  });

  try {
    const { port } = server.address();
    const runner = createLiveRunner({
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 5000,
    });

    const response = await runner.execute({
      model: "gpt-4",
      messages: [{ role: "user", content: "hello" }],
    });

    assert.equal(response.id, "r1");
    assert.equal(response.choices[0].message.content, "hi");
    assert.equal(receivedBody.model, "gpt-4");
    assert.equal(receivedBody.stream, false);
    assert.deepEqual(receivedBody.messages, [{ role: "user", content: "hello" }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("execute sends custom headers", async () => {
  let receivedHeaders;
  const server = await fakeVendor((req, res) => {
    receivedHeaders = req.headers;
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "r1" }));
    });
  });

  try {
    const { port } = server.address();
    const runner = createLiveRunner({
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 5000,
      headers: { Authorization: "Bearer sk-test-key", "X-Custom": "value" },
    });

    await runner.execute({ model: "gpt-4", messages: [] });
    assert.equal(receivedHeaders.authorization, "Bearer sk-test-key");
    assert.equal(receivedHeaders["x-custom"], "value");
    assert.equal(receivedHeaders["content-type"], "application/json");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("execute throws on non-OK response", async () => {
  const server = await fakeVendor((_req, res) => {
    let body = "";
    _req.on("data", (d) => (body += d));
    _req.on("end", () => {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "rate limit exceeded" } }));
    });
  });

  try {
    const { port } = server.address();
    const runner = createLiveRunner({
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 5000,
    });

    await assert.rejects(
      () => runner.execute({ model: "gpt-4", messages: [] }),
      (err) => err.message === "rate limit exceeded"
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("execute throws on non-JSON error response", async () => {
  const server = await fakeVendor((_req, res) => {
    let body = "";
    _req.on("data", (d) => (body += d));
    _req.on("end", () => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    });
  });

  try {
    const { port } = server.address();
    const runner = createLiveRunner({
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 5000,
    });

    await assert.rejects(
      () => runner.execute({ model: "gpt-4", messages: [] }),
      (err) => err.message === "upstream 500"
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("execute sends to /chat/completions path", async () => {
  let receivedUrl;
  const server = await fakeVendor((req, res) => {
    receivedUrl = req.url;
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "r1" }));
    });
  });

  try {
    const { port } = server.address();
    const runner = createLiveRunner({
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 5000,
    });

    await runner.execute({ model: "gpt-4", messages: [] });
    assert.equal(receivedUrl, "/chat/completions");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// --- executeStream ---

test("executeStream yields chunk events from SSE", async () => {
  const server = await fakeVendor((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ id: "c1", choices: [{ delta: { role: "assistant" } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ id: "c1", choices: [{ delta: { content: "Hello" } }] })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });

  try {
    const { port } = server.address();
    const runner = createLiveRunner({
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 5000,
    });

    const events = [];
    for await (const event of runner.executeStream({ model: "gpt-4", messages: [] })) {
      events.push(event);
    }

    assert.equal(events.length, 3);
    assert.equal(events[0].type, "chunk");
    assert.equal(events[0].data.choices[0].delta.role, "assistant");
    assert.equal(events[1].type, "chunk");
    assert.equal(events[1].data.choices[0].delta.content, "Hello");
    assert.equal(events[2].type, "end");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("executeStream sends stream: true in body", async () => {
  let receivedBody;
  const server = await fakeVendor((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });

  try {
    const { port } = server.address();
    const runner = createLiveRunner({
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 5000,
    });

    for await (const _ of runner.executeStream({ model: "gpt-4", messages: [] })) {
      // consume
    }

    assert.equal(receivedBody.stream, true);
    assert.equal(receivedBody.model, "gpt-4");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("executeStream yields error event on non-OK response", async () => {
  const server = await fakeVendor((_req, res) => {
    let body = "";
    _req.on("data", (d) => (body += d));
    _req.on("end", () => {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "invalid api key" } }));
    });
  });

  try {
    const { port } = server.address();
    const runner = createLiveRunner({
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 5000,
    });

    const events = [];
    for await (const event of runner.executeStream({ model: "gpt-4", messages: [] })) {
      events.push(event);
    }

    assert.equal(events.length, 1);
    assert.equal(events[0].type, "error");
    assert.equal(events[0].data.message, "invalid api key");
    assert.equal(events[0].data.code, "401");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("executeStream yields end on stream without [DONE]", async () => {
  const server = await fakeVendor((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ id: "c1", choices: [{ delta: { content: "hi" } }] })}\n\n`);
      // end without [DONE]
      res.end();
    });
  });

  try {
    const { port } = server.address();
    const runner = createLiveRunner({
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 5000,
    });

    const events = [];
    for await (const event of runner.executeStream({ model: "gpt-4", messages: [] })) {
      events.push(event);
    }

    assert.equal(events.length, 2);
    assert.equal(events[0].type, "chunk");
    assert.equal(events[1].type, "end");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
