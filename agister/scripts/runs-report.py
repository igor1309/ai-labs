#!/usr/bin/env python3
"""Who ran each Agister agent call, and which skills it had and used.

usage: agister/scripts/runs-report.py [--runs <dir>] [--codex-sessions <dir>]

Reads every run under the runs directory (default ~/.agister/runs), and for
each call with a provider session reads that session:

- Claude Code: the provider stream Agister keeps (provider.jsonl). Its
  init event gives the model and tools; its skills are offered only with
  the Skill tool. A Skill call that succeeded, or a Read of a SKILL.md, is a
  skill used.
- Codex: the session under ~/.codex/sessions whose file name carries the
  provider session ID. Its skills block lists the skills offered, its turn
  context the model and effort. A command that reads a listed skill's
  SKILL.md, or a $skill mention, is a skill used.

Only sessions Agister started are read. Prints one row per call, then the
skills each runtime had and how often each was used. Writes nothing.
"""

import argparse
import glob
import hashlib
import json
import os
import re
import sys
import tomllib
from collections import Counter


def load_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def jsonl(path):
    try:
        with open(path) as f:
            for line in f:
                try:
                    yield json.loads(line)
                except ValueError:
                    continue
    except OSError:
        return


def agent_effort(record):
    """The effort in the agent's definition, if the file is still what the
    run read; the record keeps only its path and digest."""
    for d in record.get("definitions", []):
        if d.get("kind") != "agents":
            continue
        try:
            with open(d["path"], "rb") as f:
                data = f.read()
        except OSError:
            return "?"
        if hashlib.sha256(data).hexdigest() != d.get("sha256"):
            return "?"
        return tomllib.loads(data.decode()).get("effort", "-")
    return "-"


def claude_session(run_dir):
    """Model, skills offered, tools and skills used, from the provider stream.
    The init event's skills are slash commands; the model is offered them
    only with the Skill tool. A skill is used by a Skill call that succeeded,
    or by a Read of a SKILL.md."""
    model, listed, tools, calls, failed, used = None, [], [], {}, set(), Counter()
    for event in jsonl(os.path.join(run_dir, "provider.jsonl")):
        if event.get("type") == "system" and event.get("subtype") == "init" and model is None:
            model = event.get("model")
            listed = event.get("skills") or []
            tools = event.get("tools") or []
        for block in (event.get("message") or {}).get("content") or []:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "tool_result" and block.get("is_error"):
                failed.add(block.get("tool_use_id"))
            if block.get("type") != "tool_use":
                continue
            given = block.get("input") or {}
            if block.get("name") == "Skill":
                calls[block.get("id")] = given.get("skill")
            elif block.get("name") == "Read" and str(given.get("file_path", "")).endswith("/SKILL.md"):
                calls[block.get("id")] = os.path.basename(os.path.dirname(given["file_path"]))
    for call, name in calls.items():
        if call not in failed:
            used[name] += 1
    offered = listed if "Skill" in tools else []
    return model, offered, tools, used


def codex_skills(text):
    """The skills a skills block lists, as a map from each SKILL.md path,
    expanded by the block's skill roots, to the skill's name."""
    roots = dict(re.findall(r"- `(r\d+)` = `([^`]+)`", text))
    skills = {}
    for name, root, rest in re.findall(r"^- (\S+?): .*\(file: (r\d+)/([^)]+)\)$", text, re.M):
        if root in roots:
            skills[os.path.join(roots[root], rest)] = name
    return skills


def codex_session(sessions, session_id):
    """Model, effort, skills offered and skills used, from the Codex session.
    A skill is used when a command reads its SKILL.md (a parsed read of that
    path; searches do not count), or when a $skill mention injects it."""
    files = glob.glob(os.path.join(sessions, "**", f"*{session_id}.jsonl"), recursive=True)
    if not files:
        return None, None, None, Counter()
    model, effort, skills, used = None, None, {}, Counter()
    for event in jsonl(files[0]):
        payload = event.get("payload") or {}
        if event.get("type") == "turn_context" and model is None:
            model, effort = payload.get("model"), payload.get("effort")
        if payload.get("type") == "message":
            for block in payload.get("content") or []:
                text = block.get("text") or ""
                if not skills and payload.get("role") == "developer" and "<skills_instructions>" in text:
                    skills = codex_skills(text)
                if payload.get("role") == "user" and text.startswith("<skill>"):
                    name = re.search(r"<name>([^<]+)</name>", text)
                    used[name.group(1) if name else "?"] += 1
        item = payload.get("item") or {}
        if payload.get("type") == "item_completed" and item.get("type") == "CommandExecution":
            for part in item.get("parsed_cmd") or []:
                if part.get("type") == "read" and part.get("path") in skills:
                    used[skills[part["path"]]] += 1
    return model, effort, sorted(set(skills.values())), used


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--runs", default=os.path.expanduser("~/.agister/runs"))
    parser.add_argument("--codex-sessions", default=os.path.expanduser("~/.codex/sessions"))
    args = parser.parse_args()

    rows, had_by_runtime, used_by_runtime = [], {}, {}
    for path in sorted(glob.glob(os.path.join(args.runs, "*", "record.json"))):
        record = load_json(path)
        if not record or "workflow" in record:
            continue
        session = ((record.get("result") or {}).get("session") or {}).get("provider_session_id")
        if not session:
            continue
        adapter = (record.get("runtime") or {}).get("adapter", "?")
        version = (record.get("runtime") or {}).get("version", "")
        if adapter == "claude-code":
            model, had, tools, used = claude_session(os.path.dirname(path))
            effort = agent_effort(record)
        elif adapter == "codex":
            model, effort, had, used = codex_session(args.codex_sessions, session)
            tools = None
        else:
            continue
        had_by_runtime.setdefault(adapter, Counter()).update(had or [])
        used_by_runtime.setdefault(adapter, Counter()).update(used)
        rows.append([
            record["id"], record.get("process", "?"), f"{adapter} {version}".strip(),
            model or "?", effort or "?", str(len(had or [])),
            ", ".join(f"{k}×{v}" for k, v in used.most_common()) or "-",
        ])

    head = ["run", "process", "harness", "model", "effort", "skills offered", "skills used"]
    widths = [max(len(h), *(len(r[i]) for r in rows)) if rows else len(h) for i, h in enumerate(head)]
    print("  ".join(h.ljust(w) for h, w in zip(head, widths)))
    for r in rows:
        print("  ".join(c.ljust(w) for c, w in zip(r, widths)))
    print(f"\n{len(rows)} calls with a provider session")
    for adapter, had in sorted(had_by_runtime.items()):
        used = used_by_runtime.get(adapter, Counter())
        print(f"\n{adapter}: {len(had)} skills offered, {sum(1 for k in had if used[k])} used")
        for name, count in used.most_common():
            print(f"  {name}: used {count} times")
    return 0


if __name__ == "__main__":
    sys.exit(main())
