#!/usr/bin/env python3
"""Mechanical gate for a builder's hand-off.

usage: scripts/handoff-check.py [--base <rev>] [--claimed <path>...] [--spec <spec>...]

Run it from inside the repo to check. It reads the working tree and writes
nothing.

Changed files are everything that differs from base (default HEAD) in the
working tree: modified, added, deleted and untracked non-ignored files. With
--claimed, a file changed but not claimed, or claimed but not changed, is a
problem. For each --spec, every mutation's find must occur exactly once in its
file in the working tree; a missing find means a mutation (or an edit the spec
no longer matches) is left in the tree.

Prints one line per problem and a summary line. Exit status is 0 only when
every check passes.
"""

import importlib.util
import os
import pathlib
import subprocess
import sys


def load_revert_check():
    path = pathlib.Path(__file__).resolve().parent / "revert-check.py"
    spec = importlib.util.spec_from_file_location("revert_check", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def git(*args):
    result = subprocess.run(["git", *args], capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"git {' '.join(args)}: {result.stderr.strip()}")
    return result.stdout


def parse_args(argv):
    base, claimed, specs, target = "HEAD", None, [], None
    for arg in argv:
        if arg in ("--base", "--claimed", "--spec"):
            target = arg
            if arg == "--claimed":
                claimed = claimed or []
        elif target == "--base":
            base, target = arg, None
        elif target == "--claimed":
            claimed.append(arg)
        elif target == "--spec":
            specs.append(arg)
        else:
            sys.exit(__doc__)
    if target == "--base":
        sys.exit(__doc__)
    return base, claimed, specs


def main():
    base, claimed, specs = parse_args(sys.argv[1:])
    top = git("rev-parse", "--show-toplevel").strip()
    changed = set(git("-C", top, "diff", "--name-only", "--no-renames", "-z", base).split("\0"))
    changed |= set(git("-C", top, "ls-files", "--others", "--exclude-standard", "-z").split("\0"))
    changed.discard("")

    problems = []
    if claimed is not None:
        claims = {os.path.relpath(os.path.abspath(p), top) for p in claimed}
        problems += [f"changed but not claimed: {p}" for p in sorted(changed - claims)]
        problems += [f"claimed but not changed: {p}" for p in sorted(claims - changed)]

    if specs:
        revert_check = load_revert_check()
        for spec in specs:
            module, mutations = revert_check.parse(pathlib.Path(spec))
            for mutation in mutations:
                path = pathlib.Path(top) / module / mutation["file"]
                where = f"{mutation['name']} ({module}/{mutation['file']})"
                try:
                    count = path.read_text().count(mutation["find"])
                except OSError as err:
                    problems.append(f"{where}: cannot read file: {err}")
                    continue
                if count != 1:
                    problems.append(f"{where}: find occurs {count} times in the working tree, want 1"
                                    " (a mutation may be left in the tree)")

    for problem in problems:
        print("FAIL  " + problem)
    print(f"handoff-check: {len(problems)} problem(s), {len(changed)} changed file(s) vs {base}"
          + (f", {len(specs)} spec(s)" if specs else ""))
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
