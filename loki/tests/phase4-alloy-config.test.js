import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("test_phase4AlloyConfig_shouldDefineJournaldPipelinesAndCoreLabelDerivation_onRead", () => {
  const config = readFileSync("loki/host/alloy/config.alloy", "utf8")

  assert.ok(config.includes("loki.source.journal \"systemd_units\""))
  assert.ok(config.includes("loki.source.journal \"docker_containers\""))
  assert.ok(config.includes("loki.enrich \"docker_metadata\""))
  assert.ok(config.includes("source_labels = [\"__journal__systemd_unit\"]"))
  assert.ok(config.includes("source_labels = [\"__journal_container_id_full\"]"))
  assert.ok(config.includes("target_match_label = \"container_id\""))
  assert.ok(config.includes("logs_match_label = \"container_id\""))
  assert.ok(config.includes("replacement = deploy_env"))
})

