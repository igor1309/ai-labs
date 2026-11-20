#!/bin/sh
# Runs the four final-pass candidates over each list in work/sets/*/list.txt
# (and work/calls/list.txt once calls.py has made it):
#   pk-windows  Parakeet v3 in Audelin's 4 s + 2+2 s windows (production)
#   pk-whole    Parakeet v3, one pass over the whole file
#   wh-ru       Whisper large-v3-turbo q5_0, language ru
#   wh-auto     the same with language detection
#   wh-ru-vad   wh-ru reading only what whisper.cpp's Silero VAD (v6.2.0,
#               default settings) marks as speech
# Output: work/out/<engine>/<set>/ (Parakeet: words.jsonl; Whisper: one
# <id>.wav.json per file beside a symlink to the WAV), and time.txt with
# /usr/bin/time -l for the whole set.
#
# usage: ./run.sh [set...]       default: every set under work/sets, then calls
set -eu
cd "$(dirname "$0")"
HERE=$(pwd)
FINAL="$HERE/../spike/.build/release/audelin-final"
WHISPER=/opt/homebrew/bin/whisper-cli
MODEL="$HOME/Library/Application Support/amanu/models/whisper/ggml-large-v3-turbo-q5_0.bin"
VAD="$HERE/work/models/ggml-silero-v6.2.0.bin"
[ -x "$FINAL" ] || swift build -c release --package-path ../spike --product audelin-final

opts() { case "$1" in ru) echo "-l ru" ;; auto) echo "-l auto" ;; ru-vad) echo "-l ru --vad -vm $VAD" ;; esac; }
list_of() { if [ "$1" = calls ]; then echo work/calls/list.txt; else echo "work/sets/$1/list.txt"; fi; }
if [ $# -eq 0 ]; then
    set -- $(ls work/sets)
    [ -f work/calls/list.txt ] && set -- "$@" calls
fi

for set in "$@"; do
    list=$(list_of "$set")
    for mode in windows whole; do
        out="work/out/pk-$mode/$set"
        [ -f "$out/words.jsonl" ] && continue
        mkdir -p "$out"
        /usr/bin/time -l "$FINAL" "$mode" "$list" > "$out/words.tmp" 2> "$out/time.txt"
        mv "$out/words.tmp" "$out/words.jsonl"
    done
    for engine in ru auto ru-vad; do
        out="work/out/wh-$engine/$set"
        [ -f "$out/done" ] && continue
        mkdir -p "$out"
        while IFS= read -r wav; do
            link="$out/$(basename "$wav")"
            ln -sf "$wav" "$link"
        done < "$list"
        # One process per set loads the model once; the file list goes
        # through xargs so a long list stays within the argument limit.
        ls "$out"/*.wav | awk '{ printf "-f%c%s%c", 0, $0, 0 }' |
            xargs -0 /usr/bin/time -l "$WHISPER" -m "$MODEL" $(opts "$engine") -ojf -np > /dev/null 2> "$out/time.txt"
        touch "$out/done"
    done
done
