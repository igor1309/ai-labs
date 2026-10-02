#!/usr/bin/env python3
"""Read a Claude Code session transcript, however long, as plain text.

usage: scripts/claude-session.py <session> [options]

<session> is a .jsonl path, a session id, or a session title (its custom or
AI title, e.g. verger-orchestration-status). Ids and titles are looked up in
~/.claude/projects (or $CLAUDE_PROJECTS_DIR); a title used by several
sessions picks the largest. A session that was continued in another one
(a continued-in entry) is followed to the end.

options:
  --owner            only what the owner typed (prompts, queued messages)
  --summaries        only compaction summaries and away recaps
  --since <ts>       entries at or after an ISO timestamp prefix
  --until <ts>       entries before an ISO timestamp prefix
  --grep <regex>     only printed entries matching the regex (case-insensitive)
  --last <n>         only the last n printed entries
  --width <n>        cut tool results and long texts to n chars (default 400;
                     0 prints them whole)
  --stats            counts per entry type, then exit
  --subagents        list the session's subagents (type, description), then exit

The file is streamed line by line, so a session of hundreds of megabytes
reads in constant memory.

macOS Finder drops .DS_Store files into the session's directories at any
time. They are skipped by name, as verger's dev/lib-scratch.sh does; any
other file a listing does not expect is named on stderr and the exit
status is 1, so a real stray file is never hidden.
"""

import collections
import json
import os
import re
import sys

FINDER_FILE = ".DS_Store"
NOISE = re.compile(
    r"^<(local-command-caveat|command-name|command-message|command-args|"
    r"local-command-stdout|system-reminder)>"
)


def projects_dir():
    return os.environ.get(
        "CLAUDE_PROJECTS_DIR", os.path.expanduser("~/.claude/projects")
    )


def session_files(root):
    """Every top-level session file under root, skipping Finder's files."""
    for project in sorted(os.listdir(root)):
        path = os.path.join(root, project)
        if project == FINDER_FILE or not os.path.isdir(path):
            continue
        for name in sorted(os.listdir(path)):
            if name.endswith(".jsonl"):
                yield os.path.join(path, name)


def titles(path):
    found = set()
    pattern = re.compile(rb'"(?:customTitle|aiTitle)":"((?:[^"\\]|\\.)*)"')
    with open(path, "rb") as f:
        for line in f:
            if b'"custom-title"' in line or b'"ai-title"' in line:
                for m in pattern.finditer(line):
                    found.add(json.loads(b'"' + m.group(1) + b'"'))
    return found


def resolve(arg):
    if os.path.isfile(arg):
        return arg
    root = projects_dir()
    matches = []
    for path in session_files(root):
        if os.path.basename(path) == arg + ".jsonl":
            return path
        if arg in titles(path):
            matches.append(path)
    if not matches:
        sys.exit(f"claude-session: no session with id or title {arg!r} in {root}")
    return max(matches, key=os.path.getsize)


def chain(path):
    """path, then each session it was continued in."""
    seen = set()
    while path and path not in seen:
        seen.add(path)
        yield path
        nxt = None
        with open(path, "rb") as f:
            for line in f:
                if b'"continued-in"' in line:
                    nxt = json.loads(line).get("continuedInSessionId")
        path = os.path.join(os.path.dirname(path), nxt + ".jsonl") if nxt else None
        if path and not os.path.isfile(path):
            print(f"claude-session: continued in {nxt}, not found", file=sys.stderr)
            path = None


def entries(paths):
    for path in paths:
        with open(path, "rb") as f:
            for number, line in enumerate(f, 1):
                try:
                    yield json.loads(line)
                except ValueError:
                    print(
                        f"claude-session: {os.path.basename(path)}:{number}: not JSON",
                        file=sys.stderr,
                    )


def cut(text, width):
    text = text.strip()
    if width and len(text) > width:
        return text[:width] + f" … [{len(text) - width} more chars]"
    return text


def tool_call(block):
    args = block.get("input") or {}
    for key in ("description", "command", "file_path", "pattern", "prompt", "query", "skill"):
        if isinstance(args.get(key), str):
            return f"{block.get('name')}: {args[key].splitlines()[0] if args[key] else ''}"
    return f"{block.get('name')}"


def result_text(block):
    content = block.get("content")
    if isinstance(content, list):
        content = "\n".join(c.get("text", "") for c in content if isinstance(c, dict))
    return content if isinstance(content, str) else ""


