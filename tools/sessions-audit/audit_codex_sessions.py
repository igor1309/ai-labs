#!/usr/bin/env python3
"""Audit Codex local rollout JSONL for context-expanding behavior.

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

import argparse
import json
import os
import re
import shlex
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
SUBAGENT_NAME = re.compile(r"(?:spawn|start|create|delegate).*agent|agent.*(?:spawn|start|create|delegate)", re.I)


def text_size(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, str):
        return len(value)
    try:
        return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    except Exception:
        return len(str(value))


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


def norm_path(path: str, cwd: str | None) -> str:
    p = Path(os.path.expanduser(path))
    if not p.is_absolute() and cwd:
        p = Path(cwd) / p
    try:
        return str(p.resolve(strict=False))
    except Exception:
        return str(p)


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
    paths = [p for p in parts[1:] if not p.startswith("-")]
    return paths


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
    if command:
        m = re.search(r"(?:^|\s)([^\s'\"]*SKILL\.md)(?:\s|$)", command)
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
    token_total: dict[str, int] = field(default_factory=dict)
    peak_last_input_tokens: int = 0
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


def analyze(path: Path, large_result_threshold: int) -> SessionStats:
    s = SessionStats(str(path))
    cwd: str | None = None
    file_revision: defaultdict[str, int] = defaultdict(int)
    last_read_revision: dict[str, int] = {}
    skill_counts: Counter[str] = Counter()
    pending: dict[str, str] = {}
    last_check: str | None = None

    def on_read(p: str) -> None:
        p2 = norm_path(p, cwd)
        s.full_reads += 1
        rev = file_revision[p2]
        if last_read_revision.get(p2) == rev:
            s.repeated_reads += 1
        last_read_revision[p2] = rev

    def on_tool(name: str, inp: Any, call_id: str | None) -> None:
        nonlocal last_check
        s.tool_calls += 1
        s.tool_names[name] += 1
        if call_id:
            pending[call_id] = name

        lname = name.lower()
        p = path_of(inp)
        if p and lname in {"read", "read_file", "file_read"}:
            on_read(p)
        if p and lname in {"write", "write_file", "edit", "edit_file"}:
            file_revision[norm_path(p, cwd)] += 1
        if "apply_patch" in lname:
            for changed in patch_paths(inp):
                file_revision[norm_path(changed, cwd)] += 1

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
            for cat_path in simple_cat_paths(cmd):
                on_read(cat_path)

        sk = skill_name(name, inp, cmd)
        if sk:
            s.skill_loads += 1
            skill_counts[sk] += 1
            if skill_counts[sk] > 1:
                s.duplicate_skill_loads += 1

        if SUBAGENT_NAME.search(name) or lname in {"spawn_agent", "create_agent"}:
            s.subagents += 1
            model = inp.get("model") if isinstance(inp, dict) else None
            s.subagent_models[str(model or "unspecified")] += 1

    def on_result(call_id: str | None, content: Any) -> None:
        if call_id and call_id not in pending:
            # Async/system-generated function outputs can legitimately have no visible call.
            # Still size them once because they enter the rollout/context path.
            pass
        n = text_size(content)
        s.result_chars += n
        s.largest_result_chars = max(s.largest_result_chars, n)
        if n >= large_result_threshold:
            s.large_results += 1

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
        elif typ == "turn_context" and isinstance(payload, dict):
            maybe_cwd = payload.get("cwd")
            if isinstance(maybe_cwd, str):
                cwd = maybe_cwd

        # Use cumulative token_count state, not a sum of last_token_usage events.
        # Codex can re-emit token_count records for rate-limit-only updates.
        if typ == "event_msg" and isinstance(payload, dict) and payload.get("type") == "token_count":
            info = payload.get("info")
            if isinstance(info, dict):
                total = info.get("total_token_usage")
                if isinstance(total, dict):
                    for k, v in total.items():
                        if isinstance(v, int):
                            s.token_total[k] = max(s.token_total.get(k, 0), v)
                last = info.get("last_token_usage")
                if isinstance(last, dict) and isinstance(last.get("input_tokens"), int):
                    s.peak_last_input_tokens = max(s.peak_last_input_tokens, last["input_tokens"])
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
            inp = {
                "command": item.get("command") or item.get("action") or item.get("input")
            }
            on_tool("local_shell_call", inp, call_id if isinstance(call_id, str) else None)

        elif itype in {"function_call_output", "custom_tool_call_output"}:
            call_id = item.get("call_id") or item.get("id")
            content = item.get("output")
            on_result(call_id if isinstance(call_id, str) else None, content)

    return s


def discover(home: Path, days: int | None, active_only: bool) -> list[Path]:
    roots = [home / "sessions"]
    if not active_only:
        roots.append(home / "archived_sessions")
    now = time.time()
    cutoff = now - days * 86400 if days is not None else None
    out: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        for p in root.rglob("*.jsonl"):
            try:
                if cutoff is not None and p.stat().st_mtime < cutoff:
                    continue
            except OSError:
                continue
            out.append(p)
    return sorted(set(out))


def aggregate(items: list[SessionStats]) -> dict[str, Any]:
    totals = Counter()
    token_totals = Counter()
    models = Counter()
    tools = Counter()
    peak_context = 0
    for s in items:
        for key in (
            "tool_calls", "full_reads", "repeated_reads", "builds", "unfiltered_builds",
            "polling_candidates", "repeated_checks", "skill_loads", "duplicate_skill_loads",
            "subagents", "large_results", "result_chars", "parse_errors",
        ):
            totals[key] += getattr(s, key)
        token_totals.update(s.token_total)
        peak_context = max(peak_context, s.peak_last_input_tokens)
        models.update(s.subagent_models)
        tools.update(s.tool_names)
    return {
        "sessions": len(items),
        **dict(totals),
        "token_totals": dict(token_totals),
        "peak_last_input_tokens": peak_context,
        "subagent_models": dict(models),
        "top_tools": tools.most_common(15),
    }


def human(items: list[SessionStats], top: int) -> None:
    a = aggregate(items)
    print("Codex session audit")
    print(f"sessions: {a['sessions']:,}  tool calls: {a.get('tool_calls', 0):,}  parse errors: {a.get('parse_errors', 0):,}")
    print(
        "reads: "
        f"likely full-file {a.get('full_reads', 0):,}, repeated-without-observed-edit {a.get('repeated_reads', 0):,}"
    )
    print(
        "builds: "
        f"{a.get('builds', 0):,}, unfiltered {a.get('unfiltered_builds', 0):,}  |  "
        f"polling candidates {a.get('polling_candidates', 0):,}, repeated checks {a.get('repeated_checks', 0):,}"
    )
    print(
        "skills: "
        f"loads observed {a.get('skill_loads', 0):,}, duplicate loads {a.get('duplicate_skill_loads', 0):,}  |  "
        f"subagents observed {a.get('subagents', 0):,}"
    )
    print(f"large function outputs: {a.get('large_results', 0):,} (response_item outputs counted once)")
    if a["token_totals"]:
        t = a["token_totals"]
        print(
            "cumulative usage across sessions: "
            f"input={t.get('input_tokens', 0):,} cached={t.get('cached_input_tokens', 0):,} "
            f"output={t.get('output_tokens', 0):,} reasoning={t.get('reasoning_output_tokens', 0):,} "
            f"total={t.get('total_tokens', 0):,}"
        )
        print(f"peak recorded last-turn input tokens: {a.get('peak_last_input_tokens', 0):,}")
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
    default_home = Path(os.environ.get("CODEX_HOME", "~/.codex")).expanduser()
    parser.add_argument("--home", type=Path, default=default_home, help="CODEX_HOME")
    parser.add_argument("--days", type=int, default=None, help="Only files modified in the last N days")
    parser.add_argument("--active-only", action="store_true", help="Skip archived_sessions")
    parser.add_argument("--top", type=int, default=15, help="Number of high-signal sessions to print")
    parser.add_argument("--large-result-chars", type=int, default=20_000, help="Threshold for a large function output")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()

    home = args.home.expanduser()
    if not home.exists():
        parser.error(f"CODEX_HOME does not exist: {home}")
    paths = discover(home, args.days, args.active_only)
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
                "token_total": s.token_total,
                "peak_last_input_tokens": s.peak_last_input_tokens,
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
