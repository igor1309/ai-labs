import assert from "node:assert/strict";
import test from "node:test";
import {
  listenWithIdentity,
} from "./support/http-api.js";

test("quickCheckProductUiLearnRoute_shouldServeShell_onGetLearn", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/learn`);
    const html = await response.text();

    assert.deepEqual(
      {
        contentType: response.headers.get("content-type"),
        hasLearnApp: html.includes('id="learn-app"'),
        statusCode: response.status,
        title: html.includes("<title>Agonara Learn</title>"),
      },
      {
        contentType: "text/html; charset=utf-8",
        hasLearnApp: true,
        statusCode: 200,
        title: true,
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckProductUiLearnRoute_shouldHideRuntimeSecrets_onGetLearn", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const response = await fetch(`${baseUrl}/learn`);
    const html = await response.text();
    const forbiddenFragments = [
      "operator-secret",
      "NON_SECRET_TEST_VALUE",
      "session-1",
      "agonara_session=",
      "password_hash",
      "acceptedFromCandidateId",
      "DATABASE_URL",
      "better-sqlite3",
      "/Users/",
      "internal_error",
    ];

    assert.deepEqual(
      {
        leaks: forbiddenFragments.filter($0 => html.includes($0)),
        statusCode: response.status,
      },
      {
        leaks: [],
        statusCode: 200,
      },
    );
  } finally {
    await close();
  }
});

test("quickCheckProductUiLearnRoute_shouldKeepOutOfScopeRoutesAbsent", async () => {
  const { baseUrl, close } = await listenWithIdentity();

  try {
    const responses = await Promise.all([
      fetch(`${baseUrl}/learn/quick-check-topic-attempts`),
      fetch(`${baseUrl}/learn/quick-check-period-attempts`),
      fetch(`${baseUrl}/learn/progress`),
      fetch(`${baseUrl}/learn/weak-areas`),
      fetch(`${baseUrl}/learn/provider/jobs`),
      fetch(`${baseUrl}/learn/worker/jobs`),
      fetch(`${baseUrl}/learn/queue/jobs`),
      fetch(`${baseUrl}/learn/human-review/jobs`),
    ]);
    const rejectedRoutes = await Promise.all(
      responses.map(async response => ({
        body: await response.json(),
        statusCode: response.status,
      })),
    );

    assert.deepEqual(
      rejectedRoutes,
      Array.from({ length: 8 }, () => ({
        body: { status: "rejected", reason: "not_found" },
        statusCode: 404,
      })),
    );
  } finally {
    await close();
  }
});
