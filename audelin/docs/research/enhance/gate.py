"""Does the bleed gate still separate calls when word times are estimated from
segments, as the app keeps them (LAB-1134)? Words are grouped into segments at
pauses of 2 s, as Live text does, and each word's time is spread evenly over its
segment. usage: uv run python gate.py   (reads work/gate/*/, from seg.sh)
"""
import json
from pathlib import Path

from calls import leaked, norm

WORK = Path(__file__).resolve().parent / "work" / "gate"
PAUSE = 2.0


def words(path):
    raw = sorted((w["s"], w["e"], norm(w["w"])) for w in json.loads(path.read_text())["words"])
    return [w for w in raw if w[2]]


def spread(ws):
    out, seg = [], []
    for w in ws + [None]:
        if seg and (w is None or w[0] - seg[-1][1] >= PAUSE):
            s, e = seg[0][0], seg[-1][1]
            out += [(s + (e - s) * i / len(seg), x[2]) for i, x in enumerate(seg)]
            seg = []
        if w:
            seg.append(w)
    return out


print("| Call | min | leaked/min, word times | leaked/min, spread over segments |")
print("|---|---:|---:|---:|")
for d in sorted(WORK.iterdir()):
    mic, call = words(d / "microphone.asr.json"), words(d / "call.asr.json")
    if not mic:
        continue
    minutes = max(mic[-1][1], call[-1][1] if call else 0) / 60
    exact = leaked([(s, t) for s, _, t in mic], [(s, t) for s, _, t in call])
    est = leaked(spread(mic), spread(call))
    print(f"| {d.name} | {minutes:.1f} | {exact / minutes:.1f} | {est / minutes:.1f} |")
