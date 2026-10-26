import { expect, test } from "@playwright/test";
import { createCorpusCommands } from "../src/corpus.js";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import { createServer } from "../src/server.js";
import {
  initializeIdentityStorage,
  listOpenAnswerAttemptRecords,
  listQuickCheckAttemptRecords,
  openIdentityDatabase,
} from "../src/storage.js";
import { createStudentWorkspaceCommands } from "../src/student-workspace.js";

test("topicConceptMaterialNavigationCurator_shouldCreateListAcceptAndReject_onCuratorPanel", async ({ page }) => {
  const harness = await startNavigationHarness();

  try {
    await signIn(page, harness.baseUrl);
    await page.locator("#program-id-input").fill(harness.programId);
    await createNavigationCandidateFromUi(page, {
      kind: "topic",
      title: "Eigenvectors",
    });

    await expect(page.locator("#navigation-candidate-list")).toContainText("Eigenvectors");
    await expect(page.locator("#navigation-candidate-list")).toContainText("draft");

    await page.getByRole("button", { name: "Eigenvectors draft" }).click();
    await page.locator("[data-action='accept-navigation-candidate']").click();
    await expect(page.locator("#navigation-candidate-action-status")).toContainText("Accepted Eigenvectors");

    await createNavigationCandidateFromUi(page, {
      body: "Rejected duplicate topic.",
      kind: "concept",
      title: "Duplicate eigenvector coverage",
    });
    await page.getByRole("button", { name: "Duplicate eigenvector coverage draft" }).click();
    await page.locator("[data-action='reject-navigation-candidate']").click();
    await expect(page.locator("#navigation-candidate-action-status")).toContainText(
      "Rejected Duplicate eigenvector coverage",
    );

    await page.locator("#navigation-candidate-status-filter").selectOption("rejected");
    await page.locator("#refresh-navigation-candidates-button").click();
    await expect(page.locator("#navigation-candidate-list")).toContainText("Duplicate eigenvector coverage");
    await expect(page.locator("#student-panel")).not.toContainText("Rejected duplicate topic.");
  } finally {
    await harness.close();
  }
});

test("topicConceptMaterialNavigationStudent_shouldTraverseRedactedGraphWithoutStudentState_onStudentPanel", async ({ page }) => {
  const harness = await startNavigationHarness();

  try {
    await signIn(page, harness.baseUrl, harness.student.login, harness.student.password);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#student-mode-tab").click();
    await page.locator("#refresh-navigation-button").click();

    await expect(page.locator("#program-navigation-summary")).toContainText("Topics 1");
    await expect(page.locator("#navigation-topic-list")).toContainText("Vector spaces current");

    await page.getByRole("button", { name: "Vector spaces current topic" }).click();
    await expect(page.locator("#navigation-node-detail")).toContainText("Vector spaces current");
    await expect(page.locator("#navigation-node-detail")).toContainText("Basis");

    await page.locator("#navigation-node-detail").getByRole("button", { name: "Basis concept" }).click();
    await expect(page.locator("#navigation-node-detail")).toContainText("Basis");
    await expect(page.locator("#navigation-node-detail")).toContainText("Basis reading");

    await page.getByRole("button", { name: "Basis reading material_reference" }).click();
    await expect(page.locator("#navigation-node-detail")).toContainText("https://example.test/basis");
    await expect(page.locator("#navigation-material-backlinks")).toContainText("Basis");
    await expect(page.locator("#navigation-material-backlinks")).toContainText("Vector spaces");

    await page.locator("#navigation-material-backlinks").getByRole("button", { name: "Basis concept" }).click();
    await page.getByRole("button", { name: "Vector spaces revision" }).click();
    await expect(page.locator("#navigation-node-detail")).toContainText("Current revision: no");

    const forbiddenText = await navigationForbiddenText(page);
    expect(forbiddenText).toEqual([]);
    expect(harness.studentWorkspaceCounts()).toEqual({ openAnswerAttempts: 0, quickCheckAttempts: 0 });
  } finally {
    await harness.close();
  }
});

