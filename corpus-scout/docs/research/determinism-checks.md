---
date: 2026-03-03
model: opus-4.6
description: "Research notes on validating Corpus Scout's deterministic retrieval claim"
---

# Determinism Checks

## Purpose

Validate the "deterministic retrieval primitive" claim for Corpus Scout by building a corpus-native test suite with measurable acceptance criteria.

## Gold Dataset

### Scope

30 queries across four categories:

| Category | Count | Description |
|---|---|---|
| Direct fact lookups | 10 | Single-answer factual questions |
| Constraint lookups | 10 | Questions about rules and boundaries |
| Unresolved threads | 5 | Open questions with known locations |
| Expansion opportunities | 5 | Areas flagged for future work |

All queries must:
- Map to a single canonical section.
- Require heading-bounded extraction.
- Have a deterministic lexical anchor.

### Schema

Versioned YAML stored in the repo:

```yaml
version: 1
corpus_commit: <git-sha>

cases:
  - id: F001
    type: fact
    query: "What is the design goal of Corpus Scout?"
    expected:
      file: scouts/corpus-scout.md
      heading: "Design Goal"
      must_contain:
        - "Deterministic"
        - "transparent retrieval"
      max_files: 1

  - id: C003
    type: constraint
    query: "Does Corpus Scout use embeddings?"
    expected:
      file: scouts/corpus-scout.md
      heading: "Scope"
      must_contain:
        - "No indexing"
        - "no embeddings"
```

## Determinism Criteria

### Per-case checks (must-pass gates)

1. **Exact Section Match (ESM)**: expected file AND expected heading are present; no out-of-section headings returned from the same file.
2. **No Cross-File Bleed (NCFB)**: `files_returned <= max_files` (typically 1).
3. **Containment (MUST)**: all `must_contain` tokens exist in output.

### Run conditions

Execute the full suite under each condition and expect identical result sets:
- 3 consecutive runs.
- After container restart.
- After an unrelated corpus change.

### Acceptance bars

| Metric | Threshold |
|---|---|
| ESM | 100% |
| NCFB | 100% |
| MUST | >= 95% (allows minor wording drift from doc edits) |

Corpus Scout qualifies as a "deterministic primitive" only when all three bars are met with zero run-to-run drift.

## Aggregate Metrics

| Metric | Definition |
|---|---|
| Case pass rate | passed / total |
| Over-retrieval rate | cases where `extra_files > 0` |
| Heading drift rate | file correct, heading wrong |
| Empty-hit rate | expected match exists but nothing returned |

### Optional IR-style metrics

If expected citation sets include line ranges:
- **Citation precision** = correct citations / returned citations
- **Citation recall** = correct citations / expected citations

## Perturbation Hardening (Later Stage)

Apply perturbations to each query and expect the same file and heading:
- Synonym swap.
- Word order change.
- Extra noise words.
- Plural/singular shifts.

Failures indicate lexical fragility in the retrieval layer.

## Routing Auditability

Rule-based eval checks for the web-fallback routing path:

| Check | Meaning |
|---|---|
| `web_called_without_corpus_attempt` | Web source used before trying corpus |
| `corpus_empty_then_web_called` | Correct fallback: corpus miss, then web |
| `max_calls_exceeded` | Call budget violated |

## Canon Integrity Guardrails

Invariant checks ensuring bucket separation:

| Check | Expected |
|---|---|
| `canon_contains_url` | false |
| `external_contains_local_path` | false |

Canon bucket must contain only corpus citations. External bucket must contain only URLs. No cross-contamination.

## Langfuse Integration

### Per-case trace metadata

- `gold_id`, `expected_file`, `returned_file`
- `file_match`, `heading_match`
- `extra_files`, `token_count`

### Trace-level evals

- `exact_section_match` (bool)
- `over_retrieval` (bool)

### Production-grade observability (later)

- Dataset-driven regression tests.
- Replay failing traces.
- Drift detection across runs.
- Version comparison across MCP builds.
- A/B prompt variants with latency, citation count, empty-result rate, and manual quality score (1-5) via Langfuse experiments.

## Test Runner

### Location

```
tools/corpus-scout-evals/
  gold.yaml
  run.sh          # thin wrapper
  runner.(py|ts)
  report.json     # .gitignore'd
```

### Flow

1. Read `gold.yaml`.
2. For each case: call `corpus_scout.search(query)`, parse response into `files[]`, `citations[]`, `text`.
3. Compute: `file_match`, `heading_match`, `must_contain_ok`, `extra_files`.
4. Emit `report.json`; exit non-zero if any case fails (CI-friendly).

### Report schema

```json
{
  "run_id": "2026-03-03T18:10:00Z",
  "corpus_commit": "<sha>",
  "cases_total": 30,
  "cases_failed": 2,
  "cases": [
    {
      "id": "F001",
      "ok": false,
      "expected": { "file": "...", "heading": "..." },
      "got": { "files": ["..."], "headings": ["..."] },
      "checks": {
        "file_match": true,
        "heading_match": false,
        "must_contain_ok": true,
        "extra_files": 0
      }
    }
  ]
}
```

## Implementation Order

1. Traces only (basic Langfuse instrumentation).
2. Metadata discipline (structured trace fields).
3. Gold dataset + determinism eval.
4. Routing audit checks.
5. Canon integrity guardrails.
6. Perturbation hardening + experiments.
7. Regression suite + drift detection.
