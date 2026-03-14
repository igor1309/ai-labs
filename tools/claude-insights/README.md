# claude-insights

Aggregates Claude Code usage data (`~/.claude/usage-data/`) into a weekly JSON summary.

Reads raw `facets/*.json` and `session-meta/*.json` directly — no HTML parsing, no external dependencies.

## Usage

```bash
# last 7 days (default)
python3 tools/claude-insights/claude-insights.py

# last 30 days
python3 tools/claude-insights/claude-insights.py --days 30

# specific date range
python3 tools/claude-insights/claude-insights.py --since 2026-03-01 --until 2026-03-07

# write to file
python3 tools/claude-insights/claude-insights.py -o weekly.json
```

## Output

JSON with aggregated metrics:

- **sessions** — count, duration, user messages
- **code** — lines added/removed, commits
- **tools** — usage counts per tool
- **languages** — file types touched
- **goals** — what you worked on
- **friction** — where things went wrong
- **satisfaction** — session satisfaction distribution
- **outcomes/helpfulness** — how sessions resolved
- **projects** — sessions per repo

## Next steps

- Store weekly snapshots in Supabase for trend tracking
- Cron automation (e.g. Mondays 9AM)
- Week-over-week comparison queries
