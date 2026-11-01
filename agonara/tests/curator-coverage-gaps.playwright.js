import { expect, test } from "@playwright/test";
import { createCorpusCommands } from "../src/corpus.js";
import { createCuratorWorkspaceCommands } from "../src/curator-workspace.js";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import { createServer } from "../src/server.js";
import { initializeIdentityStorage, openIdentityDatabase } from "../src/storage.js";
import { createStudentWorkspaceCommands } from "../src/student-workspace.js";

test("coverageGapCurator_shouldRefreshFilterOpenDetailAndHideProtectedMetadata", async ({ page }) => {
  const harness = await startCoverageGapHarness();

  try {
    await signIn(page, harness.baseUrl);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#refresh-coverage-gaps-button").click();

    await expect(page.locator("#coverage-gap-status")).toHaveText("Coverage gaps loaded.");
    await expect(page.locator("#coverage-gap-summary")).toContainText("Gaps 5");
    await expect(page.locator("#coverage-gap-list")).toContainText("critical");
    await expect(page.locator("#coverage-gap-list")).toContainText("Vector spaces");
    await expect(page.locator("#coverage-gap-list")).toContainText("draft_guidance");

    await page.locator("#coverage-gap-kind-filter-input").fill("topic_without_checks, check_without_target_links");
    await page.locator("#coverage-gap-minimum-severity-input").selectOption("warning");
    await page.locator("#refresh-coverage-gaps-button").click();
    await expect(page.locator("#coverage-gap-list")).toContainText("Closure check");
    await expect(page.locator("#coverage-gap-list")).not.toContainText("topic_without_materials");

    await page.locator("#coverage-gap-list").getByRole("button", { name: /Vector spaces/ }).click();
    await expect(page.locator("#coverage-gap-detail")).toContainText("Vector spaces");
    await expect(page.locator("#coverage-gap-detail")).toContainText("topic_without_checks");
    await expect(page.locator("#coverage-gap-detail")).toContainText("draft_guidance");
    await expect(page.locator("#coverage-gap-detail")).toContainText("has topic without checks");
    expect(await coverageGapForbiddenText(page)).toEqual([]);
  } finally {
    await harness.close();
  }
});

test("coverageGapCurator_shouldFilterTopicAndConceptScopes", async ({ page }) => {
  const harness = await startCoverageGapHarness();

  try {
    await signIn(page, harness.baseUrl);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#coverage-gap-scope-kind-input").selectOption("topic");
    await page.locator("#coverage-gap-scope-id-input").fill(harness.topic.entityId);
    await page.locator("#refresh-coverage-gaps-button").click();

    await expect(page.locator("#coverage-gap-summary")).toContainText("Scope topic");
    await expect(page.locator("#coverage-gap-list")).toContainText("Vector spaces");
    await expect(page.locator("#coverage-gap-list")).not.toContainText("Basis");

    await page.locator("#coverage-gap-scope-kind-input").selectOption("concept");
    await page.locator("#coverage-gap-scope-id-input").fill(harness.concept.entityId);
    await page.locator("#coverage-gap-kind-filter-input").fill("concept_without_materials,concept_without_checks");
    await page.locator("#refresh-coverage-gaps-button").click();

    await expect(page.locator("#coverage-gap-summary")).toContainText("Scope concept");
    await expect(page.locator("#coverage-gap-list")).toContainText("Basis");
    await expect(page.locator("#coverage-gap-list")).not.toContainText("Vector spaces");
  } finally {
    await harness.close();
  }
});

test("coverageGapUi_shouldDenyStudentAndAdminOnlySessions", async ({ page }) => {
  const harness = await startCoverageGapHarness();

  try {
    await signIn(page, harness.baseUrl, harness.student.login, harness.student.password);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#refresh-coverage-gaps-button").click();
    await expect(page.locator("#coverage-gap-status")).toHaveText("Coverage gaps unavailable.");
    await expect(page.locator("#coverage-gap-list")).toContainText("No coverage gaps loaded.");

    await page.locator("#logout-button").click();
    await signIn(page, harness.baseUrl, harness.admin.login, harness.admin.password);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#refresh-coverage-gaps-button").click();
    await expect(page.locator("#coverage-gap-status")).toHaveText("Coverage gaps unavailable.");
    await expect(page.locator("#coverage-gap-list")).toContainText("No coverage gaps loaded.");
  } finally {
    await harness.close();
  }
});

