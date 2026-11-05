"""Tests for weekly hygiene integration and narrative protection on push."""

import importlib.util
import io
import json
import os
import sys
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location(
    "claude_insights", Path(__file__).parent / "claude-insights.py"
)
ci = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ci)


def make_row(narrative="", raw_html="", sessions=10):
    return {
        "week": "2026-06-14",
        "total_sessions": sessions,
        "narrative_summary": narrative,
        "raw_html": raw_html,
    }


def test_present_narrative_pushes_new_row_unchanged():
    new = make_row(narrative="What's working: ...", raw_html="<html>new</html>")
    out = ci.resolve_push_row(new, existing_row=None)
    assert out is not None
    assert out["narrative_summary"] == "What's working: ..."
    assert out["raw_html"] == "<html>new</html>"


def test_empty_new_preserves_existing_narrative_and_raw_html():
    new = make_row(narrative="", raw_html="<html>charts-only</html>", sessions=87)
    existing = make_row(narrative="prior narrative", raw_html="<html>old</html>")
    out = ci.resolve_push_row(new, existing_row=existing)
    assert out is not None
    assert out["narrative_summary"] == "prior narrative"
    assert out["raw_html"] == "<html>old</html>"
    # metrics still come from the new row
    assert out["total_sessions"] == 87


def test_empty_new_no_existing_skips_push():
    new = make_row(narrative="")
    out = ci.resolve_push_row(new, existing_row=None)
    assert out is None


def test_empty_new_existing_also_empty_skips_push():
    new = make_row(narrative="")
    existing = make_row(narrative="   ")
    out = ci.resolve_push_row(new, existing_row=existing)
    assert out is None


def test_allow_empty_forces_push_of_empty_narrative():
    new = make_row(narrative="")
    out = ci.resolve_push_row(new, existing_row=None, allow_empty=True)
    assert out is not None
    assert out["narrative_summary"] == ""


def test_whitespace_only_new_narrative_treated_as_empty():
    new = make_row(narrative="  \n  ")
    existing = make_row(narrative="prior narrative")
    out = ci.resolve_push_row(new, existing_row=existing)
    assert out is not None
    assert out["narrative_summary"] == "prior narrative"


AFTER = datetime(2026, 10, 5, 12, 34, 56, tzinfo=timezone.utc)
BEFORE = AFTER + timedelta(days=7)


def write_transcript(path, records, when):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(r) for r in records) + "\n")
    os.utime(path, (when.timestamp(), when.timestamp()))
    return path


def claude_records():
    return [
        {"type": "assistant", "cwd": "/private/secret-project", "message": {
            "usage": {"input_tokens": 11, "cache_read_input_tokens": 7,
                      "cache_creation_input_tokens": 3, "output_tokens": 5},
            "content": [{"type": "tool_use", "id": "1", "name": "Read",
                         "input": {"file_path": "/private/secret-file"}}],
        }},
        {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "id": "2", "name": "Read",
             "input": {"file_path": "/private/secret-file"}},
            {"type": "tool_use", "id": "3", "name": "Bash",
             "input": {"command": "xcodebuild -scheme secret-scheme"}},
        ]}},
        {"type": "user", "message": {"content": [
            {"type": "tool_result", "tool_use_id": "1", "content": "secret-result"},
        ]}},
    ]


def codex_records():
    return [
        {"type": "session_meta", "payload": {"cwd": "/private/codex-project"}},
        {"type": "response_item", "payload": {"type": "function_call", "name": "exec_command",
         "call_id": "x", "arguments": json.dumps({"cmd": "swift build"})}},
        {"type": "event_msg", "payload": {"type": "token_count", "info": {
            "total_token_usage": {"input_tokens": 100, "cached_input_tokens": 40,
                                  "output_tokens": 10, "reasoning_output_tokens": 2},
        }}},
    ]


@pytest.mark.parametrize("offset,included", [(-1, False), (0, True), (1, True), (604799, True), (604800, False)])
def test_hygiene_uses_exact_half_open_mtime_window(tmp_path, offset, included):
    root = tmp_path / "claude"
    # Record time deliberately disagrees with file mtime.
    records = claude_records()
    records[0]["timestamp"] = "2000-01-01T00:00:00Z"
    write_transcript(root / "secret-session.jsonl", records, AFTER + timedelta(seconds=offset))
    result = ci.collect_context_hygiene(AFTER, BEFORE, root)["claude"]
    assert result["sessions"] == int(included)
    assert result["repeated_reads"] == int(included)
    assert result["tokens"]["input"] == (11 if included else 0)


def test_hygiene_real_parsers_optional_codex_and_privacy(tmp_path):
    root, home = tmp_path / "claude", tmp_path / "codex"
    write_transcript(root / "secret-project/secret-session.jsonl", claude_records(), AFTER)
    for directory in ("sessions", "archived_sessions"):
        write_transcript(home / directory / "rollout-secret.jsonl", codex_records(), AFTER)
    assert set(ci.collect_context_hygiene(AFTER, BEFORE, root)) == {"claude"}
    result = ci.collect_context_hygiene(AFTER, BEFORE, root, home)
    assert result["claude"]["score"] == 11  # two full reads, one repeat, one raw build
    assert result["claude"]["tokens"] == {"input": 11, "cached": 7, "cache_creation": 3, "output": 5, "reasoning": 0}
    assert result["codex"]["sessions"] == 2
    assert result["codex"]["unfiltered_builds"] == 2
    assert result["codex"]["tokens"] == {"input": 120, "cached": 80, "cache_creation": 0, "output": 20, "reasoning": 4}
    expected_counters = {
        "sessions", "score", "tool_calls", "full_reads", "repeated_reads", "builds",
        "unfiltered_builds", "polling_candidates", "repeated_checks", "skill_loads",
        "duplicate_skill_loads", "subagents", "large_results", "result_chars", "parse_errors",
    }
    for agent in result.values():
        assert set(agent) == expected_counters | {"tokens"}
        assert all(type(v) in (int, float) for k, v in agent.items() if k != "tokens")
        assert all(type(v) in (int, float) for v in agent["tokens"].values())
    assert "secret" not in json.dumps(result)
    assert str(tmp_path) not in json.dumps(result)


