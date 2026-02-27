import assert from "node:assert/strict";
import test from "node:test";
import { createBudgetService } from "../src/budget.js";
import { setupTestDb, insertProject, insertBudget, cleanupTestDb } from "./helpers.js";

// --- logUsage ---

test("logUsage inserts into usage_log", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    const budget = createBudgetService(db);

    budget.logUsage({
      projectId: "p1",
      model: "gpt-4",
      promptTokens: 10,
      completionTokens: 20,
    }, new Date("2026-02-26T12:00:00Z"));

    const row = db.prepare("SELECT * FROM usage_log WHERE project_id = ?").get("p1");
    assert.equal(row.project_id, "p1");
    assert.equal(row.model, "gpt-4");
    assert.equal(row.prompt_tokens, 10);
    assert.equal(row.completion_tokens, 20);
    assert.equal(row.timestamp, "2026-02-26 12:00:00");
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("logUsage increments budget current_usage", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    insertBudget(db, { projectId: "p1", limitTokens: 1000, period: "daily", periodStart: "2026-02-26" });
    const budget = createBudgetService(db);

    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 10, completionTokens: 20 });

    const row = db.prepare("SELECT current_usage FROM budgets WHERE project_id = ?").get("p1");
    assert.equal(row.current_usage, 30);
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("logUsage accumulates across multiple calls", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    insertBudget(db, { projectId: "p1", limitTokens: 1000, period: "daily", periodStart: "2026-02-26" });
    const budget = createBudgetService(db);

    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 10, completionTokens: 20 });
    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 5, completionTokens: 15 });

    const row = db.prepare("SELECT current_usage FROM budgets WHERE project_id = ?").get("p1");
    assert.equal(row.current_usage, 50);

    const logs = db.prepare("SELECT * FROM usage_log WHERE project_id = ?").all("p1");
    assert.equal(logs.length, 2);
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("logUsage works without a budget row", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    const budget = createBudgetService(db);

    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 10, completionTokens: 20 });

    const row = db.prepare("SELECT * FROM usage_log WHERE project_id = ?").get("p1");
    assert.equal(row.prompt_tokens, 10);
  } finally {
    cleanupTestDb(db, tmp);
  }
});

// --- checkBudget ---

test("checkBudget allows when no budget is configured", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    const budget = createBudgetService(db);

    const result = budget.checkBudget("p1");
    assert.equal(result.allowed, true);
    assert.equal(result.limit, null);
    assert.equal(result.remaining, null);
    assert.equal(result.usage, 0);
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("checkBudget allows when under limit", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    insertBudget(db, { projectId: "p1", limitTokens: 1000, period: "daily", periodStart: "2026-02-26" });
    const budget = createBudgetService(db);

    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 100, completionTokens: 200 });

    const result = budget.checkBudget("p1", new Date("2026-02-26T12:00:00Z"));
    assert.equal(result.allowed, true);
    assert.equal(result.remaining, 700);
    assert.equal(result.limit, 1000);
    assert.equal(result.usage, 300);
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("checkBudget rejects when at exact limit (hard stop)", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    insertBudget(db, { projectId: "p1", limitTokens: 100, period: "daily", periodStart: "2026-02-26" });
    const budget = createBudgetService(db);

    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 50, completionTokens: 50 });

    const result = budget.checkBudget("p1", new Date("2026-02-26T12:00:00Z"));
    assert.equal(result.allowed, false);
    assert.equal(result.remaining, 0);
    assert.equal(result.usage, 100);
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("checkBudget rejects when over limit (hard stop)", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    insertBudget(db, { projectId: "p1", limitTokens: 50, period: "daily", periodStart: "2026-02-26" });
    const budget = createBudgetService(db);

    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 30, completionTokens: 30 });

    const result = budget.checkBudget("p1", new Date("2026-02-26T12:00:00Z"));
    assert.equal(result.allowed, false);
    assert.equal(result.remaining, -10);
    assert.equal(result.usage, 60);
  } finally {
    cleanupTestDb(db, tmp);
  }
});

// --- budget reset per period ---