test("coverageGapLayout_shouldKeepControlsNamedNonOverlappingAndPreserveLearnWorkflows", async ({ page }) => {
  const harness = await startCoverageGapHarness();

  try {
    for (const viewport of [{ height: 1080, width: 1280 }, { height: 1100, width: 390 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${harness.baseUrl}/learn`);

      await expect(page.locator("#coverage-gap-section")).toBeVisible();
      await expect(page.locator("#coverage-gap-curator-panel")).toBeVisible();
      await expect(page.getByLabel("Coverage scope kind")).toBeVisible();
      await expect(page.getByLabel("Coverage gap kinds")).toBeVisible();
      await expect(page.locator("#coverage-gap-status")).toHaveAttribute("aria-live", "polite");
      await expect(page.locator("#quick-check-candidate-form").getByRole("button", { name: "Create" })).toBeVisible();
      await expect(page.locator("#navigation-section")).toBeVisible();
      await expect(page.locator("#learner-state-section")).toBeVisible();
      await expect(page.locator("#readiness-check-section")).toBeVisible();
      expect(await visibleControlOverlaps(page)).toEqual([]);
    }
  } finally {
    await harness.close();
  }
});

async function signIn(page, baseUrl, login = "learner@example.test", password = "correct horse battery staple") {
  await page.goto(`${baseUrl}/learn`);
  await page.locator("#signin-form input[name='login']").fill(login);
  await page.locator("#signin-form input[name='password']").fill(password);
  await page.locator("#signin-form").getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#signin-status")).toHaveText("Signed in");
}

async function coverageGapForbiddenText(page) {
  const forbiddenPatterns = [
    /acceptedByIdentityId/i,
    /acceptedFromCandidateId/i,
    /answerKey/i,
    /candidateId/i,
    /correctness/i,
    /createdByIdentityId/i,
    /csrf/i,
    /cookie/i,
    /database-url/i,
    /feedback/i,
    /idempotency/i,
    /provider/i,
    /rationale/i,
    /raw model/i,
    /raw prompt/i,
    /select \*/i,
    /session/i,
    /sourceIds/i,
    /stack trace/i,
    /submittedAnswer/i,
    /\/tmp\b/i,
    /postgres:\/\//i,
  ];
  return page.locator("#coverage-gap-section").evaluate((element, patterns) => {
    const attributeText = Array.from(element.querySelectorAll("*"))
      .flatMap($0 => Array.from($0.attributes).map(attribute => attribute.value))
      .join(" ");
    const text = [element.textContent ?? "", attributeText].join(" ");
    return patterns
      .map($0 => new RegExp($0.source, $0.flags))
      .filter($0 => $0.test(text))
      .map($0 => String($0));
  }, forbiddenPatterns);
}

async function visibleControlOverlaps(page) {
  return page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll("button, input, select, textarea"))
      .filter(element => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      })
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        return {
          index,
          label: element.id || element.getAttribute("name") || element.textContent.trim(),
          rect: {
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            top: rect.top,
          },
        };
      });
    const overlaps = [];
    for (let firstIndex = 0; firstIndex < controls.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < controls.length; secondIndex += 1) {
        const first = controls[firstIndex];
        const second = controls[secondIndex];
        const horizontal = Math.min(first.rect.right, second.rect.right) - Math.max(first.rect.left, second.rect.left);
        const vertical = Math.min(first.rect.bottom, second.rect.bottom) - Math.max(first.rect.top, second.rect.top);
        if (horizontal > 2 && vertical > 2) {
          overlaps.push(first.label + " overlaps " + second.label);
        }
      }
    }
    return overlaps;
  });
}

async function startCoverageGapHarness() {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const now = () => new Date("2026-06-04T10:00:00.000Z");
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
    ...Array.from({ length: 220 }, (_, index) => `id-${index + 1}`),
  ]);
  const programCommands = createProgramCommands({
    database,
    generateId,
    now,
  });
  const corpusCommands = createCorpusCommands({
    database,
    generateId,
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
    now,
  });
  const studentWorkspaceCommands = createStudentWorkspaceCommands({
    database,
    generateId,
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
    now,
  });
  const curatorWorkspaceCommands = createCuratorWorkspaceCommands({
    corpusCommands,
    database,
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
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
    corpusCommands,
    curatorWorkspaceCommands,
    studentWorkspaceCommands,
    log: () => {},
  });
  const baseUrl = await listen(server);
  const bootstrap = await bootstrapIdentity(baseUrl);
  const programId = await createProgram(baseUrl, bootstrap, "Linear Algebra");
  const topic = await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
    candidateKind: "topic",
    sourceIds: [],
    title: "Vector spaces",
  });
  const concept = await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
    candidateKind: "concept",
    relationshipDrafts: [{
      fromEntityId: topic.entityId,
      relationshipKind: "topic_includes_concept",
      sourceIds: [],
      toCandidateRef: "self",
    }],
    sourceIds: [],
    title: "Basis",
  });
  const quickCheck = await createAcceptedQuickCheck(baseUrl, bootstrap, programId);
  const student = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Learning Student",
    login: "student@example.test",
    password: "student password",
  });
  const admin = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Admin Only",
    login: "admin-only@example.test",
    password: "admin password",
  });
  await grantAdmin(baseUrl, bootstrap, admin.identityId);
  await joinStudentProgram(baseUrl, student, programId);

  return {
    admin,
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
    concept,
    programId,
    quickCheck,
    student,
    topic,
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
    headers: jsonHeaders(session),
    method: "POST",
  });
  const body = await response.json();
  return body.value.program.programId;
}

async function createAcceptedNavigationCandidate(baseUrl, session, programId, body) {
  const candidate = await fetch(`${baseUrl}/programs/${programId}/navigation-candidates`, {
    body: JSON.stringify(body),
    headers: jsonHeaders(session),
    method: "POST",
  });
  const candidateBody = await candidate.json();
  if (candidateBody.status !== "accepted") {
    throw new Error(JSON.stringify(candidateBody));
  }
  const accepted = await fetch(`${baseUrl}/navigation-candidates/${candidateBody.value.navigationCandidate.candidateId}/acceptance`, {
    body: JSON.stringify({}),
    headers: jsonHeaders(session),
    method: "POST",
  });
  const acceptedBody = await accepted.json();
  return acceptedBody.value.navigationChange.acceptedCorpus;
}

async function createAcceptedQuickCheck(baseUrl, session, programId) {
  const candidate = await fetch(`${baseUrl}/programs/${programId}/quick-checks/candidates`, {
    body: JSON.stringify({
      answerKeyOptionIndex: 0,
      checkKind: "single_select_quick_check",
      options: ["Closure under addition", "Finite dimension"],
      prompt: "Which property is required?",
      rationale: "Closure is required.",
      sourceIds: [],
      title: "Closure check",
    }),
    headers: jsonHeaders(session),
    method: "POST",
  });
  const candidateBody = await candidate.json();
  const accepted = await fetch(`${baseUrl}/quick-checks/candidates/${candidateBody.value.quickCheckCandidate.candidateId}/acceptance`, {
    body: JSON.stringify({}),
    headers: jsonHeaders(session),
    method: "POST",
  });
  const acceptedBody = await accepted.json();
  return acceptedBody.value.acceptedQuickCheck;
}

async function createIdentitySession(baseUrl, session, { displayName, login, password }) {
  const identity = await fetch(`${baseUrl}/identity/identities`, {
    body: JSON.stringify({ displayName }),
    headers: jsonHeaders(session),
    method: "POST",
  });
  const identityBody = await identity.json();
  await fetch(`${baseUrl}/identity/identities/${identityBody.value.id}/local-password`, {
    body: JSON.stringify({ login, password }),
    headers: jsonHeaders(session),
    method: "POST",
  });
  const loginResponse = await fetch(`${baseUrl}/identity/sessions`, {
    body: JSON.stringify({ login, password }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const loginBody = await loginResponse.json();
  return {
    cookie: loginResponse.headers.get("set-cookie"),
    csrfToken: loginBody.value.csrfToken,
    displayName,
    identityId: identityBody.value.id,
    login,
    password,
  };
}

async function grantAdmin(baseUrl, session, identityId) {
  await fetch(`${baseUrl}/identity/identities/${identityId}/admin`, {
    body: JSON.stringify({}),
    headers: jsonHeaders(session),
    method: "POST",
  });
}

async function joinStudentProgram(baseUrl, session, programId) {
  await fetch(`${baseUrl}/programs/${programId}/student-membership`, {
    headers: {
      cookie: session.cookie,
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
}

function jsonHeaders(session) {
  return {
    cookie: session.cookie,
    "content-type": "application/json",
    "x-agonara-csrf": session.csrfToken,
  };
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
    server.closeAllConnections();
  });
}
