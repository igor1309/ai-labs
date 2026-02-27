import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { hashToken, redactToken, createAuthMiddleware } from "../src/auth.js";
import { stubLogger, setupTestDb, insertProject, listen, cleanupTestDb } from "./helpers.js";

// --- hashToken ---

test("hashToken returns expected SHA-256 hex digest", () => {
  const hash = hashToken("my-secret-token");
  assert.equal(hash, "ea5add57437cbf20af59034d7ed17968dcc56767b41965fcc5b376d45db8b4a3");
  assert.equal(hash.length, 64);
});

test("hashToken returns different hashes for different tokens", () => {
  assert.notEqual(hashToken("token-a"), hashToken("token-b"));
});

// --- redactToken ---

test("redactToken masks middle of long token", () => {
  const redacted = redactToken("abcdefghijklmnop");
  assert.equal(redacted, "abcd***mnop");
});

test("redactToken masks token at exactly 8 chars (boundary)", () => {
  assert.equal(redactToken("abcdefgh"), "abcd***efgh");
});

test("redactToken returns *** for short token", () => {
  assert.equal(redactToken("short"), "***");
  assert.equal(redactToken("1234567"), "***");
  assert.equal(redactToken(""), "***");
  assert.equal(redactToken(null), "***");
  assert.equal(redactToken(undefined), "***");
});

// --- createAuthMiddleware (integration with real SQLite) ---

function createTestApp(db, logger, allowedScope) {
  const app = express();
  const prefix = allowedScope === "stub" ? "/stub/v1" : "/v1";
  app.use(prefix, createAuthMiddleware({ db, logger, allowedScope }));
  app.get(`${prefix}/test`, (req, res) => {
    res.json({ ok: true, project: req.project });
  });
  return app;
}

test("valid token with correct scope passes through", async () => {
  const { db, tmp } = setupTestDb();

  try {
    insertProject(db, { id: "p1", name: "live-project", token: "tok-live-123", scope: "live" });
    const logger = stubLogger();
    const app = createTestApp(db, logger, "live");
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/test`, {
        headers: { Authorization: "Bearer tok-live-123" },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.project.id, "p1");
      assert.equal(body.project.name, "live-project");
      assert.equal(body.project.scope, "live");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("missing authorization header returns 401", async () => {
  const { db, tmp } = setupTestDb();

  try {
    const logger = stubLogger();
    const app = createTestApp(db, logger, "live");
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/test`);
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.error, "missing bearer token");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("invalid token returns 401", async () => {
  const { db, tmp } = setupTestDb();

  try {
    insertProject(db, { id: "p1", name: "proj", token: "real-token", scope: "live" });
    const logger = stubLogger();
    const app = createTestApp(db, logger, "live");
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/test`, {
        headers: { Authorization: "Bearer wrong-token" },
      });
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.error, "invalid token");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("inactive project returns 401", async () => {
  const { db, tmp } = setupTestDb();

  try {
    insertProject(db, { id: "p1", name: "proj", token: "tok-inactive", scope: "live", active: 0 });
    const logger = stubLogger();
    const app = createTestApp(db, logger, "live");
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/test`, {
        headers: { Authorization: "Bearer tok-inactive" },
      });
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.error, "project inactive");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("stub-scoped token on live path returns 403", async () => {
  const { db, tmp } = setupTestDb();

  try {
    insertProject(db, { id: "p1", name: "stub-proj", token: "tok-stub-only", scope: "stub" });
    const logger = stubLogger();
    const app = createTestApp(db, logger, "live");
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/test`, {
        headers: { Authorization: "Bearer tok-stub-only" },
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.error, "scope not allowed");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("live-scoped token on stub path returns 403", async () => {
  const { db, tmp } = setupTestDb();

  try {
    insertProject(db, { id: "p1", name: "live-proj", token: "tok-live-only", scope: "live" });
    const logger = stubLogger();
    const app = createTestApp(db, logger, "stub");
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/stub/v1/test`, {
        headers: { Authorization: "Bearer tok-live-only" },
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.error, "scope not allowed");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("valid stub token on stub path passes through", async () => {
  const { db, tmp } = setupTestDb();

  try {
    insertProject(db, { id: "s1", name: "stub-proj", token: "tok-stub-ok", scope: "stub" });
    const logger = stubLogger();
    const app = createTestApp(db, logger, "stub");
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/stub/v1/test`, {
        headers: { Authorization: "Bearer tok-stub-ok" },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
      assert.equal(body.project.id, "s1");
      assert.equal(body.project.scope, "stub");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("non-bearer authorization header returns 401", async () => {
  const { db, tmp } = setupTestDb();

  try {
    const logger = stubLogger();
    const app = createTestApp(db, logger, "live");
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/test`, {
        headers: { Authorization: "Basic dXNlcjpwYXNz" },
      });
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.error, "missing bearer token");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("auth middleware logs warning with token_hash not raw token", async () => {
  const { db, tmp } = setupTestDb();

  try {
    const logger = stubLogger();
    const app = createTestApp(db, logger, "live");
    const server = await listen(app);

    try {
      const { port } = server.address();
      await fetch(`http://127.0.0.1:${port}/v1/test`, {
        headers: { Authorization: "Bearer secret-token-value" },
      });

      const warnEntry = logger.entries.find(
        (e) => e.level === "warn" && e.msg === "auth failed: invalid token"
      );
      assert.ok(warnEntry, "should log a warning for invalid token");
      assert.equal(warnEntry.token_hash, hashToken("secret-token-value"));
      assert.ok(
        !JSON.stringify(warnEntry).includes("secret-token-value"),
        "raw token must not appear in log entry"
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("health endpoint remains unauthenticated", async () => {
  const { db, tmp } = setupTestDb();

  try {
    const logger = stubLogger();

    const app = express();
    app.get("/health", (_req, res) => res.json({ status: "ok" }));
    app.use("/v1", createAuthMiddleware({ db, logger, allowedScope: "live" }));
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
