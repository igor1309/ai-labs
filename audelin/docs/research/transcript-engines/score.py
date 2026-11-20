"""Scores the final-pass candidates run.sh produced; writes results.md and results.json.

usage (from audelin/docs/research/transcript-engines): uv run python score.py

Labelled sets (human references):
  WER            word error rate after normalising both sides: lower case,
                 ё → е, digits spelled out in Russian, punctuation and
                 hyphens dropped;
  wrong-script   hypothesis words in Latin script that the reference does not
                 have in Latin, per 1,000 reference words;
  terms          FLEURS reference words in Latin (names, acronyms): the share
                 the engine writes in Latin, the same word;
  gap words      long tracks only: words whose middle lies in a gap of quiet
                 noise at least 0.5 s from any utterance, per hour of gap;
  repeats        long tracks only: the most times one line repeats in a
                 track, the loop Whisper falls into;
  language       wh-auto: files detected as anything but Russian.

Calls (no reference; levels and reference Silero as in LAB-1688's spike):
  a word lies on own-track speech when, within its span widened by 0.25 s,
  the loudest 100 ms frame of its own track is at −40 dBFS or above and the
  Silero probability reaches 0.5; on no speech when neither does. Counted per
  hour of track: words on no speech (split by whether the other track has
  speech: leakage, or silence), Latin words on own speech, and Latin acronyms
  (2–6 capitals) on own speech.

Cost: wall seconds and peak memory per run from /usr/bin/time -l, as compute
per hour of audio on the long tracks and the calls.
"""
import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
import soundfile as sf
from num2words import num2words

HERE = Path(__file__).resolve().parent
WORK = HERE / "work"
OUT = WORK / "out"
SETS = ("fleurs", "crowd", "farfield", "long")
ENGINES = ("pk-windows", "pk-whole", "wh-ru", "wh-auto", "wh-ru-vad")
VAD_DIR = HERE.parent / "transcript-language" / "work" / "vad"
LATIN = re.compile(r"[A-Za-z]")
CYRILLIC = re.compile(r"[А-Яа-яЁё]")
ACRONYM = re.compile(r"^[A-Z]{2,6}s?$")


# ---------- reading engine output ----------

def whisper_words(path):
    """Words from a whisper-cli -ojf file, timed by spreading each segment's
    span over its words by length (token text can split a letter)."""
    data = json.loads(path.read_bytes().decode("utf-8", "replace"))
    words, lines = [], []
    for seg in data["transcription"]:
        a, b = seg["offsets"]["from"] / 1000, seg["offsets"]["to"] / 1000
        text = seg["text"].strip()
        lines.append(text)
        parts = text.split()
        total = sum(len(p) for p in parts) or 1
        at = a
        for p in parts:
            d = (b - a) * len(p) / total
            words.append({"w": p, "s": at, "e": at + d})
            at += d
    return words, lines, data.get("result", {}).get("language")


def outputs(engine, name):
    """{file id: (words, lines, language)} for one engine and set."""
    folder = OUT / engine / name
    out = {}
    if engine.startswith("pk-"):
        path = folder / "words.jsonl"
        if not path.exists():
            return None
        for line in path.read_text().splitlines():
            row = json.loads(line)
            uid = Path(row["file"]).stem
            out[uid] = (row["words"], None, None)
    else:
        if not (folder / "done").exists():
            return None
        for path in folder.glob("*.wav.json"):
            out[path.name.removesuffix(".wav.json")] = whisper_words(path)
    return out


def cost(engine, name):
    path = OUT / engine / name / "time.txt"
    if not path.exists():
        return None
    text = path.read_text()
    if not re.search(r"[\d.]+ real", text):
        return None
    real = float(re.search(r"([\d.]+) real", text).group(1))
    rss = int(re.search(r"(\d+)\s+maximum resident set size", text).group(1))
    return real, rss


# ---------- text ----------

def norm_tokens(text):
    text = text.lower().replace("ё", "е")
    text = re.sub(r"\d+([.,]\d+)?", lambda m: " " + spell(m.group(0)) + " ", text)
    text = re.sub(r"[-–—/]", " ", text)
    text = re.sub(r"[^\w\s]", "", text)
    return text.split()


def spell(number):
    try:
        return num2words(float(number.replace(",", ".")) if re.search(r"[.,]", number) else int(number), lang="ru")
    except (ValueError, OverflowError):
        return number


def edits(ref, hyp):
    d = list(range(len(hyp) + 1))
    for i in range(1, len(ref) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(hyp) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (ref[i - 1] != hyp[j - 1]))
            prev = cur
    return d[len(hyp)]


# ---------- labelled sets ----------

