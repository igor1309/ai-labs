"""Tests for sessions-audit: parsers, core, CLI, JSON schema v1, wrappers."""

import io
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import contextlib
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import claude_parser  # noqa: E402
import codex_parser  # noqa: E402
import sessions_audit_core as core  # noqa: E402

NOW = datetime(2026, 10, 3, 12, 0, tzinfo=timezone.utc)


def write_jsonl(path, records, extra_lines=()):
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(r) for r in records] + list(extra_lines)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def c_tool(name, inp, tid, cwd=None, usage=None):
    rec = {
        "type": "assistant",
        "message": {"role": "assistant", "content": [{"type": "tool_use", "id": tid, "name": name, "input": inp}]},
    }
    if cwd:
        rec["cwd"] = cwd
    if usage:
        rec["message"]["usage"] = usage
    return rec


def c_result(tid, content):
    block = {"type": "tool_result", "content": content}
    if tid is not None:
        block["tool_use_id"] = tid
    return {"type": "user", "message": {"role": "user", "content": [block]}}


def x_call(name, args, cid):
    return {"type": "response_item", "payload": {"type": "function_call", "name": name, "arguments": json.dumps(args), "call_id": cid}}


def x_output(cid, output):
    return {"type": "response_item", "payload": {"type": "function_call_output", "call_id": cid, "output": output}}


def x_tokens(total, last_input):
    return {
        "type": "event_msg",
        "payload": {"type": "token_count", "info": {"total_token_usage": total, "last_token_usage": {"input_tokens": last_input}}},
    }


def x_exec(source, cid):
    """A code-mode `exec` call, shaped like current Codex rollouts."""
    return {"type": "response_item", "payload": {"type": "custom_tool_call", "name": "exec", "input": source, "call_id": cid}}


def js_cmd(cmd, **extra):
    props = ", ".join([f"cmd:{json.dumps(cmd)}", *(f"{k}:{json.dumps(v)}" for k, v in extra.items()), "max_output_tokens:10000"])
    return f"tools.exec_command({{{props}}})"


def codex_one(tmp_path, records, threshold=20_000):
    f = write_jsonl(tmp_path / "rollout-m.jsonl", [{"type": "session_meta", "payload": {"cwd": str(tmp_path)}}, *records])
    return codex_parser.analyze(f, threshold)


def claude_one(tmp_path, records, threshold=20_000):
    return claude_parser.analyze(write_jsonl(tmp_path / "s.jsonl", records), threshold)


def run_cli(argv, now=NOW):
    out, err = io.StringIO(), io.StringIO()
    rc = core.main(argv, now=now, out=out, err=err)
    return rc, out.getvalue(), err.getvalue()


def run_json(argv, now=NOW):
    rc, out, _ = run_cli(argv + ["--json"], now=now)
    assert rc == 0
    return json.loads(out)


def make_both(tmp_path):
    croot = tmp_path / "claude"
    usage = {"input_tokens": 1, "cache_creation_input_tokens": 2, "cache_read_input_tokens": 3, "output_tokens": 4}
    write_jsonl(croot / "p/s1.jsonl", [
        c_tool("Read", {"file_path": "/a"}, "1", cwd="/nowhere/c", usage=usage),
        c_tool("Read", {"file_path": "/a"}, "2"),
    ])
    xhome = tmp_path / "codex"
    write_jsonl(xhome / "sessions/rollout-1.jsonl", [
        {"type": "session_meta", "payload": {"cwd": "/nowhere/x"}},
        x_call("exec", {"cmd": "xcodebuild"}, "1"),
        x_tokens({"input_tokens": 100, "cached_input_tokens": 40, "output_tokens": 10, "reasoning_output_tokens": 5, "total_tokens": 110}, 100),
    ])
    return croot, xhome


def usage_sum(n):
    return {"input_tokens": n, "cache_creation_input_tokens": 2 * n, "cache_read_input_tokens": 3 * n, "output_tokens": 4 * n}


def windowed_root(tmp_path):
    root = tmp_path / "claude"
    ages = {"old": NOW - timedelta(days=10), "mid": NOW - timedelta(days=3), "new": NOW - timedelta(hours=1)}
    for name, when in ages.items():
        f = write_jsonl(root / f"{name}.jsonl", [c_tool("Bash", {"command": "ls"}, "1")])
        ts = when.timestamp()
        os.utime(f, (ts, ts))
    return root


def names(d):
    return sorted(Path(s["path"]).stem for s in d["agents"]["claude"]["sessions"])


def usage_error(argv, now=NOW):
    """Run the CLI expecting an argparse error; return (exit code, stderr)."""
    err = io.StringIO()
    with contextlib.redirect_stderr(err):
        try:
            core.main(argv, now=now)
        except SystemExit as e:
            return e.code, err.getvalue()
    raise AssertionError(f"no usage error for {argv}")


def run_script(*args):
    return subprocess.run([sys.executable, *map(str, args)], capture_output=True, text=True, check=False)


class SessionsAuditTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp_path = Path(self._tmp.name).resolve()

    # --------------------------------------------------------------------------
    # Claude parser


    def test_claude_full_and_repeated_reads_with_edit_in_between(self):
        tmp_path = self.tmp_path
        f = write_jsonl(tmp_path / "s.jsonl", [
            c_tool("Read", {"file_path": "a.txt"}, "1", cwd=str(tmp_path)),
            c_tool("Read", {"file_path": str(tmp_path / "a.txt")}, "2"),  # repeated (same normalized path)
            c_tool("Edit", {"file_path": "a.txt"}, "3"),
            c_tool("Read", {"file_path": "a.txt", "offset": 10}, "4"),  # partial, not repeated (edit)
            c_tool("Read", {"file_path": "a.txt", "limit": 5}, "5"),  # partial, repeated
        ])
        s = claude_parser.analyze(f, 20_000)
        assert s.tool_calls == 5
        assert s.full_reads == 2
        assert s.repeated_reads == 2
        assert s.tool_names["Read"] == 4


    def test_claude_builds_polling_and_repeated_checks(self):
        tmp_path = self.tmp_path
        f = write_jsonl(tmp_path / "s.jsonl", [
            c_tool("Bash", {"command": "xcodebuild test -scheme X"}, "1"),
            c_tool("Bash", {"command": "xcodebuild build | xcsift"}, "2"),
            c_tool("Bash", {"command": "swift build -quiet"}, "3"),
            c_tool("Bash", {"command": "sleep 30"}, "4"),
            c_tool("Bash", {"command": "gh run watch 123"}, "5"),
            c_tool("Bash", {"command": "curl https://x"}, "6"),
            c_tool("Bash", {"command": "curl   https://x"}, "7"),  # repeated (whitespace-normalized)
            c_tool("Bash", {"command": "ls"}, "8"),  # resets
            c_tool("Bash", {"command": "curl https://x"}, "9"),
        ])
        s = claude_parser.analyze(f, 20_000)
        assert s.builds == 3
        assert s.unfiltered_builds == 1
        assert s.polling_candidates == 2
        assert s.repeated_checks == 1


    def test_claude_skills_and_subagents(self):
        tmp_path = self.tmp_path
        f = write_jsonl(tmp_path / "s.jsonl", [
            c_tool("Skill", {"skill": "foo"}, "1"),
            c_tool("Skill", {"skill": "foo"}, "2"),
            c_tool("Read", {"file_path": "/x/bar/SKILL.md"}, "3"),
            c_tool("Bash", {"command": "cat /x/baz/SKILL.md"}, "4"),
            c_tool("Agent", {"prompt": "p", "model": "opus"}, "5"),
            c_tool("Task", {"prompt": "p"}, "6"),
        ])
        s = claude_parser.analyze(f, 20_000)
        assert s.skill_loads == 4
        assert s.duplicate_skill_loads == 1
        assert s.subagents == 2
        assert dict(s.subagent_models) == {"opus": 1, "unspecified": 1}


    def test_claude_large_results_and_pending_id_filter(self):
        tmp_path = self.tmp_path
        f = write_jsonl(tmp_path / "s.jsonl", [
            c_tool("Bash", {"command": "ls"}, "known"),
            c_result("known", "x" * 150),
            c_result("unknown", "y" * 500),  # no matching tool_use: ignored
            c_result(None, "z" * 50),  # no id: sized
        ])
        s = claude_parser.analyze(f, 100)
        assert s.result_chars == 200
        assert s.largest_result_chars == 150
        assert s.large_results == 1


    def test_claude_parse_errors_cwd_and_tokens(self):
        tmp_path = self.tmp_path
        usage = {"input_tokens": 10, "cache_creation_input_tokens": 20, "cache_read_input_tokens": 300, "output_tokens": 7}
        f = write_jsonl(
            tmp_path / "s.jsonl",
            [c_tool("Bash", {"command": "ls"}, "1", cwd="/first", usage=usage),
             c_tool("Bash", {"command": "ls"}, "2", cwd="/second", usage=usage)],
            extra_lines=["{not json"],
        )
        s = claude_parser.analyze(f, 20_000)
        assert s.parse_errors == 1
        assert s.cwd == "/first"
        assert s.extras == {"usage": {"input_tokens": 20, "cache_creation_input_tokens": 40, "cache_read_input_tokens": 600, "output_tokens": 14}, "sidechain_files": 0}
        assert s.tokens == {"input": 20, "cached": 600, "cache_creation": 40, "output": 14, "reasoning": 0}


    def test_claude_discovery_skips_orphaned_and_superseded(self):
        tmp_path = self.tmp_path
        for name in ("a.jsonl", "b.orphaned-1.jsonl", "c.superseded-2.jsonl", "sub/subagents/d.jsonl"):
            write_jsonl(tmp_path / name, [])
        names = [p.name for p in claude_parser.discover(tmp_path)]
        assert names == ["a.jsonl", "d.jsonl"]


    # --------------------------------------------------------------------------
    # Codex parser


    def test_codex_reads_cat_and_apply_patch(self):
        tmp_path = self.tmp_path
        patch = "*** Begin Patch\n*** Update File: a.txt\n@@\n-x\n+y\n*** End Patch\n"
        f = write_jsonl(tmp_path / "rollout-1.jsonl", [
            {"type": "session_meta", "payload": {"cwd": str(tmp_path)}},
            x_call("read_file", {"path": "a.txt"}, "1"),
            x_call("shell", {"command": "cat a.txt"}, "2"),  # repeated via cat
            {"type": "response_item", "payload": {"type": "custom_tool_call", "name": "apply_patch", "input": patch, "call_id": "3"}},
            x_call("shell", {"command": "cd x && cat " + str(tmp_path / "a.txt")}, "4"),  # after edit: not repeated
            x_call("shell", {"command": "cat a.txt | head"}, "5"),  # pipeline: not a read
            x_call("shell", {"command": "cat -n a.txt b.txt"}, "6"),  # a repeated, b new
        ])
        s = codex_parser.analyze(f, 20_000)
        assert s.tool_calls == 6
        assert s.full_reads == 5
        assert s.repeated_reads == 2


    def test_codex_commands_skills_subagents(self):
        tmp_path = self.tmp_path
        f = write_jsonl(tmp_path / "rollout-1.jsonl", [
            x_call("exec", {"cmd": "xcodebuild -scheme X"}, "1"),
            x_call("exec", {"cmd": "swift test | xcbeautify"}, "2"),
            x_call("exec", {"cmd": "sleep 5"}, "3"),
            x_call("exec", {"cmd": "gh pr checks 9"}, "4"),
            x_call("exec", {"cmd": "gh pr checks 9"}, "5"),
            x_call("load_skill", {"name": "s1"}, "6"),
            x_call("exec", {"cmd": "sed -n 1,50p /p/s1/SKILL.md"}, "7"),
            x_call("exec", {"cmd": "sed -n 1,50p /p/s1/SKILL.md"}, "8"),
            x_call("spawn_agent", {"model": "gpt-x"}, "9"),
            x_call("delegate_to_agent", {}, "10"),
            {"type": "local_shell_call", "call_id": "11", "action": {"type": "exec"}},  # legacy top-level item
        ])
        s = codex_parser.analyze(f, 20_000)
        assert s.tool_calls == 11
        assert s.builds == 2 and s.unfiltered_builds == 1
        assert s.polling_candidates == 1
        assert s.repeated_checks == 1
        assert s.skill_loads == 3 and s.duplicate_skill_loads == 1
        assert s.subagents == 2
        assert dict(s.subagent_models) == {"gpt-x": 1, "unspecified": 1}
        assert s.tool_names["local_shell_call"] == 1


    def test_codex_outputs_event_msg_ignored_and_tokens(self):
        tmp_path = self.tmp_path
        f = write_jsonl(
            tmp_path / "rollout-1.jsonl",
            [
                {"type": "turn_context", "payload": {"cwd": "/turn"}},
                x_call("exec", {"cmd": "ls"}, "1"),
                x_output("1", "a" * 120),
                x_output("orphan", "b" * 30),  # no visible call: still sized
                {"type": "function_call_output", "call_id": "legacy", "output": "c" * 10},  # legacy top-level
                {"type": "event_msg", "payload": {"type": "exec_command_end", "output": "a" * 120}},  # copy: ignored
                {"type": "event_msg", "payload": {"type": "item_completed", "item": {"output": "a" * 999}}},
                x_tokens({"input_tokens": 100, "cached_input_tokens": 60, "output_tokens": 9, "reasoning_output_tokens": 4, "total_tokens": 109}, 80),
                x_tokens({"input_tokens": 250, "cached_input_tokens": 200, "output_tokens": 20, "reasoning_output_tokens": 8, "total_tokens": 270}, 150),
                x_tokens({"input_tokens": 250, "cached_input_tokens": 200, "output_tokens": 20, "reasoning_output_tokens": 8, "total_tokens": 270}, 40),
            ],
            extra_lines=["garbage"],
        )
        s = codex_parser.analyze(f, 100)
        assert s.result_chars == 160
        assert s.large_results == 1
        assert s.largest_result_chars == 120
        assert s.parse_errors == 1
        assert s.cwd == "/turn"  # no session_meta: first turn_context
        assert s.extras["token_total"] == {"input_tokens": 250, "cached_input_tokens": 200, "output_tokens": 20, "reasoning_output_tokens": 8, "total_tokens": 270}
        assert s.extras["peak_last_input_tokens"] == 150
        assert s.tokens == {"input": 50, "cached": 200, "cache_creation": 0, "output": 20, "reasoning": 8}
        assert core.total_tokens(s.tokens) == 270


    def test_codex_session_meta_cwd_preferred_and_clamp(self):
        tmp_path = self.tmp_path
        f = write_jsonl(tmp_path / "rollout-1.jsonl", [
            {"type": "turn_context", "payload": {"cwd": "/turn"}},
            {"type": "session_meta", "payload": {"cwd": "/meta"}},
            x_tokens({"input_tokens": 5, "cached_input_tokens": 9, "cache_write_input_tokens": 3}, 1),
        ])
        s = codex_parser.analyze(f, 100)
        assert s.cwd == "/meta"
        assert s.tokens["input"] == 0
        assert s.tokens["cache_creation"] == 3


    def test_codex_discovery_active_only(self):
        tmp_path = self.tmp_path
        write_jsonl(tmp_path / "sessions/2026/10/01/rollout-a.jsonl", [])
        write_jsonl(tmp_path / "archived_sessions/rollout-b.jsonl", [])
        assert [p.name for p in codex_parser.discover(tmp_path)] == ["rollout-b.jsonl", "rollout-a.jsonl"]
        assert [p.name for p in codex_parser.discover(tmp_path, active_only=True)] == ["rollout-a.jsonl"]


    # --------------------------------------------------------------------------
    # CLI and JSON schema


    def test_json_all_both_agents_shape(self):
        tmp_path = self.tmp_path
        croot, xhome = make_both(tmp_path)
        d = run_json(["all", "--claude-root", str(croot), "--codex-home", str(xhome), "--top", "1"])
        assert d["schema_version"] == 1
        assert d["generated_at"] == NOW.isoformat()
        assert d["window"] == {"since": None, "until": None, "basis": "file_mtime"}
        assert d["options"] == {"large_result_chars": 20_000, "top": 1, "score_weights": core.SCORE_WEIGHTS}
        assert set(d["agents"]) == {"claude", "codex"}
        c, x = d["agents"]["claude"], d["agents"]["codex"]
        assert c["source"] == {"root": str(croot)}
        assert x["source"] == {"home": str(xhome), "active_only": False}
        assert "by_project" not in c
        assert c["totals"]["repeated_reads"] == 1 and c["totals"]["score"] == 6
        assert c["totals"]["tokens"] == {"input": 1, "cached": 3, "cache_creation": 2, "output": 4, "reasoning": 0}
        assert c["extras"] == {"usage": usage_sum(1), "sidechain_files": 0}
        assert x["extras"]["peak_last_input_tokens"] == 100
        assert x["extras"]["token_totals"]["total_tokens"] == 110
        assert x["totals"]["unfiltered_builds"] == 1 and x["totals"]["score"] == 5
        assert x["top_tools"] == [["exec", 1]]
        sess = c["sessions"][0]
        for key in ("agent", "path", "mtime", "cwd", "project", "score", "builds", "skill_loads",
                    "result_chars", "largest_result_chars", "parse_errors", "tokens", "extras"):
            assert key in sess
        assert sess["agent"] == "claude" and sess["cwd"] == "/nowhere/c" and sess["project"] == "/nowhere/c"
        assert x["sessions"][0]["extras"]["peak_last_input_tokens"] == 100
        t = d["totals"]
        assert t["sessions"] == 2 and t["tool_calls"] == 3 and t["score"] == 11
        assert t["tokens"] == {"input": 61, "cached": 43, "cache_creation": 2, "output": 14, "reasoning": 5}


    def test_sessions_not_limited_by_top(self):
        tmp_path = self.tmp_path
        croot = tmp_path / "claude"
        for i in range(3):
            write_jsonl(croot / f"s{i}.jsonl", [c_tool("Bash", {"command": "ls"}, "1")])
        d = run_json(["claude", "--claude-root", str(croot), "--top", "1"])
        assert len(d["agents"]["claude"]["sessions"]) == 3


    def test_all_with_missing_root_warns_and_skips(self):
        tmp_path = self.tmp_path
        croot, _ = make_both(tmp_path)
        rc, out, err = run_cli(["all", "--claude-root", str(croot), "--codex-home", str(tmp_path / "nope"), "--json"])
        assert rc == 0
        assert "warning: codex" in err
        d = json.loads(out)
        assert list(d["agents"]) == ["claude"]
        assert d["totals"]["sessions"] == 1


    def test_single_agent_missing_root_is_error(self):
        tmp_path = self.tmp_path
        code, err = usage_error(["codex", "--codex-home", str(tmp_path / "nope")])
        assert code == 2
        assert "CODEX_HOME does not exist" in err


    def test_text_output_all_has_combined_line(self):
        tmp_path = self.tmp_path
        croot, xhome = make_both(tmp_path)
        rc, out, _ = run_cli(["all", "--claude-root", str(croot), "--codex-home", str(xhome), "--by-project"])
        assert rc == 0
        assert "Claude Code session audit" in out and "Codex session audit" in out
        assert "tokens (normalized):" in out
        assert "Highest-signal sessions:" in out
        assert "By project" in out
        assert "Combined: sessions 2" in out


    # --------------------------------------------------------------------------
    # Time window


    def test_window_days(self):
        tmp_path = self.tmp_path
        root = windowed_root(tmp_path)
        d = run_json(["claude", "--claude-root", str(root), "--days", "5"])
        assert names(d) == ["mid", "new"]
        assert d["window"]["since"] == (NOW - timedelta(days=5)).isoformat()
        assert names(run_json(["claude", "--claude-root", str(root), "--days", "1"])) == ["new"]


    def test_window_since_until(self):
        tmp_path = self.tmp_path
        root = windowed_root(tmp_path)
        since = (NOW - timedelta(days=5)).isoformat()
        until = (NOW - timedelta(days=1)).isoformat()
        d = run_json(["claude", "--claude-root", str(root), "--since", since, "--until", until])
        assert names(d) == ["mid"]
        assert d["window"] == {"since": since, "until": until, "basis": "file_mtime"}
        # --until is exclusive: a file exactly at the bound is excluded
        at = (NOW - timedelta(hours=1)).isoformat()
        assert "new" not in names(run_json(["claude", "--claude-root", str(root), "--until", at]))


    def test_date_only_until_is_start_of_day_local(self):
        tmp_path = self.tmp_path
        root = tmp_path / "claude"
        f = write_jsonl(root / "s.jsonl", [])
        local_noon = datetime(2026, 10, 1, 12, 0).astimezone()
        os.utime(f, (local_noon.timestamp(),) * 2)
        assert names(run_json(["claude", "--claude-root", str(root), "--until", "2026-10-02"])) == ["s"]
        assert names(run_json(["claude", "--claude-root", str(root), "--until", "2026-10-01"])) == []
        assert names(run_json(["claude", "--claude-root", str(root), "--since", "2026-10-01"])) == ["s"]
        assert names(run_json(["claude", "--claude-root", str(root), "--since", "2026-10-02"])) == []
        assert core.parse_when("2026-10-02") == datetime(2026, 10, 2).astimezone()
        assert core.parse_when("2026-10-02T03:04:05Z") == datetime(2026, 10, 2, 3, 4, 5, tzinfo=timezone.utc)


    def test_days_and_since_are_mutually_exclusive(self):
        tmp_path = self.tmp_path
        assert usage_error(["claude", "--claude-root", str(tmp_path), "--days", "1", "--since", "2026-10-01"])[0] == 2


    def test_invalid_since_is_error(self):
        tmp_path = self.tmp_path
        assert usage_error(["claude", "--claude-root", str(tmp_path), "--since", "yesterday"])[0] == 2


    # --------------------------------------------------------------------------
    # By-project grouping


    def test_resolve_project_plain_repo_worktree_and_fallbacks(self):
        tmp_path = self.tmp_path
        main = tmp_path / "main"
        (main / ".git" / "worktrees" / "wt").mkdir(parents=True)
        (main / "src" / "deep").mkdir(parents=True)
        (main / ".git" / "worktrees" / "wt" / "commondir").write_text("../..\n")
        wt = tmp_path / "elsewhere" / "wt"
        (wt / "pkg").mkdir(parents=True)
        (wt / ".git").write_text(f"gitdir: {main / '.git' / 'worktrees' / 'wt'}\n")
        # linked worktree without commondir file (relative gitdir)
        wt2 = tmp_path / "wt2"
        wt2.mkdir()
        (main / ".git" / "worktrees" / "wt2").mkdir()
        (wt2 / ".git").write_text("gitdir: ../main/.git/worktrees/wt2\n")

        assert core.resolve_project(str(main / "src" / "deep")) == str(main)
        assert core.resolve_project(str(wt / "pkg")) == str(main)
        assert core.resolve_project(str(wt2)) == str(main)
        gone = str(tmp_path / "does-not-exist")
        assert core.resolve_project(gone) == gone
        norepo = tmp_path / "plain"
        norepo.mkdir()
        # no repo anywhere above tmp_path is assumed; fall back to cwd itself
        if not any((p / ".git").exists() for p in (norepo, *norepo.parents)):
            assert core.resolve_project(str(norepo)) == str(norepo)
        assert core.resolve_project(None) == "(unknown)"


    def test_by_project_json_and_grouping(self):
        tmp_path = self.tmp_path
        main = tmp_path / "repo"
        (main / ".git" / "worktrees" / "w").mkdir(parents=True)
        (main / ".git" / "worktrees" / "w" / "commondir").write_text("../..")
        (main / "sub").mkdir()
        wt = tmp_path / "w"
        wt.mkdir()
        (wt / ".git").write_text(f"gitdir: {main}/.git/worktrees/w")
        root = tmp_path / "claude"
        write_jsonl(root / "a.jsonl", [c_tool("Read", {"file_path": "/f"}, "1", cwd=str(main / "sub")),
                                       c_tool("Read", {"file_path": "/f"}, "2")])
        write_jsonl(root / "b.jsonl", [c_tool("Bash", {"command": "ls"}, "1", cwd=str(wt))])
        write_jsonl(root / "c.jsonl", [c_tool("Bash", {"command": "ls"}, "1", cwd="/missing/dir")])
        write_jsonl(root / "d.jsonl", [c_tool("Bash", {"command": "ls"}, "1")])
        d = run_json(["claude", "--claude-root", str(root), "--by-project"])
        rows = d["agents"]["claude"]["by_project"]
        assert rows[0]["project"] == str(main)
        assert rows[0]["sessions"] == 2 and rows[0]["score"] == 6 and rows[0]["tool_calls"] == 3
        assert {r["project"] for r in rows} == {str(main), "/missing/dir", "(unknown)"}
        assert "tokens" in rows[0]
        by_name = {Path(s["path"]).stem: s for s in d["agents"]["claude"]["sessions"]}
        assert by_name["b"]["project"] == str(main) and by_name["b"]["cwd"] == str(wt)
        assert by_name["d"]["cwd"] is None and by_name["d"]["project"] == "(unknown)"


    # --------------------------------------------------------------------------
    # Entry point and old wrappers


    def test_entry_point_is_executable(self):
        tmp_path = self.tmp_path
        croot, xhome = make_both(tmp_path)
        exe = HERE / "sessions-audit"
        assert os.access(exe, os.X_OK)
        r = subprocess.run([str(exe), "all", "--claude-root", str(croot), "--codex-home", str(xhome), "--json"],
                           capture_output=True, text=True, check=False)
        assert r.returncode == 0, r.stderr
        assert json.loads(r.stdout)["schema_version"] == 1


    def test_old_wrappers_accept_old_flags(self):
        tmp_path = self.tmp_path
        croot, xhome = make_both(tmp_path)
        r = run_script(HERE / "audit_claude_sessions.py", "--root", croot, "--days", "30", "--top", "3",
                       "--large-result-chars", "100", "--json")
        assert r.returncode == 0, r.stderr
        d = json.loads(r.stdout)
        assert list(d["agents"]) == ["claude"] and d["agents"]["claude"]["totals"]["sessions"] == 1

        write_jsonl(xhome / "archived_sessions/rollout-old.jsonl", [x_call("exec", {"cmd": "ls"}, "1")])
        r = run_script(HERE / "audit_codex_sessions.py", "--home", xhome, "--active-only", "--json")
        assert r.returncode == 0, r.stderr
        d = json.loads(r.stdout)
        assert list(d["agents"]) == ["codex"]
        assert d["agents"]["codex"]["totals"]["sessions"] == 1
        assert d["agents"]["codex"]["source"]["active_only"] is True

        r = run_script(HERE / "audit_codex_sessions.py", "--home", xhome)
        assert r.returncode == 0 and "Codex session audit" in r.stdout
        r = run_script(HERE / "audit_claude_sessions.py", "--root", tmp_path / "nope")
        assert r.returncode == 2 and "transcript root does not exist" in r.stderr


    # --------------------------------------------------------------------------
    # Review round 1


    def test_symlink_alias_main_and_worktree_group_as_one_project(self):
        tmp_path = self.tmp_path
        main = tmp_path / "repo"
        (main / ".git" / "worktrees" / "wt").mkdir(parents=True)
        (main / ".git" / "worktrees" / "wt" / "commondir").write_text("../..\n")
        (main / "src").mkdir()
        alias = tmp_path / "alias"
        alias.symlink_to(main, target_is_directory=True)
        wt = tmp_path / "wt"
        wt.mkdir()
        # the worktree's gitdir points through the alias: the root must still canonicalize
        (wt / ".git").write_text(f"gitdir: {alias}/.git/worktrees/wt\n")
        wt_alias = tmp_path / "wt-alias"
        wt_alias.symlink_to(wt, target_is_directory=True)

        canonical = str(main.resolve())
        for cwd in (main, main / "src", alias, alias / "src", wt, wt_alias):
            assert core.resolve_project(str(cwd)) == canonical, cwd

        root = tmp_path / "claude"
        for i, cwd in enumerate((main / "src", alias, wt_alias)):
            write_jsonl(root / f"s{i}.jsonl", [c_tool("Bash", {"command": "ls"}, "1", cwd=str(cwd))])
        rows = run_json(["claude", "--claude-root", str(root), "--by-project"])["agents"]["claude"]["by_project"]
        assert [(r["project"], r["sessions"]) for r in rows] == [(canonical, 3)]


    def test_missing_cwd_fallback_is_normpath_only(self):
        tmp_path = self.tmp_path
        raw = str(tmp_path / "gone" / "x" / ".." / "y") + "/"
        assert core.resolve_project(raw) == os.path.normpath(raw)


    def test_bad_days_is_argparse_error(self):
        for days in ("999999999", "-1"):
            with self.subTest(days=days):
                code, err = usage_error(["claude", "--claude-root", str(self.tmp_path), "--days", days])
                assert code == 2
                assert "--days" in err


    def test_multi_session_aggregates(self):
        tmp_path = self.tmp_path
        croot = tmp_path / "claude"
        write_jsonl(croot / "c1.jsonl", [
            c_tool("Read", {"file_path": "/a"}, "r1", usage={"input_tokens": 10, "cache_creation_input_tokens": 20, "cache_read_input_tokens": 30, "output_tokens": 40}),
            c_tool("Read", {"file_path": "/a"}, "r2"),
            c_tool("Bash", {"command": "xcodebuild test"}, "b1"),
            c_tool("Agent", {"prompt": "p", "model": "opus"}, "a1"),
            c_result("b1", "x" * 150),
        ])
        u2 = {"input_tokens": 1, "cache_creation_input_tokens": 2, "cache_read_input_tokens": 3, "output_tokens": 4}
        write_jsonl(croot / "c2.jsonl", [
            c_tool("Bash", {"command": "sleep 1"}, "s1", usage=u2),
            c_tool("Bash", {"command": "curl https://x"}, "k1"),
            c_tool("Bash", {"command": "curl https://x"}, "k2", usage=u2),
            c_tool("Skill", {"skill": "foo"}, "sk1"),
            c_tool("Skill", {"skill": "foo"}, "sk2"),
            c_tool("Task", {"prompt": "p"}, "t1"),
            c_result("nope", "y" * 999),
            c_result("k1", "z" * 50),
        ], extra_lines=["{broken"])

        xhome = tmp_path / "codex"
        write_jsonl(xhome / "sessions/rollout-1.jsonl", [
            {"type": "session_meta", "payload": {"cwd": "/w"}},
            x_call("exec", {"cmd": "cat /f"}, "1"),
            x_call("exec", {"cmd": "cat /f"}, "2"),
            x_call("exec", {"cmd": "swift build | xcsift"}, "3"),
            x_output("1", "a" * 120),
            x_tokens({"input_tokens": 100, "cached_input_tokens": 60, "output_tokens": 10, "reasoning_output_tokens": 4, "total_tokens": 110}, 70),
            x_tokens({"input_tokens": 200, "cached_input_tokens": 150, "output_tokens": 20, "reasoning_output_tokens": 8, "total_tokens": 220}, 90),
        ])
        write_jsonl(xhome / "sessions/rollout-2.jsonl", [
            x_call("spawn_agent", {"model": "m1"}, "1"),
            x_call("exec", {"cmd": "gh run watch 7"}, "2"),
            x_call("load_skill", {"name": "s"}, "3"),
            x_call("load_skill", {"name": "s"}, "4"),
            x_output("2", "b" * 30),
            x_tokens({"input_tokens": 50, "cached_input_tokens": 10, "cache_write_input_tokens": 5, "output_tokens": 5, "reasoning_output_tokens": 1, "total_tokens": 55}, 120),
        ])

        d = run_json(["all", "--claude-root", str(croot), "--codex-home", str(xhome), "--large-result-chars", "100"])
        c, x = d["agents"]["claude"], d["agents"]["codex"]

        assert c["totals"] == {
            "sessions": 2, "tool_calls": 10, "full_reads": 2, "repeated_reads": 1, "builds": 1,
            "unfiltered_builds": 1, "polling_candidates": 1, "repeated_checks": 1, "skill_loads": 2,
            "duplicate_skill_loads": 1, "subagents": 2, "large_results": 1, "result_chars": 200,
            "parse_errors": 1, "score": 19,
            "tokens": {"input": 12, "cached": 36, "cache_creation": 24, "output": 48, "reasoning": 0},
        }
        assert c["extras"] == {"usage": {"input_tokens": 12, "cache_creation_input_tokens": 24, "cache_read_input_tokens": 36, "output_tokens": 48}, "sidechain_files": 0}
        assert c["subagent_models"] == {"opus": 1, "unspecified": 1}
        assert c["top_tools"] == [["Bash", 4], ["Read", 2], ["Skill", 2], ["Agent", 1], ["Task", 1]]

        assert x["totals"] == {
            "sessions": 2, "tool_calls": 7, "full_reads": 2, "repeated_reads": 1, "builds": 1,
            "unfiltered_builds": 0, "polling_candidates": 1, "repeated_checks": 0, "skill_loads": 2,
            "duplicate_skill_loads": 1, "subagents": 1, "large_results": 1, "result_chars": 150,
            "parse_errors": 0, "score": 11,
            "tokens": {"input": 90, "cached": 160, "cache_creation": 5, "output": 25, "reasoning": 9},
        }
        assert x["extras"] == {
            "token_totals": {"input_tokens": 250, "cached_input_tokens": 160, "output_tokens": 25,
                             "reasoning_output_tokens": 9, "total_tokens": 275, "cache_write_input_tokens": 5},
            "peak_last_input_tokens": 120,
        }
        assert x["subagent_models"] == {"m1": 1}
        assert x["top_tools"] == [["exec", 4], ["load_skill", 2], ["spawn_agent", 1]]

        assert d["totals"] == {
            "sessions": 4, "tool_calls": 17, "full_reads": 4, "repeated_reads": 2, "builds": 2,
            "unfiltered_builds": 1, "polling_candidates": 2, "repeated_checks": 1, "skill_loads": 4,
            "duplicate_skill_loads": 2, "subagents": 3, "large_results": 2, "result_chars": 350,
            "parse_errors": 1, "score": 30,
            "tokens": {"input": 102, "cached": 196, "cache_creation": 29, "output": 73, "reasoning": 9},
        }


    def test_when_at_the_calendar_limits_is_a_usage_error(self):
        for flag in ("--since", "--until"):
            for value in ("0001-01-01", "9999-12-31"):
                with self.subTest(flag=flag, value=value):
                    code, err = usage_error(["claude", "--claude-root", str(self.tmp_path), flag, value], now=None)
                    assert code == 2
                    assert "invalid date/datetime" in err


    # ----------------------------------------------------------------------
    # Metric matrix: one positive and one negative fixture per metric


    def test_claude_metric_positive_and_negative(self):
        cases = {
            "full_reads": ([c_tool("Read", {"file_path": "/a"}, "1")], [c_tool("Read", {"file_path": "/a", "offset": 1, "limit": 5}, "1")]),
            "repeated_reads": (
                [c_tool("Read", {"file_path": "/a"}, "1"), c_tool("Read", {"file_path": "/a"}, "2")],
                [c_tool("Read", {"file_path": "/a"}, "1"), c_tool("Edit", {"file_path": "/a"}, "2"), c_tool("Read", {"file_path": "/a"}, "3")],
            ),
            "builds": ([c_tool("Bash", {"command": "xcodebuild test"}, "1")], [c_tool("Bash", {"command": "echo xcodebuildish"}, "1")]),
            "unfiltered_builds": (
                [c_tool("Bash", {"command": "swift test"}, "1")],
                [c_tool("Bash", {"command": "swift test 2>&1 | xcsift"}, "1")],
            ),
            "polling_candidates": ([c_tool("Bash", {"command": "sleep 30"}, "1")], [c_tool("Bash", {"command": "echo sleepy"}, "1")]),
            "repeated_checks": (
                [c_tool("Bash", {"command": "gh pr checks 1"}, "1"), c_tool("Bash", {"command": "gh pr checks 1"}, "2")],
                [c_tool("Bash", {"command": "gh pr checks 1"}, "1"), c_tool("Bash", {"command": "git push"}, "2"), c_tool("Bash", {"command": "gh pr checks 1"}, "3")],
            ),
            "skill_loads": ([c_tool("Skill", {"skill": "s"}, "1")], [c_tool("Read", {"file_path": "/notes.md"}, "1")]),
            "duplicate_skill_loads": (
                [c_tool("Skill", {"skill": "s"}, "1"), c_tool("Skill", {"skill": "s"}, "2")],
                [c_tool("Skill", {"skill": "s"}, "1"), c_tool("Skill", {"skill": "t"}, "2")],
            ),
            "subagents": ([c_tool("Agent", {"prompt": "p"}, "1")], [c_tool("Bash", {"command": "ls"}, "1")]),
            "large_results": (
                [c_tool("Bash", {"command": "ls"}, "1"), c_result("1", "x" * 100)],
                [c_tool("Bash", {"command": "ls"}, "1"), c_result("1", "x" * 99), c_result("unknown", "y" * 500)],
            ),
        }
        for metric, (pos, neg) in cases.items():
            with self.subTest(metric=metric):
                assert getattr(claude_one(self.tmp_path, pos, 100), metric) >= 1
                assert getattr(claude_one(self.tmp_path, neg, 100), metric) == 0
        with self.subTest(metric="parse_errors"):
            assert claude_parser.analyze(write_jsonl(self.tmp_path / "e.jsonl", [], ["{nope"]), 100).parse_errors == 1
            assert claude_one(self.tmp_path, [c_tool("Bash", {"command": "ls"}, "1")]).parse_errors == 0

    def test_codex_metric_positive_and_negative(self):
        t = self.tmp_path
        patch = "*** Begin Patch\n*** Update File: a.swift\n@@\n-x\n+y\n*** End Patch\n"
        cases = {
            "full_reads": ([x_exec(js_cmd("cat a.swift"), "1")], [x_exec(js_cmd("sed -n 1,40p a.swift"), "1")]),
            "repeated_reads": (
                [x_exec(js_cmd("nl -ba a.swift") + ";\n" + js_cmd("cat a.swift"), "1")],
                [x_exec(js_cmd("cat a.swift"), "1"), x_exec(f"tools.apply_patch({json.dumps(patch)})", "2"), x_exec(js_cmd("cat a.swift"), "3")],
            ),
            "builds": ([x_exec(js_cmd("swift build --build-tests"), "1")], [x_exec(js_cmd("swift package resolve"), "1")]),
            "unfiltered_builds": (
                [x_exec(js_cmd("xcodebuild -scheme App test"), "1")],
                [x_exec(js_cmd("swift build --build-tests > /tmp/b.log 2>&1; tail -10 /tmp/b.log"), "1")],
            ),
            "polling_candidates": (
                [x_call("sleep", {"duration_ms": 30000}, "1")],
                [x_call("wait", {"cell_id": "c1", "max_tokens": 100}, "1")],
            ),
            "repeated_checks": (
                [x_exec(js_cmd("gh pr checks 12"), "1"), x_exec(js_cmd("gh pr checks 12"), "2")],
                [x_exec(js_cmd("gh pr checks 12"), "1"), x_exec(js_cmd("gh pr checks 13"), "2")],
            ),
            "skill_loads": (
                [x_call("exec_command", {"cmd": "sed -n '1,240p' /p/dev/SKILL.md", "workdir": str(t)}, "1")],
                [x_call("exec_command", {"cmd": "sed -n '1,240p' /p/dev/README.md", "workdir": str(t)}, "1")],
            ),
            "duplicate_skill_loads": (
                [x_exec(js_cmd("cat /p/dev/SKILL.md"), "1"), x_exec(js_cmd("cat /p/dev/SKILL.md"), "2")],
                [x_exec(js_cmd("cat /p/dev/SKILL.md"), "1"), x_exec(js_cmd("cat /p/ops/SKILL.md"), "2")],
            ),
            "subagents": (
                [x_call("spawn_agent", {"agent_type": "worker", "message": "m", "task_name": "t"}, "1")],
                [x_call("wait_agent", {"timeout_ms": 1000}, "1"), x_call("send_message", {"message": "m", "target": "a"}, "2")],
            ),
            "large_results": (
                [{"type": "response_item", "payload": {"type": "custom_tool_call_output", "call_id": "1", "output": "x" * 100}}],
                [{"type": "event_msg", "payload": {"type": "exec_command_end", "output": "x" * 500}}],
            ),
        }
        for metric, (pos, neg) in cases.items():
            with self.subTest(metric=metric):
                assert getattr(codex_one(t, pos, 100), metric) >= 1
                assert getattr(codex_one(t, neg, 100), metric) == 0
        with self.subTest(metric="parse_errors"):
            f = write_jsonl(t / "rollout-e.jsonl", [], ["{nope"])
            assert codex_parser.analyze(f, 100).parse_errors == 1
            assert codex_one(t, [x_call("exec_command", {"cmd": "ls"}, "1")]).parse_errors == 0

    # ----------------------------------------------------------------------
    # Codex code mode and shell commands


    def test_codex_code_mode_unpacks_nested_tool_calls(self):
        t = self.tmp_path
        source = (
            "const r = await Promise.allSettled([\n"
            + js_cmd("cat a.swift; cat b.swift") + ",\n"
            + js_cmd("cat c.swift", workdir=str(t / "sub")) + ",\n"
            + "tools.exec_command({cmd:'nl -ba \\'d e.swift\\'', max_output_tokens:1}),\n"
            + "tools.exec_command({cmd: someVariable}),\n"
            + "tools.write_stdin({session_id: 3, chars: ''}),\n"
            + "]);\ntext(JSON.stringify(r));"
        )
        s = codex_one(t, [x_exec(source, "1")])
        assert s.tool_names["exec"] == 1
        assert s.tool_names["exec_command"] == 4
        assert s.tool_names["write_stdin"] == 1
        assert s.tool_calls == 6
        assert s.full_reads == 4  # a, b, sub/c, "d e"
        assert s.repeated_reads == 0

    def test_codex_code_mode_apply_patch_backtick_resets_reads(self):
        t = self.tmp_path
        patch = "`*** Begin Patch\n*** Update File: a.swift\n@@\n-x\n+y\n*** End Patch`"
        s = codex_one(t, [
            x_exec(js_cmd("cat a.swift"), "1"),
            x_exec(f"await tools.apply_patch({patch});", "2"),
            x_exec(js_cmd("cat " + str(t / "a.swift")), "3"),
            x_exec(js_cmd("cat a.swift"), "4"),
        ])
        assert s.full_reads == 3
        assert s.repeated_reads == 1

    def test_codex_shell_reads_segments_cd_and_pipes(self):
        cwd = "/w"
        assert codex_parser.shell_reads("cat a && cat b || cat c; cat d", cwd) == ["/w/a", "/w/b", "/w/c", "/w/d"]
        assert codex_parser.shell_reads("cd sub && cat a", cwd) == ["/w/sub/a"]
        assert codex_parser.shell_reads("cat a | head -5; nl -ba b", cwd) == ["/w/b"]
        assert codex_parser.shell_reads("cat a > b", cwd) == []
        assert codex_parser.shell_reads("cat $(ls)", cwd) == []
        assert codex_parser.shell_reads("cat 'unterminated", cwd) == []
        assert codex_parser.shell_reads("sed -n 1,10p a", cwd) == []

    def test_codex_legacy_shell_argv_unwraps_bash_lc(self):
        s = codex_one(self.tmp_path, [
            x_call("shell", {"command": ["bash", "-lc", "cat a.txt && xcodebuild test"]}, "1"),
            x_call("shell", {"command": ["git", "status"]}, "2"),
        ])
        assert s.full_reads == 1
        assert s.unfiltered_builds == 1

    def test_codex_exec_command_workdir_is_the_read_base(self):
        t = self.tmp_path
        s = codex_one(t, [
            x_call("exec_command", {"cmd": "cat a.txt", "workdir": str(t / "w")}, "1"),
            x_call("exec_command", {"cmd": "cat " + str(t / "w" / "a.txt")}, "2"),
            x_call("exec_command", {"cmd": "cat a.txt"}, "3"),  # session cwd: another file
        ])
        assert s.full_reads == 3
        assert s.repeated_reads == 1

    def test_codex_event_msg_duplicates_do_not_inflate_sizes(self):
        s = codex_one(self.tmp_path, [
            x_exec(js_cmd("ls"), "1"),
            {"type": "response_item", "payload": {"type": "custom_tool_call_output", "call_id": "1", "output": [{"type": "input_text", "text": "x" * 50}]}},
            {"type": "event_msg", "payload": {"type": "exec_command_end", "aggregated_output": "x" * 50}},
            {"type": "event_msg", "payload": {"type": "item_completed", "item": {"output": "x" * 50}}},
        ])
        assert s.result_chars == len(json.dumps([{"type": "input_text", "text": "x" * 50}], separators=(",", ":")))

    def test_codex_cumulative_token_count_is_not_summed(self):
        total = {"input_tokens": 100, "cached_input_tokens": 40, "output_tokens": 10, "total_tokens": 110}
        s = codex_one(self.tmp_path, [x_tokens(total, 70), x_tokens(total, 70), x_tokens(dict(total, input_tokens=90), 5)])
        assert s.tokens["input"] == 60
        assert s.tokens["output"] == 10
        assert s.extras["peak_last_input_tokens"] == 70

    # ----------------------------------------------------------------------
    # Claude sidechains, build filters, score weights, display paths


    def test_claude_subagent_transcripts_count_in_their_parent(self):
        root = self.tmp_path / "projects" / "p"
        parent = write_jsonl(root / "sess.jsonl", [
            c_tool("Read", {"file_path": "/a"}, "1", usage={"input_tokens": 1, "output_tokens": 2}),
            c_tool("Agent", {"prompt": "p"}, "2"),
        ])
        write_jsonl(root / "sess" / "subagents" / "agent-1.jsonl", [
            c_tool("Read", {"file_path": "/a"}, "s1", usage={"input_tokens": 10, "output_tokens": 20}),  # own context: not repeated
            c_tool("Read", {"file_path": "/a"}, "s2"),
        ])
        write_jsonl(root / "gone" / "subagents" / "agent-2.jsonl", [c_tool("Read", {"file_path": "/b"}, "o1")])
        found = claude_parser.discover(self.tmp_path / "projects")
        assert [p.relative_to(root).as_posix() for p in found] == ["gone/subagents/agent-2.jsonl", "sess.jsonl"]
        s = claude_parser.analyze(parent, 100)
        assert s.full_reads == 3
        assert s.repeated_reads == 1
        assert s.subagents == 1
        assert s.tool_calls == 4
        assert s.extras["sidechain_files"] == 1
        assert s.extras["usage"] == {"input_tokens": 11, "output_tokens": 22}
        assert s.tokens["output"] == 22
        orphan = claude_parser.analyze(found[0], 100)
        assert orphan.full_reads == 1 and orphan.extras["sidechain_files"] == 0

    def test_build_filters(self):
        filtered = [
            "xcodebuild test | xcsift", "xcodebuild -quiet test", "swift build > /tmp/b.log 2>&1",
            "swift build >>b.log", "swift build &> b.log", "swift test 2>&1 | tail -20", "swift test | grep error:",
        ]
        unfiltered = ["xcodebuild test", "swift build 2>&1", "swift build 2>/dev/null", "swift test 2>&1 | cat"]
        for cmd in filtered + unfiltered:
            with self.subTest(cmd=cmd):
                assert core.RAW_BUILD.search(cmd)
                assert bool(core.BUILD_FILTER.search(cmd)) == (cmd in filtered)

    def test_score_uses_documented_weights(self):
        counters = {k: 1 for k in core.SCORE_WEIGHTS}
        assert core.score_of(counters) == sum(core.SCORE_WEIGHTS.values()) == 18
        assert core.score_of({"repeated_reads": 2}, {"repeated_reads": 10}) == 20
        assert core.score_of({"tool_calls": 50, "builds": 9, "polling_candidates": 9}) == 0
        readme = (HERE / "README.md").read_text(encoding="utf-8")
        for k, w in core.SCORE_WEIGHTS.items():
            assert f"| `{k}` | {w} |" in readme

    def test_text_output_prints_paths_relative_to_the_root(self):
        croot, xhome = make_both(self.tmp_path)
        rc, out, _ = run_cli(["all", "--claude-root", str(croot), "--codex-home", str(xhome)])
        assert rc == 0
        assert str(self.tmp_path) not in out
        assert core.display_path("/r/x/s.jsonl", "/r") == "x/s.jsonl"
        assert core.display_path(str(Path.home() / "s.jsonl"), "/elsewhere") == "~/s.jsonl"
        assert core.display_path("/other/s.jsonl", "/r") == "/other/s.jsonl"


if __name__ == "__main__":
    unittest.main()
