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
- expose source records in a canonical source-shaped form
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
- normalize canonical source records into index-normalized records
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
- retain sufficient session-level evidence alongside normalized records to support promoted-session deep inspection within the digest boundary

The index/store is the source of truth for digest generation.
The digest engine should read from the index, not from source files directly.
The store must therefore preserve sufficient session-level evidence to reconstruct a promoted session's main trajectory, notable retries/failures, tool activity, and supporting excerpts without requiring raw-source reads during digest generation.

Minimum stored categories:
- sessions
- retained session-level evidence
- normalized events/excerpts
- derived metrics
- collection coverage metadata
- generated digest artifacts

## 4. Collection planner

Responsibility:
- read existing coverage from the index/store
- evaluate a requested collection timeframe
- validate and resolve requested source scope
- detect gaps and overlap
- resolve effective collection mode
- produce an explicit **collection plan**

Collection planning operates on time windows, source scope, and existing coverage only.
Repo and task boundaries are out of scope for the first version.

The collection planner is the sole owner of collection decision logic.

That includes:
- overlap handling
- gap filling
- source-scope resolution from invocation/config input
- effective mode resolution
- definition of the indexed slice that a refresh is allowed to replace

The collection planner should be policy-heavy and testable as decision logic.

## 5. Collection runner / scheduler

Responsibility:
- invoke collection manually or on schedule
- supply requested source scope and timeframe from invocation/config
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

## 7. Digest promotion / scoring

This is a distinct digest-engine responsibility with separable configuration and heuristics.
It is not a peer top-level component.

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
- session-selection rule
- uncovered gaps
- overlap with existing coverage
- effective collection mode
- replacement scope for refresh, when applicable

Requested source scope must come from invocation or configuration.
The planner validates and resolves that input into concrete plan targets; it does not invent source scope implicitly.

## Collection selects whole sessions

A collection request is timeframe-bounded, but collection operates on whole canonical sessions.
Sessions are not sliced by timeframe for collection or refresh semantics.

The planner selects all sessions whose own timeframes overlap the requested collection timeframe.
Strict containment is not the default policy.

## Canonical-session replacement

Refresh replaces indexed data at canonical-session granularity for the sessions selected by the plan.
Collection windows define selection scope; they do not define arbitrary replacement slices inside sessions.

This requires stable source session identity or a deterministic canonical mapping from source session identity into indexed canonical sessions.

## Default collection must be non-destructive

Repeated collection must not silently rewrite already covered ranges.
Default behavior should prefer gap-filling rather than overlap replacement.

## Explicit collection modes

A simple and meaningful model is:
- **fill** — collect whole sessions within the requested timeframe selection policy only where indexed coverage is missing
- **refresh** — recollect selected sessions and replace them at canonical-session granularity
- **rebuild** — recreate full index or a source-scoped segment explicitly

Default mode should be **fill**.

Recollection of already covered time ranges must require an explicit non-default mode.
Refresh must operate on an explicit replacement scope defined by the plan, not on implicit overlap alone.

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

## Partial-run semantics

A collection run may complete partially.
Run status and coverage status are distinct.

Coverage and ingest metadata must reflect per-session outcomes, not only overall run status.
Coverage advances only for canonical sessions that were successfully collected and persisted.
Failed sessions must not be marked as covered.
A partially failed run must not claim blanket coverage for the requested range.

## Boundary summary

- **source adapters** know source formats and emit canonical source-shaped records
- **collection planner** decides what to collect, resolves source scope, selects whole sessions by timeframe overlap, and defines what may be replaced
- **collection runner/scheduler** supplies invocation/config inputs and coordinates run lifecycle
- **collector** executes the collection plan and normalizes records into index form
- **index/store** persists and serves indexed evidence plus coverage metadata
- **digest engine** analyzes indexed evidence
- **digest promotion/scoring** remains an internal digest-engine responsibility with separable configuration
- **report writer** formats output
- **runners/schedulers** handle invocation timing

## Open questions

1. How much source-specific metadata should survive normalization before the index becomes too source-shaped?
2. Should duplicate digest suppression be based on requested window only, or also digest-engine version and configuration fingerprint?
