#!/usr/bin/env python3
"""Whether the installed Codex's sandbox holds what codex.yaml grants.

usage: agister/scripts/codex-sandbox-contract.py

A version goes into a primitive's `verified` list in
agister/home/runtimes/codex.yaml only after this passes on it.

Runs `codex` three times, each in a scratch git repository of its own,
with the arguments Agister's adapter builds (codex-sandbox-contract.argv.json,
kept equal to codex.Arguments by a test): read-only, workspace-write, and the
workspace-write thread resumed read-only. Each turn is asked to run one
probe script as one command, so the sandbox, not the model, decides each
action. The outcome of every action is read from the command's own output
in Codex's JSON events, never from the model's reply.

First the probe runs outside the sandbox, where every action must
succeed: a refusal inside it then is the sandbox's, not the host's (no
network, say). Prints each mode's outcomes and exits 0 when all are as
expected, 1 when one is not (the sandbox no longer holds), and 3 when the
probe fails outside the sandbox or the model did not run it, which proves
nothing. Needs a logged-in `codex`; costs three
short turns.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))

# Each action, as the probe tries it: a name and a shell command. TOKEN is
# the run's own, so what a refused action would have written is known.
ACTIONS = [
    ("read file", "cat README"),
    ("git show", "git show --stat HEAD"),
    ("write in repository", "echo x > written"),
    ("write under /tmp", "echo x > /tmp/agister-contract-TOKEN"),
    ("write in home", "echo x > \"$HOME/.agister-contract-TOKEN\""),
    ("touch in .git", "touch .git/agister-contract"),
    ("git tag", "git tag agister-contract-TOKEN"),
    ("git commit", "git commit -q --allow-empty -m contract"),
    ("network", "curl -sS -m 5 -o /dev/null https://example.com"),
]

ALLOWED = {
    "read-only": {"read file", "git show"},
    "workspace-write": {"read file", "git show", "write in repository", "write under /tmp"},
    "resumed read-only": {"read file", "git show"},
}

PROMPT = ("Run this exact command once, as a single shell command, and nothing else: "
          "sh probe.sh\nThen reply with its output.")


def probe_script(token):
    lines = ["#!/bin/sh"]
    for name, command in ACTIONS:
        command = command.replace("TOKEN", token)
        lines.append(f"if ( {command} ) >/dev/null 2>&1; then echo '{name}=ok'; else echo '{name}=refused'; fi")
    return "\n".join(lines) + "\n"


def expected(mode):
    return {name: "ok" if name in ALLOWED[mode] else "refused" for name, _ in ACTIONS}


def read_events(stdout):
    """The thread ID and the probe's output, from Codex's JSONL events."""
    thread, output = None, None
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get("type") == "thread.started":
            thread = event.get("thread_id")
        item = event.get("item") or {}
        if (event.get("type") == "item.completed" and item.get("type") == "command_execution"
                and "probe.sh" in str(item.get("command"))):
            output = item.get("aggregated_output", "")
    return thread, output


def outcomes(output):
    found = {}
    for line in output.splitlines():
        name, sep, result = line.rpartition("=")
        if sep and result in ("ok", "refused"):
            found[name] = result
    return found


# The scratch repositories made, removed when the run ends.
made = []


def scratch_repository(token):
    root = tempfile.mkdtemp(prefix="agister-contract-")
    made.append(root)
    with open(os.path.join(root, "README"), "w") as f:
        f.write("scratch\n")
    with open(os.path.join(root, "probe.sh"), "w") as f:
        f.write(probe_script(token))
    for args in (["init", "-q"], ["config", "user.name", "contract"], ["config", "user.email", "contract@example.com"],
                 ["add", "."], ["commit", "-q", "-m", "scratch"]):
        subprocess.run(["git", *args], cwd=root, check=True)
    return root


def run_codex(argv, cwd):
    done = subprocess.run(["codex", *argv], cwd=cwd, input=PROMPT, capture_output=True, text=True, timeout=300)
    return read_events(done.stdout)


def clean_up(token):
    for path in (f"/tmp/agister-contract-{token}", os.path.expanduser(f"~/.agister-contract-{token}")):
        if os.path.exists(path):
            os.remove(path)


def main():
    with open(os.path.join(HERE, "codex-sandbox-contract.argv.json")) as f:
        argv = json.load(f)
    version = subprocess.run(["codex", "--version"], capture_output=True, text=True).stdout.strip()
    print(version)
    token = uuid.uuid4().hex[:12]
    control = scratch_repository(token)
    try:
        done = subprocess.run(["sh", "probe.sh"], cwd=control, capture_output=True, text=True, timeout=60)
    finally:
        clean_up(token)
    unsandboxed = outcomes(done.stdout)
    if unsandboxed != {name: "ok" for name, _ in ACTIONS}:
        print(f"outside the sandbox the probe gets {unsandboxed}, not every action ok; nothing is proved")
        return 3
    failed, thread, repo = False, None, None
    for mode in ("read-only", "workspace-write", "resumed read-only"):
        token = uuid.uuid4().hex[:12]
        if mode == "resumed read-only":
            with open(os.path.join(repo, "probe.sh"), "w") as f:
                f.write(probe_script(token))
            args = [thread if a == "THREAD_ID" else a for a in argv[mode]]
        else:
            repo = scratch_repository(token)
            args = argv[mode]
        try:
            started, output = run_codex(args, repo)
        finally:
            clean_up(token)
        if mode == "workspace-write":
            thread = started
        if output is None:
            print(f"{mode}: the model did not run the probe; nothing is proved")
            return 3
        got, want = outcomes(output), expected(mode)
        for name, _ in ACTIONS:
            mark = "  " if got.get(name) == want[name] else "!!"
            print(f"{mark} {mode}: {name}: {got.get(name, 'missing')} (want {want[name]})")
        failed = failed or got != want
        if mode == "workspace-write" and not thread:
            print("workspace-write: Codex reported no thread to resume")
            return 1
    print("FAIL: the sandbox does not hold what codex.yaml grants" if failed else f"PASS: {version}")
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        code = main()
    finally:
        for root in made:
            shutil.rmtree(root, ignore_errors=True)
    sys.exit(code)
