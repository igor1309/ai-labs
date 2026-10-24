"""Codex rollout adapter: discovery and per-file record parsing.

Reads current Codex session transcripts under:
  $CODEX_HOME/sessions/**/rollout-*.jsonl
  $CODEX_HOME/archived_sessions/**/rollout-*.jsonl
  or ~/.codex/... by default.

Codex documents transcript_path as an unstable interface. This parser therefore
handles current Responses-style rollout records plus common legacy shapes, and
ignores unknown records. It deliberately ignores event_msg/item_completed output
copies so current rollout duplication does not inflate result-size metrics.
"""

from __future__ import annotations

import json
import re
import shlex
from collections import Counter
from pathlib import Path
from typing import Any

from sessions_audit_core import SessionStats, Tracker, iter_jsonl, norm_path, skill_in_command

NAME = "codex"
TITLE = "Codex"

SUBAGENT_NAME = re.compile(r"(?:spawn|start|create|delegate).*agent|agent.*(?:spawn|start|create|delegate)", re.I)


def parse_args_value(value: Any) -> Any:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {"input": parsed}
    except json.JSONDecodeError:
        return {"input": value}


def command_of(inp: Any) -> str | None:
    if not isinstance(inp, dict):
        return None
    for key in ("command", "cmd"):
        command = inp.get(key)
        if isinstance(command, list):
            # shell_command can represent argv or a command sequence depending on version.
            strings = [x for x in command if isinstance(x, str)]
            return " ".join(strings) if strings else None
        if isinstance(command, str):
            return command
    return None


def path_of(inp: Any) -> str | None:
    if not isinstance(inp, dict):
        return None
    for key in ("file_path", "path"):
        v = inp.get(key)
        if isinstance(v, str) and v:
            return v
    return None


def simple_cat_paths(command: str) -> list[str]:
    """Return paths for a simple `cat file...` command; skip pipelines/redirection."""
    if re.search(r"[|<>`;]|\$\(", command):
        return []
    try:
        parts = shlex.split(command)
    except ValueError:
        return []
    if not parts:
        return []
    # Allow a leading `cd path && cat ...` by keeping only the final segment.
    if "&&" in parts:
        idx = max(i for i, x in enumerate(parts) if x == "&&")
        parts = parts[idx + 1 :]
    if not parts or parts[0] != "cat":
        return []
    return [p for p in parts[1:] if not p.startswith("-")]


def patch_paths(inp: Any) -> list[str]:
    if not isinstance(inp, dict):
        return []
    text = None
    for key in ("patch", "input", "command"):
        v = inp.get(key)
        if isinstance(v, str):
            text = v
            break
    if not text:
        return []
    return re.findall(r"^\*\*\* (?:Update|Add|Delete) File:\s*(.+?)\s*$", text, re.M)


def skill_name(name: str, inp: Any, command: str | None) -> str | None:
    if name.lower() in {"skill", "load_skill"} and isinstance(inp, dict):
        for key in ("skill", "name"):
            v = inp.get(key)
            if isinstance(v, str) and v:
                return v
    p = path_of(inp)
    if p and p.endswith("SKILL.md"):
        return p
    return skill_in_command(command)


def current_item(rec: dict[str, Any]) -> dict[str, Any] | None:
    if rec.get("type") == "response_item" and isinstance(rec.get("payload"), dict):
        return rec["payload"]
    # Legacy rollouts sometimes store Responses items at top level.
    if rec.get("type") in {
        "function_call", "function_call_output", "custom_tool_call", "custom_tool_call_output",
        "local_shell_call",
    }:
        return rec
    return None


def normalize_tokens(total: dict[str, int]) -> dict[str, int]:
    # Codex input_tokens includes cached input; split it so that
    # input + cached + cache_creation = total prompt tokens.
    # output_tokens already includes reasoning_output_tokens.
    inp = total.get("input_tokens", 0)
    cached = total.get("cached_input_tokens", 0)
    return {
        "input": max(0, inp - cached),
        "cached": cached,
        "cache_creation": total.get("cache_write_input_tokens", 0),
        "output": total.get("output_tokens", 0),
        "reasoning": total.get("reasoning_output_tokens", 0),
    }


