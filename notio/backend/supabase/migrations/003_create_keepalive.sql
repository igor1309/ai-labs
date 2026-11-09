-- A dedicated heartbeat avoids changing captured items during quiet periods.
CREATE TABLE IF NOT EXISTS public.keepalive (
  id integer PRIMARY KEY CHECK (id = 1),
  last_ping_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.keepalive ENABLE ROW LEVEL SECURITY;

-- The scheduled heartbeat uses service_role; clients receive no table access.
GRANT SELECT, UPDATE ON public.keepalive TO service_role;

INSERT INTO public.keepalive (id, last_ping_at)
VALUES (1, now())
ON CONFLICT (id) DO NOTHING;
