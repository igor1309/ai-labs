#!/bin/bash
# Build and run a rehearsal, optionally profiling only a wall-clock window.
# Needs a logged-in GUI session for the panel.
#
#   scripts/profile-rehearsal.sh capture --capture-after 120 --capture-for 30 [--out DIR] [rehearsal options...]
#   scripts/profile-rehearsal.sh endurance [--out DIR] [rehearsal options...]
set -euo pipefail

cd "$(dirname "$0")/.."
out="profiles/$(date +%Y-%m-%d-%H%M%S)"
mode=capture
after=0
length=
args=()
die() { echo "$*" >&2; exit 64; }
if [[ ${1-} == capture || ${1-} == endurance ]]; then mode="$1"; shift; fi
while (($#)); do
  case "$1" in
    --out|--capture-after|--capture-for)
      (($# >= 2)) || die "$1 needs a value"
      case "$1" in
        --out) out="$2" ;;
        --capture-after) after="$2" ;;
        --capture-for) length="$2" ;;
      esac
      shift 2 ;;
    --report) die '--report is managed by this script; use --out DIR' ;;
    *) args+=("$1"); shift ;;
  esac
done
if [[ "$mode" == capture ]]; then
  [[ "$after" =~ ^[0-9]+([.][0-9]+)?$ ]] || die '--capture-after must be nonnegative seconds'
  [[ "$length" =~ ^[0-9]+([.][0-9]+)?$ && "$length" =~ [1-9] ]] || die '--capture-for must be positive seconds'
else
  [[ "$after" == 0 && -z "$length" ]] || die 'capture options require capture mode'
fi
mkdir -p "$out"
out="$(cd "$out" && pwd)"
# Exporting a table is safe only because this trace contains just the window.
[[ ! -e "$out/time.trace" ]] || die "trace already exists: $out/time.trace; choose a fresh --out"
pid=
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -f "$out/time-profile.xml" "$out/hangs.xml" "$out/signposts.xml"
  if [[ "$mode" == capture && "$status" != 0 ]]; then
    echo "capture failed (exit $status); see rehearsal.log and command diagnostics" > "$out/summary.txt"
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

swift build -c release --product AudelinRehearsal
app="$(swift build -c release --show-bin-path)/AudelinRehearsal"

if [[ "$mode" == endurance ]]; then
  "$app" ${args[@]+"${args[@]}"} --report "$out/rehearsal.log"
  exit
fi

"$app" ${args[@]+"${args[@]}"} --report "$out/rehearsal.log" &
pid=$!
sleep "$after"
kill -0 "$pid" 2>/dev/null || { wait "$pid"; pid=; die 'rehearsal ended before capture'; }
xcrun xctrace record --template 'Time Profiler' --instrument 'Points of Interest' \
  --output "$out/time.trace" --no-prompt --attach "$pid" --time-limit "${length}s"
wait "$pid"
pid=

table() { xcrun xctrace export --input "$out/time.trace" --xpath "/trace-toc/run[@number=\"1\"]/data/table[@schema=\"$1\"]"; }
table time-profile > "$out/time-profile.xml"
table potential-hangs > "$out/hangs.xml"
table os-signpost-interval > "$out/signposts.xml"

{
  echo "rehearsal ${args[*]-}"
  echo "capture after ${after}s for ${length}s (wall clock; trace contains only this window)"
  grep '^rehearsal: ' "$out/rehearsal.log"
  echo
  python3 -I scripts/summarize-trace.py "$out/time-profile.xml" "$out/hangs.xml" AudelinRehearsal 20 --signposts "$out/signposts.xml"
} > "$out/summary.txt"
cat "$out/summary.txt"
echo "trace and summary in $out"
