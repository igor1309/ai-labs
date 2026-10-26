// From agonara/: node showcase/screenshots.mjs <output directory>
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createCorpusCommands } from "../src/corpus.js";
import { createCuratorWorkspaceCommands } from "../src/curator-workspace.js";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import { createServer } from "../src/server.js";
import { initializeIdentityStorage, openIdentityDatabase } from "../src/storage.js";
import { createStudentWorkspaceCommands } from "../src/student-workspace.js";

const ada = { displayName: "Ada Curator", login: "ada@example.test", password: "Ada demo password" };
const sam = { displayName: "Sam Student", login: "sam@example.test", password: "Sam demo password" };
const programTitle = "Probability Basics";
const materialTitle = "A first look at probability";
const checkTitle = "Probability of an even roll";
const materialContent = "A sample space contains every possible outcome of an experiment. "
  + "For a fair six-sided die, the sample space is {1, 2, 3, 4, 5, 6}. "
  + "The event ‘an even roll’ contains three outcomes: 2, 4, and 6. "
  + "Each outcome is equally likely, so the probability of this event is 3/6, or one half.";

export function createApi(baseUrl, fetchImpl = fetch) {
  return async function api(step, path, { session, body, method = "POST", headers = {} } = {}) {
    return atStep(step, async () => {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(session ? { cookie: session.cookie, "x-agonara-csrf": session.csrfToken } : {}),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json();
      if (!response.ok || result.status !== "accepted") {
        throw new Error(`${method} ${path}: HTTP ${response.status} ${JSON.stringify(result)}`);
      }
      return { ...result.value, cookie: response.headers.get("set-cookie")?.split(";")[0] };
    });
  };
}

export async function seed(api) {
  const curator = await api("bootstrap Ada Curator", "/identity/bootstrap/admin", {
    body: { ...ada, bootstrapSecret: "showcase-bootstrap-secret" },
  });
  const { program } = await api("create Probability Basics", "/programs", {
    session: curator, body: { title: programTitle },
  });
  const programPath = `/programs/${program.programId}`;
  async function navigation(input) {
    const { navigationCandidate } = await api(`draft ${input.title}`, `${programPath}/navigation-candidates`, {
      session: curator, body: input,
    });
    const { navigationChange } = await api(`accept ${input.title}`,
      `/navigation-candidates/${navigationCandidate.candidateId}/acceptance`, { session: curator, body: {} });
    const entries = [navigationChange.acceptedCorpus].flat();
    const entity = entries.find(entry => entry.acceptedKind === input.candidateKind);
    if (!entity) throw new Error(`accept ${input.title}: accepted entity missing`);
    return entity;
  }
  const events = await navigation({ candidateKind: "topic", title: "Events and outcomes" });
  const conditional = await navigation({ candidateKind: "topic", title: "Conditional probability" });
  async function concept(topic, title, body) {
    return navigation({
      candidateKind: "concept", title, body,
      relationshipDrafts: [{ fromEntityId: topic.entityId, relationshipKind: "topic_includes_concept", toCandidateRef: "self" }],
    });
  }
  const sampleSpace = await concept(events, "Sample space", "The set of all possible outcomes of an experiment.");
  await concept(events, "Independent events", "Knowing that one event occurred does not change the probability of the other.");
  await concept(conditional, "Bayes' rule", "Update a probability using new evidence and the likelihood of that evidence.");
  const material = await navigation({
    candidateKind: "material_reference", title: materialTitle,
    materialReferenceKind: "article", locator: "https://example.org/probability-basics",
    relationshipDrafts: [{ fromEntityId: sampleSpace.entityId, relationshipKind: "concept_uses_material", toCandidateRef: "self" }],
  });
  await api("store accepted material content", `/materials/revisions/${material.revisionId}/content`, {
    session: curator, method: "PUT", body: { content: materialContent, contentFormat: "plain_text" },
  });
  const { quickCheckCandidate } = await api("draft Quick Check", `${programPath}/quick-checks/candidates`, {
    session: curator,
    body: {
      checkKind: "single_select_quick_check", title: checkTitle,
      prompt: "What is the probability of rolling an even number on a fair six-sided die?",
      options: ["1/2 — three of the six outcomes", "1/6 — only one outcome"], answerKeyOptionIndex: 0,
      rationale: "The event {2, 4, 6} contains three of the six equally likely outcomes.", sourceIds: [],
    },
  });
  const { acceptedQuickCheck } = await api("accept Quick Check",
    `/quick-checks/candidates/${quickCheckCandidate.candidateId}/acceptance`, { session: curator, body: {} });
  const identity = await api("create Sam Student", "/identity/identities", {
    session: curator, body: { displayName: sam.displayName },
  });
  await api("bind Sam's password", `/identity/identities/${identity.id}/local-password`, {
    session: curator, body: { login: sam.login, password: sam.password },
  });
  const student = await api("sign in Sam for seeding", "/identity/sessions", {
    body: { login: sam.login, password: sam.password },
  });
  await api("join Sam to Probability Basics", `${programPath}/student-membership`, { session: student });
  await api("submit Sam's Quick Check attempt", `${programPath}/quick-check-attempts`, {
    session: student, headers: { "x-agonara-idempotency-key": randomUUID() },
    body: { checkRevisionId: acceptedQuickCheck.revisionId, selectedOptionId: acceptedQuickCheck.answerKeyOptionId },
  });
  return program.programId;
}