def score_set(name, refs, got, gaps=None):
    errs = ref_words = wrong = 0
    term_total = term_kept = 0
    gap_words, gap_seconds, repeats, langs = 0, 0.0, 0, Counter()
    for uid, ref in refs.items():
        words, lines, lang = got.get(uid, ([], None, None))
        hyp_text = " ".join(w["w"] for w in words)
        r, h = norm_tokens(ref), norm_tokens(hyp_text)
        errs += edits(r, h)
        ref_words += len(r)
        ref_latin = {t for t in r if LATIN.search(t)}
        wrong += sum(1 for t in h if LATIN.search(t) and t not in ref_latin)
        if name == "fleurs":
            for t in ref_latin:
                term_total += 1
                term_kept += t in h
        if lang:
            langs[lang] += 1
        if gaps is not None:
            spans = gaps[uid]
            total = sf.info(WORK / "sets" / name / f"{uid}.wav").duration
            edges = [(0.0, spans[0][0])] + [(spans[i][1], spans[i + 1][0]) for i in range(len(spans) - 1)] + [(spans[-1][1], total)]
            inner = [(a + 0.5, b - 0.5) for a, b in edges if b - a > 1.0]
            gap_seconds += sum(b - a for a, b in inner)
            for w in words:
                m = (w["s"] + w["e"]) / 2
                gap_words += any(a <= m < b for a, b in inner)
            if lines:
                repeats = max(repeats, max(Counter(lines).values()))
    row = {"files": len(refs), "missing": len(set(refs) - set(got)), "ref_words": ref_words,
           "wer": errs / ref_words, "wrong_per_1k": 1000 * wrong / ref_words}
    if name == "fleurs":
        row["terms"] = [term_kept, term_total]
    if gaps is not None:
        row["gap_words_per_hour"] = gap_words / (gap_seconds / 3600)
        row["gap_hours"] = gap_seconds / 3600
        row["max_repeats"] = repeats
    if langs:
        row["not_ru"] = sum(v for k, v in langs.items() if k != "ru")
        row["languages"] = dict(langs)
    return row


# ---------- calls ----------

