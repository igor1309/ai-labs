/**
 * E2E local deploy test — validates the full Docker Compose stack
 * (Nomos + Caddy reverse proxy) works end-to-end on a local machine.
 *
 * Prerequisites: Docker runtime (OrbStack or Docker Desktop).
 * Gated by RUN_NOMOS_E2E=1 — skipped in normal test runs.
 *
 * Uses docker-compose.e2e.yml (isolated containers on port 8180)
 * so it does not conflict with the production compose or other e2e tests.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";

const runE2E = process.env.RUN_NOMOS_E2E === "1";
const skip = !runE2E && "Set RUN_NOMOS_E2E=1 to run local deploy e2e tests.";

const composeDir = new URL("..", import.meta.url).pathname;
const BASE = "http://127.0.0.1:8180";
const COMPOSE = "docker compose -f docker-compose.e2e.yml -p nomos-e2e";
const CONTAINER = "nomos-e2e";

const STUB_TOKEN = "e2e-local-deploy-stub-tok";
const PROJECT_ID = "e2e-local";

const envPath = join(composeDir, ".env.e2e");
const seedPath = join(composeDir, ".e2e-seed.mjs");

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: composeDir, encoding: "utf8", timeout: 30_000, ...opts });
}

function seedDatabase() {
  const script = [
    'import Database from "better-sqlite3";',
    'import { createHash } from "node:crypto";',
    'const db = new Database("/app/data/nomos.db");',
    `const hash = createHash("sha256").update("${STUB_TOKEN}").digest("hex");`,
    'db.prepare("INSERT OR REPLACE INTO projects (id, name, token_hash, scope, active) VALUES (?, ?, ?, ?, ?)")',
    `  .run("${PROJECT_ID}", "E2E Local Deploy", hash, "stub", 1);`,
    "db.close();",
  ].join("\n");

  writeFileSync(seedPath, script);
  try {
    run(`docker cp ${seedPath} ${CONTAINER}:/tmp/seed.mjs`);
    run(`docker exec ${CONTAINER} node /tmp/seed.mjs`, { timeout: 15_000 });
  } finally {
    if (existsSync(seedPath)) unlinkSync(seedPath);
  }
}

async function waitForHealth(retries = 15, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Health check at ${BASE}/health failed after ${retries} retries`);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

before(async () => {
  if (!runE2E) return;

  // Verify Docker is available
  try {
    execSync("docker info", { timeout: 10_000, stdio: "pipe" });
  } catch {
    throw new Error(
      "Docker is not running. Install OrbStack (https://orbstack.dev) or Docker Desktop."
    );
  }

  // Create e2e env file (stub enabled, safeguards on, no vendor key needed)
  writeFileSync(
    envPath,
    [
      "NOMOS_PORT=8080",
      "NOMOS_HOST=0.0.0.0",
      "NOMOS_DB_PATH=data/nomos.db",
      "NODE_ENV=production",
      "NOMOS_STUB_ENABLED=true",
      "NOMOS_FIXTURES_DIR=tests/fixtures",
      "NOMOS_SAFEGUARDS_ENABLED=true",
      "NOMOS_SAFEGUARDS_SANITIZE=true",
      "NOMOS_SAFEGUARDS_BLOCK=false",
      "",
    ].join("\n"),
  );

  // Build and start the isolated e2e stack
  run(`${COMPOSE} up -d --build --wait`, { timeout: 120_000 });

  // Seed a stub-scoped project into the database
  seedDatabase();

  // Wait for Caddy to be ready
  await waitForHealth();
});

after(async () => {
  if (!runE2E) return;
  try { run(`${COMPOSE} down -v`, { timeout: 30_000 }); } catch { /* best effort */ }
  if (existsSync(envPath)) unlinkSync(envPath);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("containers are running and healthy", { skip }, () => {
  const ps = run(`${COMPOSE} ps --format json`);
  const services = ps.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

  const nomos = services.find((s) => s.Service === "nomos");
  const caddy = services.find((s) => s.Service === "caddy");

  assert.ok(nomos, "nomos service should be listed");
  assert.ok(caddy, "caddy service should be listed");
  assert.match(nomos.State, /running/i, "nomos should be running");
  assert.match(caddy.State, /running/i, "caddy should be running");
});

test("health check returns 200 through Caddy reverse proxy", { skip }, async () => {
  const res = await fetch(`${BASE}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("auth rejects missing bearer token with 401", { skip }, async () => {
  const res = await fetch(`${BASE}/stub/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hi" }] }),
  });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "missing bearer token");
});

test("auth rejects invalid token with 401", { skip }, async () => {
  const res = await fetch(`${BASE}/stub/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer bad-token",
    },
    body: JSON.stringify({ model: "test-model", messages: [{ role: "user", content: "hi" }] }),
  });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "invalid token");
});

test("stub non-streaming chat completion through full stack", { skip }, async () => {
  const res = await fetch(`${BASE}/stub/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${STUB_TOKEN}`,
    },
    body: JSON.stringify({
      model: "test-model",
      messages: [{ role: "user", content: "hello" }],
    }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.object, "chat.completion");
  assert.equal(body.model, "test-model");
  assert.equal(body.choices[0].message.content, "Hello from stub");
  assert.ok(body.usage, "response should include usage");
});

test("stub streaming through Caddy delivers unbuffered SSE", { skip }, async () => {
  const res = await fetch(`${BASE}/stub/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${STUB_TOKEN}`,
    },
    body: JSON.stringify({
      model: "test-model",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
    }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/event-stream");

  const text = await res.text();
  const dataLines = text.split("\n").filter((l) => l.startsWith("data: "));

  // test-model.stream.json fixture: 5 chunks + [DONE] = 6 data lines
  assert.equal(dataLines.length, 6, `expected 6 data lines, got ${dataLines.length}`);
  assert.equal(dataLines.at(-1), "data: [DONE]");

  const first = JSON.parse(dataLines[0].slice(6));
  assert.equal(first.object, "chat.completion.chunk");
});

test("unknown route returns 404", { skip }, async () => {
  const res = await fetch(`${BASE}/nonexistent`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, "not found");
});

test("missing model returns 400 with invalid_request_error", { skip }, async () => {
  const res = await fetch(`${BASE}/stub/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${STUB_TOKEN}`,
    },
    body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.type, "invalid_request_error");
});
