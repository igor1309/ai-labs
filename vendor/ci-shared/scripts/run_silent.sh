#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: run_silent.sh <label> <command> [args ...]" >&2
  exit 1
fi

label="$1"
shift

output_file="$(mktemp)"

if "$@" >"$output_file" 2>&1; then
  printf "[%s] ok\n" "$label"
  rm -f "$output_file"
  exit 0
fi

printf "[%s] failed\n" "$label" >&2
cat "$output_file" >&2
rm -f "$output_file"
exit 1
