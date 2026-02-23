#!/usr/bin/env bash
set -euo pipefail

fixtures_dir="${PHASE2_FIXTURES_DIR:-}"

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

var_log_journal_exists="$(read_output "var-log-journal-exists.txt" bash -c 'test -d /var/log/journal && echo yes || echo no')"
if ! grep -q "^yes$" <<<"$var_log_journal_exists"; then
  issues+=("journald persistent storage is not enabled (expected /var/log/journal)")
fi

journald_dropin="$(read_output "journald-dropin.conf" cat /etc/systemd/journald.conf.d/loki-stack.conf)"
if ! grep -q "^SystemMaxUse=2G$" <<<"$journald_dropin"; then
  issues+=("journald cap SystemMaxUse=2G is not configured")
fi

if ! grep -q "^SystemKeepFree=5G$" <<<"$journald_dropin"; then
  issues+=("journald cap SystemKeepFree=5G is not configured")
fi

docker_logging_driver="$(read_output "docker-logging-driver.txt" docker info --format "{{.LoggingDriver}}")"
if ! grep -q "^journald$" <<<"$docker_logging_driver"; then
  issues+=("docker is not using journald logging driver (expected: journald)")
fi

etc_loki_stack_stat="$(read_output "etc-loki-stack-stat.txt" stat -c "%a %U %G" /etc/loki-stack)"
etc_loki_stack_mode="$(awk '{ print $1 }' <<<"$etc_loki_stack_stat" || true)"
etc_loki_stack_user="$(awk '{ print $2 }' <<<"$etc_loki_stack_stat" || true)"
etc_loki_stack_group="$(awk '{ print $3 }' <<<"$etc_loki_stack_stat" || true)"

if [[ "$etc_loki_stack_user" != "root" || "$etc_loki_stack_group" != "root" ]]; then
  issues+=("/etc/loki-stack is not owned by root:root")
fi

etc_loki_stack_other_perms="${etc_loki_stack_mode:2:1}"
if [[ "$etc_loki_stack_other_perms" != "0" ]]; then
  issues+=("/etc/loki-stack is world-accessible (expected not world-readable)")
fi

if [[ "${#issues[@]}" -eq 0 ]]; then
  echo "ok"
  exit 0
fi

for issue in "${issues[@]}"; do
  echo "fail: ${issue}" 1>&2
done

exit 1
