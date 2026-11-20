#!/bin/sh
# Downloads the public labelled sets into work/data/ (about 1 GB).
set -eu
cd "$(dirname "$0")"
mkdir -p work/data/fleurs
cd work/data
H=https://huggingface.co/datasets
curl -sfL -o farfield.parquet "$H/bond005/sberdevices_golos_100h_farfield/resolve/main/data/test-00000-of-00001-7fb58d4cda8ff9fe.parquet"
curl -sfL -o crowd.parquet "$H/bond005/sberdevices_golos_10h_crowd/resolve/main/data/test-00000-of-00003-cad0cfaddbc8fa71.parquet"
curl -sfL -o fleurs-test.tsv "$H/google/fleurs/resolve/main/data/ru_ru/test.tsv"
curl -sfL -o fleurs-test.tar.gz "$H/google/fleurs/resolve/main/data/ru_ru/audio/test.tar.gz"
tar -xzf fleurs-test.tar.gz -C fleurs
mkdir -p ../models
curl -sfL -o ../models/ggml-silero-v6.2.0.bin https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin
