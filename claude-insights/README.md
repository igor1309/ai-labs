# claude-insights

Aggregates Claude Code usage data (`~/.claude/usage-data/`) into a weekly JSON summary, pushes to Supabase, and notifies via Telegram.

## Architecture

```
~/.claude/usage-data/     Supabase (claude_insights)     Telegram (@ClaudeInsightsBot)
  facets/*.json      →   claude-insights.py --push   →   DB trigger → notify-insights
  session-meta/*.json                                     /latest → telegram-bot → query
```

- **claude-insights.py** — aggregates local JSON, extracts narrative from `report.html`, pushes to Supabase (with `--push`, also pings the DB to prevent free-tier auto-pause)
- **notify-insights** — Supabase Edge Function, called by DB webhook on INSERT/UPDATE, sends Telegram message
- **telegram-bot** — Supabase Edge Function, Telegram webhook handler, responds to `/latest` and `/compare`
- **_shared/format.ts** — shared message formatter (HTML parse mode, narrative in blockquotes)
- **_shared/llm.ts** — LLM call helper for trend analysis via Nomos

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

# push to Supabase (triggers Telegram notification)
python3 tools/claude-insights/claude-insights.py --days 7 --push

# refresh cache first (runs `claude -p /insights --bare`), then push
python3 tools/claude-insights/claude-insights.py --days 7 --push --refresh
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
- **narrative_summary** — At a Glance sections from `/insights` report (working, hindering, quick wins, ambitious)
- **raw_html** — full `/insights` report for future comparisons

## Telegram Bot (@ClaudeInsightsBot)

- `/latest` — fetch the most recent week's summary from Supabase and display it
- `/start` — same as `/latest`
- `/compare` — fetch all weekly snapshots and return an LLM-generated trend analysis (via Nomos)
- **Auto-notification** — triggered by DB webhook on every insert/update to `claude_insights`

Message includes: dashboard numbers (sessions, commits, lines, friction, satisfaction, goals) and narrative sections (what's working, what's hindering, quick wins, ambitious workflows) in blockquotes.

## Scheduling

A macOS launchd agent runs the push every Sunday at 8:40 AM local time. Use `--refresh` to ensure the cache is fresh before collecting (requires `claude` CLI in PATH):

`~/Library/LaunchAgents/com.igormalyarov.claude-insights.weekly.plist`

## Infrastructure

- **Supabase project**: `uvnxjuzofcdxhdkrsocq` (West EU)
- **Table**: `public.claude_insights` (RLS enabled)
- **DB trigger**: `on_insights_change` → `notify_insights_webhook()` via `pg_net`
- **Edge Functions**: `notify-insights`, `telegram-bot` (both no-verify-jwt)
- **Secrets**: `BOT_TOKEN`, `INBOX_CHAT_ID`, `NOMOS_BASE_URL`, `NOMOS_API_KEY` (set via `supabase secrets`)
- **Local credentials**: `tools/claude-insights/.env` (gitignored)

## Deploying Edge Functions

```bash
cd tools/claude-insights
export SUPABASE_ACCESS_TOKEN=<token>
supabase functions deploy notify-insights --no-verify-jwt --project-ref uvnxjuzofcdxhdkrsocq
supabase functions deploy telegram-bot --no-verify-jwt --project-ref uvnxjuzofcdxhdkrsocq
```

## Next steps

- Configurable model selection for `/compare` analysis
