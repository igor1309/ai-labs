#!/usr/bin/env bash
set -euo pipefail

fixtures_dir="${PHASE5_FIXTURES_DIR:-}"
grafana_hostname="${PHASE5_GRAFANA_HOSTNAME:-grafana.example.com}"

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

cloudflared_enabled="$(read_output "cloudflared-is-enabled.txt" systemctl is-enabled cloudflared)"
if ! grep -q "^enabled$" <<<"$cloudflared_enabled"; then
  issues+=("cloudflared service is not enabled")
fi

cloudflared_active="$(read_output "cloudflared-is-active.txt" systemctl is-active cloudflared)"
if ! grep -q "^active$" <<<"$cloudflared_active"; then
  issues+=("cloudflared service is not active")
fi

cloudflared_restart_policy="$(read_output "cloudflared-restart-policy.txt" systemctl show cloudflared -p Restart --value)"
if ! grep -q "^always$" <<<"$cloudflared_restart_policy"; then
  issues+=("cloudflared service is not configured to auto-recover (expected Restart=always)")
fi

cloudflared_config="$(read_output "cloudflared-config.yml" cat /etc/cloudflared/config.yml)"

require_config_match() {
  local pattern="$1"
  local error_message="$2"

  if ! grep -qE "$pattern" <<<"$cloudflared_config"; then
    issues+=("$error_message")
  fi
}

require_config_match '^tunnel:[[:space:]]+[[:alnum:]-]+$' "cloudflared config is missing tunnel identifier"
require_config_match '^credentials-file:[[:space:]]+/etc/cloudflared/.*\.json$' "cloudflared config is missing credentials-file path"
require_config_match '^[[:space:]]+-[[:space:]]+hostname:[[:space:]]+.+$' "cloudflared config is missing hostname ingress rule"
require_config_match '^[[:space:]]+service:[[:space:]]+http://127\.0\.0\.1:3000$' "cloudflared config is not routing to local Grafana origin"
require_config_match '^[[:space:]]+-[[:space:]]+service:[[:space:]]+http_status:404$' "cloudflared config is missing terminal deny ingress rule"

access_response_headers="$(read_output "access-response-headers.txt" curl -sS -I "https://${grafana_hostname}/login")"
if ! grep -qE '^HTTP/[0-9.]+[[:space:]]+(302|401|403)' <<<"$access_response_headers"; then
  issues+=("grafana hostname is not protected by Cloudflare Access (expected 302/401/403 for unauthenticated request)")
fi

if ! grep -qi '/cdn-cgi/access/' <<<"$access_response_headers"; then
  issues+=("grafana hostname response does not include Cloudflare Access challenge path")
fi

grafana_listen="$(read_output "grafana-listen.txt" ss -ltn sport = :3000)"
if ! grep -q '127\.0\.0\.1:3000' <<<"$grafana_listen"; then
  issues+=("grafana is not bound to localhost on port 3000")
fi

if grep -qE '(0\.0\.0\.0:3000|:::3000|\*:3000)' <<<"$grafana_listen"; then
  issues+=("grafana is exposed publicly on port 3000")
fi

if [[ "${#issues[@]}" -eq 0 ]]; then
  echo "ok"
  exit 0
fi

for issue in "${issues[@]}"; do
  echo "fail: ${issue}" 1>&2
done

exit 1
