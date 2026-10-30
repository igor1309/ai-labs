#!/usr/bin/env python3
"""medians.py COMPARE_OUTPUT: median instructions per word, base and this code, from `--format markdown`."""
import re, sys

UNITS = {"K": 1e3, "M": 1e6, "G": 1e9}
lines, unit, rows = None, None, {}
for line in open(sys.argv[1], errors="replace"):
    if m := re.match(r"### One word with (\d+) lines", line):
        lines, unit = int(m[1]), None
    elif not line.startswith("|"):
        continue
    elif m := re.match(r"\|\s*Instructions(?: \((\w)\))?", line):
        unit = UNITS.get(m[1], 1)
    elif re.match(r"\|\s*\S.*\|\s*p0\b", line):
        unit = None
    elif unit and (m := re.match(r"\|\s*(base|Current_run)\s*\|", line)):
        p50 = line.strip("|\n ").split("|")[3]
        rows.setdefault(lines, {})[m[1]] = float(p50) * unit

print("| lines | base | this code | change |\n|---|---|---|---|")
for count, row in sorted(rows.items()):
    base, now = row["base"], row["Current_run"]
    print(f"| {count:,} | {base / 1e6:.1f} M | {now / 1e6:.1f} M | {100 * (now - base) / base:+.0f}% |")
