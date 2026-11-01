#!/bin/bash
# compare.sh [benchmark options]: this code against the saved base. The full output
# stays in the printed file; the exit code is the benchmark's. Outside the agent
# sandbox, with nothing heavy alongside.
case "${1:-}" in -h|--help) sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; exit 0;; esac
set -uo pipefail
cd "$(dirname "$0")"
out="$(mktemp -t audelin-benchmark-compare)"
swift package --disable-sandbox benchmark baseline compare base --format markdown "$@" > "$out" 2>&1
status=$?
python3 -I medians.py "$out"
echo "full output: $out"
exit "$status"
