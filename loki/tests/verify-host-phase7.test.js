import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

test("test_verifyHostPhase7_shouldExitZero_onPhase7CompliantHost", () => {
  const result = spawnSync("bash", [verifyHostScriptPath()], {
    encoding: "utf8",
    env: {
      ...process.env,
      PHASE7_FIXTURES_DIR: fixturesDir("ok"),
      PHASE7_GRAFANA_API_TOKEN: "test-token",
      PHASE7_GRAFANA_URL: "http://127.0.0.1:3000"
    }
  })

  assert.equal(result.status, 0)
})

test("test_verifyHostPhase7_shouldExitNonZero_onHostMissingBackupArtifacts", () => {
  const result = spawnSync("bash", [verifyHostScriptPath()], {
    encoding: "utf8",
    env: {
      ...process.env,
      PHASE7_FIXTURES_DIR: fixturesDir("bad-backup"),
      PHASE7_GRAFANA_API_TOKEN: "test-token",
      PHASE7_GRAFANA_URL: "http://127.0.0.1:3000"
    }
  })

  assert.equal(result.status, 1)
})

test("test_verifyHostPhase7_shouldExitNonZero_onHostMissingTelegramAlertingRules", () => {
  const result = spawnSync("bash", [verifyHostScriptPath()], {
    encoding: "utf8",
    env: {
      ...process.env,
      PHASE7_FIXTURES_DIR: fixturesDir("bad-alerting"),
      PHASE7_GRAFANA_API_TOKEN: "test-token",
      PHASE7_GRAFANA_URL: "http://127.0.0.1:3000"
    }
  })

  assert.equal(result.status, 1)
})

function verifyHostScriptPath() {
  return join(testDir(), "../scripts/phase7/verify-host.sh")
}

function fixturesDir(name) {
  return join(testDir(), "fixtures/phase7", name)
}

function testDir() {
  return dirname(fileURLToPath(import.meta.url))
}

