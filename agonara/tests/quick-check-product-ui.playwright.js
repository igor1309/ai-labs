import { expect, test } from "@playwright/test";
import { createIdentityCommands } from "../src/identity.js";
import { createServer } from "../src/server.js";
import { initializeIdentityStorage, openIdentityDatabase } from "../src/storage.js";

test("quickCheckProductUiSession_shouldSignIn_onKnownLocalPasswordCredential", async ({ page }) => {
  const harness = await startLearnHarness();

  try {
    await page.goto(`${harness.baseUrl}/learn`);
    await page.locator("#signin-form input[name='login']").fill("learner@example.test");
    await page.locator("#signin-form input[name='password']").fill("correct horse battery staple");
    await page.locator("#signin-form").getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator("#session-summary")).toHaveText("Signed in as Learning Curator");
    await expect(page.locator("#signin-status")).toHaveText("Signed in");
    await expect(page.locator("#learn-app")).not.toContainText("session-2");
    await expect(page.locator("#learn-app")).not.toContainText("agonara_session");
    await expect(page.locator("#learn-app")).not.toContainText("correct horse battery staple");
  } finally {
    await harness.close();
  }
});

test("quickCheckProductUiSession_shouldRefreshAndLogout_onSignedInSession", async ({ page }) => {
  const harness = await startLearnHarness();

  try {
    await signIn(page, harness.baseUrl);

    await page.locator("#refresh-session-button").click();
    await expect(page.locator("#session-summary")).toHaveText("Signed in as Learning Curator");

    await page.locator("#logout-button").click();
    await expect(page.locator("#session-summary")).toHaveText("Signed out");
  } finally {
    await harness.close();
  }
});

test("quickCheckProductUiProgramContext_shouldKeepProgramAndSelectedMode_onTabSelection", async ({ page }) => {
  const harness = await startLearnHarness();

  try {
    await page.goto(`${harness.baseUrl}/learn`);
    await page.locator("#program-id-input").fill("program-1");
    await page.locator("#student-mode-tab").click();

    await expect(page.locator("#program-id-input")).toHaveValue("program-1");
    await expect(page.locator("#student-mode-tab")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#curator-mode-tab")).toHaveAttribute("aria-selected", "false");

    await page.locator("#curator-mode-tab").click();
    await expect(page.locator("#curator-mode-tab")).toHaveAttribute("aria-selected", "true");
  } finally {
    await harness.close();
  }
});

test("quickCheckProductUiSession_shouldDisableQuickCheckActions_onSignedOutSession", async ({ page }) => {
  const harness = await startLearnHarness();

  try {
    await page.goto(`${harness.baseUrl}/learn`);

    await expect(page.locator("#refresh-candidates-button")).toBeDisabled();
    await expect(page.locator("#quick-check-candidate-form").getByRole("button", { name: "Create" })).toBeDisabled();
    await expect(page.locator("#quick-check-answer-form").getByRole("button", { name: "Submit" })).toBeDisabled();
  } finally {
    await harness.close();
  }
});

async function signIn(page, baseUrl) {
  await page.goto(`${baseUrl}/learn`);
  await page.locator("#signin-form input[name='login']").fill("learner@example.test");
  await page.locator("#signin-form input[name='password']").fill("correct horse battery staple");
  await page.locator("#signin-form").getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#signin-status")).toHaveText("Signed in");
}

async function startLearnHarness() {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const now = () => new Date("2026-05-27T10:00:00.000Z");
  const generateId = makeIdGenerator([
    "identity-1",
    "credential-1",
    "session-1",
    "audit-1",
    "session-2",
    "audit-2",
    "session-3",
    "audit-3",
  ]);
  const server = createServer({
    identityCommands: createIdentityCommands({
      bootstrapSecret: "operator-secret",
      database,
      generateId,
      now,
    }),
    log: () => {},
  });
  const baseUrl = await listen(server);
  await bootstrapIdentity(baseUrl);

  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
  };
}

async function bootstrapIdentity(baseUrl) {
  await fetch(`${baseUrl}/identity/bootstrap/admin`, {
    body: JSON.stringify({
      bootstrapSecret: "operator-secret",
      displayName: "Learning Curator",
      login: "learner@example.test",
      password: "correct horse battery staple",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function makeIdGenerator(ids) {
  const nextIds = [...ids];
  return () => nextIds.shift();
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
