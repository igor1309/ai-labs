export function renderCloudInit({ adminUser, deployEnv, sshAuthorizedKeys }) {
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
    "runcmd:",
    "  - [\"ufw\", \"default\", \"deny\", \"incoming\"]",
    "  - [\"ufw\", \"default\", \"allow\", \"outgoing\"]",
    "  - [\"ufw\", \"allow\", \"OpenSSH\"]",
    "  - [\"ufw\", \"--force\", \"enable\"]",
    ""
  ].join("\n")
}
