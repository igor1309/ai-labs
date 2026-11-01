#!/usr/bin/env python3
"""Summarizes an xctrace Time Profiler export as plain text.

    python3 -I scripts/summarize-trace.py PROFILE.xml HANGS.xml BINARY [TOP] [--signposts INTERVALS.xml] [--json SUMMARY.json]
    python3 -I scripts/summarize-trace.py --compare OLD/summary.json NEW/summary.json

PROFILE.xml is the time-profile table and HANGS.xml the potential-hangs
table, both from `xctrace export`. BINARY names the profiled executable:
inclusive time is counted for its own frames only, so the list shows
which of the app's functions the time is spent under.
"""

import argparse
import json
import xml.etree.ElementTree as ET
from collections import Counter


def rows(path, named=False):
    """Yields each row's columns, with id/ref sharing resolved, and the
    lookup that resolves a nested element."""
    seen = {}
    names = []

    def lookup(element):
        return seen.get(element.get("ref"), element) if element is not None else None

    def resolve(element):
        ref = element.get("ref")
        if ref is not None:
            return seen[ref]
        value = element
        if element.get("id") is not None:
            seen[element.get("id")] = value
        for child in element:
            resolve(child)
        return value

    with open(path, "rb") as source:
        for _, element in ET.iterparse(source, events=("end",)):
            if element.tag == "schema":
                names = [column.findtext("mnemonic") for column in element.findall("col")]
            elif element.tag == "row":
                columns = [resolve(column) for column in element]
                yield (dict(zip(names, columns)) if named else columns), lookup
                # Shared elements stay reachable through `seen`.
                element.clear()


def frames(backtrace, lookup):
    """The backtrace's frames, leaf first, as (name, binary)."""
    result = []
    for frame in map(lookup, backtrace.findall("frame")):
        binary = lookup(frame.find("binary"))
        name = frame.get("name") or frame.get("addr") or "?"
        result.append((name, binary.get("name", "?") if binary is not None else "?"))
    return result


def glue(name, binary):
    """Compiler thunks and the entry point, which sit above everything."""
    return "thunk for" in name or name.startswith("partial apply") or name == f"{binary}_main"


def summarize(profile, hangs, binary, signposts=None):

    own, inclusive = Counter(), Counter()
    total = main_thread = 0
    for columns, lookup in rows(profile):
        by_tag = {column.tag: column for column in columns}
        weight = int(by_tag["weight"].text or 0) if "weight" in by_tag else 1_000_000
        backtrace = by_tag.get("backtrace")
        if backtrace is None:
            continue
        stack = frames(backtrace, lookup)
        if not stack:
            continue
        total += weight
        if by_tag["thread"].get("fmt", "").startswith("Main Thread"):
            main_thread += weight
        own[stack[0][0]] += weight
        for name in {name for name, frame_binary in stack if frame_binary == binary and not glue(name, binary)}:
            inclusive[name] += weight

    long = []
    for columns, _ in rows(hangs):
        by_tag = {column.tag: column for column in columns}
        duration = int(by_tag["duration"].text or 0)
        long.append((duration, by_tag["start-time"].get("fmt", "?"), by_tag["hang-type"].get("fmt", "?") if "hang-type" in by_tag else "?"))
    intervals = {}
    if signposts:
        for columns, _ in rows(signposts, named=True):
            if columns["subsystem"].text != "dev.igor1309.audelin" or columns["class"].text != "Interval":
                continue
            # Boundary-clipped regions still have a duration, but lack an endpoint.
            if any(columns[key].tag == "sentinel" for key in
                   ("process", "end-process", "start-thread", "end-thread")):
                continue
            name = columns["name"].text
            duration = columns["duration"]
            value = int(duration.text)
            interval = intervals.setdefault(name, {"count": 0, "total_ns": 0, "longest_ns": 0})
            interval["count"] += 1
            interval["total_ns"] += value
            interval["longest_ns"] = max(interval["longest_ns"], value)
    return {
        "binary": binary, "sampled_cpu_ns": total, "main_thread_ns": main_thread,
        "self_ns": dict(own), "inclusive_ns": dict(inclusive),
        "hangs": {"count": len(long), "total_ns": sum(item[0] for item in long),
                  "longest_ns": max((item[0] for item in long), default=0)},
        "hang_details": sorted(long, reverse=True), "intervals": intervals,
    }


