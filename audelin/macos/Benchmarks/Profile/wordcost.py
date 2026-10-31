#!/usr/bin/env python3
"""wordcost.py FILE LINES: percentiles of instructions per word, and which words are slow."""
import sys
rows = [tuple(map(int, line.split())) for line in open(sys.argv[1]) if line.strip()]
def p(values, q): return sorted(values)[int(q * (len(values) - 1))] / 1e6
def show(name, values):
    if values: print(f"  {name:22}{len(values):5}  p50 {p(values, .5):7.1f}  p90 {p(values, .9):7.1f}  max {p(values, 1):7.1f} M")
print(f"{sys.argv[2]} lines")
show("all", [r[0] for r in rows])
pairs = list(zip(rows, rows[1:]))
show("added a line", [b[0] for a, b in pairs if b[1] != a[1]])
show("sealed rows", [b[0] for a, b in pairs if b[2] != a[2]])
show("neither", [b[0] for a, b in pairs if b[1] == a[1] and b[2] == a[2]])
show("word after sealing", [c[0] for a, b, c in zip(rows, rows[1:], rows[2:]) if b[2] != a[2]])
