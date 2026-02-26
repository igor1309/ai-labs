import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { after, before, test } from "node:test";

const runE2E = process.env.RUN_NOMOS_E2E === "1";
const composeDir = new URL("..", import.meta.url).pathname;

before(async () => {
  if (!runE2E) return;
  execSync("docker compose up -d --build --wait", { cwd: composeDir, timeout: 120_000 });
});

after(async () => {
  if (!runE2E) return;
  execSync("docker compose down", { cwd: composeDir, timeout: 30_000 });
});

test("health check through Caddy returns 200", { skip: !runE2E && "Set RUN_NOMOS_E2E=1 to run e2e tests." }, async () => {
  const res = await fetch("http://127.0.0.1:80/health");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { status: "ok" });
});
