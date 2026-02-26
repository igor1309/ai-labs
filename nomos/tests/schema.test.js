import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { openDb } from "../src/db.js";
import { initSchema } from "../src/schema.js";

test("initSchema creates projects table", () => {
  const tmp = mkdtempSync(join(tmpdir(), "nomos-test-"));
  const dbPath = join(tmp, "test.db");

  try {
    const db = openDb(dbPath);
    initSchema(db);

    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
      )
      .get();
    assert.equal(table.name, "projects");

    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("initSchema is idempotent", () => {
  const tmp = mkdtempSync(join(tmpdir(), "nomos-test-"));
  const dbPath = join(tmp, "test.db");

  try {
    const db = openDb(dbPath);
    initSchema(db);
    initSchema(db);

    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
      )
      .get();
    assert.equal(table.name, "projects");

    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("projects table enforces scope check constraint", () => {
  const tmp = mkdtempSync(join(tmpdir(), "nomos-test-"));
  const dbPath = join(tmp, "test.db");

  try {
    const db = openDb(dbPath);
    initSchema(db);

    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO projects (id, name, token_hash, scope) VALUES (?, ?, ?, ?)"
          )
          .run("p1", "test", "hash1", "invalid_scope"),
      /CHECK/
    );

    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("projects table enforces unique token_hash", () => {
  const tmp = mkdtempSync(join(tmpdir(), "nomos-test-"));
  const dbPath = join(tmp, "test.db");

  try {
    const db = openDb(dbPath);
    initSchema(db);

    const insert = db.prepare(
      "INSERT INTO projects (id, name, token_hash, scope) VALUES (?, ?, ?, ?)"
    );
    insert.run("p1", "project-one", "hash1", "live");

    assert.throws(
      () => insert.run("p2", "project-two", "hash1", "stub"),
      /UNIQUE/
    );

    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- usage_log table ---

test("initSchema creates usage_log table", () => {
  const tmp = mkdtempSync(join(tmpdir(), "nomos-test-"));
  const dbPath = join(tmp, "test.db");

  try {
    const db = openDb(dbPath);
    initSchema(db);

    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='usage_log'"
      )
      .get();
    assert.equal(table.name, "usage_log");

    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("usage_log stores token usage entries", () => {
  const tmp = mkdtempSync(join(tmpdir(), "nomos-test-"));
  const dbPath = join(tmp, "test.db");

  try {
    const db = openDb(dbPath);
    initSchema(db);

    db.prepare(
      "INSERT INTO projects (id, name, token_hash, scope) VALUES (?, ?, ?, ?)"
    ).run("p1", "proj", "hash1", "live");

    db.prepare(
      "INSERT INTO usage_log (project_id, model, prompt_tokens, completion_tokens) VALUES (?, ?, ?, ?)"
    ).run("p1", "gpt-4", 10, 20);

    const row = db.prepare("SELECT * FROM usage_log WHERE project_id = ?").get("p1");
    assert.equal(row.project_id, "p1");
    assert.equal(row.model, "gpt-4");
    assert.equal(row.prompt_tokens, 10);
    assert.equal(row.completion_tokens, 20);
    assert.ok(row.timestamp);

    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("usage_log auto-increments id", () => {
  const tmp = mkdtempSync(join(tmpdir(), "nomos-test-"));
  const dbPath = join(tmp, "test.db");

  try {
    const db = openDb(dbPath);
    initSchema(db);

    db.prepare(
      "INSERT INTO projects (id, name, token_hash, scope) VALUES (?, ?, ?, ?)"
    ).run("p1", "proj", "hash1", "live");

    const insert = db.prepare(
      "INSERT INTO usage_log (project_id, model, prompt_tokens, completion_tokens) VALUES (?, ?, ?, ?)"
    );
    insert.run("p1", "gpt-4", 10, 20);
    insert.run("p1", "gpt-4", 5, 15);

    const rows = db.prepare("SELECT id FROM usage_log ORDER BY id").all();
    assert.equal(rows.length, 2);
    assert.equal(rows[1].id, rows[0].id + 1);

    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- budgets table ---

test("initSchema creates budgets table", () => {
  const tmp = mkdtempSync(join(tmpdir(), "nomos-test-"));
  const dbPath = join(tmp, "test.db");

  try {
    const db = openDb(dbPath);
    initSchema(db);

    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'"
      )
      .get();
    assert.equal(table.name, "budgets");

    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("budgets table enforces period check constraint", () => {
  const tmp = mkdtempSync(join(tmpdir(), "nomos-test-"));
  const dbPath = join(tmp, "test.db");

  try {
    const db = openDb(dbPath);
    initSchema(db);

    db.prepare(
      "INSERT INTO projects (id, name, token_hash, scope) VALUES (?, ?, ?, ?)"
    ).run("p1", "proj", "hash1", "live");

    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO budgets (project_id, limit_tokens, period, period_start) VALUES (?, ?, ?, ?)"
          )
          .run("p1", 1000, "weekly", "2026-02-26"),
      /CHECK/
    );

    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("budgets table allows daily and monthly periods", () => {
  const tmp = mkdtempSync(join(tmpdir(), "nomos-test-"));
  const dbPath = join(tmp, "test.db");

  try {
    const db = openDb(dbPath);
    initSchema(db);

    db.prepare(
      "INSERT INTO projects (id, name, token_hash, scope) VALUES (?, ?, ?, ?)"
    ).run("p1", "proj-daily", "hash1", "live");
    db.prepare(
      "INSERT INTO projects (id, name, token_hash, scope) VALUES (?, ?, ?, ?)"
    ).run("p2", "proj-monthly", "hash2", "live");

    db.prepare(
      "INSERT INTO budgets (project_id, limit_tokens, period, period_start) VALUES (?, ?, ?, ?)"
    ).run("p1", 1000, "daily", "2026-02-26");
    db.prepare(
      "INSERT INTO budgets (project_id, limit_tokens, period, period_start) VALUES (?, ?, ?, ?)"
    ).run("p2", 50000, "monthly", "2026-02-01");

    const daily = db.prepare("SELECT * FROM budgets WHERE project_id = ?").get("p1");
    assert.equal(daily.limit_tokens, 1000);
    assert.equal(daily.period, "daily");
    assert.equal(daily.current_usage, 0);

    const monthly = db.prepare("SELECT * FROM budgets WHERE project_id = ?").get("p2");
    assert.equal(monthly.limit_tokens, 50000);
    assert.equal(monthly.period, "monthly");

    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("budgets table enforces unique project_id", () => {
  const tmp = mkdtempSync(join(tmpdir(), "nomos-test-"));
  const dbPath = join(tmp, "test.db");

  try {
    const db = openDb(dbPath);
    initSchema(db);

    db.prepare(
      "INSERT INTO projects (id, name, token_hash, scope) VALUES (?, ?, ?, ?)"
    ).run("p1", "proj", "hash1", "live");

    db.prepare(
      "INSERT INTO budgets (project_id, limit_tokens, period, period_start) VALUES (?, ?, ?, ?)"
    ).run("p1", 1000, "daily", "2026-02-26");

    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO budgets (project_id, limit_tokens, period, period_start) VALUES (?, ?, ?, ?)"
          )
          .run("p1", 2000, "monthly", "2026-02-01"),
      /UNIQUE|PRIMARY/
    );

    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
