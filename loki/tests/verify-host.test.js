import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

test("test_verifyHost_shouldExitZero_onPhase1CompliantHost", () => {
  const result = spawnSync("bash", [verifyHostScriptPath()], {
    encoding: "utf8",
    env: {
      ...process.env,
      LOKI_DATA_MOUNTPOINT: "/var/lib/loki",
      PHASE1_FIXTURES_DIR: fixturesDir("ok")
    }
  })

  assert.equal(result.status, 0)
})

test("test_verifyHost_shouldExitNonZero_onHostWithNonSshInboundRules", () => {
  const result = spawnSync("bash", [verifyHostScriptPath()], {
    encoding: "utf8",
    env: {
      ...process.env,
      LOKI_DATA_MOUNTPOINT: "/var/lib/loki",
      PHASE1_FIXTURES_DIR: fixturesDir("bad-ufw")
    }
  })

  assert.equal(result.status, 1)
})

function verifyHostScriptPath() {
  return join(testDir(), "../scripts/phase1/verify-host.sh")
}

function fixturesDir(name) {
  return join(testDir(), "fixtures/phase1", name)
}

function testDir() {
  return dirname(fileURLToPath(import.meta.url))
}
