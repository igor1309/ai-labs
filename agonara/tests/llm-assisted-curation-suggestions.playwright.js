import { expect, test } from "@playwright/test";
import { createCorpusCommands } from "../src/corpus.js";
import { createCuratorWorkspaceCommands } from "../src/curator-workspace.js";
import { createIdentityCommands } from "../src/identity.js";
import { createProgramCommands } from "../src/program.js";
import { createServer } from "../src/server.js";
import { initializeIdentityStorage, openIdentityDatabase } from "../src/storage.js";
import { createStudentWorkspaceCommands } from "../src/student-workspace.js";

test("llmSuggestionUiCurator_shouldGenerateInspectAcceptAndReject_withRedactedOrigin", async ({ page }) => {
  const harness = await startLlmSuggestionHarness();

  try {
    await signIn(page, harness.baseUrl);
    await page.locator("#program-id-input").fill(harness.programId);
    await expect(page.locator("[data-action='accept-llm-curation-suggestion']")).toBeDisabled();
    await expect(page.locator("[data-action='reject-llm-curation-suggestion']")).toBeDisabled();
    await page.locator("#llm-curation-suggestion-policy-input").fill("policy-a");
    await page.locator("#llm-curation-suggestion-instruction-input").fill("Suggest one safe draft topic.");
    await page.locator("#generate-llm-curation-suggestions-button").click();

    await expect(page.locator("#llm-curation-suggestion-generation-status")).toHaveText("Generated 2 suggestions.");
    await expect(page.locator("#llm-curation-suggestion-list")).toContainText("Draft LLM topic");
    await expect(page.locator("#llm-curation-suggestion-list")).toContainText("Draft LLM quick check");

    await page.locator("#llm-curation-suggestion-kind-filter").selectOption("navigation_candidate");
    await page.locator("#refresh-llm-curation-suggestions-button").click();
    await expect(page.locator("#llm-curation-suggestion-list")).toContainText("Draft LLM topic");
    await expect(page.locator("#llm-curation-suggestion-list")).not.toContainText("Draft LLM quick check");

    await page.locator("#llm-curation-suggestion-list").getByRole("button", { name: /Draft LLM topic/ }).click();
    await expect(page.locator("#llm-curation-suggestion-origin")).toContainText("Policy policy-a");
    await expect(page.locator("#llm-curation-suggestion-origin")).toContainText("accepted program context");
    await expect(page.locator("#llm-curation-suggestion-supporting-evidence")).toContainText("Curator instruction");
    await expect(page.locator("#llm-curation-suggestion-draft-preview")).toContainText("navigation_candidate");
    await expect(page.locator("#llm-curation-suggestion-draft-preview")).toContainText("Draft LLM topic");
    expect(await llmSuggestionForbiddenText(page)).toEqual([]);

    await page.locator("[data-action='accept-llm-curation-suggestion']").click();
    await expect(page.locator("#llm-curation-suggestion-review-status")).toContainText("Materialized draft navigation_candidate");
    await expect(page.locator("[data-action='accept-llm-curation-suggestion']")).toBeDisabled();
    await expect(page.locator("[data-action='reject-llm-curation-suggestion']")).toBeDisabled();
    expect(await llmSuggestionForbiddenText(page)).toEqual([]);
    await page.locator("#refresh-navigation-button").click();
    await expect(page.locator("#program-navigation-summary")).not.toContainText("Draft LLM topic");
    await page.locator("#refresh-navigation-candidates-button").click();
    await expect(page.locator("#navigation-candidate-list")).toContainText("Draft LLM topic draft");

    await page.locator("#llm-curation-suggestion-status-filter").selectOption("draft_suggestion");
    await page.locator("#llm-curation-suggestion-kind-filter").selectOption("quick_check_candidate");
    await page.locator("#refresh-llm-curation-suggestions-button").click();
    await page.locator("#llm-curation-suggestion-list").getByRole("button", { name: /Draft LLM quick check/ }).click();
    await page.locator("[data-action='reject-llm-curation-suggestion']").click();
    await expect(page.locator("#llm-curation-suggestion-review-status")).toHaveText("Suggestion rejected.");
    await expect(page.locator("[data-action='accept-llm-curation-suggestion']")).toBeDisabled();
    await expect(page.locator("[data-action='reject-llm-curation-suggestion']")).toBeDisabled();
    expect(await llmSuggestionForbiddenText(page)).toEqual([]);
  } finally {
    await harness.close();
  }
});

