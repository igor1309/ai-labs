#!/bin/bash
# The nightly long runs, layers 3 and 4 of docs/research/profiling-in-development.md.
# Run them on the self-hosted Mac only, one at a time, with nothing else on it:
# their numbers compare only between runs on the same quiet machine.
#
#   scripts/nightly.sh --out DIR [--history DIR] [--minutes 180]
#
# 1. A real-model run at 1x, no profiler: macOS speech on both sides through the
#    app's composition and real Parakeet, lag and footprint every audio minute.
# 2. Short Time Profiler windows, CPU and hangs, at large preloaded sizes.
# 3. report.md and report.json: what ran, on which build, models, machine and
#    toolchain, compared with the last run only when all of those match.
#
# Needs a logged-in GUI session for the panel and Parakeet's models on disk.
# DIR/../latest (or --history DIR/latest) points at the last finished run.
set -euo pipefail

usage() { echo 'usage: nightly.sh --out DIR [--history DIR] [--minutes 180]' >&2; exit 64; }
out= history= minutes=180
while (($#)); do
  case "$1" in
    --out) (($# >= 2)) || usage; out="$2"; shift 2 ;;
    --history) (($# >= 2)) || usage; history="$2"; shift 2 ;;
    --minutes) (($# >= 2)) || usage; minutes="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[[ -n "$out" ]] || usage
[[ "$minutes" =~ ^[1-9][0-9]*$ ]] || usage
mkdir -p "$out"
out="$(cd "$out" && pwd)"
history="${history:-$(dirname "$out")}"
mkdir -p "$history"
history="$(cd "$history" && pwd)"
cd "$(dirname "$0")/.."

# The speech is generated once per machine and kept, so every night plays the same audio.
speech="$history/speech"
Benchmarks/speech-audio.sh "$speech"

models="$HOME/Library/Application Support/FluidAudio/Models"
[[ -d "$models" ]] || { echo "no Parakeet models in $models" >&2; exit 1; }
digest() { shasum -a 256 | cut -c1-16; }
# File names and sizes: a changed or redownloaded model changes this.
models_id="$(cd "$models" && find . -type f -print0 | sort -z | xargs -0 stat -f '%N %z' | digest)"
speech_id="$(cat "$speech/mine.wav" "$speech/theirs.wav" | digest)"

captures=(1620 6000)
python3 -I - "$out/identity.json" <<EOF
import json, sys
json.dump({
    "workload": {"endurance": "AudelinBaseline --speech mine.wav --their-speech theirs.wav --minutes $minutes --speed 1",
                 "speech": "$speech_id",
                 "captures": ["ProfileWord words %d 300 20" % lines for lines in (${captures[*]/%/,})]},
    "build": "swift build -c release",
    "models": "$models_id",
    "machine": {"model": "$(sysctl -n hw.model)", "cpu": "$(sysctl -n machdep.cpu.brand_string)",
                "memory_gb": $(($(sysctl -n hw.memsize) / 1073741824)),
                "macos": "$(sw_vers -productVersion) ($(sw_vers -buildVersion))"},
    "toolchain": {"swift": "$(swift --version 2>/dev/null | head -n 1)",
                  "xcode": "$(xcodebuild -version | tr '\n' ' ' | sed 's/ $//')"},
    "commit": "$(git rev-parse --short HEAD)",
    "started": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
}, open(sys.argv[1], "w"), indent=2, sort_keys=True)
EOF

recordings="$(mktemp -d "${TMPDIR:-/tmp}/audelin-nightly.XXXXXX")"
trap 'rm -rf "$recordings"' EXIT

# 1. The long run. Other work on the Mac, and on its Neural Engine, slows recognition.
swift build --package-path Benchmarks/Baseline -c release
baseline="$(swift build --package-path Benchmarks/Baseline -c release --show-bin-path)/AudelinBaseline"
echo "load before the run: $(sysctl -n vm.loadavg)" > "$out/endurance.log"
status=0
"$baseline" --speech "$speech/mine.wav" --their-speech "$speech/theirs.wav" --minutes "$minutes" --speed 1 \
  --recordings-dir "$recordings" --report "$out/endurance.log" > /dev/null 2>&1 || status=$?
[[ $status == 0 ]] || echo "endurance failed: $status" >> "$out/endurance.log"

# 2. Short windows at large preloaded sizes, under Time Profiler with its hangs.
Benchmarks/Profile/build.sh
profile="Benchmarks/Profile/.build/release/ProfileWord"
for lines in "${captures[@]}"; do
  capture="$out/capture-$lines"
  mkdir -p "$capture"
  xcrun xctrace record --template 'Time Profiler' --instrument 'Points of Interest' \
    --output "$capture/time.trace" --no-prompt \
    --launch -- "$profile" words "$lines" 300 20 > "$capture/record.log" 2>&1 || { status=1; continue; }
  for table in time-profile potential-hangs region-of-interest; do
    xcrun xctrace export --input "$capture/time.trace" \
      --xpath "/trace-toc/run[@number=\"1\"]/data/table[@schema=\"$table\"]" > "$capture/$table.xml"
  done
  python3 -I scripts/summarize-trace.py "$capture/time-profile.xml" "$capture/potential-hangs.xml" ProfileWord 20 \
    --signposts "$capture/region-of-interest.xml" --json "$capture/summary.json" > "$capture/summary.txt" || status=1
  rm -rf "$capture/time.trace" "$capture"/*.xml
done

# 3. The report, against the last run.
previous=()
[[ -e "$history/latest/report.json" ]] && previous=(--previous "$history/latest")
python3 -I scripts/nightly-report.py "$out" ${previous[@]+"${previous[@]}"}
# Only a run that finished becomes the one the next night compares with.
if [[ $status == 0 ]]; then ln -sfn "$out" "$history/latest"; fi
exit "$status"
