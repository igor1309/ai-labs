"""Builds the labelled sets the engines are scored on, into work/sets/.

usage (from audelin/docs/research/transcript-engines, after ./fetch.sh):
  uv run python build.py

Sets, each a folder of 16 kHz mono WAVs and a refs.json {id: text}:
  fleurs     FLEURS ru test, every utterance: read Wikipedia sentences, human
             transcripts with case, punctuation and Latin names kept;
  crowd      Golos crowd test, a seeded sample: phone-recorded requests;
  farfield   Golos farfield test, a seeded sample: requests to a speaker at
             one to several metres;
  long       FLEURS utterances joined into tracks of about ten minutes with
             gaps from 0.5 to 60 s of quiet noise (-65 dBFS RMS, a muted
             microphone's floor), so engines read long audio as Audelin's
             final pass does and can write text where nobody speaks.
             gaps.json holds each track's speech spans.
"""
import io
import json
import random
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
import soundfile as sf

HERE = Path(__file__).resolve().parent
DATA = HERE / "work" / "data"
SETS = HERE / "work" / "sets"
RATE = 16000
GOLOS_SAMPLE = 400
LONG_TRACKS = 12
PER_TRACK = 60
GAPS = (0.5, 1, 2, 3, 5, 10, 20, 60)


def write(path, audio):
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, np.asarray(audio, dtype="float32"), RATE, subtype="PCM_16")


def mono16k(data):
    audio, rate = sf.read(data, dtype="float32", always_2d=True)
    if rate != RATE:
        raise SystemExit(f"{rate} Hz, expected {RATE}")
    return audio.mean(axis=1)


def fleurs():
    refs = {}
    for line in (DATA / "fleurs-test.tsv").read_text().splitlines():
        cols = line.split("\t")
        uid = cols[1].removesuffix(".wav")
        refs[uid] = cols[2]
    out = {}
    for uid, text in sorted(refs.items()):
        write(SETS / "fleurs" / f"{uid}.wav", mono16k(DATA / "fleurs" / "test" / f"{uid}.wav"))
        out[uid] = text
    return out


def golos(name):
    table = pq.read_table(DATA / f"{name}.parquet").to_pylist()
    rows = random.Random(1689).sample(range(len(table)), GOLOS_SAMPLE)
    out = {}
    for i in sorted(rows):
        uid = f"{name}-{i:05d}"
        write(SETS / name / f"{uid}.wav", mono16k(io.BytesIO(table[i]["audio"]["bytes"])))
        out[uid] = table[i]["transcription"]
    return out


def long(fleurs_refs):
    rng = random.Random(1689)
    noise = np.random.default_rng(1689)
    floor = 10 ** (-65 / 20)
    ids = sorted(fleurs_refs)
    refs, spans = {}, {}
    for t in range(LONG_TRACKS):
        chosen = rng.sample(ids, PER_TRACK)
        pieces, track_spans, at = [], [], 0.0
        for uid in chosen:
            gap = rng.choice(GAPS)
            pieces.append(noise.normal(0, floor, int(gap * RATE)))
            at += gap
            speech = sf.read(SETS / "fleurs" / f"{uid}.wav", dtype="float32")[0]
            pieces.append(speech + noise.normal(0, floor, len(speech)))
            track_spans.append([round(at, 3), round(at + len(speech) / RATE, 3)])
            at += len(speech) / RATE
        pieces.append(noise.normal(0, floor, 5 * RATE))
        tid = f"long-{t:02d}"
        write(SETS / "long" / f"{tid}.wav", np.concatenate(pieces))
        refs[tid] = " ".join(fleurs_refs[u] for u in chosen)
        spans[tid] = track_spans
    (SETS / "long" / "gaps.json").write_text(json.dumps(spans, indent=1))
    return refs


def main():
    f = fleurs()
    sets = {"fleurs": f, "crowd": golos("crowd"), "farfield": golos("farfield"), "long": long(f)}
    for name, refs in sets.items():
        (SETS / name / "refs.json").write_text(json.dumps(refs, ensure_ascii=False, indent=1))
        (SETS / name / "list.txt").write_text("".join(f"{SETS / name / k}.wav\n" for k in sorted(refs)))
        print(name, len(refs))


if __name__ == "__main__":
    main()
