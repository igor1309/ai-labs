import assert from "node:assert/strict"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { runLabelCompliance } from "../scripts/phase6/check-compose-labels.js"

test("test_phase6LabelCompliance_shouldPass_onRepositoryComposeFiles", () => {
  const result = runLabelCompliance({
    allowlistPath: "loki/docs/onboarding/label-allowlists.yml",
    repoRoot: process.cwd()
  })

  assert.equal(result.issues.length, 0)
})

test("test_phase6LabelCompliance_shouldFail_onComposeServiceMissingRequiredLabels", () => {
  const result = runLabelCompliance({
    allowlistPath: "allowlists.yml",
    filePaths: ["compose.yml"],
    repoRoot: fixtureDir("missing-label")
  })

  assert.equal(result.issues.length, 1)
})

test("test_phase6LabelCompliance_shouldFail_onDisallowedProjectOrServiceValues", () => {
  const result = runLabelCompliance({
    allowlistPath: "allowlists.yml",
    filePaths: ["compose.yml"],
    repoRoot: fixtureDir("bad-allowlist-value")
  })

  assert.equal(result.issues.length, 1)
})

function fixtureDir(name) {
  return join(testDir(), "fixtures/phase6", name)
}

function testDir() {
  return dirname(fileURLToPath(import.meta.url))
}
