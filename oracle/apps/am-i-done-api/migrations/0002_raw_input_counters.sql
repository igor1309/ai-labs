-- Counters for raw profession requests (trimmed + collapsed whitespace key)
CREATE TABLE IF NOT EXISTS raw_input_counters (
  raw_profession_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
