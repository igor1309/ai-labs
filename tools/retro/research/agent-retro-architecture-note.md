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
- execute a **collection plan**
- invoke relevant source adapters for the planned scope
- normalize records
- persist normalized results into the local index/store
- emit collection metadata

The collector is not a blind scanner.
It must depend on an explicit **collection plan** produced elsewhere.

The collector should not:
- decide whether a range should be recollected
- infer rewrite intent from overlap
- perform digest analysis

## 3. Local index/store

Responsibility:
- persist normalized session evidence
- support query/filter/search for digest generation
- persist coverage metadata required for future collection planning
- optionally retain raw evidence cache alongside normalized records

The index/store is the source of truth for digest generation.
The digest engine should read from the index, not from source files directly.

Minimum stored categories:
- sessions
- normalized events/excerpts
- derived metrics
- collection coverage metadata
- generated digest artifacts

## 4. Collector orchestrator / scheduler

Responsibility:
- read existing coverage from the index/store
- compute a **collection plan** for a requested run
- invoke collector with that plan
- support manual and scheduled execution

This component exists to avoid blind repeated ingestion.

It must be able to query:
- what ranges are already covered
- what gaps exist
- whether the requested range overlaps existing coverage
- whether the requested run is safe as non-destructive fill

The orchestrator owns planning logic, not the collector.

## 5. Digest engine

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

## 6. Promotion / scoring policy

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

## 7. Report writer

Responsibility:
- render digest output to terminal
- write markdown artifact with stable structure
- attach front matter and metadata

The report writer does not perform collection or analysis.

## 8. Digest runner / scheduler

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

## Default collection must be non-destructive

Repeated collection must not silently rewrite already covered ranges.
Default behavior should prefer gap-filling rather than overlap replacement.

## Collection planning must be coverage-aware

Before invoking the collector, the orchestrator must read coverage metadata from the index/store and produce an explicit collection plan.

That plan should answer:
- target source(s)
- target timeframe
- uncovered gaps
- overlap with existing coverage
- effective collection mode

## Explicit collection modes

A simple and meaningful model is:
- **fill** — collect only uncovered gaps within requested timeframe
- **refresh** — recollect overlapping covered range and replace affected indexed slice
- **rebuild** — recreate full index or a source-scoped segment explicitly

Default mode should be **fill**.

Recollection of already covered time ranges must require an explicit non-default mode.

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

## Boundary summary

- **source adapters** know source formats
- **collector orchestrator** decides what to collect
- **collector** executes the collection plan
- **index/store** persists and serves indexed evidence plus coverage metadata
- **digest engine** analyzes indexed evidence
- **report writer** formats output
- **runners/schedulers** handle invocation timing

## Open questions

1. How should overlapping coverage be rewritten safely at the storage level: slice replacement, versioned rows, or append-plus-compaction?
2. Should raw evidence be retained permanently, or only long enough to support parser evolution and debugging?
3. Should collection planning understand repo/task boundaries, or only time windows at first?
4. How much source-specific metadata should survive normalization before the index becomes too source-shaped?
5. Should duplicate digest suppression be based on requested window only, or also digest-engine version and configuration fingerprint?