def test_missing_transcript_roots_are_zero_aggregates(tmp_path):
    result = ci.collect_context_hygiene(AFTER, BEFORE, tmp_path / "missing-claude", tmp_path / "missing-codex")
    assert set(result) == {"claude", "codex"}
    for agent in result.values():
        assert all(v == 0 for k, v in agent.items() if k != "tokens")
        assert all(v == 0 for v in agent["tokens"].values())


def test_malformed_jsonl_contributes_only_aggregate_parse_errors(tmp_path):
    root = tmp_path / "claude"
    path = write_transcript(root / "secret.jsonl", claude_records(), AFTER)
    path.write_text(path.read_text() + "secret malformed input\n")
    os.utime(path, (AFTER.timestamp(), AFTER.timestamp()))
    result = ci.collect_context_hygiene(AFTER, BEFORE, root)
    assert result["claude"]["parse_errors"] == 1
    assert result["claude"]["tool_calls"] == 3
    assert "secret" not in json.dumps(result)


@pytest.mark.parametrize("usage_in_window", [False, True])
@pytest.mark.parametrize("with_codex", [False, True])
@pytest.mark.parametrize("explicit_dates", [False, True])
def test_main_json_includes_hygiene_with_report_bounds(tmp_path, monkeypatch, with_codex, explicit_dates, usage_in_window):
    usage = tmp_path / "usage"
    facets, metas = usage / "facets", usage / "session-meta"
    facets.mkdir(parents=True)
    metas.mkdir()
    start = AFTER if usage_in_window else AFTER - timedelta(days=30)
    metas.joinpath("s.json").write_text(json.dumps({"start_time": start.isoformat()}))
    root, home = tmp_path / "claude", tmp_path / "codex"
    for when, name in ((AFTER - timedelta(seconds=1), "before"), (AFTER, "start"), (BEFORE, "end")):
        write_transcript(root / f"{name}.jsonl", claude_records(), when)
        write_transcript(home / "sessions" / f"rollout-{name}.jsonl", codex_records(), when)
    monkeypatch.setattr(ci, "FACETS_DIR", facets)
    monkeypatch.setattr(ci, "SESSION_META_DIR", metas)
    monkeypatch.setattr(ci, "REPORT_HTML", usage / "missing.html")
    monkeypatch.setattr(ci, "load_env", lambda: None)
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", str(root.parent))
    # Default Claude discovery appends projects to CLAUDE_CONFIG_DIR.
    root.rename(tmp_path / "projects")
    monkeypatch.setenv("CODEX_HOME", str(home))
    after, before = (AFTER, BEFORE)
    args = ["ci", "--days", "7"]
    if explicit_dates:
        after = AFTER.replace(hour=0, minute=0, second=0)
        before = BEFORE.replace(hour=0, minute=0, second=0)
        args = ["ci", "--since", "2026-10-05", "--until", "2026-10-11"]
    if with_codex:
        args.append("--with-codex")
    monkeypatch.setattr(sys, "argv", args)

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return BEFORE

    monkeypatch.setattr(ci, "datetime", Clock)
    out = io.StringIO()
    with redirect_stdout(out):
        ci.main()
    report = json.loads(out.getvalue())
    assert report["context_hygiene"] == ci.collect_context_hygiene(after, before, tmp_path / "projects", home if with_codex else None)
    assert report["total_sessions"] == int(usage_in_window)
    assert report["context_hygiene"]["claude"]["sessions"] == (2 if explicit_dates else 1)
    assert set(report["context_hygiene"]) == ({"claude", "codex"} if with_codex else {"claude"})


@pytest.mark.parametrize("narrative,existing,allow_empty,expected", [
    ("new", None, False, "new"),
    ("", make_row("preserved", "<html>prior</html>"), False, "preserved"),
    ("", None, True, ""),
    ("", None, False, None),
    ("", make_row(" "), False, None),
])
def test_push_payload_carries_hygiene_without_bypassing_narrative_guard(monkeypatch, narrative, existing, allow_empty, expected):
    summary = {"period": {"from": "2026-10-05"}, **ci.aggregate({}, {}),
               "narrative_summary": narrative, "raw_html": "<html>new</html>",
               "context_hygiene": {"claude": {"sessions": 2, "score": 5}}}
    monkeypatch.setenv("SUPABASE_URL", "https://example.invalid")
    monkeypatch.setenv("SUPABASE_KEY", "test-key")
    monkeypatch.setattr(ci, "fetch_existing_row", lambda *args: existing)
    requests = []

    class Response:
        status = 201

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    def urlopen(request):
        requests.append(json.loads(request.data))
        return Response()

    monkeypatch.setattr(ci.urllib.request, "urlopen", urlopen)
    if expected is None:
        with pytest.raises(SystemExit) as exc:
            ci.push_to_supabase(summary, allow_empty)
        assert exc.value.code == 1
        assert requests == []
    else:
        ci.push_to_supabase(summary, allow_empty)
        assert requests[0]["context_hygiene"] == summary["context_hygiene"]
        assert requests[0]["narrative_summary"] == expected
        if expected == "preserved":
            assert requests[0]["raw_html"] == "<html>prior</html>"
