#!/usr/bin/env python3
"""percentiles.py DIR BASE TIP: instructions per word across DIR/REF-ROUND.md, the lowest to highest run at each percentile."""
import glob, re, sys
if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
    print(__doc__)
    sys.exit(0)

UNITS = {"K": 1e3, "M": 1e6, "G": 1e9}
COLUMNS = {"p50": 3, "p90": 5, "p99": 6}


def read(path):
    lines, unit, rows = None, None, {}
    for line in open(path, errors="replace"):
        if m := re.match(r"### One word with (\d+) lines", line):
            lines, unit = int(m[1]), None
        elif not line.startswith("|"):
            continue
        elif m := re.match(r"\|\s*Instructions(?: \((\w)\))?", line):
            unit = UNITS.get(m[1], 1)
        elif re.match(r"\|\s*\S.*\|\s*p0\b", line):
            unit = None
        elif unit and re.match(r"\|\s*Current_run\s*\|", line):
            cells = line.strip("|\n ").split("|")
            rows[lines] = {name: float(cells[at]) * unit for name, at in COLUMNS.items()}
    return rows


def runs(ref):
    return [read(path) for path in sorted(glob.glob(f"{sys.argv[1]}/{ref}-*.md"))]


def spread(values):
    return f"{min(values) / 1e6:.1f}–{max(values) / 1e6:.1f} M"


base, tip = runs(sys.argv[2]), runs(sys.argv[3])
print(f"{len(base)} runs of base, {len(tip)} of tip. Each cell is the lowest to highest run.\n")
print("| lines | percentile | base | tip | overlap |\n|---|---|---|---|---|")
for count in sorted(tip[0]):
    for name in COLUMNS:
        low = [run[count][name] for run in base]
        high = [run[count][name] for run in tip]
        overlap = "yes" if min(low) <= max(high) and min(high) <= max(low) else "no"
        print(f"| {count:,} | {name} | {spread(low)} | {spread(high)} | {overlap} |")
