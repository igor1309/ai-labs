#!/usr/bin/env python3
"""Audit Claude Code session transcripts for context-expanding behavior.

Reads Claude Code JSONL transcripts under:
  $CLAUDE_CONFIG_DIR/projects/**/<session>.jsonl
  or ~/.claude/projects/**/<session>.jsonl

The transcript schema is not treated as stable. This parser only relies on
currently observed message/tool-use shapes and ignores records it does not know.
It never prints tool-result contents.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

RAW_BUILD = re.compile(r"(^|[\s;&(])(xcodebuild\b|swift\s+(?:build|test)\b)")
BUILD_FILTER = re.compile(r"xcsift|xcbeautify|xcpretty|\s-quiet\b")
POLLING = re.compile(r"(?:^|[;&|]\s*)sleep\b|\b(?:watch|gh\s+run\s+watch|gh\s+pr\s+checks\s+--watch)\b")
CHECK_COMMAND = re.compile(r"\b(?:gh\s+(?:run\s+view|pr\s+checks)|curl|wget)\b")
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
READ_TOOLS = {"Read"}
SUBAGENT_TOOLS = {"Agent", "Task"}


def text_size(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, str):
        return len(value)
    try:
        return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    except Exception:
        return len(str(value))


def command_of(inp: Any) -> str | None:
    if not isinstance(inp, dict):
        return None
    command = inp.get("command")
    if isinstance(command, list):
        return command[-1] if command and isinstance(command[-1], str) else None
    return command if isinstance(command, str) else None


def path_of(inp: Any) -> str | None:
    if not isinstance(inp, dict):
        return None
    for key in ("file_path", "path", "notebook_path"):
        value = inp.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def norm_path(path: str, cwd: str | None) -> str:
    p = Path(os.path.expanduser(path))
    if not p.is_absolute() and cwd:
        p = Path(cwd) / p
    try:
        return str(p.resolve(strict=False))
    except Exception:
        return str(p)


def is_full_read(inp: Any) -> bool:
    if not isinstance(inp, dict):
        return True
    # Claude's Read tool supports offset/limit. Their absence is the useful
    # signal for a likely whole/default read; exact bytes read remain runtime-dependent.
    return inp.get("offset") is None and inp.get("limit") is None


def skill_name(name: str, inp: Any) -> str | None:
    if name == "Skill" and isinstance(inp, dict):
        for key in ("skill", "name"):
            v = inp.get(key)
            if isinstance(v, str) and v:
                return v
    p = path_of(inp)
    if p and p.endswith("SKILL.md"):
        return p
    cmd = command_of(inp)
    if cmd:
        m = re.search(r"(?:^|\s)([^\s'\"]*SKILL\.md)(?:\s|$)", cmd)
        if m:
            return m.group(1)
    return None


@dataclass
class SessionStats:
    path: str
    tool_calls: int = 0
    full_reads: int = 0
    repeated_reads: int = 0
    builds: int = 0
    unfiltered_builds: int = 0
    polling_candidates: int = 0
    repeated_checks: int = 0
    skill_loads: int = 0
    duplicate_skill_loads: int = 0
    subagents: int = 0
    large_results: int = 0
    result_chars: int = 0
    largest_result_chars: int = 0
    parse_errors: int = 0
    usage: Counter = field(default_factory=Counter)
    subagent_models: Counter = field(default_factory=Counter)
    tool_names: Counter = field(default_factory=Counter)

    @property
    def score(self) -> int:
        return (
            self.repeated_reads * 4
            + self.unfiltered_builds * 5
            + self.duplicate_skill_loads * 3
            + self.repeated_checks * 3
            + self.large_results * 2
            + self.full_reads
        )


def iter_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                yield {"__parse_error__": True}
                continue
            if isinstance(value, dict):
                yield value


def analyze(path: Path, large_result_threshold: int) -> SessionStats:
    s = SessionStats(str(path))
    cwd: str | None = None
    file_revision: defaultdict[str, int] = defaultdict(int)
    last_read_revision: dict[str, int] = {}
    skill_counts: Counter[str] = Counter()
    pending: dict[str, str] = {}
    last_check: str | None = None

    def on_tool(name: str, inp: Any, call_id: str | None) -> None:
        nonlocal last_check
        s.tool_calls += 1
        s.tool_names[name] += 1
        if call_id:
            pending[call_id] = name

        p = path_of(inp)
        if p:
            p = norm_path(p, cwd)

        if name in EDIT_TOOLS and p:
            file_revision[p] += 1

        if name in READ_TOOLS and p:
            if is_full_read(inp):
                s.full_reads += 1
            rev = file_revision[p]
            if last_read_revision.get(p) == rev:
                s.repeated_reads += 1
            last_read_revision[p] = rev

        cmd = command_of(inp)
        if cmd:
            if RAW_BUILD.search(cmd):
                s.builds += 1
                if not BUILD_FILTER.search(cmd):
                    s.unfiltered_builds += 1
            if POLLING.search(cmd):
                s.polling_candidates += 1
            if CHECK_COMMAND.search(cmd):
                normalized = re.sub(r"\s+", " ", cmd.strip())
                if normalized == last_check:
                    s.repeated_checks += 1
                last_check = normalized
            else:
                last_check = None

        sk = skill_name(name, inp)
        if sk:
            s.skill_loads += 1
            skill_counts[sk] += 1
            if skill_counts[sk] > 1:
                s.duplicate_skill_loads += 1

        if name in SUBAGENT_TOOLS:
            s.subagents += 1
            model = None
            if isinstance(inp, dict):
                model = inp.get("model")
            s.subagent_models[str(model or "unspecified")] += 1

    def on_result(call_id: str | None, content: Any) -> None:
        if call_id and call_id not in pending:
            return
        n = text_size(content)
        s.result_chars += n
        s.largest_result_chars = max(s.largest_result_chars, n)
        if n >= large_result_threshold:
            s.large_results += 1

    for rec in iter_jsonl(path):
        if rec.get("__parse_error__"):
            s.parse_errors += 1
            continue
        if isinstance(rec.get("cwd"), str):
            cwd = rec["cwd"]

        typ = rec.get("type")
        msg = rec.get("message")
        if not isinstance(msg, dict):
            continue

        if typ == "assistant" or msg.get("role") == "assistant":
            usage = msg.get("usage")
            if isinstance(usage, dict):
                for key in (
                    "input_tokens",
                    "cache_creation_input_tokens",
                    "cache_read_input_tokens",
                    "output_tokens",
                ):
                    v = usage.get(key)
                    if isinstance(v, int):
                        s.usage[key] += v
            content = msg.get("content")
            if isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict) or block.get("type") != "tool_use":
                        continue
                    name = block.get("name")
                    if not isinstance(name, str):
                        continue
                    on_tool(name, block.get("input") or {}, block.get("id") if isinstance(block.get("id"), str) else None)

        elif typ == "user" or msg.get("role") == "user":
            content = msg.get("content")
            if isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict) or block.get("type") != "tool_result":
                        continue
                    cid = block.get("tool_use_id") if isinstance(block.get("tool_use_id"), str) else None
                    on_result(cid, block.get("content"))

    return s


def discover(root: Path, days: int | None) -> list[Path]:
    now = time.time()
    cutoff = now - days * 86400 if days is not None else None
    out: list[Path] = []
    for p in root.rglob("*.jsonl"):
        name = p.name
        if ".orphaned-" in name or ".superseded-" in name:
            continue
        try:
            if cutoff is not None and p.stat().st_mtime < cutoff:
                continue
        except OSError:
            continue
        out.append(p)
    return sorted(out)


def aggregate(items: list[SessionStats]) -> dict[str, Any]:
    totals = Counter()
    usage = Counter()
    models = Counter()
    tools = Counter()
    for s in items:
        for key in (
            "tool_calls", "full_reads", "repeated_reads", "builds", "unfiltered_builds",
            "polling_candidates", "repeated_checks", "skill_loads", "duplicate_skill_loads",
            "subagents", "large_results", "result_chars", "parse_errors",
        ):
            totals[key] += getattr(s, key)
        usage.update(s.usage)
        models.update(s.subagent_models)
        tools.update(s.tool_names)
    return {
        "sessions": len(items),
        **dict(totals),
        "usage": dict(usage),
        "subagent_models": dict(models),
        "top_tools": tools.most_common(15),
    }


def human(items: list[SessionStats], top: int) -> None:
    a = aggregate(items)
    print("Claude Code session audit")
    print(f"sessions: {a['sessions']:,}  tool calls: {a.get('tool_calls', 0):,}  parse errors: {a.get('parse_errors', 0):,}")
    print(
        "reads: "
        f"full/default {a.get('full_reads', 0):,}, repeated-without-edit {a.get('repeated_reads', 0):,}"
    )
    print(
        "builds: "
        f"{a.get('builds', 0):,}, unfiltered {a.get('unfiltered_builds', 0):,}  |  "
        f"polling candidates {a.get('polling_candidates', 0):,}, repeated checks {a.get('repeated_checks', 0):,}"
    )
    print(
        "skills: "
        f"loads {a.get('skill_loads', 0):,}, duplicate loads {a.get('duplicate_skill_loads', 0):,}  |  "
        f"subagents {a.get('subagents', 0):,}"
    )
    print(f"large tool results: {a.get('large_results', 0):,} (threshold configured per run)")
    if a["usage"]:
        u = a["usage"]
        print(
            "usage fields found: "
            f"input={u.get('input_tokens', 0):,} cache-create={u.get('cache_creation_input_tokens', 0):,} "
            f"cache-read={u.get('cache_read_input_tokens', 0):,} output={u.get('output_tokens', 0):,}"
        )
    if a["subagent_models"]:
        print("subagent models: " + ", ".join(f"{k}={v}" for k, v in sorted(a["subagent_models"].items())))

    ranked = sorted(items, key=lambda x: (x.score, x.result_chars), reverse=True)[:top]
    if ranked:
        print("\nHighest-signal sessions:")
        for s in ranked:
            print(
                f"  score={s.score:4d} repeat_reads={s.repeated_reads:3d} raw_builds={s.unfiltered_builds:3d} "
                f"dup_skills={s.duplicate_skill_loads:3d} large_results={s.large_results:3d}  {s.path}"
            )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    default_base = Path(os.environ.get("CLAUDE_CONFIG_DIR", "~/.claude")).expanduser()
    parser.add_argument("--root", type=Path, default=default_base / "projects", help="Claude projects/transcript root")
    parser.add_argument("--days", type=int, default=None, help="Only files modified in the last N days")
    parser.add_argument("--top", type=int, default=15, help="Number of high-signal sessions to print")
    parser.add_argument("--large-result-chars", type=int, default=20_000, help="Threshold for a large tool result")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()

    root = args.root.expanduser()
    if not root.exists():
        parser.error(f"transcript root does not exist: {root}")
    paths = discover(root, args.days)
    items = [analyze(p, args.large_result_chars) for p in paths]

    if args.json:
        payload = aggregate(items)
        payload["sessions_detail"] = [
            {
                "path": s.path,
                "score": s.score,
                "tool_calls": s.tool_calls,
                "full_reads": s.full_reads,
                "repeated_reads": s.repeated_reads,
                "unfiltered_builds": s.unfiltered_builds,
                "polling_candidates": s.polling_candidates,
                "repeated_checks": s.repeated_checks,
                "duplicate_skill_loads": s.duplicate_skill_loads,
                "subagents": s.subagents,
                "large_results": s.large_results,
                "largest_result_chars": s.largest_result_chars,
                "usage": dict(s.usage),
            }
            for s in items
        ]
        json.dump(payload, sys.stdout, indent=2)
        print()
    else:
        human(items, args.top)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
