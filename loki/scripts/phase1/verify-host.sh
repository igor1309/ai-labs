#!/usr/bin/env bash
set -euo pipefail

fixtures_dir="${PHASE1_FIXTURES_DIR:-}"
mountpoint="${LOKI_DATA_MOUNTPOINT:-/var/lib/loki}"

issues=()

read_output() {
  local fixture_name="$1"
  shift

  if [[ -n "$fixtures_dir" ]]; then
    cat "${fixtures_dir}/${fixture_name}"
    return 0
  fi

  "$@"
}

sshd_t="$(read_output "sshd-T.txt" sshd -T)"
if ! grep -q "^passwordauthentication no$" <<<"$sshd_t"; then
  issues+=("sshd password authentication is not disabled (expected: passwordauthentication no)")
fi

if ! grep -q "^permitrootlogin no$" <<<"$sshd_t"; then
  issues+=("sshd permits root login (expected: permitrootlogin no)")
fi

ufw_status="$(read_output "ufw-status.txt" ufw status)"
if ! grep -q "^Status: active$" <<<"$ufw_status"; then
  issues+=("ufw is not active (expected: Status: active)")
fi

ufw_allow_lines="$(grep -E "^[[:alnum:]].*[[:space:]]+ALLOW[[:space:]]+" <<<"$ufw_status" || true)"
if [[ -z "$ufw_allow_lines" ]]; then
  issues+=("ufw does not allow OpenSSH (expected an ALLOW rule for OpenSSH)")
fi

while IFS= read -r line; do
  if [[ -z "$line" ]]; then
    continue
  fi

  if ! [[ "$line" =~ ^OpenSSH(\ \(v6\))?[[:space:]]+ALLOW[[:space:]]+ ]]; then
    issues+=("ufw allows unexpected inbound rule: ${line}")
  fi
done <<<"$ufw_allow_lines"

systemd_env_conf="$(read_output "systemd-default-environment.conf" cat /etc/systemd/system.conf.d/10-deploy-env.conf)"
deploy_env_line="$(grep -E "^DefaultEnvironment=DEPLOY_ENV=" <<<"$systemd_env_conf" || true)"
if [[ -z "$deploy_env_line" ]]; then
  issues+=("DEPLOY_ENV is not configured for systemd (expected DefaultEnvironment=DEPLOY_ENV=...)")
else
  if ! [[ "$deploy_env_line" =~ ^DefaultEnvironment=DEPLOY_ENV=(dev|stage|prod)$ ]]; then
    issues+=("DEPLOY_ENV value is invalid (expected: dev, stage, or prod)")
  fi
fi

findmnt_output="$(read_output "findmnt.txt" findmnt -rn -o TARGET,SOURCE,FSTYPE,OPTIONS)"
if ! awk -v mountpoint="$mountpoint" '$1==mountpoint { found=1 } END { exit found ? 0 : 1 }' <<<"$findmnt_output"; then
  issues+=("loki data volume is not mounted at ${mountpoint}")
fi

if [[ "${#issues[@]}" -eq 0 ]]; then
  echo "ok"
  exit 0
fi

for issue in "${issues[@]}"; do
  echo "fail: ${issue}" 1>&2
done

exit 1
