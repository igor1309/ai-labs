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
