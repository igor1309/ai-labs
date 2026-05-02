ALTER TABLE captured_items
    ADD COLUMN IF NOT EXISTS captured_title TEXT,
    ADD COLUMN IF NOT EXISTS captured_description TEXT;
