#!/usr/bin/env python3
"""Prove that tests guard their fixes: undo each fix, expect its tests to fail.

usage: scripts/revert-check.py [--rev <revision>] <spec>...

Run it from inside the repo to check (any directory of it).

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

The caller's working tree and index are never written. By default the script
snapshots the current working tree (tracked changes and untracked, non-ignored
files) into a commit object, using a temporary index; --rev checks the given
commit instead. It prints the full hash it checked at the start and in the
final line. That revision is checked out in a temporary detached git worktree
under the OS temp dir; mutations, restores and `go test` happen only there.
The worktree is removed on every exit the process can handle (normal, error,
SIGINT, SIGTERM, SIGHUP). SIGKILL can leave only that temporary directory;
every run starts with `git worktree prune`, and a leftover is harmless.
Go tests run with a 45s timeout and each subprocess with a 60s timeout.
"""

import os
import pathlib
import re
import shutil
import signal
import subprocess
import sys
import tempfile


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
    return module, mutations


def run_group(cmd, cwd, timeout):
    """Runs cmd in its own process group and returns its output. Whatever ends
    the wait (timeout, signal), the whole group is killed, test binary included."""
    proc = subprocess.Popen(
        cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, start_new_session=True,
    )
    try:
        out, _ = proc.communicate(timeout=timeout)
        return out
    except BaseException:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except OSError:
            pass
        proc.wait()
        raise


def git(root, *args, env=None, check=True):
    result = subprocess.run(
        ["git", *args], cwd=root, capture_output=True, text=True,
        env=env, check=False,
    )
    if check and result.returncode != 0:
        sys.exit(f"git {' '.join(args)}: {result.stderr.strip()}")
    return result.stdout.strip()


def snapshot(root):
    """A commit of the working tree, built without touching the real index."""
    scratch = tempfile.mkdtemp(prefix="revert-check-index-")
    try:
        env = dict(os.environ, GIT_INDEX_FILE=os.path.join(scratch, "index"))
        for key in ("AUTHOR", "COMMITTER"):
            env.setdefault(f"GIT_{key}_NAME", "revert-check")
            env.setdefault(f"GIT_{key}_EMAIL", "revert-check@localhost")
        git(root, "read-tree", "HEAD", env=env)
        git(root, "add", "-A", env=env)
        tree = git(root, "write-tree", env=env)
        return git(root, "commit-tree", tree, "-p", "HEAD", "-m", "revert-check snapshot", env=env)
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


def run_tests(module, tests):
    """Returns {test: 'pass' | 'fail' | 'missing'}, or None if the build failed."""
    outcome = {}
    by_package = {}
    for package, test in tests:
        by_package.setdefault(package, []).append(test)
    for package, names in by_package.items():
        pattern = "^(" + "|".join(re.escape(n) for n in names) + ")$"
        try:
            output = run_group(
                ["go", "test", "-count=1", "-timeout", "45s", "-v", "-run", pattern, package],
                module, 60,
            )
        except subprocess.TimeoutExpired:
            # A hung run is a failed run, never a pass; check() reports it.
            for name in names:
                outcome[name] = "timeout"
            continue
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
    hung = [t for t, o in baseline.items() if o == "timeout"]
    if hung:
        return f"{name}: timed out before mutating: {', '.join(hung)}"
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
    hung = [t for t, o in mutated.items() if o == "timeout"]
    if hung:
        return f"{name}: timed out with the fix undone, not a clean failure: {', '.join(hung)}"
    survivors = [t for t, o in mutated.items() if o != "fail"]
    if survivors:
        return f"{name}: still passing with the fix undone: {', '.join(survivors)}"
    return None


def stop(signum, frame):
    raise SystemExit(128 + signum)


def main():
    args = sys.argv[1:]
    rev = None
    if args[:1] == ["--rev"]:
        if len(args) < 2:
            sys.exit(__doc__)
        rev, args = args[1], args[2:]
    if not args:
        sys.exit(__doc__)
    root = git(".", "rev-parse", "--show-toplevel")
    specs = [(spec, *parse(pathlib.Path(spec))) for spec in args]
    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, stop)
    git(root, "worktree", "prune")
    if rev is None:
        revision = snapshot(root)
    else:
        revision = git(root, "rev-parse", "--verify", rev + "^{commit}")
    print(f"checking revision {revision}", flush=True)

    scratch = tempfile.mkdtemp(prefix="revert-check-")
    tree = os.path.join(scratch, "tree")
    problems, count = [], 0
    try:
        git(root, "worktree", "add", "--detach", tree, revision)
        for _, module, mutations in specs:
            for mutation in mutations:
                count += 1
                problem = check(pathlib.Path(tree) / module, mutation)
                print(("FAIL  " + problem) if problem else ("ok    " + mutation["name"]), flush=True)
                if problem:
                    problems.append(problem)
    finally:
        for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            signal.signal(sig, signal.SIG_IGN)
        git(root, "worktree", "remove", "--force", tree, check=False)
        shutil.rmtree(scratch, ignore_errors=True)
        git(root, "worktree", "prune", check=False)
    print(f"{count - len(problems)}/{count} mutations caught (revision {revision})")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
