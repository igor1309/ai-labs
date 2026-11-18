#!/bin/sh
# Reference Silero speech probabilities for both tracks of every call classify.py reads:
# an Audelin folder with microphone.caf and call.caf whose yyyy.MM.dd-HHmm prefix matches
# an Amanu folder with transcript.json.
# usage (from audelin/docs/research/transcript-language): ./vad.sh, then uv run python classify.py
set -eu
here=$(cd "$(dirname "$0")" && pwd)
audelin=${AUDELIN:-$HOME/Recordings/Audelin}
amanu=${AMANU:-$HOME/Recordings}
mkdir -p "$here/work/vad"
for dir in "$audelin"/*/; do
  dir=${dir%/}
  key=$(basename "$dir" | cut -c1-15)
  [ -f "$dir/microphone.caf" ] && [ -f "$dir/call.caf" ] || continue
  ls "$amanu/$key"*/transcript.json >/dev/null 2>&1 || continue
  for side in microphone call; do
    out="$here/work/vad/$key.$side.json"
    [ -f "$out" ] && continue
    ffmpeg -v error -y -i "$dir/$side.caf" -ac 1 -ar 16000 -f f32le "$here/work/vad/tmp.f32" </dev/null
    uv run --project "$here/../vad" python "$here/../vad/silero_probs.py" "$here/work/vad/tmp.f32" "$out" </dev/null
  done
done
rm -f "$here/work/vad/tmp.f32"
