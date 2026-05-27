-- Add explicit table-level GRANTs ahead of the Supabase Data API default change.
-- After 2026-10-30, public-schema tables are no longer exposed to PostgREST/
-- GraphQL/supabase-js by default; access requires explicit GRANTs alongside
-- RLS policies. See https://github.com/orgs/supabase/discussions/45329.

GRANT SELECT ON public.claude_insights TO authenticated;
