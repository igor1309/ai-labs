import { expect, test } from "@playwright/test";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import { createServer } from "../src/server.js";
import { initializeIdentityStorage, openIdentityDatabase } from "../src/storage.js";

test("membershipUiShell_shouldSeparateOrdinaryAndExceptionalControls", async ({ page }) => {
  const harness = await startMembershipHarness();

  try {
    await page.goto(`${harness.baseUrl}/learn`);

    await expect(page.locator("#program-membership-section")).toBeVisible();
    await expect(page.locator("#program-membership-curator-panel")).toBeVisible();
    await expect(page.locator("#program-membership-student-panel")).toBeHidden();
    await expect(page.locator("#program-admission-policy-form")).toBeVisible();
    await expect(page.locator("#program-invitation-form")).toBeVisible();
    await expect(page.locator("#program-participant-list")).toBeVisible();
    await expect(page.locator("#program-membership-admin-panel")).toHaveCount(0);
    await page.locator("#student-mode-tab").click();
    await expect(page.locator("#program-membership-curator-panel")).toBeHidden();
    await expect(page.locator("#program-membership-student-panel")).toBeVisible();

    await page.goto(`${harness.baseUrl}/admin`);

    await expect(page.locator("#program-membership-admin-panel")).toHaveCount(1);
    await expect(page.locator("#program-membership-recovery-form")).toHaveCount(1);
    await expect(page.locator("#program-membership-revocation-form")).toHaveCount(1);
    await expect(page.locator("#program-membership-event-list")).toHaveCount(1);
    await expect(page.locator("#program-membership-curator-panel")).toHaveCount(0);
    await expect(page.locator("#program-membership-student-panel")).toHaveCount(0);
  } finally {
    await harness.close();
  }
});

test("membershipAdminUi_shouldAnnounceMembershipActionFeedback", async ({ page }) => {
  const harness = await startMembershipHarness();

  try {
    await page.goto(`${harness.baseUrl}/admin`);

    const statusElementsWithoutLiveFeedback = await page.locator([
      "#program-membership-recovery-status",
      "#program-membership-revocation-status",
      "#program-membership-event-status",
    ].join(", ")).evaluateAll(elements => elements
      .filter(element => element.getAttribute("aria-live") !== "polite")
      .map(element => element.id));

    expect(statusElementsWithoutLiveFeedback).toEqual([]);
  } finally {
    await harness.close();
  }
});

test("membershipLearnUi_shouldInviteAcceptListAndRemoveStudent", async ({ page }) => {
  const harness = await startMembershipHarness();

  try {
    await signIn(page, harness.baseUrl, harness.curator);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#program-admission-policy-input").selectOption("invitation_only");
    await page.locator("#program-admission-policy-form").getByRole("button", { name: "Save admission policy" }).click();
    await expect(page.locator("#program-admission-policy-status")).toHaveText("Admission policy saved");

    await page.locator("#program-invitation-target-input").fill(harness.student.identityId);
    await page.locator("#create-program-invitation-button").click();
    await expect(page.locator("#program-invitation-list")).toContainText(harness.student.identityId);
    await expect(page.locator("#program-invitation-list")).toContainText("pending");

    await page.locator("#logout-button").click();
    await signIn(page, harness.baseUrl, harness.student);
    await page.locator("#student-mode-tab").click();
    await page.locator("#refresh-my-program-invitations-button").click();
    await expect(page.locator("#my-program-invitation-list")).toContainText(harness.programId);
    await page.locator("[data-action='accept-program-invitation']").click();
    await expect(page.locator("#my-program-invitation-status")).toHaveText("Invitation accepted");

    await page.locator("#logout-button").click();
    await signIn(page, harness.baseUrl, harness.curator);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#refresh-program-participants-button").click();
    await expect(page.locator("#program-participant-list")).toContainText(harness.student.identityId);
    page.once("dialog", dialog => dialog.accept());
    await page.locator("[data-action='remove-student-participant']").click();
    await expect(page.locator("#program-participant-action-status")).toHaveText("Student removed");
  } finally {
    await harness.close();
  }
});

