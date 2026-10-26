import { expect, test } from "@playwright/test";
import { createCorpusCommands } from "../src/corpus.js";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import { createServer } from "../src/server.js";
import { initializeIdentityStorage, openIdentityDatabase } from "../src/storage.js";
import { createStudentWorkspaceCommands } from "../src/student-workspace.js";

test("learnerStateCurator_shouldCreateListRefreshAndDeleteTargetLinks", async ({ page }) => {
  const harness = await startLearnerStateHarness({ linked: false, attempted: false });

  try {
    await signIn(page, harness.baseUrl);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#curator-mode-tab").click();
    await page.locator("#refresh-learner-state-target-links-button").click();

    await expect(page.locator("#learner-state-target-link-list")).toContainText("No learner-state target links loaded.");
    await page.locator("#learner-state-target-kind-input").selectOption("topic");
    await page.locator("#learner-state-target-id-input").fill(harness.topic.entityId);
    await page.locator("#learner-state-evidence-owner-kind-input").selectOption("accepted_quick_check");
    await page.locator("#learner-state-evidence-owner-id-input").fill(harness.quickCheck.entityId);
    await page.locator("#learner-state-target-link-form").getByRole("button", { name: "Create target link" }).click();

    await expect(page.locator("#learner-state-target-link-status")).toHaveText("Target link saved");
    await expect(page.locator("#learner-state-target-link-list")).toContainText("topic");
    await expect(page.locator("#learner-state-target-link-list")).toContainText("accepted_quick_check");

    await page.locator("#learner-state-target-link-form").getByRole("button", { name: "Create target link" }).click();
    await expect(page.locator("#learner-state-target-link-list").getByRole("button", { name: /Delete/ })).toHaveCount(1);

    await page.locator("#learner-state-target-link-list").getByRole("button", { name: /Delete/ }).click();
    await expect(page.locator("#learner-state-target-link-status")).toHaveText("Target link deleted");
    await page.locator("#refresh-learner-state-target-links-button").click();
    await expect(page.locator("#learner-state-target-link-list")).toContainText("No learner-state target links loaded.");
    await expect(page.locator("#learner-state-student-panel")).not.toContainText("on_track");
    await expect(page.locator("#learner-state-student-panel")).not.toContainText("quick_check_attempt");
  } finally {
    await harness.close();
  }
});

test("learnerStateStudent_shouldRefreshSummaryOpenEvidenceAndHideNonOwnerState", async ({ page }) => {
  const harness = await startLearnerStateHarness({ linked: true, attempted: true });

  try {
    await signIn(page, harness.baseUrl, harness.student.login, harness.student.password);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#student-mode-tab").click();
    await page.locator("#refresh-learner-state-button").click();

    await expect(page.locator("#learner-state-summary")).toContainText("Program on_track");
    await expect(page.locator("#learner-state-topic-list")).toContainText("Vector spaces");
    await expect(page.locator("#learner-state-check-list")).toContainText("Closure check");
    await page.locator("#learner-state-topic-list").getByRole("button", { name: /Vector spaces/ }).click();
    await expect(page.locator("#learner-state-target-detail")).toContainText("Vector spaces");
    await expect(page.locator("#learner-state-evidence-list")).toContainText("quick_check_attempt");
    await expect(page.locator("#learner-state-evidence-list")).toContainText("positive");
    expect(await learnerStateForbiddenText(page)).toEqual([]);

    await page.locator("#program-id-input").fill("program-without-loaded-learner-state");
    await expect(page.locator("#learner-state-student-panel")).not.toContainText("quick_check_attempt");

    await page.locator("#logout-button").click();
    await signIn(page, harness.baseUrl);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#student-mode-tab").click();
    await page.locator("#refresh-learner-state-button").click();

    await expect(page.locator("#learner-state-status")).toHaveText("Learner state unavailable.");
    await expect(page.locator("#learner-state-target-detail")).toHaveText("Learner-state target unavailable");
    await expect(page.locator("#learner-state-student-panel")).not.toContainText("quick_check_attempt");
  } finally {
    await harness.close();
  }
});

test("learnerStateStudent_shouldShowWeakAreas_onNegativeEvidence", async ({ page }) => {
  const harness = await startLearnerStateHarness({ linked: true, attempted: true, matched: false });

  try {
    await signIn(page, harness.baseUrl, harness.student.login, harness.student.password);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#student-mode-tab").click();
    await page.locator("#refresh-learner-state-button").click();

    await expect(page.locator("#learner-state-summary")).toContainText("Program needs_attention");
    await expect(page.locator("#learner-state-weak-area-list")).toContainText("Vector spaces");
    await expect(page.locator("#learner-state-weak-area-list")).toContainText("Closure check");
    await page.locator("#learner-state-topic-list").getByRole("button", { name: /Vector spaces/ }).click();
    await expect(page.locator("#learner-state-evidence-list")).toContainText("negative");
  } finally {
    await harness.close();
  }
});

