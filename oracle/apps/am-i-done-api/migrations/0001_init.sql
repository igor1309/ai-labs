-- Counters for popularity heat maps (canonical profession roll-up)
CREATE TABLE IF NOT EXISTS profession_counters (
  canonical_profession TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Observed synonym mappings (raw input -> canonical)
CREATE TABLE IF NOT EXISTS profession_synonyms (
  raw_profession TEXT NOT NULL,
  locale TEXT NOT NULL,
  canonical_profession TEXT NOT NULL,
  category TEXT,
  category_confidence REAL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (raw_profession, locale)
);
