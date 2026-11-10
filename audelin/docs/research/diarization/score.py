"""Diarization error rate for audelin-diarize output, and label-free statistics.

usage (from audelin/docs/research/diarization):
  uv run python score.py der <name> <ref.rttm> <hyp.json> [segments|shownSegments]
      one JSON line: DER, miss, false alarm and speaker error, with a 0.25 s collar,
      once with overlapped reference speech left out (as published FluidAudio numbers)
      and once with it included (what a user sees)
  uv run python score.py stats <hyp.json> [segments|shownSegments]
      speaker count, speakers with ≥ 5 % of speech, speech time and label switches
  uv run python score.py summary
      (COLLAR=<seconds> in the environment overrides the 0.25 s collar)
      tables over work/ami (DER pooled over meetings, speaker counts, cost) and
      work/calls (speaker counts per system, calls with more than one remote speaker)

Scoring is frame-based at 10 ms. Hypothesis speakers are mapped to reference speakers
one-to-one to maximise matched time (Hungarian); unmapped hypothesis speech under a
reference speaker counts as speaker error. A reference speaker with no mapped
hypothesis speaker counts its time as speaker error where hypothesis speech exists and
as miss where it does not.
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment

STEP = 0.01
COLLAR = float(os.environ.get("COLLAR", "0.25"))


def rttm(path):
    segs = []
    for line in Path(path).read_text().splitlines():
        f = line.split()
        if f and f[0] == "SPEAKER":
            s, d = float(f[3]), float(f[4])
            segs.append((f[7], s, s + d))
    return segs


def hyp(path, key="segments"):
    data = json.loads(Path(path).read_text())
    return [(str(x["speaker"]), x["s"], x["e"]) for x in data[key]], data


def matrix(segs, frames):
    names = sorted({s for s, _, _ in segs})
    m = np.zeros((len(names), frames), dtype=bool)
    for s, a, b in segs:
        m[names.index(s), int(round(a / STEP)):max(int(round(a / STEP)), int(round(b / STEP)))] = True
    return names, m


def der(ref_segs, hyp_segs, ignore_overlap):
    end = max([b for _, _, b in ref_segs] + [b for _, _, b in hyp_segs] + [0])
    frames = int(end / STEP) + 2
    rn, r = matrix(ref_segs, frames)
    hn, h = matrix(hyp_segs, frames)
    keep = np.ones(frames, dtype=bool)
    c = int(round(COLLAR / STEP))
    for _, a, b in ref_segs:
        for t in (a, b):
            i = int(round(t / STEP))
            keep[max(0, i - c):i + c] = False
    if ignore_overlap:
        keep &= r.sum(axis=0) <= 1
    r, h = r[:, keep], h[:, keep]
    if len(hn) == 0:
        h = np.zeros((1, r.shape[1]), dtype=bool)
    overlap = (r[:, None, :] & h[None, :, :]).sum(axis=2) if len(rn) else np.zeros((0, len(h)))
    rows, cols = linear_sum_assignment(-overlap) if overlap.size else ([], [])
    nref, nhyp = r.sum(axis=0), h.sum(axis=0)
    correct = np.zeros(r.shape[1], dtype=int)
    for i, j in zip(rows, cols):
        correct += r[i] & h[j]
    total = nref.sum()
    miss = np.maximum(nref - nhyp, 0).sum()
    fa = np.maximum(nhyp - nref, 0).sum()
    conf = (np.minimum(nref, nhyp) - correct).sum()
    pct = lambda x: 100.0 * x / total if total else 0.0
    return {"der": pct(miss + fa + conf), "miss": pct(miss), "fa": pct(fa), "se": pct(conf),
            "scored": total * STEP, "refSpeakers": len(rn), "hypSpeakers": len({s for s, _, _ in hyp_segs})}


def stats(path, key="segments"):
    segs, data = hyp(path, key)
    by = {}
    for s, a, b in segs:
        by[s] = by.get(s, 0) + (b - a)
    speech = sum(by.values())
    main = [s for s, d in by.items() if speech and d / speech >= 0.05]
    ordered = sorted(segs, key=lambda x: x[1])
    switches = sum(1 for x, y in zip(ordered, ordered[1:]) if x[0] != y[0])
    out = {"speakers": len(by), "speakers5pct": len(main), "speech": speech,
           "switchesPerMin": switches / (data["audio"] / 60) if data.get("audio") else None,
           "shares": sorted((round(d / speech, 3) for d in by.values()), reverse=True) if speech else []}
    for k in ("audio", "wall", "cpu", "rtfx", "load", "speechFrames", "firstShownWrong",
              "framesChangedAfterShown", "changes", "shownDelayP50", "shownDelayP90",
              "blockP50ms", "blockP99ms", "blockMaxms", "paced", "variant"):
        if k in data:
            out[k] = data[k]
    return out


WORK = Path(__file__).resolve().parent / "work"
REF = WORK / "Datasets" / "diar-forced-alignment" / "AMI" / "test"
CALLS = WORK.parent.parent / "enhance" / "work" / "calls"


SYSTEMS = ("vbx", "nemotron", "lseend-dihard3", "lseend-callhome", "lseend-ami")


def systems(folder):
    return [s for s in SYSTEMS if any(folder.glob(f"*.{s}.json"))]


def names(folder):
    return sorted(p.name[: -len(".vbx.json")] for p in folder.glob("*.vbx.json"))


def pooled(rows, part):
    total = sum(r[part]["scored"] for r in rows)
    w = lambda k: sum(r[part][k] * r[part]["scored"] for r in rows) / total
    return {k: w(k) for k in ("der", "miss", "fa", "se")}


def summary():
    ami = WORK / "ami"
    meetings = names(ami)
    print(f"AMI test, {len(meetings)} meetings, headset mix, forced-alignment reference, {COLLAR:g} s collar\n")
    print("| System | Labels | DER, overlap ignored | miss / FA / SE | DER, overlap included | miss / FA / SE |"
          " Count right | Count right (≥ 5 %) | RTFx | CPU s per audio h |")
    print("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    out = {}
    for system in systems(ami):
        for key in ("segments", "shownSegments") if system.startswith("lseend") else ("segments",):
            rows, right, right5, audio, wall, cpu = [], 0, 0, 0.0, 0.0, 0.0
            for m in meetings:
                f = ami / f"{m}.{system}.json"
                if not f.exists():
                    continue
                ref_segs = rttm(REF / f"{m}.rttm")
                hyp_segs, data = hyp(f, key)
                r = {"ignored": der(ref_segs, hyp_segs, True), "included": der(ref_segs, hyp_segs, False)}
                st = stats(f, key)
                n = r["included"]["refSpeakers"]
                right += st["speakers"] == n
                right5 += st["speakers5pct"] == n
                audio, wall, cpu = audio + data["audio"], wall + data["wall"], cpu + data["cpu"]
                r["meeting"], r["speakers"], r["speakers5pct"] = m, st["speakers"], st["speakers5pct"]
                rows.append(r)
            if not rows:
                continue
            i, x = pooled(rows, "ignored"), pooled(rows, "included")
            label = "final" if key == "segments" else "first shown"
            print(f"| {system} | {label} | {i['der']:.1f} % | {i['miss']:.1f} / {i['fa']:.1f} / {i['se']:.1f} | "
                  f"{x['der']:.1f} % | {x['miss']:.1f} / {x['fa']:.1f} / {x['se']:.1f} | {right}/{len(rows)} | "
                  f"{right5}/{len(rows)} | {audio / wall:.0f}× | {cpu / audio * 3600:.0f} |")
            out[f"{system}/{key}"] = {"ignored": i, "included": x, "meetings": rows}
    (WORK / "ami-summary.json").write_text(json.dumps(out, indent=1))

    calls = WORK / "calls"
    print("\nCalls (call track); speakers with ≥ 5 % of the system's speech\n")
    syss = systems(calls)
    print("| Call | min | call words | " + " | ".join(syss) + " |")
    print("|---|---:|---:|" + "---:|" * len(syss))
    counts = {s: [] for s in syss}
    for n in names(calls):
        words = len(json.loads((CALLS / n / "call.asr.json").read_text())["words"])
        if words < 20:
            continue
        cells = []
        for system in syss:
            st = stats(calls / f"{n}.{system}.json")
            counts[system].append(st["speakers5pct"])
            cells.append(f"{st['speakers5pct']} ({st['speakers']}), {st['switchesPerMin']:.1f}/min")
        audio = json.loads((calls / f"{n}.vbx.json").read_text())["audio"]
        print(f"| {n} | {audio / 60:.1f} | {words} | " + " | ".join(cells) + " |")
    for system in syss:
        c = counts[system]
        print(f"{system}: {sum(x > 1 for x in c)}/{len(c)} calls with more than one remote speaker")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "der":
        name, ref_path, hyp_path = sys.argv[2:5]
        key = sys.argv[5] if len(sys.argv) > 5 else "segments"
        ref_segs = rttm(ref_path)
        hyp_segs, _ = hyp(hyp_path, key)
        print(json.dumps({"name": name, "key": key,
                          "ignored": der(ref_segs, hyp_segs, True),
                          "included": der(ref_segs, hyp_segs, False)}))
    elif cmd == "stats":
        print(json.dumps(stats(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "segments")))
    elif cmd == "summary":
        summary()