test("learnerStateLayout_shouldKeepControlsNamedAndNonOverlapping_onDesktopAndMobile", async ({ page }) => {
  const harness = await startLearnerStateHarness({ linked: false, attempted: false });

  try {
    for (const viewport of [{ height: 960, width: 1280 }, { height: 980, width: 390 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${harness.baseUrl}/learn`);

      await expect(page.locator("#learner-state-section")).toBeVisible();
      await expect(page.locator("#learner-state-target-link-panel")).toBeVisible();
      await expect(page.locator("#learner-state-student-panel")).toBeVisible();
      await expect(page.getByLabel("Learner target kind")).toBeVisible();
      await expect(page.getByLabel("Evidence owner kind")).toBeVisible();
      await expect(page.locator("#learner-state-status")).toHaveAttribute("aria-live", "polite");
      await expect(page.locator("#learner-state-target-link-status")).toHaveAttribute("aria-live", "polite");
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

async function learnerStateForbiddenText(page) {
  const forbiddenPatterns = [
    /answerKey/i,
    /acceptedFromCandidateId/i,
    /candidateId/i,
    /createdByIdentityId/i,
    /sourceIds/i,
    /rationale/i,
    /idempotency/i,
    /csrf/i,
    /session/i,
    /cookie/i,
    /select \*/i,
    /stack trace/i,
    /postgres:\/\//i,
    /database-url/i,
    /raw prompt/i,
    /raw model/i,
    /provider/i,
    /\/tmp\b/i,
  ];
  return page.locator("#learner-state-student-panel").evaluate((element, patterns) => {
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

async function startLearnerStateHarness({ linked, attempted, matched = true }) {
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
    ...Array.from({ length: 180 }, (_, index) => `id-${index + 1}`),
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
  const server = createServer({
    identityCommands: createIdentityCommands({
      bootstrapSecret: "operator-secret",
      database,
      generateId,
      now,
    }),
    programCommands,
    corpusCommands,
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
  const quickCheck = await createAcceptedQuickCheck(baseUrl, bootstrap, programId);
  const student = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Learning Student",
    login: "student@example.test",
    password: "student password",
  });
  await joinStudentProgram(baseUrl, student, programId);
  if (linked) {
    await createLearnerStateTargetLink(baseUrl, bootstrap, programId, {
      evidenceOwnerEntityId: quickCheck.entityId,
      evidenceOwnerKind: "accepted_quick_check",
      targetId: topic.entityId,
      targetKind: "topic",
    });
  }
  if (attempted) {
    const selectedOption = matched
      ? quickCheck.options.find($0 => $0.optionId === quickCheck.answerKeyOptionId)
      : quickCheck.options.find($0 => $0.optionId !== quickCheck.answerKeyOptionId);
    await submitQuickCheckAttempt(baseUrl, student, programId, {
      checkRevisionId: quickCheck.revisionId,
      selectedOptionId: selectedOption.optionId,
    });
  }

  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
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
  const { targetEntityId, ...candidateInput } = body;
  const candidate = await fetch(`${baseUrl}/programs/${programId}/navigation-candidates`, {
    body: JSON.stringify(candidateInput),
    headers: jsonHeaders(session),
    method: "POST",
  });
  const candidateBody = await candidate.json();
  const accepted = await fetch(
    `${baseUrl}/navigation-candidates/${candidateBody.value.navigationCandidate.candidateId}/acceptance`,
    {
      body: JSON.stringify({ targetEntityId }),
      headers: jsonHeaders(session),
      method: "POST",
    },
  );
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

async function createLearnerStateTargetLink(baseUrl, session, programId, body) {
  await fetch(`${baseUrl}/programs/${programId}/learner-state-target-links`, {
    body: JSON.stringify(body),
    headers: jsonHeaders(session),
    method: "POST",
  });
}

async function submitQuickCheckAttempt(baseUrl, session, programId, body) {
  await fetch(`${baseUrl}/programs/${programId}/quick-check-attempts`, {
    body: JSON.stringify(body),
    headers: {
      ...jsonHeaders(session),
      "x-agonara-idempotency-key": "learner-state-ui-attempt",
    },
    method: "POST",
  });
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
