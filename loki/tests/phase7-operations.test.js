import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("test_phase7Operations_shouldDefineBackupRestoreAndAlertingRunbook_onRead", () => {
  const backupScript = readFileSync("loki/scripts/phase7/backup-loki-stack.sh", "utf8")
  const restoreScript = readFileSync("loki/scripts/phase7/restore-loki-stack.sh", "utf8")
  const operationsRunbook = readFileSync("loki/docs/provisioning/phase7-operations.md", "utf8")

  assert.ok(backupScript.includes("tar -czf"))
  assert.ok(restoreScript.includes("--dry-run"))
  assert.ok(operationsRunbook.includes("Host disk usage high"))
  assert.ok(operationsRunbook.includes("Loki stack service health degraded"))
  assert.ok(operationsRunbook.includes("No logs received"))
})

