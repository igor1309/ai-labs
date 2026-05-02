CREATE TABLE IF NOT EXISTS captured_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    source_type TEXT,
    captured_at TIMESTAMPTZ NOT NULL,
    url TEXT,
    note TEXT,
    enrichment TEXT NOT NULL
);