def frame_levels(path):
    audio = sf.read(path, dtype="float32")[0]
    hop = 1600
    n = len(audio) // hop
    rms = np.sqrt(np.mean(audio[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    return 20 * np.log10(rms)


def silero(path):
    data = json.loads(path.read_text())
    probs = data["probs"] if isinstance(data, dict) else data
    return np.asarray(probs, dtype="float32")


def peak(arr, a, b, step):
    i, j = max(0, int(a / step)), max(int(a / step) + 1, int(np.ceil(b / step)))
    part = arr[i:j]
    return float(part.max()) if len(part) else -np.inf


def speech(levels, probs, a, b):
    loud = peak(levels, a, b, 0.1) >= -40
    voiced = peak(probs, a, b, 512 / 16000) >= 0.5
    return "speech" if loud and voiced else "none" if not loud and not voiced else "unsure"


def score_calls(engine):
    got = outputs(engine, "calls")
    if got is None:
        return None
    tracks = {}
    for wav in sorted((WORK / "calls").glob("*.wav")):
        key, side = wav.stem.rsplit(".", 1)
        tracks[(key, side)] = wav
    cache = {}

    def signals(key, side):
        if (key, side) not in cache:
            cache[(key, side)] = (frame_levels(tracks[(key, side)]), silero(VAD_DIR / f"{key}.{side}.json"))
        return cache[(key, side)]

    rows = {}
    for side in ("microphone", "call"):
        other = "call" if side == "microphone" else "microphone"
        c = Counter()
        hours = 0.0
        for (key, s), wav in tracks.items():
            if s != side:
                continue
            words = got.get(wav.stem, ([], None, None))[0]
            own, oth = signals(key, side), signals(key, other)
            hours += len(own[0]) * 0.1 / 3600
            for w in words:
                a, b = w["s"] - 0.25, w["e"] + 0.25
                state = speech(*own, a, b)
                c["words"] += 1
                if state == "none":
                    if speech(*oth, a, b) == "speech":
                        c["none.other_speaking"] += 1
                    else:
                        c["none.silence"] += 1
                    c["none.latin"] += bool(LATIN.search(w["w"]))
                elif state == "speech":
                    c["speech"] += 1
                    token = re.sub(r"[^\w-]", "", w["w"])
                    if LATIN.search(token):
                        c["speech.latin"] += 1
                        c["speech.acronym"] += bool(ACRONYM.match(token))
                    elif CYRILLIC.search(token):
                        c["speech.cyrillic"] += 1
        rows[side] = {"hours": hours, **c}
    return rows


# ---------- report ----------

def main():
    results = {"sets": {}, "calls": {}, "cost": {}}
    for name in SETS:
        # Two Golos crowd clips have no transcript; they are left out.
        refs = {k: v for k, v in json.loads((WORK / "sets" / name / "refs.json").read_text()).items() if v}
        gaps = json.loads((WORK / "sets" / name / "gaps.json").read_text()) if name == "long" else None
        for engine in ENGINES:
            got = outputs(engine, name)
            if got is not None:
                results["sets"].setdefault(name, {})[engine] = score_set(name, refs, got, gaps)
    # WER again on the clips where no engine wrote a digit, so spelling
    # numbers out cannot favour one engine.
    for name in ("fleurs", "crowd", "farfield"):
        refs = {k: v for k, v in json.loads((WORK / "sets" / name / "refs.json").read_text()).items() if v}
        outs = {e: o for e in ENGINES if (o := outputs(e, name)) is not None}
        text = lambda e, k: " ".join(w["w"] for w in outs[e].get(k, ([], None, None))[0])
        keep = [k for k in refs if not any(re.search(r"\d", text(e, k)) for e in outs)]
        for e in outs:
            errs = sum(edits(norm_tokens(refs[k]), norm_tokens(text(e, k))) for k in keep)
            total = sum(len(norm_tokens(refs[k])) for k in keep)
            results["sets"][name][e]["wer_no_digits"] = errs / total
            results["sets"][name][e]["no_digit_files"] = len(keep)
    for engine in ENGINES:
        rows = score_calls(engine)
        if rows:
            results["calls"][engine] = rows
        for name, audio in (("long", "long"), ("calls", "calls")):
            c = cost(engine, name)
            if c is None:
                continue
            folder = WORK / ("calls" if name == "calls" else "sets/long")
            hours = sum(sf.info(p).duration for p in folder.glob("*.wav")) / 3600
            results["cost"].setdefault(engine, {})[name] = {
                "minutes_per_hour": c[0] / 60 / hours, "peak_gb": c[1] / 2**30, "audio_hours": hours}
    (HERE / "results.json").write_text(json.dumps(results, indent=1, ensure_ascii=False))
    (HERE / "results.md").write_text(report(results))
    print(report(results))


def pct(x):
    return f"{100 * x:.1f} %"


def report(r):
    lines = []
    engines = [e for e in ENGINES if any(e in r["sets"].get(s, {}) for s in SETS) or e in r["calls"]]
    head = "| Set | " + " | ".join(engines) + " |\n|---|" + "---:|" * len(engines)

    def table(title, fn, sets=SETS):
        lines.append(f"### {title}\n\n{head}")
        for s in sets:
            row = r["sets"].get(s, {})
            lines.append(f"| {s} | " + " | ".join(fn(row[e]) if e in row else "—" for e in engines) + " |")
        lines.append("")

    table("WER", lambda x: pct(x["wer"]))
    table("WER on clips where no engine wrote a digit", lambda x: pct(x["wer_no_digits"]), ("fleurs", "crowd", "farfield"))
    table("Latin words not in the reference, per 1,000 reference words", lambda x: f"{x['wrong_per_1k']:.1f}")
    table("FLEURS Latin reference words written in Latin", lambda x: f"{x['terms'][0]} / {x['terms'][1]}", ("fleurs",))
    table("Long tracks: words in gaps per hour of gap", lambda x: f"{x['gap_words_per_hour']:.0f}", ("long",))
    table("Long tracks: most repeats of one line in a track", lambda x: str(x.get("max_repeats", "—")), ("long",))
    table("Files detected as not Russian", lambda x: str(x.get("not_ru", "—")))

    for side in ("microphone", "call"):
        lines.append(f"### Calls, {side} side, per hour of track\n")
        lines.append("| Measure | " + " | ".join(engines) + " |\n|---|" + "---:|" * len(engines))
        for label, key in (("words", "words"), ("on no speech, other side speaking", "none.other_speaking"),
                           ("on no speech, silence", "none.silence"), ("of those, Latin", "none.latin"),
                           ("Latin on own speech", "speech.latin"), ("Latin acronyms on own speech", "speech.acronym"),
                           ("Cyrillic on own speech", "speech.cyrillic")):
            cells = []
            for e in engines:
                row = r["calls"].get(e, {}).get(side)
                cells.append(f"{row.get(key, 0) / row['hours']:.0f}" if row else "—")
            lines.append(f"| {label} | " + " | ".join(cells) + " |")
        lines.append("")

    lines.append("### Cost on this Mac\n")
    lines.append("| Engine | long: min per hour of audio | long: peak GB | calls: min per hour | calls: peak GB |\n|---|---:|---:|---:|---:|")
    for e in engines:
        c = r["cost"].get(e, {})
        cell = lambda n, k, f: f.format(c[n][k]) if n in c else "—"
        lines.append(f"| {e} | {cell('long', 'minutes_per_hour', '{:.1f}')} | {cell('long', 'peak_gb', '{:.2f}')} | "
                     f"{cell('calls', 'minutes_per_hour', '{:.1f}')} | {cell('calls', 'peak_gb', '{:.2f}')} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
