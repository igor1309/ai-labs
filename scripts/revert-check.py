#!/usr/bin/env python3
"""Prove that tests guard their fixes: undo each fix, expect its tests to fail.

usage: scripts/revert-check.py <spec>...

A spec lists mutations, each one undoing a fix:

    # comment
    module: agister                 (Go module dir, relative to the repo root)

    [name of the fix]
    file: internal/app/calls.go     (relative to the module)
    find: c.reapAbandoned(runCtx)   (must occur exactly once; \\n, \\t escapes)
    replace: _ = runCtx
    test: ./cmd/agister TestNextCallReapsWhatAKilledRunLeftBehind
    test: ...                       (every listed test must fail)

For each mutation the script checks that its tests pass on the code as it
is, applies the replacement, runs the tests, and restores the file whatever
happens. A mutation fails the check when a test still passes, when the code
no longer builds (the test proves nothing then), or when find does not
match exactly once. Exit status is 0 only if every mutation is caught.
"""

import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def parse(path):
    module, mutations, current = None, [], None
    for number, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[") and line.endswith("]"):
            current = {"name": line[1:-1], "tests": [], "where": f"{path}:{number}"}
            mutations.append(current)
            continue
        key, sep, value = line.partition(":")
        if not sep:
            sys.exit(f"{path}:{number}: expected 'key: value'")
        key, value = key.strip(), value.strip()
        if key == "module" and current is None:
            module = value
        elif current is None:
            sys.exit(f"{path}:{number}: {key} before any [mutation]")
        elif key in ("file", "find", "replace"):
            current[key] = value.replace("\\n", "\n").replace("\\t", "\t")
        elif key == "test":
            package, _, test = value.partition(" ")
            if not test:
                sys.exit(f"{path}:{number}: test needs '<package> <TestName>'")
            current["tests"].append((package, test.strip()))
        else:
            sys.exit(f"{path}:{number}: unknown key {key!r}")
    if module is None:
        sys.exit(f"{path}: no module")
    for mutation in mutations:
        missing = [k for k in ("file", "find", "replace") if k not in mutation]
        if missing or not mutation["tests"]:
            sys.exit(f"{mutation['where']}: needs file, find, replace and a test")
    return ROOT / module, mutations


def run_tests(module, tests):
    """Returns {test: 'pass' | 'fail' | 'missing'}, or None if the build failed."""
    outcome = {}
    by_package = {}
    for package, test in tests:
        by_package.setdefault(package, []).append(test)
    for package, names in by_package.items():
        pattern = "^(" + "|".join(re.escape(n) for n in names) + ")$"
        result = subprocess.run(
            ["go", "test", "-count=1", "-v", "-run", pattern, package],
            cwd=module, capture_output=True, text=True,
        )
        output = result.stdout + result.stderr
        if "[build failed]" in output or "[setup failed]" in output:
            return None
        for name in names:
            if re.search(rf"^--- FAIL: {re.escape(name)} ", output, re.M):
                outcome[name] = "fail"
            elif re.search(rf"^--- PASS: {re.escape(name)} ", output, re.M):
                outcome[name] = "pass"
            else:
                outcome[name] = "missing"
    return outcome


def check(module, mutation):
    name = mutation["name"]
    path = module / mutation["file"]
    original = path.read_text()
    if original.count(mutation["find"]) != 1:
        return f"{name}: find matches {original.count(mutation['find'])} times in {mutation['file']}, want 1"

    baseline = run_tests(module, mutation["tests"])
    if baseline is None:
        return f"{name}: does not build before mutating"
    failing = [t for t, o in baseline.items() if o != "pass"]
    if failing:
        return f"{name}: not passing before mutating: {', '.join(failing)}"

    try:
        path.write_text(original.replace(mutation["find"], mutation["replace"], 1))
        mutated = run_tests(module, mutation["tests"])
    finally:
        path.write_text(original)
    if mutated is None:
        return f"{name}: the mutation does not build, so it proves nothing"
    survivors = [t for t, o in mutated.items() if o != "fail"]
    if survivors:
        return f"{name}: still passing with the fix undone: {', '.join(survivors)}"
    return None


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    problems, count = [], 0
    for spec in sys.argv[1:]:
        module, mutations = parse(pathlib.Path(spec))
        for mutation in mutations:
            count += 1
            problem = check(module, mutation)
            print(("FAIL  " + problem) if problem else ("ok    " + mutation["name"]), flush=True)
            if problem:
                problems.append(problem)
    print(f"{count - len(problems)}/{count} mutations caught")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
