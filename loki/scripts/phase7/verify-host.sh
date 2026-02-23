#!/usr/bin/env bash
set -euo pipefail

fixtures_dir="${PHASE7_FIXTURES_DIR:-}"
grafana_url="${PHASE7_GRAFANA_URL:-http://127.0.0.1:3000}"
grafana_api_token="${PHASE7_GRAFANA_API_TOKEN:-}"
backup_dir="${PHASE7_BACKUP_DIR:-/var/backups/loki-stack}"
restore_script_path="${PHASE7_RESTORE_SCRIPT_PATH:-/usr/local/bin/restore-loki-stack.sh}"

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

backup_listing="$(read_output "backup-listing.txt" ls -1 "${backup_dir}")"
if ! grep -qE '^loki-stack-[0-9]{8}T[0-9]{6}Z\.tar\.gz$' <<<"$backup_listing"; then
  issues+=("no loki backup archive found in ${backup_dir}")
fi

restore_dry_run="$(read_output "restore-dry-run.txt" bash "${restore_script_path}" --dry-run --archive "${backup_dir}/latest.tar.gz")"
if ! grep -q "^ok$" <<<"$restore_dry_run"; then
  issues+=("restore dry-run did not complete successfully")
fi

capacity_snapshot="$(read_output "capacity-check.txt" df -h /var/lib/loki /var/lib/grafana)"
if ! grep -q '/var/lib/loki' <<<"$capacity_snapshot"; then
  issues+=("capacity check output is missing /var/lib/loki entry")
fi

if ! grep -q '/var/lib/grafana' <<<"$capacity_snapshot"; then
  issues+=("capacity check output is missing /var/lib/grafana entry")
fi

contact_points_json="$(read_output "grafana-contact-points.json" curl -sS -H "Authorization: Bearer ${grafana_api_token}" "${grafana_url}/api/v1/provisioning/contact-points")"
if ! grep -q '"name":"loki-stack-telegram"' <<<"$contact_points_json"; then
  issues+=("grafana alerting is missing loki-stack-telegram contact point")
fi

if ! grep -q '"type":"telegram"' <<<"$contact_points_json"; then
  issues+=("grafana alerting contact point type is not telegram")
fi

rules_json="$(read_output "grafana-alert-rules.json" curl -sS -H "Authorization: Bearer ${grafana_api_token}" "${grafana_url}/api/v1/provisioning/alert-rules")"
if ! grep -q '"title":"Host disk usage high"' <<<"$rules_json"; then
  issues+=("grafana alerting is missing host disk usage rule")
fi

if ! grep -q '"title":"Loki stack service health degraded"' <<<"$rules_json"; then
  issues+=("grafana alerting is missing stack service health rule")
fi

if ! grep -q '"title":"No logs received"' <<<"$rules_json"; then
  issues+=("grafana alerting is missing no-logs rule")
fi

policy_json="$(read_output "grafana-notification-policy.json" curl -sS -H "Authorization: Bearer ${grafana_api_token}" "${grafana_url}/api/v1/provisioning/policies")"
if ! grep -q '"receiver":"loki-stack-telegram"' <<<"$policy_json"; then
  issues+=("grafana notification policy is not routing alerts to loki-stack-telegram")
fi

if [[ "${#issues[@]}" -eq 0 ]]; then
  echo "ok"
  exit 0
fi

for issue in "${issues[@]}"; do
  echo "fail: ${issue}" 1>&2
done

exit 1
