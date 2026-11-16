#!/usr/bin/env python3
"""Deterministic checks on Daily notes made from frozen calls (daily-notes QA S-1 to S-5).

Usage: daily-content-check.py <expect.json> <notes-dir> [--report <report.md>]

expect.json maps each call (transcript name without .md) to the rows it must show:
  {"call-1": {"owner_unclear": true, "fix_unclear": true, "no_blockers": false}, ...}
Notes are read from <notes-dir>/<call>.daily.<model>.md (the one file per call that
daily-content.sh wrote). Every failure names the call and the row. Exit 1 on any failure.
"""
import argparse
import glob
import json
import os
import re
import sys

HEADINGS = {
    "en": ["What to continue", "Who does what", "Blockers and planned fixes", "Planned meetings"],
    "ru": ["Что продолжить", "Кто что делает", "Блокеры и планируемые решения", "Запланированные встречи"],
}
BLOCKERS = {HEADINGS["en"][2], HEADINGS["ru"][2]}
AGREED = re.compile(r"\b(agreed|suggested)\b|согласован|предложен", re.I)
# The template asks for translated labels; Russian notes write them either way.
UNCLEAR = r"(?:\s+и\s+\w+)?\s+не\s?(?:ясе?н|понят|определ)"
OWNER_UNCLEAR = re.compile(r"owner unclear|(?:ответственн|владел|исполнител)\w*" + UNCLEAR, re.I)
FIX_UNCLEAR = re.compile(r"fix unclear|(?:решени|фикс)\w*" + UNCLEAR, re.I)
NOT_DISCUSSED = re.compile(r"not discussed|не\s+обсужда", re.I)
# A bullet or paragraph that is only "none"/"нет" stands in for a topic nobody raised.
BARE_NONE = re.compile(r"^\s*(?:[-*]\s*)?(?:none|нет|n/a)\s*\.?\s*$", re.I)


def sections(notes):
    """Level-two headings in order, each with its body lines."""
    out, current = [], None
    for line in notes.splitlines():
        if line.startswith("## "):
            current = (line[3:].strip(), [])
            out.append(current)
        elif current is not None:
            current[1].append(line)
    return out


def check(call, notes, expect):
    """Return a list of (row, message) failures for one call."""
    failures = []
    parts = sections(notes)
    names = [name for name, _ in parts]
    if names not in HEADINGS.values():
        failures.append(("S-1", f"headings are {names}, not the four Daily headings"))
    if not AGREED.search(notes):
        failures.append(("S-2", "no item is labelled agreed or suggested"))
    if expect.get("owner_unclear") and not OWNER_UNCLEAR.search(notes):
        failures.append(("S-3", "the call leaves an owner open but no \"owner unclear\""))
    if expect.get("fix_unclear") and not FIX_UNCLEAR.search(notes):
        failures.append(("S-4", "the call leaves a fix open but no \"fix unclear\""))
    if expect.get("no_blockers"):
        body = "\n".join(next((lines for name, lines in parts if name in BLOCKERS), []))
        if not NOT_DISCUSSED.search(body):
            failures.append(("S-5", "blockers are not marked \"not discussed\" on a call that raises none"))
    for name, lines in parts:
        if any(BARE_NONE.match(line) for line in lines):
            failures.append(("S-5", f"\"{name}\" says none/нет instead of \"not discussed\""))
    return failures


def notes_path(notes_dir, call):
    found = sorted(glob.glob(os.path.join(glob.escape(notes_dir), glob.escape(call) + ".daily.*.md")))
    return found[0] if found else None


def run(expect, notes_dir):
    """Return rows of (call, row, message); an empty message means the call passed."""
    results = []
    for call in sorted(expect):
        path = notes_path(notes_dir, call)
        if path is None:
            results.append((call, "S-1", "no notes were made"))
            continue
        with open(path, encoding="utf-8") as handle:
            failures = check(call, handle.read(), expect[call])
        results.extend((call, row, message) for row, message in failures)
        if not failures:
            results.append((call, "", ""))
    return results


def report(results):
    failed = [r for r in results if r[2]]
    calls = sorted({r[0] for r in results})
    lines = ["## Daily content check", "",
             f"{len(calls)} calls, {len(failed)} failures." if failed else f"{len(calls)} calls, all rows hold.", "",
             "| Call | Row | Result |", "|---|---|---|"]
    for call, row, message in results:
        lines.append(f"| {call} | {row or 'S-1–S-5'} | {message or 'holds'} |")
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("expect")
    parser.add_argument("notes_dir")
    parser.add_argument("--report")
    args = parser.parse_args(argv)
    with open(args.expect, encoding="utf-8") as handle:
        expect = json.load(handle)
    results = run(expect, args.notes_dir)
    text = report(results)
    if args.report:
        with open(args.report, "w", encoding="utf-8") as handle:
            handle.write(text)
    for call, row, message in results:
        if message:
            print(f"FAIL {call} {row}: {message}")
    print(text)
    return 1 if any(r[2] for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
