import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";

function stubLogger() {
  return { info() {}, warn() {}, error() {} };
}

function stubDb() {
  return { close() {}, prepare() { return { get() {} }; } };
}

test("GET /health returns 200 with status ok", async () => {
  const app = createApp({ logger: stubLogger(), db: stubDb() });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { status: "ok" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /health includes version when provided", async () => {
  const app = createApp({ logger: stubLogger(), db: stubDb(), version: "1.2.3" });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { status: "ok", version: "1.2.3" });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /unknown returns 404", async () => {
  const app = createApp({ logger: stubLogger(), db: stubDb() });
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/unknown`);
    assert.equal(res.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
