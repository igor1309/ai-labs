import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("test_phase3Stack_shouldDefineLokiGrafanaComposeAndProvisioning_onRead", () => {
  const compose = readFileSync("loki/stack/compose.yml", "utf8")
  const lokiConfig = readFileSync("loki/stack/loki/loki-config.yml", "utf8")
  const datasource = readFileSync("loki/stack/grafana/provisioning/datasources/loki.yml", "utf8")

  assert.ok(compose.includes("services:"))
  assert.ok(compose.includes("loki:"))
  assert.ok(compose.includes("grafana:"))
  assert.ok(compose.includes("ports:"))
  assert.ok(compose.includes("\"127.0.0.1:3000:3000\""))

  assert.ok(lokiConfig.includes("retention_period: 336h"))
  assert.ok(lokiConfig.includes("retention_enabled: true"))

  assert.ok(datasource.includes("name: Loki"))
  assert.ok(datasource.includes("type: loki"))
  assert.ok(datasource.includes("url: http://loki:3100"))
})

