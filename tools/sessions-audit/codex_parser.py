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
CODE_MODE_CALL = re.compile(r"tools\.(\w+)\s*\(")
JS_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "0": "\0"}
CODE_MODE_KEYS = ("cmd", "command", "workdir", "path", "file_path", "input", "patch")
JS_KEY = re.compile(r"""(["']?)(\w+)\1\s*:\s*""")
# `nl` options whose value can be the next word (`nl -w 3 file`).
NL_VALUE_OPTIONS = {"-b", "-d", "-f", "-h", "-i", "-l", "-n", "-p", "-s", "-v", "-w"}


def js_string(literal: str) -> str:
    return re.sub(r"\\(.)", lambda m: JS_ESCAPES.get(m.group(1), m.group(1)), literal[1:-1], flags=re.S)


def js_skip(source: str, i: int) -> int | None:
    """End of the string or comment starting at `i`, or None if neither starts there."""
    two = source[i:i + 2]
    if two == "//":
        end = source.find("\n", i)
        return len(source) if end < 0 else end
    if two == "/*":
        end = source.find("*/", i + 2)
        return len(source) if end < 0 else end + 2
    quote = source[i:i + 1]
    if quote not in {'"', "'", "`"} or not quote:
        return None
    j = i + 1
    while j < len(source):
        c = source[j]
        if c == "\\":
            j += 2
        elif c == quote:
            return j + 1
        elif c == "\n" and quote != "`":
            return j  # unterminated: a regex literal holding a quote, say
        elif quote == "`" and source[j:j + 2] == "${":
            j = js_balanced(source, j + 2, "{", "}")
        else:
            j += 1
    return len(source)


def js_balanced(source: str, i: int, opener: str, closer: str) -> int:
    """Index just past the `closer` matching an `opener` already consumed before `i`."""
    depth = 1
    while i < len(source):
        end = js_skip(source, i)
        if end is not None:
            i = end
            continue
        if source[i] == opener:
            depth += 1
        elif source[i] == closer:
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return len(source)


def js_literal_at(source: str, i: int) -> str | None:
    """The value of a whole string-literal expression at `i`; None for anything else."""
    if source[i:i + 1] not in {'"', "'", "`"}:
        return None
    end = js_skip(source, i)
    literal = source[i:end]
    if len(literal) < 2 or literal[-1] != literal[0]:
        return None
    if literal[0] == "`" and "${" in literal:
        return None
    rest = source[end:].lstrip()
    if rest and rest[0] not in ",})":
        return None  # `"cat " + name`
    return js_string(literal)


def js_arguments(args: str) -> dict[str, Any]:
    """String-literal properties of a call's object argument, or its first string argument."""
    start = len(args) - len(args.lstrip())
    first = js_literal_at(args, start)
    if first is not None:
        return {"input": first}
    if args[start:start + 1] != "{":
        return {}
    inp: dict[str, Any] = {}
    i, depth, previous = start, 0, ""
    while i < len(args):
        if depth == 1 and previous in {"{", ","}:
            m = JS_KEY.match(args, i)
            if m:
                previous = ":"
                i = m.end()
                value = js_literal_at(args, i)
                if value is not None and m.group(2) in CODE_MODE_KEYS:
                    inp[m.group(2)] = value
                continue
        end = js_skip(args, i)
        if end is not None:
            previous = "x"
            i = end
            continue
        c = args[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        if not c.isspace():
            previous = c
        i += 1
    return inp


def code_mode_calls(source: str) -> list[tuple[str, dict[str, Any]]]:
    """Nested `tools.<name>(...)` calls of a code-mode program, in order.

    Text inside strings and comments is not code, so a patch or a grep that
    mentions `tools.x(` adds no call, and each call reads only its own arguments.
    """
    calls: list[tuple[str, dict[str, Any]]] = []
    i = 0
    while i < len(source):
        end = js_skip(source, i)
        if end is not None:
            i = end
            continue
        m = CODE_MODE_CALL.match(source, i)
        if m and (i == 0 or not (source[i - 1].isalnum() or source[i - 1] == "_")):
            close = js_balanced(source, m.end(), "(", ")")
            calls.append((m.group(1), js_arguments(source[m.end():close])))
            i = m.end()  # a call can sit inside another's arguments
            continue
        i += 1
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

    The command is split on newlines, `&&`, `||` and `;`; a `cd dir` moves the
    base for later relative paths. Segments with a pipe are filtered output and
    do not count; commands with substitution or redirection are skipped whole.
    """
    if re.search(r"[<>`]|\$\(", command):
        return []
    lexer = shlex.shlex(command.replace("\\\n", " "), posix=True, punctuation_chars=";&|\n")
    lexer.whitespace = " \t\r"
    lexer.whitespace_split = True
    lexer.commenters = ""
    try:
        tokens = list(lexer)
    except ValueError:
        return []
    segments: list[list[str]] = [[]]
    for tok in tokens:
        operator = tok.replace("\n", "")
        if not tok.strip(";&|\n") and operator in {"|", "|&", "&"}:
            segments[-1].append(operator)  # a pipe may continue on the next line
        elif not tok.strip(";&|\n"):
            segments.append([])
        else:
            segments[-1].append(tok)
    base = cwd
    out: list[str] = []
    for seg in segments:
        comment = next((i for i, tok in enumerate(seg) if tok.startswith("#")), None)
        if comment is not None:
            seg = seg[:comment]
        if not seg or any(tok in {"|", "&", "|&"} for tok in seg):
            continue
        if seg[0] == "cd" and len(seg) == 2:
            base = norm_path(seg[1], base)
        elif seg[0] in FULL_READ_COMMANDS:
            words = seg[1:]
            for i, word in enumerate(words):
                if word.startswith("-"):
                    continue
                if seg[0] == "nl" and i > 0 and words[i - 1] in NL_VALUE_OPTIONS:
                    continue
                path = norm_path(word, base)
                if "$" not in path:  # a shell variable names no known file
                    out.append(path)
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
