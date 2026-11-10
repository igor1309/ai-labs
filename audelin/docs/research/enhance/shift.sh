#!/bin/sh
# Cleans one call's microphone with the call track delayed by each given number of
# milliseconds (negative: earlier), and transcribes each result (LAB-1133). usage: shift.sh "<call folder>" <ms>...
# Outputs in work/shift/<call>/; reads the recording only.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
bin=$here/../spike/.build/release
call=$1; shift
out=$here/work/shift/$(basename "$call" | tr ' ' '_')
mkdir -p "$out"
[ -f "$out/mic.f32" ] || "$bin/audelin-vad" prep "$call/microphone.caf" "$out/mic.f32"
[ -f "$out/call.f32" ] || "$bin/audelin-vad" prep "$call/call.caf" "$out/call.f32"
[ -f "$out/call.asr.json" ] || "$bin/audelin-vad" asr "$out/call.f32" "$out/call.asr.json"
[ -f "$out/mic.asr.json" ] || "$bin/audelin-vad" asr "$out/mic.f32" "$out/mic.asr.json"
for ms in "$@"; do
  [ -f "$out/mic.$ms.asr.json" ] && continue
  # 16 kHz float32: 16 samples, 64 bytes, per millisecond of delay.
  # A negative delay moves the reference earlier: a longer echo path.
  if [ "$ms" -ge 0 ]; then
    { dd if=/dev/zero bs=64 count="$ms" 2>/dev/null; cat "$out/call.f32"; } > "$out/call.$ms.f32"
  else
    tail -c +$(( -ms * 64 + 1 )) "$out/call.f32" > "$out/call.$ms.f32"
  fi
  "$bin/audelin-enhance" enhance "$out/mic.f32" "$out/call.$ms.f32" "$out/mic.$ms.f32" > "$out/cost.$ms.json"
  "$bin/audelin-vad" asr "$out/mic.$ms.f32" "$out/mic.$ms.asr.json"
done