test("topicConceptMaterialNavigationLayout_shouldKeepControlsNamedAndNonOverlapping_onDesktopAndMobile", async ({ page }) => {
  const harness = await startNavigationHarness();

  try {
    for (const viewport of [{ height: 920, width: 1280 }, { height: 940, width: 390 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${harness.baseUrl}/learn`);

      await expect(page.locator("#navigation-section")).toBeVisible();
      await expect(page.locator("#navigation-curator-panel")).toBeVisible();
      await expect(page.getByLabel("Navigation candidate state")).toBeVisible();
      await expect(page.getByLabel("Navigation kind")).toBeVisible();
      await expect(page.getByLabel("Navigation title")).toBeVisible();
      await expect(page.getByLabel("Navigation relationships JSON")).toBeVisible();
      const contentPanel = page.locator("#material-content-curator-panel");
      await expect(contentPanel.getByLabel("Source id", { exact: true })).toBeVisible();
      await expect(contentPanel.getByLabel("Content format")).toBeVisible();
      await expect(contentPanel.getByLabel("Content", { exact: true })).toBeVisible();
      await expect(contentPanel.getByRole("button", { name: "Save source content" })).toBeVisible();
      await expect(contentPanel.getByRole("button", { name: "Read source content" })).toBeVisible();
      await expect(contentPanel.getByRole("button", { name: "Delete source content" })).toBeVisible();
      await expect(contentPanel.getByRole("button", { name: "Withdraw source" })).toBeVisible();
      await expect(contentPanel.getByRole("button", { name: "Reactivate source" })).toBeVisible();
      await expect(contentPanel.getByRole("button", { exact: true, name: "Delete source" })).toBeVisible();
      const lifecyclePanel = page.locator("#entity-lifecycle-panel");
      await expect(lifecyclePanel).toBeVisible();
      await expect(lifecyclePanel.getByLabel("Accepted item family")).toBeVisible();
      await expect(lifecyclePanel.getByLabel("Entity or source id")).toBeVisible();
      await expect(lifecyclePanel.getByRole("button", { exact: true, name: "Withdraw" })).toBeVisible();
      await expect(lifecyclePanel.getByRole("button", { name: "Reactivate" })).toBeVisible();
      await expect(lifecyclePanel.getByRole("button", { name: "Withdrawn items" })).toBeVisible();
      await expect(page.locator("#withdrawn-items-view")).toBeVisible();
      await expect(page.locator("#material-content-view")).toBeVisible();
      await expect(page.locator("#navigation-status")).toHaveAttribute("aria-live", "polite");
      await expect(page.locator("#navigation-candidate-action-status")).toHaveAttribute("aria-live", "polite");
      await expect(page.locator("#source-content-status")).toHaveAttribute("aria-live", "polite");
      await expect(page.locator("#source-lifecycle-status")).toHaveAttribute("aria-live", "polite");
      await expect(page.locator("#entity-lifecycle-status")).toHaveAttribute("aria-live", "polite");
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

async function createNavigationCandidateFromUi(page, { body = "", kind, title }) {
  await page.locator("#navigation-kind-input").selectOption(kind);
  await page.locator("#navigation-title-input").fill(title);
  await page.locator("#navigation-body-input").fill(body);
  await page.locator("#navigation-candidate-form").getByRole("button", { name: "Create navigation" }).click();
  await expect(page.locator("#navigation-candidate-list")).toContainText(title);
}

async function navigationForbiddenText(page) {
  const forbiddenPatterns = [
    /acceptedFromCandidateId/i,
    /acceptedByIdentityId/i,
    /acceptedAt/i,
    /relationshipDrafts/i,
    /sourceIds/i,
    /rationale/i,
    /csrf/i,
    /session/i,
    /cookie/i,
    /select \*/i,
    /stack trace/i,
    /postgres:\/\//i,
    /database-url/i,
    /provider/i,
    /\/tmp\b/i,
  ];
  return page.locator("#navigation-student-panel").evaluate((element, patterns) => {
    const text = element.textContent ?? "";
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

async function startNavigationHarness() {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const now = () => new Date("2026-06-03T10:00:00.000Z");
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
    ...Array.from({ length: 160 }, (_, index) => `id-${index + 1}`),
  ]);
  const programCommands = createProgramCommands({
    database,
    generateId,
    now,
  });
  const studentWorkspaceCommands = createStudentWorkspaceCommands({
    database,
    generateId,
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
    corpusCommands: createCorpusCommands({
      database,
      generateId,
      getEffectiveParticipation: programCommands.getEffectiveParticipation,
      now,
    }),
    studentWorkspaceCommands,
    log: () => {},
  });
  const baseUrl = await listen(server);
  const bootstrap = await bootstrapIdentity(baseUrl);
  const programId = await createProgram(baseUrl, bootstrap, "Linear Algebra");
  const topic = await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
    candidateKind: "topic",
    title: "Vector spaces",
  });
  const concept = await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
    body: "A basis is a linearly independent spanning set.",
    candidateKind: "concept",
    relationshipDrafts: [
      {
        fromEntityId: topic.entityId,
        relationshipKind: "topic_includes_concept",
        toCandidateRef: "self",
      },
    ],
    title: "Basis",
  });
  await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
    candidateKind: "material_reference",
    locator: "https://example.test/basis",
    materialReferenceKind: "article",
    relationshipDrafts: [
      {
        fromEntityId: concept.entityId,
        relationshipKind: "concept_uses_material",
        toCandidateRef: "self",
      },
    ],
    title: "Basis reading",
  });
  await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
    candidateKind: "topic",
    targetEntityId: topic.entityId,
    title: "Vector spaces current",
  });
  const student = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Learning Student",
    login: "student@example.test",
    password: "student password",
  });
  await joinStudentProgram(baseUrl, student, programId);

  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
    programId,
    student,
    studentWorkspaceCounts: () => ({
      openAnswerAttempts: listOpenAnswerAttemptRecords(database).length,
      quickCheckAttempts: listQuickCheckAttemptRecords(database).length,
    }),
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

async function createAcceptedNavigationCandidate(baseUrl, session, programId, body) {
  const { targetEntityId, ...candidateInput } = body;
  const candidate = await fetch(`${baseUrl}/programs/${programId}/navigation-candidates`, {
    body: JSON.stringify(candidateInput),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
  const candidateBody = await candidate.json();
  const accepted = await fetch(
    `${baseUrl}/navigation-candidates/${candidateBody.value.navigationCandidate.candidateId}/acceptance`,
    {
      body: JSON.stringify({ targetEntityId }),
      headers: {
        cookie: session.cookie,
        "content-type": "application/json",
        "x-agonara-csrf": session.csrfToken,
      },
      method: "POST",
    },
  );
  const acceptedBody = await accepted.json();
  return acceptedBody.value.navigationChange.acceptedCorpus;
}

async function createIdentitySession(baseUrl, session, { displayName, login, password }) {
  const identity = await fetch(`${baseUrl}/identity/identities`, {
    body: JSON.stringify({ displayName }),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
  const identityBody = await identity.json();
  await fetch(`${baseUrl}/identity/identities/${identityBody.value.id}/local-password`, {
    body: JSON.stringify({ login, password }),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
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
    login,
    password,
  };
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

test("materialContentReader_shouldRenderAcceptedContentForStudent_onStudentPanel", async ({ page }) => {
  const harness = await startContentHarness();

  try {
    await signIn(page, harness.baseUrl, harness.student.login, harness.student.password);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#student-mode-tab").click();
    await page.locator("#refresh-navigation-button").click();

    await page.getByRole("button", { name: "Vector spaces topic" }).click();
    await page.locator("#navigation-node-detail").getByRole("button", { name: "Basis concept" }).click();
    await page.getByRole("button", { name: "Basis reading material_reference" }).click();
    await expect(page.locator("#material-content-status")).toContainText("Material content available");

    await page.locator("[data-action='open-material-content']").click();
    await expect(page.locator("#material-content-body")).toContainText("Full basis text");
    const panel = await page.locator("#navigation-student-panel").boundingBox();
    const section = await page.locator("#navigation-section").boundingBox();
    expect(panel.x + panel.width).toBeLessThanOrEqual(section.x + section.width);
    await expect(page.locator("#material-content-status")).toContainText("markdown");
    await expect(page.locator("#navigation-material-backlinks")).toContainText("Basis");
    await expect(page.locator("#navigation-material-backlinks")).toContainText("Vector spaces");
    await page.locator("#navigation-material-backlinks").getByRole("button", { name: "Basis concept" }).click();
    await expect(page.locator("#navigation-node-detail")).toContainText("Basis");

    const forbiddenText = await navigationForbiddenText(page);
    expect(forbiddenText).toEqual([]);
  } finally {
    await harness.close();
  }
});

test("materialContentCurator_shouldSaveAndDeleteSourceContent_onCuratorPanel", async ({ page }) => {
  const harness = await startContentHarness();

  try {
    await signIn(page, harness.baseUrl);
    await page.locator("#source-content-id-input").fill(harness.sourceId);
    await page.locator("#source-content-format-input").selectOption("markdown");
    await page.locator("#source-content-input").fill("# Raw lecture notes");
    await page.locator("[data-action='save-source-content']").click();
    await expect(page.locator("#source-content-status")).toContainText("Saved content for " + harness.sourceId);
    await page.locator("#source-content-input").fill("");
    await page.locator("[data-action='read-source-content']").click();
    await expect(page.locator("#source-content-input")).toHaveValue("# Raw lecture notes");

    await page.locator("[data-action='delete-source-content']").click();
    await expect(page.locator("#source-content-status")).toContainText("Deleted content for " + harness.sourceId);

    await page.locator("[data-action='read-source-content']").click();
    await expect(page.locator("#source-content-status")).toContainText("Source content unavailable.");
  } finally {
    await harness.close();
  }
});

test("sourceDeleteCurator_shouldDeleteUnreferencedAndBlockReferencedSource_onCuratorPanel", async ({ page }) => {
  const harness = await startContentHarness();

  try {
    await signIn(page, harness.baseUrl);
    await page.locator("#source-content-id-input").fill(harness.sourceId);
    await page.locator("[data-action='delete-source-record']").click();
    await expect(page.locator("#source-content-status")).toContainText("Deleted source " + harness.sourceId);

    await page.locator("#source-content-id-input").fill(harness.referencedSourceId);
    await page.locator("[data-action='delete-source-record']").click();
    await expect(page.locator("#source-content-status")).toContainText("Source is referenced; withdraw it instead.");

    await page.locator("[data-action='withdraw-source']").click();
    await expect(page.locator("#source-lifecycle-status")).toContainText(
      "Lifecycle status is withdrawn for " + harness.referencedSourceId,
    );
    await expect(page.locator("#withdrawn-items-view")).toContainText(harness.referencedSourceId);
    await page.locator("[data-action='reactivate-source']").click();
    await expect(page.locator("#source-lifecycle-status")).toContainText(
      "Lifecycle status is active for " + harness.referencedSourceId,
    );
  } finally {
    await harness.close();
  }
});

test("entityLifecycleCurator_shouldExplainBlockedWithdrawalDependents_onActiveRelationship", async ({ page }) => {
  const harness = await startNavigationHarness();

  try {
    await signIn(page, harness.baseUrl);
    await page.locator("#entity-lifecycle-family-input").selectOption("corpus");
    await page.locator("#entity-lifecycle-id-input").fill(harness.topic.entityId);
    await page.locator("[data-action='withdraw-entity']").click();

    await expect(page.locator("#entity-lifecycle-status")).toContainText("Withdrawal blocked by active dependents.");
    await expect(page.locator("#entity-lifecycle-status")).toContainText("active relationships");
    await expect(page.locator("#entity-lifecycle-status")).toContainText("readiness requirements");
    await expect(page.locator("#entity-lifecycle-status")).toContainText("open-answer check references");
    await expect(page.locator("#entity-lifecycle-status")).toContainText("learner-evidence target links");
  } finally {
    await harness.close();
  }
});

async function startContentHarness() {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const now = () => new Date("2026-06-03T10:00:00.000Z");
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
    ...Array.from({ length: 160 }, (_, index) => `id-${index + 1}`),
  ]);
  const programCommands = createProgramCommands({ database, generateId, now });
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
  const sourceResponse = await fetch(`${baseUrl}/programs/${programId}/sources`, {
    body: JSON.stringify({ sourceKind: "lecture", title: "Lecture source" }),
    headers: {
      cookie: bootstrap.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": bootstrap.csrfToken,
    },
    method: "POST",
  });
  const sourceId = (await sourceResponse.json()).value.programSource.sourceId;
  const referencedSourceResponse = await fetch(`${baseUrl}/programs/${programId}/sources`, {
    body: JSON.stringify({ sourceKind: "lecture", title: "Referenced lecture source" }),
    headers: {
      cookie: bootstrap.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": bootstrap.csrfToken,
    },
    method: "POST",
  });
  const referencedSourceId = (await referencedSourceResponse.json()).value.programSource.sourceId;
  const topic = await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
    candidateKind: "topic",
    title: "Vector spaces",
  });
  const concept = await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
    candidateKind: "concept",
    relationshipDrafts: [
      {
        fromEntityId: topic.entityId,
        relationshipKind: "topic_includes_concept",
        toCandidateRef: "self",
      },
    ],
    title: "Basis",
  });
  const accepted = await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
    candidateKind: "material_reference",
    locator: "https://example.test/basis",
    materialReferenceKind: "article",
    relationshipDrafts: [
      {
        fromEntityId: concept.entityId,
        relationshipKind: "concept_uses_material",
        toCandidateRef: "self",
      },
    ],
    sourceIds: [referencedSourceId],
    title: "Basis reading",
  });
  const entries = Array.isArray(accepted) ? accepted : [accepted];
  const material = entries.find($0 => $0.acceptedKind === "material_reference") ?? entries[0];
  await fetch(`${baseUrl}/materials/revisions/${material.revisionId}/content`, {
    body: JSON.stringify({ content: `# Full basis text\\nDetailed reading. ${"A basis spans the space and is linearly independent. ".repeat(12)}`, contentFormat: "markdown" }),
    headers: {
      cookie: bootstrap.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": bootstrap.csrfToken,
    },
    method: "PUT",
  });
  const student = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Learning Student",
    login: "student@example.test",
    password: "student password",
  });
  await joinStudentProgram(baseUrl, student, programId);

  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
    programId,
    referencedSourceId,
    sourceId,
    student,
  };
}
