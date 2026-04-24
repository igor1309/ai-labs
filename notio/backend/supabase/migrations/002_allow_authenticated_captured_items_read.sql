ALTER TABLE public.captured_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.captured_items TO authenticated;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'captured_items'
          AND policyname = 'authenticated_select'
    ) THEN
        CREATE POLICY authenticated_select
            ON public.captured_items
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END $$;