test("membershipAdminUi_shouldRecoverRevokeAndInspectEvents", async ({ page }) => {
  const harness = await startMembershipHarness();

  try {
    await signInAdmin(page, harness.baseUrl, harness.admin);
    await expect(page.locator("#identity-board")).toBeVisible();
    await expect(page.locator("#audit-events-panel")).toBeVisible();

    await page.locator("#program-membership-recovery-program-id-input").fill(harness.programId);
    await page.locator("#program-membership-recovery-target-id-input").fill(harness.student.identityId);
    await page.locator("#program-membership-recovery-kind-input").selectOption("student");
    await page.locator("#program-membership-recovery-reason-input").fill("repair access");
    await page.locator("#program-membership-recovery-form").getByRole("button", { name: "Recover membership" }).click();
    await expect(page.locator("#program-membership-recovery-status")).toHaveText("Accepted.");

    await page.locator("#program-membership-revocation-program-id-input").fill(harness.programId);
    await page.locator("#program-membership-revocation-target-id-input").fill(harness.student.identityId);
    await page.locator("#program-membership-revocation-kind-input").selectOption("student");
    await page.locator("#program-membership-revocation-reason-input").fill("invalid operational state");
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#program-membership-revocation-form").getByRole("button", { name: "Revoke membership" }).click();
    await expect(page.locator("#program-membership-revocation-status")).toHaveText("Accepted.");

    await page.locator("#refresh-program-membership-events-button").click();
    await expect(page.locator("#program-membership-event-list")).toContainText("membership_exceptionally_recovered");
    await expect(page.locator("#program-membership-event-list")).toContainText("repair access");
    await expect(page.locator("#program-membership-event-list")).toContainText("membership_exceptionally_revoked");
    await expect(page.locator("#program-membership-event-list")).toContainText("invalid operational state");
    expect(await membershipForbiddenText(page, "#program-membership-admin-panel")).toEqual([]);
  } finally {
    await harness.close();
  }
});

test("membershipAdminUi_shouldHideExceptionalControlsFromNonAdmin", async ({ page }) => {
  const harness = await startMembershipHarness();

  try {
    await signInAdmin(page, harness.baseUrl, harness.curator);

    await expect(page.locator("#session-panel")).toBeVisible();
    await expect(page.locator("#program-membership-admin-panel")).toBeHidden();
  } finally {
    await harness.close();
  }
});

test("membershipAdminUi_shouldClearExceptionalInputsAfterLogout", async ({ page }) => {
  const harness = await startMembershipHarness();

  try {
    await signInAdmin(page, harness.baseUrl, harness.admin);
    await page.locator("#program-membership-recovery-program-id-input").fill(harness.programId);
    await page.locator("#program-membership-recovery-target-id-input").fill(harness.student.identityId);
    await page.locator("#program-membership-recovery-reason-input").fill("repair access");
    await page.locator("#program-membership-revocation-program-id-input").fill(harness.programId);
    await page.locator("#program-membership-revocation-target-id-input").fill(harness.student.identityId);
    await page.locator("#program-membership-revocation-reason-input").fill("invalid state");

    await page.locator("#logout-button").click();
    await expect(page.locator("#login-status")).toHaveText("Signed out.");

    const retainedValues = await page.locator("#program-membership-admin-panel input, #program-membership-admin-panel textarea")
      .evaluateAll(elements => elements.map(element => element.value).filter(Boolean));
    expect(retainedValues).toEqual([]);
  } finally {
    await harness.close();
  }
});

