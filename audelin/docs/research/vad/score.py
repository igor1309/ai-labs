"""Scores FluidAudio and reference Silero speech spans against Parakeet words.

usage:
  score.py sweep    threshold/padding sweep; writes work/<call>/<ch>.<engine>.spans.json
                    for each engine's best setting and work/sweep.json
  score.py report   adds gated-ASR WER (needs <ch>.<engine>.gated.json from run-gated.sh)
                    and hand labels (labels.csv, if filled); prints the criteria table
  score.py windows  writes labels.csv: 30 s windows to label, where the engines disagree most

Both engines go through one Silero-style segmenter (threshold, threshold-0.15 hysteresis,
min speech 0.25 s, min silence 0.4 s, padding), so differences come from the model and hop.
"""
import csv, json, random, re, sys
from pathlib import Path
import numpy as np

WORK = Path(__file__).parent / "work"
FRAME = 0.01
ENGINES = ["fluid", "silero"]
CHANNELS = ["microphone", "call"]
THRESHOLDS = [0.3, 0.4, 0.5, 0.6, 0.7]
PADDINGS = [0.1, 0.2, 0.3]


def load(call, ch, kind):
    return json.loads((call / f"{ch}.{kind}.json").read_text())


def segment(probs, hop, thr, pad, min_speech=0.25, min_silence=0.4):
    neg = max(thr - 0.15, 0.01)
    spans, start, silent_since = [], None, None
    for i, p in enumerate(probs):
        t = i * hop
        if p >= thr:
            silent_since = None
            if start is None:
                start = t
        elif start is not None and p < neg:
            if silent_since is None:
                silent_since = t
            if t + hop - silent_since >= min_silence:
                if silent_since - start >= min_speech:
                    spans.append([start, silent_since])
                start, silent_since = None, None
    if start is not None:
        end = len(probs) * hop
        if end - start >= min_speech:
            spans.append([start, end])
    out = []
    for s, e in spans:
        s, e = max(0.0, s - pad), e + pad
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out


def mask(spans, n):
    m = np.zeros(n, bool)
    for s, e in spans:
        m[int(s / FRAME):int(e / FRAME) + 1] = True
    return m[:n]


def word_mask(words, n, pad=0.0):
    return mask([[w["s"] - pad, w["e"] + pad] for w in words], n)


def metrics(spans, words, n):
    sm = mask(spans, n)
    wm = word_mask(words, n)
    near = word_mask(words, n, pad=0.5)
    inside = [sm[min(int((w["s"] + w["e"]) / 2 / FRAME), n - 1)] for w in words]
    run = longest = 0
    for ok in inside:
        run = 0 if ok else run + 1
        longest = max(longest, run)
    return {
        "miss_frames": float((wm & ~sm).sum() / max(wm.sum(), 1)),
        "dropped_words": float(1 - np.mean(inside)) if words else 0.0,
        "longest_dropped_run": longest,
        "false_frames": float((sm & ~near).sum() / max((~near).sum(), 1)),
        "kept": float(sm.mean()),
    }


def calls():
    return sorted(p for p in WORK.iterdir() if p.is_dir() and (p / "call.asr.json").exists())


def sweep():
    results = {}
    for call in calls():
        for ch in CHANNELS:
            words = load(call, ch, "asr")["words"]
            for eng in ENGINES:
                v = load(call, ch, eng)
                n = int(v["audio"] / FRAME)
                for thr in THRESHOLDS:
                    for pad in PADDINGS:
                        m = metrics(segment(v["probs"], v["hop"], thr, pad), words, n)
                        results.setdefault(f"{eng}|{ch}|{thr}|{pad}", []).append((call.name, m, len(words)))
    # best setting per engine and channel: fewest kept frames with dropped words <= 0.5 %
    summary, best = {}, {}
    for key, rows in results.items():
        total = sum(w for _, _, w in rows) or 1
        agg = {k: sum(m[k] * w for _, m, w in rows) / total for k in ["miss_frames", "dropped_words", "false_frames", "kept"]}
        agg["longest_dropped_run"] = max(m["longest_dropped_run"] for _, m, _ in rows)
        summary[key] = agg
        eng, ch, thr, pad = key.split("|")
        ok = agg["dropped_words"] <= 0.005 and agg["longest_dropped_run"] < 3
        score = (not ok, agg["kept"] if ok else agg["dropped_words"])
        if (eng, ch) not in best or score < best[(eng, ch)][0]:
            best[(eng, ch)] = (score, float(thr), float(pad))
    for (eng, ch), (_, thr, pad) in best.items():
        for call in calls():
            v = load(call, ch, eng)
            (call / f"{ch}.{eng}.spans.json").write_text(json.dumps(segment(v["probs"], v["hop"], thr, pad)))
    out = {"summary": summary, "best": {f"{e}|{c}": [t, p] for (e, c), (_, t, p) in best.items()}}
    (WORK / "sweep.json").write_text(json.dumps(out, indent=1))
    for k, (t, p) in out["best"].items():
        print(k, "thr", t, "pad", p, {a: round(b, 4) for a, b in summary[f"{k}|{t}|{p}"].items()})


def norm(text):
    return re.sub(r"[^\w\s]", " ", text.lower().replace("ё", "е")).split()


def wer(ref, hyp):
    d = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        prev, d[0] = d[0], i
        for j, h in enumerate(hyp, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (r != h))
    return d[len(hyp)] / max(len(ref), 1)


def bleed(call, eng, thr, pad):
    """Share of far-end-only speech (call words, no microphone words) marked speech on the microphone."""
    mic, far = load(call, "microphone", "asr")["words"], load(call, "call", "asr")["words"]
    v = load(call, "microphone", eng)
    n = int(v["audio"] / FRAME)
    far_only = word_mask(far, n) & ~word_mask(mic, n, pad=0.5)
    sm = mask(segment(v["probs"], v["hop"], thr, pad), n)
    return float((sm & far_only).sum()), float(far_only.sum())


