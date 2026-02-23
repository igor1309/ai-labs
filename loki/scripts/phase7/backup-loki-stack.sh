#!/usr/bin/env bash
set -euo pipefail

backup_dir="${LOKI_STACK_BACKUP_DIR:-/var/backups/loki-stack}"
grafana_data_dir="${LOKI_STACK_GRAFANA_DATA_DIR:-/var/lib/grafana}"
loki_data_dir="${LOKI_STACK_LOKI_DATA_DIR:-/var/lib/loki}"

timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
archive_path="${backup_dir}/loki-stack-${timestamp}.tar.gz"

mkdir -p "$backup_dir"

tar -czf "$archive_path" -C "/" "${loki_data_dir#/}" "${grafana_data_dir#/}"

echo "$archive_path"