test("membershipAdminUi_shouldIgnoreMembershipEventsResponseAfterLogout", async ({ page }) => {
  const harness = await startMembershipHarness();

  try {
    await recoverMembership(harness.baseUrl, harness.admin, {
      participationKind: "student",
      programId: harness.programId,
      recoveryReason: "repair access",
      targetIdentityId: harness.student.identityId,
    });
    await signInAdmin(page, harness.baseUrl, harness.admin);
    await page.locator("#program-membership-recovery-program-id-input").fill(harness.programId);

    const delayedResponse = await delayRouteResponse(page, `**/programs/${harness.programId}/membership-events`);

    await page.locator("#refresh-program-membership-events-button").click();
    await delayedResponse.observed;
    await page.locator("#logout-button").click();
    delayedResponse.release();
    await delayedResponse.processed;
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));

    await expect(page.locator("#program-membership-admin-panel")).toBeHidden();
    await expect(page.locator("#program-membership-event-list")).toHaveText("");
  } finally {
    await harness.close();
  }
});

test("membershipAdminUi_shouldIgnoreRecoveryResponseAfterLogout", async ({ page }) => {
  const harness = await startMembershipHarness();

  try {
    await signInAdmin(page, harness.baseUrl, harness.admin);
    await page.locator("#program-membership-recovery-program-id-input").fill(harness.programId);
    await page.locator("#program-membership-recovery-target-id-input").fill(harness.student.identityId);
    await page.locator("#program-membership-recovery-reason-input").fill("repair access");

    const delayedResponse = await delayRouteResponse(page, "**/admin/program-memberships/recovery");

    await page.locator("#program-membership-recovery-form").getByRole("button", { name: "Recover membership" }).click();
    await delayedResponse.observed;
    await page.locator("#logout-button").click();
    delayedResponse.release();
    await delayedResponse.processed;
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));

    await expect(page.locator("#program-membership-recovery-status")).toHaveText("");
  } finally {
    await harness.close();
  }
});

test("membershipAdminUi_shouldRefreshEventsForEditedProgram", async ({ page }) => {
  const harness = await startMembershipHarness();

  try {
    await recoverMembership(harness.baseUrl, harness.admin, {
      participationKind: "student",
      programId: harness.singleCuratorProgramId,
      recoveryReason: "single curator program recovery",
      targetIdentityId: harness.student.identityId,
    });
    await signInAdmin(page, harness.baseUrl, harness.admin);
    await page.locator("#program-membership-recovery-program-id-input").fill(harness.programId);
    await page.locator("#program-membership-recovery-target-id-input").fill(harness.student.identityId);
    await page.locator("#program-membership-recovery-reason-input").fill("primary program recovery");
    await page.locator("#program-membership-recovery-form").getByRole("button", { name: "Recover membership" }).click();
    await expect(page.locator("#program-membership-event-list")).toContainText("primary program recovery");

    await page.locator("#program-membership-recovery-program-id-input").fill(harness.singleCuratorProgramId);
    await expect(page.locator("#program-membership-recovery-status")).toHaveText("");
    await page.locator("#refresh-program-membership-events-button").click();

    await expect(page.locator("#program-membership-event-list")).toContainText("single curator program recovery");
  } finally {
    await harness.close();
  }
});

