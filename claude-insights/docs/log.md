# claude-insights log

## 2026-06-06

- Added `claude-insights/index.html` as the local Claude Insights landing page and linked the products-page card to it.

## 2026-05-27

- Added explicit `GRANT SELECT ON public.claude_insights TO authenticated` ahead of the Supabase Data API default change (existing projects flip 2026-10-30; new projects already flipped 2026-05-30). Applied to remote project `uvnxjuzofcdxhdkrsocq` via `supabase db push`, which also seeded `supabase/migrations/` as the new source of truth for CLI-tracked migrations. The pre-existing `claude-insights/migrations/001`/`002` SQL files remain as audit-only records of pre-CLI manual applies; the remote `supabase_migrations.schema_migrations` table does not track them. `public.keepalive` requires no grant — only `service_role` writes to it and that role is unaffected by the default change.
