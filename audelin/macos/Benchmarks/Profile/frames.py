#!/usr/bin/env python3
"""frames.py SMALL LARGE [COUNT]: CPU per word by frame (any depth), the frames that grow most between two runs."""
import json, sys
from collections import Counter


def frames(tag):
    run = json.load(open(f"runs/{tag}/stacks.json"))
    totals = Counter()
    for stack, weight in run["stacks"].items():
        for frame in set(json.loads(stack)):
            totals[frame] += weight / run["words"] / 1e6
    return totals


small, large = frames(sys.argv[1]), frames(sys.argv[2])
names = sorted(large, key=lambda name: small[name] - large[name])
for name in names[:int(sys.argv[3]) if len(sys.argv) > 3 else 30]:
    print(f"{small[name]:7.3f}{large[name]:7.3f}{large[name] - small[name]:7.3f}  {name[:90]}")
