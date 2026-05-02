---
title: Pre-ADR Supabase-Backed Storage Implementation
date: 2026-04-17
version: 0.0.1
status: draft
model: GPT-5.4 Thinking
category: pre-adr
---

# Pre-ADR: Supabase-Backed Storage Implementation

## Context
The capture service depends on a storage interface.
The service submits a canonical captured item and only needs success or failure for the capture flow.
The service does not require reads as part of capture.

A concrete storage implementation is needed.
Supabase is a candidate implementation behind that storage interface.

## Problem
A Supabase-backed implementation should:
- satisfy the existing write-only capture contract cleanly
- not leak database or vendor semantics into the capture service
- preserve the canonical item as the thing being persisted
- remain compatible with later reader/editor clients that are decoupled from capture
- avoid premature schema fragmentation in v1

## Forces
- The canonical item already contains common top-level fields and source-specific nested captured data.
- Capture is append-only in v1.
- Enrichment is best-effort, but persistence must still proceed on enrichment failure.
- The service should not depend on storage identity.
- A future client may want query, filter, edit, or reprocess capabilities.
- Source-specific captured data will evolve.

## Candidate direction
Use Supabase as a concrete storage adapter that persists the canonical item into a structured table-oriented model.

The adapter would own:
- table schema
- generated identity
- timestamps and DB defaults as needed
- constraints and indexes
- serialization of nested source-specific data
- vendor-specific error mapping

The capture service would still only do:
- `save(item)`
- success or failure handling

## Likely v1 shape
A pragmatic v1 design is:
- one main table for captured items
- common fields as first-class columns
- source-specific captured payload in JSON

This keeps the schema compact while preserving queryability on the fields most likely to matter early.

## Advantages
- natural fit for structured persistence
- better future queryability than file-backed storage
- easier path to reader/editor clients
- cleaner handling of later metadata such as tags or reprocessing status
- does not force markdown or repo/file semantics into the core model

## Risks
- schema design can be overbuilt too early
- temptation to let DB/storage concerns leak upward
- row shape may drift away from the canonical item if not kept disciplined
- migration strategy becomes relevant once fields evolve

## Open decisions
1. Which canonical fields deserve first-class columns in v1.
2. Which nested source-specific data should remain JSON.
3. Whether DB-generated timestamps are useful in addition to canonical capture timestamp.
4. How storage errors should be categorized for service-level handling and logging.
5. Whether uniqueness/dedup constraints are intentionally absent in v1.

## Recommendation
Proceed with an ADR that fixes Supabase as a valid storage implementation pattern behind the storage interface and defines the v1 persistence shape at a high level, without overcommitting to query/read APIs that the capture service does not need.
