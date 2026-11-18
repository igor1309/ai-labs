"""Where non-Cyrillic words in Audelin's final transcripts come from (LAB-1688).

usage (from audelin/docs/research/transcript-language):
    uv run python classify.py [--audelin ~/Recordings/Audelin] [--amanu ~/Recordings]

Every call recorded by both Audelin and Amanu (matched by the yyyy.MM.dd-HHmm folder
prefix) whose Audelin folder still has microphone.caf and call.caf. For each Audelin
segment, its side (Me = microphone.caf, Them* = call.caf), its span (start to the next
segment's start on the same side, at most MAX_SPAN s), the loudest 100 ms frame on its
own track and on the other track, and Amanu's same-side text over the same span after
aligning the two clocks by shared Russian words.

Speech on a track over a span needs both signals to agree: the loudest 100 ms frame at
SPEECH dBFS or above, and a reference-Silero probability of VAD_SPEECH or above (work/vad,
written by ./vad.sh; run it first). Each non-Cyrillic word (letters, no Cyrillic) gets one
class:
  speech.term              own track speech; Amanu has the same word in Latin on that side
                           within TERM_PAD s (a filler never counts as a term)
  speech.filler            own track speech; the word is a filler (FILLERS: "Mm-hmm", "Okay")
  speech.in-russian        own track speech; the word sits in a segment with Russian words
  speech.alone             own track speech; no Russian word in the segment, Amanu has
                           Russian text on that side: speech written in another language
  quiet-own.other-speaking no speech on its own track while the other track is at SPEECH
  quiet-own.silence        no speech on its own track or the other
  quiet-own.echo           no speech on its own track; the same word is on the other side
                           within ECHO s
  unresolved               the two signals disagree, or no Amanu reference (reason recorded)

Writes work/words.csv (with text; local only) and counts.csv (no text; committed).
"""
import argparse
import csv
import json
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
WORK = HERE / "work"
RATE = 16_000
FRAME = 0.1
MAX_SPAN = 30.0
SPEECH = -40.0
SILENT = -50.0     # below this on both tracks, with no Silero speech, the span is silence
VAD_SPEECH = 0.5   # reference Silero threshold LAB-1107 found to reject silent windows
PAD = 3.0          # seconds added on each side when reading Amanu's text for a span
TERM_PAD = 60.0    # Amanu's segment times are coarse; a Latin word within this of the span counts as the same term
ECHO = 5.0         # seconds; a word on both sides this close is heard twice, not invented
MIN_ALIGN = 0.2    # calls whose shared-word share is below this are not aligned and are left out
ALIGN_RANGE = 180  # seconds searched each way for the clock offset
ALIGN_TOL = 8.0

HEADER = re.compile(r"\*\*(Me|Them|Them [0-9]+|Them \(.*\)|Them [0-9]+ \(.*\)|Gap)\*\* ([0-9]{2,}):([0-5][0-9]):([0-5][0-9])")
WORD = re.compile(r"[^\W\d_][\w'’-]*")
CYR = re.compile(r"[Ѐ-ӿ]")


def norm(w):
    return re.sub(r"[^\w]", "", w.lower().replace("ё", "е"))


def audelin_segments(path):
    segs, cur = [], None
    for line in path.read_text().splitlines():
        m = HEADER.match(line)
        if m:
            label = m.group(1)
            t = int(m.group(2)) * 3600 + int(m.group(3)) * 60 + int(m.group(4))
            cur = None if label == "Gap" else {"side": "mic" if label == "Me" else "call", "start": float(t), "text": ""}
            if cur:
                segs.append(cur)
        elif line.startswith("## ") or line.startswith("<!--"):
            cur = None
        elif cur is not None and line.strip():
            cur["text"] += (" " if cur["text"] else "") + line.strip().replace("<unk>", " ")
    segs.sort(key=lambda s: s["start"])
    # Both sides talk over each other, so a segment runs until the next one on its own side.
    for side in ("mic", "call"):
        own = [s for s in segs if s["side"] == side]
        for i, s in enumerate(own):
            nxt = own[i + 1]["start"] if i + 1 < len(own) else s["start"] + MAX_SPAN
            s["end"] = min(max(nxt, s["start"] + 1.0), s["start"] + MAX_SPAN)
    return segs


