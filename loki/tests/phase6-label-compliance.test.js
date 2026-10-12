import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
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

test("test_phase6LabelCompliance_shouldCheckOnlyListedProjects_onDiscoveredComposeFiles", () => {
  const repoRoot = repoWithProjects({
    "trend-scout": "services:\n  api:\n    image: alpine:3.20\n    labels:\n      com.logging.project: trend-scout\n",
    unlisted: "services:\n  web:\n    image: alpine:3.20\n"
  })

  const result = runLabelCompliance({ allowlistPath: "allowlists.yml", repoRoot })

  assert.equal(result.checkedFiles, 1)
  assert.equal(result.issues.length, 1)
  assert.match(result.issues[0], /trend-scout\/compose\.yml:api missing required label 'com\.logging\.service'$/)
})

// A repository holding the fixture allowlist, which lists trend-scout,
// and a compose.yml in a folder of each project named.
function repoWithProjects(composeByProject) {
  const repoRoot = mkdtempSync(join(tmpdir(), "loki-labels-"))
  writeFileSync(join(repoRoot, "allowlists.yml"), JSON.stringify({ projects: ["trend-scout"], services: { "trend-scout": ["api"] } }))
  for (const [project, compose] of Object.entries(composeByProject)) {
    mkdirSync(join(repoRoot, project))
    writeFileSync(join(repoRoot, project, "compose.yml"), compose)
  }
  return repoRoot
}

function fixtureDir(name) {
  return join(testDir(), "fixtures/phase6", name)
}

function testDir() {
  return dirname(fileURLToPath(import.meta.url))
}
