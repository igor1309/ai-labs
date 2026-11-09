#!/bin/sh
# Whole LAB-1102 run: LocalVQE denoising and Parakeet v3 over the labelled sets that
# `labelled.py build` and `labelled.py lists` prepared, then each listed call through
# run-calls.sh. Each step is skipped when its output exists, so a stopped run resumes.
# usage: run.sh "<call folder>"...
set -eu
cd "$(dirname "$0")"
bin=../spike/.build/release
L=work/lab
for f in $L/denoise-*.list; do
  s=$(basename "$f" .list | sed 's/^denoise-//')
  [ -f "$L/enh/$s.done" ] && continue
  $bin/audelin-enhance denoise-batch "$f" "$L/enh/$s" > "$L/enh/$s.cost.json" && touch "$L/enh/$s.done"
done
[ -f $L/raw.jsonl ] || $bin/audelin-enhance asr-batch $L/raw.list $L/raw.jsonl
[ -f $L/enh.jsonl ] || $bin/audelin-enhance asr-batch $L/enh.list $L/enh.jsonl
echo labelled done
for c in "$@"; do
  ./run-calls.sh "$c"
  echo "call done: $c"
done
echo all done
