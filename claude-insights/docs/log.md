# claude-insights log

## 2026-06-21

- Hardened the push path against degraded digests. The 08:40 weekly run hit the Claude session limit, so `claude /insights` produced a charts-only report with no "At a Glance" narrative, and that narrative-less row was pushed — the Telegram digest dropped all four narrative blocks. Added `resolve_push_row()` (pure, 6 tests in `test_claude_insights.py`): an empty narrative never overwrites an existing one, and a degraded first-push (empty narrative, no existing row) is skipped with a loud warning so the DB webhook never fires a thin message. New `--allow-empty-narrative` flag forces a metrics-only push. Re-pushed the current week to restore the full narrative. The launchd `PATH` already includes `~/.local/bin` (old "claude not found" log lines predate that fix); no plist change needed.

## 2026-06-14

- Added thousands-separator number formatting (`22454` -> `22,454`) and right-aligned (`---:`) all transposed table columns so values align to the trailing edge.
- Tweaked the rich-message digest layout after reviewing the live render: transposed all four tables (stats, friction, satisfaction, goals) so labels are column headers and values sit in a single row — far more compact than the tall vertical tables. Replaced the expandable `<details>` narrative blocks with plain Markdown blockquotes (the collapsibles added friction without value).
- Upgraded the weekly digest to Telegram's new Rich Messages API. `_shared/format.ts` now emits Markdown (heading, stats table, friction/satisfaction/goals tables, narrative as collapsible `<details>` blocks, capped at the 32768-char rich-message limit) and sends it via `sendRichMessage` (`rich_message: { markdown }`) instead of `sendMessage` + `parse_mode: HTML`. Added the first `deno test` suite for `_shared` (`format.test.ts`, 9 tests). Callers unchanged (sender signature preserved). See plan `docs/plans/0002-rich-message-formatting.md`.

## 2026-06-06

- Added `claude-insights/index.html` as the local Claude Insights landing page and linked the products-page card to it.

## 2026-05-27

- Added explicit `GRANT SELECT ON public.claude_insights TO authenticated` ahead of the Supabase Data API default change (existing projects flip 2026-10-30; new projects already flipped 2026-05-30). Applied to remote project `uvnxjuzofcdxhdkrsocq` via `supabase db push`, which also seeded `supabase/migrations/` as the new source of truth for CLI-tracked migrations. The pre-existing `claude-insights/migrations/001`/`002` SQL files remain as audit-only records of pre-CLI manual applies; the remote `supabase_migrations.schema_migrations` table does not track them. `public.keepalive` requires no grant — only `service_role` writes to it and that role is unaffected by the default change.