def amanu_segments(path):
    out = []
    for s in json.loads(path.read_text())["segments"]:
        side = "mic" if s["speaker"] == "me" else "call"
        out.append({"side": side, "start": s["start_ms"] / 1000, "end": s["end_ms"] / 1000, "text": s["text"]})
    return out


def align(aud, ama):
    """Offset o (Amanu time = Audelin time + o) with the most shared long Russian words."""
    keys = [(s["side"], s["start"], norm(w)) for s in aud for w in WORD.findall(s["text"]) if CYR.search(w) and len(w) >= 5]
    index = defaultdict(list)
    for s in ama:
        for w in WORD.findall(s["text"]):
            if CYR.search(w) and len(w) >= 5:
                index[(s["side"], norm(w))].append(s["start"])
    scores = []
    for o in range(-ALIGN_RANGE, ALIGN_RANGE + 1):
        n = sum(1 for side, t, w in keys if any(abs(a - (t + o)) <= ALIGN_TOL for a in index.get((side, w), ())))
        scores.append((n, o))
    scores.sort(reverse=True)
    return scores[0][1], scores[0][0], len(keys), scores[0][0] - next(n for n, o in scores if abs(o - scores[0][1]) > ALIGN_TOL)


def levels(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    x = np.frombuffer(raw, dtype="<f4")
    n = int(RATE * FRAME)
    frames = len(x) // n
    rms = np.sqrt(np.mean(x[: frames * n].reshape(frames, n) ** 2, axis=1))
    return 20 * np.log10(rms + 1e-9)


def vad_max(probs, a, b, hop=512 / RATE):
    """Highest reference-Silero speech probability over the span; None without a VAD run."""
    if probs is None:
        return None
    part = probs[int(a / hop): max(int(b / hop), int(a / hop) + 1)]
    return round(max(part), 3) if part else None


def peak(db, a, b):
    """Loudest 100 ms frame in the span: a short utterance such as «угу» still counts."""
    lo, hi = int(a / FRAME), max(int(b / FRAME), int(a / FRAME) + 1)
    part = db[lo:hi]
    return float(part.max()) if len(part) else float("nan")


FILLERS = {"mm", "mmhmm", "hmm", "uh", "um", "uhhuh", "yeah", "yes", "okay", "ok", "oh", "no", "so", "well", "ah", "aha", "aja", "the"}


def classify(word, ctx, own, own_vad, other, amanu_words, amanu_text, echoed):
    """Speech on the word's own track first: level and reference Silero must agree."""
    loud, voiced = own >= SPEECH, own_vad >= VAD_SPEECH
    if loud != voiced:
        return "unresolved", "level and Silero disagree"
    if not loud:
        if echoed:
            return "quiet-own.echo", "same word on the other side within ECHO s"
        return ("quiet-own.other-speaking", "") if other >= SPEECH else ("quiet-own.silence", "")
    if norm(word) in amanu_words and norm(word) not in FILLERS:
        return "speech.term", "Amanu has it in Latin"
    if norm(word).replace("á", "a") in FILLERS:
        return "speech.filler", ""
    if ctx == "in-russian":
        return "speech.in-russian", ""
    if amanu_text:  # set only when it holds Russian
        return "speech.alone", ""
    return "unresolved", "own track speech, no Russian Amanu text on this side"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--audelin", type=Path, default=Path.home() / "Recordings" / "Audelin")
    p.add_argument("--amanu", type=Path, default=Path.home() / "Recordings")
    args = p.parse_args()
    WORK.mkdir(exist_ok=True)

    amanu_by_key = {d.name[:15]: d for d in args.amanu.iterdir() if d.is_dir() and (d / "transcript.json").exists()}
    rows, calls, seglev = [], [], []
    for d in sorted(args.audelin.iterdir()):
        key = d.name[:15]
        if key not in amanu_by_key or not (d / "microphone.caf").exists() or not (d / "call.caf").exists() or not (d / "transcript.md").exists():
            continue
        aud = audelin_segments(d / "transcript.md")
        ama = amanu_segments(amanu_by_key[key] / "transcript.json")
        offset, hits, keys, margin = align(aud, ama)
        if keys == 0 or hits / keys < MIN_ALIGN:
            print(f"{key} left out: {hits}/{keys} shared Russian words, clocks not aligned", flush=True)
            continue
        db = {"mic": levels(d / "microphone.caf"), "call": levels(d / "call.caf")}
        if not all((WORK / "vad" / f"{key}.{n}.json").exists() for n in ("microphone", "call")):
            raise SystemExit(f"{key}: no Silero run; run ./vad.sh first")
        vad = {}
        for side, name in (("mic", "microphone"), ("call", "call")):
            f = WORK / "vad" / f"{key}.{name}.json"
            vad[side] = json.loads(f.read_text())["probs"] if f.exists() else None
        total = Counter()
        for s in aud:
            words = WORD.findall(s["text"])
            total[s["side"]] += len(words)
            other = "call" if s["side"] == "mic" else "mic"
            own_db, other_db = peak(db[s["side"]], s["start"], s["end"]), peak(db[other], s["start"], s["end"])
            near = [a for a in ama if a["side"] == s["side"] and a["end"] >= s["start"] + offset - PAD and a["start"] <= s["end"] + offset + PAD]
            amanu_text = " ".join(a["text"] for a in near)
            wide = " ".join(a["text"] for a in ama if a["side"] == s["side"] and a["end"] >= s["start"] + offset - TERM_PAD and a["start"] <= s["end"] + offset + TERM_PAD)
            amanu_words = {norm(w) for w in WORD.findall(wide) if not CYR.search(w)}
            amanu_text = amanu_text if CYR.search(amanu_text) else ""
            seglev.append({"call": key, "side": s["side"], "start": s["start"], "end": s["end"], "text": s["text"], "own_db": own_db, "other_db": other_db,
                           "own_vad": vad_max(vad[s["side"]], s["start"], s["end"]),
                           "cyr": sum(1 for x in words if CYR.search(x)), "latin": sum(1 for x in words if not CYR.search(x))})
            for w in words:
                if CYR.search(w):
                    continue
                ctx = "in-russian" if any(CYR.search(x) for x in words) else "alone"
                echoed = any(norm(w) in {norm(x) for x in WORD.findall(o["text"])} for o in aud
                             if o["side"] == other and abs(o["start"] - s["start"]) <= ECHO)
                own_vad = vad_max(vad[s["side"]], s["start"], s["end"])
                cls, why = classify(w, ctx, own_db, own_vad, other_db, amanu_words, amanu_text, echoed)
                rows.append({"call": key, "side": s["side"], "start": s["start"], "end": s["end"], "word": w, "ctx": ctx,
                             "filler": norm(w).replace("á", "a") in FILLERS,
                             "class": cls, "reason": why, "own_db": round(own_db, 1), "other_db": round(other_db, 1),
                             "own_vad": vad_max(vad[s["side"]], s["start"], s["end"]),
                             "segment": s["text"], "amanu": amanu_text})
        calls.append({"call": key, "offset_s": offset, "align_hits": hits, "align_keys": keys, "align_margin": margin,
                      "mic_words": total["mic"], "call_words": total["call"]})
        print(f"{key} offset {offset:+d}s ({hits}/{keys} shared, margin {margin}) mic {total['mic']} call {total['call']} words", flush=True)

    with open(WORK / "words.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader(); w.writerows(rows)
    with open(WORK / "calls.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(calls[0]))
        w.writeheader(); w.writerows(calls)
    with open(WORK / "segments.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(seglev[0]))
        w.writeheader(); w.writerows(seglev)
    classes = ["speech.term", "speech.in-russian", "speech.filler", "speech.alone",
               "quiet-own.other-speaking", "quiet-own.silence", "quiet-own.echo", "unresolved"]
    counts = Counter((r["call"], r["side"], r["class"]) for r in rows)
    with open(HERE / "counts.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["call", "side", "words", "non_cyrillic"] + classes + ["offset_s", "align_hits", "align_keys"])
        for c in calls:
            for side in ("mic", "call"):
                w.writerow([c["call"], side, c[f"{side}_words"], sum(counts[(c["call"], side, k)] for k in classes)]
                           + [counts[(c["call"], side, k)] for k in classes] + [c["offset_s"], c["align_hits"], c["align_keys"]])

if __name__ == "__main__":
    main()
