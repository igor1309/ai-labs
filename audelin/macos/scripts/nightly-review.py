#!/usr/bin/env python3
"""The daily review's mechanical part: collect the nightly runs and their reports, one verdict.

    python3 -I scripts/nightly-review.py --work DIR [--since 2026-11-14T06:00:00Z] [--repo OWNER/NAME]

Lists Audelin Nightly runs on trunk, downloads the artifacts of the last LOOKBACK
completed runs into DIR/raw (kept between reviews), regenerates every report
oldest first with the current nightly-report.py against the runs before it, and
writes DIR/review.md for the runs started since --since (default: 30 hours ago).

Exit codes, worst first wins:
  5  blocked: no artifact from a completed run in the last 48 hours
  3  a new run failed, or its evidence is invalid
  2  a new run warns
  4  no new run since --since
  0  new runs, all valid, no warnings
"""

import argparse
import datetime
import json
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
WORKFLOW = "audelin-nightly.yml"
ARTIFACT = "audelin-nightly"
LOOKBACK = 30


def gh(*args):
    return subprocess.run(["gh", *args], capture_output=True, text=True, check=False)


def when(text):
    return datetime.datetime.fromisoformat(text.replace("Z", "+00:00"))


def runs(repo):
    result = gh("run", "list", "--repo", repo, "--workflow", WORKFLOW, "--branch", "trunk",
                "--limit", str(LOOKBACK + 10), "--json", "databaseId,status,conclusion,createdAt,headSha,url")
    if result.returncode:
        raise SystemExit(f"gh run list failed: {result.stderr.strip()}")
    return sorted(json.loads(result.stdout), key=lambda run: run["createdAt"])


def download(repo, run, raw):
    """The run's raw evidence in raw/ID, downloaded once; None when unavailable."""
    target = raw / str(run["databaseId"])
    if (target / "identity.json").exists():
        return target
    partial = raw / f".{run['databaseId']}.partial"
    shutil.rmtree(partial, ignore_errors=True)
    result = gh("run", "download", str(run["databaseId"]), "--repo", repo, "--name", ARTIFACT, "--dir", str(partial))
    if result.returncode or not (partial / "identity.json").exists():
        shutil.rmtree(partial, ignore_errors=True)
        return None
    partial.rename(target)
    return target


def regenerate(raw_run, reports):
    """A fresh report from raw evidence only; the uploaded report is never trusted."""
    target = reports / raw_run.name
    shutil.rmtree(target, ignore_errors=True)
    shutil.copytree(raw_run, target, ignore=shutil.ignore_patterns("report.*"))
    subprocess.run([sys.executable, "-I", str(SCRIPTS / "nightly-report.py"), str(target), "--history", str(reports)],
                   capture_output=True, text=True, check=False)
    path = target / "report.json"
    return json.loads(path.read_text()) if path.exists() else None


def review(repo, work, since, now):
    raw, reports = work / "raw", work / "reports"
    raw.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(reports, ignore_errors=True)
    reports.mkdir()
    listed = runs(repo)
    completed = [run for run in listed if run["status"] == "completed"][-LOOKBACK:]
    rows, code, fresh_artifact = [], 4, False
    for run in completed:
        directory = download(repo, run, raw)
        report = regenerate(directory, reports) if directory else None
        if directory and when(run["createdAt"]) >= now - datetime.timedelta(hours=48):
            fresh_artifact = True
        if when(run["createdAt"]) < since:
            continue
        warnings = (report or {}).get("comparison", {}).get("warnings", [])
        valid = bool(report and report.get("valid"))
        if run["conclusion"] != "success" or not valid:
            outcome = 3
        elif warnings:
            outcome = 2
        else:
            outcome = 0
        code = outcome if code == 4 else max(code, outcome) if outcome != 0 else code
        rows.append((run, directory, report, valid, warnings))
    running = [run for run in listed if run["status"] != "completed" and when(run["createdAt"]) >= since]
    if not fresh_artifact:
        code = 5
    lines = ["# Audelin nightly review", "", f"Since {since.isoformat()}; {len(completed)} completed runs considered for baselines.", "",
             "| run | started | commit | conclusion | artifact | evidence | warnings |", "|---|---|---|---|---|---|---|"]
    for run, directory, report, valid, warnings in rows:
        lines.append(f"| [{run['databaseId']}]({run['url']}) | {run['createdAt']} | `{run['headSha'][:10]}` | {run['conclusion']} | "
                     f"{'yes' if directory else 'unavailable'} | {'valid' if valid else 'INVALID'} | {len(warnings)} |")
    lines += [f"- still running: [{run['databaseId']}]({run['url']}), not reviewed" for run in running]
    if not rows:
        lines += ["", "No new measurement since the last review."]
    if not fresh_artifact:
        lines += ["", "BLOCKED: no artifact from a completed run in the last 48 hours."]
    for run, directory, _, _, _ in rows:
        text = (reports / directory.name / "report.md").read_text() if directory and (reports / directory.name / "report.md").exists() else ""
        lines += ["", f"## Run {run['databaseId']}", "", text or "No report: the artifact is unavailable or unreadable."]
    lines += ["", f"Verdict: exit {code}."]
    (work / "review.md").write_text("\n".join(lines) + "\n")
    return code


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--since", help="ISO time; runs started at or after it are new (default: 30 hours ago)")
    parser.add_argument("--repo", default="igor1309/ai-labs")
    parser.add_argument("--now", help=argparse.SUPPRESS)
    args = parser.parse_args()
    now = when(args.now) if args.now else datetime.datetime.now(datetime.timezone.utc)
    since = when(args.since) if args.since else now - datetime.timedelta(hours=30)
    args.work.mkdir(parents=True, exist_ok=True)
    code = review(args.repo, args.work, since, now)
    print((args.work / "review.md").read_text(), end="")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
