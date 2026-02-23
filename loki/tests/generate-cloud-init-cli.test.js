import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

test("test_generateCloudInitCli_shouldPrintCloudInit_onValidArgs", () => {
  const result = spawnSync(
    "node",
    [
      generateCloudInitCliPath(),
      "--admin-user",
      "loki-admin",
      "--deploy-env",
      "prod",
      "--ssh-authorized-key",
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeKeyForTests loki-admin@laptop"
    ],
    { encoding: "utf8", env: process.env }
  )

  assert.deepEqual(
    { status: result.status, stdout: result.stdout, stderr: result.stderr },
    {
      status: 0,
      stdout: [
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
        "  - path: /etc/ssh/sshd_config.d/99-loki-stack.conf",
        "    permissions: \"0644\"",
        "    content: |",
        "      PasswordAuthentication no",
        "      PermitRootLogin no",
        "runcmd:",
        "  - [\"ufw\", \"default\", \"deny\", \"incoming\"]",
        "  - [\"ufw\", \"default\", \"allow\", \"outgoing\"]",
        "  - [\"ufw\", \"allow\", \"OpenSSH\"]",
        "  - [\"ufw\", \"--force\", \"enable\"]",
        "  - [\"systemctl\", \"restart\", \"ssh\"]",
        ""
      ].join("\n"),
      stderr: ""
    }
  )
})

function generateCloudInitCliPath() {
  return join(testDir(), "../scripts/phase1/generate-cloud-init-cli.js")
}

function testDir() {
  return dirname(fileURLToPath(import.meta.url))
}
