import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { openDb } from "../src/db.js";

test("openDb creates database with WAL mode", () => {
  const tmp = mkdtempSync(join(tmpdir(), "nomos-test-"));
  const dbPath = join(tmp, "test.db");

  try {
    const db = openDb(dbPath);
    assert.ok(existsSync(dbPath), "database file should be created");

    const mode = db.pragma("journal_mode", { simple: true });
    assert.equal(mode, "wal");

    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("openDb creates parent directories", () => {
  const tmp = mkdtempSync(join(tmpdir(), "nomos-test-"));
  const dbPath = join(tmp, "nested", "dir", "test.db");

  try {
    const db = openDb(dbPath);
    assert.ok(existsSync(dbPath), "database file should be created in nested dir");
    db.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
