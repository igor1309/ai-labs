#!/usr/bin/env python3
"""transcript-split.py SMALL LARGE: the transcript's CPU per word by part, and its growth, for two runs."""
import json, re, sys
from collections import Counter

TRANSCRIPT = re.compile(r"TranscriptFile|WritingTranscript|TranscriptWriting|SessionTranscriptFile|Transcript\.")


def part(stack):
    if "segments(from" in stack: return "map state to segments"
    if "render" in stack:
        if re.search(r"joined|JoinedSequence|String\.\+|append", stack): return "render: join/concat"
        if "==" in stack: return "render: compare segments"
        if "Rendered" in stack: return "render: render changed"
        if "contains" in stack: return "render: hasWords scan"
        return "render: other"
    if re.search(r"Data|utf8|UTF8", stack): return "write: to bytes"
    if re.search(r"write|flush|fsync|rename|create|remove|UUID|URL|appendingPath|open|close", stack): return "write: file ops"
    return "other (state copy, queue, release)"


def split(tag):
    run = json.load(open(f"runs/{tag}/stacks.json"))
    parts = Counter()
    for stack, weight in run["stacks"].items():
        frames = json.loads(stack)
        if any(TRANSCRIPT.search(frame) for frame in frames):
            ms = weight / run["words"] / 1e6
            parts["all transcript"] += ms
            parts[part(" | ".join(frames))] += ms
    return parts


small, large = split(sys.argv[1]), split(sys.argv[2])
for name in sorted(large, key=lambda name: small[name] - large[name]):
    print(f"{name:36}{small[name]:7.3f}{large[name]:7.3f}{large[name] - small[name]:7.3f}")
