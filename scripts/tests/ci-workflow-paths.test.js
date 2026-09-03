import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");

test("ciPathFilters_shouldRunAgonaraCore_onPackageLockChanges", () => {
  const agonaraFilter = filterSection("agonara", "agonara-ci");

  assert.ok(agonaraFilter.includes('"agonara/package-lock.json"'));
});

test("ciPathFilters_shouldNotTreatDashboardScriptAsSharedInfrastructure", () => {
  const sharedFilter = filterSection("shared", "nomos");

  assert.doesNotMatch(sharedFilter, /"scripts\/\*\*"/);
});

function filterSection(filterName, nextFilterName) {
  const match = workflow.match(new RegExp(`\\n            ${filterName}:\\n([\\s\\S]*?)\\n            ${nextFilterName}:`));
  assert.ok(match, `missing ${filterName} filter`);
  return match[1];
}