test("llmSuggestionUiAuthorization_shouldDenyStudentAndAdminOnlySessions", async ({ page }) => {
  const harness = await startLlmSuggestionHarness();

  try {
    await signIn(page, harness.baseUrl, harness.student.login, harness.student.password);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#generate-llm-curation-suggestions-button").click();
    await expect(page.locator("#llm-curation-suggestion-generation-status")).toHaveText("Suggestions unavailable.");
    await page.locator("#refresh-llm-curation-suggestions-button").click();
    await expect(page.locator("#llm-curation-suggestion-list-status")).toHaveText("Suggestions unavailable.");
    await expect(page.locator("#llm-curation-suggestion-list")).toContainText("No LLM suggestions loaded.");
    await expect(page.locator("[data-action='open-llm-curation-suggestion']")).toHaveCount(0);
    await expect(page.locator("[data-action='accept-llm-curation-suggestion']")).toBeDisabled();
    await expect(page.locator("[data-action='reject-llm-curation-suggestion']")).toBeDisabled();

    await page.locator("#logout-button").click();
    await signIn(page, harness.baseUrl, harness.admin.login, harness.admin.password);
    await page.locator("#program-id-input").fill(harness.programId);
    await page.locator("#generate-llm-curation-suggestions-button").click();
    await expect(page.locator("#llm-curation-suggestion-generation-status")).toHaveText("Suggestions unavailable.");
    await page.locator("#refresh-llm-curation-suggestions-button").click();
    await expect(page.locator("#llm-curation-suggestion-list-status")).toHaveText("Suggestions unavailable.");
    await expect(page.locator("[data-action='open-llm-curation-suggestion']")).toHaveCount(0);
    await expect(page.locator("[data-action='accept-llm-curation-suggestion']")).toBeDisabled();
    await expect(page.locator("[data-action='reject-llm-curation-suggestion']")).toBeDisabled();
  } finally {
    await harness.close();
  }
});

