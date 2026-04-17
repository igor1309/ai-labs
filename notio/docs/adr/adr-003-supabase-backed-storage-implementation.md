---
title: ADR-003 Supabase-Backed Storage Implementation
date: 2026-04-17
version: 0.0.1
status: accepted
model: GPT-5.4 Thinking
category: adr
---

# ADR-003: Supabase-Backed Storage Implementation

## Status
Accepted.

## Executive Summary
Supabase is adopted as a concrete storage adapter behind the storage interface defined in ADR-001. The adapter owns schema, identity, row mapping, and vendor semantics; the capture service MUST NOT know Supabase specifics. V1 uses one main table with common fields as columns and source-specific data as JSON.

## Context
> This ADR supersedes `pre-adr-supabase-storage-implementation.md`, retained for historical context.

The capture service depends on a storage interface and submits a canonical captured item for persistence.
For the capture flow, the service requires only a success-or-failure outcome.
It does not perform reads as part of capture.

A concrete storage implementation is required.
Supabase is adopted as one storage implementation behind that interface.

## Decision
Use a Supabase-backed storage adapter that persists the canonical captured item without exposing Supabase-specific semantics to the capture service.

The storage contract from the capture service point of view remains:
- submit canonical item
- receive success or failure only

The Supabase-backed adapter owns:
- persistence schema
- DB-generated identity
- row mapping
- serialization of nested source-specific captured data
- constraints, indexes, and vendor-specific error handling

## Persistence model
The v1 persistence model uses:
- one main table for captured items
- common canonical fields as first-class columns
- source-specific captured payload stored as JSON

The canonical item remains the semantic source of truth for what is being stored.
The database schema is an implementation detail of the adapter.

## Rules / Invariants
- The capture service MUST NOT know table layout, Supabase APIs, identity generation, query semantics, or migration concerns.
- The storage adapter MUST expose only success or failure to the capture service.
- Storage identity MUST NOT appear in the canonical captured item.
- The canonical item MUST remain the semantic source of truth; schema is an adapter implementation detail.
- Source-specific JSON payload MUST NOT silently grow new top-level keys; additions MUST be reviewed before use.

## Why this shape
### Keep the service boundary clean
The capture service should not know:
- table layout
- Supabase APIs
- identity generation
- query semantics
- migration concerns

### Preserve structured persistence
Supabase is a good fit for:
- structured captured data
- future filtering/querying
- future reader/editor clients
- later metadata expansion such as tags or reprocessing state

### Avoid premature fragmentation
A single main table plus JSON for source-specific data is sufficient for v1 and avoids over-modeling source families too early.

## Consequences
### Positive
- clean fit with the current write-only storage contract
- storage identity stays out of the capture service
- future structured access is easier than with file-backed storage
- source-specific data can evolve without immediate schema explosion

### Negative
- schema discipline is required to prevent uncontrolled JSON sprawl
- migrations will matter once common fields change
- DB-level capabilities may tempt future coupling if not kept behind the storage boundary

## Deliberately not decided here
This ADR does not fix:
- exact table or column names
- exact index set
- exact RLS/auth strategy
- read/query APIs for non-capture clients
- sync/projection behavior to any other storage backend
- exact error taxonomy beyond success or failure at service boundary

## Rejected directions
### Service-level dependence on Supabase
Rejected because the capture service must remain storage-agnostic.

### Forcing storage identity into the canonical item
Rejected because identity belongs to the persistence implementation, not to the capture domain.

### Fully relational decomposition of all source-specific data in v1
Rejected because it adds complexity too early for the current scope.
