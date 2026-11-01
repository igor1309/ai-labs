import { expect, test } from "@playwright/test";
import { createCorpusCommands } from "../src/corpus.js";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import { createServer } from "../src/server.js";
import { initializeIdentityStorage, openIdentityDatabase } from "../src/storage.js";
import { createStudentWorkspaceCommands } from "../src/student-workspace.js";

test("readinessCurator_shouldCreateListAcceptRejectInspectAndHideStudentState", async ({ page }) => {
  const harness = await startReadinessHarness();

  try {
    await signIn(page, harness.baseUrl);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#curator-mode-tab").click();
    await page.locator("#refresh-readiness-check-candidates-button").click();

    await expect(page.locator("#readiness-check-candidate-list")).toContainText("No readiness candidates loaded.");
    await createReadinessCandidateFromUi(page, {
      requirements: [{
        requiredLevel: "on_track",
        targetId: harness.quickCheck.entityId,
        targetKind: "quick_check",
      }],
      scopeKind: "topic",
      title: "Topic readiness",
      topicId: harness.topic.entityId,
    });
    await page.getByRole("button", { name: "Topic readiness draft" }).click();
    await page.getByRole("button", { name: "Approve readiness" }).click();
    await page.getByRole("button", { name: "Review readiness" }).click();

    await expect(page.locator("#readiness-check-curation-detail")).toContainText("Topic readiness");
    await expect(page.locator("#readiness-check-curation-detail")).toContainText("quick_check");
    await expect(page.locator("#readiness-check-curation-detail")).toContainText("on_track");
    await expect(page.locator("#readiness-check-curator-panel")).not.toContainText("quick_check_attempt");

    await page.locator("#program-id-input").fill("other-program");
    await expect(page.locator("#readiness-check-candidate-list")).toContainText("No readiness candidates loaded.");
    await expect(page.locator("#readiness-check-curation-detail")).not.toContainText("Topic readiness");
    await page.locator("#program-id-input").fill(harness.programId);

    await createReadinessCandidateFromUi(page, {
      periodTitle: "Period 1",
      requirements: [{
        requiredLevel: "developing",
        targetId: harness.topic.entityId,
        targetKind: "topic",
      }],
      scopeKind: "period",
      title: "Period readiness",
      topicIds: [harness.topic.entityId],
    });
    await page.getByRole("button", { name: "Period readiness draft" }).click();
    await page.getByRole("button", { name: "Decline readiness" }).click();
    await page.locator("#readiness-check-candidate-status-filter").selectOption("rejected");
    await page.locator("#refresh-readiness-check-candidates-button").click();

    await expect(page.locator("#readiness-check-candidate-list")).toContainText("Period readiness");
    await expect(page.locator("#readiness-check-student-panel")).not.toContainText("Period readiness");
  } finally {
    await harness.close();
  }
});

test("readinessStudent_shouldRefreshOpenSubmitRetryShowResultAndOpenEvidence", async ({ page }) => {
  const harness = await startReadinessHarness({ acceptedReadiness: true, quickAttempt: true });

  try {
    await signIn(page, harness.baseUrl, harness.student.login, harness.student.password);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#student-mode-tab").click();
    await page.locator("#refresh-readiness-checks-button").click();

    await expect(page.locator("#readiness-check-delivery-list")).toContainText("Topic readiness");
    await page.getByRole("button", { name: "Topic readiness" }).click();
    await page.locator("[data-action='open-readiness-check-delivery']").click();
    await expect(page.locator("#readiness-check-delivery-detail")).toContainText("quick_check");
    await expect(page.locator("#readiness-check-delivery-detail")).not.toContainText("rationale");

    await page.locator("#readiness-check-submit-form").getByRole("button", { name: "Submit readiness" }).click();
    await expect(page.locator("#readiness-check-submit-status")).toHaveText("Readiness attempt submitted");
    await expect(page.locator("#readiness-check-attempt-detail")).toContainText("ready");
    await expect(page.locator("#readiness-check-requirement-result-list")).toContainText("ready");

    await page.locator("#readiness-check-submit-form").getByRole("button", { name: "Submit readiness" }).click();
    await expect(page.locator("#readiness-check-attempt-list").getByRole("button")).toHaveCount(1);

    await page.locator("#readiness-check-requirement-result-list").getByRole("button", { name: /Open readiness evidence/ }).click();
    await expect(page.locator("#readiness-check-evidence-detail")).toContainText("Closure check");
    await expect(page.locator("#readiness-check-evidence-detail")).toContainText("quick_check_attempt");
    expect(await readinessForbiddenText(page)).toEqual([]);
  } finally {
    await harness.close();
  }
});

test("readinessStudent_shouldDenyPrivateAttemptDetail_onNonOwnerLookup", async ({ page }) => {
  const harness = await startReadinessHarness({ acceptedReadiness: true, quickAttempt: true });

  try {
    await signIn(page, harness.baseUrl, harness.student.login, harness.student.password);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#student-mode-tab").click();
    await page.locator("#refresh-readiness-checks-button").click();
    await page.getByRole("button", { name: "Topic readiness" }).click();
    await page.locator("[data-action='open-readiness-check-delivery']").click();
    await page.locator("#readiness-check-submit-form").getByRole("button", { name: "Submit readiness" }).click();
    await expect(page.locator("#readiness-check-submit-status")).toHaveText("Readiness attempt submitted");
    const attemptId = await page.locator("#readiness-check-attempt-detail").getAttribute("data-readiness-attempt-id");

    await page.locator("#logout-button").click();
    await signIn(page, harness.baseUrl, harness.otherStudent.login, harness.otherStudent.password);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#student-mode-tab").click();
    await page.locator("#readiness-check-attempt-id-input").fill(attemptId);
    await page.locator("[data-action='open-readiness-check-attempt']").click();

    await expect(page.locator("#readiness-check-attempt-detail")).toHaveText("Readiness attempt unavailable");
  } finally {
    await harness.close();
  }
});