test("checkBudget resets daily budget when period expired", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    insertBudget(db, { projectId: "p1", limitTokens: 100, period: "daily", periodStart: "2026-02-25" });
    const budget = createBudgetService(db);

    // Simulate yesterday's usage
    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 50, completionTokens: 50 });

    // Check today — period should reset
    const result = budget.checkBudget("p1", new Date("2026-02-26T10:00:00Z"));
    assert.equal(result.allowed, true);
    assert.equal(result.usage, 0);
    assert.equal(result.remaining, 100);

    // Verify period_start was updated
    const row = db.prepare("SELECT period_start, current_usage FROM budgets WHERE project_id = ?").get("p1");
    assert.equal(row.current_usage, 0);
    assert.equal(row.period_start, "2026-02-26");
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("checkBudget resets monthly budget when period expired", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    insertBudget(db, { projectId: "p1", limitTokens: 5000, period: "monthly", periodStart: "2026-01-01" });
    const budget = createBudgetService(db);

    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 2500, completionTokens: 2500 });

    // Check in February — period should reset
    const result = budget.checkBudget("p1", new Date("2026-02-01T00:00:00Z"));
    assert.equal(result.allowed, true);
    assert.equal(result.usage, 0);
    assert.equal(result.remaining, 5000);
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("checkBudget does not reset when still within daily period", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    insertBudget(db, { projectId: "p1", limitTokens: 100, period: "daily", periodStart: "2026-02-26" });
    const budget = createBudgetService(db);

    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 50, completionTokens: 50 });

    // Same day, at limit — should NOT reset, should reject
    const result = budget.checkBudget("p1", new Date("2026-02-26T23:59:59Z"));
    assert.equal(result.allowed, false);
    assert.equal(result.usage, 100);
    assert.equal(result.remaining, 0);
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("checkBudget does not reset when still within monthly period", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    insertBudget(db, { projectId: "p1", limitTokens: 5000, period: "monthly", periodStart: "2026-02-01" });
    const budget = createBudgetService(db);

    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 2500, completionTokens: 2500 });

    // Same month — should NOT reset
    const result = budget.checkBudget("p1", new Date("2026-02-26T12:00:00Z"));
    assert.equal(result.allowed, false);
    assert.equal(result.usage, 5000);
    assert.equal(result.remaining, 0);
  } finally {
    cleanupTestDb(db, tmp);
  }
});

// --- getUsageReport ---

test("getUsageReport returns empty report for project with no usage", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    const budget = createBudgetService(db);

    const report = budget.getUsageReport("p1");
    assert.equal(report.project_id, "p1");
    assert.equal(report.total_tokens, 0);
    assert.equal(report.budget, null);
    assert.deepEqual(report.by_model, []);
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("getUsageReport returns usage breakdown by model", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    const budget = createBudgetService(db);

    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 10, completionTokens: 20 });
    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 5, completionTokens: 15 });
    budget.logUsage({ projectId: "p1", model: "gpt-3.5", promptTokens: 3, completionTokens: 7 });

    const report = budget.getUsageReport("p1");
    assert.equal(report.total_tokens, 60);
    assert.equal(report.by_model.length, 2);

    const gpt4 = report.by_model.find((m) => m.model === "gpt-4");
    assert.equal(gpt4.prompt_tokens, 15);
    assert.equal(gpt4.completion_tokens, 35);
    assert.equal(gpt4.total_tokens, 50);
    assert.equal(gpt4.request_count, 2);

    const gpt35 = report.by_model.find((m) => m.model === "gpt-3.5");
    assert.equal(gpt35.total_tokens, 10);
    assert.equal(gpt35.request_count, 1);
  } finally {
    cleanupTestDb(db, tmp);
  }
});

test("getUsageReport includes budget info when configured", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    insertBudget(db, { projectId: "p1", limitTokens: 1000, period: "daily", periodStart: "2026-02-26" });
    const budget = createBudgetService(db);

    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 100, completionTokens: 200 });

    const report = budget.getUsageReport("p1");
    assert.equal(report.budget.limit_tokens, 1000);
    assert.equal(report.budget.current_usage, 300);
    assert.equal(report.budget.remaining, 700);
    assert.equal(report.budget.period, "daily");
    assert.equal(report.budget.period_start, "2026-02-26");
  } finally {
    cleanupTestDb(db, tmp);
  }
});

// --- isolation between projects ---

test("usage logging is isolated per project", () => {
  const { db, tmp } = setupTestDb();
  try {
    insertProject(db, { id: "p1" });
    insertProject(db, { id: "p2", name: "proj2" });
    insertBudget(db, { projectId: "p1", limitTokens: 100, period: "daily", periodStart: "2026-02-26" });
    insertBudget(db, { projectId: "p2", limitTokens: 100, period: "daily", periodStart: "2026-02-26" });
    const budget = createBudgetService(db);

    budget.logUsage({ projectId: "p1", model: "gpt-4", promptTokens: 50, completionTokens: 50 });
    budget.logUsage({ projectId: "p2", model: "gpt-4", promptTokens: 10, completionTokens: 10 });

    const p1 = budget.checkBudget("p1", new Date("2026-02-26T12:00:00Z"));
    assert.equal(p1.usage, 100);
    assert.equal(p1.allowed, false);

    const p2 = budget.checkBudget("p2", new Date("2026-02-26T12:00:00Z"));
    assert.equal(p2.usage, 20);
    assert.equal(p2.allowed, true);
  } finally {
    cleanupTestDb(db, tmp);
  }
});
