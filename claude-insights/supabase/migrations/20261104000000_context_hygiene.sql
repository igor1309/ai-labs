alter table public.claude_insights
  add column if not exists context_hygiene jsonb;

comment on column public.claude_insights.context_hygiene is
  'Aggregate numeric Claude and optional Codex context hygiene counters and normalized tokens; null for older reports.';