async function atStep(name, action) {
  try {
    return await action();
  } catch (error) {
    throw new Error(`${name}: ${error.message}`, { cause: error });
  }
}

export async function capture(browser, baseUrl, programId, outputDirectory) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  // Assertions use the root's Playwright installation, just like the browser.
  const require = createRequire(new URL("../../package.json", import.meta.url));
  const { expect } = require("@playwright/test");
  async function signIn(person, admin = false) {
    await page.goto(`${baseUrl}/${admin ? "admin" : "learn"}`);
    const form = page.locator(admin ? "#login-form" : "#signin-form");
    await form.locator("input[name='login']").fill(person.login);
    await form.locator("input[name='password']").fill(person.password);
    await form.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator(admin ? "#session-chip" : "#session-summary")).toContainText(person.displayName);
    if (!admin) await page.locator("#program-id-input").fill(programId);
  }
  async function shot(selector, filename) {
    const section = page.locator(selector);
    await expect(section).toBeVisible();
    await section.screenshot({ path: resolve(outputDirectory, filename), animations: "disabled" });
  }
  await atStep("learn-student-navigation.png", async () => {
    await signIn(sam);
    await page.locator("#student-mode-tab").click();
    await page.locator("#refresh-navigation-button").click();
    await page.getByRole("button", { name: "Events and outcomes topic", exact: true }).click();
    await page.locator("#navigation-node-detail").getByRole("button", { name: "Sample space concept", exact: true }).click();
    await page.getByRole("button", { name: `${materialTitle} material_reference`, exact: true }).click();
    await page.locator("[data-action='open-material-content']").click();
    await expect(page.locator("#material-content-body")).toHaveText(materialContent);
    await expect(page.locator("#navigation-topic-list")).toContainText("Conditional probability");
    await shot("#navigation-student-panel", "learn-student-navigation.png");
  });
  await atStep("learn-quick-check.png", async () => {
    await page.locator("#quick-check-delivery-list").getByRole("button", { name: checkTitle, exact: true }).click();
    await expect(page.locator("#quick-check-delivery-detail")).toContainText("What is the probability of rolling an even number");
    await page.locator("#quick-check-attempt-list").getByRole("button", { name: checkTitle, exact: true }).click();
    await expect(page.locator("#quick-check-attempt-detail")).toContainText("Selected: 1/2 — three of the six outcomes");
    await shot("#student-panel", "learn-quick-check.png");
  });
  await atStep("learn-coverage-gaps.png", async () => {
    await page.locator("#logout-button").click();
    await signIn(ada);
    await page.locator("#refresh-coverage-gaps-button").click();
    await expect(page.locator("#coverage-gap-status")).toHaveText("Coverage gaps loaded.");
    await page.locator("#coverage-gap-list").getByRole("button").filter({ hasText: "Conditional probability" }).first().click();
    await expect(page.locator("#coverage-gap-detail")).toContainText("Conditional probability");
    await shot("#coverage-gap-section", "learn-coverage-gaps.png");
  });
  await atStep("admin-board.png", async () => {
    await page.locator("#logout-button").click();
    await signIn(ada, true);
    await expect(page.locator("#identity-list")).toContainText(ada.displayName);
    await expect(page.locator("#identity-list")).toContainText(sam.displayName);
    await page.screenshot({ path: resolve(outputDirectory, "admin-board.png"), fullPage: true, animations: "disabled" });
  });
}

export async function runShowcase({ outputDirectory, chromium, fetchImpl = fetch }) {
  if (!outputDirectory) throw new Error("Usage: node showcase/screenshots.mjs <output directory>");
  const database = openIdentityDatabase();
  let server;
  let browser;
  try {
    initializeIdentityStorage(database);
    const dependencies = { database, generateId: randomUUID, now: () => new Date() };
    const programCommands = createProgramCommands(dependencies);
    const participation = { ...dependencies, getEffectiveParticipation: programCommands.getEffectiveParticipation };
    const corpusCommands = createCorpusCommands(participation);
    server = createServer({
      identityCommands: createIdentityCommands({ ...dependencies, bootstrapSecret: "showcase-bootstrap-secret" }),
      programCommands, corpusCommands,
      curatorWorkspaceCommands: createCuratorWorkspaceCommands({ ...participation, corpusCommands }),
      studentWorkspaceCommands: createStudentWorkspaceCommands(participation),
      log: () => {},
    });
    await atStep("start showcase server", () => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    }));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const programId = await seed(createApi(baseUrl, fetchImpl));
    await mkdir(outputDirectory, { recursive: true });
    browser = await atStep("launch Chromium", () => chromium.launch());
    await capture(browser, baseUrl, programId, outputDirectory);
    console.log(`Saved four screenshots to ${resolve(outputDirectory)}`);
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      try {
        if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      } finally {
        database.close();
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const require = createRequire(new URL("../../package.json", import.meta.url));
    const { chromium } = require("playwright");
    await runShowcase({ outputDirectory: process.argv[2], chromium });
  } catch (error) {
    console.error(`Showcase failed: ${error.message}`);
    process.exitCode = 1;
  }
}
