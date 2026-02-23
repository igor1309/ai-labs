import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

test("test_verifyHostPhase2_shouldExitZero_onPhase2CompliantHost", () => {
  const result = spawnSync("bash", [verifyHostScriptPath()], {
    encoding: "utf8",
    env: {
      ...process.env,
      PHASE2_FIXTURES_DIR: fixturesDir("ok")
    }
  })

  assert.equal(result.status, 0)
})

test("test_verifyHostPhase2_shouldExitNonZero_onHostWithNonJournaldDockerLogging", () => {
  const result = spawnSync("bash", [verifyHostScriptPath()], {
    encoding: "utf8",
    env: {
      ...process.env,
      PHASE2_FIXTURES_DIR: fixturesDir("bad-docker")
    }
  })

  assert.equal(result.status, 1)
})

test("test_verifyHostPhase2_shouldExitNonZero_onHostWithoutPersistentJournald", () => {
  const result = spawnSync("bash", [verifyHostScriptPath()], {
    encoding: "utf8",
    env: {
      ...process.env,
      PHASE2_FIXTURES_DIR: fixturesDir("bad-journald-dir")
    }
  })

  assert.equal(result.status, 1)
})

function verifyHostScriptPath() {
  return join(testDir(), "../scripts/phase2/verify-host.sh")
}

function fixturesDir(name) {
  return join(testDir(), "fixtures/phase2", name)
}

function testDir() {
  return dirname(fileURLToPath(import.meta.url))
}
