import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("test_phase2Templates_shouldMatchExpectedDefaults_onRead", () => {
  assert.equal(
    readFileSync("loki/host/journald/loki-stack.conf", "utf8"),
    ["[Journal]", "Storage=persistent", "SystemMaxUse=2G", "SystemKeepFree=5G", ""].join("\n")
  )

  assert.equal(
    readFileSync("loki/host/docker/daemon.json", "utf8"),
    ["{", "  \"log-driver\": \"journald\"", "}", ""].join("\n")
  )
})

