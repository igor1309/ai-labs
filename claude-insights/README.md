# claude-insights

Landing page: index.html

Aggregates Claude Code usage data (`~/.claude/usage-data/`) into a weekly JSON summary, pushes to Supabase, and notifies via Telegram.

## Architecture

```
~/.claude/usage-data/     Supabase (claude_insights)     Telegram (@ClaudeInsightsBot)
  facets/*.json      →   claude-insights.py --push   →   DB trigger → notify-insights
  session-meta/*.json                                     /latest → telegram-bot → query
```

- **claude-insights.py** — aggregates local JSON, extracts narrative from `report.html`, and directly imports the shared sessions analyzer from `tools/sessions-audit` to read local Claude transcripts and, with `--with-codex`, Codex rollouts. Only allowlisted numeric hygiene aggregates enter the report and Supabase row. With `--push`, it also pings the DB to prevent free-tier auto-pause.
- **notify-insights** — Supabase Edge Function, called by DB webhook on INSERT/UPDATE, fetches the most recent strictly older snapshot and sends the digest with numeric hygiene deltas.
- **telegram-bot** — Supabase Edge Function; `/latest` fetches the latest two snapshots for the same digest, and `/compare` sends a hygiene series alongside usage metrics to the LLM.
- **_shared/format.ts** — shared message formatter (Markdown rich message, compact hygiene block per available agent, narrative in blockquotes).
- **_shared/hygiene.ts** — allowlist for numeric hygiene fields from stored rows; older snapshots with no hygiene remain unavailable.
- **_shared/llm.ts** — LLM call helper for trend analysis via Nomos.

## Usage

```bash
# last 7 days (default)
python3 claude-insights/claude-insights.py

# include Codex context hygiene alongside Claude
python3 claude-insights/claude-insights.py --days 7 --with-codex

# last 30 days
python3 claude-insights/claude-insights.py --days 30

# specific date range
python3 claude-insights/claude-insights.py --since 2026-03-01 --until 2026-03-07

# write to file
python3 claude-insights/claude-insights.py -o weekly.json

# after Igor confirmation: push to Supabase (triggers Telegram notification)
python3 claude-insights/claude-insights.py --days 7 --push

# refresh cache first (runs `claude --print /insights`), then push
python3 claude-insights/claude-insights.py --days 7 --push --refresh

# push a metrics-only row even when the narrative is empty (bypasses the guard)
python3 claude-insights/claude-insights.py --days 7 --push --allow-empty-narrative
```

### Narrative protection on push

The model-generated narrative ("At a Glance") can be missing from `report.html`
when `claude /insights` is rate-limited or interrupted (the chart data is still
written, but the narrative is not). To avoid broadcasting a thin digest, `--push`:

- never overwrites an existing non-empty `narrative_summary`/`raw_html` with an empty one;
- **skips the push entirely** (exit 1, loud warning) when the narrative is empty and no
  existing narrative exists for that week — so the DB webhook never fires a degraded
  Telegram message;
- logs loudly whenever the narrative is empty.

Use `--allow-empty-narrative` to force a metrics-only push.
Hygiene metrics follow the new row even when an existing narrative is preserved;
their presence does not bypass the degraded-push guard.

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
- **context_hygiene.claude** — aggregate sessions, weighted avoidable-context score, tool calls, full/repeated reads, builds/unfiltered builds, polling candidates, repeated checks, skill/duplicate skill loads, subagents, large results, result characters and parse errors; normalized `tokens` contains input, cached, cache_creation, output and reasoning counts.
- **context_hygiene.codex** — the same numeric fields, present only with `--with-codex`; includes active and archived rollouts.
- **narrative_summary** — At a Glance sections from `/insights` report (working, hindering, quick wins, ambitious)
- **raw_html** — full `/insights` report for future comparisons

Hygiene uses the exact report datetime bounds `[after, before)`, including the
time of day for `--days`. `--since` is UTC midnight and `--until` includes that
whole UTC day. Analyzer membership uses transcript **file modification time**,
while usage metrics use **session start_time**. A selected transcript contributes
its whole contents (and attributed subagents), so the session populations and
token counts can differ; these are not per-message weekly token totals.

Claude transcripts come from `$CLAUDE_CONFIG_DIR/projects` (default
`~/.claude/projects`); Codex uses `$CODEX_HOME/sessions` and
`$CODEX_HOME/archived_sessions` (default `~/.codex`). A missing root contributes
zero counters and tokens for that requested agent, indistinguishable from an
empty window. Usage-data facets and session-meta are still required. Raw analyzer
data stays local: the new section exports no paths, commands, session details,
project names, tool names or model names. This restriction applies to hygiene;
the existing projects and narrative report fields retain their original content.
When no usage-data session started within the window, the report still includes
hygiene, with zero usage totals, so resumed sessions and Codex activity remain visible.

## Telegram Bot (@ClaudeInsightsBot)

- `/latest` — fetch the most recent week's summary from Supabase and display it
- `/start` — same as `/latest`
- `/compare` — fetch all weekly snapshots and return an LLM-generated trend analysis (via Nomos)
- **Auto-notification** — triggered by DB webhook on every insert/update to `claude_insights`

