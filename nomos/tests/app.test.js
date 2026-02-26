import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";

function stubLogger() {
  return { info() {}, warn() {}, error() {} };
}

function stubDb() {
  return { close() {} };
}

test("app starts and stops cleanly", async () => {
  const app = createApp({ logger: stubLogger(), db: stubDb() });
  const server = app.listen(0);

  const { port } = server.address();
  assert.ok(port > 0, "server should bind to a port");

  await new Promise((resolve) => server.close(resolve));
});

test("createApp returns an express app with listen method", () => {
  const app = createApp({ logger: stubLogger(), db: stubDb() });
  assert.equal(typeof app.listen, "function");
});
