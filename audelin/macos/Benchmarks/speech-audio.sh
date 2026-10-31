#!/bin/bash
# speech-audio.sh OUT_DIR: makes mine.wav and theirs.wav, about 16 minutes of macOS `say`
# speech taking turns, 48 kHz mono. Synthetic and reproducible: no real call is used.
# Keeps files that already exist.
case "${1:-}" in -h|--help) sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; exit 0;; esac
set -euo pipefail
out="$1"; mkdir -p "$out"
text="$(dirname "$0")/Speech/text.txt"
speak() {
  local name="$1" voice="$2" lead="$3" script="$out/$1.say"
  [ -f "$out/$name.wav" ] && return
  { printf '[[slnc %s]] ' "$lead"; for _ in 1 2 3 4 5 6 7 8; do sed 's/$/ [[slnc 6000]]/' "$text"; done; } > "$script"
  say -v "$voice" -r 170 -f "$script" -o "$out/$name.aiff"
  afconvert -f WAVE -d LEF32@48000 -c 1 "$out/$name.aiff" "$out/$name.wav"
  rm -f "${out:?}/${name:?}.aiff" "${script:?}"
}
speak mine "${MINE_VOICE:-Milena}" 0
speak theirs "${THEIRS_VOICE:-Milena}" 6000
