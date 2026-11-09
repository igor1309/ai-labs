#!/bin/sh
# Transcribes only each engine's best spans (from score.py sweep) for the ΔWER and compute criteria.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
probe=$here/../spike/.build/release/audelin-vad
for out in "$here"/work/*/; do
  for ch in microphone call; do
    for eng in fluid silero; do
      [ -f "$out/$ch.$eng.spans.json" ] || continue
      "$probe" asr "$out/$ch.f32" "$out/$ch.$eng.gated.json" "$out/$ch.$eng.spans.json"
    done
  done
done
