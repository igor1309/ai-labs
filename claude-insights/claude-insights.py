#!/usr/bin/env python3
"""Aggregate Claude Code usage data (facets + session-meta) into a weekly JSON summary."""

import argparse
import html.parser
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

USAGE_DIR = Path.home() / ".claude" / "usage-data"
FACETS_DIR = USAGE_DIR / "facets"
SESSION_META_DIR = USAGE_DIR / "session-meta"
REPORT_HTML = USAGE_DIR / "report.html"
SCRIPT_DIR = Path(__file__).resolve().parent
ENV_FILE = SCRIPT_DIR / ".env"


def load_jsons(directory: Path) -> dict[str, dict]:
    """Load all JSON files from directory, keyed by stem (session_id)."""
    result = {}
    for path in directory.glob("*.json"):
        try:
            data = json.loads(path.read_text())
            result[path.stem] = data
        except (json.JSONDecodeError, OSError):
            continue
    return result


def filter_by_date(sessions: dict[str, dict], after: datetime, before: datetime) -> dict[str, dict]:
    """Keep sessions whose start_time falls within [after, before)."""
    filtered = {}
    for sid, meta in sessions.items():
        start = meta.get("start_time")
        if not start:
            continue
        ts = datetime.fromisoformat(start.replace("Z", "+00:00"))
        if after <= ts < before:
            filtered[sid] = meta
    return filtered


def aggregate(facets: dict[str, dict], metas: dict[str, dict]) -> dict:
    """Merge facets and session-meta into a single summary."""
    total_sessions = len(metas)
    total_duration = sum(m.get("duration_minutes", 0) for m in metas.values())
    total_messages = sum(m.get("user_message_count", 0) for m in metas.values())
    lines_added = sum(m.get("lines_added", 0) for m in metas.values())
    lines_removed = sum(m.get("lines_removed", 0) for m in metas.values())
    total_commits = sum(m.get("git_commits", 0) for m in metas.values())

    tool_counts: Counter = Counter()
    language_counts: Counter = Counter()
    goal_counts: Counter = Counter()
    friction_counts: Counter = Counter()
    satisfaction_counts: Counter = Counter()
    outcome_counts: Counter = Counter()
    helpfulness_counts: Counter = Counter()
    session_type_counts: Counter = Counter()
    project_counts: Counter = Counter()

    for meta in metas.values():
        for tool, count in meta.get("tool_counts", {}).items():
            tool_counts[tool] += count
        for lang, count in meta.get("languages", {}).items():
            language_counts[lang] += count
        project = meta.get("project_path", "unknown")
        project_counts[project] += 1

    for sid, facet in facets.items():
        if sid not in metas:
            continue
        for goal, count in facet.get("goal_categories", {}).items():
            goal_counts[goal] += count
        for friction, count in facet.get("friction_counts", {}).items():
            friction_counts[friction] += count
        for sat, count in facet.get("user_satisfaction_counts", {}).items():
            satisfaction_counts[sat] += count
        outcome = facet.get("outcome")
        if outcome:
            outcome_counts[outcome] += 1
        helpfulness = facet.get("claude_helpfulness")
        if helpfulness:
            helpfulness_counts[helpfulness] += 1
        stype = facet.get("session_type")
        if stype:
            session_type_counts[stype] += 1

    return {
        "total_sessions": total_sessions,
        "total_duration_minutes": total_duration,
        "total_user_messages": total_messages,
        "lines_added": lines_added,
        "lines_removed": lines_removed,
        "total_commits": total_commits,
        "tools": dict(tool_counts.most_common()),
        "languages": dict(language_counts.most_common()),
        "goals": dict(goal_counts.most_common()),
        "friction": dict(friction_counts.most_common()),
        "satisfaction": dict(satisfaction_counts.most_common()),
        "outcomes": dict(outcome_counts.most_common()),
        "helpfulness": dict(helpfulness_counts.most_common()),
        "session_types": dict(session_type_counts.most_common()),
        "projects": dict(project_counts.most_common()),
    }


