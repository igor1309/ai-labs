import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

test("materialContentCloseout_shouldTraceIntentToImplementedSpecPlanCodeAndTests", () => {
  const intent = readFileSync(projectRoot + "docs/intent/intent_learning_program_app.md", "utf8");
  const traceabilitySection = intent.split("## Downstream traceability")[1];
  const int03Row = traceabilitySection.split("\n").find($0 => $0.startsWith("| INT-03 "));

  assert.deepEqual(
    {
      hasAdr: int03Row.includes("ADR-021"),
      hasSpec: int03Row.includes("material-content-storage.md"),
      hasPlan: int03Row.includes("material-content-storage.md"),
      hasStorage: int03Row.includes("../../src/storage.js"),
      hasCorpus: int03Row.includes("../../src/corpus.js"),
      hasServer: int03Row.includes("../../src/server.js"),
      hasLearnUi: int03Row.includes("../../src/learn-ui.js"),
      hasHttpTests: int03Row.includes("../../tests/http-api-material-content.test.js"),
      hasBrowserTests: int03Row.includes("../../tests/topic-concept-material-navigation.playwright.js"),
    },
    {
      hasAdr: true,
      hasSpec: true,
      hasPlan: true,
      hasStorage: true,
      hasCorpus: true,
      hasServer: true,
      hasLearnUi: true,
      hasHttpTests: true,
      hasBrowserTests: true,
    },
  );
});

test("materialContentCloseout_shouldRefreshLocDashboard_onPhaseFiveCloseout", () => {
  const dashboard = readFileSync(repoRoot + "docs/loc-dashboard.html", "utf8");

  assert.match(dashboard, /Last updated: \d{4}-\d{2}-\d{2} \d{2}:\d{2} &middot; loc-dashboard\.sh/);
});
