import assert from "node:assert/strict";
import test from "node:test";

import { learnUiHtml } from "../src/learn-ui.js";

test("learnUiTheme_shouldDefaultDarkAndExposeSwitcher_onLearnPage", () => {
  const themeContract = {
    defaultDarkTheme: learnUiHtml.includes('<html lang="en" data-theme="dark">'),
    darkColorScheme: learnUiHtml.includes("color-scheme: dark;"),
    lightThemeOverride: learnUiHtml.includes(':root[data-theme="light"]'),
    persistentThemeChoice: learnUiHtml.includes('localStorage.setItem("agonara-learn-theme"'),
    switcher: learnUiHtml.includes('id="theme-toggle-button"'),
    switcherStartsDark: learnUiHtml.includes('aria-label="Switch to light theme"'),
  };

  assert.deepEqual(themeContract, {
    defaultDarkTheme: true,
    darkColorScheme: true,
    lightThemeOverride: true,
    persistentThemeChoice: true,
    switcher: true,
    switcherStartsDark: true,
  });
});

test("learnUiLifecyclePanel_shouldExposeWithdrawReactivateControlsAndRoutes", () => {
  const lifecycleContract = {
    panel: learnUiHtml.includes('id="entity-lifecycle-panel"'),
    familyInput: learnUiHtml.includes('id="entity-lifecycle-family-input"'),
    entityIdInput: learnUiHtml.includes('id="entity-lifecycle-id-input"'),
    status: learnUiHtml.includes('id="entity-lifecycle-status"'),
    withdrawAction: learnUiHtml.includes('data-action="withdraw-entity"'),
    reactivateAction: learnUiHtml.includes('data-action="reactivate-entity"'),
    corpusRoute: learnUiHtml.includes('corpus: "/corpus/" + encodedId + "/status"'),
    quickCheckRoute: learnUiHtml.includes('quick_check: "/quick-checks/" + encodedId + "/status"'),
    openAnswerRoute: learnUiHtml.includes('open_answer_check: "/open-answer-checks/" + encodedId + "/status"'),
    criterionRoute: learnUiHtml.includes('assessment_criterion: "/assessment-criteria/" + encodedId + "/status"'),
    readinessRoute: learnUiHtml.includes('readiness_check: "/readiness-checks/" + encodedId + "/status"'),
    navigationRelationshipRoute: learnUiHtml.includes(
      'navigation_relationship: "/navigation-relationships/" + encodedId + "/status"',
    ),
    sourceRoute: learnUiHtml.includes('source: "/sources/" + encodedId + "/status"'),
    csrfMutation: learnUiHtml.includes("csrf: true") && learnUiHtml.includes('method: "PUT"'),
  };

  assert.deepEqual(lifecycleContract, {
    panel: true,
    familyInput: true,
    entityIdInput: true,
    status: true,
    withdrawAction: true,
    reactivateAction: true,
    corpusRoute: true,
    quickCheckRoute: true,
    openAnswerRoute: true,
    criterionRoute: true,
    readinessRoute: true,
    navigationRelationshipRoute: true,
    sourceRoute: true,
    csrfMutation: true,
  });
});

test("learnUiSourceDelete_shouldExposeDeleteControlAndBlockedMessage", () => {
  const sourceDeleteContract = {
    deleteAction: learnUiHtml.includes('data-action="delete-source-record"'),
    withdrawAction: learnUiHtml.includes('data-action="withdraw-source"'),
    reactivateAction: learnUiHtml.includes('data-action="reactivate-source"'),
    lifecycleStatus: learnUiHtml.includes('id="source-lifecycle-status"'),
    deleteRoute: learnUiHtml.includes('requestJson("/sources/" + encodeURIComponent(sourceId), {'),
    deleteMethod: learnUiHtml.includes('method: "DELETE"'),
    csrf: learnUiHtml.includes("csrf: true"),
    successMessage: learnUiHtml.includes('"Deleted source " + result.value.source.id + "."'),
    blockedMessage: learnUiHtml.includes('"Source is referenced; withdraw it instead."'),
    notFoundMessage: learnUiHtml.includes('"Source not found."'),
  };

  assert.deepEqual(sourceDeleteContract, {
    deleteAction: true,
    withdrawAction: true,
    reactivateAction: true,
    lifecycleStatus: true,
    deleteRoute: true,
    deleteMethod: true,
    csrf: true,
    successMessage: true,
    blockedMessage: true,
    notFoundMessage: true,
  });
});

test("learnUiWithdrawnItemsView_shouldRecordAndReactivateWithdrawnItems", () => {
  const withdrawnViewContract = {
    view: learnUiHtml.includes('id="withdrawn-items-view"'),
    openAction: learnUiHtml.includes('data-action="open-withdrawn-items"'),
    state: learnUiHtml.includes("withdrawnLifecycleItems: []"),
    recordsWithdrawal: learnUiHtml.includes("updateWithdrawnLifecycleItems({"),
    reactivationAction: learnUiHtml.includes('data-action=\'reactivate-withdrawn-item\'') ||
      learnUiHtml.includes('data-action="reactivate-withdrawn-item"') ||
      learnUiHtml.includes('button.dataset.action = "reactivate-withdrawn-item"'),
    activeReactivationBody: learnUiHtml.includes('body: { status: "active" }'),
    blockedDependentMessage: learnUiHtml.includes(
      "Remove active relationships, readiness requirements, open-answer check references, or learner-evidence target links before retrying.",
    ),
    removesReactivated: learnUiHtml.includes('status === "withdrawn"'),
    domSafeRendering: learnUiHtml.includes("document.createElement(\"strong\")") &&
      learnUiHtml.includes("button.dataset.entityId = item.entityId"),
  };

  assert.deepEqual(withdrawnViewContract, {
    view: true,
    openAction: true,
    state: true,
    recordsWithdrawal: true,
    reactivationAction: true,
    activeReactivationBody: true,
    blockedDependentMessage: true,
    removesReactivated: true,
    domSafeRendering: true,
  });
});
