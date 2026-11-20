#!/bin/sh
# Turns both tracks of every call LAB-1688's spike read (an Audelin folder
# with microphone.caf and call.caf whose yyyy.MM.dd-HHmm prefix matches an
# Amanu folder with transcript.json) into 16 kHz WAVs in work/calls/, writes
# work/calls/list.txt for run.sh, and reference Silero probabilities per
# track (../transcript-language/vad.sh) for score.py.
# 2026.10.29-1525 is left out as there: an English test recording.
# usage: ./calls.sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
audelin=${AUDELIN:-$HOME/Recordings/Audelin}
amanu=${AMANU:-$HOME/Recordings}
mkdir -p "$here/work/calls"
: > "$here/work/calls/list.txt"
for dir in "$audelin"/*/; do
  dir=${dir%/}
  key=$(basename "$dir" | cut -c1-15)
  [ "$key" = 2026.10.29-1525 ] && continue
  [ -f "$dir/microphone.caf" ] && [ -f "$dir/call.caf" ] || continue
  ls "$amanu/$key"*/transcript.json >/dev/null 2>&1 || continue
  for side in microphone call; do
    out="$here/work/calls/$key.$side.wav"
    [ -f "$out" ] || ffmpeg -v error -y -i "$dir/$side.caf" -ac 1 -ar 16000 -c:a pcm_s16le "$out" </dev/null
    echo "$out" >> "$here/work/calls/list.txt"
  done
done
AUDELIN="$audelin" AMANU="$amanu" "$here/../transcript-language/vad.sh"