def analyze(path: Path, large_result_threshold: int) -> SessionStats:
    s = SessionStats(NAME, str(path))
    t = Tracker(s, large_result_threshold)
    cwd: str | None = None
    meta_cwd: str | None = None
    turn_cwd: str | None = None
    token_total: dict[str, int] = {}
    peak_last_input = 0

    def on_read(p: str) -> None:
        t.read(norm_path(p, cwd), True)

    def on_tool(name: str, inp: Any, call_id: str | None) -> None:
        t.tool(name, call_id)
        lname = name.lower()
        p = path_of(inp)
        if p and lname in {"read", "read_file", "file_read"}:
            on_read(p)
        if p and lname in {"write", "write_file", "edit", "edit_file"}:
            t.edit(norm_path(p, cwd))
        if "apply_patch" in lname:
            for changed in patch_paths(inp):
                t.edit(norm_path(changed, cwd))

        cmd = command_of(inp)
        if cmd:
            t.command(cmd)
            for cat_path in simple_cat_paths(cmd):
                on_read(cat_path)

        t.skill(skill_name(name, inp, cmd))

        if SUBAGENT_NAME.search(name) or lname in {"spawn_agent", "create_agent"}:
            t.subagent(inp)

    for rec in iter_jsonl(path):
        if rec.get("__parse_error__"):
            s.parse_errors += 1
            continue

        typ = rec.get("type")
        payload = rec.get("payload")

        if typ == "session_meta" and isinstance(payload, dict):
            maybe_cwd = payload.get("cwd")
            if isinstance(maybe_cwd, str):
                cwd = maybe_cwd
                if meta_cwd is None:
                    meta_cwd = maybe_cwd
        elif typ == "turn_context" and isinstance(payload, dict):
            maybe_cwd = payload.get("cwd")
            if isinstance(maybe_cwd, str):
                cwd = maybe_cwd
                if turn_cwd is None:
                    turn_cwd = maybe_cwd

        # Use cumulative token_count state, not a sum of last_token_usage events.
        # Codex can re-emit token_count records for rate-limit-only updates.
        if typ == "event_msg" and isinstance(payload, dict) and payload.get("type") == "token_count":
            info = payload.get("info")
            if isinstance(info, dict):
                total = info.get("total_token_usage")
                if isinstance(total, dict):
                    for k, v in total.items():
                        if isinstance(v, int):
                            token_total[k] = max(token_total.get(k, 0), v)
                last = info.get("last_token_usage")
                if isinstance(last, dict) and isinstance(last.get("input_tokens"), int):
                    peak_last_input = max(peak_last_input, last["input_tokens"])
            continue

        item = current_item(rec)
        if not item:
            continue
        itype = item.get("type")

        if itype in {"function_call", "custom_tool_call"}:
            name = item.get("name")
            if not isinstance(name, str):
                continue
            raw_args = item.get("arguments") if itype == "function_call" else item.get("input")
            inp = parse_args_value(raw_args)
            call_id = item.get("call_id") or item.get("id")
            on_tool(name, inp, call_id if isinstance(call_id, str) else None)

        elif itype == "local_shell_call":
            call_id = item.get("call_id") or item.get("id")
            inp = {"command": item.get("command") or item.get("action") or item.get("input")}
            on_tool("local_shell_call", inp, call_id if isinstance(call_id, str) else None)

        elif itype in {"function_call_output", "custom_tool_call_output"}:
            # Async/system-generated outputs can legitimately have no visible call.
            # Still size them once because they enter the rollout/context path.
            t.result(item.get("output"))

    s.cwd = meta_cwd if meta_cwd is not None else turn_cwd
    s.extras = {"token_total": token_total, "peak_last_input_tokens": peak_last_input}
    s.tokens = normalize_tokens(token_total)
    return s


def discover(home: Path, active_only: bool = False) -> list[Path]:
    roots = [home / "sessions"]
    if not active_only:
        roots.append(home / "archived_sessions")
    out: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        out.extend(root.rglob("*.jsonl"))
    return sorted(set(out))


def source_info(home: Path, active_only: bool = False) -> dict[str, Any]:
    return {"home": str(home), "active_only": active_only}


def aggregate_extras(items: list[SessionStats]) -> dict[str, Any]:
    totals: Counter = Counter()
    peak = 0
    for s in items:
        totals.update(s.extras.get("token_total", {}))
        peak = max(peak, s.extras.get("peak_last_input_tokens", 0))
    return {"token_totals": dict(totals), "peak_last_input_tokens": peak}


def extra_lines(extras: dict[str, Any]) -> list[str]:
    t = extras.get("token_totals") or {}
    if not t:
        return []
    return [
        "raw cumulative usage: "
        f"input={t.get('input_tokens', 0):,} cached={t.get('cached_input_tokens', 0):,} "
        f"output={t.get('output_tokens', 0):,} reasoning={t.get('reasoning_output_tokens', 0):,} "
        f"total={t.get('total_tokens', 0):,}",
        f"peak recorded last-turn input tokens: {extras.get('peak_last_input_tokens', 0):,}",
    ]
