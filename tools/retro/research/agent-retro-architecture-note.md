---
title: Agent Retro Local Architecture Note
status: draft
kind: architecture-note
created: 2026-04-21
updated: 2026-04-21
scope: local-only personal retrospective pipeline for coding-agent sessions
---

# Agent Retro Local Architecture Note

## Goal

Define a minimal local architecture for collecting coding-agent session evidence and producing daily/weekly retrospective digests without turning the system into a general-purpose platform.

## Scope

In scope:
- local collection from available sources
- normalized searchable local index
- manual and scheduled collection
- manual and scheduled digest generation
- selective deep inspection for promoted sessions
- markdown and terminal output

Out of scope:
- cloud sync
- collaboration workflows
- skill lifecycle management
- generalized observability platform
- always-on full-session postmortem

## Core design position

The system is split into two major phases:

1. **collection** — bounded ingestion of local evidence into a normalized local index
2. **digesting** — analysis of indexed evidence into findings, actions, and proposed skill/rule deltas

Collection is fact-oriented.
Digesting is judgment-oriented.

## Components

## 1. Source adapters

Responsibility:
- read a specific source format
- expose source records in a normalized intermediate form
- isolate source-specific parsing and path logic

Examples:
- Claude Code adapter
- Codex adapter
- optional git enrichment adapter
- optional shell/history adapter

Source adapters should not decide collection windows, digest scoring, or report shape.

## 2. Collector

Responsibility:
- execute an explicit **collection plan**
- invoke relevant source adapters for the planned scope
- normalize records
- persist normalized results into the local index/store
- emit collection metadata

The collector is not a blind scanner.
It must depend on an explicit **collection plan** produced elsewhere.

The collector should not:
- decide whether a range should be recollected
- infer rewrite intent from overlap
- derive collection scope on its own
- perform digest analysis

## 3. Local index/store

Responsibility:
- persist normalized session evidence
- support query/filter/search for digest generation
- support coverage-planning queries for collection planning
- optionally retain raw evidence cache alongside normalized records

The index/store is the source of truth for digest generation.
The digest engine should read from the index, not from source files directly.

Minimum stored categories:
- sessions
- normalized events/excerpts
- derived metrics
- collection coverage metadata
- generated digest artifacts

## 4. Collection planner

Responsibility:
- read existing coverage from the index/store
- evaluate a requested collection timeframe
- detect gaps and overlap
- resolve effective collection mode
- produce an explicit **collection plan**

The collection planner is the sole owner of collection decision logic.

That includes:
- overlap handling
- gap filling
- effective mode resolution
- definition of the indexed slice that a refresh is allowed to replace

The collection planner should be policy-heavy and testable as decision logic.

## 5. Collection runner / scheduler

Responsibility:
- invoke collection manually or on schedule
- obtain a collection plan from the planner
- pass that plan to the collector
- coordinate run lifecycle
- persist run result and ingest metadata

The collection runner/scheduler is operational orchestration.
It should not own hidden collection policy.

## 6. Digest engine

Responsibility:
- query the index for a requested window or selection
- compute promotion/scoring
- perform deeper inspection on promoted sessions
- produce structured digest data

Digest output should include:
- findings
- actions
- proposed skill/rule deltas
- selected scores such as drift, waste, friction, leverage

The digest engine should be deterministic relative to:
- indexed evidence
- configured scoring/promotion policy
- requested digest window

## 7. Promotion / scoring policy

Responsibility:
- define which sessions are promoted for deeper inspection
- define digest scores and thresholds
- remain configurable and evolvable without changing storage or collection logic

Signals may include:
- long sessions
- expensive sessions
- repeated retries or reversals
- apparent stuck loops
- bad outcomes
- important repo/task context

This can be implemented as a subsystem of the digest engine, but it is a distinct responsibility and should be modeled as such.

## 8. Report writer

Responsibility:
- render digest output to terminal
- write markdown artifact with stable structure
- attach front matter and metadata

The report writer does not perform collection or analysis.

## 9. Digest runner / scheduler

Responsibility:
- invoke digest generation manually or on schedule
- supply requested time window
- coordinate terminal output and markdown artifact generation
- prevent accidental duplicate digest generation for the same period unless forced

## Key constraints

## Time-bounded collection

Every collection run must have an explicit target timeframe.
There should be no unbounded full-history scan by default.

Why this matters:
- runtime control
- predictable cost
- safer pre-prod validation
- testability
- avoidance of accidental large reingestion

## Collector is plan-driven

The collector must accept an explicit collection plan.
The collector must not derive collection scope or rewrite policy itself.

## Collection planning is coverage-aware

Before invoking the collector, the collection planner must read coverage metadata from the index/store and produce an explicit collection plan.

