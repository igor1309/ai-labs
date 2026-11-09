#!/bin/sh
# Runs each listed call's microphone through LocalVQE (with the call track as the
# reference, and with a silent one) and Parakeet v3 over the call track and the three
# microphone versions. usage: run-calls.sh "<call folder>"...   (outputs in work/calls/<call>/)
# Reads the recordings only; every output goes under work/.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
bin=$here/../spike/.build/release
for call in "$@"; do
  out=$here/work/calls/$(basename "$call" | tr ' ' '_')
  mkdir -p "$out"
  [ -f "$out/done" ] && continue
  "$bin/audelin-vad" prep "$call/microphone.caf" "$out/mic.f32"
  "$bin/audelin-vad" prep "$call/call.caf" "$out/call.f32"
  "$bin/audelin-enhance" enhance "$out/mic.f32" "$out/call.f32" "$out/mic.ref.f32" > "$out/cost.ref.json"
  "$bin/audelin-enhance" enhance "$out/mic.f32" none "$out/mic.noref.f32" > "$out/cost.noref.json"
  for t in call mic mic.ref mic.noref; do
    "$bin/audelin-vad" asr "$out/$t.f32" "$out/$t.asr.json"
  done
  touch "$out/done"
done
