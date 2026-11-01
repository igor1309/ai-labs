"""Claude Code transcript adapter: discovery and per-file record parsing.

Reads Claude Code JSONL transcripts under:
  $CLAUDE_CONFIG_DIR/projects/**/<session>.jsonl
  or ~/.claude/projects/**/<session>.jsonl

The transcript schema is not treated as stable. This parser only relies on
currently observed message/tool-use shapes and ignores records it does not know.
It never prints tool-result contents.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

from sessions_audit_core import SessionStats, Tracker, iter_jsonl, norm_path, skill_in_command

NAME = "claude"
TITLE = "Claude Code"

EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
READ_TOOLS = {"Read"}
SUBAGENT_TOOLS = {"Agent", "Task"}
USAGE_KEYS = (
    "input_tokens",
    "cache_creation_input_tokens",
    "cache_read_input_tokens",
    "output_tokens",
)


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
    return skill_in_command(command_of(inp))


def normalize_tokens(usage: dict[str, int]) -> dict[str, int]:
    # Claude's input_tokens is already the uncached part of the prompt.
    # Reasoning is not reported separately (it is part of output_tokens).
    return {
        "input": usage.get("input_tokens", 0),
        "cached": usage.get("cache_read_input_tokens", 0),
        "cache_creation": usage.get("cache_creation_input_tokens", 0),
        "output": usage.get("output_tokens", 0),
        "reasoning": 0,
    }


def analyze(path: Path, large_result_threshold: int) -> SessionStats:
    s = SessionStats(NAME, str(path))
    t = Tracker(s, large_result_threshold)
    cwd: str | None = None
    usage: Counter = Counter()

    def on_tool(name: str, inp: Any, call_id: str | None) -> None:
        t.tool(name, call_id)
        p = path_of(inp)
        if p:
            p = norm_path(p, cwd)
        if name in EDIT_TOOLS and p:
            t.edit(p)
        if name in READ_TOOLS and p:
            t.read(p, is_full_read(inp))
        cmd = command_of(inp)
        if cmd:
            t.command(cmd)
        t.skill(skill_name(name, inp))
        if name in SUBAGENT_TOOLS:
            t.subagent(inp)

    for rec in iter_jsonl(path):
        if rec.get("__parse_error__"):
            s.parse_errors += 1
            continue
        if isinstance(rec.get("cwd"), str):
            cwd = rec["cwd"]
            if s.cwd is None:
                s.cwd = cwd

        typ = rec.get("type")
        msg = rec.get("message")
        if not isinstance(msg, dict):
            continue

        if typ == "assistant" or msg.get("role") == "assistant":
            u = msg.get("usage")
            if isinstance(u, dict):
                for key in USAGE_KEYS:
                    v = u.get(key)
                    if isinstance(v, int):
                        usage[key] += v
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
                    # Only size results whose id matches a tool_use seen in this file.
                    if cid and cid not in t.pending:
                        continue
                    t.result(block.get("content"))

    s.extras = {"usage": dict(usage)}
    s.tokens = normalize_tokens(usage)
    return s


def discover(root: Path) -> list[Path]:
    out: list[Path] = []
    for p in root.rglob("*.jsonl"):
        name = p.name
        if ".orphaned-" in name or ".superseded-" in name:
            continue
        out.append(p)
    return sorted(out)


def source_info(root: Path) -> dict[str, Any]:
    return {"root": str(root)}


def aggregate_extras(items: list[SessionStats]) -> dict[str, Any]:
    usage: Counter = Counter()
    for s in items:
        usage.update(s.extras.get("usage", {}))
    return {"usage": dict(usage)}


def extra_lines(extras: dict[str, Any]) -> list[str]:
    u = extras.get("usage") or {}
    if not u:
        return []
    return [
        "raw usage fields: "
        f"input={u.get('input_tokens', 0):,} cache-create={u.get('cache_creation_input_tokens', 0):,} "
        f"cache-read={u.get('cache_read_input_tokens', 0):,} output={u.get('output_tokens', 0):,}"
    ]
