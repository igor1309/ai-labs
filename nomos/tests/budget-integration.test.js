import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createBudgetService } from "../src/budget.js";
import { stubLogger, setupTestDb, insertProject, insertBudget, listen } from "./helpers.js";

function fakeRunner(response) {
  return {
    async execute() { return response; },
    async *executeStream() {
      yield { type: "chunk", data: response };
      yield { type: "end" };
    },
  };
}

function fakeRunnerWithUsage({ promptTokens, completionTokens }) {
  const response = {
    id: "resp-1",
    model: "gpt-4",
    choices: [{ message: { role: "assistant", content: "hello" }, finish_reason: "stop" }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
  return {
    async execute() { return response; },
    async *executeStream() {
      yield { type: "chunk", data: { id: "c1", choices: [{ delta: { content: "hello" } }] } };
      yield { type: "chunk", data: { id: "c1", choices: [{ delta: {} }], usage: response.usage } };
      yield { type: "end" };
    },
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// --- pre-request budget check ---

test("request succeeds when under budget", async () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1", name: "proj", token: "tok-1", scope: "live" });
    insertBudget(db, { projectId: "p1", limitTokens: 1000, period: "daily", periodStart: today() });
    const budgetService = createBudgetService(db);
    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      liveRunner: fakeRunnerWithUsage({ promptTokens: 10, completionTokens: 20 }),
      budgetService,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tok-1",
        },
        body: JSON.stringify({ model: "gpt-4", messages: [{ role: "user", content: "hi" }] }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.usage.prompt_tokens, 10);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("request rejected with 429 when budget exceeded (hard stop)", async () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1", name: "proj", token: "tok-1", scope: "live" });
    insertBudget(db, { projectId: "p1", limitTokens: 50, period: "daily", periodStart: today() });
    const budgetService = createBudgetService(db);

    // Exhaust budget first
    budgetService.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 30, completionTokens: 30 });

    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      liveRunner: fakeRunnerWithUsage({ promptTokens: 10, completionTokens: 20 }),
      budgetService,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tok-1",
        },
        body: JSON.stringify({ model: "gpt-4", messages: [{ role: "user", content: "hi" }] }),
      });
      assert.equal(res.status, 429);
      const body = await res.json();
      assert.equal(body.error.type, "budget_exceeded");
      assert.equal(body.error.usage, 60);
      assert.equal(body.error.limit, 50);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("streaming request rejected with 429 when budget exceeded", async () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1", name: "proj", token: "tok-1", scope: "live" });
    insertBudget(db, { projectId: "p1", limitTokens: 50, period: "daily", periodStart: today() });
    const budgetService = createBudgetService(db);

    budgetService.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 30, completionTokens: 30 });

    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      liveRunner: fakeRunnerWithUsage({ promptTokens: 10, completionTokens: 20 }),
      budgetService,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tok-1",
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        }),
      });
      // Budget check happens before streaming starts → JSON 429
      assert.equal(res.status, 429);
      const body = await res.json();
      assert.equal(body.error.type, "budget_exceeded");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("budget check logs warning on rejection", async () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1", name: "proj", token: "tok-1", scope: "live" });
    insertBudget(db, { projectId: "p1", limitTokens: 10, period: "daily", periodStart: today() });
    const budgetService = createBudgetService(db);
    budgetService.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 5, completionTokens: 10 });

    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      liveRunner: fakeRunner({ id: "r1" }),
      budgetService,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tok-1",
        },
        body: JSON.stringify({ model: "gpt-4", messages: [{ role: "user", content: "hi" }] }),
      });

      const warn = logger.entries.find((e) => e.msg === "budget exceeded");
      assert.ok(warn, "should log budget exceeded warning");
      assert.equal(warn.project_id, "p1");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- post-completion usage logging ---

