---
date: 2026-03-04
model: opus-4.6
description: >
  Black-box eval runner for validating Corpus Scout's deterministic
  retrieval claim against a gold dataset with boolean pass/fail gates.
---

# ADR-0002: Determinism Eval Runner

## 1. Executive Summary

This ADR defines a black-box evaluation runner that validates Corpus Scout's "deterministic retrieval primitive" claim (ADR-0001, rule 4).

The runner executes gold dataset queries against the system's public interface, checks results against expected file/heading/content triples, and emits a machine-readable report. It treats the system as an opaque primitive — implementation details (number of internal calls, caching, query rewriting) are not the eval's concern.

Scope: eval contract, adapter boundary, boolean gates, report schema, CI integration.

---

## 2. Context

ADR-0001 declares Corpus Scout a "deterministic retrieval primitive" but provides no mechanism to verify that claim. The research doc (`determinism-checks.md`) defines metrics and a gold dataset schema. A synthetic Russian humanities corpus (12 files, 30 test cases) exists in `corpus-scout/tools/evals/`.

The system's current public interface exposes two MCP tools: `search` (ripgrep-backed lexical search returning line matches) and `read_section` (heading-bounded section extraction). Neither tool returns a combined "query → file + heading + content" result directly.

The eval must not depend on how these tools are composed internally. Today's implementation uses two tools; tomorrow it might be one, or five. The eval measures observable correctness of the retrieval primitive, not its internal steps.

Rejected alternatives:

- **Ragas / TruLens**: designed for semantic RAG pipelines with soft relevance scores. Corpus Scout is deterministic and lexical — boolean gates are the correct evaluation model, not LLM-as-judge scoring.
- **Inline test assertions**: unit tests validate internal functions; the eval validates the system-level contract. Both are needed, but this ADR governs the latter.

---

## 3. Decision

The system SHALL have a black-box eval runner with three layers:

1. **Adapter**: thin wrapper that calls the system's public interface and normalizes the response into `{files[], headings[], text}`. The adapter is the only component that knows implementation details. When the interface changes, only the adapter changes.

2. **Eval engine**: reads `gold.yaml`, passes each query to the adapter, computes boolean checks against expected results, aggregates metrics.

3. **Reporter**: emits `report.json` and sets exit code (0 = all pass, non-zero = at least one failure).

---

## 4. Rules / Invariants

### Eval contract

1. The eval MUST treat the system as a black box. Eval logic MUST NOT call internal functions, read internal state, or depend on the number of tool calls.
2. The adapter MUST normalize any system response into the eval's expected shape: `{files: string[], headings: string[], text: string}`.
3. When the system's public interface changes, only the adapter MUST change. Eval logic and gold dataset MUST remain unchanged.

### Per-case boolean gates (must-pass)

4. **Exact Section Match (ESM)**: the expected file AND expected heading MUST be present in the response; no out-of-section headings from the same file.
5. **No Cross-File Bleed (NCFB)**: `files_returned` MUST be `<= expected.max_files`.
6. **Containment (MUST)**: all `expected.must_contain` tokens MUST exist in the response text.
7. A case passes only when all three gates pass.

### Run conditions

8. The eval MUST produce identical results across 3 consecutive runs against the same corpus.
9. The eval MUST produce identical results after a process restart.
10. The eval MUST produce identical results after an unrelated corpus file change.

### Acceptance bars

11. The runner MUST enforce configurable acceptance thresholds for ESM, NCFB, and MUST containment. Concrete values are deferred until empirical data from initial runs is available.
12. Run-to-run drift MUST be 0%.
13. The system qualifies as a "deterministic primitive" only when all configured thresholds are met with zero drift.

### Report

14. The runner MUST emit `report.json` conforming to the schema in section 4.1.
15. The runner MUST exit non-zero if any case fails.
16. The report MUST include `run_id`, `corpus_commit`, `cases_total`, `cases_failed`, and per-case check results.

### Latency (optional SLA gate)

17. The runner MAY measure per-case latency. If a latency threshold is configured, exceeding it MUST be reported as a warning, not a failure.

### Gold dataset integrity

18. Every `must_contain` token MUST be a verbatim substring of the referenced section in the corpus. This MUST be verified by an automated check before the eval runs.
19. The gold dataset MUST reference a `corpus_path` or `corpus_commit` to bind it to a specific corpus state.

### 4.1 Report Schema

```json
{
  "run_id": "<ISO-8601 timestamp>",
  "corpus_commit": "<git-sha or 'fixture'>",
  "cases_total": 30,
  "cases_failed": 0,
  "cases": [
    {
      "id": "F001",
      "ok": true,
      "expected": {
        "file": "chekhov-dramaturgy.md",
        "heading": "Чайка как манифест"
      },
      "got": {
        "files": ["chekhov-dramaturgy.md"],
        "headings": ["Чайка как манифест"]
      },
      "checks": {
        "file_match": true,
        "heading_match": true,
        "must_contain_ok": true,
        "extra_files": 0
      },
      "latency_ms": 42
    }
  ]
}
```

---

## 5. Consequences

### Operational impact

- The eval runner becomes a CI-compatible gate: non-zero exit blocks the pipeline.
- The adapter pattern means interface refactors (e.g., merging `search` + `read_section` into a single tool) do not break the eval.
- Gold dataset maintenance is manual but infrequent — the synthetic corpus is frozen.

### Accepted tradeoffs

- The eval tests retrieval correctness, not retrieval quality on ambiguous queries. Vague/semantic queries are explicitly out of scope (per ADR-0001).
- Boolean gates are strict. A heading typo in the corpus breaks ESM without nuance. This is intentional — the system claims determinism, so the eval enforces it.

### Future extension points

- Perturbation hardening (synonym swap, word order, noise) can be added as a second gold dataset layer without changing the runner.
- Langfuse trace integration can be wired into the adapter without changing eval logic.
- Aggregate metrics (over-retrieval rate, heading drift rate, empty-hit rate) can be computed from the report without changing the runner.

---

## 6. Non-Goals

This ADR does not define:

- Routing auditability (corpus → web fallback). Blocked: no router exists yet.
- Canon integrity guardrails (bucket separation). Blocked: no bucket model exists yet.
- Langfuse observability wiring.
- Perturbation test generation.
- The adapter's specific implementation (which tools it calls, in what order).
- Gold dataset content — that is maintained separately in `corpus-scout/tools/evals/gold.yaml`.
