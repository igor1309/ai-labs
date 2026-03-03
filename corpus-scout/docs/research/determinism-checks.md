---
date: 2026-03-03
model: gpt-5.2
---

# Determinism Checks (Corpus Scout)

Objective: Validate “deterministic retrieval primitive” claim.

Create a small fixed dataset of queries:
	•	20 known factual lookups
	•	Expected file + heading match

Log:
	•	exact citation set
	•	response stability across runs

Add simple evaluation:
	•	exact_match (boolean)
	•	citation_precision (manual for now)

Outcome:
Corpus Scout becomes measurable infrastructure, not “LLM magic.”

---

Add rule-based eval:
	•	web_called_without_corpus_attempt
	•	corpus_empty_then_web_called
	•	max_calls_exceeded

This gives you routing auditability.

⸻

Stage 5 — Prompt & Strategy Comparison

Now introduce:
	•	A/B prompt variants
	•	Different search depth limits
	•	Different section window sizes

Use Langfuse experiments:
	•	Compare latency
	•	Citation count
	•	Empty result rate
	•	Manual quality score (1–5)

Now you’re doing infra-level optimization, not vibes.

⸻

Stage 6 — Guardrails & Canon Integrity

Define invariant checks:
	•	Canon bucket must contain only corpus citations
	•	External bucket must contain URLs
	•	No cross-contamination

Add automated evaluation:
	•	canon_contains_url = false
	•	external_contains_local_path = false

This is critical for your architecture.

⸻

Stage 7 — Production-Grade Observability

When ready:
	•	Dataset-driven regression tests
	•	Replay failing traces
	•	Drift detection
	•	Version comparison across MCP builds

At this point Langfuse becomes:
	•	Debug console
	•	Evaluation engine
	•	Architectural validation tool

⸻

Recommended Order (Compressed View)
	1.	Traces only
	2.	Metadata discipline
	3.	Corpus determinism eval
	4.	Web sourcing eval
	5.	Routing audit
	6.	Guardrail checks
	7.	Experiments & regression

⸻

If useful, next step can be:

A. Concrete Langfuse schema for your scouts (fields + naming)
B. Minimal code-level integration pattern for Node/Python orchestrator
C. Evaluation design examples for deterministic retrieval

Pick one.
You need a corpus-native test suite, not a generic dataset.

Build a “Determinism Pack”

Create:
	•	20–50 canonical facts
	•	Each mapped to:
	•	exact file
	•	exact heading
	•	expected citation span

Store as YAML:

- id: F001
  query: "What is Nomos Gateway design goal?"
  expected:
    file: docs/nomos-gateway.md
    heading: "Design Goal"

This tests:
	•	Stable lexical matching
	•	Stable section bounding
	•	No drift across runs
	•	No cross-file bleed

⸻

A — Minimal Internal Gold Dataset (Corpus-Native)

1️⃣ Scope

Target: 30 queries
	•	10 direct fact lookups
	•	10 constraint lookups
	•	5 unresolved threads
	•	5 expansion opportunities

All must:
	•	Map to a single canonical section
	•	Require heading-bounded extraction
	•	Have deterministic lexical anchor

⸻

2️⃣ Dataset Structure

Use YAML (versioned in repo):

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


⸻

3️⃣ Determinism Criteria

For each run:
	•	file_match == expected.file
	•	heading_match == expected.heading
	•	must_contain ⊆ output
	•	files_returned <= max_files

Run same suite:
	•	3 consecutive runs
	•	After container restart
	•	After unrelated corpus change

Expect identical result sets.

⸻

4️⃣ Langfuse Integration

For each case log:

Metadata:
	•	gold_id
	•	expected_file
	•	returned_file
	•	file_match
	•	heading_match
	•	extra_files
	•	token_count

Add simple eval:
	•	exact_section_match (bool)
	•	over_retrieval (bool)

Now traces become measurable infra artifacts.

⸻

5️⃣ Hardening (Later)

Add perturbations:
	•	Synonym swap
	•	Word order change
	•	Extra noise words
	•	Plural/singular shifts

Expect:
	•	Same file
	•	Same heading

If it breaks → lexical fragility.

⸻

6️⃣ Acceptance Bar

Corpus Scout is “deterministic primitive” only if:
	•	100% section match
	•	0 cross-file bleed
	•	0 run-to-run drift

⸻

A — Script outline to auto-run the suite

Goal: run gold.yaml against your Corpus Scout MCP, assert invariants, and emit a machine-readable report (and optional Langfuse trace linking).

Shape
	•	Input: gold.yaml
	•	For each case:
	•	call corpus_scout.search(query)
	•	parse response into:
	•	files[]
	•	citations[] (file + heading/line range)
	•	text
	•	compute:
	•	file_match
	•	heading_match
	•	must_contain_ok
	•	extra_files
	•	Output:
	•	report.json
	•	exit code non-zero if any fail (CI-friendly)

Minimal report schema

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

Where it lives
	•	tools/corpus-scout-evals/
	•	gold.yaml
	•	run.sh (thin wrapper)
	•	runner.(py|ts)
	•	report.json in .gitignore

⸻

B — Scoring model (precision/recall style)

You’re not ranking documents; you’re validating bounded extraction. So score the right things.

Per-case boolean checks (primary)
	1.	Exact Section Match (ESM)
true if expected file AND expected heading are present, and no other headings returned from same file outside that section.
	2.	No Cross-File Bleed (NCFB)
true if files_returned <= max_files (usually 1).
	3.	Containment Check (MUST)
true if all must_contain tokens exist in output.

These become your “must-pass” gates.

Aggregate metrics (secondary)
	•	Case pass rate: passed / total
	•	Over-retrieval rate: cases where extra_files > 0
	•	Heading drift rate: file ok, heading wrong
	•	Empty-hit rate: expected match exists but returned nothing

Optional “IR-like” metrics (only if you model expected citations as a set)

If you store an expected citation set (line ranges):
	•	Citation precision = correct_citations / returned_citations
	•	Citation recall = correct_citations / expected_citations

This is more work, but very clean if you can normalize citations.

⸻

Minimal acceptance bars (suggested)
	•	ESM: 100%
	•	NCFB: 100%
	•	MUST: ≥ 95% (allowing minor wording drift if you edit docs)

⸻