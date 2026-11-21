#!/usr/bin/env python3
"""percentiles.py DIR BASE TIP: instructions per word or tick across DIR/REF-ROUND.md, the lowest to highest run at each percentile."""
import glob, re, sys
if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
    print(__doc__)
    sys.exit(0)

UNITS = {"K": 1e3, "M": 1e6, "G": 1e9}
COLUMNS = {"p50": 3, "p90": 5, "p99": 6}


def read(path):
    case, unit, rows = None, None, {}
    with open(path, errors="replace") as source:
        for line in source:
            if line.startswith("### "):
                m = re.match(r"### One (word|tick) with (\d+) lines", line)
                case, unit = (m[1], int(m[2])) if m else None, None
            elif not line.startswith("|"):
                continue
            elif m := re.match(r"\|\s*Instructions(?: \((\w)\))?", line):
                unit = UNITS.get(m[1], 1)
                cells = [cell.strip() for cell in line.strip("|\n ").split("|")]
                if case and cells[1] != "p0":
                    rows[case] = {name: float(cells[at]) * unit for name, at in COLUMNS.items()}
            elif re.match(r"\|\s*\S.*\|\s*p0\b", line):
                unit = None
            elif case and unit and re.match(r"\|\s*Current_run\s*\|", line):
                cells = line.strip("|\n ").split("|")
                rows[case] = {name: float(cells[at]) * unit for name, at in COLUMNS.items()}
    return rows


def runs(ref):
    return [read(path) for path in sorted(glob.glob(f"{sys.argv[1]}/{ref}-*.md"))]


def spread(values):
    return f"{min(values) / 1e6:.1f}–{max(values) / 1e6:.1f} M"


base, tip = runs(sys.argv[2]), runs(sys.argv[3])
print(f"{len(base)} runs of base, {len(tip)} of tip. Each cell is the lowest to highest run.\n")
print("| sample | lines | percentile | base | tip | overlap |\n|---|---|---|---|---|---|")
for sample, count in sorted(tip[0]):
    for name in COLUMNS:
        low = [run[sample, count][name] for run in base]
        high = [run[sample, count][name] for run in tip]
        overlap = "yes" if min(low) <= max(high) and min(high) <= max(low) else "no"
        print(f"| {sample} | {count:,} | {name} | {spread(low)} | {spread(high)} | {overlap} |")
