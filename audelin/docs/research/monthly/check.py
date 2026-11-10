"""Monthly check of the owner's newest calls against what the call-track reports found.

usage (from audelin/docs/research):
  uv run --project diarization python monthly/check.py [--days 31] [--recordings DIR]

Takes each recording in DIR (default ~/Recordings/Audelin) whose folder name starts with
a date (YYYY.MM.DD) within the last --days days and has both tracks. For each it writes
16 kHz copies, Parakeet v3 transcripts of both tracks, and VBx and Nemotron 3 speakers on
the call track, all under monthly/work/ (the recordings are only read). Then it prints
one table row per call and a FLAG line for each finding that the reports did not expect:

  bleed      far-side words leak into the microphone transcript at 3 a minute or more
             (one such call in the first 18); LocalVQE with the call track as reference
             removes them
  one-vs-many  VBx and Nemotron disagree on whether the call has more than one remote
             speaker (they agreed on all of the first 16)
  slots      Nemotron gives 8 speakers 5 % of the speech or more, all its slots, or VBx
             finds more than 8: more remote speakers than Nemotron can label

Recordings under a minute or with fewer than 20 words on the call track (test clips,
silent or muted far sides) get no flag. It prints nothing but the table when there is no
FLAG. The summary is also written to
monthly/work/check.json.
"""
import argparse
import json
import re
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parent
sys.path[:0] = [str(RESEARCH / "enhance"), str(RESEARCH / "diarization")]
from calls import CHANCE_SHIFT, leaked, load  # noqa: E402
from score import stats  # noqa: E402

SPIKE = RESEARCH / "spike"
BIN = SPIKE / ".build" / "release"
WORK = HERE / "work"
BLEED_PER_MIN = 3.0
MIN_CALL_WORDS = 20
MIN_MINUTES = 1.0
SLOTS = 8


def run(*args):
    done = subprocess.run([str(a) for a in args], capture_output=True, text=True)
    if done.returncode:
        sys.exit(f"{' '.join(map(str, args))} exited {done.returncode}:\n{done.stderr[-2000:]}")


def recent(recordings, days):
    since = date.today() - timedelta(days=days)
    for folder in sorted(recordings.iterdir()):
        m = re.match(r"(\d{4})\.(\d{2})\.(\d{2})", folder.name)
        if not m or date(*map(int, m.groups())) < since:
            continue
        if (folder / "microphone.caf").exists() and (folder / "call.caf").exists():
            yield folder


def measure(folder):
    out = WORK / folder.name.replace(" ", "_")
    out.mkdir(parents=True, exist_ok=True)
    if not (out / "done").exists():
        run(BIN / "audelin-vad", "prep", folder / "microphone.caf", out / "mic.f32")
        run(BIN / "audelin-vad", "prep", folder / "call.caf", out / "call.f32")
        for t in ("mic", "call"):
            run(BIN / "audelin-vad", "asr", out / f"{t}.f32", out / f"{t}.asr.json")
        for system in ("vbx", "nemotron"):
            run(BIN / "audelin-diarize", system, out / "call.f32", out / f"call.{system}.json")
        (out / "done").touch()
    mic, call = load(out / "mic.asr.json"), load(out / "call.asr.json")
    minutes = (out / "mic.f32").stat().st_size / 4 / 16000 / 60
    row = {"call": folder.name, "minutes": minutes, "callWords": len(call), "micWords": len(mic),
           "leakedPerMin": leaked(mic, call) / minutes if minutes else 0.0,
           "chancePerMin": (leaked(mic, call, CHANCE_SHIFT) + leaked(mic, call, -CHANCE_SHIFT)) / 2 / minutes
           if minutes else 0.0}
    for system in ("vbx", "nemotron"):
        s = stats(out / f"call.{system}.json")
        row[system] = {"speakers": s["speakers"], "speakers5pct": s["speakers5pct"],
                       "switchesPerMin": s["switchesPerMin"]}
    return row


def flags(row):
    found = []
    if row["minutes"] < MIN_MINUTES or row["callWords"] < MIN_CALL_WORDS:
        return found
    if row["leakedPerMin"] >= BLEED_PER_MIN:
        found.append(f"bleed: {row['leakedPerMin']:.1f} leaked words a minute")
    v, n = row["vbx"]["speakers5pct"], row["nemotron"]["speakers5pct"]
    if (v > 1) != (n > 1):
        found.append(f"one-vs-many: VBx {v}, Nemotron {n} remote speakers")
    if n >= SLOTS or row["vbx"]["speakers"] > SLOTS:
        found.append(f"slots: VBx {row['vbx']['speakers']} speakers, Nemotron {n} of {SLOTS} slots")
    return found


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=31)
    p.add_argument("--recordings", type=Path, default=Path.home() / "Recordings" / "Audelin")
    a = p.parse_args()
    if not (BIN / "audelin-diarize").exists():
        subprocess.run(["swift", "build", "--package-path", str(SPIKE), "-c", "release"], check=True,
                       stdout=subprocess.DEVNULL)
    rows = [measure(f) for f in recent(a.recordings, a.days)]
    for r in rows:
        r["flags"] = flags(r)
    WORK.mkdir(exist_ok=True)
    (WORK / "check.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False))
    print(f"{len(rows)} calls from the last {a.days} days, {sum(r['minutes'] for r in rows):.0f} min\n")
    print("| Call | min | call words | leaked/min | chance/min | VBx speakers ≥ 5 % (all) | Nemotron (all) |")
    print("|---|---:|---:|---:|---:|---:|---:|")
    for r in rows:
        v, n = r["vbx"], r["nemotron"]
        print(f"| {r['call']} | {r['minutes']:.1f} | {r['callWords']} | {r['leakedPerMin']:.1f} | "
              f"{r['chancePerMin']:.2f} | {v['speakers5pct']} ({v['speakers']}) | "
              f"{n['speakers5pct']} ({n['speakers']}) |")
    for r in rows:
        for f in r["flags"]:
            print(f"FLAG {r['call']}: {f}")


if __name__ == "__main__":
    main()