test("non-streaming response logs token usage", async () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1", name: "proj", token: "tok-1", scope: "live" });
    const budgetService = createBudgetService(db);
    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      liveRunner: fakeRunnerWithUsage({ promptTokens: 10, completionTokens: 20 }),
      budgetService,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tok-1",
        },
        body: JSON.stringify({ model: "gpt-4", messages: [{ role: "user", content: "hi" }] }),
      });

      const logs = db.prepare("SELECT * FROM usage_log WHERE project_id = ?").all("p1");
      assert.equal(logs.length, 1);
      assert.equal(logs[0].model, "gpt-4");
      assert.equal(logs[0].prompt_tokens, 10);
      assert.equal(logs[0].completion_tokens, 20);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("streaming response logs token usage from final chunk", async () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1", name: "proj", token: "tok-1", scope: "live" });
    const budgetService = createBudgetService(db);
    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      liveRunner: fakeRunnerWithUsage({ promptTokens: 15, completionTokens: 25 }),
      budgetService,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tok-1",
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [{ role: "user", content: "hi" }],
          stream: true,
        }),
      });
      await res.text(); // consume body

      const logs = db.prepare("SELECT * FROM usage_log WHERE project_id = ?").all("p1");
      assert.equal(logs.length, 1);
      assert.equal(logs[0].prompt_tokens, 15);
      assert.equal(logs[0].completion_tokens, 25);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("response without usage field does not log", async () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1", name: "proj", token: "tok-1", scope: "live" });
    const budgetService = createBudgetService(db);
    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      liveRunner: fakeRunner({ id: "resp-1", choices: [] }),
      budgetService,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tok-1",
        },
        body: JSON.stringify({ model: "gpt-4", messages: [{ role: "user", content: "hi" }] }),
      });

      const logs = db.prepare("SELECT * FROM usage_log WHERE project_id = ?").all("p1");
      assert.equal(logs.length, 0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- usage report endpoint ---

test("GET /v1/usage returns usage report for authenticated project", async () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1", name: "proj", token: "tok-1", scope: "live" });
    insertBudget(db, { projectId: "p1", limitTokens: 1000, period: "daily", periodStart: today() });
    const budgetService = createBudgetService(db);

    budgetService.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 100, completionTokens: 200 });

    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      liveRunner: fakeRunner({ id: "r1" }),
      budgetService,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/usage`, {
        headers: { Authorization: "Bearer tok-1" },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.project_id, "p1");
      assert.equal(body.total_tokens, 300);
      assert.equal(body.budget.limit_tokens, 1000);
      assert.equal(body.budget.current_usage, 300);
      assert.equal(body.budget.remaining, 700);
      assert.equal(body.by_model.length, 1);
      assert.equal(body.by_model[0].model, "gpt-4");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("GET /v1/usage requires authentication", async () => {
  const { db, tmp } = setupTestDb();
  try {
    const budgetService = createBudgetService(db);
    const logger = stubLogger();
    const app = createApp({ logger, db, budgetService });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/usage`);
      assert.equal(res.status, 401);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("GET /v1/usage returns empty report for project with no usage", async () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1", name: "proj", token: "tok-1", scope: "live" });
    const budgetService = createBudgetService(db);
    const logger = stubLogger();
    const app = createApp({ logger, db, budgetService });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/usage`, {
        headers: { Authorization: "Bearer tok-1" },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.project_id, "p1");
      assert.equal(body.total_tokens, 0);
      assert.equal(body.budget, null);
      assert.deepEqual(body.by_model, []);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- no budget configured (passthrough) ---

test("requests pass through when no budget is configured for project", async () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1", name: "proj", token: "tok-1", scope: "live" });
    const budgetService = createBudgetService(db);
    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      liveRunner: fakeRunnerWithUsage({ promptTokens: 10, completionTokens: 20 }),
      budgetService,
    });
    const server = await listen(app);

    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tok-1",
        },
        body: JSON.stringify({ model: "gpt-4", messages: [{ role: "user", content: "hi" }] }),
      });
      assert.equal(res.status, 200);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- stub endpoint budget enforcement ---

test("stub endpoint also enforces budget", async () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "s1", name: "stub-proj", token: "tok-stub", scope: "stub" });
    insertBudget(db, { projectId: "s1", limitTokens: 10, period: "daily", periodStart: today() });
    const budgetService = createBudgetService(db);
    budgetService.logUsage({ projectId: "s1", model: "test", promptTokens: 5, completionTokens: 10 });

    const fixturesDir = join(import.meta.dirname, "fixtures");
    const { createStubRunner } = await import("../src/stub-runner.js");
    const stubRunner = createStubRunner({ fixturesDir });
    const logger = stubLogger();
    const app = createApp({
      logger,
      db,
      stubRunner,
      stubEnabled: true,
      budgetService,
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
      assert.equal(res.status, 429);
      const body = await res.json();
      assert.equal(body.error.type, "budget_exceeded");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});
