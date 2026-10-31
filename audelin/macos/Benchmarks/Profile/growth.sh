#!/bin/bash
# growth.sh TAG [TAG_TO_COMPARE]: Time Profiler at 20, 1,620 and 6,000 lines, cut to the
# words, then CPU per word by step and how much each step grows. Loads the Mac for
# minutes, so run nothing heavy alongside. Runs stay in runs/TAG-LINES.
# SILENT=1 keeps the other side silent the whole call; QUIET=1 lets it say one sentence first.
case "${1:-}" in -h|--help) sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; exit 0;; esac
set -euo pipefail
cd "$(dirname "$0")"
./build.sh
record() {
  local out="runs/$1" lines="$2" words="$3" rounds="$4"
  rm -rf "$out"; mkdir -p "$out"
  xcrun xctrace record --template 'Time Profiler' --instrument 'Points of Interest' \
    --output "$out/t.trace" --no-prompt \
    --launch -- .build/release/ProfileWord words "$lines" "$words" "$rounds" ${SILENT:+silent} ${QUIET:+quiet} > "$out/rec.log" 2>&1
  local table
  for table in time-profile region-of-interest; do
    xcrun xctrace export --input "$out/t.trace" \
      --xpath "/trace-toc/run[@number=\"1\"]/data/table[@schema=\"$table\"]" > "$out/$table.xml"
  done
  python3 -I window.py "$out/time-profile.xml" "$out/region-of-interest.xml" "$out/stacks.json" "$((words * rounds))"
  rm -rf "$out/t.trace" "$out/time-profile.xml" "$out/region-of-interest.xml"
}
record "$1-20" 20 100 300
record "$1-1620" 1620 300 20
record "$1-6000" 6000 300 20
pairs=("$1-20" "$1-1620" "$1-20" "$1-6000")
if (($# > 1)); then pairs+=("$2-20" "$2-1620" "$2-20" "$2-6000"); fi
python3 -I steps.py "${pairs[@]}"
