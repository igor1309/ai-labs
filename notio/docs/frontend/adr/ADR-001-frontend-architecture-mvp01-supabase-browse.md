---
title: ADR-001 Frontend Architecture for mvp_01 Browse Client
status: Accepted
date: 2026-04-23
---

# ADR-001: Frontend Architecture for mvp_01 Browse Client

## Status

Accepted

## Context

The product needs a minimal frontend for `mvp_01`.

Scope of this slice:

- one Supabase-backed table
- browse only
- no create, update, or delete
- thin client preferred
- low implementation and operational complexity for the first version

The question is specifically about **frontend architecture**, not implementation detail.

A separate capture/write side may exist elsewhere in the system. This ADR covers only the read-side frontend for `mvp_01`.

## Decision

The frontend will be a **direct read-only client to Supabase** using the official client library.

The architecture is:

- frontend application
- direct connection to Supabase for reads
- Supabase Row Level Security governs access
- no backend-for-frontend for this slice
- no write capability exposed in the frontend

The frontend is a **read-side browse client**, not a general application layer.

## Rationale

This option is selected because it best matches the constraints of `mvp_01`:

- simplest architecture
- thinnest client-server path
- lowest delivery overhead
- no redundant server layer for a read-only browse use case
- aligned with the goal of validating the product slice before adding more infrastructure

For a single-table, read-only MVP, a BFF would mostly add surface area, hosting, failure modes, and maintenance burden without providing proportional value.

## Architectural Shape

The frontend should be organized around one feature: **browse items**.

At the architectural level, the client consists of:

- UI layer for browsing the table
- read-side data access layer using Supabase
- feature-level state for loading, loaded, empty, and failed states

The frontend should treat the table as a **read model** for browsing.

The architecture explicitly excludes:

- mutation flows
- offline support
- realtime subscriptions
- client-side domain complexity beyond browse concerns
- custom backend aggregation
- cross-feature abstraction intended for future unimplemented cases

## Security Model

The frontend uses the Supabase **publishable** client configuration.

Access control is enforced through Supabase policies.

This ADR assumes that direct frontend reads are acceptable for the data exposure model of `mvp_01`.

If later requirements introduce stricter secrecy, private server-side enrichment, cross-table composition, or non-trivial authorization rules, this decision should be revisited.

## Alternatives Considered

### 1. Frontend -> Supabase direct read access

Chosen.

Pros:

- minimal architecture
- fast to deliver
- fewer moving parts
- no extra backend to design, deploy, and maintain

Cons:

- frontend is coupled directly to Supabase as a runtime dependency
- some future policy or aggregation needs may force a later architectural change

### 2. Frontend -> Backend/BFF -> Supabase

Rejected for `mvp_01`.

Pros:

- stronger server-controlled boundary
- easier place for future aggregation, transformation, and custom auth logic
- hides Supabase details from the frontend

Cons:

- additional service to build and operate
- unnecessary complexity for browse-only MVP
- slower path to first usable version

## Consequences

### Positive

- `mvp_01` remains small and focused
- frontend work can proceed independently as a read-only browse client
- operational footprint stays minimal
- architecture matches the actual scope of the MVP

### Negative

- a later move to BFF may require refactoring if requirements expand
- direct dependency on Supabase is accepted for this slice
- architectural flexibility is intentionally traded for speed and simplicity

## Non-Goals

This ADR does not define:

- exact table schema
- UI design
- pagination mechanics
- filtering behavior
- concrete library wrappers beyond the decision to use the official Supabase client
- future edit flows
- capture-side or write-side architecture

## Review Trigger

Revisit this ADR if any of the following become true:

- the frontend must perform writes
- the frontend must combine multiple sources or tables
- authorization logic exceeds practical RLS-only control
- sensitive logic must be hidden from the client
- the product requires server-owned query composition
