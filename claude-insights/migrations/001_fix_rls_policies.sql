-- Fix overly permissive RLS policy on claude_insights
-- The original "Allow service key full access" granted ALL to every role,
-- effectively bypassing RLS for anon users.

DROP POLICY IF EXISTS "Allow service key full access" ON public.claude_insights;

-- Writer: service_role gets full access (claude-insights.py script)
CREATE POLICY "service_role full access"
  ON public.claude_insights FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Readers: authenticated users get read-only access
CREATE POLICY "authenticated read access"
  ON public.claude_insights FOR SELECT
  TO authenticated
  USING (true);