def render(entry, mode, width):
    """(label, text) pairs for one entry under the mode."""
    kind = entry.get("type")
    message = entry.get("message") or {}
    content = message.get("content")
    if kind == "user" and entry.get("isCompactSummary"):
        if mode in ("all", "summaries"):
            yield "COMPACTED", cut(content if isinstance(content, str) else "", width * 10 if width else 0)
        return
    if kind == "system" and entry.get("subtype") == "away_summary":
        if mode in ("all", "summaries"):
            yield "RECAP", entry.get("content", "")
        return
    if mode == "summaries":
        return
    if kind == "user" and isinstance(content, str):
        if not NOISE.match(content.strip()) and not entry.get("isMeta"):
            yield "OWNER", content.strip()
        return
    if kind == "attachment":
        attachment = entry.get("attachment") or {}
        prompt = attachment.get("prompt")
        if attachment.get("type") == "queued_command" and isinstance(prompt, str):
            if prompt.lstrip().startswith("<task-notification>"):
                if mode == "all":
                    summary = re.search(r"<summary>(.*?)</summary>", prompt, re.S)
                    yield "NOTIFY", summary.group(1) if summary else cut(prompt, width)
            else:
                yield "OWNER", prompt.strip()
        return
    if mode == "owner":
        return
    if kind == "system" and entry.get("subtype") in ("informational", "scheduled_task_fire", "compact_boundary"):
        yield "SYSTEM", entry.get("content") or entry.get("subtype")
    elif kind == "assistant" and isinstance(content, list):
        for block in content:
            if block.get("type") == "text" and block.get("text", "").strip():
                yield "CLAUDE", block["text"].strip()
            elif block.get("type") == "tool_use":
                yield "TOOL", cut(tool_call(block), width)
    elif kind == "user" and isinstance(content, list):
        for block in content:
            if block.get("type") == "tool_result":
                label = "ERROR" if block.get("is_error") else "RESULT"
                yield label, cut(result_text(block), width)


def stats(paths):
    counts, sizes = collections.Counter(), collections.Counter()
    for path in paths:
        with open(path, "rb") as f:
            for line in f:
                try:
                    kind = json.loads(line).get("type")
                except ValueError:
                    kind = "(not JSON)"
                counts[kind] += 1
                sizes[kind] += len(line)
    for path in paths:
        print(f"{path}  {os.path.getsize(path) / 1e6:.1f} MB")
    for kind, n in counts.most_common():
        print(f"  {kind:28} {n:7} {sizes[kind] / 1e6:8.1f} MB")


def subagents(paths):
    """Lists subagents; returns the number of unexpected files found."""
    unexpected = 0
    for path in paths:
        directory = path[: -len(".jsonl")]
        top = os.path.join(directory, "subagents")
        if not os.path.isdir(top):
            continue
        for here, dirs, files in os.walk(top):
            dirs.sort()
            for name in sorted(files):
                full = os.path.join(here, name)
                if name == FINDER_FILE or name.endswith(".jsonl"):
                    continue
                if not name.endswith(".meta.json"):
                    print(f"claude-session: unexpected file {full}", file=sys.stderr)
                    unexpected += 1
                    continue
                try:
                    with open(full) as f:
                        meta = json.load(f)
                except ValueError:
                    print(f"claude-session: unreadable {full}", file=sys.stderr)
                    unexpected += 1
                    continue
                agent = name[: -len(".meta.json")]
                where = os.path.relpath(here, top)
                prefix = "" if where == "." else where + "/"
                print(f"{prefix}{agent}  {meta.get('agentType', '?')}  {meta.get('description', '')}")
    return unexpected


def parse_args(argv):
    opts = {"mode": "all", "since": None, "until": None, "grep": None,
            "last": None, "width": 400, "action": "read", "session": None}
    args = list(argv)
    while args:
        arg = args.pop(0)
        if arg in ("-h", "--help"):
            print(__doc__)
            sys.exit(0)
        elif arg == "--owner":
            opts["mode"] = "owner"
        elif arg == "--summaries":
            opts["mode"] = "summaries"
        elif arg == "--stats":
            opts["action"] = "stats"
        elif arg == "--subagents":
            opts["action"] = "subagents"
        elif arg in ("--since", "--until", "--grep", "--last", "--width"):
            if not args:
                sys.exit(f"claude-session: {arg} needs a value")
            value = args.pop(0)
            key = arg[2:]
            opts[key] = int(value) if key in ("last", "width") else value
        elif arg.startswith("-"):
            sys.exit(f"claude-session: unknown option {arg}")
        elif opts["session"] is None:
            opts["session"] = arg
        else:
            sys.exit("claude-session: one session only")
    if opts["session"] is None:
        sys.exit(__doc__)
    return opts


def main(argv):
    opts = parse_args(argv)
    paths = list(chain(resolve(opts["session"])))
    if opts["action"] == "stats":
        stats(paths)
        return 0
    if opts["action"] == "subagents":
        return 1 if subagents(paths) else 0
    grep = re.compile(opts["grep"], re.I) if opts["grep"] else None
    tail = collections.deque(maxlen=opts["last"]) if opts["last"] else None
    for entry in entries(paths):
        stamp = entry.get("timestamp") or ""
        if opts["since"] and stamp and stamp < opts["since"]:
            continue
        if opts["until"] and stamp and stamp >= opts["until"]:
            continue
        for label, text in render(entry, opts["mode"], opts["width"]):
            if grep and not grep.search(text):
                continue
            block = f"[{stamp[:19].replace('T', ' ')}] {label}: {text}"
            if tail is not None:
                tail.append(block)
            else:
                print(block)
    for block in tail or ():
        print(block)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except BrokenPipeError:
        sys.stderr.close()
        sys.exit(0)
