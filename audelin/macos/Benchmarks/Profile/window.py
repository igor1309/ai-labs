#!/usr/bin/env python3
"""window.py PROFILE.xml SIGNPOSTS.xml OUT.json WORDS: keeps samples inside the 'words' signposts."""
import bisect, importlib.util, json, pathlib, sys
from collections import Counter
spec = importlib.util.spec_from_file_location("st", pathlib.Path(__file__).resolve().parents[2] / "scripts/summarize-trace.py")
st = importlib.util.module_from_spec(spec); spec.loader.exec_module(st)
prof, sign, out, words = sys.argv[1:5]
win = []
for c, _ in st.rows(sign, named=True):
    if c["name"].text == "words" and c["duration"].tag != "sentinel":
        s = int(c["start"].text); win.append((s, s + int(c["duration"].text)))
win.sort(); assert win, "no windows"
print("windows", len(win), "total ms", sum(b - a for a, b in win) / 1e6)
stacks = Counter(); total = 0; outside = 0
starts = [w[0] for w in win]
for cols, lookup in st.rows(prof):
    t = {c.tag: c for c in cols}
    bt = t.get("backtrace")
    if bt is None: continue
    when = int(t["sample-time"].text)
    i = bisect.bisect_right(starts, when) - 1
    weight = int(t["weight"].text or 0) if "weight" in t else 1_000_000
    if i < 0 or when > win[i][1]:
        outside += weight; continue
    fr = st.frames(bt, lookup)
    if not fr: continue
    total += weight
    stacks[json.dumps([n for n, _ in fr])] += weight
print("inside ms", total / 1e6, "outside ms", outside / 1e6)
json.dump({"windows": len(win), "words": int(words), "total_ns": total, "stacks": stacks}, open(out, "w"))