test("membershipLearnUi_shouldRevokeDeclineLeaveAndClearPrivateContext", async ({ page }) => {
  const harness = await startMembershipHarness();

  try {
    await signIn(page, harness.baseUrl, harness.curator);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#program-invitation-target-input").fill(harness.otherStudent.identityId);
    await page.locator("#create-program-invitation-button").click();
    page.once("dialog", dialog => dialog.accept());
    await page.locator("[data-action='revoke-program-invitation']").click();
    await expect(page.locator("#program-invitation-status")).toHaveText("Invitation revoked");

    await page.locator("#program-invitation-target-input").fill(harness.otherStudent.identityId);
    await page.locator("#create-program-invitation-button").click();
    await expect(page.locator("#program-invitation-status")).toHaveText("Invitation created");
    await page.locator("#program-invitation-target-input").fill(harness.student.identityId);
    await page.locator("#logout-button").click();
    await expect(page.locator("#program-id-input")).toHaveValue("");
    await expect(page.locator("#program-invitation-target-input")).toHaveValue("");
    await signIn(page, harness.baseUrl, harness.otherStudent);
    await page.locator("#student-mode-tab").click();
    await page.locator("#refresh-my-program-invitations-button").click();
    await page.locator("[data-action='decline-program-invitation']").click();
    await expect(page.locator("#my-program-invitation-status")).toHaveText("Invitation declined");

    await page.locator("#logout-button").click();
    await signIn(page, harness.baseUrl, harness.curator);
    await page.locator("#program-id-input").fill(harness.programId);
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#curator-leave-program-button").click();
    await expect(page.locator("#curator-leave-program-status")).toHaveText("Curator membership left");

    await page.locator("#program-id-input").fill("other-program");
    await expect(page.locator("#program-invitation-list")).toHaveText("No invitations loaded.");
    await expect(page.locator("#program-participant-list")).toHaveText("No participants loaded.");
    expect(await membershipForbiddenText(page, "#program-membership-section")).toEqual([]);
  } finally {
    await harness.close();
  }
});

test("membershipLearnUi_shouldClearMembershipContextWhenIdentityChanges", async ({ page }) => {
  const harness = await startMembershipHarness();

  try {
    await signIn(page, harness.baseUrl, harness.curator);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#program-invitation-target-input").fill(harness.student.identityId);
    await page.locator("#create-program-invitation-button").click();
    await expect(page.locator("#program-invitation-list")).toContainText(harness.student.identityId);

    await page.locator("#signin-form input[name='login']").fill(harness.student.login);
    await page.locator("#signin-form input[name='password']").fill(harness.student.password);
    await page.locator("#signin-form").getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#session-summary")).toContainText("Membership Student");

    await expect(page.locator("#program-id-input")).toHaveValue("");
    await expect(page.locator("#program-invitation-list")).toHaveText("No invitations loaded.");
  } finally {
    await harness.close();
  }
});

test("membershipLearnUi_shouldIgnoreInvitationResponseAfterProgramChanges", async ({ page }) => {
  const harness = await startMembershipHarness();

  try {
    await signIn(page, harness.baseUrl, harness.curator);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#program-invitation-target-input").fill(harness.student.identityId);
    await page.locator("#create-program-invitation-button").click();
    await expect(page.locator("#program-invitation-list")).toContainText(harness.student.identityId);

    const delayedResponse = await delayRouteResponse(page, `**/programs/${harness.programId}/invitations*`, "GET");

    await page.locator("#refresh-program-invitations-button").click();
    await delayedResponse.observed;
    await page.locator("#program-id-input").fill(harness.singleCuratorProgramId);
    delayedResponse.release();
    await delayedResponse.processed;
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));

    await expect(page.locator("#program-invitation-list")).toHaveText("No invitations loaded.");
  } finally {
    await harness.close();
  }
});

test("membershipLearnUi_shouldIgnoreInvitationActionResponseAfterLogout", async ({ page }) => {
  const harness = await startMembershipHarness();

  try {
    await signIn(page, harness.baseUrl, harness.curator);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#program-invitation-target-input").fill(harness.student.identityId);

    const delayedResponse = await delayRouteResponse(page, `**/programs/${harness.programId}/invitations`, "POST");

    await page.locator("#create-program-invitation-button").click();
    await delayedResponse.observed;
    await page.locator("#logout-button").click();
    delayedResponse.release();
    await delayedResponse.processed;
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));

    await expect(page.locator("#program-invitation-target-input")).toHaveValue("");
    await expect(page.locator("#program-invitation-status")).toHaveText("");
  } finally {
    await harness.close();
  }
});

