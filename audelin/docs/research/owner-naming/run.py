#!/usr/bin/env python3
"""Rebuild Audelin's notes request for a saved call and run it through the Claude CLI
in four variants that differ only in the owner's label and the template:

  me       transcript as Audelin writes it (`Me`), the owner's Default template
  name     `Me` replaced by the owner's name, same template
  told     as `name`, plus one template line saying who recorded the call
  builtin  `Me`, with the shipped built-in Default template instead of the owner's copy

The request is built the way NotesGeneration.Generator.request and the composer's
SummaryGeneration build it: faithfulness text, template instructions, heading sets,
accepted evidence (empty here, the same for every variant) and `[seconds] label: text`
lines. Entries come from the call's transcript.md, since finished calls keep no job file.

The CLI is called with the same arguments as SummaryRuntime.Runtime for `claudeCLI`.
Output goes to $TMPDIR/owner-naming/<call>/<variant>.md, never into the repo.

Usage: run.py [--only VARIANT ...] CALL_PREFIX ...   (e.g. 2026.11.18-1500)
"""
import argparse, concurrent.futures as cf, json, os, pathlib, re, subprocess, sys

REPO = pathlib.Path(__file__).resolve().parents[4]
CALLS = pathlib.Path.home() / "Recordings/Audelin"
OUT = pathlib.Path(os.environ.get("TMPDIR", "/tmp")) / "owner-naming"


def swift_string(path, name):
    """Return the body of a Swift multi-line string literal `name = ... \"\"\"...\"\"\"`."""
    text = path.read_text()
    start = text.index('"""', text.index(name)) + 3
    body = text[start:text.index('"""', start)].strip("\n")
    lines = body.split("\n")
    indent = min(len(l) - len(l.lstrip()) for l in lines if l.strip())
    return "\n".join(l[indent:] for l in lines)


FAITHFULNESS = swift_string(REPO / "audelin/macos/Sources/NotesGeneration/NotesGeneration.swift", "faithfulness =")
BUILTIN = swift_string(REPO / "audelin/macos/Sources/TemplateFiles/Default.swift", "builtInDefault")
HEADINGS = [
    [("What this was about", True), ("Key points", True), ("Decisions", True), ("Actions", True), ("Open questions", False)],
    [("О чём встреча", True), ("Ключевые моменты", True), ("Решения", True), ("Задачи", True), ("Открытые вопросы", False)],
]


def owner_template():
    text = (pathlib.Path.home() / ".audelin/Templates/Default.md").read_text()
    _, front, body = text.split("---\n", 2)
    headings = [[(h["name"], h["required"]) for h in variant] for variant in json.loads(front)["headings"]]
    return body.strip("\n"), headings


def owner_name():
    prefs = json.loads((pathlib.Path.home() / ".audelin/preferences.json").read_text())
    if prefs.get("zoomName"):
        return prefs["zoomName"]
    return subprocess.run(["id", "-F"], capture_output=True, text=True).stdout.strip()


def entries(call_dir):
    rows, label, time = [], None, None
    for line in (call_dir / "transcript.md").read_text().splitlines():
        m = re.match(r"^\*\*(.+?)\*\* (\d\d):(\d\d):(\d\d)$", line)
        if m:
            label, time = m[1], int(m[2]) * 3600 + int(m[3]) * 60 + int(m[4])
        elif label and line.strip():
            rows.append((time, label, line.strip()))
            label = None
    return rows


def request(rows, instructions, headings):
    sets = "\nOR, in the transcript's language:\n".join(
        "\n".join("## " + n + (" (required)" if r else " (optional)") for n, r in v) for v in headings)
    transcript = "\n".join(f"[{t}] {l}: {x}" for t, l, x in rows)
    return (FAITHFULNESS + "\nTEMPLATE INSTRUCTIONS:\n" + instructions
            + "\nUse one complete heading set, in this order, without mixing sets:\n" + sets
            + "\nEvery present section must be nonempty. Return Markdown only, starting with the first heading, without a preamble or enclosing code fence."
            + "\nACCEPTED EVIDENCE:\n" + "" + "\nTRANSCRIPT DATA:\n" + transcript)


def variants(rows, name):
    instructions, headings = owner_template()
    named = [(t, name if l == "Me" else l, x) for t, l, x in rows]
    told = instructions + (f'\nThe owner, {name}, recorded this call; lines labelled "{name}" are theirs, '
                           f'and every other label is someone else.')
    return {
        "me": request(rows, instructions, headings),
        "name": request(named, instructions, headings),
        "told": request(named, told, headings),
        "builtin": request(rows, BUILTIN, HEADINGS),
    }


def claude(prompt):
    args = ["claude", "-p", "--safe-mode", "--restricted", "--tools", "", "--strict-mcp-config",
            "--mcp-config", '{"mcpServers":{}}', "--no-session-persistence", "--output-format", "json",
            "--model", "opus"]
    help_text = subprocess.run(["claude", "--help"], capture_output=True, text=True).stdout
    if "--max-output-tokens" in help_text.split():
        args += ["--max-output-tokens", "4096"]
    out = subprocess.run(args, input=prompt, capture_output=True, text=True, timeout=600)
    if out.returncode:
        raise RuntimeError(out.stderr[-500:] or out.stdout[-500:])
    return json.loads(out.stdout)["result"]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("calls", nargs="+")
    p.add_argument("--only", nargs="*")
    a = p.parse_args()
    name = owner_name()
    jobs = []
    for prefix in a.calls:
        call_dir = next(CALLS.glob(prefix + "*"))
        for variant, prompt in variants(entries(call_dir), name).items():
            if a.only and variant not in a.only:
                continue
            target = OUT / prefix / f"{variant}.md"
            target.parent.mkdir(parents=True, exist_ok=True)
            (target.parent / f"{variant}.prompt.txt").write_text(prompt)
            jobs.append((target, prompt))
    with cf.ThreadPoolExecutor(4) as pool:
        futures = {pool.submit(claude, prompt): target for target, prompt in jobs}
        for f in cf.as_completed(futures):
            target = futures[f]
            try:
                target.write_text(f.result())
                print("ok", target)
            except Exception as e:
                print("FAILED", target, e, file=sys.stderr)


if __name__ == "__main__":
    main()
