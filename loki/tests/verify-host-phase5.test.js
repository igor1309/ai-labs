import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

test("test_verifyHostPhase5_shouldExitZero_onPhase5CompliantHost", () => {
  const result = spawnSync("bash", [verifyHostScriptPath()], {
    encoding: "utf8",
    env: {
      ...process.env,
      PHASE5_FIXTURES_DIR: fixturesDir("ok"),
      PHASE5_GRAFANA_HOSTNAME: "grafana.example.com"
    }
  })

  assert.equal(result.status, 0)
})

test("test_verifyHostPhase5_shouldExitNonZero_onHostWithoutCloudflareAccessProtection", () => {
  const result = spawnSync("bash", [verifyHostScriptPath()], {
    encoding: "utf8",
    env: {
      ...process.env,
      PHASE5_FIXTURES_DIR: fixturesDir("bad-access"),
      PHASE5_GRAFANA_HOSTNAME: "grafana.example.com"
    }
  })

  assert.equal(result.status, 1)
})

test("test_verifyHostPhase5_shouldExitNonZero_onHostWithPublicGrafanaOriginPort", () => {
  const result = spawnSync("bash", [verifyHostScriptPath()], {
    encoding: "utf8",
    env: {
      ...process.env,
      PHASE5_FIXTURES_DIR: fixturesDir("bad-public-origin"),
      PHASE5_GRAFANA_HOSTNAME: "grafana.example.com"
    }
  })

  assert.equal(result.status, 1)
})

function verifyHostScriptPath() {
  return join(testDir(), "../scripts/phase5/verify-host.sh")
}

function fixturesDir(name) {
  return join(testDir(), "fixtures/phase5", name)
}

function testDir() {
  return dirname(fileURLToPath(import.meta.url))
}

