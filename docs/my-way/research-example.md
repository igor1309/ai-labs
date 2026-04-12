---
title: Research — Example
date: 2026-04-12
author: Igor Malyarov
version: 0.0.1
format: example
source: based on corpus-scout/docs/research/determinism-checks.md
---

# Research — Example

The example below is a condensed real research note.

---

```markdown
---
date: 2026-03-03
model: opus-4.6
description: "Research notes on validating Corpus Scout's deterministic retrieval claim"
---

# Determinism Checks

## Purpose

Validate the "deterministic retrieval primitive" claim for Corpus Scout by
building a corpus-native test suite with measurable acceptance criteria.

## Gold dataset

30 queries across four categories:

| Category             | Count | Description                          |
|----------------------|-------|--------------------------------------|
| Direct fact lookups  | 10    | Single-answer factual questions      |
| Constraint lookups   | 10    | Questions about rules and boundaries |
| Unresolved threads   | 5     | Open questions with known locations  |
| Expansion opportunities | 5  | Areas flagged for future work        |

All queries must:
- map to a single canonical section
- require heading-bounded extraction
- have a deterministic lexical anchor

## Determinism criteria

### Per-case checks (must-pass gates)

1. **Exact Section Match (ESM)**: expected file AND expected heading
   are present; no out-of-section headings returned from the same file.
2. **No Cross-File Bleed (NCFB)**: `files_returned <= max_files` (typically 1).
3. **Containment (MUST)**: all `must_contain` tokens exist in output.

### Acceptance bars

| Metric | Threshold |
|--------|-----------|
| ESM    | 100%      |
| NCFB   | 100%      |
| MUST   | >= 95%    |

Corpus Scout qualifies as a "deterministic primitive" only when all three
bars are met with zero run-to-run drift.

## Test runner

Location: `tools/corpus-scout-evals/`

Flow:
1. Read `gold.yaml`.
2. For each case: call `corpus_scout.search(query)`, parse response.
3. Compute: `file_match`, `heading_match`, `must_contain_ok`, `extra_files`.
4. Emit `report.json`; exit non-zero if any case fails.

## Open questions

- Should perturbation hardening (synonym swap, word order change) be part
  of v1 or deferred?
- What threshold for citation precision/recall if line ranges are added?
- How to version the gold dataset when corpus content changes?
```