test("llmSuggestionUiLayout_shouldKeepControlsNamedNonOverlappingAndPreserveLearnWorkflows", async ({ page }) => {
  const harness = await startLlmSuggestionHarness();

  try {
    for (const viewport of [{ height: 1180, width: 1280 }, { height: 1320, width: 390 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`${harness.baseUrl}/learn`);

      await expect(page.locator("#llm-curation-suggestion-section")).toBeVisible();
      await expect(page.locator("#llm-curation-suggestion-curator-panel")).toBeVisible();
      await expect(page.getByLabel("Suggestion policy id")).toBeVisible();
      await expect(page.getByLabel("Review state")).toBeVisible();
      await expect(page.locator("#llm-curation-suggestion-kind-filter")).toBeVisible();
      await expect(page.locator("#llm-curation-suggestion-generation-status")).toHaveAttribute("aria-live", "polite");
      await expect(page.locator("#llm-curation-suggestion-review-status")).toHaveAttribute("aria-live", "polite");
      await expect(page.locator("#quick-check-candidate-form").getByRole("button", { name: "Create" })).toBeVisible();
      await expect(page.locator("#navigation-section")).toBeVisible();
      await expect(page.locator("#coverage-gap-section")).toBeVisible();
      await expect(page.locator("#readiness-check-section")).toBeVisible();
      await expect(page.locator("#program-membership-section")).toBeVisible();
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

async function llmSuggestionForbiddenText(page) {
  const forbiddenPatterns = [
    /acceptedByIdentityId/i,
    /acceptedFromCandidateId/i,
    /answerKey/i,
    /candidateId/i,
    /cookie/i,
    /correctness/i,
    /createdByIdentityId/i,
    /csrf/i,
    /database-url/i,
    /feedback/i,
    /generatedByIdentityId/i,
    /hidden policy/i,
    /idempotency/i,
    /materializedByIdentityId/i,
    /password/i,
    /providerAdapterId/i,
    /provider request/i,
    /provider response/i,
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
  return page.locator("#llm-curation-suggestion-section").evaluate((element, patterns) => {
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

async function startLlmSuggestionHarness() {
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
    ...Array.from({ length: 260 }, (_, index) => `id-${index + 1}`),
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
    generateId,
    getEffectiveParticipation: programCommands.getEffectiveParticipation,
    llmSuggestionPolicies: [makeLlmSuggestionPolicy()],
    llmSuggestionProviderAdapters: [makeLlmSuggestionProviderAdapter()],
    now,
  });
  const server = createServer({
    corpusCommands,
    curatorWorkspaceCommands,
    identityCommands: createIdentityCommands({
      bootstrapSecret: "operator-secret",
      database,
      generateId,
      now,
    }),
    programCommands,
    studentWorkspaceCommands,
    log: () => {},
  });
  const baseUrl = await listen(server);
  const bootstrap = await bootstrapIdentity(baseUrl);
  const programId = await createProgram(baseUrl, bootstrap, "Linear Algebra");
  await createAcceptedNavigationCandidate(baseUrl, bootstrap, programId, {
    candidateKind: "topic",
    sourceIds: [],
    title: "Vector spaces",
  });
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

function makeLlmSuggestionPolicy() {
  return {
    suggestionPolicyId: "policy-a",
    providerAdapterId: "provider-a",
    outputValidatorPolicyId: "validator-a",
    redactionPolicyId: "redaction-a",
    allowedSuggestionKinds: ["navigation_candidate", "quick_check_candidate"],
    promptInputPolicy: {
      includeAcceptedNavigationContext: true,
      includeAcceptedCheckContext: true,
      includeReadinessContext: true,
      includeCoverageGapContext: true,
      includeStudentWorkspaceState: false,
    },
    budgetPolicy: { maxProviderCalls: 1, maxInputTokens: 4000, maxOutputTokens: 800 },
    rawArtifactPolicy: "none",
  };
}

function makeLlmSuggestionProviderAdapter() {
  return {
    providerAdapterId: "provider-a",
    suggest: () => ({
      suggestions: [
        {
          suggestionKind: "navigation_candidate",
          title: "Draft LLM topic",
          summary: "Create a curator-reviewed navigation draft.",
          rationale: "Accepted navigation context has room for a focused topic draft.",
          suggestedDraft: {
            candidateKind: "navigation_candidate",
            request: {
              candidateKind: "topic",
              title: "Draft LLM topic",
              body: "Draft LLM topic body",
              sourceIds: [],
              rationale: "Draft candidate rationale",
            },
          },
          supportingEvidence: [
            {
              sourceKind: "curator_instruction",
              sourceId: "curator-instruction",
              label: "Curator instruction",
            },
          ],
        },
        {
          suggestionKind: "quick_check_candidate",
          title: "Draft LLM quick check",
          summary: "Create a curator-reviewed Quick Check draft.",
          rationale: "Accepted context has a safe Quick Check opportunity.",
          suggestedDraft: {
            candidateKind: "quick_check_candidate",
            request: {
              answerKeyIndex: 0,
              checkKind: "single_select_quick_check",
              options: ["Closure under addition", "Finite dimension"],
              prompt: "Which property is required?",
              rationale: "Closure is required.",
              sourceIds: [],
              title: "Draft LLM quick check",
            },
          },
          supportingEvidence: [
            {
              sourceKind: "curator_instruction",
              sourceId: "curator-instruction",
              label: "Curator instruction",
            },
          ],
        },
      ],
      outputValidation: {
        validatorPolicyId: "validator-a",
        passed: true,
      },
      providerUsage: { providerCalls: 1, inputTokens: 120, outputTokens: 80 },
    }),
  };
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