def share(summary):
    return 100 * summary["main_thread_ns"] / max(summary["sampled_cpu_ns"], 1)


def report(summary, top):
    total = summary["sampled_cpu_ns"]
    print(f"samples: {total / 1e6:.0f} ms of sampled CPU; main thread: {share(summary):.1f}% of sampled CPU")
    for key, title in [("self_ns", "heaviest frames by self time"),
                       ("inclusive_ns", f"heaviest {summary['binary']} frames including callees")]:
        print(f"\n{title} (top {top}):")
        for name, value in Counter(summary[key]).most_common(top):
            print(f"{value / 1e6:10.1f} ms {100 * value / max(total, 1):5.1f}%  {name}")
    hangs = summary["hangs"]
    print(f"\nhangs: {hangs['count']}, total {hangs['total_ns'] / 1e6:.1f} ms, longest {hangs['longest_ns'] / 1e6:.1f} ms")
    for duration, start, kind in summary["hang_details"][:top]:
        print(f"{duration / 1e6:10.1f} ms  at {start}  {kind}")
    print("\nsignpost intervals (complete instances in the capture):")
    for name, interval in sorted(summary["intervals"].items()):
        print(f"{name}: count {interval['count']}, total {interval['total_ns'] / 1e6:.1f} ms, longest {interval['longest_ns'] / 1e6:.1f} ms")


def read_summary(path):
    with open(path, encoding="utf-8") as source:
        try:
            return json.load(source)
        except json.JSONDecodeError as error:
            raise ValueError(f"{path}: no JSON summary; regenerate with this summarizer") from error


def compare(old, new):
    print("growth (NEW - OLD):")
    for key, title in [("self_ns", "frames by self time"), ("inclusive_ns", "frames by inclusive time")]:
        print(f"\n{title}:")
        growth = {name: value - old[key].get(name, 0) for name, value in new[key].items()
                  if value > old[key].get(name, 0)}
        for name, delta in sorted(growth.items(), key=lambda item: (-item[1], item[0])):
            print(f"+{delta / 1e6:.1f} ms  {name}")
        if not growth:
            print("no growth")
    print(f"\nmain-thread share of sampled CPU: {share(old):.1f}% -> {share(new):.1f}% ({share(new) - share(old):+.1f} percentage points)")
    for key, title in [("hangs", "hangs")]:
        before, after = old[key], new[key]
        print(f"{title}: count {after['count'] - before['count']:+d}, total {(after['total_ns'] - before['total_ns']) / 1e6:+.1f} ms, longest {(after['longest_ns'] - before['longest_ns']) / 1e6:+.1f} ms")
    print("\nsignpost intervals:")
    empty = {"count": 0, "total_ns": 0, "longest_ns": 0}
    for name in sorted(old["intervals"].keys() | new["intervals"].keys()):
        before = old["intervals"].get(name, empty)
        after = new["intervals"].get(name, empty)
        print(f"{name}: count {after['count'] - before['count']:+d}, total {(after['total_ns'] - before['total_ns']) / 1e6:+.1f} ms, longest {(after['longest_ns'] - before['longest_ns']) / 1e6:+.1f} ms")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compare", nargs=2, metavar=("OLD", "NEW"))
    parser.add_argument("--signposts", help="region-of-interest table export")
    parser.add_argument("--json", help="write full-precision machine data to this file")
    parser.add_argument("profile", nargs="?")
    parser.add_argument("hangs", nargs="?")
    parser.add_argument("binary", nargs="?")
    parser.add_argument("top", nargs="?", type=int, default=20)
    args = parser.parse_args()
    if args.compare:
        compare(*(read_summary(path) for path in args.compare))
    else:
        if not all([args.profile, args.hangs, args.binary]):
            parser.error("PROFILE.xml HANGS.xml BINARY are required")
        summary = summarize(args.profile, args.hangs, args.binary, args.signposts)
        if args.json:
            with open(args.json, "w", encoding="utf-8") as destination:
                json.dump(summary, destination, ensure_ascii=False, sort_keys=True)
                destination.write("\n")
        report(summary, args.top)


if __name__ == "__main__":
    main()
