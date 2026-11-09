#!/bin/bash
# saves.sh [SECONDS]: at real speaking speed, saves and bytes written per minute and app CPU at 20,
# 1,620 and 6,000 lines, plus the CPU of one save. One size at a time.
case "${1:-}" in -h|--help) sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; exit 0;; esac
set -euo pipefail
cd "$(dirname "$0")"
./build.sh
seconds="${1:-60}"
for lines in 20 1620 6000; do
  .build/release/ProfileWord paced "$lines" "$seconds"
  .build/release/ProfileWord savecost "$lines" 200
done
