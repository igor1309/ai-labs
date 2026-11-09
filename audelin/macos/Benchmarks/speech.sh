#!/bin/bash
# speech.sh TAG [SECONDS]: real speech through the real recogniser at 1×, 5 minutes by
# default, at 20, 1,620 and 6,000 lines: about 15 minutes. Prints decoding, backlog and
# latency per length and side, and writes them to Speech/runs/TAG.md. The audio is synthetic
# (speech-audio.sh), cached in /tmp/audelin-speech. Outside the agent sandbox, with nothing
# heavy alongside. Run the same code under two tags to see the noise.
case "${1:-}" in -h|--help) sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; exit 0;; esac
set -euo pipefail
cd "$(dirname "$0")"
if (($# < 1)); then echo "usage: speech.sh TAG [SECONDS]" >&2; exit 2; fi
tag="$1"; seconds="${2:-300}"; audio=/private/tmp/audelin-speech
(cd Speech && swift build -c release --disable-sandbox) > /dev/null
./speech-audio.sh "$audio"
mkdir -p Speech/runs
pairs=()
for lines in 20 1620 6000; do
  out="Speech/runs/$tag-$lines.txt"
  Speech/.build/release/ProfileSpeech "$lines" "$seconds" "$audio/mine.wav" "$audio/theirs.wav" > "$out"
  pairs+=("$lines=$out")
done
{ echo "$tag: commit $(git rev-parse --short HEAD), $seconds s per length, load $(sysctl -n vm.loadavg)"; echo; python3 -I speech-report.py "${pairs[@]}"; } | tee "Speech/runs/$tag.md"
