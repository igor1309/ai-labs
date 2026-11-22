#!/bin/bash
# compare.sh [benchmark options]: this code against the saved base. The full output
# stays in the printed file; the exit code is the benchmark's. Outside the agent
# sandbox, with nothing heavy alongside.
case "${1:-}" in -h|--help) sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; exit 0;; esac
set -uo pipefail
cd "$(dirname "$0")"
out="$(mktemp -t audelin-benchmark-compare)"
# A baseline comparison omits cases absent from base, including ticks.
swift package --disable-sandbox benchmark --format markdown "$@" > "$out" 2>&1
status=$?
if [ "$status" -eq 0 ]; then
  swift package --disable-sandbox benchmark baseline read base --format markdown >> "$out" 2>&1
  status=$?
fi
python3 -I medians.py "$out"
echo "full output: $out"
exit "$status"
