import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

test("test_verifyHostPhase4_shouldExitZero_onPhase4CompliantHost", () => {
  const result = spawnSync("bash", [verifyHostScriptPath()], {
    encoding: "utf8",
    env: {
      ...process.env,
      PHASE4_EXPECTED_ENV: "prod",
      PHASE4_FIXTURES_DIR: fixturesDir("ok")
    }
  })

  assert.equal(result.status, 0)
})

test("test_verifyHostPhase4_shouldExitNonZero_onHostWithInvalidAlloyConfig", () => {
  const result = spawnSync("bash", [verifyHostScriptPath()], {
    encoding: "utf8",
    env: {
      ...process.env,
      PHASE4_EXPECTED_ENV: "prod",
      PHASE4_FIXTURES_DIR: fixturesDir("bad-config")
    }
  })

  assert.equal(result.status, 1)
})

test("test_verifyHostPhase4_shouldExitNonZero_onHostWithPayloadOverrideOfCoreLabels", () => {
  const result = spawnSync("bash", [verifyHostScriptPath()], {
    encoding: "utf8",
    env: {
      ...process.env,
      PHASE4_EXPECTED_ENV: "prod",
      PHASE4_FIXTURES_DIR: fixturesDir("bad-override")
    }
  })

  assert.equal(result.status, 1)
})

function verifyHostScriptPath() {
  return join(testDir(), "../scripts/phase4/verify-host.sh")
}

function fixturesDir(name) {
  return join(testDir(), "fixtures/phase4", name)
}

function testDir() {
  return dirname(fileURLToPath(import.meta.url))
}

