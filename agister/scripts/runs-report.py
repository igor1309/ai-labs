#!/usr/bin/env python3
"""Who ran each Agister agent call, and which skills it had and used.

usage: agister/scripts/runs-report.py [--runs <dir>] [--codex-sessions <dir>]

Reads every run under the runs directory (default ~/.agister/runs), and for
each call with a provider session reads that session:

- Claude Code: the provider stream Agister keeps (provider.jsonl). Its init
  event lists the skills and tools the session had; a Skill tool call, or a
  read of a listed skill's SKILL.md, is a skill used.
- Codex: the session under ~/.codex/sessions whose file name carries the
  provider session ID. Its skills block lists the skills the session had,
  its turn context the model and effort; a command naming a listed skill's
  SKILL.md is a skill used.

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


def used_skill_files(text, names):
    """Listed skills whose SKILL.md the text names."""
    return {m for m in re.findall(r"([\w.:-]+)/SKILL\.md", text) if m in names}


def claude_session(run_dir):
    """Model, skills had, tools had and skills used, from the provider stream."""
    model, had, tools, used = None, [], [], Counter()
    for event in jsonl(os.path.join(run_dir, "provider.jsonl")):
        if event.get("type") == "system" and event.get("subtype") == "init" and model is None:
            model = event.get("model")
            had = event.get("skills") or []
            tools = event.get("tools") or []
        if event.get("type") != "assistant":
            continue
        for block in (event.get("message") or {}).get("content") or []:
            if block.get("type") != "tool_use":
                continue
            if block.get("name") == "Skill":
                used[(block.get("input") or {}).get("skill")] += 1
            else:
                for name in used_skill_files(json.dumps(block.get("input")), set(had)):
                    used[name] += 1
    return model, had, tools, used


def codex_session(sessions, session_id):
    """Model, effort, skills had and skills used, from the Codex session."""
    files = glob.glob(os.path.join(sessions, "**", f"*{session_id}.jsonl"), recursive=True)
    if not files:
        return None, None, None, Counter()
    model, effort, had, used = None, None, [], Counter()
    for event in jsonl(files[0]):
        payload = event.get("payload") or {}
        if event.get("type") == "turn_context" and model is None:
            model, effort = payload.get("model"), payload.get("effort")
        if payload.get("type") == "message" and payload.get("role") == "developer" and not had:
            for block in payload.get("content") or []:
                text = block.get("text") or ""
                if "<skills_instructions>" in text:
                    had = re.findall(r"^- ([\w.:-]+): ", text, re.M)
        if payload.get("type") in ("function_call", "custom_tool_call"):
            text = json.dumps(payload.get("input") or payload.get("arguments") or "")
            for name in used_skill_files(text, set(had)):
                used[name] += 1
    return model, effort, had, used


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
            "Skill" if tools and "Skill" in tools else ("-" if tools is not None else ""),
            ", ".join(f"{k}×{v}" for k, v in used.most_common()) or "-",
        ])

    head = ["run", "process", "harness", "model", "effort", "skills had", "skill tool", "skills used"]
    widths = [max(len(h), *(len(r[i]) for r in rows)) if rows else len(h) for i, h in enumerate(head)]
    print("  ".join(h.ljust(w) for h, w in zip(head, widths)))
    for r in rows:
        print("  ".join(c.ljust(w) for c, w in zip(r, widths)))
    print(f"\n{len(rows)} calls with a provider session")
    for adapter, had in sorted(had_by_runtime.items()):
        used = used_by_runtime.get(adapter, Counter())
        print(f"\n{adapter}: {len(had)} skills listed, {sum(1 for k in had if used[k])} used")
        for name, count in used.most_common():
            print(f"  {name}: used {count} times")
    return 0


if __name__ == "__main__":
    sys.exit(main())
