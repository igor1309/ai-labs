"""Far-side leakage into the microphone transcript, without hand labels.

usage (from audelin/docs/research/enhance): uv run python calls.py   (reads work/calls/*/)

A microphone word counts as leaked when the call track's transcript has the same word
within WINDOW seconds and so does a neighbouring microphone word: two or more words in a
row heard on both tracks. The same count with the call transcript shifted by ±60 s is the
chance rate (the owner and the far side using the same words at about the same time), and
is reported beside it.

A "solo" word is a raw microphone word with no call-track word within SOLO seconds: the
owner speaking while the far side is silent. Its retention is the share of solo words that
an enhanced transcript still has (same word within 0.5 s); it is the label-free check that
enhancement does not drop the owner's own words.

Bleed is measured on the audio as well: the peak correlation of the two tracks' 10 ms
log-energy envelopes over lags of ±0.5 s, and the lag at which it falls.
"""
import json
import re
from bisect import bisect_left, bisect_right
from pathlib import Path

import numpy as np

WORK = Path(__file__).resolve().parent / "work" / "calls"
WINDOW = 2.0
SOLO = 3.0
CHANCE_SHIFT = 60.0
VARIANTS = ("mic", "mic.ref", "mic.noref")


def norm(word):
    return re.sub(r"[^\w']|_", "", word.lower().replace("ё", "е"))


def load(path):
    words = []
    for w in json.loads(path.read_text())["words"]:
        n = norm(w["w"])
        if n:
            words.append((w["s"], n))
    words.sort()
    return words


class Index:
    def __init__(self, words):
        self.times = [t for t, _ in words]
        self.words = words

    def has(self, word, t, window):
        lo, hi = bisect_left(self.times, t - window), bisect_right(self.times, t + window)
        return any(self.words[i][1] == word for i in range(lo, hi))

    def any_near(self, t, window):
        return bisect_right(self.times, t + window) > bisect_left(self.times, t - window)


def leaked(mic, call, shift=0.0):
    index = Index([(t + shift, w) for t, w in call])
    hit = [index.has(w, t, WINDOW) for t, w in mic]
    return sum(1 for i, h in enumerate(hit)
               if h and ((i > 0 and hit[i - 1]) or (i + 1 < len(hit) and hit[i + 1])))


def envelope(path):
    x = np.fromfile(path, dtype="<f4")
    frames = len(x) // 160
    e = np.log10(np.mean(x[: frames * 160].reshape(frames, 160) ** 2, axis=1) + 1e-10)
    return (e - e.mean()) / (e.std() + 1e-9)


def bleed(call_dir):
    mic, call = envelope(call_dir / "mic.f32"), envelope(call_dir / "call.f32")
    n = min(len(mic), len(call))
    mic, call = mic[:n], call[:n]
    best = (-1.0, 0)
    for lag in range(-50, 51):
        a, b = (mic[lag:], call[: n - lag]) if lag >= 0 else (mic[: n + lag], call[-lag:])
        best = max(best, (float(np.mean(a * b)), lag))
    return best[0], best[1] * 10


def main():
    rows = []
    for d in sorted(WORK.iterdir()):
        if not (d / "done").exists():
            continue
        call = load(d / "call.asr.json")
        mics = {v: load(d / f"{v}.asr.json") for v in VARIANTS}
        minutes = len(np.fromfile(d / "mic.f32", dtype="<f4")) / 16000 / 60
        call_index = Index(call)
        solo = [(t, w) for t, w in mics["mic"] if not call_index.any_near(t, SOLO)]
        row = {"call": d.name, "minutes": minutes, "callWords": len(call)}
        row["correlation"], row["lagMs"] = bleed(d)
        for v, words in mics.items():
            row[f"{v}.words"] = len(words)
            row[f"{v}.leaked"] = leaked(words, call)
            row[f"{v}.chance"] = (leaked(words, call, CHANCE_SHIFT) + leaked(words, call, -CHANCE_SHIFT)) / 2
            idx = Index(words)
            row[f"{v}.soloKept"] = sum(idx.has(w, t, 0.5) for t, w in solo)
        row["solo"] = len(solo)
        for v in VARIANTS:
            row[f"{v}.cost"] = None
        for v, f in (("mic.ref", "cost.ref.json"), ("mic.noref", "cost.noref.json")):
            row[f"{v}.cost"] = json.loads((d / f).read_text())
        rows.append(row)
    (WORK.parent / "calls-score.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False))

    print("| Call | min | env. corr. | lag ms | mic words | leaked/min raw | with ref | no ref | chance/min raw | "
          "solo words | solo kept, ref | solo kept, no ref |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for r in rows:
        m = r["minutes"]
        print(f"| {r['call']} | {m:.1f} | {r['correlation']:.2f} | {r['lagMs']} | {r['mic.words']} | "
              f"{r['mic.leaked'] / m:.1f} | {r['mic.ref.leaked'] / m:.1f} | {r['mic.noref.leaked'] / m:.1f} | "
              f"{r['mic.chance'] / m:.2f} | {r['solo']} | "
              f"{pct(r['mic.ref.soloKept'], r['solo'])} | {pct(r['mic.noref.soloKept'], r['solo'])} |")
    total(rows, "all calls", rows)
    total(rows, "bleed calls (raw leaked ≥ 3/min)", [r for r in rows if r["mic.leaked"] / r["minutes"] >= 3])
    total(rows, "other calls", [r for r in rows if r["mic.leaked"] / r["minutes"] < 3])


def pct(a, b):
    return f"{100 * a / b:.1f} %" if b else "–"


def total(_, label, rows):
    if not rows:
        return
    m = sum(r["minutes"] for r in rows)
    s = lambda k: sum(r[k] for r in rows)
    print(f"\n{label}: {len(rows)} calls, {m:.0f} min; leaked/min raw {s('mic.leaked') / m:.2f}, "
          f"with ref {s('mic.ref.leaked') / m:.2f}, no ref {s('mic.noref.leaked') / m:.2f}; "
          f"chance/min raw {s('mic.chance') / m:.2f}, ref {s('mic.ref.chance') / m:.2f}, "
          f"no ref {s('mic.noref.chance') / m:.2f}; mic words raw {s('mic.words')}, ref {s('mic.ref.words')}, "
          f"no ref {s('mic.noref.words')}; solo kept ref {pct(s('mic.ref.soloKept'), s('solo'))}, "
          f"no ref {pct(s('mic.noref.soloKept'), s('solo'))} of {s('solo')}")
    for v in ("mic.ref", "mic.noref"):
        audio = sum(r[f"{v}.cost"]["audio"] for r in rows)
        wall = sum(r[f"{v}.cost"]["wall"] for r in rows)
        cpu = sum(r[f"{v}.cost"]["cpu"] for r in rows)
        print(f"  {v}: RTFx {audio / wall:.1f}, CPU {cpu / audio * 100:.2f} % of one core per audio second")


if __name__ == "__main__":
    main()
