#!/usr/bin/env python3
"""Mechanical gate for a builder's hand-off.

usage: scripts/handoff-check.py [--base <rev>] [--claimed <path>...]

Run it from inside the repo to check. It reads the working tree and writes
nothing.

Changed files are everything that differs from base (default HEAD) in the
working tree: modified, added, deleted and untracked non-ignored files. With
--claimed, a file changed but not claimed, or claimed but not changed, is a
problem.

Prints one line per problem and a summary line. Exit status is 0 only when
every check passes.
"""

import os
import subprocess
import sys


def git(*args):
    result = subprocess.run(["git", *args], capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"git {' '.join(args)}: {result.stderr.strip()}")
    return result.stdout


def parse_args(argv):
    base, claimed, target = "HEAD", None, None
    for arg in argv:
        if arg in ("--base", "--claimed"):
            target = arg
            if arg == "--claimed":
                claimed = claimed or []
        elif target == "--base":
            base, target = arg, None
        elif target == "--claimed":
            claimed.append(arg)
        else:
            sys.exit(__doc__)
    if target == "--base":
        sys.exit(__doc__)
    return base, claimed


def main():
    base, claimed = parse_args(sys.argv[1:])
    top = git("rev-parse", "--show-toplevel").strip()
    changed = set(git("-C", top, "diff", "--name-only", "--no-renames", "-z", base).split("\0"))
    changed |= set(git("-C", top, "ls-files", "--others", "--exclude-standard", "-z").split("\0"))
    changed.discard("")

    problems = []
    if claimed is not None:
        claims = {os.path.relpath(os.path.abspath(p), top) for p in claimed}
        problems += [f"changed but not claimed: {p}" for p in sorted(changed - claims)]
        problems += [f"claimed but not changed: {p}" for p in sorted(claims - changed)]

    for problem in problems:
        print("FAIL  " + problem)
    print(f"handoff-check: {len(problems)} problem(s), {len(changed)} changed file(s) vs {base}")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
