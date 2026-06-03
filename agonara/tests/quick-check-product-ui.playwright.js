import { expect, test } from "@playwright/test";
import { createCorpusCommands } from "../src/corpus.js";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
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
    await expect(page.locator("#learn-app")).not.toContainText("login-session-secret");
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

test("quickCheckProductUiCurator_shouldCreateAndListDraftCandidate_onCuratorMode", async ({ page }) => {
  const harness = await startLearnHarness();

  try {
    await signIn(page, harness.baseUrl);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#quick-check-title-input").fill("Vector-space definition");
    await page.locator("#quick-check-prompt-input").fill("Which statement describes a vector space?");
    await page.locator("input[name='optionText']").nth(0).fill("A set with addition only");
    await page.locator("input[name='optionText']").nth(1).fill("A set closed under addition and scalar multiplication");
    await page.locator("input[name='answerKeyOptionIndex']").nth(1).check();
    await page.locator("#quick-check-rationale-input").fill("The second option includes both closure requirements.");
    await page.locator("#quick-check-candidate-form").getByRole("button", { name: "Create" }).click();

    await expect(page.locator("#quick-check-candidate-list")).toContainText("Vector-space definition");
    await expect(page.locator("#quick-check-candidate-list")).toContainText("draft");
  } finally {
    await harness.close();
  }
});

test("quickCheckProductUiCurator_shouldAcceptRejectAndInspectCuration_onCuratorMode", async ({ page }) => {
  const harness = await startLearnHarness();

  try {
    await signIn(page, harness.baseUrl);
    await page.locator("#program-id-input").fill(harness.programId);
    await createQuickCheckCandidateFromUi(page, {
      answerIndex: 0,
      options: ["Closure under addition", "Finite dimension"],
      prompt: "Which property is required for a vector space?",
      rationale: "Closure is required.",
      title: "Closure check",
    });
    await page.getByRole("button", { name: "Closure check draft" }).click();
    await page.getByRole("button", { name: "Accept" }).click();
    await page.getByRole("button", { name: "Inspect" }).click();

    await expect(page.locator("#quick-check-curation-detail")).toContainText("Closure check");
    await expect(page.locator("#quick-check-curation-detail")).toContainText("Answer: Closure under addition");

    await createQuickCheckCandidateFromUi(page, {
      answerIndex: 1,
      options: ["No closure", "Closure under scalar multiplication"],
      prompt: "Which property is also required?",
      rationale: "Rejecting duplicate coverage.",
      title: "Scalar closure check",
    });
    await page.getByRole("button", { name: "Scalar closure check draft" }).click();
    await page.getByRole("button", { name: "Reject" }).click();
    await page.locator("#quick-check-candidate-status-filter").selectOption("rejected");
    await page.locator("#refresh-candidates-button").click();

    await expect(page.locator("#quick-check-candidate-list")).toContainText("Scalar closure check");
    await expect(page.locator("#student-panel")).not.toContainText("Answer: Closure under addition");
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

async function createQuickCheckCandidateFromUi(page, { answerIndex, options, prompt, rationale, title }) {
  await page.locator("#quick-check-title-input").fill(title);
  await page.locator("#quick-check-prompt-input").fill(prompt);
  await page.locator("input[name='optionText']").nth(0).fill(options[0]);
  await page.locator("input[name='optionText']").nth(1).fill(options[1]);
  await page.locator("input[name='answerKeyOptionIndex']").nth(answerIndex).check();
  await page.locator("#quick-check-rationale-input").fill(rationale);
  await page.locator("#quick-check-candidate-form").getByRole("button", { name: "Create" }).click();
  await expect(page.locator("#quick-check-candidate-list")).toContainText(title);
}

async function startLearnHarness() {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const now = () => new Date("2026-05-27T10:00:00.000Z");
  const generateId = makeIdGenerator([
    "identity-1",
    "credential-1",
    "bootstrap-session-secret",
    "audit-1",
    "program-1",
    "membership-1",
    "program-event-1",
    "membership-event-1",
    "login-session-secret",
    "audit-2",
    ...Array.from({ length: 100 }, (_, index) => `id-${index + 1}`),
  ]);
  const programCommands = createProgramCommands({
    database,
    generateId,
    now,
  });
  const server = createServer({
    identityCommands: createIdentityCommands({
      bootstrapSecret: "operator-secret",
      database,
      generateId,
      now,
    }),
    programCommands,
    corpusCommands: createCorpusCommands({
      database,
      generateId,
      getEffectiveParticipation: programCommands.getEffectiveParticipation,
      now,
    }),
    log: () => {},
  });
  const baseUrl = await listen(server);
  const bootstrap = await bootstrapIdentity(baseUrl);
  const programId = await createProgram(baseUrl, bootstrap, "Linear Algebra");

  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
    programId,
  };
}

async function bootstrapIdentity(baseUrl) {
  const response = await fetch(`${baseUrl}/identity/bootstrap/admin`, {
    body: JSON.stringify({
      bootstrapSecret: "operator-secret",
      displayName: "Learning Curator",
      login: "learner@example.test",
      password: "correct horse battery staple",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = await response.json();
  return {
    cookie: response.headers.get("set-cookie"),
    csrfToken: body.value.csrfToken,
  };
}

async function createProgram(baseUrl, session, title) {
  const response = await fetch(`${baseUrl}/programs`, {
    body: JSON.stringify({ title }),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
  const body = await response.json();
  return body.value.program.programId;
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
