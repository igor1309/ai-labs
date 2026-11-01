#!/usr/bin/env python3
"""Resolve merge conflicts in a log by keeping both sides: theirs, then ours.

Use it on mizan-ble/docs/log.md only; a manifest or a README row is written
fresh from what the branch has, never unioned.
"""
import re
import sys

for path in sys.argv[1:]:
    text = open(path).read()
    text = re.sub(
        r"<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n",
        lambda m: m.group(2) + m.group(1),
        text,
        flags=re.S,
    )
    open(path, "w").write(text)