That plan should answer:
- target source(s)
- target timeframe
- uncovered gaps
- overlap with existing coverage
- effective collection mode
- replacement slice for refresh, when applicable

## Default collection must be non-destructive

Repeated collection must not silently rewrite already covered ranges.
Default behavior should prefer gap-filling rather than overlap replacement.

## Explicit collection modes

A simple and meaningful model is:
- **fill** — collect only uncovered gaps within requested timeframe
- **refresh** — recollect overlapping covered range and replace a defined indexed slice determined by the plan
- **rebuild** — recreate full index or a source-scoped segment explicitly

Default mode should be **fill**.

Recollection of already covered time ranges must require an explicit non-default mode.
Refresh must operate on an explicit replacement slice, not on implicit overlap alone.

## Idempotent execution of the same plan

Executing the same collection plan multiple times must not mutate indexed data unless the plan explicitly authorizes rewrite behavior.

## Coverage metadata

The index/store should maintain coverage metadata sufficient for planning and safety.

At minimum:
- source id
- covered timeframe
- collected at
- collection mode
- collector/schema version

Optional later additions:
- content fingerprint
- source generation marker/cursor
- raw artifact hash
- ingest batch id

## Boundary summary

- **source adapters** know source formats
- **collection planner** decides what to collect and what may be replaced
- **collection runner/scheduler** coordinates invocation and run lifecycle
- **collector** executes the collection plan
- **index/store** persists and serves indexed evidence plus coverage metadata
- **digest engine** analyzes indexed evidence
- **report writer** formats output
- **runners/schedulers** handle invocation timing

## Open questions

1. What is the exact storage-level replacement unit for refresh: timeframe slice, session, ingest batch, or another indexed segment?
2. Should raw evidence be retained permanently, or only long enough to support parser evolution and debugging?
3. Should collection planning understand repo/task boundaries, or only time windows at first?
4. How much source-specific metadata should survive normalization before the index becomes too source-shaped?
5. Should duplicate digest suppression be based on requested window only, or also digest-engine version and configuration fingerprint?

## Adversarial review

## 1. What is now strong

- collector is explicitly plan-driven
- collection decision logic is separated into the planner
- execution orchestration is separated into the runner/scheduler
- collection is explicitly timeframe-bounded
- default behavior is non-destructive
- digest generation reads from the index only

These are the most load-bearing architectural boundaries in the note.

## 2. Main remaining risks

### A. Refresh semantics are still only partially resolved

The note now states that refresh must act on a defined replacement slice determined by the plan.
That closes the dangerous ambiguity of "rewrite whatever overlaps."

What remains open is the exact storage-level unit of that replacement.
This is acceptable at this stage, but it must not stay vague into implementation.

### B. Store shape is intentionally unresolved

"Searchable local index/store" is still a placeholder for an eventual concrete storage model.
That is acceptable in an architecture note, but the eventual choice must satisfy two classes of queries:
- digest/search queries over indexed evidence
- coverage-planning queries for collection safety and overlap handling

A future store choice that is convenient for one and weak for the other would break the design.

### C. Digest artifacts share a home with indexed evidence

This is acceptable for an MVP, but it should be treated as namespace separation inside one store, not as one undifferentiated data pool.
Otherwise evidence semantics and artifact semantics may get muddy.

## 3. Boundary checks

### A. Collector boundary

The collector boundary is now correct.
It executes a plan and does not decide whether recollection is justified.
This is an important lock.

### B. Planner boundary

The planner now correctly owns overlap handling, gap detection, mode resolution, and replacement-slice definition.
That is architectural policy and belongs here.

### C. Runner/scheduler boundary

The runner/scheduler now correctly owns operational invocation, lifecycle coordination, and persistence of run results.
It should remain free of hidden collection policy.

### D. Digest boundary

The digest engine reading only from the index is correct.
That preserves reproducibility, allows fixture-driven testing, and prevents accidental coupling to raw source formats.

### E. Report writer boundary

The report writer remains a formatting/output concern only.
It must not accrete analytical decisions.

## 4. Constraints worth locking now

These should be treated as hard constraints, not soft guidance:

1. collector is plan-driven
2. planner is sole owner of collection decision logic
3. collection is timeframe-bounded
4. default collection mode is non-destructive
5. refresh requires explicit replacement semantics
6. executing the same plan is idempotent unless rewrite is explicitly authorized
7. digest generation reads from the index only

## 5. Overall judgment

The note is sound as a pre-ADR / architecture-note artifact.
It now has the right boundaries for:
- collection policy
- collection execution
- evidence storage
- digest analysis
- report rendering

The main intentionally unresolved points are:
- exact storage model
- exact refresh replacement unit
- raw evidence retention policy

Those are appropriate open questions for this stage.
