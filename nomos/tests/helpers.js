import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../src/db.js";
import { initSchema } from "../src/schema.js";
import { hashToken } from "../src/auth.js";

export function stubLogger() {
  const entries = [];
  return {
    info(msg, data = {}) { entries.push({ level: "info", msg, ...data }); },
    warn(msg, data = {}) { entries.push({ level: "warn", msg, ...data }); },
    error(msg, data = {}) { entries.push({ level: "error", msg, ...data }); },
    entries,
  };
}

export function setupTestDb(prefix = "nomos-test") {
  const tmp = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const dbPath = join(tmp, "test.db");
  const db = openDb(dbPath);
  initSchema(db);
  return { db, tmp };
}

export function insertProject(db, { id, name = "proj", token = `tok-${id}`, scope = "live", active = 1 }) {
  db.prepare(
    "INSERT INTO projects (id, name, token_hash, scope, active) VALUES (?, ?, ?, ?, ?)"
  ).run(id, name, hashToken(token), scope, active);
}

export function insertBudget(db, { projectId, limitTokens, period, periodStart }) {
  db.prepare(
    "INSERT INTO budgets (project_id, limit_tokens, period, period_start) VALUES (?, ?, ?, ?)"
  ).run(projectId, limitTokens, period, periodStart);
}

export async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

export function cleanupTestDb(db, tmp) {
  db.close();
  rmSync(tmp, { recursive: true, force: true });
}
