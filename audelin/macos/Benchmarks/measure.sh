#!/bin/bash
# measure.sh BASE TIP: the benchmark and the profile of two commits, with this commit's
# tools on both. Alternates three benchmark runs, then profiles each once. The report
# and everything behind it go to a new folder in /tmp/audelin-measure. Takes a long
# time and loads the Mac, so run it outside the agent sandbox with nothing heavy alongside.
case "${1:-}" in -h|--help) sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; exit 0;; esac
set -uo pipefail
cd "$(dirname "$0")"
here="$PWD"
if (($# != 2)); then echo "usage: measure.sh BASE TIP" >&2; exit 2; fi
if [ -n "$(git status --porcelain -- .)" ]; then echo "commit the tools first" >&2; exit 2; fi
tools="$(git rev-parse --short HEAD)"
base="$(git rev-parse --short "$1^{commit}")" && tip="$(git rev-parse --short "$2^{commit}")" || exit 2
root=/private/tmp/audelin-measure
out="$root/$(date +%Y%m%d-%H%M%S)-$base-$tip"
mkdir -p "$out/runs"
top="$(git rev-parse --show-toplevel)"
relative="$(git rev-parse --show-prefix)"

prepare() {
  local tree="$root/tree-$1"
  [ -d "$tree" ] || git worktree add --quiet --detach "$tree" "$1" || return 1
  git -C "$top" archive "$tools" "$relative" | tar -x -C "$tree" || return 1
  printf '%s\n' "$tree/$relative"
}
bench_of() { (cd "$1" && Profile/build.sh && swift build -c release --disable-sandbox); }

base_dir="$(prepare "$base")" || exit 1
tip_dir="$(prepare "$tip")" || exit 1
for dir in "$base_dir" "$tip_dir"; do
  bench_of "$dir" >> "$out/build.log" 2>&1 || { echo "build failed in $dir: $out/build.log" >&2; exit 1; }
done

note() { printf '%s %s load %s\n' "$(date +%H:%M:%S)" "$1" "$(sysctl -n vm.loadavg)" >> "$out/load.txt"; }
for round in 1 2 3; do
  for ref in "$base" "$tip"; do
    dir="$base_dir"; [ "$ref" = "$tip" ] && dir="$tip_dir"
    note "benchmark $ref $round"
    (cd "$dir" && swift package --disable-sandbox benchmark baseline compare base --format markdown) > "$out/$ref-$round.md" 2>&1
    echo "benchmark $ref $round: exit $?" >> "$out/load.txt"
  done
done
for ref in "$base" "$tip"; do
  dir="$base_dir"; [ "$ref" = "$tip" ] && dir="$tip_dir"
  note "profile $ref"
  (cd "$dir" && Profile/growth.sh "$ref") > "$out/profile-$ref.log" 2>&1 || { echo "profile failed: $out/profile-$ref.log" >&2; exit 1; }
  for lines in 20 1620 6000; do
    mkdir -p "$out/runs/$ref-$lines"
    cp "$dir/Profile/runs/$ref-$lines/stacks.json" "$out/runs/$ref-$lines/"
  done
done
note done

{
  echo "# $base against $tip, tools $tools"
  echo
  echo "## Instructions per word"
  echo
  python3 -I "$here/percentiles.py" "$out" "$base" "$tip"
  echo
  echo "## CPU per word by step: base 20→1,620, base 20→6,000, tip 20→1,620, tip 20→6,000"
  echo
  echo '```'
  (cd "$out" && python3 -I "$here/Profile/steps.py" "$base-20" "$base-1620" "$base-20" "$base-6000" "$tip-20" "$tip-1620" "$tip-20" "$tip-6000")
  echo '```'
  for ref in "$base" "$tip"; do
    echo
    echo "## Frames growing most, $ref, 20 to 6,000 lines (ms per word: at 20, at 6,000, growth)"
    echo
    echo '```'
    (cd "$out" && python3 -I "$here/Profile/frames.py" "$ref-20" "$ref-6000" 25)
    echo '```'
  done
  echo
  echo "## Load"
  echo
  echo '```'
  cat "$out/load.txt"
  echo '```'
} > "$out/report.md"
echo "$out/report.md"
