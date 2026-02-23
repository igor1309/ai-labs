#!/usr/bin/env bash
set -euo pipefail

archive_path=""
dry_run="false"
target_root="${LOKI_STACK_RESTORE_TARGET_ROOT:-/}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive)
      archive_path="${2:-}"
      shift 2
      ;;
    --dry-run)
      dry_run="true"
      shift
      ;;
    *)
      echo "unknown argument: $1" 1>&2
      exit 1
      ;;
  esac
done

if [[ -z "$archive_path" ]]; then
  echo "missing required --archive argument" 1>&2
  exit 1
fi

if [[ "$dry_run" == "true" ]]; then
  tar -tzf "$archive_path" >/dev/null
  echo "ok"
  exit 0
fi

tar -xzf "$archive_path" -C "$target_root"
echo "restored"
