#!/usr/bin/env python3
"""Aggregate Claude Code usage data (facets + session-meta) into a weekly JSON summary."""

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

USAGE_DIR = Path.home() / ".claude" / "usage-data"
FACETS_DIR = USAGE_DIR / "facets"
SESSION_META_DIR = USAGE_DIR / "session-meta"


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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=7, help="Look back N days (default: 7)")
    parser.add_argument("--since", type=str, help="Start date YYYY-MM-DD (overrides --days)")
    parser.add_argument("--until", type=str, help="End date YYYY-MM-DD (default: now)")
    parser.add_argument("--output", "-o", type=str, help="Write JSON to file instead of stdout")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    before = datetime.fromisoformat(args.until + "T00:00:00+00:00") + timedelta(days=1) if args.until else now
    if args.since:
        after = datetime.fromisoformat(args.since + "T00:00:00+00:00")
    else:
        after = now - timedelta(days=args.days)

    if not FACETS_DIR.is_dir() or not SESSION_META_DIR.is_dir():
        print(f"Error: usage data not found at {USAGE_DIR}", file=sys.stderr)
        sys.exit(1)

    all_metas = load_jsons(SESSION_META_DIR)
    all_facets = load_jsons(FACETS_DIR)

    metas = filter_by_date(all_metas, after, before)
    if not metas:
        print(f"No sessions found between {after.date()} and {before.date()}", file=sys.stderr)
        sys.exit(0)

    summary = {
        "period": {"from": str(after.date()), "to": str(before.date())},
        "generated_at": now.isoformat(),
        **aggregate(all_facets, metas),
    }

    output = json.dumps(summary, indent=2)
    if args.output:
        Path(args.output).write_text(output + "\n")
        print(f"Written to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
