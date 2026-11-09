#!/usr/bin/env python3
"""Measures the whole audelin suite for the weekly slow-test hunt.

Runs the Swift tests of the three packages (macos, macos/App and
macos/PreviewApps) three times, reads each test's duration from Swift
Testing's event stream, and writes every test, ranked by its median
duration, to slow-tests-report.json and .md in the current directory.
Deterministic and token-free; a failing test does not stop the measurement.
Hardware-dependent tests run where the runner allows: those that need a
device or a permission the runner lacks disable themselves.

    python3 -I audelin/scripts/slow-tests.py [runs]
"""
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

AUDELIN = Path(__file__).resolve().parents[1]
MACOS = AUDELIN / "macos"
# Each package's directory and its extra `swift test` arguments; all three
# share one scratch directory, as in CI.
PACKAGES = [
    (MACOS, []),
    (MACOS / "App", ["--scratch-path", "../.build"]),
    (MACOS / "PreviewApps", ["--scratch-path", "../.build"]),
]
RUN_LIMIT_SECONDS = 1800


def median(values):
    ordered = sorted(values)
    middle = len(ordered) // 2
    return ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2


def parse_skip_list(text):
    """One test id per line; blank lines and text after # are ignored."""
    return {line.split("#", 1)[0].strip() for line in text.splitlines()} - {""}


def samples_from_events(lines, prefix):
    """Every test function's duration, in ms, from a v0 event stream.

    A parameterized test counts once, from its start to its end; a test
    that was skipped or never ended is left out.
    """
    locations, started, samples = {}, {}, []
    for line in lines:
        try:
            record = json.loads(line)
        except ValueError:
            continue
        payload = record.get("payload", {})
        if record.get("kind") == "test" and payload.get("kind") == "function":
            source = payload.get("sourceLocation", {})
            locations[payload["id"]] = (f"{prefix}/{source.get('fileID', '')}", source.get("line"))
        elif record.get("kind") == "event":
            test, instant = payload.get("testID"), payload.get("instant", {}).get("absolute")
            if test not in locations or instant is None:
                continue
            if payload.get("kind") == "testStarted":
                started[test] = instant
            elif payload.get("kind") == "testEnded" and test in started:
                file, line_number = locations[test]
                samples.append({"id": test, "file": file, "line": line_number,
                                "durationMs": (instant - started.pop(test)) * 1000})
    return samples


def rank(project, runs, skip, generated_at):
    by_id = {}
    for run in runs:
        for sample in run:
            entry = by_id.setdefault(sample["id"], {"sample": sample, "durations": []})
            entry["durations"].append(sample["durationMs"])
    tests = []
    for test_id, entry in by_id.items():
        sample = entry["sample"]
        location = sample["file"] if sample["line"] is None else f"{sample['file']}:{sample['line']}"
        tests.append({"id": test_id, "location": location,
                      "medianMs": round(median(entry["durations"]), 1),
                      "runsMs": [round(value, 1) for value in entry["durations"]],
                      "skipped": test_id in skip})
    tests.sort(key=lambda test: (-test["medianMs"], test["id"]))
    for index, test in enumerate(tests):
        test["rank"] = index + 1
    return {"project": project, "runs": len(runs), "generatedAt": generated_at, "tests": tests}


def markdown(report, limit=50):
    def escape(text):
        return text.replace("|", "\\|").replace("\n", " ")

    top = report["tests"][:limit]
    rows = [f"| {t['rank']} | {t['medianMs']:g} | {' / '.join(f'{v:g}' for v in t['runsMs'])} | "
            f"`{escape(t['location'])}` | {escape(t['id'])}{' (skipped)' if t['skipped'] else ''} |" for t in top]
    return "\n".join([
        f"## {report['project']}: slowest tests", "",
        f"{len(report['tests'])} tests, median of {report['runs']} runs, {report['generatedAt']}. "
        f"Top {len(top)}; the full ranking is in `slow-tests-report.json`.", "",
        "| # | Median ms | Runs ms | Location | Test |",
        "| --- | --- | --- | --- | --- |",
        *rows, ""])


def measure_once(scratch, run):
    samples = []
    for directory, extra in PACKAGES:
        events = Path(scratch) / f"{directory.name}-{run}.jsonl"
        command = ["swift", "test", "-Xswiftc", "-O", *extra,
                   "--event-stream-output-path", str(events), "--event-stream-version", "0"]
        print(f"run {run}: {directory.relative_to(AUDELIN.parent)}", file=sys.stderr, flush=True)
        try:
            subprocess.run(command, cwd=directory, stdout=subprocess.DEVNULL, timeout=RUN_LIMIT_SECONDS, check=False)
        except subprocess.TimeoutExpired:
            print(f"run {run}: {directory.name} passed {RUN_LIMIT_SECONDS}s; ranking what ended", file=sys.stderr)
        if events.exists():
            prefix = str(directory.relative_to(AUDELIN.parent) / "Tests")
            samples += samples_from_events(events.read_text().splitlines(), prefix)
    return samples


def main():
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    skip_file = Path(__file__).with_name("slow-tests.skip")
    skip = parse_skip_list(skip_file.read_text() if skip_file.exists() else "")
    with tempfile.TemporaryDirectory() as scratch:
        samples = [measure_once(scratch, run) for run in range(1, runs + 1)]
    report = rank("audelin", samples, skip, datetime.now(timezone.utc).isoformat(timespec="seconds"))
    Path("slow-tests-report.json").write_text(json.dumps(report, indent=2) + "\n")
    Path("slow-tests-report.md").write_text(markdown(report))
    print(f"ranked {len(report['tests'])} tests", file=sys.stderr)
    return 0 if report["tests"] else 1


if __name__ == "__main__":
    sys.exit(main())
