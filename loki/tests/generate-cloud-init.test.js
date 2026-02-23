import assert from "node:assert/strict"
import test from "node:test"

test("test_moduleExports_shouldExposeRenderCloudInit_onImport", async () => {
  const module = await loadGenerateCloudInitModule()

  assert.equal(typeof module?.renderCloudInit, "function")
})

test("test_renderCloudInit_shouldRenderPhase1CloudInit_onValidInputs", async () => {
  const module = await loadGenerateCloudInitModule()

  const result = module?.renderCloudInit?.({
    adminUser: "loki-admin",
    deployEnv: "prod",
    sshAuthorizedKeys: ["ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeKeyForTests loki-admin@laptop"]
  })

  assert.equal(
    result,
    [
      "#cloud-config",
      "users:",
      "  - name: loki-admin",
      "    groups: [sudo]",
      "    shell: /bin/bash",
      "    sudo: [\"ALL=(ALL) NOPASSWD:ALL\"]",
      "    ssh_authorized_keys:",
      "      - \"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeKeyForTests loki-admin@laptop\"",
      "ssh_pwauth: false",
      "disable_root: true",
      "packages:",
      "  - ufw",
      "write_files:",
      "  - path: /etc/systemd/system.conf.d/10-deploy-env.conf",
      "    permissions: \"0644\"",
      "    content: |",
      "      [Manager]",
      "      DefaultEnvironment=DEPLOY_ENV=prod",
      "runcmd:",
      "  - [\"ufw\", \"default\", \"deny\", \"incoming\"]",
      "  - [\"ufw\", \"default\", \"allow\", \"outgoing\"]",
      "  - [\"ufw\", \"allow\", \"OpenSSH\"]",
      "  - [\"ufw\", \"--force\", \"enable\"]",
      ""
    ].join("\n")
  )
})

async function loadGenerateCloudInitModule() {
  try {
    return await import("../scripts/phase1/generate-cloud-init.js")
  } catch {
    return null
  }
}
