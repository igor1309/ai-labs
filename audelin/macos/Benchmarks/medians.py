#!/usr/bin/env python3
"""medians.py COMPARE_OUTPUT: median instructions per word or tick, base and this code, from `--format markdown`."""
import re, sys
if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
    print(__doc__)
    sys.exit(0)

UNITS = {"K": 1e3, "M": 1e6, "G": 1e9}
case, unit, rows = None, None, {}
baseline = "Current_run"
with open(sys.argv[1], errors="replace") as source:
    for line in source:
        if m := re.match(r"## Baseline '(base|Current_run)'", line):
            baseline = m[1]
            case, unit = None, None
        elif line.startswith("### "):
            m = re.match(r"### One (word|tick) with (\d+) lines", line)
            case, unit = (m[1], int(m[2])) if m else None, None
        elif not line.startswith("|"):
            continue
        elif m := re.match(r"\|\s*Instructions(?: \((\w)\))?", line):
            unit = UNITS.get(m[1], 1)
            cells = [cell.strip() for cell in line.strip("|\n ").split("|")]
            if case and cells[1] != "p0":
                rows.setdefault(case, {})[baseline] = float(cells[3]) * unit
        elif re.match(r"\|\s*\S.*\|\s*p0\b", line):
            unit = None
        elif case and unit and (m := re.match(r"\|\s*(base|Current_run)\s*\|", line)):
            p50 = line.strip("|\n ").split("|")[3]
            rows.setdefault(case, {})[m[1]] = float(p50) * unit

print("| sample | lines | base | this code | change |\n|---|---|---|---|---|")
for (sample, count), row in sorted(rows.items()):
    if "Current_run" not in row:
        continue
    now = row["Current_run"]
    if "base" in row:
        base = row["base"]
        print(f"| {sample} | {count:,} | {base / 1e6:.1f} M | {now / 1e6:.1f} M | {100 * (now - base) / base:+.0f}% |")
    else:
        print(f"| {sample} | {count:,} | — | {now / 1e6:.1f} M | — |")
