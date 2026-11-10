#!/bin/sh
# LAB-1130 end to end: fetch the sources, build the spike, build the synthetic calls,
# run Nemotron and VBx on them and print the tables. Every step skips work already
# done, so a stopped run picks up where it left off. Run nothing else CPU-heavy
# beside it; timings and RTFx would be off.
# usage (from audelin/docs/research/diarization): ./synth-night.sh
# Needs network for the first run, ffmpeg with libopus, uv and Swift.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
d=$here/work/Datasets
mkdir -p "$d"
cd "$d"
[ -d diar-forced-alignment ] || git clone -q --depth 1 https://github.com/nttcslab-sp/diar-forced-alignment
if [ ! -d LibriSpeech/test-clean ]; then
  curl -fsSL -C - -o test-clean.tar.gz https://www.openslr.org/resources/12/test-clean.tar.gz
  tar xzf test-clean.tar.gz && rm test-clean.tar.gz
fi
if [ ! -d ruls_data ]; then
  curl -fsSL -C - -o ruls_data.tar.gz https://www.openslr.org/resources/96/ruls_data.tar.gz
  tar xzf ruls_data.tar.gz && rm ruls_data.tar.gz
fi
cd "$here"
swift build --package-path ../spike -c release --product audelin-diarize
uv sync -q
uv run python synth.py --seed 1130 --per-count 6
./run.sh synth
COLLAR=0 uv run python score.py synth | tee work/synth-summary-collar0.md
uv run python score.py synth | tee work/synth-summary.md
