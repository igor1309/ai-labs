import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createStubRunner } from "../src/stub-runner.js";
import { stubLogger, setupTestDb, insertProject, listen, fakeRunner, cleanupTestDb } from "./helpers.js";

const fixturesDir = join(import.meta.dirname, "fixtures");

// --- runner dispatch ---

test("POST /v1/chat/completions dispatches to liveRunner", async () => {
  const { db, tmp } = setupTestDb();

  try {
    insertProject(db, { id: "p1", name: "live-proj", token: "tok-live", scope: "live" });
    const liveResponse = { id: "live-1", model: "gpt-4", choices: [{ message: { content: "from live" } }] };
    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      liveRunner: fakeRunner(liveResponse),
      stubEnabled: false,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tok-live",
        },
        body: JSON.stringify({ model: "gpt-4", messages: [{ role: "user", content: "hi" }] }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.id, "live-1");
      assert.equal(body.choices[0].message.content, "from live");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("POST /stub/v1/chat/completions dispatches to stubRunner when enabled", async () => {
  const { db, tmp } = setupTestDb();

  try {
    insertProject(db, { id: "s1", name: "stub-proj", token: "tok-stub", scope: "stub" });
    const stubRunner = createStubRunner({ fixturesDir });
    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      stubRunner,
      stubEnabled: true,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/stub/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tok-stub",
        },
        body: JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hi" }] }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.id, "stub-1");
      assert.equal(body.model, "test-model");
      assert.equal(body.choices[0].message.content, "Hello from stub");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

// --- stub gate ---

test("stub routes return 404 when NOMOS_STUB_ENABLED is false", async () => {
  const { db, tmp } = setupTestDb();

  try {
    insertProject(db, { id: "s1", name: "stub-proj", token: "tok-stub", scope: "stub" });
    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      stubEnabled: false,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/stub/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tok-stub",
        },
        body: JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hi" }] }),
      });
      assert.equal(res.status, 404);
      const body = await res.json();
      assert.equal(body.error, "not found");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("stub routes return 404 for any /stub/* path when disabled", async () => {
  const { db, tmp } = setupTestDb();

  try {
    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      stubEnabled: false,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/stub/anything`);
      assert.equal(res.status, 404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

// --- auth enforcement on chat completions ---

test("POST /v1/chat/completions requires auth", async () => {
  const { db, tmp } = setupTestDb();

  try {
    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      liveRunner: fakeRunner({ id: "r1" }),
      stubEnabled: false,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4", messages: [{ role: "user", content: "hi" }] }),
      });
      assert.equal(res.status, 401);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

// --- SSE streaming through app ---

test("POST /stub/v1/chat/completions streams SSE when stream=true", async () => {
  const { db, tmp } = setupTestDb();

  try {
    insertProject(db, { id: "s1", name: "stub-proj", token: "tok-stub", scope: "stub" });
    const stubRunner = createStubRunner({ fixturesDir });
    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      stubRunner,
      stubEnabled: true,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/stub/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tok-stub",
        },
        body: JSON.stringify({
          model: "test-model",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "text/event-stream");

      const text = await res.text();
      const dataLines = text.split("\n").filter((l) => l.startsWith("data: "));
      // 5 chunks + 1 [DONE] = 6 data lines
      assert.equal(dataLines.length, 6);
      assert.equal(dataLines[dataLines.length - 1], "data: [DONE]");

      // verify content chunks
      const chunk2 = JSON.parse(dataLines[1].slice(6));
      assert.equal(chunk2.choices[0].delta.content, "Hello");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

// --- error handler ---

test("malformed JSON body returns 400 through real app error handler", async () => {
  const { db, tmp } = setupTestDb();

  try {
    insertProject(db, { id: "p1", name: "proj", token: "tok-p1", scope: "live" });
    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      liveRunner: fakeRunner({ id: "r1" }),
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tok-p1",
        },
        body: "not valid json{{{",
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

// --- health remains unaffected ---

test("GET /health still works with new routing", async () => {
  const { db, tmp } = setupTestDb();

  try {
    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      stubEnabled: false,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, { status: "ok" });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});
