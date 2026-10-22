#!/usr/bin/env python3
"""Checks the package against ADR-001's module rules (invariants 1-6).

Run from audelin/macos: python3 scripts/check-modules.py
Prints each broken rule and exits 1, or prints "modules hold" and exits 0.
"""
import json
import pathlib
import re
import subprocess
import sys

DOMAIN = {"CallDomain", "TranscriptCore"}
# `@attr internal import struct Module.Name`: attributes, an access level and
# an import kind may all come before the module.
IMPORT = re.compile(
    r"^\s*(?:@\w+\s+)*(?:(?:public|package|internal|fileprivate|private)\s+)?import\s+"
    r"(?:(?:struct|class|enum|protocol|typealias|func|var|let)\s+)?(\w+)",
    re.M)
APP = "Audelin"


def main():
    package = json.loads(subprocess.check_output(["swift", "package", "dump-package"]))
    broken = check(package, imports)
    for line in broken:
        print(line)
    print("modules hold" if not broken else f"{len(broken)} broken")
    return 1 if broken else 0


def check(package, imports):
    """The broken rules of `package`; `imports(target)` gives a target's imports."""
    targets = {t["name"]: t for t in package["targets"]}
    deps = {name: {next(iter(d.values()))[0] for d in t["dependencies"]} for name, t in targets.items()}
    tests = {name for name, t in targets.items() if t["type"] == "test"}
    # Helpers only tests reach: a double, a process a test kills.
    support = support_targets(targets, deps, tests)
    production = set(targets) - tests - support - {APP}
    cores = {n for n in production if n.endswith("Core") and n not in DOMAIN}
    uis = {n for n in production if n.endswith("UI")}
    adapters = production - DOMAIN - cores - uis

    broken = []
    for name in sorted(production):
        allowed = (
            set() if name in DOMAIN
            else DOMAIN if name in cores
            else DOMAIN | {name[:-2] + "Core"} if name in uis
            else DOMAIN | cores
        )
        for dep in sorted(deps[name] - allowed):
            rule = {True: "1 Domain depends on nothing of ours"}.get(name in DOMAIN) or (
                "2 a Core depends on Domain only" if name in cores
                else "2 a UI depends on its Core and Domain only" if name in uis
                else "3 an adapter depends on Domain and Cores only")
            broken.append(f"invariant {rule}: {name} depends on {dep}")
        if f"{name}Tests" not in tests:
            broken.append(f"invariant 5 every production target has a test target: {name} has no {name}Tests")
        if name in DOMAIN or name in cores:
            for module in sorted(imports(name) - {"Foundation"} - deps[name]):
                broken.append(f"invariant 6 Domain and Cores use Foundation only: {name} imports {module}")
    if APP in targets and f"{APP}Tests" not in tests:
        broken.append(f"invariant 5 every production target has a test target: {APP} has no {APP}Tests")
    for name in sorted(tests):
        subject = name[: -len("Tests")]
        allowed = {subject} | closure(subject, deps) | support
        for dep in sorted(deps[name] - allowed):
            broken.append(f"test rule: {name} depends on {dep}, outside its subject and the subject's dependencies")
    return broken


def support_targets(targets, deps, tests):
    """Targets only tests use, directly or through other helpers, and that
    no test target is named for."""
    support = set()
    while True:
        found = {
            name for name in targets
            if name not in tests | support | {APP}
            and f"{name}Tests" not in tests
            and (users := {n for n in targets if name in deps[n]})
            and users <= tests | support
        }
        if not found:
            return support
        support |= found


def closure(name, deps):
    seen, todo = set(), [name]
    while todo:
        for dep in deps.get(todo.pop(), ()):
            if dep not in seen:
                seen.add(dep)
                todo.append(dep)
    return seen


def imports(name, sources=pathlib.Path("Sources")):
    found = set()
    for source in (sources / name).rglob("*.swift"):
        found |= set(IMPORT.findall(source.read_text()))
    return found


if __name__ == "__main__":
    sys.exit(main())
