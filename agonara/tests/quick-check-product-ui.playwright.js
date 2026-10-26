import { expect, test } from "@playwright/test";
import { createCorpusCommands } from "../src/corpus.js";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import { createServer } from "../src/server.js";
import { initializeIdentityStorage, openIdentityDatabase } from "../src/storage.js";
import { createStudentWorkspaceCommands } from "../src/student-workspace.js";

test("quickCheckProductUiSession_shouldSignIn_onKnownLocalPasswordCredential", async ({ page }) => {
  const harness = await startLearnHarness();

  try {
    await page.goto(`${harness.baseUrl}/learn`);
    await page.locator("#signin-form input[name='login']").fill("learner@example.test");
    await page.locator("#signin-form input[name='password']").fill("correct horse battery staple");
    await page.locator("#signin-form").getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator("#session-summary")).toHaveText("Signed in as Learning Curator");
    await expect(page.locator("#signin-status")).toHaveText("Signed in");
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

test("quickCheckProductUiStudent_shouldListDeliverySubmitRetryAndReadOwnedAttempt_onStudentMode", async ({ page }) => {
  const harness = await startLearnHarness();

  try {
    await signIn(page, harness.baseUrl, harness.student.login, harness.student.password);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#student-mode-tab").click();

    await expect(page.locator("#quick-check-delivery-list")).toContainText("Student closure check");
    await page.getByRole("button", { name: "Student closure check" }).click();
    await expect(page.locator("#quick-check-delivery-detail")).toContainText("Which property is required?");
    await expect(page.locator("#quick-check-delivery-detail")).not.toContainText("Answer:");

    await page.locator("input[name='selectedQuickCheckOption']").nth(0).check();
    await page.locator("#quick-check-answer-form").getByRole("button", { name: "Submit" }).click();
    await expect(page.locator("#quick-check-submit-status")).toHaveText("Attempt submitted");

    await page.locator("#quick-check-answer-form").getByRole("button", { name: "Submit" }).click();
    await expect(page.locator("#quick-check-attempt-list").getByRole("button")).toHaveCount(1);

    await page.locator("#quick-check-attempt-list").getByRole("button").click();
    await expect(page.locator("#quick-check-attempt-detail")).toContainText("Student closure check");
    await expect(page.locator("#quick-check-attempt-detail")).toContainText("Result: matched");
    await expect(page.locator("#quick-check-attempt-detail")).not.toContainText("idempotency");
  } finally {
    await harness.close();
  }
});

test("quickCheckProductUiStudent_shouldShowUnavailable_onNonOwnerAttemptLookup", async ({ page }) => {
  const harness = await startLearnHarness();

  try {
    await signIn(page, harness.baseUrl, harness.student.login, harness.student.password);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#student-mode-tab").click();
    await page.getByRole("button", { name: "Student closure check" }).click();
    await page.locator("input[name='selectedQuickCheckOption']").nth(0).check();
    await page.locator("#quick-check-answer-form").getByRole("button", { name: "Submit" }).click();
    await expect(page.locator("#quick-check-submit-status")).toHaveText("Attempt submitted");
    const attemptId = await page.locator("#quick-check-attempt-detail").getAttribute("data-attempt-id");

    await page.locator("#logout-button").click();
    await signIn(page, harness.baseUrl, harness.otherStudent.login, harness.otherStudent.password);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#student-mode-tab").click();
    await page.locator("#quick-check-attempt-id-input").fill(attemptId);
    await page.locator("[data-action='open-quick-check-attempt']").click();

    await expect(page.locator("#quick-check-attempt-detail")).toHaveText("Attempt unavailable");
  } finally {
    await harness.close();
  }
});

test("quickCheckProductUiLifecycle_shouldWithdrawAndReactivateAcceptedQuickCheck", async ({ page }) => {
  const harness = await startLearnHarness();

  try {
    await signIn(page, harness.baseUrl);
    await page.locator("#entity-lifecycle-family-input").selectOption("quick_check");
    await page.locator("#entity-lifecycle-id-input").fill(harness.acceptedQuickCheck.entityId);
    await page.locator("[data-action='withdraw-entity']").click();

    await expect(page.locator("#entity-lifecycle-status")).toContainText(
      "Lifecycle status is withdrawn for " + harness.acceptedQuickCheck.entityId,
    );
    await expect(page.locator("#withdrawn-items-view")).toContainText("Quick Check");
    await expect(page.locator("#withdrawn-items-view")).toContainText(harness.acceptedQuickCheck.entityId);

    await page.locator("#withdrawn-items-view").getByRole("button", { name: "Reactivate" }).click();
    await expect(page.locator("#entity-lifecycle-status")).toContainText(
      "Lifecycle status is active for " + harness.acceptedQuickCheck.entityId,
    );
    await expect(page.locator("#withdrawn-items-view")).toContainText("No withdrawn items in this session.");
    await expect(page.locator("#withdrawn-items-view")).not.toContainText(harness.acceptedQuickCheck.entityId);
  } finally {
    await harness.close();
  }
});

test("quickCheckProductUiLayout_shouldKeepControlsNamedAndNonOverlapping_onDesktopAndMobile", async ({ page }) => {
  const harness = await startLearnHarness();

  try {
    for (const viewport of [{ height: 900, width: 1280 }, { height: 900, width: 390 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${harness.baseUrl}/learn`);

      await expect(page.getByLabel("Login")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
      await expect(page.getByLabel("Program id")).toBeVisible();
      await expect(page.getByLabel("Status")).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Option 1" })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Option 2" })).toBeVisible();
      await expect(page.locator("#signin-status")).toHaveAttribute("aria-live", "polite");
      await expect(page.locator("#quick-check-submit-status")).toHaveAttribute("aria-live", "polite");
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
    studentWorkspaceCommands: createStudentWorkspaceCommands({
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
  const acceptedQuickCheck = await createAcceptedQuickCheck(baseUrl, bootstrap, programId);
  const student = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Learning Student",
    login: "student@example.test",
    password: "student password",
  });
  const otherStudent = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Other Student",
    login: "other-student@example.test",
    password: "other student password",
  });
  await joinStudentProgram(baseUrl, student, programId);
  await joinStudentProgram(baseUrl, otherStudent, programId);

  return {
    acceptedQuickCheck,
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
    otherStudent,
    programId,
    student,
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

async function createAcceptedQuickCheck(baseUrl, session, programId) {
  const candidate = await fetch(`${baseUrl}/programs/${programId}/quick-checks/candidates`, {
    body: JSON.stringify({
      answerKeyOptionIndex: 0,
      checkKind: "single_select_quick_check",
      options: ["Closure under addition", "Finite dimension"],
      prompt: "Which property is required?",
      rationale: "Closure is required.",
      sourceIds: [],
      title: "Student closure check",
    }),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
  const candidateBody = await candidate.json();
  const accepted = await fetch(`${baseUrl}/quick-checks/candidates/${candidateBody.value.quickCheckCandidate.candidateId}/acceptance`, {
    body: JSON.stringify({}),
    headers: {
      cookie: session.cookie,
      "content-type": "application/json",
      "x-agonara-csrf": session.csrfToken,
    },
    method: "POST",
  });
  return (await accepted.json()).value.acceptedQuickCheck;
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
