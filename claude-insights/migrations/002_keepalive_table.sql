-- Dedicated keepalive table for Supabase free-tier auto-pause prevention.
-- A scheduled workflow (.github/workflows/supabase-keepalive.yml) updates
-- last_ping_at, producing a real DB write that resets the inactivity timer.
-- A SELECT-only ping was insufficient.

CREATE TABLE IF NOT EXISTS public.keepalive (
  id integer PRIMARY KEY,
  last_ping_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.keepalive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role full access on keepalive"
  ON public.keepalive FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

INSERT INTO public.keepalive (id, last_ping_at)
VALUES (1, now())
ON CONFLICT (id) DO NOTHING;