Message includes: dashboard numbers (sessions, commits, lines, friction, satisfaction, goals) and narrative sections (what's working, what's hindering, quick wins, ambitious workflows) in blockquotes.
Available agents also get a compact Context hygiene block with absolute numeric
deltas against the preceding stored snapshot when its matching fields exist.
That snapshot can be more than a week old. Missing/null hygiene on older rows
renders no block or invented zero baseline. `/compare` likewise treats those
weeks as unavailable rather than zero.
If the webhook cannot read the preceding snapshot, it sends the current digest
without deltas.

## Scheduling

A macOS launchd agent runs the push every Sunday at 8:40 AM local time. Use `--refresh` to ensure the cache is fresh before collecting (requires `claude` CLI in PATH):

`~/Library/LaunchAgents/com.igormalyarov.claude-insights.weekly.plist`

## Infrastructure

- **Supabase project**: `uvnxjuzofcdxhdkrsocq` (West EU)
- **Table**: `public.claude_insights` (RLS enabled)
- **Table**: `public.keepalive` (RLS enabled, single row id=1) — heartbeat target for the `Supabase Keep-Alive` workflow (`.github/workflows/supabase-keepalive.yml`), which PATCHes `last_ping_at` every 4 hours and fails unless the row comes back updated; Supabase pauses a Free project for too little activity over a week, and a write every 3 days was paused anyway
- **DB trigger**: `on_insights_change` → `notify_insights_webhook()` via `pg_net`
- **Edge Functions**: `notify-insights`, `telegram-bot` (both no-verify-jwt)
- **Secrets**: `BOT_TOKEN`, `INBOX_CHAT_ID`, `NOMOS_BASE_URL`, `NOMOS_API_KEY` (set via `supabase secrets`)
- **Local credentials**: `claude-insights/.env` (gitignored)

## Pauses and health

The project is on the Free plan (NANO compute). Supabase pauses a Free project for
too little database activity over a week and does not say what counts. It was
paused on 2026-10-26 01:13 UTC and 2026-11-02 03:41 UTC, each less than a day after
a confirmed keep-alive write, when the keep-alive wrote every 3 days (LAB-910). The
Nov 2 restore left the database unresponsive for about 4.5 hours, through a manual
restart, and set off a "depleting its Disk IO Budget" email; a Supabase support
ticket was filed. If it pauses again on the 4-hour keep-alive, the cause is
something else.

How to check:

- **Dashboard status is the truth.** `supabase projects list` kept showing
  `ACTIVE_HEALTHY` while the database, PostgREST, Auth, Realtime and Storage were
  Unhealthy.
- **Keep-alive runs**: `gh run list --workflow supabase-keepalive.yml`. A good run logs
  `Supabase keepalive PATCH returned: [{"id":1}]`; a paused or hung project fails
  with `curl: (28)` timeouts or `curl: (6)` DNS errors and alerts on Telegram.
- **Logs** (works when the database does not): `GET
  https://api.supabase.com/v1/projects/uvnxjuzofcdxhdkrsocq/analytics/endpoints/logs`
  with `Authorization: Bearer <access token>` and `sql`, `iso_timestamp_start`,
  `iso_timestamp_end` (at most 24 hours apart). The SQL is ClickHouse over one
  `logs` table filtered by `source` (`edge_logs`, `postgres_logs`, ...); fields are
  in `log_attributes['request.path']`, `['response.status_code']` and so on. The
  old `logs.all` endpoint and `edge_logs` table are gone. The CLI's access token is
  in the macOS keychain item `Supabase CLI`, stored as `go-keyring-base64:`
  followed by base64.
- **A pause in the logs**: `postgres_logs` shows `restore point
  "restore_uvnxjuzofcdxhdkrsocq_..."`, then a shutdown; the restore shows
  `starting PostgreSQL` and `ready to accept connections`.
- **Database queries**: `supabase db query --linked --project-ref
  uvnxjuzofcdxhdkrsocq "<sql>"`. It leaves a `supabase/.temp/` directory in the
  current directory; delete it, or the pre-push hook flags an unknown top-level
  directory.

## Migration and Edge Function deployment

**Deployment and Supabase pushes require Igor confirmation.** This includes
`--push` (and its keep-alive ping), applying the migration, manually deploying
functions, and merging function changes to trunk: the existing deploy workflow
automatically deploys changed functions on trunk pushes. Local JSON generation
and tests need no Supabase access.

After confirmation, apply the nullable, backward-compatible JSONB migration
before deploying functions or pushing hygiene reports. It leaves existing rows
null and requires no backfill:

```bash
cd claude-insights
export SUPABASE_ACCESS_TOKEN=<token>
supabase link --project-ref uvnxjuzofcdxhdkrsocq
supabase db push --linked
supabase functions deploy notify-insights --no-verify-jwt --project-ref uvnxjuzofcdxhdkrsocq
supabase functions deploy telegram-bot --no-verify-jwt --project-ref uvnxjuzofcdxhdkrsocq
```

The migration is `supabase/migrations/20261104000000_context_hygiene.sql`.
Both functions use Supabase's provided `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` to read previous snapshots. After deployment, an
approved `python3 claude-insights/claude-insights.py --days 7 --with-codex --push`
stores the new aggregates and triggers the digest.

## Next steps

- Configurable model selection for `/compare` analysis

## Description

Aggregates local session data into metrics — sessions, code churn, tool usage, goals, friction points — then pushes to Supabase and *notifies via Telegram*.

## Stack

- Python
- Supabase
- Edge Functions
- Telegram Bot
- Nomos
