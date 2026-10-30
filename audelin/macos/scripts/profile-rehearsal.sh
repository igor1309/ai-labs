#!/bin/bash
# Profiles a long synthetic call: builds the rehearsal app for release,
# records it with Time Profiler (CPU and main-thread hangs) and writes a
# short text summary. Memory is the rehearsal's own footprint, sampled
# every second: the Allocations template does not start the app.
#
#   scripts/profile-rehearsal.sh [--out DIR] [rehearsal options...]
#
# Rehearsal options go to AudelinRehearsal, e.g. --minutes 180 --speed 10;
# see `AudelinRehearsal --help`. Needs a logged-in GUI session: the panel
# is on screen while it runs.
set -euo pipefail

cd "$(dirname "$0")/.."
out="profiles/$(date +%Y-%m-%d-%H%M%S)"
args=()
while (($#)); do
  case "$1" in
    --out) out="$2"; shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
mkdir -p "$out"
out="$(cd "$out" && pwd)"

swift build -c release --product AudelinRehearsal
app="$(swift build -c release --show-bin-path)/AudelinRehearsal"

record() {
  local template="$1" trace="$2"
  xcrun xctrace record --template "$template" --output "$trace" --no-prompt \
    --launch -- "$app" ${args[@]+"${args[@]}"} --report "$out/rehearsal.log"
}

record 'Time Profiler' "$out/time.trace"
table() { xcrun xctrace export --input "$out/time.trace" --xpath "/trace-toc/run[@number=\"1\"]/data/table[@schema=\"$1\"]"; }
table time-profile > "$out/time-profile.xml"
table potential-hangs > "$out/hangs.xml"

{
  echo "rehearsal ${args[*]-}"
  grep '^rehearsal: ' "$out/rehearsal.log"
  echo
  python3 -I scripts/summarize-trace.py "$out/time-profile.xml" "$out/hangs.xml" AudelinRehearsal 20
} > "$out/summary.txt"
rm "$out/time-profile.xml" "$out/hangs.xml"

cat "$out/summary.txt"
echo "traces in $out"
