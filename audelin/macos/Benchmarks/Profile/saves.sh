#!/bin/bash
# saves.sh [SECONDS]: at real speaking speed, saves per minute and app CPU at 20,
# 1,620 and 6,000 lines, plus the CPU of one save. One size at a time.
set -euo pipefail
cd "$(dirname "$0")"
./build.sh
seconds="${1:-60}"
for lines in 20 1620 6000; do
  .build/release/ProfileWord paced "$lines" "$seconds"
  .build/release/ProfileWord savecost "$lines" 200
done
