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

test("SSE streaming through Caddy delivers chunks without buffering", { skip: !runE2E && "Set RUN_NOMOS_E2E=1 to run e2e tests." }, async () => {
  // This test requires NOMOS_STUB_ENABLED=true and a stub-scoped project token seeded in the DB.
  // The docker compose .env must include NOMOS_STUB_ENABLED=true for e2e.
  const token = process.env.NOMOS_E2E_STUB_TOKEN;
  if (!token) {
    assert.fail("Set NOMOS_E2E_STUB_TOKEN env var to a valid stub-scoped project token");
  }

  const res = await fetch("http://127.0.0.1:80/stub/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
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

  // StubRunner test-model fixture: 5 chunks + [DONE] = 6 data lines
  assert.equal(dataLines.length, 6, `expected 6 data lines, got ${dataLines.length}`);
  assert.equal(dataLines[dataLines.length - 1], "data: [DONE]");

  // Verify first chunk is parseable JSON
  const first = JSON.parse(dataLines[0].slice(6));
  assert.equal(first.object, "chat.completion.chunk");
});
