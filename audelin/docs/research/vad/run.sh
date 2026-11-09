#!/bin/sh
# Runs both VADs and the Parakeet reference over each channel of the listed calls.
# usage: run.sh "<call folder>"...   (outputs in work/<call>/)
set -eu
here=$(cd "$(dirname "$0")" && pwd)
probe=$here/../spike/.build/release/audelin-vad
for call in "$@"; do
  out=$here/work/$(basename "$call" | tr ' ' '_')
  mkdir -p "$out"
  for ch in microphone call; do
    [ -f "$out/$ch.asr.json" ] && continue
    "$probe" prep "$call/$ch.caf" "$out/$ch.f32"
    "$probe" vad "$out/$ch.f32" "$out/$ch.fluid.json"
    (cd "$here" && uv run python silero_probs.py "$out/$ch.f32" "$out/$ch.silero.json")
    "$probe" asr "$out/$ch.f32" "$out/$ch.asr.json"
  done
done
