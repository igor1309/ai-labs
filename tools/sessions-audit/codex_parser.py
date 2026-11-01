"""Codex rollout adapter: discovery and per-file record parsing.

Reads current Codex session transcripts under:
  $CODEX_HOME/sessions/**/rollout-*.jsonl
  $CODEX_HOME/archived_sessions/**/rollout-*.jsonl
  or ~/.codex/... by default.

Codex documents transcript_path as an unstable interface. This parser therefore
handles current Responses-style rollout records plus common legacy shapes, and
ignores unknown records. It deliberately ignores event_msg/item_completed output
copies so current rollout duplication does not inflate result-size metrics.

Current Codex runs tools in "code mode": the model sends one `exec` custom tool
call whose input is a JavaScript program, and the real tool calls happen inside
it as `tools.exec_command({cmd: "..."})`, `tools.apply_patch("...")` and so on.
Those nested calls are unpacked from the source and analyzed like direct calls;
a nested call whose arguments are not string literals is counted but not read.
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

SUBAGENT_TOOLS = {"spawn_agent", "create_agent", "delegate_to_agent"}
POLLING_TOOLS = {"sleep"}
READ_TOOLS = {"read", "read_file", "file_read"}
EDIT_TOOLS = {"write", "write_file", "edit", "edit_file"}
# Commands that print whole files. `cat a | head` is a pipeline and not a read.
FULL_READ_COMMANDS = {"cat", "nl"}
SHELL_WRAPPERS = {"bash", "sh", "zsh"}

CODE_MODE_TOOL = "exec"
CODE_MODE_CALL = re.compile(r"\btools\.(\w+)\s*\(")
JS_STRING = r"\"(?:[^\"\\]|\\.)*\"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`"
JS_FIRST_STRING = re.compile(JS_STRING, re.S)
JS_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "0": "\0"}


def js_string(literal: str) -> str:
    return re.sub(r"\\(.)", lambda m: JS_ESCAPES.get(m.group(1), m.group(1)), literal[1:-1], flags=re.S)


def js_property(chunk: str, key: str) -> str | None:
    m = re.search(r"\b" + key + r"\s*:\s*(" + JS_STRING + ")", chunk, re.S)
    return js_string(m.group(1)) if m else None


def code_mode_calls(source: str) -> list[tuple[str, dict[str, Any]]]:
    """Nested `tools.<name>(...)` calls of a code-mode program, in order."""
    matches = list(CODE_MODE_CALL.finditer(source))
    calls: list[tuple[str, dict[str, Any]]] = []
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(source)
        chunk = source[m.end():end]
        inp: dict[str, Any] = {}
        for key in ("cmd", "command", "workdir", "path", "file_path"):
            value = js_property(chunk, key)
            if value is not None:
                inp[key] = value
        if "apply_patch" in m.group(1):
            first = JS_FIRST_STRING.search(chunk)
            if first:
                inp["input"] = js_string(first.group(0))
        calls.append((m.group(1), inp))
    return calls


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
            # `["bash", "-lc", "<script>"]`: the script is the command.
            if len(strings) == 3 and Path(strings[0]).name in SHELL_WRAPPERS and strings[1] in {"-c", "-lc"}:
                return strings[2]
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


def shell_reads(command: str, cwd: str | None) -> list[str]:
    """Paths printed whole by `cat`/`nl` segments of a shell command.

    The command is split on `&&`, `||` and `;`; a leading `cd dir` moves the
    base for later relative paths. Segments with a pipe are filtered output and
    do not count; commands with substitution or redirection are skipped whole.
    """
    if re.search(r"[<>`]|\$\(", command):
        return []
    lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|")
    lexer.whitespace_split = True
    try:
        tokens = list(lexer)
    except ValueError:
        return []
    segments: list[list[str]] = [[]]
    for tok in tokens:
        if tok in {"&&", "||", ";"}:
            segments.append([])
        else:
            segments[-1].append(tok)
    base = cwd
    out: list[str] = []
    for seg in segments:
        if not seg or any(tok in {"|", "&", "|&"} for tok in seg):
            continue
        if seg[0] == "cd" and len(seg) == 2:
            base = norm_path(seg[1], base)
        elif seg[0] in FULL_READ_COMMANDS:
            out.extend(norm_path(p, base) for p in seg[1:] if not p.startswith("-"))
    return out


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

    def on_tool(name: str, inp: Any, call_id: str | None) -> None:
        t.tool(name, call_id)
        lname = name.lower()
        if lname == CODE_MODE_TOOL and isinstance(inp, dict) and isinstance(inp.get("input"), str):
            for nested_name, nested_inp in code_mode_calls(inp["input"]):
                on_tool(nested_name, nested_inp, None)
            return
        workdir = inp.get("workdir") if isinstance(inp, dict) else None
        base = norm_path(workdir, cwd) if isinstance(workdir, str) and workdir else cwd
        p = path_of(inp)
        if p and lname in READ_TOOLS:
            t.read(norm_path(p, base), True)
        if p and lname in EDIT_TOOLS:
            t.edit(norm_path(p, base))
        if "apply_patch" in lname:
            for changed in patch_paths(inp):
                t.edit(norm_path(changed, base))

        cmd = command_of(inp)
        if cmd:
            t.command(cmd)
            for read_path in shell_reads(cmd, base):
                t.read(read_path, True)

        t.skill(skill_name(name, inp, cmd))

        if lname in POLLING_TOOLS:
            t.polling()
        if lname in SUBAGENT_TOOLS:
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