def strip_html_tags(text: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    clean = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", clean).strip()


def extract_narrative(html_path: Path) -> tuple[str, str]:
    """Extract narrative summary and raw HTML from the insights report.

    Returns (narrative_summary, raw_html). Narrative contains all four
    At a Glance sections: working, hindering, quick wins, ambitious workflows.
    """
    if not html_path.exists():
        return "", ""

    raw_html = html_path.read_text()

    # Extract glance-section divs
    sections = re.findall(
        r'<div class="glance-section">(.*?)</div>', raw_html, re.DOTALL
    )

    parts = []
    for section in sections[:4]:
        # Remove <a> tags before stripping all HTML
        section = re.sub(r"<a[^>]*>.*?</a>", "", section, flags=re.DOTALL)
        text = strip_html_tags(section)
        parts.append(text)

    narrative = "\n\n".join(parts)
    return narrative, raw_html


def load_env():
    """Load .env file from script directory into os.environ."""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def refresh_insights() -> bool:
    """Run 'claude -p /insights --bare' to refresh the usage-data cache."""
    claude = shutil.which("claude")
    if not claude:
        print("Error: claude CLI not found in PATH", file=sys.stderr)
        return False
    print("Refreshing insights cache via claude CLI...", file=sys.stderr)
    result = subprocess.run(
        [claude, "-p", "/insights", "--bare"],
        capture_output=True, text=True, timeout=600,
    )
    if result.returncode != 0:
        print(f"claude /insights failed (exit {result.returncode}): {result.stderr[:500]}", file=sys.stderr)
        return False
    print("Insights cache refreshed", file=sys.stderr)
    return True


def ping_supabase() -> None:
    """Lightweight SELECT to prevent Supabase free-tier auto-pause."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        return
    endpoint = f"{url}/rest/v1/claude_insights?select=week&limit=1"
    req = urllib.request.Request(
        endpoint,
        method="GET",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
        print("Supabase keep-alive ping OK", file=sys.stderr)
    except urllib.error.HTTPError as e:
        print(f"Supabase keep-alive ping failed: HTTP {e.code}", file=sys.stderr)


def push_to_supabase(summary: dict) -> None:
    """Upsert summary into Supabase claude_insights table."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_KEY required (set in .env or environment)", file=sys.stderr)
        sys.exit(1)

    row = {
        "week": summary["period"]["from"],
        "total_sessions": summary["total_sessions"],
        "total_duration_minutes": summary["total_duration_minutes"],
        "total_user_messages": summary["total_user_messages"],
        "lines_added": summary["lines_added"],
        "lines_removed": summary["lines_removed"],
        "total_commits": summary["total_commits"],
        "tools": summary["tools"],
        "languages": summary["languages"],
        "goals": summary["goals"],
        "friction": summary["friction"],
        "satisfaction": summary["satisfaction"],
        "outcomes": summary["outcomes"],
        "helpfulness": summary["helpfulness"],
        "session_types": summary["session_types"],
        "projects": summary["projects"],
        "narrative_summary": summary.get("narrative_summary", ""),
        "raw_html": summary.get("raw_html", ""),
    }

    endpoint = f"{url}/rest/v1/claude_insights"
    data = json.dumps(row).encode()
    req = urllib.request.Request(
        endpoint,
        data=data,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
        print(f"Pushed to Supabase (week={row['week']}, HTTP {status})", file=sys.stderr)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"Supabase error: HTTP {e.code} — {body}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=7, help="Look back N days (default: 7)")
    parser.add_argument("--since", type=str, help="Start date YYYY-MM-DD (overrides --days)")
    parser.add_argument("--until", type=str, help="End date YYYY-MM-DD (default: now)")
    parser.add_argument("--output", "-o", type=str, help="Write JSON to file instead of stdout")
    parser.add_argument("--push", action="store_true", help="Push summary to Supabase")
    parser.add_argument("--refresh", action="store_true", help="Run claude /insights to refresh cache before collecting")
    args = parser.parse_args()

    load_env()

    if args.refresh:
        if not refresh_insights():
            sys.exit(1)

    now = datetime.now(timezone.utc)
    before = datetime.fromisoformat(args.until + "T00:00:00+00:00") + timedelta(days=1) if args.until else now
    if args.since:
        after = datetime.fromisoformat(args.since + "T00:00:00+00:00")
    else:
        after = now - timedelta(days=args.days)

    if args.push:
        ping_supabase()

    if not FACETS_DIR.is_dir() or not SESSION_META_DIR.is_dir():
        print(f"Error: usage data not found at {USAGE_DIR}", file=sys.stderr)
        sys.exit(1)

    all_metas = load_jsons(SESSION_META_DIR)
    all_facets = load_jsons(FACETS_DIR)

    metas = filter_by_date(all_metas, after, before)
    if not metas:
        print(f"No sessions found between {after.date()} and {before.date()}", file=sys.stderr)
        sys.exit(0)

    narrative, raw_html = extract_narrative(REPORT_HTML)

    summary = {
        "period": {"from": str(after.date()), "to": str(before.date())},
        "generated_at": now.isoformat(),
        **aggregate(all_facets, metas),
        "narrative_summary": narrative,
        "raw_html": raw_html,
    }

    output = json.dumps(summary, indent=2)
    if args.output:
        Path(args.output).write_text(output + "\n")
        print(f"Written to {args.output}", file=sys.stderr)
    else:
        print(output)

    if args.push:
        push_to_supabase(summary)


if __name__ == "__main__":
    main()
