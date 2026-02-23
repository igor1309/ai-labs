import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("test_phase5Templates_shouldMatchCloudflaredIngressDefaults_onRead", () => {
  assert.equal(
    readFileSync("loki/host/cloudflared/config.yml", "utf8"),
    [
      "tunnel: loki-grafana",
      "credentials-file: /etc/cloudflared/loki-grafana.json",
      "",
      "ingress:",
      "  - hostname: grafana.example.com",
      "    service: http://127.0.0.1:3000",
      "  - service: http_status:404",
      ""
    ].join("\n")
  )
})

