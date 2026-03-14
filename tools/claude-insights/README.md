# claude-insights

Aggregates Claude Code usage data (`~/.claude/usage-data/`) into a weekly JSON summary, pushes to Supabase, and notifies via Telegram.

## Architecture

```
~/.claude/usage-data/     Supabase (claude_insights)     Telegram (@ClaudeInsightsBot)
  facets/*.json      →   claude-insights.py --push   →   DB trigger → notify-insights
  session-meta/*.json                                     /latest → telegram-bot → query
```

- **claude-insights.py** — aggregates local JSON, pushes to Supabase
- **notify-insights** — Supabase Edge Function, called by DB webhook on INSERT/UPDATE, sends Telegram message
- **telegram-bot** — Supabase Edge Function, Telegram webhook handler, responds to `/latest`
- **_shared/format.ts** — shared message formatter used by both functions

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

## Scheduling

A macOS launchd agent runs the push every Sunday at 8:40 AM local time:

`~/Library/LaunchAgents/com.igormalyarov.claude-insights.weekly.plist`

## Infrastructure

- **Supabase project**: `uvnxjuzofcdxhdkrsocq` (West EU)
- **Table**: `public.claude_insights` (RLS enabled)
- **DB trigger**: `on_insights_change` → `notify_insights_webhook()` via `pg_net`
- **Edge Functions**: `notify-insights`, `telegram-bot` (both no-verify-jwt)
- **Secrets**: `BOT_TOKEN`, `INBOX_CHAT_ID` (set via `supabase secrets`)
- **Local credentials**: `tools/claude-insights/.env` (gitignored)

## Deploying Edge Functions

```bash
cd tools/claude-insights
export SUPABASE_ACCESS_TOKEN=<token>
supabase functions deploy notify-insights --no-verify-jwt --project-ref uvnxjuzofcdxhdkrsocq
supabase functions deploy telegram-bot --no-verify-jwt --project-ref uvnxjuzofcdxhdkrsocq
```

## Next steps

- Week-over-week comparison queries (`/compare` bot command)
