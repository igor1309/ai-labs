#!/usr/bin/env python3
"""Summarizes an xctrace Time Profiler export as plain text.

    python3 -I scripts/summarize-trace.py PROFILE.xml HANGS.xml BINARY [TOP]

PROFILE.xml is the time-profile table and HANGS.xml the potential-hangs
table, both from `xctrace export`. BINARY names the profiled executable:
inclusive time is counted for its own frames only, so the list shows
which of the app's functions the time is spent under.
"""

import sys
import xml.etree.ElementTree as ET
from collections import Counter


def rows(path):
    """Yields each row's columns, with id/ref sharing resolved, and the
    lookup that resolves a nested element."""
    seen = {}

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

    for _, element in ET.iterparse(path, events=("end",)):
        if element.tag == "row":
            yield [resolve(column) for column in element], lookup
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


def main():
    profile, hangs, binary = sys.argv[1:4]
    top = int(sys.argv[4]) if len(sys.argv) > 4 else 20

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

    def ms(value):
        return f"{value / 1e6:10.1f} ms {100 * value / max(total, 1):5.1f}%"

    print(f"samples: {total / 1e6:.0f} ms of CPU, {100 * main_thread / max(total, 1):.1f}% on the main thread")
    print(f"\nheaviest frames by self time (top {top}):")
    for name, value in own.most_common(top):
        print(f"{ms(value)}  {name[:140]}")
    print(f"\nheaviest {binary} frames including callees (top {top}):")
    for name, value in inclusive.most_common(top):
        print(f"{ms(value)}  {name[:140]}")

    long = []
    for columns, _ in rows(hangs):
        by_tag = {column.tag: column for column in columns}
        duration = int(by_tag["duration"].text or 0)
        long.append((duration, by_tag["start-time"].get("fmt", "?"), by_tag.get("hang-type").get("fmt", "?")))
    print(f"\nhangs: {len(long)}" + (f", longest {max(long)[0] / 1e6:.0f} ms" if long else ""))
    for duration, start, kind in sorted(long, reverse=True)[:top]:
        print(f"{duration / 1e6:10.0f} ms  at {start}  {kind}")


if __name__ == "__main__":
    main()
