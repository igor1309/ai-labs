#!/bin/bash
# wordcost.sh [WORDS]: each word's instructions at 20, 1,620 and 6,000 lines, then the
# percentiles, and the cost of words that added a line or sealed rows against the rest.
set -euo pipefail
cd "$(dirname "$0")"
./build.sh
for lines in 20 1620 6000; do
  .build/release/ProfileWord wordcost "$lines" "${1:-400}" 2>/dev/null > "runs/wordcost-$lines.txt"
  python3 -I wordcost.py "runs/wordcost-$lines.txt" "$lines"
done
