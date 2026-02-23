#!/usr/bin/env bash
set -euo pipefail

fixtures_dir="${PHASE4_FIXTURES_DIR:-}"
loki_api_url="${LOKI_API_URL:-http://127.0.0.1:3100}"
expected_env="${PHASE4_EXPECTED_ENV:-${DEPLOY_ENV:-prod}}"

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

alloy_enabled="$(read_output "alloy-is-enabled.txt" systemctl is-enabled alloy)"
if ! grep -q "^enabled$" <<<"$alloy_enabled"; then
  issues+=("alloy service is not enabled")
fi

alloy_active="$(read_output "alloy-is-active.txt" systemctl is-active alloy)"
if ! grep -q "^active$" <<<"$alloy_active"; then
  issues+=("alloy service is not active")
fi

alloy_config="$(read_output "alloy-config.alloy" cat /etc/alloy/config.alloy)"

require_config_match() {
  local pattern="$1"
  local error_message="$2"

  if ! grep -qE "$pattern" <<<"$alloy_config"; then
    issues+=("$error_message")
  fi
}

require_config_literal() {
  local literal="$1"
  local error_message="$2"

  if ! grep -qF "$literal" <<<"$alloy_config"; then
    issues+=("$error_message")
  fi
}

query_has_label() {
  local query="$1"
  local label="$2"
  local value="$3"

  grep -qF "${label}=\"${value}\"" <<<"$query"
}

normalize_query() {
  local query="$1"

  sed 's/\\"/"/g' <<<"$query"
}

require_config_match 'loki\.source\.journal "systemd_units"' "alloy config is missing systemd journald source"
require_config_match 'loki\.source\.journal "docker_containers"' "alloy config is missing docker journald source"
require_config_match 'loki\.enrich "docker_metadata"' "alloy config is missing docker metadata enrichment"
require_config_match 'source_labels = \["__journal__systemd_unit"\]' "alloy config is missing systemd unit extraction"
require_config_match 'source_labels = \["__journal_container_id_full"\]' "alloy config is missing CONTAINER_ID_FULL extraction"
require_config_literal 'regex = "^([a-z0-9-]+)__([a-z0-9-]+)@[^.]+\\.service$"' "alloy config is missing required <project>__<service>@<instance>.service pattern"
require_config_match 'target_match_label = "container_id"' "alloy config is missing docker target match label"
require_config_match 'logs_match_label = "container_id"' "alloy config is missing docker log match label"
require_config_match 'replacement = deploy_env' "alloy config is not deriving env from DEPLOY_ENV"

docker_journal_entry="$(read_output "docker-journal-entry.json" journalctl -n 1 CONTAINER_NAME=loki-phase4-smoke -o json)"
if ! grep -q '"CONTAINER_ID_FULL"' <<<"$docker_journal_entry"; then
  issues+=("docker journald entries do not include CONTAINER_ID_FULL (cannot join with docker discovery metadata)")
fi

systemd_query="$(read_output "systemd-query.json" curl -sS -G --data-urlencode 'query={project="trend-scout",service="api"}' --data-urlencode 'limit=1' "${loki_api_url}/loki/api/v1/query")"
systemd_query="$(normalize_query "$systemd_query")"
if ! grep -q '"status":"success"' <<<"$systemd_query"; then
  issues+=("systemd smoke query failed against Loki API")
fi

if ! query_has_label "$systemd_query" "project" "trend-scout"; then
  issues+=("systemd smoke query result is missing project=trend-scout")
fi

if ! query_has_label "$systemd_query" "service" "api"; then
  issues+=("systemd smoke query result is missing service=api")
fi

if ! query_has_label "$systemd_query" "env" "$expected_env"; then
  issues+=("systemd smoke query result is missing env=${expected_env}")
fi

docker_query="$(read_output "docker-query.json" curl -sS -G --data-urlencode 'query={project="trend-scout",service="worker"}' --data-urlencode 'limit=1' "${loki_api_url}/loki/api/v1/query")"
docker_query="$(normalize_query "$docker_query")"
if ! grep -q '"status":"success"' <<<"$docker_query"; then
  issues+=("docker smoke query failed against Loki API")
fi

if ! query_has_label "$docker_query" "project" "trend-scout"; then
  issues+=("docker smoke query result is missing project=trend-scout")
fi

if ! query_has_label "$docker_query" "service" "worker"; then
  issues+=("docker smoke query result is missing service=worker")
fi

if ! query_has_label "$docker_query" "env" "$expected_env"; then
  issues+=("docker smoke query result is missing env=${expected_env}")
fi

override_query="$(read_output "override-query.json" curl -sS -G --data-urlencode 'query={project="trend-scout",service="api"} |= "phase4-override-attempt"' --data-urlencode 'limit=1' "${loki_api_url}/loki/api/v1/query")"
override_query="$(normalize_query "$override_query")"
if ! query_has_label "$override_query" "project" "trend-scout"; then
  issues+=("override smoke query does not keep injected project label")
fi

if ! query_has_label "$override_query" "service" "api"; then
  issues+=("override smoke query does not keep injected service label")
fi

if ! query_has_label "$override_query" "env" "$expected_env"; then
  issues+=("override smoke query does not keep injected env label")
fi

if query_has_label "$override_query" "project" "evil-project"; then
  issues+=("application payload overrode project label")
fi

if query_has_label "$override_query" "service" "evil-service"; then
  issues+=("application payload overrode service label")
fi

if [[ "${#issues[@]}" -eq 0 ]]; then
  echo "ok"
  exit 0
fi

for issue in "${issues[@]}"; do
  echo "fail: ${issue}" 1>&2
done

exit 1
