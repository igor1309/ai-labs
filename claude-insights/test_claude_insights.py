"""Tests for claude-insights push-row resolution (narrative protection)."""

import importlib.util
from pathlib import Path

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
