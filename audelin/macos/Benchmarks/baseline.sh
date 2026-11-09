#!/bin/bash
# Live transcription baseline: fixture speech on both sides through the app's
# composition and real Parakeet v3 at 1x (Baseline/), once after the build and
# then warm. Needs a logged-in GUI session for the panel and Parakeet's models
# on disk.
#
#   ./baseline.sh [--out DIR] [--runs 3] [--minutes 5]
set -euo pipefail

cd "$(dirname "$0")"
out="Baseline/runs/$(date +%Y-%m-%d-%H%M%S)"
runs=3
minutes=5
while (($#)); do
  case "$1" in
    --out) out="$2"; shift 2 ;;
    --runs) runs="$2"; shift 2 ;;
    --minutes) minutes="$2"; shift 2 ;;
    *) echo "usage: baseline.sh [--out DIR] [--runs 3] [--minutes 5]" >&2; exit 64 ;;
  esac
done
mkdir -p "$out"
out="$(cd "$out" && pwd)"

fixture_text=../../docs/research/baseline/fixture.txt
fixture="$out/fixture.aiff"
say -v Samantha -r 170 -f "$fixture_text" -o "$fixture"

swift build --package-path Baseline -c release
binary="$(swift build --package-path Baseline -c release --show-bin-path)/AudelinBaseline"

{
  echo "commit $(git rev-parse --short HEAD)$(git diff --quiet HEAD -- .. || echo ' (uncommitted changes)')"
  echo "mac $(sysctl -n hw.model), $(sysctl -n machdep.cpu.brand_string), $(($(sysctl -n hw.memsize) / 1073741824)) GB"
  echo "macOS $(sw_vers -productVersion) ($(sw_vers -buildVersion))"
  echo "fixture $(afinfo "$fixture" | grep -E 'Data format|estimated duration' | tr -s ' ' | tr '\n' ';')"
  echo "voice Samantha, rate 170; fed looped for $minutes min on both sides, 1x"
} > "$out/environment.txt"
cat "$out/environment.txt"

# The first run follows the build; the warm runs follow it in turn.
warm=()
for ((i = 1; i <= runs; i++)); do warm+=("warm-$i"); done
for run in first ${warm[@]+"${warm[@]}"}; do
  recordings="$(mktemp -d -t audelin-baseline)"
  echo "== $run"
  # Other work on the Mac, and on its Neural Engine, slows recognition.
  echo "load before the run: $(sysctl -n vm.loadavg)" > "$out/$run.log"
  "$binary" --speech "$fixture" --minutes "$minutes" --speed 1 \
    --recordings-dir "$recordings" --report "$out/$run.log" > /dev/null 2>&1 || echo "$run failed: $?" >> "$out/$run.log"
  cat "$out/$run.log"
  cp "$recordings"/*/transcript.md "$out/$run-transcript.md" 2>/dev/null || true
  rm -rf "$recordings"
done
echo "results in $out"