test("membershipUi_shouldMapPolicyAndLastCuratorConflictsWithoutLeaksOrOverlap", async ({ page }) => {
  const harness = await startMembershipHarness();

  try {
    await setAdmissionPolicy(harness.baseUrl, harness.curator, harness.programId, "invitation_only");
    await signIn(page, harness.baseUrl, harness.student);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#student-mode-tab").click();
    await page.locator("#join-student-program-button").click();
    await expect(page.locator("#student-program-membership-status")).toHaveText("This Program requires an invitation");

    await page.locator("#logout-button").click();
    await signIn(page, harness.baseUrl, harness.curator);
    await page.locator("#program-id-input").fill(harness.singleCuratorProgramId);
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#curator-leave-program-button").click();
    await expect(page.locator("#curator-leave-program-status")).toHaveText("At least one active Program Curator must remain");
    expect(await membershipForbiddenText(page, "#program-membership-section")).toEqual([]);

    for (const viewport of [{ height: 1100, width: 1280 }, { height: 1100, width: 390 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${harness.baseUrl}/learn`);
      await expect(page.getByLabel("Student admission policy")).toBeVisible();
      await expect(page.getByLabel("Student identity id")).toBeVisible();
      expect(await visibleControlOverlaps(page)).toEqual([]);
      await page.locator("#student-mode-tab").click();
      await expect(page.getByRole("button", { name: "Join selected Program" })).toBeVisible();
      expect(await visibleControlOverlaps(page)).toEqual([]);

      await page.goto(`${harness.baseUrl}/admin`);
      await expect(page.getByLabel("Recovery reason")).toHaveCount(1);
      await expect(page.getByLabel("Revocation reason")).toHaveCount(1);
      expect(await visibleControlOverlaps(page)).toEqual([]);
    }
  } finally {
    await harness.close();
  }
});

async function startMembershipHarness() {
  const database = openIdentityDatabase();
  initializeIdentityStorage(database);
  const now = () => new Date("2026-06-04T10:00:00.000Z");
  const generateId = makeIdGenerator([
    "identity-admin",
    "credential-admin",
    "session-admin",
    "audit-admin",
    ...Array.from({ length: 240 }, (_, index) => `membership-ui-${index + 1}`),
  ]);
  const programCommands = createProgramCommands({ database, generateId, now });
  const server = createServer({
    identityCommands: createIdentityCommands({
      bootstrapSecret: "operator-secret",
      database,
      generateId,
      now,
    }),
    log: () => {},
    programCommands,
  });
  const baseUrl = await listen(server);
  const admin = await bootstrapIdentity(baseUrl);
  const curator = await createIdentitySession(baseUrl, admin, {
    displayName: "Membership Curator",
    login: "membership-curator@example.test",
    password: "curator password",
  });
  const student = await createIdentitySession(baseUrl, admin, {
    displayName: "Membership Student",
    login: "membership-student@example.test",
    password: "student password",
  });
  const otherStudent = await createIdentitySession(baseUrl, admin, {
    displayName: "Other Membership Student",
    login: "other-membership-student@example.test",
    password: "other student password",
  });
  const secondCurator = await createIdentitySession(baseUrl, admin, {
    displayName: "Second Membership Curator",
    login: "second-membership-curator@example.test",
    password: "second curator password",
  });
  const programId = await createProgram(baseUrl, curator, "Linear Algebra");
  const singleCuratorProgramId = await createProgram(baseUrl, curator, "Abstract Algebra");
  await recoverMembership(baseUrl, admin, {
    participationKind: "program_curator",
    programId,
    recoveryReason: "restore curator coverage",
    targetIdentityId: secondCurator.identityId,
  });

  return {
    admin,
    baseUrl,
    close: async () => {
      await close(server);
      database.close();
    },
    curator,
    otherStudent,
    programId,
    secondCurator,
    singleCuratorProgramId,
    student,
  };
}

async function membershipForbiddenText(page, selector) {
  const forbiddenPatterns = [
    /answerKey/i,
    /bootstrap secret/i,
    /correct horse battery staple/i,
    /csrf/i,
    /cookie/i,
    /database-url/i,
    /idempotency/i,
    /learner-state evidence/i,
    /postgres:\/\//i,
    /provider/i,
    /quick_check_attempt/i,
    /readiness attempt/i,
    /select \*/i,
    /session-/i,
    /stack trace/i,
    /student workspace/i,
    /\/tmp\b/i,
  ];
  return page.locator(selector).evaluate((element, patterns) => {
    const text = element.textContent ?? "";
    return patterns
      .map($0 => new RegExp($0.source, $0.flags))
      .filter($0 => $0.test(text))
      .map($0 => String($0));
  }, forbiddenPatterns);
}

async function delayRouteResponse(page, url, method = null) {
  let releaseResponse;
  let responseDelivered;
  let responseReady;
  const responseReleased = new Promise(resolve => {
    releaseResponse = resolve;
  });
  const observed = new Promise(resolve => {
    responseReady = resolve;
  });
  const processed = new Promise(resolve => {
    responseDelivered = resolve;
  });
  await page.route(url, async route => {
    if (method && route.request().method() !== method) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    responseReady();
    await responseReleased;
    await route.fulfill({ response });
    responseDelivered();
  });
  return {
    observed,
    processed,
    release: releaseResponse,
  };
}

async function signIn(page, baseUrl, session) {
  await page.goto(`${baseUrl}/learn`);
  await page.locator("#signin-form input[name='login']").fill(session.login);
  await page.locator("#signin-form input[name='password']").fill(session.password);
  await page.locator("#signin-form").getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#signin-status")).toHaveText("Signed in");
}

async function signInAdmin(page, baseUrl, session) {
  await page.goto(`${baseUrl}/admin`);
  await page.locator("#login-form input[name='login']").fill(session.login);
  await page.locator("#login-form input[name='password']").fill(session.password);
  await page.locator("#login-form").getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#session-panel")).toBeVisible();
}

async function bootstrapIdentity(baseUrl) {
  const response = await fetch(`${baseUrl}/identity/bootstrap/admin`, {
    body: JSON.stringify({
      bootstrapSecret: "operator-secret",
      displayName: "Root Admin",
      login: "admin@example.test",
      password: "admin password",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = await response.json();
  return {
    cookie: response.headers.get("set-cookie"),
    csrfToken: body.value.csrfToken,
    identityId: body.value.identity.id,
    login: "admin@example.test",
    password: "admin password",
  };
}

async function createIdentitySession(baseUrl, admin, { displayName, login, password }) {
  const identityResponse = await fetch(`${baseUrl}/identity/identities`, {
    body: JSON.stringify({ displayName }),
    headers: jsonHeaders(admin),
    method: "POST",
  });
  const identityBody = await identityResponse.json();
  await fetch(`${baseUrl}/identity/identities/${identityBody.value.id}/local-password`, {
    body: JSON.stringify({ login, password }),
    headers: jsonHeaders(admin),
    method: "POST",
  });
  const sessionResponse = await fetch(`${baseUrl}/identity/sessions`, {
    body: JSON.stringify({ login, password }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const sessionBody = await sessionResponse.json();
  return {
    cookie: sessionResponse.headers.get("set-cookie"),
    csrfToken: sessionBody.value.csrfToken,
    identityId: identityBody.value.id,
    login,
    password,
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

async function recoverMembership(baseUrl, session, body) {
  await fetch(`${baseUrl}/admin/program-memberships/recovery`, {
    body: JSON.stringify(body),
    headers: jsonHeaders(session),
    method: "POST",
  });
}

async function setAdmissionPolicy(baseUrl, session, programId, admissionPolicy) {
  await fetch(`${baseUrl}/programs/${programId}/admission-policy`, {
    body: JSON.stringify({ admissionPolicy }),
    headers: jsonHeaders(session),
    method: "PATCH",
  });
}

async function visibleControlOverlaps(page) {
  return page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll("button, input, select, textarea"))
      .filter(element => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      })
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
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
