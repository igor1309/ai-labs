export function renderCloudInit({ adminUser, deployEnv, sshAuthorizedKeys }) {
  if (!isNonEmptyString(adminUser)) {
    throw new Error("adminUser must be a non-empty string")
  }

  if (!["dev", "stage", "prod"].includes(deployEnv)) {
    throw new Error("deployEnv must be one of: dev, stage, prod")
  }

  if (!Array.isArray(sshAuthorizedKeys) || sshAuthorizedKeys.length === 0) {
    throw new Error("sshAuthorizedKeys must be a non-empty array")
  }

  if (!sshAuthorizedKeys.every(($0) => isNonEmptyString($0))) {
    throw new Error("sshAuthorizedKeys must contain only non-empty strings")
  }

  return [
    "#cloud-config",
    "users:",
    `  - name: ${adminUser}`,
    "    groups: [sudo]",
    "    shell: /bin/bash",
    "    sudo: [\"ALL=(ALL) NOPASSWD:ALL\"]",
    "    ssh_authorized_keys:",
    ...sshAuthorizedKeys.map(($0) => `      - "${$0}"`),
    "ssh_pwauth: false",
    "disable_root: true",
    "packages:",
    "  - ufw",
    "write_files:",
    "  - path: /etc/systemd/system.conf.d/10-deploy-env.conf",
    "    permissions: \"0644\"",
    "    content: |",
    "      [Manager]",
    `      DefaultEnvironment=DEPLOY_ENV=${deployEnv}`,
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
  ].join("\n")
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}