test("readinessLayout_shouldKeepControlsNamedNonOverlappingAndPreserveLearnWorkflows", async ({ page }) => {
  const harness = await startReadinessHarness();

  try {
    for (const viewport of [{ height: 1040, width: 1280 }, { height: 1080, width: 390 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${harness.baseUrl}/learn`);

      await expect(page.locator("#readiness-check-section")).toBeVisible();
      await expect(page.locator("#readiness-check-curator-panel")).toBeVisible();
      await expect(page.locator("#readiness-check-student-panel")).toBeVisible();
      await expect(page.getByLabel("Readiness scope")).toBeVisible();
      await expect(page.getByLabel("Readiness requirements JSON")).toBeVisible();
      await expect(page.getByRole("button", { name: "Submit readiness" })).toBeVisible();
      await expect(page.locator("#quick-check-candidate-form").getByRole("button", { name: "Create" })).toBeVisible();
      await expect(page.locator("#navigation-section")).toBeVisible();
      await expect(page.locator("#learner-state-section")).toBeVisible();
      await expect(page.locator("#readiness-check-submit-status")).toHaveAttribute("aria-live", "polite");
      await expect(page.locator("#readiness-check-candidate-action-status")).toHaveAttribute("aria-live", "polite");
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

async function createReadinessCandidateFromUi(page, input) {
  await page.locator("#readiness-check-title-input").fill(input.title);
  await page.locator("#readiness-check-scope-kind-input").selectOption(input.scopeKind);
  await page.locator("#readiness-check-topic-id-input").fill(input.topicId ?? "");
  await page.locator("#readiness-check-period-title-input").fill(input.periodTitle ?? "");
  await page.locator("#readiness-check-period-topic-ids-input").fill((input.topicIds ?? []).join(","));
  await page.locator("#readiness-check-requirements-input").fill(JSON.stringify(input.requirements));
  await page.locator("#readiness-check-rationale-input").fill("Curator-only readiness rationale.");
  await page.locator("#readiness-check-candidate-form").getByRole("button", { name: "Save readiness" }).click();
  await expect(page.locator("#readiness-check-candidate-list")).toContainText(input.title);
}

async function readinessForbiddenText(page) {
  const forbiddenPatterns = [
    /acceptedFromCandidateId/i,
    /answerKey/i,
    /candidateId/i,
    /createdByIdentityId/i,
    /csrf/i,
    /cookie/i,
    /database-url/i,
    /idempotency/i,
    /postgres:\/\//i,
    /provider/i,
    /rationale/i,
    /raw model/i,
    /raw prompt/i,
    /select \*/i,
    /session/i,
    /sourceIds/i,
    /stack trace/i,
    /\/tmp\b/i,
  ];
  return page.locator("#readiness-check-student-panel").evaluate((element, patterns) => {
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

async function startReadinessHarness({ acceptedReadiness = false, quickAttempt = false } = {}) {
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
  const otherStudent = await createIdentitySession(baseUrl, bootstrap, {
    displayName: "Other Student",
    login: "other-student@example.test",
    password: "other student password",
  });
  await joinStudentProgram(baseUrl, student, programId);
  await joinStudentProgram(baseUrl, otherStudent, programId);
  const readinessCheck = acceptedReadiness
    ? await createAcceptedReadinessCheck(baseUrl, bootstrap, programId, {
        requirements: [{
          requiredLevel: "on_track",
          targetId: quickCheck.entityId,
          targetKind: "quick_check",
        }],
        scope: { scopeKind: "topic", topicEntityId: topic.entityId },
        title: "Topic readiness",
      })
    : null;
  if (quickAttempt) {
    await submitQuickCheckAttempt(baseUrl, student, programId, {
      checkRevisionId: quickCheck.revisionId,
      selectedOptionId: quickCheck.answerKeyOptionId,
    });
  }

  return {
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
    otherStudent,
    programId,
    quickCheck,
    readinessCheck,
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

async function createAcceptedReadinessCheck(baseUrl, session, programId, body) {
  const candidate = await fetch(`${baseUrl}/programs/${programId}/readiness-checks/candidates`, {
    body: JSON.stringify(body),
    headers: jsonHeaders(session),
    method: "POST",
  });
  const candidateBody = await candidate.json();
  const accepted = await fetch(`${baseUrl}/readiness-checks/candidates/${candidateBody.value.readinessCheckCandidate.candidateId}/acceptance`, {
    body: JSON.stringify({}),
    headers: jsonHeaders(session),
    method: "POST",
  });
  const acceptedBody = await accepted.json();
  return acceptedBody.value.acceptedReadinessCheck;
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

async function submitQuickCheckAttempt(baseUrl, session, programId, body) {
  await fetch(`${baseUrl}/programs/${programId}/quick-check-attempts`, {
    body: JSON.stringify(body),
    headers: {
      ...jsonHeaders(session),
      "x-agonara-idempotency-key": "readiness-ui-quick-attempt",
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
