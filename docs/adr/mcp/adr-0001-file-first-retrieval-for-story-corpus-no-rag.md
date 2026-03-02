---
date: 2026-03-02
model: gpt-5.2
description: >
Adopt file-first retrieval architecture for story corpus agent system,
explicitly acknowledging reduced capability in vague, emotional,
conceptual, and interpretive semantic discovery in favor of simplicity
and operational stability.
---

# ADR-0001: File-First Retrieval for Story Corpus (No RAG)

## 1. Executive Summary

This ADR decides that the story corpus agent system SHALL use a file-first
retrieval architecture based on lexical search (grep-style) and targeted
section reads, without embeddings or vector indexing.

The decision prioritizes operational simplicity, determinism,
transparency, and high mutation tolerance of a Markdown corpus of
approximately 100–1000 files.

This ADR explicitly acknowledges reduced capability in vague,
emotional, conceptual, and interpretive semantic discovery as an
accepted tradeoff.

Scope: local-only corpus, read-only agents,
no automatic prose generation, no vector database.

---

## 2. Context

The system operates on a writer-maintained Markdown corpus containing:

- Research notes
- Narrative fragments
- Character material
- Scene drafts
- TODO and idea documents

Constraints:

- High mutation frequency (frequent edits)
- Corpus size within 100–1000 Markdown files
- No desire for embedding pipelines or reindexing
- Strict separation of concerns:
  - Orchestrator agent (control plane)
  - Corpus scout (local search only)
  - Web scout (external search only)
  - Prose agent (separate responsibility)
- Read-only corpus behavior

Rejected alternative:

Vector-based RAG retrieval was rejected primarily because:

- The corpus size (100–1000 files) is within practical brute-force lexical search range.
- Mutation velocity makes embedding maintenance undesirable.
- Transparency of evidence origin is reduced in vector-based systems.
- Operational complexity is disproportionate to scale.

If corpus size materially exceeds this range, this rejection MAY require reassessment.

---

## 3. Decision

The system SHALL use deterministic file-first retrieval based on:

- Lexical search (ripgrep or equivalent)
- Section-bounded file reads
- Explicit citation extraction
- No embeddings
- No vector database
- No semantic index

The system SHALL accept that:

- Retrieval quality depends on lexical overlap.
- Abstract semantic similarity is not guaranteed.
- Query expansion relies on heuristic term inference.
- Multilingual semantic paraphrase detection is weaker than embedding-based retrieval.

This limitation is intentional and accepted.

---

## 4. Rules / Invariants

1. The corpus scout MUST:
   - Use only local filesystem search.
   - Extract only cited, non-prose findings.
   - Provide file path and heading or line-range citations.

2. The system MUST NOT:
   - Use embeddings.
   - Maintain a vector store.
   - Perform background indexing jobs.
   - Mutate the story corpus.

3. Web search (if enabled):
   - MUST be explicitly labeled as external.
   - MUST NOT override canon.
   - MUST remain separate from corpus evidence.

4. Retrieval depth control:
   - MUST be configurable at runtime.
   - Progressive deepening decisions MUST be owned by the orchestrator, not the corpus scout.
   - The corpus scout MUST remain a deterministic retrieval primitive.

5. Bounded near-sweep behavior:
   - A near-sweep is defined as reading all files within the declared scope,
     subject to configured maximum limits (files, sections, or total lines).
   - Near-sweep MUST remain bounded and explicitly triggered.

6. Output from corpus scout:
   - MUST contain only structured findings:
     - facts
     - constraints
     - threads
     - opportunities
   - MUST NOT generate creative prose.

---

## 5. Consequences

### Accepted Tradeoffs

The system explicitly sacrifices optimal performance in the following
query classes:

- Vague queries (no lexical anchors)
- Emotional pattern detection
- Conceptual or thematic mining
- Interpretive or latent meaning exploration
- Cross-language semantic paraphrase discovery

### Operational Gains

- No index maintenance
- Immediate consistency after file edits
- Transparent evidence traceability
- Deterministic behavior
- Lower system complexity
- Easier debugging and reasoning

### Future Extension Point

If:

- Corpus scale materially increases beyond current assumptions, or
- Abstract/thematic retrieval becomes a primary use case, or
- File-first retrieval failure becomes structurally recurrent,

a separate ADR MAY introduce a hybrid semantic layer.

Such extension MUST NOT silently alter this decision.

---

## 6. Non-Goals

This ADR does not define:

- Prose generation behavior
- Creative writing agent design
- Canon governance workflow
- Research file organization
- Graph-based entity modeling
- Long-term archival scaling strategy

This ADR governs retrieval architecture only.