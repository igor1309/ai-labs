#!/bin/sh
# Transcribes each call's two tracks with Parakeet v3 for gate.py (LAB-1134).
# usage: seg.sh "<call folder>"...   (outputs in work/gate/<call>/; reads the recordings only)
set -eu
here=$(cd "$(dirname "$0")" && pwd)
bin=$here/../spike/.build/release
for call in "$@"; do
  out=$here/work/gate/$(basename "$call" | tr ' ' '_')
  mkdir -p "$out"
  for t in microphone call; do
    [ -f "$out/$t.asr.json" ] && continue
    "$bin/audelin-vad" prep "$call/$t.caf" "$out/$t.f32" >/dev/null
    "$bin/audelin-vad" asr "$out/$t.f32" "$out/$t.asr.json" >/dev/null
    rm "$out/$t.f32"
  done
done
