#!/bin/sh
# Diarization measurements, one after another. usage: run.sh ami|calls|synth
#   ami    the 16 AMI test meetings (FluidAudio's ami-sdm download, headset mix) with
#          the forced-alignment RTTMs in work/Datasets/diar-forced-alignment
#   calls  the call tracks already prepared by ../enhance/run-calls.sh (16 kHz f32)
#   synth  the synthetic Russian group calls built by synth.py (LAB-1130); Nemotron
#          and VBx only
# Outputs go to work/<set>/<name>.<system>.json.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
bin=$here/../spike/.build/release
run() { # <f32> <outbase>
  [ -f "$2.vbx.json" ] || "$bin/audelin-diarize" vbx "$1" "$2.vbx.json"
  [ -f "$2.nemotron.json" ] || "$bin/audelin-diarize" nemotron "$1" "$2.nemotron.json"
  for v in dihard3 callhome ami; do
    [ -f "$2.lseend-$v.json" ] || "$bin/audelin-diarize" lseend "$1" "$2.lseend-$v.json" "$v"
  done
}
case "$1" in
ami)
  mkdir -p "$here/work/ami"
  for wav in "$HOME"/FluidAudioDatasets/ami_official/sdm/*.Mix-Headset.wav; do
    m=$(basename "$wav" .Mix-Headset.wav)
    f=$here/work/ami/$m.f32
    [ -f "$f" ] || "$bin/audelin-vad" prep "$wav" "$f"
    run "$f" "$here/work/ami/$m"
    echo "ami done: $m"
  done ;;
calls)
  mkdir -p "$here/work/calls"
  for d in "$here"/../enhance/work/calls/*/; do
    n=$(basename "$d")
    run "$d/call.f32" "$here/work/calls/$n"
    echo "call done: $n"
  done ;;
synth)
  for f in "$here"/work/synth/*.f32; do
    b=${f%.f32}
    [ -f "$b.vbx.json" ] || "$bin/audelin-diarize" vbx "$f" "$b.vbx.json"
    [ -f "$b.nemotron.json" ] || "$bin/audelin-diarize" nemotron "$f" "$b.nemotron.json"
    echo "synth done: $(basename "$b")"
  done ;;
esac