def onset_lag(call, ch, eng, thr):
    """Seconds from an utterance onset (a word after >= 1 s without words) until the engine
    has a hop at or above the threshold, counting the hop's full length as decision time."""
    words = load(call, ch, "asr")["words"]
    v = load(call, ch, eng)
    probs, hop = np.array(v["probs"]), v["hop"]
    lags, last_end = [], -10.0
    for w in words:
        if w["s"] - last_end >= 1.0:
            i = max(int((w["s"] - 0.1) / hop), 0)
            hits = np.nonzero(probs[i:i + int(2.0 / hop) + 1] >= thr)[0]
            if len(hits):
                lags.append(max((i + hits[0] + 1) * hop - w["s"], 0.0))
        last_end = max(last_end, w["e"])
    return lags


def labels_score(best):
    path = WORK.parent / "labels.csv"
    if not path.exists():
        return None
    rows = [r for r in csv.DictReader(path.open()) if r["speech"].strip()]  # "none" parses to no spans
    if not rows:
        return None
    res = {}
    for r in rows:
        call, ch, start = WORK / r["call"], r["channel"], float(r["start"])
        truth = [[float(a), float(b)] for a, b in (s.split("-") for s in r["speech"].split(";") if "-" in s)]
        n = int(30 / FRAME)
        tm = mask(truth, n)
        for eng in ENGINES:
            spans = json.loads((call / f"{ch}.{eng}.spans.json").read_text())
            sm = mask([[a - start, b - start] for a, b in spans if b > start and a < start + 30], n)
            acc = res.setdefault((eng, ch), [0, 0, 0, 0])
            acc[0] += (tm & ~sm).sum(); acc[1] += tm.sum(); acc[2] += (sm & ~tm).sum(); acc[3] += (~tm).sum()
    return {k: (a / max(b, 1), c / max(d, 1)) for k, (a, b, c, d) in res.items()}


def report():
    sw = json.loads((WORK / "sweep.json").read_text())
    labelled = labels_score(sw["best"])
    print("| engine | channel | thr/pad | miss (words) | dropped words | longest run | false (proxy) | kept | ΔWER | VAD RTFx |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for key, (thr, pad) in sorted(sw["best"].items()):
        eng, ch = key.split("|")
        m = sw["summary"][f"{key}|{thr}|{pad}"]
        refs, hyps, vad_wall, audio = [], [], 0.0, 0.0
        for call in calls():
            refs += norm(" ".join(w["w"] for w in load(call, ch, "asr")["words"]))
            gated = call / f"{ch}.{eng}.gated.json"
            if gated.exists():
                hyps += norm(" ".join(w["w"] for w in json.loads(gated.read_text())["words"]))
            v = load(call, ch, eng)
            vad_wall += v["wall"]; audio += v["audio"]
        dw = f"{wer(refs, hyps) * 100:.2f} pt" if hyps else "–"
        print(f"| {eng} | {ch} | {thr}/{pad} | {m['miss_frames']*100:.2f} % | {m['dropped_words']*100:.2f} % | "
              f"{m['longest_dropped_run']} | {m['false_frames']*100:.1f} % | {m['kept']*100:.1f} % | {dw} | {audio/vad_wall:.0f}× |")
    print()
    for eng in ENGINES:
        thr, pad = sw["best"][f"{eng}|microphone"]
        b = [bleed(c, eng, thr, pad) for c in calls()]
        print(f"bleed {eng}: {sum(x for x, _ in b) / max(sum(y for _, y in b), 1) * 100:.1f} % of far-end-only time marked speech on the microphone")
    print()
    for key, (thr, pad) in sorted(sw["best"].items()):
        eng, ch = key.split("|")
        lags = [x for c in calls() for x in onset_lag(c, ch, eng, thr)]
        print(f"onset lag {eng} {ch}: median {np.median(lags)*1000:.0f} ms, p90 {np.percentile(lags, 90)*1000:.0f} ms over {len(lags)} onsets")
    if labelled:
        print()
        for (eng, ch), (miss, false) in sorted(labelled.items()):
            print(f"hand labels {eng} {ch}: miss {miss*100:.2f} %, false {false*100:.1f} %")


def windows(per_channel=20):
    sw = json.loads((WORK / "sweep.json").read_text())
    rnd = random.Random(1101)
    rows = []
    for ch in CHANNELS:
        cands = []
        for call in calls():
            a = json.loads((call / f"{ch}.fluid.spans.json").read_text())
            b = json.loads((call / f"{ch}.silero.spans.json").read_text())
            n = int(load(call, ch, "fluid")["audio"] / FRAME)
            diff = mask(a, n) ^ mask(b, n)
            for s in range(0, n - 3000, 3000):
                cands.append((float(diff[s:s + 3000].mean()), call.name, s * FRAME))
        cands.sort(reverse=True)
        top = cands[:per_channel // 2]
        rest = rnd.sample(cands[per_channel // 2:], per_channel - len(top))
        rows += [(c, ch, s, f"{d*100:.0f}") for d, c, s in top + rest]
    with (WORK.parent / "labels.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["clip", "call", "channel", "start", "disagreement_pct", "speech"])
        for i, (c, ch, s, d) in enumerate(rows, 1):
            w.writerow([f"{i:02d}", c, ch, f"{s:.0f}", d, ""])
    print(f"wrote {len(rows)} windows to labels.csv; fill 'speech' as 'a-b;c-d' in seconds within the clip (0-30); 'none' for no speech")


{"sweep": sweep, "report": report, "windows": windows}[sys.argv[1]]()
