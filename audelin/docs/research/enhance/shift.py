"""Scores shift.sh's runs: leaked far-side words a minute and owner-only words kept,
for each delay of the reference (LAB-1133).

usage (from audelin/docs/research/enhance): uv run python shift.py   (reads work/shift/*/)
"""
from pathlib import Path

import numpy as np

from calls import SOLO, Index, leaked, load

WORK = Path(__file__).resolve().parent / "work" / "shift"

print("| Call | reference delay ms | leaked/min | solo kept |")
print("|---|---:|---:|---:|")
for d in sorted(WORK.iterdir()):
    call, raw = load(d / "call.asr.json"), load(d / "mic.asr.json")
    minutes = len(np.fromfile(d / "mic.f32", dtype="<f4")) / 16000 / 60
    near = Index(call)
    solo = [(t, w) for t, w in raw if not near.any_near(t, SOLO)]
    print(f"| {d.name} | raw | {leaked(raw, call) / minutes:.1f} | {len(solo)} words |")
    runs = sorted((int(p.name.split(".")[1]), p) for p in d.glob("mic.*.asr.json"))
    for ms, p in runs:
        words = load(p)
        kept = sum(Index(words).has(w, t, 0.5) for t, w in solo)
        print(f"| {d.name} | {ms} | {leaked(words, call) / minutes:.1f} | {100 * kept / max(len(solo), 1):.0f} % |")
