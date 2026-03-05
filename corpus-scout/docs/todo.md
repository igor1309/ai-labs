---
date: 2026-03-04
model: opus-4.6
description: "Remaining work from determinism-checks.md research"
---

# Determinism Evals — TODO

Priority order. Items 3-5 depend on features not yet in the codebase.

1. [ ] **Multi-root support** — allow `CORPUS_ROOT` to accept multiple directories (e.g. comma-separated) so a single server instance can search across several corpus sources. Current limitation: only one directory per server instance.
2. [ ] **Test runner** — script that calls `search()`/`read_section()` against the MCP server, computes ESM/NCFB/MUST checks, emits `report.json` with non-zero exit on failure. Design decision needed: `search()` returns line matches, not headings — runner must map results back to sections.
2. [ ] **Langfuse integration** — wire trace metadata (`gold_id`, `file_match`, `heading_match`, `extra_files`, `token_count`) and trace-level evals (`exact_section_match`, `over_retrieval`) into the MCP server.
3. [ ] **Routing auditability** — `web_called_without_corpus_attempt`, `corpus_empty_then_web_called`, `max_calls_exceeded`. Blocked: no router exists yet.
4. [ ] **Canon integrity guardrails** — `canon_contains_url = false`, `external_contains_local_path = false`. Blocked: no bucket separation exists yet.
5. [ ] **Perturbation hardening** — synonym swap, word order change, noise words, plural/singular shifts against the gold dataset.
6. [ ] **Regression suite + drift detection** — dataset-driven regression, replay failing traces, version comparison across MCP builds.
