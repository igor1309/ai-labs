#!/usr/bin/env python3
"""Reports a nightly long run and compares it with the last matching one.

    python3 -I scripts/nightly-report.py RUN_DIR [--previous OLD_RUN_DIR]

RUN_DIR holds identity.json (written by nightly.sh), endurance.log (the
3-hour real-model run's report) and capture-*/summary.json (short Time
Profiler windows). It writes RUN_DIR/report.json and RUN_DIR/report.md.

Numbers are compared only between runs whose workload, build, models,
machine and toolchain all match. The commit is not part of the identity:
comparing commits is what the nightly run is for.
"""

import argparse
import json
import re
from pathlib import Path

IDENTITY = ("workload", "build", "models", "machine", "toolchain")
MINUTES = (1, 30, 90, 180)

LINE = re.compile(
    r"rehearsal: (?P<minute>\d+) min of audio in (?P<wall>[\d.,]+) s, "
    r"at most (?P<behind>[\d.,]+) s behind, now (?P<backlog>[\d.,]+) s"
    r"(?:; newest word trails by (?P<newest>.+?)"
    r", final text by (?P<final>.+?))?"
    r", footprint (?P<footprint>-?\d+) MiB, peak (?P<peak>-?\d+) MiB")
MEAN = re.compile(r"mean (?P<mean>[\d.,]+) s")
DONE = re.compile(r"rehearsal: done: .*?cpu (?P<cpu>[\d.,]+) s, (?P<share>\d+)% of one core; "
                  r"footprint (?P<end>-?\d+) MiB at the end, peak (?P<peak>-?\d+) MiB")


def number(text):
    """A number as the report prints it, in the Mac's locale: 0,4 or 0.4."""
    return float(text.replace(",", "."))


def mean(text):
    match = MEAN.search(text or "")
    return number(match["mean"]) if match else None


def samples(log):
    """The per-minute lines of a rehearsal report, by audio minute."""
    found = {}
    for line in log.splitlines():
        match = LINE.search(line)
        if match:
            found[int(match["minute"])] = {
                "behind_s": number(match["behind"]),
                "backlog_s": number(match["backlog"]),
                "newest_lag_mean_s": mean(match["newest"]),
                "final_lag_mean_s": mean(match["final"]),
                "footprint_mib": int(match["footprint"]),
                "peak_mib": int(match["peak"]),
            }
    return found


def endurance(log):
    found = samples(log)
    done = next((DONE.search(line) for line in log.splitlines() if DONE.search(line)), None)
    return {
        "completed": done is not None,
        "minutes": max(found, default=0),
        "at": {str(minute): found[minute] for minute in MINUTES if minute in found},
        "cpu_share_percent": int(done["share"]) if done else None,
        "footprint_end_mib": int(done["end"]) if done else None,
        "footprint_peak_mib": int(done["peak"]) if done else None,
    }


def captures(run):
    found = {}
    for path in sorted(run.glob("capture-*/summary.json")):
        summary = json.loads(path.read_text())
        total = summary.get("sampled_cpu_ns") or 0
        hangs = summary.get("hangs", {})
        found[path.parent.name] = {
            "main_thread_percent": round(100 * summary.get("main_thread_ns", 0) / total, 1) if total else None,
            "hangs": hangs.get("count", 0),
            "longest_hang_ms": round(hangs.get("longest_ns", 0) / 1e6),
        }
    return found


def mismatch(old, new):
    """The identity fields on which two runs differ; empty when they compare."""
    return [field for field in IDENTITY if old.get("identity", {}).get(field) != new["identity"].get(field)]


def report(run):
    identity = json.loads((run / "identity.json").read_text())
    log = run / "endurance.log"
    return {
        "identity": {field: identity[field] for field in IDENTITY},
        "commit": identity.get("commit"),
        "started": identity.get("started"),
        "endurance": endurance(log.read_text()) if log.exists() else None,
        "captures": captures(run),
    }


def change(old, new):
    if old is None or new is None:
        return "–"
    return f"{new:g} (was {old:g}, {new - old:+g})"


def markdown(new, old=None):
    lines = ["## Audelin nightly long run", "", f"Commit `{new['commit']}`, started {new['started']}.", ""]
    for field in IDENTITY:
        lines.append(f"- **{field}**: {json.dumps(new['identity'][field], sort_keys=True)}")
    lines.append("")
    if old is None:
        lines += ["Not compared: no earlier run.", ""]
    else:
        differs = mismatch(old, new)
        if differs:
            lines += [f"Not compared with `{old.get('commit')}`: its {', '.join(differs)} differ.", ""]
            old = None
        else:
            lines += [f"Compared with `{old.get('commit')}` from {old.get('started')}, an identical setup.", ""]
    run = new["endurance"]
    if run:
        lines += [f"### Real-model run at 1x: {run['minutes']} min{'' if run['completed'] else ', did not finish'}", "",
                  "| audio minute | behind s | newest word lag s | final text lag s | footprint MiB |",
                  "|---|---|---|---|---|"]
        before = (old or {}).get("endurance") or {}
        for minute, at in run["at"].items():
            was = before.get("at", {}).get(minute, {})
            lines.append("| " + " | ".join([minute] + [
                change(was.get(key), at[key]) if old else ("–" if at[key] is None else f"{at[key]:g}")
                for key in ("behind_s", "newest_lag_mean_s", "final_lag_mean_s", "footprint_mib")]) + " |")
        lines += ["", f"CPU {run['cpu_share_percent']}% of one core; footprint {run['footprint_end_mib']} MiB "
                  f"at the end, peak {run['footprint_peak_mib']} MiB.", ""]
    for name, capture in new["captures"].items():
        was = ((old or {}).get("captures") or {}).get(name)
        def value(key):
            return f"{capture[key]} (was {was.get(key)})" if was else f"{capture[key]}"
        lines.append(f"### {name}: main thread {value('main_thread_percent')}% of sampled CPU, "
                     f"{value('hangs')} hangs, longest {value('longest_hang_ms')} ms")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("run", type=Path)
    parser.add_argument("--previous", type=Path)
    args = parser.parse_args()
    new = report(args.run)
    old = None
    if args.previous and (args.previous / "report.json").exists():
        old = json.loads((args.previous / "report.json").read_text())
    (args.run / "report.json").write_text(json.dumps(new, indent=2, sort_keys=True) + "\n")
    text = markdown(new, old)
    (args.run / "report.md").write_text(text)
    print(text, end="")


if __name__ == "__main__":
    main()
